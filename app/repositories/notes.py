"""
NotesRepository: Handles all note and tree operations.

Tables managed:
- nodes: Tree structure for folders, notes, chats
- notes: Note content storage with versioning
- note_tags: Note-to-tag associations
"""

import logging
import sqlite3
import json
from typing import Dict, Any, List, Optional
from .base import BaseRepository


class NotesRepository(BaseRepository):
    """Repository for notes and tree structure management."""

    def __init__(self, db_path: str):
        """
        Initialize the NotesRepository.

        Args:
            db_path: Path to the SQLite database file.
        """
        super().__init__(db_path)
        self.logger = logging.getLogger(__name__)

    # =========================
    # Tree Structure Operations
    # =========================

    def get_tree(self) -> List[Dict]:
        """
        Get the complete tree structure with hierarchy.

        Returns:
            List of root nodes with nested children.
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT id, name, type, parent_id, sort_order, created_at, updated_at, collapsed, customization
                    FROM nodes 
                    ORDER BY 
                        parent_id NULLS FIRST,
                        CASE WHEN type = 'folder' THEN 0 ELSE 1 END,
                        sort_order,
                        name
                ''')
                nodes = []
                for row in cursor.fetchall():
                    node = dict(row)
                    if node['customization']:
                        node['customization'] = json.loads(node['customization'])
                    nodes.append(node)
                
                # Build tree structure
                return self._build_tree_structure(nodes)
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tree: {e}")
            return []

    def create_node(self, node_id: str, name: str, node_type: str, parent_id: Optional[str] = None, 
                   customization: Optional[Dict] = None) -> bool:
        """
        Create a new node in the tree structure.

        Args:
            node_id: Unique ID for the node.
            name: Display name.
            node_type: Type ('folder', 'note', 'chat', etc.).
            parent_id: Optional parent node ID.
            customization: Optional customization data.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                # Get the next sort order for this parent
                cursor = conn.execute('''
                    SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order
                    FROM nodes WHERE parent_id = ? OR (parent_id IS NULL AND ? IS NULL)
                ''', (parent_id, parent_id))
                next_order = cursor.fetchone()['next_order']
                
                customization_json = json.dumps(customization) if customization else None
                conn.execute('''
                    INSERT INTO nodes (id, name, type, parent_id, customization, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (node_id, name, node_type, parent_id, customization_json, next_order))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error creating node: {e}")
            return False

    def get_node(self, node_id: str) -> Optional[Dict]:
        """
        Get a single node by ID.

        Args:
            node_id: ID of the node to retrieve.

        Returns:
            Node dictionary with parsed customization, or None if not found.
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT id, name, type, parent_id, created_at, updated_at, collapsed, customization
                    FROM nodes WHERE id = ?
                ''', (node_id,))
                row = cursor.fetchone()
                if row:
                    node = dict(row)
                    if node['customization']:
                        node['customization'] = json.loads(node['customization'])
                    return node
                return None
        except sqlite3.Error as e:
            self.logger.error(f"Error getting node: {e}")
            return None

    def update_node(self, node_id: str, **kwargs) -> bool:
        """
        Update a node's properties.

        Args:
            node_id: ID of the node to update.
            **kwargs: Fields to update (name, type, parent_id, collapsed, customization, sort_order).

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                # Define allowed fields for nodes table
                allowed_fields = {
                    'name', 'type', 'parent_id', 'collapsed', 'customization', 'sort_order'
                }
                
                # Build dynamic update query
                update_fields = []
                values = []
                
                self.logger.info(f"Updating node {node_id} with kwargs: {kwargs}")
                
                for field, value in kwargs.items():
                    if field not in allowed_fields:
                        self.logger.warning(f"Ignoring invalid field: {field}")
                        continue
                        
                    if field == 'customization' and value is not None:
                        value = json.dumps(value)
                    elif field == 'collapsed' and value is not None:
                        value = 1 if value else 0  # Convert boolean to integer for SQLite
                    
                    update_fields.append(f"{field} = ?")
                    values.append(value)
                
                if not update_fields:
                    self.logger.info("No valid fields to update, returning True")
                    return True
                
                values.append(node_id)
                query = f"UPDATE nodes SET {', '.join(update_fields)} WHERE id = ?"
                
                self.logger.info(f"Executing query: {query} with values: {values}")
                
                cursor = conn.execute(query, values)
                rows_affected = cursor.rowcount
                conn.commit()
                
                self.logger.info(f"Update completed, rows affected: {rows_affected}")
                return rows_affected > 0
        except sqlite3.Error as e:
            self.logger.error(f"Error updating node: {e}")
            return False

    def delete_node(self, node_id: str) -> bool:
        """
        Delete a node and all its children (cascade).

        Args:
            node_id: ID of the node to delete.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                # SQLite will handle cascading deletes
                conn.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error deleting node: {e}")
            return False

    def move_node(self, node_id: str, new_parent_id: Optional[str] = None, new_sort_order: Optional[int] = None) -> bool:
        """
        Move a node to a new parent and/or position.

        Args:
            node_id: ID of the node to move.
            new_parent_id: Optional new parent ID.
            new_sort_order: Optional new sort order.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                # Get current node info
                cursor = conn.execute('SELECT parent_id, sort_order FROM nodes WHERE id = ?', (node_id,))
                current_node = cursor.fetchone()
                if not current_node:
                    return False
                
                current_parent_id = current_node['parent_id']
                current_sort_order = current_node['sort_order']
                
                # If new_sort_order is not specified, add to end of new parent
                if new_sort_order is None:
                    cursor = conn.execute('''
                        SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order
                        FROM nodes WHERE parent_id = ? OR (parent_id IS NULL AND ? IS NULL)
                    ''', (new_parent_id, new_parent_id))
                    new_sort_order = cursor.fetchone()['next_order']
                
                # Update the node's parent and sort order
                conn.execute('''
                    UPDATE nodes SET parent_id = ?, sort_order = ? WHERE id = ?
                ''', (new_parent_id, new_sort_order, node_id))
                
                # Reorder siblings in the old parent (if parent changed)
                if current_parent_id != new_parent_id:
                    cursor = conn.execute('''
                        SELECT id FROM nodes 
                        WHERE (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))
                        AND sort_order > ?
                        ORDER BY sort_order
                    ''', (current_parent_id, current_parent_id, current_sort_order))
                    
                    for i, row in enumerate(cursor.fetchall()):
                        conn.execute('''
                            UPDATE nodes SET sort_order = ? WHERE id = ?
                        ''', (current_sort_order + i, row['id']))
                
                # Reorder siblings in the new parent (if inserting in the middle)
                cursor = conn.execute('''
                    SELECT id FROM nodes 
                    WHERE (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))
                    AND id != ? AND sort_order >= ?
                    ORDER BY sort_order
                ''', (new_parent_id, new_parent_id, node_id, new_sort_order))
                
                for i, row in enumerate(cursor.fetchall()):
                    conn.execute('''
                        UPDATE nodes SET sort_order = ? WHERE id = ?
                    ''', (new_sort_order + i + 1, row['id']))
                
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error moving node: {e}")
            return False

    # =========================
    # Note Content Operations
    # =========================

    def save_note_content(self, node_id: str, content: Dict) -> bool:
        """
        Save or update note content.

        Args:
            node_id: ID of the note node.
            content: Content dictionary to save.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                content_json = json.dumps(content)
                
                # Check if note already exists
                cursor = conn.execute("SELECT id FROM notes WHERE node_id = ?", (node_id,))
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing note
                    conn.execute('''
                        UPDATE notes SET content = ?, version = version + 1 
                        WHERE node_id = ?
                    ''', (content_json, node_id))
                else:
                    # Create new note
                    conn.execute('''
                        INSERT INTO notes (id, node_id, content)
                        VALUES (?, ?, ?)
                    ''', (node_id, node_id, content_json))
                
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error saving note content: {e}")
            return False

    def get_note_content(self, node_id: str) -> Optional[Dict]:
        """
        Get note content by node ID.

        Args:
            node_id: ID of the note node.

        Returns:
            Dictionary with content, version, and timestamps, or None if not found.
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT content, version, created_at, updated_at
                    FROM notes WHERE node_id = ?
                ''', (node_id,))
                row = cursor.fetchone()
                if row:
                    return {
                        'content': json.loads(row['content']),
                        'version': row['version'],
                        'created_at': row['created_at'],
                        'updated_at': row['updated_at']
                    }
                return None
        except sqlite3.Error as e:
            self.logger.error(f"Error getting note content: {e}")
            return None

    # =========================
    # Note Selection/Search
    # =========================

    def get_all_notes_for_selection(self, search_query: str = None) -> List[Dict[str, Any]]:
        """
        Get all notes for selection in task references.

        Args:
            search_query: Optional search query to filter notes.

        Returns:
            List of note dictionaries with path information.
        """
        try:
            with self.get_connection() as conn:
                sql = '''
                    SELECT n.id, n.name, n.parent_id, n.created_at, n.updated_at,
                           (SELECT GROUP_CONCAT(p.name, ' > ') 
                            FROM nodes p 
                            WHERE p.id IN (
                                WITH RECURSIVE parent_path(id, parent_id, level) AS (
                                    SELECT parent_id, (SELECT parent_id FROM nodes WHERE id = n.parent_id), 1
                                    WHERE n.parent_id IS NOT NULL
                                    UNION ALL
                                    SELECT parent_id, (SELECT parent_id FROM nodes WHERE id = parent_path.parent_id), level + 1
                                    FROM parent_path 
                                    WHERE parent_id IS NOT NULL AND level < 10
                                )
                                SELECT id FROM parent_path
                            )) as path
                    FROM nodes n
                    WHERE n.type = 'note'
                '''
                params = []
                
                if search_query:
                    sql += ' AND (n.name LIKE ? OR n.name LIKE ?)'
                    params.extend([f'%{search_query}%', f'%{search_query}%'])
                
                sql += ' ORDER BY n.updated_at DESC LIMIT 100'
                
                cursor = conn.execute(sql, params)
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            self.logger.error(f"Error getting notes for selection: {e}")
            return []

    def get_tags_for_note(self, note_id: str) -> List[Dict[str, Any]]:
        """
        Get all tags associated with a note.

        Args:
            note_id: ID of the note.

        Returns:
            List of tag dictionaries with parsed aliases.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('''
                    SELECT t.* FROM tags t
                    JOIN note_tags nt ON nt.tag_id = t.id
                    WHERE nt.note_id = ?
                    ORDER BY t.name COLLATE NOCASE
                ''', (note_id,))
                tags = [dict(row) for row in cur.fetchall()]
                for t in tags:
                    if t.get('aliases'):
                        try:
                            t['aliases'] = json.loads(t['aliases'])
                        except Exception:
                            t['aliases'] = []
                return tags
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tags for note: {e}")
            return []

    def search_notes_by_tags(self, any_of: List[str] = None, all_of: List[str] = None, none_of: List[str] = None, limit: int = 50, cursor: Optional[str] = None) -> List[str]:
        """
        Search notes by tag filters.

        Args:
            any_of: Match notes with any of these tags.
            all_of: Match notes with all of these tags.
            none_of: Exclude notes with any of these tags.
            limit: Maximum number of results.
            cursor: Optional pagination cursor (unused).

        Returns:
            List of note IDs matching the criteria.
        """
        any_of = any_of or []
        all_of = all_of or []
        none_of = none_of or []
        try:
            with self.get_connection() as conn:
                params: List[Any] = []
                base = 'SELECT n.id FROM notes n'
                where_clauses: List[str] = []
                if any_of:
                    qmarks = ','.join('?' for _ in any_of)
                    base += f' WHERE EXISTS (SELECT 1 FROM note_tags nt1 WHERE nt1.note_id = n.id AND nt1.tag_id IN ({qmarks}))'
                    params.extend(any_of)
                if all_of:
                    for i, tid in enumerate(all_of):
                        base += f' AND EXISTS (SELECT 1 FROM note_tags ntA{i} WHERE ntA{i}.note_id = n.id AND ntA{i}.tag_id = ? )'
                        params.append(tid)
                if none_of:
                    qmarks = ','.join('?' for _ in none_of)
                    base += f' AND NOT EXISTS (SELECT 1 FROM note_tags ntN WHERE ntN.note_id = n.id AND ntN.tag_id IN ({qmarks}))'
                    params.extend(none_of)
                base += ' ORDER BY n.updated_at DESC LIMIT ?'
                params.append(limit)
                cur = conn.execute(base, params)
                return [row['id'] for row in cur.fetchall()]
        except sqlite3.Error as e:
            self.logger.error(f"Error searching notes by tags: {e}")
            return []

    # =========================
    # Helper Methods
    # =========================

    def _build_tree_structure(self, nodes: List[Dict]) -> List[Dict]:
        """
        Build hierarchical tree structure from flat node list.

        Args:
            nodes: Flat list of node dictionaries.

        Returns:
            List of root nodes with nested children.
        """
        node_map = {node['id']: node for node in nodes}
        # Initialize children for all nodes first to avoid KeyError regardless of order
        for node in nodes:
            node['children'] = []

        root_nodes: List[Dict] = []
        for node in nodes:
            parent_id = node.get('parent_id')
            if parent_id is None:
                root_nodes.append(node)
            else:
                parent = node_map.get(parent_id)
                if parent is not None:
                    parent.setdefault('children', []).append(node)
                else:
                    # If parent not found, treat as root to keep tree stable
                    root_nodes.append(node)
        
        # Sort children within each parent
        def sort_children(node):
            if node['children']:
                # Simplified sorting: folders first, then all other node types equally by sort_order then name
                def sort_key(x):
                    if x['type'] == 'folder':
                        return (0, x.get('sort_order') or 0, x.get('name', ''))
                    # Chats no longer receive special recency prioritization; treat like notes/others
                    return (1, x.get('sort_order') or 0, x.get('name', ''))

                node['children'].sort(key=sort_key)
                for child in node['children']:
                    sort_children(child)
        
        for root in root_nodes:
            sort_children(root)
        
        # Sort root nodes with same logic
        def root_sort_key(x):
            if x['type'] == 'folder':
                return (0, x.get('sort_order') or 0, x.get('name', ''))
            # Chats treated the same as other non-folder nodes
            return (1, x.get('sort_order') or 0, x.get('name', ''))
        
        root_nodes.sort(key=root_sort_key)
        
        return root_nodes

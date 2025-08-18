import sqlite3
import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
import logging
import re

def _normalize_name(s: str) -> str:
    if s is None:
        return ''
    # Normalize whitespace and case for uniqueness
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    return s

def _slugify(s: str) -> str:
    s = (s or '').strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"-+", "-", s).strip('-')
    return s or 'tag'

class DatabaseManager:
    def __init__(self, db_path: str = "instance/notetaker.db"):
        """Initialize the database manager with SQLite database."""
        self.db_path = db_path
        self.ensure_database_exists()
        self.init_database()
    
    def ensure_database_exists(self):
        """Ensure the database directory exists."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
    
    def get_connection(self) -> sqlite3.Connection:
        """Get a database connection with proper configuration."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # Enable dict-like access to rows
        conn.execute("PRAGMA foreign_keys = ON")  # Enable foreign key constraints
        return conn
    
    def init_database(self):
        """Initialize the database with required tables."""
        with self.get_connection() as conn:
            # Create nodes table for tree structure
            conn.execute('''
                CREATE TABLE IF NOT EXISTS nodes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('note', 'folder', 'chat')),
                    parent_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    collapsed BOOLEAN DEFAULT FALSE,
                    customization TEXT,
                    sort_order INTEGER,
                    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
                )
            ''')
            
            # Create notes table for note content
            conn.execute('''
                CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    version INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
                )
            ''')
            
            # Create chats table for chat conversations
            conn.execute('''
                CREATE TABLE IF NOT EXISTS chats (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    messages TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
                )
            ''')
            
            # Create indexes for better performance
            conn.execute('CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_notes_node_id ON notes(node_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_chats_node_id ON chats(node_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at)')
            
            # Create triggers for auto-updating timestamps
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_nodes_timestamp 
                AFTER UPDATE ON nodes
                BEGIN
                    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')
            
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_notes_timestamp 
                AFTER UPDATE ON notes
                BEGIN
                    UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')
            
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_chats_timestamp 
                AFTER UPDATE ON chats
                BEGIN
                    UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.node_id;
                END
            ''')
            
            # Also update node timestamp when chat is inserted
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_nodes_on_chat_insert
                AFTER INSERT ON chats
                BEGIN
                    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.node_id;
                END
            ''')

            # Tags: global registry and junctions
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT UNIQUE,
                    color TEXT DEFAULT 'default',
                    icon TEXT,
                    description TEXT,
                    parent_id TEXT NULL,
                    aliases TEXT,
                    last_used_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE SET NULL
                )
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS note_tags (
                    note_id TEXT NOT NULL,
                    tag_id  TEXT NOT NULL,
                    PRIMARY KEY (note_id, tag_id),
                    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                )
            ''')

            # Indexes for tags
            conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_lower_name ON tags(lower(name))')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id)')

            # Triggers for timestamps on tags
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_tags_timestamp
                AFTER UPDATE ON tags
                BEGIN
                    UPDATE tags SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')
            
            conn.commit()
    
    def create_node(self, node_id: str, name: str, node_type: str, parent_id: Optional[str] = None, 
                   customization: Optional[Dict] = None) -> bool:
        """Create a new node in the tree structure."""
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
            logging.error(f"Error creating node: {e}")
            return False
    
    def get_node(self, node_id: str) -> Optional[Dict]:
        """Get a single node by ID."""
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
            logging.error(f"Error getting node: {e}")
            return None
    
    def get_tree(self) -> List[Dict]:
        """Get the complete tree structure."""
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
            logging.error(f"Error getting tree: {e}")
            return []
    
    def _build_tree_structure(self, nodes: List[Dict]) -> List[Dict]:
        """Build hierarchical tree structure from flat node list.

        Initializes a children list for every node before linking, so ordering
        of rows from the database cannot cause KeyError when attaching children.
        Orphaned nodes (missing parent) are placed at root to avoid breakage.
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
                # Custom sorting: folders first, then chats by most recent modification, then others
                def sort_key(x):
                    if x['type'] == 'folder':
                        return (0, x.get('sort_order') or 0, x.get('name', ''))
                    elif x['type'] == 'chat':
                        # For chats, sort by updated_at descending (most recent first)
                        # Convert datetime string to negative timestamp for reverse sorting
                        updated_at = x.get('updated_at', '1970-01-01 00:00:00')
                        try:
                            from datetime import datetime
                            # Handle SQLite datetime format (YYYY-MM-DD HH:MM:SS)
                            if updated_at and updated_at != '1970-01-01 00:00:00':
                                # Remove any timezone info and parse as local time
                                dt_str = updated_at.replace('Z', '').replace('+00:00', '')
                                dt = datetime.fromisoformat(dt_str)
                                return (1, -dt.timestamp(), x.get('name', ''))
                            else:
                                return (1, 0, x.get('name', ''))
                        except Exception as e:
                            print(f"Error parsing datetime '{updated_at}': {e}")
                            return (1, 0, x.get('name', ''))
                    else:
                        # Other types (notes, etc.) sorted by sort_order then name
                        return (2, x.get('sort_order') or 0, x.get('name', ''))
                
                node['children'].sort(key=sort_key)
                for child in node['children']:
                    sort_children(child)
        
        for root in root_nodes:
            sort_children(root)
        
        # Sort root nodes with same logic
        def root_sort_key(x):
            if x['type'] == 'folder':
                return (0, x.get('sort_order') or 0, x.get('name', ''))
            elif x['type'] == 'chat':
                # For chats, sort by updated_at descending (most recent first)
                updated_at = x.get('updated_at', '1970-01-01 00:00:00')
                try:
                    from datetime import datetime
                    # Handle SQLite datetime format (YYYY-MM-DD HH:MM:SS)
                    if updated_at and updated_at != '1970-01-01 00:00:00':
                        # Remove any timezone info and parse as local time
                        dt_str = updated_at.replace('Z', '').replace('+00:00', '')
                        dt = datetime.fromisoformat(dt_str)
                        return (1, -dt.timestamp(), x.get('name', ''))
                    else:
                        return (1, 0, x.get('name', ''))
                except Exception as e:
                    print(f"Error parsing datetime '{updated_at}': {e}")
                    return (1, 0, x.get('name', ''))
            else:
                return (2, x.get('sort_order') or 0, x.get('name', ''))
        
        root_nodes.sort(key=root_sort_key)
        
        return root_nodes
    
    def update_node(self, node_id: str, **kwargs) -> bool:
        """Update a node's properties."""
        try:
            with self.get_connection() as conn:
                # Define allowed fields for nodes table
                allowed_fields = {
                    'name', 'type', 'parent_id', 'collapsed', 'customization', 'sort_order'
                }
                
                # Build dynamic update query
                update_fields = []
                values = []
                
                logging.info(f"Updating node {node_id} with kwargs: {kwargs}")
                
                for field, value in kwargs.items():
                    if field not in allowed_fields:
                        logging.warning(f"Ignoring invalid field: {field}")
                        continue
                        
                    if field == 'customization' and value is not None:
                        value = json.dumps(value)
                    elif field == 'collapsed' and value is not None:
                        value = 1 if value else 0  # Convert boolean to integer for SQLite
                    
                    update_fields.append(f"{field} = ?")
                    values.append(value)
                
                if not update_fields:
                    logging.info("No valid fields to update, returning True")
                    return True
                
                values.append(node_id)
                query = f"UPDATE nodes SET {', '.join(update_fields)} WHERE id = ?"
                
                logging.info(f"Executing query: {query} with values: {values}")
                
                cursor = conn.execute(query, values)
                rows_affected = cursor.rowcount
                conn.commit()
                
                logging.info(f"Update completed, rows affected: {rows_affected}")
                return rows_affected > 0
        except sqlite3.Error as e:
            logging.error(f"Error updating node: {e}")
            return False
    
    def delete_node(self, node_id: str) -> bool:
        """Delete a node and all its children."""
        try:
            with self.get_connection() as conn:
                # SQLite will handle cascading deletes
                conn.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error deleting node: {e}")
            return False
    
    def save_note_content(self, node_id: str, content: Dict) -> bool:
        """Save or update note content."""
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
            logging.error(f"Error saving note content: {e}")
            return False
    
    def get_note_content(self, node_id: str) -> Optional[Dict]:
        """Get note content by node ID."""
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
            logging.error(f"Error getting note content: {e}")
            return None
    
    def save_chat_messages(self, node_id: str, messages: List[Dict]) -> bool:
        """Save or update chat messages."""
        try:
            with self.get_connection() as conn:
                messages_json = json.dumps(messages)
                
                # Check if chat already exists
                cursor = conn.execute("SELECT id FROM chats WHERE node_id = ?", (node_id,))
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing chat
                    conn.execute('''
                        UPDATE chats SET messages = ? WHERE node_id = ?
                    ''', (messages_json, node_id))
                else:
                    # Create new chat
                    conn.execute('''
                        INSERT INTO chats (id, node_id, messages)
                        VALUES (?, ?, ?)
                    ''', (node_id, node_id, messages_json))
                
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error saving chat messages: {e}")
            return False
    
    def get_chat_messages(self, node_id: str) -> List[Dict]:
        """Get chat messages by node ID."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT messages FROM chats WHERE node_id = ?
                ''', (node_id,))
                row = cursor.fetchone()
                if row:
                    return json.loads(row['messages'])
                return []
        except sqlite3.Error as e:
            logging.error(f"Error getting chat messages: {e}")
            return []

    def touch_chat(self, node_id: str) -> bool:
        """Mark a chat as recently used by updating its timestamps.

        This updates the chats.updated_at (if chat row exists) which, via trigger,
        also updates nodes.updated_at. If the chat row does not exist yet, we fall
        back to directly updating nodes.updated_at to move the chat up in listings.
        """
        try:
            with self.get_connection() as conn:
                # Try to bump chats.updated_at via a no-op messages update
                cursor = conn.execute('SELECT id FROM chats WHERE node_id = ?', (node_id,))
                chat_exists = cursor.fetchone() is not None

                if chat_exists:
                    # Perform an update to trigger the timestamp trigger
                    conn.execute('''
                        UPDATE chats SET messages = messages WHERE node_id = ?
                    ''', (node_id,))
                else:
                    # No chat row yet; directly bump the node timestamp
                    conn.execute('''
                        UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = 'chat'
                    ''', (node_id,))

                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error touching chat '{node_id}': {e}")
            return False
    
    def search_content(self, query: str, content_type: str = 'all') -> List[Dict]:
        """Search for content across notes and chats."""
        try:
            with self.get_connection() as conn:
                results = []
                
                if content_type in ['all', 'notes']:
                    # Search in notes
                    cursor = conn.execute('''
                        SELECT n.id, n.name, n.type, notes.content, notes.updated_at
                        FROM nodes n
                        JOIN notes ON n.id = notes.node_id
                        WHERE notes.content LIKE ? OR n.name LIKE ?
                    ''', (f'%{query}%', f'%{query}%'))
                    
                    for row in cursor.fetchall():
                        results.append({
                            'id': row['id'],
                            'name': row['name'],
                            'type': row['type'],
                            'content': json.loads(row['content']),
                            'updated_at': row['updated_at']
                        })
                
                if content_type in ['all', 'chats']:
                    # Search in chats
                    cursor = conn.execute('''
                        SELECT n.id, n.name, n.type, chats.messages, chats.updated_at
                        FROM nodes n
                        JOIN chats ON n.id = chats.node_id
                        WHERE chats.messages LIKE ? OR n.name LIKE ?
                    ''', (f'%{query}%', f'%{query}%'))
                    
                    for row in cursor.fetchall():
                        results.append({
                            'id': row['id'],
                            'name': row['name'],
                            'type': row['type'],
                            'messages': json.loads(row['messages']),
                            'updated_at': row['updated_at']
                        })
                
                return results
        except sqlite3.Error as e:
            logging.error(f"Error searching content: {e}")
            return []
    
    def get_recent_items(self, limit: int = 10) -> List[Dict]:
        """Get recently updated items."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT id, name, type, updated_at
                    FROM nodes
                    ORDER BY updated_at DESC
                    LIMIT ?
                ''', (limit,))
                
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting recent items: {e}")
            return []

    # =========================
    # Tag System - Data Layer
    # =========================
    def _get_tag_by_name_or_alias(self, conn: sqlite3.Connection, name: str) -> Optional[Dict]:
        norm = _normalize_name(name)
        if not norm:
            return None
        cur = conn.execute('SELECT * FROM tags WHERE lower(name) = lower(?)', (norm,))
        row = cur.fetchone()
        if row:
            return dict(row)
        # Search in aliases JSON (stored as simple JSON array of strings)
        # SQLite json_each exists if JSON1 is enabled; fallback to LIKE search then verify in Python
        try:
            cur = conn.execute('''
                SELECT t.* FROM tags t, json_each(t.aliases)
                WHERE lower(json_each.value) = lower(?)
            ''', (norm,))
            row = cur.fetchone()
            return dict(row) if row else None
        except sqlite3.Error:
            # Fallback: scan
            cur = conn.execute('SELECT * FROM tags WHERE aliases IS NOT NULL')
            for r in cur.fetchall():
                try:
                    aliases = json.loads(r['aliases']) if r['aliases'] else []
                except Exception:
                    aliases = []
                if any(a.lower() == norm.lower() for a in aliases):
                    return dict(r)
            return None

    def _ensure_unique_slug(self, conn: sqlite3.Connection, base: str, current_id: Optional[str] = None) -> str:
        slug = _slugify(base)
        candidate = slug or 'tag'
        i = 1
        while True:
            if current_id:
                cur = conn.execute('SELECT id FROM tags WHERE slug = ? AND id != ?', (candidate, current_id))
            else:
                cur = conn.execute('SELECT id FROM tags WHERE slug = ?', (candidate,))
            if cur.fetchone() is None:
                return candidate
            i += 1
            candidate = f"{slug}-{i}"

    def list_tags(self, q: Optional[str] = None, limit: int = 50, include_usage: bool = False, parent_id: Optional[str] = None) -> List[Dict]:
        try:
            with self.get_connection() as conn:
                params: List[Any] = []
                where: List[str] = []
                if q:
                    params.extend([f"%{q}%", f"%{q}%"])
                    where.append('(lower(name) LIKE lower(?) OR lower(COALESCE(aliases, "")) LIKE lower(?))')
                if parent_id is None:
                    pass
                elif parent_id == 'root':
                    where.append('parent_id IS NULL')
                else:
                    where.append('parent_id = ?')
                    params.append(parent_id)
                sql = 'SELECT * FROM tags'
                if where:
                    sql += ' WHERE ' + ' AND '.join(where)
                sql += ' ORDER BY name COLLATE NOCASE LIMIT ?'
                params.append(limit)
                cur = conn.execute(sql, params)
                tags = [dict(row) for row in cur.fetchall()]
                for t in tags:
                    if t.get('aliases'):
                        try:
                            t['aliases'] = json.loads(t['aliases'])
                        except Exception:
                            t['aliases'] = []
                if include_usage and tags:
                    ids = [t['id'] for t in tags]
                    qmarks = ','.join('?' for _ in ids)
                    cur = conn.execute(f'SELECT tag_id, COUNT(*) as cnt FROM note_tags WHERE tag_id IN ({qmarks}) GROUP BY tag_id', ids)
                    usage = {row['tag_id']: row['cnt'] for row in cur.fetchall()}
                    for t in tags:
                        t['usage'] = usage.get(t['id'], 0)
                return tags
        except sqlite3.Error as e:
            logging.error(f"Error listing tags: {e}")
            return []

    def create_tag(self, tag: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                name = _normalize_name(tag.get('name', ''))
                if not name:
                    return None
                existing = self._get_tag_by_name_or_alias(conn, name)
                if existing:
                    return existing
                aliases = tag.get('aliases') or []
                if isinstance(aliases, str):
                    aliases = [aliases]
                # Normalize aliases
                aliases = [_normalize_name(a) for a in aliases if _normalize_name(a)]
                # Ensure aliases don't conflict with existing names
                for a in aliases:
                    if self._get_tag_by_name_or_alias(conn, a):
                        # Skip conflicting alias
                        aliases = [x for x in aliases if x != a]
                tag_id = tag.get('id') or name  # default stable id if provided else name; caller may pass ULID
                # Ensure slug
                slug = self._ensure_unique_slug(conn, tag.get('slug') or name)
                color = tag.get('color') or 'default'
                icon = tag.get('icon')
                description = tag.get('description')
                parent_id = tag.get('parentId') or tag.get('parent_id')
                conn.execute('''
                    INSERT INTO tags (id, name, slug, color, icon, description, parent_id, aliases)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (tag_id, name, slug, color, icon, description, parent_id, json.dumps(aliases) if aliases else None))
                conn.commit()
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        except sqlite3.Error as e:
            logging.error(f"Error creating tag: {e}")
            return None

    def update_tag(self, tag_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                orig = cur.fetchone()
                if not orig:
                    return None
                updates: List[str] = []
                values: List[Any] = []
                if 'name' in patch and patch['name']:
                    name = _normalize_name(patch['name'])
                    # Check conflicts
                    cur = conn.execute('SELECT id FROM tags WHERE lower(name)=lower(?) AND id != ?', (name, tag_id))
                    if cur.fetchone():
                        # If conflict, ignore name change
                        pass
                    else:
                        updates.append('name = ?')
                        values.append(name)
                        # also refresh slug if not provided
                        if 'slug' not in patch:
                            new_slug = self._ensure_unique_slug(conn, name, current_id=tag_id)
                            updates.append('slug = ?')
                            values.append(new_slug)
                if 'slug' in patch and patch['slug']:
                    updates.append('slug = ?')
                    values.append(self._ensure_unique_slug(conn, patch['slug'], current_id=tag_id))
                for key in ('color', 'icon', 'description'):
                    if key in patch:
                        updates.append(f'{key} = ?')
                        values.append(patch[key])
                if 'parentId' in patch or 'parent_id' in patch:
                    parent_id = patch.get('parentId', patch.get('parent_id'))
                    updates.append('parent_id = ?')
                    values.append(parent_id)
                if 'aliases' in patch:
                    aliases = patch.get('aliases') or []
                    if isinstance(aliases, str):
                        aliases = [aliases]
                    aliases = [_normalize_name(a) for a in aliases if _normalize_name(a)]
                    updates.append('aliases = ?')
                    values.append(json.dumps(aliases) if aliases else None)
                if not updates:
                    return dict(orig)
                values.append(tag_id)
                conn.execute(f'UPDATE tags SET {", ".join(updates)} WHERE id = ?', values)
                conn.commit()
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                return dict(cur.fetchone())
        except sqlite3.Error as e:
            logging.error(f"Error updating tag: {e}")
            return None

    def delete_tag(self, tag_id: str, cascade: bool = False, force: bool = False) -> Dict[str, Any]:
        try:
            with self.get_connection() as conn:
                # Children check
                cur = conn.execute('SELECT COUNT(*) as c FROM tags WHERE parent_id = ?', (tag_id,))
                has_children = (cur.fetchone()['c'] or 0) > 0
                # Usage check
                cur = conn.execute('SELECT COUNT(*) as c FROM note_tags WHERE tag_id = ?', (tag_id,))
                in_use = (cur.fetchone()['c'] or 0) > 0
                if (has_children and not cascade) or (in_use and not force):
                    return { 'deleted': False, 'has_children': has_children, 'in_use': in_use }
                if cascade:
                    conn.execute('UPDATE tags SET parent_id = NULL WHERE parent_id = ?', (tag_id,))
                if force:
                    conn.execute('DELETE FROM note_tags WHERE tag_id = ?', (tag_id,))
                conn.execute('DELETE FROM tags WHERE id = ?', (tag_id,))
                conn.commit()
                return { 'deleted': True }
        except sqlite3.Error as e:
            logging.error(f"Error deleting tag: {e}")
            return { 'deleted': False, 'error': str(e) }

    def merge_tags(self, source_ids: List[str], target_id: str) -> Dict[str, Any]:
        try:
            with self.get_connection() as conn:
                # Ensure target exists
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (target_id,))
                target = cur.fetchone()
                if not target:
                    return { 'merged': False, 'error': 'target_not_found' }
                # Re-point note_tags
                qmarks = ','.join('?' for _ in source_ids)
                if source_ids:
                    conn.execute(f'UPDATE OR IGNORE note_tags SET tag_id = ? WHERE tag_id IN ({qmarks})', [target_id, *source_ids])
                    # Delete potential duplicates after OR IGNORE
                    conn.execute(f'DELETE FROM note_tags WHERE tag_id IN ({qmarks}) AND note_id IN (SELECT note_id FROM note_tags WHERE tag_id = ?)', [*source_ids, target_id])
                # Merge aliases: add source names and aliases
                names = []
                aliases: List[str] = []
                for sid in source_ids:
                    cur = conn.execute('SELECT name, aliases FROM tags WHERE id = ?', (sid,))
                    r = cur.fetchone()
                    if r:
                        names.append(r['name'])
                        try:
                            al = json.loads(r['aliases']) if r['aliases'] else []
                        except Exception:
                            al = []
                        aliases.extend(al)
                try:
                    t_aliases = json.loads(target['aliases']) if target['aliases'] else []
                except Exception:
                    t_aliases = []
                merged_aliases = list({ _normalize_name(a) for a in (t_aliases + aliases + names) if _normalize_name(a) and _normalize_name(a).lower() != target['name'].lower() })
                conn.execute('UPDATE tags SET aliases = ? WHERE id = ?', (json.dumps(merged_aliases) if merged_aliases else None, target_id))
                # Delete sources
                if source_ids:
                    conn.execute(f'DELETE FROM tags WHERE id IN ({qmarks})', source_ids)
                conn.commit()
                return { 'merged': True, 'target_id': target_id, 'sources_deleted': source_ids }
        except sqlite3.Error as e:
            logging.error(f"Error merging tags: {e}")
            return { 'merged': False, 'error': str(e) }

    def assign_tags_to_note(self, note_id: str, tag_ids: List[str]) -> bool:
        try:
            with self.get_connection() as conn:
                for tid in tag_ids:
                    conn.execute('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', (note_id, tid))
                    conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tid,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error assigning tags to note: {e}")
            return False

    def replace_note_tags(self, note_id: str, tag_ids: List[str]) -> bool:
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM note_tags WHERE note_id = ?', (note_id,))
                for tid in tag_ids:
                    conn.execute('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', (note_id, tid))
                    conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tid,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error replacing note tags: {e}")
            return False

    def get_tags_for_note(self, note_id: str) -> List[Dict[str, Any]]:
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
            logging.error(f"Error getting tags for note: {e}")
            return []

    def search_notes_by_tags(self, any_of: List[str] = None, all_of: List[str] = None, none_of: List[str] = None, limit: int = 50, cursor: Optional[str] = None) -> List[str]:
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
            logging.error(f"Error searching notes by tags: {e}")
            return []

    def get_tag_dashboard(self, tag_id: str) -> Dict[str, Any]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                t = cur.fetchone()
                if not t:
                    return {}
                tag = dict(t)
                # usage
                cur = conn.execute('SELECT COUNT(*) as cnt FROM note_tags WHERE tag_id = ?', (tag_id,))
                usage = cur.fetchone()['cnt']
                # siblings and children
                pid = tag.get('parent_id')
                siblings = []
                if pid:
                    cur = conn.execute('SELECT * FROM tags WHERE parent_id = ? AND id != ? ORDER BY name COLLATE NOCASE', (pid, tag_id))
                    siblings = [dict(r) for r in cur.fetchall()]
                cur = conn.execute('SELECT * FROM tags WHERE parent_id = ? ORDER BY name COLLATE NOCASE', (tag_id,))
                children = [dict(r) for r in cur.fetchall()]
                # recent notes
                cur = conn.execute('''
                    SELECT n.id, n.name, n.updated_at FROM notes n
                    JOIN note_tags nt ON nt.note_id = n.id
                    WHERE nt.tag_id = ? ORDER BY n.updated_at DESC LIMIT 50
                ''', (tag_id,))
                recent_notes = [dict(r) for r in cur.fetchall()]
                # co-occurring tags (simple co-count)
                cur = conn.execute('''
                    SELECT nt2.tag_id as tag_id, COUNT(*) as cnt
                    FROM note_tags nt1
                    JOIN note_tags nt2 ON nt1.note_id = nt2.note_id AND nt2.tag_id != nt1.tag_id
                    WHERE nt1.tag_id = ?
                    GROUP BY nt2.tag_id
                    ORDER BY cnt DESC LIMIT 10
                ''', (tag_id,))
                co_ids = [r['tag_id'] for r in cur.fetchall()]
                co_tags = []
                if co_ids:
                    qmarks = ','.join('?' for _ in co_ids)
                    cur = conn.execute(f'SELECT * FROM tags WHERE id IN ({qmarks})', co_ids)
                    co_tags = [dict(r) for r in cur.fetchall()]
                return {
                    'tag': tag,
                    'usage': usage,
                    'siblings': siblings,
                    'children': children,
                    'coTags': co_tags,
                    'recentNotes': recent_notes,
                }
        except sqlite3.Error as e:
            logging.error(f"Error building tag dashboard: {e}")
            return {}
    
    def backup_database(self, backup_path: str) -> bool:
        """Create a backup of the database."""
        try:
            with self.get_connection() as conn:
                backup_conn = sqlite3.connect(backup_path)
                conn.backup(backup_conn)
                backup_conn.close()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error creating backup: {e}")
            return False
    
    def migrate_from_json(self, tree_file: str, chats_file: str) -> bool:
        """Migrate existing JSON data to the new database structure."""
        try:
            # Load existing data
            tree_data = []
            if os.path.exists(tree_file):
                with open(tree_file, 'r') as f:
                    tree_data = json.load(f)
            
            chats_data = []
            if os.path.exists(chats_file):
                with open(chats_file, 'r') as f:
                    chats_data = json.load(f)
            
            # First pass: Create all nodes without content
            def create_nodes_only(node, parent_id=None):
                # Create node
                self.create_node(
                    node['id'],
                    node['name'],
                    node['type'],
                    parent_id,
                    node.get('customization')
                )
                
                # Recursively create children nodes
                for child in node.get('children', []):
                    create_nodes_only(child, node['id'])
            
            # Create tree structure first
            for root_node in tree_data:
                create_nodes_only(root_node)
            
            # Create chat nodes from chats data
            for chat in chats_data:
                if chat['type'] == 'chat':
                    self.create_node(
                        chat['id'],
                        chat['name'],
                        chat['type'],
                        chat.get('parentId'),
                        chat.get('customization')
                    )
            
            # Second pass: Save content for existing nodes
            def save_content(node):
                # Save content based on type
                if node['type'] == 'note' and 'content' in node and node['content']:
                    self.save_note_content(node['id'], node['content'])
                
                # Recursively save content for children
                for child in node.get('children', []):
                    save_content(child)
            
            # Save content for tree nodes
            for root_node in tree_data:
                save_content(root_node)
            
            # Save chat messages
            for chat in chats_data:
                if 'content' in chat and 'messages' in chat['content']:
                    self.save_chat_messages(chat['id'], chat['content']['messages'])
            
            return True
            
        except Exception as e:
            logging.error(f"Error migrating data: {e}")
            return False
    
    def move_node(self, node_id: str, new_parent_id: Optional[str] = None, new_sort_order: Optional[int] = None) -> bool:
        """Move a node to a new parent and/or position."""
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
                if new_parent_id != current_parent_id or new_sort_order != current_sort_order:
                    cursor = conn.execute('''
                        SELECT id FROM nodes 
                        WHERE (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))
                        AND id != ?
                        AND sort_order >= ?
                        ORDER BY sort_order
                    ''', (new_parent_id, new_parent_id, node_id, new_sort_order))
                    
                    for i, row in enumerate(cursor.fetchall()):
                        conn.execute('''
                            UPDATE nodes SET sort_order = ? WHERE id = ?
                        ''', (new_sort_order + i + 1, row['id']))
                
                conn.commit()
                return True
                
        except sqlite3.Error as e:
            logging.error(f"Error moving node: {e}")
            return False

import sqlite3
import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
import logging

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
                        return (0, x.get('sort_order', 0), x.get('name', ''))
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
                        return (2, x.get('sort_order', 0), x.get('name', ''))
                
                node['children'].sort(key=sort_key)
                for child in node['children']:
                    sort_children(child)
        
        for root in root_nodes:
            sort_children(root)
        
        # Sort root nodes with same logic
        def root_sort_key(x):
            if x['type'] == 'folder':
                return (0, x.get('sort_order', 0), x.get('name', ''))
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
                return (2, x.get('sort_order', 0), x.get('name', ''))
        
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

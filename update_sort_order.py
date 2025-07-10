#!/usr/bin/env python3
"""
Migration script to update sort_order for existing nodes.
This ensures folders appear first, then files, ordered by creation date.
"""

import sqlite3
import os
from datetime import datetime

def update_sort_order():
    """Update sort_order for all existing nodes."""
    db_path = "instance/notetaker.db"
    
    if not os.path.exists(db_path):
        print(f"Database {db_path} does not exist. Nothing to migrate.")
        return
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    try:
        # Check if sort_order column exists
        cursor = conn.execute("PRAGMA table_info(nodes)")
        columns = [column['name'] for column in cursor.fetchall()]
        
        if 'sort_order' not in columns:
            print("Adding sort_order column to nodes table...")
            conn.execute('ALTER TABLE nodes ADD COLUMN sort_order INTEGER DEFAULT 0')
            conn.commit()
        
        # Get all nodes grouped by parent_id
        cursor = conn.execute('''
            SELECT id, name, type, parent_id, created_at
            FROM nodes
            ORDER BY parent_id, 
                     CASE WHEN type = 'folder' THEN 0 ELSE 1 END,
                     created_at
        ''')
        
        nodes = cursor.fetchall()
        
        # Group nodes by parent_id
        parent_groups = {}
        for node in nodes:
            parent_id = node['parent_id']
            if parent_id not in parent_groups:
                parent_groups[parent_id] = []
            parent_groups[parent_id].append(node)
        
        # Update sort_order for each group
        for parent_id, children in parent_groups.items():
            for i, node in enumerate(children):
                conn.execute('''
                    UPDATE nodes SET sort_order = ? WHERE id = ?
                ''', (i, node['id']))
        
        conn.commit()
        print(f"Updated sort_order for {len(nodes)} nodes")
        
    except sqlite3.Error as e:
        print(f"Error updating sort_order: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    update_sort_order()

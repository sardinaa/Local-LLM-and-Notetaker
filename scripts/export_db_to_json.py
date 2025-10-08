#!/usr/bin/env python3
"""
Export synthetic data from an existing database to JSON fixtures.

This approach is simpler and more reliable than parsing Python AST:
1. Run the old monolith script to create a database
2. Read from that database  
3. Export to JSON fixtures

Usage:
    python scripts/export_db_to_json.py [db_path]
"""

import sys
import json
import sqlite3
from pathlib import Path
from typing import Dict, List, Any


def export_from_database(db_path: str, output_dir: Path):
    """Export all content from database to JSON fixtures."""
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    print(f"📂 Exporting from: {db_path}")
    print(f"📁 Output directory: {output_dir}\n")
    
    # Create output directories
    (output_dir / 'notes').mkdir(parents=True, exist_ok=True)
    (output_dir / 'recipes').mkdir(parents=True, exist_ok=True)
    (output_dir / 'chats').mkdir(parents=True, exist_ok=True)
    (output_dir / 'documentation').mkdir(parents=True, exist_ok=True)
    
    # Export notes
    cursor = conn.execute('''
        SELECT n.id, n.name, n.parent_id, notes.content
        FROM nodes n
        LEFT JOIN notes ON n.id = notes.node_id
        WHERE n.type = 'note'
    ''')
    
    note_count = 0
    recipe_count = 0
    doc_count = 0
    
    for row in cursor.fetchall():
        node_id = row['id']
        title = row['name']
        parent_id = row['parent_id']
        content = json.loads(row['content']) if row['content'] else {}
        
        # Get tags for this note
        tag_cursor = conn.execute('''
            SELECT t.id 
            FROM note_tags nt
            JOIN tags t ON nt.tag_id = t.id
            WHERE nt.note_id = ?
        ''', (node_id,))
        tags = [t['id'] for t in tag_cursor.fetchall()]
        
        note_data = {
            "id": node_id,
            "title": title,
            "folder": parent_id,
            "tags": tags,
            "content": content
        }
        
        # Determine which directory based on ID or tags
        if node_id.startswith('recipe-'):
            output_file = output_dir / 'recipes' / f'{node_id}.json'
            recipe_count += 1
        elif node_id.startswith('note-') and any(tag.startswith('tag-doc') for tag in tags):
            output_file = output_dir / 'documentation' / f'{node_id}.json'
            doc_count += 1
        else:
            output_file = output_dir / 'notes' / f'{node_id}.json'
            note_count += 1
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(note_data, f, indent=2, ensure_ascii=False)
        
        print(f"  ✓ {node_id}")
    
    # Export chats
    try:
        cursor = conn.execute('''
            SELECT n.id, n.name, n.parent_id
            FROM nodes n
            WHERE n.type = 'chat'
        ''')
    except sqlite3.OperationalError as e:
        print(f"\n⚠️  Skipping chats: {e}")
        cursor = []
    
    chat_count = 0
    for row in cursor.fetchall() if hasattr(cursor, 'fetchall') else []:
        node_id = row['id']
        title = row['name']
        parent_id = row['parent_id']
        
        # Get messages for this chat
        try:
            msg_cursor = conn.execute('''
                SELECT text, sender, timestamp, sources
                FROM chat_messages
                WHERE chat_id = ?
                ORDER BY timestamp
            ''', (node_id,))
            
            messages = []
            for msg in msg_cursor.fetchall():
                message = {
                    "text": msg['text'],
                    "sender": msg['sender'],
                    "timestamp": msg['timestamp']
                }
                if msg['sources']:
                    message['sources'] = json.loads(msg['sources'])
                messages.append(message)
        except sqlite3.OperationalError:
            messages = []
        
        # Get tags
        tag_cursor = conn.execute('''
            SELECT t.id 
            FROM note_tags nt
            JOIN tags t ON nt.tag_id = t.id
            WHERE nt.note_id = ?
        ''', (node_id,))
        tags = [t['id'] for t in tag_cursor.fetchall()]
        
        chat_data = {
            "id": node_id,
            "title": title,
            "folder": parent_id,
            "tags": tags,
            "messages": messages
        }
        
        output_file = output_dir / 'chats' / f'{node_id}.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(chat_data, f, indent=2, ensure_ascii=False)
        
        print(f"  ✓ {node_id}")
        chat_count += 1
    
    conn.close()
    
    # Export tasks
    print("\n🔄 Exporting tasks...")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    try:
        cursor = conn.execute('SELECT * FROM tasks')
        tasks = []
        for row in cursor.fetchall():
            task = dict(row)
            # Parse JSON fields
            if task.get('tag_ids'):
                task['tag_ids'] = json.loads(task['tag_ids'])
            if task.get('reminders'):
                task['reminders'] = json.loads(task['reminders'])
            tasks.append(task)
        
        if tasks:
            tasks_file = output_dir / 'tasks.json'
            with open(tasks_file, 'w', encoding='utf-8') as f:
                json.dump(tasks, f, indent=2, ensure_ascii=False)
            print(f"  ✓ Exported {len(tasks)} tasks")
    except sqlite3.OperationalError as e:
        print(f"  ⚠️  No tasks table found: {e}")
    
    # Export calendar events
    print("\n� Exporting calendar events...")
    try:
        cursor = conn.execute('SELECT * FROM calendar_events')
        events = []
        for row in cursor.fetchall():
            events.append(dict(row))
        
        if events:
            events_file = output_dir / 'calendar_events.json'
            with open(events_file, 'w', encoding='utf-8') as f:
                json.dump(events, f, indent=2, ensure_ascii=False)
            print(f"  ✓ Exported {len(events)} calendar events")
    except sqlite3.OperationalError as e:
        print(f"  ⚠️  No calendar_events table found: {e}")
    
    conn.close()
    
    print(f"\n�📊 Export Summary:")
    print(f"  • {note_count} notes")
    print(f"  • {recipe_count} recipes")
    print(f"  • {doc_count} documentation")
    print(f"  • {chat_count} chats")
    if tasks:
        print(f"  • {len(tasks)} tasks")
    if events:
        print(f"  • {len(events)} calendar events")
    print(f"\n✅ Export complete!")


def main():
    # Default to creating a temp database from the monolith
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        print("Creating temporary database from monolith...")
        import os
        os.system("python seed_demo_db.py data/db/temp_export.db > /dev/null 2>&1")
        db_path = "data/db/temp_export.db"
    
    if not Path(db_path).exists():
        print(f"❌ Database not found: {db_path}")
        print("\nPlease either:")
        print("  1. Run the monolith script first: python seed_demo_db.py")
        print("  2. Provide an existing database path: python scripts/export_db_to_json.py path/to/db")
        return
    
    output_dir = Path('scripts/seed/fixtures')
    export_from_database(db_path, output_dir)


if __name__ == '__main__':
    main()

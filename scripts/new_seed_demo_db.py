#!/usr/bin/env python3
"""
Modular seed script for LLM-Notetaker demo database.

This script uses a hybrid approach:
- JSON files for static data (easy to edit, version control friendly)
- Python loaders for dynamic logic (validation, complex generation)

Usage:
    python scripts/new_seed_demo_db.py                          # Default: data/db/demo_notetaker.db
    python scripts/new_seed_demo_db.py path/to/custom.db        # Custom path
    python scripts/new_seed_demo_db.py --only notes             # Load only notes
    python scripts/new_seed_demo_db.py --skip recipes           # Skip recipes

Then run the app:
    DATABASE_PATH=data/db/demo_notetaker.db python app.py
"""

import os
import sys
from pathlib import Path

# Add the project root to the path so we can import app modules
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import DatabaseManager
from app.core.data_service import DataService
from seed.loaders import (
    load_tags,
    load_folders,
    load_notes,
    load_chats,
    load_tasks,
    load_calendar_events,
)


def parse_args():
    """Parse command line arguments."""
    import argparse
    parser = argparse.ArgumentParser(description='Seed LLM-Notetaker demo database')
    parser.add_argument(
        'db_path',
        nargs='?',
        default=os.path.join('data', 'db', 'demo_notetaker.db'),
        help='Path to database file (default: data/db/demo_notetaker.db)'
    )
    parser.add_argument(
        '--only',
        choices=['tags', 'folders', 'notes', 'recipes', 'docs', 'chats', 'tasks'],
        help='Load only specific content type'
    )
    parser.add_argument(
        '--skip',
        choices=['tags', 'folders', 'notes', 'recipes', 'docs', 'chats', 'tasks'],
        action='append',
        help='Skip specific content types'
    )
    parser.add_argument(
        '--keep-existing',
        action='store_true',
        help='Keep existing database (do not delete)'
    )
    return parser.parse_args()


def main():
    args = parse_args()
    db_path = args.db_path
    skip = args.skip or []
    
    # Get the fixtures directory
    fixtures_dir = Path(__file__).parent / 'seed' / 'fixtures'
    
    print(f"\n{'='*60}")
    print(f"🌱 Seeding LLM-Notetaker Demo Database")
    print(f"{'='*60}\n")
    
    # Ensure parent directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    # Remove existing database unless --keep-existing flag is set
    if not args.keep_existing and os.path.exists(db_path):
        os.remove(db_path)
        print(f"🗑️  Removed existing database\n")
    
    # Initialize database manager and data service
    db_manager = DatabaseManager(db_path=db_path)
    db = DataService(db_path=db_path)
    print(f"📂 Database: {db_path}\n")
    
    # Load data based on flags
    should_load = lambda name: (not args.only or args.only == name) and name not in skip
    
    # 1. Load tags (always needed if loading anything else)
    if should_load('tags') or args.only != 'tags':
        load_tags(db, fixtures_dir / 'tags.json')
    
    # 2. Load folder structure (always needed for organizing content)
    if should_load('folders') or args.only not in ['tags', 'folders']:
        load_folders(db, fixtures_dir / 'folders.json')
    
    # 3. Load notes
    if should_load('notes'):
        load_notes(db, fixtures_dir / 'notes')
    
    # 4. Load recipes
    if should_load('recipes'):
        load_notes(db, fixtures_dir / 'recipes')
    
    # 5. Load documentation
    if should_load('docs'):
        docs_dir = fixtures_dir / 'documentation'
        if docs_dir.exists():
            load_notes(db, docs_dir)
    
    # 6. Load chats
    if should_load('chats'):
        load_chats(db, fixtures_dir / 'chats')
    
    # 7. Load tasks and calendar events
    if should_load('tasks'):
        tasks_file = fixtures_dir / 'tasks.json'
        if tasks_file.exists():
            load_tasks(db, tasks_file)
        
        calendar_file = fixtures_dir / 'calendar_events.json'
        if calendar_file.exists():
            load_calendar_events(db, calendar_file)
    
    # Summary
    print(f"\n{'='*60}")
    print(f"✅ Database seeding complete!")
    print(f"{'='*60}")
    print(f"\n📊 Summary:")
    print(f"  • Fixtures loaded from: {fixtures_dir}")
    print(f"  • Database created at: {db_path}")
    print(f"\n🚀 To use this database:")
    print(f"  DATABASE_PATH={db_path} python app.py")
    print(f"\n💡 Tips:")
    print(f"  • Edit JSON files in {fixtures_dir} to customize content")
    print(f"  • Use --only flag to load specific content: --only notes")
    print(f"  • Use --skip flag to skip content: --skip recipes")
    print(f"  • Use --keep-existing to preserve existing data")
    print()


if __name__ == "__main__":
    main()

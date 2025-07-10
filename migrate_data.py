#!/usr/bin/env python3
"""
Migration script for LLM-Notetaker
Migrates from JSON file storage to SQLite database storage
"""

import os
import sys
import json
import logging
from datetime import datetime
from data_service import DataService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def backup_existing_files(data_dir: str):
    """Create backups of existing JSON files."""
    tree_file = os.path.join(data_dir, 'tree.json')
    chat_file = os.path.join(data_dir, 'chats.json')
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    if os.path.exists(tree_file):
        backup_path = f"{tree_file}.backup_{timestamp}"
        os.rename(tree_file, backup_path)
        logger.info(f"Backed up tree.json to {backup_path}")
    
    if os.path.exists(chat_file):
        backup_path = f"{chat_file}.backup_{timestamp}"
        os.rename(chat_file, backup_path)
        logger.info(f"Backed up chats.json to {backup_path}")

def validate_migration(data_service: DataService, original_tree: list, original_chats: list):
    """Validate that migration was successful."""
    logger.info("Validating migration...")
    
    # Get migrated data
    migrated_tree = data_service.get_tree()
    
    # Count nodes
    def count_nodes(tree):
        count = 0
        for node in tree:
            count += 1
            if 'children' in node:
                count += count_nodes(node['children'])
        return count
    
    original_count = count_nodes(original_tree)
    migrated_count = count_nodes(migrated_tree)
    
    logger.info(f"Original tree nodes: {original_count}")
    logger.info(f"Migrated tree nodes: {migrated_count}")
    
    if original_count == migrated_count:
        logger.info("✓ Node count matches")
    else:
        logger.warning(f"⚠ Node count mismatch: {original_count} vs {migrated_count}")
    
    # Check chat count
    original_chat_count = len(original_chats)
    migrated_chat_count = len([n for n in flatten_tree(migrated_tree) if n['type'] == 'chat'])
    
    logger.info(f"Original chats: {original_chat_count}")
    logger.info(f"Migrated chats: {migrated_chat_count}")
    
    if original_chat_count == migrated_chat_count:
        logger.info("✓ Chat count matches")
    else:
        logger.warning(f"⚠ Chat count mismatch: {original_chat_count} vs {migrated_chat_count}")

def flatten_tree(tree):
    """Flatten tree structure."""
    nodes = []
    for node in tree:
        nodes.append(node)
        if 'children' in node:
            nodes.extend(flatten_tree(node['children']))
    return nodes

def main():
    """Main migration function."""
    # Get the data directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, 'data')
    
    tree_file = os.path.join(data_dir, 'tree.json')
    chat_file = os.path.join(data_dir, 'chats.json')
    
    # Check if migration is needed
    if not os.path.exists(tree_file) and not os.path.exists(chat_file):
        logger.info("No JSON files found. Migration not needed.")
        return
    
    logger.info("Starting migration from JSON files to SQLite database...")
    
    # Load original data for validation
    original_tree = []
    original_chats = []
    
    if os.path.exists(tree_file):
        with open(tree_file, 'r') as f:
            original_tree = json.load(f)
        logger.info(f"Loaded {len(original_tree)} root nodes from tree.json")
    
    if os.path.exists(chat_file):
        with open(chat_file, 'r') as f:
            original_chats = json.load(f)
        logger.info(f"Loaded {len(original_chats)} chats from chats.json")
    
    # Initialize data service
    try:
        data_service = DataService()
        logger.info("Initialized database connection")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        return
    
    # Perform migration
    try:
        success = data_service.migrate_from_json_files(tree_file, chat_file)
        
        if success:
            logger.info("✓ Migration completed successfully")
            
            # Validate migration
            validate_migration(data_service, original_tree, original_chats)
            
            # Create backups of original files
            backup_existing_files(data_dir)
            
            # Test the new system
            health = data_service.health_check()
            if health['status'] == 'healthy':
                logger.info("✓ Health check passed")
                logger.info(f"Database contains {health['total_nodes']} nodes")
            else:
                logger.warning("⚠ Health check failed")
            
            # Show statistics
            stats = data_service.get_statistics()
            logger.info(f"Migration statistics:")
            logger.info(f"  - Total nodes: {stats['total_nodes']}")
            logger.info(f"  - Notes: {stats['notes_count']}")
            logger.info(f"  - Chats: {stats['chats_count']}")
            logger.info(f"  - Folders: {stats['folders_count']}")
            
        else:
            logger.error("❌ Migration failed")
            
    except Exception as e:
        logger.error(f"Migration error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()

"""Folder structure loading and creation."""

from pathlib import Path
from typing import Union, Dict
from .json_loader import load_json


def load_folders(db, file_path: Union[str, Path]) -> Dict[str, str]:
    """
    Load folder structure from JSON and create in database.
    
    Args:
        db: DataService instance (from app.core.data_service)
        file_path: Path to folders.json file
        
    Returns:
        Dictionary mapping folder names to their IDs
        
    Expected JSON format:
    {
        "root": {
            "id": "demo-root",
            "title": "Demo",
            "children": {
                "notes": {
                    "id": "demo-notes",
                    "title": "Sample Notes"
                },
                "chats": {
                    "id": "demo-chats",
                    "title": "Sample Chats"
                }
            }
        }
    }
    """
    print(f"Loading folder structure from {file_path}...")
    structure = load_json(file_path)
    folder_map = {}
    
    def create_folder_recursive(folder_data: dict, parent_id: str = None):
        """Recursively create folders and their children."""
        folder_id = folder_data['id']
        title = folder_data['title']
        
        db.create_node(folder_id, title, "folder", parent_id)
        folder_map[folder_id] = folder_id
        
        # Create children if they exist
        if 'children' in folder_data:
            for child_data in folder_data['children'].values():
                create_folder_recursive(child_data, parent_id=folder_id)
    
    # Create root and all children
    if 'root' in structure:
        create_folder_recursive(structure['root'])
    
    print(f"  ✓ Created {len(folder_map)} folders")
    return folder_map

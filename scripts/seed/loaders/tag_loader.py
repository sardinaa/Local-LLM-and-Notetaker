"""Tag loading and creation."""

from pathlib import Path
from typing import Union
from .json_loader import load_json


def load_tags(db, file_path: Union[str, Path]):
    """
    Load tags from a JSON file and create them in the database.
    
    Args:
        db: DataService instance (from app.core.data_service)
        file_path: Path to tags.json file
        
    Expected JSON format:
    [
        {
            "id": "tag-onboarding",
            "name": "Onboarding",
            "color": "blue",
            "icon": "📚"  # optional
        },
        ...
    ]
    """
    print(f"Loading tags from {file_path}...")
    tags = load_json(file_path)
    
    for tag in tags:
        # Extract sections if present (for updating later)
        sections = tag.pop('sections', None)
        
        # Create the tag
        created_tag = db.create_tag(tag)
        
        # If tag has sections (for kanban), update it
        if sections and created_tag:
            db.update_tag(created_tag['id'], {'sections': sections})
    
    print(f"  ✓ Created {len(tags)} tags")
    return tags

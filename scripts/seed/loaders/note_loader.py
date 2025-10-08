"""Note loading and creation from JSON files."""

from pathlib import Path
from typing import Union
from .json_loader import load_json, load_json_dir


def load_notes(db, source: Union[str, Path]):
    """
    Load notes from a JSON file or directory of JSON files.
    
    Args:
        db: DataService instance (from app.core.data_service)
        source: Path to a single JSON file or directory containing JSON files
        
    Expected JSON format for each note:
    {
        "id": "note-welcome",
        "title": "Welcome Tour",
        "folder": "demo-notes",  # folder ID
        "tags": ["tag-onboarding", "tag-guide"],
        "content": {
            "time": 1728345600000,
            "version": "2.29.0",
            "blocks": [
                {
                    "type": "header",
                    "data": {"text": "Title", "level": 2}
                },
                ...
            ]
        }
    }
    """
    source = Path(source)
    
    if source.is_file():
        notes = [load_json(source)]
        print(f"Loading note from {source}...")
    else:
        notes = load_json_dir(source)
        print(f"Loading notes from {source}...")
    
    created_count = 0
    for note_data in notes:
        try:
            # Create the note node
            db.create_node(
                note_data['id'],
                note_data['title'],
                "note",
                note_data.get('folder')
            )
            
            # Save the content
            if 'content' in note_data:
                db.notes_repo.save_note_content(note_data['id'], note_data['content'])
            
            # Assign tags
            if 'tags' in note_data and note_data['tags']:
                db.assign_tags_to_note(note_data['id'], note_data['tags'])
            
            created_count += 1
        except Exception as e:
            print(f"  ✗ Error creating note {note_data.get('id', 'unknown')}: {e}")
    
    print(f"  ✓ Created {created_count} notes")
    return created_count

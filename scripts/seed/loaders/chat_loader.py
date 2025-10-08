"""Chat loading and creation from JSON files."""

from pathlib import Path
from typing import Union
from datetime import datetime
from .json_loader import load_json, load_json_dir


def load_chats(db, source: Union[str, Path]):
    """
    Load chats from a JSON file or directory of JSON files.
    
    Args:
        db: DataService instance (from app.core.data_service)
        source: Path to a single JSON file or directory containing JSON files
        
    Expected JSON format for each chat:
    {
        "id": "chat-recipe-help",
        "title": "Recipe Help",
        "folder": "demo-chats",
        "tags": ["tag-recipes", "tag-cooking"],
        "messages": [
            {
                "text": "Can you help me with a recipe?",
                "sender": "user",
                "timestamp": "2025-10-07T10:00:00"
            },
            {
                "text": "Of course! What would you like to make?",
                "sender": "assistant",
                "timestamp": "2025-10-07T10:00:05",
                "sources": [
                    {
                        "note_id": "recipe-paella",
                        "title": "Paella Valenciana",
                        "snippet": "Traditional Spanish rice dish..."
                    }
                ]
            }
        ]
    }
    """
    source = Path(source)
    
    if source.is_file():
        chats = [load_json(source)]
        print(f"Loading chat from {source}...")
    else:
        chats = load_json_dir(source)
        print(f"Loading chats from {source}...")
    
    created_count = 0
    for chat_data in chats:
        try:
            # Create the chat node
            db.create_node(
                chat_data['id'],
                chat_data['title'],
                "chat",
                chat_data.get('folder')
            )
            
            # Save messages
            if 'messages' in chat_data:
                messages = []
                for msg in chat_data['messages']:
                    message = {
                        "text": msg['text'],
                        "sender": msg['sender'],
                        "timestamp": msg.get('timestamp', datetime.utcnow().isoformat())
                    }
                    if 'sources' in msg:
                        message['sources'] = msg['sources']
                    messages.append(message)
                
                db.chat_repo.save_chat_messages(chat_data['id'], messages)
            
            # Assign tags
            if 'tags' in chat_data and chat_data['tags']:
                db.assign_tags_to_note(chat_data['id'], chat_data['tags'])
            
            created_count += 1
        except Exception as e:
            print(f"  ✗ Error creating chat {chat_data.get('id', 'unknown')}: {e}")
    
    print(f"  ✓ Created {created_count} chats")
    return created_count

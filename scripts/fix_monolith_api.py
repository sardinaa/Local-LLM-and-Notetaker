#!/usr/bin/env python3
"""
Fix the monolith seed script to use the new DataService/Repository API.
"""

import re

def fix_monolith():
    with open('seed_demo_db.py', 'r') as f:
        content = f.read()
    
    # Replace all db.save_note_content() with db.notes_repo.save_note_content()
    content = re.sub(r'\bdb\.save_note_content\(', 'db.notes_repo.save_note_content(', content)
    
    # Replace all db.assign_tags_to_note() with db.assign_tags_to_note()
    # (this one stays the same - it exists in DataService)
    
    # Replace all db.save_chat_messages() with db.chat_repo.save_chat_messages()
    content = re.sub(r'\bdb\.save_chat_messages\(', 'db.chat_repo.save_chat_messages(', content)
    
    # Replace all db.create_tag() with db.create_tag()
    # (this one stays the same - it exists in DataService)
    
    # Replace all db.update_tag() with db.update_tag()
    # (this one stays the same - it exists in DataService)
    
    with open('seed_demo_db.py', 'w') as f:
        f.write(content)
    
    print("✅ Fixed monolith API calls")
    print("  • db.save_note_content() → db.notes_repo.save_note_content()")
    print("  • db.save_chat_messages() → db.chat_repo.save_chat_messages()")

if __name__ == '__main__':
    fix_monolith()

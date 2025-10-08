# Modular Database Seeding System

This directory contains a modular, maintainable system for seeding the LLM-Notetaker demo database.

## 🎯 Architecture

### **Hybrid Approach**
- **JSON files** for static data (easy to edit, no Python knowledge needed)
- **Python loaders** for complex logic (validation, dynamic generation)

### **Structure**

```
scripts/
├── new_seed_demo_db.py          # Main orchestrator script
├── seed/
│   ├── __init__.py
│   ├── loaders/                 # Python loaders for each data type
│   │   ├── __init__.py
│   │   ├── json_loader.py       # Generic JSON loading
│   │   ├── tag_loader.py        # Tag creation
│   │   ├── folder_loader.py     # Folder hierarchy
│   │   ├── note_loader.py       # Note creation
│   │   ├── chat_loader.py       # Chat creation
│   │   └── task_loader.py       # Tasks & calendar events
│   ├── utils/                   # Helper utilities
│   │   ├── __init__.py
│   │   ├── editorjs.py          # EditorJS content helpers
│   │   └── datetime_helpers.py  # Date/time utilities
│   └── fixtures/                # JSON data files
│       ├── tags.json            # Tag definitions
│       ├── folders.json         # Folder hierarchy
│       ├── tasks.json           # Tasks & calendar events
│       ├── notes/               # Note JSON files
│       │   ├── welcome.json
│       │   └── rag_workflow.json
│       ├── recipes/             # Recipe JSON files
│       │   └── paella.json
│       ├── documentation/       # Documentation notes
│       └── chats/               # Chat conversation files
│           └── recipe_help.json
```

## 🚀 Usage

### Basic Usage

```bash
# Default: creates data/db/demo_notetaker.db
python scripts/new_seed_demo_db.py

# Custom database path
python scripts/new_seed_demo_db.py path/to/custom.db

# Load only specific content
python scripts/new_seed_demo_db.py --only notes

# Skip specific content
python scripts/new_seed_demo_db.py --skip recipes --skip chats

# Keep existing database (append mode)
python scripts/new_seed_demo_db.py --keep-existing
```

### Run the app with seeded database

```bash
DATABASE_PATH=data/db/demo_notetaker.db python app.py
```

## 📝 Adding New Content

### Adding a New Note

1. Create a JSON file in `fixtures/notes/` (or `fixtures/recipes/`, etc.):

```json
{
  "id": "note-my-note",
  "title": "My Awesome Note",
  "folder": "demo-notes",
  "tags": ["tag-guide", "tag-productivity"],
  "content": {
    "time": 1728345600000,
    "version": "2.29.0",
    "blocks": [
      {
        "type": "header",
        "data": {"text": "My Title", "level": 2}
      },
      {
        "type": "paragraph",
        "data": {"text": "My content..."}
      }
    ]
  }
}
```

2. Run the seed script - it will automatically load all JSON files from the directory!

### Adding a New Chat

Create a JSON file in `fixtures/chats/`:

```json
{
  "id": "chat-my-chat",
  "title": "My Chat",
  "folder": "demo-chats",
  "tags": ["tag-guide"],
  "messages": [
    {
      "text": "Hello!",
      "sender": "user",
      "timestamp": "2025-10-07T10:00:00"
    },
    {
      "text": "Hi there!",
      "sender": "assistant",
      "timestamp": "2025-10-07T10:00:05",
      "sources": [
        {
          "note_id": "note-welcome",
          "title": "Welcome",
          "snippet": "..."
        }
      ]
    }
  ]
}
```

### Adding New Tags

Edit `fixtures/tags.json`:

```json
[
  {
    "id": "tag-new",
    "name": "New Tag",
    "color": "blue",
    "icon": "🎉"
  }
]
```

## 🎨 EditorJS Block Types

All EditorJS blocks are supported. Common examples:

```json
{"type": "header", "data": {"text": "Title", "level": 2}}
{"type": "paragraph", "data": {"text": "Text content"}}
{"type": "list", "data": {"style": "unordered", "items": ["Item 1", "Item 2"]}}
{"type": "image", "data": {"url": "/path/to/image.jpg", "caption": "Caption"}}
{"type": "table", "data": {"withHeadings": true, "content": [["A", "B"], ["1", "2"]]}}
{"type": "quote", "data": {"text": "Quote text", "caption": "Source"}}
{"type": "code", "data": {"code": "console.log('hello');"}}
```

### Internal Note Links

```json
{
  "type": "paragraph",
  "data": {
    "text": "See <a href=\"#note:note-id\" class=\"note-link\" data-note-id=\"note-id\">Other Note</a>"
  }
}
```

## 🔧 Benefits Over Monolithic Script

| Aspect | Old (Monolithic) | New (Modular) |
|--------|------------------|---------------|
| **File Size** | 2,846 lines | ~100 lines per file |
| **Editability** | Python knowledge required | JSON (anyone can edit) |
| **Testing** | Hard to test | Each module testable |
| **Version Control** | Large diffs | Clear, focused diffs |
| **Reusability** | Copy/paste code | Import modules |
| **Maintenance** | Find code in 2,846 lines | Clear file structure |
| **Extensibility** | Modify monolith | Add new JSON file |
| **Collaboration** | Merge conflicts | Parallel work easy |

## 🛠️ Advanced Usage

### Programmatic Content Generation

For complex content that's hard to write in JSON, use Python:

```python
from seed.utils import create_header, create_paragraph, editorjs_note

# Generate content dynamically
content = editorjs_note(
    title="Dynamic Note",
    paragraphs=["Generated paragraph"],
    bullets=["Point 1", "Point 2"]
)
```

### Custom Loaders

Create custom loaders in `seed/loaders/` for specialized content:

```python
# seed/loaders/my_loader.py
def load_my_content(db, file_path):
    data = load_json(file_path)
    # Custom processing logic...
    db.create_custom_content(data)
```

## 📦 Migration from Old Script

To migrate existing content from `seed_demo_db.py`:

1. Identify content sections (tags, notes, recipes, etc.)
2. Extract data into JSON files
3. Use existing loaders or create custom ones
4. Test with `--only` flag for each content type

## 🧪 Testing

Test individual components:

```bash
# Test only tags
python scripts/new_seed_demo_db.py --only tags

# Test everything except large datasets
python scripts/new_seed_demo_db.py --skip documentation
```

## 🤝 Contributing

To add new content:
1. Create JSON files in appropriate `fixtures/` subdirectory
2. Use existing loaders (they auto-discover JSON files)
3. If you need custom logic, create a new loader in `seed/loaders/`
4. Update this README with examples

## 📚 References

- [EditorJS Documentation](https://editorjs.io/)
- Original script: `seed_demo_db.py` (kept for reference)

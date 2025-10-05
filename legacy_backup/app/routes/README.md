# Legacy Routes Archive

This directory contains legacy route files that have been replaced by newer systems.

## Archived Components

### rag.py
- **Archived Date**: October 5, 2025
- **Original Size**: 803 lines
- **Reason**: Replaced by RAG v2 API (`rag_v2.py`)
- **Replacement**: `app/routes/rag_v2.py` (462 lines, cleaner design)
- **API Version**: v1 → v2

## Why Archived?

The legacy RAG routes (v1 API) have been replaced with a cleaner v2 API that integrates with the modular Chat Agent system.

### V1 API Issues
- ❌ Coupled to monolithic RAG manager
- ❌ No conversation memory support
- ❌ Limited error handling
- ❌ No URL ingestion
- ❌ Basic source attribution
- ❌ No statistics endpoints

### V2 API Improvements
- ✅ **Modular Design**: Uses Chat Agent Facade
- ✅ **Conversation Memory**: Context-aware responses
- ✅ **URL Ingestion**: Add web content directly
- ✅ **Hybrid Search**: Semantic + keyword
- ✅ **Enhanced Sources**: Better attribution with metadata
- ✅ **Statistics**: Real-time knowledge base metrics
- ✅ **Better Errors**: Comprehensive error messages

## API Migration

### Endpoint Mapping

| v1 Endpoint | v2 Endpoint | Status |
|-------------|-------------|--------|
| `GET /api/rag/health` | `GET /api/rag/v2/health` | ✅ Migrated |
| `POST /api/rag/upload` | `POST /api/rag/v2/upload` | ✅ Enhanced |
| `POST /api/rag/chat` | `POST /api/rag/v2/chat` | ✅ Enhanced |
| `GET /api/rag/documents/<id>` | `GET /api/rag/v2/documents/<id>` | ✅ Migrated |
| `DELETE /api/rag/documents/<id>/<file>` | `DELETE /api/rag/v2/documents/<id>/<file>` | ✅ Migrated |
| `DELETE /api/rag/documents/<id>` | `DELETE /api/rag/v2/documents/<id>` | ✅ Migrated |
| N/A | `POST /api/rag/v2/add-url` | ✨ New |
| N/A | `POST /api/rag/v2/query` | ✨ New |
| N/A | `GET /api/rag/v2/stats/<id>` | ✨ New |

### Breaking Changes

1. **Response Format**: v2 includes enhanced metadata
   ```json
   {
     "response": "...",
     "sources": [...],
     "has_memory": true,
     "chunks": 15
   }
   ```

2. **Conversation History**: New optional parameter
   ```json
   {
     "chat_id": "...",
     "message": "...",
     "conversation_history": [...]
   }
   ```

3. **Upload Response**: Includes chunk count
   ```json
   {
     "status": "success",
     "filename": "doc.pdf",
     "chunks": 25
   }
   ```

## Frontend Migration

The frontend has been updated to use v2 API:

### `static/js/rag.js` Changes
```javascript
// OLD (v1)
fetch('/api/rag/chat', { ... })

// NEW (v2)
fetch('/api/rag/v2/chat', {
  body: JSON.stringify({
    conversation_history: this.getHistory(chatId),
    ...
  })
})
```

### Feature Flags
```javascript
// In rag.js
this.useV2API = true; // Use v2 by default
```

## Restoration (Emergency Only)

If you need to restore v1 API temporarily:

### Step 1: Restore File
```bash
cp legacy_backup/app/routes/rag.py app/routes/
```

### Step 2: Register Blueprint
In `app/__init__.py`:
```python
# Add back v1 routes
try:
    from .routes.rag import rag_bp
    app.register_blueprint(rag_bp, url_prefix="/api")
except Exception:
    pass
```

### Step 3: Restore RAG Manager
```bash
cp legacy_backup/services/rag_manager.py services/
```

### Step 4: Update Initialization
In `app/__init__.py`:
```python
try:
    from services.rag_manager import RAGManager
    app.rag_manager = RAGManager(...)
except Exception:
    pass
```

### Step 5: Update Frontend
In `static/js/rag.js`:
```javascript
this.useV2API = false; // Use v1
```

### Step 6: Restart
```bash
python run.py
```

## ⚠️ Important Warning

**Do not use archived routes in production!**

These routes are kept for:
- Historical reference only
- Emergency rollback (temporary)
- Understanding design decisions

The v2 API is the supported production implementation.

## Document Processing Endpoints

Note: Some endpoints in the archived `rag.py` are for document processing (not RAG-specific):
- `/highlight-document` - Document highlighting
- `/document-to-editorjs` - Convert document to EditorJS format
- `/test/sample-pdf` - Test endpoint

These may need to be moved to a dedicated document processing routes file if still needed.

## Questions or Issues?

If you need to restore v1 routes or have questions:

1. Review v2 API docs: `docs/PHASE_2_COMPLETE.md`
2. Check migration guide: `docs/PHASE_3_FRONTEND_GUIDE.md`
3. See architecture: `docs/CHAT_AGENT_ARCHITECTURE.md`
4. Contact development team

## File Manifest

```
legacy_backup/app/routes/
├── README.md                    # This file
└── rag.py                       # Archived v1 RAG routes (803 lines)
```

---

**Archive Created**: October 5, 2025  
**Migration Status**: Complete ✅  
**System Status**: Running on RAG v2 API

# Legacy Services Archive

This directory contains legacy services that have been replaced by modular systems.

## Archived Components

### rag_manager.py
- **Archived Date**: October 5, 2025
- **Original Size**: 944 lines (monolithic)
- **Reason**: Replaced by modular Chat Agent system
- **Replacement**: `services/agents/` (9 focused modules, 2,254 lines)
- **Migration Guide**: `docs/RAG_VS_CHAT_AGENT_COMPARISON.md`

## Why Archived?

The monolithic RAG manager has been replaced with a modular Chat Agent system that provides:

### Technical Improvements
- ✅ **Separation of Concerns**: 9 focused modules vs 1 monolithic file
- ✅ **Testability**: Individual components can be tested in isolation
- ✅ **Maintainability**: Easier to understand, modify, and extend
- ✅ **Configuration**: Environment-based via `.env` file

### New Features
- ✅ **Conversation Memory**: Context-aware responses across multiple exchanges
- ✅ **URL Ingestion**: Add web content directly to knowledge base
- ✅ **Hybrid Search**: Combines semantic and keyword search
- ✅ **Enhanced Attribution**: Better source tracking and display
- ✅ **Statistics**: Real-time knowledge base metrics

### API Improvements
- ✅ **RESTful Design**: Clean v2 API at `/api/rag/v2/*`
- ✅ **Streaming Support**: Real-time response streaming
- ✅ **Error Handling**: Comprehensive error messages
- ✅ **Backward Compatible**: v1 routes remain functional

## Migration Timeline

| Phase | Status | Date |
|-------|--------|------|
| Phase 0: Planning | ✅ Complete | - |
| Phase 1: Core Modules | ✅ Complete | - |
| Phase 2: API Integration | ✅ Complete | - |
| Phase 3: Frontend Update | ✅ Complete | - |
| Phase 4: Cleanup | ✅ Complete | October 5, 2025 |

## Restoration (Emergency Only)

If needed for reference or emergency rollback:

### Step 1: Restore File
```bash
cp legacy_backup/services/rag_manager.py services/
```

### Step 2: Update Imports in `app/__init__.py`
```python
from services.rag_manager import RAGManager

# In _init_services():
rag_embedding_model = os.getenv("RAG_EMBEDDING_MODEL", "nomic-embed-text")
app.rag_manager = RAGManager(
    embedding_model=rag_embedding_model,
    ollama_base_url=ollama_url
)
```

### Step 3: Restore v1 Routes
```bash
cp legacy_backup/app/routes/rag.py app/routes/
```

### Step 4: Register Blueprint
```python
# In app/__init__.py
from .routes.rag import rag_bp
app.register_blueprint(rag_bp, url_prefix="/api")
```

### Step 5: Update Frontend
```javascript
// In static/js/rag.js
this.useV2API = false; // Disable v2
```

### Step 6: Restart Application
```bash
python run.py
```

## ⚠️ Important Warning

**Do not use archived code in production!**

This code is kept for:
- Historical reference
- Emergency rollback only
- Understanding migration decisions

The Chat Agent system is the supported production implementation.

## Questions or Issues?

If you need to restore legacy code or have questions about the migration:

1. Review migration documentation: `docs/MASTER_IMPLEMENTATION_GUIDE.md`
2. Check comparison guide: `docs/RAG_VS_CHAT_AGENT_COMPARISON.md`
3. See architecture: `docs/CHAT_AGENT_ARCHITECTURE.md`
4. Contact development team

## File Manifest

```
legacy_backup/services/
├── README.md                    # This file
├── rag_manager.py              # Archived RAG manager (944 lines)
└── rag_manager.cpython-*.pyc   # Cached bytecode (if present)
```

---

**Archive Created**: October 5, 2025  
**Migration Status**: Complete ✅  
**System Status**: Running on Chat Agent v2

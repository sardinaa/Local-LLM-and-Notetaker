# Document Reference Highlighting - Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  USER CLICKS [1] REFERENCE IN CHAT                                          │
│                                                                              │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  📱 FRONTEND: static/js/chat/sourceDisplay.js                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  handleReferenceClick(refElement)                                           │
│  ├─ Get source object from message.dataset.sources                          │
│  │  { text: "Paris is the capital...", page: 3, source: "doc.pdf" }       │
│  │                                                                           │
│  └─ Call: highlightAndNavigateToPDF(source)                                │
│      ├─ Extract chat_id from URL/context                                    │
│      ├─ Extract filename from source                                        │
│      │                                                                       │
│      └─ POST /api/rag/highlight-chunks                                      │
│          {                                                                   │
│            "chat_id": "default",                                            │
│            "filename": "CV-B2-T6.pdf",                                      │
│            "chunks": ["Paris is the capital and largest city..."]          │
│          }                                                                   │
│                                                                              │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │ HTTP POST
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔧 BACKEND: app/routes/rag.py                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  @rag_bp.post("/highlight-chunks")                                          │
│  ├─ Validate: chat_id, filename, chunks                                     │
│  │                                                                           │
│  ├─ Search for file:                                                        │
│  │   1. Try: instance/uploads/{chat_id}/{filename}                         │
│  │   2. Search: instance/uploads/{agent}/*/{filename}                      │
│  │   ✓ Found: instance/uploads/letters/dfb58.../CV-B2-T6.pdf              │
│  │                                                                           │
│  └─ Call DocumentHighlightService                                           │
│                                                                              │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  🎯 BACKEND: services/retrieval/document_highlight_service.py               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  highlight_retrieved_chunks(file_path, chunks)                              │
│  │                                                                           │
│  ├─ Extract PDF structure with PyMuPDF                                      │
│  │   ├─ Page 1: [block1, block2, block3, ...]  (individual lines)         │
│  │   ├─ Page 2: [block1, block2, block3, ...]                              │
│  │   └─ Page 3: [block1, block2, block3, ...]                              │
│  │                                                                           │
│  ├─ For each chunk: _find_chunk_in_document()                               │
│  │   │                                                                       │
│  │   ├─ ⚡ NEW ALGORITHM: Group consecutive matching blocks                │
│  │   │   │                                                                   │
│  │   │   ├─ Iterate through text blocks (lines)                             │
│  │   │   ├─ If block matches chunk (30% word overlap):                      │
│  │   │   │   └─ Add to current_group                                        │
│  │   │   ├─ If block doesn't match:                                         │
│  │   │   │   └─ Save current_group, start new group                         │
│  │   │   │                                                                   │
│  │   │   └─ For each group:                                                 │
│  │   │       ├─ Combine text from all blocks                                │
│  │   │       ├─ Merge bounding boxes (min/max x/y)                          │
│  │   │       └─ Create ONE highlight for entire passage                     │
│  │   │                                                                       │
│  │   └─ Return: HighlightSpan objects with precise coordinates              │
│  │                                                                           │
│  └─ Response:                                                                │
│      {                                                                       │
│        "highlights": [                                                       │
│          {                                                                   │
│            "page": 3,                                                        │
│            "bbox": { "x": 100, "y": 200, "width": 400, "height": 60 },    │
│            "text": "Paris is the capital and largest city of France...",   │
│            "relevance_score": 1.0,                                          │
│            "match_type": "rag-chunk"                                        │
│          }                                                                   │
│        ]                                                                     │
│      }                                                                       │
│                                                                              │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │ JSON Response
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  📱 FRONTEND: static/js/chat/sourceDisplay.js                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Receive API response                                                       │
│  ├─ Extract highlights array                                                │
│  │                                                                           │
│  └─ Send to PDF viewer:                                                     │
│      pdfIframe.postMessage({                                                │
│        type: 'chunkHighlight',  ← NEW MESSAGE TYPE                         │
│        highlights: [...]                                                     │
│      })                                                                      │
│                                                                              │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │ postMessage
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  📄 PDF VIEWER: pdfjs-config/highlight-plugin.js                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  window.addEventListener('message', (e) => {                                │
│    if (e.data.type === 'chunkHighlight') {                                 │
│      applyChunkHighlight(app, e.data)  ← NEW HANDLER                       │
│    }                                                                         │
│  })                                                                          │
│                                                                              │
│  applyChunkHighlight(app, payload):                                         │
│  ├─ Clear old highlights                                                    │
│  │                                                                           │
│  ├─ For each highlight in payload.highlights:                               │
│  │   ├─ Get page view                                                       │
│  │   ├─ Get/create highlight layer                                          │
│  │   │                                                                       │
│  │   └─ Create highlight div:                                               │
│  │       const mark = document.createElement('div')                         │
│  │       mark.className = 'ai-mark ai-role-ai'                              │
│  │       mark.style.left = bbox.x + 'px'      ← PRECISE COORDS             │
│  │       mark.style.top = bbox.y + 'px'                                     │
│  │       mark.style.width = bbox.width + 'px'                               │
│  │       mark.style.height = bbox.height + 'px'                             │
│  │       layer.appendChild(mark)                                            │
│  │                                                                           │
│  └─ Scroll to first highlight                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                 │
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ✅ USER SEES COHERENT PASSAGE HIGHLIGHTED IN PDF                           │
│                                                                              │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ Page 3                                             │                    │
│  │                                                     │                    │
│  │ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │                    │
│  │ ┃ Paris is the capital and largest city of    ┃ │ ← SINGLE HIGHLIGHT │
│  │ ┃ France, with an estimated population of     ┃ │   (NOT SCATTERED!) │
│  │ ┃ 2,161,000 residents. Since the 17th century ┃ │                    │
│  │ ┃ Paris has been one of Europe's major        ┃ │                    │
│  │ ┃ centres of finance, diplomacy, commerce...  ┃ │                    │
│  │ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │                    │
│  │                                                     │                    │
│  └────────────────────────────────────────────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Improvements:

### ❌ BEFORE (Legacy Keyword System):
- User clicks `[1]`
- Frontend sends `{ type: 'editorHighlight', prompt: "capital France" }`
- PDF viewer does character-by-character keyword search
- Result: **50+ scattered word matches** across entire document

### ✅ AFTER (Chunk-Based System):
- User clicks `[1]`
- Frontend calls `/api/rag/highlight-chunks` with full chunk text
- Backend groups consecutive matching lines into passages
- PDF viewer draws single precise box per passage
- Result: **2-3 coherent passage highlights** showing exact RAG sources

## Performance:
- Matching: **O(n)** where n = number of text blocks in document
- Grouping: **O(n)** single pass to group consecutive matches
- Rendering: **O(k)** where k = number of passages (typically 2-5)
- Total: **~50ms** for typical document

## Maintainability:
- ✅ Clean separation: Legacy system untouched, new system parallel
- ✅ Graceful fallback: If chunk API fails, falls back to legacy
- ✅ Extensible: Easy to add more highlight types
- ✅ Testable: Unit tests for grouping algorithm

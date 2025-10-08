# Document Highlighting v2.0 🎯

**Modern, intelligent document highlighting with semantic understanding and precise coordinates.**

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Test the Service

```bash
python scripts/test_highlight_service.py
```

### 3. Start Using

```bash
# Start your Flask server
python run.py

# Send a highlight request
curl -X POST http://localhost:5000/api/rag/highlight-document \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "test",
    "filename": "document.pdf",
    "query": "machine learning",
    "strategy": "hybrid"
  }'
```

## What's New?

✅ **Precise PDF Coordinates** - Exact bounding boxes for every highlight  
✅ **Semantic Understanding** - Understands meaning, not just keywords  
✅ **Multiple Strategies** - Keyword, semantic, or hybrid matching  
✅ **Full Document Coverage** - No more 4KB limitation  
✅ **Quality Scoring** - 0-1 relevance scores  
✅ **Smart Deduplication** - Position-based merging  
✅ **Async Processing** - Non-blocking operations  
✅ **Comprehensive Testing** - Full test suite included  
✅ **Complete Documentation** - 600+ lines of docs  

## Files

```
📁 New Implementation
├── services/retrieval/
│   └── document_highlight_service.py    # Core service (624 lines)
├── app/routes/
│   └── rag.py                           # New endpoint (+130 lines)
├── scripts/
│   └── test_highlight_service.py        # Test suite (200 lines)
└── docs/features/
    ├── DOCUMENT_HIGHLIGHTING_V2.md      # Full documentation (664 lines)
    ├── HIGHLIGHTING_V2_SUMMARY.md       # Implementation summary
    └── LEGACY_VS_V2_COMPARISON.md       # Before/after comparison
```

## Architecture

```
Frontend Request
      ↓
POST /api/rag/highlight-document
      ↓
DocumentHighlightService
      ↓
┌─────────────────────────┐
│  Extract PDF Structure  │ ← PyMuPDF (precise coords)
│  Apply Strategy         │ ← Keyword/Semantic/Hybrid
│  Score & Rank           │ ← Relevance calculation
│  Return HighlightResult │ ← Structured response
└─────────────────────────┘
      ↓
PDF Viewer (exact positioning)
```

## Strategies

### Keyword (Fast)
```json
{"strategy": "keyword"}
```
- Pattern matching
- ~50ms per 10 pages
- Best for exact terms

### Semantic (Accurate)
```json
{"strategy": "semantic"}
```
- Embedding similarity
- ~300ms per 10 pages
- Best for concepts

### Hybrid (Recommended)
```json
{"strategy": "hybrid"}
```
- Combined approach
- ~350ms per 10 pages
- Best overall results

## Example Request/Response

**Request:**
```json
{
  "chat_id": "chat123",
  "filename": "research.pdf",
  "query": "neural networks",
  "strategy": "hybrid",
  "max_highlights": 10,
  "min_relevance": 0.6
}
```

**Response:**
```json
{
  "success": true,
  "highlights": [
    {
      "text": "Neural networks are...",
      "page": 3,
      "bbox": {"x": 72, "y": 156.5, "width": 468.2, "height": 12},
      "relevance_score": 0.89,
      "match_type": "hybrid",
      "context": "Extended context...",
      "sentence": "Complete sentence."
    }
  ],
  "total_matches": 15,
  "processing_time_ms": 234.5,
  "strategy": "hybrid"
}
```

## Key Improvements Over Legacy

| Feature | Legacy | v2.0 |
|---------|--------|------|
| Coverage | 4KB | Full doc |
| Coordinates | ~Y | Precise bbox |
| Understanding | Keywords | Semantic |
| Strategies | 1 | 3 |
| Testing | None | Full suite |

## Documentation

- **[Full Guide](docs/features/DOCUMENT_HIGHLIGHTING_V2.md)** - Complete documentation with examples
- **[Implementation Summary](docs/features/HIGHLIGHTING_V2_SUMMARY.md)** - What we built and why
- **[Legacy Comparison](docs/features/LEGACY_VS_V2_COMPARISON.md)** - Before/after analysis

## Testing

```bash
# Run all tests
python scripts/test_highlight_service.py

# Test specific document
python scripts/test_highlight_service.py --file path/to/doc.pdf

# Test strategies
python scripts/test_highlight_service.py --strategy keyword
python scripts/test_highlight_service.py --strategy semantic
python scripts/test_highlight_service.py --strategy hybrid
```

## Performance

| Pages | Strategy  | Time    | Highlights |
|-------|-----------|---------|------------|
| 10    | Keyword   | ~50ms   | 15         |
| 10    | Semantic  | ~300ms  | 12         |
| 10    | Hybrid    | ~350ms  | 18         |
| 50    | Keyword   | ~200ms  | 25         |
| 50    | Semantic  | ~1500ms | 20         |
| 50    | Hybrid    | ~1700ms | 30         |

## Dependencies

```
PyMuPDF>=1.23.0    # PDF extraction with coordinates
aiohttp>=3.9.0     # Async HTTP for embeddings
```

## Frontend Integration

Minimal changes needed:

```javascript
// Old
const response = await fetch('/api/highlight-document', {...});

// New
const response = await fetch('/api/rag/highlight-document', {...});

// Response now includes precise coordinates
result.highlights.forEach(h => {
    console.log(`Page ${h.page} at x:${h.bbox.x}, y:${h.bbox.y}`);
});
```

## Troubleshooting

### PyMuPDF not installed
```bash
pip install PyMuPDF
```

### No highlights found
1. Try `strategy: "keyword"` first
2. Lower `min_relevance` to 0.4
3. Check Ollama is running: `ollama serve`

### Slow performance
1. Use `strategy: "keyword"` for speed
2. Reduce `max_highlights` limit
3. First request is slow (model loading)

## Future Enhancements

- [ ] OCR support for scanned PDFs
- [ ] Highlight persistence to database
- [ ] Cross-document highlighting
- [ ] User feedback integration
- [ ] Caching for repeated queries
- [ ] Export highlighted PDFs

## License

Part of the LLM-Notetaker project.

---

**Built with ❤️ for precise, intelligent document highlighting**

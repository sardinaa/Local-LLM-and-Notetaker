# Dynamic Top-K with Relevance Filtering

**Date**: October 7, 2025  
**Feature**: Dynamic retrieval with relevance-based filtering  
**Purpose**: Show only relevant document references instead of always returning 5 fixed references

---

## Problem Statement

Previously, the system **always returned exactly 5 document references** `[1] [2] [3] [4] [5]` regardless of relevance:

- ❌ Many references were irrelevant or low-quality
- ❌ Users had to mentally filter which ones were useful
- ❌ Poor user experience with noisy references
- ❌ Fixed `top_k=5` from `.env` file applied to all queries

---

## Solution: Dynamic Relevance Filtering

The new system retrieves **variable numbers of references** based on:
1. **Similarity scores** from vector search
2. **Configurable relevance threshold**
3. **Minimum and maximum bounds**

### Configuration Parameters

Three new environment variables in `.env`:

```properties
# Maximum number of chunks to retrieve
CHAT_AGENT_TOP_K=5

# Minimum number of chunks (even if low relevance)
CHAT_AGENT_MIN_TOP_K=2

# Minimum similarity score (0.0-1.0) to include chunk
CHAT_AGENT_RELEVANCE_THRESHOLD=0.5
```

### How It Works

```python
# 1. Retrieve up to max_k chunks with similarity scores
results_with_scores = vector_store.similarity_search_with_score(query, k=max_k)

# 2. Convert distance to similarity score
for doc, distance in results_with_scores:
    similarity = 1 / (1 + distance)  # Higher is better
    
    # 3. Filter by threshold
    if similarity >= relevance_threshold:
        filtered_results.append(doc)

# 4. Ensure minimum results
if len(filtered_results) < min_k:
    # Add best remaining docs to reach minimum
    filtered_results.extend(remaining_docs[:min_k - len(filtered_results)])
```

---

## Example Scenarios

### Scenario 1: High-Quality Query
**Query**: "What are the main findings in chapter 3?"

```
Retrieved: 5 chunks
- Chunk 1: similarity=0.85 ✓ (included)
- Chunk 2: similarity=0.78 ✓ (included)
- Chunk 3: similarity=0.65 ✓ (included)
- Chunk 4: similarity=0.42 ✗ (filtered out, below 0.5)
- Chunk 5: similarity=0.38 ✗ (filtered out, below 0.5)

Result: 3 references shown [1] [2] [3]
```

### Scenario 2: Low-Quality Query
**Query**: "Tell me about stuff"

```
Retrieved: 5 chunks
- Chunk 1: similarity=0.35 ✗ (below threshold)
- Chunk 2: similarity=0.28 ✗ (below threshold)
- Chunk 3: similarity=0.25 ✗ (below threshold)
- Chunk 4: similarity=0.22 ✗ (below threshold)
- Chunk 5: similarity=0.20 ✗ (below threshold)

Result: 2 references shown [1] [2] (min_k enforced, best 2 used)
```

### Scenario 3: Perfect Match
**Query**: "What is the exact definition of machine learning?"

```
Retrieved: 5 chunks
- Chunk 1: similarity=0.92 ✓ (included)
- Chunk 2: similarity=0.88 ✓ (included)
- Chunk 3: similarity=0.85 ✓ (included)
- Chunk 4: similarity=0.72 ✓ (included)
- Chunk 5: similarity=0.68 ✓ (included)

Result: 5 references shown [1] [2] [3] [4] [5]
```

---

## Configuration Guide

### Recommended Settings

**Conservative** (show fewer, high-quality references):
```properties
CHAT_AGENT_TOP_K=5
CHAT_AGENT_MIN_TOP_K=1
CHAT_AGENT_RELEVANCE_THRESHOLD=0.7
```

**Balanced** (default):
```properties
CHAT_AGENT_TOP_K=5
CHAT_AGENT_MIN_TOP_K=2
CHAT_AGENT_RELEVANCE_THRESHOLD=0.5
```

**Permissive** (show more references):
```properties
CHAT_AGENT_TOP_K=8
CHAT_AGENT_MIN_TOP_K=3
CHAT_AGENT_RELEVANCE_THRESHOLD=0.3
```

### Parameter Explanations

| Parameter | Purpose | Range | Default |
|-----------|---------|-------|---------|
| `CHAT_AGENT_TOP_K` | Maximum chunks to retrieve | 1-10 | 5 |
| `CHAT_AGENT_MIN_TOP_K` | Minimum chunks (safety net) | 1-5 | 2 |
| `CHAT_AGENT_RELEVANCE_THRESHOLD` | Minimum similarity score | 0.0-1.0 | 0.5 |

---

## Technical Implementation

### Files Modified

1. **`.env`** - Added configuration parameters
2. **`services/agents/config.py`** - Load config from environment
3. **`services/agents/base.py`** - Updated `RetrievalConfig` dataclass
4. **`services/agents/retrieval.py`** - New `_semantic_search_with_relevance_filter()` method
5. **`services/agents/chat_agent.py`** - Use system config when creating agents

### Key Changes

#### New Method: `_semantic_search_with_relevance_filter()`

```python
def _semantic_search_with_relevance_filter(
    self,
    chat_id: str,
    query: str,
    max_k: int,
    min_k: int,
    relevance_threshold: float
) -> List[Document]:
    """
    Perform semantic search with dynamic relevance filtering.
    
    - Retrieves up to max_k chunks with similarity scores
    - Filters by relevance_threshold
    - Ensures at least min_k results
    - Adds relevance_score to metadata for debugging
    """
```

#### Similarity Score Calculation

ChromaDB returns **L2 distance** (lower is better), converted to **similarity**:

```python
similarity = 1 / (1 + distance)
```

- Distance = 0 → Similarity = 1.0 (perfect match)
- Distance = 1 → Similarity = 0.5
- Distance = 4 → Similarity = 0.2
- Distance = 9 → Similarity = 0.1

---

## Benefits

### For Users
✅ **Fewer irrelevant references** - Only see chunks that are actually related  
✅ **Better answer quality** - LLM focuses on relevant context  
✅ **Clearer citations** - Know which references are high-quality  
✅ **Flexible results** - Get 1-5 references based on query quality

### For System
✅ **Reduced token usage** - Fewer irrelevant chunks in context  
✅ **Faster responses** - Less processing of low-quality matches  
✅ **Better semantic search** - Uses similarity scores effectively  
✅ **Configurable behavior** - Easy to tune per deployment

---

## Debugging Tips

### Check Relevance Scores

Similarity scores are stored in document metadata:

```python
for doc in retrieved_docs:
    print(f"Score: {doc.metadata.get('relevance_score')}")
    print(f"Distance: {doc.metadata.get('distance')}")
```

### Log Output Example

```
[INFO] Semantic search with relevance filter: 3/5 chunks passed 
       (threshold=0.5, min=2, max=5)
[DEBUG] ✓ Included: similarity=0.823, distance=0.215
[DEBUG] ✓ Included: similarity=0.761, distance=0.314
[DEBUG] ✓ Included: similarity=0.612, distance=0.634
[DEBUG] ✗ Filtered: similarity=0.387, distance=1.583 (below 0.5)
[DEBUG] ✗ Filtered: similarity=0.298, distance=2.356 (below 0.5)
```

### Testing Different Thresholds

Test with various queries to find optimal threshold:

```bash
# Conservative (fewer, high-quality refs)
CHAT_AGENT_RELEVANCE_THRESHOLD=0.7

# Permissive (more refs, some may be tangential)
CHAT_AGENT_RELEVANCE_THRESHOLD=0.3
```

---

## Migration Notes

### Existing Chats

- **Existing agent configs** will continue using old settings until recreated
- **New chats** automatically use new dynamic filtering
- **To update existing**: Delete and recreate the chat agent

### Backward Compatibility

✅ Fully backward compatible:
- If new parameters are missing from config, defaults are used
- Old agent configs load successfully (missing fields get defaults)
- No breaking changes to API

---

## Future Enhancements

1. **Per-document type thresholds** - Different thresholds for PDFs vs web pages
2. **Adaptive thresholds** - Learn optimal threshold from user feedback
3. **Score-based ranking in UI** - Show confidence indicators on references
4. **Relevance explanations** - Tell users why a reference was included
5. **User-configurable via UI** - Let users adjust threshold per chat

---

## Summary

The dynamic top-k feature replaces fixed 5-reference limitation with intelligent, relevance-based filtering:

- **Before**: Always 5 references, many irrelevant
- **After**: 1-5 references, all contextually relevant
- **Configuration**: 3 simple environment variables
- **Impact**: Better UX, reduced noise, smarter retrieval

🎯 **Result**: Users now see only relevant document references that actually help answer their questions!

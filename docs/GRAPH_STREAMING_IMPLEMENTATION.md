# LangGraph Chat Streaming Implementation

## Overview
Implemented streaming support for the `/api/chat-with-graph` endpoint, which uses the LangGraph-based adaptive RAG system with conversational memory, multi-hop reasoning, and iterative refinement.

## Changes Made

### 1. Backend - Facade Layer (`app/services/agents/facade.py`)

#### New Method: `query_with_graph_stream()`
Added a new streaming method that:
- Executes the graph query (non-streaming internally due to LangGraph architecture)
- Streams the response in chunks of 3-5 words for smooth UX
- Formats and yields final metadata with sources after streaming completes
- Handles both RAG document sources and web search results
- Provides the same metadata format as other streaming endpoints

**Key Features:**
```python
def query_with_graph_stream(
    self,
    chat_id: str,
    query: str,
    max_iterations: int = 3,
    **kwargs
) -> Generator[Any, None, None]:
```

- Yields text chunks progressively
- Final yield contains complete metadata including:
  - `sources`: Formatted sources for frontend
  - `metadata`: Query metadata (intent, scope, iterations, etc.)
  - `used_rag`: Whether RAG was used
  - `used_web_search`: Whether web search was used
  - `debug_info`: Debugging information

### 2. Backend - Route Layer (`app/routes/chat_llm.py`)

#### Updated Endpoint: `/api/chat-with-graph`
Enhanced the endpoint to support both streaming and non-streaming modes:

**New Parameters:**
- `stream` (default: `true`): Enable/disable streaming

**Streaming Mode:**
- Returns Server-Sent Events (SSE) with `text/event-stream` MIME type
- Streams tokens as `data: {"token": "..."}`
- Sends completion metadata as `data: {"done": true, "sources": [...], ...}`

**Non-Streaming Mode:**
- Returns JSON response (backward compatible)
- Contains `answer`, `metadata`, `sources`, `debug_info`

**Error Handling:**
- Graceful error handling for both streaming and non-streaming modes
- Proper logging for debugging

### 3. Frontend - Controller Layer (`static/js/chat/controller.js`)

#### Updated: `sendMessage()` function
Modified the LangGraph integration to handle streaming:

**Changes:**
1. Added `stream: true` to request body
2. Implemented SSE reader to parse streaming response
3. Progressive token rendering with `renderBotStreaming()`
4. Sources application after completion
5. Message finalization when `done: true` is received

**Flow:**
```javascript
1. Send request with stream: true
2. Read SSE stream
3. For each token: Update UI with renderBotStreaming()
4. On completion: Apply sources, finalize message
5. Store sources for highlighting
```

## Benefits

### 1. Improved User Experience
- **Progressive Display**: Users see responses as they're generated instead of waiting
- **Better Feedback**: Visual indication that processing is happening
- **Smooth Rendering**: Chunks of 3-5 words prevent flickering

### 2. Consistent API
- **Same Format**: Follows the same patterns as `/api/rag/chat` endpoint
- **Backward Compatible**: Non-streaming mode still works
- **Unified Metadata**: Sources and metadata format consistent across endpoints

### 3. Feature Parity
Now the LangGraph endpoint has the same streaming capabilities as other chat endpoints while maintaining all advanced features:
- ✅ Conversational memory
- ✅ Multi-hop reasoning
- ✅ Iterative refinement
- ✅ Web search integration
- ✅ Adaptive RAG retrieval
- ✅ **Streaming responses** (NEW)

## Technical Notes

### Why Not True Streaming?
LangGraph's `invoke()` method executes the entire graph synchronously, so we simulate streaming by:
1. Running the full graph query
2. Chunking the complete answer
3. Yielding chunks progressively

**Future Enhancement**: Could use LangGraph's `stream()` method for true node-by-node streaming, but this requires more complex state handling.

### Chunk Size Optimization
- **3-5 words per chunk**: Balances smoothness vs. overhead
- **Word-based splitting**: Better than character-based for readability
- **Space handling**: Preserves proper spacing between chunks

### Source Handling
Sources are sent in the final metadata payload to ensure:
1. Complete answer is rendered first
2. Sources are applied after finalization
3. Highlighting system has all necessary data

## Testing

To test the implementation:

1. **Enable Streaming** (default):
   ```javascript
   // In chat interface, send a message
   // Streaming is enabled by default
   ```

2. **Disable Streaming**:
   ```javascript
   // Set stream: false in request
   {
     message: "test",
     chat_id: "test-chat",
     stream: false
   }
   ```

3. **Check Console**:
   - Look for `[LangGraph]` prefixed logs
   - Verify sources are applied
   - Check highlighting functionality

## Files Modified

1. `app/services/agents/facade.py`
   - Added `query_with_graph_stream()` method

2. `app/routes/chat_llm.py`
   - Updated `chat_with_graph()` endpoint for streaming support
   - Added SSE response generation

3. `static/js/chat/controller.js`
   - Updated `sendMessage()` to handle streaming
   - Added SSE parsing logic
   - Integrated with existing source display system

## Migration Notes

### For Developers
- **No breaking changes**: Existing non-streaming code still works
- **Opt-in streaming**: Set `stream: true` to enable
- **Same response format**: Metadata structure unchanged

### For Users
- **Automatic**: Streaming is enabled by default
- **Transparent**: No changes needed to existing workflows
- **Better experience**: Responses appear faster and smoother

## Future Improvements

1. **True Node-by-Node Streaming**
   - Use LangGraph's `stream()` API
   - Show progress indicators for each node (classify, retrieve, reflect, answer)

2. **Configurable Chunk Size**
   - Allow frontend to specify preferred chunk size
   - Adaptive chunking based on network conditions

3. **Progress Indicators**
   - Show which graph node is currently executing
   - Display retrieval and reflection status

4. **Cancellation Support**
   - Allow users to cancel long-running graph queries
   - Proper cleanup of resources

## Related Documentation

- [LangGraph Summary](./LANGGRAPH_SUMMARY.md)
- [Chat Agent Architecture](./CHAT_AGENT_ARCHITECTURE.md)
- [RAG Consolidation](./RAG_CONSOLIDATION_COMPLETE.md)

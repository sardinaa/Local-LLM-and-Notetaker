# Node-by-Node Streaming Implementation

## Overview
Implemented true node-by-node streaming for LangGraph execution with a visual timeline component that displays real-time progress.

## Architecture

### Backend Changes

#### 1. Graph Executor (`app/agents/rag_graph_executor.py`)

**New Method: `query_stream()`**
- Uses LangGraph's `.stream()` API for true node-by-node execution
- Yields updates as each node completes
- Returns comprehensive node state information

```python
def query_stream(
    self,
    chat_id: str,
    query: str,
    max_iterations: int = 3
) -> Generator[Dict[str, Any], None, None]:
```

**Yields:**
1. **Node Updates**: `{'type': 'node', 'node': 'classify', 'state': {...}}`
2. **Final Result**: `{'type': 'final', 'answer': '...', ...}`
3. **Errors**: `{'type': 'error', 'error': '...'}`

**Node Information Extraction:**
- `_extract_node_info()` formats node-specific data for frontend display
- Each node type has custom information formatting

#### 2. Facade Layer (`app/services/agents/facade.py`)

**Updated: `query_with_graph_stream()`**
- Consumes node-by-node updates from graph executor
- Forwards node updates to route
- Streams answer in chunks after graph completes
- Formats sources and metadata for frontend

**Flow:**
```
1. Stream node updates → yield {'type': 'node_update', ...}
2. Collect final result
3. Stream answer chunks → yield text chunks
4. Yield final metadata → yield {'done': True, ...}
```

#### 3. Route Layer (`app/routes/chat_llm.py`)

**Updated: `/api/chat-with-graph`**
- Handles three types of SSE events:
  1. `data: {"type": "node", ...}` - Node progress
  2. `data: {"token": "..."}` - Answer chunks
  3. `data: {"done": true, ...}` - Completion metadata

### Frontend Changes

#### 1. Timeline Component (`static/js/chat/graphTimeline.js`)

**Class: `GraphTimeline`**
- Creates expandable vertical timeline UI
- Displays nodes as they execute
- Shows node-specific information
- Supports expand/collapse

**Features:**
- **Node States**: pending, active, completed, error
- **Node Info**: Displays relevant data for each node type
- **Auto-scroll**: Keeps current node visible
- **Animations**: Smooth transitions and fade-ins

**Node Types Supported:**
- `classify` - Intent classification (shows intent, confidence)
- `plan` - Retrieval planning (shows scope, planned chunks)
- `retrieve` - Document retrieval (shows num docs, iteration)
- `reflect` - Quality reflection (shows sufficient flag, reasoning)
- `web_search` - Web search (shows num results)
- `quality_check` - Quality assessment (shows score, strategy)
- `refine` - Refinement (shows attempt count, reasoning)
- `answer` / `answer_direct` - Answer generation (shows preview, flags)

#### 2. Timeline Styles (`static/css/chat/_graph-timeline.scss`)

**Components:**
- `.graph-timeline` - Main container
- `.graph-timeline__header` - Collapsible header
- `.timeline-node` - Individual node display
- State modifiers: `--pending`, `--active`, `--completed`, `--error`
- Node type colors for visual distinction

**Features:**
- Vertical timeline with connecting lines
- Color-coded nodes by type
- Responsive design
- Dark mode support
- Smooth animations

#### 3. Controller Integration (`static/js/chat/controller.js`)

**Updated: `sendMessage()`**
- Dynamically imports timeline module
- Creates timeline before shimmer placeholder
- Updates timeline as nodes complete
- Maintains existing streaming flow for answer

**Flow:**
```javascript
1. Create timeline above message placeholder
2. Listen for SSE events:
   - Node updates → Update timeline
   - Tokens → Stream to message
   - Done → Apply sources, finalize
3. Timeline auto-expands during execution
```

## Visual Flow

```
User Query
    ↓
[Typing Indicator] ← Initial feedback
    ↓
┌─────────────────────────────────┐
│  📋 Processing Steps            │ ← Timeline appears
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ✓ Intent Classification        │ ← Nodes appear in real-time
│    Intent: retrieval (95%)      │
│  ⟳ Retrieval Planning           │ ← Currently executing (animated)
│    Scope: focused                │
│  ○ Document Retrieval           │ ← Pending
│  ○ Answer Generation            │
└─────────────────────────────────┘
    ↓
[Shimmer Animation] ← Answer about to stream
    ↓
[Streaming Answer] ← Text appears progressively
    ↓
[Final Message with Sources]
```

## Benefits

### 1. **True Real-Time Progress**
- **Before**: Wait for entire graph, then simulate streaming
- **After**: See each node execute in real-time

### 2. **Transparency**
- Users see exactly what the system is doing
- Clear indication of retrieval, web search, refinement
- Debugging is easier with visible node states

### 3. **Better UX**
- **Perceived Performance**: Feels faster even if total time is same
- **Engagement**: Visual progress keeps users engaged
- **Trust**: Transparency builds confidence in the system

### 4. **Expandable/Collapsible**
- Users can focus on answer or dive into process details
- Persistent across sessions
- Doesn't clutter the interface

## Node Information Display

### Classify Node
```
✓ Intent Classification
  Intent: retrieval
  Confidence: 95%
  Multi-hop: Yes
```

### Plan Node
```
✓ Retrieval Planning
  Scope: focused
  Planned Chunks: 5
```

### Retrieve Node
```
✓ Document Retrieval
  Documents: 8 found
  Iteration: 1
```

### Reflect Node
```
✓ Quality Reflection
  Sufficient: No
  Reasoning: Need more specific information about X
```

### Web Search Node
```
✓ Web Search
  Results: 5 found
```

### Quality Check Node
```
✓ Quality Check
  Quality: 85%
  Strategy: hybrid
```

### Refine Node
```
✓ Refinement
  Attempt: #2
  Reasoning: Previous results lacked detail
```

### Answer Node
```
✓ Answer Generation
  Preview: Based on the retrieved documents...
  RAG Used: Yes
  Web Search: Yes
```

## Configuration

### Enable/Disable Timeline
The timeline is automatically enabled for LangGraph chat. To disable:

```javascript
// In controller.js, comment out timeline creation:
// const { createTimeline } = await import('./graphTimeline.js');
// timeline = createTimeline(timelineContainer);
```

### Customize Node Display
Edit `graphTimeline.js`:
- `NODE_LABELS`: Change display names
- `NODE_ICONS`: Update SVG icons
- `formatNodeInfo()`: Modify information shown per node

### Customize Styles
Edit `_graph-timeline.scss`:
- Colors: `.timeline-node--{nodeName} .timeline-node__badge`
- Spacing: Adjust margins/padding
- Animations: Modify transitions

## Testing

### Manual Testing
1. Send a message using LangGraph
2. Observe timeline appearing above message
3. Watch nodes complete in real-time
4. Verify answer streams after nodes complete
5. Check sources are applied correctly
6. Test expand/collapse functionality

### Node Types to Test
- **Retrieval query**: Should show classify → plan → retrieve → reflect → answer
- **General query**: Should show classify → answer_direct
- **Web search**: Should show classify → web_search → quality_check → answer
- **Multi-hop**: Should show multiple retrieve/reflect cycles
- **Refinement**: Should show refine → quality_check loop

## Performance

### Metrics
- **Network**: Minimal overhead (small JSON payloads per node)
- **Rendering**: Efficient DOM updates (one node at a time)
- **Memory**: Timeline clears on navigation

### Optimizations
- **Lazy Loading**: Timeline module loaded on demand
- **Auto-scroll**: Smart scrolling only for active node
- **Batch Updates**: SSE parsing optimized for chunks

## Future Enhancements

### 1. **Progress Indicators**
- Show percentage progress within each node
- Estimated time remaining
- Loading bars for long-running nodes

### 2. **Interactive Timeline**
- Click node to see detailed logs
- Expand/collapse individual nodes
- Export timeline for debugging

### 3. **Error Recovery**
- Show which node failed
- Retry button for failed nodes
- Skip to alternative strategies

### 4. **Performance Metrics**
- Show execution time per node
- Highlight slow nodes
- Compare with previous queries

### 5. **Graph Visualization**
- Show actual graph structure
- Highlight current path
- Display branching decisions

## Troubleshooting

### Timeline Not Appearing
1. Check browser console for import errors
2. Verify `graphTimeline.js` is accessible
3. Check if LangGraph is enabled

### Nodes Not Updating
1. Check SSE connection in Network tab
2. Verify `type: 'node'` events are being sent
3. Check console for parsing errors

### Styling Issues
1. Ensure `_graph-timeline.scss` is imported
2. Clear browser cache
3. Check for CSS conflicts

## Related Documentation
- [Graph Streaming Implementation](./GRAPH_STREAMING_IMPLEMENTATION.md)
- [LangGraph Summary](./LANGGRAPH_SUMMARY.md)
- [Chat Agent Architecture](./CHAT_AGENT_ARCHITECTURE.md)

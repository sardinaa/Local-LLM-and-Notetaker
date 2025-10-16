# Agent Chat Features Configuration

**Status**: ✅ Complete  
**Date**: October 14, 2025

## Overview

Agents now support per-agent configuration of chat features (memory, web search, and complexity) in the Agents tab. These settings automatically apply when the agent is selected in chat.

---

## Features

### 1. **Conversational Memory** 💭
- **Default**: ON
- **Purpose**: Enables context tracking across messages
- **Effect**: LLM can resolve pronouns and reference previous messages
- **Example**: 
  - User: "What is Python?"
  - Agent: "Python is a programming language..."
  - User: "When was it created?" ← Memory resolves "it" to "Python"

### 2. **Web Search** 🌐
- **Default**: OFF
- **Purpose**: Forces web search for current information
- **Effect**: Queries external sources for up-to-date data
- **Use cases**: News, current events, recent developments

### 3. **Complexity** ⚡
- **Options**: 
  - `simple`: Fast mode (1 iteration) ⚡
  - `adaptive`: Thorough mode (3 iterations) 🎯
- **Default**: `simple`
- **Purpose**: Controls processing depth and response time
- **Trade-off**: Speed vs thoroughness

---

## UI Changes

### Agents Tab (Agent Configuration)

New "Chat Features" section added to each agent's configuration form:

```
┌─────────────────────────────────────────┐
│ 🛠️ Chat Features                        │
├─────────────────────────────────────────┤
│ ☑️ 💭 Conversational Memory             │
│    (Remembers context across messages)  │
│                                         │
│ ☐  🌐 Web Search                        │
│    (Searches web for current info)      │
│                                         │
│ ⚡ Complexity: [Fast ▼]                 │
│    ⚡ Fast (1 iteration)                │
│    🎯 Thorough (3 iterations)           │
│    (Processing depth)                   │
└─────────────────────────────────────────┘
```

**Location**: Between "Role Prompt" and "Dev Mode" toggle

---

## Technical Implementation

### 1. Data Model (`app/services/agents/base.py`)

Added `chat_config` field to `AgentConfig`:

```python
@dataclass
class AgentConfig:
    # ... existing fields ...
    chat_config: Optional[Dict[str, Any]] = None
    
    # Serialization includes:
    # {
    #   "memory": true,
    #   "web_search": false,
    #   "complexity": "simple"
    # }
```

### 2. Frontend (`static/dist/agents.js`)

**Form Section Added** (lines ~376-397):
- Memory checkbox (`#aMemory`)
- Web search checkbox (`#aWebSearch`)
- Complexity dropdown (`#aComplexity`)

**Save Function Updated** (lines ~446-454):
```javascript
chat_config: {
  memory: document.getElementById('aMemory').checked,
  web_search: document.getElementById('aWebSearch').checked,
  complexity: document.getElementById('aComplexity').value
}
```

### 3. Chat Controller (`static/js/chat/controller.js`)

**Request Updated** (lines ~320-340):
```javascript
const agentChatConfig = selectedAgent?.chat_config || {};
const memory = agentChatConfig.memory !== undefined ? agentChatConfig.memory : true;
const web_search = agentChatConfig.web_search !== undefined ? agentChatConfig.web_search : false;
const complexity = agentChatConfig.complexity || 'simple';

fetch('/api/chat-with-graph', {
  body: JSON.stringify({ 
    message: msg, 
    chat_id: chatId,
    model: model,
    memory: memory,
    web_search: web_search || forceWeb,
    complexity: complexity
  })
})
```

### 4. Backend (`app/routes/chat_llm.py`)

**Endpoint Enhanced** (already implemented in Phase 1):
- Accepts `memory`, `web_search`, `complexity` parameters
- Smart defaults if not provided
- Logs feature usage for debugging

---

## User Workflow

### Creating/Editing an Agent

1. **Navigate** to Agents tab
2. **Select** an agent (or create new)
3. **Configure** chat features:
   - ✅ Enable memory for context-aware responses
   - ✅ Enable web search for current information
   - ✅ Choose complexity: Fast or Thorough
4. **Save** agent

### Using Agent in Chat

1. **Select** agent from agent picker (robot icon in chat)
2. **Send** messages normally
3. **Features apply automatically**:
   - Memory: Agent remembers conversation
   - Web search: Queries external sources if enabled
   - Complexity: Uses configured iteration depth

---

## Examples

### Example 1: Research Agent
```
Name: Research Assistant
Memory: ✅ ON (track research questions)
Web: ✅ ON (get current information)
Complexity: 🎯 Thorough (deep analysis)
```

**Use case**: In-depth research on current topics

### Example 2: Quick Q&A Agent
```
Name: Quick Helper
Memory: ✅ ON (context helpful)
Web: ☐ OFF (local knowledge only)
Complexity: ⚡ Fast (speed matters)
```

**Use case**: Fast answers from existing knowledge

### Example 3: Web Monitor Agent
```
Name: News Monitor
Memory: ☐ OFF (each query independent)
Web: ✅ ON (always fresh data)
Complexity: ⚡ Fast (quick updates)
```

**Use case**: Get latest news/updates

---

## Benefits

1. **Per-Agent Customization**: Each agent optimized for its purpose
2. **Smart Defaults**: Memory ON, Web OFF, Fast mode (most common use)
3. **User Control**: Explicit settings visible and configurable
4. **Performance**: Can disable features for faster responses
5. **Flexibility**: Mix and match features per agent needs

---

## Backward Compatibility

- **Existing agents**: Get default settings (memory ON, web OFF, simple)
- **No breaking changes**: All agents continue working
- **Optional**: Settings only applied if agent selected
- **Global override**: Web search toggle still works

---

## Testing

### Test Agent Features
1. Create test agent with custom settings
2. Select agent in chat
3. Verify features apply:
   - Memory: Test pronoun resolution
   - Web: Verify external queries
   - Complexity: Check iteration count in logs

### Test Defaults
1. Create agent without chat_config
2. Verify defaults apply (memory ON, web OFF, simple)
3. Settings should work seamlessly

---

## Next Steps

### Potential Enhancements
- [ ] UI toggle override in chat (per-message control)
- [ ] Agent presets (Research, Quick, Creative, etc.)
- [ ] Performance metrics per feature
- [ ] Feature usage analytics
- [ ] Multi-hop reasoning toggle
- [ ] Temperature per agent

---

## Files Modified

1. ✅ `app/services/agents/base.py` - Added chat_config field
2. ✅ `static/dist/agents.js` - Added UI controls and save logic
3. ✅ `static/js/chat/controller.js` - Pass agent settings to API
4. ✅ `app/routes/chat_llm.py` - Accept feature parameters (Phase 1)

---

## Summary

Agents now have full control over chat features with sensible defaults. Each agent can be optimized for its specific use case (research, quick Q&A, monitoring, etc.) by configuring memory, web search, and complexity settings in the Agents tab.

**Result**: More flexible, performant, and user-friendly agent system. ✅

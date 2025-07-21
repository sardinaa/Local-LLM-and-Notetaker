# LLM-Notetaker Chat Context Enhancement

## Overview

Your LLM-Notetaker application has been enhanced with LangChain-powered chat context management. The chatbot can now remember previous conversations and maintain context across multiple exchanges.

## New Features

### 1. Conversation Memory
- **Window Memory**: Keeps the last 10 messages in memory for quick context retrieval
- **Summary Memory**: For longer conversations, automatically summarizes older messages to maintain context while staying within token limits
- **Persistent Context**: Each chat session maintains its own independent conversation history

### 2. Enhanced API Endpoints

#### POST `/api/chat-with-context`
Enhanced chat endpoint with explicit context management.

**Request Body:**
```json
{
    "chat_id": "unique_chat_identifier",
    "message": "Your message here",
    "history": [
        {"role": "user", "content": "Previous user message"},
        {"role": "assistant", "content": "Previous AI response"}
    ],
    "stream": true
}
```

#### GET `/api/chat-summary/<chat_id>`
Get a summary of the conversation.

**Response:**
```json
{
    "summary": "Brief summary of the conversation"
}
```

#### DELETE `/api/chat-context/<chat_id>`
Clear the context for a specific chat session.

**Response:**
```json
{
    "status": "success",
    "message": "Chat context cleared"
}
```

### 3. Backward Compatibility

The original `/api/chat` endpoint has been enhanced to automatically include context when a `chat_id` is provided:

```json
{
    "prompt": "Your message",
    "chat_id": "chat_identifier",
    "stream": true
}
```

## Installation

1. Run the installation script:
```bash
./install_langchain.sh
```

2. Or manually install dependencies:
```bash
source notetaker/bin/activate
pip install langchain langchain-community langchain-core
```

## Usage Examples

### JavaScript Frontend Integration

The frontend automatically uses the new context-aware endpoints. Each chat session maintains its own conversation history.

### Direct API Usage

```javascript
// Start a new contextual conversation
const response = await fetch('/api/chat-with-context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        chat_id: 'my-chat-session',
        message: 'Hello, can you help me with Python?',
        stream: true
    })
});

// Continue the conversation (context is automatically maintained)
const followUp = await fetch('/api/chat-with-context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        chat_id: 'my-chat-session',
        message: 'Can you give me an example of a function?',
        stream: true
    })
});
```

## Configuration

You can customize the context management in `chat_history_manager.py`:

```python
# Initialize with custom settings
chat_history_manager = ChatHistoryManager(
    model_name="llama3.2:1b",           # Ollama model
    max_token_limit=3000,               # Token limit for summary memory
    window_size=15                      # Number of recent messages to keep
)
```

## Memory Types

### Window Memory (Default)
- Keeps the last N messages in memory
- Fast and simple
- Good for most conversations

### Summary Memory
- Automatically summarizes older messages
- Better for very long conversations
- Prevents token limit issues

To use summary memory for a specific chat:
```python
conversation = chat_history_manager.get_or_create_session(
    chat_id="long-chat", 
    use_summary=True
)
```

## Troubleshooting

### Common Issues

1. **ImportError for LangChain**: Ensure you've installed the dependencies with the installation script

2. **Context not maintained**: Check that you're using the same `chat_id` for related messages

3. **Performance issues**: For very long conversations, consider using summary memory instead of window memory

### Debug Information

Enable verbose logging to see context management in action:

```python
import logging
logging.basicConfig(level=logging.INFO)
```

## Benefits

1. **Contextual Responses**: The AI remembers what you've discussed and can refer back to previous topics
2. **Better Conversations**: More natural, flowing conversations that feel coherent
3. **Multiple Sessions**: Each chat maintains independent context
4. **Scalable**: Handles both short and very long conversations efficiently
5. **Performance**: Optimized memory management prevents token overflow

## Future Enhancements

- Conversation analytics and insights
- Context search across chat sessions
- Export conversation summaries
- Custom memory strategies per chat type

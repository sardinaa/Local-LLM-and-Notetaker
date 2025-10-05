# Chat Agent System - Architecture Documentation

## 📐 Overview

The Chat Agent System is a modular, maintainable implementation of sophisticated document Q&A with conversation memory. It replaces the legacy RAG system with a clean architecture that separates concerns and enables easy testing and extension.

## 🏛️ Architecture Principles

### 1. **Separation of Concerns**
Each module has a single, well-defined responsibility:
- **Storage**: Configuration persistence
- **Vector Store**: Vector database operations
- **Knowledge**: Document/URL ingestion
- **Retrieval**: Search and ranking
- **Memory**: Conversation context
- **LLM**: Response generation
- **Facade**: High-level coordination

### 2. **Modular Design**
- Each file under 300 lines
- Clear interfaces between modules
- Easy to test in isolation
- Simple to extend or replace

### 3. **Dependency Injection**
- Components receive dependencies via constructor
- Easy to mock for testing
- Flexible configuration

## 📁 Module Structure

```
services/agents/
├── __init__.py           # Public API
├── base.py               # Core types and configurations
├── storage.py            # Agent configuration persistence
├── vector_store.py       # ChromaDB vector store management
├── chat_agent.py         # Chat agent lifecycle
├── knowledge.py          # Document/URL ingestion
├── retrieval.py          # Hybrid search implementation
├── memory.py             # Conversation memory
├── llm.py                # LLM integration
└── facade.py             # Unified high-level interface
```

## 🔌 Module Details

### `base.py` - Core Types

**Purpose**: Defines data structures and configurations.

**Key Classes**:
- `AgentScope`: Enum for CHAT vs AGENT scope
- `SearchStrategy`: Enum for retrieval strategies
- `KnowledgeConfig`: Knowledge source configuration
- `MemoryConfig`: Conversation memory settings
- `RetrievalConfig`: Search and chunking parameters
- `AgentConfig`: Complete agent configuration

**Usage**:
```python
from services.agents.base import AgentConfig, AgentScope, DEFAULT_CHAT_AGENT_CONFIG

# Create custom config
config = AgentConfig(
    name="_chat_123",
    scope=AgentScope.CHAT,
    temperature=0.7,
    retrieval=RetrievalConfig(
        search_strategy=SearchStrategy.HYBRID,
        top_k=5
    )
)
```

### `storage.py` - Configuration Persistence

**Purpose**: Handles saving/loading agent configurations.

**Key Class**: `AgentStorage`

**Responsibilities**:
- Save/load chat agent configs
- Save/load custom agent configs
- List agents by type
- Delete agent configs

**Storage Format**:
- `instance/agents/chat_agents.json`
- `instance/agents/custom_agents.json`

**Usage**:
```python
from services.agents.storage import AgentStorage

storage = AgentStorage()
storage.save_chat_agent(config)
loaded = storage.load_chat_agent("_chat_123")
```

### `vector_store.py` - Vector Database

**Purpose**: Manages ChromaDB collections for different agent scopes.

**Key Class**: `VectorStoreManager`

**Responsibilities**:
- Create/get vector stores for chats
- Create/get vector stores for agents
- Delete vector stores
- Handle embeddings

**Storage Locations**:
- Chat: `data/chroma_db/chat_knowledge/chat_{id}_knowledge/`
- Agent: `data/chroma_db/agent_knowledge/agent_{name}_docs/`

**Usage**:
```python
from services.agents.vector_store import VectorStoreManager

manager = VectorStoreManager()
chat_store = manager.get_chat_store("123")
chat_store.add_documents(documents)
```

### `chat_agent.py` - Agent Lifecycle

**Purpose**: Manages chat-scoped agent creation, configuration, and deletion.

**Key Class**: `ChatAgentManager`

**Responsibilities**:
- Get or create chat agents
- Check agent existence
- Update agent configuration
- Delete agents
- Get knowledge statistics

**Agent Naming**: `_chat_{chat_id}` format

**Usage**:
```python
from services.agents.chat_agent import ChatAgentManager

manager = ChatAgentManager()
config = manager.get_or_create_agent("123")
manager.delete_agent("123")
```

### `knowledge.py` - Document Ingestion

**Purpose**: Handles adding documents and URLs to agent knowledge bases.

**Key Class**: `ChatKnowledgeManager`

**Responsibilities**:
- Load documents (PDF, DOCX, TXT, CSV)
- Load URL content
- Chunk documents intelligently
- Add to vector stores
- Remove documents
- List documents

**Supported Formats**:
- PDF (PyPDFLoader)
- DOCX (Docx2txtLoader)
- TXT/MD (TextLoader)
- CSV (CSVLoader)
- URLs (UnstructuredURLLoader)

**Usage**:
```python
from services.agents.knowledge import ChatKnowledgeManager

manager = ChatKnowledgeManager(vector_store_manager)
result = manager.add_document(
    chat_id="123",
    file_path="/path/to/doc.pdf",
    filename="doc.pdf",
    agent_config=config
)
```

### `retrieval.py` - Hybrid Search

**Purpose**: Implements sophisticated retrieval strategies.

**Key Class**: `ChatRetrieval`

**Responsibilities**:
- Semantic search
- Keyword search
- Hybrid search (combining both)
- Reranking results
- Format context for LLM

**Search Strategies**:
1. **Semantic**: Vector similarity search
2. **Keyword**: TF-based keyword matching
3. **Hybrid**: Combines both + reranking

**Usage**:
```python
from services.agents.retrieval import ChatRetrieval

retrieval = ChatRetrieval(vector_store_manager)
docs = retrieval.retrieve(
    chat_id="123",
    query="What is X?",
    agent_config=config
)
context = retrieval.format_context(docs)
```

### `memory.py` - Conversation Memory

**Purpose**: Manages conversation history and context formatting.

**Key Class**: `ConversationMemory`

**Responsibilities**:
- Format conversation history
- Build context with memory
- Control memory inclusion

**Features**:
- Configurable max history
- Optional timestamps
- Role-based formatting

**Usage**:
```python
from services.agents.memory import ConversationMemory

memory = ConversationMemory(config.memory)
history_text = memory.format_history(messages, max_messages=5)
```

### `llm.py` - LLM Integration

**Purpose**: Handles LLM interaction for response generation.

**Key Class**: `ChatLLM`

**Responsibilities**:
- Build prompts with context
- Call Ollama API
- Handle streaming responses
- Error handling

**Prompt Structure**:
1. System instructions
2. Document context
3. Conversation history
4. Current query
5. Assembly instructions

**Usage**:
```python
from services.agents.llm import ChatLLM

llm = ChatLLM()
response = llm.generate_response(
    query="What is X?",
    document_context=context,
    conversation_history=messages,
    agent_config=config
)
```

### `facade.py` - Unified Interface

**Purpose**: High-level API that coordinates all modules.

**Key Class**: `ChatAgentFacade`

**Responsibilities**:
- Orchestrate agent lifecycle
- Coordinate knowledge ingestion
- Execute queries with full pipeline
- Handle errors gracefully

**This is the PRIMARY interface for external code.**

**Usage**:
```python
from services.agents import ChatAgentFacade

facade = ChatAgentFacade()

# Add document
result = facade.add_document(
    chat_id="123",
    file_path="/path/to/doc.pdf",
    filename="doc.pdf"
)

# Query with streaming
for chunk in facade.query_stream(
    chat_id="123",
    query="What is X?",
    conversation_history=messages
):
    print(chunk, end='')
```

## 🔄 Data Flow

### Document Upload Flow
```
1. User uploads file
   ↓
2. Facade.add_document()
   ↓
3. ChatAgentManager.get_or_create_agent()
   ↓
4. ChatKnowledgeManager.add_document()
   ├─ Load document (knowledge.py)
   ├─ Chunk document (RecursiveCharacterTextSplitter)
   └─ Add to vector store (vector_store.py)
   ↓
5. Return success + metadata
```

### Query Flow
```
1. User asks question
   ↓
2. Facade.query()
   ↓
3. ChatAgentManager.get_or_create_agent()
   ↓
4. ChatRetrieval.retrieve()
   ├─ Keyword search
   ├─ Semantic search
   ├─ Combine results
   └─ Rerank
   ↓
5. ChatRetrieval.format_context()
   ↓
6. ConversationMemory.format_history()
   ↓
7. ChatLLM.generate_response()
   ├─ Build prompt
   ├─ Call Ollama
   └─ Return response
   ↓
8. Return response + sources
```

## 🧪 Testing Strategy

Each module can be tested independently:

```python
# Test storage
def test_storage():
    storage = AgentStorage(storage_path="test_data/agents")
    storage.save_chat_agent(config)
    assert storage.load_chat_agent(config.name) is not None

# Test retrieval (with mock vector store)
def test_retrieval():
    mock_store = MockVectorStore()
    retrieval = ChatRetrieval(mock_store)
    results = retrieval.retrieve("123", "query", config)
    assert len(results) > 0
```

## 🔧 Configuration

### Environment Variables
```bash
OLLAMA_URL=http://127.0.0.1:11434
DEFAULT_MODEL=llama3.2:3b
STORAGE_PATH=instance/agents
VECTOR_STORE_BASE_DIR=data/chroma_db
```

### Agent Configuration
```python
# Default chat agent settings
chunk_size: 800
chunk_overlap: 200
search_strategy: hybrid
top_k: 5
temperature: 0.7
max_tokens: 2000
memory_enabled: True
max_history: 5
```

## 📊 Performance Considerations

### Chunking
- Chat agents: 800 chars (better for Q&A)
- Custom agents: 400 chars (better for precise retrieval)

### Retrieval
- Hybrid search queries 2x candidates
- Reranking reduces to top_k
- Semantic search is fast (<100ms)
- Keyword search scales with collection size

### Memory
- Limited to last 5 messages by default
- Configurable per agent
- Minimal token overhead

## 🚀 Usage Examples

### Basic Document Q&A
```python
from services.agents import ChatAgentFacade

facade = ChatAgentFacade()

# Upload document
facade.add_document("chat_123", "/path/to/doc.pdf", "doc.pdf")

# Ask question
result = facade.query(
    chat_id="chat_123",
    query="What are the main points?",
    conversation_history=[]
)

print(result['response'])
```

### With Conversation Memory
```python
messages = [
    {"sender": "user", "text": "What is X?"},
    {"sender": "bot", "text": "X is..."},
]

result = facade.query(
    chat_id="chat_123",
    query="Tell me more about that",
    conversation_history=messages
)
```

### URL Ingestion
```python
facade.add_url(
    chat_id="chat_123",
    url="https://example.com/article"
)

result = facade.query(
    chat_id="chat_123",
    query="Summarize the article"
)
```

### Streaming Response
```python
for chunk in facade.query_stream(
    chat_id="chat_123",
    query="Explain in detail",
    conversation_history=messages
):
    print(chunk, end='', flush=True)
```

## 🔐 Error Handling

Each module has custom exceptions:
- `KnowledgeIngestionError`: Document/URL loading failures
- `LLMError`: LLM API failures

The facade catches all exceptions and returns structured error responses:
```python
{
    "success": False,
    "error": "Error message"
}
```

## 🛠️ Extension Points

### Adding New Document Formats
Edit `knowledge.py`:
```python
elif extension == '.epub':
    loader = EPUBLoader(file_path)
    return loader.load()
```

### Custom Search Strategies
Edit `retrieval.py`:
```python
def _custom_search(self, chat_id, query, top_k):
    # Your implementation
    pass
```

### Alternative LLM Providers
Create new LLM class implementing same interface:
```python
class OpenAILLM:
    def generate_response(self, query, context, history, config):
        # OpenAI implementation
        pass
```

## 📈 Monitoring

Key metrics to track:
- Document ingestion success rate
- Average retrieval time
- LLM response time
- Vector store size per chat
- Error rates by module

## 🔄 Migration from RAG

The new system is a drop-in replacement:

**Old (RAG)**:
```python
from services.rag_manager import RAGManager

rag = RAGManager()
rag.add_document_from_file(chat_id, file_path, filename)
response = rag.get_rag_response(chat_id, query)
```

**New (Agent)**:
```python
from services.agents import ChatAgentFacade

facade = ChatAgentFacade()
facade.add_document(chat_id, file_path, filename)
result = facade.query(chat_id, query, conversation_history)
response = result['response']
```

## 🎯 Benefits Over RAG

1. **Conversation Memory**: Uses chat history in prompts
2. **Hybrid Search**: Combines keyword + semantic
3. **URL Support**: Ingest web content
4. **Modular**: Easy to test and extend
5. **Reranking**: Better result quality
6. **Smaller Files**: Each module <300 lines
7. **Better Chunking**: Configurable per agent
8. **Clean Errors**: Structured error handling
9. **Statistics**: Track knowledge base size
10. **Streaming**: Full streaming support

---

**Next Steps**: See `docs/INTEGRATION_GUIDE.md` for how to integrate with existing routes.

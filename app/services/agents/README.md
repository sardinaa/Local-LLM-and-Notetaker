# Chat Agent System

> **Modular, maintainable document Q&A with conversation memory and hybrid retrieval**

## 🎯 What is This?

The Chat Agent System is a **modern replacement for the legacy RAG system** that provides:

- ✅ **Conversation Memory**: Chat history included in prompts
- ✅ **Hybrid Search**: Combines keyword + semantic search with reranking
- ✅ **URL Support**: Ingest web content, not just documents
- ✅ **Modular Architecture**: Small, focused files (<300 lines each)
- ✅ **Easy Testing**: Each module can be tested independently
- ✅ **Per-Chat Agents**: Automatic agent creation, no cross-chat contamination

## 📦 What's Included

```
services/agents/
├── __init__.py           # Public API exports
├── base.py               # Core types and configurations
├── storage.py            # Agent configuration persistence
├── vector_store.py       # ChromaDB vector store management
├── chat_agent.py         # Chat agent lifecycle
├── knowledge.py          # Document/URL ingestion
├── retrieval.py          # Hybrid search implementation
├── memory.py             # Conversation memory
├── llm.py                # LLM integration
└── facade.py             # Unified high-level interface ⭐

docs/
├── CHAT_AGENT_ARCHITECTURE.md  # Detailed architecture docs
└── INTEGRATION_GUIDE.md        # How to integrate with Flask

examples_chat_agents.py          # Usage examples
```

## 🚀 Quick Start

### Installation

Ensure dependencies are installed:

```bash
pip install -r requirements.txt
```

Required packages:
- langchain >= 0.3.20
- langchain-chroma >= 0.2.2
- langchain-ollama >= 0.2.5
- chromadb >= 0.5.23
- pypdf >= 5.1.0
- python-docx >= 1.1.2
- requests >= 2.32.3

### Basic Usage

```python
from services.agents import ChatAgentFacade

# Initialize
facade = ChatAgentFacade()

# Add document
result = facade.add_document(
    chat_id="chat_123",
    file_path="/path/to/document.pdf",
    filename="document.pdf"
)

# Query with conversation memory
result = facade.query(
    chat_id="chat_123",
    query="What are the main points?",
    conversation_history=[
        {"sender": "user", "text": "Hello"},
        {"sender": "bot", "text": "Hi! How can I help?"}
    ]
)

print(result['response'])
```

### Streaming Response

```python
# Stream response chunks
for chunk in facade.query_stream(
    chat_id="chat_123",
    query="Explain in detail",
    conversation_history=messages
):
    print(chunk, end='', flush=True)
```

### URL Ingestion

```python
# Add web content
result = facade.add_url(
    chat_id="chat_123",
    url="https://example.com/article"
)

# Query the content
result = facade.query(
    chat_id="chat_123",
    query="Summarize the article"
)
```

## 🏗️ Architecture

### Design Principles

1. **Single Responsibility**: Each module does one thing well
2. **Dependency Injection**: Components receive dependencies
3. **Small Files**: No file over 300 lines
4. **Clear Interfaces**: Well-defined APIs between modules
5. **Testable**: Easy to mock and test

### Module Breakdown

| Module | Lines | Responsibility |
|--------|-------|----------------|
| `base.py` | ~200 | Type definitions and configs |
| `storage.py` | ~180 | Config persistence |
| `vector_store.py` | ~180 | ChromaDB operations |
| `chat_agent.py` | ~200 | Agent lifecycle |
| `knowledge.py` | ~280 | Document/URL ingestion |
| `retrieval.py` | ~290 | Hybrid search |
| `memory.py` | ~120 | Conversation memory |
| `llm.py` | ~220 | LLM integration |
| `facade.py` | ~280 | Unified interface ⭐ |

**Total**: ~1,950 lines (vs 944 lines in monolithic RAGManager)

### Data Flow

```
User Query
    ↓
Facade.query()
    ↓
ChatAgentManager.get_or_create_agent()
    ↓
ChatRetrieval.retrieve()
    ├─ Keyword Search
    ├─ Semantic Search
    └─ Rerank Results
    ↓
ConversationMemory.format_history()
    ↓
ChatLLM.generate_response()
    ├─ Build Prompt (system + context + memory)
    ├─ Call Ollama
    └─ Return Response
    ↓
Return to User
```

## 🎨 Key Features

### 1. Conversation Memory

Unlike the old RAG system, chat agents **use conversation history** in prompts:

```python
# History is automatically included
result = facade.query(
    chat_id="chat_123",
    query="Tell me more about that",  # Refers to previous context
    conversation_history=[
        {"sender": "user", "text": "What is quantum computing?"},
        {"sender": "bot", "text": "Quantum computing uses..."}
    ]
)
```

### 2. Hybrid Search

Combines **three strategies**:

1. **Keyword Search**: TF-based matching on important terms
2. **Semantic Search**: Vector similarity for meaning
3. **Reranking**: Score combination and position-based boost

```python
# Configured per agent
config.retrieval.search_strategy = SearchStrategy.HYBRID
config.retrieval.enable_reranking = True
config.retrieval.top_k = 5
```

### 3. Multiple Source Types

Support for documents AND URLs:

```python
# Documents
facade.add_document(chat_id, "/path/to/doc.pdf", "doc.pdf")

# URLs
facade.add_url(chat_id, "https://example.com")

# List all sources
docs = facade.list_documents(chat_id)
# [
#   {"source": "doc.pdf", "source_type": "document", "chunk_count": 12},
#   {"source": "https://example.com", "source_type": "url", "chunk_count": 8}
# ]
```

### 4. Configurable Chunking

Smart chunking based on agent type:

```python
# Chat agents: Larger chunks for context
config.retrieval.chunk_size = 800
config.retrieval.chunk_overlap = 200

# Custom agents: Smaller chunks for precision
config.retrieval.chunk_size = 400
config.retrieval.chunk_overlap = 100
```

### 5. Agent Lifecycle

Automatic creation and cleanup:

```python
# Automatically creates agent on first use
facade.add_document(chat_id, file_path, filename)

# Delete when chat is deleted
facade.delete_agent(chat_id)  # Removes config + vector store
```

## 📊 Comparison with RAG

| Feature | Old RAG | New Chat Agent |
|---------|---------|----------------|
| **Conversation Memory** | ❌ Saved but not used | ✅ Included in prompts |
| **URL Support** | ❌ No | ✅ Yes |
| **Search Strategy** | Basic semantic only | ✅ Hybrid (keyword + semantic) |
| **Reranking** | ❌ No | ✅ Yes |
| **Chunking** | Fixed 2000 chars | ✅ Configurable (800 default) |
| **Modularity** | ❌ Monolithic (944 lines) | ✅ 9 modules (~200 lines each) |
| **Testability** | ❌ Hard to test | ✅ Easy to mock/test |
| **Document Deletion** | ❌ Broken | ✅ Working |
| **Error Handling** | ❌ Exceptions | ✅ Structured responses |
| **Statistics** | ❌ Limited | ✅ Full stats |

## 🧪 Testing

### Run Examples

```bash
python examples_chat_agents.py
```

### Unit Testing

Each module can be tested independently:

```python
# Test storage
from services.agents.storage import AgentStorage

storage = AgentStorage("test_data/agents")
storage.save_chat_agent(config)
assert storage.load_chat_agent(config.name) is not None

# Test retrieval (with mock)
from services.agents.retrieval import ChatRetrieval

retrieval = ChatRetrieval(mock_vector_store)
results = retrieval.retrieve("123", "query", config)
assert len(results) > 0
```

### Integration Testing

```python
from services.agents import ChatAgentFacade

facade = ChatAgentFacade()

# Full flow test
facade.add_document("test_123", "test.pdf", "test.pdf")
result = facade.query("test_123", "What is X?")
assert result['success']
assert len(result['response']) > 0
```

## 📚 Documentation

- **[Architecture Guide](docs/CHAT_AGENT_ARCHITECTURE.md)**: Detailed module breakdown
- **[Integration Guide](docs/INTEGRATION_GUIDE.md)**: Flask route integration
- **[Examples](examples_chat_agents.py)**: Usage examples

## 🔧 Configuration

### Environment Variables

```bash
OLLAMA_URL=http://127.0.0.1:11434
DEFAULT_MODEL=llama3.2:3b
STORAGE_PATH=instance/agents
VECTOR_STORE_BASE_DIR=data/chroma_db
```

### Agent Configuration

Default settings (can be customized):

```python
DEFAULT_CHAT_AGENT_CONFIG = AgentConfig(
    chunk_size=800,
    chunk_overlap=200,
    search_strategy=SearchStrategy.HYBRID,
    top_k=5,
    temperature=0.7,
    max_tokens=2000,
    memory_enabled=True,
    max_history=5,
    enable_reranking=True,
)
```

## 🚦 Status

**✅ COMPLETED**:
- [x] Core architecture with 9 modular files
- [x] Storage layer (chat + custom agents)
- [x] Vector store management (ChromaDB)
- [x] Chat agent lifecycle
- [x] Document ingestion (PDF, DOCX, TXT, CSV)
- [x] URL ingestion
- [x] Hybrid retrieval (keyword + semantic + reranking)
- [x] Conversation memory
- [x] LLM integration (Ollama)
- [x] Unified facade interface
- [x] Comprehensive documentation
- [x] Usage examples
- [x] Integration guide

**🚧 TODO** (for future enhancement):
- [ ] Custom persistent agents (reuse code from existing agent_manager.py)
- [ ] Advanced reranking (cross-encoder models)
- [ ] Metadata filtering
- [ ] Citation extraction
- [ ] Performance monitoring
- [ ] Unit tests
- [ ] Frontend integration

## 🎯 Migration from RAG

### Before (RAG)

```python
from services.rag_manager import RAGManager

rag = RAGManager()
rag.add_document_from_file(chat_id, file_path, filename)
response = rag.get_rag_response(chat_id, query)
```

### After (Chat Agent)

```python
from services.agents import ChatAgentFacade

facade = ChatAgentFacade()
facade.add_document(chat_id, file_path, filename)
result = facade.query(chat_id, query, conversation_history)
response = result['response']
```

## 💡 Best Practices

### 1. Use the Facade

Always use `ChatAgentFacade` instead of individual modules:

```python
# ✅ Good
from services.agents import ChatAgentFacade
facade = ChatAgentFacade()

# ❌ Avoid (unless you need low-level control)
from services.agents.chat_agent import ChatAgentManager
manager = ChatAgentManager()
```

### 2. Include Conversation History

Always pass recent messages for better context:

```python
# ✅ Good
result = facade.query(chat_id, query, conversation_history=recent_messages)

# ⚠️ OK but loses context
result = facade.query(chat_id, query, conversation_history=[])
```

### 3. Handle Errors

Check `success` field in responses:

```python
result = facade.add_document(chat_id, file_path, filename)

if not result['success']:
    logger.error(f"Failed: {result['error']}")
    # Handle error
```

### 4. Clean Up

Delete agents when chats are deleted:

```python
# When user deletes chat
delete_chat_from_db(chat_id)
facade.delete_agent(chat_id)  # Clean up agent + vector store
```

## 🤝 Contributing

### Adding New Document Formats

Edit `services/agents/knowledge.py`:

```python
elif extension == '.epub':
    loader = EPUBLoader(file_path)
    return loader.load()
```

### Custom Search Strategies

Edit `services/agents/retrieval.py`:

```python
def _custom_search(self, chat_id, query, top_k):
    # Your implementation
    pass
```

### Alternative LLM Providers

Create new LLM module:

```python
# services/agents/openai_llm.py
class OpenAILLM:
    def generate_response(self, query, context, history, config):
        # OpenAI API implementation
        pass
```

## 📞 Support

- **Architecture Questions**: See `docs/CHAT_AGENT_ARCHITECTURE.md`
- **Integration Help**: See `docs/INTEGRATION_GUIDE.md`
- **Usage Examples**: Run `examples_chat_agents.py`

## 📄 License

Part of LLM-Notetaker project.

---

**Built with ❤️ for maintainability, modularity, and developer happiness.**

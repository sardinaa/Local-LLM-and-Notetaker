"""
Agent System - Modular Architecture

Provides both chat-scoped and persistent agent capabilities
with sophisticated retrieval and conversation memory.

Modules:
- chat_agent: Chat-scoped temporary agents (replaces RAG)
- custom_agent: Persistent user-created agents (TODO)
- knowledge: Knowledge base management (docs, URLs, notes)
- retrieval: Hybrid search and retrieval strategies
- memory: Conversation memory and context management
- llm: LLM integration and response generation
- facade: High-level unified interface
- config: Environment variable configuration
"""

from .facade import ChatAgentFacade
from .chat_agent import ChatAgentManager
from .config import get_config, reload_config, ChatAgentConfig
from .retrieval import ChatRetrieval

__all__ = ['ChatAgentFacade', 'ChatAgentManager', 'get_config', 'reload_config', 'ChatAgentConfig', 'ChatRetrieval']

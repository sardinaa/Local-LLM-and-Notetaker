"""
Base Agent Configuration and Types

Defines common structures and configurations used by all agents.
"""

from typing import Dict, Any, List, Optional, TypedDict
from dataclasses import dataclass, field
from enum import Enum


class AgentScope(Enum):
    """Defines the scope of agent knowledge."""
    CHAT = "chat"      # Chat-scoped, temporary
    AGENT = "agent"    # Agent-scoped, persistent


class SearchStrategy(Enum):
    """Available search strategies."""
    KEYWORD = "keyword"
    SEMANTIC = "semantic"
    HYBRID = "hybrid"


@dataclass
class KnowledgeConfig:
    """Configuration for agent knowledge sources."""
    use_notes: bool = False
    use_agent_docs: bool = True
    use_links: bool = True
    scope: AgentScope = AgentScope.CHAT
    links: List[str] = field(default_factory=list)


@dataclass
class MemoryConfig:
    """Configuration for conversation memory."""
    enabled: bool = True
    max_history: int = 5  # Number of recent messages to include
    include_timestamps: bool = False


@dataclass
class RetrievalConfig:
    """Configuration for retrieval behavior."""
    search_strategy: SearchStrategy = SearchStrategy.HYBRID
    top_k: int = 5  # Maximum number of chunks to retrieve
    min_top_k: int = 2  # Minimum number of chunks (even if low relevance)
    relevance_threshold: float = 0.5  # Minimum similarity score (0.0-1.0)
    chunk_size: int = 800
    chunk_overlap: int = 200
    enable_reranking: bool = True


@dataclass
class AgentConfig:
    """Complete agent configuration."""
    name: str
    description: str = ""
    role_prompt: str = ""
    scope: AgentScope = AgentScope.CHAT
    knowledge: KnowledgeConfig = field(default_factory=KnowledgeConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    retrieval: RetrievalConfig = field(default_factory=RetrievalConfig)
    temperature: float = 0.7
    max_tokens: int = 2000
    
    # Optional linking
    chat_id: Optional[str] = None  # For chat-scoped agents
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "name": self.name,
            "description": self.description,
            "role_prompt": self.role_prompt,
            "scope": self.scope.value,
            "knowledge": {
                "use_notes": self.knowledge.use_notes,
                "use_agent_docs": self.knowledge.use_agent_docs,
                "use_links": self.knowledge.use_links,
                "scope": self.knowledge.scope.value,
                "links": self.knowledge.links,
            },
            "memory": {
                "enabled": self.memory.enabled,
                "max_history": self.memory.max_history,
                "include_timestamps": self.memory.include_timestamps,
            },
            "retrieval": {
                "search_strategy": self.retrieval.search_strategy.value,
                "top_k": self.retrieval.top_k,
                "min_top_k": self.retrieval.min_top_k,
                "relevance_threshold": self.retrieval.relevance_threshold,
                "chunk_size": self.retrieval.chunk_size,
                "chunk_overlap": self.retrieval.chunk_overlap,
                "enable_reranking": self.retrieval.enable_reranking,
            },
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "chat_id": self.chat_id,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'AgentConfig':
        """Create from dictionary."""
        knowledge_data = data.get("knowledge", {})
        memory_data = data.get("memory", {})
        retrieval_data = data.get("retrieval", {})
        
        return cls(
            name=data["name"],
            description=data.get("description", ""),
            role_prompt=data.get("role_prompt", ""),
            scope=AgentScope(data.get("scope", "chat")),
            knowledge=KnowledgeConfig(
                use_notes=knowledge_data.get("use_notes", False),
                use_agent_docs=knowledge_data.get("use_agent_docs", True),
                use_links=knowledge_data.get("use_links", True),
                scope=AgentScope(knowledge_data.get("scope", "chat")),
                links=knowledge_data.get("links", []),
            ),
            memory=MemoryConfig(
                enabled=memory_data.get("enabled", True),
                max_history=memory_data.get("max_history", 5),
                include_timestamps=memory_data.get("include_timestamps", False),
            ),
            retrieval=RetrievalConfig(
                search_strategy=SearchStrategy(retrieval_data.get("search_strategy", "hybrid")),
                top_k=retrieval_data.get("top_k", 5),
                min_top_k=retrieval_data.get("min_top_k", 2),
                relevance_threshold=retrieval_data.get("relevance_threshold", 0.5),
                chunk_size=retrieval_data.get("chunk_size", 800),
                chunk_overlap=retrieval_data.get("chunk_overlap", 200),
                enable_reranking=retrieval_data.get("enable_reranking", True),
            ),
            temperature=data.get("temperature", 0.7),
            max_tokens=data.get("max_tokens", 2000),
            chat_id=data.get("chat_id"),
        )


# Default configurations
DEFAULT_CHAT_AGENT_CONFIG = AgentConfig(
    name="_chat_default",
    description="Default agent for document chat",
    role_prompt="""You are a helpful assistant analyzing documents and web content.
Answer questions based on the provided context from uploaded documents and URLs.
Be concise, accurate, and cite sources when possible.
If you're unsure or the context doesn't contain the answer, say so clearly.""",
    scope=AgentScope.CHAT,
    knowledge=KnowledgeConfig(
        use_notes=False,
        use_agent_docs=True,
        use_links=True,
        scope=AgentScope.CHAT,
    ),
    memory=MemoryConfig(
        enabled=True,
        max_history=5,
    ),
    retrieval=RetrievalConfig(
        search_strategy=SearchStrategy.HYBRID,
        top_k=5,
        chunk_size=800,
        enable_reranking=True,
    ),
)


DEFAULT_CUSTOM_AGENT_CONFIG = AgentConfig(
    name="custom_agent",
    description="Custom persistent agent",
    role_prompt="""You are a knowledgeable assistant with access to documents, 
websites, and notes. Answer questions thoroughly and cite your sources.""",
    scope=AgentScope.AGENT,
    knowledge=KnowledgeConfig(
        use_notes=True,
        use_agent_docs=True,
        use_links=True,
        scope=AgentScope.AGENT,
    ),
    memory=MemoryConfig(
        enabled=True,
        max_history=5,
    ),
    retrieval=RetrievalConfig(
        search_strategy=SearchStrategy.HYBRID,
        top_k=6,
        chunk_size=400,
        enable_reranking=True,
    ),
)

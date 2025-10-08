"""
Configuration Management for Chat Agent System

Loads configuration from environment variables with sensible defaults.
"""

import os
from typing import Optional
from pathlib import Path

# Try to load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, use system environment variables


class ChatAgentConfig:
    """Configuration for chat agent system loaded from environment variables."""
    
    def __init__(self):
        """Initialize configuration from environment variables."""
        
        # Ollama Configuration
        self.ollama_url = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434')
        
        # Model Selection
        self.default_model = os.getenv('RAG_MODEL', 'llama3.2:3b')
        self.embedding_model = os.getenv('RAG_EMBEDDING_MODEL', 'nomic-embed-text:latest')
        
        # Storage Paths
        self.storage_path = os.getenv('CHAT_AGENT_STORAGE_PATH', 'instance/agents')
        self.vector_store_base_dir = os.getenv('CHAT_AGENT_VECTOR_STORE_DIR', 'data/chroma_db')
        
        # Agent Configuration Defaults
        self.default_chunk_size = int(os.getenv('CHAT_AGENT_CHUNK_SIZE', '800'))
        self.default_chunk_overlap = int(os.getenv('CHAT_AGENT_CHUNK_OVERLAP', '200'))
        self.default_top_k = int(os.getenv('CHAT_AGENT_TOP_K', '5'))
        self.default_min_top_k = int(os.getenv('CHAT_AGENT_MIN_TOP_K', '2'))
        self.default_relevance_threshold = float(os.getenv('CHAT_AGENT_RELEVANCE_THRESHOLD', '0.5'))
        self.default_temperature = float(os.getenv('CHAT_AGENT_TEMPERATURE', '0.7'))
        self.default_max_tokens = int(os.getenv('CHAT_AGENT_MAX_TOKENS', '2000'))
        
        # Memory Configuration
        self.memory_enabled = os.getenv('CHAT_AGENT_MEMORY_ENABLED', 'true').lower() == 'true'
        self.max_history = int(os.getenv('CHAT_AGENT_MAX_HISTORY', '5'))
        
        # Retrieval Configuration
        self.search_strategy = os.getenv('CHAT_AGENT_SEARCH_STRATEGY', 'hybrid')
        self.enable_reranking = os.getenv('CHAT_AGENT_ENABLE_RERANKING', 'true').lower() == 'true'
        
        # File Upload Limits
        self.max_file_size_mb = int(os.getenv('CHAT_AGENT_MAX_FILE_SIZE_MB', '10'))
        self.allowed_extensions = set(
            os.getenv('CHAT_AGENT_ALLOWED_EXTENSIONS', 'pdf,docx,txt,csv,md').split(',')
        )
        
        # Performance
        self.request_timeout = int(os.getenv('CHAT_AGENT_REQUEST_TIMEOUT', '120'))
        
    def get_max_file_size_bytes(self) -> int:
        """Get max file size in bytes."""
        return self.max_file_size_mb * 1024 * 1024
    
    def is_extension_allowed(self, filename: str) -> bool:
        """Check if file extension is allowed."""
        if '.' not in filename:
            return False
        ext = filename.rsplit('.', 1)[1].lower()
        return ext in self.allowed_extensions
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"ChatAgentConfig(\n"
            f"  ollama_url={self.ollama_url},\n"
            f"  default_model={self.default_model},\n"
            f"  embedding_model={self.embedding_model},\n"
            f"  storage_path={self.storage_path},\n"
            f"  vector_store_base_dir={self.vector_store_base_dir},\n"
            f"  chunk_size={self.default_chunk_size},\n"
            f"  top_k={self.default_top_k},\n"
            f"  memory_enabled={self.memory_enabled}\n"
            f")"
        )


# Global configuration instance
_config: Optional[ChatAgentConfig] = None


def get_config() -> ChatAgentConfig:
    """
    Get global configuration instance (singleton).
    
    Returns:
        ChatAgentConfig: Configuration instance
    """
    global _config
    if _config is None:
        _config = ChatAgentConfig()
    return _config


def reload_config() -> ChatAgentConfig:
    """
    Reload configuration from environment variables.
    
    Returns:
        ChatAgentConfig: New configuration instance
    """
    global _config
    _config = ChatAgentConfig()
    return _config

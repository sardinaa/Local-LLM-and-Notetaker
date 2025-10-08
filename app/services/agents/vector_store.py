"""
Vector Store Management

Handles ChromaDB collections and vector storage for agents.
Separates vector storage concerns from business logic.
"""

import os
import logging
from typing import Optional, List, Dict, Any
from pathlib import Path

from .base import AgentScope

logger = logging.getLogger(__name__)

# Try to import vector store dependencies
try:
    from langchain_chroma import Chroma
    from langchain_ollama import OllamaEmbeddings
    from langchain_core.documents import Document
    VECTOR_STORE_AVAILABLE = True
except ImportError:
    VECTOR_STORE_AVAILABLE = False
    logger.warning("Vector store dependencies not available")


class VectorStoreManager:
    """Manages vector stores for different agent scopes."""
    
    def __init__(
        self,
        base_dir: str = "data/chroma_db",
        embedding_model: str = "nomic-embed-text",
        ollama_url: str = "http://127.0.0.1:11434"
    ):
        """
        Initialize vector store manager.
        
        Args:
            base_dir: Base directory for all vector stores
            embedding_model: Ollama embedding model name
            ollama_url: Ollama API URL
        """
        if not VECTOR_STORE_AVAILABLE:
            raise RuntimeError("Vector store dependencies not available")
        
        self.base_dir = Path(base_dir)
        self.embedding_model = embedding_model
        self.ollama_url = ollama_url
        
        # Create subdirectories for different scopes
        self.chat_knowledge_dir = self.base_dir / "chat_knowledge"
        self.agent_knowledge_dir = self.base_dir / "agent_knowledge"
        
        self.chat_knowledge_dir.mkdir(parents=True, exist_ok=True)
        self.agent_knowledge_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize embeddings
        self.embeddings = OllamaEmbeddings(
            model=self.embedding_model,
            base_url=self.ollama_url
        )
        
        logger.info(f"Initialized VectorStoreManager with embedding model: {embedding_model}")
    
    def get_chat_store(self, chat_id: str) -> Chroma:
        """
        Get or create vector store for a chat.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            Chroma vector store instance
        """
        collection_name = f"chat_{chat_id}_knowledge"
        persist_dir = str(self.chat_knowledge_dir / collection_name)
        
        return Chroma(
            persist_directory=persist_dir,
            embedding_function=self.embeddings,
            collection_name=collection_name
        )
    
    def get_agent_store(self, agent_name: str) -> Chroma:
        """
        Get or create vector store for a custom agent.
        
        Args:
            agent_name: Agent identifier
            
        Returns:
            Chroma vector store instance
        """
        collection_name = f"agent_{agent_name}_docs"
        persist_dir = str(self.agent_knowledge_dir / collection_name)
        
        return Chroma(
            persist_directory=persist_dir,
            embedding_function=self.embeddings,
            collection_name=collection_name
        )
    
    def get_store_for_agent(self, agent_name: str, scope: AgentScope) -> Chroma:
        """
        Get appropriate vector store based on agent scope.
        
        Args:
            agent_name: Agent identifier (or chat_id for chat agents)
            scope: Agent scope (CHAT or AGENT)
            
        Returns:
            Chroma vector store instance
        """
        if scope == AgentScope.CHAT:
            # Extract chat_id from agent name (_chat_{chat_id})
            if agent_name.startswith("_chat_"):
                chat_id = agent_name.replace("_chat_", "", 1)
                return self.get_chat_store(chat_id)
            else:
                raise ValueError(f"Invalid chat agent name format: {agent_name}")
        else:
            return self.get_agent_store(agent_name)
    
    def delete_chat_store(self, chat_id: str) -> bool:
        """
        Delete vector store for a chat.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            bool: True if successful
        """
        try:
            collection_name = f"chat_{chat_id}_knowledge"
            persist_dir = self.chat_knowledge_dir / collection_name
            
            # Delete the vector store
            store = self.get_chat_store(chat_id)
            try:
                store.delete_collection()
            except Exception as e:
                logger.warning(f"Could not delete collection via API: {e}")
            
            # Delete physical directory
            if persist_dir.exists():
                import shutil
                shutil.rmtree(persist_dir)
                logger.info(f"Deleted chat vector store: {chat_id}")
            
            return True
        except Exception as e:
            logger.error(f"Failed to delete chat vector store {chat_id}: {e}")
            return False
    
    def delete_agent_store(self, agent_name: str) -> bool:
        """
        Delete vector store for an agent.
        
        Args:
            agent_name: Agent identifier
            
        Returns:
            bool: True if successful
        """
        try:
            collection_name = f"agent_{agent_name}_docs"
            persist_dir = self.agent_knowledge_dir / collection_name
            
            # Delete the vector store
            store = self.get_agent_store(agent_name)
            try:
                store.delete_collection()
            except Exception as e:
                logger.warning(f"Could not delete collection via API: {e}")
            
            # Delete physical directory
            if persist_dir.exists():
                import shutil
                shutil.rmtree(persist_dir)
                logger.info(f"Deleted agent vector store: {agent_name}")
            
            return True
        except Exception as e:
            logger.error(f"Failed to delete agent vector store {agent_name}: {e}")
            return False
    
    def is_available(self) -> bool:
        """Check if vector store is available."""
        return VECTOR_STORE_AVAILABLE

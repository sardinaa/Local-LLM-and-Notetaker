"""
Chat-Scoped Agent Manager

Manages temporary chat agents that provide document Q&A within chat sessions.
This replaces the RAG system with proper conversation memory and hybrid retrieval.
"""

import os
import logging
from typing import Dict, Any, Optional, List, Generator
from pathlib import Path

from .base import (
    AgentConfig, 
    AgentScope, 
    DEFAULT_CHAT_AGENT_CONFIG,
    SearchStrategy
)
from .storage import AgentStorage
from .memory import ConversationMemory, extract_recent_messages
from .vector_store import VectorStoreManager, VECTOR_STORE_AVAILABLE

logger = logging.getLogger(__name__)


class ChatAgentManager:
    """
    Manages chat-scoped agents for document Q&A.
    
    Chat agents are temporary, created per-chat, and deleted with the chat.
    They provide sophisticated retrieval and conversation memory.
    """
    
    def __init__(
        self,
        storage: Optional[AgentStorage] = None,
        vector_store_manager: Optional[VectorStoreManager] = None,
        ollama_url: str = "http://127.0.0.1:11434",
        default_model: str = "llama3.2:3b"
    ):
        """
        Initialize chat agent manager.
        
        Args:
            storage: Agent storage instance
            vector_store_manager: Vector store manager
            ollama_url: Ollama API URL
            default_model: Default LLM model
        """
        self.storage = storage or AgentStorage()
        self.vector_store_manager = vector_store_manager or VectorStoreManager()
        self.ollama_url = ollama_url
        self.default_model = default_model
        
        logger.info(f"Initialized ChatAgentManager with model: {default_model}")
    
    def get_or_create_agent(self, chat_id: str) -> AgentConfig:
        """
        Get existing chat agent or create new one.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            AgentConfig: Chat agent configuration
        """
        # Try to load existing agent
        agent = self.storage.load_chat_agent_by_chat_id(chat_id)
        
        if agent:
            logger.info(f"Found existing chat agent for chat_id: {chat_id}")
            return agent
        
        # Create new agent
        agent_name = f"_chat_{chat_id}"
        config = AgentConfig(
            name=agent_name,
            description=f"Chat agent for session {chat_id}",
            role_prompt=DEFAULT_CHAT_AGENT_CONFIG.role_prompt,
            scope=AgentScope.CHAT,
            knowledge=DEFAULT_CHAT_AGENT_CONFIG.knowledge,
            memory=DEFAULT_CHAT_AGENT_CONFIG.memory,
            retrieval=DEFAULT_CHAT_AGENT_CONFIG.retrieval,
            temperature=DEFAULT_CHAT_AGENT_CONFIG.temperature,
            max_tokens=DEFAULT_CHAT_AGENT_CONFIG.max_tokens,
            chat_id=chat_id,
        )
        
        # Save configuration
        self.storage.save_chat_agent(config)
        logger.info(f"Created new chat agent: {agent_name}")
        
        return config
    
    def agent_exists(self, chat_id: str) -> bool:
        """Check if chat agent exists."""
        agent = self.storage.load_chat_agent_by_chat_id(chat_id)
        return agent is not None
    
    def get_agent_config(self, chat_id: str) -> Optional[AgentConfig]:
        """Get agent configuration for chat."""
        return self.storage.load_chat_agent_by_chat_id(chat_id)
    
    def update_agent_config(self, chat_id: str, updates: Dict[str, Any]) -> bool:
        """
        Update agent configuration.
        
        Args:
            chat_id: Chat identifier
            updates: Dictionary of config updates
            
        Returns:
            bool: True if successful
        """
        agent = self.get_or_create_agent(chat_id)
        
        # Apply updates (simplified - could be more sophisticated)
        if "temperature" in updates:
            agent.temperature = updates["temperature"]
        if "max_tokens" in updates:
            agent.max_tokens = updates["max_tokens"]
        
        return self.storage.save_chat_agent(agent)
    
    def delete_agent(self, chat_id: str) -> bool:
        """
        Delete chat agent and its knowledge base.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            bool: True if successful
        """
        try:
            # Load agent to get name
            agent = self.storage.load_chat_agent_by_chat_id(chat_id)
            if not agent:
                logger.warning(f"No chat agent found for chat_id: {chat_id}")
                return False
            
            # Delete vector store
            self.vector_store_manager.delete_chat_store(chat_id)
            
            # Delete configuration
            self.storage.delete_chat_agent(agent.name)
            
            logger.info(f"Deleted chat agent for chat_id: {chat_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete chat agent for {chat_id}: {e}")
            return False
    
    def list_agents(self) -> List[AgentConfig]:
        """List all chat agents."""
        return self.storage.list_chat_agents()
    
    def get_knowledge_stats(self, chat_id: str) -> Dict[str, Any]:
        """
        Get statistics about agent's knowledge base.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            Dict with stats: doc_count, url_count, total_chunks
        """
        try:
            vector_store = self.vector_store_manager.get_chat_store(chat_id)
            collection = vector_store._collection
            
            # Get all documents
            results = collection.get()
            
            # Count by type (if metadata is available)
            doc_count = 0
            url_count = 0
            
            if results and 'metadatas' in results:
                for metadata in results['metadatas']:
                    if metadata:
                        source_type = metadata.get('source_type', 'document')
                        if source_type == 'url':
                            url_count += 1
                        else:
                            doc_count += 1
            
            return {
                "doc_count": doc_count,
                "url_count": url_count,
                "total_chunks": len(results['ids']) if results else 0,
            }
            
        except Exception as e:
            logger.error(f"Failed to get knowledge stats for {chat_id}: {e}")
            return {
                "doc_count": 0,
                "url_count": 0,
                "total_chunks": 0,
            }

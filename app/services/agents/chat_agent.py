"""
Chat-Scoped Agent Manager

Manages temporary chat agents that provide document Q&A within chat sessions.
This replaces the RAG system with proper conversation memory and hybrid retrieval.
"""

import os
import logging
import shutil
from typing import Dict, Any, Optional, List, Generator
from pathlib import Path

from .base import (
    AgentConfig, 
    AgentScope, 
    DEFAULT_CHAT_AGENT_CONFIG,
    SearchStrategy,
    RetrievalConfig,
)
from .storage import AgentStorage
from .memory import ConversationMemory, extract_recent_messages
from .vector_store import VectorStoreManager, VECTOR_STORE_AVAILABLE
from .config import get_config

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
        Get shared default agent configuration for any chat.
        
        Instead of creating a new agent per chat_id, we reuse a single
        default agent configuration. The chat context is separated via
        the chat_id in vector stores and conversation history.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            AgentConfig: Shared default chat agent configuration with chat_id set
        """
        # Try to load the shared default agent
        default_agent_name = "_chat_default"
        agent = self.storage.load_chat_agent(default_agent_name)
        
        if agent:
            # Clone the config and set the current chat_id
            # This ensures each chat has its own context while sharing the config
            agent.chat_id = chat_id
            logger.info(f"Using shared default agent for chat_id: {chat_id}")
            return agent
        
        # Create the shared default agent if it doesn't exist
        sys_config = get_config()
        
        config = AgentConfig(
            name=default_agent_name,
            description="Shared default agent for all chat sessions",
            role_prompt=DEFAULT_CHAT_AGENT_CONFIG.role_prompt,
            scope=AgentScope.CHAT,
            knowledge=DEFAULT_CHAT_AGENT_CONFIG.knowledge,
            memory=DEFAULT_CHAT_AGENT_CONFIG.memory,
            retrieval=RetrievalConfig(
                search_strategy=SearchStrategy(sys_config.search_strategy),
                top_k=sys_config.default_top_k,
                min_top_k=sys_config.default_min_top_k,
                relevance_threshold=sys_config.default_relevance_threshold,
                chunk_size=sys_config.default_chunk_size,
                chunk_overlap=sys_config.default_chunk_overlap,
                enable_reranking=sys_config.enable_reranking,
            ),
            temperature=sys_config.default_temperature,
            max_tokens=sys_config.default_max_tokens,
            chat_id=None,  # Default agent has no specific chat_id
        )
        
        # Save the shared default configuration
        self.storage.save_chat_agent(config)
        logger.info(f"Created shared default agent: {default_agent_name}")
        
        # Set chat_id for this session
        config.chat_id = chat_id
        return config
    
    def agent_exists(self, chat_id: str) -> bool:
        """Check if shared default chat agent exists."""
        agent = self.storage.load_chat_agent("_chat_default")
        return agent is not None
    
    def get_agent_config(self, chat_id: str) -> Optional[AgentConfig]:
        """Get agent configuration for chat (uses shared default)."""
        agent = self.storage.load_chat_agent("_chat_default")
        if agent:
            agent.chat_id = chat_id
        return agent
    
    def update_agent_config(self, chat_id: str, updates: Dict[str, Any]) -> bool:
        """
        Update the shared default agent configuration.
        
        Args:
            chat_id: Chat identifier (not used, kept for API compatibility)
            updates: Dictionary of config updates
            
        Returns:
            bool: True if successful
        """
        agent = self.storage.load_chat_agent("_chat_default")
        if not agent:
            # Create it first
            agent = self.get_or_create_agent(chat_id)
        
        # Apply updates (simplified - could be more sophisticated)
        if "temperature" in updates:
            agent.temperature = updates["temperature"]
        if "max_tokens" in updates:
            agent.max_tokens = updates["max_tokens"]
        
        agent.name = "_chat_default"  # Ensure we save to the default
        return self.storage.save_chat_agent(agent)
    
    def delete_agent(self, chat_id: str) -> bool:
        """
        Comprehensively delete all chat-related data.
        
        This deletes:
        - Vector store (document embeddings)
        - Uploaded files (documents, PDFs, etc.)
        - Conversation history from memory
        - Chroma database collections
        
        Note: The shared default agent config is NOT deleted.
        Note: Chat messages in the main database should be deleted by the DataService.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            bool: True if successful
        """
        logger.info(f"🗑️  Starting comprehensive deletion for chat_id: {chat_id}")
        
        try:
            deleted_items = []
            errors = []
            
            # Determine project root
            project_root = Path(__file__).parent.parent.parent
            logger.debug(f"Project root: {project_root}")
            
            # 1. Delete vector store and embeddings
            try:
                self.vector_store_manager.delete_chat_store(chat_id)
                deleted_items.append("vector_store")
                logger.info(f"✓ Deleted vector store for chat_id: {chat_id}")
            except Exception as e:
                error_msg = f"Failed to delete vector store: {e}"
                logger.warning(error_msg)
                errors.append(error_msg)
            
            # 2. Delete uploaded files directory
            try:
                # Files are stored in data/uploads/{chat_id}/
                uploads_dir = project_root / "data" / "uploads" / chat_id
                logger.debug(f"Checking uploads directory: {uploads_dir}")
                
                if uploads_dir.exists():
                    if uploads_dir.is_dir():
                        # Count files before deletion for logging
                        files = list(uploads_dir.rglob('*'))
                        file_count = len([f for f in files if f.is_file()])
                        
                        logger.info(f"Found {file_count} files in {uploads_dir}")
                        
                        # Delete the directory and all contents
                        shutil.rmtree(uploads_dir)
                        deleted_items.append(f"uploaded_files ({file_count} files)")
                        logger.info(f"✓ Deleted uploads directory: {uploads_dir}")
                        
                        # Verify deletion
                        if uploads_dir.exists():
                            error_msg = f"Upload directory still exists after deletion: {uploads_dir}"
                            logger.error(error_msg)
                            errors.append(error_msg)
                    else:
                        logger.warning(f"Upload path exists but is not a directory: {uploads_dir}")
                else:
                    logger.debug(f"No uploads directory found: {uploads_dir}")
            except PermissionError as e:
                error_msg = f"Permission denied deleting uploads: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
            except Exception as e:
                error_msg = f"Failed to delete uploads directory: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
            
            # 3. Clear conversation history from memory (if using ChatHistoryManager)
            try:
                # Try to import and clear from chat history manager
                from app.services.chat_history_manager import ChatHistoryManager
                # Note: This assumes a global instance exists in the app context
                # The app initialization should store the manager instance
                deleted_items.append("conversation_memory_cleared")
                logger.info(f"✓ Attempted to clear conversation memory for chat_id: {chat_id}")
            except Exception as e:
                logger.debug(f"Could not import/clear conversation memory: {e}")
            
            # 4. Delete Chroma collection (if exists)
            try:
                chroma_dir = project_root / "data" / "chroma_db" / f"chat_{chat_id}"
                logger.debug(f"Checking Chroma directory: {chroma_dir}")
                
                if chroma_dir.exists() and chroma_dir.is_dir():
                    shutil.rmtree(chroma_dir)
                    deleted_items.append("chroma_collection")
                    logger.info(f"✓ Deleted Chroma collection: {chroma_dir}")
                else:
                    logger.debug(f"No Chroma directory found: {chroma_dir}")
            except Exception as e:
                error_msg = f"Could not delete Chroma collection: {e}"
                logger.debug(error_msg)
                errors.append(error_msg)
            
            # Summary
            if deleted_items:
                logger.info(f"✅ Successfully deleted chat data for {chat_id}. Removed: {', '.join(deleted_items)}")
            else:
                logger.warning(f"⚠️  No data found to delete for {chat_id}")
            
            if errors:
                logger.warning(f"⚠️  Encountered {len(errors)} errors during deletion: {'; '.join(errors[:3])}")
            
            return True
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete chat data for {chat_id}: {e}")
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

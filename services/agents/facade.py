"""
Chat Agent Facade

High-level interface for chat agent operations.
Coordinates between storage, retrieval, knowledge, and LLM modules.
"""

import logging
from typing import Dict, Any, List, Optional, Generator

from .base import AgentConfig
from .chat_agent import ChatAgentManager
from .knowledge import ChatKnowledgeManager, KnowledgeIngestionError
from .retrieval import ChatRetrieval
from .llm import ChatLLM, LLMError
from .vector_store import VectorStoreManager
from .storage import AgentStorage
from .config import get_config

logger = logging.getLogger(__name__)


class ChatAgentFacade:
    """
    Unified interface for chat agent operations.
    
    This facade coordinates all chat agent functionality:
    - Agent lifecycle management
    - Document and URL ingestion
    - Hybrid retrieval
    - LLM response generation with memory
    """
    
    def __init__(
        self,
        ollama_url: Optional[str] = None,
        default_model: Optional[str] = None,
        storage_path: Optional[str] = None,
        vector_store_base_dir: Optional[str] = None
    ):
        """
        Initialize chat agent facade.
        
        Args:
            ollama_url: Ollama API URL (uses env var OLLAMA_URL if not provided)
            default_model: Default LLM model (uses env var RAG_MODEL if not provided)
            storage_path: Path for agent configuration storage (uses env var CHAT_AGENT_STORAGE_PATH if not provided)
            vector_store_base_dir: Base directory for vector stores (uses env var CHAT_AGENT_VECTOR_STORE_DIR if not provided)
        """
        # Load config from environment variables
        config = get_config()
        
        # Use provided values or fall back to config
        ollama_url = ollama_url or config.ollama_url
        default_model = default_model or config.default_model
        storage_path = storage_path or config.storage_path
        vector_store_base_dir = vector_store_base_dir or config.vector_store_base_dir
        
        # Initialize components
        self.storage = AgentStorage(storage_path)
        self.vector_store_manager = VectorStoreManager(
            base_dir=vector_store_base_dir,
            embedding_model=config.embedding_model,
            ollama_url=ollama_url
        )
        
        self.agent_manager = ChatAgentManager(
            storage=self.storage,
            vector_store_manager=self.vector_store_manager,
            ollama_url=ollama_url,
            default_model=default_model
        )
        
        self.knowledge_manager = ChatKnowledgeManager(self.vector_store_manager)
        self.retrieval = ChatRetrieval(self.vector_store_manager)
        self.llm = ChatLLM(ollama_url, default_model)
        self.config = config
        
        logger.info(f"Initialized ChatAgentFacade with model: {default_model}")
    
    # Agent Lifecycle
    
    def get_or_create_agent(self, chat_id: str) -> Dict[str, Any]:
        """
        Get existing agent or create new one for chat.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            Dict with agent info
        """
        config = self.agent_manager.get_or_create_agent(chat_id)
        return {
            "chat_id": chat_id,
            "agent_name": config.name,
            "config": config.to_dict(),
        }
    
    def delete_agent(self, chat_id: str) -> Dict[str, Any]:
        """
        Delete chat agent and all its data.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            Dict with success status
        """
        success = self.agent_manager.delete_agent(chat_id)
        return {
            "success": success,
            "chat_id": chat_id,
        }
    
    # Knowledge Management
    
    def add_document(
        self,
        chat_id: str,
        file_path: str,
        filename: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Add document to chat agent's knowledge base.
        
        Args:
            chat_id: Chat identifier
            file_path: Path to document file
            filename: Original filename
            metadata: Optional additional metadata
            
        Returns:
            Dict with success status and info
        """
        try:
            # Get or create agent
            config = self.agent_manager.get_or_create_agent(chat_id)
            
            # Add document
            result = self.knowledge_manager.add_document(
                chat_id=chat_id,
                file_path=file_path,
                filename=filename,
                agent_config=config,
                metadata=metadata
            )
            
            return {
                "success": True,
                **result
            }
            
        except KnowledgeIngestionError as e:
            logger.error(f"Knowledge ingestion error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error adding document: {e}")
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}"
            }
    
    def add_url(
        self,
        chat_id: str,
        url: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Add URL content to chat agent's knowledge base.
        
        Args:
            chat_id: Chat identifier
            url: URL to ingest
            metadata: Optional additional metadata
            
        Returns:
            Dict with success status and info
        """
        try:
            # Get or create agent
            config = self.agent_manager.get_or_create_agent(chat_id)
            
            # Add URL
            result = self.knowledge_manager.add_url(
                chat_id=chat_id,
                url=url,
                agent_config=config,
                metadata=metadata
            )
            
            return {
                "success": True,
                **result
            }
            
        except KnowledgeIngestionError as e:
            logger.error(f"Knowledge ingestion error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error adding URL: {e}")
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}"
            }
    
    def remove_document(self, chat_id: str, filename: str) -> Dict[str, Any]:
        """
        Remove document from chat agent's knowledge base.
        
        Args:
            chat_id: Chat identifier
            filename: Filename to remove
            
        Returns:
            Dict with success status
        """
        return self.knowledge_manager.remove_document(chat_id, filename)
    
    def list_documents(self, chat_id: str) -> List[Dict[str, Any]]:
        """
        List all documents in chat agent's knowledge base.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            List of document info
        """
        return self.knowledge_manager.list_documents(chat_id)
    
    # Query and Response
    
    def query(
        self,
        chat_id: str,
        query: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Query chat agent with question.
        
        Args:
            chat_id: Chat identifier
            query: User question
            conversation_history: Optional conversation history
            model: Optional model override
            
        Returns:
            Dict with response and metadata
        """
        try:
            # Get or create agent
            config = self.agent_manager.get_or_create_agent(chat_id)
            
            # Retrieve relevant context
            retrieved_docs = self.retrieval.retrieve(
                chat_id=chat_id,
                query=query,
                agent_config=config
            )
            
            # Format document context
            document_context = self.retrieval.format_context(retrieved_docs)
            
            # Generate response
            response = self.llm.generate_response(
                query=query,
                document_context=document_context,
                conversation_history=conversation_history or [],
                agent_config=config,
                model=model
            )
            
            return {
                "success": True,
                "response": response,
                "sources": [
                    {
                        "source": doc.metadata.get('source', 'Unknown'),
                        "source_type": doc.metadata.get('source_type', 'document'),
                        "page": doc.metadata.get('page'),
                        "chunk_id": doc.metadata.get('chunk_id'),
                        "text": doc.page_content[:500] if doc.page_content else "",  # Include snippet for highlighting
                    }
                    for doc in retrieved_docs
                ],
                "num_sources": len(retrieved_docs),
            }
            
        except LLMError as e:
            logger.error(f"LLM error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error during query: {e}")
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}"
            }
    
    def query_stream(
        self,
        chat_id: str,
        query: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        model: Optional[str] = None
    ) -> Generator[str, None, None]:
        """
        Query chat agent with streaming response.
        
        Args:
            chat_id: Chat identifier
            query: User question
            conversation_history: Optional conversation history
            model: Optional model override
            
        Yields:
            str: Response chunks
        """
        try:
            # Get or create agent
            config = self.agent_manager.get_or_create_agent(chat_id)
            
            # Retrieve relevant context
            retrieved_docs = self.retrieval.retrieve(
                chat_id=chat_id,
                query=query,
                agent_config=config
            )
            
            # Format document context
            document_context = self.retrieval.format_context(retrieved_docs)
            
            # Generate streaming response
            yield from self.llm.generate_response_stream(
                query=query,
                document_context=document_context,
                conversation_history=conversation_history or [],
                agent_config=config,
                model=model
            )
            
        except Exception as e:
            logger.error(f"Error during streaming query: {e}")
            yield f"Error: {str(e)}"
    
    # Statistics
    
    def get_stats(self, chat_id: str) -> Dict[str, Any]:
        """
        Get statistics about chat agent.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            Dict with statistics
        """
        knowledge_stats = self.agent_manager.get_knowledge_stats(chat_id)
        
        return {
            "chat_id": chat_id,
            "agent_exists": self.agent_manager.agent_exists(chat_id),
            **knowledge_stats
        }

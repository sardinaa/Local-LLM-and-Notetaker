"""
Knowledge Ingestion for Chat Agents

Handles adding documents and URLs to chat agent knowledge bases.
Supports multiple file formats with intelligent chunking.
"""

import os
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path
import mimetypes

from .base import AgentConfig
from .vector_store import VectorStoreManager, VECTOR_STORE_AVAILABLE

logger = logging.getLogger(__name__)

# Import document loaders
if VECTOR_STORE_AVAILABLE:
    from langchain_community.document_loaders import (
        PyPDFLoader,
        Docx2txtLoader,
        TextLoader,
        CSVLoader,
        UnstructuredURLLoader,
        WebBaseLoader
    )
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    from langchain_core.documents import Document


class KnowledgeIngestionError(Exception):
    """Base exception for knowledge ingestion errors."""
    pass


class ChatKnowledgeManager:
    """
    Manages knowledge ingestion for chat agents.
    
    Handles document uploads, URL ingestion, and chunking strategies.
    """
    
    def __init__(self, vector_store_manager: VectorStoreManager):
        """
        Initialize knowledge manager.
        
        Args:
            vector_store_manager: Vector store manager instance
        """
        if not VECTOR_STORE_AVAILABLE:
            raise RuntimeError("Vector store dependencies not available")
        
        self.vector_store_manager = vector_store_manager
        logger.info("Initialized ChatKnowledgeManager")
    
    def add_document(
        self,
        chat_id: str,
        file_path: str,
        filename: str,
        agent_config: AgentConfig,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Add document to chat agent's knowledge base.
        
        Args:
            chat_id: Chat identifier
            file_path: Path to document file
            filename: Original filename
            agent_config: Agent configuration
            metadata: Optional additional metadata
            
        Returns:
            Dict with success status and info
        """
        try:
            # Load document based on file type
            documents = self._load_document(file_path, filename)
            
            if not documents:
                raise KnowledgeIngestionError(f"No content extracted from {filename}")
            
            # Split into chunks
            chunks = self._chunk_documents(documents, agent_config)
            
            # Add metadata
            for chunk in chunks:
                chunk.metadata.update({
                    "source": filename,
                    "source_type": "document",
                    "file_path": file_path,
                    "chat_id": chat_id,
                })
                if metadata:
                    chunk.metadata.update(metadata)
            
            # Add to vector store
            vector_store = self.vector_store_manager.get_chat_store(chat_id)
            ids = vector_store.add_documents(chunks)
            
            logger.info(f"Added {len(chunks)} chunks from {filename} to chat {chat_id}")
            
            return {
                "success": True,
                "filename": filename,
                "source_type": "document",
                "chunks_added": len(chunks),
                "chunk_ids": ids,
            }
            
        except Exception as e:
            logger.error(f"Failed to add document {filename} to chat {chat_id}: {e}")
            raise KnowledgeIngestionError(f"Failed to ingest document: {str(e)}")
    
    def add_url(
        self,
        chat_id: str,
        url: str,
        agent_config: AgentConfig,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Add URL content to chat agent's knowledge base.
        
        Args:
            chat_id: Chat identifier
            url: URL to ingest
            agent_config: Agent configuration
            metadata: Optional additional metadata
            
        Returns:
            Dict with success status and info
        """
        try:
            # Load URL content
            documents = self._load_url(url)
            
            if not documents:
                raise KnowledgeIngestionError(f"No content extracted from {url}")
            
            # Split into chunks
            chunks = self._chunk_documents(documents, agent_config)
            
            # Add metadata
            for chunk in chunks:
                chunk.metadata.update({
                    "source": url,
                    "source_type": "url",
                    "chat_id": chat_id,
                })
                if metadata:
                    chunk.metadata.update(metadata)
            
            # Add to vector store
            vector_store = self.vector_store_manager.get_chat_store(chat_id)
            ids = vector_store.add_documents(chunks)
            
            logger.info(f"Added {len(chunks)} chunks from URL {url} to chat {chat_id}")
            
            return {
                "success": True,
                "url": url,
                "chunks_added": len(chunks),
                "chunk_ids": ids,
            }
            
        except Exception as e:
            logger.error(f"Failed to add URL {url} to chat {chat_id}: {e}")
            raise KnowledgeIngestionError(f"Failed to ingest URL: {str(e)}")
    
    def _load_document(self, file_path: str, filename: str) -> List[Document]:
        """
        Load document based on file type.
        
        Args:
            file_path: Path to file
            filename: Original filename
            
        Returns:
            List of Document objects
        """
        # Determine file type
        mime_type, _ = mimetypes.guess_type(filename)
        extension = Path(filename).suffix.lower()
        
        try:
            # PDF
            if extension == '.pdf' or mime_type == 'application/pdf':
                loader = PyPDFLoader(file_path)
                return loader.load()
            
            # Word documents
            elif extension in ['.docx', '.doc'] or mime_type in [
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword'
            ]:
                loader = Docx2txtLoader(file_path)
                return loader.load()
            
            # CSV
            elif extension == '.csv' or mime_type == 'text/csv':
                loader = CSVLoader(file_path)
                return loader.load()
            
            # Plain text
            elif extension in ['.txt', '.md', '.json'] or mime_type and mime_type.startswith('text/'):
                loader = TextLoader(file_path)
                return loader.load()
            
            else:
                # Try as text file
                logger.warning(f"Unknown file type for {filename}, attempting text loader")
                loader = TextLoader(file_path)
                return loader.load()
                
        except Exception as e:
            logger.error(f"Failed to load document {filename}: {e}")
            raise KnowledgeIngestionError(f"Failed to load document: {str(e)}")
    
    def _load_url(self, url: str) -> List[Document]:
        """
        Load content from URL using multiple strategies.
        
        Args:
            url: URL to load
            
        Returns:
            List of Document objects
        """
        # Try WebBaseLoader first (more reliable for most websites)
        try:
            logger.info(f"Attempting to load URL with WebBaseLoader: {url}")
            loader = WebBaseLoader(url)
            documents = loader.load()
            
            if documents and any(doc.page_content.strip() for doc in documents):
                logger.info(f"Successfully loaded URL with WebBaseLoader: {url}, {len(documents)} documents")
                return documents
            else:
                logger.warning(f"WebBaseLoader returned empty content for {url}")
        except Exception as e:
            logger.warning(f"WebBaseLoader failed for {url}: {e}")
        
        # Fallback to UnstructuredURLLoader
        try:
            logger.info(f"Attempting to load URL with UnstructuredURLLoader: {url}")
            loader = UnstructuredURLLoader(urls=[url])
            documents = loader.load()
            
            if documents and any(doc.page_content.strip() for doc in documents):
                logger.info(f"Successfully loaded URL with UnstructuredURLLoader: {url}, {len(documents)} documents")
                return documents
            else:
                logger.error(f"UnstructuredURLLoader returned empty content for {url}")
                raise KnowledgeIngestionError(f"No content could be extracted from {url}")
        except Exception as e:
            logger.error(f"All URL loaders failed for {url}: {e}")
            raise KnowledgeIngestionError(f"Failed to load URL: {str(e)}")
    
    def _chunk_documents(
        self,
        documents: List[Document],
        agent_config: AgentConfig
    ) -> List[Document]:
        """
        Split documents into chunks based on agent configuration.
        
        Args:
            documents: List of documents to chunk
            agent_config: Agent configuration with chunking params
            
        Returns:
            List of chunked documents
        """
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=agent_config.retrieval.chunk_size,
            chunk_overlap=agent_config.retrieval.chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
            length_function=len,
        )
        
        return splitter.split_documents(documents)
    
    def remove_document(
        self,
        chat_id: str,
        filename: str
    ) -> Dict[str, Any]:
        """
        Remove document from chat agent's knowledge base.
        
        Args:
            chat_id: Chat identifier
            filename: Filename to remove
            
        Returns:
            Dict with success status
        """
        try:
            vector_store = self.vector_store_manager.get_chat_store(chat_id)
            collection = vector_store._collection
            
            # Query for documents with this filename
            results = collection.get(
                where={"source": filename}
            )
            
            if results and 'ids' in results and results['ids']:
                # Delete documents
                collection.delete(ids=results['ids'])
                logger.info(f"Removed {len(results['ids'])} chunks for {filename} from chat {chat_id}")
                
                return {
                    "success": True,
                    "chunks_removed": len(results['ids']),
                }
            else:
                logger.warning(f"No chunks found for {filename} in chat {chat_id}")
                return {
                    "success": False,
                    "message": "Document not found",
                }
                
        except Exception as e:
            logger.error(f"Failed to remove document {filename} from chat {chat_id}: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    def list_documents(self, chat_id: str) -> List[Dict[str, Any]]:
        """
        List all documents in chat agent's knowledge base.
        
        Args:
            chat_id: Chat identifier
            
        Returns:
            List of document info dicts
        """
        try:
            vector_store = self.vector_store_manager.get_chat_store(chat_id)
            collection = vector_store._collection
            
            # Get all documents
            results = collection.get()
            
            if not results or 'metadatas' not in results:
                return []
            
            # Group by source
            sources = {}
            for metadata in results['metadatas']:
                if metadata:
                    source = metadata.get('source', 'unknown')
                    source_type = metadata.get('source_type', 'document')
                    
                    if source not in sources:
                        sources[source] = {
                            "source": source,
                            "source_type": source_type,
                            "chunk_count": 0,
                        }
                    sources[source]["chunk_count"] += 1
            
            return list(sources.values())
            
        except Exception as e:
            logger.error(f"Failed to list documents for chat {chat_id}: {e}")
            return []

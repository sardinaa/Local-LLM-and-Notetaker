"""
RAG (Retrieval-Augmented Generation) Manager using LangChain
Integrates document retrieval with the existing chat system
"""

import os
import json
import logging
import tempfile
from typing import List, Dict, Any, Optional, Generator
from pathlib import Path

# LangChain imports
from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings, OllamaLLM
from langchain_community.document_loaders import (
    TextLoader, PDFPlumberLoader, UnstructuredWordDocumentLoader,
    UnstructuredPowerPointLoader, CSVLoader
)
from langchain_core.documents import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate

logger = logging.getLogger(__name__)

class RAGManager:
    """Manages document storage, retrieval, and integration with chat system."""
    
    def __init__(self, 
                 model_name: str = "mistral:latest",
                 embedding_model: str = "nomic-embed-text",
                 ollama_base_url: str = "http://127.0.0.1:11434",
                 persist_directory: str = "./data/chroma_db"):
        """
        Initialize the RAG manager.
        
        Args:
            model_name: Name of the Ollama model for generation
            embedding_model: Name of the Ollama model for embeddings
            ollama_base_url: Base URL for Ollama API
            persist_directory: Directory to persist vector store
        """
        self.model_name = model_name
        self.embedding_model = embedding_model
        self.ollama_base_url = ollama_base_url
        self.persist_directory = persist_directory
        
        # Ensure persist directory exists
        os.makedirs(persist_directory, exist_ok=True)
        
        # Initialize components
        self.embeddings = OllamaEmbeddings(
            model=embedding_model,
            base_url=ollama_base_url
        )
        
        self.llm = OllamaLLM(
            model=model_name,
            base_url=ollama_base_url,
            temperature=0.3  # Lower temperature for more focused responses
        )
        
        # Initialize vector store
        self.vectorstore = Chroma(
            persist_directory=persist_directory,
            embedding_function=self.embeddings
        )
        
        # Improved text splitter for better chunking
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,  # Larger chunks for better context
            chunk_overlap=400,  # More overlap to preserve context
            length_function=len,
            separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""]  # Better splitting points
        )
        
        # Document collections mapping (chat_id -> collection_name)
        self.chat_collections = {}
        self.collections_file = os.path.join(persist_directory, "collections.json")
        self._load_collections_mapping()
        
        # Improved RAG prompt template
        self.rag_prompt = PromptTemplate(
            template="""You are an intelligent assistant helping to analyze and explain content from documents. 
Use the provided context to give a comprehensive and helpful answer to the question.

Context from the documents:
{context}

Question: {question}

Instructions:
- Provide a detailed and informative answer based on the context
- If the context contains relevant information, explain it thoroughly
- Include specific details, examples, or quotes from the context when relevant
- If the context doesn't contain enough information to fully answer the question, say so and provide what information is available
- Structure your response clearly with appropriate formatting

Answer:""",
            input_variables=["context", "question"]
        )
    
    def _load_collections_mapping(self):
        """Load the collections mapping from file."""
        try:
            if os.path.exists(self.collections_file):
                with open(self.collections_file, 'r') as f:
                    self.chat_collections = json.load(f)
        except Exception as e:
            logger.warning(f"Could not load collections mapping: {e}")
            self.chat_collections = {}
    
    def _save_collections_mapping(self):
        """Save the collections mapping to file."""
        try:
            with open(self.collections_file, 'w') as f:
                json.dump(self.chat_collections, f, indent=2)
        except Exception as e:
            logger.error(f"Could not save collections mapping: {e}")
    
    def create_collection_for_chat(self, chat_id: str) -> str:
        """
        Create a new collection for a specific chat.
        
        Args:
            chat_id: The chat ID to create collection for
            
        Returns:
            str: The collection name
        """
        collection_name = f"chat_{chat_id}_docs"
        self.chat_collections[chat_id] = collection_name
        self._save_collections_mapping()
        logger.info(f"Created collection {collection_name} for chat {chat_id}")
        return collection_name
    
    def get_collection_for_chat(self, chat_id: str) -> Optional[str]:
        """Get the collection name for a specific chat."""
        return self.chat_collections.get(chat_id)
    
    def add_document_from_file(self, chat_id: str, file_path: str, filename: str) -> Dict[str, Any]:
        """
        Add a document from file to the chat's collection.
        
        Args:
            chat_id: The chat ID to add document to
            file_path: Path to the document file
            filename: Original filename
            
        Returns:
            Dict with status and information about the added document
        """
        try:
            # Get or create collection for this chat
            collection_name = self.get_collection_for_chat(chat_id)
            if not collection_name:
                collection_name = self.create_collection_for_chat(chat_id)
            
            # Load document based on file type
            documents = self._load_document(file_path, filename)
            
            if not documents:
                return {"status": "error", "message": "Could not load document"}
            
            # Split documents into chunks
            chunks = self.text_splitter.split_documents(documents)
            
            # Add metadata
            for chunk in chunks:
                chunk.metadata.update({
                    "chat_id": chat_id,
                    "filename": filename,
                    "collection": collection_name
                })
            
            # Add to vector store with collection
            self.vectorstore.add_documents(
                chunks,
                collection_name=collection_name
            )
            
            logger.info(f"Added {len(chunks)} chunks from {filename} to collection {collection_name}")
            
            return {
                "status": "success",
                "message": f"Successfully added {filename}",
                "chunks_count": len(chunks),
                "filename": filename
            }
            
        except Exception as e:
            logger.error(f"Error adding document: {e}")
            return {"status": "error", "message": str(e)}
    
    def _load_document(self, file_path: str, filename: str) -> List[Document]:
        """Load document using appropriate loader based on file extension."""
        try:
            file_ext = Path(filename).suffix.lower()
            
            if file_ext == '.txt':
                loader = TextLoader(file_path, encoding='utf-8')
            elif file_ext == '.pdf':
                loader = PDFPlumberLoader(file_path)
            elif file_ext in ['.doc', '.docx']:
                loader = UnstructuredWordDocumentLoader(file_path)
            elif file_ext in ['.ppt', '.pptx']:
                loader = UnstructuredPowerPointLoader(file_path)
            elif file_ext == '.csv':
                loader = CSVLoader(file_path)
            else:
                # Try to load as text for other formats
                loader = TextLoader(file_path, encoding='utf-8')
            
            documents = loader.load()
            
            # Add filename to metadata
            for doc in documents:
                doc.metadata['source_filename'] = filename
            
            return documents
            
        except Exception as e:
            logger.error(f"Error loading document {filename}: {e}")
            return []
    
    def query_documents(self, chat_id: str, query: str, k: int = 5) -> Dict[str, Any]:
        """
        Query documents in the chat's collection.
        
        Args:
            chat_id: The chat ID to query documents for
            query: The search query
            k: Number of relevant chunks to retrieve
            
        Returns:
            Dict with retrieved documents and metadata
        """
        try:
            collection_name = self.get_collection_for_chat(chat_id)
            
            if not collection_name:
                return {
                    "status": "error",
                    "message": "No documents found for this chat"
                }
            
            # Search for relevant documents
            retriever = self.vectorstore.as_retriever(
                search_kwargs={"k": k, "filter": {"chat_id": chat_id}}
            )
            
            relevant_docs = retriever.get_relevant_documents(query)
            
            # Format results
            results = []
            for doc in relevant_docs:
                results.append({
                    "content": doc.page_content,
                    "metadata": doc.metadata,
                    "filename": doc.metadata.get("filename", "Unknown")
                })
            
            return {
                "status": "success",
                "results": results,
                "count": len(results)
            }
            
        except Exception as e:
            logger.error(f"Error querying documents: {e}")
            return {"status": "error", "message": str(e)}
    
    def get_rag_response(self, chat_id: str, query: str, k: int = 5) -> str:
        """
        Get a response using RAG (Retrieval-Augmented Generation).
        
        Args:
            chat_id: The chat ID to query documents for
            query: The user query
            k: Number of relevant chunks to retrieve
            
        Returns:
            str: Generated response based on retrieved documents
        """
        try:
            collection_name = self.get_collection_for_chat(chat_id)
            
            if not collection_name:
                return "No documents available for this chat. Please upload some documents first."
            
            # Create retriever with chat-specific filtering
            retriever = self.vectorstore.as_retriever(
                search_kwargs={"k": k, "filter": {"chat_id": chat_id}}
            )
            
            # Create RetrievalQA chain
            qa_chain = RetrievalQA.from_chain_type(
                llm=self.llm,
                chain_type="stuff",
                retriever=retriever,
                chain_type_kwargs={"prompt": self.rag_prompt},
                return_source_documents=True
            )
            
            # Get response
            result = qa_chain({"query": query})
            
            # Format response with source information
            response = result["result"]
            sources = set()
            for doc in result.get("source_documents", []):
                filename = doc.metadata.get("filename", "Unknown")
                sources.add(filename)
            
            if sources:
                source_list = ", ".join(sources)
                response += f"\n\n*Sources: {source_list}*"
            
            return response
            
        except Exception as e:
            logger.error(f"Error generating RAG response: {e}")
            return f"Error retrieving information from documents: {str(e)}"
    
    def get_rag_response_stream(self, chat_id: str, query: str, k: int = 5) -> Generator[str, None, None]:
        """
        Get a streaming response using RAG.
        
        Args:
            chat_id: The chat ID to query documents for
            query: The user query
            k: Number of relevant chunks to retrieve
            
        Yields:
            str: Chunks of the generated response
        """
        try:
            collection_name = self.get_collection_for_chat(chat_id)
            
            if not collection_name:
                yield "No documents available for this chat. Please upload some documents first."
                return
            
            # Get relevant documents
            retriever = self.vectorstore.as_retriever(
                search_kwargs={"k": k, "filter": {"chat_id": chat_id}}
            )
            
            relevant_docs = retriever.get_relevant_documents(query)
            
            if not relevant_docs:
                yield "No relevant information found in the uploaded documents."
                return
            
            # Prepare context
            context = "\n\n".join([doc.page_content for doc in relevant_docs])
            
            # Format prompt
            prompt = self.rag_prompt.format(context=context, question=query)
            
            # Stream response from LLM
            for chunk in self.llm.stream(prompt):
                yield chunk
            
            # Add source information at the end
            sources = set()
            for doc in relevant_docs:
                filename = doc.metadata.get("filename", "Unknown")
                sources.add(filename)
            
            if sources:
                source_list = ", ".join(sources)
                yield f"\n\n*Sources: {source_list}*"
                
        except Exception as e:
            logger.error(f"Error in streaming RAG response: {e}")
            yield f"Error retrieving information from documents: {str(e)}"
    
    def list_documents_for_chat(self, chat_id: str) -> List[Dict[str, Any]]:
        """
        List all documents in a chat's collection.
        
        Args:
            chat_id: The chat ID to list documents for
            
        Returns:
            List of document information
        """
        try:
            collection_name = self.get_collection_for_chat(chat_id)
            
            if not collection_name:
                return []
            
            # Get all documents for this chat
            # Note: This is a simplified approach. In production, you might want
            # to store document metadata separately for better efficiency
            all_docs = self.vectorstore.get(where={"chat_id": chat_id})
            
            # Extract unique filenames
            filenames = set()
            for metadata in all_docs.get("metadatas", []):
                if metadata and "filename" in metadata:
                    filenames.add(metadata["filename"])
            
            return [{"filename": filename} for filename in filenames]
            
        except Exception as e:
            logger.error(f"Error listing documents: {e}")
            return []
    
    def remove_document_from_chat(self, chat_id: str, filename: str) -> bool:
        """
        Remove all chunks of a specific document from a chat's collection.
        
        Args:
            chat_id: The chat ID
            filename: The filename to remove
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            collection_name = self.get_collection_for_chat(chat_id)
            
            if not collection_name:
                return False
            
            # This is a limitation of current Chroma implementation
            # For production use, consider maintaining a separate index
            # of document IDs for easier removal
            logger.warning("Document removal not fully implemented due to Chroma limitations")
            return False
            
        except Exception as e:
            logger.error(f"Error removing document: {e}")
            return False
    
    def clear_chat_documents(self, chat_id: str) -> bool:
        """
        Clear all documents for a specific chat.
        
        Args:
            chat_id: The chat ID to clear documents for
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            collection_name = self.get_collection_for_chat(chat_id)
            
            if not collection_name:
                return True  # Nothing to clear
            
            # Remove from collections mapping
            if chat_id in self.chat_collections:
                del self.chat_collections[chat_id]
                self._save_collections_mapping()
            
            # Note: Chroma collection deletion would require recreating the vectorstore
            # For now, we'll just remove the mapping
            logger.info(f"Cleared document mapping for chat {chat_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error clearing chat documents: {e}")
            return False

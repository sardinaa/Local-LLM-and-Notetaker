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
    UnstructuredPowerPointLoader, CSVLoader, PyMuPDFLoader
)
from langchain_core.documents import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate

# Additional imports for better document processing
try:
    import pymupdf  # For better PDF structure preservation
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    from docx import Document as DocxDocument
    from docx.document import Document as DocxDocumentType
    from docx.text.paragraph import Paragraph
    from docx.table import Table
    PYTHON_DOCX_AVAILABLE = True
except ImportError:
    PYTHON_DOCX_AVAILABLE = False

logger = logging.getLogger(__name__)

class RAGManager:
    """Manages document storage, retrieval, and integration with chat system."""
    
    def __init__(self, 
                 model_name: str = None,  # Will use environment variable if None
                 embedding_model: str = None,  # Will use environment variable if None
                 ollama_base_url: str = "http://127.0.0.1:11434",
                 persist_directory: str = "./data/chroma_db"):
        """
        Initialize the RAG manager.
        
        Args:
            model_name: Name of the Ollama model for generation (None to use env var)
            embedding_model: Name of the Ollama model for embeddings (None to use env var)
            ollama_base_url: Base URL for Ollama API
            persist_directory: Directory to persist vector store
        """
        import os
        self.model_name = model_name or os.getenv('RAG_MODEL', 'llama3.2:3b')
        self.embedding_model = embedding_model or os.getenv('RAG_EMBEDDING_MODEL', 'nomic-embed-text')
        self.ollama_base_url = ollama_base_url
        self.persist_directory = persist_directory
        
        # Ensure persist directory exists
        os.makedirs(persist_directory, exist_ok=True)
        
        # Initialize components
        self.embeddings = OllamaEmbeddings(
            model=self.embedding_model,
            base_url=ollama_base_url
        )
        
        self.llm = OllamaLLM(
            model=self.model_name,
            base_url=ollama_base_url,
            temperature=0.3  # Lower temperature for more focused responses
        )
        
        # Initialize vector store
        self.vectorstore = Chroma(
            persist_directory=persist_directory,
            embedding_function=self.embeddings
        )
        
        # Enhanced text splitter for better structure preservation
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,  # Larger chunks for better context
            chunk_overlap=400,  # More overlap to preserve context
            length_function=len,
            # Enhanced separators to respect document structure
            separators=[
                "\n\n\n",  # Multiple newlines (section breaks)
                "\n\n",    # Paragraph breaks
                "\n• ",    # Bullet points
                "\n- ",    # Dash bullet points
                "\n1. ",   # Numbered lists
                "\n",      # Single newlines
                ". ",      # Sentence endings
                "! ",      # Exclamation sentence endings
                "? ",      # Question sentence endings
                " ",       # Word boundaries
                ""         # Character level (last resort)
            ]
        )
        
        # Document collections mapping (chat_id -> collection_name)
        self.chat_collections = {}
        self.collections_file = os.path.join(persist_directory, "collections.json")
        self._load_collections_mapping()
        
        # File path mapping for serving original documents (chat_id -> {filename: filepath})
        self.file_paths = {}
        self.file_paths_file = os.path.join(persist_directory, "file_paths.json")
        self._load_file_paths_mapping()
        
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
    
    def _load_file_paths_mapping(self):
        """Load the chat to file paths mapping from file."""
        try:
            if os.path.exists(self.file_paths_file):
                with open(self.file_paths_file, 'r') as f:
                    self.file_paths = json.load(f)
        except Exception as e:
            logger.warning(f"Could not load file paths mapping: {e}")
            self.file_paths = {}
    
    def _save_file_paths_mapping(self):
        """Save the chat to file paths mapping to file."""
        try:
            with open(self.file_paths_file, 'w') as f:
                json.dump(self.file_paths, f, indent=2)
        except Exception as e:
            logger.error(f"Could not save file paths mapping: {e}")
    
    def _store_file_path(self, chat_id: str, filename: str, file_path: str):
        """Store the original file path for a document."""
        if chat_id not in self.file_paths:
            self.file_paths[chat_id] = {}
        self.file_paths[chat_id][filename] = file_path
        self._save_file_paths_mapping()
    
    def get_document_file_path(self, chat_id: str, filename: str) -> Optional[str]:
        """Get the original file path for a document."""
        return self.file_paths.get(chat_id, {}).get(filename)
    
    def find_uploaded_file(self, filename: str) -> Optional[str]:
        """Find an uploaded file by searching common upload locations."""
        import tempfile
        
        # Common locations where uploaded files might be stored
        search_paths = [
            tempfile.gettempdir(),
            os.path.join(os.getcwd(), 'uploads'),
            os.path.join(os.getcwd(), 'data', 'uploads'),
            os.path.join(os.getcwd(), 'instance', 'uploads'),
            os.path.join(os.getcwd(), 'static', 'uploads'),
        ]
        
        for search_path in search_paths:
            if os.path.exists(search_path):
                # Look for the file directly
                file_path = os.path.join(search_path, filename)
                if os.path.exists(file_path):
                    return file_path
                
                # Look for files with similar names (in case of timestamp prefixes)
                try:
                    for file in os.listdir(search_path):
                        if file.endswith(filename) or filename in file:
                            full_path = os.path.join(search_path, file)
                            if os.path.isfile(full_path):
                                return full_path
                except (OSError, PermissionError):
                    continue
        
        return None
    
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
    
    def add_document_from_file(self, chat_id: str, file_path: str, filename: str, permanent_path: str = None) -> Dict[str, Any]:
        """
        Add a document from file to the chat's collection.
        
        Args:
            chat_id: The chat ID to add document to
            file_path: Path to the document file for processing
            filename: Original filename
            permanent_path: Permanent file path for serving (optional)
            
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
            
            # Store the permanent file path for direct serving (use permanent_path if provided, otherwise file_path)
            serving_path = permanent_path if permanent_path else file_path
            self._store_file_path(chat_id, filename, serving_path)
            
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
        """Load document using appropriate loader based on file extension with enhanced formatting preservation."""
        try:
            file_ext = Path(filename).suffix.lower()
            
            if file_ext == '.txt':
                loader = TextLoader(file_path, encoding='utf-8')
                documents = loader.load()
            elif file_ext == '.pdf':
                documents = self._load_pdf_with_structure(file_path, filename)
            elif file_ext in ['.doc', '.docx']:
                documents = self._load_docx_with_structure(file_path, filename)
            elif file_ext in ['.ppt', '.pptx']:
                loader = UnstructuredPowerPointLoader(file_path)
                documents = loader.load()
            elif file_ext == '.csv':
                loader = CSVLoader(file_path)
                documents = loader.load()
            else:
                # Try to load as text for other formats
                loader = TextLoader(file_path, encoding='utf-8')
                documents = loader.load()
            
            # Add filename to metadata and enhance with structure info
            for doc in documents:
                doc.metadata['source_filename'] = filename
                doc.metadata['file_type'] = file_ext
                doc.metadata['processed_with_structure'] = True
            
            return documents
            
        except Exception as e:
            logger.error(f"Error loading document {filename}: {e}")
            # Fallback to original loaders if enhanced processing fails
            return self._load_document_fallback(file_path, filename)
    
    def _load_pdf_with_structure(self, file_path: str, filename: str) -> List[Document]:
        """Load PDF with enhanced structure preservation using PyMuPDF when available."""
        try:
            if PYMUPDF_AVAILABLE:
                # Use PyMuPDF for better structure extraction
                loader = PyMuPDFLoader(file_path)
                documents = loader.load()
                
                # Process documents to preserve formatting markers
                for doc in documents:
                    doc.page_content = self._enhance_pdf_formatting(doc.page_content)
                    doc.metadata['extraction_method'] = 'pymupdf'
                
                return documents
            else:
                # Fallback to PDFPlumberLoader with enhanced processing
                loader = PDFPlumberLoader(file_path)
                documents = loader.load()
                
                for doc in documents:
                    doc.page_content = self._enhance_pdf_formatting(doc.page_content)
                    doc.metadata['extraction_method'] = 'pdfplumber'
                
                return documents
                
        except Exception as e:
            logger.warning(f"Enhanced PDF processing failed for {filename}: {e}")
            # Fallback to basic PDF loading
            loader = PDFPlumberLoader(file_path)
            return loader.load()
    
    def _load_docx_with_structure(self, file_path: str, filename: str) -> List[Document]:
        """Load DOCX with enhanced structure preservation using python-docx when available."""
        try:
            if PYTHON_DOCX_AVAILABLE:
                # Use python-docx for better structure extraction
                content = self._extract_docx_with_formatting(file_path)
                doc = Document(page_content=content, metadata={
                    'source': file_path,
                    'extraction_method': 'python-docx'
                })
                return [doc]
            else:
                # Fallback to UnstructuredWordDocumentLoader with enhanced processing
                loader = UnstructuredWordDocumentLoader(
                    file_path,
                    mode="elements"  # Extract elements to preserve structure
                )
                documents = loader.load()
                
                # Combine elements while preserving structure
                if documents:
                    combined_content = self._combine_unstructured_elements(documents)
                    doc = Document(page_content=combined_content, metadata={
                        'source': file_path,
                        'extraction_method': 'unstructured-elements'
                    })
                    return [doc]
                
                return documents
                
        except Exception as e:
            logger.warning(f"Enhanced DOCX processing failed for {filename}: {e}")
            # Fallback to basic DOCX loading
            loader = UnstructuredWordDocumentLoader(file_path)
            return loader.load()
    
    def _enhance_pdf_formatting(self, content: str) -> str:
        """Enhance PDF content formatting to preserve structure."""
        import re
        
        # Preserve heading patterns (lines that are all caps or start with numbers)
        lines = content.split('\n')
        enhanced_lines = []
        
        for line in lines:
            stripped = line.strip()
            if not stripped:
                enhanced_lines.append('')
                continue
            
            # Detect potential headings
            if (stripped.isupper() and len(stripped) < 100) or \
               re.match(r'^\d+\.?\s+[A-Z]', stripped) or \
               re.match(r'^[A-Z][^.!?]*$', stripped):
                enhanced_lines.append(f'\n## {stripped}\n')
            # Detect bullet points
            elif re.match(r'^\s*[•\-\*]\s+', stripped):
                enhanced_lines.append(f'• {stripped.lstrip("•-* ")}')
            # Detect numbered lists
            elif re.match(r'^\s*\d+\.?\s+', stripped):
                enhanced_lines.append(stripped)
            else:
                enhanced_lines.append(stripped)
        
        return '\n'.join(enhanced_lines)
    
    def _extract_docx_with_formatting(self, file_path: str) -> str:
        """Extract DOCX content while preserving formatting structure."""
        doc = DocxDocument(file_path)
        content_parts = []
        
        for element in doc.element.body:
            if element.tag.endswith('p'):  # Paragraph
                para = Paragraph(element, doc)
                text = para.text.strip()
                if text:
                    # Check for heading styles
                    if para.style.name.startswith('Heading'):
                        level = '##' if 'Heading 1' in para.style.name else '###'
                        content_parts.append(f'\n{level} {text}\n')
                    else:
                        content_parts.append(text)
                else:
                    content_parts.append('')  # Preserve paragraph breaks
            
            elif element.tag.endswith('tbl'):  # Table
                table = Table(element, doc)
                content_parts.append(self._format_docx_table(table))
        
        return '\n'.join(content_parts)
    
    def _format_docx_table(self, table) -> str:
        """Format DOCX table content with structure preservation."""
        table_content = ['\n--- TABLE ---']
        
        for row in table.rows:
            row_cells = []
            for cell in row.cells:
                cell_text = cell.text.strip().replace('\n', ' ')
                row_cells.append(cell_text)
            table_content.append(' | '.join(row_cells))
        
        table_content.append('--- END TABLE ---\n')
        return '\n'.join(table_content)
    
    def _combine_unstructured_elements(self, documents: List[Document]) -> str:
        """Combine unstructured elements while preserving document structure."""
        content_parts = []
        
        for doc in documents:
            element_type = doc.metadata.get('category', 'Text')
            content = doc.page_content.strip()
            
            if not content:
                continue
            
            # Format based on element type
            if element_type == 'Title':
                content_parts.append(f'\n# {content}\n')
            elif element_type == 'Header':
                content_parts.append(f'\n## {content}\n')
            elif element_type == 'ListItem':
                content_parts.append(f'• {content}')
            elif element_type == 'Table':
                content_parts.append(f'\n--- TABLE ---\n{content}\n--- END TABLE ---\n')
            else:
                content_parts.append(content)
        
        return '\n'.join(content_parts)
    
    def _load_document_fallback(self, file_path: str, filename: str) -> List[Document]:
        """Fallback document loading method using original loaders."""
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
                loader = TextLoader(file_path, encoding='utf-8')
            
            documents = loader.load()
            
            # Add filename to metadata
            for doc in documents:
                doc.metadata['source_filename'] = filename
                doc.metadata['processed_with_structure'] = False
            
            return documents
            
        except Exception as e:
            logger.error(f"Fallback document loading failed for {filename}: {e}")
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
    
    def get_rag_response(self, chat_id: str, query: str, k: int = 5, model_name: str = None) -> str:
        """
        Get a response using RAG (Retrieval-Augmented Generation).
        
        Args:
            chat_id: The chat ID to query documents for
            query: The user query
            k: Number of relevant chunks to retrieve
            model_name: Optional model name to use (overrides default)
            
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
            
            # Use specified model or default
            llm = self.llm
            if model_name and model_name != self.llm.model:
                try:
                    llm = OllamaLLM(
                        model=model_name,
                        base_url=self.ollama_base_url,
                        temperature=0.7
                    )
                    logger.info(f"Using model {model_name} for RAG response")
                except Exception as e:
                    logger.warning(f"Failed to use model {model_name}, falling back to default: {e}")
                    llm = self.llm
            
            # Create RetrievalQA chain
            qa_chain = RetrievalQA.from_chain_type(
                llm=llm,
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
    
    def get_rag_response_stream(self, chat_id: str, query: str, k: int = 5, model_name: str = None) -> Generator[str, None, None]:
        """
        Get a streaming response using RAG.
        
        Args:
            chat_id: The chat ID to query documents for
            query: The user query
            k: Number of relevant chunks to retrieve
            model_name: Optional model name to use (overrides default)
            
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
            
            # Use specified model or default
            llm = self.llm
            if model_name and model_name != self.llm.model:
                try:
                    llm = OllamaLLM(
                        model=model_name,
                        base_url=self.ollama_base_url,
                        temperature=0.7
                    )
                    logger.info(f"Using model {model_name} for RAG streaming response")
                except Exception as e:
                    logger.warning(f"Failed to use model {model_name}, falling back to default: {e}")
                    llm = self.llm
            
            # Stream response from LLM
            for chunk in llm.stream(prompt):
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
            
            # Extract unique filenames and get their full paths
            filenames = set()
            for metadata in all_docs.get("metadatas", []):
                if metadata and "filename" in metadata:
                    filenames.add(metadata["filename"])
            
            # Build document list with full paths
            documents = []
            for filename in filenames:
                full_path = self.get_document_file_path(chat_id, filename)
                documents.append({
                    "filename": filename,
                    "full_path": full_path
                })
            
            return documents
            
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

    def debug_documents(self, chat_id: str) -> Dict[str, Any]:
        """
        Debug method to inspect document metadata in a chat.
        
        Args:
            chat_id: The chat ID to debug
            
        Returns:
            Dict with debug information
        """
        try:
            collection_name = self.get_collection_for_chat(chat_id)
            
            if not collection_name:
                return {"error": "No collection found for chat"}
            
            # Get all documents in the collection
            all_docs = self.vectorstore.similarity_search(
                query="",
                k=50  # Get up to 50 documents for debugging
            )
            
            debug_info = {
                "chat_id": chat_id,
                "collection_name": collection_name,
                "total_documents": len(all_docs),
                "sample_metadata": []
            }
            
            # Show metadata from first 10 documents
            for i, doc in enumerate(all_docs[:10]):
                debug_info["sample_metadata"].append({
                    "index": i,
                    "metadata": doc.metadata,
                    "content_preview": doc.page_content[:100] + "..." if len(doc.page_content) > 100 else doc.page_content
                })
            
            return debug_info
            
        except Exception as e:
            return {"error": f"Debug error: {str(e)}"}

    def get_document_content(self, chat_id: str, filename: str) -> Optional[str]:
        """
        Get the raw content of a specific document for preview.
        
        Args:
            chat_id: The chat ID containing the document
            filename: The filename to get content for
            
        Returns:
            str: The document content if found, None otherwise
        """
        try:
            collection_name = self.get_collection_for_chat(chat_id)
            
            if not collection_name:
                logger.warning(f"No collection found for chat {chat_id}")
                return None
            
            # Query the vectorstore for documents with matching filename and chat_id
            # Try multiple metadata field names with proper chat filtering
            results = None
            
            # Try source_filename first (what we actually set) with chat_id filter
            try:
                results = self.vectorstore.similarity_search(
                    query="",
                    k=100,
                    filter={"source_filename": filename, "chat_id": chat_id}
                )
            except:
                pass
            
            # If no results, try filename field with chat_id filter
            if not results:
                try:
                    results = self.vectorstore.similarity_search(
                        query="",
                        k=100,
                        filter={"filename": filename, "chat_id": chat_id}
                    )
                except:
                    pass
            
            # If filtering doesn't work, get all documents and filter manually
            if not results:
                try:
                    all_docs = self.vectorstore.similarity_search(
                        query="",
                        k=1000  # Get many documents
                    )
                    results = [doc for doc in all_docs 
                             if (doc.metadata.get('chat_id') == chat_id and
                                 (doc.metadata.get('source_filename') == filename or
                                  doc.metadata.get('filename') == filename))]
                except:
                    results = []
            
            if not results:
                logger.warning(f"Document {filename} not found in chat {chat_id}")
                return None
            
            # Combine all chunks for this document
            content_chunks = []
            for doc in results:
                # Check if this document matches our filename using multiple metadata fields
                doc_source = (doc.metadata.get('source_filename', '') or 
                            doc.metadata.get('source', '') or 
                            doc.metadata.get('filename', ''))
                
                # More flexible matching
                if (filename == doc_source or 
                    filename in doc_source or 
                    doc_source in filename or
                    filename.lower() == doc_source.lower()):
                    content_chunks.append(doc.page_content)
            
            if not content_chunks:
                # If no chunks found with metadata matching, try to get all chunks for debugging
                logger.warning(f"No content chunks found for {filename}")
                logger.debug(f"Available documents in results: {[doc.metadata for doc in results[:5]]}")
                return None
            
            # Join all chunks to reconstruct the document
            full_content = '\n\n'.join(content_chunks)
            logger.info(f"Retrieved content for {filename}: {len(full_content)} characters")
            
            return full_content
            
        except Exception as e:
            logger.error(f"Error getting document content for {filename}: {e}")
            return None

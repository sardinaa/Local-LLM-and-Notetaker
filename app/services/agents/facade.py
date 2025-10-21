"""
Chat Agent Facade

High-level interface for chat agent operations.
Coordinates between storage, retrieval, knowledge, and LLM modules.
"""

import logging
import os
from typing import Dict, Any, List, Optional, Generator

from .base import AgentConfig
from .chat_agent import ChatAgentManager
from .knowledge import ChatKnowledgeManager, KnowledgeIngestionError
from .retrieval import ChatRetrieval
from .llm import ChatLLM, LLMError
from .vector_store import VectorStoreManager
from .storage import AgentStorage
from .config import get_config
from app.agents.intent_classifier import IntentClassifier
from app.agents.rag_graph_executor import RAGGraphExecutor

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
        
        # Initialize LangGraph components
        def llm_caller(model_name, prompt, temperature=0.1, max_tokens=10):
            """LLM caller for intent classifier."""
            try:
                import requests
                resp = requests.post(
                    f"{ollama_url}/api/generate",
                    json={"model": model_name, "prompt": prompt, "stream": False},
                    timeout=30
                )
                if resp.ok:
                    return resp.json().get('response', '').strip()
            except Exception as e:
                logger.error(f"LLM call failed: {e}")
            return ""
        
        self.intent_classifier = IntentClassifier(llm_caller=llm_caller)
        self.graph_executor = RAGGraphExecutor(
            intent_classifier=self.intent_classifier,
            retrieval=self.retrieval,
            llm=self.llm,
            vector_store_manager=self.vector_store_manager
        )
        
        logger.info(f"Initialized ChatAgentFacade with model: {default_model} (LangGraph enabled)")
    
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
        model: Optional[str] = None,
        force_search: bool = False
    ) -> Dict[str, Any]:
        """
        Query chat agent with question.
        
        Args:
            chat_id: Chat identifier
            query: User question
            conversation_history: Optional conversation history
            model: Optional model override
            force_search: Whether to force web search regardless of content
            
        Returns:
            Dict with response and metadata
        """
        try:
            # Get or create agent
            config = self.agent_manager.get_or_create_agent(chat_id)
            
            # Perform web search if forced
            web_search_results = []
            if force_search:
                logger.info(f"[ChatAgentFacade] ✓ Web search FORCED by user (non-streaming)")
                try:
                    from app.integrations.search_engines.multi_engine import MultiEngineSearch
                    from app.config.search_config import SearchConfig
                    import asyncio
                    
                    multi_search = MultiEngineSearch(
                        brave_api_key=SearchConfig.BRAVE_API_KEY,
                        mojeek_api_key=SearchConfig.MOJEEK_API_KEY,
                        searxng_url=SearchConfig.SEARXNG_URL,
                        yacy_url=SearchConfig.YACY_URL,
                        enable_qwant=SearchConfig.ENABLE_QWANT,
                        enable_fallback=SearchConfig.ENABLE_FALLBACK,
                        domain_filter_list=SearchConfig.DOMAIN_FILTER_LIST,
                        concurrent_requests=SearchConfig.CONCURRENT_REQUESTS,
                        result_count=SearchConfig.DEFAULT_RESULT_COUNT
                    )
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        results, engine_used = loop.run_until_complete(
                            multi_search.search(query, max_results=SearchConfig.MAX_RESULTS, min_results=SearchConfig.MIN_RESULTS)
                        )
                        web_search_results = results
                        logger.info(f"[ChatAgentFacade] Web search found {len(results)} results using {engine_used}")
                    finally:
                        loop.close()
                except Exception as e:
                    logger.error(f"[ChatAgentFacade] Web search failed: {e}")
            
            # Retrieve relevant context
            retrieved_docs = self.retrieval.retrieve(
                chat_id=chat_id,
                query=query,
                agent_config=config
            )
            
            # Format document context
            document_context = self.retrieval.format_context(retrieved_docs)
            
            # Add web search context if available
            if web_search_results:
                web_context = "\n\n=== WEB SEARCH RESULTS ===\n"
                web_context += "Use the following current information from the web to answer the user's question:\n\n"
                
                for i, result in enumerate(web_search_results, 1):
                    title = result.get('title', 'Unknown')
                    url = result.get('url', 'N/A')
                    # Search results have 'text' field (snippet), not 'content'
                    snippet = result.get('text', result.get('content', ''))
                    quality = result.get('quality_score', 0.5)
                    
                    web_context += f"Source {i} (Quality: {quality:.1f}/1.0): {title}\n"
                    web_context += f"URL: {url}\n"
                    web_context += f"Content: {snippet}\n\n"
                
                web_context += "IMPORTANT: Base your answer primarily on these web search results. "
                web_context += "Reference the information naturally in your response, but do NOT include a 'Sources' or 'References' section at the end. "
                web_context += "The sources will be displayed automatically in a separate panel.\n\n"
                
                document_context = (document_context + "\n" + web_context) if document_context else web_context
            
            # Generate response
            response = self.llm.generate_response(
                query=query,
                document_context=document_context,
                conversation_history=conversation_history or [],
                agent_config=config,
                model=model
            )
            
            # Combine RAG sources with web search results
            all_sources = [
                {
                    "source": doc.metadata.get('source', 'Unknown'),
                    "source_type": doc.metadata.get('source_type', 'document'),
                    "page": doc.metadata.get('page'),
                    "chunk_id": doc.metadata.get('chunk_id'),
                    "text": doc.page_content,  # FULL text for accurate highlighting
                }
                for doc in retrieved_docs
            ]
            
            # Add web search results
            if web_search_results:
                for result in web_search_results:
                    all_sources.append({
                        "source": result.get("title", "Web Search Result"),
                        "source_type": "web",
                        "url": result.get("url", ""),
                        "text": result.get("text", result.get("content", ""))[:500],  # Use 'text' field from search results
                        "search_engine": result.get("search_engine", "unknown")
                    })
            
            return {
                "success": True,
                "response": response,
                "sources": all_sources,
                "num_sources": len(all_sources),
                "used_web_search": bool(web_search_results),
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
        
        ENHANCED: Now uses IntentClassifier to determine if RAG is needed.
        
        Args:
            chat_id: Chat identifier
            query: User question
            conversation_history: Optional conversation history
            model: Optional model override
            
        Yields:
            str: Response chunks
            
        Note: Use query_stream_with_metadata() if you need RAG usage info
        """
        for chunk in self.query_stream_with_metadata(chat_id, query, conversation_history, model):
            if isinstance(chunk, str):
                yield chunk
    
    def query_stream_with_metadata(
        self,
        chat_id: str,
        query: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        model: Optional[str] = None,
        force_search: bool = False
    ) -> Generator[Any, None, None]:
        """
        Query chat agent with streaming response and metadata.
        
        ENHANCED: Now uses IntentClassifier to determine if RAG is needed, AND supports force_search for web search.
        Yields chunks and ends with metadata about the query.
        
        Args:
            chat_id: Chat identifier
            query: User question
            conversation_history: Optional conversation history
            model: Optional model override
            force_search: Whether to force web search regardless of content
            
        Yields:
            str: Response chunks (text)
            dict: Final metadata (last yield) with keys: used_rag, sources, retrieved_docs, used_web_search
        """
        
        # === GRAPH EXECUTOR PATH ===
        # If enabled, use the graph executor which includes conversation memory, refinement, etc.
        use_graph_executor = os.getenv('USE_GRAPH_EXECUTOR_FOR_STREAMING', 'true').lower() == 'true'
        
        if use_graph_executor:
            logger.info(f"[ChatAgentFacade] Using LangGraph executor for streaming (memory enabled)")
            try:
                # Use graph executor (non-streaming, but we can simulate streaming)
                result = self.graph_executor.query(
                    chat_id=chat_id,
                    query=query,
                    max_iterations=3
                )
                
                # Yield the answer as a single chunk (simulated streaming)
                answer = result.get('answer', '')
                yield answer
                
                # Format sources for frontend
                sources = []
                retrieved_docs = result.get('retrieved_docs', [])
                web_search_results = result.get('web_search_results', [])
                
                # Add RAG document sources
                for doc in retrieved_docs:
                    if hasattr(doc, 'page_content'):
                        sources.append({
                            "source": doc.metadata.get('source', 'Unknown'),
                            "source_type": doc.metadata.get('source_type', 'document'),
                            "page": doc.metadata.get('page'),
                            "chunk_id": doc.metadata.get('chunk_id'),
                            "text": doc.page_content,
                        })
                    elif isinstance(doc, dict):
                        sources.append({
                            "source": doc.get('source', 'Unknown'),
                            "source_type": doc.get('source_type', 'document'),
                            "page": doc.get('page'),
                            "chunk_id": doc.get('chunk_id'),
                            "text": doc.get('text', doc.get('page_content', '')),
                        })
                
                # Add web search results as sources
                for result_item in web_search_results:
                    sources.append({
                        "source": result_item.get("title", "Web Search Result"),
                        "source_type": "web",
                        "url": result_item.get("url", ""),
                        "text": result_item.get("snippet", result_item.get("text", ""))[:500],
                        "search_engine": result_item.get("source", "unknown")
                    })
                
                # Yield final metadata
                yield {
                    "used_rag": result.get('used_rag', False),
                    "sources": sources,
                    "retrieved_docs": retrieved_docs,
                    "used_web_search": result.get('used_web_search', False),
                    "intent": result.get('intent', 'unknown'),
                    "used_multihop": result.get('used_multihop', False),
                    "sub_queries": result.get('sub_queries', []),
                }
                return
            
            except Exception as e:
                logger.error(f"[ChatAgentFacade] Graph executor failed: {e}")
                import traceback
                logger.error(traceback.format_exc())
                # Fall through to traditional path
        
        # === TRADITIONAL RAG PATH ===
        # (Original implementation follows)
        try:
            # Initialize variables that will be used in final yield
            # (must be initialized before any code path that might raise exception)
            web_search_results = []
            retrieved_docs = []
            needs_rag = False
            classification_result = None
            document_context = ""
            
            # Get or create agent
            config = self.agent_manager.get_or_create_agent(chat_id)
            
            # === CHECK IF DOCUMENTS EXIST ===
            # Get knowledge stats to see if there are any documents uploaded
            knowledge_stats = self.agent_manager.get_knowledge_stats(chat_id)
            has_documents = (
                knowledge_stats.get('num_documents', 0) > 0 or 
                knowledge_stats.get('num_links', 0) > 0 or
                knowledge_stats.get('total_chunks', 0) > 0
            )
            
            logger.info(f"[ChatAgentFacade] Chat '{chat_id}' has documents: {has_documents}")
            
            # === FAST PATH: If force_search is enabled, skip classification ===
            if force_search:
                logger.info(f"[ChatAgentFacade] ✓ Web search FORCED → Skipping intent classification")
                needs_rag = False
                classification_result = None
                web_search_results = []
                
                # Perform web search immediately
                try:
                    from app.integrations.search_engines.multi_engine import MultiEngineSearch
                    from app.config.search_config import SearchConfig
                    import asyncio
                    
                    multi_search = MultiEngineSearch(
                        brave_api_key=SearchConfig.BRAVE_API_KEY,
                        mojeek_api_key=SearchConfig.MOJEEK_API_KEY,
                        searxng_url=SearchConfig.SEARXNG_URL,
                        yacy_url=SearchConfig.YACY_URL,
                        enable_qwant=SearchConfig.ENABLE_QWANT,
                        enable_fallback=SearchConfig.ENABLE_FALLBACK,
                        domain_filter_list=SearchConfig.DOMAIN_FILTER_LIST,
                        concurrent_requests=SearchConfig.CONCURRENT_REQUESTS,
                        result_count=SearchConfig.DEFAULT_RESULT_COUNT
                    )
                    
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        results, engine_used = loop.run_until_complete(
                            multi_search.search(query, max_results=SearchConfig.MAX_RESULTS, min_results=SearchConfig.MIN_RESULTS)
                        )
                        web_search_results = results
                        logger.info(f"[ChatAgentFacade] ✓ Web search found {len(results)} results using {engine_used}")
                    finally:
                        loop.close()
                except Exception as e:
                    logger.error(f"[ChatAgentFacade] ✗ Web search failed: {e}")
                    web_search_results = []
                
                # Skip to response generation
                retrieved_docs = []
                document_context = ""
            else:
                # === INTELLIGENT INTENT CLASSIFICATION ===
                # Determine if this query needs document retrieval
                from app.agents.intent_classifier import IntentClassifier
            
                # Create a simple LLM caller for the classifier
                def simple_llm_caller(model_name, prompt, temperature=0.1, max_tokens=10):
                    import requests
                    import os
                    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
                    try:
                        resp = requests.post(
                            f"{ollama_url}/api/generate",
                            json={"model": model_name, "prompt": prompt, "stream": False},
                            timeout=30
                        )
                        if resp.ok:
                            return resp.json().get('response', '').strip()
                    except Exception as e:
                        logger.error(f"LLM call failed: {e}")
                    return ""
                
                classifier = IntentClassifier(llm_caller=simple_llm_caller)
                
                # Create a simple retrieval function for the classifier
                # This allows the classifier to do semantic search to check document relevance
                def simple_retrieval_for_classification(query_text: str, k: int = 3, min_similarity: float = 0.3):
                    """
                    Simple semantic search for classification purposes.
                    Returns list of dicts with content, metadata, and similarity.
                    """
                    try:
                        vector_store = self.vector_store_manager.get_chat_store(chat_id)
                        
                        # Use similarity_search_with_score if available, otherwise fallback
                        try:
                            # Try to get results with scores
                            results_with_scores = vector_store.similarity_search_with_score(query_text, k=k)
                            
                            # Filter by min_similarity and format results
                            formatted_results = []
                            for doc, score in results_with_scores:
                                # ChromaDB uses distance (lower is better), convert to similarity
                                # Assuming L2 distance: similarity = 1 / (1 + distance)
                                similarity = 1.0 / (1.0 + score) if score >= 0 else 0.0
                                
                                if similarity >= min_similarity:
                                    formatted_results.append({
                                        'content': doc.page_content,
                                        'metadata': doc.metadata,
                                        'similarity': similarity
                                    })
                            
                            return formatted_results
                        
                        except AttributeError:
                            # Fallback: similarity_search without scores
                            results = vector_store.similarity_search(query_text, k=k)
                            # Return without similarity scores (classifier will handle gracefully)
                            return [{
                                'content': doc.page_content,
                                'metadata': doc.metadata,
                                'similarity': 0.5  # Neutral score when unavailable
                            } for doc in results]
                    
                    except Exception as e:
                        logger.warning(f"[ChatAgentFacade] Retrieval for classification failed: {e}")
                        return []
            
            # === LOAD DOCUMENT TERMS FOR STAGE 0 (BAG-OF-WORDS) ===
            # Extract document terms from vector store metadata for ultra-fast classification
            document_terms = None
            if has_documents:
                try:
                    vector_store = self.vector_store_manager.get_chat_store(chat_id)
                    # Try to get all documents to extract terms
                    # Use a dummy query to get some documents
                    sample_docs = vector_store.similarity_search("", k=100)
                    
                    if sample_docs:
                        # Extract unique terms from document metadata
                        all_terms = set()
                        for doc in sample_docs:
                            # Check if document has preprocessed terms in metadata
                            if 'bow_terms' in doc.metadata:
                                all_terms.update(doc.metadata['bow_terms'])
                            elif 'terms' in doc.metadata:
                                all_terms.update(doc.metadata['terms'])
                        
                        if all_terms:
                            document_terms = list(all_terms)
                            logger.info(f"[ChatAgentFacade] Loaded {len(document_terms)} document terms for Stage 0 classification")
                        else:
                            # Fallback: Extract terms from document content using proper preprocessing
                            # Use DocumentPreprocessor for lemmatization and better term extraction
                            from app.services.agents.document_preprocessor import DocumentPreprocessor
                            preprocessor = DocumentPreprocessor()
                            
                            for doc in sample_docs[:20]:  # Limit to first 20 docs for performance
                                content = doc.page_content
                                # Use preprocessor which handles lemmatization properly
                                doc_terms = preprocessor.extract_terms(content)
                                all_terms.update(doc_terms)
                            
                            document_terms = list(all_terms)[:1000]  # Increased limit for lemmatized terms
                            logger.info(f"[ChatAgentFacade] Extracted {len(document_terms)} lemmatized terms from document content (fallback)")
                
                except Exception as e:
                    logger.warning(f"[ChatAgentFacade] Failed to load document terms: {e}")
                    document_terms = None
                
                # Pass retrieval function AND document terms to classifier
                retrieval_func = simple_retrieval_for_classification if has_documents else None
                classification_result = classifier.classify(
                    query, 
                    retrieval_function=retrieval_func,
                    document_terms=document_terms  # Enable Stage 0!
                )
                
                logger.info(f"[ChatAgentFacade] Query: '{query[:50]}...'")
                logger.info(f"[ChatAgentFacade] Classification: {classification_result.label.upper()} "
                           f"(confidence: {classification_result.confidence:.2f}, method: {classification_result.method})")
                
                # Decide whether to use RAG based on classification AND document availability
                # If no documents exist, always use general knowledge
                # If documents exist and query is RETRIEVAL or AMBIGUOUS, use RAG
                if not has_documents:
                    needs_rag = False
                    logger.info(f"[ChatAgentFacade] No documents uploaded → Using general knowledge")
                elif classification_result.label == 'retrieval':
                    needs_rag = True
                    logger.info(f"[ChatAgentFacade] RETRIEVAL query + documents exist → Using RAG")
                elif classification_result.label == 'ambiguous':
                    needs_rag = True  # When ambiguous and docs exist, prefer RAG
                    logger.info(f"[ChatAgentFacade] AMBIGUOUS query + documents exist → Using RAG (prefer retrieval)")
                else:  # general
                    needs_rag = False
                    logger.info(f"[ChatAgentFacade] GENERAL query → Using general knowledge")
                
                # No web search in this path (web search is only in fast path when force_search=True)
                web_search_results = []
                
                if needs_rag:
                    logger.info(f"[ChatAgentFacade] Using RAG → Retrieving documents")
                    # Retrieve relevant context
                    retrieved_docs = self.retrieval.retrieve(
                        chat_id=chat_id,
                        query=query,
                        agent_config=config
                    )
                    
                    # Format document context
                    document_context = self.retrieval.format_context(retrieved_docs)
                    logger.info(f"[ChatAgentFacade] Retrieved {len(retrieved_docs)} documents")
                else:
                    logger.info(f"[ChatAgentFacade] No RAG needed → Answering with general knowledge")
                    document_context = ""
                    retrieved_docs = []
            
            # Add web search context if available (for both fast path and normal path)
            if web_search_results:
                web_context = "\n\n=== WEB SEARCH RESULTS ===\n"
                web_context += "Use the following current information from the web to answer the user's question:\n\n"
                
                for i, result in enumerate(web_search_results, 1):
                    title = result.get('title', 'Unknown')
                    url = result.get('url', 'N/A')
                    # Search results have 'text' field (snippet), not 'content'
                    snippet = result.get('text', result.get('content', ''))
                    quality = result.get('quality_score', 0.5)
                    
                    web_context += f"Source {i} (Quality: {quality:.1f}/1.0): {title}\n"
                    web_context += f"URL: {url}\n"
                    web_context += f"Content: {snippet}\n\n"
                
                web_context += "IMPORTANT: Base your answer primarily on these web search results. "
                web_context += "Reference the information naturally in your response, but do NOT include a 'Sources' or 'References' section at the end. "
                web_context += "The sources will be displayed automatically in a separate panel.\n\n"
                
                # Combine with document context
                if document_context:
                    document_context = document_context + "\n" + web_context
                else:
                    document_context = web_context
                
                logger.info(f"[ChatAgentFacade] Added {len(web_search_results)} web search results to context")
            
            # Generate streaming response
            for chunk in self.llm.generate_response_stream(
                query=query,
                document_context=document_context,
                conversation_history=conversation_history or [],
                agent_config=config,
                model=model
            ):
                yield chunk
            
            # Yield final metadata
            # Combine RAG documents with web search results in the correct format
            all_sources = [
                {
                    "source": doc.metadata.get('source', 'Unknown'),
                    "source_type": doc.metadata.get('source_type', 'document'),
                    "page": doc.metadata.get('page'),
                    "chunk_id": doc.metadata.get('chunk_id'),
                    "text": doc.page_content,  # FULL text for accurate highlighting
                }
                for doc in retrieved_docs
            ]
            
            # Add web search results as sources
            if web_search_results:
                for result in web_search_results:
                    all_sources.append({
                        "source": result.get("title", "Web Search Result"),
                        "source_type": "web",
                        "url": result.get("url", ""),
                        "text": result.get("text", result.get("content", ""))[:500],  # Use 'text' field from search results
                        "search_engine": result.get("search_engine", "unknown")
                    })
            
            yield {
                "used_rag": needs_rag,
                "used_web_search": bool(web_search_results),
                "retrieved_docs": retrieved_docs,
                "web_search_results": web_search_results,
                "sources": all_sources,  # Combined sources for frontend
                "classification": classification_result.label if classification_result else "web_search",
                "has_documents": has_documents
            }
            
        except Exception as e:
            logger.error(f"Error during streaming query: {e}")
            yield f"Error: {str(e)}"
            yield {"used_rag": False, "retrieved_docs": [], "sources": [], "error": str(e)}
    
    def query_with_graph(
        self,
        chat_id: str,
        query: str,
        max_iterations: int = 3,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Query using LangGraph-based adaptive RAG (non-streaming).
        
        Uses agentic approach with:
        - Adaptive chunk retrieval (4-15 based on scope)
        - Reflection loops (can re-retrieve if insufficient)
        - Full state tracking for debugging
        
        Args:
            chat_id: Chat identifier
            query: User query
            max_iterations: Max reflection iterations (default: 3)
            
        Returns:
            Dict with answer, metadata, and sources in frontend-compatible format
        """
        try:
            result = self.graph_executor.query(
                chat_id=chat_id,
                query=query,
                max_iterations=max_iterations
            )
            
            # Format sources for frontend (same format as traditional RAG)
            sources = []
            retrieved_docs = result.get('retrieved_docs', [])
            web_search_results = result.get('web_search_results', [])
            
            logger.info(f"[Facade] LangGraph returned {len(retrieved_docs)} documents and {len(web_search_results)} web results")
            
            # Add RAG document sources
            for doc in retrieved_docs:
                # Handle both Document objects and dict formats
                if hasattr(doc, 'page_content'):
                    # LangChain Document object
                    sources.append({
                        "source": doc.metadata.get('source', 'Unknown'),
                        "source_type": doc.metadata.get('source_type', 'document'),
                        "page": doc.metadata.get('page'),
                        "chunk_id": doc.metadata.get('chunk_id'),
                        "text": doc.page_content,  # FULL text for highlighting
                    })
                elif isinstance(doc, dict):
                    # Dict format
                    sources.append({
                        "source": doc.get('source', 'Unknown'),
                        "source_type": doc.get('source_type', 'document'),
                        "page": doc.get('page'),
                        "chunk_id": doc.get('chunk_id'),
                        "text": doc.get('text', doc.get('content', '')),
                    })
            
            # Add web search sources (with scraped content if available)
            for web_result in web_search_results:
                # Use scraped content if available, otherwise use snippet
                content = ''
                if web_result.get('has_scraped_content') and web_result.get('scraped_text'):
                    content = web_result.get('scraped_text', '')
                else:
                    content = web_result.get('snippet', '')
                
                sources.append({
                    "source": web_result.get('title', 'Web Search Result'),
                    "source_type": "web",
                    "url": web_result.get('url', ''),
                    "text": content,
                    "search_engine": web_result.get('source', 'unknown'),
                    "has_scraped_content": web_result.get('has_scraped_content', False)
                })
            
            logger.info(f"[Facade] Formatted {len(sources)} sources for frontend ({len(retrieved_docs)} docs + {len(web_search_results)} web)")
            
            return {
                'answer': result['answer'],
                'metadata': {
                    'used_rag': result.get('used_rag', False),
                    'used_web_search': result.get('used_web_search', False),
                    'intent': result['intent'],
                    'confidence': result.get('intent_confidence', 0.0),
                    'scope': result.get('scope', 'unknown'),
                    'iterations': result.get('iterations', 0),
                    'num_docs': result.get('num_docs', 0),
                    'method': 'langgraph',
                    'sources': sources  # Add sources to metadata for backward compatibility
                },
                'sources': sources,  # Top-level sources for frontend
                'debug_info': result.get('debug_info', {})
            }
            
        except Exception as e:
            logger.error(f"Graph query failed: {e}", exc_info=True)
            raise
    
    def query_with_graph_stream(
        self,
        chat_id: str,
        query: str,
        max_iterations: int = 3,
        **kwargs
    ) -> Generator[Any, None, None]:
        """
        Query using LangGraph-based adaptive RAG with true node-by-node streaming.
        
        Streams node execution updates in real-time, then streams the final answer.
        
        Args:
            chat_id: Chat identifier
            query: User query
            max_iterations: Max reflection iterations (default: 3)
            
        Yields:
            dict: Node updates with type='node', node name, and state info
            str: Answer text chunks
            dict: Final metadata with type='final'
        """
        try:
            # Stream graph execution node-by-node
            final_result = None
            
            for update in self.graph_executor.query_stream(
                chat_id=chat_id,
                query=query,
                max_iterations=max_iterations
            ):
                if update.get('type') == 'node':
                    # Yield node progress update
                    yield {
                        'type': 'node_update',
                        'node': update['node'],
                        'data': update['state']
                    }
                elif update.get('type') == 'final':
                    # Store final result for processing
                    final_result = update
                elif update.get('type') == 'error':
                    # Yield error
                    yield {
                        'type': 'error',
                        'error': update.get('error', 'Unknown error')
                    }
                    return
            
            if not final_result:
                yield {
                    'type': 'error',
                    'error': 'No final result received from graph'
                }
                return
            
            # Stream the answer in chunks
            answer = final_result.get('answer', '')
            words = answer.split(' ')
            chunk_size = 3
            
            for i in range(0, len(words), chunk_size):
                chunk_words = words[i:i+chunk_size]
                chunk_text = ' '.join(chunk_words)
                
                if i > 0:
                    chunk_text = ' ' + chunk_text
                    
                yield chunk_text
            
            # Format sources for frontend
            sources = []
            retrieved_docs = final_result.get('retrieved_docs', [])
            web_search_results = final_result.get('web_search_results', [])
            
            logger.info(f"[Facade] LangGraph returned {len(retrieved_docs)} documents and {len(web_search_results)} web results")
            
            # Add RAG document sources
            for doc in retrieved_docs:
                if hasattr(doc, 'page_content'):
                    sources.append({
                        "source": doc.metadata.get('source', 'Unknown'),
                        "source_type": doc.metadata.get('source_type', 'document'),
                        "page": doc.metadata.get('page'),
                        "chunk_id": doc.metadata.get('chunk_id'),
                        "text": doc.page_content,
                    })
                elif isinstance(doc, dict):
                    sources.append({
                        "source": doc.get('source', 'Unknown'),
                        "source_type": doc.get('source_type', 'document'),
                        "page": doc.get('page'),
                        "chunk_id": doc.get('chunk_id'),
                        "text": doc.get('text', doc.get('content', '')),
                    })
            
            # Add web search sources
            for web_result in web_search_results:
                content = ''
                if web_result.get('has_scraped_content') and web_result.get('scraped_text'):
                    content = web_result.get('scraped_text', '')
                else:
                    content = web_result.get('snippet', '')
                
                sources.append({
                    "source": web_result.get('title', 'Web Search Result'),
                    "source_type": "web",
                    "url": web_result.get('url', ''),
                    "text": content,
                    "search_engine": web_result.get('source', 'unknown'),
                    "has_scraped_content": web_result.get('has_scraped_content', False)
                })
            
            logger.info(f"[Facade] Formatted {len(sources)} sources for frontend ({len(retrieved_docs)} docs + {len(web_search_results)} web)")
            
            # Yield final metadata
            yield {
                'done': True,
                'used_rag': final_result.get('used_rag', False),
                'used_web_search': final_result.get('used_web_search', False),
                'sources': sources,
                'metadata': {
                    'intent': final_result.get('intent', 'unknown'),
                    'confidence': final_result.get('intent_confidence', 0.0),
                    'scope': final_result.get('scope', 'unknown'),
                    'iterations': final_result.get('iterations', 0),
                    'num_docs': final_result.get('num_docs', 0),
                    'method': 'langgraph',
                    'used_multihop': final_result.get('used_multihop', False),
                    'sub_queries': final_result.get('sub_queries', []),
                },
                'debug_info': final_result.get('debug_info', {})
            }
            
        except Exception as e:
            logger.error(f"Graph streaming query failed: {e}", exc_info=True)
            # Yield error message as text first
            yield f"Error: {str(e)}"
            # Then yield error metadata
            yield {
                'done': True,
                'error': str(e),
                'used_rag': False,
                'used_web_search': False,
                'sources': [],
                'metadata': {
                    'intent': 'error',
                    'method': 'langgraph'
                }
            }
    
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

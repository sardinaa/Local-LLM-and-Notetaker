"""
Hybrid Retrieval for Chat Agents

Implements sophisticated retrieval strategies combining keyword and semantic search.
"""

import logging
import re
from typing import List, Dict, Any, Tuple
from collections import Counter

from .base import AgentConfig, SearchStrategy
from .vector_store import VectorStoreManager, VECTOR_STORE_AVAILABLE

logger = logging.getLogger(__name__)

if VECTOR_STORE_AVAILABLE:
    from langchain_core.documents import Document


class ChatRetrieval:
    """
    Handles document retrieval for chat agents using hybrid strategies.
    """
    
    def __init__(self, vector_store_manager: VectorStoreManager):
        """
        Initialize retrieval system.
        
        Args:
            vector_store_manager: Vector store manager instance
        """
        if not VECTOR_STORE_AVAILABLE:
            raise RuntimeError("Vector store dependencies not available")
        
        self.vector_store_manager = vector_store_manager
        logger.info("Initialized ChatRetrieval")
    
    def retrieve(
        self,
        chat_id: str,
        query: str,
        agent_config: AgentConfig
    ) -> List[Document]:
        """
        Retrieve relevant documents using configured strategy.
        
        Args:
            chat_id: Chat identifier
            query: Search query
            agent_config: Agent configuration
            
        Returns:
            List of relevant documents
        """
        strategy = agent_config.retrieval.search_strategy
        top_k = agent_config.retrieval.top_k
        
        if strategy == SearchStrategy.KEYWORD:
            return self._keyword_search(chat_id, query, top_k)
        elif strategy == SearchStrategy.SEMANTIC:
            return self._semantic_search(chat_id, query, top_k)
        else:  # HYBRID
            return self._hybrid_search(chat_id, query, top_k, agent_config)
    
    def _semantic_search(
        self,
        chat_id: str,
        query: str,
        top_k: int
    ) -> List[Document]:
        """
        Perform semantic similarity search.
        
        Args:
            chat_id: Chat identifier
            query: Search query
            top_k: Number of results to return
            
        Returns:
            List of documents
        """
        try:
            vector_store = self.vector_store_manager.get_chat_store(chat_id)
            results = vector_store.similarity_search(query, k=top_k)
            logger.info(f"Semantic search returned {len(results)} results for chat {chat_id}")
            return results
        except Exception as e:
            logger.error(f"Semantic search failed for chat {chat_id}: {e}")
            return []
    
    def _keyword_search(
        self,
        chat_id: str,
        query: str,
        top_k: int
    ) -> List[Document]:
        """
        Perform keyword-based search.
        
        Args:
            chat_id: Chat identifier
            query: Search query
            top_k: Number of results to return
            
        Returns:
            List of documents with scores
        """
        try:
            # Extract keywords from query
            keywords = self._extract_keywords(query)
            
            if not keywords:
                logger.warning("No keywords extracted, falling back to semantic search")
                return self._semantic_search(chat_id, query, top_k)
            
            # Get all documents from vector store
            vector_store = self.vector_store_manager.get_chat_store(chat_id)
            collection = vector_store._collection
            all_docs = collection.get()
            
            if not all_docs or 'documents' not in all_docs:
                return []
            
            # Score documents by keyword frequency
            scored_docs = []
            for i, text in enumerate(all_docs['documents']):
                score = self._calculate_keyword_score(text, keywords)
                if score > 0:
                    metadata = all_docs['metadatas'][i] if 'metadatas' in all_docs else {}
                    doc = Document(
                        page_content=text,
                        metadata=metadata or {}
                    )
                    scored_docs.append((doc, score))
            
            # Sort by score and return top_k
            scored_docs.sort(key=lambda x: x[1], reverse=True)
            results = [doc for doc, score in scored_docs[:top_k]]
            
            logger.info(f"Keyword search returned {len(results)} results for chat {chat_id}")
            return results
            
        except Exception as e:
            logger.error(f"Keyword search failed for chat {chat_id}: {e}")
            return []
    
    def _hybrid_search(
        self,
        chat_id: str,
        query: str,
        top_k: int,
        agent_config: AgentConfig
    ) -> List[Document]:
        """
        Perform hybrid search combining keyword and semantic approaches.
        
        Args:
            chat_id: Chat identifier
            query: Search query
            top_k: Number of results to return
            agent_config: Agent configuration
            
        Returns:
            List of documents
        """
        try:
            # Get more candidates than needed for reranking
            candidate_k = top_k * 2
            
            # Perform both searches
            semantic_results = self._semantic_search(chat_id, query, candidate_k)
            keyword_results = self._keyword_search(chat_id, query, candidate_k)
            
            # Combine and deduplicate
            seen_content = set()
            combined = []
            
            # Add semantic results first (usually more relevant)
            for doc in semantic_results:
                content_hash = hash(doc.page_content)
                if content_hash not in seen_content:
                    seen_content.add(content_hash)
                    combined.append(doc)
            
            # Add keyword results that aren't duplicates
            for doc in keyword_results:
                content_hash = hash(doc.page_content)
                if content_hash not in seen_content:
                    seen_content.add(content_hash)
                    combined.append(doc)
            
            # Rerank if enabled
            if agent_config.retrieval.enable_reranking and len(combined) > top_k:
                combined = self._rerank(query, combined, top_k)
            else:
                combined = combined[:top_k]
            
            logger.info(f"Hybrid search returned {len(combined)} results for chat {chat_id}")
            return combined
            
        except Exception as e:
            logger.error(f"Hybrid search failed for chat {chat_id}: {e}")
            # Fallback to semantic search
            return self._semantic_search(chat_id, query, top_k)
    
    def _extract_keywords(self, text: str) -> List[str]:
        """
        Extract keywords from text.
        
        Args:
            text: Input text
            
        Returns:
            List of keywords
        """
        # Convert to lowercase
        text = text.lower()
        
        # Remove punctuation and split
        words = re.findall(r'\b\w+\b', text)
        
        # Remove common stop words
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
            'when', 'where', 'why', 'how'
        }
        
        keywords = [w for w in words if w not in stop_words and len(w) > 2]
        return keywords
    
    def _calculate_keyword_score(self, text: str, keywords: List[str]) -> float:
        """
        Calculate keyword match score for text.
        
        Args:
            text: Document text
            keywords: List of keywords to match
            
        Returns:
            float: Score
        """
        text_lower = text.lower()
        text_words = re.findall(r'\b\w+\b', text_lower)
        word_counts = Counter(text_words)
        
        # Calculate score based on keyword frequency
        score = 0.0
        for keyword in keywords:
            if keyword in word_counts:
                # TF-style scoring
                frequency = word_counts[keyword]
                score += frequency
        
        return score
    
    def _rerank(
        self,
        query: str,
        documents: List[Document],
        top_k: int
    ) -> List[Document]:
        """
        Rerank documents based on relevance to query.
        
        Simple reranking based on keyword overlap and position.
        
        Args:
            query: Search query
            documents: Documents to rerank
            top_k: Number of results to return
            
        Returns:
            Reranked documents
        """
        keywords = self._extract_keywords(query)
        
        if not keywords:
            return documents[:top_k]
        
        # Score each document
        scored = []
        for doc in documents:
            # Base score from keyword matches
            keyword_score = self._calculate_keyword_score(doc.page_content, keywords)
            
            # Bonus for keywords appearing early in document
            text_lower = doc.page_content.lower()
            position_bonus = 0.0
            for keyword in keywords:
                pos = text_lower.find(keyword)
                if pos != -1:
                    # Earlier positions get higher bonus
                    position_bonus += (1.0 / (pos + 1)) * 10
            
            total_score = keyword_score + position_bonus
            scored.append((doc, total_score))
        
        # Sort by score
        scored.sort(key=lambda x: x[1], reverse=True)
        
        return [doc for doc, score in scored[:top_k]]
    
    def format_context(self, documents: List[Document]) -> str:
        """
        Format retrieved documents into context string.
        
        Args:
            documents: Retrieved documents
            
        Returns:
            Formatted context string
        """
        if not documents:
            return "No relevant context found."
        
        context_parts = []
        for i, doc in enumerate(documents, 1):
            source = doc.metadata.get('source', 'Unknown')
            source_type = doc.metadata.get('source_type', 'document')
            
            context_parts.append(
                f"[{i}] Source: {source} ({source_type})\n{doc.page_content}\n"
            )
        
        return "\n---\n".join(context_parts)

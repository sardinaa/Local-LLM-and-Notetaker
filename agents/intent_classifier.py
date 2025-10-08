"""
Production-ready intent classification for query routing.

Three-stage intelligent classification:
1. Bag-of-Words Stage (<1ms): Ultra-fast term overlap check - resolves ~60% of queries
2. Semantic Search Stage (~50-100ms): Context-aware document similarity - resolves ~30% of queries  
3. LLM Stage (~100-300ms): Intelligent classification with bag-of-words context - handles remaining ~10%

The system is multilingual and progressively refines classification.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable
import logging

logger = logging.getLogger(__name__)


@dataclass
class ClassificationResult:
    """Result of intent classification."""
    label: str  # 'retrieval', 'general', or 'ambiguous'
    confidence: float  # 0.0 to 1.0
    score: float  # Raw score
    hits: List[Dict[str, Any]]  # Details of what triggered the classification
    debug: Dict[str, Any] = field(default_factory=dict)
    method: str = 'unknown'  # Which classification method was used
    
    # Additional fields for semantic search results (for LLM context)
    semantic_results: List[Dict[str, Any]] = field(default_factory=list)
    max_similarity: float = 0.0


class IntentClassifier:
    """
    Intelligent three-stage intent classifier.
    
    Stage 0: Bag-of-Words - Ultra-fast term overlap (<1ms)
    Stage 1: Semantic Search - Context-aware similarity (50-100ms)
    Stage 2: LLM - Intelligent decision with bag-of-words context (100-300ms)
    """
    
    def __init__(
        self,
        llm_caller: Optional[Callable] = None,
    ):
        """
        Initialize the intent classifier.
        
        Args:
            llm_caller: Optional LLM caller function for Stage 2
        """
        self.llm_caller = llm_caller
        
        # Basic stopwords for bag-of-words stage
        self.stopwords = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
            'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'should', 'could', 'may', 'might', 'can', 'this', 'that',
        }
        
        # Cache preprocessor instance to avoid recreation
        self._preprocessor = None
    
    def classify(
        self, 
        query: str, 
        retrieval_function: Optional[callable] = None,
        document_terms: Optional[List[str]] = None
    ) -> ClassificationResult:
        """
        Classify query intent using three-stage intelligent approach.
        
        Stage 0 (Bag-of-Words): Check term overlap with document terms
           - High overlap (>60%) → RETRIEVAL (confident)
           - Low overlap (<20%) → GENERAL (confident)
           - Medium (20-60%) → AMBIGUOUS → proceed to Stage 1
        
        Stage 1 (Semantic Search): Check if query matches user's uploaded documents
           - High similarity (>0.7) → RETRIEVAL (confident)
           - Low similarity (<0.3) → GENERAL (confident)
           - Medium (0.3-0.7) → AMBIGUOUS → proceed to Stage 2
        
        Stage 2 (LLM): Ask LLM with bag-of-words context to classify
           - Returns RETRIEVAL or GENERAL with high confidence
        
        Args:
            query: User query to classify
            retrieval_function: Optional function that performs semantic search
                               Should accept (query, k, min_similarity) and return List[Dict]
            document_terms: Optional list of terms from user's documents (for bag-of-words classification)
        """
        logger.info(f"[IntentClassifier] Classifying query: '{query}'")
        
        if not query or not query.strip():
            logger.info("[IntentClassifier] Empty query, returning general")
            return ClassificationResult(
                label='general',
                confidence=1.0,
                score=0.0,
                hits=[],
                debug={'reason': 'empty_query'},
                method='empty_check'
            )
        
        # Stage 0: Bag-of-Words Pre-filter (ULTRA FAST - <1ms)
        # Check term overlap before doing expensive semantic search
        if document_terms:
            logger.debug("[IntentClassifier] Stage 0: Bag-of-words term overlap check (ULTRA FAST)...")
            bow_result = self._bag_of_words_classify(query, document_terms)
            if bow_result:
                if bow_result.label in ['retrieval', 'general']:
                    # Confident decision from bag-of-words
                    logger.info(f"[IntentClassifier] Stage 0 CONFIDENT: Bag-of-words → {bow_result.label.upper()} (confidence: {bow_result.confidence:.2f}, overlap: {bow_result.score:.1%})")
                    return bow_result
                else:
                    # AMBIGUOUS - continue to semantic search
                    logger.info(f"[IntentClassifier] Stage 0 AMBIGUOUS: Medium overlap ({bow_result.score:.1%}) → Proceeding to Stage 1")
        else:
            logger.debug("[IntentClassifier] Stage 0: Document terms not available, skipping bag-of-words")
        
        # Stage 1: Context-Aware Semantic Search
        # This checks if the query actually relates to user's uploaded documents
        if retrieval_function:
            logger.debug("[IntentClassifier] Stage 1: Context-aware semantic search...")
            semantic_result = self._semantic_search_classify(query, retrieval_function)
            if semantic_result:
                if semantic_result.label in ['retrieval', 'general']:
                    # Confident decision from semantic search
                    logger.info(f"[IntentClassifier] Stage 1 CONFIDENT: Semantic search → {semantic_result.label.upper()} (confidence: {semantic_result.confidence:.2f}, similarity: {semantic_result.max_similarity:.3f})")
                    return semantic_result
                else:
                    # AMBIGUOUS - need LLM with context (Stage 2)
                    logger.info(f"[IntentClassifier] Stage 1 AMBIGUOUS: Medium similarity ({semantic_result.max_similarity:.3f}) → Proceeding to LLM Stage 2")
                    # Extract document content for LLM context
                    doc_context = self._extract_document_context(semantic_result.semantic_results)
            else:
                doc_context = None
                logger.debug("[IntentClassifier] Stage 1: Semantic search returned None")
        else:
            logger.debug("[IntentClassifier] Stage 1: Semantic search not available (no retrieval function)")
            doc_context = None
        
        # Stage 2: LLM with Bag-of-Words Context
        # For ambiguous cases from Stage 0/1, or when semantic search not available
        if self.llm_caller:
            logger.debug("[IntentClassifier] Stage 2: Using LLM classification with context...")
            
            # Build context about available document terms
            bow_context = None
            if document_terms:
                # Sample of terms for LLM context
                sample_terms = document_terms[:50] if len(document_terms) > 50 else document_terms
                bow_context = f"User's document contains these terms: {', '.join(sample_terms)}"
            
            llm_result = self._llm_classify(query, bow_context=bow_context, doc_context=doc_context)
            if llm_result:
                logger.info(f"[IntentClassifier] Stage 2 SUCCESS: LLM classified as → {llm_result.label.upper()} (confidence: {llm_result.confidence:.2f})")
                return llm_result
            else:
                logger.warning("[IntentClassifier] Stage 2: LLM classification failed")
        else:
            logger.debug("[IntentClassifier] Stage 2: LLM caller not available, skipping")
        
        # Fallback: Return GENERAL with low confidence
        logger.warning("[IntentClassifier] All stages failed or unavailable, falling back to GENERAL")
        return ClassificationResult(
            label='general',
            confidence=0.5,
            score=0.0,
            hits=[],
            debug={'reason': 'all_stages_failed_or_unavailable'},
            method='fallback'
        )
    
    def _bag_of_words_classify(
        self,
        query: str,
        document_terms: List[str]
    ) -> Optional[ClassificationResult]:
        """
        Ultra-fast bag-of-words classification based on term overlap.
        
        This is Stage 0 - the fastest classification method (<1ms).
        Compares query terms against pre-computed document terms.
        
        Strategy:
        - High overlap (>60%) → RETRIEVAL (query contains many document terms)
        - Low overlap (<20%) → GENERAL (query terms not in documents)
        - Medium (20-60%) → AMBIGUOUS (needs semantic search or LLM)
        
        Args:
            query: User query to classify
            document_terms: List of normalized terms from user's documents
            
        Returns:
            ClassificationResult or None
        """
        if not document_terms:
            logger.debug("[IntentClassifier] Bag-of-words: No document terms available")
            return None
        
        # Use proper lemmatization for query terms (matches DocumentPreprocessor)
        try:
            # Use cached preprocessor instance
            if self._preprocessor is None:
                from services.agents.document_preprocessor import DocumentPreprocessor
                self._preprocessor = DocumentPreprocessor()
                logger.debug("[IntentClassifier] Bag-of-words: Created DocumentPreprocessor instance")
            
            query_terms = self._preprocessor.extract_terms(query)
            logger.info(f"[IntentClassifier] Bag-of-words: Lemmatized query to {len(query_terms)} terms: {query_terms}")
        except Exception as e:
            # Fallback to simple tokenization with language-aware stopwords
            logger.warning(f"[IntentClassifier] Bag-of-words: Lemmatization failed, using simple tokenization: {e}")
            
            # Try to detect language and use appropriate stopwords
            stop_words = self.stopwords  # Default English stopwords
            try:
                from langdetect import detect
                from stopwordsiso import stopwords as get_stopwords
                detected_lang = detect(query)
                if detected_lang in get_stopwords.available_languages():
                    stop_words = set(get_stopwords(detected_lang))
                    logger.info(f"[IntentClassifier] Bag-of-words fallback: Using {detected_lang} stopwords")
                else:
                    logger.info(f"[IntentClassifier] Bag-of-words fallback: Language '{detected_lang}' not available, using English stopwords")
            except Exception as lang_error:
                logger.debug(f"[IntentClassifier] Bag-of-words fallback: Language detection failed: {lang_error}")
            
            normalized_query = self._normalize(query)
            query_tokens = self._tokenize(normalized_query)
            query_terms = [
                token for token in query_tokens
                if token not in stop_words and len(token) > 2
            ]
            logger.info(f"[IntentClassifier] Bag-of-words fallback: Extracted {len(query_terms)} terms: {query_terms}")
        
        if not query_terms:
            logger.debug("[IntentClassifier] Bag-of-words: No meaningful query terms after filtering")
            return None
        
        # Convert document terms to set for fast lookup
        doc_terms_set = set(document_terms)
        
        # Find matching terms
        matching_terms = [term for term in query_terms if term in doc_terms_set]
        
        # Calculate overlap ratio
        overlap_ratio = len(matching_terms) / len(query_terms)
        
        logger.debug(f"[IntentClassifier] Bag-of-words: {len(matching_terms)}/{len(query_terms)} terms match "
                    f"({overlap_ratio:.1%} overlap)")
        
        # Apply thresholds
        retrieval_threshold = 0.6  # 60% term overlap → definitely about documents
        general_threshold = 0.2     # 20% term overlap → likely general knowledge
        
        if overlap_ratio >= retrieval_threshold:
            # HIGH confidence: Most query terms are in documents
            logger.info(f"[IntentClassifier] Bag-of-words: High overlap ({overlap_ratio:.1%} >= {retrieval_threshold:.1%}) → RETRIEVAL")
            return ClassificationResult(
                label='retrieval',
                confidence=min(0.95, 0.6 + overlap_ratio * 0.4),  # 0.84-0.95 range
                score=overlap_ratio,
                hits=[{
                    'category': 'bag_of_words',
                    'match': f'{len(matching_terms)}_of_{len(query_terms)}_terms',
                    'type': 'term_overlap',
                    'weight': overlap_ratio,
                    'matching_terms': matching_terms[:5]  # First 5 for debugging
                }],
                debug={
                    'method': 'bag_of_words',
                    'reason': 'high_term_overlap',
                    'overlap_ratio': overlap_ratio,
                    'threshold': retrieval_threshold,
                    'num_query_terms': len(query_terms),
                    'num_matching': len(matching_terms),
                    'matching_terms': matching_terms
                },
                method='bag_of_words'
            )
        
        elif overlap_ratio < general_threshold:
            # HIGH confidence: Query terms not in documents
            logger.info(f"[IntentClassifier] Bag-of-words: Low overlap ({overlap_ratio:.1%} < {general_threshold:.1%}) → GENERAL")
            return ClassificationResult(
                label='general',
                confidence=0.85,
                score=overlap_ratio,
                hits=[],
                debug={
                    'method': 'bag_of_words',
                    'reason': 'low_term_overlap',
                    'overlap_ratio': overlap_ratio,
                    'threshold': general_threshold,
                    'num_query_terms': len(query_terms),
                    'num_matching': len(matching_terms)
                },
                method='bag_of_words'
            )
        
        else:
            # AMBIGUOUS: Medium overlap - need semantic search or LLM
            logger.info(f"[IntentClassifier] Bag-of-words: Medium overlap ({overlap_ratio:.1%}) → AMBIGUOUS")
            return ClassificationResult(
                label='ambiguous',
                confidence=0.5,
                score=overlap_ratio,
                hits=[{
                    'category': 'bag_of_words',
                    'match': f'{len(matching_terms)}_of_{len(query_terms)}_terms',
                    'type': 'term_overlap',
                    'weight': overlap_ratio,
                    'matching_terms': matching_terms[:5]
                }],
                debug={
                    'method': 'bag_of_words',
                    'reason': 'medium_term_overlap_ambiguous',
                    'overlap_ratio': overlap_ratio,
                    'retrieval_threshold': retrieval_threshold,
                    'general_threshold': general_threshold,
                    'num_query_terms': len(query_terms),
                    'num_matching': len(matching_terms),
                    'matching_terms': matching_terms
                },
                method='bag_of_words'
            )
    
    def _semantic_search_classify(
        self, 
        query: str, 
        retrieval_function: Optional[callable] = None
    ) -> Optional[ClassificationResult]:
        """
        Semantic search-based classification - Context-aware Stage 1.
        
        This method performs actual semantic search against the user's documents
        to intelligently determine if the query is about their specific content
        or general knowledge.
        
        Strategy:
        1. Do semantic search with low threshold (0.3) to catch all potentially relevant docs
        2. Use max similarity to classify:
           - >= 0.60: HIGH confidence it's about user's documents → RETRIEVAL
           - < 0.50: HIGH confidence it's general knowledge → GENERAL
           - 0.50-0.60: AMBIGUOUS → Let LLM decide with document context (Stage 2)
        
        Args:
            query: User query to classify
            retrieval_function: Function that performs semantic search
                               Should accept (query, k, min_similarity) and return List[Dict]
                               where each dict has 'content', 'metadata', 'similarity'
        
        Returns:
            ClassificationResult or None if retrieval_function not provided
        """
        if not retrieval_function:
            logger.debug("[IntentClassifier] Semantic search: No retrieval function provided, skipping")
            return None
        
        logger.debug(f"[IntentClassifier] Semantic search: Searching for query: '{query}'")
        
        try:
            # Perform semantic search with lenient threshold to catch all potentially relevant docs
            # We want to see what's available, even if not highly similar
            results = retrieval_function(query, k=3, min_similarity=0.3)
            
            if not results or len(results) == 0:
                # No documents found even with low threshold
                logger.info("[IntentClassifier] Semantic search: No documents found (empty collection) → GENERAL")
                return ClassificationResult(
                    label='general',
                    confidence=0.95,  # High confidence: no docs = must be general
                    score=0.0,
                    hits=[],
                    debug={
                        'method': 'semantic_search',
                        'reason': 'no_documents_in_collection',
                        'search_k': 3,
                        'search_min_similarity': 0.3
                    },
                    method='semantic_search',
                    semantic_results=[],
                    max_similarity=0.0
                )
            
            # Extract similarities and find max
            similarities = [r.get('similarity', 0.0) for r in results]
            max_similarity = max(similarities) if similarities else 0.0
            
            logger.debug(f"[IntentClassifier] Semantic search: Found {len(results)} results, similarities: {similarities}, max: {max_similarity:.3f}")
            
            # Store results for debugging and LLM context
            # Store full content for potential LLM Stage 2 context enhancement
            semantic_results = [{
                'content': r.get('content', ''),  # Full content for LLM context
                'content_preview': r.get('content', '')[:200],  # Preview for logs
                'similarity': r.get('similarity', 0.0),
                'metadata': r.get('metadata', {})
            } for r in results]
            
            # Apply thresholds for clear cases
            retrieval_threshold = 0.60  # High similarity → definitely about user's docs
            general_threshold = 0.50     # Low similarity → likely general knowledge
            
            if max_similarity >= retrieval_threshold:
                # HIGH confidence: Query is clearly about user's documents
                logger.info(f"[IntentClassifier] Semantic search: High similarity ({max_similarity:.3f} >= {retrieval_threshold}) → RETRIEVAL")
                return ClassificationResult(
                    label='retrieval',
                    confidence=min(0.95, 0.5 + max_similarity * 0.5),  # 0.85-0.95 range
                    score=max_similarity * 10,
                    hits=[{
                        'category': 'semantic_search',
                        'match': f'similarity_{max_similarity:.3f}',
                        'type': 'semantic',
                        'weight': max_similarity
                    }],
                    debug={
                        'method': 'semantic_search',
                        'reason': 'high_similarity',
                        'max_similarity': max_similarity,
                        'threshold': retrieval_threshold,
                        'num_results': len(results)
                    },
                    method='semantic_search',
                    semantic_results=semantic_results,
                    max_similarity=max_similarity
                )
            
            elif max_similarity < general_threshold:
                # HIGH confidence: Query is not about user's documents
                logger.info(f"[IntentClassifier] Semantic search: Low similarity ({max_similarity:.3f} < {general_threshold}) → GENERAL")
                return ClassificationResult(
                    label='general',
                    confidence=0.85,
                    score=0.0,
                    hits=[],
                    debug={
                        'method': 'semantic_search',
                        'reason': 'low_similarity',
                        'max_similarity': max_similarity,
                        'threshold': general_threshold,
                        'num_results': len(results)
                    },
                    method='semantic_search',
                    semantic_results=semantic_results,
                    max_similarity=max_similarity
                )
            
            else:
                # AMBIGUOUS: Similarity in middle range (0.50-0.60)
                # Let LLM make final decision WITH context about available documents
                logger.info(f"[IntentClassifier] Semantic search: Medium similarity ({max_similarity:.3f}) → AMBIGUOUS (will ask LLM)")
                return ClassificationResult(
                    label='ambiguous',
                    confidence=0.5,
                    score=max_similarity * 10,
                    hits=[{
                        'category': 'semantic_search',
                        'match': f'similarity_{max_similarity:.3f}',
                        'type': 'semantic',
                        'weight': max_similarity
                    }],
                    debug={
                        'method': 'semantic_search',
                        'reason': 'medium_similarity_ambiguous',
                        'max_similarity': max_similarity,
                        'retrieval_threshold': retrieval_threshold,
                        'general_threshold': general_threshold,
                        'num_results': len(results)
                    },
                    method='semantic_search',
                    semantic_results=semantic_results,
                    max_similarity=max_similarity
                )
        
        except Exception as e:
            logger.error(f"[IntentClassifier] Semantic search classification failed: {e}")
            import traceback
            logger.debug(f"[IntentClassifier] Semantic search error traceback: {traceback.format_exc()}")
            return None
    
    def _llm_classify(
        self, 
        query: str, 
        bow_context: Optional[str] = None,
        doc_context: Optional[str] = None
    ) -> Optional[ClassificationResult]:
        """
        LLM-based classification with bag-of-words context.
        
        This is Stage 2 - used for ambiguous cases from Stage 0/1.
        Enhanced with context about available document terms.
        
        Args:
            query: User query to classify
            bow_context: Optional bag-of-words context about document terms
            doc_context: Optional document content context from semantic search
        
        Returns:
            ClassificationResult or None if classification fails
        """
        if not self.llm_caller:
            return None
        
        # Build enhanced prompt with bag-of-words context
        context_section = ""
        has_doc_context = False
        if doc_context:
            context_section = f"\n\nRELEVANT DOCUMENTS FOUND:\n{doc_context}\n"
            has_doc_context = True
        elif bow_context:
            context_section = f"\n\nContext about user's documents:\n{bow_context}\n"
        
        # Add instruction about document context
        doc_context_instruction = ""
        if has_doc_context:
            doc_context_instruction = """
IMPORTANT: The documents above were found to be RELEVANT to the query (semantic similarity > 0.5).
If the documents contain information that could answer the query, classify as RETRIEVAL.
Only classify as GENERAL if the documents are clearly irrelevant or off-topic.
"""
        
        classification_prompt = f"""Classify this query's intent. Answer with ONLY ONE WORD: general OR retrieval

CRITICAL: Only classify as 'retrieval' if the query can be answered using SPECIFIC content from the user's uploaded documents.

GENERAL = Query about general facts, definitions, how-tos, or common knowledge that doesn't need specific documents
Examples:
- "How do you make an omelette?" → general
- "What is machine learning?" → general  
- "Explain quantum physics" → general
- "How do I multiply matrices?" → general (asking for general math knowledge)
- "What are the benefits of embeddings?" → general (general AI concept)
- "Hello, how are you?" → general
- "Tell me a joke" → general
- "What's the weather like?" → general

RETRIEVAL = Query that can be answered using SPECIFIC content from uploaded documents
Examples:
- "Summarize my notes about Python" → retrieval
- "What did I write about the meeting?" → retrieval
- "Search my documents for budget" → retrieval
- "What does the document say about X?" → retrieval
- "Tell me about the research paper" → retrieval
- "What are the main points in chapter 3?" → retrieval
- "Explain the methodology from the paper" → retrieval
- "What is mentioned about X in the documents?" → retrieval
{doc_context_instruction}{context_section}
Query: "{query}"

Classification:"""
                        
        try:
            import os
            model = os.getenv("AGENT_MODEL", "llama3.2:1b")
            logger.debug(f"[IntentClassifier] LLM calling model: {model}")
            
            response = self.llm_caller(
                model,
                classification_prompt,
                temperature=0.1,
                max_tokens=10
            )
            
            logger.debug(f"[IntentClassifier] LLM raw response: '{response}'")
            classification = response.strip().lower()
            
            # Parse response
            if 'general' in classification:
                label = 'general'
            elif 'retrieval' in classification:
                label = 'retrieval'
            else:
                logger.warning(f"[IntentClassifier] LLM returned unexpected response: '{classification}'")
                label = 'general'  # Default to general for safety
            
            logger.debug(f"[IntentClassifier] LLM parsed classification: '{label}'")
            
            return ClassificationResult(
                label=label,
                confidence=0.85,  # LLM confidence
                score=5.0 if label == 'retrieval' else 0.5,
                hits=[{
                    'category': 'LLM',
                    'match': classification,
                    'type': 'llm',
                    'weight': 1.0
                }],
                debug={
                    'llm_response': response,
                    'llm_parsed': label,
                    'prompt_length': len(classification_prompt),
                    'had_bow_context': bow_context is not None,
                    'had_doc_context': doc_context is not None
                },
                method='llm'
            )
        except Exception as e:
            logger.error(f"[IntentClassifier] LLM classification failed with error: {e}")
            import traceback
            logger.debug(f"[IntentClassifier] LLM error traceback: {traceback.format_exc()}")
        
        return None
    
    def _extract_document_context(self, semantic_results: List[Dict[str, Any]]) -> Optional[str]:
        """
        Extract document context from semantic search results for LLM.
        
        Args:
            semantic_results: List of semantic search results
            
        Returns:
            Formatted string with document excerpts, or None
        """
        if not semantic_results:
            return None
        
        # Get top 2 results
        top_results = semantic_results[:2]
        
        # Build context string
        context_parts = []
        for i, result in enumerate(top_results, 1):
            content = result.get('content', '')
            preview = content[:300] + '...' if len(content) > 300 else content
            similarity = result.get('similarity', 0.0)
            context_parts.append(f"Document {i} (similarity: {similarity:.2f}):\n{preview}")
        
        return "\n\n".join(context_parts)
    
    def _normalize(self, text: str) -> str:
        """Normalize text for matching."""
        # Lowercase
        text = text.lower()
        
        # Unicode normalization (NFKD) and accent removal
        text = unicodedata.normalize('NFKD', text)
        text = ''.join([c for c in text if not unicodedata.combining(c)])
        
        # Collapse whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def _tokenize(self, text: str) -> List[str]:
        """Simple language-agnostic tokenization."""
        # Split on word boundaries
        tokens = re.findall(r'\b\w+\b', text, re.UNICODE)
        return [t.lower() for t in tokens if len(t) > 1]

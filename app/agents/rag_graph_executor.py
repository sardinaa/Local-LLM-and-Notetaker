"""
RAG Graph Executor - Integrates LangGraph with existing LangChain components.

This module connects the LangGraph workflow with your existing:
- Intent classifier
- Retrieval system
- LLM generation
- Vector stores

It acts as a bridge between the graph structure and actual implementations.
"""

from __future__ import annotations

import logging
import os
import json
from typing import Any, Dict, List, Optional, Callable, Generator
from datetime import datetime, timedelta
from functools import lru_cache
import hashlib

from app.agents.rag_graph import (
    RAGState,
    build_rag_graph,
    _analyze_query_scope
)
from app.agents.intent_classifier import IntentClassifier
from app.services.agents.retrieval import ChatRetrieval
from app.services.agents.llm import ChatLLM
from app.services.agents.vector_store import VectorStoreManager
from app.services.agents.base import AgentConfig

logger = logging.getLogger(__name__)

# Configurable scraping thresholds
SCRAPING_MIN_SNIPPETS = int(os.getenv('SCRAPING_MIN_SNIPPETS', '2'))
SCRAPING_MIN_SNIPPET_LENGTH = int(os.getenv('SCRAPING_MIN_SNIPPET_LENGTH', '50'))
SEARCH_CACHE_TTL_MINUTES = int(os.getenv('SEARCH_CACHE_TTL_MINUTES', '10'))

# Configurable semantic similarity thresholds (for multilingual cross-language queries)
# Lower thresholds = more lenient (better for cross-language matching)
RELEVANCE_HIGH_THRESHOLD = float(os.getenv('RELEVANCE_HIGH_THRESHOLD', '0.65'))  # Highly relevant
RELEVANCE_MODERATE_THRESHOLD = float(os.getenv('RELEVANCE_MODERATE_THRESHOLD', '0.85'))  # Moderately relevant
RELEVANCE_AVG_THRESHOLD = float(os.getenv('RELEVANCE_AVG_THRESHOLD', '0.95'))  # Average relevance

# Multi-hop reasoning configuration
ENABLE_MULTIHOP = os.getenv('ENABLE_MULTIHOP', 'true').lower() == 'true'
MULTIHOP_MODE = os.getenv('MULTIHOP_MODE', 'auto')  # auto, always, never
MULTIHOP_USE_LLM = os.getenv('MULTIHOP_USE_LLM', 'true').lower() == 'true'
MULTIHOP_MAX_SUBQUERIES = int(os.getenv('MULTIHOP_MAX_SUBQUERIES', '5'))
MULTIHOP_PARALLEL_SEARCH = os.getenv('MULTIHOP_PARALLEL_SEARCH', 'true').lower() == 'true'
MULTIHOP_CACHE_CLASSIFICATIONS = os.getenv('MULTIHOP_CACHE_CLASSIFICATIONS', 'true').lower() == 'true'

# Iterative refinement configuration
ENABLE_REFINEMENT = os.getenv('ENABLE_REFINEMENT', 'true').lower() == 'true'
REFINEMENT_MAX_ITERATIONS = int(os.getenv('REFINEMENT_MAX_ITERATIONS', '3'))
REFINEMENT_QUALITY_THRESHOLD = float(os.getenv('REFINEMENT_QUALITY_THRESHOLD', '0.6'))
REFINEMENT_ENABLE_FALLBACK = os.getenv('REFINEMENT_ENABLE_FALLBACK', 'true').lower() == 'true'

# Conversational memory configuration
ENABLE_CONVERSATION_MEMORY = os.getenv('ENABLE_CONVERSATION_MEMORY', 'true').lower() == 'true'
MEMORY_MAX_TURNS = int(os.getenv('MEMORY_MAX_TURNS', '5'))
MEMORY_CONTEXT_WINDOW = int(os.getenv('MEMORY_CONTEXT_WINDOW', '3'))
MEMORY_USE_SUMMARY = os.getenv('MEMORY_USE_SUMMARY', 'false').lower() == 'true'


class RAGGraphExecutor:
    """
    Executes the RAG graph workflow using existing LangChain components.
    
    This class wraps the graph nodes with actual implementations:
    - Autonomous intent detection (semantic similarity probe)
    - Document retrieval  
    - LLM generation
    - Reflection logic
    
    The agent makes autonomous decisions without external classifiers.
    """
    
    def __init__(
        self,
        intent_classifier: Optional[IntentClassifier],  # Keep for backward compat but not used
        retrieval: ChatRetrieval,
        llm: ChatLLM,
        vector_store_manager: VectorStoreManager
    ):
        """
        Initialize graph executor with existing components.
        
        Args:
            intent_classifier: (Deprecated) Kept for backward compatibility
            retrieval: Document retrieval system
            llm: LLM for generation
            vector_store_manager: Vector store manager
        """
        self.intent_classifier = intent_classifier  # Keep but unused
        self.retrieval = retrieval
        self.llm = llm
        self.vector_store_manager = vector_store_manager
        
        # Search result cache (query -> (results, timestamp))
        self._search_cache: Dict[str, tuple[List[Dict], datetime]] = {}
        self._cache_ttl = timedelta(minutes=SEARCH_CACHE_TTL_MINUTES)
        
        # Multi-hop classification cache
        if MULTIHOP_CACHE_CLASSIFICATIONS:
            self._classification_cache: Dict[str, Dict[str, Any]] = {}
        
        # Conversation memory (per chat_id)
        self._conversation_memory: Dict[str, List[Dict[str, Any]]] = {}
        
        # Build graph with injected implementations
        self.graph = self._build_graph_with_implementations()
        
        logger.info("[RAG Graph Executor] Initialized (autonomous decision-making enabled)")
        logger.info("[RAG Graph Executor] Multilingual support: EN, ES, FR, DE, IT, PT, CA, ZH, JA")
        logger.info(f"[RAG Graph Executor] Search cache TTL: {SEARCH_CACHE_TTL_MINUTES} minutes")
        logger.info(f"[RAG Graph Executor] Scraping thresholds: {SCRAPING_MIN_SNIPPETS} snippets, {SCRAPING_MIN_SNIPPET_LENGTH} chars")
        logger.info(f"[RAG Graph Executor] Semantic relevance thresholds: high<{RELEVANCE_HIGH_THRESHOLD}, moderate<{RELEVANCE_MODERATE_THRESHOLD}, avg<{RELEVANCE_AVG_THRESHOLD}")
        logger.info(f"[RAG Graph Executor] Multi-hop reasoning: {'enabled' if ENABLE_MULTIHOP else 'disabled'} (mode={MULTIHOP_MODE}, llm={MULTIHOP_USE_LLM})")
        logger.info(f"[RAG Graph Executor] Iterative refinement: {'enabled' if ENABLE_REFINEMENT else 'disabled'} (max={REFINEMENT_MAX_ITERATIONS}, threshold={REFINEMENT_QUALITY_THRESHOLD})")
        logger.info(f"[RAG Graph Executor] Conversational memory: {'enabled' if ENABLE_CONVERSATION_MEMORY else 'disabled'} (max_turns={MEMORY_MAX_TURNS}, context_window={MEMORY_CONTEXT_WINDOW})")
    
    def _build_graph_with_implementations(self):
        """
        Build graph workflow with actual component implementations.
        
        Graph flow:
        1. Classify (autonomous) → Decides: RAG, Web, Hybrid, or General
        2. For RAG/Hybrid: Plan → Analyze query scope
        3. For Web/Hybrid: Web Search → Execute web search
        4. Retrieve → Get documents based on plan (RAG/Hybrid)
        5. Reflect → Check if docs are sufficient (RAG/Hybrid)
        6. Answer → Generate response with context (RAG/Web/Hybrid/General)
        """
        from langgraph.graph import StateGraph, END
        
        workflow = StateGraph(RAGState)
        
        # Add nodes with actual implementations
        workflow.add_node("classify", self._classify_node)
        workflow.add_node("plan", self._plan_node)
        workflow.add_node("retrieve", self._retrieve_node)
        workflow.add_node("reflect", self._reflect_node)
        workflow.add_node("refine", self._refine_node)
        workflow.add_node("answer", self._answer_node)
        workflow.add_node("answer_direct", self._answer_direct_node)
        workflow.add_node("web_search", self._web_search_node)
        
        # Set entry point
        workflow.set_entry_point("classify")
        
        # Conditional routing from classify
        workflow.add_conditional_edges(
            "classify",
            self._should_retrieve,
            {
                "retrieve": "plan",  # RAG or Hybrid (RAG + Web)
                "web_search": "web_search",  # Web only
                "answer_direct": "answer_direct"  # General knowledge
            }
        )
        
        workflow.add_edge("plan", "retrieve")
        
        workflow.add_conditional_edges(
            "retrieve",
            self._should_continue_retrieving,
            {
                "reflect": "reflect",
                "quality_check": "quality_check"  # Go to quality check when max iterations reached
            }
        )
        
        workflow.add_conditional_edges(
            "reflect",
            self._should_reretrieve,
            {
                "retrieve": "retrieve",
                "quality_check": "quality_check"  # Check quality before answering
            }
        )
        
        # Add quality check node (decides refine or answer)
        workflow.add_node("quality_check", self._quality_check_node)
        
        workflow.add_conditional_edges(
            "quality_check",
            self._should_refine,
            {
                "answer": "answer",
                "refine": "refine"
            }
        )
        
        # Web search goes to quality check
        workflow.add_edge("web_search", "quality_check")
        
        # Refinement loops back to quality check
        workflow.add_edge("refine", "quality_check")
        
        workflow.add_edge("answer", END)
        workflow.add_edge("answer_direct", END)
        
        return workflow.compile()
    
    # ========================================================================
    # Node Implementations (With Actual Components)
    # ========================================================================
    
    def _is_time_sensitive_query(self, query_lower: str) -> bool:
        """
        Detect if query is time-sensitive across multiple languages.
        Uses multilingual keyword matching for common time-related terms.
        
        Supports: English, Spanish, French, German, Italian, Portuguese, Catalan, Chinese, Japanese
        """
        # Multilingual time-sensitive keywords
        time_keywords = [
            # English
            'today', 'tomorrow', 'latest', 'recent', 'current', 'now', 'this week', 'this month',
            'breaking', 'news', 'update', 'happening', 'right now', 'just announced', 'live', 
            'ongoing', 'yesterday', 'last week', 'next week', 'weather', 'forecast', 
            'stock price', 'exchange rate', 'score', 'game', 'currently', 'at the moment', 
            'these days', 'nowadays',
            
            # Spanish
            'hoy', 'mañana', 'último', 'últimos', 'reciente', 'actual', 'ahora', 'esta semana', 
            'este mes', 'noticias', 'actualización', 'sucediendo', 'ayer', 'semana pasada',
            'próxima semana', 'clima', 'pronóstico', 'tiempo', 'cotización', 'cambio',
            
            # French
            'aujourd\'hui', 'demain', 'dernier', 'récent', 'actuel', 'maintenant', 'cette semaine',
            'ce mois', 'nouvelles', 'actualité', 'mise à jour', 'hier', 'semaine dernière',
            'semaine prochaine', 'météo', 'prévision', 'cours', 'taux de change',
            
            # German
            'heute', 'morgen', 'neueste', 'aktuell', 'jetzt', 'diese woche', 'diesen monat',
            'nachrichten', 'aktualisierung', 'gestern', 'letzte woche', 'nächste woche',
            'wetter', 'vorhersage', 'kurs', 'wechselkurs',
            
            # Italian
            'oggi', 'domani', 'ultimo', 'recente', 'attuale', 'adesso', 'questa settimana',
            'questo mese', 'notizie', 'aggiornamento', 'ieri', 'settimana scorsa',
            'prossima settimana', 'meteo', 'previsioni', 'quotazione', 'tasso di cambio',
            
            # Portuguese
            'hoje', 'amanhã', 'último', 'recente', 'atual', 'agora', 'esta semana', 'este mês',
            'notícias', 'atualização', 'ontem', 'semana passada', 'próxima semana',
            'tempo', 'previsão', 'cotação', 'taxa de câmbio',
            
            # Catalan
            'avui', 'demà', 'últim', 'recent', 'actual', 'ara', 'aquesta setmana', 'aquest mes',
            'notícies', 'actualització', 'ahir', 'setmana passada', 'propera setmana',
            'temps', 'previsió', 'cotització', 'tipus de canvi',
            
            # Chinese (Pinyin/Common)
            '今天', '明天', '最新', '最近', '现在', '当前', '本周', '本月', '新闻', '更新',
            '昨天', '上周', '下周', '天气', '预报', '股价', '汇率',
            
            # Japanese
            '今日', '明日', '最新', '最近', '現在', '今週', '今月', 'ニュース', '更新',
            '昨日', '先週', '来週', '天気', '予報', '株価', '為替',
            
            # Years (universal)
            '2024', '2025', '2026', '2027'
        ]
        
        return any(keyword in query_lower for keyword in time_keywords)
    
    def _should_use_multihop(self, query: str) -> Dict[str, Any]:
        """
        Intelligent multi-hop detection using LLM.
        No hardcoded keywords - works in any language.
        
        Returns:
            {
                "needs_multihop": bool,
                "sub_queries": List[str] or None,
                "reasoning": str,
                "confidence": float
            }
        """
        # Check if feature enabled
        if not ENABLE_MULTIHOP or MULTIHOP_MODE == 'never':
            return {
                "needs_multihop": False,
                "sub_queries": None,
                "reasoning": "Multi-hop disabled",
                "confidence": 1.0
            }
        
        # Force multi-hop (testing mode)
        if MULTIHOP_MODE == 'always':
            return self._llm_decompose_query(query)
        
        # AUTO mode: Check cache first
        if MULTIHOP_CACHE_CLASSIFICATIONS and hasattr(self, '_classification_cache'):
            query_hash = hashlib.md5(query.encode()).hexdigest()
            if query_hash in self._classification_cache:
                logger.info(f"🔍 Multi-hop classification (cached): {self._classification_cache[query_hash]['needs_multihop']}")
                return self._classification_cache[query_hash]
        
        # Use LLM for intelligent detection
        if MULTIHOP_USE_LLM:
            result = self._llm_classify_multihop(query)
            
            # Cache result
            if MULTIHOP_CACHE_CLASSIFICATIONS and hasattr(self, '_classification_cache'):
                query_hash = hashlib.md5(query.encode()).hexdigest()
                self._classification_cache[query_hash] = result
            
            return result
        else:
            # Fallback to simple heuristics (not recommended)
            return {"needs_multihop": False, "sub_queries": None, "reasoning": "LLM detection disabled", "confidence": 0.5}
    
    def _llm_classify_multihop(self, query: str) -> Dict[str, Any]:
        """
        Use LLM to classify if query needs multi-hop reasoning.
        Language-agnostic, semantic understanding.
        """
        classification_prompt = f"""Analyze if this query requires multiple separate information retrievals (multi-hop reasoning).

Query: "{query}"

A query needs multi-hop if it:
1. Compares multiple entities (even without explicit "compare" keyword)
2. Asks about multiple distinct topics or entities
3. Requires aggregating information from different sources
4. Has sequential steps or dependencies

Respond ONLY with valid JSON (no markdown, no extra text):
{{
  "needs_multihop": true or false,
  "sub_queries": ["query1", "query2", ...] or null,
  "reasoning": "brief explanation why multi-hop is or isn't needed",
  "confidence": 0.0 to 1.0
}}

Examples:

Query: "What is Python?"
{{"needs_multihop": false, "sub_queries": null, "reasoning": "Single topic lookup", "confidence": 0.95}}

Query: "Which is faster, Python or JavaScript?"
{{"needs_multihop": true, "sub_queries": ["Python performance characteristics and speed benchmarks", "JavaScript performance characteristics and speed benchmarks"], "reasoning": "Comparison requires separate retrieval for each language's performance data", "confidence": 0.90}}

Query: "Diferencia entre listas y tuplas"
{{"needs_multihop": true, "sub_queries": ["Python listas características y comportamiento", "Python tuplas características y comportamiento"], "reasoning": "Spanish comparison query - needs separate docs for lists and tuples", "confidence": 0.85}}

Query: "GDP of Spain, France, and Germany in 2023"
{{"needs_multihop": true, "sub_queries": ["Spain GDP 2023", "France GDP 2023", "Germany GDP 2023"], "reasoning": "Multiple entities requiring separate data retrieval", "confidence": 0.92}}

Query: "Explain machine learning and show a Python example"
{{"needs_multihop": true, "sub_queries": ["machine learning explanation theory concepts", "machine learning Python implementation code examples"], "reasoning": "Sequential query with two distinct information needs: theory and practice", "confidence": 0.88}}

Query: "How to install Flask?"
{{"needs_multihop": false, "sub_queries": null, "reasoning": "Single focused procedural topic", "confidence": 0.93}}

Now analyze the query above and respond with JSON only:"""

        try:
            response = self.llm._call_ollama(
                model=self.llm.default_model,
                prompt=classification_prompt,
                temperature=0.1,  # Low temperature for consistent classification
                max_tokens=400
            )
            
            # Clean response - remove markdown code blocks if present
            response_clean = response.strip()
            if response_clean.startswith('```'):
                # Remove ```json and ``` markers
                lines = response_clean.split('\n')
                response_clean = '\n'.join([l for l in lines if not l.strip().startswith('```')])
            
            # Parse JSON
            result = json.loads(response_clean.strip())
            
            # Limit sub-queries to max configured
            if result.get('sub_queries') and len(result['sub_queries']) > MULTIHOP_MAX_SUBQUERIES:
                result['sub_queries'] = result['sub_queries'][:MULTIHOP_MAX_SUBQUERIES]
                result['reasoning'] += f" (limited to {MULTIHOP_MAX_SUBQUERIES} sub-queries)"
            
            logger.info(f"🔍 Multi-hop detection: {result['needs_multihop']} (confidence: {result.get('confidence', 0.0):.2f})")
            logger.info(f"💭 Reasoning: {result['reasoning']}")
            if result.get('sub_queries'):
                logger.info(f"📋 Sub-queries ({len(result['sub_queries'])}):")
                for i, sq in enumerate(result['sub_queries'], 1):
                    logger.info(f"   {i}. {sq}")
            
            return result
            
        except json.JSONDecodeError as e:
            logger.warning(f"❌ Multi-hop detection JSON parse error: {e}")
            logger.warning(f"   Response was: {response[:200]}")
            return {
                "needs_multihop": False,
                "sub_queries": None,
                "reasoning": "JSON parse error, defaulting to single-hop",
                "confidence": 0.0
            }
        except Exception as e:
            logger.warning(f"❌ Multi-hop detection failed: {e}, defaulting to single-hop")
            return {
                "needs_multihop": False,
                "sub_queries": None,
                "reasoning": f"Detection error: {str(e)}",
                "confidence": 0.0
            }
    
    def _llm_decompose_query(self, query: str) -> Dict[str, Any]:
        """Force decomposition of query into sub-queries (for 'always' mode)."""
        prompt = f"""Break this query into 2-5 separate search queries:

Query: "{query}"

Respond with JSON:
{{"sub_queries": ["query1", "query2", ...]}}"""

        try:
            response = self.llm._call_ollama(
                model=self.llm.default_model,
                prompt=prompt,
                temperature=0.2,
                max_tokens=300
            )
            result = json.loads(response.strip())
            return {
                "needs_multihop": True,
                "sub_queries": result.get('sub_queries', [query]),
                "reasoning": "Forced multi-hop mode",
                "confidence": 1.0
            }
        except:
            return {
                "needs_multihop": True,
                "sub_queries": [query],
                "reasoning": "Forced multi-hop, decomposition failed",
                "confidence": 0.5
            }
    
    def _classify_node(self, state: RAGState) -> RAGState:
        """
        Autonomous classification - Agent decides if RAG, Web, or both are needed.
        
        Decision matrix (multilingual-aware):
        1. Check if query needs multi-hop reasoning (LLM-based detection)
        2. Check if query needs web search (time-sensitive keywords in multiple languages)
        3. Check if documents are relevant (semantic probe - works across languages)
        4. Decide: RAG only, Web only, Hybrid (RAG + Web), or General
        """
        logger.info(f"[Graph Executor] Agent analyzing: '{state['query'][:50]}...'")
        
        try:
            chat_id = state['chat_id']
            query = state['query']
            query_lower = query.lower()
            
            # Build contextual query from conversation history
            contextual_query = self._build_contextual_query(query, chat_id)
            state['contextual_query'] = contextual_query
            
            # Step 1: Check if multi-hop reasoning needed (LLM-based, no keywords!)
            multihop_result = self._should_use_multihop(query)
            state['requires_multihop'] = multihop_result['needs_multihop']
            state['sub_queries'] = multihop_result.get('sub_queries')
            state['multihop_reasoning'] = multihop_result.get('reasoning', '')
            state['user_query'] = query  # Store original query
            
            # Step 2: Check if query needs web search (multilingual time-sensitive keywords)
            needs_web = self._is_time_sensitive_query(query_lower)
            
            # Step 3: Check if documents exist and are relevant
            try:
                vector_store = self.vector_store_manager.get_chat_store(chat_id)
                # Probe more documents for better cross-language matching (increased from 3 to 5)
                # Use contextual query for context-aware retrieval
                probe_results = vector_store.similarity_search_with_score(contextual_query, k=5)
                
                if not probe_results or len(probe_results) == 0:
                    # No documents at all
                    if needs_web:
                        logger.info("[Graph Executor] 🌐 No docs + time-sensitive → Web search only")
                        return {
                            **state,
                            'intent': 'web_search',
                            'intent_confidence': 0.9,
                            'needs_web_search': True,
                            'debug_info': {
                                **state.get('debug_info', {}),
                                'decision': 'web_only_no_docs',
                                'reasoning': 'Time-sensitive query with no knowledge base'
                            }
                        }
                    else:
                        logger.info("[Graph Executor] 💭 No docs + not time-sensitive → General answer")
                        return {
                            **state,
                            'intent': 'general',
                            'intent_confidence': 1.0,
                            'needs_web_search': False,
                            'debug_info': {
                                **state.get('debug_info', {}),
                                'decision': 'no_documents',
                                'reasoning': 'Knowledge base is empty'
                            }
                        }
                
                # Analyze document relevance (semantic embeddings work across languages)
                distances = [score for doc, score in probe_results]
                min_distance = min(distances)
                avg_distance = sum(distances) / len(distances)
                
                # Enhanced debugging for cross-language matching
                logger.info(f"[Graph Executor] ========== SEMANTIC PROBE RESULTS (multilingual) ==========")
                logger.info(f"[Graph Executor] Query: '{query[:80]}...'")
                logger.info(f"[Graph Executor] Found {len(probe_results)} documents")
                for idx, (doc, score) in enumerate(probe_results[:3], 1):
                    preview = doc.page_content[:120].replace('\n', ' ')
                    source = doc.metadata.get('source', 'Unknown')
                    logger.info(f"[Graph Executor]   [{idx}] distance={score:.3f} | source={source} | preview='{preview}...'")
                logger.info(f"[Graph Executor] Statistics: min_dist={min_distance:.3f}, avg_dist={avg_distance:.3f}")
                logger.info(f"[Graph Executor] Thresholds: high<{RELEVANCE_HIGH_THRESHOLD}, moderate<{RELEVANCE_MODERATE_THRESHOLD}, avg<{RELEVANCE_AVG_THRESHOLD}")
                logger.info(f"[Graph Executor] Time-sensitive: {needs_web}")
                logger.info(f"[Graph Executor] ===========================================================")
                
                # Determine if documents are relevant
                # Note: Semantic similarity works across languages via multilingual embeddings
                # More lenient thresholds for cross-language queries (e.g., "piecewise function" vs "funciones definidas a trozos")
                docs_highly_relevant = min_distance < RELEVANCE_HIGH_THRESHOLD
                docs_moderately_relevant = min_distance < RELEVANCE_MODERATE_THRESHOLD and avg_distance < RELEVANCE_AVG_THRESHOLD
                docs_relevant = docs_highly_relevant or docs_moderately_relevant
                
                if docs_relevant:
                    logger.info(f"[Graph Executor] ✅ Documents ARE relevant (min_dist={min_distance:.3f} < {RELEVANCE_MODERATE_THRESHOLD}, avg_dist={avg_distance:.3f} < {RELEVANCE_AVG_THRESHOLD})")
                else:
                    logger.info(f"[Graph Executor] ⚠️ Documents NOT relevant (min_dist={min_distance:.3f} >= {RELEVANCE_MODERATE_THRESHOLD} or avg_dist={avg_distance:.3f} >= {RELEVANCE_AVG_THRESHOLD})")
                    logger.warning(f"[Graph Executor] 💡 TIP: For better cross-language matching, consider using a multilingual embedding model like 'paraphrase-multilingual-MiniLM-L12-v2'")
                
                # Decision matrix
                if needs_web and docs_relevant:
                    # Hybrid: Time-sensitive + relevant docs = RAG + Web
                    intent = 'retrieval'  # RAG will execute, web search in parallel
                    needs_web_search = True
                    confidence = 1.0 - min_distance
                    reasoning = f'🔄 Hybrid (RAG + Web): Time-sensitive with relevant docs (min_dist={min_distance:.2f})'
                    logger.info(f"[Graph Executor] {reasoning}")
                    
                elif needs_web and not docs_relevant:
                    # Web only: Time-sensitive but docs not relevant
                    intent = 'web_search'
                    needs_web_search = True
                    confidence = 0.9
                    reasoning = f'🌐 Web only: Time-sensitive, docs not relevant (min_dist={min_distance:.2f})'
                    logger.info(f"[Graph Executor] {reasoning}")
                    
                elif not needs_web and docs_relevant:
                    # RAG only: Not time-sensitive, docs are relevant
                    intent = 'retrieval'
                    needs_web_search = False
                    confidence = 1.0 - min_distance
                    reasoning = f'📚 RAG only: Docs relevant, not time-sensitive (min_dist={min_distance:.2f})'
                    logger.info(f"[Graph Executor] {reasoning}")
                    
                else:
                    # General: Not time-sensitive, docs not relevant
                    intent = 'general'
                    needs_web_search = False
                    confidence = min(min_distance, 1.0)
                    reasoning = f'💭 General: Docs not relevant, not time-sensitive (min_dist={min_distance:.2f})'
                    logger.info(f"[Graph Executor] {reasoning}")
                
                return {
                    **state,
                    'intent': intent,
                    'intent_confidence': confidence,
                    'needs_web_search': needs_web_search,
                    'debug_info': {
                        **state.get('debug_info', {}),
                        'decision': {
                            'intent': intent,
                            'confidence': confidence,
                            'min_distance': min_distance,
                            'avg_distance': avg_distance,
                            'distances': distances,
                            'needs_web': needs_web,
                            'needs_web_search': needs_web_search,
                            'reasoning': reasoning,
                            'method': 'autonomous_multimodal_probe'
                        }
                    }
                }
                
            except Exception as e:
                # If vector store access fails
                logger.warning(f"[Graph Executor] Document probe failed: {e}")
                if needs_web:
                    return {
                        **state,
                        'intent': 'web_search',
                        'intent_confidence': 0.8,
                        'needs_web_search': True,
                        'debug_info': {
                            **state.get('debug_info', {}),
                            'decision': 'web_fallback',
                            'error': str(e)
                        }
                    }
                else:
                    return {
                        **state,
                        'intent': 'general',
                        'intent_confidence': 0.8,
                        'needs_web_search': False,
                        'debug_info': {
                            **state.get('debug_info', {}),
                            'decision': 'probe_failed',
                            'error': str(e)
                        }
                    }
            
        except Exception as e:
            logger.error(f"[Graph Executor] Classification failed: {e}")
            # Fallback to general
            return {
                **state,
                'intent': 'general',
                'intent_confidence': 0.5,
                'debug_info': {
                    **state.get('debug_info', {}),
                    'classification_error': str(e)
                }
            }
    
    def _plan_node(self, state: RAGState) -> RAGState:
        """Plan retrieval strategy and initiate web search if needed."""
        logger.info("[Graph Executor] Planning retrieval strategy...")
        
        query_lower = state['query'].lower()
        scope, num_chunks, reasoning = _analyze_query_scope(query_lower)
        
        # Consider conversation context for scope adjustment
        chat_id = state['chat_id']
        conversation_history = self._get_conversation_history(chat_id)
        if len(conversation_history) > 0:
            # If following up on previous query, may need broader scope
            # Check if query is very short (likely a follow-up)
            if len(state['query'].split()) <= 3:
                original_scope = scope
                scope = min(scope + 2, 10)  # Increase scope but cap at 10
                logger.info(f"[Graph Executor] Follow-up query detected: scope {original_scope} → {scope}")
        
        logger.info(f"[Graph Executor] Plan: scope={scope}, chunks={num_chunks}, history_turns={len(conversation_history)}")
        
        # Check if hybrid mode (RAG + Web)
        needs_web = state.get('needs_web_search', False)
        
        # If hybrid mode, trigger web search in parallel
        if needs_web:
            logger.info("[Graph Executor] 🔄 Hybrid mode: Initiating web search alongside RAG...")
            
            query = state['query']
            
            # Check cache first
            cached_results = None
            if query in self._search_cache:
                cached_results, timestamp = self._search_cache[query]
                age = datetime.now() - timestamp
                
                if age < self._cache_ttl:
                    logger.info(f"[Graph Executor] ♻️  Using cached search results in hybrid mode (age: {age.seconds}s)")
                    formatted_results = cached_results
                else:
                    # Cache expired
                    del self._search_cache[query]
                    cached_results = None
            
            # If not cached, perform search
            if not cached_results:
                try:
                    import asyncio
                    import os
                    from app.integrations.search_engines.multi_engine import MultiEngineSearch
                    
                    # Execute web search (async) with Brave API key
                    brave_api_key = os.getenv('BRAVE_API_KEY')
                    search = MultiEngineSearch(
                        brave_api_key=brave_api_key,
                        enable_fallback=True,
                        enable_qwant=False  # Disable Qwant (403 errors)
                    )
                    results, engine = asyncio.run(search.search(query, max_results=5))
                    
                    logger.info(f"[Graph Executor] Found {len(results)} web results from {engine} for hybrid mode")
                    
                    # Format results
                    formatted_results = []
                    for idx, result in enumerate(results, 1):
                        formatted_results.append({
                            'title': result.get('title', 'No title'),
                            'url': result.get('url', ''),
                            'snippet': result.get('snippet', ''),
                            'source': engine,
                            'index': idx
                        })
                    
                    # Check if snippets are insufficient - scrape if needed
                    needs_scraping = self._check_if_scraping_needed(formatted_results)
                    
                    if needs_scraping:
                        logger.info("[Graph Executor] Snippets insufficient in hybrid mode, scraping...")
                        scraped_content = asyncio.run(self._scrape_web_results(formatted_results[:3]))
                        
                        if scraped_content:
                            # Merge scraped content with search results
                            for result in formatted_results:
                                url = result.get('url', '')
                                for scraped in scraped_content:
                                    if scraped.get('url') == url:
                                        result['scraped_text'] = scraped.get('text', '')
                                        result['has_scraped_content'] = True
                                        break
                            
                            logger.info(f"[Graph Executor] ✅ Scraped {len(scraped_content)} pages in hybrid mode")
                        else:
                            logger.warning("[Graph Executor] ⚠️ Scraping failed in hybrid mode, using snippets")
                    
                    # Cache the results
                    self._search_cache[query] = (formatted_results, datetime.now())
                    
                except Exception as e:
                    logger.error(f"[Graph Executor] Web search failed in hybrid mode: {e}")
                    # Continue with RAG only
                    return {
                        **state,
                        'scope': scope,
                        'planned_chunks': num_chunks,
                        'web_search_results': [],
                        'used_web_search': False,
                        'debug_info': {
                            **state.get('debug_info', {}),
                            'plan': {
                                'scope': scope,
                                'num_chunks': num_chunks,
                                'reasoning': reasoning,
                                'hybrid_mode_failed': True,
                                'web_search_error': str(e)
                            }
                        }
                    }
            
            return {
                **state,
                'scope': scope,
                'planned_chunks': num_chunks,
                'web_search_results': formatted_results,
                'used_web_search': True,
                'debug_info': {
                    **state.get('debug_info', {}),
                    'plan': {
                        'scope': scope,
                        'num_chunks': num_chunks,
                        'reasoning': reasoning,
                        'hybrid_mode': True,
                        'web_results_count': len(formatted_results),
                        'web_search_cached': cached_results is not None
                    }
                }
            }
        
        # RAG only (no web search)
        return {
            **state,
            'scope': scope,
            'planned_chunks': num_chunks,
            'debug_info': {
                **state.get('debug_info', {}),
                'plan': {
                    'scope': scope,
                    'num_chunks': num_chunks,
                    'reasoning': reasoning
                }
            }
        }
    
    def _retrieve_node(self, state: RAGState) -> RAGState:
        """Retrieve documents using existing retrieval system. Supports multi-hop reasoning."""
        iteration = state.get('current_iteration', 0) + 1
        
        # Check if multi-hop is needed
        if state.get('requires_multihop') and state.get('sub_queries'):
            return self._retrieve_multihop(state, iteration)
        
        # Standard single-hop retrieval
        logger.info(f"[Graph Executor] Retrieving documents (iteration {iteration}, k={state['planned_chunks']})")
        
        try:
            # Create temporary agent config with adjusted top_k
            from app.services.agents.base import RetrievalConfig, AgentConfig
            
            retrieval_config = RetrievalConfig(
                top_k=state['planned_chunks'],
                min_top_k=min(2, state['planned_chunks']),
                relevance_threshold=0.5
            )
            
            agent_config = AgentConfig(
                name="RAG Agent",
                retrieval=retrieval_config
            )
            
            # Retrieve documents
            docs = self.retrieval.retrieve(
                chat_id=state['chat_id'],
                query=state['query'],
                agent_config=agent_config
            )
            
            logger.info(f"[Graph Executor] Retrieved {len(docs)} documents")
            
            # Accumulate docs across iterations (don't replace)
            existing_docs = state.get('retrieved_docs', [])
            all_docs = existing_docs + docs
            
            # Deduplicate by content
            seen_content = set()
            unique_docs = []
            for doc in all_docs:
                content = doc.page_content if hasattr(doc, 'page_content') else str(doc)
                if content not in seen_content:
                    seen_content.add(content)
                    unique_docs.append(doc)
            
            logger.info(f"[Graph Executor] Total unique documents: {len(unique_docs)}")
            
            return {
                **state,
                'retrieved_docs': unique_docs,
                'current_iteration': iteration,
                'debug_info': {
                    **state.get('debug_info', {}),
                    f'retrieve_iteration_{iteration}': {
                        'planned_chunks': state['planned_chunks'],
                        'retrieved': len(docs),
                        'total_unique': len(unique_docs)
                    }
                }
            }
            
        except Exception as e:
            logger.error(f"[Graph Executor] Retrieval failed: {e}")
            return {
                **state,
                'current_iteration': iteration,
                'debug_info': {
                    **state.get('debug_info', {}),
                    'retrieval_error': str(e)
                }
            }
    
    def _retrieve_multihop(self, state: RAGState, iteration: int) -> RAGState:
        """
        Execute multi-hop retrieval: retrieve documents for each sub-query.
        Can execute in parallel or sequentially based on configuration.
        """
        sub_queries = state.get('sub_queries', [])
        logger.info(f"[Graph Executor] 🔀 Multi-hop retrieval: {len(sub_queries)} sub-queries")
        
        try:
            from app.services.agents.base import RetrievalConfig, AgentConfig
            
            # Calculate chunks per sub-query (distribute total chunks)
            chunks_per_subquery = max(2, state['planned_chunks'] // len(sub_queries))
            
            retrieval_config = RetrievalConfig(
                top_k=chunks_per_subquery,
                min_top_k=2,
                relevance_threshold=0.5
            )
            
            agent_config = AgentConfig(
                name="RAG Agent",
                retrieval=retrieval_config
            )
            
            all_docs = []
            sub_results = []
            
            if MULTIHOP_PARALLEL_SEARCH:
                # Parallel execution (faster)
                logger.info(f"[Graph Executor] ⚡ Executing {len(sub_queries)} sub-queries in parallel")
                import concurrent.futures
                
                def retrieve_for_subquery(sq):
                    try:
                        docs = self.retrieval.retrieve(
                            chat_id=state['chat_id'],
                            query=sq,
                            agent_config=agent_config
                        )
                        return {
                            'sub_query': sq,
                            'docs': docs,
                            'count': len(docs)
                        }
                    except Exception as e:
                        logger.warning(f"Sub-query retrieval failed for '{sq}': {e}")
                        return {
                            'sub_query': sq,
                            'docs': [],
                            'count': 0,
                            'error': str(e)
                        }
                
                with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(sub_queries), 5)) as executor:
                    sub_results = list(executor.map(retrieve_for_subquery, sub_queries))
                
            else:
                # Sequential execution (more predictable)
                logger.info(f"[Graph Executor] 📍 Executing {len(sub_queries)} sub-queries sequentially")
                for i, sq in enumerate(sub_queries, 1):
                    try:
                        logger.info(f"[Graph Executor]   {i}/{len(sub_queries)}: {sq}")
                        docs = self.retrieval.retrieve(
                            chat_id=state['chat_id'],
                            query=sq,
                            agent_config=agent_config
                        )
                        sub_results.append({
                            'sub_query': sq,
                            'docs': docs,
                            'count': len(docs)
                        })
                    except Exception as e:
                        logger.warning(f"Sub-query retrieval failed for '{sq}': {e}")
                        sub_results.append({
                            'sub_query': sq,
                            'docs': [],
                            'count': 0,
                            'error': str(e)
                        })
            
            # Collect all documents from sub-queries
            for result in sub_results:
                all_docs.extend(result.get('docs', []))
                logger.info(f"[Graph Executor]   ✓ '{result['sub_query']}' → {result['count']} docs")
            
            # Deduplicate by content
            seen_content = set()
            unique_docs = []
            for doc in all_docs:
                content = doc.page_content if hasattr(doc, 'page_content') else str(doc)
                if content not in seen_content:
                    seen_content.add(content)
                    unique_docs.append(doc)
            
            logger.info(f"[Graph Executor] 🔀 Multi-hop complete: {len(all_docs)} total docs → {len(unique_docs)} unique")
            
            return {
                **state,
                'retrieved_docs': unique_docs,
                'sub_results': sub_results,
                'current_iteration': iteration,
                'debug_info': {
                    **state.get('debug_info', {}),
                    f'multihop_iteration_{iteration}': {
                        'sub_queries': sub_queries,
                        'chunks_per_subquery': chunks_per_subquery,
                        'total_retrieved': len(all_docs),
                        'unique_docs': len(unique_docs),
                        'sub_results': [
                            {'query': r['sub_query'], 'count': r['count']} 
                            for r in sub_results
                        ]
                    }
                }
            }
            
        except Exception as e:
            logger.error(f"[Graph Executor] Multi-hop retrieval failed: {e}")
            # Fallback to single-hop with original query
            logger.info(f"[Graph Executor] Falling back to single-hop retrieval")
            return self._retrieve_single(state, iteration)
    
    def _retrieve_single(self, state: RAGState, iteration: int) -> RAGState:
        """Fallback to single retrieval (used when multi-hop fails)."""
        try:
            from app.services.agents.base import RetrievalConfig, AgentConfig
            
            retrieval_config = RetrievalConfig(
                top_k=state['planned_chunks'],
                min_top_k=min(2, state['planned_chunks']),
                relevance_threshold=0.5
            )
            
            agent_config = AgentConfig(
                name="RAG Agent",
                retrieval=retrieval_config
            )
            
            docs = self.retrieval.retrieve(
                chat_id=state['chat_id'],
                query=state.get('user_query', state['query']),
                agent_config=agent_config
            )
            
            return {
                **state,
                'retrieved_docs': docs,
                'current_iteration': iteration,
                'debug_info': {
                    **state.get('debug_info', {}),
                    'fallback_retrieval': True
                }
            }
        except Exception as e:
            logger.error(f"Fallback retrieval also failed: {e}")
            return {
                **state,
                'retrieved_docs': [],
                'current_iteration': iteration
            }
    
    def _reflect_node(self, state: RAGState) -> RAGState:
        """Reflect on retrieval quality."""
        logger.info(f"[Graph Executor] Reflecting on quality (iteration {state['current_iteration']})")
        
        docs = state['retrieved_docs']
        planned = state['planned_chunks']
        iteration = state['current_iteration']
        max_iter = state.get('max_iterations', 3)
        
        # Check iteration limit
        if iteration >= max_iter:
            logger.info(f"[Graph Executor] Max iterations reached ({max_iter})")
            return {
                **state,
                'sufficient': True,
                'reflection_reasoning': f'Max iterations ({max_iter}) reached'
            }
        
        # Check if we got reasonable number of docs
        if not docs or len(docs) == 0:
            logger.info("[Graph Executor] No documents retrieved, insufficient")
            return {
                **state,
                'sufficient': False,
                'reflection_reasoning': 'No documents retrieved',
                'planned_chunks': min(planned * 2, 20)
            }
        
        # If comprehensive/exhaustive query and we have fewer than planned, get more
        scope = state.get('scope', 'focused')
        if scope in ['comprehensive', 'exhaustive'] and len(docs) < planned * 0.7:
            logger.info(f"[Graph Executor] {scope} query with {len(docs)}/{planned} docs, getting more")
            return {
                **state,
                'sufficient': False,
                'reflection_reasoning': f'{scope.capitalize()} query needs more coverage ({len(docs)}/{planned} docs)',
                'planned_chunks': min(planned + 5, 20)
            }
        
        # Otherwise, sufficient
        logger.info(f"[Graph Executor] Sufficient: {len(docs)} documents retrieved")
        return {
            **state,
            'sufficient': True,
            'reflection_reasoning': f'Retrieved {len(docs)} relevant documents'
        }
    
    def _quality_check_node(self, state: RAGState) -> RAGState:
        """
        Assess quality of current results and prepare for refinement decision.
        """
        quality_score = self._assess_quality(state)
        
        return {
            **state,
            'quality_score': quality_score
        }
    
    def _assess_quality(self, state: RAGState) -> float:
        """
        Assess the quality of current results (RAG docs + web results).
        Returns a score from 0.0 (terrible) to 1.0 (excellent).
        
        Factors considered:
        - Number and relevance of RAG documents
        - Quality of web search results (snippets vs scraped)
        - Content length and diversity
        - Source credibility
        """
        docs = state.get('retrieved_docs', [])
        web_results = state.get('web_search_results', [])
        query = state['query']
        
        score = 0.0
        
        # 1. RAG document scoring (max 0.5 points)
        if docs and len(docs) > 0:
            # Base score for having docs
            score += 0.2
            
            # Bonus for quantity (up to 0.15 points)
            doc_count_score = min(len(docs) / 10, 1.0) * 0.15
            score += doc_count_score
            
            # Bonus for content length (up to 0.15 points)
            total_content = sum(len(doc.page_content if hasattr(doc, 'page_content') else str(doc)) for doc in docs)
            content_score = min(total_content / 5000, 1.0) * 0.15
            score += content_score
            
            logger.debug(f"[Quality] RAG: {len(docs)} docs, {total_content} chars → score={score:.2f}")
        
        # 2. Web search results scoring (max 0.5 points)
        if web_results and len(web_results) > 0:
            # Base score for having web results
            score += 0.15
            
            # Check for scraped content (high quality)
            scraped_count = sum(1 for r in web_results if r.get('has_scraped_content'))
            if scraped_count > 0:
                score += 0.25  # Scraped content is high quality
                logger.debug(f"[Quality] Web: {scraped_count} scraped pages")
            else:
                # Only snippets (medium quality)
                snippet_count = sum(1 for r in web_results if r.get('snippet') and len(r.get('snippet', '')) > SCRAPING_MIN_SNIPPET_LENGTH)
                snippet_score = min(snippet_count / 3, 1.0) * 0.15
                score += snippet_score
                logger.debug(f"[Quality] Web: {snippet_count} snippets")
            
            # Bonus for source diversity (up to 0.1 points)
            unique_domains = len(set(r.get('url', '').split('/')[2] for r in web_results if r.get('url')))
            diversity_score = min(unique_domains / 3, 1.0) * 0.1
            score += diversity_score
        
        # 3. Penalty for no results at all
        if not docs and not web_results:
            score = 0.0
            logger.debug("[Quality] No results at all")
        
        # Ensure score is in range
        final_score = min(max(score, 0.0), 1.0)
        
        logger.info(f"[Quality] Assessment: {final_score:.2f} (RAG={len(docs)} docs, Web={len(web_results)} results)")
        
        return final_score
    
    def _should_refine(self, state: RAGState) -> str:
        """
        Decide if refinement is needed and determine next strategy.
        
        Strategy progression:
        1. RAG only (if docs exist)
        2. Web search (if time-sensitive or RAG insufficient)
        3. Hybrid (RAG + Web combined)
        4. Fallback to general knowledge (if all else fails)
        
        Returns:
            Next node: "answer" or "refine"
        """
        if not ENABLE_REFINEMENT:
            return "answer"
        
        refinement_count = state.get('refinement_count', 0)
        quality_score = state.get('quality_score', 0.0)
        current_strategy = state.get('current_strategy', 'unknown')
        tried_strategies = state.get('tried_strategies', [])
        
        # Check if we've reached max iterations
        if refinement_count >= REFINEMENT_MAX_ITERATIONS:
            logger.info(f"[Refinement] Max iterations reached ({REFINEMENT_MAX_ITERATIONS}), using current results")
            return "answer"
        
        # Check if quality is sufficient
        if quality_score >= REFINEMENT_QUALITY_THRESHOLD:
            logger.info(f"[Refinement] Quality sufficient ({quality_score:.2f} >= {REFINEMENT_QUALITY_THRESHOLD}), proceeding to answer")
            return "answer"
        
        # Quality is insufficient, determine next strategy
        logger.warning(f"[Refinement] Quality insufficient ({quality_score:.2f} < {REFINEMENT_QUALITY_THRESHOLD}), attempting refinement...")
        logger.info(f"[Refinement] Current strategy: {current_strategy}, tried: {tried_strategies}")
        
        return "refine"
    
    def _refine_node(self, state: RAGState) -> RAGState:
        """
        Refine search strategy when results are insufficient.
        Tries different approaches to find better information.
        """
        refinement_count = state.get('refinement_count', 0)
        tried_strategies = state.get('tried_strategies', [])
        current_strategy = state.get('current_strategy', 'unknown')
        
        logger.info(f"[Refinement] Iteration {refinement_count + 1}/{REFINEMENT_MAX_ITERATIONS}")
        logger.info(f"[Refinement] Previous strategy: {current_strategy}")
        logger.info(f"[Refinement] Tried strategies: {tried_strategies}")
        
        # Determine next strategy
        next_strategy = self._determine_next_strategy(state)
        
        if next_strategy == 'none':
            # No more strategies to try
            logger.warning("[Refinement] No more strategies available, using current results")
            return {
                **state,
                'refinement_count': refinement_count + 1,
                'refinement_reasoning': 'All strategies exhausted'
            }
        
        logger.info(f"[Refinement] Trying strategy: {next_strategy}")
        
        # Execute the new strategy
        try:
            if next_strategy == 'web_search':
                # Try web search
                state = self._web_search_node(state)
                tried_strategies.append('web_search')
                
            elif next_strategy == 'hybrid':
                # Try hybrid (RAG + Web)
                state['needs_web_search'] = True
                state = self._plan_node(state)
                state = self._retrieve_node(state)
                tried_strategies.append('hybrid')
                
            elif next_strategy == 'expand_rag':
                # Expand RAG search (more chunks)
                old_chunks = state.get('planned_chunks', 5)
                state['planned_chunks'] = min(old_chunks + 5, 20)
                state = self._retrieve_node(state)
                tried_strategies.append('expand_rag')
            
            # Reassess quality
            quality_score = self._assess_quality(state)
            
            return {
                **state,
                'refinement_count': refinement_count + 1,
                'current_strategy': next_strategy,
                'tried_strategies': tried_strategies,
                'quality_score': quality_score,
                'refinement_reasoning': f'Tried {next_strategy}, quality: {quality_score:.2f}'
            }
            
        except Exception as e:
            logger.error(f"[Refinement] Strategy '{next_strategy}' failed: {e}")
            return {
                **state,
                'refinement_count': refinement_count + 1,
                'tried_strategies': tried_strategies,
                'refinement_reasoning': f'Strategy {next_strategy} failed: {str(e)}'
            }
    
    def _determine_next_strategy(self, state: RAGState) -> str:
        """
        Determine the next strategy to try based on what's been attempted.
        
        Strategy progression:
        - If RAG failed → Try web_search
        - If web_search failed → Try hybrid
        - If hybrid failed or only RAG exists → Try expand_rag
        - Otherwise → none (give up)
        """
        tried_strategies = state.get('tried_strategies', [])
        docs = state.get('retrieved_docs', [])
        web_results = state.get('web_search_results', [])
        
        # If we haven't tried web search and it's available
        if 'web_search' not in tried_strategies:
            return 'web_search'
        
        # If we have RAG docs but not web results, try hybrid
        if docs and 'hybrid' not in tried_strategies:
            return 'hybrid'
        
        # If we have few RAG docs, try expanding
        if docs and len(docs) < 10 and 'expand_rag' not in tried_strategies:
            return 'expand_rag'
        
        # No more strategies
        return 'none'
    
    # ========================================================================
    # Conversational Memory Methods
    # ========================================================================
    
    def _get_conversation_history(self, chat_id: str) -> List[Dict[str, Any]]:
        """
        Get conversation history for a chat.
        Returns up to MEMORY_MAX_TURNS recent messages.
        """
        if not ENABLE_CONVERSATION_MEMORY:
            return []
        
        history = self._conversation_memory.get(chat_id, [])
        
        # Limit to max turns
        if len(history) > MEMORY_MAX_TURNS:
            history = history[-MEMORY_MAX_TURNS:]
            self._conversation_memory[chat_id] = history
        
        return history
    
    def _add_to_conversation_history(
        self,
        chat_id: str,
        query: str,
        answer: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Add a query-answer pair to conversation history."""
        if not ENABLE_CONVERSATION_MEMORY:
            return
        
        if chat_id not in self._conversation_memory:
            self._conversation_memory[chat_id] = []
        
        self._conversation_memory[chat_id].append({
            'query': query,
            'answer': answer,
            'timestamp': datetime.now().isoformat(),
            'metadata': metadata or {}
        })
        
        # Trim to max turns
        if len(self._conversation_memory[chat_id]) > MEMORY_MAX_TURNS:
            self._conversation_memory[chat_id] = self._conversation_memory[chat_id][-MEMORY_MAX_TURNS:]
        
        logger.debug(f"[Memory] Added to history for {chat_id}, total turns: {len(self._conversation_memory[chat_id])}")
    
    def _build_contextual_query(self, query: str, chat_id: str) -> str:
        """
        Enhance query with conversation context.
        Returns an enriched query that includes relevant context from previous turns.
        """
        if not ENABLE_CONVERSATION_MEMORY:
            return query
        
        history = self._get_conversation_history(chat_id)
        
        if not history:
            return query
        
        # Use only recent turns based on context window
        recent_history = history[-MEMORY_CONTEXT_WINDOW:] if len(history) > MEMORY_CONTEXT_WINDOW else history
        
        # Build context from recent exchanges
        context_parts = []
        for turn in recent_history:
            context_parts.append(f"Previous Q: {turn['query'][:100]}")
            context_parts.append(f"Previous A: {turn['answer'][:150]}")
        
        context_text = "\n".join(context_parts)
        
        # Check if query contains pronouns or references
        pronouns = ['it', 'this', 'that', 'these', 'those', 'they', 'them', 'he', 'she']
        has_reference = any(pronoun in query.lower().split() for pronoun in pronouns)
        
        if has_reference or len(recent_history) > 0:
            logger.info(f"[Memory] Enhancing query with {len(recent_history)} previous turns")
            
            # Create contextual query for retrieval
            contextual = f"Given this conversation context:\n{context_text}\n\nCurrent question: {query}"
            return contextual
        
        return query
    
    def _format_conversation_context_for_llm(self, query: str, chat_id: str) -> str:
        """
        Format conversation history for LLM prompt.
        Returns formatted context string to include in LLM prompt.
        """
        if not ENABLE_CONVERSATION_MEMORY:
            return ""
        
        history = self._get_conversation_history(chat_id)
        
        if not history:
            return ""
        
        # Use recent history for LLM context
        recent_history = history[-MEMORY_CONTEXT_WINDOW:] if len(history) > MEMORY_CONTEXT_WINDOW else history
        
        if not recent_history:
            return ""
        
        formatted_parts = ["CONVERSATION HISTORY:"]
        for i, turn in enumerate(recent_history, 1):
            formatted_parts.append(f"\nTurn {i}:")
            formatted_parts.append(f"User: {turn['query']}")
            answer_preview = turn['answer'][:300] + "..." if len(turn['answer']) > 300 else turn['answer']
            formatted_parts.append(f"Assistant: {answer_preview}")
        
        formatted_parts.append("\n")
        
        return "\n".join(formatted_parts)
    
    def _answer_node(self, state: RAGState) -> RAGState:
        """Generate answer using retrieved documents and/or web search results."""
        has_rag_docs = len(state.get('retrieved_docs', [])) > 0
        has_web_results = len(state.get('web_search_results', [])) > 0
        
        mode = "Unknown"
        if has_rag_docs and has_web_results:
            mode = "🔄 Hybrid (RAG + Web)"
        elif has_rag_docs:
            mode = "📚 RAG"
        elif has_web_results:
            mode = "🌐 Web"
        
        logger.info(f"[Graph Executor] {mode} - Generating answer")
        
        try:
            # Get conversation context
            chat_id = state['chat_id']
            conversation_context = self._format_conversation_context_for_llm(state['query'], chat_id)
            
            # Build context from available sources
            context_parts = []
            
            # Add conversation history if available
            if conversation_context:
                context_parts.append(conversation_context)
            
            # Add RAG documents
            if has_rag_docs:
                rag_context = self.retrieval.format_context(state['retrieved_docs'])
                context_parts.append("=== KNOWLEDGE BASE DOCUMENTS ===\n" + rag_context)
            
            # Add web search results
            if has_web_results:
                web_context = self._format_web_results(state['web_search_results'])
                context_parts.append("=== WEB SEARCH RESULTS ===\n" + web_context)
                logger.info(f"[Graph Executor] Web context length: {len(web_context)} chars")
            
            # Combine contexts
            full_context = "\n\n".join(context_parts)
            logger.info(f"[Graph Executor] Total context length: {len(full_context)} chars (includes conversation history)")
            
            # Build prompt based on mode
            if has_rag_docs and has_web_results:
                # Hybrid mode: Use RAG citations for docs, no citations for web
                prompt = self._build_hybrid_prompt(state['query'], full_context)
            elif has_rag_docs:
                # RAG only: Use citations
                prompt = self._build_rag_prompt(state['query'], full_context)
            elif has_web_results:
                # Web only: No citations needed (sources button will show)
                prompt = self._build_web_prompt(state['query'], full_context)
            else:
                # Fallback to direct answer if no sources
                prompt = self._build_direct_prompt(state['query'], conversation_context)
            
            # Generate answer
            answer = self.llm._call_ollama(
                model=self.llm.default_model,
                prompt=prompt,
                temperature=0.7,
                max_tokens=2000
            )
            
            logger.info(f"[Graph Executor] {mode} answer generated successfully")
            
            return {
                **state,
                'answer': answer,
                'used_rag': has_rag_docs,
                'used_web_search': has_web_results,
                'debug_info': {
                    **state.get('debug_info', {}),
                    'answer': {
                        'mode': mode,
                        'num_rag_docs': len(state.get('retrieved_docs', [])),
                        'num_web_results': len(state.get('web_search_results', [])),
                        'context_length': len(full_context)
                    }
                }
            }
            
        except Exception as e:
            logger.error(f"[Graph Executor] Answer generation failed: {e}")
            return {
                **state,
                'answer': f"Error generating answer: {str(e)}",
                'used_rag': has_rag_docs,
                'used_web_search': has_web_results
            }
    
    def _answer_direct_node(self, state: RAGState) -> RAGState:
        """Generate answer without RAG (general knowledge)."""
        logger.info("[Graph Executor] Generating direct answer (no RAG)")
        
        try:
            # Get conversation context (FIXED: was missing this!)
            chat_id = state['chat_id']
            conversation_context = self._format_conversation_context_for_llm(state['query'], chat_id)
            
            # Build prompt with conversation context
            prompt = self._build_direct_prompt(state['query'], conversation_context)
            
            logger.info(f"[Graph Executor] Direct answer prompt length: {len(prompt)} chars, "
                       f"conversation_context: {len(conversation_context)} chars")
            
            # Generate answer
            answer = self.llm._call_ollama(
                model=self.llm.default_model,  # Use configured model from .env
                prompt=prompt,
                temperature=0.7,
                max_tokens=2000
            )
            
            logger.info("[Graph Executor] Direct answer generated successfully")
            
            return {
                **state,
                'answer': answer,
                'used_rag': False,
                'used_web_search': False
            }
            
        except Exception as e:
            logger.error(f"[Graph Executor] Direct answer generation failed: {e}")
            return {
                **state,
                'answer': f"Error generating answer: {str(e)}",
                'used_rag': False,
                'used_web_search': False
            }
    
    def _web_search_node(self, state: RAGState) -> RAGState:
        """Execute web search for time-sensitive queries, with smart scraping for empty snippets."""
        logger.info(f"[Graph Executor] 🌐 Executing web search for: '{state['query'][:50]}...'")
        
        query = state['query']
        
        # Check cache first
        if query in self._search_cache:
            cached_results, timestamp = self._search_cache[query]
            age = datetime.now() - timestamp
            
            if age < self._cache_ttl:
                logger.info(f"[Graph Executor] ♻️  Using cached search results (age: {age.seconds}s)")
                return {
                    **state,
                    'web_search_results': cached_results,
                    'used_web_search': True,
                    'debug_info': {
                        **state.get('debug_info', {}),
                        'web_search_cached': True,
                        'cache_age_seconds': age.seconds
                    }
                }
            else:
                # Cache expired, remove it
                del self._search_cache[query]
                logger.info(f"[Graph Executor] Cache expired (age: {age.seconds}s > {self._cache_ttl.seconds}s)")
        
        try:
            import asyncio
            import os
            from app.integrations.search_engines.multi_engine import MultiEngineSearch
            
            # Execute web search (async) with Brave API key
            brave_api_key = os.getenv('BRAVE_API_KEY')
            search = MultiEngineSearch(
                brave_api_key=brave_api_key,
                enable_fallback=True,
                enable_qwant=False  # Disable Qwant (403 errors)
            )
            results, engine = asyncio.run(search.search(query, max_results=5))
            
            logger.info(f"[Graph Executor] Found {len(results)} web results from {engine}")
            
            # Format results
            formatted_results = []
            for idx, result in enumerate(results, 1):
                formatted_results.append({
                    'title': result.get('title', 'No title'),
                    'url': result.get('url', ''),
                    'snippet': result.get('snippet', ''),
                    'source': engine,
                    'index': idx
                })
            
            # Check if snippets are insufficient - scrape if needed
            needs_scraping = self._check_if_scraping_needed(formatted_results)
            
            if needs_scraping:
                logger.info("[Graph Executor] Snippets insufficient, initiating web scraping...")
                scraped_content = asyncio.run(self._scrape_web_results(formatted_results[:3]))
                
                if scraped_content:
                    # Merge scraped content with search results
                    for result in formatted_results:
                        url = result.get('url', '')
                        for scraped in scraped_content:
                            if scraped.get('url') == url:
                                result['scraped_text'] = scraped.get('text', '')
                                result['has_scraped_content'] = True
                                break
                    
                    logger.info(f"[Graph Executor] ✅ Scraped {len(scraped_content)} pages successfully")
                else:
                    logger.warning("[Graph Executor] ⚠️ Scraping failed, using snippets + LLM knowledge")
            
            # Cache the results
            self._search_cache[query] = (formatted_results, datetime.now())
            logger.info(f"[Graph Executor] Cached search results for query")
            
            return {
                **state,
                'web_search_results': formatted_results,
                'used_web_search': True
            }
            
        except Exception as e:
            logger.error(f"[Graph Executor] Web search failed: {e}")
            return {
                **state,
                'web_search_results': [],
                'used_web_search': False,
                'debug_info': {
                    **state.get('debug_info', {}),
                    'web_search_error': str(e)
                },
                'used_rag': False
            }
    
    # ========================================================================
    # Conditional Edge Functions
    # ========================================================================
    
    def _should_retrieve(self, state: RAGState) -> str:
        """Decide routing after classification."""
        intent = state['intent']
        
        if intent == 'retrieval':
            return "retrieve"  # RAG (may include web search in parallel)
        elif intent == 'web_search':
            return "web_search"  # Web search only
        else:
            return "answer_direct"  # General knowledge
    
    def _should_continue_retrieving(self, state: RAGState) -> str:
        """Decide if reflection is needed."""
        return "reflect" if state['current_iteration'] < state['max_iterations'] else "quality_check"
    
    def _should_reretrieve(self, state: RAGState) -> str:
        """Decide if re-retrieval is needed."""
        if not state['sufficient'] and state['current_iteration'] < state['max_iterations']:
            return "retrieve"
        return "quality_check"
    
    # ========================================================================
    # Helper Methods
    # ========================================================================
    
    def _check_if_scraping_needed(self, results: List[Dict]) -> bool:
        """
        Check if web scraping is needed based on snippet quality.
        Returns True if snippets are empty or insufficient.
        Uses configurable thresholds from environment variables.
        """
        if not results:
            return False
        
        # Count results with meaningful snippets (>SCRAPING_MIN_SNIPPET_LENGTH chars)
        meaningful_snippets = sum(
            1 for r in results 
            if r.get('snippet', '').strip() and len(r.get('snippet', '').strip()) > SCRAPING_MIN_SNIPPET_LENGTH
        )
        
        # Scrape if less than SCRAPING_MIN_SNIPPETS results have meaningful snippets
        needs_scraping = meaningful_snippets < SCRAPING_MIN_SNIPPETS
        
        if needs_scraping:
            logger.info(f"[Graph Executor] Only {meaningful_snippets}/{len(results)} results have meaningful snippets (threshold: {SCRAPING_MIN_SNIPPETS} snippets, {SCRAPING_MIN_SNIPPET_LENGTH} chars)")
        
        return needs_scraping
    
    async def _scrape_web_results(self, results: List[Dict]) -> List[Dict]:
        """
        Scrape actual content from web search results.
        Returns list of dicts with url, text, title, quality_score.
        Gracefully handles failures - returns partial results if some URLs fail.
        """
        from app.integrations.content_loader import load_content_from_urls
        
        # Extract URLs from results
        urls = [r['url'] for r in results if r.get('url')]
        
        if not urls:
            logger.warning("[Graph Executor] No URLs to scrape")
            return []
        
        try:
            logger.info(f"[Graph Executor] Scraping {len(urls)} URLs...")
            
            # Scrape with reasonable timeout and quality threshold
            scraped = await load_content_from_urls(
                urls,
                min_words=30,  # Minimum 30 words
                min_quality_score=0.2,  # Low threshold to accept most content
                timeout=10  # 10 second timeout per page
            )
            
            if scraped:
                logger.info(f"[Graph Executor] Successfully scraped {len(scraped)}/{len(urls)} pages")
            else:
                logger.warning(f"[Graph Executor] ⚠️ All scraping attempts failed for {len(urls)} URLs")
            
            return scraped
            
        except Exception as e:
            logger.warning(f"[Graph Executor] ⚠️ Web scraping failed: {e}")
            return []
    
    def _format_web_results(self, results: List[Dict]) -> str:
        """
        Format web search results for context, prioritizing scraped content.
        Adds source attribution tags for the sources sidebar.
        """
        if not results:
            return ""
        
        formatted = []
        for result in results:
            url = result.get('url', '')
            title = result.get('title', 'No title')
            index = result.get('index', 0)
            
            # Prioritize scraped content over snippets
            if result.get('has_scraped_content') and result.get('scraped_text'):
                # Use scraped content (truncate to 1500 chars)
                content = result['scraped_text'][:1500]
                if len(result['scraped_text']) > 1500:
                    content += "..."
                
                formatted.append(
                    f"[{index}] 🌐 {title} [SCRAPED]\n"
                    f"Source: {url}\n"
                    f"Content: {content}\n"
                )
            else:
                # Fall back to snippet
                snippet = result.get('snippet', '')
                source_tag = "[SNIPPET]" if snippet else "[NO CONTENT]"
                
                formatted.append(
                    f"[{index}] 🌐 {title} {source_tag}\n"
                    f"Source: {url}\n"
                    f"Snippet: {snippet if snippet else 'No snippet available'}\n"
                )
        
        return "\n".join(formatted)
    
    def _get_document_terms(self, chat_id: str) -> Optional[List[str]]:
        """Get document terms for bag-of-words classification."""
        try:
            vector_store = self.vector_store_manager.get_chat_store(chat_id)
            sample_docs = vector_store.similarity_search("", k=20)
            
            if not sample_docs:
                return None
            
            # Extract terms from metadata or content
            all_terms = set()
            for doc in sample_docs:
                if 'bow_terms' in doc.metadata:
                    all_terms.update(doc.metadata['bow_terms'])
                elif 'terms' in doc.metadata:
                    all_terms.update(doc.metadata['terms'])
            
            return list(all_terms) if all_terms else None
            
        except Exception as e:
            logger.warning(f"[Graph Executor] Failed to get document terms: {e}")
            return None
    
    def _build_rag_prompt(self, query: str, context: str) -> str:
        """Build prompt with context for RAG (documents only - requires citations)."""
        return f"""You are a helpful AI assistant. Answer the question based on the provided context.

{context}

CURRENT QUESTION:
{query}

INSTRUCTIONS:
Answer the question based on the information above. Be concise, accurate, and cite sources from the knowledge base documents.
**IMPORTANT**: Respond in the SAME LANGUAGE as the user's question.
If conversation history is provided, use it to understand references and context in the current question.

CITATION RULES (REQUIRED):
- You MUST include at least ONE citation using the format 【1】, 【2】, etc. or [1], [2], etc.
- The citation numbers correspond to the document sources above ([1], [2], etc.)
- Place citations immediately after the relevant statement or at the end of the sentence.
- Example: 'The capital of France is Paris【1】.'

NOTE: The documents may be in a different language than the question. Use the information from the documents and translate/adapt it naturally to respond in the user's language.

If the context doesn't contain enough information to answer fully, say so clearly.

Answer:"""
    
    def _build_web_prompt(self, query: str, context: str) -> str:
        """Build prompt for web search results (NO citations - sources button will show)."""
        return f"""You are a helpful AI assistant. Answer the question based on available context.

{context}

CURRENT QUESTION:
{query}

INSTRUCTIONS:
Answer the question based on the information above. Be concise and accurate.
Use the information from the search results and your general knowledge to provide a comprehensive answer.
**IMPORTANT**: Respond in the SAME LANGUAGE as the user's question.
If conversation history is provided, use it to understand references and context in the current question.

IMPORTANT: 
- DO NOT use citation numbers like [1], [2], etc. 
- The user will see sources via the "Sources" button in the UI.
- If the snippets are empty or incomplete, you may use your general knowledge to provide context.

Answer:"""

    def _build_hybrid_prompt(self, query: str, context: str) -> str:
        """Build prompt for hybrid mode (RAG + Web - only cite RAG docs)."""
        return f"""You are a helpful AI assistant. Answer the question using all available context.

{context}

CURRENT QUESTION:
{query}

INSTRUCTIONS:
Answer using ALL available information above. Be concise, accurate, and comprehensive.
**IMPORTANT**: Respond in the SAME LANGUAGE as the user's question.
If conversation history is provided, use it to understand references and context in the current question.

CITATION RULES:
- For KNOWLEDGE BASE DOCUMENTS: Use citations 【1】, 【2】, etc. for document references.
- For WEB SEARCH RESULTS: Do NOT use citations - sources will be available via the "Sources" button.
- Combine information from both sources to provide the best answer.

NOTE: Context sources may be in different languages. Translate/adapt the information naturally to respond in the user's language.

If you need more information, say so clearly.

Answer:"""
    
    def _build_direct_prompt(self, query: str, conversation_context: str = "") -> str:
        """Build prompt without retrieval context for general queries."""
        if conversation_context:
            return f"""You are a helpful AI assistant. Answer this question using your general knowledge.

{conversation_context}

CURRENT QUESTION: {query}

INSTRUCTIONS:
**IMPORTANT**: Respond in the SAME LANGUAGE as the user's question.
Use the conversation history to understand references and context in the current question.

Answer:"""
        else:
            return f"""You are a helpful AI assistant. Answer this question using your general knowledge.

Question: {query}

INSTRUCTIONS:
**IMPORTANT**: Respond in the SAME LANGUAGE as the user's question.

Answer:"""
    
    # ========================================================================
    # Public Interface
    # ========================================================================
    
    def query_stream(
        self,
        chat_id: str,
        query: str,
        max_iterations: int = 3
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Execute RAG query with node-by-node streaming.
        
        Yields updates for each node execution, allowing real-time progress tracking.
        
        Args:
            chat_id: Chat identifier
            query: User query
            max_iterations: Maximum retrieval iterations
        
        Yields:
            Dict with node updates and final result
        """
        logger.info(f"[Graph Executor] Starting streaming query: '{query[:50]}...'")
        
        # Get conversation history
        conversation_history = self._get_conversation_history(chat_id)
        
        # Initial state
        initial_state: RAGState = {
            'chat_id': chat_id,
            'query': query,
            'user_query': query,
            'conversation_history': conversation_history,
            'contextual_query': query,
            'intent': 'unknown',
            'intent_confidence': 0.0,
            'needs_web_search': False,
            'requires_multihop': False,
            'sub_queries': [],
            'sub_results': [],
            'multihop_reasoning': '',
            'scope': 'focused',
            'planned_chunks': 5,
            'retrieved_docs': [],
            'web_search_results': [],
            'current_iteration': 0,
            'max_iterations': max_iterations,
            'sufficient': False,
            'reflection_reasoning': '',
            'refinement_count': 0,
            'current_strategy': 'rag',
            'quality_score': 0.0,
            'tried_strategies': [],
            'refinement_reasoning': '',
            'answer': '',
            'used_rag': False,
            'used_web_search': False,
            'debug_info': {}
        }
        
        # Stream graph execution node-by-node
        try:
            for output in self.graph.stream(initial_state):
                # output is a dict with node_name: node_state
                for node_name, node_state in output.items():
                    # Yield node update
                    node_update = {
                        'type': 'node',
                        'node': node_name,
                        'state': self._extract_node_info(node_name, node_state)
                    }
                    yield node_update
                    logger.info(f"[Graph Executor] Node '{node_name}' completed")
            
            # After all nodes complete, yield final result
            final_state = node_state  # Last node's state is the final state
            
            # Store conversation exchange
            answer = final_state.get('answer', '')
            metadata = {
                'intent': final_state.get('intent', 'unknown'),
                'used_rag': final_state.get('used_rag', False),
                'used_web_search': final_state.get('used_web_search', False),
                'used_multihop': final_state.get('requires_multihop', False),
                'num_docs': len(final_state.get('retrieved_docs', [])),
                'iterations': final_state.get('current_iteration', 0)
            }
            self._add_to_conversation_history(chat_id, query, answer, metadata)
            
            # Yield final result
            yield {
                'type': 'final',
                'answer': answer,
                'used_rag': final_state.get('used_rag', False),
                'used_web_search': final_state.get('used_web_search', False),
                'used_multihop': final_state.get('requires_multihop', False),
                'sub_queries': final_state.get('sub_queries', []),
                'multihop_reasoning': final_state.get('multihop_reasoning', ''),
                'intent': final_state.get('intent', 'unknown'),
                'intent_confidence': final_state.get('intent_confidence', 0.0),
                'scope': final_state.get('scope', 'unknown'),
                'num_docs': len(final_state.get('retrieved_docs', [])),
                'iterations': final_state.get('current_iteration', 0),
                'sufficient': final_state.get('sufficient', False),
                'retrieved_docs': final_state.get('retrieved_docs', []),
                'web_search_results': final_state.get('web_search_results', []),
                'debug_info': final_state.get('debug_info', {})
            }
            
        except Exception as e:
            logger.error(f"[Graph Executor] Streaming query failed: {e}", exc_info=True)
            yield {
                'type': 'error',
                'error': str(e),
                'answer': f"Error processing query: {str(e)}",
                'used_rag': False
            }
    
    def _extract_node_info(self, node_name: str, state: RAGState) -> Dict[str, Any]:
        """Extract relevant information from node state for streaming updates."""
        info = {'node_name': node_name}
        
        if node_name == 'classify':
            info.update({
                'intent': state.get('intent', 'unknown'),
                'confidence': state.get('intent_confidence', 0.0),
                'needs_web_search': state.get('needs_web_search', False),
                'requires_multihop': state.get('requires_multihop', False)
            })
        elif node_name == 'plan':
            info.update({
                'scope': state.get('scope', 'unknown'),
                'planned_chunks': state.get('planned_chunks', 0)
            })
        elif node_name == 'retrieve':
            info.update({
                'num_docs': len(state.get('retrieved_docs', [])),
                'iteration': state.get('current_iteration', 0)
            })
        elif node_name == 'reflect':
            info.update({
                'sufficient': state.get('sufficient', False),
                'reasoning': state.get('reflection_reasoning', '')
            })
        elif node_name == 'web_search':
            info.update({
                'num_results': len(state.get('web_search_results', []))
            })
        elif node_name == 'quality_check':
            info.update({
                'quality_score': state.get('quality_score', 0.0),
                'strategy': state.get('current_strategy', 'unknown')
            })
        elif node_name == 'refine':
            info.update({
                'refinement_count': state.get('refinement_count', 0),
                'reasoning': state.get('refinement_reasoning', '')
            })
        elif node_name in ['answer', 'answer_direct']:
            info.update({
                'answer_preview': state.get('answer', '')[:100] + '...' if len(state.get('answer', '')) > 100 else state.get('answer', ''),
                'used_rag': state.get('used_rag', False),
                'used_web_search': state.get('used_web_search', False)
            })
        
        return info
    
    def query(
        self,
        chat_id: str,
        query: str,
        max_iterations: int = 3
    ) -> Dict[str, Any]:
        """
        Execute RAG query using the graph workflow (non-streaming).
        
        Args:
            chat_id: Chat identifier
            query: User query
            max_iterations: Maximum retrieval iterations
        
        Returns:
            Dict with answer, metadata, and debug info
        """
        logger.info(f"[Graph Executor] Processing query: '{query[:50]}...'")
        
        # Get conversation history
        conversation_history = self._get_conversation_history(chat_id)
        
        # Initial state
        initial_state: RAGState = {
            'chat_id': chat_id,
            'query': query,
            'user_query': query,  # Store original for multi-hop
            'conversation_history': conversation_history,  # Include conversation history
            'contextual_query': query,  # Will be updated in classify_node
            'intent': 'unknown',
            'intent_confidence': 0.0,
            'needs_web_search': False,
            'requires_multihop': False,  # Multi-hop detection
            'sub_queries': [],  # Sub-queries for multi-hop
            'sub_results': [],  # Results from sub-queries
            'multihop_reasoning': '',  # Why multi-hop was used
            'scope': 'focused',
            'planned_chunks': 5,
            'retrieved_docs': [],
            'web_search_results': [],
            'current_iteration': 0,
            'max_iterations': max_iterations,
            'sufficient': False,
            'reflection_reasoning': '',
            'refinement_count': 0,  # Refinement tracking
            'current_strategy': 'rag',  # Start with RAG
            'quality_score': 0.0,  # Quality assessment
            'tried_strategies': [],  # Strategies attempted
            'refinement_reasoning': '',  # Why refinement was needed
            'answer': '',
            'used_rag': False,
            'used_web_search': False,
            'debug_info': {}
        }
        
        # Execute graph
        try:
            final_state = self.graph.invoke(initial_state)
            
            logger.info(f"[Graph Executor] Query completed: "
                       f"intent={final_state['intent']}, "
                       f"iterations={final_state['current_iteration']}, "
                       f"used_rag={final_state['used_rag']}, "
                       f"used_web_search={final_state.get('used_web_search', False)}, "
                       f"multi_hop={final_state.get('requires_multihop', False)}, "
                       f"docs={len(final_state['retrieved_docs'])}, "
                       f"web_results={len(final_state.get('web_search_results', []))}")
            
            # Store conversation exchange after successful query
            answer = final_state['answer']
            metadata = {
                'intent': final_state['intent'],
                'used_rag': final_state['used_rag'],
                'used_web_search': final_state.get('used_web_search', False),
                'used_multihop': final_state.get('requires_multihop', False),
                'num_docs': len(final_state['retrieved_docs']),
                'iterations': final_state['current_iteration']
            }
            self._add_to_conversation_history(chat_id, query, answer, metadata)
            
            return {
                'answer': answer,
                'used_rag': final_state['used_rag'],
                'used_web_search': final_state.get('used_web_search', False),
                'used_multihop': final_state.get('requires_multihop', False),
                'sub_queries': final_state.get('sub_queries', []),
                'multihop_reasoning': final_state.get('multihop_reasoning', ''),
                'intent': final_state['intent'],
                'intent_confidence': final_state['intent_confidence'],
                'scope': final_state['scope'],
                'num_docs': len(final_state['retrieved_docs']),
                'iterations': final_state['current_iteration'],
                'sufficient': final_state['sufficient'],
                'retrieved_docs': final_state['retrieved_docs'],  # Include docs for source display
                'web_search_results': final_state.get('web_search_results', []),  # Include web results
                'debug_info': final_state['debug_info']
            }
            
        except Exception as e:
            logger.error(f"[Graph Executor] Query failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            
            return {
                'answer': f"Error processing query: {str(e)}",
                'used_rag': False,
                'error': str(e)
            }

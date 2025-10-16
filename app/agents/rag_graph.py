"""
Adaptive RAG Graph using LangGraph.

This module implements an intelligent, self-reflective RAG system that:
1. Classifies query intent (retrieval vs general)
2. Plans retrieval strategy (scope, num_chunks)
3. Retrieves documents adaptively
4. Reflects on retrieval quality
5. Re-retrieves if needed (up to max iterations)
6. Generates final answer

Uses existing LangChain components wrapped in LangGraph workflow.
"""

from __future__ import annotations

import logging
from typing import TypedDict, List, Dict, Any, Literal
from dataclasses import dataclass

from langgraph.graph import StateGraph, END

logger = logging.getLogger(__name__)


# ============================================================================
# State Definition
# ============================================================================

class RAGState(TypedDict):
    """
    State tracked throughout the RAG workflow.
    
    This state is passed between nodes and updated at each step.
    """
    # Input
    chat_id: str
    query: str
    user_query: str  # Original user query (for multi-hop)
    
    # Classification
    intent: str  # 'retrieval', 'general', or 'web_search'
    intent_confidence: float
    needs_web_search: bool  # Does query need current/real-time info?
    
    # Multi-hop reasoning
    requires_multihop: bool  # Does query need multiple searches?
    sub_queries: List[str]  # Decomposed sub-queries
    sub_results: List[Dict[str, Any]]  # Results from each sub-query
    multihop_reasoning: str  # Why multi-hop was used
    
    # Planning
    scope: str  # 'specific', 'focused', 'comprehensive', 'exhaustive'
    planned_chunks: int  # How many chunks to retrieve
    
    # Retrieval
    retrieved_docs: List[Any]
    web_search_results: List[Dict[str, Any]]  # Web search results
    current_iteration: int
    max_iterations: int
    
    # Reflection
    sufficient: bool  # Is retrieved context sufficient?
    reflection_reasoning: str
    
    # Iterative refinement
    refinement_count: int  # Number of refinement attempts
    current_strategy: str  # Current search strategy: 'rag', 'web', 'scrape', 'hybrid'
    quality_score: float  # Quality assessment of current results (0.0-1.0)
    tried_strategies: List[str]  # Strategies already attempted
    refinement_reasoning: str  # Why refinement was needed
    
    # Conversational memory
    conversation_history: List[Dict[str, Any]]  # Previous messages in conversation
    contextual_query: str  # Query enhanced with conversation context
    
    # Output
    answer: str
    used_rag: bool
    used_web_search: bool
    
    # Metadata
    debug_info: Dict[str, Any]


@dataclass
class RetrievalPlan:
    """Plan for document retrieval."""
    scope: str
    num_chunks: int
    reasoning: str
    search_strategy: str = "hybrid"


# ============================================================================
# Node Functions (Wrap Existing Components)
# ============================================================================

def classify_intent_node(state: RAGState) -> RAGState:
    """
    Node 1: Classify query intent using existing intent classifier.
    
    Uses the 3-stage intent classifier (bag-of-words → semantic → LLM).
    """
    logger.info(f"[RAG Graph] Node 1: Classify Intent for query: '{state['query'][:50]}...'")
    
    # This will be injected by the graph builder
    # For now, return state with placeholder
    return {
        **state,
        'debug_info': {
            **state.get('debug_info', {}),
            'classify_node': 'executed'
        }
    }


def plan_retrieval_node(state: RAGState) -> RAGState:
    """
    Node 2: Plan retrieval strategy based on query analysis.
    
    Determines:
    - Query scope (specific, focused, comprehensive, exhaustive)
    - Number of chunks needed
    - Search strategy
    """
    logger.info(f"[RAG Graph] Node 2: Plan Retrieval (intent: {state.get('intent', 'unknown')})")
    
    query = state['query']
    query_lower = query.lower()
    
    # Analyze query to determine scope
    scope, num_chunks, reasoning = _analyze_query_scope(query_lower)
    
    logger.info(f"[RAG Graph] Plan: scope={scope}, chunks={num_chunks}, reasoning={reasoning}")
    
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


def retrieve_documents_node(state: RAGState) -> RAGState:
    """
    Node 3: Retrieve documents using planned strategy.
    
    Uses existing retrieval system with dynamically adjusted top_k.
    """
    logger.info(f"[RAG Graph] Node 3: Retrieve Documents (k={state['planned_chunks']})")
    
    # Increment iteration counter
    current_iteration = state.get('current_iteration', 0) + 1
    
    # This will use the actual retrieval system when injected
    # For now, return state with updated iteration
    return {
        **state,
        'current_iteration': current_iteration,
        'retrieved_docs': state.get('retrieved_docs', []),
        'debug_info': {
            **state.get('debug_info', {}),
            'retrieve': {
                'iteration': current_iteration,
                'planned_chunks': state['planned_chunks']
            }
        }
    }


def reflect_on_quality_node(state: RAGState) -> RAGState:
    """
    Node 4: Reflect on retrieval quality.
    
    Evaluates if retrieved documents are sufficient to answer the query.
    If not, may trigger re-retrieval with adjusted strategy.
    """
    logger.info(f"[RAG Graph] Node 4: Reflect on Quality (iteration {state['current_iteration']})")
    
    query = state['query']
    docs = state['retrieved_docs']
    iteration = state['current_iteration']
    max_iterations = state.get('max_iterations', 3)
    
    # Check if we should continue
    if iteration >= max_iterations:
        logger.info(f"[RAG Graph] Max iterations ({max_iterations}) reached, proceeding to answer")
        return {
            **state,
            'sufficient': True,
            'reflection_reasoning': f'Max iterations ({max_iterations}) reached'
        }
    
    # If no docs retrieved, definitely not sufficient
    if not docs or len(docs) == 0:
        logger.info("[RAG Graph] No documents retrieved, not sufficient")
        return {
            **state,
            'sufficient': False,
            'reflection_reasoning': 'No documents retrieved',
            'planned_chunks': min(state['planned_chunks'] * 2, 20)  # Try more next time
        }
    
    # Simple heuristic for now: if we got fewer docs than planned, might need more
    if len(docs) < state['planned_chunks'] * 0.5:
        logger.info(f"[RAG Graph] Retrieved {len(docs)}/{state['planned_chunks']} docs, may need more")
        return {
            **state,
            'sufficient': False,
            'reflection_reasoning': f'Only retrieved {len(docs)}/{state["planned_chunks"]} planned docs',
            'planned_chunks': min(state['planned_chunks'] + 5, 20)
        }
    
    # For now, assume sufficient (will add LLM-based reflection later)
    logger.info(f"[RAG Graph] Retrieved {len(docs)} docs, sufficient for iteration {iteration}")
    return {
        **state,
        'sufficient': True,
        'reflection_reasoning': f'Retrieved {len(docs)} relevant documents'
    }


def generate_answer_node(state: RAGState) -> RAGState:
    """
    Node 5: Generate final answer using retrieved context.
    
    Uses existing LLM generation with retrieved documents.
    """
    logger.info(f"[RAG Graph] Node 5: Generate Answer (rag={state['used_rag']})")
    
    # This will use actual LLM when injected
    # For now, return state with placeholder
    return {
        **state,
        'answer': '',  # Will be filled by actual LLM
        'debug_info': {
            **state.get('debug_info', {}),
            'answer': {
                'used_rag': state.get('used_rag', False),
                'num_docs': len(state.get('retrieved_docs', []))
            }
        }
    }


# ============================================================================
# Conditional Edge Functions (Routing Logic)
# ============================================================================

def should_retrieve(state: RAGState) -> Literal["retrieve", "answer_direct"]:
    """
    Conditional edge after classification.
    
    Routes to:
    - 'retrieve': If query needs RAG (intent='retrieval')
    - 'answer_direct': If general knowledge query (intent='general')
    """
    intent = state.get('intent', 'general')
    
    if intent == 'retrieval':
        logger.info("[RAG Graph] Route: Classification → Retrieve (intent=retrieval)")
        return "retrieve"
    else:
        logger.info("[RAG Graph] Route: Classification → Answer Direct (intent=general)")
        return "answer_direct"


def should_continue_retrieving(state: RAGState) -> Literal["reflect", "answer"]:
    """
    Conditional edge after retrieval.
    
    Routes to:
    - 'reflect': If we should evaluate quality (haven't hit max iterations)
    - 'answer': If this is final retrieval (max iterations reached)
    """
    iteration = state.get('current_iteration', 0)
    max_iterations = state.get('max_iterations', 3)
    
    if iteration < max_iterations:
        logger.info(f"[RAG Graph] Route: Retrieve → Reflect (iteration {iteration}/{max_iterations})")
        return "reflect"
    else:
        logger.info(f"[RAG Graph] Route: Retrieve → Answer (max iterations reached)")
        return "answer"


def should_reretrieve(state: RAGState) -> Literal["retrieve", "answer"]:
    """
    Conditional edge after reflection.
    
    Routes to:
    - 'retrieve': If context insufficient and haven't hit max iterations
    - 'answer': If context sufficient or max iterations reached
    """
    sufficient = state.get('sufficient', True)
    iteration = state.get('current_iteration', 0)
    max_iterations = state.get('max_iterations', 3)
    
    if not sufficient and iteration < max_iterations:
        logger.info(f"[RAG Graph] Route: Reflect → Re-retrieve (insufficient, iteration {iteration})")
        return "retrieve"
    else:
        reason = "sufficient" if sufficient else f"max iterations ({max_iterations})"
        logger.info(f"[RAG Graph] Route: Reflect → Answer ({reason})")
        return "answer"


# ============================================================================
# Helper Functions
# ============================================================================

def _analyze_query_scope(query_lower: str) -> tuple[str, int, str]:
    """
    Analyze query to determine scope and chunk requirements.
    
    Returns:
        (scope, num_chunks, reasoning)
    """
    
    # EXHAUSTIVE: User wants everything
    exhaustive_keywords = [
        'all', 'every', 'everything', 'complete', 'entire',
        'full', 'comprehensive', 'thorough', 'detailed'
    ]
    if any(kw in query_lower for kw in exhaustive_keywords):
        return (
            'exhaustive',
            15,
            'Query contains exhaustive keywords (all/everything/complete)'
        )
    
    # COMPREHENSIVE: User wants broad coverage
    comprehensive_keywords = [
        'summarize', 'summary', 'overview', 'overall',
        'main points', 'key points', 'highlights', 'important'
    ]
    if any(kw in query_lower for kw in comprehensive_keywords):
        return (
            'comprehensive',
            10,
            'Query asks for summary/overview/main points'
        )
    
    # FOCUSED: User wants explanation
    focused_keywords = [
        'explain', 'describe', 'how', 'why',
        'methodology', 'approach', 'process', 'tell me about'
    ]
    if any(kw in query_lower for kw in focused_keywords):
        return (
            'focused',
            7,
            'Query asks for explanation/description'
        )
    
    # SPECIFIC: Short, direct questions
    query_words = query_lower.split()
    if len(query_words) <= 5 or any(kw in query_lower for kw in ['what is', 'define', 'chapter']):
        return (
            'specific',
            4,
            'Short, specific question'
        )
    
    # DEFAULT: Focused
    return ('focused', 6, 'Default focused query')


# ============================================================================
# Graph Builder
# ============================================================================

def build_rag_graph() -> StateGraph:
    """
    Build the RAG workflow graph.
    
    Workflow:
    1. Classify intent (retrieval vs general)
    2. If general → Answer directly
    3. If retrieval → Plan retrieval strategy
    4. Retrieve documents (with dynamic top_k)
    5. Reflect on quality
    6. If insufficient → Re-retrieve (max 3 iterations)
    7. Generate answer
    
    Returns:
        Compiled StateGraph ready for execution
    """
    logger.info("[RAG Graph] Building workflow graph...")
    
    # Create graph
    workflow = StateGraph(RAGState)
    
    # Add nodes
    workflow.add_node("classify", classify_intent_node)
    workflow.add_node("plan", plan_retrieval_node)
    workflow.add_node("retrieve", retrieve_documents_node)
    workflow.add_node("reflect", reflect_on_quality_node)
    workflow.add_node("answer", generate_answer_node)
    workflow.add_node("answer_direct", generate_answer_node)  # For general queries
    
    # Set entry point
    workflow.set_entry_point("classify")
    
    # Conditional: After classification
    workflow.add_conditional_edges(
        "classify",
        should_retrieve,
        {
            "retrieve": "plan",          # Go to planning if retrieval needed
            "answer_direct": "answer_direct"  # Answer directly if general
        }
    )
    
    # Linear: Plan → Retrieve
    workflow.add_edge("plan", "retrieve")
    
    # Conditional: After retrieval (first iteration)
    workflow.add_conditional_edges(
        "retrieve",
        should_continue_retrieving,
        {
            "reflect": "reflect",
            "answer": "answer"
        }
    )
    
    # Conditional: After reflection (loop or finish)
    workflow.add_conditional_edges(
        "reflect",
        should_reretrieve,
        {
            "retrieve": "retrieve",  # Loop back for more docs
            "answer": "answer"       # Sufficient, generate answer
        }
    )
    
    # Terminal: Both answer nodes → END
    workflow.add_edge("answer", END)
    workflow.add_edge("answer_direct", END)
    
    logger.info("[RAG Graph] Workflow graph built successfully")
    
    return workflow


def create_rag_graph() -> Any:
    """
    Create and compile the RAG graph.
    
    Returns:
        Compiled graph ready for invocation
    """
    workflow = build_rag_graph()
    app = workflow.compile()
    
    logger.info("[RAG Graph] Graph compiled and ready")
    
    return app


# ============================================================================
# Convenience Functions
# ============================================================================

def run_rag_graph(
    chat_id: str,
    query: str,
    max_iterations: int = 3
) -> RAGState:
    """
    Run the RAG graph with given query.
    
    Args:
        chat_id: Chat identifier
        query: User query
        max_iterations: Maximum reflection/retrieval iterations
    
    Returns:
        Final state with answer and metadata
    """
    logger.info(f"[RAG Graph] Starting workflow for query: '{query[:50]}...'")
    
    # Create graph
    app = create_rag_graph()
    
    # Initial state
    initial_state: RAGState = {
        'chat_id': chat_id,
        'query': query,
        'intent': 'unknown',
        'intent_confidence': 0.0,
        'scope': 'focused',
        'planned_chunks': 5,
        'retrieved_docs': [],
        'current_iteration': 0,
        'max_iterations': max_iterations,
        'sufficient': False,
        'reflection_reasoning': '',
        'answer': '',
        'used_rag': False,
        'debug_info': {}
    }
    
    # Execute graph
    try:
        final_state = app.invoke(initial_state)
        logger.info("[RAG Graph] Workflow completed successfully")
        return final_state
    except Exception as e:
        logger.error(f"[RAG Graph] Workflow failed: {e}")
        raise


if __name__ == "__main__":
    # Test the graph structure
    logging.basicConfig(level=logging.INFO)
    
    print("Building RAG graph...")
    graph = create_rag_graph()
    
    print("\nGraph created successfully!")
    print("\nTesting with sample query...")
    
    result = run_rag_graph(
        chat_id="test-chat",
        query="Summarize everything about machine learning",
        max_iterations=2
    )
    
    print(f"\nFinal state:")
    print(f"  Intent: {result['intent']}")
    print(f"  Scope: {result['scope']}")
    print(f"  Planned chunks: {result['planned_chunks']}")
    print(f"  Iterations: {result['current_iteration']}")
    print(f"  Sufficient: {result['sufficient']}")
    print(f"  Debug: {result['debug_info']}")

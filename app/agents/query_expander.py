"""
Query expansion to improve RAG retrieval and classification.

Expands user queries with synonyms, related terms, and reformulations
to improve matching against document content.
"""

import logging
from typing import List, Dict, Any, Optional, Callable

logger = logging.getLogger(__name__)


class QueryExpander:
    """
    Expands queries to capture semantic variations and improve retrieval.
    
    Example:
    - "How do I fix my car?" → ["car repair", "automobile maintenance", "vehicle fixing"]
    - "What was discussed?" → ["what topics", "what subjects", "meeting content"]
    """
    
    def __init__(self, llm_caller: Optional[Callable] = None):
        """
        Initialize query expander.
        
        Args:
            llm_caller: Optional LLM function for intelligent expansion
        """
        self.llm_caller = llm_caller
    
    def expand_query(self, query: str, doc_preview: Optional[str] = None) -> Dict[str, Any]:
        """
        Expand query with synonyms and reformulations.
        
        Args:
            query: Original user query
            doc_preview: Optional preview of document content for context
            
        Returns:
            {
                'original': original query,
                'expanded_terms': list of additional search terms,
                'reformulations': list of alternative phrasings,
                'combined_query': enhanced query for better retrieval
            }
        """
        if not self.llm_caller:
            return {
                'original': query,
                'expanded_terms': [],
                'reformulations': [query],
                'combined_query': query
            }
        
        doc_context = ""
        if doc_preview:
            doc_context = f"\n\nDocument context (to help generate relevant variations):\n{doc_preview[:300]}"
        
        prompt = f"""Generate query variations to improve document search and matching.

Original query: "{query}"
{doc_context}

Generate:
1. Key terms and synonyms (single words or short phrases)
2. Alternative phrasings of the same question
3. Related concepts that might appear in relevant documents

Examples:

Query: "How do I fix my car?"
Terms: ["car repair", "automobile", "vehicle maintenance", "fixing", "troubleshooting"]
Reformulations: ["car repair instructions", "automobile maintenance", "vehicle fixing guide"]

Query: "What was discussed in the meeting?"
Terms: ["meeting", "discussed", "topics", "agenda", "decisions"]
Reformulations: ["meeting topics", "what topics were covered", "meeting content", "discussion points"]

Query: "How do you split a function into parts?"
Terms: ["piecewise function", "split function", "function segments", "defined by parts", "sectioned function"]
Reformulations: ["piecewise defined function", "function defined in segments", "split domain function"]

Now for the actual query:
Query: "{query}"

Respond in this EXACT format:
TERMS: [list of 5-8 key terms/synonyms, comma separated]
REFORMULATIONS: [list of 2-4 alternative phrasings, pipe | separated]

TERMS:"""

        try:
            import os
            model = os.getenv("AGENT_MODEL", "llama3.2:1b")
            
            response = self.llm_caller(
                model,
                prompt,
                temperature=0.3,  # Some creativity for variations
                max_tokens=200
            )
            
            # Parse response
            lines = response.strip().split('\n')
            expanded_terms = []
            reformulations = [query]  # Always include original
            
            for line in lines:
                if line.startswith('TERMS:'):
                    terms_str = line.replace('TERMS:', '').strip()
                    # Parse list format or comma-separated
                    terms_str = terms_str.strip('[]')
                    expanded_terms = [t.strip().strip('"\'') for t in terms_str.split(',')]
                    expanded_terms = [t for t in expanded_terms if t]  # Remove empty
                    
                elif line.startswith('REFORMULATIONS:'):
                    reform_str = line.replace('REFORMULATIONS:', '').strip()
                    # Parse list format or pipe-separated
                    reform_str = reform_str.strip('[]')
                    reforms = [r.strip().strip('"\'') for r in reform_str.split('|')]
                    reformulations.extend([r for r in reforms if r])  # Add non-empty
            
            # Create combined query for better retrieval
            combined_query = f"{query} {' '.join(expanded_terms[:5])}"
            
            logger.info(f"[QueryExpander] Expanded query with {len(expanded_terms)} terms "
                       f"and {len(reformulations)} reformulations")
            logger.debug(f"[QueryExpander] Terms: {expanded_terms[:5]}")
            logger.debug(f"[QueryExpander] Reformulations: {reformulations[:3]}")
            
            return {
                'original': query,
                'expanded_terms': expanded_terms,
                'reformulations': reformulations,
                'combined_query': combined_query
            }
            
        except Exception as e:
            logger.error(f"[QueryExpander] Query expansion failed: {e}")
            import traceback
            logger.debug(f"[QueryExpander] Error: {traceback.format_exc()}")
            
            return {
                'original': query,
                'expanded_terms': [],
                'reformulations': [query],
                'combined_query': query
            }
    
    def should_expand(self, query: str, classification_confidence: float) -> bool:
        """
        Determine if query should be expanded.
        
        Expand if:
        - Classification confidence is low (< 0.7)
        - Query is short (< 5 words)
        - Query is a question about content
        
        Args:
            query: User query
            classification_confidence: Confidence from intent classifier
            
        Returns:
            True if query should be expanded
        """
        # Always expand for ambiguous cases
        if classification_confidence < 0.7:
            return True
        
        # Expand short queries
        word_count = len(query.split())
        if word_count < 5:
            return True
        
        # Expand questions about content
        content_keywords = ['what', 'how', 'tell me', 'explain', 'summarize', 
                           'describe', 'find', 'search', 'about']
        query_lower = query.lower()
        if any(kw in query_lower for kw in content_keywords):
            return True
        
        return False

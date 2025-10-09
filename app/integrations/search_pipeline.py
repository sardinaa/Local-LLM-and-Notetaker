"""
Web Search Pipeline Module (DEPRECATED - Use search_engines/ and content_loader.py)

⚠️ DEPRECATION NOTICE:
This module is deprecated. Please use the new modular architecture:
- app.integrations.search_engines.duckduckgo - DuckDuckGo search (returns URLs)
- app.integrations.content_loader - Content loading and extraction
- app.integrations.search_engines.multi_engine - Multi-engine orchestration

This file now acts as a compatibility wrapper for backward compatibility.
It will be removed in a future version.

New Usage:
    # Phase 1: Search
    from app.integrations.search_engines.duckduckgo import search_duckduckgo
    results = await search_duckduckgo("query", count=20)
    
    # Phase 2: Load content
    from app.integrations.content_loader import load_content_from_search_results
    documents = await load_content_from_search_results(results)

Old Usage (still works via this wrapper):
    from app.integrations.search_pipeline import search_and_scrape
    docs = await search_and_scrape("query")
"""

import asyncio
import logging
import re
from typing import List, Dict, Optional

# New modular imports
from app.integrations.search_engines.duckduckgo import search_duckduckgo, DuckDuckGoSearchError
from app.integrations.content_loader import (
    load_content_from_search_results,
    ContentLoaderError
)
from app.config.search_config import SearchConfig

logger = logging.getLogger(__name__)

# Re-export exceptions for backward compatibility
SearchPipelineError = ContentLoaderError


async def search_and_scrape(
    query: str, 
    max_results: int = 20, 
    min_results: Optional[int] = None,
    region: str = None,
    timelimit: Optional[str] = None,
    use_news_api: bool = False,
    min_words: Optional[int] = None,
    min_quality_score: Optional[float] = None,
    adaptive: bool = True
) -> List[Dict[str, str]]:
    """
    Search DuckDuckGo and scrape content from results with quality filtering.
    
    ⚠️ DEPRECATED: This function is a compatibility wrapper.
    Use search_duckduckgo() + load_content_from_search_results() instead.
    
    Args:
        query: Search query string
        max_results: Maximum number of results to process
        min_results: Minimum number of results to return (adaptive)
        region: DuckDuckGo region code (e.g., 'wt-wt' worldwide, 'es-es' Spain)
        timelimit: Time limit for results ('d' day, 'w' week, 'm' month, 'y' year)
        use_news_api: Use DuckDuckGo news API instead of regular search
        min_words: Minimum word count for content
        min_quality_score: Minimum quality score
        adaptive: Use adaptive result count based on query difficulty (IGNORED)
        
    Returns:
        List of documents with 'url', 'title', 'text', and 'quality_score' keys
        
    Raises:
        SearchPipelineError: If search fails completely
    """
    logger.warning(
        "search_and_scrape() is deprecated. Use search_duckduckgo() + "
        "load_content_from_search_results() instead."
    )
    
    if not query or not query.strip():
        raise SearchPipelineError("Query cannot be empty")
    
    # Use config defaults if not specified
    min_words = min_words or SearchConfig.MIN_WORDS
    min_quality_score = min_quality_score or SearchConfig.MIN_QUALITY_SCORE
    min_results = min_results or SearchConfig.MIN_RESULTS
    
    try:
        # Phase 1: Search (get URLs + snippets)
        logger.info(f"Searching for: {query}")
        search_results = await search_duckduckgo(
            query=query,
            count=max_results * 2,  # Get extra results for filtering
            region=region,
            timelimit=timelimit,
            use_news_api=use_news_api
        )
        
        if not search_results:
            logger.warning("No search results found")
            return []
        
        logger.info(f"Found {len(search_results)} search results")
        
        # Phase 2: Load content from URLs
        documents = await load_content_from_search_results(
            search_results=search_results,
            min_words=min_words,
            min_quality_score=min_quality_score,
            max_concurrent=SearchConfig.CONCURRENT_REQUESTS
        )
        
        # Ensure we have at least min_results if possible
        if len(documents) < min_results and len(documents) < len(search_results):
            logger.info(f"Only {len(documents)} documents passed filters, relaxing criteria...")
            
            # Try again with relaxed criteria
            documents = await load_content_from_search_results(
                search_results=search_results,
                min_words=max(60, int(min_words * 0.6)),
                min_quality_score=max(0.15, min_quality_score - 0.15),
                max_concurrent=SearchConfig.CONCURRENT_REQUESTS
            )
        
        # Sort by quality and limit to max_results
        documents.sort(key=lambda x: (x['quality_score'], len(x['text'])), reverse=True)
        final_docs = documents[:max_results]
        
        logger.info(f"Returning {len(final_docs)} documents after filtering")
        return final_docs
        
    except DuckDuckGoSearchError as e:
        logger.error(f"Search failed: {e}")
        raise SearchPipelineError(f"Search failed: {e}")
    except Exception as e:
        logger.error(f"Search and scrape failed: {e}")
        raise SearchPipelineError(f"Search failed: {e}")


# Async context manager for easier usage (DEPRECATED)
class SearchPipeline:
    """
    Context manager for search pipeline operations.
    
    ⚠️ DEPRECATED: Use MultiEngineSearch from search_engines.multi_engine instead.
    """
    
    def __init__(
        self, 
        max_results: int = 5, 
        min_results: Optional[int] = None,
        region: str = None,
        timelimit: Optional[str] = None,
        use_news_api: bool = False,
        min_words: Optional[int] = None,
        min_quality_score: Optional[float] = None,
        adaptive: bool = True
    ):
        logger.warning(
            "SearchPipeline class is deprecated. Use MultiEngineSearch from "
            "app.integrations.search_engines.multi_engine instead."
        )
        
        self.max_results = max_results
        self.min_results = min_results or SearchConfig.MIN_RESULTS
        self.region = region
        self.timelimit = timelimit
        self.use_news_api = use_news_api
        self.min_words = min_words
        self.min_quality_score = min_quality_score
        self.adaptive = adaptive
    
    async def search(self, query: str) -> List[Dict[str, str]]:
        """Search and return documents."""
        return await search_and_scrape(
            query, 
            self.max_results, 
            self.min_results,
            self.region,
            self.timelimit,
            self.use_news_api,
            self.min_words,
            self.min_quality_score,
            self.adaptive
        )
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

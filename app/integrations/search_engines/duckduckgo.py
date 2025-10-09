"""
DuckDuckGo Search Engine Integration

Free search engine, no API key required.
Returns search results as URLs + snippets (no content loading).

Features:
- Text search
- News search
- Region/language control
- Time filtering
- Safe search

Usage:
    from app.integrations.search_engines.duckduckgo import search_duckduckgo
    
    # Basic search
    results = await search_duckduckgo("machine learning")
    
    # News search with filters
    results = await search_duckduckgo(
        "technology news",
        count=20,
        region="en-us",
        timelimit="d",
        use_news_api=True
    )
    
    # Returns: [{"url": str, "title": str, "snippet": str}, ...]
"""

import logging
from typing import List, Dict, Optional

try:
    from duckduckgo_search import DDGS
except ImportError:
    # Fallback to old package name
    from ddgs import DDGS

from app.config.search_config import SearchConfig

logger = logging.getLogger(__name__)


class DuckDuckGoSearchError(Exception):
    """Custom exception for DuckDuckGo search errors."""
    pass


async def search_duckduckgo(
    query: str,
    count: int = 20,
    region: str = None,
    timelimit: Optional[str] = None,
    safesearch: str = None,
    use_news_api: bool = False
) -> List[Dict[str, str]]:
    """
    Search DuckDuckGo and return URLs + snippets (no content loading).
    
    Args:
        query: Search query string
        count: Number of results to return
        region: DuckDuckGo region code (e.g., 'wt-wt' worldwide, 'es-es' Spain, 'en-us' USA)
        timelimit: Time limit ('d' day, 'w' week, 'm' month, 'y' year, None for all time)
        safesearch: Safe search setting ('off', 'moderate', 'strict')
        use_news_api: Use DuckDuckGo news API instead of regular search
        
    Returns:
        List of search results with 'url', 'title', 'snippet' keys
        
    Raises:
        DuckDuckGoSearchError: If search fails
    """
    if not query or not query.strip():
        raise DuckDuckGoSearchError("Query cannot be empty")
    
    # Use config defaults if not specified
    region = region or SearchConfig.DDGS_REGION
    safesearch = safesearch or SearchConfig.DDGS_SAFESEARCH
    timelimit = timelimit or SearchConfig.DDGS_TIMELIMIT
    
    logger.info(f"DuckDuckGo search: query='{query}', count={count}, region={region}, news={use_news_api}")
    
    try:
        results = []
        
        with DDGS() as ddgs:
            if use_news_api:
                # News search
                search_results = list(ddgs.news(
                    query,
                    region=region,
                    timelimit=timelimit or 'd',  # Default to last day for news
                    safesearch=safesearch,
                    max_results=count
                ))
            else:
                # Regular text search
                search_results = list(ddgs.text(
                    query,
                    region=region,
                    timelimit=timelimit,
                    safesearch=safesearch,
                    max_results=count
                ))
        
        # Convert to standardized format
        # Note: Using 'text' field to match existing search engine format
        # (Other engines in this project return 'text' with snippet/description)
        for item in search_results:
            result = {
                'url': item.get('href') or item.get('url', ''),
                'title': item.get('title', 'Untitled'),
                'text': item.get('body') or item.get('description', ''),
                'quality_score': 0.6  # DuckDuckGo has good quality
            }
            
            # Validate URL
            if result['url'] and result['url'].startswith('http'):
                results.append(result)
        
        logger.info(f"DuckDuckGo returned {len(results)} results")
        return results
        
    except Exception as e:
        logger.error(f"DuckDuckGo search failed: {e}")
        raise DuckDuckGoSearchError(f"Search failed: {e}")


async def search_duckduckgo_with_fallback(
    query: str,
    count: int = 20,
    region: str = None,
    timelimit: Optional[str] = None,
    use_news_api: bool = False,
    try_news_fallback: bool = True
) -> List[Dict[str, str]]:
    """
    Search DuckDuckGo with automatic fallback from regular to news search.
    
    Args:
        query: Search query
        count: Number of results
        region: Region code
        timelimit: Time limit
        use_news_api: Start with news API
        try_news_fallback: Try news API if regular search fails
        
    Returns:
        List of search results
    """
    try:
        # Try primary method
        return await search_duckduckgo(
            query, count, region, timelimit, use_news_api=use_news_api
        )
    except DuckDuckGoSearchError as e:
        logger.warning(f"Primary DuckDuckGo search failed: {e}")
        
        if try_news_fallback and not use_news_api:
            # Try news API as fallback
            logger.info("Trying DuckDuckGo news API as fallback...")
            try:
                return await search_duckduckgo(
                    query, count, region, 'd', use_news_api=True
                )
            except Exception as fallback_error:
                logger.error(f"DuckDuckGo fallback failed: {fallback_error}")
                raise DuckDuckGoSearchError(f"All DuckDuckGo methods failed")
        
        raise

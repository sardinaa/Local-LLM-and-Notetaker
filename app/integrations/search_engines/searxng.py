"""
SearXNG integration - self-hosted privacy-focused metasearch engine.
Free and open source: https://github.com/searxng/searxng

Setup via Docker:
docker run -d -p 8080:8080 searxng/searxng
"""

import logging
from typing import List, Dict, Optional
import httpx

logger = logging.getLogger(__name__)


async def search_searxng(
    query: str,
    instance_url: str = "http://localhost:8080",
    count: int = 10,
    timeout: int = 30,
    language: str = "en",
    safesearch: int = 1  # 0=off, 1=moderate, 2=strict
) -> List[Dict[str, str]]:
    """
    Search using SearXNG instance.
    
    Args:
        query: Search query
        instance_url: SearXNG instance URL (self-hosted or public)
        count: Number of results
        timeout: Request timeout
        language: Search language
        safesearch: Safe search level
        
    Returns:
        List of search results
    """
    try:
        search_url = f"{instance_url.rstrip('/')}/search"
        
        params = {
            "q": query,
            "format": "json",
            "pageno": 1,
            "safesearch": safesearch,
            "language": language,
        }
        
        headers = {
            "User-Agent": "LLM-Notetaker Bot",
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(search_url, params=params, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            results = data.get("results", [])
            
            return [
                {
                    'url': result['url'],
                    'title': result.get('title', 'Untitled'),
                    'text': result.get('content', ''),
                    'quality_score': 0.6  # Aggregated results
                }
                for result in results[:count]
            ]
    
    except Exception as e:
        logger.error(f"SearXNG search failed: {e}")
        return []

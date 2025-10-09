"""
Brave Search integration (free tier: 2,000 queries/month).
No credit card required for free tier.
https://brave.com/search/api/
"""

import logging
from typing import List, Dict, Optional
import httpx

logger = logging.getLogger(__name__)


async def search_brave(
    query: str,
    api_key: Optional[str] = None,
    count: int = 10,
    timeout: int = 30
) -> List[Dict[str, str]]:
    """
    Search using Brave Search API (free tier available).
    
    Args:
        query: Search query
        api_key: Brave API key (optional, use free tier)
        count: Number of results
        timeout: Request timeout
        
    Returns:
        List of search results
    """
    if not api_key:
        logger.warning("No Brave API key provided, skipping Brave search")
        return []
    
    url = "https://api.search.brave.com/res/v1/web/search"
    
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": api_key,
    }
    
    params = {
        "q": query,
        "count": count,
    }
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            
            data = response.json()
            results = data.get("web", {}).get("results", [])
            
            return [
                {
                    'url': result['url'],
                    'title': result.get('title', 'Untitled'),
                    'text': result.get('description', ''),
                    'quality_score': 0.7  # Brave has good quality
                }
                for result in results[:count]
            ]
    
    except Exception as e:
        logger.error(f"Brave search failed: {e}")
        return []

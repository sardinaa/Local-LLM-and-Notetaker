"""
Mojeek Search integration - Independent search index.
FREE tier: 1,000 queries/month (no credit card required)
https://www.mojeek.com/services/api/
"""

import logging
from typing import List, Dict, Optional
import httpx

logger = logging.getLogger(__name__)


async def search_mojeek(
    query: str,
    api_key: Optional[str] = None,
    count: int = 10,
    timeout: int = 30
) -> List[Dict[str, str]]:
    """
    Search using Mojeek API (free tier available).
    
    Mojeek is a UK-based search engine with its own independent index.
    Free tier: 1,000 queries/month, no credit card required.
    Sign up: https://www.mojeek.com/services/api/signup/
    
    Args:
        query: Search query
        api_key: Mojeek API key (free tier)
        count: Number of results
        timeout: Request timeout
        
    Returns:
        List of search results
    """
    if not api_key:
        logger.warning("No Mojeek API key provided, skipping Mojeek search")
        return []
    
    try:
        url = "https://api.mojeek.com/search"
        
        params = {
            "q": query,
            "api_key": api_key,
            "fmt": "json",
            "t": count,  # Number of results
            "lb": "en",  # Language
        }
        
        headers = {
            "Accept": "application/json",
            "User-Agent": "LLM-Notetaker Bot",
        }
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            
            # Mojeek returns results in response.results
            results_data = data.get("response", {}).get("results", [])
            
            results = []
            for item in results_data[:count]:
                results.append({
                    'url': item.get('url', ''),
                    'title': item.get('title', 'Untitled'),
                    'text': item.get('desc', ''),
                    'quality_score': 0.65  # Independent index, good quality
                })
            
            logger.info(f"Mojeek returned {len(results)} results")
            return results
    
    except httpx.HTTPStatusError as e:
        logger.error(f"Mojeek HTTP error {e.response.status_code}: {e}")
        return []
    except Exception as e:
        logger.error(f"Mojeek search failed: {e}")
        return []

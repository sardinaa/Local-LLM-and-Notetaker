"""
YaCy Search integration - Decentralized P2P search engine.
FREE and unlimited (self-hosted or public peer)
https://yacy.net/
"""

import logging
from typing import List, Dict, Optional
import httpx

logger = logging.getLogger(__name__)


async def search_yacy(
    query: str,
    instance_url: str = "http://localhost:8090",
    count: int = 10,
    timeout: int = 30
) -> List[Dict[str, str]]:
    """
    Search using YaCy P2P search network.
    
    YaCy is a decentralized peer-to-peer search engine.
    Self-host: docker run -d -p 8090:8090 yacy/yacy_search_server
    Or use public peers: http://yacy.net/
    
    Args:
        query: Search query
        instance_url: YaCy instance URL
        count: Number of results
        timeout: Request timeout
        
    Returns:
        List of search results
    """
    try:
        search_url = f"{instance_url.rstrip('/')}/yacysearch.json"
        
        params = {
            "query": query,
            "contentdom": "text",
            "resource": "global",  # Search global network
            "maximumRecords": count,
            "nav": "none",
        }
        
        headers = {
            "User-Agent": "LLM-Notetaker Bot",
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(search_url, params=params, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            
            # YaCy returns results in channels[0].items
            results_data = []
            channels = data.get("channels", [])
            if channels and len(channels) > 0:
                results_data = channels[0].get("items", [])
            
            results = []
            for item in results_data[:count]:
                results.append({
                    'url': item.get('link', ''),
                    'title': item.get('title', 'Untitled'),
                    'text': item.get('description', ''),
                    'quality_score': 0.55  # P2P results, variable quality
                })
            
            logger.info(f"YaCy returned {len(results)} results")
            return results
    
    except Exception as e:
        logger.error(f"YaCy search failed: {e}")
        return []

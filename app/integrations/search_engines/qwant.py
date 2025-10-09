"""
Qwant Search integration - European privacy-focused search engine.
FREE and unlimited - no API key required!
https://www.qwant.com/

Note: Qwant's API may block requests. Using lite version as fallback.
"""

import logging
from typing import List, Dict, Optional
import httpx
from bs4 import BeautifulSoup
import re

logger = logging.getLogger(__name__)


async def search_qwant(
    query: str,
    count: int = 10,
    timeout: int = 30,
    locale: str = "en_US"
) -> List[Dict[str, str]]:
    """
    Search using Qwant (free, no API key needed!).
    
    Qwant is a European search engine that respects privacy.
    No API key required, no tracking, GDPR compliant.
    
    Falls back to web scraping if API is blocked.
    
    Args:
        query: Search query
        count: Number of results
        timeout: Request timeout
        locale: Search locale (en_US, en_GB, es_ES, fr_FR, etc.)
        
    Returns:
        List of search results
    """
    # Try API first
    try:
        url = "https://api.qwant.com/v3/search/web"
        
        params = {
            "q": query,
            "count": count,
            "locale": locale,
            "device": "desktop",
            "safesearch": 1,
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.qwant.com/",
        }
        
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            
            items = []
            if "data" in data and "result" in data["data"]:
                result = data["data"]["result"]
                if "items" in result:
                    for item_group in result["items"]:
                        if item_group.get("type") == "web":
                            items.extend(item_group.get("items", []))
            
            results = []
            for item in items[:count]:
                results.append({
                    'url': item.get('url', ''),
                    'title': item.get('title', 'Untitled'),
                    'text': item.get('desc', ''),
                    'quality_score': 0.65
                })
            
            if results:
                logger.info(f"Qwant API returned {len(results)} results")
                return results
    
    except Exception as e:
        logger.warning(f"Qwant API failed ({e}), trying lite version...")
    
    # Fallback to lite version (web scraping)
    try:
        url = "https://lite.qwant.com/"
        
        params = {
            "q": query,
            "t": "web",
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            results = []
            
            # Find result items in lite version
            result_items = soup.find_all('div', class_=re.compile(r'result'))
            if not result_items:
                result_items = soup.find_all('article')
            
            for item in result_items[:count]:
                # Extract title and link
                title_elem = item.find('h3') or item.find('a')
                if not title_elem:
                    continue
                
                link = title_elem.find('a') if title_elem.name != 'a' else title_elem
                if not link or not link.get('href'):
                    continue
                
                title = link.get_text(strip=True) or 'Untitled'
                url = link['href']
                
                # Extract description
                desc_elem = item.find('p') or item.find('div', class_=re.compile(r'desc|snippet'))
                description = desc_elem.get_text(strip=True) if desc_elem else ''
                
                results.append({
                    'url': url,
                    'title': title,
                    'text': description,
                    'quality_score': 0.6
                })
            
            if results:
                logger.info(f"Qwant lite returned {len(results)} results")
                return results
            else:
                logger.warning("Qwant lite: no results parsed from HTML")
                return []
    
    except Exception as e:
        logger.error(f"Qwant search completely failed: {e}")
        return []

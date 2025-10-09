"""
Startpage Search integration - Privacy-focused search using Google results.
FREE and unlimited - no API key required!
https://www.startpage.com/

Note: Uses web scraping as Startpage doesn't have a public API.
"""

import logging
from typing import List, Dict
import httpx
from bs4 import BeautifulSoup
import re

logger = logging.getLogger(__name__)


async def search_startpage(
    query: str,
    count: int = 10,
    timeout: int = 30,
    language: str = "english"
) -> List[Dict[str, str]]:
    """
    Search using Startpage (free, no API key needed!).
    
    Startpage is a privacy-focused search engine that provides
    Google results without tracking.
    
    Args:
        query: Search query
        count: Number of results
        timeout: Request timeout
        language: Search language (english, spanish, etc.)
        
    Returns:
        List of search results
    """
    try:
        url = "https://www.startpage.com/sp/search"
        
        params = {
            "query": query,
            "cat": "web",
            "language": language,
            "t": "device",
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.startpage.com/",
            "DNT": "1",
        }
        
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            results = []
            
            # Find result items
            result_items = soup.find_all('div', class_=re.compile(r'w-gl__result'))
            if not result_items:
                result_items = soup.find_all('article')
            
            for item in result_items[:count]:
                # Extract title and link
                title_elem = item.find('a', class_=re.compile(r'w-gl__result-title'))
                if not title_elem:
                    title_elem = item.find('h3')
                    if title_elem:
                        title_elem = title_elem.find('a')
                
                if not title_elem or not title_elem.get('href'):
                    continue
                
                title = title_elem.get_text(strip=True) or 'Untitled'
                url = title_elem['href']
                
                # Extract description
                desc_elem = item.find('p', class_=re.compile(r'w-gl__description'))
                if not desc_elem:
                    desc_elem = item.find('p')
                description = desc_elem.get_text(strip=True) if desc_elem else ''
                
                results.append({
                    'url': url,
                    'title': title,
                    'text': description,
                    'quality_score': 0.7  # High quality (Google results)
                })
            
            if results:
                logger.info(f"Startpage returned {len(results)} results")
                return results
            else:
                logger.warning("Startpage: no results parsed from HTML")
                return []
    
    except Exception as e:
        logger.error(f"Startpage search failed: {e}")
        return []

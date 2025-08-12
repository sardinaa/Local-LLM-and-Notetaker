"""
Web Search Pipeline Module

A helper module that searches the web using DuckDuckGo and scrapes content from search results.
This module provides async functions to search, fetch, and extract readable text from web pages.

Usage:
    from search_pipeline import search_and_scrape
    
    docs = await search_and_scrape("latest research on photogrammetry 2025")
    # Returns: [{"url": str, "title": str, "text": str}, ...]
"""

import asyncio
import logging
import re
from typing import List, Dict, Optional
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
import trafilatura
from duckduckgo_search import DDGS
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# Configure logging
logger = logging.getLogger(__name__)


class SearchPipelineError(Exception):
    """Custom exception for search pipeline errors."""
    pass


def _truncate_text(text: str, max_chars: int = 8000) -> str:
    """
    Truncate text to max_chars without cutting mid-sentence.
    
    Args:
        text: The text to truncate
        max_chars: Maximum character limit
        
    Returns:
        Truncated text ending at a sentence boundary
    """
    if len(text) <= max_chars:
        return text
    
    # Find the last sentence boundary before max_chars
    truncated = text[:max_chars]
    sentence_endings = ['.', '!', '?', '\n\n']
    
    last_sentence_end = -1
    for ending in sentence_endings:
        pos = truncated.rfind(ending)
        if pos > last_sentence_end:
            last_sentence_end = pos
    
    if last_sentence_end > max_chars * 0.7:  # Don't cut too much
        return truncated[:last_sentence_end + 1].strip()
    
    return truncated.strip() + "..."


def _is_url_allowed(url: str) -> bool:
    """
    Check if URL is allowed by robots.txt (basic check).
    
    Args:
        url: The URL to check
        
    Returns:
        True if URL is likely allowed, False otherwise
    """
    try:
        parsed_url = urlparse(url)
        robots_url = f"{parsed_url.scheme}://{parsed_url.netloc}/robots.txt"
        
        rp = RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        
        return rp.can_fetch("*", url)
    except Exception:
        # If we can't check robots.txt, assume it's allowed
        return True


def extract_text(html: str, url: str) -> Optional[str]:
    """
    Extract readable text from HTML using trafilatura.
    
    Args:
        html: Raw HTML content
        url: Source URL for context
        
    Returns:
        Extracted text or None if extraction fails
    """
    try:
        if not html or not html.strip():
            return None
            
        # Use trafilatura with precision settings
        extracted = trafilatura.extract(
            html,
            favor_precision=True,
            include_comments=False,
            include_tables=True,
            include_links=False,
            url=url
        )
        
        if not extracted or len(extracted.strip()) < 50:
            # Fallback: try with different settings
            extracted = trafilatura.extract(
                html,
                favor_precision=False,
                include_comments=False,
                include_tables=True,
                url=url
            )
        
        if extracted:
            # Clean up whitespace and normalize
            cleaned = re.sub(r'\s+', ' ', extracted.strip())
            return cleaned if len(cleaned) > 50 else None
            
        return None
        
    except Exception as e:
        logger.warning(f"Text extraction failed for {url}: {e}")
        return None


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError))
)
async def fetch_html(url: str) -> str:
    """
    Fetch HTML content from a URL with retries and timeout.
    
    Args:
        url: The URL to fetch
        
    Returns:
        HTML content as string
        
    Raises:
        SearchPipelineError: If fetching fails after retries
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
    }
    
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(30.0),
            headers=headers
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            # Check content type
            content_type = response.headers.get('content-type', '').lower()
            if 'text/html' not in content_type:
                raise SearchPipelineError(f"Non-HTML content type: {content_type}")
            
            return response.text
            
    except httpx.HTTPStatusError as e:
        logger.warning(f"HTTP error {e.response.status_code} for {url}")
        raise SearchPipelineError(f"HTTP {e.response.status_code}: {url}")
    except httpx.TimeoutException:
        logger.warning(f"Timeout fetching {url}")
        raise SearchPipelineError(f"Timeout: {url}")
    except Exception as e:
        logger.warning(f"Failed to fetch {url}: {e}")
        raise SearchPipelineError(f"Fetch error: {url} - {e}")


def _score_source_quality(url: str, title: str, content: str) -> float:
    """
    Score the quality of a web source based on URL, title, and content.
    
    Args:
        url: Source URL
        title: Page title
        content: Extracted content
        
    Returns:
        Quality score from 0.0 to 1.0 (higher is better)
    """
    score = 0.5  # Base score
    
    # High-quality domains get bonus points
    high_quality_domains = [
        'wikipedia.org', 'github.com', 'stackoverflow.com', 'arxiv.org',
        'nature.com', 'science.org', 'ieee.org', 'acm.org', 'pubmed.ncbi.nlm.nih.gov',
        'reuters.com', 'bbc.com', 'nytimes.com', 'theguardian.com', 'apnews.com',
        'cnn.com', 'npr.org', 'pbs.org', 'gov', 'edu', 'mit.edu', 'stanford.edu'
    ]
    
    domain = urlparse(url).netloc.lower()
    for quality_domain in high_quality_domains:
        if quality_domain in domain:
            score += 0.3
            break
    
    # Penalize certain domains that often have low-quality content
    low_quality_indicators = [
        'pinterest.com', 'quora.com', 'yahoo.com/answers', 'ehow.com',
        'wikihow.com', 'answers.com', 'ask.com', 'chacha.com'
    ]
    
    for low_indicator in low_quality_indicators:
        if low_indicator in domain:
            score -= 0.2
            break
    
    # Score based on content length and quality indicators
    word_count = len(content.split())
    if word_count > 500:
        score += 0.1
    if word_count > 1000:
        score += 0.1
    
    # Check for quality indicators in content
    quality_indicators = [
        'research', 'study', 'analysis', 'data', 'methodology',
        'published', 'peer-reviewed', 'journal', 'university'
    ]
    
    content_lower = content.lower()
    quality_matches = sum(1 for indicator in quality_indicators if indicator in content_lower)
    score += min(quality_matches * 0.05, 0.2)
    
    # Penalize if title or content seems clickbait-y
    clickbait_indicators = [
        'you won\'t believe', 'shocking', 'this one trick', 'doctors hate',
        'amazing secret', 'weird trick', 'click here', 'must see'
    ]
    
    title_lower = title.lower()
    content_snippet = content[:500].lower()
    for clickbait in clickbait_indicators:
        if clickbait in title_lower or clickbait in content_snippet:
            score -= 0.15
            break
    
    return max(0.0, min(1.0, score))


async def search_and_scrape(
    query: str, 
    max_results: int = 5, 
    min_words: int = 120,
    min_quality_score: float = 0.3
) -> List[Dict[str, str]]:
    """
    Search DuckDuckGo and scrape content from results with quality filtering.
    
    Args:
        query: Search query string
        max_results: Maximum number of results to process
        min_words: Minimum word count for content to be included
        min_quality_score: Minimum quality score for sources (0.0 to 1.0)
        
    Returns:
        List of documents with 'url', 'title', 'text', and 'quality_score' keys
        
    Raises:
        SearchPipelineError: If search fails completely
    """
    if not query or not query.strip():
        raise SearchPipelineError("Query cannot be empty")
    
    logger.info(f"Searching for: {query}")
    
    try:
        # Search with DuckDuckGo
        with DDGS() as ddgs:
            search_results = list(ddgs.text(
                query,
                max_results=max_results * 2,  # Get extra results in case some fail
                region='wt-wt',  # Worldwide
                safesearch='moderate'
            ))
        
        if not search_results:
            logger.warning("No search results found")
            return []
        
        logger.info(f"Found {len(search_results)} search results")
        
        # Filter and prepare URLs
        valid_urls = []
        for result in search_results[:max_results * 2]:
            url = result.get('href')
            title = result.get('title', 'Untitled')
            
            if not url or not _is_url_allowed(url):
                continue
                
            # Skip certain file types and domains
            if any(ext in url.lower() for ext in ['.pdf', '.doc', '.ppt', '.xls']):
                continue
                
            valid_urls.append({'url': url, 'title': title})
        
        if not valid_urls:
            logger.warning("No valid URLs found after filtering")
            return []
        
        # Limit to max_results
        valid_urls = valid_urls[:max_results]
        logger.info(f"Processing {len(valid_urls)} URLs")
        
        # Fetch HTML content concurrently
        fetch_tasks = []
        for item in valid_urls:
            task = fetch_html(item['url'])
            fetch_tasks.append((task, item))
        
        # Gather results with error handling
        documents = []
        fetch_results = await asyncio.gather(
            *[task for task, _ in fetch_tasks], 
            return_exceptions=True
        )
        
        for (_, item), result in zip(fetch_tasks, fetch_results):
            if isinstance(result, Exception):
                logger.warning(f"Failed to fetch {item['url']}: {result}")
                continue
            
            # Extract text
            text = extract_text(result, item['url'])
            if not text:
                logger.warning(f"No text extracted from {item['url']}")
                continue
            
            # Check minimum word count
            word_count = len(text.split())
            if word_count < min_words:
                logger.warning(f"Content too short ({word_count} words) for {item['url']}")
                continue
            
            # Truncate text to prevent token overflow
            text = _truncate_text(text)
            
            # Score the quality of this source
            quality_score = _score_source_quality(item['url'], item['title'], text)
            
            # Filter out low-quality sources
            if quality_score < min_quality_score:
                logger.warning(f"Filtered out low-quality source {item['url']} (score: {quality_score:.2f})")
                continue
            
            documents.append({
                'url': item['url'],
                'title': item['title'],
                'text': text,
                'quality_score': quality_score
            })
            
            logger.info(f"Successfully processed {item['url']} ({word_count} words, quality: {quality_score:.2f})")
        
        # Sort by quality score (highest first) 
        documents.sort(key=lambda x: x['quality_score'], reverse=True)
        
        logger.info(f"Successfully scraped {len(documents)} high-quality documents")
        return documents
        
    except Exception as e:
        logger.error(f"Search and scrape failed: {e}")
        raise SearchPipelineError(f"Search failed: {e}")


# Async context manager for easier usage
class SearchPipeline:
    """Context manager for search pipeline operations."""
    
    def __init__(self, max_results: int = 5, min_words: int = 120, min_quality_score: float = 0.3):
        self.max_results = max_results
        self.min_words = min_words
        self.min_quality_score = min_quality_score
    
    async def search(self, query: str) -> List[Dict[str, str]]:
        """Search and return documents."""
        return await search_and_scrape(query, self.max_results, self.min_words, self.min_quality_score)
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

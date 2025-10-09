"""
Web Content Loader Module

Fetches HTML content from URLs and extracts readable text.
Separated from search engines for better modularity.

Features:
- Async HTML fetching with retries
- Text extraction using trafilatura
- Quality scoring based on content and domain
- Configurable via SearchConfig

Usage:
    from app.integrations.content_loader import load_content_from_urls
    
    urls = ["https://example.com/article1", "https://example.com/article2"]
    documents = await load_content_from_urls(
        urls, 
        min_words=100,
        min_quality_score=0.3
    )
    
    # Returns: [{"url": str, "title": str, "text": str, "quality_score": float}, ...]
"""

import asyncio
import logging
import re
from typing import List, Dict, Optional
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
import trafilatura
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.config.search_config import SearchConfig

logger = logging.getLogger(__name__)


class ContentLoaderError(Exception):
    """Custom exception for content loader errors."""
    pass


def _truncate_text(text: str, max_chars: Optional[int] = None) -> str:
    """
    Truncate text to max_chars without cutting mid-sentence.
    
    Args:
        text: The text to truncate
        max_chars: Maximum character limit (uses config default if None)
        
    Returns:
        Truncated text ending at a sentence boundary
    """
    max_chars = max_chars or SearchConfig.MAX_TEXT_CHARS
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
async def fetch_html(url: str, timeout: float = None) -> str:
    """
    Fetch HTML content from a URL with retries and timeout.
    
    Args:
        url: The URL to fetch
        timeout: Request timeout (uses config default if None)
        
    Returns:
        HTML content as string
        
    Raises:
        ContentLoaderError: If fetching fails after retries
    """
    timeout = timeout or SearchConfig.FETCH_TIMEOUT
    
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
            timeout=httpx.Timeout(timeout),
            headers=headers
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text
            
    except httpx.HTTPStatusError as e:
        logger.warning(f"HTTP error {e.response.status_code} for {url}")
        raise ContentLoaderError(f"HTTP {e.response.status_code}: {url}")
    except httpx.TimeoutException:
        logger.warning(f"Timeout fetching {url}")
        raise ContentLoaderError(f"Timeout: {url}")
    except Exception as e:
        logger.warning(f"Failed to fetch {url}: {e}")
        raise ContentLoaderError(f"Fetch error: {url} - {e}")


def score_content_quality(url: str, title: str, content: str) -> float:
    """
    Score the quality of web content based on URL, title, and text.
    
    Args:
        url: Source URL
        title: Page title
        content: Extracted content
        
    Returns:
        Quality score from 0.0 to 1.0 (higher is better)
    """
    score = 0.5  # Base score
    domain = urlparse(url).netloc.lower()
    
    # High-quality domain indicators
    high_quality_domains = [
        '.edu', '.gov', 'wikipedia.org', 'github.com', 
        'stackoverflow.com', 'arxiv.org', 'ieee.org',
        'nature.com', 'science.org', 'pubmed', 'reuters.com',
        'bbc.com', 'nytimes.com', 'theguardian.com'
    ]
    if any(indicator in domain for indicator in high_quality_domains):
        score += 0.3
    
    # Penalize known low-quality domains
    low_quality_domains = ['pinterest.com', 'quora.com', 'answers.com']
    if any(indicator in domain for indicator in low_quality_domains):
        score -= 0.2
    
    # Score based on content length
    word_count = len(content.split())
    if word_count > 500:
        score += 0.1
    if word_count > 1000:
        score += 0.1
    
    # Check for quality indicators in content
    quality_keywords = ['research', 'study', 'analysis', 'published', 'peer-reviewed']
    content_lower = content.lower()
    if any(keyword in content_lower for keyword in quality_keywords):
        score += 0.15
    
    # Penalize clickbait titles
    clickbait_phrases = ["you won't believe", "shocking", "this one trick", "must see"]
    title_lower = title.lower()
    if any(phrase in title_lower for phrase in clickbait_phrases):
        score -= 0.15
    
    return max(0.0, min(1.0, score))


async def load_content_from_url(
    url: str,
    title: str = "",
    timeout: float = None,
    max_chars: int = None
) -> Optional[Dict[str, str]]:
    """
    Load and extract content from a single URL.
    
    Args:
        url: The URL to load
        title: Optional title (from search result)
        timeout: Request timeout
        max_chars: Maximum text characters
        
    Returns:
        Document dict or None if loading fails
    """
    try:
        # Check robots.txt
        if not _is_url_allowed(url):
            logger.debug(f"Skipping {url} (blocked by robots.txt)")
            return None
        
        # Fetch HTML
        html = await fetch_html(url, timeout)
        
        # Extract text
        text = extract_text(html, url)
        if not text:
            logger.debug(f"No text extracted from {url}")
            return None
        
        # Truncate if needed
        text = _truncate_text(text, max_chars)
        
        # Get title from content if not provided
        if not title:
            # Try to extract title from HTML
            title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else "Untitled"
        
        # Score quality
        quality_score = score_content_quality(url, title, text)
        
        return {
            'url': url,
            'title': title,
            'text': text,
            'quality_score': quality_score
        }
        
    except ContentLoaderError as e:
        logger.debug(f"Failed to load {url}: {e}")
        return None
    except Exception as e:
        logger.warning(f"Unexpected error loading {url}: {e}")
        return None


async def load_content_from_urls(
    urls: List[str],
    titles: Optional[List[str]] = None,
    min_words: int = None,
    min_quality_score: float = None,
    max_chars: int = None,
    timeout: float = None,
    max_concurrent: int = 10
) -> List[Dict[str, str]]:
    """
    Load and extract content from multiple URLs concurrently.
    
    Args:
        urls: List of URLs to load
        titles: Optional list of titles (from search results)
        min_words: Minimum word count for content (uses config default if None)
        min_quality_score: Minimum quality score (uses config default if None)
        max_chars: Maximum text characters (uses config default if None)
        timeout: Request timeout (uses config default if None)
        max_concurrent: Maximum concurrent requests
        
    Returns:
        List of document dicts with 'url', 'title', 'text', 'quality_score' keys
    """
    if not urls:
        return []
    
    # Use config defaults if not specified
    min_words = min_words or SearchConfig.MIN_WORDS
    min_quality_score = min_quality_score or SearchConfig.MIN_QUALITY_SCORE
    max_chars = max_chars or SearchConfig.MAX_TEXT_CHARS
    timeout = timeout or SearchConfig.FETCH_TIMEOUT
    
    # Prepare titles list
    if titles is None:
        titles = [""] * len(urls)
    elif len(titles) < len(urls):
        titles.extend([""] * (len(urls) - len(titles)))
    
    logger.info(f"Loading content from {len(urls)} URLs...")
    
    # Create tasks for concurrent loading
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def load_with_semaphore(url: str, title: str):
        async with semaphore:
            return await load_content_from_url(url, title, timeout, max_chars)
    
    tasks = [
        load_with_semaphore(url, title)
        for url, title in zip(urls, titles)
    ]
    
    # Gather results
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter and collect valid documents
    documents = []
    for result in results:
        if isinstance(result, Exception):
            logger.debug(f"Load failed with exception: {result}")
            continue
        
        if result is None:
            continue
        
        # Check minimum requirements
        word_count = len(result['text'].split())
        if word_count < min_words:
            logger.debug(f"Skipping {result['url']} (only {word_count} words)")
            continue
        
        if result['quality_score'] < min_quality_score:
            logger.debug(f"Skipping {result['url']} (quality {result['quality_score']:.2f})")
            continue
        
        documents.append(result)
    
    logger.info(f"Loaded {len(documents)} valid documents from {len(urls)} URLs")
    
    # Sort by quality score
    documents.sort(key=lambda x: (x['quality_score'], len(x['text'])), reverse=True)
    
    return documents


async def load_content_from_search_results(
    search_results: List[Dict[str, str]],
    min_words: int = None,
    min_quality_score: float = None,
    max_chars: int = None,
    timeout: float = None,
    max_concurrent: int = 10
) -> List[Dict[str, str]]:
    """
    Load content from search results (which have url, title, snippet).
    
    Args:
        search_results: List of search result dicts with 'url' and 'title' keys
        min_words: Minimum word count for content
        min_quality_score: Minimum quality score
        max_chars: Maximum text characters
        timeout: Request timeout
        max_concurrent: Maximum concurrent requests
        
    Returns:
        List of document dicts with full content loaded
    """
    urls = [result.get('url', '') for result in search_results if result.get('url')]
    titles = [result.get('title', '') for result in search_results if result.get('url')]
    
    return await load_content_from_urls(
        urls=urls,
        titles=titles,
        min_words=min_words,
        min_quality_score=min_quality_score,
        max_chars=max_chars,
        timeout=timeout,
        max_concurrent=max_concurrent
    )

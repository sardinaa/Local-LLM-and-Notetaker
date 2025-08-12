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
from typing import List, Dict, Optional, Tuple
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


# Lightweight Spanish detection via stopwords hit-rate
_SPANISH_STOPWORDS = set(
    [
        'de','la','que','el','en','y','a','los','del','se','las','por','un','para','con','no','una','su','al','lo','como','más','pero','sus','le','ya','o','fue','este','ha','sí','porque','esta','son','entre','cuando','muy','sin','sobre','también','me','hasta','hay','donde','quien','desde','todo','nos','durante','todos'
    ]
)

def _spanish_ratio(text: str, sample_words: int = 200) -> float:
    try:
        words = re.findall(r"[\p{L}A-Za-záéíóúñüÁÉÍÓÚÑÜ]+", text)  # fallback simple tokenization
    except re.error:
        words = re.findall(r"[A-Za-záéíóúñüÁÉÍÓÚÑÜ]+", text)
    words = [w.lower() for w in words[:sample_words]]
    if not words:
        return 0.0
    hits = sum(1 for w in words if w in _SPANISH_STOPWORDS)
    return hits / max(1, len(words))

_SPANISH_NEWS_DOMAINS = [
    'elpais.com','elmundo.es','abc.es','larazon.es','lavanguardia.com','elconfidencial.com','eldiario.es','publico.es',
    'europapress.es','rtve.es','cadenaser.com','20minutos.es','okdiario.com','elperiodico.com','eldiario.es','vozpopuli.com',
    'expansion.com','elmundo.es','elcorreo.com','eldiario.es','elmundo.es/espana','elmundo.es/madrid','elmundo.es/cataluna'
]

def _is_news_query(q: str) -> bool:
    ql = q.lower()
    return any(k in ql for k in ['news', 'noticias', 'titulares', 'última hora', 'headline', 'portada'])

def _is_spain_query(q: str) -> bool:
    ql = q.lower()
    return any(k in ql for k in ['españa', 'spain', 'español', 'españoles'])

_SPAIN_GEO_TERMS = [
    'españa','spain','madrid','barcelona','valencia','sevilla','sevillé','bilbao','zaragoza','málaga','murcia','vigo',
    'andalucía','cataluña','catalunya','galicia','navarra','asturias','aragon','castilla','ibiza','mallorca','canarias','canary'
]

def _mentions_spain(text: str) -> bool:
    tl = text.lower()
    return any(term in tl for term in _SPAIN_GEO_TERMS)


async def search_and_scrape(
    query: str, 
    max_results: int = 20, 
    min_results: Optional[int] = None,
    min_words: int = 120,
    min_quality_score: float = 0.3,
    adaptive: bool = True
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

    # Determine adaptive target if requested
    if min_results is None:
        min_results = min(2, max_results)

    def _estimate_query_difficulty(q: str) -> float:
        ql = q.lower()
        score = 0.2
        # Longer, multi-part questions → higher difficulty
        if len(q) > 80:
            score += 0.2
        if any(sep in q for sep in [';', ' and ', ' vs ', ' / ', ',']):
            score += 0.1
        # Time-sensitive terms
        if re.search(r"\b(latest|recent|today|tomorrow|current|202[3-9]|202[0-9])\b", ql):
            score += 0.25
        # Location + temporal
        if re.search(r"\b(weather|forecast|temperature|results|price|rate)\b", ql):
            score += 0.15
        # Specific named entities/numbers → can need corroboration
        if re.search(r"\b[A-Z][a-z]+\b", q) and re.search(r"\d", q):
            score += 0.1
        return max(0.0, min(1.0, score))

    target_count = max_results
    if adaptive:
        difficulty = _estimate_query_difficulty(query)
        target_count = int(round(min_results + (max_results - min_results) * difficulty))
        target_count = max(min_results, min(max_results, target_count))
        logger.info(f"Adaptive target sources: {target_count} (difficulty={difficulty:.2f})")
    
    try:
        # Search with DuckDuckGo
        news_mode = _is_news_query(query)
        spain_mode = _is_spain_query(query)
        region = 'es-es' if spain_mode else 'wt-wt'
        timelimit = 'd' if news_mode else None

        with DDGS() as ddgs:
            if news_mode:
                # Use the News endpoint for fresher and topical results
                search_results = list(ddgs.news(
                    query if spain_mode else f"{query} Spain",
                    max_results=max_results * 4,
                    region=region,
                    timelimit=timelimit,
                    safesearch='moderate'
                ))
                # Normalize key names to match .text results
                for r in search_results:
                    if 'url' in r and 'href' not in r:
                        r['href'] = r['url']
            else:
                search_results = list(ddgs.text(
                    query,
                    max_results=max_results * 4,  # Get extra results in case some fail
                    region=region,
                    safesearch='moderate'
                ))
        
        if not search_results:
            logger.warning("No search results found")
            return []
        
        logger.info(f"Found {len(search_results)} search results")
        
        # Filter and prepare URLs
        valid_urls = []
        for result in search_results:
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
        
        # Limit the number of candidates we try to fetch (keep it higher than target)
        candidate_limit = min(len(valid_urls), (max_results * 5) if news_mode else max_results * 3)
        valid_urls = valid_urls[:candidate_limit]
        logger.info(f"Processing {len(valid_urls)} candidate URLs (target={target_count})")
        
        # Fetch HTML content concurrently
        fetch_tasks = []
        for item in valid_urls:
            task = fetch_html(item['url'])
            fetch_tasks.append((task, item))
        
        # Gather results with error handling
        documents: List[Dict[str, str]] = []
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
                logger.debug(f"Content short ({word_count} words) for {item['url']}")
                # Keep for potential relaxed pass
                pass
            
            # Truncate text to prevent token overflow
            text = _truncate_text(text)
            
            # Score the quality of this source
            quality_score = _score_source_quality(item['url'], item['title'], text)

            # Adjust scoring for Spain/news preferences
            if spain_mode:
                domain = urlparse(item['url']).netloc.lower()
                if domain.endswith('.es'):
                    quality_score += 0.1
                if any(d in domain for d in _SPANISH_NEWS_DOMAINS):
                    quality_score += 0.25
                # Demote generic international domains unless Spanish edition
                if 'bbc.com' in domain and '/mundo' not in item['url']:
                    quality_score -= 0.1
            
            if news_mode:
                # Prefer Spanish-language content when in Spain mode
                ratio = _spanish_ratio(text)
                if spain_mode and ratio >= 0.03:
                    quality_score += 0.1
                elif spain_mode and ratio < 0.01:
                    quality_score -= 0.05

            # If asking for Spain news, enforce Spain relevance: either domain is Spanish, or text/title mentions Spain
            if news_mode and spain_mode:
                domain = urlparse(item['url']).netloc.lower()
                title_l = (item['title'] or '').lower()
                spainish_domain = domain.endswith('.es') or any(d in domain for d in _SPANISH_NEWS_DOMAINS)
                mentions_spain = _mentions_spain(title_l) or _mentions_spain(text[:500])
                if not (spainish_domain or mentions_spain):
                    # Penalize strongly to push out in strict phase
                    quality_score -= 0.3

            # Apply initial strict filter
            if word_count >= min_words and quality_score >= min_quality_score:
                documents.append({
                    'url': item['url'],
                    'title': item['title'],
                    'text': text,
                    'quality_score': quality_score
                })
                logger.info(f"Accepted (strict) {item['url']} ({word_count} words, quality: {quality_score:.2f})")
                continue

            # Otherwise hold for relaxed pass
            documents.append({
                'url': item['url'],
                'title': item['title'],
                'text': text,
                'quality_score': quality_score
            })
            logger.debug(f"Candidate for relaxed pass {item['url']} ({word_count} words, quality: {quality_score:.2f})")

        # First, keep only those meeting at least a minimal threshold
        strict_docs = [d for d in documents if len(d['text'].split()) >= min_words and d['quality_score'] >= min_quality_score]

        # If Spain news requested, filter strict_docs to those that are Spain-relevant; if too few, we'll relax below
        if news_mode and spain_mode:
            def is_relevant(d):
                dom = urlparse(d['url']).netloc.lower()
                return dom.endswith('.es') or any(sd in dom for sd in _SPANISH_NEWS_DOMAINS) or _mentions_spain(d['title']) or _mentions_spain(d['text'][:500])
            strict_relevant = [d for d in strict_docs if is_relevant(d)]
            if len(strict_relevant) >= max(min_results, 1):
                strict_docs = strict_relevant
        if len(strict_docs) >= target_count:
            strict_docs.sort(key=lambda x: x['quality_score'], reverse=True)
            result_docs = strict_docs[:target_count]
            logger.info(f"Returning {len(result_docs)} strict documents")
            return result_docs

        # Relaxation loop: step down thresholds until we reach min_results or exhaust
        relaxed_docs = strict_docs.copy()
        remaining = [d for d in documents if d not in strict_docs]
        rel_min_words = max(60, int(min_words * 0.8))
        rel_min_quality = max(0.15, min_quality_score - 0.1)

        for d in remaining:
            wc = len(d['text'].split())
            if wc >= rel_min_words and d['quality_score'] >= rel_min_quality:
                # If Spain news requested, keep only if relevant or Spanish
                if news_mode and spain_mode:
                    dom = urlparse(d['url']).netloc.lower()
                    if dom.endswith('.es') or any(sd in dom for sd in _SPANISH_NEWS_DOMAINS) or _mentions_spain(d['title']) or _mentions_spain(d['text'][:500]):
                        relaxed_docs.append(d)
                else:
                    relaxed_docs.append(d)
        relaxed_docs.sort(key=lambda x: (x['quality_score'], len(x['text'])), reverse=True)

        # Ensure at least min_results if possible
        final_target = max(min_results, min(target_count, len(relaxed_docs)))
        result_docs = relaxed_docs[:final_target]
        logger.info(f"Returning {len(result_docs)} documents after relaxation (min={min_results}, target={target_count})")
        return result_docs
        
    except Exception as e:
        logger.error(f"Search and scrape failed: {e}")
        raise SearchPipelineError(f"Search failed: {e}")


# Async context manager for easier usage
class SearchPipeline:
    """Context manager for search pipeline operations."""
    
    def __init__(self, max_results: int = 5, min_results: Optional[int] = None, min_words: int = 120, min_quality_score: float = 0.3, adaptive: bool = True):
        self.max_results = max_results
        self.min_results = min_results if min_results is not None else min(2, max_results)
        self.min_words = min_words
        self.min_quality_score = min_quality_score
        self.adaptive = adaptive
    
    async def search(self, query: str) -> List[Dict[str, str]]:
        """Search and return documents."""
        return await search_and_scrape(query, self.max_results, self.min_results, self.min_words, self.min_quality_score, self.adaptive)
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

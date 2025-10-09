"""
Multi-engine search with automatic fallback.
All engines are FREE to use.
"""

import asyncio
import logging
from typing import List, Dict, Optional
from urllib.parse import urlparse
from app.integrations.search_engines.duckduckgo import search_duckduckgo
from app.integrations.search_engines.brave_search import search_brave
from app.integrations.search_engines.searxng import search_searxng
from app.integrations.search_engines.qwant import search_qwant
from app.integrations.search_engines.mojeek import search_mojeek
from app.integrations.search_engines.yacy import search_yacy

logger = logging.getLogger(__name__)


class MultiEngineSearch:
    """
    Multi-engine search manager with automatic fallback.
    All engines are free to use.
    """
    
    def __init__(
        self,
        brave_api_key: Optional[str] = None,
        mojeek_api_key: Optional[str] = None,
        searxng_url: Optional[str] = None,
        yacy_url: Optional[str] = None,
        enable_qwant: bool = True,
        enable_fallback: bool = True,
        domain_filter_list: Optional[List[str]] = None,
        concurrent_requests: int = 10,
        result_count: int = 3
    ):
        """
        Initialize multi-engine search.
        
        Args:
            brave_api_key: Optional Brave API key (free tier available)
            mojeek_api_key: Optional Mojeek API key (free 1K/month)
            searxng_url: Optional SearXNG instance URL (self-hosted)
            yacy_url: Optional YaCy instance URL (self-hosted P2P)
            enable_qwant: Enable Qwant (FREE, no API key!)
            enable_fallback: Enable automatic fallback to other engines
            domain_filter_list: Optional list of domains to whitelist (e.g., ['wikipedia.org', 'github.com'])
            concurrent_requests: Number of concurrent requests for parallel search
            result_count: Default number of results to return
        """
        self.brave_api_key = brave_api_key
        self.mojeek_api_key = mojeek_api_key
        self.searxng_url = searxng_url
        self.yacy_url = yacy_url
        self.enable_qwant = enable_qwant
        self.enable_fallback = enable_fallback
        self.domain_filter_list = [d.strip() for d in domain_filter_list] if domain_filter_list else None
        self.concurrent_requests = concurrent_requests
        self.result_count = result_count
        
        # Log domain filtering if enabled
        if self.domain_filter_list:
            logger.info(f"Domain filtering enabled: {len(self.domain_filter_list)} domains whitelisted")
            logger.debug(f"Allowed domains: {', '.join(self.domain_filter_list)}")
        
        # Define engine priority (all free)
        # Better quality engines are tried first
        self.engines = []
        
        # Primary: Brave (if API key available) - BEST QUALITY
        if brave_api_key:
            self.engines.append(("brave", self._search_brave))
        
        # Fallback 1: DuckDuckGo (always available, no API key)
        self.engines.append(("duckduckgo", self._search_duckduckgo))
        
        # Fallback 2: Qwant (FREE, no API key needed!)
        if enable_qwant:
            self.engines.append(("qwant", self._search_qwant))
        
        # Fallback 3: Mojeek (if API key available)
        if mojeek_api_key:
            self.engines.append(("mojeek", self._search_mojeek))
        
        # Fallback 4: SearXNG (if instance configured)
        # Fallback 4: SearXNG (if instance configured)
        if searxng_url:
            self.engines.append(("searxng", self._search_searxng))
        
        # Fallback 5: YaCy (if instance configured)
        if yacy_url:
            self.engines.append(("yacy", self._search_yacy))
        
        logger.info(f"MultiEngineSearch initialized with {len(self.engines)} engines: "
                   f"{[name for name, _ in self.engines]}")
    
    def _filter_by_domains(self, results: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """
        Filter search results to only include whitelisted domains.
        
        Args:
            results: List of search results with 'url' key
            
        Returns:
            Filtered list of results matching domain whitelist
        """
        if not self.domain_filter_list or not results:
            return results
        
        filtered = []
        filtered_count = 0
        
        for result in results:
            try:
                url = result.get('url', '')
                if not url:
                    continue
                
                # Parse domain from URL
                domain = urlparse(url).netloc.lower()
                
                # Check if domain matches any in whitelist
                if any(allowed.lower() in domain for allowed in self.domain_filter_list):
                    filtered.append(result)
                else:
                    filtered_count += 1
                    logger.debug(f"Filtered out domain: {domain}")
            
            except Exception as e:
                logger.warning(f"Failed to parse URL for filtering: {e}")
                continue
        
        if filtered_count > 0:
            logger.info(f"Domain filter: {filtered_count} results filtered out, {len(filtered)} kept")
        
        return filtered
    
    async def _search_duckduckgo(
        self,
        query: str,
        max_results: int,
        min_results: int
    ) -> List[Dict[str, str]]:
        """Search using DuckDuckGo (free, no API key)."""
        try:
            results = await search_duckduckgo(
                query,
                count=max_results
            )
            return self._filter_by_domains(results)
        except Exception as e:
            logger.error(f"DuckDuckGo search failed: {e}")
            return []
    
    async def _search_qwant(
        self,
        query: str,
        max_results: int,
        min_results: int
    ) -> List[Dict[str, str]]:
        """Search using Qwant (FREE, no API key needed!)."""
        results = await search_qwant(query, max_results)
        return self._filter_by_domains(results)
    
    async def _search_brave(
        self,
        query: str,
        max_results: int,
        min_results: int
    ) -> List[Dict[str, str]]:
        """Search using Brave API (free tier)."""
        results = await search_brave(query, self.brave_api_key, max_results)
        return self._filter_by_domains(results)
    
    async def _search_mojeek(
        self,
        query: str,
        max_results: int,
        min_results: int
    ) -> List[Dict[str, str]]:
        """Search using Mojeek API (free tier)."""
        results = await search_mojeek(query, self.mojeek_api_key, max_results)
        return self._filter_by_domains(results)
    
    async def _search_searxng(
        self,
        query: str,
        max_results: int,
        min_results: int
    ) -> List[Dict[str, str]]:
        """Search using SearXNG instance (self-hosted)."""
        results = await search_searxng(
            query,
            instance_url=self.searxng_url,
            count=max_results
        )
        return self._filter_by_domains(results)
    
    async def _search_yacy(
        self,
        query: str,
        max_results: int,
        min_results: int
    ) -> List[Dict[str, str]]:
        """Search using YaCy P2P network (self-hosted)."""
        results = await search_yacy(
            query,
            instance_url=self.yacy_url,
            count=max_results
        )
        return self._filter_by_domains(results)
    
    async def search(
        self,
        query: str,
        max_results: int = 5,
        min_results: int = 2
    ) -> tuple[List[Dict[str, str]], str]:
        """
        Search with automatic fallback across engines.
        
        Args:
            query: Search query
            max_results: Maximum results to return
            min_results: Minimum acceptable results
            
        Returns:
            Tuple of (results, engine_used)
        """
        for engine_name, engine_func in self.engines:
            logger.info(f"Trying {engine_name} for query: {query}")
            
            try:
                results = await engine_func(query, max_results, min_results)
                
                if results and len(results) >= min_results:
                    logger.info(f"✓ {engine_name} returned {len(results)} results")
                    return results, engine_name
                else:
                    logger.warning(f"✗ {engine_name} returned insufficient results: {len(results)}")
                    
                    if not self.enable_fallback:
                        return results, engine_name
            
            except Exception as e:
                logger.error(f"✗ {engine_name} failed: {e}")
                
                if not self.enable_fallback:
                    raise
        
        # All engines failed
        logger.error("All search engines failed")
        return [], "none"
    
    async def parallel_search(
        self,
        query: str,
        max_results: int = 5
    ) -> Dict[str, List[Dict[str, str]]]:
        """
        Search all engines in parallel and return aggregated results.
        
        Args:
            query: Search query
            max_results: Maximum results per engine
            
        Returns:
            Dictionary mapping engine names to their results
        """
        tasks = []
        engine_names = []
        
        for engine_name, engine_func in self.engines:
            tasks.append(engine_func(query, max_results, max_results // 2))
            engine_names.append(engine_name)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        aggregated = {}
        for engine_name, result in zip(engine_names, results):
            if isinstance(result, Exception):
                logger.error(f"{engine_name} failed: {result}")
                aggregated[engine_name] = []
            else:
                aggregated[engine_name] = result
                logger.info(f"{engine_name} returned {len(result)} results")
        
        return aggregated
    
    def merge_results(
        self,
        results_by_engine: Dict[str, List[Dict[str, str]]],
        max_results: int = 5
    ) -> List[Dict[str, str]]:
        """
        Merge and deduplicate results from multiple engines.
        
        Args:
            results_by_engine: Results from each engine
            max_results: Maximum final results
            
        Returns:
            Merged and deduplicated results
        """
        seen_urls = set()
        merged = []
        
        # Sort engines by priority (same order as self.engines)
        engine_order = [name for name, _ in self.engines]
        
        for engine_name in engine_order:
            results = results_by_engine.get(engine_name, [])
            
            for result in results:
                url = result.get('url', '')
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    merged.append(result)
                    
                    if len(merged) >= max_results:
                        return merged
        
        return merged
    
    async def search_multiple_queries(
        self,
        queries: List[str],
        max_results_per_query: int = 3
    ) -> List[Dict[str, str]]:
        """
        Search multiple queries in parallel and merge results.
        Useful for comprehensive coverage when LLM generates multiple search queries.
        
        Args:
            queries: List of search queries to execute in parallel
            max_results_per_query: Maximum results per query
            
        Returns:
            Merged and deduplicated results from all queries
        """
        if not queries:
            logger.warning("No queries provided for parallel search")
            return []
        
        logger.info(f"Executing {len(queries)} queries in parallel: {queries}")
        
        # Create tasks for each query
        tasks = [
            self.search(query, max_results=max_results_per_query, min_results=1)
            for query in queries
        ]
        
        # Execute all searches concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Merge and deduplicate results
        seen_urls = set()
        merged = []
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Query '{queries[i]}' failed: {result}")
                continue
            
            search_results, engine_used = result
            logger.info(f"Query '{queries[i]}' via {engine_used}: {len(search_results)} results")
            
            for item in search_results:
                url = item.get('url', '')
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    # Add query metadata to track which query found this result
                    item['source_query'] = queries[i]
                    merged.append(item)
        
        logger.info(f"Parallel search complete: {len(merged)} unique results from {len(queries)} queries")
        return merged

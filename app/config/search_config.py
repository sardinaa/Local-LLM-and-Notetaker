"""
Search engine configuration.
All engines listed here are FREE to use.
"""

import os
from typing import Optional
from pathlib import Path

# Load .env file if it exists
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / '.env'
    load_dotenv(env_path)
except ImportError:
    pass  # dotenv not installed, will use system environment variables


class SearchConfig:
    """Configuration for web search engines (all free)."""
    
    # Primary engine (always free, no API key needed)
    PRIMARY_ENGINE = "duckduckgo"
    
    # Enable automatic fallback to other engines
    ENABLE_FALLBACK = os.getenv("ENABLE_SEARCH_FALLBACK", "true").lower() == "true"
    
    # Brave Search (FREE tier: 2,000 queries/month)
    # Sign up at: https://brave.com/search/api/
    BRAVE_API_KEY: Optional[str] = os.getenv("BRAVE_API_KEY")
    
    # SearXNG instance (self-hosted or public)
    # Self-host: docker run -d -p 8080:8080 searxng/searxng
    # Or use public instance (less reliable): https://searx.space/
    SEARXNG_URL: Optional[str] = os.getenv("SEARXNG_URL")
    
    # Qwant (FREE, no API key needed!)
    # European privacy-focused search, GDPR compliant
    ENABLE_QWANT: bool = os.getenv("ENABLE_QWANT", "true").lower() == "true"
    
    # Mojeek API (FREE tier: 1,000 queries/month)
    # Independent search index, sign up: https://www.mojeek.com/services/api/signup/
    MOJEEK_API_KEY: Optional[str] = os.getenv("MOJEEK_API_KEY")
    
    # YaCy instance (self-hosted P2P search)
    # Self-host: docker run -d -p 8090:8090 yacy/yacy_search_server
    YACY_URL: Optional[str] = os.getenv("YACY_URL")
    
    # Domain whitelist/filter (optional)
    # If set, only return results from these domains (for quality/safety)
    # Examples: "wikipedia.org,stackoverflow.com,github.com"
    DOMAIN_FILTER_LIST = os.getenv("SEARCH_DOMAIN_FILTER_LIST", "").split(",") if os.getenv("SEARCH_DOMAIN_FILTER_LIST") else []
    
    # Concurrent requests for parallel search
    # Higher values = faster parallel searches, but more resource usage
    CONCURRENT_REQUESTS = int(os.getenv("SEARCH_CONCURRENT_REQUESTS", "10"))
    
    # Result counts
    MIN_RESULTS = int(os.getenv("SEARCH_MIN_RESULTS", "2"))
    MAX_RESULTS = int(os.getenv("SEARCH_MAX_RESULTS", "3"))
    DEFAULT_RESULT_COUNT = int(os.getenv("SEARCH_RESULT_COUNT", "3"))
    
    # Quality thresholds
    MIN_QUALITY_SCORE = float(os.getenv("SEARCH_MIN_QUALITY", "0.3"))
    MIN_WORDS = int(os.getenv("SEARCH_MIN_WORDS", "100"))
    
    # Content extraction settings (used by search_pipeline)
    MAX_TEXT_CHARS = int(os.getenv("SEARCH_MAX_TEXT_CHARS", "8000"))
    FETCH_TIMEOUT = float(os.getenv("SEARCH_FETCH_TIMEOUT", "30.0"))
    
    # DuckDuckGo settings (region/language control)
    DDGS_REGION = os.getenv("SEARCH_REGION", "wt-wt")  # wt-wt = worldwide, es-es = Spain, en-us = USA, etc.
    DDGS_SAFESEARCH = os.getenv("SEARCH_SAFESEARCH", "moderate")  # off, moderate, strict
    DDGS_TIMELIMIT = os.getenv("SEARCH_TIMELIMIT", None)  # None, 'd' (day), 'w' (week), 'm' (month), 'y' (year)
    
    @classmethod
    def get_available_engines(cls) -> list[str]:
        """Get list of available engines based on configuration."""
        engines = ["duckduckgo"]  # Always available
        
        if cls.ENABLE_QWANT:
            engines.append("qwant")  # FREE, no API key!
        
        if cls.BRAVE_API_KEY:
            engines.append("brave")
        
        if cls.MOJEEK_API_KEY:
            engines.append("mojeek")
        
        if cls.SEARXNG_URL:
            engines.append("searxng")
        
        if cls.YACY_URL:
            engines.append("yacy")
        
        return engines
    
    @classmethod
    def is_configured(cls) -> bool:
        """Check if search is properly configured."""
        return True  # DuckDuckGo always works
    
    @classmethod
    def get_setup_instructions(cls) -> str:
        """Get setup instructions for additional engines."""
        instructions = []
        
        if not cls.ENABLE_QWANT:
            instructions.append(
                "• Qwant (Free unlimited, no API key!):\n"
                "  Set ENABLE_QWANT=true (enabled by default)"
            )
        
        if not cls.MOJEEK_API_KEY:
            instructions.append(
                "• Mojeek (Free 1,000 queries/month):\n"
                "  1. Sign up at https://www.mojeek.com/services/api/signup/\n"
                "  2. Set MOJEEK_API_KEY environment variable"
            )
        
        if not cls.BRAVE_API_KEY:
            instructions.append(
                "• Brave Search (Free 2,000 queries/month):\n"
                "  1. Sign up at https://brave.com/search/api/\n"
                "  2. Set BRAVE_API_KEY environment variable"
            )
        
        if not cls.SEARXNG_URL:
            instructions.append(
                "• SearXNG (Self-hosted, unlimited):\n"
                "  1. Run: docker run -d -p 8080:8080 searxng/searxng\n"
                "  2. Set SEARXNG_URL=http://localhost:8080"
            )
        
        if not cls.YACY_URL:
            instructions.append(
                "• YaCy (Self-hosted P2P, unlimited):\n"
                "  1. Run: docker run -d -p 8090:8090 yacy/yacy_search_server\n"
                "  2. Set YACY_URL=http://localhost:8090"
            )
        
        if instructions:
            return "Optional FREE search engines you can add:\n\n" + "\n\n".join(instructions)
        
        return "All free search engines are configured! ✓"

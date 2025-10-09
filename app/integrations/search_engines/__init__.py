"""
Multi-engine web search module with free search providers.
Supports DuckDuckGo, SearXNG (self-hosted), and fallback strategies.
"""

from typing import List, Dict, Optional
from enum import Enum


class SearchEngine(Enum):
    """Available free search engines."""
    DUCKDUCKGO = "duckduckgo"
    SEARXNG = "searxng"  # Self-hosted
    BRAVE = "brave"  # Free tier


class SearchResult:
    """Standardized search result format."""
    def __init__(self, url: str, title: str, snippet: str, quality_score: float = 0.5):
        self.url = url
        self.title = title
        self.snippet = snippet
        self.quality_score = quality_score
    
    def to_dict(self) -> Dict[str, str]:
        return {
            'url': self.url,
            'title': self.title,
            'text': self.snippet,
            'quality_score': self.quality_score
        }

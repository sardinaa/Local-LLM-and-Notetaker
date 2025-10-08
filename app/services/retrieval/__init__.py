"""
Shared retrieval components for both RAG and Agent systems.

This package provides sophisticated retrieval strategies that can be
used by both chat-based document Q&A and agent-based knowledge assistants.
"""

# Import only what exists
try:
    from .document_highlight_service import DocumentHighlightService, get_highlight_service
    _has_highlight = True
except ImportError:
    _has_highlight = False

__all__ = []

if _has_highlight:
    __all__.extend(['DocumentHighlightService', 'get_highlight_service'])

# Legacy imports - only import if they exist
try:
    from .strategies import HybridRetrieval, KeywordSearch, SemanticSearch
    __all__.extend(['HybridRetrieval', 'KeywordSearch', 'SemanticSearch'])
except ImportError:
    pass

try:
    from .chunking import SentenceAwareChunker
    __all__.append('SentenceAwareChunker')
except ImportError:
    pass

try:
    from .scoring import MultiFactorScorer
    __all__.append('MultiFactorScorer')
except ImportError:
    pass

try:
    from .document_loaders import EnhancedDocumentLoader
    __all__.append('EnhancedDocumentLoader')
except ImportError:
    pass

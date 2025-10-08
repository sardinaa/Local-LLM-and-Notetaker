"""
Document Preprocessor

Robust multilingual document preprocessing using industry-standard libraries:
- langdetect: Language detection
- stopwordsiso: Multilingual stopwords (50+ languages)
- spaCy: Advanced tokenization and NLP

Creates clean, searchable term indices at upload time.
"""

import logging
from typing import Dict, List, Any, Set, Optional
from collections import Counter

logger = logging.getLogger(__name__)

# Import required libraries
try:
    from langdetect import detect, DetectorFactory
    from langdetect.lang_detect_exception import LangDetectException
    _HAS_LANGDETECT = True
    DetectorFactory.seed = 0
except ImportError:
    _HAS_LANGDETECT = False
    logger.warning("langdetect not available - language detection disabled")

try:
    from stopwordsiso import stopwords
    _HAS_STOPWORDS = True
except ImportError:
    _HAS_STOPWORDS = False
    logger.warning("stopwordsiso not available - using basic English stopwords")

try:
    import spacy
    from spacy.language import Language
    _HAS_SPACY = True
except ImportError:
    _HAS_SPACY = False
    logger.warning("spaCy not available - falling back to basic tokenization")

SPACY_MODELS = {
    'en': 'en_core_web_sm', 'es': 'es_core_news_sm', 'fr': 'fr_core_news_sm',
    'de': 'de_core_news_sm', 'it': 'it_core_news_sm', 'pt': 'pt_core_news_sm',
}

FALLBACK_STOPWORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
}

class DocumentPreprocessor:
    """Robust multilingual document preprocessing with spaCy."""
    
    def __init__(self):
        self.spacy_models: Dict[str, Language] = {}
        if _HAS_SPACY:
            try:
                self.spacy_models['en'] = spacy.load('en_core_web_sm')
                logger.info("Loaded spaCy model: en_core_web_sm")
            except OSError:
                logger.warning("spaCy model 'en_core_web_sm' not found")
    
    def process_document(self, text: str, language: Optional[str] = None,
                        max_terms: int = 500, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Full document processing with detailed statistics and metadata.
        
        Args:
            text: Document text to process
            language: Optional language code (auto-detected if None)
            max_terms: Maximum number of unique terms to return
            metadata: Optional metadata to include in result
            
        Returns:
            Dict with language, terms, term_freq, top_terms, etc.
        """
        if not text or not text.strip():
            return self._empty_result()
        
        detected_lang = self._detect_language(text) if not language else language
        stop_words = self._get_stopwords(detected_lang)
        tokens = self._tokenize(text, detected_lang)
        filtered_tokens = self._filter_tokens(tokens, stop_words)
        term_freq = Counter(filtered_tokens)
        top_terms = term_freq.most_common(50)
        
        if len(term_freq) > max_terms:
            limited_term_freq = dict(term_freq.most_common(max_terms))
            terms_list = list(limited_term_freq.keys())
        else:
            limited_term_freq = dict(term_freq)
            terms_list = list(term_freq.keys())
        
        return {
            'language': detected_lang,
            'terms': terms_list,
            'term_freq': limited_term_freq,
            'top_terms': top_terms,
            'total_tokens': len(tokens),
            'unique_tokens': len(term_freq)
        }
    
    def extract_terms(self, text: str, language: Optional[str] = None) -> List[str]:
        """
        Quick term extraction without full statistics.
        Optimized for classification use cases.
        
        Args:
            text: Text to extract terms from
            language: Optional language code (auto-detected if None)
            
        Returns:
            List of lemmatized, filtered terms
        """
        if not text or not text.strip():
            return []
        
        detected_lang = self._detect_language(text) if not language else language
        stop_words = self._get_stopwords(detected_lang)
        tokens = self._tokenize(text, detected_lang)
        filtered_tokens = self._filter_tokens(tokens, stop_words)
        
        return list(set(filtered_tokens))  # Return unique terms
    
    def _detect_language(self, text: str) -> str:
        if not _HAS_LANGDETECT:
            return 'en'
        try:
            return detect(text[:1000])
        except:
            return 'en'
    
    def _get_stopwords(self, language: str) -> Set[str]:
        if not _HAS_STOPWORDS:
            return FALLBACK_STOPWORDS
        try:
            # Try to get stopwords for the language
            return set(stopwords(language))
        except:
            # If language not supported, fallback to English
            try:
                return set(stopwords('en'))
            except:
                return FALLBACK_STOPWORDS
    
    def _tokenize(self, text: str, language: str) -> List[str]:
        if not _HAS_SPACY:
            return self._basic_tokenize(text)
        
        nlp = self._get_spacy_model(language)
        if nlp is None:
            return self._basic_tokenize(text)
        
        try:
            doc = nlp(text)
            return [token.lemma_.lower() for token in doc if token.is_alpha and not token.is_space]
        except:
            return self._basic_tokenize(text)
    
    def _get_spacy_model(self, language: str) -> Optional[Language]:
        if language in self.spacy_models:
            return self.spacy_models[language]
        
        model_name = SPACY_MODELS.get(language)
        if not model_name:
            logger.debug(f"No spaCy model mapping for language '{language}'")
            return None
        
        try:
            nlp = spacy.load(model_name)
            self.spacy_models[language] = nlp
            logger.info(f"Loaded spaCy model for {language}: {model_name}")
            return nlp
        except OSError:
            logger.warning(f"spaCy model '{model_name}' for language '{language}' not found")
            return None
    
    def _basic_tokenize(self, text: str) -> List[str]:
        import re
        import unicodedata
        text = unicodedata.normalize('NFKD', text)
        text = ''.join([c for c in text if not unicodedata.combining(c)])
        return re.findall(r'\b\w+\b', text.lower(), re.UNICODE)
    
    def _filter_tokens(self, tokens: List[str], stopwords: Set[str]) -> List[str]:
        return [t for t in tokens if t not in stopwords and len(t) >= 3 and t.isalpha()]
    
    def _empty_result(self) -> Dict[str, Any]:
        return {'language': 'en', 'terms': [], 'term_freq': {}, 'top_terms': [],
                'total_tokens': 0, 'unique_tokens': 0}

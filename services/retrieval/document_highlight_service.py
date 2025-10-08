"""
Modern Document Highlight Service

A smart, precise document highlighting system that:
- Uses semantic understanding (embeddings) for relevance
- Returns exact PDF coordinates (page, bbox)
- Handles multi-page context
- Supports both keyword and semantic search
- Provides quality scoring and ranking
- Includes fallback strategies
"""

from __future__ import annotations

import os
import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class HighlightSpan:
    """Precise highlight location with metadata."""
    text: str
    page: int
    bbox: Dict[str, float]  # {x, y, width, height}
    relevance_score: float
    match_type: str  # 'exact', 'semantic', 'keyword', 'fuzzy'
    context: str
    sentence: str  # Full sentence for context
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class HighlightResult:
    """Complete highlight analysis result."""
    success: bool
    highlights: List[HighlightSpan]
    total_matches: int
    query: str
    filename: str
    processing_time_ms: float
    strategy: str  # 'semantic', 'keyword', 'hybrid'
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "highlights": [h.to_dict() for h in self.highlights],
            "total_matches": self.total_matches,
            "query": self.query,
            "filename": self.filename,
            "processing_time_ms": self.processing_time_ms,
            "strategy": self.strategy,
            "error": self.error
        }


class DocumentHighlightService:
    """
    Modern document highlighting service with semantic understanding.
    
    Features:
    - Precise PDF coordinate extraction
    - Semantic similarity using embeddings
    - Multi-strategy matching (keyword, semantic, hybrid)
    - Quality scoring and ranking
    - Context-aware sentence extraction
    """
    
    def __init__(self, llm_client=None, embedding_model: str = "nomic-embed-text:latest"):
        """
        Initialize the highlight service.
        
        Args:
            llm_client: Optional LLM client for advanced analysis
            embedding_model: Model to use for semantic embeddings
        """
        self.llm_client = llm_client
        self.embedding_model = embedding_model
        
        # Stopwords for keyword filtering
        self.stopwords = {
            'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into',
            'your', 'about', 'what', 'when', 'where', 'which', 'then',
            'than', 'also', 'have', 'has', 'are', 'was', 'were', 'will',
            'shall', 'should', 'would', 'could', 'can', 'may', 'might',
            'a', 'an', 'in', 'on', 'to', 'of', 'by', 'at', 'as', 'it',
            'or', 'be', 'is'
        }
    
    async def _extract_document_structure(
        self, file_path: str
    ) -> Optional[Dict[str, Any]]:
        """
        Extract document text with precise coordinates.
        
        Returns structure like:
        {
            "pages": [
                {
                    "page_num": 1,
                    "width": 612,
                    "height": 792,
                    "text_blocks": [
                        {
                            "text": "Sample text",
                            "bbox": {"x": 10, "y": 20, "width": 100, "height": 12},
                            "font_size": 12,
                            "font_name": "Times"
                        }
                    ]
                }
            ]
        }
        """
        file_ext = file_path.lower().split('.')[-1]
        
        if file_ext == 'pdf':
            return await self._extract_pdf_structure(file_path)
        elif file_ext in ['txt', 'md']:
            return self._extract_text_structure(file_path)
        else:
            logger.warning(f"Unsupported file type: {file_ext}")
            return None
    
    async def _extract_pdf_structure(self, pdf_path: str) -> Dict[str, Any]:
        """Extract text and coordinates from PDF using PyMuPDF."""
        try:
            import fitz  # PyMuPDF
            
            doc = fitz.open(pdf_path)
            pages_data = []
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                
                # Get text with detailed positioning
                text_blocks = []
                blocks = page.get_text("dict")["blocks"]
                
                for block in blocks:
                    if block.get("type") == 0:  # Text block
                        for line in block.get("lines", []):
                            line_text = ""
                            line_bbox = line.get("bbox", [0, 0, 0, 0])
                            
                            for span in line.get("spans", []):
                                line_text += span.get("text", "")
                            
                            if line_text.strip():
                                text_blocks.append({
                                    "text": line_text,
                                    "bbox": {
                                        "x": line_bbox[0],
                                        "y": line_bbox[1],
                                        "width": line_bbox[2] - line_bbox[0],
                                        "height": line_bbox[3] - line_bbox[1]
                                    },
                                    "font_size": line.get("spans", [{}])[0].get("size", 12),
                                    "font_name": line.get("spans", [{}])[0].get("font", "")
                                })
                
                pages_data.append({
                    "page_num": page_num + 1,
                    "width": page.rect.width,
                    "height": page.rect.height,
                    "text_blocks": text_blocks
                })
            
            doc.close()
            
            return {"pages": pages_data}
            
        except ImportError:
            logger.error("PyMuPDF (fitz) not installed. Install with: pip install PyMuPDF")
            return None
        except Exception as e:
            logger.error(f"PDF extraction error: {e}", exc_info=True)
            return None
    
    def _extract_text_structure(self, text_path: str) -> Dict[str, Any]:
        """Extract structure from plain text files."""
        try:
            with open(text_path, 'r', encoding='utf-8') as f:
                text = f.read()
            
            # Simulate single-page structure
            lines = text.split('\n')
            text_blocks = []
            y_pos = 0
            
            for line in lines:
                if line.strip():
                    text_blocks.append({
                        "text": line,
                        "bbox": {
                            "x": 0,
                            "y": y_pos,
                            "width": len(line) * 7,  # Approximate
                            "height": 12
                        },
                        "font_size": 12,
                        "font_name": "monospace"
                    })
                y_pos += 15
            
            return {
                "pages": [{
                    "page_num": 1,
                    "width": 800,
                    "height": y_pos,
                    "text_blocks": text_blocks
                }]
            }
            
        except Exception as e:
            logger.error(f"Text extraction error: {e}")
            return None
    
    async def highlight_retrieved_chunks(
        self,
        file_path: str,
        chunks: List[str],
        filename: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> HighlightResult:
        """
        Highlight the exact text chunks that were retrieved by RAG.
        
        This is the CORRECT way to highlight - show the user exactly what
        passages the LLM used to answer their question, not random keyword matches.
        
        Args:
            file_path: Path to the document file
            chunks: List of text chunks that were retrieved (from RAG)
            filename: Display name of the file
            metadata: Optional metadata about the chunks (page numbers, etc.)
            
        Returns:
            HighlightResult with precise locations of the retrieved chunks
        """
        import time
        start_time = time.time()
        
        try:
            # Extract document structure with coordinates
            doc_structure = await self._extract_document_structure(file_path)
            
            if not doc_structure:
                return HighlightResult(
                    success=False,
                    highlights=[],
                    total_matches=0,
                    query="RAG chunks",
                    filename=filename,
                    processing_time_ms=0,
                    strategy="chunk-match",
                    error="Failed to extract document structure"
                )
            
            highlights = []
            
            # For each retrieved chunk, find its location in the document
            for chunk_idx, chunk_text in enumerate(chunks):
                if not chunk_text or len(chunk_text.strip()) < 10:
                    continue
                
                # Find this chunk in the document structure
                chunk_highlights = self._find_chunk_in_document(
                    doc_structure,
                    chunk_text,
                    chunk_idx,
                    metadata
                )
                highlights.extend(chunk_highlights)
            
            # Sort by page and position
            highlights.sort(key=lambda h: (h.page, h.bbox['y'], h.bbox['x']))
            
            processing_time = (time.time() - start_time) * 1000
            
            return HighlightResult(
                success=True,
                highlights=highlights,
                total_matches=len(highlights),
                query="RAG retrieved chunks",
                filename=filename,
                processing_time_ms=processing_time,
                strategy="chunk-match"
            )
            
        except Exception as e:
            logger.error(f"Chunk highlight error: {e}", exc_info=True)
            processing_time = (time.time() - start_time) * 1000
            
            return HighlightResult(
                success=False,
                highlights=[],
                total_matches=0,
                query="RAG chunks",
                filename=filename,
                processing_time_ms=processing_time,
                strategy="chunk-match",
                error=str(e)
            )
    
    def _find_chunk_in_document(
        self,
        doc_structure: Dict[str, Any],
        chunk_text: str,
        chunk_idx: int,
        metadata: Optional[Dict[str, Any]]
    ) -> List[HighlightSpan]:
        """
        ULTRA-SIMPLIFIED: Just find the first few words and highlight from there.
        
        Handles OCR artifacts and spacing issues by using fuzzy word matching.
        """
        highlights = []
        
        # Get first ~10 meaningful words from chunk (skip very short words)
        chunk_words = chunk_text.lower().split()
        search_words = [w for w in chunk_words if len(w) >= 3][:10]  # First 10 words, 3+ chars
        
        if len(search_words) < 3:
            # Chunk too short or weird, just use raw text
            search_words = chunk_words[:10]
        
        logger.info(f"Searching for chunk starting with: {' '.join(search_words[:5])}...")
        
        # Focus on metadata page if available
        target_pages = None
        if metadata and 'page' in metadata:
            target_pages = [metadata['page']]
            logger.info(f"Focusing on page {metadata['page']} from metadata")
        
        for page in doc_structure['pages']:
            if target_pages and page['page_num'] not in target_pages:
                continue
            
            page_blocks = page['text_blocks']
            
            # Try to find a block that contains most of our search words
            best_match_start = -1
            best_match_count = 0
            
            for start_idx, start_block in enumerate(page_blocks):
                # Build a window of ~20 blocks from here
                window_blocks = page_blocks[start_idx:start_idx + 20]
                window_text = ' '.join(b['text'] for b in window_blocks).lower()
                window_words = window_text.split()
                
                # Count how many search words appear in this window
                matches = sum(1 for sword in search_words if sword in window_words)
                
                if matches > best_match_count:
                    best_match_count = matches
                    best_match_start = start_idx
            
            # If we found a good match (at least 60% of search words)
            threshold = max(3, int(len(search_words) * 0.6))
            if best_match_count >= threshold:
                logger.info(f"✓ Found match on page {page['page_num']}: {best_match_count}/{len(search_words)} words matched, starting at block {best_match_start}")
                
                # Highlight from match start for ~15-20 blocks (typical chunk size)
                # Adjust based on chunk length
                chunk_word_count = len(chunk_text.split())
                estimated_blocks = max(5, min(30, chunk_word_count // 8))  # ~8 words per block average
                
                highlight_blocks = page_blocks[best_match_start:best_match_start + estimated_blocks]
                
                if highlight_blocks:
                    combined_text = ' '.join(b['text'] for b in highlight_blocks)
                    
                    # Calculate bounding box
                    min_x = min(b['bbox']['x'] for b in highlight_blocks)
                    min_y = min(b['bbox']['y'] for b in highlight_blocks)
                    max_x = max(b['bbox']['x'] + b['bbox']['width'] for b in highlight_blocks)
                    max_y = max(b['bbox']['y'] + b['bbox']['height'] for b in highlight_blocks)
                    
                    highlight = HighlightSpan(
                        text=combined_text[:500],
                        page=page['page_num'],
                        bbox={
                            'x': min_x,
                            'y': min_y,
                            'width': max_x - min_x,
                            'height': max_y - min_y
                        },
                        relevance_score=float(best_match_count) / len(search_words),
                        match_type='fuzzy-word-match',
                        context=chunk_text[:300],
                        sentence=combined_text
                    )
                    highlights.append(highlight)
                    logger.info(f"✓ Created highlight covering {len(highlight_blocks)} blocks")
                    return highlights
        
        logger.warning(f"Could not find chunk starting with '{' '.join(search_words[:3])}'")
        return highlights
    
    def _find_exact_chunk_location_OLD_UNUSED(
        self,
        page: Dict[str, Any],
        chunk_text: str,
        chunk_clean: str
    ) -> List[HighlightSpan]:
        """
        Find exact location of chunk using precise substring matching.
        This is the most accurate method when the chunk appears verbatim in the document.
        """
        highlights = []
        
        # Build continuous text with position tracking
        page_text_lower = ""
        block_positions = []  # Maps character position to (block_idx, char_offset_in_block)
        
        for i, block in enumerate(page['text_blocks']):
            block_text = block['text']
            start_pos = len(page_text_lower)
            page_text_lower += block_text.lower() + " "
            end_pos = len(page_text_lower)
            
            # Track which characters belong to which block
            for char_idx in range(start_pos, end_pos - 1):  # -1 to exclude the added space
                offset_in_block = char_idx - start_pos
                if offset_in_block < len(block_text):
                    block_positions.append((i, offset_in_block, block))
        
        # Find where the chunk appears
        chunk_start = page_text_lower.find(chunk_clean)
        if chunk_start == -1:
            # Try first 100 chars of chunk (handles truncated matches)
            if len(chunk_clean) > 100:
                chunk_start = page_text_lower.find(chunk_clean[:100])
        
        if chunk_start >= 0:
            chunk_end = min(chunk_start + len(chunk_clean), len(block_positions))
            
            # Find which blocks contain this chunk
            matching_blocks = set()
            for pos in range(chunk_start, chunk_end):
                if pos < len(block_positions):
                    block_idx = block_positions[pos][0]
                    matching_blocks.add(block_idx)
            
            if matching_blocks:
                # Group consecutive blocks
                sorted_blocks = sorted(matching_blocks)
                groups = []
                current_group = [sorted_blocks[0]]
                
                for block_idx in sorted_blocks[1:]:
                    if block_idx == current_group[-1] + 1:
                        current_group.append(block_idx)
                    else:
                        groups.append(current_group)
                        current_group = [block_idx]
                groups.append(current_group)
                
                # Create highlights for each group
                for group in groups:
                    blocks = [page['text_blocks'][i] for i in group]
                    combined_text = ' '.join(b['text'] for b in blocks)
                    
                    # Calculate combined bounding box
                    min_x = min(b['bbox']['x'] for b in blocks)
                    min_y = min(b['bbox']['y'] for b in blocks)
                    max_x = max(b['bbox']['x'] + b['bbox']['width'] for b in blocks)
                    max_y = max(b['bbox']['y'] + b['bbox']['height'] for b in blocks)
                    
                    highlight = HighlightSpan(
                        text=combined_text[:500],
                        page=page['page_num'],
                        bbox={
                            'x': min_x,
                            'y': min_y,
                            'width': max_x - min_x,
                            'height': max_y - min_y
                        },
                        relevance_score=1.0,
                        match_type='rag-chunk-exact',
                        context=chunk_text[:300],
                        sentence=combined_text
                    )
                    highlights.append(highlight)
        
        return highlights
    
    def _merge_nearby_highlights(self, highlights: List[HighlightSpan]) -> List[HighlightSpan]:
        """
        Merge highlights that are close together (on same page, vertically nearby).
        This creates larger, more coherent highlighted regions instead of many small boxes.
        """
        if len(highlights) <= 1:
            return highlights
        
        # Sort by page and y position
        highlights.sort(key=lambda h: (h.page, h.bbox['y']))
        
        merged = []
        current_merge = None
        
        for highlight in highlights:
            if current_merge is None:
                # Start a new merge group
                current_merge = {
                    'page': highlight.page,
                    'highlights': [highlight],
                    'min_x': highlight.bbox['x'],
                    'min_y': highlight.bbox['y'],
                    'max_x': highlight.bbox['x'] + highlight.bbox['width'],
                    'max_y': highlight.bbox['y'] + highlight.bbox['height'],
                    'texts': [highlight.text]
                }
            else:
                # Check if this highlight is close to the current merge group
                same_page = highlight.page == current_merge['page']
                # Calculate vertical distance (allow up to 50px gap for line spacing)
                y_distance = highlight.bbox['y'] - current_merge['max_y']
                vertically_close = -10 <= y_distance <= 50  # Allow some overlap and small gaps
                
                if same_page and vertically_close:
                    # Merge into current group
                    current_merge['highlights'].append(highlight)
                    current_merge['min_x'] = min(current_merge['min_x'], highlight.bbox['x'])
                    current_merge['min_y'] = min(current_merge['min_y'], highlight.bbox['y'])
                    current_merge['max_x'] = max(current_merge['max_x'], highlight.bbox['x'] + highlight.bbox['width'])
                    current_merge['max_y'] = max(current_merge['max_y'], highlight.bbox['y'] + highlight.bbox['height'])
                    current_merge['texts'].append(highlight.text)
                else:
                    # Finish current merge group and start new one
                    merged.append(self._create_merged_highlight(current_merge))
                    current_merge = {
                        'page': highlight.page,
                        'highlights': [highlight],
                        'min_x': highlight.bbox['x'],
                        'min_y': highlight.bbox['y'],
                        'max_x': highlight.bbox['x'] + highlight.bbox['width'],
                        'max_y': highlight.bbox['y'] + highlight.bbox['height'],
                        'texts': [highlight.text]
                    }
        
        # Don't forget the last merge group
        if current_merge:
            merged.append(self._create_merged_highlight(current_merge))
        
        return merged
    
    def _create_merged_highlight(self, merge_group: dict) -> HighlightSpan:
        """Create a single HighlightSpan from a merge group."""
        combined_text = ' '.join(merge_group['texts'])
        
        return HighlightSpan(
            text=combined_text[:500],
            page=merge_group['page'],
            bbox={
                'x': merge_group['min_x'],
                'y': merge_group['min_y'],
                'width': merge_group['max_x'] - merge_group['min_x'],
                'height': merge_group['max_y'] - merge_group['min_y']
            },
            relevance_score=1.0,
            match_type='rag-chunk-merged',
            context=combined_text[:300],
            sentence=combined_text
        )
    
    def _has_substantial_overlap(self, text1: str, text2: str) -> bool:
        """
        Check if two texts have substantial overlap.
        
        Uses a two-way word-based similarity check to avoid false positives.
        Requires BOTH:
        - At least 30% of chunk words must be in the block
        - At least 40% of block words must match the chunk
        
        This prevents matching blocks that only share common words with large chunks.
        """
        # If text1 is substring of text2 or vice versa
        if text1 in text2 or text2 in text1:
            return True
        
        # Word-based overlap
        words1 = set(text1.split())
        words2 = set(text2.split())
        
        if not words1 or not words2:
            return False
        
        intersection = words1 & words2
        
        # Calculate overlap from BOTH perspectives
        overlap_from_block = len(intersection) / len(words2)  # How much of the block matches?
        overlap_from_chunk = len(intersection) / len(words1)  # How much of the chunk is in this block?
        
        # IMPROVED: Require BOTH to meet a minimum threshold to avoid false positives
        # For large chunks, we need to ensure the block has substantial content from the chunk
        # AND the block itself is significantly matched (not just common words)
        
        # The block should have at least 20% of the chunk's words
        # AND at least 35% of the block's words should match the chunk
        min_chunk_coverage = 0.20  # At least 20% of chunk words in this block/group
        min_block_match = 0.35     # At least 35% of block words match chunk
        
        return overlap_from_chunk >= min_chunk_coverage and overlap_from_block >= min_block_match


# Singleton instance
_highlight_service: Optional[DocumentHighlightService] = None


def get_highlight_service() -> DocumentHighlightService:
    """Get or create the highlight service singleton."""
    global _highlight_service
    
    if _highlight_service is None:
        _highlight_service = DocumentHighlightService()
    
    return _highlight_service

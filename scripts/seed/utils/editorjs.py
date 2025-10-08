"""
EditorJS content generation utilities.

Helper functions to create EditorJS blocks programmatically.
"""

from datetime import datetime
from typing import List, Dict, Optional


def create_header(text: str, level: int = 2) -> Dict:
    """Create an EditorJS header block."""
    return {
        "type": "header",
        "data": {
            "text": text,
            "level": level
        }
    }


def create_paragraph(text: str) -> Dict:
    """Create an EditorJS paragraph block."""
    return {
        "type": "paragraph",
        "data": {
            "text": text
        }
    }


def create_list(items: List[str], style: str = "unordered") -> Dict:
    """Create an EditorJS list block."""
    return {
        "type": "list",
        "data": {
            "style": style,  # "unordered" or "ordered"
            "items": items
        }
    }


def create_image(url: str, caption: str = "", size: str = "small", 
                 with_border: bool = False, with_background: bool = False) -> Dict:
    """Create an EditorJS image block."""
    return {
        "type": "image",
        "data": {
            "url": url,
            "caption": caption,
            "size": size,
            "withBorder": with_border,
            "withBackground": with_background,
            "stretched": False
        }
    }


def create_table(content: List[List[str]], with_headings: bool = True) -> Dict:
    """Create an EditorJS table block."""
    return {
        "type": "table",
        "data": {
            "withHeadings": with_headings,
            "content": content
        }
    }


def create_quote(text: str, caption: str = "") -> Dict:
    """Create an EditorJS quote block."""
    return {
        "type": "quote",
        "data": {
            "text": text,
            "caption": caption
        }
    }


def create_code(code: str) -> Dict:
    """Create an EditorJS code block."""
    return {
        "type": "code",
        "data": {
            "code": code
        }
    }


def editorjs_note(title: str, paragraphs: List[str], 
                  bullets: Optional[List[str]] = None) -> Dict:
    """
    Create a simple EditorJS note with title, paragraphs, and optional bullets.
    
    This is a convenience function for simple notes.
    For complex notes, build blocks manually or use JSON.
    """
    blocks = [create_header(title, level=2)]
    
    for p in paragraphs:
        blocks.append(create_paragraph(p))
    
    if bullets:
        blocks.append(create_list(bullets))
    
    return {
        "time": int(datetime.utcnow().timestamp() * 1000),
        "blocks": blocks,
        "version": "2.29.0"
    }


def create_note_link(note_id: str, text: str) -> str:
    """Create an internal note link HTML string."""
    return f'<a href="#note:{note_id}" class="note-link" data-note-id="{note_id}">{text}</a>'


def create_external_link(url: str, text: str) -> str:
    """Create an external link HTML string."""
    return f'<a href="{url}" target="_blank" rel="noopener">{text}</a>'

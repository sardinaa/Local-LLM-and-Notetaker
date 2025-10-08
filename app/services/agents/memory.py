"""
Conversation Memory Management

Handles conversation context and memory for multi-turn interactions.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from .base import MemoryConfig

logger = logging.getLogger(__name__)


class ConversationMemory:
    """Manages conversation history and context."""
    
    def __init__(self, config: MemoryConfig):
        """
        Initialize conversation memory.
        
        Args:
            config: Memory configuration
        """
        self.config = config
    
    def format_history(
        self,
        messages: List[Dict[str, Any]],
        max_messages: Optional[int] = None
    ) -> str:
        """
        Format conversation history for inclusion in prompts.
        
        Args:
            messages: List of message dicts with 'text', 'sender', optional 'timestamp'
            max_messages: Override config max_history
            
        Returns:
            str: Formatted conversation history
        """
        if not self.config.enabled or not messages:
            return ""
        
        # Use provided max or config default
        max_msgs = max_messages or self.config.max_history
        
        # Get recent messages
        recent_messages = messages[-max_msgs:] if len(messages) > max_msgs else messages
        
        # Format each message
        formatted_lines = []
        for msg in recent_messages:
            sender = msg.get('sender', 'unknown')
            text = msg.get('text', '')
            
            # Determine role label
            if sender == 'user':
                role = "User"
            elif sender == 'bot' or sender == 'assistant':
                role = "Assistant"
            else:
                role = sender.capitalize()
            
            # Add timestamp if configured and available
            if self.config.include_timestamps and 'timestamp' in msg:
                timestamp = msg['timestamp']
                formatted_lines.append(f"[{timestamp}] {role}: {text}")
            else:
                formatted_lines.append(f"{role}: {text}")
        
        return "\n".join(formatted_lines)
    
    def build_context_with_memory(
        self,
        retrieved_context: str,
        conversation_history: List[Dict[str, Any]],
        current_query: str
    ) -> Dict[str, str]:
        """
        Build complete context including retrieved docs and conversation history.
        
        Args:
            retrieved_context: Context from document retrieval
            conversation_history: Recent conversation messages
            current_query: Current user query
            
        Returns:
            Dict with 'document_context', 'conversation_context', 'query'
        """
        # Format conversation history
        conversation_text = self.format_history(conversation_history)
        
        return {
            "document_context": retrieved_context,
            "conversation_context": conversation_text,
            "query": current_query,
        }
    
    def should_include_memory(self) -> bool:
        """Check if memory should be included."""
        return self.config.enabled
    
    def get_max_history(self) -> int:
        """Get configured max history."""
        return self.config.max_history


def extract_recent_messages(
    chat_messages: List[Dict[str, Any]],
    max_messages: int = 5
) -> List[Dict[str, Any]]:
    """
    Extract recent messages from chat history.
    
    Args:
        chat_messages: Full chat message history
        max_messages: Number of recent messages to extract
        
    Returns:
        List of recent messages
    """
    if not chat_messages:
        return []
    
    return chat_messages[-max_messages:] if len(chat_messages) > max_messages else chat_messages

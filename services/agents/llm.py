"""
LLM Integration for Chat Agents

Handles LLM interaction for generating responses with context and memory.
"""

import logging
import json
from typing import Dict, Any, List, Optional, Generator

from .base import AgentConfig
from .memory import ConversationMemory

logger = logging.getLogger(__name__)

# Try to import Ollama
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    logger.warning("requests library not available")


class LLMError(Exception):
    """Base exception for LLM errors."""
    pass


class ChatLLM:
    """
    Handles LLM interactions for chat agents.
    """
    
    def __init__(
        self,
        ollama_url: str = "http://127.0.0.1:11434",
        default_model: str = "llama3.2:3b"
    ):
        """
        Initialize LLM integration.
        
        Args:
            ollama_url: Ollama API URL
            default_model: Default model to use
        """
        if not REQUESTS_AVAILABLE:
            raise RuntimeError("requests library not available")
        
        self.ollama_url = ollama_url.rstrip('/')
        self.default_model = default_model
        
        logger.info(f"Initialized ChatLLM with model: {default_model}")
    
    def generate_response(
        self,
        query: str,
        document_context: str,
        conversation_history: List[Dict[str, Any]],
        agent_config: AgentConfig,
        model: Optional[str] = None
    ) -> str:
        """
        Generate response using LLM with context and memory.
        
        Args:
            query: User query
            document_context: Retrieved document context
            conversation_history: Recent conversation messages
            agent_config: Agent configuration
            model: Optional model override
            
        Returns:
            str: Generated response
        """
        # Build prompt with context
        prompt = self._build_prompt(
            query=query,
            document_context=document_context,
            conversation_history=conversation_history,
            agent_config=agent_config
        )
        
        # Call Ollama
        model_to_use = model or self.default_model
        
        try:
            response = self._call_ollama(
                prompt=prompt,
                model=model_to_use,
                temperature=agent_config.temperature,
                max_tokens=agent_config.max_tokens,
                stream=False
            )
            
            return response
            
        except Exception as e:
            logger.error(f"Failed to generate response: {e}")
            raise LLMError(f"Failed to generate response: {str(e)}")
    
    def generate_response_stream(
        self,
        query: str,
        document_context: str,
        conversation_history: List[Dict[str, Any]],
        agent_config: AgentConfig,
        model: Optional[str] = None
    ) -> Generator[str, None, None]:
        """
        Generate streaming response using LLM.
        
        Args:
            query: User query
            document_context: Retrieved document context
            conversation_history: Recent conversation messages
            agent_config: Agent configuration
            model: Optional model override
            
        Yields:
            str: Response chunks
        """
        # Build prompt
        prompt = self._build_prompt(
            query=query,
            document_context=document_context,
            conversation_history=conversation_history,
            agent_config=agent_config
        )
        
        # Call Ollama with streaming
        model_to_use = model or self.default_model
        
        try:
            yield from self._call_ollama_stream(
                prompt=prompt,
                model=model_to_use,
                temperature=agent_config.temperature,
                max_tokens=agent_config.max_tokens
            )
        except Exception as e:
            logger.error(f"Failed to generate streaming response: {e}")
            yield f"Error: {str(e)}"
    
    def _build_prompt(
        self,
        query: str,
        document_context: str,
        conversation_history: List[Dict[str, Any]],
        agent_config: AgentConfig
    ) -> str:
        """
        Build complete prompt with system instructions, context, and history.
        
        Args:
            query: User query
            document_context: Retrieved document context
            conversation_history: Recent conversation messages
            agent_config: Agent configuration
            
        Returns:
            str: Complete prompt
        """
        parts = []
        
        # System role/instructions
        if agent_config.role_prompt:
            parts.append(f"SYSTEM INSTRUCTIONS:\n{agent_config.role_prompt}\n")
        
        # Document context
        if document_context and document_context != "No relevant context found.":
            parts.append(f"RELEVANT CONTEXT FROM DOCUMENTS:\n{document_context}\n")
        
        # Conversation history
        if agent_config.memory.enabled and conversation_history:
            memory = ConversationMemory(agent_config.memory)
            history_text = memory.format_history(conversation_history)
            if history_text:
                parts.append(f"CONVERSATION HISTORY:\n{history_text}\n")
        
        # Current query
        parts.append(f"CURRENT QUESTION:\n{query}\n")
        
        # Assembly instruction
        parts.append(
            "INSTRUCTIONS:\nAnswer the question based on the provided context and conversation history. "
            "Be concise, accurate, and cite sources when relevant. "
            "If the context doesn't contain enough information to answer fully, say so clearly."
        )
        
        return "\n".join(parts)
    
    def _call_ollama(
        self,
        prompt: str,
        model: str,
        temperature: float,
        max_tokens: int,
        stream: bool = False
    ) -> str:
        """
        Call Ollama API for text generation.
        
        Args:
            prompt: Input prompt
            model: Model name
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            stream: Whether to stream response
            
        Returns:
            str: Generated text
        """
        url = f"{self.ollama_url}/api/generate"
        
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": stream,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        try:
            response = requests.post(url, json=payload, timeout=120)
            response.raise_for_status()
            
            result = response.json()
            return result.get("response", "")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Ollama API request failed: {e}")
            raise LLMError(f"API request failed: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error calling Ollama: {e}")
            raise LLMError(f"Unexpected error: {str(e)}")
    
    def _call_ollama_stream(
        self,
        prompt: str,
        model: str,
        temperature: float,
        max_tokens: int
    ) -> Generator[str, None, None]:
        """
        Call Ollama API with streaming.
        
        Args:
            prompt: Input prompt
            model: Model name
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            
        Yields:
            str: Response chunks
        """
        url = f"{self.ollama_url}/api/generate"
        
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        try:
            response = requests.post(url, json=payload, stream=True, timeout=120)
            response.raise_for_status()
            
            for line in response.iter_lines():
                if line:
                    try:
                        chunk = json.loads(line)
                        if "response" in chunk:
                            yield chunk["response"]
                    except json.JSONDecodeError:
                        continue
                        
        except requests.exceptions.RequestException as e:
            logger.error(f"Ollama streaming request failed: {e}")
            raise LLMError(f"Streaming request failed: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error in streaming: {e}")
            raise LLMError(f"Unexpected error: {str(e)}")
    
    def is_available(self) -> bool:
        """Check if Ollama is available."""
        try:
            response = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            return response.status_code == 200
        except:
            return False

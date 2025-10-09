"""
Chat History Manager using LangChain for context-aware conversations
"""

from langchain_ollama import OllamaLLM
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.chat_history import BaseChatMessageHistory, InMemoryChatMessageHistory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from typing import List, Dict, Any, Generator, Optional
import json
import logging
import requests
import re
import asyncio
from app.config.search_config import SearchConfig
from app.integrations.search_engines.multi_engine import MultiEngineSearch

logger = logging.getLogger(__name__)

class ChatHistoryManager:
    """Manages chat history and context using LangChain memory systems."""
    
    def __init__(self, 
                 model_name: str = None,  # Will use environment variable if None
                 ollama_base_url: str = "http://127.0.0.1:11434",
                 max_messages: int = 20,
                 enable_web_search: bool = True):
        """
        Initialize the chat history manager.
        
        Args:
            model_name: Name of the Ollama model to use (None to use env var)
            ollama_base_url: Base URL for Ollama API
            max_messages: Maximum number of messages to keep in memory
            enable_web_search: Whether to enable automatic web search
        """
        import os
        self.model_name = model_name or os.getenv('COMPOSE_MODEL', 'llama3.2:1b')
        self.ollama_base_url = ollama_base_url
        self.max_messages = max_messages
        self.enable_web_search = enable_web_search
        
        # Initialize Ollama LLM
        self.llm = OllamaLLM(
            model=self.model_name,
            base_url=ollama_base_url,
            temperature=0.7
        )
        
        # Store chat histories for different chat sessions
        self.chat_histories: Dict[str, InMemoryChatMessageHistory] = {}
        
        # Initialize multi-engine search (all free!)
        self.multi_search = MultiEngineSearch(
            brave_api_key=SearchConfig.BRAVE_API_KEY,
            mojeek_api_key=SearchConfig.MOJEEK_API_KEY,
            searxng_url=SearchConfig.SEARXNG_URL,
            yacy_url=SearchConfig.YACY_URL,
            enable_qwant=SearchConfig.ENABLE_QWANT,
            enable_fallback=SearchConfig.ENABLE_FALLBACK,
            domain_filter_list=SearchConfig.DOMAIN_FILTER_LIST,
            concurrent_requests=SearchConfig.CONCURRENT_REQUESTS,
            result_count=SearchConfig.DEFAULT_RESULT_COUNT
        )
        
        # Log available search engines
        available_engines = SearchConfig.get_available_engines()
        logger.info(f"Chat initialized with search engines: {available_engines}")
        
        # Chat prompt template
        self.prompt_template = ChatPromptTemplate.from_messages([
            ("system", (
                "You are a helpful AI assistant. Use the conversation history to provide contextual and relevant responses. "
                "When writing mathematical expressions, format them in LaTeX and wrap inline math with $...$ and display math with $$...$$. "
                "Use proper LaTeX operators (e.g., \\sum_{t=1}^{T}, subscripts with _ and superscripts with ^)."
            )),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{input}")
        ])
        
        # Web search is now controlled by the user via UI toggle button
        # No automatic pattern matching - user decides when to search
    
    def get_or_create_history(self, chat_id: str) -> InMemoryChatMessageHistory:
        """
        Get or create a chat history for a specific chat ID.
        
        Args:
            chat_id: Unique identifier for the chat session
            
        Returns:
            InMemoryChatMessageHistory: The chat history for this session
        """
        if chat_id not in self.chat_histories:
            self.chat_histories[chat_id] = InMemoryChatMessageHistory()
            logger.info(f"Created new chat history for chat_id: {chat_id}")
        
        return self.chat_histories[chat_id]
    
    def load_chat_history(self, chat_id: str, messages: List[Dict[str, Any]]) -> None:
        """
        Load existing chat history into the memory system.
        
        Args:
            chat_id: Unique identifier for the chat session
            messages: List of message dictionaries with 'role' and 'content' keys
        """
        history = self.get_or_create_history(chat_id)
        
        # Clear existing history
        history.clear()
        
        # Add messages to history
        for message in messages:
            role = message.get('role', 'user')
            content = message.get('content', '')
            
            if role == 'user':
                history.add_user_message(content)
            elif role == 'assistant':
                history.add_ai_message(content)
        
        # Keep only the last max_messages messages
        if len(history.messages) > self.max_messages:
            history.messages = history.messages[-self.max_messages:]
        
        logger.info(f"Loaded {len(messages)} messages into chat_id: {chat_id}")
    
    def should_search_web(self, user_input: str, force_search: bool = False) -> bool:
        """
        Determine if web search should be performed for this query.
        
        SIMPLIFIED: Now primarily controlled by force_search toggle.
        The user decides when they want web search via the UI button.
        
        Args:
            user_input: The user's input message
            force_search: Whether to force web search (from UI toggle button)
            
        Returns:
            bool: True if web search should be performed
        """
        # User explicitly requested web search via UI toggle
        if force_search:
            logger.info("✓ Web search ENABLED by user (force_search=True)")
            return True
        
        # Global web search toggle is off
        if not self.enable_web_search:
            logger.info("✗ Web search DISABLED (enable_web_search=False)")
            return False
        
        # By default, don't auto-trigger web search
        # User should use the web search toggle button in the UI
        logger.info("✗ Web search NOT triggered (use web search toggle button)")
        return False
    
    async def perform_web_search(self, query: str, min_results: int = 2, max_results: int = 5) -> List[Dict[str, str]]:
        """
        Perform web search using multi-engine approach with automatic fallback.
        All engines are FREE to use!
        
        Args:
            query: Search query
            min_results: Minimum results needed
            max_results: Maximum number of results
            
        Returns:
            List of search results with engine info
        """
        try:
            # Use multi-engine search with automatic fallback
            results, engine_used = await self.multi_search.search(
                query,
                max_results=max_results,
                min_results=min_results
            )
            
            logger.info(f"Web search found {len(results)} results using {engine_used} for query: {query}")
            
            # Add metadata about which engine was used
            for result in results:
                result['search_engine'] = engine_used
            
            return results
            
        except Exception as e:
            logger.error(f"Multi-engine search failed for query '{query}': {e}")
            return []
    
    def format_web_search_context(self, search_results: List[Dict[str, str]], query: str) -> str:
        """
        Format web search results into context for the LLM.
        
        Args:
            search_results: List of search result documents
            query: Original search query
            
        Returns:
            Formatted context string
        """
        if not search_results:
            return f"No web search results found for: {query}"
        
        context = f"Web Search Results for '{query}' (sorted by quality):\n\n"
        
        for i, doc in enumerate(search_results, 1):
            # Truncate content to prevent context overflow
            content = doc['text'][:1000] + "..." if len(doc['text']) > 1000 else doc['text']
            quality_score = doc.get('quality_score', 0.5)
            
            context += f"Source {i} (Quality: {quality_score:.1f}/1.0): {doc['title']}\n"
            context += f"URL: {doc['url']}\n"
            context += f"Content: {content}\n\n"
        
        context += "Please use this current information to answer the user's question accurately. "
        context += "IMPORTANT: At the end of your response, include a 'Sources:' section that lists "
        context += "the relevant sources you used, with their titles and URLs in a readable format.\n\n"
        return context
    
    def get_response(self, chat_id: str, user_input: str, model_name: Optional[str] = None, force_search: bool = False) -> str:
        """
        Get a response from the LLM with context awareness and automatic web search.
        
        Args:
            chat_id: Unique identifier for the chat session
            user_input: The user's input message
            model_name: Optional model name to use for this request
            force_search: Whether to force web search regardless of content
            
        Returns:
            str: The AI's response
        """
        history = self.get_or_create_history(chat_id)
        
        # Use specified model or default model
        current_model = model_name or self.model_name
        
        try:
            # Check if web search is needed
            search_context = ""
            should_search = self.should_search_web(user_input, force_search)
            
            if should_search:
                search_type = "forced" if force_search else "automatic"
                logger.info(f"Performing {search_type} web search for query: {user_input}")
                
                # Run async web search in sync context
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    search_results = loop.run_until_complete(
                        self.perform_web_search(user_input, min_results=2, max_results=6)
                    )
                    search_context = self.format_web_search_context(search_results, user_input)
                finally:
                    loop.close()
            
            # Create the prompt with history and search context
            context_messages = []
            
            # Add system message
            system_content = (
                "You are a helpful AI assistant. Use the conversation history to provide contextual and relevant responses. "
                "When writing mathematical expressions, format them in LaTeX and wrap inline math with $...$ and display math with $$...$$. "
                "Use proper LaTeX operators (e.g., \\sum_{t=1}^{T}, subscripts with _ and superscripts with ^)."
            )
            if search_context:
                system_content += f"\n\n{search_context}"
            if force_search:
                system_content += "\n\nWhen web search is forced: strictly incorporate results into your answer. If no credible sources are found, clearly say so and avoid speculation. Always include a final 'Sources:' section with the links you used."
            context_messages.append(f"System: {system_content}")
            
            # Add conversation history
            for msg in history.messages:
                if hasattr(msg, 'content'):
                    if msg.type == 'human':
                        context_messages.append(f"Human: {msg.content}")
                    elif msg.type == 'ai':
                        context_messages.append(f"Assistant: {msg.content}")
            
            # Add current input
            context_messages.append(f"Human: {user_input}")
            context_messages.append("Assistant: ")
            
            prompt_str = "\n".join(context_messages)
            
            # If using a different model, create a temporary LLM instance
            if model_name and model_name != self.model_name:
                temp_llm = OllamaLLM(
                    model=current_model,
                    base_url=self.ollama_base_url,
                    temperature=0.7
                )
                response = temp_llm.invoke(prompt_str)
            else:
                # Get response from default LLM
                response = self.llm.invoke(prompt_str)
            
            # Add to history
            history.add_user_message(user_input)
            history.add_ai_message(response)
            
            # Keep only the last max_messages messages
            if len(history.messages) > self.max_messages:
                history.messages = history.messages[-self.max_messages:]
            
            logger.info(f"Generated response for chat_id: {chat_id} using model: {current_model}")
            return response
            
        except Exception as e:
            logger.error(f"Error generating response for chat_id {chat_id}: {e}")
            return "I apologize, but I encountered an error while processing your request."
    
    def get_response_stream(self, chat_id: str, user_input: str, model_name: Optional[str] = None, force_search: bool = False) -> Generator[str, None, None]:
        """
        Get a streaming response from the LLM with context awareness and automatic web search.
        
        Args:
            chat_id: Unique identifier for the chat session
            user_input: The user's input message
            model_name: Optional model name to use for this request
            force_search: Whether to force web search regardless of content
            
        Yields:
            str: Chunks of the AI's response
        """
        history = self.get_or_create_history(chat_id)
        
        # Use specified model or default model
        current_model = model_name or self.model_name
        
        # Check if web search is needed and perform it
        search_context = ""
        search_results = []  # Store results to yield at the end
        should_search = self.should_search_web(user_input, force_search)
        
        if should_search:
            search_type = "Manual" if force_search else "Auto"
            logger.info(f"Performing {search_type.lower()} web search for streaming query: {user_input}")
            
            # Run async web search in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                search_results = loop.run_until_complete(
                    self.perform_web_search(user_input, min_results=2, max_results=6)
                )
                search_context = self.format_web_search_context(search_results, user_input)
                    
            except Exception as e:
                logger.error(f"Web search failed in streaming: {e}")
                search_results = []  # Reset on error
            finally:
                loop.close()
        
        # Build context from history and search results
        context = ""
        
        # Add search context if available
        if search_context:
            context += f"{search_context}\n\n"
        
        # Add conversation history
        for msg in history.messages[-10:]:  # Use last 10 messages for context
            if isinstance(msg, HumanMessage):
                context += f"Human: {msg.content}\n"
            elif isinstance(msg, AIMessage):
                context += f"Assistant: {msg.content}\n"
        
        # Build the full prompt with context
        system_prompt = (
            "You are a helpful AI assistant. Use the conversation history and any provided web search results to provide contextual, accurate, and up-to-date responses. "
            "When writing mathematical expressions, use LaTeX and wrap inline math with $...$ and display math with $$...$$; use proper operators like \\sum_{t=1}^{T}, subscripts with _ and superscripts with ^."
        )
        if force_search:
            system_prompt += " When web search is forced: strictly incorporate results into your answer; if results are empty or low-confidence, explicitly say so and avoid relying on prior knowledge; end with a 'Sources:' section listing the links used."
        
        full_prompt = f"""{system_prompt}

{context}

Current Question: {user_input}

Response:"""
        
        try:
            # Make direct request to Ollama for streaming
            response = requests.post(
                f"{self.ollama_base_url}/api/generate",
                json={
                    "model": current_model,
                    "prompt": full_prompt,
                    "stream": True
                },
                stream=True,
                timeout=100
            )
            
            full_response = ""
            for line in response.iter_lines():
                if line:
                    try:
                        json_response = json.loads(line.decode('utf-8'))
                        if 'response' in json_response:
                            chunk = json_response['response']
                            full_response += chunk
                            yield chunk
                        
                        if json_response.get('done', False):
                            # Add the complete interaction to history
                            history.add_user_message(user_input)
                            history.add_ai_message(full_response)
                            
                            # Keep only the last max_messages messages
                            if len(history.messages) > self.max_messages:
                                history.messages = history.messages[-self.max_messages:]
                            
                            # Yield sources metadata if web search was performed
                            if search_results:
                                logger.info(f"Yielding {len(search_results)} web search sources")
                                # Format sources for frontend
                                formatted_sources = [
                                    {
                                        "title": result.get("title", "Unknown"),
                                        "url": result.get("url", ""),
                                        "source_type": "web",
                                        "text": result.get("content", "")[:500]  # First 500 chars
                                    }
                                    for result in search_results
                                ]
                                yield json.dumps({"__sources__": formatted_sources})
                            
                            break
                    except json.JSONDecodeError:
                        continue
                        
        except Exception as e:
            logger.error(f"Error in streaming response for chat_id {chat_id}: {e}")
            yield "I apologize, but I encountered an error while processing your request."
    
    def get_chat_summary(self, chat_id: str) -> str:
        """
        Get a summary of the chat conversation.
        
        Args:
            chat_id: Unique identifier for the chat session
            
        Returns:
            str: Summary of the conversation
        """
        if chat_id not in self.chat_histories:
            return "No conversation history found."
        
        history = self.chat_histories[chat_id]
        
        if not history.messages:
            return "No conversation history."
        
        message_count = len(history.messages)
        user_messages = sum(1 for msg in history.messages if isinstance(msg, HumanMessage))
        ai_messages = sum(1 for msg in history.messages if isinstance(msg, AIMessage))
        
        return f"Conversation with {message_count} messages ({user_messages} from user, {ai_messages} from assistant)."
    
    def clear_session(self, chat_id: str) -> bool:
        """
        Clear a specific chat session.
        
        Args:
            chat_id: Unique identifier for the chat session
            
        Returns:
            bool: True if session was cleared, False if not found
        """
        if chat_id in self.chat_histories:
            self.chat_histories[chat_id].clear()
            del self.chat_histories[chat_id]
            logger.info(f"Cleared session for chat_id: {chat_id}")
            return True
        return False
    
    def delete_chat_history(self, chat_id: str) -> bool:
        """
        Delete conversation history for a specific chat.
        
        Args:
            chat_id: Unique identifier for the chat session
            
        Returns:
            bool: True if history was deleted
        """
        if chat_id in self.chat_histories:
            del self.chat_histories[chat_id]
            logger.info(f"Deleted conversation history for chat_id: {chat_id}")
            return True
        return False
    
    def get_active_sessions(self) -> List[str]:
        """
        Get list of active chat session IDs.
        
        Returns:
            List[str]: List of active chat session IDs
        """
        return list(self.chat_histories.keys())

    def set_model(self, model_name: str) -> bool:
        """
        Change the model used for future responses.
        
        Args:
            model_name: Name of the Ollama model to use
            
        Returns:
            bool: True if model was changed successfully
        """
        try:
            self.model_name = model_name
            # Update the LLM instance
            self.llm = OllamaLLM(
                model=model_name,
                base_url=self.ollama_base_url,
                temperature=0.7
            )
            logger.info(f"Changed model to: {model_name}")
            return True
        except Exception as e:
            logger.error(f"Error changing model to {model_name}: {e}")
            return False

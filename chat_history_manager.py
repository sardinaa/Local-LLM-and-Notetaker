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

logger = logging.getLogger(__name__)

class ChatHistoryManager:
    """Manages chat history and context using LangChain memory systems."""
    
    def __init__(self, 
                 model_name: str = "llama3.2:1b",
                 ollama_base_url: str = "http://127.0.0.1:11434",
                 max_messages: int = 20,
                 enable_web_search: bool = True):
        """
        Initialize the chat history manager.
        
        Args:
            model_name: Name of the Ollama model to use
            ollama_base_url: Base URL for Ollama API
            max_messages: Maximum number of messages to keep in memory
            enable_web_search: Whether to enable automatic web search
        """
        self.model_name = model_name
        self.ollama_base_url = ollama_base_url
        self.max_messages = max_messages
        self.enable_web_search = enable_web_search
        
        # Initialize Ollama LLM
        self.llm = OllamaLLM(
            model=model_name,
            base_url=ollama_base_url,
            temperature=0.7
        )
        
        # Store chat histories for different chat sessions
        self.chat_histories: Dict[str, InMemoryChatMessageHistory] = {}
        
        # Chat prompt template
        self.prompt_template = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful AI assistant. Use the conversation history to provide contextual and relevant responses."),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{input}")
        ])
        
        # Web search keywords that indicate current/recent information is needed
        # More specific patterns to reduce false positives
        self.search_triggers = [
            # Time-sensitive terms
            r'\b(latest|recent|new|current|today|this\s+year|2024|2025|trending|updated|now)\b',
            r'\b(breaking|just\s+announced|just\s+released|just\s+published)\b',
            r'\b(news|events|headlines|updates)\b',
            
            # Market/financial data
            r'\b(stock\s+price|market\s+price|current\s+price|price\s+today)\b',
            r'\b(stock\s+market|cryptocurrency|bitcoin|exchange\s+rate)\b',
            
            # Weather and real-time data (enhanced)
            r'\b(weather|forecast|temperature|climate)\b',
            r'\b(tomorrow|today|this\s+week|next\s+week)\b.*\b(weather|temperature|rain|sunny|cloudy)\b',
            r'\bweather\s+in\s+\w+',
            r'\bforecast\s+for\s+\w+',
            r'\btemperature\s+in\s+\w+',
            
            # Current events and politics
            r'\b(election|political|government|policy|election\s+results)\b',
            r'\b(war|conflict|crisis|emergency|disaster)\b',
            
            # Recent research and discoveries
            r'\b(new\s+study|recent\s+research|latest\s+findings|breakthrough)\b',
            r'\b(published\s+today|just\s+discovered|new\s+discovery)\b',
            
            # Product releases and technology
            r'\b(just\s+launched|recently\s+released|new\s+version|update\s+available)\b',
            r'\b(software\s+update|new\s+feature|latest\s+version)\b',
            
            # Question patterns that often need current info
            r'\bwhat.{0,30}(happening|going\s+on|new|latest)\b',
            r'\bhow\s+much.{0,20}(cost|price|worth).{0,20}(today|now|currently)\b',
            r'\bwhen\s+did.{0,30}(happen|occur|release|announce)\b',
            
            # Time-based location queries
            r'\b(what|how).{0,20}(weather|temperature).{0,30}(tomorrow|today|tonight)\b',
            r'\b(will\s+it|is\s+it\s+going\s+to).{0,20}(rain|snow|storm|sunny)\b'
        ]
    
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
        Determine if the user input warrants a web search.
        
        Args:
            user_input: The user's input message
            force_search: Whether to force web search regardless of content
            
        Returns:
            bool: True if web search should be performed
        """
        # Force overrides global toggle
        if force_search:
            logger.info("Web search forced by user")
            return True
        
        if not self.enable_web_search:
            logger.info("Web search disabled")
            return False
        
        user_input_lower = user_input.lower()
        logger.info(f"Evaluating web search for input: '{user_input}'")
        
        # Check for search trigger patterns
        for pattern in self.search_triggers:
            if re.search(pattern, user_input_lower):
                logger.info(f"Web search triggered by pattern: {pattern}")
                return True
        
        # Check for question words that might need current info
        question_patterns = [
            # Weather and location-based queries
            r'\bwhat.{0,50}(weather|temperature|forecast).{0,50}(tomorrow|today|tonight|this week)',
            r'\bwhat.{0,50}(happening|new|latest)',
            r'\bhow.{0,50}(much|many).{0,20}(cost|price|worth)',
            r'\bwhen.{0,20}(did|will|was).{0,50}(released|launch|announce)',
            r'\bwhere.{0,20}(can|to).{0,30}(buy|find|get)',
            r'\bwho.{0,20}(won|elected|appointed|hired)',
            
            # Time-sensitive questions
            r'\b(what|when|how).{0,30}(tomorrow|today|tonight|this\s+week|next\s+week)',
            r'\b(will\s+it|is\s+it).{0,30}(rain|snow|storm|sunny|cloudy)',
            r'\bwhat.{0,20}(time|when).{0,30}(open|close|start|end)',
            
            # Location + temporal queries
            r'\b(weather|temperature|forecast)\s+in\s+\w+',
            r'\bin\s+\w+.{0,20}(tomorrow|today|tonight)',
            r'\b(what|how).{0,20}(is|will\s+be).{0,20}(the\s+weather|temperature)'
        ]
        
        for pattern in question_patterns:
            if re.search(pattern, user_input_lower):
                logger.info(f"Web search triggered by question pattern: {pattern}")
                return True
        
        logger.info("No web search patterns matched")
        return False
    
    async def perform_web_search(self, query: str, min_results: int = 2, max_results: int = 5) -> List[Dict[str, str]]:
        """
        Perform web search using the search pipeline.
        
        Args:
            query: Search query
            max_results: Maximum number of results
            
        Returns:
            List of search results
        """
        try:
            from search_pipeline import search_and_scrape
            documents = await search_and_scrape(query, max_results=max_results, min_results=min_results, min_words=100, min_quality_score=0.3, adaptive=True)
            logger.info(f"Web search found {len(documents)} results for query: {query}")
            return documents
        except ImportError:
            logger.warning("Web search not available: search_pipeline module not found")
            return []
        except Exception as e:
            logger.error(f"Web search failed for query '{query}': {e}")
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
            system_content = "You are a helpful AI assistant. Use the conversation history to provide contextual and relevant responses."
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
        system_prompt = "You are a helpful AI assistant. Use the conversation history and any provided web search results to provide contextual, accurate, and up-to-date responses."
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

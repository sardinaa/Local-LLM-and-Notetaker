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

logger = logging.getLogger(__name__)

class ChatHistoryManager:
    """Manages chat history and context using LangChain memory systems."""
    
    def __init__(self, 
                 model_name: str = "llama3.2:1b",
                 ollama_base_url: str = "http://127.0.0.1:11434",
                 max_messages: int = 20):
        """
        Initialize the chat history manager.
        
        Args:
            model_name: Name of the Ollama model to use
            ollama_base_url: Base URL for Ollama API
            max_messages: Maximum number of messages to keep in memory
        """
        self.model_name = model_name
        self.ollama_base_url = ollama_base_url
        self.max_messages = max_messages
        
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
    
    def get_response(self, chat_id: str, user_input: str, model_name: Optional[str] = None) -> str:
        """
        Get a response from the LLM with context awareness.
        
        Args:
            chat_id: Unique identifier for the chat session
            user_input: The user's input message
            model_name: Optional model name to use for this request
            
        Returns:
            str: The AI's response
        """
        history = self.get_or_create_history(chat_id)
        
        # Use specified model or default model
        current_model = model_name or self.model_name
        
        try:
            # Create the prompt with history
            formatted_prompt = self.prompt_template.format_messages(
                history=history.messages,
                input=user_input
            )
            
            # Convert to string format for Ollama
            prompt_str = ""
            for msg in formatted_prompt:
                if hasattr(msg, 'content'):
                    if msg.type == 'system':
                        prompt_str += f"System: {msg.content}\n"
                    elif msg.type == 'human':
                        prompt_str += f"Human: {msg.content}\n"
                    elif msg.type == 'ai':
                        prompt_str += f"Assistant: {msg.content}\n"
            
            prompt_str += "Assistant: "
            
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
    
    def get_response_stream(self, chat_id: str, user_input: str, model_name: Optional[str] = None) -> Generator[str, None, None]:
        """
        Get a streaming response from the LLM with context awareness.
        
        Args:
            chat_id: Unique identifier for the chat session
            user_input: The user's input message
            model_name: Optional model name to use for this request
            
        Yields:
            str: Chunks of the AI's response
        """
        history = self.get_or_create_history(chat_id)
        
        # Use specified model or default model
        current_model = model_name or self.model_name
        
        # Build context from history
        context = ""
        for msg in history.messages[-10:]:  # Use last 10 messages for context
            if isinstance(msg, HumanMessage):
                context += f"Human: {msg.content}\n"
            elif isinstance(msg, AIMessage):
                context += f"Assistant: {msg.content}\n"
        
        # Build the full prompt with context
        full_prompt = f"""You are a helpful AI assistant. Use the conversation history to provide contextual and relevant responses.

Conversation History:
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

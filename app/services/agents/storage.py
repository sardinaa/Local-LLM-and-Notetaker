"""
Agent Storage Management

Handles persistence and retrieval of agent configurations and metadata.
Keeps storage logic separate from business logic.
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path

from .base import AgentConfig, AgentScope

logger = logging.getLogger(__name__)


class AgentStorage:
    """Manages agent configuration persistence."""
    
    def __init__(self, storage_path: str = "data/config/agents"):
        """
        Initialize agent storage.
        
        Args:
            storage_path: Base directory for agent storage
        """
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Separate files for different agent types
        self.chat_agents_file = self.storage_path / "chat_agents.json"
        self.custom_agents_file = self.storage_path / "custom_agents.json"
        
        # Initialize files if they don't exist
        self._ensure_files()
    
    def _ensure_files(self):
        """Ensure storage files exist."""
        for file_path in [self.chat_agents_file, self.custom_agents_file]:
            if not file_path.exists():
                try:
                    with open(file_path, 'w') as f:
                        json.dump({}, f)
                except Exception as e:
                    logger.error(f"Failed to create {file_path}: {e}")
    
    def save_chat_agent(self, config: AgentConfig) -> bool:
        """
        Save chat-scoped agent configuration.
        
        Args:
            config: Agent configuration to save
            
        Returns:
            bool: True if successful
        """
        try:
            agents = self._load_json(self.chat_agents_file)
            agents[config.name] = config.to_dict()
            self._save_json(self.chat_agents_file, agents)
            logger.info(f"Saved chat agent: {config.name}")
            return True
        except Exception as e:
            logger.error(f"Failed to save chat agent {config.name}: {e}")
            return False
    
    def save_custom_agent(self, config: AgentConfig) -> bool:
        """
        Save custom persistent agent configuration.
        
        Args:
            config: Agent configuration to save
            
        Returns:
            bool: True if successful
        """
        try:
            agents = self._load_json(self.custom_agents_file)
            agents[config.name] = config.to_dict()
            self._save_json(self.custom_agents_file, agents)
            logger.info(f"Saved custom agent: {config.name}")
            return True
        except Exception as e:
            logger.error(f"Failed to save custom agent {config.name}: {e}")
            return False
    
    def load_chat_agent(self, name: str) -> Optional[AgentConfig]:
        """Load chat-scoped agent by name."""
        try:
            agents = self._load_json(self.chat_agents_file)
            if name in agents:
                return AgentConfig.from_dict(agents[name])
            return None
        except Exception as e:
            logger.error(f"Failed to load chat agent {name}: {e}")
            return None
    
    def load_custom_agent(self, name: str) -> Optional[AgentConfig]:
        """Load custom agent by name."""
        try:
            agents = self._load_json(self.custom_agents_file)
            if name in agents:
                return AgentConfig.from_dict(agents[name])
            return None
        except Exception as e:
            logger.error(f"Failed to load custom agent {name}: {e}")
            return None
    
    def load_chat_agent_by_chat_id(self, chat_id: str) -> Optional[AgentConfig]:
        """Load chat agent by its associated chat_id."""
        try:
            agents = self._load_json(self.chat_agents_file)
            for agent_data in agents.values():
                if agent_data.get("chat_id") == chat_id:
                    return AgentConfig.from_dict(agent_data)
            return None
        except Exception as e:
            logger.error(f"Failed to load chat agent for chat_id {chat_id}: {e}")
            return None
    
    def list_chat_agents(self) -> List[AgentConfig]:
        """List all chat-scoped agents."""
        try:
            agents = self._load_json(self.chat_agents_file)
            return [AgentConfig.from_dict(data) for data in agents.values()]
        except Exception as e:
            logger.error(f"Failed to list chat agents: {e}")
            return []
    
    def list_custom_agents(self) -> List[AgentConfig]:
        """List all custom agents."""
        try:
            agents = self._load_json(self.custom_agents_file)
            return [AgentConfig.from_dict(data) for data in agents.values()]
        except Exception as e:
            logger.error(f"Failed to list custom agents: {e}")
            return []
    
    def delete_chat_agent(self, name: str) -> bool:
        """Delete chat-scoped agent."""
        try:
            agents = self._load_json(self.chat_agents_file)
            if name in agents:
                del agents[name]
                self._save_json(self.chat_agents_file, agents)
                logger.info(f"Deleted chat agent: {name}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete chat agent {name}: {e}")
            return False
    
    def delete_custom_agent(self, name: str) -> bool:
        """Delete custom agent."""
        try:
            agents = self._load_json(self.custom_agents_file)
            if name in agents:
                del agents[name]
                self._save_json(self.custom_agents_file, agents)
                logger.info(f"Deleted custom agent: {name}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete custom agent {name}: {e}")
            return False
    
    def agent_exists(self, name: str, scope: AgentScope) -> bool:
        """Check if agent exists."""
        if scope == AgentScope.CHAT:
            return self.load_chat_agent(name) is not None
        else:
            return self.load_custom_agent(name) is not None
    
    def _load_json(self, file_path: Path) -> Dict[str, Any]:
        """Load JSON from file."""
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return {}
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON in {file_path}, returning empty dict")
            return {}
    
    def _save_json(self, file_path: Path, data: Dict[str, Any]):
        """Save JSON to file."""
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

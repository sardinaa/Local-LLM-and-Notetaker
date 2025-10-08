"""
ChatRepository: Handles all chat message operations.

Tables managed:
- chats: Chat message storage
- nodes: Chat node timestamps (via triggers)
"""

import logging
import sqlite3
import json
from typing import Dict, List
from .base import BaseRepository


class ChatRepository(BaseRepository):
    """Repository for chat message management."""

    def __init__(self, db_path: str):
        """
        Initialize the ChatRepository.

        Args:
            db_path: Path to the SQLite database file.
        """
        super().__init__(db_path)
        self.logger = logging.getLogger(__name__)

    # =========================
    # Chat Message Operations
    # =========================

    def save_chat_messages(self, node_id: str, messages: List[Dict]) -> bool:
        """
        Save or update chat messages.

        Args:
            node_id: ID of the chat node.
            messages: List of message dictionaries to save.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                messages_json = json.dumps(messages)
                
                # Check if chat already exists
                cursor = conn.execute("SELECT id FROM chats WHERE node_id = ?", (node_id,))
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing chat
                    conn.execute('''
                        UPDATE chats SET messages = ? WHERE node_id = ?
                    ''', (messages_json, node_id))
                else:
                    # Create new chat
                    conn.execute('''
                        INSERT INTO chats (id, node_id, messages)
                        VALUES (?, ?, ?)
                    ''', (node_id, node_id, messages_json))
                
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error saving chat messages: {e}")
            return False

    def get_chat_messages(self, node_id: str) -> List[Dict]:
        """
        Get chat messages by node ID.

        Args:
            node_id: ID of the chat node.

        Returns:
            List of message dictionaries, or empty list if not found.
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT messages FROM chats WHERE node_id = ?
                ''', (node_id,))
                row = cursor.fetchone()
                if row:
                    return json.loads(row['messages'])
                return []
        except sqlite3.Error as e:
            self.logger.error(f"Error getting chat messages: {e}")
            return []

    def touch_chat(self, node_id: str) -> bool:
        """
        Mark a chat as recently used by updating its timestamps.

        This updates the chats.updated_at (if chat row exists) which, via trigger,
        also updates nodes.updated_at. If the chat row does not exist yet, we fall
        back to directly updating nodes.updated_at to move the chat up in listings.

        Args:
            node_id: ID of the chat node.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                # Try to bump chats.updated_at via a no-op messages update
                cursor = conn.execute('SELECT id FROM chats WHERE node_id = ?', (node_id,))
                chat_exists = cursor.fetchone() is not None

                if chat_exists:
                    # Perform an update to trigger the timestamp trigger
                    conn.execute('''
                        UPDATE chats SET messages = messages WHERE node_id = ?
                    ''', (node_id,))
                else:
                    # No chat row yet; directly bump the node timestamp
                    conn.execute('''
                        UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = 'chat'
                    ''', (node_id,))

                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error touching chat '{node_id}': {e}")
            return False

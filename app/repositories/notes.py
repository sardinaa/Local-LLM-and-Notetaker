from __future__ import annotations

from typing import Any, Dict, List, Optional


class NotesRepository:
    """Repository for notes and tree operations.

    Thin adapter over the legacy DatabaseManager; keeps behavior while
    isolating data access behind a clear interface.
    """

    def __init__(self, db_manager):
        self._db = db_manager

    # Tree
    def get_tree(self) -> List[Dict[str, Any]]:
        return self._db.get_tree()

    def create_node(self, node_id: str, name: str, node_type: str, parent_id: Optional[str], customization: Optional[Dict[str, Any]] = None) -> bool:
        return self._db.create_node(node_id, name, node_type, parent_id, customization)

    def update_node(self, node_id: str, **kwargs) -> bool:
        return self._db.update_node(node_id, **kwargs)

    def delete_node(self, node_id: str) -> bool:
        return self._db.delete_node(node_id)

    def move_node(self, node_id: str, new_parent_id: Optional[str], new_sort_order: Optional[int]) -> bool:
        return self._db.move_node(node_id, new_parent_id, new_sort_order)

    # Notes
    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        return self._db.get_node(node_id)

    def get_note_content(self, node_id: str) -> Optional[Dict[str, Any]]:
        return self._db.get_note_content(node_id)

    def save_note_content(self, node_id: str, content: Dict[str, Any]) -> bool:
        return self._db.save_note_content(node_id, content)

    # Selection list helper (legacy pass-through)
    def get_all_notes_for_selection(self, q: Optional[str] = None):
        return self._db.get_all_notes_for_selection(q)

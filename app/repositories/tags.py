from __future__ import annotations

from typing import Any, Dict, List, Optional


class TagsRepository:
    """Repository for tags, relations, and note-tag links."""

    def __init__(self, db_manager):
        self._db = db_manager

    # Tags
    def get_tag(self, tag_id: str) -> Optional[Dict[str, Any]]:
        return self._db.get_tag(tag_id)

    def list_tags(self, q: Optional[str] = None, limit: int = 50, include_usage: bool = False, parent_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self._db.list_tags(q, limit, include_usage, parent_id)

    def create_tag(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.create_tag(payload)

    def update_tag(self, tag_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.update_tag(tag_id, patch)

    def delete_tag(self, tag_id: str, cascade: bool = False, force: bool = False) -> Dict[str, Any]:
        return self._db.delete_tag(tag_id, cascade, force)

    def merge_tags(self, source_ids: List[str], target_id: str) -> Dict[str, Any]:
        return self._db.merge_tags(source_ids, target_id)

    # Relations
    def get_tag_relations(self, tag_id: str) -> List[str]:
        return self._db.get_tag_relations(tag_id)

    def set_tag_relations(self, tag_id: str, related_ids: List[str]) -> bool:
        return self._db.set_tag_relations(tag_id, related_ids)

    def get_tag_dependencies(self, tag_id: str) -> List[str]:
        return self._db.get_tag_dependencies(tag_id)

    def set_tag_dependencies(self, tag_id: str, depends_ids: List[str]) -> bool:
        return self._db.set_tag_dependencies(tag_id, depends_ids)

    # Multi-parent support
    def get_tag_parents(self, tag_id: str) -> List[str]:
        return self._db.get_tag_parents(tag_id)

    def add_tag_parent(self, tag_id: str, parent_id: str) -> bool:
        return self._db.add_tag_parent(tag_id, parent_id)

    def remove_tag_parent(self, tag_id: str, parent_id: str) -> bool:
        return self._db.remove_tag_parent(tag_id, parent_id)

    def set_tag_parents(self, tag_id: str, parent_ids: List[str]) -> bool:
        return self._db.set_tag_parents(tag_id, parent_ids)

    def get_tag_children(self, tag_id: str) -> List[str]:
        return self._db.get_tag_children(tag_id)

    # Note-tag links
    def assign_tags_to_note(self, note_id: str, tag_ids: List[str]) -> bool:
        return self._db.assign_tags_to_note(note_id, tag_ids)

    def replace_note_tags(self, note_id: str, tag_ids: List[str]) -> bool:
        return self._db.replace_note_tags(note_id, tag_ids)

    def get_tags_for_note(self, note_id: str) -> List[Dict[str, Any]]:
        return self._db.get_tags_for_note(note_id)

    # Search/Dashboard
    def search_notes_by_tags(self, any_of=None, all_of=None, none_of=None, limit: int = 50, cursor: Optional[str] = None) -> List[str]:
        return self._db.search_notes_by_tags(any_of, all_of, none_of, limit, cursor)

    def get_tag_dashboard(self, tag_id: str) -> Dict[str, Any]:
        return self._db.get_tag_dashboard(tag_id)


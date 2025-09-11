from __future__ import annotations

from typing import Any, Dict, List, Optional


class TaskRepository:
    """Repository for task-related persistence operations.

    This thin adapter delegates to the legacy DatabaseManager to keep
    current behavior while isolating data access behind a clear interface.
    """

    def __init__(self, db_manager):
        self._db = db_manager

    # Core CRUD
    def create_task(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.create_task(payload)

    def update_task(self, task_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.update_task(task_id, patch)

    def delete_task(self, task_id: str) -> bool:
        return self._db.delete_task(task_id)

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self._db.get_task(task_id)

    def list_tasks(self, filters: Dict[str, Any] | None = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        return self._db.list_tasks(filters or {}, limit, offset)

    def get_task_stats(self) -> Dict[str, Any]:
        return self._db.get_task_stats()

    # Files
    def add_task_file(self, task_id: str, file_payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        # DatabaseManager supports both positional and keyword styles across versions
        try:
            return self._db.add_task_file(task_id, file_payload)
        except TypeError:
            return self._db.add_task_file(**file_payload)

    def get_task_files(self, task_id: str) -> List[Dict[str, Any]]:
        return self._db.get_task_files(task_id)

    def remove_task_file(self, task_id: str, file_id: str) -> bool:
        return self._db.remove_task_file(task_id, file_id)

    def get_file_by_id(self, file_id: str) -> Optional[Dict[str, Any]]:
        return self._db.get_file_by_id(file_id)

    # Note references
    def add_task_note_references(self, task_id: str, note_ids: List[str]) -> bool:
        return self._db.add_task_note_references(task_id, note_ids)

    def remove_task_note_reference(self, task_id: str, note_id: str) -> bool:
        return self._db.remove_task_note_reference(task_id, note_id)

    # Tags (for NLP parsing path)
    def list_tags(self, q: Optional[str] = None, limit: int = 50, include_usage: bool = False, parent_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self._db.list_tags(q, limit, include_usage, parent_id)

    def create_tag(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.create_tag(payload)


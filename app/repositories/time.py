from __future__ import annotations

from typing import Any, Dict, List, Optional


class TimeRepository:
    """Repository for time tracking activities and entries."""

    def __init__(self, db_manager):
        self._db = db_manager

    # Activities
    def upsert_activity(self, name: str, color: Optional[str] = None, tag_id: Optional[str] = None) -> Dict[str, Any]:
        return self._db.upsert_activity(name, color, tag_id)

    def list_activities(self) -> List[Dict[str, Any]]:
        return self._db.list_activities()

    # Entries
    def start_time_entry(
        self,
        activity_id: str,
        start_time: Optional[str] = None,
        note_id: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        return self._db.start_time_entry(activity_id, start_time, note_id, description)

    def stop_time_entry(self, entry_id: str, end_time: Optional[str] = None) -> Optional[Dict[str, Any]]:
        return self._db.stop_time_entry(entry_id, end_time)

    def update_time_entry(self, entry_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.update_time_entry(entry_id, patch)

    def get_time_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        return self._db.get_time_entry(entry_id)

    def list_time_entries(self, start: Optional[str] = None, end: Optional[str] = None, day: Optional[str] = None) -> List[Dict[str, Any]]:
        return self._db.list_time_entries(start, end, day)


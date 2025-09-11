from __future__ import annotations

from typing import Any, Dict, List, Optional


class TimeService:
    """Service layer for time tracking."""

    def __init__(self, time_repo):
        self._repo = time_repo

    # Activities
    def list_activities(self) -> List[Dict[str, Any]]:
        return self._repo.list_activities()

    def upsert_activity(self, name: str, color: Optional[str] = None, tag_id: Optional[str] = None) -> Dict[str, Any]:
        return self._repo.upsert_activity(name, color, tag_id)

    # Entries
    def list_time_entries(self, start: Optional[str] = None, end: Optional[str] = None, day: Optional[str] = None) -> List[Dict[str, Any]]:
        return self._repo.list_time_entries(start, end, day)

    def start_time_entry(
        self, activity_id: str, start_time: Optional[str] = None, note_id: Optional[str] = None, description: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        return self._repo.start_time_entry(activity_id, start_time, note_id, description)

    def stop_time_entry(self, entry_id: str, end_time: Optional[str] = None) -> Optional[Dict[str, Any]]:
        return self._repo.stop_time_entry(entry_id, end_time)

    def update_time_entry(self, entry_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._repo.update_time_entry(entry_id, patch)

    def get_time_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        return self._repo.get_time_entry(entry_id)


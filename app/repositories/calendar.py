from __future__ import annotations

from typing import Any, Dict, List, Optional


class CalendarRepository:
    def __init__(self, db_manager):
        self._db = db_manager

    def create_event(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.create_calendar_event(payload)

    def update_event(self, event_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.update_calendar_event(event_id, patch)

    def delete_event(self, event_id: str) -> bool:
        return self._db.delete_calendar_event(event_id)

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        return self._db.get_calendar_event(event_id)

    def list_events(self, start: Optional[str] = None, end: Optional[str] = None) -> List[Dict[str, Any]]:
        return self._db.list_calendar_events(start, end)

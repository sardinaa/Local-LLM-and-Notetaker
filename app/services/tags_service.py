from __future__ import annotations

from typing import Any, Dict, List, Optional


class TagsService:
    """Service layer for tags and tag-powered queries."""

    def __init__(self, tags_repo, data_service=None, db_manager=None):
        self._repo = tags_repo
        self._ds = data_service  # optional for semantic/text search paths
        self._db = db_manager

    # Basic tags
    def list_tags(self, q: Optional[str] = None, limit: int = 50, include_usage: bool = False, parent_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self._repo.list_tags(q=q, limit=limit, include_usage=include_usage, parent_id=parent_id)

    def create_tag(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._repo.create_tag(payload)

    def update_tag(self, tag_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._repo.update_tag(tag_id, patch)

    def delete_tag(self, tag_id: str, cascade: bool = False, force: bool = False) -> Dict[str, Any]:
        return self._repo.delete_tag(tag_id, cascade=cascade, force=force)

    def merge_tags(self, source_ids: List[str], target_id: str) -> Dict[str, Any]:
        return self._repo.merge_tags(source_ids, target_id)

    # Relations / dependencies
    def get_tag_relations(self, tag_id: str) -> List[str]:
        return self._repo.get_tag_relations(tag_id)

    def set_tag_relations(self, tag_id: str, related_ids: List[str]) -> bool:
        return self._repo.set_tag_relations(tag_id, related_ids)

    def get_tag_dependencies(self, tag_id: str) -> List[str]:
        return self._repo.get_tag_dependencies(tag_id)

    def set_tag_dependencies(self, tag_id: str, depends_ids: List[str]) -> bool:
        return self._repo.set_tag_dependencies(tag_id, depends_ids)

    # Note-tag links
    def assign_tags_to_note(self, note_id: str, tag_ids: List[str]) -> bool:
        return self._repo.assign_tags_to_note(note_id, tag_ids)

    def replace_note_tags(self, note_id: str, tag_ids: List[str]) -> bool:
        return self._repo.replace_note_tags(note_id, tag_ids)

    def get_tags_for_note(self, note_id: str) -> List[Dict[str, Any]]:
        return self._repo.get_tags_for_note(note_id)

    # Search / dashboards
    def search_notes_by_tags(self, any_of=None, all_of=None, none_of=None, limit: int = 50, cursor: Optional[str] = None) -> List[str]:
        return self._repo.search_notes_by_tags(any_of, all_of, none_of, limit, cursor)

    def get_tag_dashboard(self, tag_id: str) -> Dict[str, Any]:
        return self._repo.get_tag_dashboard(tag_id)

    # Composite queries used by routes
    def query_notes(self, any_of: List[str], all_of: List[str], none_of: List[str], text: Optional[str], start: Optional[str], end: Optional[str]) -> List[str]:
        ids = set(self._repo.search_notes_by_tags(any_of, all_of, none_of, 1000))
        ds = self._ds
        if text:
            text_ids: set[str] = set()
            if ds:
                try:
                    text_results = ds.search_content(text, "notes")
                    text_ids = {r["id"] for r in text_results}
                except Exception:
                    text_ids = set()
            ids = ids.intersection(text_ids) if ids else text_ids
        if start or end:
            date_ids: set[str] = set()
            try:
                if ds and hasattr(ds, "db"):
                    with ds.db.get_connection() as conn:  # type: ignore[attr-defined]
                        params = []
                        where = []
                        if start:
                            where.append("updated_at >= ?")
                            params.append(start)
                        if end:
                            where.append("updated_at <= ?")
                            params.append(end)
                        sql = "SELECT id FROM notes"
                        if where:
                            sql += " WHERE " + " AND ".join(where)
                        cur = conn.execute(sql, params)
                        date_ids = {r["id"] for r in cur.fetchall()}
            except Exception:
                date_ids = set()
            ids = ids.intersection(date_ids) if ids else date_ids
        return list(ids)

    def get_notes_for_tag(self, tag_id: str) -> Dict[str, Any]:
        ds = self._ds
        if not ds:
            return {"error": "service_unavailable", "notes": [], "count": 0}
        try:
            try:
                with ds.db.get_connection() as conn:  # type: ignore[attr-defined]
                    cursor = conn.execute("SELECT id FROM tags WHERE id = ?", (tag_id,))
                    if not cursor.fetchone():
                        return {"error": "Tag not found", "notes": [], "count": 0}
            except Exception:
                return {"error": "Tag not found", "notes": [], "count": 0}

            note_ids = self._repo.search_notes_by_tags(any_of=[tag_id])
            notes = []
            for note_id in note_ids:
                note = ds.get_note(note_id)
                if note:
                    notes.append(
                        {
                            "id": note_id,
                            "title": note.get("name", "Untitled"),
                            "lastModified": note.get("updated_at"),
                            "content_preview": (note.get("content", {}).get("content", "")[:200] if note.get("content") else ""),
                        }
                    )
            return {"notes": notes, "count": len(notes)}
        except Exception:
            return {"error": "internal_error", "notes": [], "count": 0}


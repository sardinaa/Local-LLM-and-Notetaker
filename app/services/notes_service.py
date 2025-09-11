from __future__ import annotations

from typing import Any, Dict, Optional


class NotesService:
    """Service layer for notes and tree operations.

    - Delegates persistence to a NotesRepository
    - Uses DataService for enriched tree and cache invalidation
    """

    def __init__(self, notes_repo, data_service):
        self._repo = notes_repo
        self._ds = data_service

    # Tree
    def get_tree(self):
        # Keep enriched behavior from DataService
        return self._ds.get_tree()

    def create_node(self, node_id: str, name: str, node_type: str, parent_id: Optional[str], customization: Optional[Dict[str, Any]] = None) -> bool:
        ok = self._repo.create_node(node_id, name, node_type, parent_id, customization)
        if ok:
            self._invalidate(["tree", "recent"])
        return ok

    def update_node(self, node_id: str, **kwargs) -> bool:
        ok = self._repo.update_node(node_id, **kwargs)
        if ok:
            self._invalidate(["tree", "recent", f"node_{node_id}"])
        return ok

    def delete_node(self, node_id: str) -> bool:
        ok = self._repo.delete_node(node_id)
        if ok:
            self._invalidate(None)  # full clear
        return ok

    def move_node(self, node_id: str, new_parent_id: Optional[str], new_sort_order: Optional[int]) -> bool:
        ok = self._repo.move_node(node_id, new_parent_id, new_sort_order)
        if ok:
            self._invalidate(["tree", "recent", f"node_{node_id}"])
        return ok

    # Notes
    def save_note(self, node_id: str, title: Optional[str], content: Any) -> bool:
        ok = True
        try:
            if title is not None:
                ok = self._repo.update_node(node_id, name=title)
            if ok:
                ok = self._repo.save_note_content(node_id, content)
        except Exception:
            ok = False
        if ok:
            self._invalidate(["tree", f"note_{node_id}"])
        return ok

    def get_note(self, node_id: str) -> Optional[Dict[str, Any]]:
        node = self._repo.get_node(node_id)
        if not node or node.get("type") != "note":
            return None
        content_data = self._repo.get_note_content(node_id)
        if content_data:
            node.update(content_data)
        return node

    # Internal
    def _invalidate(self, keys):
        # DataService has an internal cache invalidation helper; use carefully
        try:
            if keys is None:
                self._ds._invalidate_cache()  # type: ignore[attr-defined]
            else:
                for k in keys:
                    self._ds._invalidate_cache(k)  # type: ignore[attr-defined]
        except Exception:
            pass


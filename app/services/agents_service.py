from __future__ import annotations

from typing import Any, Dict, List, Optional


class AgentsService:
    """Thin service wrapper around AgentsManager.

    Provides a stable interface for routes to avoid importing the manager
    directly and to keep the option to swap storage later.
    """

    def __init__(self, agents_manager):
        self._mgr = agents_manager

    # CRUD
    def list_agents(self) -> List[Dict[str, Any]]:
        return self._mgr.list_agents()

    def get_agent(self, name: str) -> Optional[Dict[str, Any]]:
        return self._mgr.get_agent(name)

    def create_agent(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._mgr.create_agent(payload)

    def update_agent(self, name: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._mgr.update_agent(name, patch)

    def delete_agent(self, name: str) -> bool:
        return self._mgr.delete_agent(name)

    # Import/export
    def export_all(self) -> Dict[str, Any]:
        return self._mgr.export_all()

    def import_all(self, data: Dict[str, Any]) -> int:
        return self._mgr.import_all(data)

    # Run
    def run_agent(self, agent_name: str, query: str, model: Optional[str] = None) -> Dict[str, Any]:
        return self._mgr.run_agent(agent_name, query, model)

    # Knowledge docs
    def list_agent_documents(self, name: str) -> List[Dict[str, Any]]:
        return self._mgr.list_agent_documents(name)

    def remove_agent_document(self, name: str, filename: str) -> Dict[str, Any]:
        return self._mgr.remove_agent_document(name, filename)

    def add_agent_document(self, name: str, path: str, original_name: str) -> Dict[str, Any]:
        return self._mgr.add_agent_document(name, path, original_name)

    # Links
    def list_agent_links(self, name: str) -> List[Dict[str, Any]]:
        return self._mgr.list_agent_links(name)

    def add_agent_link(self, name: str, url: str, ingest: bool = True) -> Dict[str, Any]:
        return self._mgr.add_agent_link(name, url, ingest)

    def remove_agent_link(self, name: str, url: str) -> Dict[str, Any]:
        return self._mgr.remove_agent_link(name, url)

    # Databases
    def list_agent_databases(self, name: str) -> List[Dict[str, Any]]:
        return self._mgr.list_agent_databases(name)

    def add_agent_database(self, name: str, data: Dict[str, Any]) -> Dict[str, Any]:
        return self._mgr.add_agent_database(name, data)

    def remove_agent_database(self, name: str, db_name: str) -> Dict[str, Any]:
        return self._mgr.remove_agent_database(name, db_name)

    def ingest_agent_database(self, name: str, db_name: str) -> Dict[str, Any]:
        return self._mgr.ingest_agent_database(name, db_name)


from __future__ import annotations

from typing import Any, Dict, List, Optional


class JobsRepository:
    """Repository for jobs, letters, and job events.

    Thin adapter over the legacy DatabaseManager to isolate SQL access.
    """

    def __init__(self, db_manager):
        self._db = db_manager

    # Jobs CRUD + filtering
    def create_job(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.create_job(payload)

    def update_job(self, job_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.update_job(job_id, patch)

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self._db.get_job(job_id)

    def delete_job(self, job_id: str) -> bool:
        return self._db.delete_job(job_id)

    def list_jobs(self, filters: Dict[str, Any], limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        return self._db.list_jobs(filters, limit, offset)

    # Letters
    def add_motivation_letter(
        self,
        job_id: str,
        file_path: str,
        filename: Optional[str] = None,
        version: int = 1,
    ) -> Optional[Dict[str, Any]]:
        return self._db.add_motivation_letter(job_id, file_path, filename, version)

    def list_motivation_letters(self, job_id: str) -> List[Dict[str, Any]]:
        return self._db.list_motivation_letters(job_id)

    # Job events
    def list_job_events(self, job_id: str) -> List[Dict[str, Any]]:
        return self._db.list_job_events(job_id)

    def add_job_event(self, job_id: str, event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.add_job_event(job_id, event)

    def update_job_event(self, event_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._db.update_job_event(event_id, patch)

    def delete_job_event(self, event_id: str) -> bool:
        return self._db.delete_job_event(event_id)

    # Scraper configs and runs
    def get_scraper_configs(self) -> List[Dict[str, Any]]:
        return self._db.get_scraper_configs()

    def create_scraper_config(self, payload: Dict[str, Any]) -> Optional[str]:
        return self._db.create_scraper_config(payload)

    def update_scraper_config(self, config_id: str, updates: Dict[str, Any]) -> bool:
        return self._db.update_scraper_config(config_id, updates)

    def delete_scraper_config(self, config_id: str) -> bool:
        return self._db.delete_scraper_config(config_id)

    def get_scraper_runs_history(self, config_id: Optional[str], limit: int = 50) -> List[Dict[str, Any]]:
        return self._db.get_scraper_runs_history(config_id, limit)


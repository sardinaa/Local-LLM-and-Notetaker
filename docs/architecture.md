High-Level Architecture

Overview
- The app is migrating from a monolithic Flask module (`app.py`) to a modular, feature‑oriented package under `app/`.
- The new structure separates HTTP routes (blueprints), domain services, and data access to improve readability and testability.

Package Layout
- app/
  - __init__.py: Application factory (`create_app`), config loading, service init, blueprint registration.
  - config/: Environment configs (`default.py`, `dev.py`, `prod.py`).
  - routes/: HTTP blueprints.
    - main.py: Index and basic pages.
    - tasks.py: Tasks API endpoints.
    - notes.py: Tree, notes, and templates endpoints.
    - chat.py: Basic chat endpoints (list/save/get/touch).
    - tags.py: Tag mgmt, tag relations/dependencies, note-tag ops.
  - services/: Domain services.
    - notes_service.py: Tree/notes logic with cache invalidation via `DataService`.
    - jobs_service.py: Jobs, letters, events, scraper configs/runs.
    - time_service.py: Activities and time entries.
    - tags_service.py: Tags, relations/dependencies, note-tag links, composite queries.
    - agents_service.py: Thin wrapper around `AgentsManager`.
  - repositories/: Data access adapters that delegate to legacy `DatabaseManager`.
    - notes.py, tags.py, tasks.py, jobs.py, time.py
  - jobs/, audio/, rag/, plugins/: Placeholders for future extractions.

Application Factory
- `create_app()` builds the Flask app, loads config, initializes services (DataService, TaskService, Notes/Tags/Jobs/Time/Agents services) and registers blueprints.
- Services and repositories are attached to `app.*` (e.g., `app.jobs_service`, `app.tasks_repo`) so blueprints do not call `DataService`/`DatabaseManager` directly.

Incremental Migration Strategy
- Phase 1: Extract Tasks endpoints to `app/routes/tasks.py` and register as a blueprint. Legacy task routes in `app.py` replaced with placeholders.
- Phase 2: Extract Notes (tree/notes/templates), Tags, and basic Chat endpoints into blueprints.
- Phase 3: Extract remaining feature routes (jobs, agents, rag, audio) into dedicated blueprints.
- Phase 3: Move DB logic out of `database.py` into `app/repositories/` per domain. Keep a thin legacy adapter for compatibility.
- Phase 4: Move domain service modules into `app/services/` and adapt imports in routes/jobs/plugins.

Service Usage Rules
- Routes call their domain service; services use repositories; repositories delegate to `DatabaseManager` for the current migration phase.
- Examples:
  - Jobs routes -> `JobsService` -> `JobsRepository` -> `DatabaseManager`
  - Time routes -> `TimeService` -> `TimeRepository` -> `DatabaseManager`
  - Tags routes -> `TagsService` -> `TagsRepository` -> `DatabaseManager`
  - Tasks file ops -> `TaskRepository` (no direct `DataService.db` calls)
  - RAG highlighting and PDF extraction live in `app/routes/rag.py`; duplicate helpers removed from `app.py`.

Testing
- New tests use `pytest`. See `tests/test_tasks_service.py` for a minimal example using a temporary SQLite database file.

Notes
- The monolith still initializes some optional dependencies (e.g., Whisper, Kokoro). These are candidates for `app/plugins/` in a subsequent step.

Running the App
- Preferred: `python run.py` which uses the application factory.
- Alternatively with Flask CLI: `FLASK_APP=run.py flask run`.
- Legacy `python app.py` is deprecated and not guaranteed to include all new routes/services.

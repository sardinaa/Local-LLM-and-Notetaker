# Repository Guidelines

## Project Structure & Module Organization
- `app.py`: Flask entry point and routes.
- Core modules: `chat_history_manager.py`, `rag_manager.py`, `data_service.py`, `database.py`.
- Frontend: `templates/` (HTML), `static/js/` (client logic), `static/css/` (styles).
- Data stores: `instance/notetaker.db` (SQLite), `data/chroma_db/` (Chroma vectors; ignored by Git).

## Build, Test, and Development Commands
- Create env: `python -m venv .venv && source .venv/bin/activate`.
- Install deps: follow README “Installation” (Ollama + Python packages). Example: `pip install flask langchain langchain-community langchain-ollama chromadb openai-whisper kokoro>=0.8.4 soundfile pypdf python-docx python-pptx pandas unstructured`.
- Run app (dev): `FLASK_ENV=development python app.py`.
- Utilities: `python migrate_data.py` (data migration), `python update_sort_order.py` (maintenance).

## Coding Style & Naming Conventions
- Python: PEP 8, 4‑space indents, `snake_case` for functions/vars, `PascalCase` for classes, type hints in new code. Prefer pure functions in helpers.
- JavaScript: 2‑space indents, `camelCase` for functions/vars, `PascalCase` for classes/modules. Keep DOM IDs/classes `kebab-case`.
- Formatting: if available, run `black` and `ruff` (Python) and `prettier` (JS) before PRs.
- Structure: keep Flask routes in `app.py`, business logic in modules, and UI logic in `static/js/`.

## Testing Guidelines
- Current repo has no formal tests. If adding tests, use `pytest` with files named `tests/test_*.py` and aim for unit tests around `data_service.py`, `database.py`, and parsing utilities.
- Run tests: `pytest -q`. Include minimal fixtures and avoid DB writes unless using a temp DB path.

## Commit & Pull Request Guidelines
- Commits: imperative, concise subjects (≤ 72 chars). Examples: `fix: handle empty chat history`, `feat: add flashcards export`. Conventional Commits are encouraged.
- PRs: include a clear description, rationale, linked issues (e.g., `Closes #123`), and screenshots/GIFs for UI changes. Note any schema or config changes.
- Hygiene: do not commit `instance/notetaker.db` snapshots or large `data/` artifacts; keep changes focused and logically grouped.

## Security & Configuration Tips
- Configure via env vars: `OLLAMA_BASE_URL`, `DATABASE_PATH` (see README). Avoid hard‑coding secrets.
- When working with RAG, verify `data/chroma_db/` is regenerated as needed; do not version large indexes.

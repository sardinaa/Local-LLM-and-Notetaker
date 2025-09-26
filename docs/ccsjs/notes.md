# Notes Feature Refactor

Overview

This tracker coordinates the JS & CSS refactor for the Notes feature: tree navigation, note editor (Markdown/HTML), template insertion, tags, and attachments. It mirrors the approach used for Tasks and Jobs.

Current signals in repo

- Backend present: `app/routes/notes.py`, `app/services/notes_service.py`, `app/repositories/notes.py`.
- Templates: `templates/note_templates/{index.json,*.json}` and Template Manager script `static/js/templateManager.js`.
- Legacy/global JS touching notes/editor likely in: `static/js/editor.js`, `static/js/markdown.js`, `static/js/templateManager.js`, `static/js/tagsManager.js`, `static/js/documentActions.js`.
- Shared utilities available: `static/js/utils/dom.js`, `static/js/constants/classes.js`.
- Build system ready: Rollup + Sass, compiled CSS at `static/dist/styles.css`.

Status (initial)

- Build & tokens: ✓ Sass + tokens in `static/css/base/` are in place.
- JS modules: ☐ To be created under `static/js/notes/`.
- CSS partials: ☐ To be created under `static/css/notes/` and imported in `static/css/main.scss`.
- Feature flag: ☐ Guard bundle with `window.__USE_NOTES_MODULES__` similar to Jobs/Tasks pattern.
- Template wiring: ☐ Update template(s) to load `static/dist/notes.js` when Notes UI is present.

Target structure (Notes)

- JS: `static/js/notes/`
  - State + data: `api.js`, `state.js`
  - UI helpers: `dom.js`, `view.js`
  - Feature modules: `tree.js`, `editor.js`, `templates.js`, `tags.js`, `attachments.js`
  - Core: `controller.js`, `index.js`
- CSS: `static/css/notes/`
  - Layout and panels: `_layout.scss`, `_sidebar.scss`, `_editor.scss`
  - Components: `_tree.scss`, `_toolbar.scss`, `_tags.scss`, `_attachments.scss`, `_modals.scss`
  - Temporary bridge: `_legacy.scss` (only if needed during migration)

Plan to enable

1) Create scaffolding folders/files above with minimal exports and no side effects.
2) Add Rollup entry for `static/js/notes/index.js` → `static/dist/notes.js` with sourcemap.
3) Import new partials in `static/css/main.scss`.
4) Add feature flag `window.__USE_NOTES_MODULES__` and conditionally instantiate controller on Notes pages/sections.
5) Update templates to load bundled JS once present; keep legacy JS temporarily if required behind flag.

Milestones & checklist

- Phase 1: Scaffolding
  - ☐ Create JS folder and empty modules.
  - ☐ Create CSS folder and initial partials; import in `main.scss`.
  - ☐ Document module responsibilities in comments.
- Phase 2: Data + State
  - ☐ Implement `api.js` for notes tree/CRUD, templates list, tags attach/detach, upload endpoints.
  - ☐ Implement `state.js` for selected node, active note, dirty flags, editor status.
- Phase 3: UI Composition
  - ☐ `tree.js` for loading/rendering tree, selection, drag/drop (if applicable).
  - ☐ `editor.js` for markdown/HTML edit, autosave, debounced updates, preview toggle.
  - ☐ `templates.js` for inserting templates from `templates/note_templates/` via `api`.
  - ☐ `tags.js` and `attachments.js` for side panels/popovers.
- Phase 4: Controller & Integration
  - ☐ `controller.js` wires modules, subscribes to events, and owns lifecycle.
  - ☐ `index.js` feature-flag bootstrapping and safe init.
- Phase 5: CSS Extraction
  - ☐ Extract existing notes styles from `static/css/styles.css` (and any inline) into `notes/*` partials.
  - ☐ Apply tokens and shared components where possible; remove duplicates.
- Phase 6: Template updates
  - ☐ Update templates to load `static/dist/notes.js` and rely on `styles.css` bundle for notes styles.
  - ☐ Remove legacy links once parity verified.
- Phase 7: QA & Cleanup
  - ☐ Cross-browser checks; keyboard shortcuts in editor; large trees performance.
  - ☐ Remove legacy globals (`window.*`) and dead code.

How to build & run

- Build: `npm run build` (compiles CSS + bundles JS)
- Lint CSS: `npm run lint:css`
- Run app: `FLASK_ENV=development python app.py`

References

- Architecture overview: `docs/js-architecture.md`
- Tasks tracker: `docs/ccsjs/tasks.md`
- Jobs tracker: `docs/ccsjs/jobs.md`
- Backend Notes: `app/routes/notes.py`, `app/services/notes_service.py`, `app/repositories/notes.py`
- Templates: `templates/note_templates/`

# Tasks Feature Refactor

Overview

This refactor modularizes the Tasks feature across JS and CSS, replaces legacy scripts, and introduces a bundling pipeline. The UI now uses a controller with feature modules and SCSS partials compiled into a single stylesheet.

Status (✓ done)

- ✓ Build: Rollup + Sass, scripts in `package.json`.
- ✓ Base CSS tokens/reset in `static/css/base/`.
- ✓ JS modules: `tasks/{api,notifications,dates,preview,state,view,filters,dom,render,events,panel,datetime,notes,tags,references,controller}.js`.
- ✓ Controller enabled by default; legacy TaskManager removed from template.
- ✓ UI parity: buckets + grouped views, quick add/preview, keyboard nav, right panel (title, complete, priority, tags, notes, references), mobile drawer.
- ✓ Date/Time picker: calendar + month/year, outside click/Escape to close, auto-save on day select.
- ✓ Legacy CSS moved into SCSS (`static/css/tasks/_legacy.scss`); remaining legacy styles imported into build.
- ✓ Legacy backups: `legacy_backup/static/js/{taskManager.js,tasks.js}`, `legacy_backup/static/css/tasks.css`.

File structure (Tasks)

- JS: `static/js/tasks/`
  - State + data: `api.js`, `state.js`
  - UI helpers: `dates.js`, `preview.js`, `view.js`
  - Feature modules: `filters.js`, `render.js`, `events.js`, `panel.js`, `datetime.js`, `notes.js`, `tags.js`, `references.js`
  - Core: `dom.js`, `controller.js`, `index.js`
- CSS: `static/css/tasks/`
  - New partials: `_notifications.scss`, `_buckets.scss`, `_panel.scss`
  - Legacy bundle: `_legacy.scss` (temporary)

How to build & run

- Build: `npm run build` (compiles CSS + bundles JS)
- Lint CSS: `npm run lint:css`
- Run app: `FLASK_ENV=development python app.py`

Template changes

- `templates/index.html`
  - Loads `static/dist/styles.css` and `static/dist/tasks.js`.
  - Sets `window.__USE_TASKS_CONTROLLER__ = true`.
  - Removes legacy TaskManager include and hidden legacy containers.

Recent fixes

- Restored legacy visual for:
  - Priority selector (active colors, pill layout)
  - Date/time pill
  - Calendar/month-year picker (styles + logic)
- Added per-row checkbox with status update.
- Right panel mobile close (X) and overlay; desktop shows no overlay/X.
- Close date-time picker on outside click/Escape.
- Auto-save date on select; preserves quick time adjustment.

Remaining work

- CSS extraction
  - Split `_legacy.scss` into focused partials: `_filters.scss` (done), `_datetime.scss` (done), `_tags.scss` (done), `_references.scss` (done), `_tasks-list.scss` (done).
  - Remove `stylelint-disable` after extraction; normalize spacing/variables.
- Code cleanup
  - Remove dead code paths guarded for legacy.
  - Audit for any remaining `window.taskManager` references (there should be none now).
- QA checklist
  - Cross-browser test (Chrome/Firefox/Safari/Edge) for calendar, keyboard nav, mobile drawer.
  - RTL/locale sanity (month names, date formatting).
  - Performance: check large task lists in grouped view.

Changelog (condensed)

- Added full Tasks module suite and controller; replaced legacy TaskManager.
- Moved `static/css/tasks.css` → `static/css/tasks/_legacy.scss` (and backed up original under `legacy_backup/static/css/tasks.css`).
- Fixed mobile/desktop panel behavior; added overlay close and Escape handling.
- Implemented calendar rendering (month grid + month/year picker) and auto-save on click.

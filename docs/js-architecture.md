# JS & CSS Architecture

Refactor Goal

- Modularize legacy CSS/JS per feature for maintainability and reuse.
- Standardize tokens, components, and utilities across views.

Build & Lint

- CSS: `sass static/css/main.scss static/dist/styles.css`
- JS: `rollup -c`
- Lint: `stylelint "static/css/**/*.scss"`

Checklist

- [x] Scaffolding: base/layout/components/feature folders
- [x] Tokens extracted to `static/css/base/variables.scss`
- [x] Tasks: notifications moved to CSS, wired
- [x] Tasks: extract shared helpers (api, notify, dates, preview, state, counts)
- [ ] Tasks: migrate `taskManager.js` into modules
- [x] Tasks: extract DOM/state/events modules (initial pass)
- [ ] Tasks: class-name constants applied
- [ ] Tasks: remove inline styles fully
- [x] Tasks: add grouped views (list/priority/tag)
- [ ] File Viewer: structure + modules
- [ ] Chat: structure + modules
- [ ] Jobs: structure + modules

Notes

- Keep route logic in Python; only UI logic in `static/js`.
- Prefer pure helpers in `utils/` with small public surface.

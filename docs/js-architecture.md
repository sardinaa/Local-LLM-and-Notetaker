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
- [x] Jobs: structure + modules
- [x] Jobs: CSS extraction complete
- [x] Jobs: JS modularization complete
- [x] Jobs: build integration complete
- [x] Jobs: shared utilities applied
- [x] Jobs: legacy cleanup complete
- [x] Jobs: 100% REFACTOR COMPLETE ✅

Recent Work (2025-09-16)

- Migrated dynamic tabs (desktop/mobile) to `static/css/layout/_tabs.scss` and wired in `main.scss`.
- Extracted Gooey action menu to `static/css/components/_gooey.scss`.
- Extracted notes tag UI (inline pills + menu) to `static/css/notes/_tags.scss`.
- Removed duplicated CSS from `static/css/styles.css` to prevent conflicts.
- Verified CSS build via `npm run build:css`.

Notes

- Keep route logic in Python; only UI logic in `static/js`.
- Prefer pure helpers in `utils/` with small public surface.

Initial Prompt:
# Coordinated CSS & JavaScript Refactor

## Objective
Modularize the legacy CSS and JavaScript simultaneously to improve maintainability, consistency, and reuse.

## Scope
All files under:
- `static/css/`
- `static/js/`
- Any templates referencing the above

---

## Workflow Overview
1. **Choose a feature** (e.g., chat, tasks, file viewer).
2. **Refactor CSS and JS together** for that feature.
3. **Run build + lint** to verify.
4. **Commit and test** before moving to the next feature.
5. **Document the changes** made for each step of the refactor. Create a checkbox in the `docs/js-architecture.md` to go checking each refactor made and look what is missing.

---

## CSS Tasks
1. **Create directory structure**
   - `static/css/base/` – tokens, resets
   - `static/css/layout/` – global layout rules
   - `static/css/components/` – reusable components
   - `static/css/<feature>/` – feature-specific pieces

2. **Extract design tokens**
   - Move root variables into `static/css/base/variables.scss`.
   - Document tokens in `static/css/base/README.md`.

3. **Split monolithic styles**
   - Break `styles.css` and other large files into component-level `.scss` partials.
   - Follow BEM naming: `Block__Element--Modifier`.

4. **Consolidate shared elements**
   - Deduplicate common selectors (e.g., `.sidebar`) into `static/css/components/sidebar.scss`.

5. **Build pipeline**
   - Use `sass` (or preferred tool) to compile partials into `static/dist/styles.css`.

6. **Linting**
   - Add `stylelint` with a standard config; run on all `static/css/**/*.scss`.

---

## JavaScript Tasks
1. **Feature folders**
   - Organize scripts under `static/js/<feature>/`.
   - Split large files into modules: `api.js`, `dom.js`, `state.js`, `events.js`.

2. **Class-name constants**
   - Create `static/js/constants/classes.js` exporting shared CSS class names.
   - Replace literal class strings with imports from this file.

3. **DOM utilities**
   - Add `static/js/utils/dom.js` (`show`, `hide`, `toggle`, etc.).
   - Replace global helpers (`window.ui.*`) with imports.

4. **Build pipeline**
   - Introduce a bundler (e.g., Vite/Rollup).
   - Entry points per feature; output to `static/dist/`.
   - Update templates to load bundled files.

5. **Documentation**
   - Document in 'docs/ccsjs/{refactored-feature}.md
   - Document module structure and CSS/JS links in `docs/js-architecture.md`.

---

## Testing & Verification
- `npm run build` (or equivalent) – compiles CSS & JS.
- `stylelint static/css/**/*.scss`
- `npm test` or feature-specific smoke tests (if available).

---

## PR Guidelines
- Commit feature-by-feature with clear messages.
- Include build & lint outputs in PR description.
- Ensure worktree is clean before opening PR.

---

## Feature Trackers
- Tasks: docs/ccsjs/tasks.md
- Jobs: docs/ccsjs/jobs.md
- File Viewer: docs/ccsjs/file-viewer.md
- Notes: docs/ccsjs/notes.md
- Chat: docs/ccsjs/chat.md

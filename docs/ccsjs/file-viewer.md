# File Viewer Feature Refactor

Overview

This refactor modularizes the File Viewer across JS and CSS, isolates PDF.js integration, and aligns events with Document Actions and Chat. We will replace the monolithic `static/js/fileViewerRedesigned.js` with feature modules and migrate legacy CSS in `static/css/fileViewer.css` into SCSS partials compiled via the existing pipeline.

Status (✓ done)

- ✓ Build: Rollup + Sass available; compiled CSS at `static/dist/styles.css`.
- ✓ PDF.js UI vendored and loadable via `/static/pdfjs/web/viewer.html` (see `scripts/setup_pdfjs.sh`).
- ✓ File Viewer present as `static/js/fileViewerRedesigned.js` (to be split).
- ✓ Document Actions exists (`static/js/documentActions.js`) and integrates with the viewer.

File structure (File Viewer)

- JS: `static/js/fileviewer/`
  - State + data: `state.js`, `api.js`
  - UI helpers: `dom.js`, `list.js`, `preview.js`
  - PDF integration: `pdf.js` (iframe messaging, highlight sync)
  - Modal & uploads: `modal.js`, `upload.js`
  - Events/controller: `events.js`, `controller.js`, `index.js`
- CSS: `static/css/fileviewer/`
  - New partials: `_layout.scss`, `_panel.scss`, `_list.scss`, `_preview.scss`, `_pdf.scss`, `_modal.scss`, `_upload.scss`
  - Legacy bundle: `_legacy.scss` (temporary, for staged extraction)

How to build & run

- Build: `npm run build` (compiles CSS + bundles JS)
- Lint CSS: `npm run lint:css`
- Run app: `FLASK_ENV=development python app.py`

Template changes

- `templates/index.html`
  - Replace `static/css/fileViewer.css` with SCSS partials compiled into `static/dist/styles.css`.
  - Add new bundle `static/dist/fileviewer.js` when the feature entry is added to Rollup.
  - Keep PDF.js viewer references (served from `/static/pdfjs/web/viewer.html`).

Remaining work

- JS decomposition
  - Split `fileViewerRedesigned.js` into modules under `static/js/fileviewer/`.
  - Normalize events: prefer `chat:changed`, `rag:documents-updated`, `fileViewerStateChanged` (use CustomEvent with detail payloads).
  - Replace inline DOM queries with `dom.js` helpers and shared class constants from `static/js/constants/classes.js`.
  - Extract PDF messaging (postMessage) and highlight sync into `pdf.js`.
  - Create `index.js` entry that wires `controller.js` on DOM ready.

- CSS extraction
  - Convert `static/css/fileViewer.css` into focused partials (`_layout.scss`, `_panel.scss`, `_list.scss`, `_preview.scss`, `_pdf.scss`, `_modal.scss`, `_upload.scss`).
  - Align spacing/color/typography to tokens in `static/css/base/variables.scss`.
  - Remove inline styles in the template; replace with utility classes where applicable.

- Build & bundling
  - Add Rollup entry for `static/js/fileviewer/index.js` → `static/dist/fileviewer.js`.
  - Ensure tree-shaking of unused helpers; generate sourcemaps.

- Template updates
  - Load `static/dist/fileviewer.js` only on pages that render the Chat + File Viewer UI.
  - Remove legacy inline script references to the monolith once parity is reached.

- QA checklist
  - Viewer open/close toggle and resizer behavior (desktop and mobile).
  - Modal: upload (browse/drag-drop), list, select, delete; auto-load single document.
  - PDF view: loads via PDF.js UI; text fallback for non-PDF or failed conversion.
  - Document Actions: highlight/expand flows synchronized with PDF toolbar (marker toggle) and events.
  - Performance on large document lists and long PDFs.

Changelog (to be updated as we progress)

- Initialize File Viewer refactor tracker; defined target module and CSS structure.
- Next: create `static/js/fileviewer/` scaffolding and add Rollup entry.

References

- Architecture: `docs/js-architecture.md`
- Integration details: `docs/fileviewer-chat-rag.md`
- PDF.js setup: `scripts/setup_pdfjs.sh`, `pdfjs-config/`


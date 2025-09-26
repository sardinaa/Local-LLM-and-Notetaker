# File Viewer, Document Actions, and RAG System

This document explains how the redesigned File Viewer, the Chat interface’s Document Actions, and the RAG (Retrieval‑Augmented Generation) pipeline work together.

## Overview

- The Chat UI integrates a File Viewer panel to browse, preview, and analyze documents within a chat session.
- A compact Document Actions bar appears above the chat input when the viewer is open. It provides one‑click actions like Summary, Points, References, Insights, Highlight, Ask, and guided Expand.
- The RAG system stores uploaded documents per chat, builds embeddings, and serves content to LLMs for grounded responses.

## Architecture at a Glance

- Frontend
  - File Viewer: `static/js/fileViewerRedesigned.js`, template pieces in `templates/index.html`, styles in `static/css/fileViewer.css`.
  - Document Actions: `static/js/documentActions.js` with styles in `static/css/documentActions.css`.
  - Chat Logic: `static/js/chat.js` (send flow, model selector, per‑chat state).
  - PDF Viewer: vendored PDF.js UI under `static/pdfjs/web` with our highlight plugin `static/pdfjs/highlight-plugin.js`.

- Backend
  - Flask app: `app.py`
  - RAG: endpoints under `/api/rag/*` use `rag_manager.py` and related services.
  - Data: SQLite at `instance/notetaker.db`; ChromaDB vectors at `data/chroma_db/` (git‑ignored).

## File Viewer

### Features

- Open/Close: Toggle via the “Documents” button in the chat header.
- Preview: PDFs open in an embedded PDF.js viewer; other formats fallback to extracted content preview.
- Document list and management modal (Upload, Delete).
- Emits events for cross‑component sync:
  - `documentSelected` when a file is chosen.
  - `fileViewerStateChanged` when the panel opens/closes.

### PDF Annotations and Navigation

- The PDF iframe runs `highlight-plugin.js` which supports:
  - Drawing AI highlights and user selection anchors on an overlay layer.
  - Marker mode toggling (user highlight tool) with `toggleHighlightMarker` button inside the PDF toolbar.
  - PostMessage API:
    - `editorHighlight` to apply AI highlights (bounded rectangles only).
    - `highlightSelectionOnly` to draw a specific user anchor.
    - `clearHighlights` to clear AI overlays.
    - `navigateToY` to scroll to and flash a specific line.
  - Events posted to parent:
    - `highlight:event` with `highlight:activated|deactivated|created`.
    - `selection:navigate`, `selection:reanchored`, `selection:missing`.
    - `highlightMatches` with compact references (e.g., equation page/label pairs).

## Document Actions

### Actions Bar

- Rendered above the chat input when the File Viewer is open.
- Actions:
  - Summary, Points, References, Insights
  - Highlight (user‑driven marker and AI keyword highlighting)
  - Expand (guided expansion around a user selection/anchor)
  - Ask (places a prompt in the chat input for Q&A about the document)

### Modes and Visual Styling

1. User Selection Mode
   - Trigger: user marks text in the PDF viewer (marker mode).
   - Behavior: actions target only the selected text; selection persists with `{page, anchor, rects}`.
   - Styling: Color A with small ✍️ corner glyph.

2. Agent Highlight Mode
   - Trigger: no explicit user selection.
   - Behavior: AI highlights relevant passages in the PDF.
   - Styling: Color B with small 🤖 corner glyph.

3. User‑Guided Expansion
   - Trigger: click Expand when a user selection exists.
   - Behavior: anchor remains visible (Color A); AI adds nearby highlights (Color B). Shows an “Expand around anchor” pill.

### Highlight Flow

- The Highlight action enables PDF marker mode and adds a highlight pill in chat.
- When the user types keywords and sends, Document Actions intercepts chat send and:
  - Shows a transient “Highlighting…” typing indicator.
  - Calls `/api/highlight-document` to get candidate spans.
  - Applies highlights to the fallback text preview and the PDF viewer via `editorHighlight`.
  - Emits compact references in chat (e.g., “Formulas: Eq. (7) — p. 10”).

### Toggle Synchronization

- Viewer toolbar button (`toggleHighlightMarker`) and the chat Highlight action stay in sync via `highlight:event`.
  - Viewer → UI: on `highlight:activated`, shows the pill/selects the action without echo; on `highlight:deactivated`, hides pill/unselects.
  - UI → Viewer: actions post `highlight:activate|deactivate` to the PDF iframe.

### Persistence

- User selections are stored with a computed `docId` (chatId + filename + content hash) in `localStorage`, allowing later navigation and re‑anchoring attempts.

## Chat Interface

### Send Flow

- Standard chat sends stream responses with a typing indicator.
- Document Actions that intercept (Highlight / guided Expand) show their own “Highlighting…” progress indicator and then post compact reference messages, not full text.

### Model Selector

- Loads `/api/config/defaults` to show the default model from `.env` immediately.
- Loads available models from `/api/ollama/models` when opened or when Chat activates.

## RAG System

### Data Flow

1. Upload
   - Endpoint: `POST /api/rag/upload`
   - Associates files with a chat ID.

2. Indexing
   - Embeddings: `RAG_EMBEDDING_MODEL` env (e.g., `nomic-embed-text:latest`).
   - Vector store: ChromaDB at `data/chroma_db/`.

3. Query / Chat
   - `POST /api/rag/query` — generic RAG query over a chat’s corpus.
   - `POST /api/rag/chat` — chat‑style RAG response generation.
   - The LLM for RAG is configured via `RAG_MODEL` env.

4. Document Management
   - `GET /api/rag/documents/<chat_id>` — list documents.
   - `DELETE /api/rag/documents/<chat_id>/<filename>` — delete a document.
   - `DELETE /api/rag/documents/<chat_id>` — clear all for chat.
   - `GET /api/rag/document-content/<chat_id>/<filename>` — extracted content for non‑PDF preview.
   - `GET /api/rag/document-file/<chat_id>/<filename>` — raw file served to PDF viewer.

5. Health / Debug
   - `GET /api/rag/health` — system status.
   - `GET /api/rag/debug/<chat_id>` — diagnostics.

### Environment Variables

- Core
  - `COMPOSE_MODEL` — default chat/model for compose.
  - `RAG_MODEL` — generation model for RAG.
  - `RAG_EMBEDDING_MODEL` — embeddings model.
  - `OLLAMA_URL` — override Ollama base URL if needed.

### Frontend Integration With RAG

- The chat UI checks if the current chat has documents and adjusts the “Documents” toggle state.
- File Viewer pulls the PDF via `/api/rag/document-file/<chat_id>/<filename>` and loads it in the embedded PDF.js UI.
- Document Actions (e.g., References, Insights) generally assume a selected doc and use its filename/path to scope prompts.

## Events & Contracts Summary

- DOM / Window Events
  - `documentSelected` — detail `{ filename, chatId, path? }`.
  - `fileViewerStateChanged` — detail `{ isOpen: boolean }`.
  - `documentActionsReady` — detail `{ manager }` (Document Actions API).
  - `chat:send` — programmatic chat send trigger.

- PDF Iframe PostMessage
  - Parent → Iframe: `editorHighlight`, `highlightSelectionOnly`, `clearHighlights`, `highlight:activate|deactivate`, `navigateToY`.
  - Iframe → Parent: `highlight:event`, `selection:navigate`, `selection:reanchored`, `selection:missing`, `highlightMatches`.

## UX Notes & Best Practices

- Use Highlight/Expand for document‑scoped actions; they display a quick progress indicator and references, not full model streams.
- Keep the File Viewer open for the actions bar to appear; select a document to enable document‑aware actions.
- The marker toggle in PDF toolbar and the chat Highlight button are synchronized; turning one off turns the other off.
- For scanned PDFs, math/structure detection may be limited; consider enabling OCR or using the local search window.

## Troubleshooting

- “Actions bar doesn’t appear” — ensure the File Viewer is open; the bar appears above the chat input when the panel is visible.
- “Model name shows Loading…” — the selector initializes from `/api/config/defaults`. If it persists, check that route and `.env` values.
- “Highlights blanket large areas” — the plugin restricts to bounded lines; if a doc still misbehaves, try zoom or reflow, or fall back to user selection anchor.


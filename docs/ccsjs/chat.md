# Chat Refactor

Refactor Goal

- Modularize legacy Chat JS/CSS per feature architecture.
- Separate DOM, state, API, and controller logic for testability.
- Keep behavior parity while enabling incremental migration.

Current State

- Modular controller is enabled by default behind `window.__USE_CHAT_MODULES__`.
- Rendering is centralized in `static/js/chat/render.js` (markdown/code/math, copy buttons).
- Persistence and first-message title generation unified in `controller.js` via `/api/chats` and `/api/generate-chat-title`.
- Sources handling standardized in `static/js/chat/sources.js` and used by controller (agents/RAG/regular flows).
- Agent selection UI extracted to `static/js/chat/agents_ui.js`; legacy triggers it via `ChatModules.agentsUI.addAgentSelectorToPlusMenu()` when the flag is on.
- Legacy `static/js/chat.js` remains as a thin shell; send and regenerate now route through `ChatModules.controller.sendMessage(...)` when the flag is on.
- Backend: `/api/chat-with-context` (streaming), `/api/chats` (persist), `/api/agents`, `/api/ollama/models`, RAG endpoints under `/api/rag/*`.

Target Structure (JS)

- `static/js/chat/`
  - `api.js` — chat endpoints, streaming helpers, models list, agents list.
  - `state.js` — current chatId, generating/abort, per‑chat state, selectors.
  - `dom.js` — render/append message, markdown/math/code helpers, UI wiring.
  - `events.js` — CustomEvent bridge: `chat:send`, `chat:changed`, `highlight:event`, etc.
  - `controller.js` — coordinates send flow, regenerate, edit‑and‑regenerate, plus-menu actions.
  - `agents_ui.js` — plus‑menu Agent picker UI using `/api/agents`.
  - `index.js` — public surface; safe initialization that does not auto‑hijack legacy.

CSS

- Chat styles will be migrated into `static/css/chat/*.scss` in a later pass and compiled into `static/dist/styles.css` via existing Sass pipeline.

Data Flow (target)

1. DOM event (send) -> `controller.sendMessage(msg, opts)`
2. `state.startGeneration()` + `api`/`fetch` streaming
3. Stream tokens -> `dom.renderBotStreaming()` (markdown/math/hljs via `render.js`)
4. Done -> `dom.finalizeBotMessage()` + `api.saveMessages()`
5. Sources extraction -> `sources.extractAndAttach()` + saved alongside message
6. Emit events (`chat:message-finished`, etc.) and refresh tree as needed

Minimal First Cut (this change)

- Scaffolds chat modules and Rollup entry `static/dist/chat.js`.
- Modular controller wired behind feature flag and now ENABLED by default.
- Centralized rendering in `render.js` and adopted by both modular and legacy.
- Unified persistence and first-message title generation in controller.
- Standardized sources handling via `sources.js` and integrated across flows.
- Legacy send and regenerate now delegate to `ChatModules.controller.sendMessage(...)`.

Next Migrations

- [x] Centralize markdown/math/code helpers into `render.js` and consume in legacy via feature flag.
- [x] Move streaming send logic into `controller.js` with agents/RAG/regular chat handling.
- [ ] Introduce `events.js` to normalize cross‑feature events (document actions, PDF highlight sync).
- [x] Migrate save/load to unified path (`controller` -> `/api/chats`) and remove duplicates.
- [x] Create model selector utility in `state.js` (reads from DOM initially).
- [x] Add seams for Web Search and Source Display hooks (`sources.js`).
- [x] Gate legacy script with `window.__USE_CHAT_MODULES__` (now true by default).
- [x] Use `dom.getRefs()` instead of direct DOM queries in controller.
- [x] Move plus‑menu agent picker into modules (`agents_ui.js`) using `/api/agents`.
- [ ] Final cleanup: delete obsolete functions from legacy file.

Key Endpoints & Events

- Endpoints: `/api/chat-with-context`, `/api/chats`, `/api/agents`, `/api/ollama/models`, `/api/rag/*`.
- Events (normalized):
  - `chat:send-started` — payload `{ chatId, model, text, extras }`
  - `chat:stream-token` — payload `{ chatId, token }`
  - `chat:message-finished` — payload `{ chatId }`
  - `chat:error` — payload `{ chatId, error }`
  - `chat:abort` / `chat:aborted`
  - `chat:sources-finalized` — payload `{ chatId, sources }`
  - `chat:generation-state` — payload `{ chatId, generating }`

Event/UI Wiring

- Legacy UI listens for `chat:generation-state`, `chat:send-started`, and `chat:aborted` to toggle `isGenerating` and call `updateSendButtonState()`. This ensures the Stop button (`#chatCancelBtn`) shows during generation and hides on completion or abort.
- Abort flow: clicking `#chatCancelBtn` dispatches `chat:abort`. The modular controller stops streaming, then emits `chat:aborted` to confirm termination.

Persistence & FK Notes

- On first send in a new chat, the controller preflights `/api/chats/{chatId}`. If missing, it calls `window.createDefaultChat(chatId, 'Quick Chat')` to create the backing node (`/api/nodes`) and an empty chat (`/api/chats`). This prevents SQLite “FOREIGN KEY constraint failed” on message save.
- It also sets `window.currentChatId` early so other systems (RAG, UI) stay in sync.

Troubleshooting

- Error: `Error saving chat messages: FOREIGN KEY constraint failed`
  - Cause: Missing `nodes` row for the chat's `node_id`.
  - Fix: Ensure a chat node exists first (create via UI or rely on the controller’s pre-create logic above).

Remaining Work

- Broaden UI consumers of `chat:generation-state` if additional components need to lock controls.
- Harden error/abort UX (toasts, consistent resets).
- Remove legacy code once parity is verified.

Testing

- `npm run build` compiles the bundle. Bundles green; modular controller active.
- Smoke test: send, regenerate, agents, RAG streaming; sources sidebar opens.

Notes

- Keep Python routes unchanged; this refactor is front‑end modularization only.
- Regenerate now calls the modular controller, ensuring single streaming path.
- Document decisions and deltas here per iteration.

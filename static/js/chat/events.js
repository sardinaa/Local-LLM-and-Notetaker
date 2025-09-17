// Chat events module: standard event names and helpers
export const EVENTS = {
  SEND_STARTED: 'chat:send-started',
  STREAM_TOKEN: 'chat:stream-token',
  MESSAGE_FINISHED: 'chat:message-finished',
  ERROR: 'chat:error',
  ABORT: 'chat:abort',
  ABORTED: 'chat:aborted',
  SOURCES_FINALIZED: 'chat:sources-finalized',
  GENERATION_STATE: 'chat:generation-state',
};
export function emit(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
}

export function on(name, handler) {
  window.addEventListener(name, handler);
}

export function off(name, handler) {
  window.removeEventListener(name, handler);
}

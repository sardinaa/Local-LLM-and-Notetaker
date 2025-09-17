// Chat state module: shared state and selectors
const state = {
  chatId: null,
  generating: false,
  abortController: null,
  selectedAgent: null,
};

export function setChatId(id) { state.chatId = id; }
export function getChatId() { return state.chatId || (window.currentChatId || null); }

export function isGenerating() { return state.generating; }
export function startGeneration() {
  state.generating = true;
  state.abortController = new AbortController();
  return state.abortController;
}
export function stopGeneration() {
  try { state.abortController && state.abortController.abort(); } catch (_) {}
  state.abortController = null;
  state.generating = false;
}
export function getSignal() { return state.abortController ? state.abortController.signal : undefined; }

export function getSelectedModel() {
  if (typeof window.getSelectedModel === 'function') return window.getSelectedModel();
  const sel = document.querySelector('#modelSelector');
  return sel && sel.value ? sel.value : null;
}

export function setSelectedAgent(agent) { state.selectedAgent = agent || null; }
export function getSelectedAgentLocal() { return state.selectedAgent; }
export function clearSelectedAgent() { state.selectedAgent = null; }

export const EVENTS = { STATE_CHANGED: 'chat:state-changed' };

export default state;

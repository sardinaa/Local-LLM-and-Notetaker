// Chat DOM module: rendering and helpers
import { renderMarkdownSafe as renderMd, finalizeBotMessage as finalizeMsg } from './render.js';
export function getRefs() {
  return {
    input: document.getElementById('chatInput'),
    sendBtn: document.getElementById('chatSendBtn'),
    messages: document.getElementById('chatMessages'),
  };
}

export function appendUserMessage(text) {
  if (typeof window.appendMessage === 'function') {
    return window.appendMessage(String(text || ''), 'user', false);
  }
}

export function appendBotPlaceholder() {
  if (typeof window.appendMessage === 'function') {
    return window.appendMessage('', 'bot', false);
  }
}

export function renderBotStreaming(container, textChunk) {
  if (!container) return;
  try {
    container.innerHTML = renderMd(textChunk);
  } catch {
    container.textContent = textChunk || '';
  }
}

export function finalizeBotMessage(container, fullText) {
  if (!container) return;
  try { finalizeMsg(container, fullText); } catch { container.textContent = fullText || ''; }
}

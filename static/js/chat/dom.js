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

// Corner typing indicator (visible only while waiting for first stream chunk)
const TYPING_INDICATOR_HTML = `
  <span class="typing-indicator typing-indicator--corner" aria-live="polite" aria-label="AI is thinking">
    <span class="typing-bar" aria-hidden="true"></span>
    <span class="typing-label">Thinking...</span>
  </span>`;

export async function appendBotPlaceholder() {
  if (typeof window.appendMessage !== 'function') return;
  const msg = await window.appendMessage(' ', 'bot', false);
  if (msg?.classList) msg.classList.add('loading', 'generating');
  try {
    const chatText = msg?.querySelector('.chat-text');
    if (chatText && !msg.querySelector('.typing-indicator')) {
      const wrap = document.createElement('div');
      wrap.className = 'typing-indicator-container';
      wrap.innerHTML = TYPING_INDICATOR_HTML;
      msg.insertBefore(wrap, chatText);
    }
  } catch {}
  return msg;
}

export function renderBotStreaming(container, textChunk) {
  if (!container) return;
  let streamTarget = container.querySelector?.('.stream-target');
  if (!streamTarget) {
    try {
      const msg = container.closest('.chat-message');
      msg?.querySelector('.typing-indicator-container')?.remove();
      streamTarget = document.createElement('span');
      streamTarget.className = 'stream-target';
      container.appendChild(streamTarget);
      msg?.classList.remove('generating');
      msg?.classList.remove('loading');
    } catch {}
  }
  const target = streamTarget || container;
  try { target.innerHTML = renderMd(textChunk); } catch { target.textContent = textChunk || ''; }
}

export function finalizeBotMessage(container, fullText) {
  if (!container) return;
  try {
    const message = container.closest('.chat-message');
    if (message) {
      message.classList.remove('loading');
      message.classList.remove('generating');
    }
  } catch (_) {}
  // Remove the typing indicator (if still present) before final render to avoid overlap.
  try {
    const indicator = container.querySelector('.typing-indicator');
    if (indicator) indicator.remove();
  } catch {/* noop */}
  // If streaming target existed, finalize inside it; else fallback to container
  const target = container.querySelector?.('.stream-target') || container;
  try { finalizeMsg(target, fullText); } catch { target.textContent = fullText || ''; }
}

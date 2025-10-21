// Chat DOM module: rendering and helpers
import { 
  renderMarkdownSafe as renderMd, 
  finalizeBotMessage as finalizeMsg,
  addCopyButtonsToCodeBlocks,
  queueMathTypeset
} from './render.js';
export function getRefs() {
  return {
    input: document.getElementById('chatInput'),
    sendBtn: document.getElementById('chatSendBtn'),
    messages: document.getElementById('chatMessages'),
  };
}

export function appendUserMessage(text, searchMode = null) {
  if (typeof window.appendMessage === 'function') {
    const extras = searchMode ? { searchMode } : null;
    return window.appendMessage(String(text || ''), 'user', false, null, extras);
  }
}

// Corner typing indicator (visible only while waiting for first stream chunk)
const TYPING_INDICATOR_HTML = `
  <span class="typing-indicator typing-indicator--corner" aria-live="polite" aria-label="AI is thinking">
    <span class="typing-bar" aria-hidden="true"></span>
    <span class="typing-label">Thinking...</span>
  </span>`;

// Shimmer placeholder for text generation (appears below thinking indicator)
// Multiple pills per line with varied sizes to simulate text
// All three lines have the same total width for consistency
const SHIMMER_PLACEHOLDER_HTML = `
  <div class="shimmer-wrapper">
    <div class="generating-placeholder">
      <div class="shimmer-line-wrapper">
        <span class="shimmer-line shimmer-line--large"></span>
        <span class="shimmer-line shimmer-line--medium"></span>
        <span class="shimmer-line shimmer-line--small"></span>
        <span class="shimmer-line shimmer-line--word"></span>
        <span class="shimmer-line shimmer-line--large"></span>
        <span class="shimmer-line shimmer-line--medium"></span>
        <span class="shimmer-line shimmer-line--small"></span>
      </div>
      <div class="shimmer-line-wrapper">
        <span class="shimmer-line shimmer-line--medium"></span>
        <span class="shimmer-line shimmer-line--large"></span>
        <span class="shimmer-line shimmer-line--word"></span>
        <span class="shimmer-line shimmer-line--small"></span>
        <span class="shimmer-line shimmer-line--medium"></span>
        <span class="shimmer-line shimmer-line--large"></span>
        <span class="shimmer-line shimmer-line--small"></span>
      </div>
      <div class="shimmer-line-wrapper">
        <span class="shimmer-line shimmer-line--word"></span>
        <span class="shimmer-line shimmer-line--large"></span>
        <span class="shimmer-line shimmer-line--small"></span>
        <span class="shimmer-line shimmer-line--medium"></span>
        <span class="shimmer-line shimmer-line--word"></span>
        <span class="shimmer-line shimmer-line--large"></span>
        <span class="shimmer-line shimmer-line--medium"></span>
      </div>
      <div class="shimmer-line-wrapper">
        <span class="shimmer-line shimmer-line--small"></span>
        <span class="shimmer-line shimmer-line--medium"></span>
        <span class="shimmer-line shimmer-line--large"></span>
        <span class="shimmer-line shimmer-line--word"></span>
      </div>
    </div>
  </div>`;

export async function appendBotPlaceholder() {
  if (typeof window.appendMessage !== 'function') return;
  const msg = await window.appendMessage(' ', 'bot', false);
  if (msg?.classList) msg.classList.add('loading', 'generating');
  try {
    const chatText = msg?.querySelector('.chat-text');
    if (chatText && !msg.querySelector('.typing-indicator')) {
      // Clear placeholder text so we can append structured children
      chatText.textContent = '';

      // Add thinking indicator at the corner of chat-text
      const indicatorSpan = document.createElement('span');
      indicatorSpan.className = 'typing-indicator typing-indicator--corner';
      indicatorSpan.setAttribute('aria-live', 'polite');
      indicatorSpan.setAttribute('aria-label', 'AI is thinking');
      indicatorSpan.innerHTML = `
        <span class="typing-bar" aria-hidden="true"></span>
        <span class="typing-label">Thinking...</span>
      `;
      chatText.appendChild(indicatorSpan);
      
      // Add shimmer placeholder below (in normal flow, not absolute)
      if (!chatText.querySelector('.shimmer-wrapper')) {
        const shimmerDiv = document.createElement('div');
        shimmerDiv.className = 'shimmer-wrapper';
        shimmerDiv.innerHTML = `
          <div class="generating-placeholder">
            <div class="shimmer-line-wrapper">
              <span class="shimmer-line shimmer-line--large"></span>
              <span class="shimmer-line shimmer-line--medium"></span>
              <span class="shimmer-line shimmer-line--small"></span>
              <span class="shimmer-line shimmer-line--word"></span>
              <span class="shimmer-line shimmer-line--large"></span>
              <span class="shimmer-line shimmer-line--medium"></span>
              <span class="shimmer-line shimmer-line--small"></span>
            </div>
            <div class="shimmer-line-wrapper">
              <span class="shimmer-line shimmer-line--medium"></span>
              <span class="shimmer-line shimmer-line--large"></span>
              <span class="shimmer-line shimmer-line--word"></span>
              <span class="shimmer-line shimmer-line--small"></span>
              <span class="shimmer-line shimmer-line--medium"></span>
              <span class="shimmer-line shimmer-line--large"></span>
              <span class="shimmer-line shimmer-line--small"></span>
            </div>
            <div class="shimmer-line-wrapper">
              <span class="shimmer-line shimmer-line--word"></span>
              <span class="shimmer-line shimmer-line--large"></span>
              <span class="shimmer-line shimmer-line--small"></span>
              <span class="shimmer-line shimmer-line--medium"></span>
              <span class="shimmer-line shimmer-line--word"></span>
              <span class="shimmer-line shimmer-line--large"></span>
              <span class="shimmer-line shimmer-line--medium"></span>
            </div>
            <div class="shimmer-line-wrapper">
              <span class="shimmer-line shimmer-line--small"></span>
              <span class="shimmer-line shimmer-line--medium"></span>
              <span class="shimmer-line shimmer-line--large"></span>
              <span class="shimmer-line shimmer-line--word"></span>
            </div>
          </div>
        `;
        chatText.appendChild(shimmerDiv);
      }

      // Ensure there is a dedicated container for the streamed content
      if (!chatText.querySelector('.chat-response')) {
        const responseDiv = document.createElement('div');
        responseDiv.className = 'chat-response';
        chatText.appendChild(responseDiv);
      }

      // Track layout state for CSS sizing rules
      chatText.dataset.state = 'loading';
      chatText.classList.remove('has-content');
    }
  } catch {}
  return msg;
}

// Debounced rendering to avoid showing raw markdown during rapid token streaming
let streamRenderTimer = null;
let lastRenderedText = '';

export function renderBotStreaming(container, textChunk) {
  if (!container) return;
  
  // Remove typing indicator and shimmer on first token
  try {
    const msg = container.closest('.chat-message');
    
    // Remove the corner typing indicator
    const typingIndicator = container.querySelector('.typing-indicator--corner');
    if (typingIndicator) {
      typingIndicator.remove();
    }
    
    // Remove old-style typing-indicator-container if it exists
    if (msg?.querySelector('.typing-indicator-container')) {
      msg.querySelector('.typing-indicator-container')?.remove();
    }
    
    // Remove generating/loading classes
    msg?.classList.remove('generating');
    msg?.classList.remove('loading');
    
    // Remove shimmer placeholder when content arrives
    const shimmerWrapper = container.querySelector('.shimmer-wrapper');
    if (shimmerWrapper) {
      shimmerWrapper.style.opacity = '0';
      shimmerWrapper.style.transition = 'opacity 0.3s ease-out';
      setTimeout(() => shimmerWrapper.remove(), 300);
    }

    // Mark bubble as having real content for CSS adjustments
    container.dataset.state = 'streaming';
    container.classList.add('has-content');
  } catch {}

  const contentTarget = container.querySelector('.chat-response') || container;
  
  // Clear any pending render
  if (streamRenderTimer) {
    clearTimeout(streamRenderTimer);
  }
  
  // Debounce rendering to avoid showing raw markdown character-by-character
  // Render immediately when we have complete markdown blocks
  const shouldRenderImmediately = (
    !lastRenderedText || // First render
    textChunk.length - lastRenderedText.length > 30 || // Medium chunk added (reduced from 100)
    textChunk.endsWith('\n\n') || // Paragraph break
    textChunk.endsWith('```\n') || // Code block
    textChunk.endsWith('```') || // Code block end
    /【\d+】|\[\d+\]/.test(textChunk.slice(-10)) // Citation marker just added
  );
  
  const doRender = () => {
    try { 
      const html = renderMd(textChunk);
      contentTarget.innerHTML = html;
      lastRenderedText = textChunk;
      
      // Apply syntax highlighting to any new code blocks
      try {
        if (window.hljs) {
          contentTarget.querySelectorAll('pre code:not(.hljs)').forEach(b => { 
            try { hljs.highlightElement(b); } catch {} 
          });
        }
      } catch {}
    } catch { 
      contentTarget.textContent = textChunk || ''; 
    }
  };
  
  if (shouldRenderImmediately) {
    doRender();
  } else {
    // Debounce: render after 16ms (roughly 60fps) for faster, smoother updates
    streamRenderTimer = setTimeout(doRender, 16);
  }
}

export function finalizeBotMessage(container, fullText) {
  if (!container) return;
  
  // Clear any pending debounced render
  if (streamRenderTimer) {
    clearTimeout(streamRenderTimer);
    streamRenderTimer = null;
  }
  lastRenderedText = '';

  const contentTarget = container.querySelector('.chat-response') || container;
  
  try {
    const message = container.closest('.chat-message');
    if (message) {
      message.classList.remove('loading');
      message.classList.remove('generating');
    }
    container.dataset.state = 'ready';
    container.classList.add('has-content');
  } catch (_) {}
  
  // Remove the typing indicator (if still present) before final render
  try {
    const indicator = container.querySelector('.typing-indicator');
    if (indicator) indicator.remove();
  } catch {/* noop */}
  
  // Ensure final content is rendered (in case debounce hasn't fired yet)
  try {
    const html = renderMd(fullText);
    contentTarget.innerHTML = html;
  } catch {
    contentTarget.textContent = fullText || '';
  }
  
  // Only add enhancements that weren't applied during streaming
  try {
    // Apply syntax highlighting to all code blocks
    try {
      if (window.hljs) {
        contentTarget.querySelectorAll('pre code:not(.hljs)').forEach(b => { 
          try { hljs.highlightElement(b); } catch {} 
        });
      }
    } catch {}
    
    // Add copy buttons to code blocks (only done on finalize)
    if (typeof addCopyButtonsToCodeBlocks === 'function') {
      addCopyButtonsToCodeBlocks(contentTarget);
    }
    
    // Typeset math expressions (only done on finalize for performance)
    if (typeof queueMathTypeset === 'function') {
      queueMathTypeset(contentTarget);
    }
  } catch (err) {
    // Fallback: if enhancements fail, do full re-render
    console.warn('Enhancement failed, falling back to full render:', err);
    try { 
      finalizeMsg(contentTarget, fullText); 
    } catch { 
      contentTarget.textContent = fullText || ''; 
    }
  }
}

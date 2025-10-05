var ChatBundle = (function (exports) {
  'use strict';

  // Chat API module: endpoints and streaming helpers
  async function streamChat({ prompt, chatId, model, forceSearch, signal }) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, stream: true, model, chat_id: chatId || 'default', force_search: !!forceSearch }),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error('Chat request failed');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    return {
      async next() {
        const { done, value } = await reader.read();
        if (done) return { done: true };
        const chunk = decoder.decode(value);
        return { done: false, value: chunk };
      },
      cancel() { try { reader.cancel(); } catch (_) {} },
    };
  }

  async function saveMessages(chatId, messages) {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chatId, messages }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'success') {
      throw new Error('Failed to save chat messages');
    }
    return true;
  }

  async function listAgents() {
    const res = await fetch('/api/agents');
    if (!res.ok) throw new Error('Failed to load agents');
    return res.json();
  }

  async function listModels() {
    const res = await fetch('/api/ollama/models');
    if (!res.ok) throw new Error('Failed to load models');
    return res.json();
  }

  var api = /*#__PURE__*/Object.freeze({
    __proto__: null,
    listAgents: listAgents,
    listModels: listModels,
    saveMessages: saveMessages,
    streamChat: streamChat
  });

  // Chat state module: shared state and selectors
  const state = {
    chatId: null,
    generating: false,
    abortController: null,
    selectedAgent: null,
  };

  function setChatId(id) { state.chatId = id; }
  function getChatId() { return state.chatId || (window.currentChatId || null); }

  function isGenerating() { return state.generating; }
  function startGeneration() {
    state.generating = true;
    state.abortController = new AbortController();
    return state.abortController;
  }
  function stopGeneration() {
    try { state.abortController && state.abortController.abort(); } catch (_) {}
    state.abortController = null;
    state.generating = false;
  }
  function getSignal() { return state.abortController ? state.abortController.signal : undefined; }

  function getSelectedModel() {
    if (typeof window.getSelectedModel === 'function') return window.getSelectedModel();
    const sel = document.querySelector('#modelSelector');
    return sel && sel.value ? sel.value : null;
  }

  function setSelectedAgent(agent) { state.selectedAgent = agent || null; }
  function getSelectedAgentLocal() { return state.selectedAgent; }
  function clearSelectedAgent() { state.selectedAgent = null; }

  const EVENTS$1 = { STATE_CHANGED: 'chat:state-changed' };

  var state$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    EVENTS: EVENTS$1,
    clearSelectedAgent: clearSelectedAgent,
    default: state,
    getChatId: getChatId,
    getSelectedAgentLocal: getSelectedAgentLocal,
    getSelectedModel: getSelectedModel,
    getSignal: getSignal,
    isGenerating: isGenerating,
    setChatId: setChatId,
    setSelectedAgent: setSelectedAgent,
    startGeneration: startGeneration,
    stopGeneration: stopGeneration
  });

  // Shared render helpers for markdown, code, and math

  function anchorHeadingsAndFences(text) {
    if (!text) return text;
    let t = String(text);
    t = t.replace(/([^\n])\s+(#{1,6}\s)/g, (m, pre, hashes) => pre + '\n' + hashes);
    t = t.replace(/([^\n])\s*```/g, (m, pre) => pre + '\n```');
    return t;
  }

  function normalizeMathDelimiters(src) {
    if (!src) return src;
    let text = String(src);
    text = text.replace(/(^|\n)([ \t]*)\[\s*\n([\s\S]*?)\n[ \t]*\]([^\n]*)/g, (m, pre, indent, body, trailing) => {
      const lines = body.split(/\n/);
      let minIndent = null;
      for (const ln of lines) {
        if (!ln.trim()) continue;
        const match = ln.match(/^[ \t]*/);
        const ind = match ? match[0].length : 0;
        minIndent = (minIndent === null) ? ind : Math.min(minIndent, ind);
      }
      let cleaned = body;
      if (minIndent && minIndent > 0) {
        const re = new RegExp(`^[ \\t]{0,${minIndent}}`, 'gm');
        cleaned = body.replace(re, '');
      }
      const rest = trailing && trailing.trim() ? `\n${trailing.trim()}` : '';
      return `${pre}$$\n${cleaned}\n$${'$'}${rest}`; // escape $$ end in template
    });
    const fixArtifacts = (s) => s
      .replace(/\^\s*\{\s*,\s*([A-Za-z0-9])/g, '^{$1}')
      .replace(/_\s*\{\s*,\s*([A-Za-z0-9])/g, '_{$1}')
      .replace(/,\s*([A-Za-z])/g, ' $1')
      .replace(/\\forall\s*,/g, '\\forall ')
      .replace(/,\s*(\\lVert|\\rVert)/g, ' $1');
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => `$$${fixArtifacts(inner)}$$`);
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (m, inner) => `\\[${fixArtifacts(inner)}\\]`);
    text = text.replace(/\\left\s*\\\(/g, '\\left(')
               .replace(/\\right\s*\\\)/g, '\\right)')
               .replace(/\\left\s*\\\[/g, '\\left[')
               .replace(/\\right\s*\\\]/g, '\\right]')
               .replace(/\\left\s*\\\{/g, '\\left{')
               .replace(/\\right\s*\\\}/g, '\\right}');
    return text;
  }

  function protectMathSegments(src) {
    const placeholders = [];
    let out = '';
    let i = 0;
    let inInlineCode = false;
    let inFence = false;
    while (i < src.length) {
      if (!inInlineCode && src.startsWith('```', i)) {
        inFence = !inFence;
        out += src.slice(i, i + 3);
        i += 3;
        continue;
      }
      if (!inFence && src[i] === '`') {
        inInlineCode = !inInlineCode;
        out += src[i++];
        continue;
      }
      if (!inFence && !inInlineCode) {
        if (src.startsWith('$$', i)) {
          const end = src.indexOf('$$', i + 2);
          if (end !== -1) {
            const seg = src.slice(i, end + 2);
            const key = `{{MATH${placeholders.length}}}`;
            placeholders.push(seg);
            out += key;
            i = end + 2;
            continue;
          }
        }
        if (src.startsWith('\\[', i)) {
          const end = src.indexOf('\\]', i + 2);
          if (end !== -1) {
            const seg = src.slice(i, end + 2);
            const key = `{{MATH${placeholders.length}}}`;
            placeholders.push(seg);
            out += key;
            i = end + 2;
            continue;
          }
        }
        if (src.startsWith('\\(', i)) {
          const end = src.indexOf('\\)', i + 2);
          if (end !== -1) {
            const seg = src.slice(i, end + 2);
            const key = `{{MATH${placeholders.length}}}`;
            placeholders.push(seg);
            out += key;
            i = end + 2;
            continue;
          }
        }
        if (src[i] === '$' && src[i+1] !== '$') {
          let j = i + 1;
          while (j < src.length) {
            if (src[j] === '$' && src[j-1] !== '\\') break;
            j++;
          }
          if (j < src.length && src[j] === '$') {
            const seg = src.slice(i, j + 1);
            const key = `{{MATH${placeholders.length}}}`;
            placeholders.push(seg);
            out += key;
            i = j + 1;
            continue;
          }
        }
      }
      out += src[i++];
    }
    return { text: out, placeholders };
  }

  function restoreMathSegments(html, placeholders) {
    let out = html;
    if (placeholders && placeholders.length) {
      placeholders.forEach((seg, idx) => {
        const key = `{{MATH${idx}}}`;
        out = out.split(key).join(seg);
      });
    }
    return out;
  }

  function coercePlainMathToLatex(src) {
    try {
      if (!src) return src;
      let out = String(src);
      out = out.replace(/\bEq(?:uation)?\.?\s*\[([\s\S]*?)\](?:\s*\(\d+\))?/g, (m, inner) => {
        let s = inner;
        const sym = { '∑':'\\sum', '≥':'\\ge', '≤':'\\le', '∫':'\\int', '∏':'\\prod', '∞':'\\infty' };
        for (const k in sym) { s = s.split(k).join(sym[k]); }
        const greek = { 'θ':'\\theta', 'μ':'\\mu', 'π':'\\pi', 'σ':'\\sigma', 'φ':'\\phi', 'λ':'\\lambda', 'α':'\\alpha', 'β':'\\beta', 'γ':'\\gamma', 'δ':'\\delta', 'ω':'\\omega' };
        for (const k in greek) { s = s.split(k).join(greek[k]); }
        s = s.replace(/−/g, '-');
        s = s.replace(/p\s*θ/g, 'p_{\\theta}');
        return `$$${s}$$`;
      });
      out = out.replace(/\bEq(?:uation)?\.?\s*\(\d+\)\s*:\s*([^\n]+)/g, (m, rhs) => {
        let s = rhs;
        const sym = { '∑':'\\sum', '≥':'\\ge', '≤':'\\le', '∫':'\\int', '∏':'\\prod', '∞':'\\infty' };
        for (const k in sym) { s = s.split(k).join(sym[k]); }
        const greek = { 'θ':'\\theta', 'μ':'\\mu', 'π':'\\pi', 'σ':'\\sigma', 'φ':'\\phi', 'λ':'\\lambda', 'α':'\\alpha', 'β':'\\beta', 'γ':'\\gamma', 'δ':'\\delta', 'ω':'\\omega' };
        for (const k in greek) { s = s.split(k).join(greek[k]); }
        s = s.replace(/−/g, '-');
        s = s.replace(/p\s*θ/g, 'p_{\\theta}');
        return `$$${s}$$`;
      });
      return out;
    } catch { return src; }
  }

  function renderMarkdownSafe(src) {
    try {
      if (!window.marked) return String(src || '');
      const bulletSafe = String(src || '').replace(/(^|\n)\*\s/g, '$1- ');
      const mathCoerced = coercePlainMathToLatex(bulletSafe);
      const anchored = anchorHeadingsAndFences(mathCoerced);
      const normalized = normalizeMathDelimiters(anchored);
      const { text: mdSafe, placeholders } = protectMathSegments(normalized);
      const html = window.marked.parse(mdSafe);
      return restoreMathSegments(html, placeholders);
    } catch (e) {
      return String(src || '');
    }
  }

  function addCopyButtonsToCodeBlocks(container) {
    if (!container) return;
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach(codeBlock => {
      const preElement = codeBlock.parentElement;
      if (!preElement) return;
      if (preElement.querySelector('.code-copy-btn')) return;
      const copyButton = document.createElement('button');
      copyButton.className = 'code-copy-btn';
      copyButton.innerHTML = '<i class="fas fa-copy"></i>';
      copyButton.title = 'Copy to clipboard';
      preElement.appendChild(copyButton);
      copyButton.addEventListener('click', () => {
        const codeText = codeBlock.textContent;
        navigator.clipboard.writeText(codeText)
          .then(() => {
            copyButton.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { copyButton.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
          })
          .catch(() => {
            copyButton.innerHTML = '<i class="fas fa-times"></i>';
            setTimeout(() => { copyButton.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
          });
      });
    });
  }

  function queueMathTypeset(el) {
    try {
      if (!el) return;
      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([el]).catch(() => {});
      } else {
        if (!window._pendingMathEls) window._pendingMathEls = [];
        window._pendingMathEls.push(el);
      }
    } catch {}
  }

  function finalizeBotMessage$1(el, text) {
    if (!el) return;
    const html = renderMarkdownSafe(text);
    el.innerHTML = html;
    try {
      if (window.hljs) el.querySelectorAll('pre code').forEach(b => { try { hljs.highlightElement(b); } catch {} });
    } catch {}
    try { addCopyButtonsToCodeBlocks(el); } catch {}
    try { queueMathTypeset(el); } catch {}
  }

  // Attach to window for legacy consumers
  try {
    window.renderMarkdownSafe = renderMarkdownSafe;
    window.finalizeBotMessage = finalizeBotMessage$1;
    window.addCopyButtonsToCodeBlocks = addCopyButtonsToCodeBlocks;
    window.queueMathTypeset = queueMathTypeset;
  } catch {}

  var render = /*#__PURE__*/Object.freeze({
    __proto__: null,
    addCopyButtonsToCodeBlocks: addCopyButtonsToCodeBlocks,
    coercePlainMathToLatex: coercePlainMathToLatex,
    finalizeBotMessage: finalizeBotMessage$1,
    normalizeMathDelimiters: normalizeMathDelimiters,
    protectMathSegments: protectMathSegments,
    queueMathTypeset: queueMathTypeset,
    renderMarkdownSafe: renderMarkdownSafe,
    restoreMathSegments: restoreMathSegments
  });

  // Chat DOM module: rendering and helpers
  function getRefs() {
    return {
      input: document.getElementById('chatInput'),
      sendBtn: document.getElementById('chatSendBtn'),
      messages: document.getElementById('chatMessages'),
    };
  }

  function appendUserMessage(text) {
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

  async function appendBotPlaceholder() {
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

  function renderBotStreaming(container, textChunk) {
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
    try { target.innerHTML = renderMarkdownSafe(textChunk); } catch { target.textContent = textChunk || ''; }
  }

  function finalizeBotMessage(container, fullText) {
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
    try { finalizeBotMessage$1(target, fullText); } catch { target.textContent = fullText || ''; }
  }

  var dom = /*#__PURE__*/Object.freeze({
    __proto__: null,
    appendBotPlaceholder: appendBotPlaceholder,
    appendUserMessage: appendUserMessage,
    finalizeBotMessage: finalizeBotMessage,
    getRefs: getRefs,
    renderBotStreaming: renderBotStreaming
  });

  // Shared sources helpers: extraction, application, and mapping

  function processNewMessage(messageElement, content) {
    try {
      if (window.sourceDisplayManager) {
        window.sourceDisplayManager.processNewMessage(messageElement, content);
      }
    } catch {}
  }

  function extractAndAttach(messageElement, fullContent) {
    try {
      if (window.sourceDisplayManager) {
        return window.sourceDisplayManager.processMessageSources(fullContent, messageElement) || [];
      }
    } catch {}
    return [];
  }

  function applyStructured(messageElement, sources, fullContent) {
    try {
      if (window.sourceDisplayManager) {
        window.sourceDisplayManager.applyStructuredSources(messageElement, sources, fullContent);
      } else if (messageElement && sources && sources.length) {
        messageElement.dataset.sources = JSON.stringify(sources);
      }
    } catch {}
  }

  function openSidebar(sources) {
    try { if (window.sourceDisplayManager) window.sourceDisplayManager.openSidebar(sources); } catch {}
  }

  function readFromElement(messageElement) {
    try {
      if (messageElement && messageElement.dataset && messageElement.dataset.sources) {
        return JSON.parse(messageElement.dataset.sources);
      }
    } catch {}
    return [];
  }

  function mapAgentSources(rawList) {
    const list = Array.isArray(rawList) ? rawList : [];
    return list.map(s => ({
      title: s.title || s.name || 'Source',
      url: s.url || s.note_id || s.link || '',
      snippet: s.snippet || '',
    })).filter(s => s.url);
  }

  var sources = { processNewMessage, extractAndAttach, applyStructured, openSidebar, readFromElement, mapAgentSources };

  var sources$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    applyStructured: applyStructured,
    default: sources,
    extractAndAttach: extractAndAttach,
    mapAgentSources: mapAgentSources,
    openSidebar: openSidebar,
    processNewMessage: processNewMessage,
    readFromElement: readFromElement
  });

  // Chat events module: standard event names and helpers
  const EVENTS = {
    SEND_STARTED: 'chat:send-started',
    STREAM_TOKEN: 'chat:stream-token',
    MESSAGE_FINISHED: 'chat:message-finished',
    ERROR: 'chat:error',
    ABORT: 'chat:abort',
    ABORTED: 'chat:aborted',
    SOURCES_FINALIZED: 'chat:sources-finalized',
    GENERATION_STATE: 'chat:generation-state',
  };
  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  function on(name, handler) {
    window.addEventListener(name, handler);
  }

  function off(name, handler) {
    window.removeEventListener(name, handler);
  }

  var events = /*#__PURE__*/Object.freeze({
    __proto__: null,
    EVENTS: EVENTS,
    emit: emit,
    off: off,
    on: on
  });

  // Chat controller: progressive wrapper around legacy functions

  const messageCache = new Map();

  function cloneMessages(list = []) {
    return Array.isArray(list) ? list.map(msg => ({ ...msg })) : [];
  }

  function setCachedMessages(chatId, messages = []) {
    if (!chatId) return;
    messageCache.set(chatId, cloneMessages(messages));
  }

  async function ensureCachedMessages(chatId) {
    if (!chatId) return [];
    if (messageCache.has(chatId)) {
      return cloneMessages(messageCache.get(chatId));
    }
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      if (res.ok) {
        const data = await res.json();
        const msgs = (data && data.content && Array.isArray(data.content.messages)) ? data.content.messages : [];
        setCachedMessages(chatId, msgs);
        return cloneMessages(msgs);
      }
    } catch (_) {}
    setCachedMessages(chatId, []);
    return [];
  }

  function syncMessageCache(chatId, messages = []) {
    if (!chatId) return;
    setCachedMessages(chatId, messages);
  }

  function clearCachedMessages(chatId) {
    if (!chatId) {
      messageCache.clear();
    } else {
      messageCache.delete(chatId);
    }
  }

  async function fetchChatHistory(chatId) {
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      if (!res.ok) {
        setCachedMessages(chatId, []);
        return [];
      }
      const data = await res.json();
      const msgs = (data && data.content && Array.isArray(data.content.messages)) ? data.content.messages : [];
      setCachedMessages(chatId, msgs);
      return msgs.map(m => ({ role: (m.sender === 'bot' ? 'assistant' : 'user'), content: m.text || '' }));
    } catch (_) {
      setCachedMessages(chatId, []);
      return [];
    }
  }

  async function saveBotMessage(chatId, text, messageDiv) {
    if (!chatId) return false;
    try {
      const current = await ensureCachedMessages(chatId);
      const msg = { text: text || '', sender: 'bot', timestamp: new Date().toISOString() };
      try {
        const ss = readFromElement(messageDiv);
        if (ss && ss.length) msg.sources = ss;
      } catch (_) {}
      const updated = [...current, msg];
      setCachedMessages(chatId, updated);
      try {
        await saveMessages(chatId, updated);
        return true;
      } catch (error) {
        setCachedMessages(chatId, current);
        throw error;
      }
    } catch (_) {
      return false;
    }
  }

  async function saveUserMessage(chatId, text, extras) {
    if (!chatId) return false;
    try {
      const current = await ensureCachedMessages(chatId);
      const msg = { text: text || '', sender: 'user', timestamp: new Date().toISOString() };
      if (extras && (extras.displayLabel || extras.selectionRef)) {
        if (extras.displayLabel) msg.displayLabel = extras.displayLabel;
        if (extras.selectionRef) msg.selectionRef = extras.selectionRef;
      }
      const updated = [...current, msg];
      setCachedMessages(chatId, updated);
      try {
        await saveMessages(chatId, updated);
      } catch (error) {
        setCachedMessages(chatId, current);
        throw error;
      }
      // If new chat, try to generate a title
      try {
        const isFirst = updated.length <= 2; // user + bot will be <=2 after first cycle
        const chatNodeName = (window.chatTreeView && window.currentChatId)
          ? (window.chatTreeView.findNodeById(window.chatTreeView.nodes, window.currentChatId) || {}).name
          : null;
        if (isFirst && (!chatNodeName || chatNodeName === 'Quick Chat' || chatNodeName === 'New Chat')) {
          const tRes = await fetch('/api/generate-chat-title', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
          });
          const tData = tRes.ok ? await tRes.json() : { title: null };
          const title = (tData && tData.title) || (text.split(' ').slice(0, 4).join(' '));
          if (window.currentChatId) {
            await fetch(`/api/nodes/${window.currentChatId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: title }) });
            if (window.chatTreeView && typeof window.chatTreeView.renderTree === 'function') {
              try { window.chatTreeView.renderTree(); } catch (_) {}
            }
          }
        }
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  async function sendMessage(text, { forceSearch, extras } = {}) {
    // Prevent multiple concurrent requests
    if (isGenerating()) {
      console.log('Already generating a response, ignoring send request');
      return;
    }

    getRefs();
    const msg = String(text || '').trim();
    if (!msg) return;

    // Auto-detect and ingest URLs from message text
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = msg.match(urlRegex);
    if (urls && urls.length > 0 && window.ragManager) {
      try {
        // Silently ingest all detected URLs
        for (const url of urls) {
          await window.ragManager.handleURLAdd(url);
        }
      } catch (err) {
        console.warn('Failed to auto-ingest URLs:', err);
        // Continue with message even if URL ingestion fails
      }
    }

    // Generate a unique chat ID if none exists
    let chatId = getChatId();
    if (!chatId || chatId === 'default') {
      // Generate a unique ID for new chats
      chatId = 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      console.log('Generated new chat ID:', chatId);
      // Set it as current chat
      window.currentChatId = chatId;
    }
    
    // Ensure a backing chat record exists before any persistence to avoid FK issues
    try {
      // Prefer frontend helper if available (creates node + empty chat)
      if (typeof window.createDefaultChat === 'function') {
        console.log('Ensuring chat exists:', chatId);
        await window.createDefaultChat(chatId, 'New Chat');
        
        // Clear and initialize cache for this chat
        clearCachedMessages(chatId);
        setCachedMessages(chatId, []);
        
        // Reload the chat tree to show the new chat in sidebar
        if (typeof window.loadChatTree === 'function') {
          try {
            await window.loadChatTree();
            console.log('Chat tree reloaded');
          } catch (error) {
            console.warn('Failed to reload chat tree:', error);
          }
        }
        
        // CRITICAL: Select/activate the newly created chat
        if (window.chatTreeView && typeof window.chatTreeView.selectNodeById === 'function') {
          try {
            console.log('Selecting chat:', chatId);
            window.chatTreeView.selectNodeById(chatId);
          } catch (error) {
            console.warn('Failed to select chat:', error);
          }
        }
      }
    } catch (_) { /* non-fatal; backend may upsert */ }

    // If no current chat is selected, set it now so other systems (RAG, UI) see it
    try { if (!window.currentChatId) window.currentChatId = chatId; } catch (_) {}

    // Remove welcome message if it exists (when sending first message to default chat)
    try {
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        const welcomeMsg = chatMessages.querySelector('.chat-message.bot.is-muted');
        if (welcomeMsg) {
          welcomeMsg.remove();
          console.log('Removed welcome message');
        }
      }
    } catch (_) {}

    // Clear the input field
    try {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.value = '';
        // Update input state to remove any styling
        if (typeof window.updateInputState === 'function') {
          window.updateInputState();
        }
        // Also trigger the input event to update UI
        const inputWrapper = document.querySelector('.chat-input-wrapper');
        if (inputWrapper) {
          inputWrapper.classList.remove('has-text');
        }
      }
    } catch (_) {}

    await appendUserMessage(msg);
    // Persist the user message now via unified API
    try { await saveUserMessage(chatId, msg, extras || null); } catch (_) {}
    const placeholder = await appendBotPlaceholder();
    const container = placeholder ? placeholder.querySelector('.chat-text') : null;

    let shouldPersistBot = false;
    let textForPersistence = '';
    let placeholderRemoved = false;
    let responseStarted = false;

    const persistBotResponse = async () => {
      if (!shouldPersistBot || !chatId || placeholderRemoved) return;
      const textToSave = textForPersistence && textForPersistence.trim()
        ? textForPersistence
        : (container && container.textContent ? container.textContent.trim() : '');
      if (!textToSave) return;
      try {
        await saveBotMessage(chatId, textToSave, placeholder || null);
      } catch (_) {}
    };

    startGeneration();
    const model = getSelectedModel();
    emit(EVENTS.SEND_STARTED, { chatId, model, text: msg, extras: extras || null });
    emit(EVENTS.GENERATION_STATE, { chatId, generating: true });

    try {
      // Agent selection support
    const selectedAgent = getSelectedAgentLocal && getSelectedAgentLocal();
      let botResponse = '';

      // Force web search toggle (same heuristic as legacy)
      const forceWeb = typeof window.shouldForceWebSearch === 'function' ? window.shouldForceWebSearch() : !!forceSearch;

      // If agent selected: use agent endpoint (non-streaming)
    if (selectedAgent) {
    const res = await fetch('/api/agents/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_name: selectedAgent.name, query: msg, model }),
          signal: getSignal(),
        });
        const agentData = await res.json();
        if (agentData.status === 'success') {
          botResponse = agentData.answer || '';
          renderBotStreaming(container, botResponse);
          responseStarted = responseStarted || !!botResponse;
          shouldPersistBot = botResponse.trim().length > 0;
          textForPersistence = botResponse;
          // Add sources to the message element for display and saving
          try {
            const mapped = mapAgentSources(agentData.sources);
            if (mapped && mapped.length && placeholder) {
              applyStructured(placeholder, mapped, botResponse);
              emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: mapped });
            }
          } catch (_) {}
        } else if (agentData.status === 'needs_tags') {
          botResponse = 'This agent has no tags configured. Please edit the agent and add tags to use with your notes.';
          renderBotStreaming(container, botResponse);
          responseStarted = true;
          shouldPersistBot = botResponse.trim().length > 0;
          textForPersistence = botResponse;
        } else if (agentData.status === 'no_results') {
          botResponse = "No matching notes found for this agent's tags and your query. Try different tags or a different query.";
          renderBotStreaming(container, botResponse);
          responseStarted = true;
          shouldPersistBot = botResponse.trim().length > 0;
          textForPersistence = botResponse;
        } else {
          botResponse = agentData.message || 'Error occurred while running the agent.';
          renderBotStreaming(container, botResponse);
          responseStarted = true;
          shouldPersistBot = botResponse.trim().length > 0;
          textForPersistence = botResponse;
        }
      } else if (!forceWeb && window.ragManager && typeof window.ragManager.hasDocumentsInCurrentChat === 'function' && window.ragManager.hasDocumentsInCurrentChat()) {
        // RAG path (delegates streaming to ragManager)
        const res = await window.ragManager.sendRAGMessage(msg, getSignal());
        if (!res || !res.ok) throw new Error('RAG message failed');
        // Mimic streaming handling for RAG by reading the stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = String(chunk || '').split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) { botResponse = data.error; break; }
              if (data.token) {
                botResponse += data.token;
                renderBotStreaming(container, botResponse);
                responseStarted = true;
                emit(EVENTS.STREAM_TOKEN, { chatId, token: data.token });
                // Auto-scroll removed to allow free scrolling during streaming
              }
              if (data.done) {
                finalizeBotMessage(container, botResponse);
                // Handle sources from RAG response
                if (data.sources && Array.isArray(data.sources) && data.sources.length > 0 && placeholder) {
                  // Apply structured sources with document references
                  if (window.sourceDisplayManager) {
                    window.sourceDisplayManager.applyStructuredSources(placeholder, data.sources, botResponse);
                  }
                  emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: data.sources });
                } else if (botResponse.trim() && placeholder) {
                  // Fallback to extracting sources from text
                  extractAndAttach(placeholder, botResponse);
                  try { const ss = readFromElement(placeholder); if (ss && ss.length) emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: ss }); } catch(_){ }
                }
                shouldPersistBot = botResponse.trim().length > 0;
                textForPersistence = botResponse;
                break;
              }
            } catch (_) {}
          }
        }
      } else {
        // Regular chat-with-context streaming
        const history = await fetchChatHistory(chatId);
        const res = await fetch('/api/chat-with-context', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message: msg, stream: true, history, model, force_search: !!forceWeb }),
          signal: getSignal(),
        });
        if (!res.ok) throw new Error('Network response was not ok');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = String(chunk || '').split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) { botResponse = data.error; break; }
              if (data.token) {
                botResponse += data.token;
                renderBotStreaming(container, botResponse);
                responseStarted = true;
                if (placeholder) {
                  processNewMessage(placeholder, botResponse);
                }
                emit(EVENTS.STREAM_TOKEN, { chatId, token: data.token });
                // Auto-scroll removed to allow free scrolling during streaming
              }
              if (data.done) {
                finalizeBotMessage(container, botResponse);
                if (botResponse.trim() && placeholder) {
                  extractAndAttach(placeholder, botResponse);
                  try { const ss = readFromElement(placeholder); if (ss && ss.length) emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: ss }); } catch(_){ }
                }
                shouldPersistBot = botResponse.trim().length > 0;
                textForPersistence = botResponse;
                break;
              }
            } catch (_) {}
          }
        }
        if (forceWeb && typeof window.completeWebSearch === 'function') {
          try { window.completeWebSearch(); } catch (_) {}
        }
      }

      if (shouldPersistBot) {
        await persistBotResponse();
        shouldPersistBot = false;
        textForPersistence = '';
      }
      emit(EVENTS.MESSAGE_FINISHED, { chatId });
    } catch (err) {
      const errorMessage = err && err.message ? String(err.message) : '';
      const isAbort = err && (err.name === 'AbortError' || errorMessage.toLowerCase().includes('aborted'));
      if (isAbort) {
        if (responseStarted && container) {
          finalizeBotMessage(container, botResponse);
          if (botResponse.trim() && placeholder) {
            try {
              extractAndAttach(placeholder, botResponse);
              const ss = readFromElement(placeholder);
              if (ss && ss.length) emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: ss });
            } catch (_) {}
          }
          shouldPersistBot = botResponse.trim().length > 0;
          textForPersistence = botResponse;
          await persistBotResponse();
          shouldPersistBot = false;
          textForPersistence = '';
        } else {
          if (placeholder && typeof placeholder.remove === 'function') {
            try { placeholder.remove(); } catch (_) {}
          }
          placeholderRemoved = true;
          shouldPersistBot = false;
          textForPersistence = '';
        }
        emit(EVENTS.MESSAGE_FINISHED, { chatId });
      } else {
        if (container) container.textContent = 'Error retrieving response.';
        emit(EVENTS.ERROR, { chatId, error: String(err && err.message || err) });
      }
    } finally {
      stopGeneration();
      emit(EVENTS.GENERATION_STATE, { chatId, generating: false });
    }
  }

  var controller = { sendMessage, syncMessageCache, clearCachedMessages };

  // Listen for legacy abort signals and stop generation cleanly
  on(EVENTS.ABORT, () => {
    try { stopGeneration(); } catch (_) {}
    emit(EVENTS.ABORTED, {});
  });

  // Agents UI module: adds agent selector to the chat plus menu

  function ensureModalManager() {
    if (!window.modalManager) {
      try { window.modalManager = new ModalManager(); } catch (_) {}
    }
  }

  function currentIconFor(agent) {
    const overrides = (window.agentIconOverrides || {});
    return (overrides[agent.name]) || agent.icon;
  }

  function renderAgentButtonSelected(agentBtn, agent) {
    const icon = currentIconFor(agent);
    const iconHtml = icon ? `<span class="agent-emoji">${icon}</span>` : '<i class="fas fa-robot"></i>';
    agentBtn.innerHTML = `${iconHtml}<span class="btn-text">${agent.name}</span><i class="fas fa-times clear-agent" title="Clear agent selection"></i>`;
    agentBtn.title = `Selected agent: ${agent.name}${agent.description ? ' - ' + agent.description : ''}`;
    agentBtn.classList.add('selected');
    const clearIcon = agentBtn.querySelector('.clear-agent');
    if (clearIcon) {
      clearIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSelectedAgent();
        renderAgentButtonCleared(agentBtn);
        emit(EVENTS.GENERATION_STATE, { chatId: (window.currentChatId || null), generating: false });
        ensureModalManager();
        if (window.modalManager) window.modalManager.showToast({ message: 'Agent selection cleared', type: 'info', duration: 2000 });
      });
    }
  }

  function renderAgentButtonCleared(agentBtn) {
    agentBtn.innerHTML = '<i class="fas fa-robot"></i><span class="btn-text">Select Agent</span>';
    agentBtn.title = 'Select an agent to use in chat';
    agentBtn.classList.remove('selected');
  }

  function positionSubmenu(submenu, anchorEl) {
    submenu.classList.add('submenu-fixed', 'is-invisible');
    document.body.appendChild(submenu);
    const rect = anchorEl.getBoundingClientRect();
    const submenuHeight = submenu.offsetHeight;
    const submenuWidth = submenu.offsetWidth;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;
    let topPos;
    if (spaceAbove >= submenuHeight) {
      topPos = rect.top - submenuHeight - 5;
    } else if (spaceBelow >= submenuHeight) {
      topPos = rect.bottom + 5;
    } else {
      topPos = spaceAbove > spaceBelow ? Math.max(5, rect.top - submenuHeight) : Math.min(rect.bottom, viewportHeight - submenuHeight - 5);
    }
    const leftPos = Math.max(5, Math.min(rect.left, viewportWidth - submenuWidth - 5));
    submenu.style.top = `${topPos}px`;
    submenu.style.left = `${leftPos}px`;
    submenu.style.zIndex = '1300';
    submenu.classList.remove('is-invisible');
  }

  function showAgentSubmenu(anchorEl, agents, onSelect) {
    const submenu = document.createElement('div');
    submenu.className = 'agent-submenu note-submenu';
    submenu.innerHTML = `
    <div class="note-search-container">
      <input type="text" class="note-search-input" placeholder="Search agents...">
    </div>
    <div class="notes-list-container">
      <ul class="notes-list">
        ${agents.map(agent => {
          const icon = currentIconFor(agent);
          const iconHtml = icon ? `<span class=\"agent-emoji\">${icon}</span>` : '<i class=\"fas fa-robot\"></i>';
          return `<li class=\"note-item agent-item\" data-agent-name=\"${agent.name}\">${iconHtml}<span title=\"${agent.description || agent.name}\">${agent.name}</span></li>`;
        }).join('')}
      </ul>
      ${agents.length === 0 ? '<div class="no-notes-message">No agents available</div>' : ''}
    </div>
  `;
    positionSubmenu(submenu, anchorEl);

    const searchInput = submenu.querySelector('.note-search-input');
    setTimeout(() => searchInput && searchInput.focus(), 10);
    searchInput && searchInput.addEventListener('input', () => {
      const term = searchInput.value.toLowerCase();
      submenu.querySelectorAll('.agent-item').forEach(item => {
        const name = item.querySelector('span').textContent.toLowerCase();
        if (name.includes(term)) {
          item.classList.remove('is-hidden');
        } else {
          item.classList.add('is-hidden');
        }
      });
    });

    const listEl = submenu.querySelector('.notes-list');
    listEl.addEventListener('click', (e) => {
      const li = e.target.closest('.agent-item');
      if (!li) return;
      const agentName = li.dataset.agentName;
      const agent = agents.find(a => a.name === agentName);
      close();
      onSelect && onSelect(agent);
    });

    function onKey(e) {
      const items = Array.from(submenu.querySelectorAll('.agent-item')).filter(i => !i.classList.contains('is-hidden'));
      const selected = submenu.querySelector('.agent-item.selected');
      let idx = selected ? items.indexOf(selected) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < items.length - 1) { selected && selected.classList.remove('selected'); items[idx + 1].classList.add('selected'); items[idx + 1].scrollIntoView({ block: 'nearest' }); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) { selected && selected.classList.remove('selected'); items[idx - 1].classList.add('selected'); items[idx - 1].scrollIntoView({ block: 'nearest' }); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = selected || items[0];
        if (target) {
          const agent = agents.find(a => a.name === target.dataset.agentName);
          close();
          onSelect && onSelect(agent);
        }
      } else if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
    searchInput && searchInput.addEventListener('keydown', onKey);

    function clickOutside(e) { if (!submenu.contains(e.target) && e.target !== anchorEl) close(); }
    function close() {
      document.removeEventListener('mousedown', clickOutside);
      submenu.remove();
    }
    document.addEventListener('mousedown', clickOutside);
    return submenu;
  }

  function renderOrUpdateAgentPill(container, agent) {
    if (!container) return;
    let pill = container.querySelector('.agent-pill');
    if (!agent) {
      if (pill) pill.remove();
      return;
    }
    const icon = currentIconFor(agent);
    const iconHtml = icon ? `<span class="agent-emoji">${icon}</span>` : '<i class="fas fa-robot"></i>';
    if (!pill) {
      pill = document.createElement('button');
      pill.className = 'agent-pill';
      pill.title = `Selected agent: ${agent.name}`;
      pill.innerHTML = `${iconHtml}<span class="text">${agent.name}</span><span class="x" title="Clear">×</span>`;
      container.appendChild(pill);
    } else {
      pill.title = `Selected agent: ${agent.name}`;
      pill.innerHTML = `${iconHtml}<span class="text">${agent.name}</span><span class="x" title="Clear">×</span>`;
    }
    // Open submenu when clicking the main area of the pill (not the X)
    pill.addEventListener('click', async (e) => {
      if (e.target && (e.target.closest('.x'))) return; // ignore clear click here
      e.stopPropagation();
      try {
        const data = await listAgents();
        const agents = data.agents || [];
        showAgentSubmenu(pill, agents, (next) => {
          if (!next) return;
          setSelectedAgent(next);
          renderOrUpdateAgentPill(container, next);
          ensureModalManager();
          if (window.modalManager) window.modalManager.showToast({ message: `Agent "${next.name}" selected`, type: 'success', duration: 2000 });
        });
      } catch (err) {
        console.error('Error loading agents:', err);
        ensureModalManager();
        if (window.modalManager) window.modalManager.showToast({ message: 'Failed to load agents. Please try again.', type: 'error', duration: 3000 });
      }
    }, { once: true });
    // Clear selection when clicking X
    const x = pill.querySelector('.x');
    if (x) {
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSelectedAgent();
        renderOrUpdateAgentPill(container, null);
        ensureModalManager();
        if (window.modalManager) window.modalManager.showToast({ message: 'Agent selection cleared', type: 'info', duration: 2000 });
      }, { once: true });
    }
  }

  function addAgentSelectorToPlusMenu() {
    const plusMenuContent = document.querySelector('.chat-plus-menu .chat-plus-menu-content');
    if (!plusMenuContent || document.getElementById('agentSelectorBtn')) return;
    const agentBtn = document.createElement('button');
    agentBtn.id = 'agentSelectorBtn';
    agentBtn.className = 'input-btn agent-selector-btn chat-plus-menu-btn';
    agentBtn.innerHTML = '<i class="fas fa-robot"></i><span class="btn-text">Select Agent</span>';
    agentBtn.title = 'Select an agent to use in chat';
    agentBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const data = await listAgents();
        const agents = data.agents || [];
        ensureModalManager();
        showAgentSubmenu(agentBtn, agents, (agent) => {
          if (!agent) return;
          setSelectedAgent(agent);
          renderAgentButtonSelected(agentBtn, agent);
          ensureModalManager();
          if (window.modalManager) window.modalManager.showToast({ message: `Agent "${agent.name}" selected`, type: 'success', duration: 2000 });
        });
      } catch (err) {
        console.error('Error loading agents:', err);
        ensureModalManager();
        if (window.modalManager) window.modalManager.showToast({ message: 'Failed to load agents. Please try again.', type: 'error', duration: 3000 });
      }
    };
    plusMenuContent.appendChild(agentBtn);

    // Also render an inline agent pill to the left of the textarea
    const leftBtns = document.querySelector('.input-buttons-left');
    renderOrUpdateAgentPill(leftBtns, (getSelectedAgentLocal && getSelectedAgentLocal()) || null);

    // Live-update icon when agent icon changes in Agents tab
    window.agentIconOverrides = window.agentIconOverrides || {};
    document.addEventListener('agent:icon-updated', (e) => {
      try {
        const detail = e.detail || {};
        if (!detail.name) return;
        window.agentIconOverrides[detail.name] = detail.icon;
        const sel = getSelectedAgentLocal && getSelectedAgentLocal();
        if (sel && sel.name === detail.name) {
          renderAgentButtonSelected(agentBtn, sel);
          const leftBtns = document.querySelector('.input-buttons-left');
          renderOrUpdateAgentPill(leftBtns, sel);
        }
      } catch {}
    });

    // Keep pill in sync when selection changes elsewhere (optional future event)
    document.addEventListener('chat:state-changed', () => {
      const sel = getSelectedAgentLocal && getSelectedAgentLocal();
      const leftBtns = document.querySelector('.input-buttons-left');
      renderOrUpdateAgentPill(leftBtns, sel || null);
    });
  }

  var agents_ui = { addAgentSelectorToPlusMenu };

  var agentsUI = /*#__PURE__*/Object.freeze({
    __proto__: null,
    addAgentSelectorToPlusMenu: addAgentSelectorToPlusMenu,
    default: agents_ui
  });

  // File Viewer state helpers
  function createInitialState() {
    return {
      isVisible: false,
      currentFile: null,
      selectedDocumentInModal: null,
      isLoadingDocument: false,
      isDragging: false,
      startX: 0,
      startWidth: 0,
      notesEditorInstance: null,
      currentNoteId: null,
      currentNoteName: 'Untitled Note',
      currentNoteTags: '',
      currentNoteCreatedAt: null,
      pendingNoteData: null,
      tempNoteContent: null,
      hasUnsavedChanges: false,
      tempNoteSessionKey: null,
      originalControlsHTML: null,
      originalFileTypeLabel: null,
      originalFileTypeIcon: null,
      currentPdfUrl: null,
      currentView: 'preview',
      _modalTags: [],
      _modalTagColor: 'default',
      _mathTypesetTimer: null,
    };
  }

  function applyState(target, state) {
    Object.assign(target, state);
  }

  // Tag picker utilities migrated from legacy class
  function initModalTagPicker(containerId, existingCsv) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const existing = (existingCsv || '').split(',').map(s => s.trim()).filter(Boolean);
      // store as objects: { name, color, id }
      this._modalTags = Array.from(new Set(existing)).map(name => ({ name, color: 'default' }));
      this._modalTagColor = 'default';
      const COLORS = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];
      const cache = new Map();
      const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
      const debounce = (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
      const apiListTags = async (q) => {
          const key = `q:${q||''}`;
          if (cache.has(key)) return cache.get(key);
          const params = new URLSearchParams(); if (q) params.set('q', q); params.set('limit','50');
          const res = await fetch(`/api/tags?${params.toString()}`).catch(()=>null);
          if (!res || !res.ok) return [];
          const data = await res.json().catch(()=>({tags:[]}));
          const list = data.tags || [];
          cache.set(key, list); return list;
      };
      const apiCreateTag = async (name, color='default') => {
          try {
              const res = await fetch('/api/tags', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, color }) });
              if (!res.ok) throw new Error('create failed');
              const tag = await res.json();
              cache.clear();
              return tag;
          } catch { return null; }
      };
      container.innerHTML = `
        <div class="tag-menu-section">
            <div class="tag-menu-label">Current tags</div>
            <div class="tag-bar tag-bar--compact" id="modalTagBar"></div>
        </div>
        <div class="tag-menu-section">
            <div class="tag-input-wrapper">
                <input type="text" class="tag-search-input tag-input" id="modalTagInput" placeholder="Type and press Enter…" aria-label="Add tag" />
                <div class="tag-suggestions" id="modalTagSuggestions" role="listbox" aria-label="Tag suggestions"></div>
            </div>
        </div>
        <div class="tag-menu-section">
            <div class="tag-menu-label">Color</div>
            <div class="tag-color-grid" id="modalTagColorGrid"></div>
        </div>
    `;
      const input = container.querySelector('#modalTagInput');
      const bar = container.querySelector('#modalTagBar');
      const suggestions = container.querySelector('#modalTagSuggestions');
      const grid = container.querySelector('#modalTagColorGrid');
      const renderBar = () => {
          bar.innerHTML = '';
          this._modalTags.forEach(t => {
              const pill = document.createElement('span');
              pill.className = `tag-pill tag-${t.color||'default'}`;
              pill.innerHTML = `<span class=\"tag-name\">${t.name}</span><button class=\"tag-remove\" aria-label=\"Remove tag\">×</button>`;
              pill.querySelector('.tag-remove').addEventListener('click', () => {
                  this._modalTags = this._modalTags.filter(x => x.name !== t.name);
                  renderBar();
              });
              bar.appendChild(pill);
          });
      };
      renderBar();
      const addTag = (tagOrName) => {
          const clean = (typeof tagOrName === 'string' ? tagOrName : tagOrName?.name || '').trim();
          if (!clean) return;
          if (!this._modalTags.find(t => t.name.toLowerCase() === clean.toLowerCase())) {
              const color = typeof tagOrName === 'string' ? (this._modalTagColor || 'default') : (tagOrName.color || 'default');
              const id = typeof tagOrName === 'string' ? null : (tagOrName.id || null);
              this._modalTags.push({ name: clean, color, id });
              this._modalTags.sort((a,b)=> collator.compare(a.name,b.name));
              renderBar();
          }
      };
      // Render color swatches
      if (grid) {
          grid.innerHTML = '';
          COLORS.forEach(c => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = `tag-color-swatch dot dot-${c}` + (this._modalTagColor===c?' selected':'');
              btn.title = c;
              btn.addEventListener('click', ()=>{
                  this._modalTagColor = c;
                  // update selection styles
                  grid.querySelectorAll('.tag-color-swatch').forEach(el=>el.classList.remove('selected'));
                  btn.classList.add('selected');
              });
              grid.appendChild(btn);
          });
      }
      // Suggestions search
      const search = debounce(async ()=>{
          const q = (input.value||'').trim();
          const list = await apiListTags(q);
          suggestions.innerHTML = '';
          const chosen = new Set(this._modalTags.map(t=>t.name.toLowerCase()));
          const filtered = list.filter(t=>!chosen.has((t.name||'').toLowerCase()));
          if (q && !filtered.find(t=>t.name.toLowerCase()===q.toLowerCase())){
              const create = document.createElement('div');
              create.className = 'tag-suggestion create';
              create.textContent = `Create "${q}"`;
              create.addEventListener('click', async ()=>{
                  const tag = await apiCreateTag(q, this._modalTagColor || 'default');
                  addTag(tag || q);
                  input.value=''; suggestions.innerHTML='';
              });
              suggestions.appendChild(create);
          }
          filtered.slice(0,10).forEach(t=>{
              const el = document.createElement('div');
              el.className = 'tag-suggestion';
              el.innerHTML = `<span class="dot dot-${t.color||'default'}"></span>${t.name} ${t.usage?`<span class=\"muted\">(${t.usage})</span>`:''}`;
              el.addEventListener('click', ()=>{ addTag(t); input.value=''; suggestions.innerHTML=''; });
              suggestions.appendChild(el);
          });
      }, 180);
      input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
              e.preventDefault();
              const val = (input.value||'').trim();
              if (val) addTag(val);
              input.value = '';
          }
          if (e.key === 'Escape') {
              input.blur();
          }
      });
      input.addEventListener('input', ()=> search());
      input.addEventListener('focus', ()=> search());
      input.addEventListener('blur', () => { setTimeout(()=>{ suggestions.innerHTML = ''; }, 120); });
  }

  function getModalSelectedTagNames() {
      return Array.isArray(this._modalTags) ? this._modalTags.map(t=>t.name) : [];
  }

  // Event binding helpers
  function initializeEventHandlers() {
      // File viewer toggle
      document.getElementById('fileViewerToggle')?.addEventListener('click', () => {
          this.toggleFileViewer();
      });

      // Close button handler
      document.getElementById('fileViewerClose')?.addEventListener('click', () => {
          this.hideFileViewer();
      });

      // Document selection and management
      document.getElementById('selectDocumentBtn')?.addEventListener('click', () => {
          this.openDocumentModal();
      });

      document.getElementById('manageDocumentsBtn')?.addEventListener('click', () => {
          this.openDocumentModal();
      });

      // Analysis buttons
      document.getElementById('generateSummaryBtn')?.addEventListener('click', () => {
          this.performAnalysis('summary');
      });

      document.getElementById('extractReferencesBtn')?.addEventListener('click', () => {
          this.performAnalysis('references');
      });

      document.getElementById('findHighlightsBtn')?.addEventListener('click', () => {
          this.performAnalysis('highlights');
      });

      document.getElementById('suggestInsightsBtn')?.addEventListener('click', () => {
          this.performAnalysis('insights');
      });

      // Listen for RAG document updates
      document.addEventListener('rag:documents-updated', () => {
          this.refreshDocumentList();
          this.updateToggleButtonState(this.isVisible);
      });

      // Listen for chat changes
      document.addEventListener('chat:changed', () => {
          this.refreshDocumentList();
          this.clearSelection();
          this.updateToggleButtonState(this.isVisible);
      });

      // Listen for highlight events from document actions
      document.addEventListener('applyHighlights', (e) => {
          this.applyHighlights(e.detail.highlights);
      });
  }

  // Layout and visibility controls
  function initializeResizer() {
      const resizer = document.getElementById('resizeDivider');
      const fileViewerPanel = document.getElementById('fileViewerPanel');
      
      if (!resizer || !fileViewerPanel) return;

      resizer.addEventListener('mousedown', (e) => {
          this.isDragging = true;
          this.startX = e.clientX;
          this.startWidth = parseInt(document.defaultView.getComputedStyle(fileViewerPanel).width, 10);
          
          resizer.classList.add('resizing');
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
          
          e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
          if (!this.isDragging) return;
          
          const width = this.startWidth + e.clientX - this.startX;
          const minWidth = 250;
          const maxWidth = window.innerWidth * 0.8;
          
          if (width >= minWidth && width <= maxWidth) {
              fileViewerPanel.style.width = width + 'px';
              
              // Force layout recalculation for chat container
              const chatContainer = document.querySelector('.chat-with-viewer-container .chat-container');
              if (chatContainer) {
                  // Trigger reflow to ensure proper layout adjustment
                  chatContainer.style.width = `calc(100% - ${width}px)`;
                  // Reset to flex after a frame to maintain responsive behavior
                  requestAnimationFrame(() => {
                      chatContainer.style.width = '';
                      // Dispatch resize event to trigger any layout updates
                      window.dispatchEvent(new Event('resize'));
                  });
              }
          }
      });

      document.addEventListener('mouseup', () => {
          if (this.isDragging) {
              this.isDragging = false;
              resizer.classList.remove('resizing');
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
              
              // Final layout update after resize is complete
              requestAnimationFrame(() => {
                  window.dispatchEvent(new Event('resize'));
                  // Force reflow on chat messages to ensure proper scrolling
                  const chatMessages = document.querySelector('.chat-with-viewer-container .chat-messages');
                  if (chatMessages) {
                      chatMessages.scrollTop = chatMessages.scrollTop; // Force reflow
                  }
              });
          }
      });
  }

  function toggleFileViewer() {
      // Check if there are documents before allowing toggle
      if (!this.isVisible) {
          // Check if current chat has documents
          const currentChatId = window.currentChatId;
          if (!currentChatId) {
              console.log('Cannot open fileviewer: No chat selected');
              if (window.modalManager) {
                  window.modalManager.showToast({
                      message: 'Please select a chat first',
                      type: 'warning',
                      duration: 2000
                  });
              }
              return;
          }
          
          // Check if documents exist before showing
          this.checkAndShowFileViewer();
      } else {
          this.hideFileViewer();
      }
  }

  async function checkAndShowFileViewer() {
      const currentChatId = window.currentChatId;
      if (!currentChatId) {
          console.log('No chat selected, cannot show fileviewer');
          return;
      }

      try {
          // Check if documents exist for this chat
          const response = await fetch(`/api/rag/documents/${currentChatId}`);
          if (response.ok) {
              const result = await response.json();
              const documents = result.documents || [];
              
              if (documents.length === 0) {
                  console.log('No documents in this chat');
                  if (window.modalManager) {
                      window.modalManager.showToast({
                          message: 'No documents uploaded in this chat yet',
                          type: 'info',
                          duration: 2500
                      });
                  }
                  return;
              }
              
              // Documents exist, safe to show fileviewer
              this.showFileViewer();
          } else {
              console.log('Failed to check documents');
          }
      } catch (error) {
          console.error('Error checking documents:', error);
      }
  }

  function showFileViewer() {
      if (this.isVisible) return;

      const panel = document.getElementById('fileViewerPanel');
      const divider = document.getElementById('resizeDivider');
      
      if (panel) {
          panel.classList.remove('is-hidden');
          divider?.classList.remove('is-hidden');
          this.isVisible = true;
          
          this.updateToggleButtonState(true);
          
          // Load documents if no file is selected
          if (!this.currentFile) {
              this.refreshDocumentList();
          }

          // Notify document actions manager
          if (typeof window !== 'undefined' && window.document) {
              window.document.dispatchEvent(new CustomEvent('fileViewerStateChanged', {
                  detail: { isOpen: true }
              }));
          }
          
          console.log('FileViewer: Shown');
      }
  }

  function hideFileViewer() {
      if (!this.isVisible) return;

      const panel = document.getElementById('fileViewerPanel');
      const divider = document.getElementById('resizeDivider');
      
      if (panel) {
          panel.classList.add('is-hidden');
          divider?.classList.add('is-hidden');
          this.isVisible = false;
          
          this.updateToggleButtonState(false);

          // Notify document actions manager
          if (typeof window !== 'undefined' && window.document) {
              window.document.dispatchEvent(new CustomEvent('fileViewerStateChanged', {
                  detail: { isOpen: false }
              }));
          }
          
          console.log('FileViewer: Hidden');
      }
  }

  function updateToggleButtonState(isVisible) {
      const toggleBtn = document.getElementById('fileViewerToggle');
      if (toggleBtn) {
          toggleBtn.style.display = 'flex';
          toggleBtn.style.opacity = '1';
          toggleBtn.disabled = false;
          toggleBtn.title = 'Toggle Document Viewer';
          if (isVisible) {
              toggleBtn.classList.add('active');
          } else {
              toggleBtn.classList.remove('active');
          }
      }
  }

  // Preview rendering helpers
  async function loadFilePreview(filename) {
      const previewContent = document.getElementById('filePreviewContent');
      if (!previewContent) return;

      previewContent.innerHTML = '<div class="loading">Loading preview...</div>';

      try {
          // Get file metadata first
          const response = await fetch(`/api/rag/document-content/${window.currentChatId}/${encodeURIComponent(filename)}`);
          
          if (response.ok) {
              const result = await response.json();
              const content = result.content || 'Content not available';
              const fileType = result.file_type || this.getFileExtension(filename);
              
              // For PDFs, try to load the original file for better viewing
              if (fileType === 'pdf') {
                  await this.loadPdfPreview(filename, result);
              } else if (fileType === 'docx' || fileType === 'doc') {
                  // For DOC/DOCX files, try to load as converted PDF first
                  await this.loadPdfPreview(filename, result);
              } else {
                  // Display content with basic formatting for other file types
                  this.displayContent(content, filename);
              }
          } else {
              previewContent.innerHTML = `
                <div class="preview-unavailable">
                    <i class="fas fa-file"></i>
                    <p>Preview not available for this file type</p>
                    <p class="file-info">File: ${filename}</p>
                </div>
            `;
          }
      } catch (error) {
          console.error('Error loading file preview:', error);
          previewContent.innerHTML = `
            <div class="preview-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading file preview</p>
            </div>
        `;
      }

      // Notify document actions manager about document selection (include server path when available)
      if (typeof window !== 'undefined' && window.document) {
          const detail = {
              filename: filename,
              chatId: window.currentChatId,
              timestamp: Date.now()
          };
          if (this.currentFile && this.currentFile.full_path) {
              detail.path = this.currentFile.full_path;
          }
          window.document.dispatchEvent(new CustomEvent('documentSelected', { detail }));
      }
  }


  async function loadPdfPreview$1(filename, fallbackData) {
      const previewContent = document.getElementById('filePreviewContent');
      if (!previewContent) return;
      
      const fileExt = this.getFileExtension(filename).toLowerCase();
      const isDocFormat = fileExt === 'doc' || fileExt === 'docx';
      const isPdfFormat = fileExt === 'pdf';
      
      // Determine appropriate icon and label
      let iconClass = 'fas fa-file';
      let typeLabel = 'Document';
      
      if (isPdfFormat) {
          iconClass = 'fas fa-file-pdf';
          typeLabel = 'PDF Document';
      } else if (isDocFormat) {
          iconClass = 'fas fa-file-word';
          typeLabel = 'Word Document';
      }
      
      // Update file viewer header with file type info and controls
      this.updateFileViewerHeader(filename, typeLabel, iconClass, isDocFormat);

      // Keep the existing styled loading state instead of replacing it
      // The "Loading preview..." message is already showing and styled
      
      // Set up instance reference
      FileViewerRedesigned.instance = this;
      
      try {
          // Try to load the original PDF file or converted PDF
          const chatId = window.currentChatId || 'default';
          const pdfResponse = await fetch(`/api/rag/document-file/${chatId}/${encodeURIComponent(filename)}`);
          
          if (pdfResponse.ok) {
              // Always use our PDF.js-based viewer for accurate, scriptable highlights
              const pdfEndpoint = `/api/rag/document-file/${chatId}/${encodeURIComponent(filename)}`;
              // Use the full pdf.js default viewer UI vendored under static/pdfjs
              const viewerUrl = `/static/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfEndpoint)}`;

              previewContent.innerHTML = `
                <div class="pdf-viewer-container">
                    <div class="pdf-content-container">
                        <iframe 
                            src="${viewerUrl}"
                            class="pdf-iframe"
                            frameborder="0"
                            title="Document Preview"
                            onload="console.log('PDF.js viewer loaded')">
                            <p>Your browser doesn't support PDF viewing. <a href="${pdfEndpoint}" target="_blank">Click here to view the document</a></p>
                        </iframe>
                    </div>
                    <div class="pdf-text-fallback" style="display: none;">
                        ${this.formatPdfContent(fallbackData.content)}
                    </div>
                </div>
            `;

              // Update header with full PDF controls (open in new tab should open original PDF)
              this.updateFileViewerHeader(filename, typeLabel, {
                  showPdfToggle: true,
                  isPdfView: true,
                  pdfUrl: pdfEndpoint
              });

              // Store endpoint for highlight actions
              this.currentPdfUrl = pdfEndpoint;
              console.log('Document loaded with PDF.js viewer');
              return;
          } else if (pdfResponse.status === 422) {
              // Conversion failed, try to get error details
              try {
                  const errorData = await pdfResponse.json();
                  if (errorData.fallback) {
                      console.log('Document conversion failed, showing text version');
                      this.showTextVersion(filename);
                      return;
                  }
              } catch (e) {
                  // Ignore JSON parsing errors, fall through to text version
              }
          }
          
          // If we reach here, PDF serving failed - show text fallback
          console.log('PDF serving failed, showing text version');
          this.showTextVersion(filename);
              
      } catch (error) {
          console.error('Error loading PDF preview:', error);
          this.showTextVersion(filename);
      }
  }


  async function showTextVersion(filename) {
      try {
          const chatId = window.currentChatId || 'default';
          const res = await fetch(`/api/rag/document-content/${chatId}/${encodeURIComponent(filename)}`);
          if (!res.ok) {
              const previewContent = document.getElementById('filePreviewContent');
              if (previewContent) {
                  previewContent.innerHTML = `
                    <div class="preview-unavailable">
                        <i class="fas fa-file"></i>
                        <p>Preview not available</p>
                        <p class="file-info">File: ${filename}</p>
                    </div>
                `;
              }
              return;
          }
          const data = await res.json();
          const ext = this.getFileExtension(filename);
          if (ext === 'pdf') {
              this.showPdfTextFallback(filename, data);
          } else {
              this.displayContent(data.content || '', filename);
          }
      } catch (e) {
          console.error('Error showing text version:', e);
      }
  }


  function showPdfTextFallback$1(filename, data) {
      const previewContent = document.getElementById('filePreviewContent');
      if (!previewContent) return;
      
      previewContent.innerHTML = `
        <div class="pdf-text-viewer">
            <div class="file-type-header">
                <div class="file-type-info">
                    <i class="fas fa-file-pdf"></i>
                    <span class="file-type-label">PDF Document (Text View)</span>
                    <span class="file-name">${filename}</span>
                </div>
            </div>
            <div class="pdf-text-content">
                ${this.formatPdfContent(data.content)}
            </div>
            ${data.truncated ? '<div class="truncation-notice"><i class="fas fa-info-circle"></i> Content has been truncated for preview</div>' : ''}
        </div>
    `;
  }

  // Clean up blob URLs when switching files

  function cleanup$1() {
      if (this.currentPdfUrl) {
          URL.revokeObjectURL(this.currentPdfUrl);
          this.currentPdfUrl = null;
      }
  }


  function displayContent(content, filename) {
      const previewContent = document.getElementById('filePreviewContent');
      if (!previewContent) return;

      this.getFileExtension(filename);
      const fileType = this.detectFileType(filename);
      const typeLabel = this.getFileTypeLabel(fileType);
      const iconClass = this.getFileIcon(filename);
      
      // Update file viewer header with file type info
      this.updateFileViewerHeader(filename, typeLabel, iconClass, false);
      
      // Clear previous content
      previewContent.innerHTML = '';
      
      // Create content wrapper
      const contentWrapper = document.createElement('div');
      contentWrapper.className = `document-content file-type-${fileType}`;
      
      // Format content based on file type (no separate header needed since it's in main header now)
      const formattedContent = this.formatContentByType(content, fileType, filename);
      
      const contentBody = document.createElement('div');
      contentBody.className = 'file-content-body';
      contentBody.innerHTML = formattedContent;
      contentWrapper.appendChild(contentBody);
      
      previewContent.appendChild(contentWrapper);
      
      // Apply post-processing (syntax highlighting, etc.)
      this.applyContentEnhancements(contentBody, fileType, filename);
  }


  function getFileExtension(filename) {
      return filename.split('.').pop().toLowerCase();
  }


  function detectFileType(filename) {
      const ext = this.getFileExtension(filename);
      const typeMap = {
          // Documents
          'pdf': 'pdf',
          'doc': 'word',
          'docx': 'word',
          'odt': 'word',
          'rtf': 'word',
          
          // Spreadsheets
          'xlsx': 'excel',
          'xls': 'excel',
          'csv': 'csv',
          'ods': 'excel',
          
          // Presentations
          'ppt': 'powerpoint',
          'pptx': 'powerpoint',
          'odp': 'powerpoint',
          
          // Text files
          'txt': 'text',
          'md': 'markdown',
          'markdown': 'markdown',
          
          // Code files
          'js': 'javascript',
          'ts': 'typescript',
          'py': 'python',
          'java': 'java',
          'cpp': 'cpp',
          'c': 'c',
          'cs': 'csharp',
          'php': 'php',
          'rb': 'ruby',
          'go': 'go',
          'rs': 'rust',
          'swift': 'swift',
          'kt': 'kotlin',
          'scala': 'scala',
          
          // Web files
          'html': 'html',
          'htm': 'html',
          'xml': 'xml',
          'css': 'css',
          'scss': 'scss',
          'sass': 'sass',
          'less': 'less',
          'json': 'json',
          'yaml': 'yaml',
          'yml': 'yaml',
          
          // Config files
          'ini': 'config',
          'conf': 'config',
          'cfg': 'config',
          'toml': 'config',
          
          // Images
          'jpg': 'image',
          'jpeg': 'image',
          'png': 'image',
          'gif': 'image',
          'bmp': 'image',
          'svg': 'image',
          'webp': 'image',
          
          // Archives
          'zip': 'archive',
          'rar': 'archive',
          '7z': 'archive',
          'tar': 'archive',
          'gz': 'archive'
      };
      
      return typeMap[ext] || 'unknown';
  }


  function getFileTypeLabel(fileType) {
      const labels = {
          'pdf': 'PDF',
          'word': 'Word',
          'excel': 'Excel',
          'csv': 'CSV',
          'powerpoint': 'PowerPoint',
          'text': 'Text',
          'markdown': 'Markdown',
          'javascript': 'JavaScript',
          'typescript': 'TypeScript',
          'python': 'Python',
          'java': 'Java',
          'cpp': 'C++',
          'c': 'C',
          'csharp': 'C#',
          'php': 'PHP',
          'ruby': 'Ruby',
          'go': 'Go',
          'rust': 'Rust',
          'swift': 'Swift',
          'kotlin': 'Kotlin',
          'scala': 'Scala',
          'html': 'HTML',
          'xml': 'XML',
          'css': 'CSS',
          'scss': 'SCSS',
          'sass': 'SASS',
          'less': 'LESS',
          'json': 'JSON',
          'yaml': 'YAML',
          'config': 'Config',
          'image': 'Image',
          'archive': 'Archive',
          'unknown': 'Document'
      };
      
      return labels[fileType] || 'Document';
  }


  function formatContentByType(content, fileType, filename) {
      switch (fileType) {
          case 'pdf':
              return this.formatPdfContent(content);
          case 'word':
              return this.formatWordContent(content);
          case 'excel':
          case 'csv':
              return this.formatSpreadsheetContent(content, fileType);
          case 'powerpoint':
              return this.formatPresentationContent(content);
          case 'markdown':
              return this.formatMarkdownContent(content);
          case 'json':
              return this.formatJsonContent(content);
          case 'xml':
              return this.formatXmlContent(content);
          case 'yaml':
              return this.formatYamlContent(content);
          case 'html':
              return this.formatHtmlContent(content);
          case 'css':
          case 'scss':
          case 'sass':
          case 'less':
              return this.formatStylesheetContent(content, fileType);
          case 'javascript':
          case 'typescript':
          case 'python':
          case 'java':
          case 'cpp':
          case 'c':
          case 'csharp':
          case 'php':
          case 'ruby':
          case 'go':
          case 'rust':
          case 'swift':
          case 'kotlin':
          case 'scala':
              return this.formatCodeContent(content, fileType);
          case 'config':
              return this.formatConfigContent(content);
          case 'image':
              return this.formatImageContent(content, filename);
          default:
              return this.formatTextContent(content);
      }
  }


  function formatPdfContent(content) {
      // Enhanced PDF content formatting with better structure preservation
      if (!content || content.trim() === '') {
          return '<p class="no-content">No content available</p>';
      }
      
      // Split content into pages if page markers are present
      const pages = content.split(/(?:Page\s+\d+|---+\s*Page\s*\d+\s*---+|^\s*\d+\s*$)/im);
      
      if (pages.length > 1) {
          return pages.map((page, index) => {
              if (index === 0 && !page.trim()) return '';
              
              const pageNum = index === 0 ? 1 : index;
              const pageContent = this.formatPdfPageContent(page.trim());
              
              return `
                <div class="pdf-page">
                    <div class="page-header">
                        <i class="fas fa-file-pdf"></i>
                        <span class="page-number">Page ${pageNum}</span>
                    </div>
                    <div class="page-content">${pageContent}</div>
                </div>
            `;
          }).filter(p => p).join('');
      }
      
      return `<div class="pdf-content">${this.formatPdfPageContent(content)}</div>`;
  }


  function formatPdfPageContent(content) {
      if (!content || content.trim() === '') {
          return '<p class="no-content">No content available</p>';
      }
      
      // Enhanced text processing for better structure preservation
      let formatted = content;
      
      // Preserve and enhance headings (lines that look like titles)
      formatted = formatted.replace(/^([A-Z][A-Z\s\d\.\-:]{10,80})$/gm, '<h3 class="pdf-heading">$1</h3>');
      
      // Preserve and enhance numbered sections
      formatted = formatted.replace(/^(\d+\.?\s+[A-Z][^.\n]{10,100})$/gm, '<h4 class="pdf-section">$1</h4>');
      
      // Preserve bullet points
      formatted = formatted.replace(/^(\s*)[•\-\*]\s+(.+)$/gm, '$1<li class="pdf-bullet">$2</li>');
      
      // Wrap consecutive bullet points in lists
      formatted = formatted.replace(/(<li class="pdf-bullet">.*?<\/li>)(\s*<li class="pdf-bullet">.*?<\/li>)+/gs, '<ul class="pdf-list">$&</ul>');
      
      // Preserve numbered lists
      formatted = formatted.replace(/^(\s*)(\d+\.)\s+(.+)$/gm, '$1<li class="pdf-numbered" data-number="$2">$3</li>');
      
      // Wrap consecutive numbered items in lists
      formatted = formatted.replace(/(<li class="pdf-numbered".*?<\/li>)(\s*<li class="pdf-numbered".*?<\/li>)+/gs, '<ol class="pdf-numbered-list">$&</ol>');
      
      // Preserve paragraph structure
      formatted = formatted.replace(/\n\s*\n/g, '</p><p class="pdf-paragraph">');
      
      // Wrap in paragraph tags if not already wrapped
      if (!formatted.includes('<p') && !formatted.includes('<h') && !formatted.includes('<li')) {
          formatted = `<p class="pdf-paragraph">${formatted}</p>`;
      } else {
          // Ensure we start with a paragraph if needed
          if (!formatted.startsWith('<')) {
              formatted = `<p class="pdf-paragraph">${formatted}`;
          }
      }
      
      // Clean up any malformed tags
      formatted = formatted.replace(/<p class="pdf-paragraph">\s*<\/p>/g, '');
      formatted = formatted.replace(/<p class="pdf-paragraph">\s*(<[hul])/g, '$1');
      
      return formatted;
  }


  function formatWordContent(content) {
      // Format Word document content with paragraph structure
      const paragraphs = content.split(/\n\s*\n/);
      
      return paragraphs.map(paragraph => {
          const trimmed = paragraph.trim();
          if (!trimmed) return '';
          
          // Detect headings (lines that are short and might be titles)
          if (trimmed.length < 80 && !trimmed.endsWith('.') && !trimmed.includes('\n')) {
              return `<h3 class="document-heading">${this.escapeHtml(trimmed)}</h3>`;
          }
          
          return `<p class="document-paragraph">${this.formatTextContent(trimmed)}</p>`;
      }).join('');
  }


  function formatSpreadsheetContent(content, fileType) {
      if (fileType === 'csv') {
          return this.formatCsvContent(content);
      }
      
      // For Excel files, try to parse as CSV-like content
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length === 0) return '<p>No data available</p>';
      
      // Try to detect if it's tabular data
      const firstLine = lines[0];
      if (firstLine.includes('\t') || firstLine.includes(',')) {
          return this.formatCsvContent(content);
      }
      
      return this.formatTextContent(content);
  }


  function formatCsvContent(content) {
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length === 0) return '<p>No data available</p>';
      
      // Detect delimiter
      const firstLine = lines[0];
      const delimiter = firstLine.includes('\t') ? '\t' : ',';
      
      const rows = lines.map(line => line.split(delimiter));
      const maxColumns = Math.max(...rows.map(row => row.length));
      
      if (rows.length === 0) return '<p>No data available</p>';
      
      let html = '<div class="csv-table-container"><table class="csv-table">';
      
      // Header row
      if (rows.length > 0) {
          html += '<thead><tr>';
          for (let i = 0; i < maxColumns; i++) {
              const cell = rows[0][i] || '';
              html += `<th>${this.escapeHtml(cell)}</th>`;
          }
          html += '</tr></thead>';
      }
      
      // Data rows
      html += '<tbody>';
      for (let i = 1; i < Math.min(rows.length, 101); i++) { // Limit to 100 data rows
          html += '<tr>';
          for (let j = 0; j < maxColumns; j++) {
              const cell = rows[i][j] || '';
              html += `<td>${this.escapeHtml(cell)}</td>`;
          }
          html += '</tr>';
      }
      html += '</tbody></table>';
      
      if (rows.length > 101) {
          html += `<p class="table-truncated">Showing first 100 rows of ${rows.length - 1} total rows</p>`;
      }
      
      html += '</div>';
      return html;
  }


  function formatPresentationContent(content) {
      // Format PowerPoint content with slide structure
      const slides = content.split(/(?:Slide\s+\d+|---+)/i);
      
      if (slides.length > 1) {
          return slides.map((slide, index) => {
              if (index === 0 && !slide.trim()) return '';
              
              const slideNum = index === 0 ? 1 : index;
              const slideContent = this.formatTextContent(slide.trim());
              
              return `
                <div class="presentation-slide">
                    <div class="slide-header">
                        <i class="fas fa-file-powerpoint"></i>
                        Slide ${slideNum}
                    </div>
                    <div class="slide-content">${slideContent}</div>
                </div>
            `;
          }).join('');
      }
      
      return `<div class="presentation-content">${this.formatTextContent(content)}</div>`;
  }


  function formatMarkdownContent(content) {
      // Simple markdown-to-HTML conversion
      let html = content
          // Headers
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
          // Bold and italic
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          // Code blocks
          .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
          .replace(/`(.*?)`/g, '<code>$1</code>')
          // Links
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
          // Lists
          .replace(/^\* (.*$)/gim, '<li>$1</li>')
          .replace(/^- (.*$)/gim, '<li>$1</li>')
          // Line breaks
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br>');
      
      // Wrap in paragraphs and fix lists
      html = '<p>' + html + '</p>';
      html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
      html = html.replace(/<\/ul><ul>/g, '');
      
      return html;
  }


  function formatJsonContent(content) {
      try {
          // Try to parse and pretty-print JSON
          const parsed = JSON.parse(content);
          const prettyJson = JSON.stringify(parsed, null, 2);
          return `<pre class="json-content"><code class="language-json">${this.escapeHtml(prettyJson)}</code></pre>`;
      } catch (e) {
          // If not valid JSON, treat as text
          return `<pre class="json-content"><code>${this.escapeHtml(content)}</code></pre>`;
      }
  }


  function formatXmlContent(content) {
      // Basic XML formatting with indentation
      try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, 'text/xml');
          
          if (xmlDoc.documentElement.nodeName === 'parsererror') {
              throw new Error('Invalid XML');
          }
          
          // Simple indentation
          const formatted = content
              .replace(/></g, '>\n<')
              .split('\n')
              .map(line => line.trim())
              .filter(line => line)
              .join('\n');
          
          return `<pre class="xml-content"><code class="language-xml">${this.escapeHtml(formatted)}</code></pre>`;
      } catch (e) {
          return `<pre class="xml-content"><code>${this.escapeHtml(content)}</code></pre>`;
      }
  }


  function formatYamlContent(content) {
      return `<pre class="yaml-content"><code class="language-yaml">${this.escapeHtml(content)}</code></pre>`;
  }


  function formatHtmlContent(content) {
      return `<pre class="html-content"><code class="language-html">${this.escapeHtml(content)}</code></pre>`;
  }


  function formatStylesheetContent(content, fileType) {
      const language = fileType === 'scss' ? 'scss' : fileType === 'sass' ? 'sass' : fileType === 'less' ? 'less' : 'css';
      return `<pre class="stylesheet-content"><code class="language-${language}">${this.escapeHtml(content)}</code></pre>`;
  }


  function formatCodeContent(content, fileType) {
      const languageMap = {
          'javascript': 'javascript',
          'typescript': 'typescript',
          'python': 'python',
          'java': 'java',
          'cpp': 'cpp',
          'c': 'c',
          'csharp': 'csharp',
          'php': 'php',
          'ruby': 'ruby',
          'go': 'go',
          'rust': 'rust',
          'swift': 'swift',
          'kotlin': 'kotlin',
          'scala': 'scala'
      };
      
      const language = languageMap[fileType] || fileType;
      return `<pre class="code-content"><code class="language-${language}">${this.escapeHtml(content)}</code></pre>`;
  }


  function formatConfigContent(content) {
      return `<pre class="config-content"><code class="language-ini">${this.escapeHtml(content)}</code></pre>`;
  }


  function formatImageContent(content, filename) {
      // For images, we might receive base64 data or a description
      if (content.startsWith('data:image/') || content.startsWith('iVBORw0KGgo') || content.includes('base64')) {
          return `
            <div class="image-preview">
                <img src="${content}" alt="${filename}" class="preview-image" />
                <p class="image-info">Image: ${filename}</p>
            </div>
        `;
      }
      
      // If it's not image data, show a placeholder with file info
      return `
        <div class="image-placeholder">
            <i class="fas fa-image"></i>
            <p>Image file: ${filename}</p>
            <p class="file-note">Image preview not available in text format</p>
        </div>
    `;
  }


  function formatTextContent(content) {
      // Enhanced text formatting with paragraph detection
      const paragraphs = content.split(/\n\s*\n/);
      
      return paragraphs.map(paragraph => {
          const trimmed = paragraph.trim();
          if (!trimmed) return '';
          
          // Format line breaks within paragraphs
          const formatted = trimmed.replace(/\n/g, '<br>');
          return `<p class="text-paragraph">${this.escapeHtml(formatted)}</p>`;
      }).join('');
  }


  function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
  }


  function applyContentEnhancements(contentElement, fileType, filename) {
      // Apply syntax highlighting if highlight.js is available
      if (window.hljs) {
          contentElement.querySelectorAll('pre code[class*="language-"]').forEach(block => {
              try {
                  window.hljs.highlightElement(block);
              } catch (e) {
                  console.warn('Syntax highlighting failed:', e);
              }
          });
      }
      
      // Add copy buttons to code blocks
      contentElement.querySelectorAll('pre').forEach(pre => {
          const copyButton = document.createElement('button');
          copyButton.className = 'copy-code-btn';
          copyButton.innerHTML = '<i class="fas fa-copy"></i>';
          copyButton.title = 'Copy code';
          
          copyButton.addEventListener('click', () => {
              const code = pre.textContent;
              navigator.clipboard.writeText(code).then(() => {
                  copyButton.innerHTML = '<i class="fas fa-check"></i>';
                  setTimeout(() => {
                      copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                  }, 2000);
              });
          });
          
          pre.style.position = 'relative';
          pre.appendChild(copyButton);
      });
      
      // Add line numbers to long code blocks
      contentElement.querySelectorAll('pre code').forEach(codeBlock => {
          const lines = codeBlock.textContent.split('\n');
          if (lines.length > 10) {
              codeBlock.classList.add('line-numbers');
          }
      });
      
      // Make tables responsive
      contentElement.querySelectorAll('table').forEach(table => {
          if (!table.parentElement.classList.contains('csv-table-container')) {
              const wrapper = document.createElement('div');
              wrapper.className = 'table-responsive';
              table.parentNode.insertBefore(wrapper, table);
              wrapper.appendChild(table);
          }
      });
  }

  var preview = /*#__PURE__*/Object.freeze({
    __proto__: null,
    applyContentEnhancements: applyContentEnhancements,
    cleanup: cleanup$1,
    detectFileType: detectFileType,
    displayContent: displayContent,
    escapeHtml: escapeHtml,
    formatCodeContent: formatCodeContent,
    formatConfigContent: formatConfigContent,
    formatContentByType: formatContentByType,
    formatCsvContent: formatCsvContent,
    formatHtmlContent: formatHtmlContent,
    formatImageContent: formatImageContent,
    formatJsonContent: formatJsonContent,
    formatMarkdownContent: formatMarkdownContent,
    formatPdfContent: formatPdfContent,
    formatPdfPageContent: formatPdfPageContent,
    formatPresentationContent: formatPresentationContent,
    formatSpreadsheetContent: formatSpreadsheetContent,
    formatStylesheetContent: formatStylesheetContent,
    formatTextContent: formatTextContent,
    formatWordContent: formatWordContent,
    formatXmlContent: formatXmlContent,
    formatYamlContent: formatYamlContent,
    getFileExtension: getFileExtension,
    getFileTypeLabel: getFileTypeLabel,
    loadFilePreview: loadFilePreview,
    loadPdfPreview: loadPdfPreview$1,
    showPdfTextFallback: showPdfTextFallback$1,
    showTextVersion: showTextVersion
  });

  // PDF rendering helpers
  async function loadPdfPreview(filename, fallbackData) {
      const previewContent = document.getElementById('filePreviewContent');
      if (!previewContent) return;
      
      const fileExt = this.getFileExtension(filename).toLowerCase();
      const isDocFormat = fileExt === 'doc' || fileExt === 'docx';
      const isPdfFormat = fileExt === 'pdf';
      
      // Determine appropriate icon and label
      let iconClass = 'fas fa-file';
      let typeLabel = 'Document';
      
      if (isPdfFormat) {
          iconClass = 'fas fa-file-pdf';
          typeLabel = 'PDF Document';
      } else if (isDocFormat) {
          iconClass = 'fas fa-file-word';
          typeLabel = 'Word Document';
      }
      
      // Update file viewer header with file type info and controls
      this.updateFileViewerHeader(filename, typeLabel, iconClass, isDocFormat);

      // Keep the existing styled loading state instead of replacing it
      // The "Loading preview..." message is already showing and styled
      
      // Set up instance reference
      if (typeof window !== 'undefined' && window.FileViewerRedesigned) {
          window.FileViewerRedesigned.instance = this;
      }
      
      try {
          // Try to load the original PDF file or converted PDF
          const chatId = window.currentChatId || 'default';
          const pdfResponse = await fetch(`/api/rag/document-file/${chatId}/${encodeURIComponent(filename)}`);
          
          if (pdfResponse.ok) {
              // Always use our PDF.js-based viewer for accurate, scriptable highlights
              const pdfEndpoint = `/api/rag/document-file/${chatId}/${encodeURIComponent(filename)}`;
              // Use the full pdf.js default viewer UI vendored under static/pdfjs
              const viewerUrl = `/static/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfEndpoint)}`;

              previewContent.innerHTML = `
                <div class="pdf-viewer-container">
                    <div class="pdf-content-container">
                        <iframe 
                            src="${viewerUrl}"
                            class="pdf-iframe"
                            frameborder="0"
                            title="Document Preview"
                            onload="console.log('PDF.js viewer loaded')">
                            <p>Your browser doesn't support PDF viewing. <a href="${pdfEndpoint}" target="_blank">Click here to view the document</a></p>
                        </iframe>
                    </div>
                    <div class="pdf-text-fallback" style="display: none;">
                        ${this.formatPdfContent(fallbackData.content)}
                    </div>
                </div>
            `;

              // Update header with full PDF controls (open in new tab should open original PDF)
              this.updateFileViewerHeader(filename, typeLabel, {
                  showPdfToggle: true,
                  isPdfView: true,
                  pdfUrl: pdfEndpoint
              });

              // Store endpoint for highlight actions
              this.currentPdfUrl = pdfEndpoint;
              console.log('Document loaded with PDF.js viewer');
              return;
          } else if (pdfResponse.status === 422) {
              // Conversion failed, try to get error details
              try {
                  const errorData = await pdfResponse.json();
                  if (errorData.fallback) {
                      console.log('Document conversion failed, showing text version');
                      this.showTextVersion(filename);
                      return;
                  }
              } catch (e) {
                  // Ignore JSON parsing errors, fall through to text version
              }
          }
          
          // If we reach here, PDF serving failed - show text fallback
          console.log('PDF serving failed, showing text version');
          this.showTextVersion(filename);
              
      } catch (error) {
          console.error('Error loading PDF preview:', error);
          this.showTextVersion(filename);
      }
  }


  function showPdfTextFallback(filename, data) {
      const previewContent = document.getElementById('filePreviewContent');
      if (!previewContent) return;
      
      previewContent.innerHTML = `
        <div class="pdf-text-viewer">
            <div class="file-type-header">
                <div class="file-type-info">
                    <i class="fas fa-file-pdf"></i>
                    <span class="file-type-label">PDF Document (Text View)</span>
                    <span class="file-name">${filename}</span>
                </div>
            </div>
            <div class="pdf-text-content">
                ${this.formatPdfContent(data.content)}
            </div>
            ${data.truncated ? '<div class="truncation-notice"><i class="fas fa-info-circle"></i> Content has been truncated for preview</div>' : ''}
        </div>
    `;
  }

  // Clean up blob URLs when switching files

  function cleanup() {
      if (this.currentPdfUrl) {
          URL.revokeObjectURL(this.currentPdfUrl);
          this.currentPdfUrl = null;
      }
  }


  function showEditorJSVersion(filename) {
      const previewContent = document.getElementById('filePreviewContent');
      if (!previewContent) return;
      
      // Show the EditorJS version
      const container = previewContent.querySelector('.pdf-viewer-container');
      if (container) {
          const pdfContainer = container.querySelector('.pdf-content-container');
          let editorContainer = container.querySelector('.editorjs-fallback');
          
          // Create EditorJS container if it doesn't exist
          if (!editorContainer) {
              editorContainer = document.createElement('div');
              editorContainer.className = 'editorjs-fallback';
              editorContainer.style.cssText = `
                display: none;
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                background: var(--surface);
            `;
              
              // Create EditorJS container
              const editorJSContainer = document.createElement('div');
              editorJSContainer.id = 'fileViewerEditorJS';
              editorJSContainer.style.cssText = `
                width: 100%;
                max-width: 100%;
                margin: 0 auto;
            `;
              
              editorContainer.appendChild(editorJSContainer);
              container.appendChild(editorContainer);
          }
          
          if (pdfContainer && editorContainer) {
              pdfContainer.style.display = 'none';
              editorContainer.style.display = 'flex';
              
              // Initialize EditorJS with document content
              this.initializeEditorJS(filename);
              
              // Always use correct file type label
              const fname = filename || this.currentFile?.filename;
              const ext = fname ? fname.split('.').pop().toLowerCase() : '';
              const isDoc = ext === 'doc' || ext === 'docx';
              const typeLabel = isDoc ? 'Word Document' : 'PDF Document';
              this.updateFileViewerHeader(fname, typeLabel, {
                  showPdfToggle: true,
                  isPdfView: false,
                  pdfUrl: this.currentPdfUrl
              });
          }
      }
  }


  function showPdfVersion() {
      const previewContent = document.getElementById('filePreviewContent');
      if (!previewContent) return;
      
      const container = previewContent.querySelector('.pdf-viewer-container');
      if (container) {
          const pdfContainer = container.querySelector('.pdf-content-container');
          const editorContainer = container.querySelector('.editorjs-fallback');
          
          if (pdfContainer) {
              pdfContainer.style.display = 'flex';
              
              // Hide EditorJS container if it exists
              if (editorContainer) {
                  editorContainer.style.display = 'none';
                  // Destroy EditorJS instance to free memory
                  this.destroyEditorJS();
              }
              
              // Always use correct file type label
              const fname = this.currentFile?.filename;
              const ext = fname ? fname.split('.').pop().toLowerCase() : '';
              const isDoc = ext === 'doc' || ext === 'docx';
              const typeLabel = isDoc ? 'Word Document' : 'PDF Document';
              this.updateFileViewerHeader(fname, typeLabel, {
                  showPdfToggle: true,
                  isPdfView: true,
                  pdfUrl: this.currentPdfUrl
              });
          }
      }
  }


  async function initializeEditorJS(filename) {
      try {
          // Destroy existing instance if any
          this.destroyEditorJS();
          
          // Get document content for EditorJS
          const documentText = await this.getDocumentContentForEditorJS(filename);
          
          // Initialize EditorJS
          this.editorJSInstance = new EditorJS({
              holder: 'fileViewerEditorJS',
              readOnly: true, // Make it read-only for viewing
              tools: {
                  header: {
                      class: Header,
                      config: {
                          placeholder: 'Enter a header',
                          levels: [1, 2, 3, 4, 5, 6],
                          defaultLevel: 2
                      }
                  },
                  paragraph: {
                      class: Paragraph,
                      inlineToolbar: true,
                  },
                  list: {
                      class: EditorjsList,
                      inlineToolbar: true,
                      config: {
                          defaultStyle: 'unordered'
                      }
                  },
                  quote: {
                      class: Quote,
                      inlineToolbar: true,
                      config: {
                          quotePlaceholder: 'Enter a quote',
                          captionPlaceholder: 'Quote\'s author',
                      },
                  },
                  marker: {
                      class: Marker,
                  },
                  code: {
                      class: CodeTool,
                      config: {
                          placeholder: 'Enter code'
                      }
                  },
                  delimiter: Delimiter,
                  table: {
                      class: Table,
                      inlineToolbar: true,
                      config: {
                          rows: 2,
                          cols: 3,
                      },
                  },
              },
              data: documentText,
              placeholder: 'Document content will appear here...'
          });

          console.log('EditorJS initialized for file viewer');
      } catch (error) {
          console.error('Failed to initialize EditorJS:', error);
          // Fallback to simple text display
          this.showSimpleTextFallback(filename);
      }
  }


  async function getDocumentContentForEditorJS(filename) {
      try {
          if (!this.currentFile) {
              throw new Error('No current file selected');
          }

          // Call backend to convert document to EditorJS format
          console.log('Current file object:', this.currentFile);
          
          const response = await fetch('/api/document-to-editorjs', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  document_path: this.currentFile.full_path || this.currentFile.filename,
                  filename: filename
              })
          });

          if (!response.ok) {
              const errorText = await response.text();
              console.error('Backend error:', errorText);
              throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          console.log('EditorJS data received:', result.editorjs_data);
          
          // Debug: Check if accents are present in first block
          if (result.editorjs_data && result.editorjs_data.blocks && result.editorjs_data.blocks[0]) {
              const firstBlockText = result.editorjs_data.blocks[0].data?.text || '';
              console.log('First block text sample:', firstBlockText.substring(0, 200));
              console.log('First block text with accents check:', /[áéíóúñü]/i.test(firstBlockText) ? 'HAS ACCENTS' : 'NO ACCENTS');
          }
          
          if (result.success) {
              return result.editorjs_data;
          } else {
              throw new Error(result.error || 'Failed to convert document');
          }
      } catch (error) {
          console.error('Error getting document content for EditorJS:', error);
          
          // Fallback: create simple EditorJS structure from any available text
          const textFallback = document.querySelector('.pdf-text-fallback');
          let content = '';
          
          if (textFallback) {
              content = textFallback.textContent || textFallback.innerText || '';
          }
          
          if (!content.trim()) {
              content = `Document: ${filename}\n\nContent could not be extracted for rich editing. Please view the PDF version for the complete document.`;
          }

          // Convert plain text to basic EditorJS blocks
          const paragraphs = content.split('\n\n').filter(p => p.trim());
          const blocks = paragraphs.map((paragraph, index) => {
              const text = paragraph.trim();
              if (!text) return null;
              
              // Simple heuristic for headers (lines that are short and followed by content)
              if (text.length < 100 && index < paragraphs.length - 1 && !text.endsWith('.')) {
                  return {
                      type: 'header',
                      data: {
                          text: text,
                          level: 2
                      }
                  };
              } else {
                  return {
                      type: 'paragraph',
                      data: {
                          text: text
                      }
                  };
              }
          }).filter(block => block !== null);

          return {
              time: Date.now(),
              blocks: blocks.length > 0 ? blocks : [{
                  type: 'paragraph',
                  data: {
                      text: content
                  }
              }],
              version: '2.28.0'
          };
      }
  }


  function showSimpleTextFallback(filename) {
      const container = document.getElementById('fileViewerEditorJS');
      if (container) {
          const textFallback = document.querySelector('.pdf-text-fallback');
          let content = textFallback ? textFallback.textContent || textFallback.innerText || '' : '';
          
          if (!content.trim()) {
              content = `Document: ${filename}\n\nContent could not be displayed. Please view the PDF version.`;
          }

          container.innerHTML = `
            <div style="padding: 20px; background: var(--surface-2); border-radius: 8px; font-family: var(--font-family);">
                <h3 style="margin-top: 0; color: var(--text-color);">Document Content</h3>
                <pre style="white-space: pre-wrap; font-family: inherit; color: var(--text-color); line-height: 1.6;">${content}</pre>
            </div>
        `;
      }
  }


  function destroyEditorJS() {
      if (this.editorJSInstance) {
          try {
              this.editorJSInstance.destroy();
              this.editorJSInstance = null;
              console.log('EditorJS instance destroyed');
          } catch (error) {
              console.warn('Error destroying EditorJS instance:', error);
              this.editorJSInstance = null;
          }
      }
  }

  var pdf = /*#__PURE__*/Object.freeze({
    __proto__: null,
    cleanup: cleanup,
    destroyEditorJS: destroyEditorJS,
    getDocumentContentForEditorJS: getDocumentContentForEditorJS,
    initializeEditorJS: initializeEditorJS,
    loadPdfPreview: loadPdfPreview,
    showEditorJSVersion: showEditorJSVersion,
    showPdfTextFallback: showPdfTextFallback,
    showPdfVersion: showPdfVersion,
    showSimpleTextFallback: showSimpleTextFallback
  });

  // Notes editor helpers
  function openNotesEditor() {
      const previewContent = document.getElementById('filePreviewContent');
      if (!previewContent) return;

      // Show notes editor content area
      previewContent.innerHTML = `
        <div class="notes-editor-content">
            <div id="notesEditorJS"></div>
        </div>
    `;

      // Update the existing header to show notes mode
      this.updateHeaderForNotesMode();

      // Initialize the notes editor
      this.initializeNotesEditor();
  }


  function updateHeaderForNotesMode() {
      // Update the file name to show current note name
      const fileNameElement = document.querySelector('.file-name-text');
      if (fileNameElement) {
          fileNameElement.textContent = this.currentNoteName || 'Untitled Note';
      }

      // Find the PDF controls section and modify existing buttons
      const pdfControls = document.querySelector('.pdf-controls');
      if (pdfControls) {
          // Store original state for restoration later
          this.originalControlsHTML = pdfControls.innerHTML;
          
          // Replace controls with notes-specific controls including a back to PDF button
          pdfControls.innerHTML = `
            <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.returnToDocument()" title="Back to Document (PDF)">
                <i class="fas fa-file-pdf"></i>
            </button>
            <div class="notes-controls-section">
                <button class="btn-primary pdf-control-btn" onclick="FileViewerRedesigned.instance.saveCurrentNote()" title="Save Note">
                    <i class="fas fa-save"></i>
                </button>
                <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.openNotesList()" title="Open Note">
                    <i class="fas fa-folder-open"></i>
                </button>
                <div class="current-note-info-inline">
                    <div class="note-tags" id="noteTags"></div>
                </div>
            </div>
        `;
      }

      // Update the file type info to show "Notes Editor"
      const fileTypeLabel = document.querySelector('.file-type-label');
      if (fileTypeLabel) {
          this.originalFileTypeLabel = fileTypeLabel.textContent;
          fileTypeLabel.textContent = 'Notes Editor';
      }

      const fileTypeIcon = document.querySelector('.file-type-info i');
      if (fileTypeIcon) {
          this.originalFileTypeIcon = fileTypeIcon.className;
          fileTypeIcon.className = 'fas fa-sticky-note';
      }
  }


  async function initializeNotesEditor() {
      try {
          // Destroy existing editor instance if any
          this.destroyNotesEditor();
          
          // Initialize EditorJS for notes
          this.notesEditorInstance = new EditorJS({
              holder: 'notesEditorJS',
              placeholder: 'Start writing your note...',
              tools: {
                  header: {
                      class: Header,
                      config: {
                          placeholder: 'Enter a header',
                          levels: [1, 2, 3, 4, 5, 6],
                          defaultLevel: 2
                      }
                  },
                  paragraph: {
                      class: Paragraph,
                      inlineToolbar: true,
                  },
                  list: {
                      class: EditorjsList,
                      inlineToolbar: true,
                      config: {
                          defaultStyle: 'unordered'
                      }
                  },
                  quote: {
                      class: Quote,
                      inlineToolbar: true,
                      config: {
                          quotePlaceholder: 'Enter a quote',
                          captionPlaceholder: 'Quote\'s author',
                      },
                  },
                  marker: {
                      class: Marker,
                  },
                  code: {
                      class: CodeTool,
                      config: {
                          placeholder: 'Enter code'
                      }
                  },
                  delimiter: Delimiter,
                  table: {
                      class: Table,
                      inlineToolbar: true,
                      config: {
                          rows: 2,
                          cols: 3,
                      },
                  }
              },
              data: {
                  blocks: []
              }
          });

          await this.notesEditorInstance.isReady;
          console.log('Notes EditorJS initialized successfully');
          
          // EditorJS doesn't have onChange, so we'll track changes differently
          // We'll mark as changed when addToCurrentNote is called or when saving
          
          // Load the last opened note or create blank note
          this.loadDefaultNote();
          // Typeset math after initial load (if any)
          this.typesetNotesMath();
          
      } catch (error) {
          console.error('Failed to initialize notes EditorJS:', error);
          this.showNotesError('Failed to initialize notes editor');
      }
  }


  function loadDefaultNote() {
      // First check for temporary storage from this chat session
      const tempData = this.loadFromTempStorage();
      if (tempData && tempData.hasUnsavedChanges) {
          // Load temporary note content
          this.currentNoteId = tempData.noteId;
          this.currentNoteName = tempData.noteName;
          this.currentNoteTags = tempData.noteTags;
          this.hasUnsavedChanges = true;
          
          if (this.notesEditorInstance && tempData.content) {
              this.notesEditorInstance.render(tempData.content);
          }
          
          this.updateCurrentNoteDisplay();
          this.updateNotesEditorUI();
          // Typeset restored content
          this.typesetNotesMath();
          
          // Show notification about restored content
          this.showNotesSuccess('Restored unsaved note content from this chat session');
          return;
      }
      
      // Try to load the last opened note from localStorage if no temp data
      const lastNoteId = localStorage.getItem('lastOpenedNoteId');
      if (lastNoteId) {
          this.loadNote(lastNoteId);
      } else {
          // Start with a blank note
          this.currentNoteId = null;
          this.currentNoteName = 'Untitled Note';
          this.hasUnsavedChanges = false;
          this.updateCurrentNoteDisplay();
          this.updateNotesEditorUI();
      }
  }


  async function saveCurrentNote() {
      if (!this.notesEditorInstance) return;

      try {
          const noteData = await this.notesEditorInstance.save();
          
          // Show save dialog
          this.showNoteSaveDialog(noteData);
          
      } catch (error) {
          console.error('Error saving note:', error);
          this.showNotesError('Failed to save note');
      }
  }


  function showNoteSaveDialog(noteData) {
      const dialogHTML = `
        <div class="note-save-modal" id="noteSaveModal">
            <div class="modal-overlay" onclick="FileViewerRedesigned.instance.closeNoteSaveDialog()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Save Note</h3>
                    <button class="modal-close" onclick="FileViewerRedesigned.instance.closeNoteSaveDialog()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Note Name:</label>
                        <input type="text" id="noteNameInput" value="${this.currentNoteName || 'Untitled Note'}" placeholder="Enter note name">
                    </div>
                    <div class="form-group">
                        <label>Tags:</label>
                        <div id="noteTagsContentModal"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="FileViewerRedesigned.instance.closeNoteSaveDialog()">Cancel</button>
                    <button class="btn-primary" onclick="FileViewerRedesigned.instance.saveNoteWithDetails()">Save</button>
                </div>
            </div>
        </div>
    `;
      
      document.body.insertAdjacentHTML('beforeend', dialogHTML);
      
      // Store note data temporarily
      this.pendingNoteData = noteData;
  // Initialize embedded tag picker with current tags (inline content, no popover)
  try { this.initModalTagPicker('noteTagsContentModal', this.currentNoteTags || ''); } catch(e) { console.warn('Tag picker init failed', e); }
      
      // Focus on name input
      setTimeout(() => {
          const nameInput = document.getElementById('noteNameInput');
          if (nameInput) {
              nameInput.focus();
              nameInput.select();
          }
      }, 100);
  }


  async function saveNoteWithDetails() {
      const nameInput = document.getElementById('noteNameInput');
      
      if (!nameInput || !this.pendingNoteData) return;

      const noteName = nameInput.value.trim() || 'Untitled Note';
      const tagsList = (this.getModalSelectedTagNames && this.getModalSelectedTagNames()) || [];
      
      try {
          // Create note object
          const noteObject = {
              id: this.currentNoteId || Date.now().toString(),
              name: noteName,
              tags: tagsList,
              content: this.pendingNoteData,
              createdAt: this.currentNoteId ? this.currentNoteCreatedAt : new Date().toISOString(),
              updatedAt: new Date().toISOString()
          };

          // Save to localStorage (could be extended to backend)
          this.saveNoteToStorage(noteObject);
          
          // Update current note info
          this.currentNoteId = noteObject.id;
          this.currentNoteName = noteObject.name;
          this.currentNoteTags = tagsList.join(', ');
          this.currentNoteCreatedAt = noteObject.createdAt;
          
          // Clear temporary storage since note is now saved
          this.hasUnsavedChanges = false;
          this.clearTempStorage();
          
          // Update display
          this.updateCurrentNoteDisplay();
          this.updateNotesEditorUI();
          
          // Close dialog
          this.closeNoteSaveDialog();
          
          // Show success message
          this.showNotesSuccess(`Note "${noteName}" saved successfully`);
          
          // Remember this as the last opened note
          localStorage.setItem('lastOpenedNoteId', noteObject.id);
          
      } catch (error) {
          console.error('Error saving note:', error);
          this.showNotesError('Failed to save note');
      }
  }


  function saveNoteToStorage(noteObject) {
      // Get existing notes
      const existingNotes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
      
      // Update or add note
      const existingIndex = existingNotes.findIndex(note => note.id === noteObject.id);
      if (existingIndex >= 0) {
          existingNotes[existingIndex] = noteObject;
      } else {
          existingNotes.push(noteObject);
      }
      
      // Save back to localStorage
      localStorage.setItem('editorJSNotes', JSON.stringify(existingNotes));
  }


  function openNotesList() {
      const notes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
      
      const dialogHTML = `
        <div class="notes-list-modal" id="notesListModal">
            <div class="modal-overlay" onclick="FileViewerRedesigned.instance.closeNotesListDialog()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Open Note</h3>
                    <button class="modal-close" onclick="FileViewerRedesigned.instance.closeNotesListDialog()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="notes-list">
                        ${notes.length === 0 ? '<p class="no-notes">No saved notes found.</p>' : 
                            notes.map(note => `
                                <div class="note-item" data-note-id="${note.id}">
                                    <div class="note-info">
                                        <h4>${note.name}</h4>
                                        <p class="note-meta">
                                            Updated: ${new Date(note.updatedAt).toLocaleDateString()}
                                            ${note.tags.length > 0 ? `• Tags: ${note.tags.join(', ')}` : ''}
                                        </p>
                                    </div>
                                    <div class="note-actions">
                                        <button class="btn-primary btn-sm" onclick="FileViewerRedesigned.instance.loadNoteFromList('${note.id}')">
                                            <i class="fas fa-folder-open"></i>
                                        </button>
                                        <button class="btn-danger btn-sm" onclick="FileViewerRedesigned.instance.deleteNoteFromList('${note.id}')">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" onclick="FileViewerRedesigned.instance.createNewNoteFromModal()" title="Create New Note">
                        <i class="fas fa-plus"></i> New Note
                    </button>
                    <button class="btn-secondary" onclick="FileViewerRedesigned.instance.closeNotesListDialog()">Cancel</button>
                </div>
            </div>
        </div>
    `;
      
      document.body.insertAdjacentHTML('beforeend', dialogHTML);
  }


  function loadNoteFromList(noteId) {
      this.loadNote(noteId);
      this.closeNotesListDialog();
  }


  function createNewNoteFromModal() {
      this.closeNotesListDialog();
      this.newBlankNote();
  }


  function loadNote(noteId) {
      const notes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
      const note = notes.find(n => n.id === noteId);
      
      if (!note) {
          this.showNotesError('Note not found');
          return;
      }

      // Load note content into editor
      if (this.notesEditorInstance) {
          this.notesEditorInstance.render(note.content || { blocks: [] });
          // Typeset math after rendering note
          this.typesetNotesMath();
      }
      
      // Update current note info
      this.currentNoteId = note.id;
      this.currentNoteName = note.name;
      this.currentNoteTags = note.tags.join(', ');
      this.currentNoteCreatedAt = note.createdAt;
      
      // Clear unsaved changes since we're loading a saved note
      this.hasUnsavedChanges = false;
      this.clearTempStorage();
      
      // Update display
      this.updateCurrentNoteDisplay();
      this.updateNotesEditorUI();
      
      // Remember as last opened
      localStorage.setItem('lastOpenedNoteId', noteId);
  }


  function deleteNoteFromList(noteId) {
      if (!confirm('Are you sure you want to delete this note?')) return;

      // Remove from storage
      const notes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
      const filteredNotes = notes.filter(note => note.id !== noteId);
      localStorage.setItem('editorJSNotes', JSON.stringify(filteredNotes));
      
      // Clear last opened if it was this note
      if (localStorage.getItem('lastOpenedNoteId') === noteId) {
          localStorage.removeItem('lastOpenedNoteId');
      }
      
      // Refresh the list
      this.closeNotesListDialog();
      this.openNotesList();
      
      this.showNotesSuccess('Note deleted successfully');
  }


  function newBlankNote() {
      // Check if there are unsaved changes before creating new note
      if (this.hasUnsavedChanges) {
          if (!confirm('You have unsaved changes. Are you sure you want to create a new note? Unsaved changes will be lost.')) {
              return;
          }
      }
      
      if (this.notesEditorInstance) {
          this.notesEditorInstance.render({ blocks: [] });
          this.typesetNotesMath();
      }
      
      // Reset current note info
      this.currentNoteId = null;
      this.currentNoteName = 'Untitled Note';
      this.currentNoteTags = '';
      this.currentNoteCreatedAt = null;
      
      // Clear temporary storage and unsaved changes
      this.hasUnsavedChanges = false;
      this.clearTempStorage();
      
      // Update display
      this.updateCurrentNoteDisplay();
      this.updateNotesEditorUI();
  }


  function closeNotesEditor() {
      // Check for unsaved changes before closing
      if (this.hasUnsavedChanges) {
          if (!confirm('You have unsaved changes in your note. Are you sure you want to close the notes editor? Changes will be preserved for this chat session.')) {
              return;
          }
          // Save current state to temporary storage before closing
          if (this.notesEditorInstance) {
              this.notesEditorInstance.save().then(data => {
                  this.saveToTempStorage(data);
              }).catch(error => {
                  console.error('Error saving to temp storage:', error);
              });
          }
      }
      
      this.destroyNotesEditor();
      
      // Restore the original header state
      this.restoreHeaderFromNotesMode();
      
      // Return to document view if we have a current file
      if (this.currentFile) {
          // Explicitly show PDF version when returning from notes
          this.currentView = 'pdf';
          // Reload the file to ensure proper display
          this.loadFilePreview(this.currentFile.filename);
      } else {
          // Show the document list
          this.showDocumentListInPreview();
      }
  }


  function returnToDocument() {
      // Same functionality as closeNotesEditor but with clearer naming for user navigation
      this.closeNotesEditor();
  }


  function restoreHeaderFromNotesMode() {
      // Restore original PDF controls HTML
      const pdfControls = document.querySelector('.pdf-controls');
      if (pdfControls && this.originalControlsHTML) {
          pdfControls.innerHTML = this.originalControlsHTML;
      }

      // Restore file type info if we have a current file
      if (this.currentFile) {
          const fileTypeLabel = document.querySelector('.file-type-label');
          if (fileTypeLabel && this.originalFileTypeLabel) {
              fileTypeLabel.textContent = this.originalFileTypeLabel;
          }

          const fileTypeIcon = document.querySelector('.file-type-info i');
          if (fileTypeIcon && this.originalFileTypeIcon) {
              fileTypeIcon.className = this.originalFileTypeIcon;
          }

          const fileNameElement = document.querySelector('.file-name-text');
          if (fileNameElement) {
              fileNameElement.textContent = this.currentFile.filename;
          }
      }
  }


  function updateCurrentNoteDisplay() {
      // Update the file name in the header
      const fileNameElement = document.querySelector('.file-name-text');
      if (fileNameElement) {
          fileNameElement.textContent = this.currentNoteName || 'Untitled Note';
      }
      
      // Update tags in the inline note info
      const tagsElement = document.getElementById('noteTags');
      if (tagsElement) {
          if (this.currentNoteTags) {
              const tags = this.currentNoteTags.split(',').map(tag => tag.trim());
              tagsElement.innerHTML = tags.map(tag => `<span class="note-tag">${tag}</span>`).join('');
          } else {
              tagsElement.innerHTML = '';
          }
      }
  }

  // Dialog close methods

  function closeNoteSaveDialog() {
      const modal = document.getElementById('noteSaveModal');
      if (modal) {
          modal.remove();
      }
      this.pendingNoteData = null;
  }


  function closeNotesListDialog() {
      const modal = document.getElementById('notesListModal');
      if (modal) {
          modal.remove();
      }
  }

  // Notification methods for notes

  function showNotesSuccess(message) {
      this.showToast(message, 'success');
  }


  function showNotesError(message) {
      this.showToast(message, 'error');
  }


  function destroyNotesEditor() {
      if (this.notesEditorInstance) {
          if (typeof this.notesEditorInstance.destroy === 'function') {
              this.notesEditorInstance.destroy();
          }
          this.notesEditorInstance = null;
      }
  }

  // Method to add content from chat to current note

  async function addToCurrentNote(content) {
      if (!this.notesEditorInstance) {
          this.showNotesError('No note editor is open');
          return;
      }

      try {
          // Get current editor data
          const currentData = await this.notesEditorInstance.save();

          // Derive blocks to insert from incoming content (string markdown or Editor.js data)
          let blocksToInsert = [];

          // If content is an Editor.js-like object
          if (content && typeof content === 'object') {
              if (Array.isArray(content.blocks)) {
                  blocksToInsert = content.blocks;
              } else if (Array.isArray(content)) {
                  blocksToInsert = content; // assume array of blocks
              }
          }

          // If content is a string (likely Markdown), convert to blocks
          if (!blocksToInsert.length && typeof content === 'string') {
              const md = content.trim();
              if (md) {
                  try {
                      if (typeof window.mdToEditorJS === 'function') {
                          const out = window.mdToEditorJS(md);
                          if (out && Array.isArray(out.blocks)) {
                              blocksToInsert = out.blocks;
                          }
                      }
                  } catch (e) {
                      console.warn('mdToEditorJS conversion failed, falling back to paragraph:', e);
                  }
              }
          }

          // Final fallback: single paragraph with raw text
          if (!blocksToInsert.length && typeof content === 'string') {
              blocksToInsert = [{ type: 'paragraph', data: { text: content } }];
          }

          if (!blocksToInsert.length) {
              this.showNotesError('No content to add');
              return;
          }

          // Append new blocks to existing content
          currentData.blocks = (currentData.blocks || []).concat(blocksToInsert);

          // Render updated content
          await this.notesEditorInstance.render(currentData);
          // Typeset any math in the updated note
          this.typesetNotesMath();

          // Mark as having unsaved changes and save to temp storage
          this.hasUnsavedChanges = true;
          this.saveToTempStorage(currentData);
          this.updateNotesEditorUI();

          this.showNotesSuccess('Content added to note');

      } catch (error) {
          console.error('Error adding content to note:', error);
          this.showNotesError('Failed to add content to note');
      }
  }

  // Typeset MathJax within the notes editor container (debounced and visibility-guarded)

  function typesetNotesMath() {
      try {
          const holder = document.getElementById('notesEditorJS');
          if (!holder || holder.offsetParent === null) return; // not visible
          if (this._mathTypesetTimer) clearTimeout(this._mathTypesetTimer);
          this._mathTypesetTimer = setTimeout(() => {
              try {
                  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                      window.MathJax.typesetPromise([holder]).catch(() => {});
                  } else {
                      if (!window._pendingMathEls) window._pendingMathEls = [];
                      window._pendingMathEls.push(holder);
                  }
              } catch {}
          }, 120);
      } catch {}
  }

  // Save current note content to temporary storage within chat session

  function saveToTempStorage(noteData) {
      const chatId = window.currentChatId || 'default';
      this.tempNoteSessionKey = `tempNote_${chatId}`;
      
      const tempData = {
          noteId: this.currentNoteId,
          noteName: this.currentNoteName,
          noteTags: this.currentNoteTags,
          content: noteData,
          timestamp: new Date().toISOString(),
          hasUnsavedChanges: this.hasUnsavedChanges
      };
      
      // Store in sessionStorage (persists within tab/session but not across browser restarts)
      sessionStorage.setItem(this.tempNoteSessionKey, JSON.stringify(tempData));
      
      console.log('Saved note to temporary storage for chat:', chatId);
  }

  // Load note content from temporary storage

  function loadFromTempStorage() {
      const chatId = window.currentChatId || 'default';
      this.tempNoteSessionKey = `tempNote_${chatId}`;
      
      const tempData = sessionStorage.getItem(this.tempNoteSessionKey);
      if (tempData) {
          try {
              const parsed = JSON.parse(tempData);
              return parsed;
          } catch (error) {
              console.error('Error parsing temp note data:', error);
          }
      }
      return null;
  }

  // Clear temporary storage for current chat

  function clearTempStorage() {
      if (this.tempNoteSessionKey) {
          sessionStorage.removeItem(this.tempNoteSessionKey);
          this.hasUnsavedChanges = false;
          this.updateNotesEditorUI();
      }
  }

  // Update notes editor UI to show unsaved changes indicator

  function updateNotesEditorUI() {
      const noteNameElement = document.getElementById('currentNoteName');
      if (noteNameElement) {
          const baseName = this.currentNoteName || 'Untitled Note';
          noteNameElement.textContent = this.hasUnsavedChanges ? `${baseName} *` : baseName;
          
          if (this.hasUnsavedChanges) {
              noteNameElement.style.fontStyle = 'italic';
              noteNameElement.title = 'Note has unsaved changes';
          } else {
              noteNameElement.style.fontStyle = 'normal';
              noteNameElement.title = '';
          }
      }

      // Update file name in header too
      const fileNameElement = document.querySelector('.file-name-text');
      if (fileNameElement && fileNameElement.textContent.includes('Notes Editor')) {
          const baseName = this.currentNoteName || 'Untitled Note';
          fileNameElement.textContent = this.hasUnsavedChanges ? `${baseName} *` : baseName;
      }
  }

  var notes = /*#__PURE__*/Object.freeze({
    __proto__: null,
    addToCurrentNote: addToCurrentNote,
    clearTempStorage: clearTempStorage,
    closeNoteSaveDialog: closeNoteSaveDialog,
    closeNotesEditor: closeNotesEditor,
    closeNotesListDialog: closeNotesListDialog,
    createNewNoteFromModal: createNewNoteFromModal,
    deleteNoteFromList: deleteNoteFromList,
    destroyNotesEditor: destroyNotesEditor,
    initializeNotesEditor: initializeNotesEditor,
    loadDefaultNote: loadDefaultNote,
    loadFromTempStorage: loadFromTempStorage,
    loadNote: loadNote,
    loadNoteFromList: loadNoteFromList,
    newBlankNote: newBlankNote,
    openNotesEditor: openNotesEditor,
    openNotesList: openNotesList,
    restoreHeaderFromNotesMode: restoreHeaderFromNotesMode,
    returnToDocument: returnToDocument,
    saveCurrentNote: saveCurrentNote,
    saveNoteToStorage: saveNoteToStorage,
    saveNoteWithDetails: saveNoteWithDetails,
    saveToTempStorage: saveToTempStorage,
    showNoteSaveDialog: showNoteSaveDialog,
    showNotesError: showNotesError,
    showNotesSuccess: showNotesSuccess,
    typesetNotesMath: typesetNotesMath,
    updateCurrentNoteDisplay: updateCurrentNoteDisplay,
    updateHeaderForNotesMode: updateHeaderForNotesMode,
    updateNotesEditorUI: updateNotesEditorUI
  });

  /**
   * Redesigned File Viewer Component for Split-Screen Chat Layout
   * Features: Resizable panels, document modal, enhanced AI analysis
   */

  let FileViewerRedesigned$1 = class FileViewerRedesigned {
      constructor() {
          applyState(this, createInitialState());
          
          this.initializeEventHandlers();
          this.initializeResizer();
          this.initializeModal();
          
          // Listen for chat changes to update document list
          document.addEventListener('chat-changed', () => {
              this.onChatChanged();
          });
          
          // Listen for document changes to update preview
          document.addEventListener('rag:documents-updated', () => {
              this.refreshDocumentList();
          });
          
          // Initialize with current chat documents
          if (window.currentChatId) {
              this.refreshDocumentList();
          }

          // Expose this instance globally for integration with other components
          window.FileViewerRedesigned = window.FileViewerRedesigned || {};
          window.FileViewerRedesigned.instance = this;

          // Ensure toggle button is enabled on init
          this.updateToggleButtonState(this.isVisible);
      }

      // Modal Tag Picker: lightweight local tag selector embedded in save dialog
      initModalTagPicker(containerId, existingCsv) {
          return initModalTagPicker.call(this, containerId, existingCsv);
      }

      getModalSelectedTagNames() {
          return getModalSelectedTagNames.call(this);
      }

      onChatChanged() {
          console.log('FileViewer: Chat changed, resetting state');
          // Reset current file when chat changes
          this.currentFile = null;
          
          // Hide the fileviewer initially when chat changes
          // It will be shown again if documents are found
          this.hideFileViewer();
          
          // Refresh document list for new chat
          this.refreshDocumentList();
      }

      initializeEventHandlers() {
          return initializeEventHandlers.call(this);
      }

      initializeResizer() {
          return initializeResizer.call(this);
      }

      initializeModal() {
          // Modal event handlers
          document.getElementById('documentModalClose')?.addEventListener('click', () => {
              this.closeDocumentModal();
          });

          document.getElementById('cancelDocumentModal')?.addEventListener('click', () => {
              this.closeDocumentModal();
          });

          document.getElementById('selectDocumentFromModal')?.addEventListener('click', () => {
              this.selectDocumentFromModal();
          });

          document.getElementById('refreshDocuments')?.addEventListener('click', () => {
              this.refreshDocumentList();
          });

          // File upload handlers
          this.initializeFileUpload();

          // Close modal on overlay click
          document.querySelector('#documentModal .modal-overlay')?.addEventListener('click', (e) => {
              console.log('Overlay clicked', e.target);
              // Only close if clicking the overlay itself, not its children
              if (e.target.classList.contains('modal-overlay')) {
                  this.closeDocumentModal();
              }
          });

          // ESC key handler
          document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                  const modal = document.getElementById('documentModal');
                  if (modal && !modal.classList.contains('is-hidden')) {
                      console.log('ESC key pressed, closing modal');
                      this.closeDocumentModal();
                  }
              }
          });
      }

      initializeFileUpload() {
          const uploadZone = document.getElementById('documentUploadZone');
          const fileInput = document.getElementById('documentFileInput');
          const browseBtn = document.getElementById('browseDocumentsBtn');

          if (!uploadZone || !fileInput) return;

          // File browse button
          browseBtn?.addEventListener('click', () => {
              fileInput.click();
          });

          // File input change
          fileInput.addEventListener('change', (e) => {
              this.handleFileUpload(e.target.files);
          });

          // Drag and drop
          uploadZone.addEventListener('dragover', (e) => {
              e.preventDefault();
              uploadZone.classList.add('drag-over');
          });

          uploadZone.addEventListener('dragleave', (e) => {
              e.preventDefault();
              uploadZone.classList.remove('drag-over');
          });

          uploadZone.addEventListener('drop', (e) => {
              e.preventDefault();
              uploadZone.classList.remove('drag-over');
              this.handleFileUpload(e.dataTransfer.files);
          });

          // Click to browse (but not on the button)
          uploadZone.addEventListener('click', (e) => {
              if (e.target !== browseBtn && !browseBtn?.contains(e.target)) {
                  fileInput.click();
              }
          });
      }

      async handleFileUpload(files) {
          if (!files || files.length === 0) return;

          const currentChatId = window.currentChatId;
          if (!currentChatId) {
              this.showToast('Please create a chat first', 'error');
              return;
          }

          const formData = new FormData();
          formData.append('chat_id', currentChatId);

          Array.from(files).forEach(file => {
              formData.append('file', file);
          });

          try {
              const response = await fetch('/api/rag/upload', {
                  method: 'POST',
                  body: formData
              });

              const result = await response.json();

              if (response.ok && result.status === 'success') {
                  this.showToast(`Successfully uploaded ${result.successful_uploads} file(s)`, 'success');
                  this.refreshDocumentList();
                  
                  // Trigger document update event
                  document.dispatchEvent(new CustomEvent('rag:documents-updated'));
              } else {
                  this.showToast(result.message || 'Upload failed', 'error');
              }
          } catch (error) {
              console.error('Upload error:', error);
              this.showToast('Upload failed', 'error');
          }
      }

      async refreshDocumentList() {
          const currentChatId = window.currentChatId;
          if (!currentChatId) return;

          try {
              const response = await fetch(`/api/rag/documents/${currentChatId}`);
              if (response.ok) {
                  const result = await response.json();
                  // Transform v2 API format to v1 format for compatibility
                  const documents = (result.documents || []).map(doc => ({
                      filename: doc.source || doc.filename,
                      full_path: doc.full_path || doc.source,
                      size: doc.size || null,
                      chunk_count: doc.chunk_count,
                      source_type: doc.source_type
                  }));
                  
                  this.displayDocumentList(documents);
                  
                  // Auto-load logic: Only auto-show if fileviewer was already visible
                  // or if there's exactly one document and no file is loaded yet
                  if (documents.length === 1 && !this.currentFile && !this.isVisible) {
                      const doc = documents[0];
                      console.log('Auto-loading single document:', doc.filename);
                      await this.loadDocument(doc.filename, doc.full_path);
                      // Don't auto-show, let user decide when to open
                  } else if (documents.length > 0 && !this.currentFile) {
                      // Show document list in preview placeholder
                      this.showDocumentListInPreview(documents);
                  }
                  
                  // If fileviewer is visible and we have documents, keep it visible
                  // If no documents, this will be handled by displayDocumentList showing empty state
              } else {
                  this.showEmptyDocumentList();
                  this.showEmptyPreviewPlaceholder();
              }
          } catch (error) {
              console.error('Error fetching documents:', error);
              this.showEmptyDocumentList();
              this.showEmptyPreviewPlaceholder();
          }
      }

      displayDocumentList(documents) {
          const documentList = document.getElementById('documentList');
          const emptyState = document.getElementById('documentListEmpty');

          if (!documentList) return;

          // Update document count
          this.updateDocumentCount(documents.length);

          if (documents.length === 0) {
              documentList.innerHTML = '';
              emptyState?.classList.remove('is-hidden');
          } else {
              emptyState?.classList.add('is-hidden');
              
              const documentsHTML = documents.map(doc => {
                  const isCurrentlyLoaded = this.currentFile && this.currentFile.filename === doc.filename;
                  const statusClass = isCurrentlyLoaded ? 'currently-loaded' : '';
                  
                  // Display chunk count if available (v2 API), otherwise file size
                  const metaText = doc.chunk_count 
                      ? `${doc.chunk_count} chunks` 
                      : (doc.size ? this.formatFileSize(doc.size) : 'Unknown size');
                  
                  return `
                <div class="document-item ${statusClass}" data-filename="${doc.filename}" data-full-path="${doc.full_path || ''}">
                    <div class="document-item-icon">
                        <i class="fas ${this.getFileIcon(doc.filename)}"></i>
                    </div>
                    <div class="document-item-info">
                        <div class="document-item-name">${doc.filename}</div>
                        <div class="document-item-meta">
                            ${metaText}
                        </div>
                    </div>
                    ${isCurrentlyLoaded ? `
                        <div class="document-item-status">
                            <i class="fas fa-check-circle" title="Currently loaded"></i>
                        </div>
                    ` : ''}
                </div>
            `;
              }).join('');

              documentList.innerHTML = documentsHTML;

              // Add click handlers
              documentList.querySelectorAll('.document-item').forEach(item => {
                  item.addEventListener('click', () => {
                      this.selectDocumentInList(item);
                  });
              });
          }
      }

      showDocumentListInPreview(documents) {
          const previewContent = document.getElementById('filePreviewContent');
          if (!previewContent) return;

          const documentsHTML = `
            <div class="preview-document-list">
                <div class="preview-header">
                    <i class="fas fa-files"></i>
                    <h3>Documents in this chat</h3>
                    <p class="document-count">${documents.length} ${documents.length === 1 ? 'document' : 'documents'} available</p>
                </div>
                <div class="preview-documents">
                    ${documents.map(doc => `
                        <div class="preview-document-item" data-filename="${doc.filename}" data-full-path="${doc.full_path || ''}">
                            <div class="preview-doc-icon">
                                <i class="fas ${this.getFileIcon(doc.filename)}"></i>
                            </div>
                            <div class="preview-doc-info">
                                <div class="preview-doc-name">${doc.filename}</div>
                                <div class="preview-doc-meta">
                                    ${doc.size ? this.formatFileSize(doc.size) : 'Click to open'}
                                </div>
                            </div>
                            <div class="preview-doc-actions">
                                <button class="preview-doc-load" title="Load document">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="preview-actions">
                    <button id="previewManageDocsBtn" class="btn-secondary">
                        <i class="fas fa-cog"></i>
                        Manage Documents
                    </button>
                </div>
            </div>
        `;

          previewContent.innerHTML = documentsHTML;

          // Add click handlers for document items
          previewContent.querySelectorAll('.preview-document-item').forEach(item => {
              const loadBtn = item.querySelector('.preview-doc-load');
              const filename = item.dataset.filename;
              const fullPath = item.dataset.fullPath;

              const loadDocument = async () => {
                  try {
                      await this.loadDocument(filename, fullPath || null);
                  } catch (error) {
                      console.error('Error loading document from preview:', error);
                      this.showToast('Failed to load document', 'error');
                  }
              };

              // Load on item click or button click
              item.addEventListener('click', loadDocument);
              loadBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  loadDocument();
              });
          });

          // Add manage documents button handler
          document.getElementById('previewManageDocsBtn')?.addEventListener('click', () => {
              this.showDocumentModal();
          });
      }

      showEmptyPreviewPlaceholder() {
          const previewContent = document.getElementById('filePreviewContent');
          if (!previewContent) return;

          previewContent.innerHTML = `
            <div class="preview-placeholder">
                <i class="fas fa-file-alt"></i>
                <p>No documents in this chat</p>
                <button id="selectDocumentBtn" class="btn-primary">
                    <i class="fas fa-folder-open"></i>
                    Upload Document
                </button>
            </div>
        `;

          // Re-attach the document selection handler
          document.getElementById('selectDocumentBtn')?.addEventListener('click', () => {
              this.showDocumentModal();
          });
      }

      updateDocumentCount(count) {
          const countElement = document.getElementById('documentCount');
          if (countElement) {
              const text = count === 1 ? '1 document' : `${count} documents`;
              countElement.textContent = text;
          }
      }

      selectDocumentInList(item) {
          // Remove previous selection
          document.querySelectorAll('.document-item').forEach(el => {
              el.classList.remove('selected');
          });

          // Add selection to clicked item
          item.classList.add('selected');
          
          const filename = item.dataset.filename;
          const full_path = item.dataset.fullPath;
          this.selectedDocumentInModal = { 
              filename, 
              full_path: full_path || null 
          };

          // Enable select button and update its state
          const selectBtn = document.getElementById('selectDocumentFromModal');
          if (selectBtn) {
              // Check if this document is already loaded
              const isAlreadyLoaded = this.currentFile && this.currentFile.filename === filename;
              selectBtn.disabled = false;
              
              if (isAlreadyLoaded) {
                  selectBtn.innerHTML = `
                    <i class="fas fa-check-circle"></i>
                    Already Selected
                `;
                  selectBtn.style.opacity = '0.8';
                  selectBtn.title = 'This document is already loaded';
              } else {
                  selectBtn.innerHTML = `
                    <i class="fas fa-check"></i>
                    Select Document
                `;
                  selectBtn.style.opacity = '1';
                  selectBtn.title = 'Select this document';
              }
          }
      }

      showEmptyDocumentList() {
          const documentList = document.getElementById('documentList');
          const emptyState = document.getElementById('documentListEmpty');

          if (documentList) documentList.innerHTML = '';
          emptyState?.classList.remove('is-hidden');
      }

      getFileIcon(filename) {
          const ext = filename.split('.').pop().toLowerCase();
          const iconMap = {
              // Documents
              'pdf': 'fa-file-pdf',
              'doc': 'fa-file-word',
              'docx': 'fa-file-word',
              'odt': 'fa-file-word',
              'rtf': 'fa-file-word',
              
              // Spreadsheets
              'xlsx': 'fa-file-excel',
              'xls': 'fa-file-excel',
              'csv': 'fa-file-csv',
              'ods': 'fa-file-excel',
              
              // Presentations
              'ppt': 'fa-file-powerpoint',
              'pptx': 'fa-file-powerpoint',
              'odp': 'fa-file-powerpoint',
              
              // Text files
              'txt': 'fa-file-alt',
              'md': 'fa-file-alt',
              'markdown': 'fa-file-alt',
              
              // Code files
              'js': 'fa-file-code',
              'ts': 'fa-file-code',
              'py': 'fa-file-code',
              'java': 'fa-file-code',
              'cpp': 'fa-file-code',
              'c': 'fa-file-code',
              'cs': 'fa-file-code',
              'php': 'fa-file-code',
              'rb': 'fa-file-code',
              'go': 'fa-file-code',
              'rs': 'fa-file-code',
              'swift': 'fa-file-code',
              'kt': 'fa-file-code',
              'scala': 'fa-file-code',
              
              // Web files
              'html': 'fa-file-code',
              'htm': 'fa-file-code',
              'xml': 'fa-file-code',
              'css': 'fa-file-code',
              'scss': 'fa-file-code',
              'sass': 'fa-file-code',
              'less': 'fa-file-code',
              'json': 'fa-file-code',
              'yaml': 'fa-file-code',
              'yml': 'fa-file-code',
              
              // Config files
              'ini': 'fa-file-alt',
              'conf': 'fa-file-alt',
              'cfg': 'fa-file-alt',
              'toml': 'fa-file-alt',
              
              // Images
              'jpg': 'fa-file-image',
              'jpeg': 'fa-file-image',
              'png': 'fa-file-image',
              'gif': 'fa-file-image',
              'bmp': 'fa-file-image',
              'svg': 'fa-file-image',
              'webp': 'fa-file-image',
              
              // Archives
              'zip': 'fa-file-archive',
              'rar': 'fa-file-archive',
              '7z': 'fa-file-archive',
              'tar': 'fa-file-archive',
              'gz': 'fa-file-archive'
          };
          return iconMap[ext] || 'fa-file';
      }

      formatFileSize(bytes) {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }

      openDocumentModal() {
          const modal = document.getElementById('documentModal');
          if (modal) {
              console.log('Opening document modal');
              modal.classList.remove('is-hidden');
              modal.style.display = 'flex';
              modal.style.zIndex = '10000';
              modal.setAttribute('aria-hidden', 'false');
              
              this.refreshDocumentList();
              
              // Focus the modal for accessibility
              setTimeout(() => {
                  modal.focus();
              }, 100);
          } else {
              console.error('Document modal not found');
          }
      }

      closeDocumentModal() {
          const modal = document.getElementById('documentModal');
          if (modal) {
              console.log('Closing document modal');
              modal.classList.add('is-hidden');
              modal.style.display = 'none';
              modal.setAttribute('aria-hidden', 'true');
          }
          this.selectedDocumentInModal = null;
          
          // Reset loading state
          this.isLoadingDocument = false;
          
          // Reset select button
          const selectBtn = document.getElementById('selectDocumentFromModal');
          if (selectBtn) {
              selectBtn.disabled = true;
              selectBtn.innerHTML = `
                <i class="fas fa-check"></i>
                Select Document
            `;
              selectBtn.style.opacity = '1';
              selectBtn.title = '';
          }

          // Hide any error messages
          const errorElement = document.getElementById('modal-error-message');
          if (errorElement) {
              errorElement.style.display = 'none';
          }
      }

      async selectDocumentFromModal() {
          if (!this.selectedDocumentInModal) return;
          
          // Prevent multiple simultaneous selections
          const selectBtn = document.getElementById('selectDocumentFromModal');
          if (this.isLoadingDocument || (selectBtn && selectBtn.disabled)) {
              console.log('Document already loading, ignoring duplicate request');
              return;
          }

          // Set loading state
          this.isLoadingDocument = true;
          this.setSelectButtonLoading(true);

          try {
              const filename = this.selectedDocumentInModal.filename;
              const full_path = this.selectedDocumentInModal.full_path;
              
              // Check if this document is already loaded
              if (this.currentFile && this.currentFile.filename === filename) {
                  console.log('Document already loaded:', filename);
                  this.closeDocumentModal();
                  return;
              }

              await this.loadDocument(filename, full_path);
              this.closeDocumentModal();
              
              // Show file viewer if not visible
              if (!this.isVisible) {
                  this.showFileViewer();
              }
          } catch (error) {
              console.error('Error selecting document:', error);
              // Show error feedback to user
              this.showErrorMessage('Failed to load document. Please try again.');
          } finally {
              // Reset loading state
              this.isLoadingDocument = false;
              this.setSelectButtonLoading(false);
          }
      }

      setSelectButtonLoading(isLoading) {
          const selectBtn = document.getElementById('selectDocumentFromModal');
          if (!selectBtn) return;

          if (isLoading) {
              selectBtn.disabled = true;
              selectBtn.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Loading...
            `;
              selectBtn.style.opacity = '0.7';
          } else {
              selectBtn.disabled = !this.selectedDocumentInModal;
              selectBtn.innerHTML = `
                <i class="fas fa-check"></i>
                Select Document
            `;
              selectBtn.style.opacity = '1';
          }
      }

      showErrorMessage(message) {
          // Create or update error message element
          let errorElement = document.getElementById('modal-error-message');
          if (!errorElement) {
              errorElement = document.createElement('div');
              errorElement.id = 'modal-error-message';
              errorElement.className = 'modal-error-message';
              
              // Insert before modal footer
              const modalFooter = document.querySelector('.document-modal .modal-footer');
              if (modalFooter) {
                  modalFooter.parentNode.insertBefore(errorElement, modalFooter);
              }
          }

          errorElement.innerHTML = `
            <div class="error-content">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${message}</span>
                <button class="error-close" onclick="this.parentElement.parentElement.style.display='none'">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
          errorElement.style.display = 'block';

          // Auto-hide after 5 seconds
          setTimeout(() => {
              if (errorElement) {
                  errorElement.style.display = 'none';
              }
          }, 5000);
      }

      async loadDocument(filename, full_path = null) {
          // Clean up any previous PDF blob URLs
          this.cleanup();
          
          this.currentFile = { 
              filename,
              full_path: full_path 
          };
          
          // Update UI - basic update, will be enhanced in loadFilePreview for PDF/DOC files
          this.updateBasicFileInfo(filename);
          this.enableAnalysisButtons();
          
          // Load content preview
          await this.loadFilePreview(filename);
      }

      updateBasicFileInfo(filename) {
          const nameElement = document.getElementById('selectedFileName');
          const sizeElement = document.getElementById('selectedFileSize');
          
          if (nameElement) {
              nameElement.textContent = filename;
          }
          
          // Clear any existing PDF controls for non-PDF files
          const existingPdfControls = document.querySelector('.file-viewer-actions .pdf-controls');
          if (existingPdfControls) {
              existingPdfControls.remove();
          }
          
          // You could fetch file size here if available
          if (sizeElement) {
              sizeElement.textContent = '';
          }
      }

      updateFileInfo(filename) {
          // Legacy method - redirect to basic update
          this.updateBasicFileInfo(filename);
      }

      updateFileViewerHeader(filename, typeLabel, iconClassOrOptions, isDocFormat) {
          const nameElement = document.getElementById('selectedFileName');
          document.getElementById('selectedFileSize');
          const actionsContainer = document.querySelector('.file-viewer-actions');
          
          // Handle both old and new calling patterns
          let iconClass, options = {};
          if (typeof iconClassOrOptions === 'object') {
              options = iconClassOrOptions;
              iconClass = this.getFileIcon(filename);
          } else {
              iconClass = iconClassOrOptions;
          }
          
          if (nameElement) {
              // Always show the full file name with ellipsis and tooltip
              nameElement.innerHTML = `
                <i class="${iconClass}" style="color: var(--primary-color); margin-right: 8px;"></i>
                <span class="file-type-label">${typeLabel}</span>
                <span class="file-name-text" title="${filename}" style="max-width: 100%; display: inline-block; vertical-align: middle;">${filename}</span>
            `;
          }
          
          if (actionsContainer) {
              // Remove any existing PDF controls
              const existingPdfControls = actionsContainer.querySelector('.pdf-controls');
              if (existingPdfControls) {
                  existingPdfControls.remove();
              }
              
              // Add PDF controls for PDF/DOC files or when specifically requested
              if (typeLabel === 'PDF' || isDocFormat || options.showPdfToggle) {
                  const pdfControls = document.createElement('div');
                  pdfControls.className = 'pdf-controls';
                  
                  if (options.showPdfToggle) {
                      // We're in toggle mode
                      if (options.isPdfView) {
                          // Currently showing PDF, offer EditorJS view
                          pdfControls.innerHTML = `
                            <button class="btn-secondary pdf-control-btn" onclick="window.open('${options.pdfUrl}', '_blank')" title="Open in new tab">
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                            <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.showEditorJSVersion('${filename}')" title="Show rich editor">
                                <i class="fas fa-edit"></i>
                            </button>
                        `;
                      } else {
                          // Currently showing EditorJS, offer PDF view
                          pdfControls.innerHTML = `
                            <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.showPdfVersion()" title="Show PDF version">
                                <i class="fas fa-file-pdf"></i>
                            </button>
                        `;
                      }
                  } else {
                      // Default PDF controls - show EditorJS option
                      pdfControls.innerHTML = `
                        <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.showEditorJSVersion('${filename}')" title="Show rich editor">
                            <i class="fas fa-edit"></i>
                        </button>
                    `;
                  }
                  
                  // Add notes button
                  const notesBtn = document.createElement('button');
                  notesBtn.className = 'btn-secondary pdf-control-btn';
                  notesBtn.id = 'notesEditorBtn';
                  notesBtn.title = 'Open Notes Editor';
                  notesBtn.innerHTML = '<i class="fas fa-sticky-note"></i>';
                  notesBtn.onclick = () => FileViewerRedesigned.instance.openNotesEditor();
                  pdfControls.appendChild(notesBtn);
                  
                  // Insert before the manage documents button
                  const manageBtn = actionsContainer.querySelector('#manageDocumentsBtn');
                  if (manageBtn) {
                      actionsContainer.insertBefore(pdfControls, manageBtn);
                  } else {
                      actionsContainer.insertBefore(pdfControls, actionsContainer.firstChild);
                  }
              }
          }
          
          // Set up instance reference for PDF controls
          FileViewerRedesigned.instance = this;
      }

      enableAnalysisButtons() {
          const buttons = [
              'generateSummaryBtn',
              'extractReferencesBtn', 
              'findHighlightsBtn',
              'suggestInsightsBtn'
          ];
          
          buttons.forEach(buttonId => {
              const btn = document.getElementById(buttonId);
              if (btn) {
                  btn.disabled = false;
              }
          });
      }

      disableAnalysisButtons() {
          const buttons = [
              'generateSummaryBtn',
              'extractReferencesBtn',
              'findHighlightsBtn', 
              'suggestInsightsBtn'
          ];
          
          buttons.forEach(buttonId => {
              const btn = document.getElementById(buttonId);
              if (btn) {
                  btn.disabled = true;
              }
          });
      }

      async performAnalysis(analysisType) {
          if (!this.currentFile) {
              this.showToast('Please select a document first', 'warning');
              return;
          }

          const chatInput = document.getElementById('chatInput');
          if (!chatInput) return;

          let prompt = '';
          const filename = this.currentFile.filename;

          switch (analysisType) {
              case 'summary':
                  prompt = `Please provide a comprehensive summary of the document "${filename}". Include the main topics, key points, and conclusions.`;
                  break;
              case 'references':
                  prompt = `Extract all references, citations, and links mentioned in the document "${filename}". Include any bibliographic information or sources cited.`;
                  break;
              case 'highlights':
                  prompt = `Find and extract the key highlights, important annotations, and emphasized points from the document "${filename}". Look for any highlighted text, bold statements, or specially marked sections.`;
                  break;
              case 'insights':
                  prompt = `Based on the content of "${filename}", suggest related insights, knowledge expansions, and connections to other topics. What additional research or questions might be relevant?`;
                  break;
          }

          // Set the prompt in chat input
          chatInput.value = prompt;
          chatInput.focus();
          
          // Trigger input event to update UI
          chatInput.dispatchEvent(new Event('input', { bubbles: true }));
          
          // Auto-scroll chat input into view
          chatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      clearSelection() {
          this.currentFile = null;
          this.disableAnalysisButtons();
          
          // Reset UI
          const nameElement = document.getElementById('selectedFileName');
          const sizeElement = document.getElementById('selectedFileSize');
          const previewContent = document.getElementById('filePreviewContent');
          
          if (nameElement) nameElement.textContent = 'Select a document';
          if (sizeElement) sizeElement.textContent = '';
          if (previewContent) {
              previewContent.innerHTML = `
                <div class="preview-placeholder">
                    <i class="fas fa-file-alt"></i>
                    <p>Select a document to preview</p>
                    <button id="selectDocumentBtn" class="btn-primary">
                        <i class="fas fa-folder-open"></i>
                        Browse Documents
                    </button>
                </div>
            `;
              
              // Re-attach event listener
              document.getElementById('selectDocumentBtn')?.addEventListener('click', () => {
                  this.openDocumentModal();
              });
          }
      }

      showToast(message, type = 'info') {
          // Simple toast notification
          const toast = document.createElement('div');
          toast.className = `toast toast-${type}`;
          toast.textContent = message;
          toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--primary-color);
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
          
          if (type === 'error') {
              toast.style.background = '#e74c3c';
          } else if (type === 'success') {
              toast.style.background = '#27ae60';
          } else if (type === 'warning') {
              toast.style.background = '#f39c12';
          }
          
          document.body.appendChild(toast);
          
          setTimeout(() => {
              toast.style.animation = 'slideOut 0.3s ease';
              setTimeout(() => {
                  document.body.removeChild(toast);
              }, 300);
          }, 3000);
      }

      isFileViewerVisible() {
          return this.isVisible;
      }
      
      showEditorJSVersion(filename) {
          const previewContent = document.getElementById('filePreviewContent');
          if (!previewContent) return;
          
          // Show the EditorJS version
          const container = previewContent.querySelector('.pdf-viewer-container');
          if (container) {
              const pdfContainer = container.querySelector('.pdf-content-container');
              let editorContainer = container.querySelector('.editorjs-fallback');
              
              // Create EditorJS container if it doesn't exist
              if (!editorContainer) {
                  editorContainer = document.createElement('div');
                  editorContainer.className = 'editorjs-fallback';
                  editorContainer.style.cssText = `
                    display: none;
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    background: var(--surface);
                `;
                  
                  // Create EditorJS container
                  const editorJSContainer = document.createElement('div');
                  editorJSContainer.id = 'fileViewerEditorJS';
                  editorJSContainer.style.cssText = `
                    width: 100%;
                    max-width: 100%;
                    margin: 0 auto;
                `;
                  
                  editorContainer.appendChild(editorJSContainer);
                  container.appendChild(editorContainer);
              }
              
              if (pdfContainer && editorContainer) {
                  pdfContainer.style.display = 'none';
                  editorContainer.style.display = 'flex';
                  
                  // Initialize EditorJS with document content
                  this.initializeEditorJS(filename);
                  
                  // Always use correct file type label
                  const fname = filename || this.currentFile?.filename;
                  const ext = fname ? fname.split('.').pop().toLowerCase() : '';
                  const isDoc = ext === 'doc' || ext === 'docx';
                  const typeLabel = isDoc ? 'Word Document' : 'PDF Document';
                  this.updateFileViewerHeader(fname, typeLabel, {
                      showPdfToggle: true,
                      isPdfView: false,
                      pdfUrl: this.currentPdfUrl
                  });
              }
          }
      }
      
      showPdfVersion() {
          const previewContent = document.getElementById('filePreviewContent');
          if (!previewContent) return;
          
          const container = previewContent.querySelector('.pdf-viewer-container');
          if (container) {
              const pdfContainer = container.querySelector('.pdf-content-container');
              const editorContainer = container.querySelector('.editorjs-fallback');
              
              if (pdfContainer) {
                  pdfContainer.style.display = 'flex';
                  
                  // Hide EditorJS container if it exists
                  if (editorContainer) {
                      editorContainer.style.display = 'none';
                      // Destroy EditorJS instance to free memory
                      this.destroyEditorJS();
                  }
                  
                  // Always use correct file type label
                  const fname = this.currentFile?.filename;
                  const ext = fname ? fname.split('.').pop().toLowerCase() : '';
                  const isDoc = ext === 'doc' || ext === 'docx';
                  const typeLabel = isDoc ? 'Word Document' : 'PDF Document';
                  this.updateFileViewerHeader(fname, typeLabel, {
                      showPdfToggle: true,
                      isPdfView: true,
                      pdfUrl: this.currentPdfUrl
                  });
              }
          }
      }

      async initializeEditorJS(filename) {
          try {
              // Destroy existing instance if any
              this.destroyEditorJS();
              
              // Get document content for EditorJS
              const documentText = await this.getDocumentContentForEditorJS(filename);
              
              // Initialize EditorJS
              this.editorJSInstance = new EditorJS({
                  holder: 'fileViewerEditorJS',
                  readOnly: true, // Make it read-only for viewing
                  tools: {
                      header: {
                          class: Header,
                          config: {
                              placeholder: 'Enter a header',
                              levels: [1, 2, 3, 4, 5, 6],
                              defaultLevel: 2
                          }
                      },
                      paragraph: {
                          class: Paragraph,
                          inlineToolbar: true,
                      },
                      list: {
                          class: EditorjsList,
                          inlineToolbar: true,
                          config: {
                              defaultStyle: 'unordered'
                          }
                      },
                      quote: {
                          class: Quote,
                          inlineToolbar: true,
                          config: {
                              quotePlaceholder: 'Enter a quote',
                              captionPlaceholder: 'Quote\'s author',
                          },
                      },
                      marker: {
                          class: Marker,
                      },
                      code: {
                          class: CodeTool,
                          config: {
                              placeholder: 'Enter code'
                          }
                      },
                      delimiter: Delimiter,
                      table: {
                          class: Table,
                          inlineToolbar: true,
                          config: {
                              rows: 2,
                              cols: 3,
                          },
                      },
                  },
                  data: documentText,
                  placeholder: 'Document content will appear here...'
              });

              console.log('EditorJS initialized for file viewer');
          } catch (error) {
              console.error('Failed to initialize EditorJS:', error);
              // Fallback to simple text display
              this.showSimpleTextFallback(filename);
          }
      }

      async getDocumentContentForEditorJS(filename) {
          try {
              if (!this.currentFile) {
                  throw new Error('No current file selected');
              }

              // Call backend to convert document to EditorJS format
              console.log('Current file object:', this.currentFile);
              
              const response = await fetch('/api/document-to-editorjs', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                      document_path: this.currentFile.full_path || this.currentFile.filename,
                      filename: filename
                  })
              });

              if (!response.ok) {
                  const errorText = await response.text();
                  console.error('Backend error:', errorText);
                  throw new Error(`HTTP error! status: ${response.status}`);
              }

              const result = await response.json();
              
              console.log('EditorJS data received:', result.editorjs_data);
              
              // Debug: Check if accents are present in first block
              if (result.editorjs_data && result.editorjs_data.blocks && result.editorjs_data.blocks[0]) {
                  const firstBlockText = result.editorjs_data.blocks[0].data?.text || '';
                  console.log('First block text sample:', firstBlockText.substring(0, 200));
                  console.log('First block text with accents check:', /[áéíóúñü]/i.test(firstBlockText) ? 'HAS ACCENTS' : 'NO ACCENTS');
              }
              
              if (result.success) {
                  return result.editorjs_data;
              } else {
                  throw new Error(result.error || 'Failed to convert document');
              }
          } catch (error) {
              console.error('Error getting document content for EditorJS:', error);
              
              // Fallback: create simple EditorJS structure from any available text
              const textFallback = document.querySelector('.pdf-text-fallback');
              let content = '';
              
              if (textFallback) {
                  content = textFallback.textContent || textFallback.innerText || '';
              }
              
              if (!content.trim()) {
                  content = `Document: ${filename}\n\nContent could not be extracted for rich editing. Please view the PDF version for the complete document.`;
              }

              // Convert plain text to basic EditorJS blocks
              const paragraphs = content.split('\n\n').filter(p => p.trim());
              const blocks = paragraphs.map((paragraph, index) => {
                  const text = paragraph.trim();
                  if (!text) return null;
                  
                  // Simple heuristic for headers (lines that are short and followed by content)
                  if (text.length < 100 && index < paragraphs.length - 1 && !text.endsWith('.')) {
                      return {
                          type: 'header',
                          data: {
                              text: text,
                              level: 2
                          }
                      };
                  } else {
                      return {
                          type: 'paragraph',
                          data: {
                              text: text
                          }
                      };
                  }
              }).filter(block => block !== null);

              return {
                  time: Date.now(),
                  blocks: blocks.length > 0 ? blocks : [{
                      type: 'paragraph',
                      data: {
                          text: content
                      }
                  }],
                  version: '2.28.0'
              };
          }
      }

      showSimpleTextFallback(filename) {
          const container = document.getElementById('fileViewerEditorJS');
          if (container) {
              const textFallback = document.querySelector('.pdf-text-fallback');
              let content = textFallback ? textFallback.textContent || textFallback.innerText || '' : '';
              
              if (!content.trim()) {
                  content = `Document: ${filename}\n\nContent could not be displayed. Please view the PDF version.`;
              }

              container.innerHTML = `
                <div style="padding: 20px; background: var(--surface-2); border-radius: 8px; font-family: var(--font-family);">
                    <h3 style="margin-top: 0; color: var(--text-color);">Document Content</h3>
                    <pre style="white-space: pre-wrap; font-family: inherit; color: var(--text-color); line-height: 1.6;">${content}</pre>
                </div>
            `;
          }
      }

      destroyEditorJS() {
          if (this.editorJSInstance) {
              try {
                  this.editorJSInstance.destroy();
                  this.editorJSInstance = null;
                  console.log('EditorJS instance destroyed');
              } catch (error) {
                  console.warn('Error destroying EditorJS instance:', error);
                  this.editorJSInstance = null;
              }
          }
      }

      applyHighlights(highlights) {
          /**
           * Apply visual highlights to the currently displayed document
           * @param {Array} highlights - Array of highlight objects with text, relevance, and context
           */
          console.log('Applying highlights to document:', highlights);
          
          if (!highlights || highlights.length === 0) {
              console.warn('No highlights to apply');
              return;
          }

          const previewContent = document.getElementById('filePreviewContent');
          if (!previewContent) {
              console.error('Preview content not found');
              return;
          }

          // Check if we're viewing PDF or text version
          const container = previewContent.querySelector('.pdf-viewer-container');
          if (container) {
              const pdfContainer = container.querySelector('.pdf-content-container');
              const textFallback = container.querySelector('.pdf-text-fallback');
              
              // If PDF is visible, apply highlights to text overlay
              if (pdfContainer && pdfContainer.style.display !== 'none') {
                  this.applyHighlightsToPDF(highlights);
              }
              
              // If text version is visible, apply highlights to text content
              if (textFallback && textFallback.style.display !== 'none') {
                  this.applyHighlightsToText(highlights, textFallback);
              }
          } else {
              // Apply highlights to regular content
              this.applyHighlightsToText(highlights, previewContent);
          }

          // Show notification
          this.showHighlightNotification(highlights.length);
      }

      applyHighlightsToPDF(highlights) {
          /**
           * Apply highlights to PDF viewer (overlay method)
           */
          console.log('Applying PDF highlights (overlay method)');
          
          // Create or update highlight overlay
          const pdfFrame = document.querySelector('#filePreviewContent iframe');
          if (!pdfFrame) {
              console.warn('PDF iframe not found for highlighting');
              return;
          }

          // For now, we'll create a notification overlay
          // In a full implementation, you would integrate with PDF.js for proper highlighting
          const overlay = document.createElement('div');
          overlay.className = 'pdf-highlight-overlay';
          overlay.innerHTML = `
            <div class="highlight-notification">
                <span class="highlight-icon">🎨</span>
                <span class="highlight-text">${highlights.length} sections highlighted</span>
                <button class="highlight-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;
          
          const container = pdfFrame.parentElement;
          container.style.position = 'relative';
          container.appendChild(overlay);

          // Auto-remove after 5 seconds
          setTimeout(() => {
              if (overlay.parentElement) {
                  overlay.remove();
              }
          }, 5000);
      }

      applyHighlightsToText(highlights, container) {
          /**
           * Apply highlights to text content using mark elements
           */
          console.log('Applying text highlights');
          
          let content = container.innerHTML;
          
          // Sort highlights by relevance (highest first)
          const sortedHighlights = highlights.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
          
          // Apply highlights with different colors based on relevance
          sortedHighlights.forEach((highlight, index) => {
              const text = highlight.text;
              if (!text || text.length < 3) return; // Skip very short text
              
              const relevance = highlight.relevance || 5;
              
              // Create highlight with opacity based on relevance
              const highlightClass = `highlight-${Math.ceil(relevance / 2)}`; // Classes 1-5
              const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`(${escapedText})`, 'gi');
              
              content = content.replace(regex, `<mark class="ai-highlight ${highlightClass}" data-relevance="${relevance}" title="${highlight.context || 'Highlighted text'}">$1</mark>`);
          });
          
          container.innerHTML = content;
      }

      showHighlightNotification(count) {
          /**
           * Show a brief notification about applied highlights
           */
          const notification = document.createElement('div');
          notification.className = 'highlight-success-notification';
          notification.innerHTML = `
            <span class="success-icon">✨</span>
            <span class="success-text">${count} highlights applied</span>
        `;
          
          document.body.appendChild(notification);
          
          // Animate in
          setTimeout(() => notification.classList.add('show'), 100);
          
          // Remove after 3 seconds
          setTimeout(() => {
              notification.classList.remove('show');
              setTimeout(() => notification.remove(), 300);
          }, 3000);
      }

  };

  Object.entries(preview).forEach(([key, fn]) => {
      if (typeof fn === 'function') {
          FileViewerRedesigned$1.prototype[key] = fn;
      }
  });

  Object.entries(pdf).forEach(([key, fn]) => {
      if (typeof fn === 'function') {
          FileViewerRedesigned$1.prototype[key] = fn;
      }
  });

  Object.entries(notes).forEach(([key, fn]) => {
      if (typeof fn === 'function') {
          FileViewerRedesigned$1.prototype[key] = fn;
      }
  });

  const layoutMethods = {
      toggleFileViewer: toggleFileViewer,
      showFileViewer: showFileViewer,
      hideFileViewer: hideFileViewer,
      updateToggleButtonState: updateToggleButtonState,
      checkAndShowFileViewer: checkAndShowFileViewer,
  };

  Object.entries(layoutMethods).forEach(([key, fn]) => {
      if (typeof fn === 'function') {
          FileViewerRedesigned$1.prototype[key] = fn;
      }
  });

  // Entry point for chat file viewer modules

  const GLOBAL_INSTANCE_KEY = '__chatFileViewerInstance';
  const GLOBAL_STYLE_FLAG = '__chatFileViewerAnimationsInjected';

  let instance$4 = null;
  let styleInjected = false;

  function readInstance() {
    if (typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, GLOBAL_INSTANCE_KEY)) {
      instance$4 = window[GLOBAL_INSTANCE_KEY];
    }
    return instance$4;
  }

  function writeInstance(value) {
    instance$4 = value;
    if (typeof window !== 'undefined') {
      window[GLOBAL_INSTANCE_KEY] = value;
    }
  }

  function ensureNamespace() {
    if (typeof window === 'undefined') return null;
    window.FileViewerRedesigned = window.FileViewerRedesigned || {};
    return window.FileViewerRedesigned;
  }

  function exposeGlobals() {
    const ns = ensureNamespace();
    if (!ns) return;

    const descriptor = Object.getOwnPropertyDescriptor(ns, 'instance');
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(ns, 'instance', {
        configurable: true,
        get: () => readInstance(),
        set: (value) => writeInstance(value),
      });
    }

    ns.init = init$6;
    ns.getInstance = getInstance$2;
  }

  function injectAnimations() {
    if (styleInjected) return;
    if (typeof window !== 'undefined' && window[GLOBAL_STYLE_FLAG]) {
      styleInjected = true;
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
    document.head.appendChild(style);
    styleInjected = true;
    if (typeof window !== 'undefined') {
      window[GLOBAL_STYLE_FLAG] = true;
    }
  }

  function init$6() {
    let current = readInstance();
    if (!current) {
      current = new FileViewerRedesigned$1();
      writeInstance(current);
    } else {
      writeInstance(current);
    }
    injectAnimations();
    return current;
  }

  function getInstance$2() {
    return readInstance();
  }

  exposeGlobals();

  var fileviewer = /*#__PURE__*/Object.freeze({
    __proto__: null,
    FileViewerRedesigned: FileViewerRedesigned$1,
    getInstance: getInstance$2,
    init: init$6
  });

  /**
   * Enhanced Document Actions Manager
   * Provides contextual document analysis actions in a minimalistic floating UI
   */
  class DocumentActionsManager {
      constructor() {
          this.actionsBar = null;
          this.currentDocument = null;
          this.isVisible = false;
          this.isFileViewerOpen = false;
          this.actions = this.getActionDefinitions();
          this.init();
      }

      init() {
          this.createActionsBar();
          this.setupEventListeners();
          this.observeFileViewer();
          this.setupPdfHighlightSync();
          this.currentHighlightRef = null;
          this._docHashCache = null;
      }

      getActionDefinitions() {
          return [
              {
                  id: 'summarize',
                  icon: '∑',
                  label: 'Summary',
                  tooltip: 'Generate document summary',
                  prompt: (docName) => `Please provide a comprehensive summary of "${docName}". Include the main topics, key findings, and overall purpose.`
              },
              {
                  id: 'key-points',
                  icon: '📋',
                  label: 'Points',
                  tooltip: 'Extract key points',
                  prompt: (docName) => `Extract the most important key points and highlights from "${docName}". Focus on actionable insights and critical information.`
              },
              {
                  id: 'highlight',
                  icon: '✦',
                  label: 'Highlight',
                  tooltip: 'Highlight document (AI-assisted). Use chat to specify what to highlight.',
                  special: true
              },
              {
                  id: 'expand',
                  icon: '✨',
                  label: 'Expand',
                  tooltip: 'Quickly expand the selected text',
                  // Quick response: expand selected passage only
                  prompt: () => `Expand and enrich the selected passage while preserving its meaning and tone. Add clarifying context, concrete examples, brief definitions of terms, and smooth transitions. Return a revised version of the passage that integrates the additions inline.`
              },
              {
                  id: 'references',
                  icon: '🔗',
                  label: 'Refs',
                  tooltip: 'Find references and citations',
                  prompt: (docName) => `Find and list all references, citations, sources, and external links mentioned in "${docName}".`
              },
              {
                  id: 'insights',
                  icon: '💡',
                  label: 'Ideas',
                  tooltip: 'Generate insights and connections',
                  prompt: (docName) => `Analyze "${docName}" and provide insights on how this connects to other knowledge areas. Suggest ways to expand or build upon these ideas.`
              },
              {
                  id: 'ask',
                  icon: '?',
                  label: 'Ask',
                  tooltip: 'Explain the selected passage (quick)',
                  // Quick response: explain selection succinctly
                  prompt: () => `Explain the selected passage clearly. Cover the main idea, why it matters, and any underlying assumptions. Define key terms briefly and avoid repeating the text verbatim.`
              }
          ];
      }

      createActionsBar() {
          const actionsHTML = `
            <div class="document-actions-bar" id="documentActionsBar">
                <div class="document-context-indicator" id="docContextIndicator">
                    Document
                </div>
                ${this.actions.map(action => `
                    <button class="doc-action-btn" 
                            data-action="${action.id}"
                            ${action.id === 'highlight' ? 'id="highlightDocumentBtn"' : ''}
                            title="${action.tooltip}">
                        <span class="icon">${action.icon}</span>
                        <span class="label">${action.label}</span>
                    </button>
                `).join('')}
            </div>
        `;

          // Insert into chat input area for proper relative positioning
          const chatInputArea = document.querySelector('.chat-input-area');
          if (chatInputArea) {
              chatInputArea.insertAdjacentHTML('afterbegin', actionsHTML);
              this.actionsBar = document.getElementById('documentActionsBar');
              
              // Add responsive behavior
              this.setupResponsiveBehavior();
          } else {
              // Fallback to body if area not found
              document.body.insertAdjacentHTML('beforeend', actionsHTML);
              this.actionsBar = document.getElementById('documentActionsBar');
          }
      }

      setupEventListeners() {
          if (!this.actionsBar) return;

          // Handle action button clicks
          this.actionsBar.addEventListener('click', (e) => {
              const button = e.target.closest('.doc-action-btn');
              if (!button || button.classList.contains('loading')) return;

              const actionId = button.dataset.action;
              const action = this.actions.find(a => a.id === actionId);
              if (action) {
                  this.handleAction(action, button);
              }
          });

          // Listen for document selection from file viewer
          document.addEventListener('documentSelected', (e) => {
              this.setCurrentDocument(e.detail);
          });

          // Listen for file viewer state changes
          document.addEventListener('fileViewerStateChanged', (e) => {
              this.setFileViewerState(e.detail.isOpen);
          });

          // Listen for keyboard shortcuts
          document.addEventListener('keydown', (e) => {
              if (this.isVisible && e.altKey && !e.ctrlKey && !e.metaKey) {
                  const actionIndex = parseInt(e.key) - 1;
                  if (actionIndex >= 0 && actionIndex < this.actions.length) {
                      e.preventDefault();
                      const button = this.actionsBar.querySelector(`[data-action="${this.actions[actionIndex].id}"]`);
                      if (button) button.click();
                  }
              }
          });
      }

      observeFileViewer() {
          // Observe the file viewer for visibility changes
          // Updated to target the correct panel element id
          const fileViewer = document.getElementById('fileViewerPanel');
          if (fileViewer) {
              const computeOpen = () => {
                  const classHidden = fileViewer.classList.contains('is-hidden');
                  const display = window.getComputedStyle(fileViewer).display;
                  return !classHidden && display !== 'none';
              };

              const observer = new MutationObserver((mutations) => {
                  for (const mutation of mutations) {
                      if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
                          this.setFileViewerState(computeOpen());
                      }
                  }
              });

              observer.observe(fileViewer, {
                  attributes: true,
                  attributeFilter: ['class', 'style']
              });

              // Check initial state
              this.setFileViewerState(computeOpen());
          }
      }

      setCurrentDocument(document) {
          this.currentDocument = document;
          this.updateContextIndicator();
          this.updateVisibility();
          // Attempt to restore last saved selection for quick navigation
          this.restoreLastSelectionForDoc();
      }

      setFileViewerState(isOpen) {
          this.isFileViewerOpen = isOpen;
          this.updateVisibility();
      }

      updateContextIndicator() {
          const indicator = document.getElementById('docContextIndicator');
          if (indicator && this.currentDocument) {
              const shortName = this.currentDocument.filename.length > 12 
                  ? this.currentDocument.filename.substring(0, 9) + '...'
                  : this.currentDocument.filename;
              indicator.textContent = shortName;
          }
      }

      updateVisibility() {
          // Show the actions bar whenever the file viewer is open.
          // If no document is selected yet, actions that require a document
          // will no-op, but the bar remains visible for discoverability.
          const shouldShow = this.isFileViewerOpen;

          if (shouldShow && !this.isVisible) {
              this.show();
          } else if (!shouldShow && this.isVisible) {
              this.hide();
          }
      }

      restoreLastSelectionForDoc() {
          try {
              if (!this.currentDocument) return;
              const key = `docSelections:${this.getDocId()}`;
              const arr = JSON.parse(localStorage.getItem(key) || '[]');
              if (!Array.isArray(arr) || arr.length === 0) return;
              const last = arr[arr.length - 1];
              const meta = { page: last.page, anchor: last.anchor, rects: last.rects || [] };
              this.postToPdfViewer({ type: 'selection:navigate', meta });
          } catch (e) { /* ignore */ }
      }

      async handleAction(action, button) {
          if (!this.currentDocument) return;

          // Handle special actions (like highlight)
          if (action.special) {
              this.handleSpecialAction(action, button);
              return;
          }

          // Require a selection for quick Expand/Ask actions
          if ((action.id === 'expand' || action.id === 'ask') && !(this.currentHighlightRef && this.currentHighlightRef.page)) {
              this.showBriefFeedback(button, '!');
              const chatInput = document.querySelector('#chatInput');
              if (chatInput) {
                  chatInput.focus();
                  chatInput.placeholder = 'Select text in the PDF first…';
              }
              // Optionally nudge the PDF viewer into selection mode
              try { this.postToPdfViewer({ type: 'highlight:activate' }); } catch {}
              return;
          }

          // Single smooth animation - just show brief success feedback
          this.showBriefFeedback(button, '✓');

          try {
              // Ensure highlight mode doesn't intercept this send
              if (window.documentHighlightingEnabled) {
                  const highlightBtn = document.querySelector('[data-action="highlight"]');
                  this.disableHighlightMode(highlightBtn);
              }
              let prompt = action.prompt(this.currentDocument.filename);
              // If we have an active selection reference from PDF, scope and constrain output
              if (this.currentHighlightRef && this.currentHighlightRef.page) {
                  // Ensure doc hash cached so docId includes version
                  try { await this.computeAndCacheDocHash(); } catch (e) {}
                  const ref = this.currentHighlightRef;
                  const shortQuote = (ref.anchor || '').toString().normalize('NFC').slice(0, 120);
                  const selectionText = (ref.text || ref.anchor || '').toString().normalize('NFC').slice(0, 4000);
                  const constraints = this.buildConciseConstraints(action.id);
                  const hiddenSelection = selectionText ? `
[SELECTION]
${selectionText}
[/SELECTION]` : '';
                  prompt = `${prompt}

Context: Only use the user-selected highlight (page ${ref.page}).
Anchor: "${shortQuote}"${hiddenSelection}
${constraints}`;
              }
              const hasSel = !!(this.currentHighlightRef && this.currentHighlightRef.page);
              // Always show the compact action label only; if there's a selection, we'll add a Jump pill next to it in chat.js
              const displayLabel = `${action.label}`;
              const selectionRef = hasSel ? { ...this.currentHighlightRef, docId: this.getDocId(), docHash: this.getCachedDocHash(window.currentChatId || 'default', (this.currentDocument && this.currentDocument.filename) || 'unknown') } : null;
              await this.insertPromptToChat(prompt, action.interactive, { displayLabel, selectionRef });
              
          } catch (error) {
              console.error('Action failed:', error);
              // Show error feedback only if the action actually failed
              this.showBriefFeedback(button, '✗');
          }
      }

      buildConciseConstraints(actionId) {
          // Default tight constraints for short selections (one page or less)
          const common = [
              '- Keep it concise and non-repetitive.',
              '- Avoid restating the full text; synthesize only.',
          ];
          if (actionId === 'expand') {
              return `Constraints:\n- Return a revised, expanded passage.\n- Preserve original meaning, tone, and person.\n- About 1.5–3× the original length.\n- Keep formatting and line breaks sensible.\n${common.join('\n')}`;
          }
          if (actionId === 'ask') {
              return `Constraints:\n- Explain plainly in ≤ 150 words.\n- Define key terms briefly.\n${common.join('\n')}`;
          }
          if (actionId === 'key-points') {
              return `Constraints:\n- Return at most 5 bullet points.\n- Each bullet ≤ 12 words.\n${common.join('\n')}`;
          }
          if (actionId === 'insights') {
              return `Constraints:\n- Return at most 4 bullet points.\n- Each bullet ≤ 16 words.\n${common.join('\n')}`;
          }
          if (actionId === 'references') {
              return `Constraints:\n- Return at most 5 items.\n- Use one terse line per item.\n${common.join('\n')}`;
          }
          // summarize or other
          return `Constraints:\n- ≤ 120 words total.\n${common.join('\n')}`;
      }

      handleSpecialAction(action, button) {
          if (action.id === 'highlight') {
              // Check if highlight mode is already active
              if (window.documentHighlightingEnabled || document.querySelector('.highlight-pill')) {
                  // If active, disable it
                  this.disableHighlightMode(button);
              } else {
                  // If not active, enable it
                  this.enableHighlightMode(button);
              }
          } else if (action.id === 'ask') {
              // Single feedback animation for ask action
              this.showBriefFeedback(button, '✓');
              this.enableAskMode();
          } else if (action.id === 'expand') {
              // Guided expansion around current selection
              if (!this.currentHighlightRef || !this.currentHighlightRef.page) {
                  // No anchor selection yet — hint the user
                  this.showBriefFeedback(button, '!');
                  const chatInput = document.querySelector('#chatInput');
                  if (chatInput) {
                      chatInput.focus();
                      chatInput.placeholder = 'Select text in the PDF first, then click Expand…';
                  }
                  return;
              }
              this.showBriefFeedback(button, '✓');
              this.enableGuidedExpansionMode(button);
          }
      }

      enableGuidedExpansionMode(button) {
          // Avoid duplicates
          if (document.querySelector('.expand-pill')) return;

          // Mark guided expansion globally for chat interception
          window.guidedExpansionEnabled = true;

          const chatWrapper = document.querySelector('.chat-input-wrapper');
          if (!chatWrapper) return;

          const pill = document.createElement('div');
          pill.className = 'expand-pill';
          pill.innerHTML = `
            <div class="pill-icon wand"></div>
            <span class="pill-text">Expand around anchor</span>
            <button class="pill-close" title="Cancel">&times;</button>
        `;

          const inputButtonsLeft = chatWrapper.querySelector('.input-buttons-left');
          if (inputButtonsLeft) inputButtonsLeft.insertAdjacentElement('afterend', pill);
          else chatWrapper.prepend(pill);

          const closeBtn = pill.querySelector('.pill-close');
          closeBtn.addEventListener('click', () => this.disableGuidedExpansionMode(pill));

          const chatInput = document.querySelector('#chatInput');
          if (chatInput) {
              chatInput.focus();
              chatInput.placeholder = "Type what to expand (e.g. 'evidence near this claim')…";
          }
      }

      disableGuidedExpansionMode(pillEl = null) {
          window.guidedExpansionEnabled = false;
          const chatInput = document.querySelector('#chatInput');
          if (chatInput) chatInput.placeholder = 'Type your message...';
          const pill = pillEl || document.querySelector('.expand-pill');
          if (pill) {
              pill.style.opacity = '0';
              pill.style.transform = 'translateY(-10px)';
              setTimeout(() => pill.remove(), 180);
          }
      }

      enableHighlightMode(button, opts = {}) {
          // Check if pill already exists for AI mode
          if (document.querySelector('.highlight-pill')) {
              return;
          }

          // Set button to selected state with checkmark ONLY
          if (button) {
              button.innerHTML = `<span class="icon">✓</span>`;
              button.classList.add('selected');
          }

          const chatWrapper = document.querySelector('.chat-input-wrapper');
          if (!chatWrapper) {
              console.error('Chat input wrapper not found');
              return;
          }

          // Create AI highlight pill with distinct style
          const pill = document.createElement('div');
          pill.className = 'highlight-pill';
          pill.innerHTML = `
            <div class="pill-icon"></div>
            <span class="pill-text">AI Highlighter on</span>
            <button class="pill-close" title="Cancel">&times;</button>
        `;

          // Insert pill right after the input-buttons-left in the chat wrapper
          const inputButtonsLeft = chatWrapper.querySelector('.input-buttons-left');
          if (inputButtonsLeft) {
              // Insert after the left buttons
              inputButtonsLeft.insertAdjacentElement('afterend', pill);
          } else {
              // Fallback: prepend to chat wrapper
              chatWrapper.prepend(pill);
          }

          // Set global AI highlighting state (separate from guided selection toggle)
          window.documentHighlightingEnabled = true;

          // Setup event listeners with reference to the button
          this.setupPillEventListeners(pill, button);

          // Focus chat input and update placeholder
          const chatInput = document.querySelector('#chatInput');
          if (chatInput) {
              chatInput.focus();
              chatInput.placeholder = "Type what you want to highlight (e.g. 'key findings', 'methodology')...";
          }
      }

      enableAskMode() {
          // Focus chat input and change placeholder
          const chatInput = document.querySelector('#chatInput');
          if (chatInput) {
              chatInput.focus();
              chatInput.placeholder = "Ask a question about the document...";
          }
      }

      disableHighlightMode(button, opts = {}) {
          // Remove AI highlighting state
          window.documentHighlightingEnabled = false;
          
          // Reset button to original state (distinct icon from PDF viewer)
          if (button) {
              button.innerHTML = `<span class="icon">✦</span><span class="label">Highlight</span>`;
              button.classList.remove('selected');
          }
          
          // Do not toggle PDF viewer marker here; only clean up UI state.

          // Reset chat input placeholder
          const chatInput = document.querySelector('#chatInput');
          if (chatInput) {
              chatInput.placeholder = "Type your message...";
          }
          
          // Find and remove existing AI highlight pill
          const pill = document.querySelector('.highlight-pill');
          if (pill) {
              this.closePill(pill, button);
          }
      }

      setupPillEventListeners(pill, highlightButton) {
          const closeBtn = pill.querySelector('.pill-close');

          // Handle close action
          closeBtn.addEventListener('click', () => {
              this.closePill(pill, highlightButton);
          });
      }

      showGuidedSelectionPill(meta) {
          // Create or update a single guided pill reflecting anchor state
          window.guidedSelectionActive = true;
          const chatWrapper = document.querySelector('.chat-input-wrapper');
          if (!chatWrapper) return;
          let pill = document.querySelector('.guided-pill');
          if (!pill) {
              pill = document.createElement('div');
              pill.className = 'guided-pill expand-pill';
              pill.innerHTML = `
                <span class="selection-icon guided-toggle-icon" title="Toggle guided selection" aria-hidden="true"></span>
                <button class="pill-close" title="Clear guided selection">&times;</button>
            `;
              const left = chatWrapper.querySelector('.input-buttons-left');
              if (left) left.insertAdjacentElement('afterend', pill); else chatWrapper.prepend(pill);
              const closeBtn = pill.querySelector('.pill-close');
              closeBtn.addEventListener('click', () => {
                  try { pill.remove(); } catch {}
                  window.guidedSelectionActive = false;
                  // Also deactivate guided selection in the PDF viewer toolbar
                  try { this.postToPdfViewer({ type: 'highlight:deactivate' }); } catch {}
              });
          }
          // Do not set state here; caller decides (activated -> light, created -> dark)
          const chatInput = document.querySelector('#chatInput');
          if (chatInput) {
              chatInput.focus();
              chatInput.placeholder = 'Type query…';
          }
      }

      updateGuidedPillState(hasSelection) {
          const pill = document.querySelector('.guided-pill');
          if (!pill) return;
          pill.classList.toggle('on', !!hasSelection);
          pill.classList.toggle('off', !hasSelection);
      }

      closePill(pill, highlightButton = null) {
          // Remove AI highlighting state only if closing the AI pill
          if (pill && pill.classList.contains('highlight-pill')) {
              window.documentHighlightingEnabled = false;
          }

          // If closing guided selection pill, deactivate viewer marker mode too
          if (pill && pill.classList.contains('guided-pill')) {
              window.guidedSelectionActive = false;
              try { this.postToPdfViewer({ type: 'highlight:deactivate' }); } catch {}
          }
          
          // Reset highlight button to unselected state
          if (highlightButton) {
              highlightButton.innerHTML = `<span class="icon">✦</span><span class="label">Highlight</span>`;
              highlightButton.classList.remove('selected');
          } else {
              // Find highlight button if not provided
              const highlightBtn = document.querySelector('[data-action="highlight"]');
              if (highlightBtn) {
                  highlightBtn.innerHTML = `<span class="icon">✦</span><span class="label">Highlight</span>`;
                  highlightBtn.classList.remove('selected');
              }
          }
          
          // Reset chat input placeholder
          const chatInput = document.querySelector('#chatInput');
          if (chatInput) {
              chatInput.placeholder = "Type your message...";
          }
          
          // Remove pill with animation
          pill.style.opacity = '0';
          pill.style.transform = 'translateY(-10px)';
          setTimeout(() => {
              if (pill.parentNode) {
                  pill.parentNode.removeChild(pill);
              }
          }, 200);
      }

      setupPdfHighlightSync() {
          window.addEventListener('message', (e) => {
              const data = e.data || {};
              if (data.type !== 'highlight:event') return;
              if (data.event === 'highlight:activated') {
                  // Viewer marker toggled on: show a guided pill in light state
                  const hasPill = document.querySelector('.guided-pill');
                  if (!hasPill) {
                      this.showGuidedSelectionPill({});
                  }
                  this.updateGuidedPillState(false);
                  window.guidedSelectionActive = true;
              } else if (data.event === 'highlight:deactivated') {
                  // Viewer marker toggled off: remove guided pill entirely
                  const pill = document.querySelector('.guided-pill');
                  if (pill) { try { pill.remove(); } catch {} }
                  window.guidedSelectionActive = false;
              } else if (data.event === 'highlight:created' && data.data) {
                  this.currentHighlightRef = data.data; // {id, role, page, anchor, rects, createdAt}
                  // Persist selection for this document (with hash)
                  this.saveSelection(this.currentHighlightRef);
                  window.dispatchEvent(new CustomEvent('selection:saved', { detail: { selection: this.currentHighlightRef } }));
                  // Make actions clearly scoped in UI (brief feedback)
                  const actionsBar = this.actionsBar;
                  if (actionsBar) {
                      actionsBar.classList.add('has-selection');
                      setTimeout(() => actionsBar.classList.remove('has-selection'), 1200);
                  }
                  const guided = document.querySelector('.guided-pill');
                  if (!guided) this.showGuidedSelectionPill(this.currentHighlightRef);
                  this.updateGuidedPillState(true);
              } else if (data.event === 'highlight:removed') {
                  // A selection highlight was removed (e.g., cleared). Reflect light state if pill exists.
                  if (document.querySelector('.guided-pill')) {
                      this.updateGuidedPillState(false);
                  }
              }
          });

          // Handle navigation, matches, and missing selection notices from the viewer
          window.addEventListener('message', (e) => {
              const data = e.data || {};
              if (data.type === 'selection:navigate') ; else if (data.type === 'selection:missing') {
                  // Soft warning and offer to re-anchor via nearest match
                  if (window.modalManager) {
                      window.modalManager.showToast({
                          message: 'Selection could not be located. You can re-anchor by selecting nearest text.',
                          type: 'warning',
                          duration: 3000
                      });
                  }
              } else if (data.type === 'selection:reanchored' && data.data) {
                  // Persist updated selection and notify
                  const meta = data.data;
                  this.saveSelection(meta);
                  if (window.modalManager) {
                      window.modalManager.showToast({
                          message: `Selection re-anchored to page ${meta.page}.`,
                          type: 'success', duration: 2500
                      });
                  }
              } else if (data.type === 'highlightMatches' && Array.isArray(data.matches)) {
                  // Route to math-specific or general highlight references based on payload shape
                  const isMath = data.matches.some(m => m && (m.eq || m.tag === 'math'));
                  if (isMath) {
                      this.showMathReferencesInChat(data.matches);
                  } else {
                      this.showHighlightReferencesInChat(data.matches, data.prompt || '', data.filename || '');
                  }
              }
          });
      }

      showHighlightReferencesInChat(matches, prompt = '', filename = '') {
          try {
              const chatMessages = document.getElementById('chatMessages');
              if (!chatMessages) return;

              const normalized = (Array.isArray(matches) ? matches : [])
                  .filter(m => m && (m.page != null) && (m.y != null));
              if (!normalized.length) return;

              // Cache last refs for navigation purposes
              this.lastHighlightRefs = normalized.slice();

              const key = 'hi:' + normalized.map(m => `${m.page||''}:${Math.round(Number(m.y)||0)}`).join('|') + `:${(prompt||'').slice(0,40)}`;

              const safeFilename = this.escapeHtml(filename || (this.currentDocument && this.currentDocument.filename) || 'document');
              const html = `
                <div class="chat-icon"><i class="fas fa-robot"></i></div>
                <div class="chat-text">Highlights in <strong>${safeFilename}</strong></div>
                <div class="response-actions"></div>
            `;

              const existing = chatMessages.querySelector(`.chat-message.bot[data-kind="highlight-references"][data-key="${CSS.escape(key)}"]`);
              if (existing) {
                  existing.innerHTML = html;
                  existing.querySelectorAll('.highlight-ref').forEach(a => {
                      a.addEventListener('click', (ev) => {
                          ev.preventDefault();
                      const page = Number(a.dataset.page||'1');
                      const y = Number(a.dataset.y||'0');
                      this.postToPdfViewer({ type: 'showAIHighlights' });
                      this.postToPdfViewer({ type: 'enableAiOverlay' });
                      this.postToPdfViewer({ type: 'navigateToY', page, y });
                  });
                  });
                  // Insert pill-style Jump inside chat-text (like quick response)
                  try {
                      const chatText = existing.querySelector('.chat-text');
                      if (chatText) {
                          const labelWrap = document.createElement('span');
                          labelWrap.className = 'chat-text-label';
                          labelWrap.innerHTML = chatText.innerHTML;
                          chatText.innerHTML = '';
                          chatText.appendChild(labelWrap);
                          const jump = document.createElement('a');
                          jump.href = '#';
                          jump.className = 'selection-jump';
                          jump.title = 'Jump to highlights';
                          jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                          chatText.appendChild(jump);
                          chatText.classList.add('has-jump');
                          const first = normalized[0];
                          jump.addEventListener('click', (ev) => {
                              ev.preventDefault();
                              if (!first) return;
                              this.postToPdfViewer({ type: 'showAIHighlights' });
                              this.postToPdfViewer({ type: 'enableAiOverlay' });
                              this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                          });
                      }
                  } catch {}
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                  return;
              }

              // Persist via chat system so the response is saved, then enrich with pill UI
              try {
                  document.dispatchEvent(new CustomEvent('chat:add-bot-message', {
                      detail: { text: `Highlights in **${safeFilename}**`, kind: 'highlight-references', key }
                  }));
                  setTimeout(() => {
                      try {
                          const el = document.querySelector(`.chat-message.bot[data-kind="highlight-references"][data-key="${CSS.escape(key)}"]`);
                          if (!el) return;
                          el.innerHTML = html;
                          const chatText = el.querySelector('.chat-text');
                          if (chatText) {
                              const labelWrap = document.createElement('span');
                              labelWrap.className = 'chat-text-label';
                              labelWrap.innerHTML = chatText.innerHTML;
                              chatText.innerHTML = '';
                              chatText.appendChild(labelWrap);
                              const jump = document.createElement('a');
                              jump.href = '#';
                              jump.className = 'selection-jump';
                              jump.title = 'Jump to highlights';
                              jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                              chatText.appendChild(jump);
                              chatText.classList.add('has-jump');
                              const first = normalized[0];
                              jump.addEventListener('click', (ev) => {
                                  ev.preventDefault();
                                  if (!first) return;
                                  this.postToPdfViewer({ type: 'showAIHighlights' });
                                  this.postToPdfViewer({ type: 'enableAiOverlay' });
                                  this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                              });
                          }
                          chatMessages.scrollTop = chatMessages.scrollHeight;
                      } catch {}
                  }, 60);
              } catch {}
              return;
          } catch (e) { console.warn('showHighlightReferencesInChat failed', e); }
      }

      showMathReferencesInChat(matches) {
          try {
              const chatMessages = document.getElementById('chatMessages');
              if (!chatMessages) return;

              const normalized = (Array.isArray(matches) ? matches : [])
                  .filter(m => m && (m.page || m.eq));
              if (!normalized.length) return;

              // Build a signature key based on refs to prevent duplicates on refresh
              const key = 'math:' + normalized.map(m => `${m.eq || 'Eq.'}:${m.page || ''}:${m.y || 0}`).join('|');

              const items = normalized
                  .slice(0, 5)
                  .map((m, idx) => {
                      const label = `${m.eq || 'Eq.'}`.replace(/\s+/g, ' ');
                      const page = m.page ? `p. ${m.page}` : '';
                      const id = `mathref-${Date.now()}-${idx}`;
                      return `<a href="#" class="math-ref" data-page="${m.page||''}" data-y="${m.y||0}" id="${id}">${this.escapeHtml(label)}${page ? ' — ' + page : ''}</a>`;
                  })
                  .join(', ');
              if (!items) return;

              const html = `
                <div class="chat-icon"><i class="fas fa-robot"></i></div>
                <div class="chat-text">Soft K-Means formulas: ${items}</div>
                <div class="response-actions" style="display:none;"></div>
            `;

              // If an identical math references cell already exists, update it
              const existing = chatMessages.querySelector(`.chat-message.bot[data-kind="math-references"][data-key="${CSS.escape(key)}"]`);
              if (existing) {
                  existing.innerHTML = html;
                  // Rebind jump handlers on the updated links
                  existing.querySelectorAll('.math-ref').forEach(a => {
                      a.addEventListener('click', (ev) => {
                          ev.preventDefault();
                          const page = Number(a.dataset.page||'1');
                          const y = Number(a.dataset.y||'0');
                          this.postToPdfViewer({ type: 'navigateToY', page, y });
                      });
                  });
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                  return;
              }

              // Otherwise append a new keyed message
              const msgDiv = document.createElement('div');
              msgDiv.className = 'chat-message bot';
              msgDiv.classList.add('loading');
              msgDiv.classList.add('generating');
              msgDiv.dataset.kind = 'math-references';
              msgDiv.dataset.key = key;
              msgDiv.innerHTML = html;
              chatMessages.appendChild(msgDiv);
              chatMessages.scrollTop = chatMessages.scrollHeight;

              // Bind jump handlers
              msgDiv.querySelectorAll('.math-ref').forEach(a => {
                  a.addEventListener('click', (ev) => {
                      ev.preventDefault();
                      const page = Number(a.dataset.page||'1');
                      const y = Number(a.dataset.y||'0');
                      this.navigateToY(page, y);
                  });
              });
          } catch (e) { console.warn('showMathReferencesInChat failed', e); }
      }

      getDocId() {
          const chatId = window.currentChatId || 'default';
          const filename = (this.currentDocument && this.currentDocument.filename) || 'unknown';
          const hash = this.getCachedDocHash(chatId, filename);
          return hash ? `${chatId}:${filename}:${(hash||'').substring(0,12)}` : `${chatId}:${filename}`;
      }

      getCachedDocHash(chatId, filename) {
          try {
              const key = `docHash:${chatId}:${filename}`;
              return localStorage.getItem(key) || null;
          } catch { return null; }
      }

      async computeAndCacheDocHash() {
          const chatId = window.currentChatId || 'default';
          const filename = (this.currentDocument && this.currentDocument.filename) || null;
          if (!filename) return null;
          const existing = this.getCachedDocHash(chatId, filename);
          if (existing) return existing;
          const endpoint = this.getCurrentPdfEndpoint();
          if (!endpoint) return null;
          try {
              const res = await fetch(endpoint);
              if (!res.ok) return null;
              const buf = await res.arrayBuffer();
              const hashBuf = await crypto.subtle.digest('SHA-256', buf);
              const hashArr = Array.from(new Uint8Array(hashBuf));
              const hex = hashArr.map(b => b.toString(16).padStart(2,'0')).join('');
              const key = `docHash:${chatId}:${filename}`;
              try { localStorage.setItem(key, hex); } catch (e) {}
              return hex;
          } catch (e) { console.warn('computeAndCacheDocHash failed', e); return null; }
      }

      getCurrentPdfEndpoint() {
          if (window.FileViewerRedesigned && window.FileViewerRedesigned.instance && window.FileViewerRedesigned.instance.currentPdfUrl) {
              return window.FileViewerRedesigned.instance.currentPdfUrl;
          }
          const chatId = window.currentChatId || 'default';
          const fname = this.currentDocument && this.currentDocument.filename;
          if (!fname) return null;
          return `/api/rag/document-file/${chatId}/${encodeURIComponent(fname)}`;
      }

      saveSelection(meta) {
          try {
              const docId = this.getDocId();
              const record = { id: meta.id, docId, page: meta.page, anchor: meta.anchor, rects: meta.rects || [], type: meta.role || 'user', createdAt: meta.createdAt || Date.now() };
              const key = `docSelections:${docId}`;
              const arr = JSON.parse(localStorage.getItem(key) || '[]');
              // avoid duplicates by id
              const existingIdx = arr.findIndex(x => x.id === record.id);
              if (existingIdx >= 0) arr[existingIdx] = record; else arr.push(record);
              localStorage.setItem(key, JSON.stringify(arr));
          } catch (e) { console.warn('saveSelection failed', e); }
      }

      postToPdfViewer(payload) {
          try {
              const iframe = document.querySelector('.pdf-iframe');
              if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage(payload, '*');
              }
          } catch (e) {}
      }

      // Ensure viewer exists, then navigate to approximate Y on page
      navigateToY(page, y) {
          try {
              let iframe = document.querySelector('.pdf-iframe');
              if (!iframe) {
                  try { this.applyHighlightsToPDF([], null, {}); } catch (e) {}
                  iframe = document.querySelector('.pdf-iframe');
              }
              if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({ type: 'navigateToY', page, y }, '*');
                  try { iframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
              } else {
                  if (window.modalManager) {
                      window.modalManager.showToast({ message: 'Open the document viewer to navigate to reference.', type: 'info', duration: 2500 });
                  }
              }
          } catch (e) { console.warn('navigateToY failed', e); }
      }

      // Function to be called when chat send button is clicked during highlighting or guided expansion
      processHighlightRequest(message) {
          if (!(window.documentHighlightingEnabled || window.guidedExpansionEnabled) || !this.currentDocument) {
              return false;
          }
          // Do not create any additional pill here; chat.js will append the
          // user's prompt as a chat message and manage generation state.
          
          // Show a transient typing indicator in chat while processing
          const progressEl = this.startHighlightProgress();

          // Perform highlighting/expansion in document and PDF viewer (async, fire-and-forget)
          const isGuided = !!window.guidedExpansionEnabled;
          setTimeout(async () => {
              try {
                  await this.performHighlighting(message, { expansion: isGuided });
                  this.finishHighlightProgress(progressEl, true, message);
              } catch (e) {
                  console.warn('Highlight processing failed', e);
                  this.finishHighlightProgress(progressEl, false, message);
              }
          }, 0);
          
          // Clear expansion pill only (do not touch guided selection pill)
          if (isGuided) {
              const expandPill = document.querySelector('.expand-pill:not(.guided-pill)');
              if (expandPill) this.disableGuidedExpansionMode(expandPill);
              window.guidedExpansionEnabled = false;
          }
          
          return true; // Indicates this was processed as a highlight request
      }

      startHighlightProgress() {
          try {
              const chatMessages = document.getElementById('chatMessages');
              if (!chatMessages) return null;
              const msgDiv = document.createElement('div');
              msgDiv.className = 'chat-message bot';
              msgDiv.classList.add('loading');
              msgDiv.classList.add('generating');
              msgDiv.innerHTML = `
                <div class="chat-icon"><i class="fas fa-robot"></i></div>
                <div class="chat-text">
                    <span class="typing-indicator typing-indicator--inline" aria-live="polite" aria-label="Highlighting document">
                        <span class="typing-bar"></span>
                        <span class="typing-label">Highlighting...</span>
                    </span>
                </div>
                <div class="response-actions" style="display:none;"></div>
            `;
              chatMessages.appendChild(msgDiv);
              chatMessages.scrollTop = chatMessages.scrollHeight;
              return msgDiv;
          } catch { return null; }
      }

      finishHighlightProgress(progressEl, ok = true, prompt = '') {
          try {
              if (!progressEl) return;
              if (ok) {
                  // Remove the spinner; a separate reference message is added by performHighlighting
                  progressEl.remove();
              } else {
                  const text = progressEl.querySelector('.chat-text');
                  if (text) text.innerHTML = '<span style="color:#c33;">Failed to apply highlights.</span>';
                  setTimeout(() => { try { progressEl.remove(); } catch {} }, 2000);
              }
          } catch {}
          // Notify chat UI that highlighting finished so it can reset generation state
          try { window.dispatchEvent(new CustomEvent('highlight:done', { detail: { ok, prompt } })); } catch {}
      }

      showHighlightedText(text) {
          // Create a pill showing what text is being highlighted
          const chatWrapper = document.querySelector('.chat-input-wrapper');
          if (!chatWrapper) return;

          const highlightPill = document.createElement('div');
          highlightPill.className = 'highlight-pill';
          highlightPill.innerHTML = `
            <div class="pill-icon"></div>
            <span class="pill-text">Highlighting: "${text}"</span>
            <button class="pill-close" title="Remove highlight">&times;</button>
        `;

          // Insert after input-buttons-left in the chat wrapper
          const inputButtonsLeft = chatWrapper.querySelector('.input-buttons-left');
          if (inputButtonsLeft) {
              inputButtonsLeft.insertAdjacentElement('afterend', highlightPill);
          } else {
              chatWrapper.prepend(highlightPill);
          }

          // Setup close functionality
          const closeBtn = highlightPill.querySelector('.pill-close');
          closeBtn.addEventListener('click', () => {
              this.removeHighlights();
              if (highlightPill.parentNode) {
                  highlightPill.parentNode.removeChild(highlightPill);
              }
          });

          // Auto-fade after 10 seconds
          setTimeout(() => {
              if (highlightPill.parentNode) {
                  highlightPill.style.opacity = '0.6';
              }
          }, 10000);
      }

      removeHighlights() {
          // Remove highlights from document
          const highlights = document.querySelectorAll('.ai-highlight');
          highlights.forEach(highlight => {
              const parent = highlight.parentNode;
              parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
              parent.normalize();
          });

          // Remove highlights from PDF if available
          this.clearPDFHighlights();
      }

      clearPDFHighlights() {
          const pdfIframe = document.querySelector('.pdf-iframe');
          if (!pdfIframe) return;

          // If our PDF.js viewer is active, tell it to clear
          if (this.isCustomPdfViewer(pdfIframe)) {
              try { pdfIframe.contentWindow.postMessage({ type: 'clearHighlights' }, '*'); } catch (e) {}
              return;
          }

          // Native viewer: nothing to do beyond fragment cleanup
          try {
              const url = new URL(pdfIframe.src, window.location.origin);
              url.hash = '';
              pdfIframe.src = url.toString();
          } catch (e) {
              const src = pdfIframe.getAttribute('src') || '';
              const cleaned = src.split('#')[0];
              if (cleaned !== src) pdfIframe.src = cleaned;
          }
      }

      async performHighlighting(keywords, options = {}) {
          if (!this.currentDocument) {
              console.error('No document selected for highlighting');
              return;
          }

          try {
              // Call backend for intelligent highlighting
              const response = await fetch('/api/highlight-document', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                      document_path: this.currentDocument.path,
                      keywords: keywords,
                      filename: this.currentDocument.filename
                  })
              });

              const result = await response.json();
              
              if (result.success && result.highlights) {
                  try { console.log('[doc-actions] retrieved highlights:', result.highlights.map(h => h.text).filter(Boolean)); } catch (e) {}
                  this.lastAiHighlights = result.highlights;
                  // Apply highlights to the document viewer (rich text fallback view)
                  this.applyHighlights(result.highlights);

                  // Apply highlights to PDF viewer (PDF.js inside iframe)
                  this.applyHighlightsToPDF(result.highlights, keywords, { expansion: !!options.expansion });
                  console.log(`Applied ${result.highlights.length} highlights for: ${keywords}`);
              } else {
                  console.error('Highlighting failed:', result.message || 'Unknown error');
                  // Fallback to simple text highlighting and prompt-driven PDF highlight
                  this.simpleTextHighlight(keywords);
                  this.applyHighlightsToPDF([], keywords, { expansion: !!options.expansion });
              }
          } catch (error) {
              console.error('Error performing highlighting:', error);
              // Fallback to simple text highlighting
              this.simpleTextHighlight(keywords);
              // Ensure PDF viewer still receives the prompt to self-highlight
              this.applyHighlightsToPDF([], keywords, { expansion: !!options.expansion });
          }
      }

      

      addHighlightReferenceMessage(prompt, filename) {
          try {
              const chatMessages = document.getElementById('chatMessages');
              if (!chatMessages) return;
              const safePrompt = (prompt || '').toString().slice(0, 120);
              const safeFilename = (filename || 'document');

              // Build a stable key to avoid duplicate reference cells on subsequent updates
              const key = `ref:${(safeFilename || '').toLowerCase()}::${safePrompt.toLowerCase()}`;

              const html = `
                <div class=\"chat-icon\"><i class=\"fas fa-robot\"></i></div>
                <div class=\"chat-text\">Applied highlights for \"${this.escapeHtml(safePrompt)}\" in <b>${this.escapeHtml(safeFilename)}</b>.</div>
                <div class=\"response-actions\"></div>
            `;

              // If an identical reference already exists, update its text instead of duplicating
              const existing = chatMessages.querySelector(`.chat-message.bot[data-kind="highlight-reference"][data-key="${CSS.escape(key)}"]`);
              if (existing) {
                  existing.innerHTML = html;
                  // Attach selection-style Jump pill inside chat text (like quick response)
                  try {
                      const chatText = existing.querySelector('.chat-text');
                      if (chatText) {
                          const labelWrap = document.createElement('span');
                          labelWrap.className = 'chat-text-label';
                          labelWrap.innerHTML = chatText.innerHTML;
                          chatText.innerHTML = '';
                          chatText.appendChild(labelWrap);
                          const jump = document.createElement('a');
                          jump.href = '#';
                          jump.className = 'selection-jump';
                          jump.title = 'Jump to highlights';
                          jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                          chatText.appendChild(jump);
                          chatText.classList.add('has-jump');
                          const list = Array.isArray(this.lastHighlightRefs) ? this.lastHighlightRefs : [];
                          const first = list[0] || null;
                          jump.addEventListener('click', (ev) => {
                              ev.preventDefault();
                              if (!first) return;
                              this.postToPdfViewer({ type: 'enableAiOverlay' });
                              this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                          });
                      }
                  } catch {}
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                  return;
              }

              // Otherwise append and persist via chat.js so it's saved in history
              try {
                  document.dispatchEvent(new CustomEvent('chat:add-bot-message', {
                      detail: { 
                          text: `Applied highlights for \"${safePrompt}\" in **${safeFilename}**. See the PDF viewer for details.`,
                          kind: 'highlight-reference',
                          key
                      }
                  }));
                  // After chat system appends the message, enrich it with a Jump button
                  setTimeout(() => {
                      try {
                          const sel = `.chat-message.bot[data-kind="highlight-reference"][data-key="${CSS.escape(key)}"]`;
                          const el = document.querySelector(sel);
                          if (!el) return;
                          el.innerHTML = `
                            <div class="chat-icon"><i class="fas fa-robot"></i></div>
                            <div class="chat-text">Applied highlights for \"${this.escapeHtml(safePrompt)}\" in <b>${this.escapeHtml(safeFilename)}</b>.</div>
                            <div class="response-actions"></div>
                        `;
                          const chatText = el.querySelector('.chat-text');
                          const labelWrap = document.createElement('span');
                          labelWrap.className = 'chat-text-label';
                          labelWrap.innerHTML = chatText.innerHTML;
                          chatText.innerHTML = '';
                          chatText.appendChild(labelWrap);
                          const jump = document.createElement('a');
                          jump.href = '#';
                          jump.className = 'selection-jump';
                          jump.title = 'Jump to highlights';
                          jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                          chatText.appendChild(jump);
                          chatText.classList.add('has-jump');
                          const list = Array.isArray(this.lastHighlightRefs) ? this.lastHighlightRefs : [];
                          const first = list[0] || null;
                          jump.addEventListener('click', (ev) => {
                              ev.preventDefault();
                              if (!first) return;
                              this.postToPdfViewer({ type: 'enableAiOverlay' });
                              this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                          });
                      } catch {}
                  }, 60);
              } catch (e) {
                  // Fallback to direct DOM append if event fails
                  const msgDiv = document.createElement('div');
                  msgDiv.className = 'chat-message bot';
              msgDiv.classList.add('loading');
              msgDiv.classList.add('generating');
                  msgDiv.dataset.kind = 'highlight-reference';
                  msgDiv.dataset.key = key;
                  msgDiv.innerHTML = html;
                  chatMessages.appendChild(msgDiv);
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                  // Attach Jump button
                  try {
                      const actions = msgDiv.querySelector('.response-actions');
                      if (actions) {
                          const list = Array.isArray(this.lastHighlightRefs) ? this.lastHighlightRefs : [];
                          const first = list[0] || null;
                          actions.innerHTML = `<button class=\"btn-secondary\" data-action=\"jump-highlight\">Jump</button>`;
                          const btn = actions.querySelector('[data-action="jump-highlight"]');
                          if (btn) {
                              btn.disabled = !first;
                              btn.title = first ? 'Jump to first highlight' : 'No highlight references available yet';
                              btn.addEventListener('click', (ev) => {
                                  ev.preventDefault();
                                  if (!first) return;
                                  this.postToPdfViewer({ type: 'enableAiOverlay' });
                                  this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                              });
                          }
                      }
                  } catch {}
              }
          } catch (e) {
              console.warn('Could not append highlight reference message:', e);
          }
      }

      // Ensure the PDF viewer loads the correct document and navigates to a saved selection
      async navigateToSelection(meta) {
          try {
              if (!meta) return;
              // Try to detect target filename from meta.docId (format: chatId:filename[:hash])
              let targetFilename = null;
              if (meta.docId && typeof meta.docId === 'string') {
                  const parts = meta.docId.split(':');
                  if (parts.length >= 2) targetFilename = parts[1];
              }

              // If we can, ensure the viewer has the right file loaded
              if (targetFilename && window.FileViewerRedesigned && window.FileViewerRedesigned.instance) {
                  try {
                      const inst = window.FileViewerRedesigned.instance;
                      const current = (inst.currentFile && inst.currentFile.filename) || null;
                      if (!current || current !== targetFilename) {
                          await inst.loadDocument(targetFilename);
                      }
                  } catch (e) { /* ignore load errors; fallback to posting */ }
              }

              // Find or initialize the PDF iframe
              let iframe = document.querySelector('.pdf-iframe');
              if (!iframe) {
                  // Attempt to trigger viewer load using existing APIs
                  try { this.applyHighlightsToPDF([], null, {}); } catch (e) {}
                  iframe = document.querySelector('.pdf-iframe');
              }

              const payload = { type: 'highlightSelectionOnly', meta };
              if (iframe && iframe.contentWindow) {
                  try { iframe.contentWindow.postMessage(payload, '*'); } catch (e) {}
                  try { iframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
              } else {
                  if (window.modalManager) {
                      window.modalManager.showToast({ message: 'Open the document viewer to jump to the selection.', type: 'info', duration: 2500 });
                  }
              }
          } catch (e) {
              console.warn('navigateToSelection failed', e);
          }
      }

      escapeHtml(str) {
          return String(str)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\"/g, '&quot;')
              .replace(/'/g, '&#39;');
      }

      simpleTextHighlight(keywords) {
          // Simple client-side highlighting as fallback
          const docViewer = document.querySelector('.document-viewer-content');
          if (!docViewer) return;

          const keywordList = keywords.split(',').map(k => k.trim().toLowerCase());
          
          keywordList.forEach(keyword => {
              if (keyword.length < 2) return;
              
              const walker = document.createTreeWalker(
                  docViewer,
                  NodeFilter.SHOW_TEXT,
                  null,
                  false
              );

              const textNodes = [];
              let node;
              while (node = walker.nextNode()) {
                  textNodes.push(node);
              }

              textNodes.forEach(textNode => {
                  const text = textNode.textContent;
                  const regex = new RegExp(`(${keyword})`, 'gi');
                  if (regex.test(text)) {
                      const highlighted = text.replace(regex, '<mark class="ai-highlight">$1</mark>');
                      const span = document.createElement('span');
                      span.innerHTML = highlighted;
                      textNode.parentNode.replaceChild(span, textNode);
                  }
              });
          });
      }

      applyHighlights(highlights) {
          // Apply highlights from backend response to document
          highlights.forEach(highlight => {
              if (highlight.text && highlight.relevance > 6) { // Only highlight high-relevance items
                  this.highlightText(highlight.text);
              }
          });
      }

      highlightText(text) {
          // Find and highlight specific text in the document
          const docViewer = document.querySelector('.document-viewer-content');
          if (!docViewer) return;

          const walker = document.createTreeWalker(
              docViewer,
              NodeFilter.SHOW_TEXT,
              null,
              false
          );

          const textNodes = [];
          let node;
          while (node = walker.nextNode()) {
              textNodes.push(node);
          }

          textNodes.forEach(textNode => {
              const content = textNode.textContent;
              if (content.toLowerCase().includes(text.toLowerCase())) {
                  const regex = new RegExp(`(${text})`, 'gi');
                  const highlighted = content.replace(regex, '<mark class="ai-highlight">$1</mark>');
                  const span = document.createElement('span');
                  span.innerHTML = highlighted;
                  textNode.parentNode.replaceChild(span, textNode);
              }
          });
      }

      applyHighlightsToPDF(highlights, prompt = null, opts = {}) {
          const pdfIframe = document.querySelector('.pdf-iframe');
          if (!pdfIframe) return;

          const hasSelection = !!(this.currentHighlightRef && this.currentHighlightRef.page);
          !!opts.expansion;
          const selectionMeta = hasSelection ? { ...this.currentHighlightRef, docId: this.getDocId() } : null;
          // Always draw the explicit selection anchor first if present; then overlay AI marks
          if (hasSelection && this.isCustomPdfViewer(pdfIframe)) {
              try { pdfIframe.contentWindow.postMessage({ type: 'highlightSelectionOnly', meta: selectionMeta }, '*'); } catch (e) {}
          }

          const payload = {
              type: 'editorHighlight',
              prompt: prompt || '',
              highlights: Array.isArray(highlights) ? highlights.map(h => ({ text: h.text || '', relevance: h.relevance || 0 })) : [],
              preserveAnchor: hasSelection
          };

          // If our PDF.js viewer is already active, ensure anchor, enable overlay and post the message
          if (this.isCustomPdfViewer(pdfIframe)) {
              if (hasSelection) {
                  try { pdfIframe.contentWindow.postMessage({ type: 'highlightSelectionOnly', meta: selectionMeta }, '*'); } catch (e) {}
              }
              try { pdfIframe.contentWindow.postMessage({ type: 'enableAiOverlay' }, '*'); } catch (e) {}
              try { pdfIframe.contentWindow.postMessage(payload, '*'); } catch (e) {}
              try { pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
              return;
          }

          // Switch to the custom viewer temporarily for accurate highlights
          const endpoint = (window.FileViewerRedesigned && window.FileViewerRedesigned.instance && window.FileViewerRedesigned.instance.currentPdfUrl)
              ? window.FileViewerRedesigned.instance.currentPdfUrl
              : (window.currentChatId && this.currentDocument?.filename
                  ? `/api/rag/document-file/${window.currentChatId}/${encodeURIComponent(this.currentDocument.filename)}`
                  : null);
          if (!endpoint) {
              console.warn('Cannot determine PDF endpoint for highlighting');
              return;
          }
          const viewerUrl = `/static/pdfjs/web/viewer.html?file=${encodeURIComponent(endpoint)}`;
          
          // Swap iframe to our viewer and post selection + AI highlight once loaded
          const onload = () => {
              if (hasSelection) {
                  try { pdfIframe.contentWindow.postMessage({ type: 'highlightSelectionOnly', meta: selectionMeta }, '*'); } catch (e) {}
              }
              try { pdfIframe.contentWindow.postMessage({ type: 'enableAiOverlay' }, '*'); } catch (e) {}
              try { pdfIframe.contentWindow.postMessage(payload, '*'); } catch (e) {}
              try { pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
              pdfIframe.removeEventListener('load', onload);
          };
          pdfIframe.addEventListener('load', onload);
          pdfIframe.src = viewerUrl;

          // Hook for other listeners if needed
          document.dispatchEvent(new CustomEvent('applyHighlights', { detail: { highlights, prompt } }));
          console.log('Switched to custom PDF viewer for accurate highlights');
      }

      isCustomPdfViewer(iframe) {
          try {
              const src = iframe && typeof iframe.src === 'string' ? iframe.src : '';
              return src.includes('/static/pdf-viewer/index.html') || src.includes('/static/pdfjs/web/viewer.html');
          }
          catch { return false; }
      }

      extractSearchTerms(prompt) {
          const terms = [];
          if (!prompt) return terms;
          const p = String(prompt);
          // Prefer quoted phrases first
          const quoted = p.match(/"([^"]+)"|'([^']+)'/g) || [];
          for (const q of quoted) {
              const cleaned = q.replace(/^['"]|['"]$/g, '').trim();
              if (cleaned) terms.push(cleaned);
          }
          if (terms.length) return terms;
          // Split by commas
          p.split(',').forEach(seg => {
              const t = seg.trim();
              if (t) terms.push(t);
          });
          if (terms.length) return terms;
          // Fallback: pick meaningful words (>3 chars)
          const words = p.split(/\s+/).filter(w => w.length > 3);
          if (words.length) terms.push(words[0]);
          return terms;
      }

      setButtonLoading(button, isLoading) {
          if (isLoading) {
              button.classList.add('loading');
              button.innerHTML = `
                <span class="loading-spinner"></span>
                <span class="label">Processing...</span>
            `;
          } else {
              button.classList.remove('loading');
          }
      }

      showBriefFeedback(button, symbol) {
          const originalHTML = button.innerHTML;
          const originalClasses = button.className;
          
          // Simple, quick feedback animation
          button.innerHTML = `<span class="icon">${symbol}</span>`;
          
          // Apply feedback styling via CSS classes
          if (symbol === '✓') {
              button.classList.add('feedback-success');
          } else {
              button.classList.add('feedback-error');
          }
          
          // Restore original state quickly
          setTimeout(() => {
              button.className = originalClasses;
              button.innerHTML = originalHTML;
          }, 400); // Reduced from 600ms to 400ms for quicker feedback
      }

      async insertPromptToChat(prompt, isInteractive = false, meta = {}) {
          const chatInput = document.querySelector('#chatInput');
          if (!chatInput) {
              throw new Error('Chat input not found');
          }

          // Build display label and selection ref for minimal UI
          const displayLabel = meta.displayLabel || '';
          const selectionRef = meta.selectionRef || null;

          // Stash expanded prompt and optional selection reference on the input
          chatInput.dataset.expandedPrompt = prompt;
          if (displayLabel) chatInput.dataset.displayLabel = displayLabel;
          if (selectionRef) chatInput.dataset.selectionRef = JSON.stringify(selectionRef);

          // Set minimal visible value
          chatInput.value = displayLabel || prompt;
          chatInput.focus();
          
          // Trigger input event to ensure any listeners are notified
          chatInput.dispatchEvent(new Event('input', { bubbles: true }));
          
          if (isInteractive) {
              // For interactive actions, position cursor at the end for user input
              chatInput.setSelectionRange(prompt.length, prompt.length);
          } else {
              // For non-interactive actions, programmatically send after a brief delay
              setTimeout(() => {
                  try {
                      // Prefer event-based send to avoid click race conditions
                      document.dispatchEvent(new CustomEvent('chat:send'));
                  } catch (e) {
                      // Fallback to button click if needed
                      const sendButton = document.querySelector('#chatSendBtn');
                      if (sendButton) sendButton.click();
                  }
              }, 120);
          }
      }

      show() {
          if (!this.actionsBar || this.isVisible) return;
          
          this.actionsBar.classList.add('visible');
          this.isVisible = true;
          
          // Adjust chat input area to make room
          const chatInputArea = document.querySelector('.chat-input-area');
          if (chatInputArea) {
              chatInputArea.classList.add('actions-visible');
          }
          
          // Hide legacy document actions
          const legacyActions = document.querySelector('.document-actions');
          if (legacyActions) {
              legacyActions.classList.add('legacy');
          }
      }

      hide() {
          if (!this.actionsBar || !this.isVisible) return;
          
          this.actionsBar.classList.remove('visible');
          this.isVisible = false;
          
          // Reset chat input area
          const chatInputArea = document.querySelector('.chat-input-area');
          if (chatInputArea) {
              chatInputArea.classList.remove('actions-visible');
          }
          
          // Show legacy document actions
          const legacyActions = document.querySelector('.document-actions');
          if (legacyActions) {
              legacyActions.classList.remove('legacy');
          }
      }

      // Public API methods
      triggerAction(actionId) {
          if (!this.isVisible) return false;
          
          const button = this.actionsBar.querySelector(`[data-action="${actionId}"]`);
          if (button) {
              button.click();
              return true;
          }
          return false;
      }

      getAvailableActions() {
          return this.actions.map(action => ({
              id: action.id,
              label: action.label,
              tooltip: action.tooltip
          }));
      }

      isActionBarVisible() {
          return this.isVisible;
      }

      getCurrentDocument() {
          return this.currentDocument;
      }

      setupResponsiveBehavior() {
          // Check if we have enough space for labels
          const checkWidth = () => {
              if (!this.actionsBar) return;
              
              const chatInputArea = document.querySelector('.chat-input-area');
              if (!chatInputArea) return;
              
              const chatWidth = chatInputArea.offsetWidth;
              const minWidthForLabels = 600; // Minimum width to show labels
              
              if (chatWidth >= minWidthForLabels) {
                  this.actionsBar.classList.add('show-labels');
              } else {
                  this.actionsBar.classList.remove('show-labels');
              }
          };
          
          // Check on resize
          window.addEventListener('resize', checkWidth);
          
          // Initial check
          setTimeout(checkWidth, 100);
      }
  }

  let instance$3 = null;
  let initPromise$3 = null;
  let legacyHooksSetup = false;

  function waitForChatElements() {
      return new Promise((resolve) => {
          const check = () => {
              const chatInputArea = document.querySelector('.chat-input-area');
              const chatInput = document.querySelector('#chatInput');
              if (chatInputArea && chatInput) {
                  resolve();
              } else {
                  setTimeout(check, 100);
              }
          };
          check();
      });
  }

  function createManager() {
      if (instance$3) return instance$3;
      instance$3 = new DocumentActionsManager();
      try {
          window.documentActionsManager = instance$3;
      } catch (_) {}
      document.dispatchEvent(new CustomEvent('documentActionsReady', {
          detail: { manager: instance$3 }
      }));
      return instance$3;
  }

  function setupLegacyHooks() {
      if (legacyHooksSetup) return;
      legacyHooksSetup = true;

      document.addEventListener('documentActionsReady', (e) => {
          const manager = e && e.detail ? e.detail.manager : null;
          if (!manager) return;
          const fv = window.FileViewerManager;
          if (!fv || typeof fv.selectDocument !== 'function') return;
          if (fv.selectDocument.__docActionsWrapped) return;
          const originalSelectDocument = fv.selectDocument;
          const wrapped = function(document) {
              const result = originalSelectDocument.apply(this, arguments);
              if (document) {
                  try { manager.setCurrentDocument(document); } catch (_) {}
              }
              return result;
          };
          wrapped.__docActionsWrapped = true;
          fv.selectDocument = wrapped;
      });

      document.addEventListener('chatSendClick', (e) => {
          try {
              if (!window.documentHighlightingEnabled) return;
              const manager = window.documentActionsManager;
              if (!manager || typeof manager.processHighlightRequest !== 'function') return;
              const detail = e && e.detail;
              const message = detail && detail.message;
              if (!message || !message.trim()) return;
              const processed = manager.processHighlightRequest(message.trim());
              if (processed) {
                  e.preventDefault();
                  e.stopPropagation();
              }
          } catch (_) {}
      });
  }

  function init$5() {
      setupLegacyHooks();
      if (instance$3) return Promise.resolve(instance$3);
      if (initPromise$3) return initPromise$3;

      initPromise$3 = new Promise((resolve) => {
          const start = () => {
              waitForChatElements().then(() => resolve(createManager()));
          };
          if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', start, { once: true });
          } else {
              start();
          }
      });

      return initPromise$3;
  }

  function getInstance$1() {
      return instance$3;
  }

  try {
      window.DocumentActionsManager = DocumentActionsManager;
  } catch (_) {}

  // Initialize when DOM is ready

  function init$4() {
    return init$5();
  }

  function getManager$2() {
    return getInstance$1();
  }

  if (typeof window !== 'undefined') {
    window.ChatDocumentActions = window.ChatDocumentActions || {};
    window.ChatDocumentActions.init = init$4;
    window.ChatDocumentActions.getManager = getManager$2;
  }

  var docActions = /*#__PURE__*/Object.freeze({
    __proto__: null,
    DocumentActionsManager: DocumentActionsManager,
    getManager: getManager$2,
    init: init$4
  });

  class VoiceChatManager {
      constructor() {
          this.isListening = false;
          this.isSpeaking = false;
          this.modalOverlay = null;
          this.modal = null;
          this.mediaRecorder = null;
          this.audioChunks = [];
          this.conversationHistory = [];
          this.selectedVoice = null;
          this.audioContext = null;
          // User/mic analysis
          this.analyser = null;
          this.dataArray = null;
          this.audioVolume = 0;

          // Bot/TTS analysis
          this.botAudioContext = null;
          this.botAnalyser = null;
          this.botDataArray = null;

          // Canvas-based visualization
          this.vizCanvas = null;
          this.vizCtx = null;
          this.vizAnimationFrame = null;
          this.currentState = 'idle'; // idle | listening | thinking | speaking
          this.transcriptionLanguage = 'auto';
          this._initialized = false;
      }

      setup() {
          if (this._initialized) return;
          this._initialized = true;
          this.initializeButton();
          try {
              const saved = localStorage.getItem('voiceChatTranscriptionLang');
              if (saved) this.transcriptionLanguage = saved;
          } catch {}

          // Listen for TTS start/end to visualize bot audio
          window.addEventListener('tts-audio-start', (e) => {
              const audio = e?.detail?.audio;
              if (audio) this.attachBotVisualization(audio);
              // Even without an audio element (browser TTS), show speaking state
              this.currentState = 'speaking';
          });
          window.addEventListener('tts-audio-end', () => {
              this.detachBotVisualization();
              // Resume listening visualization if still in conversation
              if (this.isListening) this.currentState = 'listening';
          });
      }
      
      initializeButton() {
          const voiceChatBtn = document.getElementById('voiceChatBtn');
          if (!voiceChatBtn) return;
          
          voiceChatBtn.addEventListener('click', () => {
              this.openVoiceChatModal();
          });
          
          // Add compact voice conversation button to the left side
          this.addVoiceConversationButton();
      }
      
      addVoiceConversationButton() {
          // Prefer the plus-menu content; fallback to left container
          const plusMenuContent = document.querySelector('.chat-plus-menu .chat-plus-menu-content');
          const leftButtonsContainer = plusMenuContent || document.querySelector('.input-buttons-left');
          
          if (!leftButtonsContainer || document.getElementById('voiceConversationBtn')) {
              return; // Already added or container not found
          }

          // Create voice conversation button
          const voiceConvBtn = document.createElement('button');
          voiceConvBtn.id = 'voiceConversationBtn';
          voiceConvBtn.className = 'input-btn chat-plus-menu-btn';
          voiceConvBtn.innerHTML = '<i class="fas fa-comment-dots"></i><span class="btn-text">Voice Chat</span>';
          voiceConvBtn.title = 'Start voice conversation';
          voiceConvBtn.onclick = () => this.openVoiceChatModal();
          
          // Add into submenu (or left side if submenu missing)
          leftButtonsContainer.appendChild(voiceConvBtn);
      }
      
      async openVoiceChatModal() {
          // Create modal overlay
          this.modalOverlay = document.createElement('div');
          this.modalOverlay.id = 'voiceChatModalOverlay';
          this.modalOverlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
          
          // Create modal content with updated, minimalist UI
          this.modalOverlay.innerHTML = `
            <div id="voiceChatModal" class="voice-chat-modal">
                <div class="aurora-element"></div>
                <div class="voice-chat-modal-header">
                    <button class="voice-chat-modal-close" title="Close">&times;</button>
                </div>
                <div class="voice-chat-modal-body">
                    <div class="voice-chat-waveform" style="height: 50vh; position: relative;">
                        <canvas id="voiceVizCanvas" width="640" height="320" style="width: 100%; height: 100%;"></canvas>
                        <div class="audio-level-indicator">No audio input</div>
                    </div>
                    <div class="voice-chat-messages carousel" id="voiceChatMessages">
                        <div class="voice-chat-message system">Welcome to voice chat. I'll transcribe what you say and respond with voice.</div>
                    </div>
                    <div class="voice-chat-controls unified">
                        <div class="voice-chat-control-bar">
                            <button id="muteMicBtn" class="vc-control vc-mic" title="Mute microphone"><i class="fas fa-microphone"></i></button>
                            <button id="startVoiceChatBtn" class="vc-control vc-start" title="Start"><i class="fas fa-play"></i></button>
                            <button id="stopVoiceChatBtn" class="vc-control vc-stop" title="Stop" disabled><i class="fas fa-stop"></i></button>
                        </div>
                        <div class="voice-chat-carousel-controls">
                            <button id="vcPrevMsg" class="vc-nav" title="Previous"><i class="fas fa-chevron-up"></i></button>
                            <button id="vcNextMsg" class="vc-nav" title="Next"><i class="fas fa-chevron-down"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        `;
          
          document.body.appendChild(this.modalOverlay);
          this.modal = document.getElementById('voiceChatModal');
          
          // Set up event listeners
          const closeBtn = this.modal.querySelector('.voice-chat-modal-close');
          closeBtn.addEventListener('click', () => this.closeVoiceChatModal());
          
          // No voice/language selectors in the new UI; keep default settings

          // Start/Stop/Mute buttons
          const startBtn = document.getElementById('startVoiceChatBtn');
          const stopBtn = document.getElementById('stopVoiceChatBtn');
          const muteBtn = document.getElementById('muteMicBtn');
          this.isMicMuted = false;
          
          startBtn.addEventListener('click', () => {
              this.startVoiceConversation();
              startBtn.disabled = true;
              stopBtn.disabled = false;
              muteBtn.disabled = false;
          });
          
          stopBtn.addEventListener('click', () => {
              this.stopVoiceConversation();
              stopBtn.disabled = true;
              startBtn.disabled = false;
              muteBtn.disabled = true;
              this.isMicMuted = false;
              muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
          });
          
          muteBtn.addEventListener('click', () => {
              this.toggleMicMute(muteBtn);
          });

          // Vertical carousel controls
          const prevBtn = document.getElementById('vcPrevMsg');
          const nextBtn = document.getElementById('vcNextMsg');
          const msgEl = document.getElementById('voiceChatMessages');
          prevBtn.addEventListener('click', ()=> this.scrollMessages(msgEl, -1));
          nextBtn.addEventListener('click', ()=> this.scrollMessages(msgEl, 1));
          
          // Close when clicking outside
          this.modalOverlay.addEventListener('click', (e) => {
              if (e.target === this.modalOverlay) {
                  this.closeVoiceChatModal();
              }
          });
      }
      
      closeVoiceChatModal() {
          // Make sure to stop any ongoing conversation
          this.stopVoiceConversation();
          
          // Remove the modal
          if (this.modalOverlay) {
              document.body.removeChild(this.modalOverlay);
              this.modalOverlay = null;
              this.modal = null;
          }
      }
      
      async startVoiceConversation() {
          try {
              // Update status
              this.updateStatus("Listening...");
              this.addSystemMessage("Listening for your voice input...");
              
              // Request microphone access
              const stream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                      echoCancellation: true,
                      noiseSuppression: true,
                      autoGainControl: true,
                      channelCount: 1
                  },
                  video: false
              });
              
              this.audioChunks = [];
              this.isListening = true;
              this.micStream = stream;
              
              // Create media recorder
              this.mediaRecorder = new MediaRecorder(stream);
              
              this.mediaRecorder.ondataavailable = (event) => {
                  if (event.data.size > 0) {
                      this.audioChunks.push(event.data);
                  }
              };
              
              // Set up voice visualization with the improved animation
              this.setupVoiceVisualization(stream);
              
              // Handle when recording stops
              this.mediaRecorder.onstop = () => {
                  // Stop the visualization
                  this.stopVoiceVisualization();
                  
                  // Process the audio if we have data and were in listening mode
                  if (this.isListening && this.audioChunks.length > 0) {
                      this.processAudioAndRespond();
                  }
              };
              
              // Show the listening animation
              this.currentState = 'listening';
              // Prepare canvas and start render loop if needed
              this.setupCanvas();
              
              // Start recording
              this.mediaRecorder.start(200);
              
              // Add welcome message from bot if this is first interaction
              if (this.conversationHistory.length === 0) {
                  if (window.textToSpeech && !this.isSpeaking) {
                      setTimeout(() => {
                          if (this.modal) { 
                              this.isSpeaking = true;
                              this.updateStatus("Assistant is speaking...");
                              
                              window.textToSpeech.speak(
                                  "Hello! I'm listening to you. What can I help you with today?",
                                  () => {}, // onStart
                                  () => {   // onEnd
                                      this.isSpeaking = false;
                                      if (this.isListening) {
                                          this.updateStatus("Listening...");
                                      }
                                  },
                                  (error) => {
                                      console.error("TTS Error:", error);
                                      this.isSpeaking = false;
                                      this.updateStatus("Listening...");
                                  }
                              );
                          }
                      }, 500);
                  }
              }
              
              // Set up silence detection to stop recording after a period of silence
              this.setupSilenceDetection(stream);
              
          } catch (error) {
              console.error("Error accessing microphone:", error);
              this.updateStatus("Error: Could not access microphone");
              this.addSystemMessage("Error: Could not access microphone. Please check your permissions and try again.");
              
              // Reset the buttons
              const startBtn = document.getElementById('startVoiceChatBtn');
              const stopBtn = document.getElementById('stopVoiceChatBtn');
              if (startBtn) startBtn.disabled = false;
              if (stopBtn) stopBtn.disabled = true;
          }
      }
      
      setupVoiceVisualization(stream) {
          try {
              this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
              const source = this.audioContext.createMediaStreamSource(stream);
              this.analyser = this.audioContext.createAnalyser();
              this.analyser.fftSize = 256;
              source.connect(this.analyser);
              
              const bufferLength = this.analyser.frequencyBinCount;
              this.dataArray = new Uint8Array(bufferLength);
          } catch (error) {
              console.error("Error setting up voice visualization:", error);
          }
      }

      setupCanvas() {
          if (!this.modal) return;
          this.vizCanvas = this.modal.querySelector('#voiceVizCanvas');
          if (!this.vizCanvas) return;
          // ensure canvas matches container height for crisp rendering
          const parent = this.vizCanvas.parentElement;
          if (parent) {
              const rect = parent.getBoundingClientRect();
              this.vizCanvas.width = Math.max(640, Math.floor(rect.width));
              this.vizCanvas.height = Math.max(320, Math.floor(rect.height));
          }
          this.vizCtx = this.vizCanvas.getContext('2d');
          if (!this.vizAnimationFrame) {
              const draw = () => {
                  this.renderVisualization();
                  this.vizAnimationFrame = requestAnimationFrame(draw);
              };
              this.vizAnimationFrame = requestAnimationFrame(draw);
          }
      }

      populateLanguageSelector(selectEl) {
          if (!selectEl) return;
          const languages = {
              'auto': 'Auto-detect',
              'en': 'English',
              'es': 'Spanish',
              'fr': 'French',
              'de': 'German',
              'it': 'Italian',
              'pt': 'Portuguese',
              'nl': 'Dutch',
              'pl': 'Polish',
              'ru': 'Russian',
              'ja': 'Japanese',
              'ko': 'Korean',
              'zh': 'Chinese',
              'ar': 'Arabic',
              'hi': 'Hindi'
          };
          selectEl.innerHTML = Object.entries(languages)
              .map(([code, name]) => `<option value="${code}">${name}</option>`)
              .join('');
      }

      stopVoiceVisualization() {
          if (this.vizAnimationFrame) {
              cancelAnimationFrame(this.vizAnimationFrame);
              this.vizAnimationFrame = null;
          }
          // Reset indicator text
          if (this.modal) {
              const levelIndicator = this.modal.querySelector('.audio-level-indicator');
              if (levelIndicator) levelIndicator.textContent = 'No audio input';
          }
      }

      renderVisualization() {
          if (!this.vizCtx || !this.vizCanvas) return;
          const ctx = this.vizCtx;
          const { width, height } = this.vizCanvas;
          ctx.clearRect(0, 0, width, height);

          // Keep canvas transparent to reveal modal's translucid background

          // Read mic data if available
          if (this.analyser && this.dataArray) {
              this.analyser.getByteFrequencyData(this.dataArray);
              let sum = 0;
              for (let i = 0; i < this.dataArray.length; i++) sum += this.dataArray[i];
              this.audioVolume = this.dataArray.length ? sum / this.dataArray.length : 0;
              const levelIndicator = this.modal?.querySelector('.audio-level-indicator');
              if (levelIndicator) {
                  if (this.currentState === 'listening') {
                      if (this.audioVolume < 10) levelIndicator.textContent = 'No speech detected';
                      else if (this.audioVolume < 30) levelIndicator.textContent = 'Low volume';
                      else if (this.audioVolume < 60) levelIndicator.textContent = 'Speaking...';
                      else levelIndicator.textContent = 'Good volume detected';
                  } else if (this.currentState === 'speaking') {
                      levelIndicator.textContent = 'Assistant speaking';
                  } else if (this.currentState === 'thinking') {
                      levelIndicator.textContent = 'Assistant thinking…';
                  }
              }
          }

          // Draw mic shape (blue) when listening
          if (this.currentState === 'listening' && this.dataArray) {
              this.drawRadialShape(this.dataArray, '#2d91e5', 0.85, 0.9);
          }

          // Draw bot shape (purple) when speaking with TTS
          if (this.currentState === 'speaking' && this.botAnalyser && this.botDataArray) {
              this.botAnalyser.getByteFrequencyData(this.botDataArray);
              this.drawRadialShape(this.botDataArray, '#7b5cff', 0.8, 1.0, 0.65);
          }

          // Draw calm blinking pulse while thinking
          if (this.currentState === 'thinking') {
              const t = Date.now() / 800;
              const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2; // 0..1
              ctx.save();
              ctx.translate(width / 2, height / 2);
              const r = Math.min(width, height) * (0.18 + pulse * 0.06);
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(45, 145, 229, ${0.15 + 0.15 * pulse})`;
              ctx.fill();
              ctx.beginPath();
              ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(123, 92, 255, ${0.12 + 0.12 * (1 - pulse)})`;
              ctx.fill();
              ctx.restore();
          }
      }

      drawRadialShape(freqArray, color, innerScale = 0.8, ampScale = 1.0, alpha = 0.8) {
          const ctx = this.vizCtx;
          const { width, height } = this.vizCanvas;
          const cx = width / 2;
          const cy = height / 2;
          const baseRadius = Math.min(width, height) * innerScale * 0.25;
          const bins = Math.min(64, freqArray.length);
          const step = Math.floor(freqArray.length / bins) || 1;
          const points = [];
          for (let i = 0; i < bins; i++) {
              const idx = i * step;
              const val = freqArray[idx] / 255; // 0..1
              const ang = (i / bins) * Math.PI * 2;
              const r = baseRadius + val * baseRadius * ampScale;
              points.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
          }
          // Smooth path
          ctx.save();
          ctx.beginPath();
          if (points.length) {
              ctx.moveTo(points[0][0], points[0][1]);
              for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
              ctx.closePath();
          }
          ctx.fillStyle = this.hexToRgba(color, alpha * 0.35);
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = this.hexToRgba(color, alpha);
          ctx.stroke();
          ctx.restore();
      }

      hexToRgba(hex, a = 1) {
          const m = hex.replace('#', '');
          const bigint = parseInt(m, 16);
          const r = (bigint >> 16) & 255;
          const g = (bigint >> 8) & 255;
          const b = bigint & 255;
          return `rgba(${r}, ${g}, ${b}, ${a})`;
      }

      attachBotVisualization(audioEl) {
          try {
              // Ensure canvas render loop is running
              this.setupCanvas();
              // Use a dedicated audio context for media element
              this.botAudioContext = new (window.AudioContext || window.webkitAudioContext)();
              const source = this.botAudioContext.createMediaElementSource(audioEl);
              this.botAnalyser = this.botAudioContext.createAnalyser();
              this.botAnalyser.fftSize = 256;
              // Connect element -> analyser (no need to route to destination to avoid double-audio)
              source.connect(this.botAnalyser);
              this.botDataArray = new Uint8Array(this.botAnalyser.frequencyBinCount);
              this.currentState = 'speaking';
          } catch (e) {
              console.warn('Bot visualization attach failed', e);
          }
      }

      detachBotVisualization() {
          try {
              if (this.botAudioContext) {
                  this.botAudioContext.close().catch(() => {});
              }
          } catch {}
          this.botAudioContext = null;
          this.botAnalyser = null;
          this.botDataArray = null;
      }
      
      setupSilenceDetection(stream) {
          try {
              // Use time-domain RMS with hysteresis
              const analyser = this.analyser;
              if (!analyser) return;
              const buf = new Float32Array(analyser.fftSize);
              let silenceMs = 0;
              let speechMs = 0;
              let speechStarted = false;
              const MIN_SPEECH_MS = 300;   // require at least 0.3s of speech
              const MIN_SILENCE_MS = 1200; // 1.2s of silence to end
              const FRAME_MS = 100;
              let noiseFloor = 0.01; // baseline RMS
              let calibrating = 6;   // ~600ms calibration frames
              let totalMs = 0;
              const MAX_NO_SPEECH_MS = 7000;

              const tick = () => {
                  if (!this.isListening || !this.modal || !this.mediaRecorder) return;
                  if (this.isSpeaking) { // don't detect while TTS speaking
                      setTimeout(tick, FRAME_MS);
                      return;
                  }
                  try {
                      analyser.getFloatTimeDomainData(buf);
                      // Compute RMS
                      let rms = 0;
                      for (let i = 0; i < buf.length; i++) {
                          const v = buf[i];
                          rms += v * v;
                      }
                      rms = Math.sqrt(rms / buf.length);
                      // Calibrate baseline in first ~600ms
                      if (calibrating > 0) {
                          noiseFloor = noiseFloor * 0.8 + rms * 0.2;
                          calibrating -= 1;
                      }
                      const highThresh = Math.max(noiseFloor * 2.5, 0.02);
                      const lowThresh = Math.max(noiseFloor * 1.4, 0.012);

                      if (rms > highThresh) {
                          speechMs += FRAME_MS;
                          silenceMs = 0;
                          if (!speechStarted && speechMs >= MIN_SPEECH_MS) {
                              speechStarted = true;
                          }
                      } else if (rms < lowThresh) {
                          silenceMs += FRAME_MS;
                      } else {
                          // mid band: decay slowly
                          silenceMs += FRAME_MS / 2;
                      }

                      totalMs += FRAME_MS;
                      if (!speechStarted && totalMs >= MAX_NO_SPEECH_MS) {
                          if (this.mediaRecorder.state === 'recording') {
                              this.addSystemMessage('No speech detected, ready when you are.');
                              this.mediaRecorder.stop();
                              this.updateStatus('No speech detected');
                              return;
                          }
                      }

                      if (speechStarted && silenceMs >= MIN_SILENCE_MS) {
                          if (this.mediaRecorder.state === 'recording') {
                              this.addSystemMessage('Silence detected, processing your input...');
                              this.mediaRecorder.stop();
                              this.updateStatus('Processing speech...');
                              return;
                          }
                      }
                  } catch (e) {
                      console.warn('Silence detection tick error', e);
                  }
                  if (this.isListening) setTimeout(tick, FRAME_MS);
              };
              setTimeout(tick, FRAME_MS);
          } catch (error) {
              console.error('Error setting up silence detection:', error);
          }
      }
      
      updateStatus(message) {
          // New UI: no visible status line; keep method for compatibility
          return;
      }
      
      addMessageToChat(sender, text) {
          if (!this.modal) return;
          
          const messagesElement = this.modal.querySelector('.voice-chat-messages');
          if (!messagesElement) return;
          
          const messageDiv = document.createElement('div');
          messageDiv.className = `voice-chat-message ${sender}`;
          
          messageDiv.textContent = text;
          
          messagesElement.appendChild(messageDiv);
          messagesElement.scrollTop = messagesElement.scrollHeight;
          
          // Add to conversation history for user and assistant messages
          if (sender === 'user' || sender === 'assistant') {
              this.conversationHistory.push({ role: sender, content: text });
          }
      }
      
      addSystemMessage(text) {
          this.addMessageToChat('system', text);
      }
      
      addTranscribingIndicator() {
          if (!this.modal) return;
          
          const messagesElement = this.modal.querySelector('.voice-chat-messages');
          if (!messagesElement) return;
          
          // Create and add the indicator
          const indicatorDiv = document.createElement('div');
          indicatorDiv.className = 'transcribing-indicator';
          indicatorDiv.innerHTML = `
            <span>Transcribing your speech</span>
            <div class="dot-animation">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
          
          messagesElement.appendChild(indicatorDiv);
          messagesElement.scrollTop = messagesElement.scrollHeight;
          
          return indicatorDiv;
      }
      
      addThinkingIndicator() {
          if (!this.modal) return;
          
          const messagesElement = this.modal.querySelector('.voice-chat-messages');
          if (!messagesElement) return;
          
          // Create and add the indicator
          const indicatorDiv = document.createElement('div');
          indicatorDiv.className = 'thinking-indicator';
          indicatorDiv.innerHTML = `
            <span>Assistant is thinking</span>
            <div class="dot-animation">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
          
          messagesElement.appendChild(indicatorDiv);
          messagesElement.scrollTop = messagesElement.scrollHeight;
          
          // Set calm blinking visualization state
          this.currentState = 'thinking';
          return indicatorDiv;
      }
      
      async processAudioAndRespond() {
          if (!this.isListening) return;
          
          this.updateStatus("Processing your speech...");
          
          // Show transcribing indicator
          const transcribingIndicator = this.addTranscribingIndicator();
          
          try {
              // Create audio blob
              const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
              this.audioChunks = [];
              
              // Create FormData for the API request
              const formData = new FormData();
              formData.append('audio', audioBlob);
              if (this.transcriptionLanguage && this.transcriptionLanguage !== 'auto') {
                  formData.append('language', this.transcriptionLanguage);
              }
              
              // Send to server for transcription
              const response = await fetch('/api/transcribe', {
                  method: 'POST',
                  body: formData
              });
              
              if (!response.ok) {
                  throw new Error(`Server returned ${response.status}`);
              }
              
              // Remove the transcribing indicator
              if (transcribingIndicator) transcribingIndicator.remove();
              
              const result = await response.json();
              
              if (result.text && result.text.trim()) {
                  const userText = result.text.trim();
                  
                  // Display the transcribed text to the user
                  this.addMessageToChat('user', userText);
                  
                  // Now get AI response
                  this.updateStatus("Getting assistant response...");
                  
                  // Show thinking indicator
                  const thinkingIndicator = this.addThinkingIndicator();
                  
                  await this.getAIResponse(userText, thinkingIndicator);
              } else {
                  this.updateStatus("No speech detected");
                  this.addSystemMessage("I couldn't hear anything. Please try again.");
                  
                  // Restart listening after a short delay
                  setTimeout(() => {
                      if (this.isListening && this.modal) {
                          this.startVoiceConversation();
                      }
                  }, 1500);
              }
              
          } catch (error) {
              console.error("Error processing audio:", error);
              this.updateStatus("Error processing speech");
              this.addSystemMessage("Error processing your speech. Please try again.");
              
              // Remove the indicator if it exists
              if (transcribingIndicator) transcribingIndicator.remove();
              
              // Restart listening after a short delay
              setTimeout(() => {
                  if (this.isListening && this.modal) {
                      this.startVoiceConversation();
                  }
              }, 2000);
          }
      }
      
      async getAIResponse(userText, thinkingIndicator) {
          try {
              // Enter thinking state while waiting for the model
              this.currentState = 'thinking';

              // Call the chat API
              const response = await fetch('/api/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                      prompt: userText,
                      chat_id: 'voice-chat',
                      stream: false
                  })
              });
              
              if (!response.ok) {
                  throw new Error(`Server returned ${response.status}`);
              }
              
              // Remove the thinking indicator if it exists
              if (thinkingIndicator) thinkingIndicator.remove();
              
              const result = await response.json();
              
              if (result.response) {
                  const botText = result.response;
                  
                  // Display the assistant's text response
                  this.addMessageToChat('assistant', botText);
                  
                  // Speak the response if we have TTS
                  if (window.textToSpeech) {
                      this.isSpeaking = true;
                      this.updateStatus("Assistant is speaking...");
                      
                      window.textToSpeech.speak(
                          botText,
                          () => {}, // onStart
                          () => {   // onEnd
                              this.isSpeaking = false;
                              // Restart listening if still in conversation
                              if (this.isListening && this.modal) {
                                  this.updateStatus("Listening...");
                                  this.currentState = 'listening';
                                  this.startVoiceConversation();
                              }
                          },
                          (error) => {  // onError
                              console.error("TTS Error:", error);
                              this.isSpeaking = false;
                              // Restart listening if still in conversation
                              if (this.isListening && this.modal) {
                                  this.updateStatus("Listening...");
                                  this.currentState = 'listening';
                                  this.startVoiceConversation();
                              }
                          }
                      );
                  } else {
                      // If no TTS, just start listening again after a delay
                      setTimeout(() => {
                          if (this.isListening && this.modal) {
                              this.updateStatus("Listening...");
                              this.currentState = 'listening';
                              this.startVoiceConversation();
                          }
                      }, 1000);
                  }
              } else {
                  throw new Error("No response from AI");
              }
              
          } catch (error) {
              console.error("Error getting AI response:", error);
              this.updateStatus("Error getting response");
              this.addSystemMessage("Sorry, I couldn't generate a response. Please try again.");
              
              // Remove the thinking indicator if it exists
              if (thinkingIndicator) thinkingIndicator.remove();
              
              // Restart listening after a short delay
              setTimeout(() => {
                  if (this.isListening && this.modal) {
                      this.updateStatus("Listening...");
                      this.currentState = 'listening';
                      this.startVoiceConversation();
                  }
              }, 2000);
          }
      }
      
      stopVoiceConversation() {
          // Stop recording if active
          if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
              this.mediaRecorder.stop();
          }
          
          // Stop voice visualization
          this.stopVoiceVisualization();
          
          // Stop any ongoing speech
          if (window.textToSpeech && this.isSpeaking) {
              window.textToSpeech.stop();
              this.isSpeaking = false;
          }
          
          // Close audio context if it exists
          if (this.audioContext && this.audioContext.state !== 'closed') {
              this.audioContext.close().catch(err => console.error('Error closing audio context:', err));
          }
          this.audioContext = null;
          this.analyser = null;

          // Stop mic stream tracks
          try {
              if (this.micStream) {
                  this.micStream.getTracks().forEach(t => t.stop());
              }
          } catch {}
          this.micStream = null;

          // Detach bot viz if present
          this.detachBotVisualization();
          
          // Reset state
          this.isListening = false;
          this.audioChunks = [];
          this.currentState = 'idle';
          // Minimal UI in new design: no explicit end/status text
      }
  }

  // --- Extended controls for new UI ---
  VoiceChatManager.prototype.toggleMicMute = function(btn){
      if (!this.mediaRecorder) return;
      try {
          if (!this.isMicMuted) {
              if (this.mediaRecorder.state === 'recording' && this.mediaRecorder.pause) this.mediaRecorder.pause();
              this.isMicMuted = true;
              btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
              const levelIndicator = this.modal?.querySelector('.audio-level-indicator');
              if (levelIndicator) levelIndicator.textContent = 'Microphone muted';
          } else {
              if (this.mediaRecorder.state === 'paused' && this.mediaRecorder.resume) this.mediaRecorder.resume();
              this.isMicMuted = false;
              btn.innerHTML = '<i class="fas fa-microphone"></i>';
          }
      } catch (e) {
          console.warn('Mute toggle not supported:', e);
      }
  };

  VoiceChatManager.prototype.scrollMessages = function(container, direction = 1){
      if (!container) return;
      const children = Array.from(container.querySelectorAll('.voice-chat-message, .transcribing-indicator, .thinking-indicator'));
      if (children.length === 0) return;
      const viewportTop = container.scrollTop;
      const viewportBottom = viewportTop + container.clientHeight;
      let idx = 0;
      for (let i = 0; i < children.length; i++) {
          const el = children[i];
          const top = el.offsetTop;
          const bottom = top + el.offsetHeight;
          if (top >= viewportTop - 2 && bottom <= viewportBottom + 2) { idx = i; break; }
          if (bottom > viewportTop) { idx = i; break; }
      }
      let next = Math.min(children.length - 1, Math.max(0, idx + direction));
      const target = children[next];
      container.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
  };

  let instance$2 = null;
  let initPromise$2 = null;

  function ensureInstance$2() {
      if (!instance$2) {
          instance$2 = new VoiceChatManager();
          try { window.voiceChatManager = instance$2; } catch {}
      }
      return instance$2;
  }

  function init$3() {
      if (initPromise$2) return initPromise$2;
      initPromise$2 = new Promise((resolve) => {
          const start = () => {
              const manager = ensureInstance$2();
              manager.setup();
              resolve(manager);
          };
          if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', start, { once: true });
          } else {
              start();
          }
      });
      return initPromise$2;
  }

  function getInstance() {
      return instance$2;
  }

  try { window.VoiceChatManager = VoiceChatManager; } catch {}

  var voiceChat = /*#__PURE__*/Object.freeze({
    __proto__: null,
    default: VoiceChatManager,
    getInstance: getInstance,
    init: init$3
  });

  /**
   * Web Search Manager
   * Handles both automatic and manual web search functionality
   */
  class WebSearchManager {
      constructor() {
          this.searchHistory = [];
          this.maxHistorySize = 10;
          this.forceWebSearch = false; // Manual override for next query
          this._initialized = false;
      }

      addWebSearchToggle() {
          // Prefer the plus-menu content; fallback to left container
          const plusMenuContent = document.querySelector('.chat-plus-menu .chat-plus-menu-content');
          const leftButtonsContainer = plusMenuContent || document.querySelector('.input-buttons-left');
          
          if (!leftButtonsContainer || document.getElementById('webSearchToggleBtn')) {
              return; // Already added or container not found
          }

          // Create web search toggle button
          const toggleBtn = document.createElement('button');
          toggleBtn.id = 'webSearchToggleBtn';
          toggleBtn.className = 'input-btn web-search-toggle chat-plus-menu-btn';
          toggleBtn.innerHTML = '<i class="fas fa-globe"></i><span class="btn-text">Web Search</span>';
          toggleBtn.title = 'Force web search for next query';
          toggleBtn.onclick = () => this.toggleForceWebSearch();
          
          // Add into submenu
          leftButtonsContainer.appendChild(toggleBtn);
      }

      toggleForceWebSearch() {
          this.forceWebSearch = !this.forceWebSearch;
          const toggleBtn = document.getElementById('webSearchToggleBtn');
          
          if (this.forceWebSearch) {
              toggleBtn.classList.add('active');
              toggleBtn.innerHTML = '<i class="fas fa-globe"></i><span class="btn-text">Web Search</span>';
              toggleBtn.title = 'Web search ENABLED for next query (click to disable)';
              toggleBtn.style.background = 'var(--accent-color, #007acc)';
              toggleBtn.style.color = 'white';
              
              // Auto-disable after 30 seconds if not used
              setTimeout(() => {
                  if (this.forceWebSearch) {
                      this.toggleForceWebSearch();
                  }
              }, 30000);
              
          } else {
              toggleBtn.classList.remove('active');
              toggleBtn.innerHTML = '<i class="fas fa-globe"></i><span class="btn-text">Web Search</span>';
              toggleBtn.title = 'Force web search for next query';
              toggleBtn.style.background = '';
              toggleBtn.style.color = '';
          }
          
          // Close the plus menu
          const chatPlusMenu = document.getElementById('chatPlusMenu');
          if (chatPlusMenu) {
              chatPlusMenu.classList.remove('open');
          }
      }

      addToSearchHistory(query) {
          // Remove if already exists
          this.searchHistory = this.searchHistory.filter(q => q !== query);
          
          // Add to beginning
          this.searchHistory.unshift(query);
          
          // Limit size
          if (this.searchHistory.length > this.maxHistorySize) {
              this.searchHistory = this.searchHistory.slice(0, this.maxHistorySize);
          }
          
          // Save to localStorage
          try {
              localStorage.setItem('webSearchHistory', JSON.stringify(this.searchHistory));
          } catch (e) {
              console.warn('Could not save search history to localStorage:', e);
          }
      }

      loadSearchHistory() {
          try {
              const saved = localStorage.getItem('webSearchHistory');
              if (saved) {
                  this.searchHistory = JSON.parse(saved);
              }
          } catch (e) {
              console.warn('Could not load search history from localStorage:', e);
              this.searchHistory = [];
          }
      }

      // Method to check if web search should be forced for the next query
      shouldForceWebSearch() {
          return this.forceWebSearch;
      }

      // Method to reset the force web search flag (called after use)
      resetForceWebSearch() {
          if (this.forceWebSearch) {
              this.forceWebSearch = false;
              const toggleBtn = document.getElementById('webSearchToggleBtn');
              if (toggleBtn) {
                  toggleBtn.classList.remove('active');
                  toggleBtn.innerHTML = '<i class="fas fa-globe"></i><span class="btn-text">Web Search</span>';
                  toggleBtn.title = 'Force web search for next query';
                  toggleBtn.style.background = '';
                  toggleBtn.style.color = '';
              }
          }
      }

      init() {
          if (this._initialized) return;
          this._initialized = true;
          this.addWebSearchToggle();
          // Load search history
          this.loadSearchHistory();

          // Listen for web search completion to reset force flag
          window.addEventListener('webSearchCompleted', () => {
              this.resetForceWebSearch();
          });
      }
  }

  let instance$1 = null;
  let initPromise$1 = null;

  function ensureInstance$1() {
      if (!instance$1) {
          instance$1 = new WebSearchManager();
          try { window.webSearchManager = instance$1; } catch {}
      }
      return instance$1;
  }

  function init$2() {
      if (initPromise$1) return initPromise$1;
      initPromise$1 = new Promise((resolve) => {
          const start = () => {
              const manager = ensureInstance$1();
              manager.init();
              resolve(manager);
          };
          if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', start, { once: true });
          } else {
              start();
          }
      });
      return initPromise$1;
  }

  function getManager$1() {
      return instance$1;
  }

  function completeWebSearch() {
      const event = new CustomEvent('webSearchCompleted');
      window.dispatchEvent(event);
  }

  function shouldForceWebSearch() {
      const manager = instance$1;
      return manager ? manager.shouldForceWebSearch() : false;
  }

  try {
      window.completeWebSearch = completeWebSearch;
      window.shouldForceWebSearch = () => shouldForceWebSearch();
  } catch {}

  var webSearch = /*#__PURE__*/Object.freeze({
    __proto__: null,
    completeWebSearch: completeWebSearch,
    default: WebSearchManager,
    getManager: getManager$1,
    init: init$2,
    shouldForceWebSearch: shouldForceWebSearch
  });

  /**
   * Source Display Manager
   * Handles parsing and displaying web search sources in chat messages
   */

  class SourceDisplayManager {
      constructor() {
          this.currentSources = [];
          // Basic URL regex for detecting links in free-form lines
          this.urlPattern = /(https?:\/\/[^\s)]+)\)?/i;
          this._initialized = false;
          this.initializeSidebar();
          this.initializeReferenceClickHandlers();
      }

      /**
       * Initialize click handlers for document references
       */
      initializeReferenceClickHandlers() {
          // Use event delegation to handle dynamically added references
          document.addEventListener('click', (e) => {
              const refElement = e.target.closest('.doc-reference');
              if (refElement) {
                  e.preventDefault();
                  this.handleReferenceClick(refElement);
              }
          });
      }

      /**
       * Handle click on a document reference
       * @param {Element} refElement - The reference element clicked
       */
      handleReferenceClick(refElement) {
          const page = parseInt(refElement.dataset.page) || 1;
          const text = refElement.dataset.text || '';
          const refId = refElement.dataset.refId || '0';
          
          console.log(`Reference clicked: page=${page}, text=${text.substring(0, 50)}...`);
          
          // Get the message element to retrieve all sources
          const messageElement = refElement.closest('.chat-message');
          if (!messageElement) return;
          
          let sources = [];
          try {
              if (messageElement.dataset.sources) {
                  sources = JSON.parse(messageElement.dataset.sources);
              }
          } catch (e) {
              console.warn('Failed to parse sources from message:', e);
          }
          
          const refIdNum = parseInt(refId);
          const source = sources[refIdNum];
          
          if (!source || !source.text) {
              console.warn('No source data found for reference:', refId);
              return;
          }
          
          // Highlight and navigate to the reference in the PDF viewer
          this.highlightAndNavigateToPDF(source);
      }

      /**
       * Highlight text in PDF viewer and navigate to its location
       * @param {Object} source - Source object with page, text, and other metadata
       */
      highlightAndNavigateToPDF(source) {
          const pdfIframe = document.querySelector('.pdf-iframe');
          if (!pdfIframe) {
              console.warn('PDF viewer not found');
              // Try to open file viewer if available
              if (window.FileViewerRedesigned && window.FileViewerRedesigned.instance) {
                  const viewer = window.FileViewerRedesigned.instance;
                  if (viewer.currentDocument && viewer.currentDocument.filename) {
                      viewer.openDocument(viewer.currentDocument);
                  }
              }
              return;
          }
          
          // Prepare highlight payload for PDF.js viewer
          const highlightPayload = {
              type: 'editorHighlight',
              prompt: source.text || '',
              highlights: [{
                  text: source.text || '',
                  page: source.page || 1
              }],
              preserveAnchor: false
          };
          
          // Send highlight command to PDF viewer
          try {
              pdfIframe.contentWindow.postMessage(highlightPayload, '*');
              
              // Enable AI overlay to show highlights
              setTimeout(() => {
                  pdfIframe.contentWindow.postMessage({ type: 'enableAiOverlay' }, '*');
                  pdfIframe.contentWindow.postMessage({ type: 'showAIHighlights' }, '*');
              }, 100);
              
              // Navigate to the page if page number is available
              if (source.page) {
                  setTimeout(() => {
                      pdfIframe.contentWindow.postMessage({
                          type: 'navigateToPage',
                          page: source.page
                      }, '*');
                  }, 200);
              }
              
              // Scroll PDF viewer into view
              pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } catch (e) {
              console.error('Failed to communicate with PDF viewer:', e);
          }
      }

      /**
       * Initialize the sources sidebar functionality
       */
      initializeSidebar() {
          const sidebar = document.getElementById('sourcesSidebar');
          const overlay = document.getElementById('sourcesSidebarOverlay');
          const closeBtn = sidebar?.querySelector('.sources-sidebar-close');

          // Close sidebar when clicking close button
          closeBtn?.addEventListener('click', () => {
              this.closeSidebar();
          });

          // Close sidebar when clicking overlay
          overlay?.addEventListener('click', () => {
              this.closeSidebar();
          });

          // Close sidebar with Escape key
          document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape' && sidebar?.classList.contains('open')) {
                  this.closeSidebar();
              }
          });
      }

      /**
       * Open sources sidebar with sources data
       * @param {Array} sources - Array of source objects
       */
      openSidebar(sources) {
          const sidebar = document.getElementById('sourcesSidebar');
          const overlay = document.getElementById('sourcesSidebarOverlay');
          const content = sidebar?.querySelector('.sources-sidebar-content');

          if (!sidebar || !overlay || !content) {
              console.error('Sources sidebar elements not found');
              return;
          }

          // Clear existing content
          content.innerHTML = '';

          if (sources.length === 0) {
              content.innerHTML = '<p style="color: var(--muted-text); text-align: center; margin-top: 20px;">No sources available</p>';
          } else {
              sources.forEach((source, index) => {
                  const sourceItem = this.createSourceElement(source, index);
                  content.appendChild(sourceItem);
              });
          }

          // Show sidebar and overlay
          sidebar.classList.add('open');
          overlay.classList.add('show');
          document.body.style.overflow = 'hidden'; // Prevent body scroll
      }

      /**
       * Close sources sidebar
       */
      closeSidebar() {
          const sidebar = document.getElementById('sourcesSidebar');
          const overlay = document.getElementById('sourcesSidebarOverlay');

          sidebar?.classList.remove('open');
          overlay?.classList.remove('show');
          document.body.style.overflow = ''; // Restore body scroll
      }

      /**
       * Process message sources and set up the sources button
       * @param {string} content - Full message content including sources
       * @param {Element} messageElement - The message DOM element
       */
      processMessageSources(content, messageElement) {
          try {
              // Extract sources text from the content
              const sourcesMatch = content.match(/(Sources?:.*?)$/s);
              if (!sourcesMatch) {
                  // Hide sources button if no sources
                  this.hideSourcesButton(messageElement);
                  return [];
              }

              const sourcesText = sourcesMatch[1];
              const mainContent = content.replace(sourcesMatch[0], '').trim();
              
              if (sourcesText.trim()) {
                  // Parse sources and store them
                  const sources = this.parseSources(sourcesText);
                  
                  if (sources.length > 0) {
                      // Update the message content without sources and add hyperlinks
                      const contentDiv = messageElement.querySelector('.chat-text');
                      if (contentDiv) {
                          const formattedContent = this.formatMessageContentWithLinks(mainContent, sources);
                          contentDiv.innerHTML = formattedContent;
                      }
                      
                      // Persist sources on the element for later retrieval
                      try { messageElement.dataset.sources = JSON.stringify(sources); } catch {}

                      // Show and configure sources button
                      this.setupSourcesButton(messageElement, sources);
                      return sources;
                  } else {
                      this.hideSourcesButton(messageElement);
                  }
              }
              return [];
          } catch (error) {
              console.warn('Error processing message sources:', error);
              this.hideSourcesButton(messageElement);
              return [];
          }
      }

      /**
       * Setup the sources button for a message
       * @param {Element} messageElement - The message DOM element
       * @param {Array} sources - Array of source objects
       */
      setupSourcesButton(messageElement, sources) {
          const sourcesBtn = messageElement.querySelector('.sources-btn');
          if (!sourcesBtn) return;

          // Show the button
          sourcesBtn.style.display = 'inline-flex';
          
          // Update button text to show count
          const countBadge = sources.length;
          sourcesBtn.innerHTML = `<i class="fas fa-link"></i> ${countBadge}`;
          
          // Remove any existing event listeners
          const newBtn = sourcesBtn.cloneNode(true);
          sourcesBtn.parentNode.replaceChild(newBtn, sourcesBtn);
          
          // Add click handler to open sidebar
          newBtn.addEventListener('click', () => {
              this.openSidebar(sources);
          });
      }

      /**
       * Hide the sources button for a message
       * @param {Element} messageElement - The message DOM element
       */
      hideSourcesButton(messageElement) {
          const sourcesBtn = messageElement.querySelector('.sources-btn');
          if (sourcesBtn) {
              sourcesBtn.style.display = 'none';
          }
      }

      /**
       * Remove trailing Sources/References section and return main content.
       */
      stripSourcesSection(content) {
          if (!content) return '';
          const match = content.match(/(Sources?:|References?:)[\s\S]*$/i);
          if (match) {
              return content.replace(match[0], '').trim();
          }
          return content;
      }

      /**
       * Format the main message content (without sources)
       * @param {string} content - The message content
       * @returns {string} Formatted HTML content
       */
      formatMessageContent(content) {
          // Convert markdown-style formatting
          return content
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/`(.*?)`/g, '<code>$1</code>')
              .replace(/\n/g, '<br>');
      }

      /**
       * Format the main message content with hyperlinked sources
       * @param {string} content - The message content
       * @param {Array} sources - Array of source objects
       * @returns {string} Formatted HTML content with hyperlinked sources
       */
      formatMessageContentWithLinks(content, sources) {
          let formattedContent = content;
          
          // Create a mapping of source titles to URLs
          const sourceMap = {};
          sources.forEach((source, index) => {
              sourceMap[source.title] = {
                  url: source.url,
                  index: index + 1
              };
          });
          
          // Replace explicit source mentions with hyperlinks
          // Look for patterns like "Source 1: Title"
          for (const [title, sourceInfo] of Object.entries(sourceMap)) {
              // Escape special regex characters in title
              const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              
              // Pattern for "Source X: Title" format
              const sourcePattern = new RegExp(`(Source\\s+${sourceInfo.index}:?\\s*)(${escapedTitle})`, 'gi');
              formattedContent = formattedContent.replace(sourcePattern, 
                  `$1<a href="${sourceInfo.url}" target="_blank" rel="noopener noreferrer" class="source-link">${title}</a>`
              );
          }
          
          // Apply markdown formatting
          formattedContent = formattedContent
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/`(.*?)`/g, '<code>$1</code>')
              .replace(/\n/g, '<br>');
          
          return formattedContent;
      }

      /**
       * Format the main message content with clickable reference numbers for PDF documents
       * @param {string} content - The message content
       * @param {Array} sources - Array of source objects with page/text info
       * @returns {string} Formatted HTML content with clickable reference numbers
       */
      formatMessageContentWithReferences(content, sources) {
          let formattedContent = content;
          
          // Filter PDF/document sources that have page information
          const docSources = sources.filter(s => 
              s.source_type === 'document' && 
              (s.page !== undefined && s.page !== null) &&
              s.text
          );
          
          if (docSources.length > 0) {
              // Add inline reference numbers [1], [2], etc. at the end for now
              // In a more sophisticated implementation, the LLM could insert these inline
              const refs = docSources.map((source, idx) => {
                  const refNum = idx + 1;
                  const sourceTitle = source.source || 'Document';
                  const pageText = source.page ? ` (Page ${source.page})` : '';
                  return `<sup class="doc-reference" data-ref-id="${idx}" data-page="${source.page || 1}" data-text="${this.escapeHtml(source.text || '')}" title="Jump to ${sourceTitle}${pageText}">[${refNum}]</sup>`;
              }).join(' ');
              
              // Append references at the end of the content
              formattedContent = formattedContent + ' ' + refs;
          }
          
          // Apply markdown formatting
          formattedContent = formattedContent
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/`(.*?)`/g, '<code>$1</code>')
              .replace(/\n/g, '<br>');
          
          return formattedContent;
      }

      /**
       * Escape HTML special characters
       * @param {string} text - Text to escape
       * @returns {string} Escaped text
       */
      escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
      }

      /**
       * Parse sources from text into structured data
       * @param {string} sourcesText - Raw sources text
       * @returns {Array} Array of source objects
       */
      parseSources(sourcesText) {
          const sources = [];
          const lines = sourcesText.split('\n').filter(line => line.trim());

          for (const line of lines) {
              const source = this.parseSourceLine(line.trim());
              if (source) {
                  sources.push(source);
              }
          }

          return sources;
      }

      /**
       * Apply structured sources directly to a message element without re-parsing text
       * @param {Element} messageElement
       * @param {Array} sources
       * @param {string} [fullContent]
       */
      applyStructuredSources(messageElement, sources, fullContent) {
          if (!messageElement || !Array.isArray(sources) || sources.length === 0) {
              this.hideSourcesButton(messageElement);
              return;
          }

          const contentDiv = messageElement.querySelector('.chat-text');
          if (contentDiv) {
              const baseText = typeof fullContent === 'string' && fullContent.length
                  ? this.stripSourcesSection(fullContent)
                  : (contentDiv.textContent || '');
              const formattedContent = this.formatMessageContentWithReferences(baseText, sources);
              contentDiv.innerHTML = formattedContent;
          }

          try { messageElement.dataset.sources = JSON.stringify(sources); } catch {}
          this.setupSourcesButton(messageElement, sources);
      }

      /**
       * Parse a single source line
       * @param {string} line - Source line text
       * @returns {Object|null} Source object or null if parsing fails
       */
      parseSourceLine(line) {
          // Try to match "Title - URL" or "1. Title - URL" format
          const match = line.match(/^(?:\d+\.\s*)?(.+?)\s*-\s*(https?:\/\/[^\s]+)$/);
          
          if (match) {
              const title = match[1].trim();
              const url = match[2];
              return {
                  title: this.cleanTitle(title),
                  url: url,
                  quality: this.estimateQualityFromUrl(url)
              };
          }
          
          // Try to find any URL in the line
          const urlMatch = line.match(this.urlPattern);
          if (urlMatch) {
              const url = urlMatch[0];
              const title = line.replace(this.urlPattern, '').trim() || this.getTitleFromUrl(url);
              return {
                  title: this.cleanTitle(title),
                  url: url,
                  quality: this.estimateQualityFromUrl(url)
              };
          }
          
          return null;
      }

      /**
       * Clean up source title
       * @param {string} title - Raw title
       * @returns {string} Cleaned title
       */
      cleanTitle(title) {
          return title
              .replace(/^[-•\*\s]+/, '') // Remove leading bullets/dashes
              .replace(/[-•\*\s]+$/, '') // Remove trailing bullets/dashes
              .replace(/^\d+\.\s*/, '') // Remove numbering
              .trim();
      }

      /**
       * Extract title from URL
       * @param {string} url - Source URL
       * @returns {string} Extracted title
       */
      getTitleFromUrl(url) {
          try {
              const parsed = new URL(url);
              const domain = parsed.hostname.replace('www.', '');
              const path = parsed.pathname.split('/').filter(p => p).join(' › ');
              return path ? `${domain} › ${path}` : domain;
          } catch {
              return url;
          }
      }

      /**
       * Estimate quality score from URL
       * @param {string} url - Source URL
       * @returns {string} Quality level: 'high', 'medium', or 'low'
       */
      estimateQualityFromUrl(url) {
          const domain = url.toLowerCase();
          
          const highQuality = [
              'wikipedia.org', 'github.com', 'stackoverflow.com', 'arxiv.org',
              'nature.com', 'science.org', 'ieee.org', 'pubmed.ncbi.nlm.nih.gov',
              'reuters.com', 'bbc.com', 'nytimes.com', 'theguardian.com', 'apnews.com',
              'mit.edu', 'stanford.edu', '.gov', '.edu'
          ];
          
          const lowQuality = [
              'pinterest.com', 'quora.com', 'yahoo.com', 'ehow.com',
              'wikihow.com', 'answers.com', 'ask.com'
          ];
          
          for (const high of highQuality) {
              if (domain.includes(high)) return 'high';
          }
          
          for (const low of lowQuality) {
              if (domain.includes(low)) return 'low';
          }
          
          return 'medium';
      }

      /**
       * Create a DOM element for a source
       * @param {Object} source - Source object
       * @param {number} index - Source index
       * @returns {Element} Source DOM element
       */
      createSourceElement(source, index) {
          const sourceItem = document.createElement('a');
          sourceItem.className = 'source-item';
          sourceItem.href = source.url;
          sourceItem.target = '_blank';
          sourceItem.rel = 'noopener noreferrer';
          
          const title = document.createElement('div');
          title.className = 'source-title';
          title.textContent = source.title;
          sourceItem.appendChild(title);
          
          const url = document.createElement('div');
          url.className = 'source-url';
          url.textContent = source.url;
          sourceItem.appendChild(url);
          
          if (source.quality) {
              const quality = document.createElement('span');
              quality.className = `source-quality ${source.quality}`;
              quality.textContent = source.quality.charAt(0).toUpperCase() + source.quality.slice(1);
              sourceItem.appendChild(quality);
          }
          
          return sourceItem;
      }

      /**
       * Initialize source processing for existing messages
       */
      initializeExistingMessages() {
          // Process bot messages currently rendered in the chat pane
          const messages = document.querySelectorAll('.chat-message.bot');
          messages.forEach(messageElement => {
              const contentDiv = messageElement.querySelector('.chat-text');
              if (!contentDiv) return;
              const messageText = contentDiv.textContent || contentDiv.innerText || '';
              this.processMessageSources(messageText, messageElement);
          });
      }

      /**
       * Process a new message as it's being received
       * @param {Element} messageElement - The message DOM element
       * @param {string} content - The message content
       */
      processNewMessage(messageElement, content) {
          // Only process when the message is complete
          if (content.includes('Sources:') || content.includes('References:')) {
              this.processMessageSources(content, messageElement);
          }
      }
  }
  let instance = null;
  let initPromise = null;

  function ensureInstance() {
      if (!instance) {
          instance = new SourceDisplayManager();
          try { window.sourceDisplayManager = instance; } catch {}
      }
      return instance;
  }

  function init$1() {
      if (initPromise) return initPromise;
      initPromise = new Promise((resolve) => {
          const start = () => {
              const manager = ensureInstance();
              if (!manager._initialized) {
                  manager._initialized = true;
                  manager.initializeExistingMessages();
              }
              resolve(manager);
          };
          if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', start, { once: true });
          } else {
              start();
          }
      });
      return initPromise;
  }

  function getManager() {
      return instance;
  }

  try { window.SourceDisplayManager = SourceDisplayManager; } catch {}

  var sourceDisplay = /*#__PURE__*/Object.freeze({
    __proto__: null,
    default: SourceDisplayManager,
    getManager: getManager,
    init: init$1
  });

  let initialized = false;

  function init() {
      if (initialized) return;
      initialized = true;
      if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', setupChatUI);
      } else {
          setupChatUI();
      }
  }

  function setupChatUI() {
      // Tab switching logic
      document.getElementById('notesTabBtn');
      const chatTabBtn = document.getElementById('chatTabBtn');
      document.getElementById('notesSection');
      const chatSection = document.getElementById('chatSection');

      // Track the current chat id and get reference to chatTreeView
      let currentChatId = null;
      let chatTreeView = null;
      
      // Track generation state and abort controller
      let isGenerating = false;
      let currentAbortController = null;

      // Expose currentChatId globally for other modules to access
      if (!window.hasOwnProperty('currentChatId')) {
          Object.defineProperty(window, 'currentChatId', {
              get: function() { return currentChatId; },
              set: function(value) { currentChatId = value; },
              configurable: true
          });
      }

      // Initialize references after a short delay to ensure app.js has run
      setTimeout(() => {
          // Get reference to the chatTreeView
          if (window.chatTreeView) {
              chatTreeView = window.chatTreeView;
          }
      }, 500);

      // React to tab changes from app.js instead of owning click handlers
      document.addEventListener('tabChanged', (ev) => {
          const tabType = ev && ev.detail && ev.detail.tabType;
          if (tabType === 'notes') {
              document.body.classList.remove('chat-mode');
              document.body.classList.add('notes-mode');
          }
          if (tabType === 'chat') {
              document.body.classList.remove('notes-mode');
              document.body.classList.add('chat-mode');
              // Ensure the model selector shows a model immediately when entering chat
              initDefaultModelIfNeeded();
              // Focus the chat input when switching to chat tab
              setTimeout(() => { if (chatInput) chatInput.focus(); }, 100);
              // Ensure input height and scroll positions are correct on mobile
              setTimeout(() => {
                  if (chatInput) {
                      chatInput.style.height = 'auto';
                      const minHeight = 24;
                      const maxHeight = 120;
                      const newHeight = Math.min(Math.max(chatInput.scrollHeight, minHeight), maxHeight);
                      chatInput.style.height = newHeight + 'px';
                  }
                  if (chatMessages) {
                      chatMessages.scrollTop = chatMessages.scrollHeight;
                  }
                  adjustChatLayoutPadding();
              }, 150);
              // Show helpful message if no chat is loaded and no messages are displayed
              if (!currentChatId && chatMessages && chatMessages.children.length === 0) {
                  chatMessages.innerHTML = `
                    <div class="chat-message bot is-muted">
                        <div class="chat-icon"><i class="fas fa-robot"></i></div>
                        <div class="chat-text">👋 Welcome! You can start chatting right away - just type your message below and I'll respond!</div>
                    </div>
                `;
              }
              // Clear any ongoing chat creation process
              window.creatingDefaultChat = false;
          }
      });

      const chatInput = document.getElementById('chatInput');
      const chatSendBtn = document.getElementById('chatSendBtn');
      const chatMessages = document.getElementById('chatMessages');
      const voiceChatBtn = document.getElementById('voiceChatBtn');
      const chatPlusBtn = document.getElementById('chatPlusBtn');
      const chatPlusMenu = document.getElementById('chatPlusMenu');

      // Inject a cancel/stop button next to Send for aborting generation
      let chatCancelBtn = document.getElementById('chatCancelBtn');
      const inputButtonsRight = document.querySelector('.input-buttons-right');
      if (!chatCancelBtn && inputButtonsRight) {
          chatCancelBtn = document.createElement('button');
          chatCancelBtn.id = 'chatCancelBtn';
          chatCancelBtn.className = 'input-btn cancel-btn';
          chatCancelBtn.title = 'Stop generating';
          chatCancelBtn.style.display = 'none';
          chatCancelBtn.innerHTML = '<i class="fas fa-stop"></i>';
          inputButtonsRight.appendChild(chatCancelBtn);
      }
      if (chatCancelBtn) {
          chatCancelBtn.addEventListener('click', (e) => {
              e.preventDefault();
              // Immediate UI reset
              isGenerating = false;
              updateSendButtonState(false);
              // Dispatch normalized abort event for modular controller
              try { window.dispatchEvent(new CustomEvent('chat:abort')); } catch {}
          });
      }

      // Plus submenu toggle
      if (chatPlusBtn && chatPlusMenu) {
          chatPlusBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              chatPlusMenu.classList.toggle('open');
          });
          // Close on outside click
          document.addEventListener('click', (e) => {
              const leftContainer = document.querySelector('.input-buttons-left');
              if (!leftContainer) return;
              if (!leftContainer.contains(e.target)) {
                  chatPlusMenu.classList.remove('open');
              }
          });
          // Close when focusing input or sending
          if (chatInput) {
              chatInput.addEventListener('focus', () => chatPlusMenu.classList.remove('open'));
          }
      }

      // Add agent selector to plus menu
      try {
          if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.agentsUI) {
              window.ChatModules.agentsUI.addAgentSelectorToPlusMenu();
          } else {
              addAgentSelectorToPlusMenu();
          }
      } catch (_) { try { addAgentSelectorToPlusMenu(); } catch {} }

      // Ensure message area leaves room for the fixed input area on phones
      function adjustChatLayoutPadding() {
          const inputArea = document.querySelector('.chat-input-area');
          if (inputArea && chatMessages) {
              const h = inputArea.offsetHeight || 0;
              chatMessages.style.paddingBottom = (h + 20) + 'px';
          }
      }
      
      // Initialize textarea auto-resize
      if (chatInput) {
          // Set initial height
          chatInput.style.height = 'auto';
          chatInput.style.height = Math.max(chatInput.scrollHeight, 24) + 'px';
          adjustChatLayoutPadding();
      }

      // Update padding when messages change (e.g., history loads, streaming tokens)
      if (chatMessages) {
          const obs = new MutationObserver((mutations) => {
              setTimeout(adjustChatLayoutPadding, 50);
              // Typeset math for new/changed chat-text nodes
              for (const m of mutations) {
                  if (m.type === 'childList') {
                      m.addedNodes.forEach(node => {
                          if (node && node.nodeType === 1) {
                              const el = node.matches && node.matches('.chat-text') ? node : node.querySelector && node.querySelector('.chat-text');
                              if (el) queueMathTypeset(el);
                          }
                      });
                  } else if (m.type === 'characterData') {
                      const el = m.target && m.target.parentElement && m.target.parentElement.closest('.chat-text');
                      if (el) queueMathTypeset(el);
                  }
              }
          });
          obs.observe(chatMessages, { childList: true, subtree: true, characterData: true });
      }

      // Also adjust on window and viewport changes
      window.addEventListener('resize', adjustChatLayoutPadding);
      if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', adjustChatLayoutPadding);
      }
      // If MathJax loads after initial render, typeset existing messages
      if (window.MathJax && window.MathJax.typesetPromise) {
          const all = document.querySelectorAll('.chat-text');
          if (all.length) {
              window.MathJax.typesetPromise(Array.from(all)).catch(() => {});
          }
      }
      
      // Initialize audio transcription
      const audioTranscription = new AudioTranscriptionManager(chatInput);
      audioTranscription.init('chatRecordBtn');

      // Set up voice chat button handler (the actual functionality is in voiceChat.js)
      if (voiceChatBtn) {
          voiceChatBtn.title = "Start voice conversation";
      }

      // Check if marked library is available
      if (!window.marked) {
          console.error("Marked library not loaded. Please add it to your HTML.");
          // Add the script to the document if it's missing
          const script = document.createElement('script');
          script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
          document.head.appendChild(script);
      }

      // Check if highlight.js is available
      if (!window.hljs) {
          console.error("Highlight.js not loaded. Please add it to your HTML.");
          // Add the script to the document if it's missing
          const script = document.createElement('script');
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js";
          document.head.appendChild(script);
          
          // Add a default style if not present
          const link = document.createElement('link');
          link.rel = "stylesheet";
          link.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css";
          document.head.appendChild(link);
      }

      // Ensure MathJax is present and configured; load if missing or not ready
      (function ensureMathJax(){
          try {
              // Initialize pending queue
              if (!window._pendingMathEls) window._pendingMathEls = [];
              const hasTypeset = !!(window.MathJax && typeof window.MathJax.typesetPromise === 'function');
              if (!window.MathJax) {
                  window.MathJax = {
                      tex: {
                          inlineMath: [['$', '$'], ['\\(', '\\)']],
                          displayMath: [['$$','$$'], ['\\[','\\]']]
                      },
                      options: { skipHtmlTags: ['script','noscript','style','textarea','pre','code'] }
                  };
              }
              // If the runtime is not ready, inject the script unless it already exists
              if (!hasTypeset) {
                  const already = document.querySelector('script[src*="mathjax@3"][src*="tex-chtml.js"]');
                  if (!already) {
                      const mj = document.createElement('script');
                      mj.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js';
                      mj.async = true;
                      mj.onload = () => {
                          try {
                              if (window._pendingMathEls && window._pendingMathEls.length && window.MathJax && window.MathJax.typesetPromise) {
                                  const uniq = Array.from(new Set(window._pendingMathEls.filter(Boolean)));
                                  window.MathJax.typesetPromise(uniq).finally(() => { window._pendingMathEls = []; });
                              }
                          } catch {}
                      };
                      document.head.appendChild(mj);
                  }
              }
          } catch {}
      })();

      // Function to add copy button to code blocks
      function addCopyButtonsToCodeBlocks(container) {
          const codeBlocks = container.querySelectorAll('pre code');
          codeBlocks.forEach(codeBlock => {
              const preElement = codeBlock.parentElement;
              if (!preElement) return;
              // Avoid duplicate copy buttons during streaming updates
              if (preElement.querySelector('.code-copy-btn')) return;
              // Create a copy button
              const copyButton = document.createElement('button');
              copyButton.className = 'code-copy-btn';
              copyButton.innerHTML = '<i class="fas fa-copy"></i>';
              copyButton.title = 'Copy to clipboard';
              // Add the button to the parent pre element
              preElement.appendChild(copyButton);
              
              // Add click event listener to copy code
              copyButton.addEventListener('click', () => {
                  const codeText = codeBlock.textContent;
                  navigator.clipboard.writeText(codeText)
                      .then(() => {
                          // Visual feedback on successful copy
                          copyButton.innerHTML = '<i class="fas fa-check"></i>';
                          setTimeout(() => {
                              copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                          }, 1500);
                      })
                      .catch(err => {
                          console.error('Failed to copy text: ', err);
                          copyButton.innerHTML = '<i class="fas fa-times"></i>';
                          setTimeout(() => {
                              copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                          }, 1500);
                      });
              });
              
          });
      }

      // Configure marked for safety and better formatting with code highlighting
      if (window.marked) {
          marked.setOptions({
              breaks: true,        // Add line breaks when \n is encountered
              gfm: true,           // Use GitHub Flavored Markdown
              headerIds: false,    // Don't add ids to headers for security
              mangle: false,       // Don't mangle email addresses
              sanitize: false,     // Handle sanitization at our level for more control
              highlight: function(code, language) {
                  // Use highlight.js for syntax highlighting if available
                  if (window.hljs && language) {
                      try {
                          return hljs.highlight(code, {language}).value;
                      } catch (e) {
                          console.warn('Error highlighting code:', e);
                      }
                  }
                  return code; // Return original code if highlighting fails
              }
          });
      }

      // Delegate to shared render helpers
      function normalizeMathDelimiters(src) {
          try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.normalizeMathDelimiters)
              ? window.ChatModules.render.normalizeMathDelimiters(src)
              : src; } catch { return src; }
      }

      // Protect math segments from Markdown parsing (so _ and * inside LaTeX aren't mangled)
      function protectMathSegments(src) {
          try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.protectMathSegments)
              ? window.ChatModules.render.protectMathSegments(src)
              : { text: src, placeholders: [] }; } catch { return { text: src, placeholders: [] }; }
      }

  function restoreMathSegments(html, placeholders) {
          try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.restoreMathSegments)
              ? window.ChatModules.render.restoreMathSegments(html, placeholders)
              : html; } catch { return html; }
  }

      function renderMarkdownSafe(src) {
          try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.renderMarkdownSafe)
              ? window.ChatModules.render.renderMarkdownSafe(src)
              : (window.marked ? window.marked.parse(String(src || '')) : String(src || '')); } catch { return String(src || ''); }
      }

      // Finalize a bot message: set HTML, highlight code, add copy buttons, and typeset math
      function finalizeBotMessage(targetEl, fullText) {
          try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.finalizeBotMessage)
              ? window.ChatModules.render.finalizeBotMessage(targetEl, fullText)
              : (function(){ if (!targetEl) return; targetEl.textContent = fullText || ''; })(); } catch {}
      }

      // Expose render helpers for modular chat integration
      try {
          if (!window.renderMarkdownSafe) window.renderMarkdownSafe = renderMarkdownSafe;
          if (!window.finalizeBotMessage) window.finalizeBotMessage = finalizeBotMessage;
      } catch {}

      // Queue MathJax typeset for a given element
      function queueMathTypeset(el) {
          try {
              if (!el) return;
              if (window.MathJax && window.MathJax.typesetPromise) {
                  window.MathJax.typesetPromise([el]).catch(() => {});
              } else {
                  // Defer until MathJax loads
                  if (!window._pendingMathEls) window._pendingMathEls = [];
                  window._pendingMathEls.push(el);
              }
          } catch {}
      }

      // Expose helpers for modular chat
      try {
          if (!window.addCopyButtonsToCodeBlocks) window.addCopyButtonsToCodeBlocks = addCopyButtonsToCodeBlocks;
          if (!window.queueMathTypeset) window.queueMathTypeset = queueMathTypeset;
      } catch {}

      

      // Helper: append message to chat (modified for better markdown, code highlighting, and math)
      async function appendMessage(text, sender, autoSave = true, messageIndex = null, extras = null) {
          // Validate text input
          if (text === null || text === undefined) {
              console.warn('appendMessage called with null/undefined text, using empty string');
              text = '';
          } else if (typeof text !== 'string') {
              console.warn('appendMessage called with non-string text, converting:', typeof text, text);
              text = String(text);
          }
          
          const msgDiv = document.createElement('div');
          msgDiv.className = 'chat-message ' + sender;
          
          // Parse the text with marked if available, otherwise use the raw text
          let formattedText = text;
          if (window.marked) {
              // Normalize math delimiters and protect math tokens from Markdown
              const normalized = normalizeMathDelimiters(text);
              const { text: mdSafe, placeholders } = protectMathSegments(normalized);
              const html = marked.parse(mdSafe);
              formattedText = restoreMathSegments(html, placeholders);
          }
          
          if (sender === 'user') {
              // Restructured to place edit button below and to the right of chat-text
              msgDiv.innerHTML = `
                <div class="message-content">
                    <div class="chat-text" data-original-text="${text.replace(/"/g, '&quot;')}">${formattedText}</div>
                    <div class="chat-icon">
                        <i class="fas fa-user"></i>
                    </div>
                </div>
                <div class="message-controls">
                    <div class="edit-message-btn"><i class="fas fa-pencil-alt"></i></div>
                </div>
            `;

              // If extras contain a selectionRef or displayLabel, augment the message
              try {
                  if (extras && (extras.selectionRef || extras.displayLabel)) {
                      const chatText = msgDiv.querySelector('.chat-text');
                      if (chatText && extras.displayLabel && text === extras.displayLabel) {
                          // Append jump pill (no reference text) if selection provided, aligned to right
                          if (extras.selectionRef && !chatText.querySelector('.selection-jump')) {
                              const meta = extras.selectionRef;
                              // Wrap existing label content to enable right-aligned jump
                              const labelWrap = document.createElement('span');
                              labelWrap.className = 'chat-text-label';
                              labelWrap.innerHTML = chatText.innerHTML;
                              chatText.innerHTML = '';
                              chatText.appendChild(labelWrap);
                              const jump = document.createElement('a');
                              jump.href = '#';
                              jump.className = 'selection-jump';
                              jump.title = 'Go to selection';
                              jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                              jump.addEventListener('click', async (ev) => {
                                  ev.preventDefault();
                                  try {
                                      // Optional version check if available
                                      if (window.documentActionsManager && meta && meta.docId) {
                                          try { await window.documentActionsManager.computeAndCacheDocHash(); } catch {}
                                          const currentDocId = window.documentActionsManager.getDocId();
                                          if (currentDocId && meta.docId && currentDocId !== meta.docId) {
                                              if (window.modalManager) {
                                                  window.modalManager.showToast({
                                                      message: 'This selection was saved for a different version of the document. Attempting to re-anchor…',
                                                      type: 'warning', duration: 3000
                                                  });
                                              }
                                          }
                                      }
                                      if (window.documentActionsManager && typeof window.documentActionsManager.navigateToSelection === 'function') {
                                          window.documentActionsManager.navigateToSelection(meta);
                                      } else {
                                          const iframe = document.querySelector('.pdf-iframe');
                                          if (iframe && iframe.contentWindow) {
                                              iframe.contentWindow.postMessage({ type: 'selection:navigate', meta }, '*');
                                          }
                                          window.dispatchEvent(new CustomEvent('selection:navigate', { detail: { selection: meta } }));
                                      }
                                  } catch {}
                              });
                              chatText.appendChild(jump);
                              chatText.classList.add('has-jump');
                          }
                      }
                  }
              } catch {}
              
              // Add edit functionality to user messages
              const editBtn = msgDiv.querySelector('.edit-message-btn');
              msgDiv.querySelector('.chat-text');
              
              editBtn.addEventListener('click', async function() {
                  if (!editBtn.classList.contains('editing')) {
                      // Start editing
                      startMessageEditing(msgDiv, text);
                  } else {
                      // Save changes
                      const editTextarea = msgDiv.querySelector('.edit-textarea');
                      await confirmMessageEdit(msgDiv, editTextarea.value, messageIndex);
                  }
              });
              
          } else {
              // Bot message structure with added response action buttons
              msgDiv.innerHTML = `
                <div class="chat-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="chat-text">${formattedText}</div>
                <div class="response-actions">
                    <button class="response-action-btn regenerate-btn" title="Regenerate response">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="response-action-btn copy-btn" title="Copy response">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="response-action-btn listen-btn" title="Listen to response">
                        <i class="fas fa-volume-up"></i>
                    </button>
                    <button class="response-action-btn send-to-note-btn" title="Send to note">
                        <i class="fas fa-file-export"></i>
                    </button>
                    <button class="response-action-btn sources-btn" title="View sources" style="display: none;">
                        <i class="fas fa-link"></i>
                    </button>
                </div>
            `;
              
              // Add functionality to regenerate button via modular controller
              const regenerateBtn = msgDiv.querySelector('.regenerate-btn');
              regenerateBtn.addEventListener('click', async function() {
                  if (isGenerating) return;
                  // Find the previous user message
                  let userMessage = msgDiv.previousElementSibling;
                  while (userMessage && !userMessage.classList.contains('user')) {
                      userMessage = userMessage.previousElementSibling;
                  }
                  if (!userMessage) return;
                  const userText = userMessage.querySelector('.chat-text').getAttribute('data-original-text');
                  // Remove current bot response
                  msgDiv.remove();
                  // Update UI state during generation
                  isGenerating = true;
                  updateSendButtonState(true);
                  try {
                      const forceWebSearch = window.shouldForceWebSearch ? window.shouldForceWebSearch() : false;
                      if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.controller) {
                          await window.ChatModules.controller.sendMessage(userText, { forceSearch: forceWebSearch });
                      } else {
                          // Fallback to default send path
                          chatInput.value = userText;
                          await __chatFlaggedSendHandler();
                      }
                  } catch (e) {
                      console.error('Regenerate via controller failed:', e);
                  } finally {
                      isGenerating = false;
                      updateSendButtonState(false);
                  }
              });
              
              // Add functionality to copy button
              const copyBtn = msgDiv.querySelector('.copy-btn');
              copyBtn.addEventListener('click', function() {
                  // Get the original markdown text
                  const originalText = text;
                  
                  // Copy to clipboard
                  navigator.clipboard.writeText(originalText)
                      .then(() => {
                          // Visual feedback on successful copy
                          copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                          setTimeout(() => {
                              copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                          }, 1500);
                      })
                      .catch(err => {
                          console.error('Failed to copy text: ', err);
                          copyBtn.innerHTML = '<i class="fas fa-times"></i>';
                          setTimeout(() => {
                              copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                          }, 1500);
                      });
              });
              
              // Add functionality to listen button
              const listenBtn = msgDiv.querySelector('.listen-btn');
              listenBtn.addEventListener('click', function() {
                  // Check if window.textToSpeech is available
                  if (!window.textToSpeech) {
                      console.error('Text-to-speech manager not available');
                      return;
                  }
                  
                  // If already speaking this response, stop it
                  if (window.textToSpeech.isSpeaking() && msgDiv.classList.contains('speaking')) {
                      window.textToSpeech.stop();
                      msgDiv.classList.remove('speaking');
                      listenBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                      listenBtn.title = "Listen to response";
                      return;
                  }
                  
                  // Stop any current speech first
                  window.textToSpeech.stop();
                  
                  // Remove speaking class from any other message
                  document.querySelectorAll('.chat-message.speaking').forEach(msg => {
                      msg.classList.remove('speaking');
                      const btn = msg.querySelector('.listen-btn');
                      if (btn) {
                          btn.innerHTML = '<i class="fas fa-volume-up"></i>';
                          btn.title = "Listen to response";
                      }
                  });
                  
                  // Get the original markdown text
                  const originalText = text;
                  
                  // Start speech
                  window.textToSpeech.speak(
                      originalText,
                      // onStart callback
                      () => {
                          msgDiv.classList.add('speaking');
                          listenBtn.innerHTML = '<i class="fas fa-stop"></i>';
                          listenBtn.title = "Stop speaking";
                      },
                      // onEnd callback
                      () => {
                          msgDiv.classList.remove('speaking');
                          listenBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                          listenBtn.title = "Listen to response";
                      },
                      // onError callback
                      (error) => {
                          console.error('Speech error:', error);
                          msgDiv.classList.remove('speaking');
                          listenBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                          listenBtn.title = "Listen to response";
                          
                          // Show error toast or notification
                          if (window.modalManager) {
                              window.modalManager.showConfirmationDialog({
                                  title: 'Text-to-Speech Error',
                                  message: error || 'Failed to read response aloud.',
                                  confirmText: 'OK',
                                  icon: 'exclamation-triangle'
                              });
                          }
                      }
                  );
              });
              
              // Add functionality to send-to-note button
              const sendToNoteBtn = msgDiv.querySelector('.send-to-note-btn');
              sendToNoteBtn.addEventListener('click', function() {
                  // Get the original markdown text
                  const originalText = text;
                  
                  // Validate we have content to send
                  if (!originalText || !originalText.trim()) {
                      console.warn('No content to send to note');
                      if (window.modalManager) {
                          window.modalManager.showToast({
                              message: 'No content to send to note',
                              type: 'warning',
                              duration: 3000
                          });
                      }
                      return;
                  }

                  // Check if file viewer notes editor is open
                  if (window.fileViewer && 
                      window.fileViewer.instance && 
                      window.fileViewer.instance.notesEditorInstance) {
                      
                      // Send directly to open notes editor
                      window.fileViewer.instance.addToCurrentNote(originalText);
                      return;
                  }
                  
                  // Check if FileViewerRedesigned instance is available and has notes editor open
                  if (window.FileViewerRedesigned && 
                      window.FileViewerRedesigned.instance && 
                      window.FileViewerRedesigned.instance.notesEditorInstance) {
                      
                      // Send directly to open notes editor
                      window.FileViewerRedesigned.instance.addToCurrentNote(originalText);
                      return;
                  }
                  
                  // If no notes editor is open, show options
                  showSendToNoteOptions(originalText);
              });
          }
          
          chatMessages.appendChild(msgDiv);
          chatMessages.scrollTop = chatMessages.scrollHeight;
          
          // Apply syntax highlighting to any code blocks that were just added
          if (window.hljs) {
              msgDiv.querySelectorAll('pre code').forEach((block) => {
                  hljs.highlightElement(block);
              });
          }

          // Add copy buttons to code blocks
          addCopyButtonsToCodeBlocks(msgDiv);

          // Typeset math in this message if MathJax is available
          queueMathTypeset(msgDiv.querySelector('.chat-text'));
          
          // If this is a bot message, extract sources into UI and capture them for saving
          let parsedSources = [];
          if (sender === 'bot' && window.sourceDisplayManager) {
              parsedSources = window.sourceDisplayManager.processMessageSources(text || '', msgDiv) || [];
          }

          // Save the message only when autoSave is true (i.e. not loading history)
          if (autoSave && currentChatId && chatTreeView) {
              await saveMessageToChat(text, sender, parsedSources, extras);
          }
          
          return msgDiv;
      }

      // Expose for other modules to append messages consistently
      window.appendMessage = appendMessage;
      
      // Function to show options when no notes editor is open
      function showSendToNoteOptions(markdownText) {
          const dialogHTML = `
            <div class="send-to-note-modal" id="sendToNoteModal">
                <div class="modal-overlay" onclick="closeSendToNoteModal()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Send to Note</h3>
                        <button class="modal-close" onclick="closeSendToNoteModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <p>Choose how to send this content to a note:</p>
                        <div class="send-options">
                            <button class="btn-primary option-btn" onclick="openNotesEditorAndAdd('${markdownText.replace(/'/g, "\\'")}')">
                                <i class="fas fa-plus"></i>
                                Open Notes Editor
                            </button>
                            <button class="btn-secondary option-btn" onclick="sendToExistingNoteSystem('${markdownText.replace(/'/g, "\\'")}')">
                                <i class="fas fa-sticky-note"></i>
                                Send to Existing Notes
                            </button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="closeSendToNoteModal()">Cancel</button>
                    </div>
                </div>
            </div>
        `;
          
          document.body.insertAdjacentHTML('beforeend', dialogHTML);
      }
      
      // Function to close the send to note modal
      function closeSendToNoteModal() {
          const modal = document.getElementById('sendToNoteModal');
          if (modal) {
              modal.remove();
          }
      }
      
      // Function to open notes editor and add content
      function openNotesEditorAndAdd(markdownText) {
          closeSendToNoteModal();
          
          // Open the file viewer panel if not visible
          const fileViewerPanel = document.querySelector('.file-viewer-panel');
          if (fileViewerPanel && fileViewerPanel.style.display === 'none') {
              fileViewerPanel.style.display = 'block';
          }
          
          // Check if we have FileViewerRedesigned instance
          if (window.FileViewerRedesigned && window.FileViewerRedesigned.instance) {
              // Open notes editor
              window.FileViewerRedesigned.instance.openNotesEditor();
              
              // Wait a moment for editor to initialize, then add content
              setTimeout(() => {
                  window.FileViewerRedesigned.instance.addToCurrentNote(markdownText);
              }, 1000);
          } else {
              console.error('FileViewerRedesigned instance not found');
          }
      }
      
      // Function to use existing note system (backwards compatibility)
      function sendToExistingNoteSystem(markdownText) {
          closeSendToNoteModal();
          
          // Initialize modalManager if needed
          if (!window.modalManager) {
              window.modalManager = new ModalManager();
          }
          
          // Get notes tree
          const notesTree = window.noteTreeView ? window.noteTreeView.nodes : [];
          
          // Show the note submenu instead of full modal
          window.modalManager.showNoteSubmenu(document.querySelector('.send-to-note-btn'), notesTree, (selectedNoteId) => {
              if (selectedNoteId) {
                  sendMarkdownToNote(markdownText, selectedNoteId);
              }
          });
      }
      
      // Expose functions globally so they can be called from onclick handlers
      window.closeSendToNoteModal = closeSendToNoteModal;
      window.openNotesEditorAndAdd = openNotesEditorAndAdd;
      window.sendToExistingNoteSystem = sendToExistingNoteSystem;
      
      // Function to convert markdown to EditorJS format and append to a note
      async function sendMarkdownToNote(markdownText, noteId) {
          // Validate input first
          if (!markdownText || typeof markdownText !== 'string' || !markdownText.trim()) {
              console.warn("Invalid or empty markdown text provided to sendMarkdownToNote");
              if (window.modalManager) {
                  window.modalManager.showToast({
                      message: 'No content to send to note',
                      type: 'warning',
                      duration: 3000
                  });
              }
              return;
          }
          
          // First convert markdown to EditorJS blocks format
          const editorJsBlocks = convertMarkdownToEditorJS(markdownText);
          
          if (!editorJsBlocks || !editorJsBlocks.length) {
              console.error("Failed to convert markdown to EditorJS format - no blocks generated");
              if (window.modalManager) {
                  window.modalManager.showToast({
                      message: 'Failed to process content for note',
                      type: 'error',
                      duration: 3000
                  });
              }
              return;
          }
          
          // Get the note node from the tree view
          const noteNode = window.noteTreeView.findNodeById(window.noteTreeView.nodes, noteId);
          if (!noteNode) {
              console.error("Note not found:", noteId);
              return;
          }
          
          // Get the current note content
          let noteContent = noteNode.content;
          if (!noteContent) {
              noteContent = { blocks: [] };
          }
          
          // Append the new blocks to the note content
          noteContent.blocks = noteContent.blocks.concat(editorJsBlocks);
          
          // Update the note content in the tree
          window.noteTreeView.updateNode(noteId, { content: noteContent });
          
          // If the note is currently open in the editor, update the editor
          if (window.editorInstance && window.editorInstance.currentNoteId === noteId) {
              try {
                  // Set loading flag
                  window.isLoadingNote = true;
                  
                  await window.editorInstance.render(noteContent);
                  
                  // Clear loading flag
                  setTimeout(() => {
                      window.isLoadingNote = false;
                  }, 300);
              } catch (error) {
                  console.error('Error rendering updated note content:', error);
                  window.isLoadingNote = false;
              }
          }
          
          // Save the updated note to backend
          saveToBackend(noteId, noteNode.name, noteContent);
          
          // Show a toast notification instead of a confirmation dialog
          if (window.modalManager) {
              window.modalManager.showToast({
                  message: `Content added to "${noteNode.name}"`,
                  type: 'success',
                  duration: 3000
              });
          }
      }
      
      // Function to convert markdown to EditorJS blocks
      function convertMarkdownToEditorJS(markdownText) {
          try {
              if (!markdownText || typeof markdownText !== 'string') {
                  console.warn('Invalid markdown text provided to convertMarkdownToEditorJS');
                  return [];
              }

              const trimmedText = markdownText.trim();
              if (!trimmedText) {
                  console.warn('Empty markdown text provided to convertMarkdownToEditorJS');
                  return [];
              }

              // Prefer the shared minimal parser if available (handles tables, code fences, etc.)
              try {
                  if (typeof window.mdToEditorJS === 'function') {
                      const out = window.mdToEditorJS(trimmedText);
                      if (out && Array.isArray(out.blocks) && out.blocks.length) return out.blocks;
                  }
              } catch (e) {
                  console.warn('mdToEditorJS failed, using local fallback:', e);
              }

              const blocks = [];
              const lines = trimmedText.split('\n');

              let i = 0;
              let currentCodeBlock = null;
              let currentListItems = [];
              let currentListType = null; // 'ordered' or 'unordered'
              let paragraphBuffer = []; // [{text, br}]

              function flushCurrentList() {
                  if (currentListItems.length > 0) {
                      blocks.push({
                          type: 'list',
                          data: {
                              style: currentListType === 'ordered' ? 'ordered' : 'unordered',
                              items: currentListItems.map(item => item.content)
                          }
                      });
                      currentListItems = [];
                      currentListType = null;
                  }
              }

              function flushParagraph() {
                  if (!paragraphBuffer.length) return;
                  let text = '';
                  for (let idx = 0; idx < paragraphBuffer.length; idx++) {
                      const seg = paragraphBuffer[idx];
                      text += processInlineFormatting(seg.text);
                      if (seg.br && idx < paragraphBuffer.length - 1) {
                          text += '<br/>';
                      } else if (idx < paragraphBuffer.length - 1) {
                          text += ' ';
                      }
                  }
                  if (text.trim()) {
                      blocks.push({ type: 'paragraph', data: { text } });
                  }
                  paragraphBuffer = [];
              }

              function isBoldOnly(line) {
                  const t = line.trim();
                  return (/^\*\*[^*].*\*\*$/.test(t) || /^__[^_].*__$/.test(t)) && !t.includes('** ') && !t.includes(' **');
              }

              function stripBoldMarkers(line) {
                  return line.trim().replace(/^\*\*\s*|\s*\*\*$/g, '').replace(/^__\s*|\s*__$/g, '');
              }

              function isPlainTitle(line, nextLine) {
                  const t = (line || '').trim();
                  const n = (nextLine || '').trim();
                  if (!t) return false;
                  if (n !== '') return false; // must be followed by blank line
                  if (/^\s*[#>\-*`]|^\d+\./.test(t)) return false; // not other md constructs
                  if (t.length > 80) return false;
                  if (/[.!?:]$/.test(t)) return false;
                  // Letters, numbers, spaces, simple punctuation
                  return /^[\p{L}\p{N} ,;\-–—'"()]+$/u.test(t);
              }

              while (i < lines.length) {
                  const rawLine = lines[i];
                  const line = rawLine; // keep spaces for double-space breaks

                  // Inside code fence
                  if (currentCodeBlock !== null) {
                      if (line.trim() === '```') {
                          blocks.push({ type: 'code', data: { code: currentCodeBlock.code, language: currentCodeBlock.language || 'plaintext' } });
                          currentCodeBlock = null;
                      } else {
                          currentCodeBlock.code += rawLine + '\n';
                      }
                      i++; continue;
                  }

                  // Blank line: flush paragraph/list
                  if (/^\s*$/.test(line)) {
                      flushParagraph();
                      flushCurrentList();
                      i++; continue;
                  }

                  // Code fence start
                  const codeStart = line.trim().match(/^```(\w*)$/);
                  if (codeStart) {
                      flushParagraph();
                      flushCurrentList();
                      currentCodeBlock = { code: '', language: codeStart[1] || 'plaintext' };
                      i++; continue;
                  }

                  // Header with #
                  const headerMatch = line.trim().match(/^(#{1,6})\s+(.+)$/);
                  if (headerMatch) {
                      flushParagraph();
                      flushCurrentList();
                      blocks.push({ type: 'header', data: { text: headerMatch[2], level: headerMatch[1].length } });
                      i++; continue;
                  }

                  // Bold-only line -> header (level 3)
                  if (isBoldOnly(line)) {
                      flushParagraph();
                      flushCurrentList();
                      blocks.push({ type: 'header', data: { text: stripBoldMarkers(line), level: 3 } });
                      i++; continue;
                  }

                  // Plain standalone title line -> header (level 3)
                  const nextLine = (i + 1 < lines.length) ? lines[i + 1] : '';
                  if (isPlainTitle(line, nextLine)) {
                      flushParagraph();
                      flushCurrentList();
                      blocks.push({ type: 'header', data: { text: line.trim(), level: 3 } });
                      i += 2; // skip following blank line
                      continue;
                  }

                  // Blockquote
                  const quoteMatch = line.trim().match(/^>\s+(.+)$/);
                  if (quoteMatch) {
                      flushParagraph();
                      flushCurrentList();
                      blocks.push({ type: 'quote', data: { text: quoteMatch[1], caption: '' } });
                      i++; continue;
                  }

                  // Horizontal rule
                  if (line.trim().match(/^([-*_])\1{2,}$/)) {
                      flushParagraph();
                      flushCurrentList();
                      blocks.push({ type: 'delimiter', data: {} });
                      i++; continue;
                  }

                  // Lists
                  const ul = line.trim().match(/^[-*]\s+(.+)$/);
                  const ol = line.trim().match(/^\d+\.\s+(.+)$/);
                  if (ul) {
                      flushParagraph();
                      if (currentListType && currentListType !== 'unordered') flushCurrentList();
                      currentListType = 'unordered';
                      currentListItems.push({ content: processInlineFormatting(ul[1]), items: [] });
                      i++; continue;
                  }
                  if (ol) {
                      flushParagraph();
                      if (currentListType && currentListType !== 'ordered') flushCurrentList();
                      currentListType = 'ordered';
                      currentListItems.push({ content: processInlineFormatting(ol[1]), items: [] });
                      i++; continue;
                  }

                  // Normal paragraph line; track hard line break via two trailing spaces
                  const hasHardBreak = /\s\s$/.test(line);
                  const cleaned = line.replace(/\s+$/g, '');
                  paragraphBuffer.push({ text: cleaned, br: hasHardBreak });
                  i++;
              }

              // Flush tail
              flushParagraph();
              flushCurrentList();

              return blocks.length ? blocks : [{ type: 'paragraph', data: { text: processInlineFormatting(trimmedText) } }];

          } catch (error) {
              console.error('Error in convertMarkdownToEditorJS:', error);
              // Fallback: single paragraph
              return [{ type: 'paragraph', data: { text: (markdownText || '').trim() } }];
          }
      }
      
      // Helper function to process inline formatting (e.g., bold, italic)
      function processInlineFormatting(text) {
          if (!text) return text;
          
          // Replace bold (**text** or __text__) with <b>text</b>
          // Process bold first to avoid conflicts with italic
          text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
          text = text.replace(/__([^_]+)__/g, '<b>$1</b>');
          
          // Replace italic (*text* or _text_) with <i>text</i>
          text = text.replace(/\*([^*]+)\*/g, '<i>$1</i>');
          text = text.replace(/_([^_]+)_/g, '<i>$1</i>');
          
          return text;
      }
      
      // Helper function to save note to backend
      function saveToBackend(noteId, title, content) {
          // Show saving notification
          if (window.modalManager && window.modalManager.showToast) {
              window.modalManager.showToast({
                  message: 'Saving note...',
                  type: 'progress',
                  icon: 'save',
                  duration: 2000
              });
          }

          fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: noteId, title, content })
          })
          .then(response => {
              if (!response.ok) {
                  throw new Error('Failed to save note');
              }
              console.log('Note saved successfully!');
              // Show success notification
              if (window.modalManager && window.modalManager.showToast) {
                  window.modalManager.showToast({
                      message: 'Note saved successfully',
                      type: 'success',
                      duration: 2000
                  });
              }
          })
          .catch(error => {
              console.error('Error saving note:', error);
              // Show error notification
              if (window.modalManager && window.modalManager.showToast) {
                  window.modalManager.showToast({
                      message: 'Error saving note',
                      type: 'error',
                      duration: 3000
                  });
              }
          });
      }

      // Function to start editing a message
      function startMessageEditing(msgDiv, originalText) {
          const editBtn = msgDiv.querySelector('.edit-message-btn');
          const chatTextDiv = msgDiv.querySelector('.chat-text');
          const messageControls = msgDiv.querySelector('.message-controls');
          
          // Change edit button to confirm button
          editBtn.innerHTML = '<i class="fas fa-check"></i>';
          editBtn.classList.add('editing');
          
          // Add editing class to message controls for visibility
          messageControls.classList.add('editing');
          
          // Add cancel button to the message controls container
          const cancelBtn = document.createElement('div');
          cancelBtn.className = 'cancel-edit-btn';
          cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
          messageControls.appendChild(cancelBtn);
          messageControls.classList.add('has-cancel');
          
          // Store original content, dimensions and computed styles
          const originalContent = chatTextDiv.innerHTML;
          window.getComputedStyle(chatTextDiv);
          const originalWidth = chatTextDiv.offsetWidth;
          const originalHeight = chatTextDiv.offsetHeight;
          
          // Add editing class before changing content
          chatTextDiv.classList.add('editing');
          
          // Create textarea with exact sizing
          const textarea = document.createElement('textarea');
          textarea.className = 'edit-textarea';
          textarea.value = originalText;
          
          // Force exact same dimensions as original container
          textarea.style.width = originalWidth + 'px';
          textarea.style.minHeight = originalHeight + 'px';
          
          // Clear and append textarea
          chatTextDiv.innerHTML = '';
          chatTextDiv.appendChild(textarea);
          textarea.focus();
          
          // Position cursor at the end of the text
          textarea.setSelectionRange(originalText.length, originalText.length);
          
          // Add event listener to cancel button
          cancelBtn.addEventListener('click', function() {
              // Restore original content and styling
              chatTextDiv.innerHTML = originalContent;
              chatTextDiv.classList.remove('editing');
              
              // Remove cancel button and classes
              cancelBtn.remove();
              messageControls.classList.remove('has-cancel');
              messageControls.classList.remove('editing');
              
              // Reset edit button
              editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
              editBtn.classList.remove('editing');
          });
      }
      
      // Function to confirm message edit and regenerate response
      async function confirmMessageEdit(msgDiv, newText, messageIndex) {
          // Prevent editing if already generating
          if (isGenerating) {
              return;
          }
          
          const editBtn = msgDiv.querySelector('.edit-message-btn');
          const cancelBtn = msgDiv.querySelector('.cancel-edit-btn');
          const chatTextDiv = msgDiv.querySelector('.chat-text');
          const messageControls = msgDiv.querySelector('.message-controls');
          
          // Remove editing class
          chatTextDiv.classList.remove('editing');
          
          // Format the text using marked
          let formattedText = newText;
          if (window.marked) {
              newText = newText.replace(/\* /g, '- ');
              formattedText = marked.parse(newText);
          }
          
          // Update chat text with new content
          chatTextDiv.innerHTML = formattedText;
          chatTextDiv.setAttribute('data-original-text', newText);
          
          // Apply syntax highlighting to any code blocks
          if (window.hljs) {
              chatTextDiv.querySelectorAll('pre code').forEach((block) => {
                  hljs.highlightElement(block);
              });
          }
          
          // Add copy buttons to code blocks
          addCopyButtonsToCodeBlocks(chatTextDiv);
          
          // Reset edit button
          editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
          editBtn.classList.remove('editing');
          
          // Remove cancel button and clean up classes
          if (cancelBtn) {
              cancelBtn.remove();
              messageControls.classList.remove('has-cancel');
          }
          messageControls.classList.remove('editing');
          
          // Find the edited message in the chat node
          if (currentChatId && chatTreeView) {
              const chatNode = chatTreeView.findNodeById(chatTreeView.nodes, currentChatId);
              if (chatNode && chatNode.content && chatNode.content.messages) {
                  // Find the message index if not provided
                  if (messageIndex === null) {
                      const messages = Array.from(chatMessages.querySelectorAll('.chat-message'));
                      messageIndex = messages.indexOf(msgDiv);
                  }
                  
                  // Update the message in the chat node
                  if (messageIndex !== -1 && messageIndex < chatNode.content.messages.length) {
                      chatNode.content.messages[messageIndex].text = newText;
                      
                      // Remove all messages after this one
                      const messagesToRemove = chatNode.content.messages.length - messageIndex - 1;
                      if (messagesToRemove > 0) {
                          chatNode.content.messages.splice(messageIndex + 1);
                          
                          // Remove corresponding elements from the DOM
                          let nextSibling = msgDiv.nextElementSibling;
                          while (nextSibling) {
                              const current = nextSibling;
                              nextSibling = nextSibling.nextElementSibling;
                              current.remove();
                          }
                      }
                      
                      // Save the updated tree to backend
                      saveTreeToBackend();
                      
                      // Create a placeholder for the new streaming response
                      const newBotMessageDiv = await appendMessage('', 'bot', false);
                      const newBotTextDiv = newBotMessageDiv.querySelector('.chat-text');
                      
                      // Set generation state and update button
                      isGenerating = true;
                      updateSendButtonState(true);
                      
                      // Create abort controller for this request
                      currentAbortController = new AbortController();
                      
                      newBotTextDiv.innerHTML = '<span class="typing-indicator">AI is processing your edit...</span>';
                      
                      try {
                          const selectedModel = window.getSelectedModel ? window.getSelectedModel() : null;
                          const response = await fetch('/api/chat', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ 
                                  prompt: newText, 
                                  stream: true,
                                  model: selectedModel,
                                  chat_id: currentChatId || 'default'
                              }),
                              signal: currentAbortController.signal
                          });

                          if (!response.ok) {
                              throw new Error('Network response was not ok');
                          }

                          const reader = response.body.getReader();
                          const decoder = new TextDecoder();
                          let botResponse = '';
                          
                          // Clear typing indicator
                          newBotTextDiv.innerHTML = '';
                          
                          while (true) {
                              const { done, value } = await reader.read();
                              if (done) break;
                              
                              const chunk = decoder.decode(value);
                              const lines = chunk.split('\n');
                              
                              for (const line of lines) {
                                  if (line.startsWith('data: ')) {
                                      try {
                                          const data = JSON.parse(line.slice(6));
                                          
                                          if (data.error) {
                                              botResponse = data.error;
                                              break;
                                          } else if (data.token) {
                                              botResponse += data.token;
                                              // Update the bot message with current response
                                              newBotTextDiv.innerHTML = renderMarkdownSafe(botResponse);
                                              
                                              // Apply syntax highlighting
                                              if (window.hljs) {
                                                  newBotTextDiv.querySelectorAll('pre code').forEach((block) => {
                                                      hljs.highlightElement(block);
                                                  });
                                              }
                                              
                                              // Add copy buttons to code blocks
                                              addCopyButtonsToCodeBlocks(newBotTextDiv);
                                              
                                              // Auto scroll removed to allow free scrolling during streaming
                                          } else if (data.done) {
                                              // Finalize full rendering
                                              finalizeBotMessage(newBotTextDiv, botResponse);
                                              break;
                                          }
                                      } catch (e) {
                                          continue;
                                      }
                                  }
                              }
                          }

                          // If we forced web search, reset the toggle now
                          if (window.completeWebSearch && (window.shouldForceWebSearch ? window.shouldForceWebSearch() : false)) {
                              window.completeWebSearch();
                          }
                          
                          // Save the complete message to chat
                          if (currentChatId && chatTreeView && botResponse) {
                              await saveMessageToChat(botResponse, 'bot');
                          }
                          
                      } catch (error) {
                          console.error('Edit streaming error:', error);
                          
                          // Check if it was aborted by user
                          if (error.name === 'AbortError') {
                              // Keep the partial response that was generated
                              if (botResponse) {
                                  // Save partial response if we have any
                                  if (currentChatId && chatTreeView) {
                                      await saveMessageToChat(botResponse, 'bot');
                                  }
                              } else {
                                  newBotTextDiv.innerHTML = '<span style="color: #666; font-style: italic;">Edit processing stopped by user.</span>';
                              }
                          } else {
                              newBotTextDiv.innerHTML = 'Error retrieving response.';
                          }
                      } finally {
                          // Reset generation state
                          isGenerating = false;
                          updateSendButtonState(false);
                          currentAbortController = null;
                      }
                  }
              }
          }
      }
      
      // Function to save messages to the chat node
      async function saveMessageToChat(text, sender, sources = [], extras = null) {
          try {
              let preview = '';
              try { preview = (text || '').substring(0, 50) + '...'; } catch {}
              console.log('Saving message to chat:', currentChatId, sender, preview);
              
              if (!currentChatId) {
                  console.warn('No current chat ID, cannot save message');
                  return false;
              }
              
              // Try to find the chat node in the tree view
              let chatNode = null;
              if (chatTreeView && typeof chatTreeView.findNodeById === 'function') {
                  chatNode = chatTreeView.findNodeById(chatTreeView.nodes, currentChatId);
              }
              
              // If we don't have the chat node, create it or get the data from backend
              if (!chatNode) {
                  console.log('Chat node not found in tree view, creating it...');
                  chatNode = {
                      id: currentChatId,
                      name: 'Quick Chat',
                      type: 'chat',
                      content: { messages: [] }
                  };
                  
                  if (chatTreeView && typeof chatTreeView.addNode === 'function') {
                      chatTreeView.addNode(chatNode);
                  }
              }
              
              // Initialize messages array if it doesn't exist
              if (!chatNode.content) {
                  chatNode.content = { messages: [] };
              } else if (!chatNode.content.messages) {
                  chatNode.content.messages = [];
              }
              
              // Add the new message
              const newMessage = {
                  text: text,
                  sender: sender,
                  timestamp: new Date().toISOString()
              };
              if (Array.isArray(sources) && sources.length > 0) {
                  newMessage.sources = sources;
              }
              if (extras && (extras.displayLabel || extras.selectionRef)) {
                  if (extras.displayLabel) newMessage.displayLabel = extras.displayLabel;
                  if (extras.selectionRef) newMessage.selectionRef = extras.selectionRef;
              }
              
              
              chatNode.content.messages.push(newMessage);
              console.log('Message added to chat node, total messages:', chatNode.content.messages.length);
              
              // Save the messages to backend
              const success = await saveChatMessages(currentChatId, chatNode.content.messages);
              
              if (success) {
                  console.log('Message saved successfully to backend');
                  // Refresh the chat tree to show updated order with a small delay
                  // to ensure database triggers have completed
                  setTimeout(async () => {
                      if (window.loadChatTree && typeof window.loadChatTree === 'function') {
                          try {
                              console.log('Refreshing chat tree after message save...');
                              await window.loadChatTree();
                              console.log('Chat tree refreshed successfully');
                          } catch (error) {
                              console.error('Error refreshing chat tree:', error);
                          }
                      } else {
                          console.warn('loadChatTree function not available');
                      }
                  }, 100); // Small delay to ensure database update is complete
              } else {
                  console.error('Failed to save message to backend');
              }
              
              return success;
          } catch (error) {
              console.error('Error saving message to chat:', error);
              return false;
          }
      }
      
      // Helper function to save chat messages to backend
      async function saveChatMessages(chatId, messages) {
          try {
              console.log('Saving chat messages to backend:', chatId, messages.length, 'messages');
              
              const response = await fetch('/api/chats', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      id: chatId,
                      messages: messages
                  })
              });
              
              const data = await response.json();
              console.log('Save chat messages response:', data);
              
              if (!response.ok) {
                  console.error('Failed to save chat messages:', response.status, data);
                  return false;
              }
              
              if (data.status === 'success') {
                  console.log('Chat messages saved successfully');
                  return true;
              } else {
                  console.error('Backend reported error saving chat messages:', data);
                  return false;
              }
          } catch (error) {
              console.error('Error saving chat messages:', error);
              return false;
          }
      }
      
      // Helper function to save chat tree to backend
      function saveTreeToBackend() {
          fetch('/api/chats', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(chatTreeView.nodes)
          })
          .then(response => {
              if (!response.ok) {
                  throw new Error('Failed to save chat tree');
              }
              return response.json();
          })
          .then(data => console.log('Chat tree saved:', data))
          .catch(error => console.error('Error saving chat tree:', error));
      }

      // Function to update send button state
      function updateSendButtonState(generating = false) {
          const chatSendBtn = document.getElementById('chatSendBtn');
          const chatSendIcon = chatSendBtn.querySelector('i');
          const chatCancelBtn = document.getElementById('chatCancelBtn');
          
          if (generating) {
              // Hide Send, show Stop (replacement behavior)
              chatSendBtn.classList.add('generating');
              chatSendBtn.setAttribute('disabled', 'disabled');
              chatSendBtn.title = 'Generating…';
              chatSendBtn.style.display = 'none';
              // Keep plane icon state; it will be restored when shown again
              chatSendIcon.className = 'fas fa-paper-plane';
              if (chatCancelBtn) {
                  chatCancelBtn.style.display = 'inline-block';
                  chatCancelBtn.removeAttribute('disabled');
                  chatCancelBtn.title = 'Stop generating';
                  // Move focus to Stop for accessibility
                  try { chatCancelBtn.focus(); } catch (_) {}
              }
          } else {
              // Show Send, hide Stop
              chatSendBtn.classList.remove('generating');
              chatSendBtn.removeAttribute('disabled');
              chatSendBtn.title = 'Send message';
              chatSendIcon.className = 'fas fa-paper-plane';
              chatSendBtn.style.display = 'inline-block';
              if (chatCancelBtn) {
                  chatCancelBtn.style.display = 'none';
                  chatCancelBtn.setAttribute('disabled', 'disabled');
                  chatCancelBtn.title = 'Stop generating';
              }
          }
          
          // Also update regenerate buttons
          updateRegenerateButtons(generating);
      }

      // Function to update regenerate button states
      function updateRegenerateButtons(disabled = false) {
          const regenerateBtns = document.querySelectorAll('.regenerate-btn');
          regenerateBtns.forEach(btn => {
              btn.disabled = disabled;
              btn.style.opacity = disabled ? '0.5' : '1';
              btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
          });
      }

      // Function to add agent selector to the plus menu
      function addAgentSelectorToPlusMenu() {
          const plusMenuContent = document.querySelector('.chat-plus-menu .chat-plus-menu-content');
          
          if (!plusMenuContent || document.getElementById('agentSelectorBtn')) {
              return; // Already added or container not found
          }

          // Create agent selector button
          const agentBtn = document.createElement('button');
          agentBtn.id = 'agentSelectorBtn';
          agentBtn.className = 'input-btn agent-selector-btn chat-plus-menu-btn';
          agentBtn.innerHTML = '<i class="fas fa-robot"></i><span class="btn-text">Select Agent</span>';
          agentBtn.title = 'Select an agent to use in chat';
          agentBtn.onclick = (e) => {
              e.stopPropagation();
              showAgentSelector(agentBtn);
          };
          
          // Add to plus menu content
          plusMenuContent.appendChild(agentBtn);
      }

      // In-memory icon overrides for unsaved agent edits
      window.agentIconOverrides = window.agentIconOverrides || {};

      // Function to show agent selector submenu
      async function showAgentSelector(anchorEl) {
          try {
              // Load available agents
              const response = await fetch('/api/agents');
              if (!response.ok) {
                  throw new Error('Failed to load agents');
              }
              
              const data = await response.json();
              const agents = data.agents || [];
              
              // Initialize modalManager if needed
              if (!window.modalManager) {
                  window.modalManager = new ModalManager();
              }
              
              // Create a modified version of the notes submenu for agents
              showAgentSubmenu(anchorEl, agents, (selectedAgent) => {
                  if (selectedAgent) {
                      selectAgent(selectedAgent);
                  }
              });
              
          } catch (error) {
              console.error('Error loading agents:', error);
              
              // Show error toast
              if (window.modalManager) {
                  window.modalManager.showToast({
                      message: 'Failed to load agents. Please try again.',
                      type: 'error',
                      duration: 3000
                  });
              }
          }
      }

      // Function to show agent submenu (similar to note submenu)
      function showAgentSubmenu(anchorEl, agents, onSelect) {
          // Create submenu container
          const submenu = document.createElement('div');
          submenu.className = 'agent-submenu note-submenu'; // Reuse note-submenu styles
          submenu.innerHTML = `
            <div class="note-search-container">
                <input type="text" class="note-search-input" placeholder="Search agents...">
            </div>
            <div class="notes-list-container">
                <ul class="notes-list">
                    ${agents.map(agent => {
                        const icon = (window.agentIconOverrides && window.agentIconOverrides[agent.name]) || agent.icon;
                        const iconHtml = icon ? `<span class=\"agent-emoji\">${icon}</span>` : '<i class=\"fas fa-robot\"></i>';
                        return `<li class=\"note-item agent-item\" data-agent-name=\"${agent.name}\">${iconHtml}<span title=\"${agent.description || agent.name}\">${agent.name}</span></li>`;
                    }).join('')}
                </ul>
                ${agents.length === 0 ? 
                    '<div class="no-notes-message">No agents available</div>' : ''}
            </div>
        `;
          
          // Add submenu to the document with absolute positioning but invisible
          // to calculate its dimensions
          submenu.style.position = 'fixed';
          submenu.style.visibility = 'hidden';
          document.body.appendChild(submenu);
          
          // Get dimensions for smart positioning
          const rect = anchorEl.getBoundingClientRect();
          const submenuHeight = submenu.offsetHeight;
          const submenuWidth = submenu.offsetWidth;
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          
          // Smart positioning - for chatPlusMenu buttons, we need to position above
          let topPos, leftPos;
          
          // Vertical positioning - position above the button since chatPlusMenu is at bottom
          const spaceAboveAnchor = rect.top;
          const spaceBelowAnchor = viewportHeight - rect.bottom;
          
          if (spaceAboveAnchor >= submenuHeight) {
              // Enough space above - position above the button
              topPos = rect.top - submenuHeight - 5;
          } else if (spaceBelowAnchor >= submenuHeight) {
              // Not enough space above but enough below - position below
              topPos = rect.bottom + 5;
          } else {
              // Not enough space in either direction - position where it fits best
              topPos = spaceAboveAnchor > spaceBelowAnchor ? 
                  Math.max(5, rect.top - submenuHeight) : 
                  Math.min(rect.bottom, viewportHeight - submenuHeight - 5);
          }
          
          // Horizontal positioning - align with the button but ensure it doesn't go offscreen
          leftPos = Math.max(5, Math.min(rect.left, viewportWidth - submenuWidth - 5));
          
          // Apply the calculated position
          submenu.style.top = `${topPos}px`;
          submenu.style.left = `${leftPos}px`;
          submenu.style.zIndex = '1300'; // Higher than chatPlusMenu (1200)
          submenu.style.visibility = 'visible';
          
          // Focus the search input
          const searchInput = submenu.querySelector('.note-search-input');
          setTimeout(() => searchInput.focus(), 10);
          
          // Handle agent search
          searchInput.addEventListener('input', () => {
              const searchTerm = searchInput.value.toLowerCase();
              const agentItems = submenu.querySelectorAll('.agent-item');
              
              agentItems.forEach(item => {
                  const agentName = item.querySelector('span').textContent.toLowerCase();
                  if (agentName.includes(searchTerm)) {
                      item.style.display = 'flex';
                  } else {
                      item.style.display = 'none';
                  }
              });
          });
          
          // Handle agent selection
          const agentsList = submenu.querySelector('.notes-list');
          agentsList.addEventListener('click', (e) => {
              const agentItem = e.target.closest('.agent-item');
              if (!agentItem) return;
              
              const selectedAgentName = agentItem.dataset.agentName;
              const selectedAgent = agents.find(a => a.name === selectedAgentName);
              closeSubmenu();
              if (onSelect) onSelect(selectedAgent);
          });
          
          // Handle keyboard navigation and selection
          searchInput.addEventListener('keydown', (e) => {
              const agentItems = Array.from(submenu.querySelectorAll('.agent-item')).filter(
                  item => item.style.display !== 'none'
              );
              
              // Get currently selected item
              const selectedItem = submenu.querySelector('.agent-item.selected');
              let selectedIndex = selectedItem ? agentItems.indexOf(selectedItem) : -1;
              
              switch (e.key) {
                  case 'ArrowDown':
                      e.preventDefault();
                      if (selectedIndex < agentItems.length - 1) {
                          if (selectedItem) selectedItem.classList.remove('selected');
                          agentItems[selectedIndex + 1].classList.add('selected');
                          agentItems[selectedIndex + 1].scrollIntoView({ block: 'nearest' });
                      }
                      break;
                      
                  case 'ArrowUp':
                      e.preventDefault();
                      if (selectedIndex > 0) {
                          if (selectedItem) selectedItem.classList.remove('selected');
                          agentItems[selectedIndex - 1].classList.add('selected');
                          agentItems[selectedIndex - 1].scrollIntoView({ block: 'nearest' });
                      }
                      break;
                      
                  case 'Enter':
                      e.preventDefault();
                      if (selectedItem) {
                          const selectedAgentName = selectedItem.dataset.agentName;
                          const selectedAgent = agents.find(a => a.name === selectedAgentName);
                          closeSubmenu();
                          if (onSelect) onSelect(selectedAgent);
                      } else if (agentItems.length > 0) {
                          // Select the first visible item if none selected
                          const selectedAgentName = agentItems[0].dataset.agentName;
                          const selectedAgent = agents.find(a => a.name === selectedAgentName);
                          closeSubmenu();
                          if (onSelect) onSelect(selectedAgent);
                      }
                      break;
                      
                  case 'Escape':
                      e.preventDefault();
                      closeSubmenu();
                      break;
              }
          });
          
          // Close when clicking outside
          function handleClickOutside(e) {
              if (!submenu.contains(e.target) && e.target !== anchorEl) {
                  closeSubmenu();
              }
          }
          
          // Function to close the submenu
          function closeSubmenu() {
              document.removeEventListener('mousedown', handleClickOutside);
              submenu.remove();
          }
          
          // Add click outside event listener
          document.addEventListener('mousedown', handleClickOutside);
          
          // Return the submenu element in case more manipulation is needed
          return submenu;
      }

      // Current selected agent
      let selectedAgent = null;

      // Function to select an agent
      function selectAgent(agent) {
          selectedAgent = agent;
          
          // Update the button text to show selected agent
          const agentBtn = document.getElementById('agentSelectorBtn');
          if (agentBtn) {
              const icon = (window.agentIconOverrides && window.agentIconOverrides[agent.name]) || agent.icon;
              const iconHtml = icon ? `<span class="agent-emoji">${icon}</span>` : '<i class="fas fa-robot"></i>';
              agentBtn.innerHTML = `${iconHtml}<span class="btn-text">${agent.name}</span><i class="fas fa-times clear-agent" title="Clear agent selection"></i>`;
              agentBtn.title = `Selected agent: ${agent.name}${agent.description ? ' - ' + agent.description : ''}`;
              agentBtn.classList.add('selected');
              
              // Add clear functionality
              const clearIcon = agentBtn.querySelector('.clear-agent');
              if (clearIcon) {
                  clearIcon.addEventListener('click', (e) => {
                      e.stopPropagation();
                      clearSelectedAgent();
                  });
              }
          }
          
          // Close the plus menu
          const chatPlusMenu = document.getElementById('chatPlusMenu');
          if (chatPlusMenu) {
              chatPlusMenu.classList.remove('open');
          }
          
          // Show success notification
          if (window.modalManager) {
              window.modalManager.showToast({
                  message: `Agent "${agent.name}" selected`,
                  type: 'success',
                  duration: 2000
              });
          }
          
          console.log('Selected agent:', agent);
      }

      // Function to clear the selected agent
      function clearSelectedAgent() {
          selectedAgent = null;
          
          // Reset the button to default state
          const agentBtn = document.getElementById('agentSelectorBtn');
          if (agentBtn) {
              agentBtn.innerHTML = '<i class="fas fa-robot"></i><span class="btn-text">Select Agent</span>';
              agentBtn.title = 'Select an agent to use in chat';
              agentBtn.classList.remove('selected');
          }
          
          // Show notification
          if (window.modalManager) {
              window.modalManager.showToast({
                  message: 'Agent selection cleared',
                  type: 'info',
                  duration: 2000
              });
          }
          
          console.log('Agent selection cleared');
      }

      // Function to get the currently selected agent
      function getSelectedAgent() {
          return selectedAgent;
      }

      // Expose the selected agent function globally (proxy to modular state when available)
      try {
          if (!window.getSelectedAgent) {
              window.getSelectedAgent = function() {
                  if (window.ChatModules && window.ChatModules.state && window.ChatModules.state.getSelectedAgentLocal) {
                      return window.ChatModules.state.getSelectedAgentLocal();
                  }
                  return getSelectedAgent();
              };
          }
      } catch {}

      // Live-update agent icon in chat UI when edited in Agents tab
      document.addEventListener('agent:icon-updated', (e) => {
          try {
              const detail = e.detail || {};
              if (!detail.name) return;
              window.agentIconOverrides[detail.name] = detail.icon;
              const agentBtn = document.getElementById('agentSelectorBtn');
              if (agentBtn && selectedAgent && selectedAgent.name === detail.name) {
                  const iconHtml = detail.icon ? `<span class="agent-emoji">${detail.icon}</span>` : '<i class="fas fa-robot"></i>';
                  agentBtn.innerHTML = `${iconHtml}<span class="btn-text">${selectedAgent.name}</span><i class="fas fa-times clear-agent" title="Clear agent selection"></i>`;
              }
          } catch {}
      });

      // Send message on button click or Enter key (delegated to modular controller)
      async function sendMessage() {
          // Prevent multiple concurrent send requests
          if (isGenerating) {
              console.log('Already generating, ignoring send request');
              return;
          }
          
          const txtRaw = (chatInput && chatInput.value) || '';
          let prompt = txtRaw.trim();
          const expanded = chatInput.dataset && chatInput.dataset.expandedPrompt;
          const displayLabel = chatInput.dataset && chatInput.dataset.displayLabel;
          let selectionRefJson = chatInput.dataset && chatInput.dataset.selectionRef;
          const displayText = (displayLabel || prompt).trim();
          if (!displayText) return;
          if (expanded) prompt = expanded;

          // Guided-selection interception: let document actions handle and return early
          if ((window.documentHighlightingEnabled || window.guidedExpansionEnabled) && window.documentActionsManager) {
              try {
                  await appendMessage(displayText, 'user', true);
                  isGenerating = true; updateSendButtonState(true);
                  const processed = window.documentActionsManager.processHighlightRequest(prompt);
                  if (processed) { chatInput.value = ''; updateInputState(); return; }
              } catch { isGenerating = false; updateSendButtonState(false); }
          }

          // Enrich selectionRef if needed
          if (!selectionRefJson && window.guidedSelectionActive && window.documentActionsManager && window.documentActionsManager.currentHighlightRef) {
              try {
                  await window.documentActionsManager.computeAndCacheDocHash();
                  const docId = window.documentActionsManager.getDocId();
                  const docHash = window.documentActionsManager.getCachedDocHash(window.currentChatId || 'default', (window.documentActionsManager.currentDocument && window.documentActionsManager.currentDocument.filename) || 'unknown');
                  const meta = { ...window.documentActionsManager.currentHighlightRef, docId, docHash };
                  selectionRefJson = JSON.stringify(meta);
                  if (chatInput && chatInput.dataset) chatInput.dataset.selectionRef = selectionRefJson;
              } catch {}
          }
          const extras = {};
          if (displayLabel) extras.displayLabel = displayLabel;
          if (selectionRefJson) { try { extras.selectionRef = JSON.parse(selectionRefJson); } catch {} }

          // Remove welcome message if it exists (when sending first message to default chat)
          try {
              const welcomeMsg = chatMessages.querySelector('.chat-message.bot.is-muted');
              if (welcomeMsg) {
                  welcomeMsg.remove();
                  console.log('Removed welcome message from UI');
              }
          } catch (_) {}

          // Clear input datasets before delegating
          if (chatInput.dataset) { delete chatInput.dataset.expandedPrompt; delete chatInput.dataset.displayLabel; delete chatInput.dataset.selectionRef; }
          chatInput.value = ''; updateInputState();

          // Delegate to modular controller
          const forceWebSearch = window.shouldForceWebSearch ? window.shouldForceWebSearch() : false;
          if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.controller) {
              return window.ChatModules.controller.sendMessage(prompt, { forceSearch: forceWebSearch, extras });
          }
          // Fallback (should rarely happen): append and use old path
          return window.appendMessage ? window.appendMessage(displayText, 'user', true, null, extras) : null;
      }

      // Expose a programmatic send hook to ensure consistent behavior from other modules
      document.addEventListener('chat:send', (ev) => {
          if (isGenerating) return;
          try {
              if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.controller) {
                  const detail = (ev && ev.detail) || {};
                  const txt = (detail && detail.message) || (chatInput && chatInput.value) || '';
                  if (!txt.trim()) return;
                  return window.ChatModules.controller.sendMessage(txt, { forceSearch: (window.shouldForceWebSearch ? window.shouldForceWebSearch() : false) });
              }
          } catch (e) {}
          sendMessage();
      });

      // Reset generation state when document highlighting completes
      window.addEventListener('highlight:done', () => {
          isGenerating = false;
          updateSendButtonState(false);
      try { window.dispatchEvent(new CustomEvent('chat:abort')); } catch {}
      });

      // Sync legacy UI with modular controller generation events
      window.addEventListener('chat:generation-state', (ev) => {
          try {
              const gen = !!(ev && ev.detail && ev.detail.generating);
              isGenerating = gen;
              updateSendButtonState(gen);
          } catch (_) {}
      });
      window.addEventListener('chat:send-started', () => {
          try {
              isGenerating = true;
              updateSendButtonState(true);
          } catch (_) {}
      });
      window.addEventListener('chat:aborted', () => {
          try {
              isGenerating = false;
              updateSendButtonState(false);
          } catch (_) {}
      });

      // Function to create a default chat when none exists
      async function createDefaultChat(chatId, chatName) {
          try {
              console.log('Creating default chat:', chatId, chatName);
              const controller = (window.ChatModules && window.ChatModules.controller) ? window.ChatModules.controller : null;
              
              // First check if this chat already exists in the tree
              if (chatTreeView && typeof chatTreeView.findNodeById === 'function') {
                  const existingNode = chatTreeView.findNodeById(chatTreeView.nodes, chatId);
                  if (existingNode) {
                      console.log('Chat already exists in tree, not creating duplicate');
                      return true;
                  }
              }
              
              const response = await fetch('/api/nodes', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      id: chatId,
                      name: chatName,
                      type: 'chat'
                  })
              });
              
              const responseData = await response.json();
              console.log('Create node response:', responseData);
              
              if (response.ok && responseData.status === 'success') {
                  // Show success notification
                  if (window.modalManager && window.modalManager.showToast) {
                      window.modalManager.showToast({
                          message: 'Chat created successfully',
                          type: 'success',
                          duration: 2000
                      });
                  }
                  
                  // Add the chat to the tree view if it exists
                  if (chatTreeView && typeof chatTreeView.addNode === 'function') {
                      const newNode = {
                          id: chatId,
                          name: chatName,
                          type: 'chat',
                          content: { messages: [] },
                          children: []
                      };
                      
                      console.log('Adding node to tree view:', newNode);
                      chatTreeView.addNode(newNode);
                  } else {
                      console.warn('chatTreeView not available or addNode method missing');
                  }
                  
                  // Create an initial empty chat record
                  const chatResponse = await fetch('/api/chats', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          id: chatId,
                          messages: []
                      })
                  });
                  
                  const chatData = await chatResponse.json();
                  console.log('Create chat response:', chatData);
                  
                  if (controller && typeof controller.clearCachedMessages === 'function') {
                      controller.clearCachedMessages(chatId);
                  }
                  if (controller && typeof controller.syncMessageCache === 'function') {
                      controller.syncMessageCache(chatId, []);
                  }
                  return true;
              } else {
                  console.error('Failed to create node:', responseData);
                  // Show error notification
                  if (window.modalManager && window.modalManager.showToast) {
                      window.modalManager.showToast({
                          message: 'Failed to create chat',
                          type: 'error',
                          duration: 3000
                      });
                  }
                  return false;
              }
          } catch (error) {
              console.error('Error creating default chat:', error);
              // Show error notification
              if (window.modalManager && window.modalManager.showToast) {
                  window.modalManager.showToast({
                      message: 'Error creating chat',
                      type: 'error',
                      duration: 3000
                  });
              }
              return false;
          }
      }

      // Expose createDefaultChat globally for RAG manager
      window.createDefaultChat = createDefaultChat;

      function __chatFlaggedSendHandler() {
          // Prevent multiple requests if already generating
          if (isGenerating) {
              console.log('Already generating, ignoring send request');
              return;
          }
          try {
              if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.controller) {
                  const txt = (chatInput && chatInput.value) ? chatInput.value : '';
                  if (!txt.trim()) return;
                  return window.ChatModules.controller.sendMessage(txt, { forceSearch: (window.shouldForceWebSearch ? window.shouldForceWebSearch() : false) });
              }
          } catch (e) {}
          return sendMessage();
      }
      chatSendBtn.addEventListener('click', __chatFlaggedSendHandler);
      chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              __chatFlaggedSendHandler();
          }
      });
      
      // Auto-resize textarea function
      function autoResizeTextarea() {
          // Reset height to auto to get the correct scrollHeight
          chatInput.style.height = 'auto';
          // Set height based on scrollHeight, with min and max constraints
          const minHeight = 24; // minimum height
          const maxHeight = 120; // maximum height from CSS
          const newHeight = Math.min(Math.max(chatInput.scrollHeight, minHeight), maxHeight);
          chatInput.style.height = newHeight + 'px';
          adjustChatLayoutPadding();
      }
      
      // Add input state management for better UX
      function updateInputState() {
          const chatInputWrapper = document.querySelector('.chat-input-wrapper');
          if (chatInputWrapper) {
              if (chatInput.value.trim()) {
                  chatInputWrapper.classList.add('has-text');
              } else {
                  chatInputWrapper.classList.remove('has-text');
              }
          }
          // Auto-resize on input change
          autoResizeTextarea();
      }
      
      // Expose updateInputState for use by controller
      window.updateInputState = updateInputState;
      
      // Listen for input changes
      chatInput.addEventListener('input', updateInputState);
      chatInput.addEventListener('keyup', updateInputState);
      chatInput.addEventListener('paste', () => setTimeout(updateInputState, 10));
      
      // Initial state check
      updateInputState();
      
      // Global function to reset chat state
      window.resetChatState = function() {
          console.log('Resetting chat state');
          window.currentChatId = null;
          window.creatingDefaultChat = false;
          
          // Clear messages area
          if (chatMessages) {
              chatMessages.innerHTML = '';
          }
          
          // Show welcome message if in chat tab
          if (chatSection && !chatSection.classList.contains('is-hidden')) {
              if (chatMessages && chatMessages.children.length === 0) {
                  chatMessages.innerHTML = `
                    <div class="chat-message bot is-muted">
                        <div class="chat-icon">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="chat-text">
                            👋 Welcome! You can start chatting right away - just type your message below and I'll respond!
                        </div>
                    </div>
                `;
              }
          }
      };
      
      // Function to load chat history when a chat is selected (modified to apply highlighting)
      window.loadChatMessages = async function(chatId) {
          if (!chatId) {
              console.warn('loadChatMessages called with no chatId');
              return;
          }
          
          console.log('Loading chat messages for:', chatId);
          console.log('Current chat ID was:', currentChatId);
          
          const controller = (window.ChatModules && window.ChatModules.controller) ? window.ChatModules.controller : null;
          try {
              if (controller && typeof controller.clearCachedMessages === 'function') {
                  controller.clearCachedMessages(chatId);
              }
              if (controller && typeof controller.syncMessageCache === 'function') {
                  controller.syncMessageCache(chatId, []);
              }
          } catch (_) {}
          
          // Set the current chat ID first
          window.currentChatId = chatId;
          
          // Notify RAG manager about chat change
          if (window.ragManager && typeof window.ragManager.onChatChange === 'function') {
              // Don't await to avoid blocking the UI, but handle potential errors
              window.ragManager.onChatChange().catch(error => {
                  console.warn('Error in RAG manager chat change:', error);
              });
          }
          
          // Clear any chat creation flags
          window.creatingDefaultChat = false;
          
          let chatNode = null;
          if (chatTreeView && typeof chatTreeView.findNodeById === 'function') {
              chatNode = chatTreeView.findNodeById(chatTreeView.nodes, chatId);
              console.log('Found chat node in tree:', chatNode);
          }
          
          // Update the tab title and content ID if we're using the tab system
          if (window.tabManager && window.tabManager.activeTabId) {
              window.tabManager.setActiveTabContent(chatId, chatNode ? chatNode.name : 'Chat');
          }
          
          // Clear the chat messages (including welcome message)
          chatMessages.innerHTML = '';
          
          // Always fetch latest messages from backend for freshness
          try {
              console.log('Fetching latest messages from backend...');
              const response = await fetch(`/api/chats/${chatId}`);
              if (response.ok) {
                  const chatData = await response.json();
                  console.log('Backend response:', chatData);
                  if (chatData.content && chatData.content.messages) {
                      console.log('Loaded messages from backend:', chatData.content.messages.length);
                      if (controller && typeof controller.syncMessageCache === 'function') {
                          controller.syncMessageCache(chatId, chatData.content.messages);
                      }
                      for (const [index, message] of chatData.content.messages.entries()) {
                          const extras = {};
                          if (message.displayLabel) extras.displayLabel = message.displayLabel;
                          if (message.selectionRef) extras.selectionRef = message.selectionRef;
                          const msgEl = await appendMessage(message.text, message.sender, false, index, extras);
                          if (message.sender === 'bot' && Array.isArray(message.sources) && message.sources.length && window.sourceDisplayManager) {
                              window.sourceDisplayManager.applyStructuredSources(msgEl, message.sources, message.text);
                          }
                      }
                  } else {
                      console.log('No messages in backend response');
                      if (controller && typeof controller.syncMessageCache === 'function') {
                          controller.syncMessageCache(chatId, []);
                      }
                  }
              } else {
                  console.log('Backend request failed:', response.status);
                  // Fallback to tree node content if available
                  if (chatNode && chatNode.content && chatNode.content.messages) {
                      console.log('Falling back to tree node messages:', chatNode.content.messages.length);
                      if (controller && typeof controller.syncMessageCache === 'function') {
                          controller.syncMessageCache(chatId, chatNode.content.messages);
                      }
                      for (const [index, message] of chatNode.content.messages.entries()) {
                          const extras = {};
                          if (message.displayLabel) extras.displayLabel = message.displayLabel;
                          if (message.selectionRef) extras.selectionRef = message.selectionRef;
                          const msgEl = await appendMessage(message.text, message.sender, false, index, extras);
                          if (message.sender === 'bot' && Array.isArray(message.sources) && message.sources.length && window.sourceDisplayManager) {
                              window.sourceDisplayManager.applyStructuredSources(msgEl, message.sources, message.text);
                          }
                      }
                  }
              }
          } catch (error) {
              console.error('Error loading chat from backend:', error);
              // Fallback to tree node content if available
              if (chatNode && chatNode.content && chatNode.content.messages) {
                  console.log('Falling back to tree node messages:', chatNode.content.messages.length);
                  if (controller && typeof controller.syncMessageCache === 'function') {
                      controller.syncMessageCache(chatId, chatNode.content.messages);
                  }
                  for (const [index, message] of chatNode.content.messages.entries()) {
                      const extras = {};
                      if (message.displayLabel) extras.displayLabel = message.displayLabel;
                      if (message.selectionRef) extras.selectionRef = message.selectionRef;
                      const msgEl = await appendMessage(message.text, message.sender, false, index, extras);
                      if (message.sender === 'bot' && Array.isArray(message.sources) && message.sources.length && window.sourceDisplayManager) {
                          window.sourceDisplayManager.applyStructuredSources(msgEl, message.sources, message.text);
                      }
                  }
              }
          }
          
          // Focus the chat input
          setTimeout(() => {
              if (chatInput) {
                  chatInput.focus();
              }
              // Recompute input height and scroll to bottom on mobile
              chatInput.style.height = 'auto';
              const minHeight = 24;
              const maxHeight = 120;
              const newHeight = Math.min(Math.max(chatInput.scrollHeight, minHeight), maxHeight);
              chatInput.style.height = newHeight + 'px';
              adjustChatLayoutPadding();
          }, 150);
          // Ensure we end scrolled to the latest message after rendering
          setTimeout(() => {
              if (chatMessages) {
                  chatMessages.scrollTop = chatMessages.scrollHeight;
              }
              adjustChatLayoutPadding();
          }, 200);
          
          console.log('Chat loaded successfully, currentChatId is now:', currentChatId);
      };

      // Model Selector Functionality
      let availableModels = [];
      let selectedModel = null; // Will be set from backend defaults

      const modelSelectorBtn = document.getElementById('modelSelectorBtn');
      const modelDropdown = document.getElementById('modelDropdown');
      const modelList = document.getElementById('modelList');
      const selectedModelName = document.getElementById('selectedModelName');

      // Ensure the selector shows a default immediately using backend defaults
      async function initDefaultModelIfNeeded() {
          try {
              const currentText = selectedModelName ? selectedModelName.textContent : '';
              if (selectedModel || !selectedModelName || (currentText && currentText !== 'Loading...')) {
                  return; // Already initialized
              }
              const resp = await fetch('/api/config/defaults');
              if (resp.ok) {
                  const cfg = await resp.json();
                  selectedModel = cfg.default_model || 'llama3.2:1b';
                  selectedModelName.textContent = selectedModel;
              } else {
                  // Fall back to a safe default if API not available
                  selectedModel = 'llama3.2:1b';
                  selectedModelName.textContent = selectedModel;
              }
          } catch (_) {
              // Silent fallback to safe default
              if (!selectedModel) {
                  selectedModel = 'llama3.2:1b';
              }
              if (selectedModelName) {
                  selectedModelName.textContent = selectedModel;
              }
          }
      }

      // Load available models on initialization
      async function loadAvailableModels() {
          console.log('Loading available models...');
          try {
              // Load models and default configuration in parallel
              const [modelsResponse, configResponse] = await Promise.all([
                  fetch('/api/ollama/models'),
                  fetch('/api/config/defaults')
              ]);
              
              console.log('Models API response status:', modelsResponse.status);
              console.log('Config API response status:', configResponse.status);
              
              if (modelsResponse.ok) {
                  const modelsData = await modelsResponse.json();
                  console.log('Models data received:', modelsData);
                  availableModels = modelsData.models || [];
              } else {
                  console.error('Models API error:', modelsResponse.statusText);
                  throw new Error('Failed to fetch models');
              }

              // Set default model from configuration
              if (configResponse.ok && !selectedModel) {
                  const configData = await configResponse.json();
                  console.log('Config data received:', configData);
                  selectedModel = configData.default_model || 'llama3.2:1b';
                  if (selectedModelName) {
                      selectedModelName.textContent = selectedModel;
                  }
              }

              renderModelList();
          } catch (error) {
              console.error('Error loading models:', error);
              if (modelList) {
                  modelList.innerHTML = '<div class="model-error">Error loading models. Check if Ollama is running.</div>';
              }
              // Fallback to hardcoded default if all else fails
              if (!selectedModel) {
                  selectedModel = 'llama3.2:1b';
                  if (selectedModelName) {
                      selectedModelName.textContent = selectedModel;
                  }
              }
          }
      }

      // Render the model list in the dropdown
      function renderModelList() {
          if (!modelList) {
              console.error('Model list element not found');
              return;
          }

          if (availableModels.length === 0) {
              modelList.innerHTML = '<div class="model-error">No models available</div>';
              return;
          }

          console.log('Rendering model list with', availableModels.length, 'models');

          modelList.innerHTML = availableModels.map(model => {
              const isSelected = model.name === selectedModel;
              const sizeText = model.size ? formatBytes(model.size) : '';
              
              return `
                <div class="model-item ${isSelected ? 'selected' : ''}" data-model="${model.name}">
                    <div class="model-name">${model.name}</div>
                    <div class="model-info">
                        ${sizeText}
                    </div>
                </div>
            `;
          }).join('');

          // Add click handlers to model items
          modelList.querySelectorAll('.model-item').forEach(item => {
              item.addEventListener('click', () => {
                  const modelName = item.dataset.model;
                  selectModel(modelName);
                  hideDropdown();
              });
          });
      }

      // Select a model
      function selectModel(modelName) {
          selectedModel = modelName;
          selectedModelName.textContent = modelName;
          
          // Update visual selection in dropdown
          modelList.querySelectorAll('.model-item').forEach(item => {
              item.classList.toggle('selected', item.dataset.model === modelName);
          });
          
          console.log('Selected model:', modelName);
      }

      // Show dropdown
      function showDropdown() {
          modelDropdown.classList.add('show');
          modelSelectorBtn.classList.add('open');
      }

      // Hide dropdown
      function hideDropdown() {
          modelDropdown.classList.remove('show');
          modelSelectorBtn.classList.remove('open');
      }

      // Toggle dropdown
      function toggleDropdown() {
          if (modelDropdown.classList.contains('show')) {
              hideDropdown();
          } else {
              showDropdown();
          }
      }

      // Format bytes for display
      function formatBytes(bytes) {
          if (bytes === 0) return '0 B';
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
      }

      // Event listeners
      if (modelSelectorBtn) {
          modelSelectorBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              console.log('Model selector button clicked');
              
              // If models haven't been loaded yet, try to load them
              if (availableModels.length === 0) {
                  console.log('No models loaded, attempting to load now...');
                  loadAvailableModels();
              }
              
              toggleDropdown();
          });
          console.log('Model selector button event listener added');
      } else {
          console.error('Model selector button not found');
      }

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
          if (modelSelectorBtn && modelDropdown && 
              !modelSelectorBtn.contains(e.target) && !modelDropdown.contains(e.target)) {
              hideDropdown();
          }
      });

      // Load models when chat section is shown
      if (chatTabBtn) {
          chatTabBtn.addEventListener('click', () => {
              setTimeout(() => {
                  console.log('Chat tab clicked, loading models...');
                  loadAvailableModels();
              }, 100);
          });
      }

      // Load models initially if chat is already visible or when DOM is ready
      setTimeout(() => {
          console.log('Initial model loading check...');
          console.log('Chat section display:', chatSection ? chatSection.style.display : 'chatSection not found');
          console.log('Model selector button:', modelSelectorBtn ? 'found' : 'not found');
          console.log('Model list element:', modelList ? 'found' : 'not found');
          
          if (chatSection && (chatSection.style.display !== 'none' && 
              getComputedStyle(chatSection).display !== 'none')) {
              console.log('Chat section is visible, loading models...');
              // First, ensure default label is set immediately
              initDefaultModelIfNeeded();
              loadAvailableModels();
          } else {
              console.log('Chat section not visible, will load models when shown');
          }
      }, 500); // Slight delay to ensure DOM ready, but keep snappy

      // Also try to load models when the chat tab is first clicked
      let modelsLoaded = false;
      chatTabBtn ? chatTabBtn.onclick : null;
      
      if (chatTabBtn) {
          chatTabBtn.addEventListener('click', () => {
              setTimeout(() => {
                  console.log('Chat tab clicked, checking if models should be loaded...');
                  if (!modelsLoaded) {
                      console.log('Loading models for the first time...');
                      loadAvailableModels();
                      modelsLoaded = true;
                  } else {
                      console.log('Models already loaded');
                  }
              }, 200);
          });
      }

      // Expose selected model for use in other functions
      window.getSelectedModel = () => selectedModel;
      
      // Debug function - expose loadAvailableModels for manual testing
      window.debugLoadModels = loadAvailableModels;
      
      console.log('Model selector initialization complete');

  // Allow other modules to append and persist bot messages
  document.addEventListener('chat:add-bot-message', async (ev) => {
      try {
          const detail = (ev && ev.detail) || {};
          const text = String(detail.text || '');
          const extras = detail.extras || null;
          const kind = detail.kind || null;
          const key = detail.key || null;

          // Optional dedupe: if a keyed bot message already exists, skip
          if (kind && key) {
              const existing = document.querySelector(`.chat-message.bot[data-kind="${CSS.escape(kind)}"][data-key="${CSS.escape(key)}"]`);
              if (existing) return;
          }

          const el = window.appendMessage ? await window.appendMessage(text, 'bot', true, null, extras) : null;
          if (el && kind && key) {
              try {
                  el.dataset.kind = kind;
                  el.dataset.key = key;
              } catch (_) {}
          }
      } catch (e) { console.warn('chat:add-bot-message failed', e); }
  });

  // Listen for chat changes globally to update file viewer
  document.addEventListener('tabChanged', (ev) => {
      const tabType = ev && ev.detail && ev.detail.tabType;
      if (tabType === 'chat') {
          // Emit chat changed event for file viewer
          document.dispatchEvent(new CustomEvent('chat:changed', {
              detail: { chatId: window.currentChatId }
          }));
          
          // Delay to ensure chat is loaded
          setTimeout(() => {
              const viewerInstance = window.FileViewerRedesigned?.instance;
              if (viewerInstance && typeof viewerInstance.updateToggleButtonState === 'function') {
                  viewerInstance.updateToggleButtonState(viewerInstance.isVisible);
              }
              if (window.fileViewer && window.ragManager) {
                  window.fileViewer.refreshDocumentList();
              }
          }, 500);
      }
  });
  }

  var ui = /*#__PURE__*/Object.freeze({
    __proto__: null,
    init: init
  });

  // Public surface for chat modules with auto-initialization

  window.ChatModules = { api, state: state$1, dom, render, sources: sources$1, events, controller, agentsUI, fileviewer, docActions, voiceChat, webSearch, sourceDisplay, ui };

  // Auto-initialization pattern (similar to other modules)
  (function bootstrap() {
    if (!window.__USE_CHAT_MODULES__) return;
    
    // Initialize fileviewer module when DOM is ready
    function initChatModules() {
      try {
        if (fileviewer && typeof init$6 === 'function') {
          const fileViewerInstance = init$6();
          console.log('[chat] FileViewer initialized successfully:', fileViewerInstance);
        }
        if (ui && typeof init === 'function') {
          init();
          console.log('[chat] UI initialized');
        }
        if (docActions && typeof init$4 === 'function') {
          init$4().then((manager) => {
            console.log('[chat] DocumentActions initialized', manager);
          }).catch((error) => {
            console.error('[chat] Failed to initialize DocumentActions:', error);
          });
        }
        if (voiceChat && typeof init$3 === 'function') {
          init$3().catch((error) => {
            console.error('[chat] Failed to initialize VoiceChat:', error);
          });
        }
        if (webSearch && typeof init$2 === 'function') {
          init$2().catch((error) => {
            console.error('[chat] Failed to initialize WebSearch:', error);
          });
        }
        if (sourceDisplay && typeof init$1 === 'function') {
          init$1().catch((error) => {
            console.error('[chat] Failed to initialize SourceDisplay:', error);
          });
        }
      } catch (error) {
        console.error('[chat] Failed to initialize FileViewer:', error);
      }
    }
    
    // Defer to next tick to ensure DOM is ready if loaded at <head>
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initChatModules);
    } else {
      initChatModules();
    }
  })();

  exports.agentsUI = agentsUI;
  exports.api = api;
  exports.controller = controller;
  exports.docActions = docActions;
  exports.dom = dom;
  exports.events = events;
  exports.fileviewer = fileviewer;
  exports.render = render;
  exports.sourceDisplay = sourceDisplay;
  exports.sources = sources$1;
  exports.state = state$1;
  exports.ui = ui;
  exports.voiceChat = voiceChat;
  exports.webSearch = webSearch;

  return exports;

})({});
//# sourceMappingURL=chat.js.map

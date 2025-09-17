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

  function appendBotPlaceholder() {
    if (typeof window.appendMessage === 'function') {
      return window.appendMessage('', 'bot', false);
    }
  }

  function renderBotStreaming(container, textChunk) {
    if (!container) return;
    try {
      container.innerHTML = renderMarkdownSafe(textChunk);
    } catch {
      container.textContent = textChunk || '';
    }
  }

  function finalizeBotMessage(container, fullText) {
    if (!container) return;
    try { finalizeBotMessage$1(container, fullText); } catch { container.textContent = fullText || ''; }
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

  async function fetchChatHistory(chatId) {
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      if (!res.ok) return [];
      const data = await res.json();
      const msgs = (data && data.content && Array.isArray(data.content.messages)) ? data.content.messages : [];
      return msgs.map(m => ({ role: (m.sender === 'bot' ? 'assistant' : 'user'), content: m.text || '' }));
    } catch (_) { return []; }
  }

  async function saveBotMessage(chatId, text, messageDiv) {
    try {
      // Try to retrieve existing messages, append, and save
      const res = await fetch(`/api/chats/${chatId}`);
      if (!res.ok) return false;
      const data = await res.json();
      const current = (data && data.content && Array.isArray(data.content.messages)) ? data.content.messages : [];
      const msg = { text: text || '', sender: 'bot', timestamp: new Date().toISOString() };
      // Attempt to collect sources stored on the DOM element (standard path)
      try { const ss = readFromElement(messageDiv); if (ss && ss.length) msg.sources = ss; } catch (_) {}
      const updated = [...current, msg];
      return await saveMessages(chatId, updated);
    } catch (_) { return false; }
  }

  async function saveUserMessage(chatId, text, extras) {
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      const data = res.ok ? await res.json() : {};
      const current = (data && data.content && Array.isArray(data.content.messages)) ? data.content.messages : [];
      const msg = { text: text || '', sender: 'user', timestamp: new Date().toISOString() };
      if (extras && (extras.displayLabel || extras.selectionRef)) {
        if (extras.displayLabel) msg.displayLabel = extras.displayLabel;
        if (extras.selectionRef) msg.selectionRef = extras.selectionRef;
      }
      const updated = [...current, msg];
      await saveMessages(chatId, updated);
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
    } catch (_) { return false; }
  }

  async function sendMessage(text, { forceSearch, extras } = {}) {
    const refs = getRefs();
    const msg = String(text || '').trim();
    if (!msg) return;

    const chatId = getChatId() || 'default';
    // Ensure a backing chat record exists before any persistence to avoid FK issues
    try {
      // Prefer frontend helper if available (creates node + empty chat)
      if (typeof window.createDefaultChat === 'function') {
        // If the chat doesn't exist, create it
        const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
        if (!res.ok) {
          await window.createDefaultChat(chatId, 'Quick Chat');
        }
      }
    } catch (_) { /* non-fatal; backend may upsert */ }

    // If no current chat is selected, set it now so other systems (RAG, UI) see it
    try { if (!window.currentChatId) window.currentChatId = chatId; } catch (_) {}

    await appendUserMessage(msg);
    // Persist the user message now via unified API
    try { await saveUserMessage(chatId, msg, extras || null); } catch (_) {}
    const placeholder = await appendBotPlaceholder();
    const container = placeholder ? placeholder.querySelector('.chat-text') : null;

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
        } else if (agentData.status === 'no_results') {
          botResponse = "No matching notes found for this agent's tags and your query. Try different tags or a different query.";
          renderBotStreaming(container, botResponse);
        } else {
          botResponse = agentData.message || 'Error occurred while running the agent.';
          renderBotStreaming(container, botResponse);
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
                emit(EVENTS.STREAM_TOKEN, { chatId, token: data.token });
                refs.messages && (refs.messages.scrollTop = refs.messages.scrollHeight);
              }
              if (data.done) {
                finalizeBotMessage(container, botResponse);
                if (botResponse.trim() && placeholder) {
                  extractAndAttach(placeholder, botResponse);
                  try { const ss = readFromElement(placeholder); if (ss && ss.length) emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: ss }); } catch(_){ }
                }
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
                if (placeholder) {
                  processNewMessage(placeholder, botResponse);
                }
                emit(EVENTS.STREAM_TOKEN, { chatId, token: data.token });
                refs.messages && (refs.messages.scrollTop = refs.messages.scrollHeight);
              }
              if (data.done) {
                finalizeBotMessage(container, botResponse);
                if (botResponse.trim() && placeholder) {
                  extractAndAttach(placeholder, botResponse);
                  try { const ss = readFromElement(placeholder); if (ss && ss.length) emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: ss }); } catch(_){ }
                }
                break;
              }
            } catch (_) {}
          }
        }
        if (forceWeb && typeof window.completeWebSearch === 'function') {
          try { window.completeWebSearch(); } catch (_) {}
        }
      }

      // Save response to chat
      if (chatId && (container && (container.textContent || '').trim())) {
        const textToSave = (typeof botResponse === 'string' && botResponse.trim()) ? botResponse : container.textContent.trim();
        await saveBotMessage(chatId, textToSave, placeholder || null);
      }
      emit(EVENTS.MESSAGE_FINISHED, { chatId });
    } catch (err) {
      if (container) container.textContent = 'Error retrieving response.';
      emit(EVENTS.ERROR, { chatId, error: String(err && err.message || err) });
    } finally {
      stopGeneration();
      emit(EVENTS.GENERATION_STATE, { chatId, generating: false });
    }
  }

  var controller = { sendMessage };

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

  // Public surface for chat modules (no auto-init yet)

  window.ChatModules = { api, state: state$1, dom, render, sources: sources$1, events, controller, agentsUI };

  exports.agentsUI = agentsUI;
  exports.api = api;
  exports.controller = controller;
  exports.dom = dom;
  exports.events = events;
  exports.render = render;
  exports.sources = sources$1;
  exports.state = state$1;

  return exports;

})({});
//# sourceMappingURL=chat.js.map

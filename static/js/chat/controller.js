// Chat controller: progressive wrapper around legacy functions
import { streamChat, saveMessages } from './api.js';
import state, { getChatId, startGeneration, stopGeneration, getSignal, getSelectedModel, getSelectedAgentLocal } from './state.js';
import { getRefs, appendUserMessage, appendBotPlaceholder, renderBotStreaming, finalizeBotMessage } from './dom.js';
import * as sources from './sources.js';
import { emit, on, EVENTS } from './events.js';

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
    try { const ss = sources.readFromElement(messageDiv); if (ss && ss.length) msg.sources = ss; } catch (_) {}
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

export async function sendMessage(text, { forceSearch, extras } = {}) {
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

  const ac = startGeneration();
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
          const mapped = sources.mapAgentSources(agentData.sources);
          if (mapped && mapped.length && placeholder) {
            sources.applyStructured(placeholder, mapped, botResponse);
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
                sources.extractAndAttach(placeholder, botResponse);
                try { const ss = sources.readFromElement(placeholder); if (ss && ss.length) emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: ss }); } catch(_){ }
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
                sources.processNewMessage(placeholder, botResponse);
              }
              emit(EVENTS.STREAM_TOKEN, { chatId, token: data.token });
              refs.messages && (refs.messages.scrollTop = refs.messages.scrollHeight);
            }
            if (data.done) {
              finalizeBotMessage(container, botResponse);
              if (botResponse.trim() && placeholder) {
                sources.extractAndAttach(placeholder, botResponse);
                try { const ss = sources.readFromElement(placeholder); if (ss && ss.length) emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: ss }); } catch(_){ }
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

export default { sendMessage };

// Listen for legacy abort signals and stop generation cleanly
on(EVENTS.ABORT, () => {
  try { stopGeneration(); } catch (_) {}
  emit(EVENTS.ABORTED, {});
});

// Chat controller: progressive wrapper around legacy functions
import { streamChat, saveMessages } from './api.js';
import state, { getChatId, isGenerating, startGeneration, stopGeneration, getSignal, getSelectedModel, getSelectedAgentLocal } from './state.js';
import { getRefs, appendUserMessage, appendBotPlaceholder, renderBotStreaming, finalizeBotMessage } from './dom.js';
import * as sources from './sources.js';
import { emit, on, EVENTS } from './events.js';

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

export function syncMessageCache(chatId, messages = []) {
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
  // IMPORTANT: Use cached messages instead of fetching from backend to avoid race conditions
  // where we fetch stale data while a save is still in progress.
  const cached = await ensureCachedMessages(chatId);
  return cached.map(m => ({ role: (m.sender === 'bot' ? 'assistant' : 'user'), content: m.text || '' }));
}

async function saveBotMessage(chatId, text, messageDiv) {
  if (!chatId) return false;
  try {
    const current = await ensureCachedMessages(chatId);
    const msg = { text: text || '', sender: 'bot', timestamp: new Date().toISOString() };
    try {
      const ss = sources.readFromElement(messageDiv);
      if (ss && ss.length) msg.sources = ss;
    } catch (_) {}
    const updated = [...current, msg];
    setCachedMessages(chatId, updated);
    try {
      await saveMessages(chatId, updated);
      return true;
    } catch (error) {
      console.error('Failed to save bot message:', error);
      setCachedMessages(chatId, current);
      throw error;
    }
  } catch (err) {
    console.error('Error in saveBotMessage:', err);
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
      console.error('Failed to save user message:', error);
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

export async function sendMessage(text, { forceSearch, extras } = {}) {
  // Prevent multiple concurrent requests
  if (isGenerating()) {
    console.log('Already generating a response, ignoring send request');
    return;
  }

  const refs = getRefs();
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
    // Set it as current chat
    window.currentChatId = chatId;
  }
  
  // Ensure a backing chat record exists before any persistence to avoid FK issues
  try {
    // Prefer frontend helper if available (creates node + empty chat)
    if (typeof window.createDefaultChat === 'function') {
      const wasCreated = await window.createDefaultChat(chatId, 'New Chat');
      
      // Only clear cache if this was a NEW chat creation
      if (wasCreated) {
        clearCachedMessages(chatId);
        setCachedMessages(chatId, []);
      }
      
      // Reload the chat tree to show the new chat in sidebar
      if (wasCreated && typeof window.loadChatTree === 'function') {
        try {
          await window.loadChatTree();
        } catch (error) {
          console.warn('Failed to reload chat tree:', error);
        }
      }
      
      // CRITICAL: Select/activate the newly created chat (only for new chats)
      if (wasCreated && window.chatTreeView && typeof window.chatTreeView.selectNodeById === 'function') {
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
  try { 
    await saveUserMessage(chatId, msg, extras || null); 
  } catch (err) {
    console.error('[sendMessage] Failed to save user message:', err);
  }
  const placeholder = await appendBotPlaceholder();
  const container = placeholder ? placeholder.querySelector('.chat-text') : null;

  let shouldPersistBot = false;
  let textForPersistence = '';
  let placeholderRemoved = false;
  let responseStarted = false;
  let abortError = false;

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
        responseStarted = responseStarted || !!botResponse;
        shouldPersistBot = botResponse.trim().length > 0;
        textForPersistence = botResponse;
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
              
              // 🐛 DEBUG: Log completion data
              console.log('[Chat] Completion data:', {
                used_rag: data.used_rag,
                used_web_search: data.used_web_search,
                has_sources: !!data.sources,
                sources_count: data.sources?.length || 0,
                has_placeholder: !!placeholder,
                classification: data.classification
              });
              
              // Handle sources from RAG response OR web search
              // Show sources if EITHER RAG was used OR web search was used
              const hasAnySources = (data.used_rag || data.used_web_search) && data.sources && Array.isArray(data.sources) && data.sources.length > 0;
              
              if (hasAnySources && placeholder) {
                const sourceType = data.used_web_search ? 'web search' : 'RAG';
                console.log(`[Chat] ✅ ${sourceType} was used, applying structured sources`);
                
                // Apply structured sources with document references
                if (window.sourceDisplayManager) {
                  window.sourceDisplayManager.applyStructuredSources(placeholder, data.sources, botResponse);
                  console.log('[Chat] Applied structured sources to message');
                } else {
                  console.warn('[Chat] ⚠️ sourceDisplayManager not available!');
                }
                emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: data.sources });
                
                // 🆕 STORE SOURCES FOR CHUNK-BASED HIGHLIGHTING
                // Store the actual RAG retrieved chunks so we can highlight them precisely
                const messageId = placeholder.dataset.messageId || `msg-${Date.now()}`;
                storeMessageSources(chatId, messageId, data.sources);
                console.log(`[${sourceType.toUpperCase()}] Stored ${data.sources.length} source chunks for highlighting`, messageId);
              } else if ((data.used_rag === false && data.used_web_search === false) && botResponse.trim() && placeholder) {
                // General knowledge response - no sources to extract
                console.log('[Chat] ⭕ General knowledge response (used_rag=false), skipping source extraction');
              } else if (botResponse.trim() && placeholder) {
                // Fallback to extracting sources from text (for legacy compatibility)
                console.log('[Chat] ⚠️ Fallback: extracting sources from text (legacy mode)');
                sources.extractAndAttach(placeholder, botResponse);
                try { const ss = sources.readFromElement(placeholder); if (ss && ss.length) emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: ss }); } catch(_){ }
              }
              shouldPersistBot = botResponse.trim().length > 0;
              textForPersistence = botResponse;
              break;
            }
          } catch (_) {}
        }
      }
    } else {
      // 🆕 Use RAG endpoint that returns sources (not old chat-with-context)
      // Regular RAG chat streaming with sources
      const history = await fetchChatHistory(chatId);
      const res = await fetch('/api/rag/chat', {  // ✅ Using unified endpoint with intelligent classification
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          message: msg, 
          stream: true, 
          conversation_history: history,  // ← Use conversation_history instead of history
          force_search: !!forceWeb 
        }),
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
              emit(EVENTS.STREAM_TOKEN, { chatId, token: data.token });
              // Auto-scroll removed to allow free scrolling during streaming
            }
            if (data.done) {
              finalizeBotMessage(container, botResponse);
              
              // 🐛 DEBUG: Log RAG endpoint completion data
              console.log('[RAG Completion Data]', {
                used_rag: data.used_rag,
                used_web_search: data.used_web_search,
                has_sources: !!data.sources,
                sources_count: data.sources?.length || 0,
                classification: data.classification,
                has_placeholder: !!placeholder
              });
              
              // Handle sources from RAG response OR web search
              // Show sources if EITHER RAG was used OR web search was used
              const hasAnySources = (data.used_rag || data.used_web_search) && data.sources && Array.isArray(data.sources) && data.sources.length > 0;
              
              if (hasAnySources && placeholder) {
                const sourceType = data.used_web_search ? 'WEB SEARCH' : 'RAG';
                console.log(`[${sourceType}] ✅ ${sourceType} was used, applying structured sources with doc-references`);
                
                // Apply structured sources with document references
                if (window.sourceDisplayManager) {
                  window.sourceDisplayManager.applyStructuredSources(placeholder, data.sources, botResponse);
                  console.log(`[${sourceType}] Applied structured sources to message`);
                } else {
                  console.warn(`[${sourceType}] ⚠️ sourceDisplayManager not available!`);
                }
                emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: data.sources });
                
                // Store sources for chunk-based highlighting
                const messageId = placeholder.dataset.messageId || `msg-${Date.now()}`;
                storeMessageSources(chatId, messageId, data.sources);
                console.log(`[${sourceType}] Stored ${data.sources.length} source chunks for highlighting`, messageId);
              } else if ((data.used_rag === false && data.used_web_search === false) && botResponse.trim() && placeholder) {
                // General knowledge response - no sources to extract
                console.log('[RAG] ⭕ General knowledge response (used_rag=false, used_web_search=false), skipping source extraction');
              } else if (botResponse.trim() && placeholder) {
                // Fallback to extracting sources from text (for legacy compatibility)
                console.log('[RAG] ⚠️ Fallback: extracting sources from text (legacy mode)');
                sources.extractAndAttach(placeholder, botResponse);
                try { const ss = sources.readFromElement(placeholder); if (ss && ss.length) emit(EVENTS.SOURCES_FINALIZED, { chatId, sources: ss }); } catch(_){ }
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
      abortError = true;
      if (responseStarted && container) {
        finalizeBotMessage(container, botResponse);
        if (botResponse.trim() && placeholder) {
          try {
            sources.extractAndAttach(placeholder, botResponse);
            const ss = sources.readFromElement(placeholder);
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

// 🆕 CHUNK-BASED HIGHLIGHTING HELPERS
// Store and retrieve RAG source chunks for precise highlighting

/**
 * Store RAG retrieved sources for a message to enable chunk-based highlighting.
 * These are the actual passages that the LLM used to generate the answer.
 * 
 * @param {string} chatId - Chat identifier
 * @param {string} messageId - Message identifier
 * @param {Array} sources - Array of source objects with {source, text, page, etc.}
 */
function storeMessageSources(chatId, messageId, sources) {
  if (!chatId || !messageId || !sources || !sources.length) return;
  
  try {
    const key = `rag_sources_${chatId}_${messageId}`;
    const data = {
      chatId,
      messageId,
      timestamp: Date.now(),
      sources: sources.map(s => ({
        source: s.source || 'Unknown',
        source_type: s.source_type || 'document',
        text: s.text || '',  // The actual chunk text - THIS IS WHAT WE NEED!
        page: s.page,
        chunk_id: s.chunk_id
      }))
    };
    localStorage.setItem(key, JSON.stringify(data));
    
    // Also store in window for immediate access
    if (!window.ragSourceCache) window.ragSourceCache = {};
    window.ragSourceCache[`${chatId}_${messageId}`] = data.sources;
    
  } catch (error) {
    console.warn('[RAG] Failed to store message sources:', error);
  }
}

/**
 * Retrieve stored RAG sources for a message.
 * 
 * @param {string} chatId - Chat identifier
 * @param {string} messageId - Message identifier (optional - gets last message if omitted)
 * @returns {Array|null} Array of source objects or null if not found
 */
function getMessageSources(chatId, messageId = null) {
  if (!chatId) return null;
  
  try {
    // If no messageId, try to get the most recent one
    if (!messageId) {
      messageId = getLastMessageId(chatId);
    }
    
    if (!messageId) return null;
    
    // Try window cache first (fastest)
    if (window.ragSourceCache && window.ragSourceCache[`${chatId}_${messageId}`]) {
      return window.ragSourceCache[`${chatId}_${messageId}`];
    }
    
    // Fall back to localStorage
    const key = `rag_sources_${chatId}_${messageId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    
    const data = JSON.parse(stored);
    
    // Update cache
    if (!window.ragSourceCache) window.ragSourceCache = {};
    window.ragSourceCache[`${chatId}_${messageId}`] = data.sources;
    
    return data.sources;
    
  } catch (error) {
    console.warn('[RAG] Failed to retrieve message sources:', error);
    return null;
  }
}

/**
 * Get the most recent message ID for a chat (heuristic).
 */
function getLastMessageId(chatId) {
  try {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return null;
    
    const messages = chatMessages.querySelectorAll('.chat-message.bot[data-message-id]');
    if (messages.length === 0) return null;
    
    const lastMessage = messages[messages.length - 1];
    return lastMessage.dataset.messageId;
    
  } catch (error) {
    return null;
  }
}

// Export for use in document highlighting
window.getMessageSources = getMessageSources;
window.storeMessageSources = storeMessageSources;

export default { sendMessage, syncMessageCache, clearCachedMessages };

// Listen for legacy abort signals and stop generation cleanly
on(EVENTS.ABORT, () => {
  try { stopGeneration(); } catch (_) {}
  emit(EVENTS.ABORTED, {});
});

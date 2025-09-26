// Shared sources helpers: extraction, application, and mapping

export function processNewMessage(messageElement, content) {
  try {
    if (window.sourceDisplayManager) {
      window.sourceDisplayManager.processNewMessage(messageElement, content);
    }
  } catch {}
}

export function extractAndAttach(messageElement, fullContent) {
  try {
    if (window.sourceDisplayManager) {
      return window.sourceDisplayManager.processMessageSources(fullContent, messageElement) || [];
    }
  } catch {}
  return [];
}

export function applyStructured(messageElement, sources, fullContent) {
  try {
    if (window.sourceDisplayManager) {
      window.sourceDisplayManager.applyStructuredSources(messageElement, sources, fullContent);
    } else if (messageElement && sources && sources.length) {
      messageElement.dataset.sources = JSON.stringify(sources);
    }
  } catch {}
}

export function openSidebar(sources) {
  try { if (window.sourceDisplayManager) window.sourceDisplayManager.openSidebar(sources); } catch {}
}

export function readFromElement(messageElement) {
  try {
    if (messageElement && messageElement.dataset && messageElement.dataset.sources) {
      return JSON.parse(messageElement.dataset.sources);
    }
  } catch {}
  return [];
}

export function mapAgentSources(rawList) {
  const list = Array.isArray(rawList) ? rawList : [];
  return list.map(s => ({
    title: s.title || s.name || 'Source',
    url: s.url || s.note_id || s.link || '',
    snippet: s.snippet || '',
  })).filter(s => s.url);
}

export default { processNewMessage, extractAndAttach, applyStructured, openSidebar, readFromElement, mapAgentSources };

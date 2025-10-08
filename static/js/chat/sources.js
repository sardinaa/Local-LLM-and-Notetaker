// Shared sources helpers: extraction, application, and mapping

export function extractAndAttach(messageElement, fullContent) {
  // DEPRECATED: Use applyStructured() with structured sources instead
  // This old text-parsing approach is no longer supported
  console.warn('extractAndAttach is deprecated, use applyStructured with structured sources');
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

export default { extractAndAttach, applyStructured, openSidebar, readFromElement, mapAgentSources };

// Chat API module: endpoints and streaming helpers
export async function streamChat({ prompt, chatId, model, forceSearch, signal }) {
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

export async function saveMessages(chatId, messages) {
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

export async function listAgents() {
  const res = await fetch('/api/agents');
  if (!res.ok) throw new Error('Failed to load agents');
  return res.json();
}

export async function listModels() {
  const res = await fetch('/api/ollama/models');
  if (!res.ok) throw new Error('Failed to load models');
  return res.json();
}

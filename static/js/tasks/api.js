export async function apiCall(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (data) options.body = JSON.stringify(data);

  const res = await fetch(endpoint, options);
  let json;
  try {
    json = await res.json();
  } catch (e) {
    json = {};
  }
  if (!res.ok) {
    const msg = json?.error || `API Error ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// Convenience wrappers (optional use)
export const TasksAPI = {
  list: () => apiCall('/api/tasks'),
  stats: () => apiCall('/api/tasks/stats'),
  quickCreate: (text) => apiCall('/api/tasks/quick-create', 'POST', { text }),
  parsePreview: (text) => apiCall('/api/tasks/parse-preview', 'POST', { text }),
  create: (payload) => apiCall('/api/tasks', 'POST', payload),
  update: (id, payload) => apiCall(`/api/tasks/${id}`, 'PUT', payload),
  remove: (id) => apiCall(`/api/tasks/${id}`, 'DELETE'),
};


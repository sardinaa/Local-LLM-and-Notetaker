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

function buildQuery(params = {}) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    usp.set(k, String(v));
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
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
  
  // New view-specific endpoints
  today: () => apiCall('/api/tasks/today'),
  next7Days: () => apiCall('/api/tasks/next-7-days'),
  inbox: () => apiCall('/api/tasks/inbox'),
  eisenhower: () => apiCall('/api/tasks/eisenhower'),
  byTag: (tagId) => apiCall(`/api/tasks/by-tag/${tagId}`),
  counts: () => apiCall('/api/tasks/counts'),
};

export const TagsAPI = {
  list: (params = {}) => apiCall(`/api/tags${buildQuery(params)}`),
  get: (id) => apiCall(`/api/tags/${id}`),
  update: (id, patch) => apiCall(`/api/tags/${id}`, 'PATCH', patch),
};


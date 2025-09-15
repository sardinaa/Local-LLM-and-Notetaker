// Minimal API wrapper for Jobs feature
export async function api(endpoint, options = {}) {
  const res = await fetch(endpoint, { headers: { 'Content-Type': 'application/json' }, ...options });
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) throw new Error(json?.error || `API ${res.status}`);
  return json;
}

export const JobsAPI = {
  list: (query = {}) => api('/api/jobs' + (Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : '')),
  get: (id) => api(`/api/jobs/${id}`),
  create: (payload = {}) => api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  patch: (id, payload) => api(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: (id) => api(`/api/jobs/${id}`, { method: 'DELETE' }),
};


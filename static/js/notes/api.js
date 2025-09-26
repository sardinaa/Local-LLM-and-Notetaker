// Notes API module
// Responsibilities: CRUD for notes, tree, templates list, tags and attachments operations.

export const NotesAPI = {
  async getTree() {
    const res = await fetch('/api/notes/tree');
    if (!res.ok) throw new Error('Failed to fetch notes tree');
    return res.json();
  },
  async getNote(noteId) {
    const res = await fetch(`/api/notes/${noteId}`);
    if (!res.ok) throw new Error('Failed to fetch note');
    return res.json();
  },
  // Save note via backend contract: POST /api/notes with { id, title, content }
  async saveNote(id, title, content) {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title, content }),
    });
    if (!res.ok) throw new Error('Failed to save note');
    return res.json();
  },
  async createNote(payload) {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create note');
    return res.json();
  },
  async updateNote(noteId, payload) {
    const res = await fetch(`/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update note');
    return res.json();
  },
  async listTemplates() {
    const res = await fetch('/api/notes/templates');
    if (!res.ok) throw new Error('Failed to fetch templates');
    return res.json();
  },
};

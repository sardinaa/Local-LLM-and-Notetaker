(function () {
  'use strict';

  // DOM helpers for Notes feature

  // Align with legacy DOM: note tree uses #note-tree, EditorJS mounts on #editorjs
  const NotesDOM = {
    els: {
      section: document.getElementById('notesSection'),
      tree: document.getElementById('note-tree'),
      editor: document.getElementById('editorjs'),
      toolbar: document.getElementById('notesToolbar'),
    }};

  // Notes state module
  // Responsibilities: holds selected node, active note, editor state, dirty flag.

  const NotesState = {
    tree: [],
    selectedNodeId: null,
    note: null,
    isDirty: false,
    editorMode: 'markdown', // 'markdown' | 'preview'
  };

  // Tree interactions for Notes

  // Bind to existing TreeView custom events on #note-tree
  function bindTreeEvents(container, onSelect) {
    if (!container) return;
    // Avoid double-binding
    if (container.dataset.notesHandlersBound) return;

    container.addEventListener('nodeSelected', (e) => {
      const { nodeId, nodeType } = e.detail || {};
      if (!nodeId || nodeType !== 'note') return;
      NotesState.selectedNodeId = nodeId;
      if (onSelect) onSelect(nodeId);
    });

    container.dataset.notesHandlersBound = '1';
  }

  // Notes API module
  // Responsibilities: CRUD for notes, tree, templates list, tags and attachments operations.

  const NotesAPI = {
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

  // Editor interactions for Notes (integrates with global EditorJS NoteEditor)

  let saveTimer;
  const SAVE_DEBOUNCE = 800;

  async function loadNote(noteId) {
    try {
      // Use existing global editor instance if available
      const editor = window.editorInstance;
      if (!editor) return;

      const data = await (await fetch(`/api/notes/${noteId}`)).json();
      NotesState.note = data;
      NotesState.isDirty = false;
      // Render content via editor API and set current note id
      await editor.render(data?.content || { blocks: [] });
      if (typeof editor.setCurrentNote === 'function') {
        editor.setCurrentNote(noteId);
      } else {
        editor.currentNoteId = noteId;
      }
      // Load tags if tag system exists
      if (window.tagSystem && typeof window.tagSystem.loadForNote === 'function') {
        window.tagSystem.loadForNote(noteId);
      }
    } catch (e) {
      console.error('Failed to load note', e);
    }
  }

  function bindEditorAutosave() {
    const editor = window.editorInstance;
    if (!editor || typeof editor.setOnChangeCallback !== 'function') return;

    const debounced = async () => {
      try {
        const noteId = editor.currentNoteId;
        if (!noteId) return;
        const content = await editor.getData();
        // Try to infer a title from UI when available
        const titleEl = document.querySelector('.note-title');
        const title = titleEl ? titleEl.textContent.trim() : (NotesState.note?.title || '');
        await NotesAPI.saveNote(noteId, title, content);
        NotesState.isDirty = false;
      } catch (err) {
        console.warn('Autosave failed', err);
      }
    };

    // Hook into editor change with debounce
    if (!bindEditorAutosave._bound) {
      editor.setOnChangeCallback(() => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(debounced, SAVE_DEBOUNCE);
      });
      bindEditorAutosave._bound = true;
    }
  }

  // Notes controller

  async function initNotes() {
    const { tree } = NotesDOM.els;
    if (!NotesDOM.els.section) return; // not on notes page

    // Bind selection from existing TreeView and hook autosave
    bindTreeEvents(tree, (id) => loadNote(id));
    bindEditorAutosave();
  }

  // Notes entry - feature flag and safe init

  (function bootstrap() {
    if (!window.__USE_NOTES_MODULES__) return;
    // Defer to next tick to ensure DOM is ready if loaded at <head>
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initNotes);
    } else {
      initNotes();
    }
  })();

})();
//# sourceMappingURL=notes.js.map

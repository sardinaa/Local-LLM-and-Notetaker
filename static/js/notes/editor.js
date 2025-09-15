// Editor interactions for Notes (integrates with global EditorJS NoteEditor)
import { NotesAPI } from './api.js';
import { NotesState } from './state.js';

let saveTimer;
const SAVE_DEBOUNCE = 800;

export async function loadNote(noteId) {
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

export function bindEditorAutosave() {
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

// Notes controller
import { NotesDOM } from './dom.js';
import { bindTreeEvents } from './tree.js';
import { loadNote, bindEditorAutosave } from './editor.js';

export async function initNotes() {
  const { tree } = NotesDOM.els;
  if (!NotesDOM.els.section) return; // not on notes page

  // Bind selection from existing TreeView and hook autosave
  bindTreeEvents(tree, (id) => loadNote(id));
  bindEditorAutosave();
}

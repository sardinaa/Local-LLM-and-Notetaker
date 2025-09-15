// DOM helpers for Notes feature
import { CLASSES } from '../constants/classes.js';
import { show, hide, toggle } from '../utils/dom.js';

// Align with legacy DOM: note tree uses #note-tree, EditorJS mounts on #editorjs
export const NotesDOM = {
  els: {
    section: document.getElementById('notesSection'),
    tree: document.getElementById('note-tree'),
    editor: document.getElementById('editorjs'),
    toolbar: document.getElementById('notesToolbar'),
  },
  show,
  hide,
  toggle,
  classes: CLASSES,
};

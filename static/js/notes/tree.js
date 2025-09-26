// Tree interactions for Notes
import { NotesState } from './state.js';

// Bind to existing TreeView custom events on #note-tree
export function bindTreeEvents(container, onSelect) {
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

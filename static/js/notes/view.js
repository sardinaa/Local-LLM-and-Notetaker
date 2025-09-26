// Render helpers for Notes feature
import { NotesState } from './state.js';

export function renderTree(container, tree = NotesState.tree) {
  if (!container) return;
  container.innerHTML = '';
  const ul = document.createElement('ul');
  tree.forEach(node => {
    const li = document.createElement('li');
    li.textContent = node.title || node.name || `Note ${node.id}`;
    li.dataset.nodeId = node.id;
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

export function renderEditor(container, note = NotesState.note) {
  if (!container) return;
  container.value = note?.content || '';
}

import { notify } from './notifications.js';
import { TasksAPI } from './api.js';
import { updateFilesDisplay } from './panel.js';

export function bindReferences(ctrl) {
  const {
    addReferenceBtn,
    referenceSelectionModal,
    referenceSelectionModalClose,
    uploadFilesBtn,
    linkNotesBtn,
    fileInput,
    noteSelectionModal,
    noteSelectionModalClose,
    noteSearchInput,
    noteSelectionConfirm,
    referencesContainer,
  } = ctrl.els;

  if (addReferenceBtn && !addReferenceBtn.dataset.bound) {
    addReferenceBtn.addEventListener('click', () => openRefModal(ctrl));
    addReferenceBtn.dataset.bound = '1';
  }
  if (referenceSelectionModalClose && !referenceSelectionModalClose.dataset.bound) {
    referenceSelectionModalClose.addEventListener('click', () => closeRefModal(ctrl));
    referenceSelectionModalClose.dataset.bound = '1';
  }
  if (uploadFilesBtn && !uploadFilesBtn.dataset.bound) {
    uploadFilesBtn.addEventListener('click', () => {
      if (!fileInput) return;
      fileInput.value = '';
      fileInput.click();
    });
    uploadFilesBtn.dataset.bound = '1';
  }
  if (fileInput && !fileInput.dataset.bound) {
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length || !ctrl.selectedTask) return;
      try {
        notify('Subiendo archivos...', 'info');
        const fd = new FormData();
        fd.append('task_id', ctrl.selectedTask.id);
        files.forEach((f) => fd.append('files', f, f.name));
        const res = await fetch('/api/tasks/files', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');
        await ctrl.reloadTasks();
        const updated = (ctrl.tasks || []).find((t) => String(t.id) === String(ctrl.selectedTask.id));
        if (updated) {
          ctrl.selectedTask = updated;
          renderReferences(ctrl);
          updateFilesDisplay(ctrl, updated.references || updated.files || []);
        }
        notify('Archivos subidos', 'success');
      } catch (err) {
        notify('Error al subir archivos', 'error');
      }
    });
    fileInput.dataset.bound = '1';
  }
  if (linkNotesBtn && !linkNotesBtn.dataset.bound) {
    linkNotesBtn.addEventListener('click', async () => {
      await openNotesModal(ctrl);
    });
    linkNotesBtn.dataset.bound = '1';
  }
  if (noteSelectionModalClose && !noteSelectionModalClose.dataset.bound) {
    noteSelectionModalClose.addEventListener('click', () => closeNotesModal(ctrl));
    noteSelectionModalClose.dataset.bound = '1';
  }
  if (noteSearchInput && !noteSearchInput.dataset.bound) {
    noteSearchInput.addEventListener('input', () => filterNotes(ctrl));
    noteSearchInput.dataset.bound = '1';
  }
  if (noteSelectionConfirm && !noteSelectionConfirm.dataset.bound) {
    noteSelectionConfirm.addEventListener('click', async () => {
      await linkSelectedNotes(ctrl);
    });
    noteSelectionConfirm.dataset.bound = '1';
  }

  // Handle reference item actions (remove) via event delegation
  if (referencesContainer && !referencesContainer.dataset.bound) {
    referencesContainer.addEventListener('click', async (e) => {
      const btn = e.target.closest('.reference-remove');
      if (!btn) return;
      const type = btn.getAttribute('data-type');
      const refId = btn.getAttribute('data-id');
      if (!type || !refId || !ctrl.selectedTask) return;
      try {
        if (type === 'file') {
          const url = `/api/tasks/${ctrl.selectedTask.id}/files/${encodeURIComponent(refId)}`;
          const res = await fetch(url, { method: 'DELETE' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.success === false) throw new Error(data.error || 'Remove failed');
        } else if (type === 'note') {
          const url = `/api/tasks/${ctrl.selectedTask.id}/notes/${encodeURIComponent(refId)}`;
          const res = await fetch(url, { method: 'DELETE' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.success === false) throw new Error(data.error || 'Remove failed');
        }
        await ctrl.reloadTasks();
        const updated = (ctrl.tasks || []).find((t) => String(t.id) === String(ctrl.selectedTask.id));
        if (updated) {
          ctrl.selectedTask = updated;
          renderReferences(ctrl);
          updateFilesDisplay(ctrl, updated.references || updated.files || []);
        }
      } catch (_) {
        notify('Error removing reference', 'error');
      }
    });
    referencesContainer.dataset.bound = '1';
  }
}

function openRefModal(ctrl) {
  const modal = ctrl.els.referenceSelectionModal;
  if (modal) {
    renderReferences(ctrl); // initial render
    modal.classList.remove('is-hidden');
  }
}

function closeRefModal(ctrl) {
  const modal = ctrl.els.referenceSelectionModal;
  if (modal) modal.classList.add('is-hidden');
}

function renderReferences(ctrl) {
  const { referencesContainer, referencesCount } = ctrl.els;
  const refs = (ctrl.selectedTask && ctrl.selectedTask.references) || { files: [], notes: [] };
  const files = Array.isArray(refs.files) ? refs.files : (Array.isArray(ctrl.selectedTask?.files) ? ctrl.selectedTask.files : []);
  const notes = Array.isArray(refs.notes) ? refs.notes : [];
  const total = (files?.length || 0) + (notes?.length || 0);
  if (referencesCount) referencesCount.textContent = `${total} items`;
  if (!referencesContainer) return;
  if (!total) {
    referencesContainer.innerHTML = '<div class="references-empty">No references attached</div>';
    return;
  }
  const fileItems = (files || []).map((f) => {
    const id = f.id || f.file_id || f.filename || '';
    const name = f.original_name || f.filename || f.name || 'file';
    return `
      <div class="reference-item" data-type="file" data-id="${id}">
        <div class="reference-item-left">
          <span class="reference-item-icon file"><i class="fas fa-file"></i></span>
          <div class="reference-item-content">
            <div class="reference-item-name">${escapeHtml(name)}</div>
            ${f.mime_type ? `<div class="reference-item-details">${escapeHtml(f.mime_type)}</div>` : ''}
          </div>
        </div>
        <span class="reference-item-type file">File</span>
        <button class="reference-remove" title="Remove" data-type="file" data-id="${id}"><i class="fas fa-trash"></i></button>
      </div>`;
  });
  const noteItems = (notes || []).map((n) => {
    const id = n.id || n.note_id || '';
    const name = n.name || 'note';
    const path = n.path ? String(n.path) : '';
    return `
      <div class="reference-item" data-type="note" data-id="${id}">
        <div class="reference-item-left">
          <span class="reference-item-icon note"><i class="fas fa-file-alt"></i></span>
          <div class="reference-item-content">
            <div class="reference-item-name">${escapeHtml(name)}</div>
            ${path ? `<div class="reference-item-details">${escapeHtml(path)}</div>` : ''}
          </div>
        </div>
        <span class="reference-item-type note">Note</span>
        <button class="reference-remove" title="Remove" data-type="note" data-id="${id}"><i class="fas fa-trash"></i></button>
      </div>`;
  });
  referencesContainer.innerHTML = [...fileItems, ...noteItems].join('');
}

async function openNotesModal(ctrl) {
  const modal = ctrl.els.noteSelectionModal;
  if (!modal) return;
  modal.classList.remove('is-hidden');
  ctrl._noteSelection = new Set();
  await loadNotes(ctrl, '');
  if (ctrl.els.noteSearchInput) ctrl.els.noteSearchInput.value = '';
  updateNoteConfirmState(ctrl);
}

function closeNotesModal(ctrl) {
  const modal = ctrl.els.noteSelectionModal;
  if (modal) modal.classList.add('is-hidden');
}

async function loadNotes(ctrl, q) {
  try {
    const url = `/api/notes/list${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    const notes = data.notes || [];
    renderNotesList(ctrl, notes);
  } catch (e) {
    renderNotesList(ctrl, []);
  }
}

function renderNotesList(ctrl, notes) {
  const container = document.getElementById('notesList');
  if (!container) return;
  if (!notes.length) {
    container.innerHTML = '<div class="notes-empty-state">No notes found</div>';
    return;
  }
  container.innerHTML = notes
    .map((n) => `<div class="note-list-item" data-note-id="${n.id}"><i class="fas fa-file-alt"></i><div class="note-list-item-name">${escapeHtml(n.name)}</div><div class="note-list-item-path">${escapeHtml(n.path || 'Root')}</div></div>`)
    .join('');
  container.querySelectorAll('.note-list-item').forEach((el) => {
    el.addEventListener('click', () => toggleNoteSelection(ctrl, el.dataset.noteId, el));
  });
}

function toggleNoteSelection(ctrl, id, el) {
  ctrl._noteSelection = ctrl._noteSelection || new Set();
  if (ctrl._noteSelection.has(id)) {
    ctrl._noteSelection.delete(id);
    el.classList.remove('selected');
  } else {
    ctrl._noteSelection.add(id);
    el.classList.add('selected');
  }
  updateNoteConfirmState(ctrl);
}

function updateNoteConfirmState(ctrl) {
  const btn = ctrl.els.noteSelectionConfirm;
  if (!btn) return;
  const count = ctrl._noteSelection ? ctrl._noteSelection.size : 0;
  btn.disabled = count === 0;
  btn.textContent = count > 0 ? `Link Selected Notes (${count})` : 'Link Selected Notes';
}

function filterNotes(ctrl) {
  const q = ctrl.els.noteSearchInput?.value?.trim() || '';
  loadNotes(ctrl, q);
}

async function linkSelectedNotes(ctrl) {
  if (!ctrl.selectedTask || !ctrl._noteSelection || ctrl._noteSelection.size === 0) return;
  try {
    const ids = Array.from(ctrl._noteSelection);
    const res = await fetch(`/api/tasks/${ctrl.selectedTask.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_ids: ids }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to link notes');
    closeNotesModal(ctrl);
    await ctrl.reloadTasks();
    const updated = (ctrl.tasks || []).find((t) => String(t.id) === String(ctrl.selectedTask.id));
    if (updated) {
      ctrl.selectedTask = updated;
      renderReferences(ctrl);
      updateFilesDisplay(ctrl, updated.references || updated.files || []);
    }
    notify('Notas vinculadas', 'success');
  } catch (e) {
    notify('Error al vincular notas', 'error');
  }
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

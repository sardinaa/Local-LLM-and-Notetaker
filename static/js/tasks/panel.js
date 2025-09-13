import { setDateTimeDisplay } from './view.js';
import { updateTagPillDisplay } from './tags.js';

export function showTaskPanel(ctrl, task) {
  const { taskPanelOverlay, taskRightPanel, taskDetailsPanel, panelEmptyState, taskCompleteToggle, taskTitleInput } = ctrl.els;
  if (!taskDetailsPanel) return;
  taskDetailsPanel.classList.remove('is-hidden');
  if (panelEmptyState) panelEmptyState.classList.add('is-hidden');
  // Expand editor layout to allocate space for details
  const layout = document.querySelector('.task-editor-layout');
  if (layout) layout.classList.add('with-details');
  // Ensure mobile slide-in panel is visible
  if (taskRightPanel) taskRightPanel.classList.add('open');
  if (taskPanelOverlay) taskPanelOverlay.classList.remove('is-hidden');
  if (taskCompleteToggle) taskCompleteToggle.checked = task.status === 'completed';
  if (taskTitleInput) taskTitleInput.value = task.title || '';
  setDateTimeDisplay(task, ctrl.els.taskDateTimeDisplay);
  updateTagPillDisplay(ctrl, task);
  updatePriorityUI(ctrl, task.priority);
  updateFilesDisplay(ctrl, task.references || task.files || []);
}

export function updateFilesDisplay(ctrl, refsOrFiles) {
  const { filesCount, filesQuickPreview, quickPreviewList, noAttachments } = ctrl.els;

  // Normalize into references shape
  const files = Array.isArray(refsOrFiles)
    ? refsOrFiles
    : (refsOrFiles && typeof refsOrFiles === 'object' && Array.isArray(refsOrFiles.files) ? refsOrFiles.files : []);
  const notes = Array.isArray(refsOrFiles)
    ? []
    : (refsOrFiles && typeof refsOrFiles === 'object' && Array.isArray(refsOrFiles.notes) ? refsOrFiles.notes : []);
  const total = (files?.length || 0) + (notes?.length || 0);

  if (filesCount) filesCount.textContent = String(total);

  if (quickPreviewList) {
    const fileItems = (files || []).map((f) => {
      const id = f.id || f.file_id || f.filename || '';
      const name = f.original_name || f.filename || f.name || f.title || 'file';
      const details = f.mime_type ? `<div class="reference-item-details">${escapeHtml(f.mime_type)}</div>` : '';
      return `
        <div class="reference-item" data-type="file" data-id="${id}">
          <div class="reference-item-left">
            <span class="reference-item-icon file"><i class="fas fa-file"></i></span>
            <div class="reference-item-content">
              <div class="reference-item-name">${escapeHtml(name)}</div>
              ${details}
            </div>
          </div>
          <span class="reference-item-type file">File</span>
          <button class="reference-remove" title="Remove" data-type="file" data-id="${id}"><i class="fas fa-trash"></i></button>
        </div>`;
    });
    const noteItems = (notes || []).map((n) => {
      const id = n.id || n.note_id || '';
      const name = n.name || 'note';
      const details = n.path ? `<div class="reference-item-details">${escapeHtml(String(n.path))}</div>` : '';
      return `
        <div class="reference-item" data-type="note" data-id="${id}">
          <div class="reference-item-left">
            <span class="reference-item-icon note"><i class="fas fa-file-alt"></i></span>
            <div class="reference-item-content">
              <div class="reference-item-name">${escapeHtml(name)}</div>
              ${details}
            </div>
          </div>
          <span class="reference-item-type note">Note</span>
          <button class="reference-remove" title="Remove" data-type="note" data-id="${id}"><i class="fas fa-trash"></i></button>
        </div>`;
    });
    quickPreviewList.innerHTML = [...fileItems, ...noteItems].join('');
  }

  if (noAttachments) noAttachments.style.display = total ? 'none' : '';
}

export function hideTaskPanel(ctrl) {
  const { taskPanelOverlay, taskRightPanel, taskDetailsPanel, panelEmptyState } = ctrl.els;
  const layout = document.querySelector('.task-editor-layout');
  if (layout) layout.classList.remove('with-details');
  if (taskRightPanel) taskRightPanel.classList.remove('open');
  if (taskPanelOverlay) taskPanelOverlay.classList.add('is-hidden');
  if (taskDetailsPanel) taskDetailsPanel.classList.add('is-hidden');
  if (panelEmptyState) panelEmptyState.classList.remove('is-hidden');
}

export function updatePriorityUI(ctrl, priority) {
  const sel = ctrl.els.prioritySelector;
  if (!sel) return;
  sel.querySelectorAll('.priority-btn').forEach((btn) => btn.classList.remove('active'));
  const active = sel.querySelector(`.priority-btn[data-priority="${priority || ''}"]`);
  if (active) active.classList.add('active');
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

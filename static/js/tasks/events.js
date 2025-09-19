import { TasksAPI } from './api.js';
import { notify } from './notifications.js';
import { showPreview, hidePreview } from './render.js';
import { showTaskPanel, hideTaskPanel } from './panel.js';

export function bindQuickAdd(ctrl) {
  const { quickTaskInput, quickTaskSubmit } = ctrl.els;
  if (quickTaskInput && !quickTaskInput.dataset.bound) {
    quickTaskInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await createQuickTask(ctrl);
      }
    });
    quickTaskInput.dataset.bound = '1';
  }
  if (quickTaskSubmit && !quickTaskSubmit.dataset.bound) {
    quickTaskSubmit.addEventListener('click', async () => {
      await createQuickTask(ctrl);
    });
    quickTaskSubmit.dataset.bound = '1';
  }
}

export function bindPreview(ctrl) {
  const { quickTaskPreview, previewEdit, previewSave } = ctrl.els;
  if (quickTaskPreview && !quickTaskPreview.dataset.bound) {
    quickTaskPreview.addEventListener('click', async () => {
      await togglePreview(ctrl);
    });
    quickTaskPreview.dataset.bound = '1';
  }
  if (previewEdit && !previewEdit.dataset.bound) {
    previewEdit.addEventListener('click', () => {
      // Future: open modal editing; for now, just keep preview visible
      if (!ctrl.currentPreview) return;
      notify('Edit preview not yet migrated', 'info');
    });
    previewEdit.dataset.bound = '1';
  }
  if (previewSave && !previewSave.dataset.bound) {
    previewSave.addEventListener('click', async () => {
      if (!ctrl.currentPreview) return;
      try {
        await TasksAPI.create(ctrl.currentPreview);
        notify('Tarea creada exitosamente', 'success');
        ctrl.els.quickTaskInput && (ctrl.els.quickTaskInput.value = '');
        hidePreview(ctrl);
        ctrl.currentPreview = null;
        await ctrl.reloadTasks();
      } catch (e) {
        notify('Error al crear la tarea', 'error');
      }
    });
    previewSave.dataset.bound = '1';
  }
}

async function createQuickTask(ctrl) {
  const input = ctrl.els.quickTaskInput;
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  
  try {
    // Check if we need to modify task data based on current view context
    let taskText = text;
    
    if (ctrl.currentViewContext) {
      const { view, autoTag } = ctrl.currentViewContext;
      
      // For list views, auto-add the tag if not already present
      if (view && view.startsWith('list:') && autoTag) {
        if (!text.includes(`#${autoTag}`) && !text.includes(`#${autoTag.toLowerCase()}`)) {
          taskText = `${text} #${autoTag}`;
        }
      }
    }
    
    await TasksAPI.quickCreate(taskText);
    notify('Tarea creada exitosamente', 'success');
    input.value = '';
    hidePreview(ctrl);
    ctrl.currentPreview = null;
    
    // Reload tasks and update view
    await ctrl.reloadTasks();
    
    // Update sidebar counts
    if (ctrl.sidebar) {
      ctrl.sidebar.refresh();
    }
    
    // Refresh current view if using views router
    if (ctrl.viewsRouter) {
      const currentView = ctrl.viewsRouter.getCurrentView();
      if (currentView) {
        await ctrl.viewsRouter.switchToView(currentView, false);
      }
    }
    
  } catch (e) {
    notify('Error creando tarea', 'error');
  }
}

async function togglePreview(ctrl) {
  const input = ctrl.els.quickTaskInput;
  const panel = ctrl.els.taskPreview;
  if (!input || !panel) return;
  const text = input.value.trim();
  if (!text) {
    hidePreview(ctrl);
    ctrl.currentPreview = null;
    return;
  }
  const isHidden = panel.classList.contains('is-hidden');
  if (isHidden) {
    try {
      const res = await TasksAPI.parsePreview(text);
      ctrl.currentPreview = res.data;
      showPreview(ctrl, res.data);
    } catch (e) {
      notify('Error generando vista previa', 'error');
    }
  } else {
    hidePreview(ctrl);
    ctrl.currentPreview = null;
  }
}

export function bindBucketToggles(ctrl) {
  const section = document.getElementById('tasksSection');
  if (!section) return;
  const headers = section.querySelectorAll('.bucket-header[data-toggle]');
  headers.forEach((header) => {
    if (header.dataset.bound) return;
    header.addEventListener('click', (e) => {
      const name = header.dataset.toggle;
      const content = section.querySelector(`#${name}Tasks`);
      const arrow = header.querySelector('.bucket-arrow');
      if (!content) return;
      const hidden = content.classList.toggle('is-hidden');
      if (arrow) arrow.style.transform = hidden ? 'rotate(-90deg)' : '';
    });
    header.dataset.bound = '1';
  });
}

export function bindKeyboardNavigation(ctrl) {
  document.addEventListener(
    'keydown',
    (e) => {
      const active = document.activeElement;
      if (!isTasksVisible() || isEditing(active)) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(ctrl, -1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(ctrl, 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        select(ctrl);
      }
    },
    true
  );
}

function isEditing(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function isTasksVisible() {
  const sec = document.getElementById('tasksSection');
  return !!sec && !sec.classList.contains('is-hidden');
}

function rows() {
  const sec = document.getElementById('tasksSection');
  if (!sec) return [];
  return Array.from(sec.querySelectorAll('.task-bucket:not(.is-hidden) .bucket-content:not(.is-hidden) .task-row'));
}

function move(ctrl, delta) {
  const list = rows();
  if (!list.length) return;
  if (typeof ctrl.selectedTaskIndex !== 'number') ctrl.selectedTaskIndex = -1;
  ctrl.selectedTaskIndex = Math.max(0, Math.min(list.length - 1, ctrl.selectedTaskIndex + delta));
  highlight(ctrl, list);
  
  // If task panel is open, update it with the newly selected task
  const isPanelOpen = ctrl.els.taskDetailsPanel && !ctrl.els.taskDetailsPanel.classList.contains('is-hidden');
  if (isPanelOpen) {
    const selectedRow = list[ctrl.selectedTaskIndex];
    if (selectedRow) {
      const taskId = selectedRow.getAttribute('data-task-id');
      const task = (ctrl.tasks || []).find((t) => String(t.id) === String(taskId));
      if (task) {
        ctrl.selectedTask = task;
        showTaskPanel(ctrl, task);
      }
    }
  }
}

function highlight(ctrl, list) {
  list.forEach((r) => r.classList.remove('selected'));
  const row = list[ctrl.selectedTaskIndex];
  if (row) {
    row.classList.add('selected');
    row.scrollIntoView({ block: 'nearest' });
  }
}

function select(ctrl) {
  const list = rows();
  const row = list[ctrl.selectedTaskIndex];
  if (!row) return;
  const id = row.getAttribute('data-task-id');
  const task = (ctrl.tasks || []).find((t) => String(t.id) === String(id));
  if (!task) return;
  ctrl.selectedTask = task;
  showTaskPanel(ctrl, task);
}

export function bindPanelEvents(ctrl) {
  const { taskPanelOverlay, taskPanelClose, taskCompleteToggle, taskTitleInput, prioritySelector, filesCountBtn, filesQuickPreview, closePreviewBtn, quickPreviewList } = ctrl.els;
  // Mobile close actions
  if (taskPanelClose && !taskPanelClose.dataset.bound) {
    taskPanelClose.addEventListener('click', () => hideTaskPanel(ctrl));
    taskPanelClose.dataset.bound = '1';
  }
  if (taskPanelOverlay && !taskPanelOverlay.dataset.bound) {
    taskPanelOverlay.addEventListener('click', () => hideTaskPanel(ctrl));
    taskPanelOverlay.dataset.bound = '1';
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTaskPanel(ctrl);
  }, true);

  // Click outside to close (both mobile and desktop)
  if (!document.__tasksOutsideCloseBound) {
    document.addEventListener('click', (e) => {
      const panel = ctrl.els.taskRightPanel;
      const overlay = ctrl.els.taskPanelOverlay;
      const inPanel = panel && panel.contains(e.target);
      const inOverlay = overlay && overlay.contains(e.target);
      const tasksSection = document.getElementById('tasksSection');
      const rows = tasksSection ? Array.from(tasksSection.querySelectorAll('.task-row')) : [];
      const inRow = rows.some((row) => row.contains(e.target));
      const inAnyModal = !!document.querySelector('.reference-selection-modal:not(.is-hidden), .note-selection-modal:not(.is-hidden)');
      if (inPanel || inOverlay || inRow || inAnyModal) return;
      hideTaskPanel(ctrl);
    }, true);
    document.__tasksOutsideCloseBound = true;
  }
  if (taskCompleteToggle && !taskCompleteToggle.dataset.bound) {
    taskCompleteToggle.addEventListener('change', async () => {
      const task = ctrl.selectedTask;
      if (!task) return;
      try {
        const newStatus = taskCompleteToggle.checked ? 'completed' : 'pending';
        await TasksAPI.update(task.id, { status: newStatus });
        await ctrl.reloadTasks();
        const updated = (ctrl.tasks || []).find((t) => String(t.id) === String(task.id));
        if (updated) showTaskPanel(ctrl, updated);
      } catch (e) {
        notify('Error al actualizar estado', 'error');
      }
    });
    taskCompleteToggle.dataset.bound = '1';
  }

  if (taskTitleInput && !taskTitleInput.dataset.bound) {
    const saveTitle = async () => {
      const task = ctrl.selectedTask;
      if (!task) return;
      const title = taskTitleInput.value.trim();
      if (!title || title === task.title) return;
      try {
        await TasksAPI.update(task.id, { title });
        await ctrl.reloadTasks();
        const updated = (ctrl.tasks || []).find((t) => String(t.id) === String(task.id));
        if (updated) showTaskPanel(ctrl, updated);
      } catch (e) {
        notify('Error al actualizar título', 'error');
      }
    };
    taskTitleInput.addEventListener('blur', saveTitle);
    taskTitleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveTitle(); } });
    taskTitleInput.dataset.bound = '1';
  }

  if (prioritySelector && !prioritySelector.dataset.bound) {
    prioritySelector.querySelectorAll('.priority-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const task = ctrl.selectedTask;
        if (!task) return;
        const priority = btn.dataset.priority || '';
        try {
          await TasksAPI.update(task.id, { priority });
          await ctrl.reloadTasks();
          const updated = (ctrl.tasks || []).find((t) => String(t.id) === String(task.id));
          if (updated) showTaskPanel(ctrl, updated);
        } catch (e) {
          notify('Error al actualizar prioridad', 'error');
        }
      });
    });
    prioritySelector.dataset.bound = '1';
  }

  if (filesCountBtn && !filesCountBtn.dataset.bound) {
    filesCountBtn.addEventListener('click', () => {
      if (!filesQuickPreview) return;
      filesQuickPreview.style.display = filesQuickPreview.style.display === 'none' || !filesQuickPreview.style.display ? 'block' : 'none';
    });
    filesCountBtn.dataset.bound = '1';
  }

  if (closePreviewBtn && !closePreviewBtn.dataset.bound) {
    closePreviewBtn.addEventListener('click', () => {
      if (filesQuickPreview) filesQuickPreview.style.display = 'none';
    });
    closePreviewBtn.dataset.bound = '1';
  }

  // Handle remove actions inside quick preview list
  if (quickPreviewList && !quickPreviewList.dataset.bound) {
    quickPreviewList.addEventListener('click', async (e) => {
      const btn = e.target.closest('.reference-remove');
      if (!btn || !ctrl.selectedTask) return;
      const type = btn.getAttribute('data-type');
      const refId = btn.getAttribute('data-id');
      if (!type || !refId) return;
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
          // Re-render panel and preview
          showTaskPanel(ctrl, updated);
        }
      } catch (_) {
        notify('Error removing reference', 'error');
      }
    });
    quickPreviewList.dataset.bound = '1';
  }
}

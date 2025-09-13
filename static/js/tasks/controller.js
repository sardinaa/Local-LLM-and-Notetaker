import { collectTaskEls } from './dom.js';
import { TasksAPI } from './api.js';
import { notify } from './notifications.js';
import { loadViewSettings, saveViewSettings } from './state.js';
import { updateCountsUI } from './view.js';
import { initFilterMenu, toggleFilterMenu, updateMenuState } from './filters.js';
import { bindQuickAdd, bindPreview, bindBucketToggles, bindKeyboardNavigation, bindPanelEvents } from './events.js';
import { renderBuckets, renderGrouped } from './render.js';
import { showTaskPanel } from './panel.js';
import { bindDateTime } from './datetime.js';
import { initNotes } from './notes.js';
import { bindTagSelector } from './tags.js';
import { bindReferences } from './references.js';

export class TaskController {
  constructor() {
    this.els = collectTaskEls();
    this.viewSettings = loadViewSettings();
    this.tasks = [];
    this.selectedTaskIndex = -1;
    this.selectedTask = null;
    this.dtState = { hour: 9, minute: 0 };
    this.notesEditor = null;
  }

  async init() {
    // Initialize menus and stateful UI
    if (this.els.taskFilterBtn && this.els.taskFilterMenu) {
      this.taskFilterBtn = this.els.taskFilterBtn;
      this.taskFilterMenu = this.els.taskFilterMenu;
      this.groupByOptions = this.els.groupByOptions;
      this.sortByOptions = this.els.sortByOptions;
      this.sortOrderToggle = this.els.sortOrderToggle;
      initFilterMenu(this);
      updateMenuState(this);
      // Button toggle (guard against double-binding)
      if (!this.taskFilterBtn.dataset.bound) {
        this.taskFilterBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const open = this.taskFilterMenu.classList.contains('is-hidden');
          toggleFilterMenu(this, open);
        });
        this.taskFilterBtn.dataset.bound = '1';
      }
    }

    // Load tasks and update counts (read-only for now)
    try {
      const res = await TasksAPI.list();
      this.tasks = res.tasks || [];
      this.render();
      // Ensure panel is hidden initially on page load
      this.hidePanel();
    } catch (e) {
      notify(`Error loading tasks: ${e.message}`, 'error');
    }

    // Bind basic interactions (quick add + preview) only if legacy manager isn't active
    if (!window.taskManager) {
      bindQuickAdd(this);
      bindPreview(this);
      bindBucketToggles(this);
      bindKeyboardNavigation(this);
      bindPanelEvents(this);
      bindDateTime(this);
      bindTagSelector(this);
      bindReferences(this);
    }
  }

  refreshCounts() {
    updateCountsUI(this.tasks, {
      today: this.els.todayCount,
      tomorrow: this.els.tomorrowCount,
      next7days: this.els.next7daysCount,
      completed: this.els.completedCount,
    });
  }

  persistView() {
    saveViewSettings(this.viewSettings);
  }

  async reloadTasks() {
    try {
      const res = await TasksAPI.list();
      this.tasks = res.tasks || [];
      this.render();
      // If selection is no longer valid, hide the panel
      if (!this.selectedTask || !this.tasks.find((t) => String(t.id) === String(this.selectedTask.id))) {
        this.hidePanel();
      }
    } catch (e) {
      // ignore
    }
  }

  render() {
    const group = (this.viewSettings && this.viewSettings.groupBy) || 'date';
    if (group === 'date') {
      if (this.els.dateBucketsContainer) this.els.dateBucketsContainer.classList.remove('is-hidden');
      if (this.els.dynamicTaskList) this.els.dynamicTaskList.classList.add('is-hidden');
      renderBuckets(this);
    } else {
      if (this.els.dateBucketsContainer) this.els.dateBucketsContainer.classList.add('is-hidden');
      if (this.els.dynamicTaskList) this.els.dynamicTaskList.classList.remove('is-hidden');
      renderGrouped(this);
    }
    this.refreshCounts();
    this.wireRowClicks();
  }

  hidePanel() {
    // Reset current selection and hide the panel/drawer
    this.selectedTask = null;
    const { taskPanelOverlay, taskRightPanel, taskDetailsPanel, panelEmptyState } = this.els;
    const layout = document.querySelector('.task-editor-layout');
    if (layout) layout.classList.remove('with-details');
    if (taskRightPanel) taskRightPanel.classList.remove('open');
    if (taskPanelOverlay) taskPanelOverlay.classList.add('is-hidden');
    if (taskDetailsPanel) taskDetailsPanel.classList.add('is-hidden');
    if (panelEmptyState) panelEmptyState.classList.remove('is-hidden');
  }

  wireRowClicks() {
    const sec = document.getElementById('tasksSection');
    if (!sec) return;
    sec.querySelectorAll('.task-row').forEach((row) => {
      if (row.dataset.bound) return;
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-task-id');
        const t = (this.tasks || []).find((x) => String(x.id) === String(id));
        if (!t) return;
        this.selectTask(t);
      });
      const cb = row.querySelector('.task-row-toggle');
      if (cb && !cb.dataset.bound) {
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', async (e) => {
          e.stopPropagation();
          const id = row.getAttribute('data-task-id');
          const t = (this.tasks || []).find((x) => String(x.id) === String(id));
          if (!t) return;
          const newStatus = e.target.checked ? 'completed' : 'pending';
          try {
            await TasksAPI.update(t.id, { status: newStatus });
            await this.reloadTasks();
          } catch (_) {
            // revert checkbox on failure
            e.target.checked = !e.target.checked;
          }
        });
        cb.dataset.bound = '1';
      }
      row.dataset.bound = '1';
    });
  }

  selectTask(task) {
    this.selectedTask = task;
    // Initialize dtState based on task due_date
    if (task && task.due_date) {
      const d = new Date(task.due_date);
      if (!isNaN(d)) {
        this.dtState.hour = d.getHours();
        this.dtState.minute = d.getMinutes();
      }
    }
    const sec = document.getElementById('tasksSection');
    if (!sec) return;
    sec.querySelectorAll('.task-row').forEach((r) => r.classList.remove('selected'));
    const row = sec.querySelector(`.task-row[data-task-id="${task.id}"]`);
    if (row) row.classList.add('selected');
    showTaskPanel(this, task);
    initNotes(this, task);
  }

  scheduleAutoSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveTaskChanges(), 1500);
  }

  async saveTaskChanges() {
    if (!this.selectedTask) return;
    const payload = { title: this.els.taskTitleInput ? this.els.taskTitleInput.value : this.selectedTask.title };
    try {
      if (this.notesEditor && typeof this.notesEditor.save === 'function') {
        const notesData = await this.notesEditor.save();
        payload.notes = notesData;
      }
    } catch (_) {}
    try {
      await TasksAPI.update(this.selectedTask.id, payload);
      await this.reloadTasks();
      const updated = (this.tasks || []).find((t) => String(t.id) === String(this.selectedTask.id));
      if (updated) this.selectTask(updated);
    } catch (e) {
      // ignore transient errors
    }
  }
}

export function bootstrapTasksController() {
  const section = document.getElementById('tasksSection');
  if (!section) return null;
  const ctrl = new TaskController();
  ctrl.init();
  return ctrl;
}

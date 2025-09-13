import { CLASSES } from '../constants/classes.js';
import { show, hide } from '../utils/dom.js';
import { apiCall, TasksAPI } from './api.js';
import { notify } from './notifications.js';
import { parseTaskDate, formatDateForInput, formatTimeForInput } from './dates.js';
import { formatPreviewText } from './preview.js';
import { loadViewSettings as _loadViewSettings, saveViewSettings as _saveViewSettings, saveBucketStates as _saveBucketStates } from './state.js';
import { updateCountsUI, setDateTimeDisplay } from './view.js';
import { toggleFilterMenu, initFilterMenu, updateMenuState } from './filters.js';
import { TaskController, bootstrapTasksController } from './controller.js';

function patchLegacyTaskManager() {
  const TM = window.TaskManager;
  if (!TM || TM.__patched) return;
  try {
    TM.prototype.apiCall = apiCall;
    TM.prototype.showNotification = notify;
    TM.prototype.parseTaskDate = parseTaskDate;
    TM.prototype.formatDateForInput = formatDateForInput;
    TM.prototype.formatTimeForInput = formatTimeForInput;
    TM.prototype.formatPreviewText = formatPreviewText;
    TM.prototype.loadViewSettings = _loadViewSettings;
    TM.prototype.saveViewSettings = function() { _saveViewSettings(this.viewSettings); };
    TM.prototype.saveBucketStates = function() { _saveBucketStates(this.bucketStates); };
    TM.prototype.updateCounts = function() {
      updateCountsUI(this.tasks, {
        today: this.todayCount,
        tomorrow: this.tomorrowCount,
        next7days: this.next7daysCount,
        completed: this.completedCount,
      });
    };
    TM.prototype.updateDateTimeDisplay = function(task) {
      setDateTimeDisplay(task, this.taskDateTimeDisplay);
    };
    TM.prototype.toggleFilterMenu = function(open) { toggleFilterMenu(this, open); };
    TM.prototype.initFilterMenu = function() { initFilterMenu(this); };
    TM.prototype.updateMenuState = function() { updateMenuState(this); };
    TM.__patched = true;
    console.debug('[tasks] Patched legacy TaskManager with modular api/notify');
  } catch (e) {
    console.warn('[tasks] Failed to patch legacy TaskManager', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  patchLegacyTaskManager();
  if (window.__USE_TASKS_CONTROLLER__ === true) {
    try { window.TasksController = bootstrapTasksController(); } catch (e) { console.warn('TasksController init failed', e); }
  }
});

// Expose small surface for progressive migration/testing
window.TasksUtils = { CLASSES, show, hide, apiCall, TasksAPI, notify, parseTaskDate, formatDateForInput, formatTimeForInput, formatPreviewText, TaskController, bootstrapTasksController };

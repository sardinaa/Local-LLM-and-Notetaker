(function () {
  'use strict';

  const CLASSES = {
    isHidden: 'is-hidden',
    active: 'active',
    selected: 'selected',
  };

  const show = (el) => { if (el) el.classList.remove('is-hidden'); };
  const hide = (el) => { if (el) el.classList.add('is-hidden'); };

  async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    if (data) options.body = JSON.stringify(data);

    const res = await fetch(endpoint, options);
    let json;
    try {
      json = await res.json();
    } catch (e) {
      json = {};
    }
    if (!res.ok) {
      const msg = json?.error || `API Error ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  // Convenience wrappers (optional use)
  const TasksAPI = {
    list: () => apiCall('/api/tasks'),
    stats: () => apiCall('/api/tasks/stats'),
    quickCreate: (text) => apiCall('/api/tasks/quick-create', 'POST', { text }),
    parsePreview: (text) => apiCall('/api/tasks/parse-preview', 'POST', { text }),
    create: (payload) => apiCall('/api/tasks', 'POST', payload),
    update: (id, payload) => apiCall(`/api/tasks/${id}`, 'PUT', payload),
    remove: (id) => apiCall(`/api/tasks/${id}`, 'DELETE'),
  };

  function notify(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `task-notification task-notification-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'task-slide-out 0.25s ease';
      setTimeout(() => el.remove(), 250);
    }, 3000);
  }

  // Date helpers to avoid timezone off-by-one issues
  function parseTaskDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes('T')) {
      return new Date(dateStr);
    }
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3) {
      const [y, m, d] = parts;
      if (y && m && d) return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    return new Date(dateStr);
  }

  function formatDateForInput(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatTimeForInput(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function formatPreviewText(preview) {
    let html = `<strong>Título:</strong> ${preview.title || 'Sin título'}<br>`;

    if (preview.description) {
      html += `<strong>Descripción:</strong> ${preview.description}<br>`;
    }

    if (preview.due_date) {
      const d = parseTaskDate(preview.due_date);
      html += `<strong>Fecha:</strong> ${d ? d.toLocaleString('es-ES') : preview.due_date}<br>`;
    }

    if (preview.priority) {
      const priorityEmoji = {
        urgente: '🔥',
        alta: '🔴',
        media: '🟡',
        baja: '🟢',
      };
      html += `<strong>Prioridad:</strong> ${priorityEmoji[preview.priority] || ''} ${preview.priority}<br>`;
    }

    if (preview.tags && preview.tags.length > 0) {
      html += `<strong>Etiquetas:</strong> ${preview.tags.map((tag) => `#${tag}`).join(', ')}<br>`;
    }

    if (preview.repeat_pattern) {
      html += `<strong>Repetición:</strong> ${preview.repeat_pattern}<br>`;
    }

    return html;
  }

  const VIEW_KEY = 'task.view';
  const BUCKET_KEY = 'taskBucketStates';

  function loadViewSettings() {
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
      return {
        groupBy: v.groupBy || 'date',
        sortBy: v.sortBy || 'date',
        sortOrder: v.sortOrder || 'asc',
      };
    } catch {
      return { groupBy: 'date', sortBy: 'date', sortOrder: 'asc' };
    }
  }

  function saveViewSettings(viewSettings) {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(viewSettings)); } catch {}
  }

  function saveBucketStates(bucketStates) {
    try { localStorage.setItem(BUCKET_KEY, JSON.stringify(bucketStates)); } catch {}
  }

  function updateCountsUI(tasks, els) {
    const counts = { today: 0, tomorrow: 0, next7days: 0, completed: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const next7days = new Date(today);
    next7days.setDate(today.getDate() + 7);

    (tasks || []).forEach((task) => {
      if (task.status === 'completed') {
        counts.completed++;
        return;
      }

      if (task.due_date) {
        const dueDate = parseTaskDate(task.due_date);
        if (dueDate && !isNaN(dueDate)) {
          const d = new Date(dueDate);
          d.setHours(0, 0, 0, 0);
          if (d.getTime() === today.getTime()) counts.today++;
          else if (d.getTime() === tomorrow.getTime()) counts.tomorrow++;
          else if (d <= next7days) counts.next7days++;
          else counts.next7days++;
        } else {
          counts.today++;
        }
      } else {
        counts.today++;
      }
    });

    if (els?.today) els.today.textContent = counts.today;
    if (els?.tomorrow) els.tomorrow.textContent = counts.tomorrow;
    if (els?.next7days) els.next7days.textContent = counts.next7days;
    if (els?.completed) els.completed.textContent = counts.completed;
  }

  function setDateTimeDisplay(task, container) {
    if (!container) return;
    const dateSpan = container.querySelector('.task-date');
    const timeSpan = container.querySelector('.task-time');
    if (!dateSpan || !timeSpan) return;

    if (task?.due_date) {
      const dueDate = new Date(task.due_date);
      dateSpan.textContent = dueDate.toLocaleDateString('es-ES');
      timeSpan.textContent = dueDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } else {
      dateSpan.textContent = 'Sin fecha';
      timeSpan.textContent = '';
    }
  }

  function toggleFilterMenu(tm, open) {
    const menu = tm.taskFilterMenu;
    const btn = tm.taskFilterBtn;
    if (!menu || !btn) return;
    const willOpen = typeof open === 'boolean' ? open : menu.classList.contains('is-hidden');
    menu.classList.toggle('is-hidden', !willOpen);
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen) {
      const first = menu.querySelector('.filter-option');
      if (first) first.focus();
    }
  }

  function initFilterMenu(tm) {
    const wire = (container, key, dataAttr) => {
      if (!container) return;
      container.querySelectorAll('.filter-option').forEach((el) => {
        el.setAttribute('tabindex', '0');
        el.addEventListener('click', () => {
          const val = el.dataset[dataAttr];
          tm.viewSettings[key] = val;
          try { localStorage.setItem('task.view', JSON.stringify(tm.viewSettings)); } catch {}
          updateMenuState(tm);
          if (typeof tm.render === 'function') tm.render();
          else if (typeof tm.renderTaskView === 'function') tm.renderTaskView();
          if (typeof tm.hidePanel === 'function') tm.hidePanel();
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.click();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const items = Array.from(container.querySelectorAll('.filter-option'));
            const idx = items.indexOf(el);
            const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
            items[next].focus();
          } else if (e.key === 'Escape') {
            toggleFilterMenu(tm, false);
          }
        });
      });
    };

    wire(tm.groupByOptions, 'groupBy', 'group');
    wire(tm.sortByOptions, 'sortBy', 'sort');

      if (tm.sortOrderToggle) {
        tm.sortOrderToggle.addEventListener('click', () => {
          tm.viewSettings.sortOrder = tm.viewSettings.sortOrder === 'asc' ? 'desc' : 'asc';
          try { localStorage.setItem('task.view', JSON.stringify(tm.viewSettings)); } catch {}
          updateMenuState(tm);
          if (typeof tm.render === 'function') tm.render();
          else if (typeof tm.renderTaskView === 'function') tm.renderTaskView();
          if (typeof tm.hidePanel === 'function') tm.hidePanel();
        });
      }
  }

  function updateMenuState(tm) {
    const { groupByOptions, sortByOptions, sortOrderToggle, viewSettings } = tm;
    if (groupByOptions) {
      groupByOptions.querySelectorAll('.filter-option').forEach((el) => {
        const checked = el.dataset.group === viewSettings.groupBy;
        el.setAttribute('aria-checked', checked ? 'true' : 'false');
      });
    }
    if (sortByOptions) {
      sortByOptions.querySelectorAll('.filter-option').forEach((el) => {
        const checked = el.dataset.sort === viewSettings.sortBy;
        el.setAttribute('aria-checked', checked ? 'true' : 'false');
      });
    }
    if (sortOrderToggle) {
      sortOrderToggle.setAttribute('data-order', viewSettings.sortOrder);
    }
  }

  // Gather and return key task-related DOM elements.
  function collectTaskEls(root = document) {
    const byId = (id) => root.getElementById(id);
    return {
      // Counts
      todayCount: byId('todayCount'),
      tomorrowCount: byId('tomorrowCount'),
      next7daysCount: byId('next7daysCount'),
      completedCount: byId('completedCount'),

      // Filter Menu
      taskFilterBtn: byId('taskFilterBtn'),
      taskFilterMenu: byId('taskFilterMenu'),
      groupByOptions: byId('groupByOptions'),
      sortByOptions: byId('sortByOptions'),
      sortOrderToggle: byId('sortOrderToggle'),

      // Right panel date/time display
      taskDateTimeDisplay: byId('taskDateTimeDisplay'),

      // Quick add + preview (used in both legacy and modern UIs)
      quickTaskInput: byId('quickTaskInput'),
      quickTaskPreview: byId('quickTaskPreview'),
      quickTaskSubmit: byId('quickTaskSubmit'),
      taskPreview: byId('taskPreview'),
      previewText: byId('previewText'),
      confidenceFill: byId('confidenceFill'),
      confidenceValue: byId('confidenceValue'),

      // Preview actions
      previewEdit: byId('previewEdit'),
      previewSave: byId('previewSave'),

      // Buckets containers
      dynamicTaskList: byId('dynamicTaskList'),
      dateBucketsContainer: byId('dateBucketsContainer'),
      todayTasks: byId('todayTasks'),
      tomorrowTasks: byId('tomorrowTasks'),
      next7daysTasks: byId('next7daysTasks'),
      completedTasksContainer: (function() {
        // Avoid duplicate id collision; prefer bucket container within tasks section
        const tasksSection = root.getElementById('tasksSection');
        return tasksSection ? tasksSection.querySelector('.completed-bucket .bucket-content#completedTasks') : byId('completedTasks');
      })(),

      // Right panel elements
      taskPanelOverlay: byId('taskPanelOverlay'),
      taskPanelClose: byId('taskPanelClose'),
      taskRightPanel: root.querySelector('.task-right-panel'),
      taskDetailsPanel: byId('taskDetailsPanel'),
      panelEmptyState: byId('panelEmptyState'),
      taskCompleteToggle: byId('taskCompleteToggle'),
      prioritySelector: byId('prioritySelector'),
      taskTitleInput: byId('taskTitleInput'),
      // Tag selector
      taskTagPill: byId('taskTagPill'),
      taskTagSelector: byId('taskTagSelector'),
      recentTagsEl: byId('recentTags'),
      tagSearchInput: byId('tagSearchInput'),
      tagSuggestionsEl: byId('tagSuggestions'),
      quickInboxBtn: byId('quickInboxBtn'),
      filesSection: byId('filesSection'),
      filesCount: byId('filesCount'),
      filesCountBtn: byId('filesCountBtn'),
      filesQuickPreview: byId('filesQuickPreview'),
      closePreviewBtn: byId('closePreviewBtn'),
      quickPreviewList: byId('quickPreviewList'),
      noAttachments: byId('noAttachments'),
      addReferenceBtn: byId('addReferenceBtn'),
      fileInput: byId('fileInput'),

      // Reference selection modal
      referenceSelectionModal: byId('referenceSelectionModal'),
      referenceSelectionModalClose: byId('referenceSelectionModalClose'),
      uploadFilesBtn: byId('uploadFilesBtn'),
      linkNotesBtn: byId('linkNotesBtn'),
      referencesContainer: byId('referencesContainer'),
      referencesCount: byId('referencesCount'),

      // Note selection modal inside references
      noteSelectionModal: byId('noteSelectionModal'),
      noteSelectionModalClose: byId('noteSelectionModalClose'),
      noteSearchInput: byId('noteSearchInput'),
      noteSelectionConfirm: byId('noteSelectionConfirm'),

      // Date-time picker
      dateTimePicker: byId('dateTimePicker'),
      dtTimePanel: byId('dtTimePanel'),
      hourToggleBtn: byId('hourToggleBtn'),
      repeatToggleBtn: byId('repeatToggleBtn'),
      repeatMenu: byId('repeatMenu'),
      setTimeBtn: byId('setTimeBtn'),
      hourMinus: byId('hourMinus'),
      hourPlus: byId('hourPlus'),
      minuteMinus: byId('minuteMinus'),
      minutePlus: byId('minutePlus'),
      timeHour: byId('timeHour'),
      timeMinute: byId('timeMinute'),
      // Calendar elements
      calPrev: byId('calPrev'),
      calNext: byId('calNext'),
      calMonthLabel: byId('calMonthLabel'),
      calendarGrid: byId('calendarGrid'),
      monthYearPicker: byId('monthYearPicker'),
      monthsGrid: byId('monthsGrid'),
      yearInput: byId('yearInput'),
      yearUp: byId('yearUp'),
      yearDown: byId('yearDown'),
    };
  }

  function showPreview(ctrl, preview) {
    const { taskPreview, quickTaskPreview, previewText, confidenceFill, confidenceValue } = ctrl.els;
    if (!taskPreview || !quickTaskPreview || !previewText) return;
    previewText.innerHTML = formatPreviewText(preview);
    const conf = Math.round((preview.confidence || 0) * 100);
    if (confidenceFill) confidenceFill.style.width = conf + '%';
    if (confidenceValue) confidenceValue.textContent = conf + '%';
    taskPreview.classList.remove('is-hidden');
    quickTaskPreview.classList.add('active');
  }

  function hidePreview(ctrl) {
    const { taskPreview, quickTaskPreview } = ctrl.els;
    if (taskPreview) taskPreview.classList.add('is-hidden');
    if (quickTaskPreview) quickTaskPreview.classList.remove('active');
  }

  function renderTaskRow(task) {
    const isCompleted = task.status === 'completed';
    const dueDate = task.due_date ? new Date(task.due_date) : null;
    const now = new Date();
    const isOverdue = dueDate && dueDate < now && !isCompleted;
    const timeStr = dueDate
      ? dueDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '';

    const meta = [];
    if (timeStr) meta.push(`<span class="task-row-time ${isOverdue ? 'overdue' : ''}">${timeStr}</span>`);
    if (task.priority) meta.push(`<span class="task-row-priority ${task.priority}">${task.priority}</span>`);
    if (task.tags && task.tags.length > 0) {
      task.tags.slice(0, 3).forEach((tag) => {
        const tagName = typeof tag === 'object' ? tag.name : tag;
        meta.push(`<span class="task-row-tag">${tagName}</span>`);
      });
      if (task.tags.length > 3) meta.push(`<span class="task-row-tag">+${task.tags.length - 3}</span>`);
    }
    const metaStr = meta.length ? `<div class="task-row-meta">${meta.join('')}</div>` : '';

    return `
    <div class="task-row ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}">
      <div class="task-row-checkbox">
        <input type="checkbox" class="task-row-toggle" ${isCompleted ? 'checked' : ''} aria-label="Marcar como completada">
      </div>
      <div class="task-row-main">
        <div class="task-row-content">
          <span class="task-row-title ${isCompleted ? 'completed' : ''}">${escapeHtml$4(task.title || '')}</span>
        </div>
        ${metaStr}
      </div>
    </div>
  `;
  }

  function renderBuckets(ctrl) {
    const { todayTasks, tomorrowTasks, next7daysTasks, completedTasksContainer } = ctrl.els;
    if (!todayTasks || !tomorrowTasks || !next7daysTasks || !completedTasksContainer) return;
    const groups = bucketTasksByDate(ctrl.tasks || []);
    todayTasks.innerHTML = groups.today.map(renderTaskRow).join('');
    tomorrowTasks.innerHTML = groups.tomorrow.map(renderTaskRow).join('');
    next7daysTasks.innerHTML = groups.next7days.map(renderTaskRow).join('');
    completedTasksContainer.innerHTML = groups.completed.map(renderTaskRow).join('');
  }

  function renderGrouped(ctrl) {
    const listEl = ctrl.els.dynamicTaskList;
    const bucketsEl = ctrl.els.dateBucketsContainer;
    if (!listEl || !bucketsEl) return;
    // Hide date buckets, show grouped list
    bucketsEl.classList.add('is-hidden');
    listEl.classList.remove('is-hidden');

    const tasks = sortTasks(ctrl.tasks || [], ctrl.viewSettings);
    const group = (ctrl.viewSettings && ctrl.viewSettings.groupBy) || 'list';
    let groups = [];
    if (group === 'list') {
      groups = [
        { key: 'All', items: tasks.filter((t) => t.status !== 'completed') },
        { key: 'Completed', items: tasks.filter((t) => t.status === 'completed') },
      ];
    } else if (group === 'priority') {
      const order = ['urgente', 'alta', 'media', 'baja'];
      groups = order.map((p) => ({ key: (p || 'none').toUpperCase(), items: tasks.filter((t) => (t.priority || '') === p) }));
      groups.push({ key: 'NONE', items: tasks.filter((t) => !t.priority) });
    } else if (group === 'tag') {
      const map = new Map();
      tasks.forEach((t) => {
        const tag = t.tags && t.tags.length ? (typeof t.tags[0] === 'object' ? t.tags[0].name || '' : String(t.tags[0])) : 'Untagged';
        if (!map.has(tag)) map.set(tag, []);
        map.get(tag).push(t);
      });
      groups = Array.from(map.entries()).map(([key, items]) => ({ key, items }));
      groups.sort((a, b) => a.key.localeCompare(b.key));
    }

    listEl.innerHTML = groups
      .map((g) => `
      <div class="task-bucket" data-group-section>
        <div class="bucket-header" tabindex="0">
          <div class="bucket-toggle">
            <i class="fas fa-chevron-down bucket-arrow"></i>
            <span class="bucket-title">${escapeHtml$4(g.key)}</span>
            <span class="bucket-count">${g.items.length}</span>
          </div>
        </div>
        <div class="bucket-content">
          ${g.items.map(renderTaskRow).join('')}
        </div>
      </div>
    `)
      .join('');

    // Header fold toggles
    listEl.querySelectorAll('.bucket-header').forEach((h) => {
      h.addEventListener('click', (e) => {
        const header = e.currentTarget;
        const content = header.parentElement.querySelector('.bucket-content');
        const arrow = header.querySelector('.bucket-arrow');
        const hidden = content.classList.toggle('is-hidden');
        if (arrow) arrow.style.transform = hidden ? 'rotate(-90deg)' : '';
      });
    });
  }

  function sortTasks(list, viewSettings) {
    const by = (viewSettings && viewSettings.sortBy) || 'date';
    const dir = (viewSettings && viewSettings.sortOrder) === 'desc' ? -1 : 1;
    const pri = { urgente: 3, alta: 2, media: 1, baja: 0 };
    const getTag = (t) => {
      if (!t.tags || !t.tags.length) return '';
      const first = t.tags[0];
      return typeof first === 'object' ? first.name || '' : String(first);
    };
    const getDate = (t) => (t.due_date ? new Date(t.due_date).getTime() : Number.POSITIVE_INFINITY);
    return (list || []).slice().sort((a, b) => {
      let va, vb;
      if (by === 'title') {
        va = (a.title || '').toLowerCase();
        vb = (b.title || '').toLowerCase();
      } else if (by === 'priority') {
        va = pri[a.priority || ''] ?? -1;
        vb = pri[b.priority || ''] ?? -1;
      } else if (by === 'tag') {
        va = getTag(a).toLowerCase();
        vb = getTag(b).toLowerCase();
      } else {
        va = getDate(a);
        vb = getDate(b);
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }

  function bucketTasksByDate(tasks) {
    const out = { today: [], tomorrow: [], next7days: [], completed: [] };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tmr = new Date(today);
    tmr.setDate(today.getDate() + 1);
    const next7 = new Date(today);
    next7.setDate(today.getDate() + 7);
    (tasks || []).forEach((task) => {
      if (task.status === 'completed') {
        out.completed.push(task);
        return;
      }
      if (!task.due_date) {
        out.today.push(task);
        return;
      }
      const d = parseTaskDate(task.due_date);
      if (!(d instanceof Date) || isNaN(d)) {
        out.today.push(task);
        return;
      }
      const dd = new Date(d);
      dd.setHours(0, 0, 0, 0);
      if (dd.getTime() === today.getTime()) out.today.push(task);
      else if (dd.getTime() === tmr.getTime()) out.tomorrow.push(task);
      else if (dd <= next7) out.next7days.push(task);
      else out.next7days.push(task);
    });
    return out;
  }

  function escapeHtml$4(str) {
    return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  function updateTagPillDisplay(ctrl, task) {
    const pill = ctrl.els.taskTagPill;
    if (!pill) return;
    const tags = task?.tags || [];
    const tagName = tags.length ? (typeof tags[0] === 'object' ? tags[0].name : tags[0]) : '';
    if (tagName) {
      pill.textContent = tagName;
      pill.classList.remove('muted');
      pill.title = `Primary tag: ${tagName}`;
    } else {
      pill.textContent = 'Add tag';
      pill.classList.add('muted');
      pill.title = 'Set primary tag';
    }
  }

  function bindTagSelector(ctrl) {
    const { taskTagPill, taskTagSelector, quickInboxBtn, tagSearchInput } = ctrl.els;
    if (taskTagPill && taskTagSelector && !taskTagPill.dataset.bound) {
      taskTagPill.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelector(ctrl, !isOpen(ctrl));
      });
      taskTagPill.dataset.bound = '1';
    }
    if (quickInboxBtn && !quickInboxBtn.dataset.bound) {
      quickInboxBtn.addEventListener('click', async () => {
        await setPrimaryTag(ctrl, 'Inbox');
        toggleSelector(ctrl, false);
      });
      quickInboxBtn.dataset.bound = '1';
    }
    if (tagSearchInput && !tagSearchInput.dataset.bound) {
      tagSearchInput.addEventListener('input', () => updateSuggestions(ctrl));
      tagSearchInput.addEventListener('keydown', (e) => handleSuggestionKeys(ctrl, e));
      tagSearchInput.dataset.bound = '1';
    }
    // Close on outside click
    document.addEventListener('click', (e) => {
      const open = isOpen(ctrl);
      if (!open) return;
      const sel = ctrl.els.taskTagSelector;
      const pill = ctrl.els.taskTagPill;
      if (!sel) return;
      if (sel.contains(e.target) || pill?.contains(e.target)) return;
      toggleSelector(ctrl, false);
    }, true);
  }

  function isOpen(ctrl) {
    const sel = ctrl.els.taskTagSelector;
    return !!(sel && !sel.classList.contains('is-hidden'));
  }

  function toggleSelector(ctrl, open) {
    const sel = ctrl.els.taskTagSelector;
    if (!sel) return;
    sel.classList.toggle('is-hidden', !open);
    if (open) {
      renderRecentTags(ctrl);
      updateSuggestions(ctrl);
      setTimeout(() => ctrl.els.tagSearchInput?.focus(), 0);
      positionSelector(ctrl);
    }
  }

  function positionSelector(ctrl) {
    const sel = ctrl.els.taskTagSelector;
    const pill = ctrl.els.taskTagPill;
    if (!sel || !pill || sel.classList.contains('is-hidden')) return;
    const rect = pill.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const width = Math.min(280, vw - margin * 2);
    const left = Math.min(vw - margin - width, Math.max(margin, rect.left));
    sel.style.left = `${left}px`;
    sel.style.right = 'auto';
    sel.style.width = `${width}px`;
    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const placeAbove = spaceBelow < 320 && spaceAbove > spaceBelow;
    const maxH = Math.min(Math.floor(vh * 0.85), placeAbove ? Math.max(220, spaceAbove) : Math.max(220, spaceBelow));
    sel.style.maxHeight = `${maxH}px`;
    if (placeAbove) {
      sel.style.top = `${rect.top - margin}px`;
      sel.classList.add('placement-top');
      sel.classList.remove('placement-bottom');
      sel.style.transform = 'translateY(-100%)';
    } else {
      sel.style.top = `${rect.bottom + margin}px`;
      sel.classList.add('placement-bottom');
      sel.classList.remove('placement-top');
      sel.style.transform = 'none';
    }
  }

  function getRecent(ctrl) {
    try { return JSON.parse(localStorage.getItem('taskRecentTags') || '[]'); } catch { return []; }
  }
  function saveRecent(ctrl, list) {
    try { localStorage.setItem('taskRecentTags', JSON.stringify(list.slice(0, 10))); } catch {}
  }
  function bumpRecent(ctrl, name) {
    const key = (name || '').trim();
    if (!key) return;
    const now = Date.now();
    const list = getRecent();
    const idx = list.findIndex((t) => (t.name || '').toLowerCase() === key.toLowerCase());
    if (idx >= 0) {
      list[idx].lastUsed = now;
      list[idx].count = (list[idx].count || 0) + 1;
    } else {
      list.unshift({ name: key, lastUsed: now, count: 1 });
    }
    saveRecent(ctrl, list);
  }

  function renderRecentTags(ctrl) {
    const el = ctrl.els.recentTagsEl;
    if (!el) return;
    el.innerHTML = '';
    const list = getRecent();
    list.slice(0, 10).forEach((t) => {
      const pill = document.createElement('button');
      pill.className = 'selector-pill';
      pill.textContent = t.name;
      pill.addEventListener('click', async () => {
        await setPrimaryTag(ctrl, t.name);
        toggleSelector(ctrl, false);
      });
      el.appendChild(pill);
    });
  }

  async function listTagsAPI(q) {
    const url = `/api/tags${q ? `?q=${encodeURIComponent(q)}&limit=50&includeUsage=true` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.tags || [];
  }

  async function createTagAPI(name) {
    const res = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    try { return await res.json(); } catch { return null; }
  }

  async function setPrimaryTag(ctrl, name) {
    const tagName = (name || '').trim();
    if (!ctrl.selectedTask || !tagName) return;
    try {
      await TasksAPI.update(ctrl.selectedTask.id, { tags: [tagName] });
      ctrl.selectedTask.tags = [tagName];
      updateTagPillDisplay(ctrl, ctrl.selectedTask);
      bumpRecent(ctrl, tagName);
      notify('Etiqueta actualizada', 'success');
    } catch (e) {
      notify('Error al actualizar etiqueta', 'error');
    }
  }

  async function updateSuggestions(ctrl) {
    const input = ctrl.els.tagSearchInput;
    const listEl = ctrl.els.tagSuggestionsEl;
    if (!input || !listEl) return;
    const q = input.value.trim();
    const tags = await listTagsAPI(q);
    const current = ctrl.selectedTask?.tags || [];
    const chosen = new Set();
    if (current.length) {
      const t = typeof current[0] === 'object' ? current[0].name : current[0];
      if (t) chosen.add(String(t).toLowerCase());
    }
    const filtered = tags.filter((t) => !chosen.has((t.name || '').toLowerCase()));
    renderSuggestions(ctrl, filtered, q);
  }

  function renderSuggestions(ctrl, list, query) {
    const el = ctrl.els.tagSuggestionsEl;
    if (!el) return;
    el.innerHTML = '';
    const q = (query || '').trim();
    let index = 0;
    const hasExact = list.some((t) => (t.name || '').toLowerCase() === q.toLowerCase());
    if (q && validateTagName(q) && !hasExact) {
      const create = document.createElement('div');
      create.className = 'selector-suggestion create';
      create.innerHTML = `Create "${escapeHtml$3(q)}"`;
      create.setAttribute('role', 'option');
      create.dataset.index = String(index++);
      create.addEventListener('click', async () => {
        const created = await createTagAPI(q);
        if (created?.name) {
          await setPrimaryTag(ctrl, created.name);
          toggleSelector(ctrl, false);
        }
      });
      el.appendChild(create);
    }
    list
      .sort((a, b) => (b.usage || 0) - (a.usage || 0))
      .slice(0, 20)
      .forEach((t) => {
        const item = document.createElement('div');
        item.className = 'selector-suggestion';
        item.setAttribute('role', 'option');
        item.dataset.index = String(index++);
        item.innerHTML = `<span>${escapeHtml$3(t.name)}</span>${t.usage ? `<span class="muted" style="margin-left:auto;">${t.usage}</span>` : ''}`;
        item.addEventListener('click', async () => {
          await setPrimaryTag(ctrl, t.name);
          toggleSelector(ctrl, false);
        });
        el.appendChild(item);
      });
    ctrl._suggestionIndex = Math.min(ctrl._suggestionIndex || 0, index - 1);
    highlightSuggestion(ctrl);
  }

  function handleSuggestionKeys(ctrl, e) {
    const el = ctrl.els.tagSuggestionsEl;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll('.selector-suggestion'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!nodes.length) return;
      ctrl._suggestionIndex = Math.min((ctrl._suggestionIndex || 0) + 1, nodes.length - 1);
      highlightSuggestion(ctrl);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!nodes.length) return;
      ctrl._suggestionIndex = Math.max((ctrl._suggestionIndex || 0) - 1, 0);
      highlightSuggestion(ctrl);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (nodes.length && ctrl._suggestionIndex >= 0) {
        nodes[ctrl._suggestionIndex].click();
      } else {
        const q = ctrl.els.tagSearchInput?.value?.trim();
        if (validateTagName(q)) {
          setPrimaryTag(ctrl, q);
          toggleSelector(ctrl, false);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      toggleSelector(ctrl, false);
    }
  }

  function highlightSuggestion(ctrl) {
    const el = ctrl.els.tagSuggestionsEl;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll('.selector-suggestion'));
    nodes.forEach((n) => n.classList.remove('active'));
    if (nodes.length && ctrl._suggestionIndex >= 0 && ctrl._suggestionIndex < nodes.length) {
      nodes[ctrl._suggestionIndex].classList.add('active');
      const c = nodes[ctrl._suggestionIndex];
      const top = c.offsetTop;
      const bottom = top + c.offsetHeight;
      if (top < el.scrollTop) el.scrollTop = top;
      if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    }
  }

  function validateTagName(s) {
    const v = (s || '').trim();
    return v.length > 0 && v.length < 64;
  }

  function escapeHtml$3(str) {
    return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  function showTaskPanel(ctrl, task) {
    const { taskPanelOverlay, taskRightPanel, taskDetailsPanel, panelEmptyState, taskCompleteToggle, taskTitleInput } = ctrl.els;
    if (!taskDetailsPanel) return;
    taskDetailsPanel.classList.remove('is-hidden');
    if (panelEmptyState) panelEmptyState.classList.add('is-hidden');
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

function updateFilesDisplay(ctrl, refsOrFiles) {
  const { filesCount, filesQuickPreview, quickPreviewList, noAttachments } = ctrl.els;
  const files = Array.isArray(refsOrFiles) ? refsOrFiles : (refsOrFiles && typeof refsOrFiles === 'object' && Array.isArray(refsOrFiles.files) ? refsOrFiles.files : []);
  const notes = Array.isArray(refsOrFiles) ? [] : (refsOrFiles && typeof refsOrFiles === 'object' && Array.isArray(refsOrFiles.notes) ? refsOrFiles.notes : []);
  const total = (files?.length || 0) + (notes?.length || 0);
  if (filesCount) filesCount.textContent = String(total);
  if (quickPreviewList) {
    const fileItems = (files || []).map((f) => {
      const id = f.id || f.file_id || f.filename || '';
      const name = f.original_name || f.filename || f.name || f.title || 'file';
      const details = f.mime_type ? `<div class="reference-item-details">${escapeHtml$2(f.mime_type)}</div>` : '';
      return `
        <div class="reference-item" data-type="file" data-id="${id}">
          <div class="reference-item-left">
            <span class="reference-item-icon file"><i class="fas fa-file"></i></span>
            <div class="reference-item-content">
              <div class="reference-item-name">${escapeHtml$2(name)}</div>
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
      const details = n.path ? `<div class="reference-item-details">${escapeHtml$2(String(n.path))}</div>` : '';
      return `
        <div class="reference-item" data-type="note" data-id="${id}">
          <div class="reference-item-left">
            <span class="reference-item-icon note"><i class="fas fa-file-alt"></i></span>
            <div class="reference-item-content">
              <div class="reference-item-name">${escapeHtml$2(name)}</div>
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

  function hideTaskPanel(ctrl) {
    const { taskPanelOverlay, taskRightPanel, taskDetailsPanel, panelEmptyState } = ctrl.els;
    const layout = document.querySelector('.task-editor-layout');
    if (layout) layout.classList.remove('with-details');
    if (taskRightPanel) taskRightPanel.classList.remove('open');
    if (taskPanelOverlay) taskPanelOverlay.classList.add('is-hidden');
    if (taskDetailsPanel) taskDetailsPanel.classList.add('is-hidden');
    if (panelEmptyState) panelEmptyState.classList.remove('is-hidden');
  }

  function updatePriorityUI(ctrl, priority) {
    const sel = ctrl.els.prioritySelector;
    if (!sel) return;
    sel.querySelectorAll('.priority-btn').forEach((btn) => btn.classList.remove('active'));
    const active = sel.querySelector(`.priority-btn[data-priority="${priority || ''}"]`);
    if (active) active.classList.add('active');
  }

  function escapeHtml$2(str) {
    return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  function bindQuickAdd(ctrl) {
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

  function bindPreview(ctrl) {
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
      await TasksAPI.quickCreate(text);
      notify('Tarea creada exitosamente', 'success');
      input.value = '';
      hidePreview(ctrl);
      ctrl.currentPreview = null;
      await ctrl.reloadTasks();
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

  function bindBucketToggles(ctrl) {
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

  function bindKeyboardNavigation(ctrl) {
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

  function bindPanelEvents(ctrl) {
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
          if (updated) { showTaskPanel(ctrl, updated); }
        } catch (_) {
          notify('Error removing reference', 'error');
        }
      });
      quickPreviewList.dataset.bound = '1';
    }
  }

  function bindDateTime(ctrl) {
    const {
      taskDateTimeDisplay,
      dateTimePicker,
      dtTimePanel,
      hourToggleBtn,
      repeatToggleBtn,
      repeatMenu,
      setTimeBtn,
      hourMinus,
      hourPlus,
      minuteMinus,
      minutePlus,
      timeHour,
      timeMinute,
      calPrev,
      calNext,
      calMonthLabel,
      calendarGrid,
      monthYearPicker,
      monthsGrid,
      yearInput,
      yearUp,
      yearDown,
    } = ctrl.els;

    if (taskDateTimeDisplay && !taskDateTimeDisplay.dataset.bound) {
      taskDateTimeDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        ensureDtState(ctrl);
        renderCalendar(ctrl);
        if (dtTimePanel) dtTimePanel.classList.add('is-hidden');
        if (repeatMenu) repeatMenu.classList.add('is-hidden');
        toggle(dateTimePicker);
      });
      taskDateTimeDisplay.dataset.bound = '1';
    }

    if (hourToggleBtn && dtTimePanel && !hourToggleBtn.dataset.bound) {
      hourToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle(dtTimePanel);
      });
      hourToggleBtn.dataset.bound = '1';
    }

    if (repeatToggleBtn && repeatMenu && !repeatToggleBtn.dataset.bound) {
      repeatToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle(repeatMenu);
      });
      repeatToggleBtn.dataset.bound = '1';
    }

    if (setTimeBtn && !setTimeBtn.dataset.bound) {
      setTimeBtn.addEventListener('click', async () => {
        await applyTime(ctrl);
      });
      setTimeBtn.dataset.bound = '1';
    }

    // Calendar navigation
    if (calPrev && !calPrev.dataset.bound) {
      calPrev.addEventListener('click', () => shiftCalendar(ctrl, -1));
      calPrev.dataset.bound = '1';
    }
    if (calNext && !calNext.dataset.bound) {
      calNext.addEventListener('click', () => shiftCalendar(ctrl, 1));
      calNext.dataset.bound = '1';
    }
    if (calMonthLabel && monthYearPicker && !calMonthLabel.dataset.bound) {
      calMonthLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = monthYearPicker.classList.contains('is-hidden');
        monthYearPicker.classList.toggle('is-hidden', !willShow);
        if (yearInput) yearInput.value = String(ctrl.dtState.viewYear || new Date().getFullYear());
        if (monthsGrid) {
          monthsGrid.querySelectorAll('button').forEach((btn) => {
            const m = parseInt(btn.dataset.month, 10);
            btn.classList.toggle('active', m === (ctrl.dtState.viewMonth || 0));
            btn.addEventListener('click', () => {
              ctrl.dtState.viewMonth = Math.max(0, Math.min(11, m));
              monthYearPicker.classList.add('is-hidden');
              renderCalendar(ctrl);
            });
          });
        }
      });
      calMonthLabel.dataset.bound = '1';
    }
    if (yearUp && !yearUp.dataset.bound) {
      yearUp.addEventListener('click', () => setPickerYear(ctrl, (ctrl.dtState.viewYear || new Date().getFullYear()) + 1));
      yearUp.dataset.bound = '1';
    }
    if (yearDown && !yearDown.dataset.bound) {
      yearDown.addEventListener('click', () => setPickerYear(ctrl, (ctrl.dtState.viewYear || new Date().getFullYear()) - 1));
      yearDown.dataset.bound = '1';
    }
    if (yearInput && !yearInput.dataset.bound) {
      yearInput.addEventListener('change', () => setPickerYear(ctrl, parseInt(yearInput.value, 10) || new Date().getFullYear()));
      yearInput.dataset.bound = '1';
    }

    // Hour/minute controls
    if (hourPlus) hourPlus.addEventListener('click', () => adjust(ctrl, 'hour', 1));
    if (hourMinus) hourMinus.addEventListener('click', () => adjust(ctrl, 'hour', -1));
    if (minutePlus) minutePlus.addEventListener('click', () => adjust(ctrl, 'minute', 5));
    if (minuteMinus) minuteMinus.addEventListener('click', () => adjust(ctrl, 'minute', -5));

    if (timeHour) {
      timeHour.addEventListener('blur', () => setFromInput(ctrl, 'hour', timeHour.value));
    }
    if (timeMinute) {
      timeMinute.addEventListener('blur', () => setFromInput(ctrl, 'minute', timeMinute.value));
    }

    // Outside click and Escape to close picker
    if (dateTimePicker && !dateTimePicker.dataset.outsideBound) {
      const outsideHandler = (e) => {
        if (!isVisible(dateTimePicker)) return;
        const t = e.target;
        if (dateTimePicker.contains(t)) return;
        if (taskDateTimeDisplay && taskDateTimeDisplay.contains(t)) return;
        hidePicker(ctrl);
      };
      const escHandler = (e) => {
        if (e.key === 'Escape' && isVisible(dateTimePicker)) hidePicker(ctrl);
      };
      document.addEventListener('click', outsideHandler, true);
      document.addEventListener('keydown', escHandler, true);
      dateTimePicker.dataset.outsideBound = '1';
    }
  }

  function toggle(el) {
    if (!el) return;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    const hidden = el.classList.contains('is-hidden') || el.style.display === 'none' || (style && style.display === 'none');
    if (hidden) {
      el.classList.remove('is-hidden');
      if (el.style) el.style.display = 'block';
    } else {
      el.classList.add('is-hidden');
      if (el.style) el.style.display = 'none';
    }
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    return !(el.classList.contains('is-hidden') || el.style.display === 'none' || (style && style.display === 'none'));
  }

  function hideEl(el) {
    if (!el) return;
    el.classList.add('is-hidden');
    if (el.style) el.style.display = 'none';
  }

  function adjust(ctrl, key, delta) {
    ctrl.dtState = ctrl.dtState || { hour: 0, minute: 0 };
    let v = Number(ctrl.dtState[key] || 0) + delta;
    if (key === 'hour') v = (v + 24) % 24;
    if (key === 'minute') v = (v + 60) % 60;
    ctrl.dtState[key] = v;
    syncInputs(ctrl);
  }

  function setFromInput(ctrl, key, value) {
    let v = parseInt(value, 10);
    if (isNaN(v)) v = 0;
    if (key === 'hour') v = Math.max(0, Math.min(23, v));
    if (key === 'minute') v = Math.max(0, Math.min(59, v));
    ctrl.dtState[key] = v;
    syncInputs(ctrl);
  }

  function syncInputs(ctrl) {
    const { timeHour, timeMinute } = ctrl.els;
    if (timeHour) timeHour.value = String(ctrl.dtState.hour ?? 0).padStart(2, '0');
    if (timeMinute) timeMinute.value = String(ctrl.dtState.minute ?? 0).padStart(2, '0');
  }

  async function applyTime(ctrl) {
    if (!ctrl.selectedTask) return;
    const t = ctrl.selectedTask;
    const baseDate = t.due_date ? new Date(t.due_date) : new Date();
    const y = baseDate.getFullYear();
    const m = String(baseDate.getMonth() + 1).padStart(2, '0');
    const d = String(baseDate.getDate()).padStart(2, '0');
    const hh = String(ctrl.dtState?.hour ?? 0).padStart(2, '0');
    const mm = String(ctrl.dtState?.minute ?? 0).padStart(2, '0');
    const due_date = `${y}-${m}-${d}T${hh}:${mm}:00`;
    try {
      await TasksAPI.update(t.id, { due_date });
      await ctrl.reloadTasks();
      const updated = (ctrl.tasks || []).find((x) => String(x.id) === String(t.id));
      if (updated) ctrl.selectTask(updated);
      notify('Hora actualizada', 'success');
    } catch (e) {
      notify('Error al actualizar fecha/hora', 'error');
    }
  }

  // ===== Calendar helpers =====
  function ensureDtState(ctrl) {
    const now = new Date();
    const t = ctrl.selectedTask;
    if (t && t.due_date) {
      const d = new Date(t.due_date);
      ctrl.dtState.viewYear = d.getFullYear();
      ctrl.dtState.viewMonth = d.getMonth();
      ctrl.dtState.selectedDate = localYMD(d);
      ctrl.dtState.hour = d.getHours();
      ctrl.dtState.minute = d.getMinutes();
    } else {
      ctrl.dtState.viewYear = now.getFullYear();
      ctrl.dtState.viewMonth = now.getMonth();
      ctrl.dtState.selectedDate = null;
      ctrl.dtState.hour = ctrl.dtState.hour ?? 0;
      ctrl.dtState.minute = ctrl.dtState.minute ?? 0;
    }
  }

  function localYMD(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function monthNameEs(m) {
    const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return names[m] || '';
  }

  function renderCalendar(ctrl) {
    const grid = ctrl.els.calendarGrid;
    if (!grid || ctrl.dtState.viewYear == null || ctrl.dtState.viewMonth == null) return;
    const y = ctrl.dtState.viewYear;
    const m = ctrl.dtState.viewMonth;
    if (ctrl.els.calMonthLabel) ctrl.els.calMonthLabel.textContent = `${monthNameEs(m)} ${y}`;
    const first = new Date(y, m, 1);
    const startWeekday = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevMonthDays = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i++) {
      const dayNum = prevMonthDays - startWeekday + 1 + i;
      const d = new Date(y, m - 1, dayNum);
      cells.push({ date: d, outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(y, m, d), outside: false });
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      const next = new Date(last);
      next.setDate(last.getDate() + 1);
      cells.push({ date: next, outside: true });
    }
    grid.innerHTML = '';
    const today = new Date(); today.setHours(0,0,0,0);
    const selected = ctrl.dtState.selectedDate;
    const frag = document.createDocumentFragment();
    cells.forEach(cell => {
      const el = document.createElement('div');
      el.className = 'cal-day';
      if (cell.outside) el.classList.add('is-outside');
      const d0 = new Date(cell.date); d0.setHours(0,0,0,0);
      if (d0.getTime() === today.getTime()) el.classList.add('is-today');
      const ymd = localYMD(cell.date);
      if (selected && ymd === selected) el.classList.add('is-selected');
      el.textContent = String(cell.date.getDate());
      el.dataset.date = ymd;
      el.addEventListener('click', () => selectDate(ctrl, ymd));
      frag.appendChild(el);
    });
    grid.appendChild(frag);
  }

  function shiftCalendar(ctrl, deltaMonths) {
    let y = ctrl.dtState.viewYear;
    let m = ctrl.dtState.viewMonth + deltaMonths;
    while (m < 0) { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }
    ctrl.dtState.viewYear = y;
    ctrl.dtState.viewMonth = m;
    renderCalendar(ctrl);
  }

  function setPickerYear(ctrl, y) {
    ctrl.dtState.viewYear = y;
    if (ctrl.els.yearInput) ctrl.els.yearInput.value = String(y);
    renderCalendar(ctrl);
  }

  function selectDate(ctrl, ymd) {
    ctrl.dtState.selectedDate = ymd;
    renderCalendar(ctrl);
    // Immediately persist the selected date (auto-save behavior)
    void persistDueDate(ctrl);
  }

  function hidePicker(ctrl) {
    const { dateTimePicker, dtTimePanel, repeatMenu, monthYearPicker } = ctrl.els;
    hideEl(dtTimePanel);
    hideEl(repeatMenu);
    hideEl(monthYearPicker);
    hideEl(dateTimePicker);
  }

  async function persistDueDate(ctrl) {
    try {
      if (!ctrl.selectedTask) return;
      let dueDateStr = null;
      if (ctrl.dtState.selectedDate) {
        const hh = String(ctrl.dtState.hour ?? 0).padStart(2, '0');
        const mm = String(ctrl.dtState.minute ?? 0).padStart(2, '0');
        dueDateStr = `${ctrl.dtState.selectedDate}T${hh}:${mm}:00`;
      }
      await TasksAPI.update(ctrl.selectedTask.id, { due_date: dueDateStr, repeat_pattern: ctrl.dtState.repeat || null });
      await ctrl.reloadTasks();
      const updated = (ctrl.tasks || []).find((t) => String(t.id) === String(ctrl.selectedTask.id));
      if (updated) ctrl.selectTask(updated);
      notify('Fecha actualizada', 'success');
    } catch (e) {
      notify('Error al actualizar fecha', 'error');
    }
  }

  async function initNotes(ctrl, task) {
    const holderId = 'taskNotesEditor';
    const container = document.getElementById(holderId);
    if (!container) return;

    try {
      if (ctrl.notesEditor && typeof ctrl.notesEditor.destroy === 'function') {
        await ctrl.notesEditor.destroy();
      }
    } catch (_) {}
    ctrl.notesEditor = null;
    container.innerHTML = '';

    try {
      if (typeof window.EditorJS !== 'undefined') {
        ctrl.notesEditor = new window.EditorJS({
          holder: holderId,
          data: task?.notes || { blocks: [] },
          tools: {
            header: window.Header ? { class: window.Header, config: { levels: [2, 3], defaultLevel: 2 } } : undefined,
            paragraph: window.Paragraph ? { class: window.Paragraph } : undefined,
            checklist: window.Checklist ? { class: window.Checklist } : undefined,
          },
          placeholder: 'Agregar notas...',
          onChange: () => ctrl.scheduleAutoSave && ctrl.scheduleAutoSave(),
        });
        await ctrl.notesEditor.isReady;
        return;
      }
    } catch (e) {
      // fall through to fallback
    }

    // Fallback: simple textarea
    const text = task?.notes?.blocks?.[0]?.data?.text || '';
    container.innerHTML = `<textarea class="fallback-textarea" placeholder="Agregar notas...">${escapeHtml$1(text)}</textarea>`;
  }

  function escapeHtml$1(str) {
    return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  function bindReferences(ctrl) {
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
          if (updated) { ctrl.selectedTask = updated; renderReferences(ctrl); updateFilesDisplay(ctrl, updated.references || updated.files || []); }
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
    // Handle reference actions (remove)
    const { referencesContainer } = ctrl.els;
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
          if (updated) { ctrl.selectedTask = updated; renderReferences(ctrl); updateFilesDisplay(ctrl, updated.references || updated.files || []); }
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
            ${f.mime_type ? `<div class=\"reference-item-details\">${escapeHtml(f.mime_type)}</div>` : ''}
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
            ${path ? `<div class=\"reference-item-details\">${escapeHtml(path)}</div>` : ''}
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
      if (updated) { ctrl.selectedTask = updated; renderReferences(ctrl); updateFilesDisplay(ctrl, updated.references || updated.files || []); }
      notify('Notas vinculadas', 'success');
    } catch (e) {
      notify('Error al vincular notas', 'error');
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  class TaskController {
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
        if (typeof this.hidePanel === 'function') this.hidePanel();
      } catch (e) {
        notify(`Error loading tasks: ${e.message}`, 'error');
      }

      // Bind basic interactions (quick add + preview) only if legacy manager isn't active
      if (!window.taskManager) {
        bindQuickAdd(this);
        bindPreview(this);
        bindBucketToggles();
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
          if (typeof this.hidePanel === 'function') this.hidePanel();
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

  function bootstrapTasksController() {
    const section = document.getElementById('tasksSection');
    if (!section) return null;
    const ctrl = new TaskController();
    ctrl.init();
    return ctrl;
  }

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
      TM.prototype.loadViewSettings = loadViewSettings;
      TM.prototype.saveViewSettings = function() { saveViewSettings(this.viewSettings); };
      TM.prototype.saveBucketStates = function() { saveBucketStates(this.bucketStates); };
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

})();
//# sourceMappingURL=tasks.js.map

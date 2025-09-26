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

  function buildQuery(params = {}) {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      usp.set(k, String(v));
    });
    const qs = usp.toString();
    return qs ? `?${qs}` : '';
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
    
    // New view-specific endpoints
    today: () => apiCall('/api/tasks/today'),
    next7Days: () => apiCall('/api/tasks/next-7-days'),
    inbox: () => apiCall('/api/tasks/inbox'),
    eisenhower: () => apiCall('/api/tasks/eisenhower'),
    byTag: (tagId) => apiCall(`/api/tasks/by-tag/${tagId}`),
    counts: () => apiCall('/api/tasks/counts'),
  };

  const TagsAPI = {
    list: (params = {}) => apiCall(`/api/tags${buildQuery(params)}`),
    get: (id) => apiCall(`/api/tags/${id}`),
    update: (id, patch) => apiCall(`/api/tags/${id}`, 'PATCH', patch),
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
          // Close the details panel when changing the view
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
    
    // Use due_time if available, otherwise extract time from due_date
    let timeStr = '';
    if (task.due_time) {
      // Parse the time string (e.g., "14:30:00") and format it
      const timeParts = task.due_time.split(':');
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } else if (dueDate) {
      // Fallback to extracting time from date (for legacy compatibility)
      timeStr = dueDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }

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
          <span class="task-row-title ${isCompleted ? 'completed' : ''}">${escapeHtml$5(task.title || '')}</span>
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
    
    if (group === 'today-time') {
      // Special handling for Today view with time-based groups
      const todayGroups = ctrl.viewSettings.todayGroups || {};
      const groupOrder = ['overdue', 'morning', 'afternoon', 'evening', 'all_day'];
      const groupTitles = {
        'overdue': 'Overdue',
        'morning': 'Morning (Before 12 PM)',
        'afternoon': 'Afternoon (12 PM - 6 PM)', 
        'evening': 'Evening (After 6 PM)',
        'all_day': 'All Day'
      };
      
      groups = groupOrder
        .filter(key => todayGroups[key] && todayGroups[key].length > 0)
        .map(key => ({
          key: groupTitles[key],
          items: todayGroups[key]
        }));
    } else if (group === 'list') {
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
            <span class="bucket-title">${escapeHtml$5(g.key)}</span>
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

  function escapeHtml$5(str) {
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
      create.innerHTML = `Create "${escapeHtml$4(q)}"`;
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
        item.innerHTML = `<span>${escapeHtml$4(t.name)}</span>${t.usage ? `<span class="muted" style="margin-left:auto;">${t.usage}</span>` : ''}`;
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

  function escapeHtml$4(str) {
    return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  function showTaskPanel(ctrl, task) {
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

  function updateFilesDisplay(ctrl, refsOrFiles) {
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
        const details = f.mime_type ? `<div class="reference-item-details">${escapeHtml$3(f.mime_type)}</div>` : '';
        return `
        <div class="reference-item" data-type="file" data-id="${id}">
          <div class="reference-item-left">
            <span class="reference-item-icon file"><i class="fas fa-file"></i></span>
            <div class="reference-item-content">
              <div class="reference-item-name">${escapeHtml$3(name)}</div>
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
        const details = n.path ? `<div class="reference-item-details">${escapeHtml$3(String(n.path))}</div>` : '';
        return `
        <div class="reference-item" data-type="note" data-id="${id}">
          <div class="reference-item-left">
            <span class="reference-item-icon note"><i class="fas fa-file-alt"></i></span>
            <div class="reference-item-content">
              <div class="reference-item-name">${escapeHtml$3(name)}</div>
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

  function escapeHtml$3(str) {
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
    container.innerHTML = `<textarea class="fallback-textarea" placeholder="Agregar notas...">${escapeHtml$2(text)}</textarea>`;
  }

  function escapeHtml$2(str) {
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
            <div class="reference-item-name">${escapeHtml$1(name)}</div>
            ${f.mime_type ? `<div class="reference-item-details">${escapeHtml$1(f.mime_type)}</div>` : ''}
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
            <div class="reference-item-name">${escapeHtml$1(name)}</div>
            ${path ? `<div class="reference-item-details">${escapeHtml$1(path)}</div>` : ''}
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
      .map((n) => `<div class="note-list-item" data-note-id="${n.id}"><i class="fas fa-file-alt"></i><div class="note-list-item-name">${escapeHtml$1(n.name)}</div><div class="note-list-item-path">${escapeHtml$1(n.path || 'Root')}</div></div>`)
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

  function escapeHtml$1(str) {
    return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  /**
   * Task Views Router
   * Handles view switching between Today, Next 7 Days, Inbox, Eisenhower Matrix, and Lists
   */


  class TaskViewsRouter {
    constructor(controller) {
      this.ctrl = controller;
      this.currentView = null;
      this.currentViewData = null;
      
      // Default view
      this.defaultView = 'next7days';
      
      // Available views configuration
      this.views = {
        today: {
          id: 'today',
          title: 'Today',
          icon: 'fas fa-calendar-day',
          fetchData: () => TasksAPI.today(),
          layout: 'grouped'
        },
        next7days: {
          id: 'next7days', 
          title: 'Next 7 Days',
          icon: 'fas fa-calendar-week',
          fetchData: () => TasksAPI.next7Days(),
          layout: 'standard'
        },
        inbox: {
          id: 'inbox',
          title: 'Inbox',
          icon: 'fas fa-inbox',
          fetchData: () => TasksAPI.inbox(),
          layout: 'standard'
        },
        eisenhower: {
          id: 'eisenhower',
          title: 'Eisenhower Matrix',
          icon: 'fas fa-th',
          fetchData: () => TasksAPI.eisenhower(),
          layout: 'matrix'
        }
      };
      
      this.init();
    }

    init() {
      // Load saved view or default
      const savedView = localStorage.getItem('taskViewActive') || this.defaultView;
      this.switchToView(savedView);
      
      // Listen for popstate events for browser back/forward
      window.addEventListener('popstate', (e) => {
        if (e.state && e.state.taskView) {
          this.switchToView(e.state.taskView, false); // Don't push to history
        }
      });
    }

    async switchToView(viewId, pushHistory = true) {
      // Validate view exists
      if (!this.views[viewId] && !viewId.startsWith('list:')) {
        console.warn(`Unknown view: ${viewId}`);
        return;
      }

      // Handle tag-based lists (list:tagName)
      if (viewId.startsWith('list:')) {
        const tagName = viewId.substring(5); // Remove 'list:' prefix
        await this.switchToListView(tagName, pushHistory);
        return;
      }

      const view = this.views[viewId];
      if (!view) return;

      try {
        // Show loading state
        this.showLoadingState();
        
        // Fetch view data
        const response = await view.fetchData();
        this.currentViewData = response;
        
        // Update current view
        this.currentView = viewId;
        
        // Save to localStorage
        localStorage.setItem('taskViewActive', viewId);
        
        // Update browser history
        if (pushHistory) {
          const url = new URL(window.location);
          url.searchParams.set('view', viewId);
          history.pushState({ taskView: viewId }, '', url);
        }
        
        // For built-in views, set grouping mode explicitly to avoid leakage
        if (view.layout === 'grouped') {
          this.ctrl.viewSettings = { ...(this.ctrl.viewSettings || {}), groupBy: 'today-time' };
          // Store Today groups so renderGrouped can use them
          this.ctrl.viewSettings.todayGroups = response.groups || {};
        } else {
          this.ctrl.viewSettings = { ...(this.ctrl.viewSettings || {}), groupBy: 'date' };
          if (this.ctrl.viewSettings.todayGroups) delete this.ctrl.viewSettings.todayGroups;
        }

        // Render the view
        this.renderView(view, response);
        
        // Hide loading state after rendering
        this.hideLoadingState();
        
        // Update active state in sidebar
        this.updateSidebarActiveState(viewId);
        
        // Update sidebar counts
        if (this.ctrl.sidebar) {
          this.ctrl.sidebar.refresh();
        }
        
      } catch (error) {
        console.error(`Error loading view ${viewId}:`, error);
        notify(`Error loading ${view.title} view`, 'error');
        // Hide loading state on error too
        this.hideLoadingState();
      }
    }

    async switchToListView(tagName, pushHistory = true) {
      try {
        this.showLoadingState();
        
        // Find tag ID from tag name
        const allTasks = await TasksAPI.list();
        const allTagsMap = {};
        
        allTasks.tasks?.forEach(task => {
          task.tags?.forEach(tag => {
            const name = typeof tag === 'object' ? tag.name : tag;
            const id = typeof tag === 'object' ? tag.id : tag;
            allTagsMap[name] = id;
          });
        });
        
        const tagId = allTagsMap[tagName];
        if (!tagId) {
          throw new Error(`Tag "${tagName}" not found`);
        }
        
        // Fetch tasks for this tag
        const [response, tagMetaRes] = await Promise.all([
          TasksAPI.byTag(tagId),
          TagsAPI.get(tagId).catch(() => ({}))
        ]);
        this.currentViewData = { ...response, __tag: tagMetaRes || {} };
        
        // Create virtual view for this list
        const listView = {
          id: `list:${tagName}`,
          title: `${tagName}`,
          icon: 'fas fa-tag',
          layout: 'standard',
          isList: true,
          tagId,
          tagName
        };
        
        this.currentView = listView.id;
        
        // Save to localStorage
        localStorage.setItem('taskViewActive', listView.id);
        
        // Update browser history
        if (pushHistory) {
          const url = new URL(window.location);
          url.searchParams.set('view', `list:${tagName}`);
          history.pushState({ taskView: listView.id }, '', url);
        }
        
        // Render the view with auto-tag behavior for quick add
    this.renderView(listView, this.currentViewData, { autoTag: tagName });
        
        // Hide loading state after rendering
        this.hideLoadingState();
        
        // Update active state in sidebar
        this.updateSidebarActiveState(listView.id);
        
        // Update sidebar counts
        if (this.ctrl.sidebar) {
          this.ctrl.sidebar.refresh();
        }
        
      } catch (error) {
        console.error(`Error loading list view for tag ${tagName}:`, error);
        notify(`Error loading ${tagName} list`, 'error');
        // Hide loading state on error too
        this.hideLoadingState();
      }
    }

    renderView(view, data, options = {}) {
      if (view.layout === 'matrix') {
        this.renderMatrixView(view, data);
      } else if (view.layout === 'grouped') {
        this.renderGroupedView(view, data, options);
      } else {
        this.renderStandardView(view, data, options);
      }
    }

    renderStandardView(view, data, options = {}) {
      // Hide Eisenhower matrix if it exists (in case switching from matrix view)
      const matrixContainer = document.getElementById('eisenhowerMatrix');
      if (matrixContainer) {
        matrixContainer.classList.add('is-hidden');
      }
      
      // Show standard task lists
      const dateBuckets = document.getElementById('dateBucketsContainer');
      const dynamicList = document.getElementById('dynamicTaskList');
      if (dateBuckets) dateBuckets.classList.remove('is-hidden');
      if (dynamicList) dynamicList.classList.remove('is-hidden');
      
    // Update tasks in controller for standard list view
    this.ctrl.tasks = data.tasks || [];
    // Reset grouping to date for standard views to prevent leakage from Today view
    this.ctrl.viewSettings = { ...(this.ctrl.viewSettings || {}), groupBy: 'date' };
    if (this.ctrl.viewSettings.todayGroups) delete this.ctrl.viewSettings.todayGroups;
      
      // Set up view-specific quick add behavior
      this.setupQuickAddBehavior(view, options);
      
      // If a tag list, render header + sections; else default render
      if (view.isList) {
        this.renderListHeaderAndSections(view, data, options);
      } else {
        this.ctrl.render();
      }
      
      // Update view title if needed
      this.updateViewTitle(view);
    }

    renderGroupedView(view, data, options = {}) {
      // Hide Eisenhower matrix if it exists
      const matrixContainer = document.getElementById('eisenhowerMatrix');
      if (matrixContainer) {
        matrixContainer.classList.add('is-hidden');
      }
      
      // Show standard task lists
      const dateBuckets = document.getElementById('dateBucketsContainer');
      const dynamicList = document.getElementById('dynamicTaskList');
      if (dateBuckets) dateBuckets.classList.remove('is-hidden');
      if (dynamicList) dynamicList.classList.remove('is-hidden');
      
      // Convert grouped data to flat array and set special grouping mode
      const groups = data.groups || {};
      const allTasks = [];
      
      // Flatten all groups into a single array
      Object.values(groups).forEach(groupTasks => {
        allTasks.push(...groupTasks);
      });
      
      // Update tasks in controller
      this.ctrl.tasks = allTasks;
      
      // Set special view settings for Today grouping
      this.ctrl.viewSettings = {
        groupBy: 'today-time',
        todayGroups: groups  // Pass the original grouped data
      };
      
      // Set up view-specific quick add behavior  
      this.setupQuickAddBehavior(view, options);
      
      // Use existing controller render method
      this.ctrl.render();
      
      // Update view title
      this.updateViewTitle(view);
    }

    renderMatrixView(view, data) {
      console.debug('renderMatrixView called with data:', data);
      
      // Hide standard task lists
      const dateBuckets = document.getElementById('dateBucketsContainer');
      const dynamicList = document.getElementById('dynamicTaskList');
      if (dateBuckets) dateBuckets.classList.add('is-hidden');
      if (dynamicList) dynamicList.classList.add('is-hidden');
      
      // Show/create Eisenhower matrix container
      let matrixContainer = document.getElementById('eisenhowerMatrix');
      if (!matrixContainer) {
        matrixContainer = this.createMatrixContainer();
      }
      
      matrixContainer.classList.remove('is-hidden');
      
      // Render matrix content
      this.renderEisenhowerMatrix(matrixContainer, data.quadrants || {});
      
      // Update view title
      this.updateViewTitle(view);
    }

    createMatrixContainer() {
      const taskCenter = document.querySelector('.task-center');
      if (!taskCenter) return null;
      
      const matrixContainer = document.createElement('div');
      matrixContainer.id = 'eisenhowerMatrix';
      matrixContainer.className = 'eisenhower-matrix';
      
      taskCenter.appendChild(matrixContainer);
      return matrixContainer;
    }

    renderEisenhowerMatrix(container, quadrants) {
      console.debug('renderEisenhowerMatrix called with quadrants:', quadrants);
      
      const quadrantConfig = [
        {
          key: 'urgent_important',
          title: 'Urgent & Important',
          subtitle: 'Do First',
          className: 'q1 urgent important'
        },
        {
          key: 'not_urgent_important', 
          title: 'Not Urgent & Important',
          subtitle: 'Schedule',
          className: 'q2 not-urgent important'
        },
        {
          key: 'urgent_not_important',
          title: 'Urgent & Not Important',
          subtitle: 'Delegate',
          className: 'q3 urgent not-important'
        },
        {
          key: 'not_urgent_not_important',
          title: 'Not Urgent & Not Important',
          subtitle: 'Eliminate',
          className: 'q4 not-urgent not-important'
        }
      ];

      container.innerHTML = `
      <div class="matrix-grid">
        ${quadrantConfig.map(config => {
          const tasks = quadrants[config.key] || [];
          return `
            <div class="matrix-quadrant ${config.className}" data-quadrant="${config.key}">
              <div class="quadrant-header">
                <h3 class="quadrant-title">${config.title}</h3>
                <p class="quadrant-subtitle">${config.subtitle}</p>
                <span class="quadrant-count">${tasks.length}</span>
              </div>
              <div class="quadrant-tasks" data-quadrant="${config.key}">
                ${tasks.map(task => this.renderMatrixTask(task)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

      // Set up drag and drop for matrix
      this.setupMatrixDragDrop(container);
    }

    renderMatrixTask(task) {
      const isCompleted = task.status === 'completed';
      const dueDate = task.due_date ? new Date(task.due_date) : null;
      const timeStr = dueDate ? dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      
      const priorityClass = task.priority ? `priority-${task.priority.toLowerCase()}` : '';
      
      return `
      <div class="matrix-task-row ${isCompleted ? 'completed' : ''} ${priorityClass}" 
           data-task-id="${task.id}" 
           draggable="true">
        <div class="task-row-toggle-container">
          <input type="checkbox" class="task-row-toggle" ${isCompleted ? 'checked' : ''}>
        </div>
        <div class="task-row-content">
          <span class="task-row-title">${task.title || ''}</span>
          ${timeStr ? `<span class="task-row-time">${timeStr}</span>` : ''}
        </div>
      </div>
    `;
    }

    setupMatrixDragDrop(container) {
      // Handle drag start
      container.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('matrix-task-row')) {
          e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
          e.target.classList.add('dragging');
        }
      });

      // Handle drag end
      container.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('matrix-task-row')) {
          e.target.classList.remove('dragging');
        }
      });

      // Handle drop zones
      container.querySelectorAll('.quadrant-tasks').forEach(zone => {
        zone.addEventListener('dragover', (e) => {
          e.preventDefault();
          zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', (e) => {
          if (!zone.contains(e.relatedTarget)) {
            zone.classList.remove('drag-over');
          }
        });

        zone.addEventListener('drop', async (e) => {
          e.preventDefault();
          zone.classList.remove('drag-over');
          
          const taskId = e.dataTransfer.getData('text/plain');
          const newQuadrant = zone.dataset.quadrant;
          
          await this.moveTaskToQuadrant(taskId, newQuadrant);
        });
      });
    }

    async moveTaskToQuadrant(taskId, quadrant) {
      try {
        const task = this.findTaskById(taskId);
        if (!task) return;

        const updates = this.getUpdatesForQuadrant(quadrant);
        await TasksAPI.update(taskId, updates);
        
        // Refresh the matrix view
        await this.switchToView('eisenhower', false);
        
        notify('Task moved successfully', 'success');
      } catch (error) {
        console.error('Error moving task:', error);
        notify('Error moving task', 'error');
      }
    }

    getUpdatesForQuadrant(quadrant) {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      switch (quadrant) {
        case 'urgent_important':
          return {
            priority: 'alta',
            due_date: today.toISOString().split('T')[0]
          };
        case 'not_urgent_important':
          return {
            priority: 'alta',
            due_date: tomorrow.toISOString().split('T')[0]
          };
        case 'urgent_not_important':
          return {
            priority: 'media',
            due_date: today.toISOString().split('T')[0]
          };
        case 'not_urgent_not_important':
          return {
            priority: 'baja',
            due_date: null
          };
        default:
          return {};
      }
    }

    findTaskById(taskId) {
      if (this.currentViewData?.quadrants) {
        // Search in Eisenhower quadrants
        for (const quadrant of Object.values(this.currentViewData.quadrants)) {
          const task = quadrant.find(t => String(t.id) === String(taskId));
          if (task) return task;
        }
      } else if (this.currentViewData?.tasks) {
        // Search in standard task list
        return this.currentViewData.tasks.find(t => String(t.id) === String(taskId));
      }
      return null;
    }

    setupQuickAddBehavior(view, options = {}) {
      // Store current view context for quick add
      this.ctrl.currentViewContext = {
        view: view.id,
        autoTag: options.autoTag
      };
    }

    updateViewTitle(view) {
      // Could update a view title element if it exists
      const titleElement = document.querySelector('.view-title');
      if (titleElement) {
        titleElement.textContent = view.title;
      }
    }

    updateSidebarActiveState(viewId) {
      // Update sidebar if available
      if (this.ctrl.sidebar) {
        this.ctrl.sidebar.updateActiveView(viewId);
      }
    }

    showLoadingState() {
      // Show loading spinner or state
      const taskCenter = document.querySelector('.task-center');
      if (taskCenter) {
        taskCenter.classList.add('loading');
      }
    }

    hideLoadingState() {
      const taskCenter = document.querySelector('.task-center');
      if (taskCenter) {
        taskCenter.classList.remove('loading');
      }
    }

    getCurrentView() {
      return this.currentView;
    }

    getCurrentViewData() {
      return this.currentViewData;
    }

    renderListHeaderAndSections(view, data, options = {}) {
      const taskCenter = document.querySelector('.task-center');
      if (!taskCenter) return;

      // Ensure a dedicated container exists at the top
      let listHeader = document.getElementById('listViewHeader');
      if (!listHeader) {
        listHeader = document.createElement('div');
        listHeader.id = 'listViewHeader';
        listHeader.className = 'list-view-header';
        taskCenter.prepend(listHeader);
      }

      const tagMeta = data.__tag || {};
    const icon = tagMeta.icon || '';
    const title = view.tagName || '';
      const totalCount = (data.tasks || []).filter(t => t.status !== 'completed').length;

      // Header HTML
      listHeader.innerHTML = `
      <div class="list-header-row">
  <button id="listIconBtn" class="list-icon-btn" title="Change icon" aria-label="Change list icon">${icon ? icon : '<i class="fas fa-tag"></i>'}</button>
  <input id="listTitleInput" class="list-title-input" value="${title}" aria-label="List title" />
        <div class="spacer"></div>
        <button id="addSectionBtn" class="btn-secondary" title="Add section">+ Section</button>
        <span class="pill count-pill" id="listTotalCount">${totalCount}</span>
        <input id="iconHiddenInput" type="text" style="position:absolute;left:-20000px;opacity:0;" aria-hidden="true" />
      </div>
    `;

      // Wire icon picker
      const iconBtn = document.getElementById('listIconBtn');
      const hiddenInput = document.getElementById('iconHiddenInput');
      if (iconBtn && hiddenInput && window.attachIconPicker) {
        window.attachIconPicker(hiddenInput, {
          anchorEl: iconBtn,
          onSelect: async (emoji) => {
            try {
              if (emoji === null) {
                await TagsAPI.update(view.tagId, { icon: null });
                iconBtn.innerHTML = '<i class="fas fa-tag"></i>';
              } else {
                await TagsAPI.update(view.tagId, { icon: emoji });
                iconBtn.textContent = emoji;
              }
              if (this.ctrl.sidebar) this.ctrl.sidebar.refresh();
            } catch (e) {
              notify('Failed to update icon', 'error');
            }
          }
        });
        iconBtn.onclick = (e) => {
          e.preventDefault();
          if (hiddenInput._iconPicker?.isOpen()) hiddenInput._iconPicker.hide(); else hiddenInput._iconPicker?.show();
        };
      }

      // Title edit
      const titleInput = document.getElementById('listTitleInput');
      if (titleInput) {
        const commit = async () => {
          try {
            const newTitle = (titleInput.value || '').replace(/^#+\s*/, '').trim();
            if (!newTitle || newTitle === view.tagName) return;
            const res = await TagsAPI.update(view.tagId, { name: newTitle });
            if (res && res.name) {
              view.tagName = res.name;
              titleInput.value = `${res.name}`;
              // Update URL/history to new name
              const url = new URL(window.location);
              url.searchParams.set('view', `list:${res.name}`);
              history.replaceState({ taskView: `list:${res.name}` }, '', url);
              // Refresh sidebar to reflect new name
              if (this.ctrl.sidebar) this.ctrl.sidebar.refresh();
            }
          } catch (_) {
            notify('Failed to rename list', 'error');
            titleInput.value = `${view.tagName}`;
          }
        };
        titleInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); titleInput.value = `#${view.tagName}`; titleInput.blur(); }
        });
        titleInput.addEventListener('blur', commit);
      }

      // Render sections below header into dynamic list container
      const listEl = document.getElementById('dynamicTaskList');
      const bucketsEl = document.getElementById('dateBucketsContainer');
      if (!listEl || !bucketsEl) return;
      bucketsEl.classList.add('is-hidden');
      listEl.classList.remove('is-hidden');

    const tasks = (data.tasks || []).slice();
    const sections = Array.isArray(tagMeta.sections) ? tagMeta.sections.slice().sort((a,b) => (a.order ?? 0) - (b.order ?? 0)) : [];
      const openStateKey = `list_sections_open_${view.tagId}`;
      let openState = {};
      try { openState = JSON.parse(localStorage.getItem(openStateKey) || '{}'); } catch {}
    Object.fromEntries(sections.map(s => [String(s.id), s]));

      const unsectionedTasks = tasks.filter(t => !t.section_id);
      const sectionsHtml = sections.map(sec => {
        const secTasks = tasks.filter(t => t.section_id === sec.id);
        const isOpen = openState[sec.id] ?? sec.isOpen ?? true;
        return `
        <div class="task-bucket" data-section-id="${sec.id}" draggable="true">
          <div class="bucket-header" tabindex="0">
            <div class="bucket-toggle">
              <i class="fas fa-chevron-${isOpen ? 'down' : 'right'} bucket-arrow"></i>
              <span class="bucket-title">${escapeHtml(sec.name || '')}</span>
              <span class="bucket-count">${secTasks.length}</span>
            </div>
          </div>
          <div class="bucket-content ${isOpen ? '' : 'is-hidden'}" data-drop-zone="tasks" data-section-id="${sec.id}">
            ${secTasks.map(renderListTaskRow).join('')}
          </div>
        </div>`;
      }).join('');

      const unsectionedOpen = openState['__unsectioned__'] ?? true;
      const unSectionHtml = `
      <div class="task-bucket" data-section-id="" draggable="false">
        <div class="bucket-header" tabindex="0">
          <div class="bucket-toggle">
            <i class="fas fa-chevron-${unsectionedOpen ? 'down' : 'right'} bucket-arrow"></i>
            <span class="bucket-title">Unsectioned</span>
            <span class="bucket-count">${unsectionedTasks.length}</span>
          </div>
        </div>
        <div class="bucket-content ${unsectionedOpen ? '' : 'is-hidden'}" data-drop-zone="tasks" data-section-id="">
          ${unsectionedTasks.map(renderListTaskRow).join('')}
        </div>
      </div>`;

      listEl.innerHTML = sectionsHtml + unSectionHtml;

      // Helper: start inline rename for a section
      const startRenameSection = (sectionId) => {
        const bucket = listEl.querySelector(`.task-bucket[data-section-id="${CSS.escape(sectionId)}"]`);
        if (!bucket) return;
        const titleSpan = bucket.querySelector('.bucket-title');
        if (!titleSpan) return;
        const current = titleSpan.textContent || '';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'section-title-input';
        input.value = current;
        input.setAttribute('aria-label', 'Section name');
        titleSpan.replaceWith(input);
        input.focus();
        input.select();

        const commit = async () => {
          const newName = (input.value || '').trim();
          const oldName = current.trim();
          if (!newName || newName === oldName) {
            // Restore view without changes
            await this.switchToListView(view.tagName, false);
            return;
          }
          const next = sections.map(s => s.id === sectionId ? { ...s, name: newName } : s);
          try {
            await TagsAPI.update(view.tagId, { sections: next });
            await this.switchToListView(view.tagName, false);
            notify('Section renamed', 'success');
          } catch (_) {
            notify('Failed to rename section', 'error');
            await this.switchToListView(view.tagName, false);
          }
        };

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); this.switchToListView(view.tagName, false); }
        });
        input.addEventListener('blur', commit);
      };

      // Toggle behavior + persist open state
      listEl.querySelectorAll('.task-bucket .bucket-header').forEach(h => {
        h.addEventListener('click', (e) => {
          const header = e.currentTarget;
          const bucket = header.parentElement;
          const content = bucket.querySelector('.bucket-content');
          const arrow = header.querySelector('.bucket-arrow');
          const hidden = content.classList.toggle('is-hidden');
          if (arrow) arrow.className = `fas fa-chevron-${hidden ? 'right' : 'down'} bucket-arrow`;
          const sid = bucket.getAttribute('data-section-id') || '__unsectioned__';
          openState[sid] = !hidden;
          localStorage.setItem(openStateKey, JSON.stringify(openState));
        });

        // Keyboard: F2 to rename
        h.addEventListener('keydown', (e) => {
          if (e.key === 'F2') {
            const sid = h.parentElement?.getAttribute('data-section-id');
            if (sid) {
              e.preventDefault();
              startRenameSection(sid);
            }
          }
        });
      });

      // Mouse: double-click title to rename
      listEl.querySelectorAll('.task-bucket[data-section-id] .bucket-title').forEach(el => {
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const sid = el.closest('.task-bucket')?.getAttribute('data-section-id');
          if (sid) startRenameSection(sid);
        });
      });

      // Add section inline
      const addBtn = document.getElementById('addSectionBtn');
      if (addBtn) {
        addBtn.onclick = async (e) => {
          e.preventDefault();
          const newId = cryptoRandomId();
          const newSec = { id: newId, name: 'New Section', order: (sections.at(-1)?.order ?? sections.length) + 1, isOpen: true };
          const next = [...sections, newSec];
          try {
            await TagsAPI.update(view.tagId, { sections: next });
            // Mark for rename after re-render
            localStorage.setItem(`list_section_rename_${view.tagId}`, newId);
            await this.switchToListView(view.tagName, false);
            notify('Section added', 'success');
          } catch (_) { notify('Failed to add section', 'error'); }
        };
      }

      // DnD: reorder sections and move tasks between sections
      setupSectionDnD(listEl, sections, async (orderedIds) => {
        const next = orderedIds.map((id, idx) => ({ ...(sections.find(s => s.id === id) || {}), order: idx }));
        try {
          await TagsAPI.update(view.tagId, { sections: next });
          await this.switchToListView(view.tagName, false);
        } catch (_) { notify('Failed to reorder sections', 'error'); }
      });
      setupTaskDropZones(listEl, async (taskId, targetSectionId) => {
        try {
          await TasksAPI.update(taskId, { section_id: targetSectionId || null });
          await this.switchToListView(view.tagName, false);
        } catch (_) { notify('Failed to move task', 'error'); }
      });

      // If a section was just added, auto-open rename
      const pendingRename = localStorage.getItem(`list_section_rename_${view.tagId}`);
      if (pendingRename) {
        localStorage.removeItem(`list_section_rename_${view.tagId}`);
        startRenameSection(pendingRename);
      }
    }
  }

  function renderListTaskRow(task) {
    const isCompleted = task.status === 'completed';
    return `
    <div class="task-row ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}" draggable="true">
      <div class="task-row-checkbox">
        <input type="checkbox" class="task-row-toggle" ${isCompleted ? 'checked' : ''} aria-label="Mark complete">
      </div>
      <div class="task-row-main">
        <div class="task-row-content">
          <span class="task-row-title ${isCompleted ? 'completed' : ''}">${escapeHtml(task.title || '')}</span>
        </div>
      </div>
    </div>`;
  }

  function setupSectionDnD(container, sections, onReorder) {
    const getSectionBuckets = () => Array.from(container.querySelectorAll('.task-bucket[data-section-id]'));
    let dragEl = null;
    let dragId = null;

    // Clean up any existing markers first
    container.querySelectorAll('.section-insert-marker').forEach(m => m.remove());

    // Helper: build drop markers between sections (including before first and after last)
    const buildMarkers = () => {
      // Remove old markers in case of re-run
      container.querySelectorAll('.section-insert-marker').forEach(m => m.remove());

      const buckets = getSectionBuckets();
      const unsectioned = container.querySelector('.task-bucket[data-section-id=""]');

      const insertMarkerAt = (index) => {
        const marker = document.createElement('div');
        marker.className = 'section-insert-marker';
        marker.setAttribute('data-insert-index', String(index));

        // Drag events
        marker.addEventListener('dragover', (e) => {
          e.preventDefault();
          marker.classList.add('active');
        });
        marker.addEventListener('dragleave', (e) => {
          if (!marker.contains(e.relatedTarget)) marker.classList.remove('active');
        });
        marker.addEventListener('drop', (e) => {
          e.preventDefault();
          marker.classList.remove('active');
          if (!dragId) return;

          // Compute new order using indices
          const ids = getSectionBuckets().map(x => x.getAttribute('data-section-id')).filter(Boolean);
          const fromIdx = ids.indexOf(dragId);
          let toIdx = Number(marker.getAttribute('data-insert-index'));
          if (fromIdx === -1) return;

          // Adjust target index if removing earlier element affects later index
          if (fromIdx < toIdx) toIdx -= 1;

          // Reorder array
          const moved = ids.splice(fromIdx, 1)[0];
          ids.splice(toIdx, 0, moved);

          if (onReorder) onReorder(ids);
        });

        return marker;
      };

      // Insert marker before each bucket and one at the end
      const parent = container;
      buckets.forEach((b, i) => {
        const marker = insertMarkerAt(i);
        parent.insertBefore(marker, b);
      });

      // Final marker after last reorderable bucket but before unsectioned if present
      const endMarker = insertMarkerAt(buckets.length);
      if (unsectioned) parent.insertBefore(endMarker, unsectioned);
      else parent.appendChild(endMarker);
    };

    buildMarkers();

    // Enable dragging on section buckets
    getSectionBuckets().forEach(b => {
      b.addEventListener('dragstart', (e) => {
        if (e.target === b && b.getAttribute('data-section-id')) {
          dragEl = b;
          dragId = b.getAttribute('data-section-id');
          e.dataTransfer.effectAllowed = 'move';
          b.classList.add('dragging');
        }
      });
      b.addEventListener('dragend', () => {
        if (dragEl) dragEl.classList.remove('dragging');
        dragEl = null;
        dragId = null;
        container.querySelectorAll('.section-insert-marker.active').forEach(m => m.classList.remove('active'));
      });

      // Also support dropping on a bucket by deciding before/after based on cursor position
      b.addEventListener('dragover', (e) => {
        e.preventDefault();
        const rect = b.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        // Highlight nearest marker
        const buckets = getSectionBuckets();
        const idx = buckets.indexOf(b);
        const markerIdx = before ? idx : idx + 1;
        container.querySelectorAll('.section-insert-marker').forEach((m) => m.classList.toggle('active', m.getAttribute('data-insert-index') === String(markerIdx)));
      });
      b.addEventListener('dragleave', () => {
        container.querySelectorAll('.section-insert-marker').forEach((m) => m.classList.remove('active'));
      });
      b.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragId) return;
        const rect = b.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        const buckets = getSectionBuckets();
        const ids = buckets.map(x => x.getAttribute('data-section-id')).filter(Boolean);
        const fromIdx = ids.indexOf(dragId);
        let toIdx = buckets.indexOf(b) + (before ? 0 : 1);
        if (fromIdx < toIdx) toIdx -= 1;
        const moved = ids.splice(fromIdx, 1)[0];
        ids.splice(toIdx, 0, moved);
        container.querySelectorAll('.section-insert-marker').forEach((m) => m.classList.remove('active'));
        if (onReorder) onReorder(ids);
      });
    });
  }

  function setupTaskDropZones(container, onDrop) {
    container.querySelectorAll('.bucket-content[data-drop-zone="tasks"]').forEach(zone => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over'); });
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const taskRow = container.querySelector('.task-row[draggable="true"].dragging');
        let taskId = null;
        if (taskRow) taskId = taskRow.getAttribute('data-task-id');
        if (!taskId && e.dataTransfer) taskId = e.dataTransfer.getData('text/plain');
        const targetSectionId = zone.getAttribute('data-section-id');
        if (taskId && onDrop) await onDrop(taskId, targetSectionId);
      });
    });
    container.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.task-row[draggable="true"]');
      if (row) { row.classList.add('dragging'); e.dataTransfer.setData('text/plain', row.getAttribute('data-task-id')); }
    });
    container.addEventListener('dragend', (e) => {
      const row = e.target.closest('.task-row[draggable="true"]');
      if (row) row.classList.remove('dragging');
    });
  }

  function cryptoRandomId() {
    try {
      const a = crypto.getRandomValues(new Uint32Array(4));
      return Array.from(a).map(x => x.toString(16).padStart(8, '0')).join('');
    } catch { return String(Date.now()); }
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  function bootstrapTaskViews(controller) {
    if (!controller) return null;
    
    const viewsRouter = new TaskViewsRouter(controller);
    controller.viewsRouter = viewsRouter;
    
    return viewsRouter;
  }

  /**
   * Task Sidebar Component
   * Handles sidebar navigation with built-in views and tag-based lists
   */


  class TaskSidebar {
    constructor(controller) {
      this.ctrl = controller;
      this.counts = {};
      this.tagCounts = {};
      this.tagsMetaByName = {};
      
      this.init();
    }

    init() {
      this.createSidebarHTML();
      this.bindEvents();
      this.loadCounts();
      
      // Refresh counts every 30 seconds
      setInterval(() => this.loadCounts(), 30000);
    }

    createSidebarHTML() {
      // Find the designated sidebar container
      const sidebarContainer = document.getElementById('task-sidebar-container');
      if (!sidebarContainer) {
        console.warn('Task sidebar container not found');
        return;
      }

      // Insert sidebar HTML into the container
      sidebarContainer.innerHTML = this.getSidebarHTML();
      
      // Set up toggle functionality
      this.setupToggleBehavior();
    }

    getSidebarHTML() {
      return `
      <nav class="task-sidebar" id="taskSidebar">
        <div class="sidebar-section">
          <div class="sidebar-section-header">
            <span class="sidebar-section-title">Views</span>
          </div>
          <ul class="sidebar-nav-list">
            <li class="sidebar-nav-item" data-view="today">
              <a href="#" class="sidebar-nav-link">
                <i class="fas fa-calendar-day sidebar-nav-icon"></i>
                <span class="sidebar-nav-text">Today</span>
                <span class="sidebar-nav-count" id="sidebarTodayCount">0</span>
              </a>
            </li>
            <li class="sidebar-nav-item" data-view="next7days">
              <a href="#" class="sidebar-nav-link">
                <i class="fas fa-calendar-week sidebar-nav-icon"></i>
                <span class="sidebar-nav-text">Next 7 Days</span>
                <span class="sidebar-nav-count" id="sidebarNext7DaysCount">0</span>
              </a>
            </li>
            <li class="sidebar-nav-item" data-view="inbox">
              <a href="#" class="sidebar-nav-link">
                <i class="fas fa-inbox sidebar-nav-icon"></i>
                <span class="sidebar-nav-text">Inbox</span>
                <span class="sidebar-nav-count" id="sidebarInboxCount">0</span>
              </a>
            </li>
            <li class="sidebar-nav-item" data-view="eisenhower">
              <a href="#" class="sidebar-nav-link">
                <i class="fas fa-th sidebar-nav-icon"></i>
                <span class="sidebar-nav-text">Eisenhower Matrix</span>
                <span class="sidebar-nav-count" id="sidebarEisenhowerCount">0</span>
              </a>
            </li>
          </ul>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-header">
            <span class="sidebar-section-title">Lists</span>
            <button class="sidebar-section-action" id="refreshTagsBtn" title="Refresh lists">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
          <ul class="sidebar-nav-list" id="sidebarTagsList">
            <!-- Tag-based lists will be populated here -->
          </ul>
          <div class="sidebar-empty-state" id="sidebarTagsEmpty" style="display: none;">
            <p class="empty-text">No lists yet</p>
            <p class="empty-hint">Add tags to tasks to create lists</p>
          </div>
        </div>
      </nav>
    `;
    }

    setupToggleBehavior() {
      const toggleButton = document.getElementById('openTasksQuick');
      const sidebarContainer = document.getElementById('task-sidebar-container');
      toggleButton?.querySelector('.toggle-arrow');
      
      if (!toggleButton || !sidebarContainer) {
        console.warn('Toggle elements not found');
        return;
      }

      // Set up click handler for toggle
      toggleButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleSidebar();
      });

      // Initialize collapsed state
      this.isCollapsed = true;
      this.updateToggleState();
    }

    toggleSidebar() {
      const sidebarContainer = document.getElementById('task-sidebar-container');
      if (!sidebarContainer) return;

      this.isCollapsed = !this.isCollapsed;
      
      if (this.isCollapsed) {
        sidebarContainer.classList.add('is-hidden');
      } else {
        sidebarContainer.classList.remove('is-hidden');
      }
      
      this.updateToggleState();
    }

    updateToggleState() {
      const toggleArrow = document.querySelector('#openTasksQuick .toggle-arrow');
      if (!toggleArrow) return;

      if (this.isCollapsed) {
        toggleArrow.style.transform = 'rotate(-90deg)';
      } else {
        toggleArrow.style.transform = 'rotate(0deg)';
      }
    }

    bindEvents() {
      const sidebar = document.getElementById('taskSidebar');
      if (!sidebar) return;

      // Handle navigation clicks
      sidebar.addEventListener('click', (e) => {
        const navItem = e.target.closest('.sidebar-nav-item');
        if (!navItem) return;

        e.preventDefault();
        
        // Ensure the main Tasks section is visible in the current tab
        console.debug('Before ensureTasksMainVisible, sidebar exists:', !!document.getElementById('taskSidebar'));
        this.ensureTasksMainVisible();
        console.debug('After ensureTasksMainVisible, sidebar exists:', !!document.getElementById('taskSidebar'));

        const viewId = navItem.dataset.view;
        const tagName = navItem.dataset.tag;
        
        if (viewId) {
          // Built-in view
          if (this.ctrl.viewsRouter) {
            this.ctrl.viewsRouter.switchToView(viewId);
          }
        } else if (tagName) {
          // Tag-based list view
          if (this.ctrl.viewsRouter) {
            this.ctrl.viewsRouter.switchToView(`list:${tagName}`);
          }
        }
      });

      // Refresh tags button
      const refreshBtn = document.getElementById('refreshTagsBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.loadCounts();
        });
      }
    }

    async loadCounts() {
      try {
        const [countsRes, tagsRes] = await Promise.all([
          TasksAPI.counts(),
          TagsAPI.list({ limit: 1000 })
        ]);
        this.counts = countsRes.counts || {};
        const tags = tagsRes.tags || [];
        this.tagsMetaByName = {};
        tags.forEach(t => {
          if (t && t.name) {
            this.tagsMetaByName[t.name] = { id: t.id, icon: t.icon };
          }
        });
        this.updateCountDisplays();
        this.updateTagsList();
      } catch (error) {
        console.error('Error loading counts:', error);
      }
    }

    updateCountDisplays() {
      // Debug: Check if sidebar still exists
      const sidebar = document.getElementById('taskSidebar');
      console.debug('updateCountDisplays - sidebar exists:', !!sidebar);
      
      if (!sidebar) {
        console.warn('Sidebar not found during count update, recreating...');
        this.createSidebarHTML();
        return;
      }
      
      // Update built-in view counts
      const countMap = {
        'sidebarTodayCount': this.counts.today || 0,
        'sidebarNext7DaysCount': this.counts.next_7_days || 0,
        'sidebarInboxCount': this.counts.inbox || 0,
        'sidebarEisenhowerCount': (this.counts.eisenhower?.total) || 0
      };

      Object.entries(countMap).forEach(([elementId, count]) => {
        const element = document.getElementById(elementId);
        if (element) {
          element.textContent = count;
          element.style.display = count > 0 ? 'inline' : 'none';
        } else {
          console.warn('Count element not found:', elementId);
        }
      });
    }

    updateTagsList() {
      const tagsList = document.getElementById('sidebarTagsList');
      const tagsEmpty = document.getElementById('sidebarTagsEmpty');
      
      if (!tagsList) return;

      const tags = this.counts.tags || {};
      const tagEntries = Object.entries(tags)
        .filter(([name, count]) => count > 0)
        .sort(([a], [b]) => a.localeCompare(b));

      if (tagEntries.length === 0) {
        tagsList.style.display = 'none';
        if (tagsEmpty) tagsEmpty.style.display = 'block';
        return;
      }

      tagsList.style.display = 'block';
      if (tagsEmpty) tagsEmpty.style.display = 'none';

      tagsList.innerHTML = tagEntries.map(([tagName, count]) => {
        const meta = this.tagsMetaByName[tagName] || {};
    const icon = meta.icon;
    const iconHtml = icon ? `<span class="sidebar-emoji">${icon}</span>` : `<i class="fas fa-tag sidebar-nav-icon"></i>`;
        return `
        <li class="sidebar-nav-item" data-tag="${tagName}">
          <a href="#" class="sidebar-nav-link">
            ${iconHtml}
            <span class="sidebar-nav-text">${tagName}</span>
            <span class="sidebar-nav-count">${count}</span>
          </a>
        </li>
      `;
      }).join('');
    }

    updateActiveView(viewId) {
      // Remove active class from all items
      const sidebar = document.getElementById('taskSidebar');
      if (!sidebar) return;

      sidebar.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.classList.remove('active');
      });

      // Add active class to current view
      let activeItem = null;
      
      if (viewId.startsWith('list:')) {
        const tagName = viewId.substring(5);
        activeItem = sidebar.querySelector(`[data-tag="${tagName}"]`);
      } else {
        activeItem = sidebar.querySelector(`[data-view="${viewId}"]`);
      }

      if (activeItem) {
        activeItem.classList.add('active');
      }
    }

    refresh() {
      this.loadCounts();
    }

    // Get sidebar DOM element for external styling/manipulation
    getElement() {
      return document.getElementById('taskSidebar');
    }

    // Show/hide sidebar (for mobile responsive behavior)
    show() {
      const sidebar = this.getElement();
      if (sidebar) sidebar.classList.remove('collapsed');
    }

    hide() {
      const sidebar = this.getElement();
      if (sidebar) sidebar.classList.add('collapsed');
    }

    toggle() {
      const sidebar = this.getElement();
      if (sidebar) {
        if (sidebar.classList.contains('collapsed')) {
          this.show();
        } else {
          this.hide();
        }
      }
    }

    // Make sure Tasks content area is shown (and others hidden)
    ensureTasksMainVisible() {
      try {
        // Don't hide sidebar containers - only main content sections
        const idsToHide = ['notesSection', 'chatSection', 'jobsSection', 'agentsSection', 'tagsSection'];
        const tasksSection = document.getElementById('tasksSection');
        
        if (tasksSection) {
          tasksSection.classList.remove('is-hidden');
        }
        
        idsToHide.forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.classList.add('is-hidden');
        });
        
        // DON'T dispatch tabChanged event as it hides the noteTreeContainer which contains our sidebar
        // Instead, manually update tab UI without hiding our sidebar
        const tasksTabBtn = document.getElementById('tasksTabBtn');
        if (tasksTabBtn) {
          // Remove active from other tabs
          ['notesTabBtn', 'chatTabBtn', 'agentsTabBtn', 'tagsTabBtn'].forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) btn.classList.remove('active');
          });
          // Add active to tasks tab
          tasksTabBtn.classList.add('active');
        }
        
        // Debug: check if sidebar is still there
        console.debug('Sidebar after manual tab switch:', document.getElementById('taskSidebar'));
        
      } catch (error) {
        console.warn('Error in ensureTasksMainVisible:', error);
      }
    }
  }

  function bootstrapTaskSidebar(controller) {
    if (!controller) return null;
    
    const sidebar = new TaskSidebar(controller);
    controller.sidebar = sidebar;
    
    return sidebar;
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
      this.currentViewContext = null; // For view-specific behavior
      
      // Initialize components
      this.viewsRouter = null;
      this.sidebar = null;
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

      // Initialize sidebar and views router
      this.sidebar = bootstrapTaskSidebar(this);
      this.viewsRouter = bootstrapTaskViews(this);

      // Load initial tasks (views router will handle specific views)
      try {
        const res = await TasksAPI.list();
        this.tasks = res.tasks || [];
        
        // Initialize view system instead of direct render
        if (this.viewsRouter) {
          // Views router will handle initial view and rendering
        } else {
          // Fallback to legacy rendering
          this.render();
          this.hidePanel();
        }
        
      } catch (e) {
        notify(`Error loading tasks: ${e.message}`, 'error');
      }

      // Bind basic interactions only if legacy manager isn't active
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
        // If using views router, reload the current view
        if (this.viewsRouter) {
          const currentView = this.viewsRouter.getCurrentView();
          if (currentView) {
            await this.viewsRouter.switchToView(currentView, false);
            
            // Update sidebar counts
            if (this.sidebar) {
              this.sidebar.refresh();
            }
            return;
          }
        }
        
        // Fallback to legacy behavior
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
      this.selectedTaskIndex = -1;
      const { taskPanelOverlay, taskRightPanel, taskDetailsPanel, panelEmptyState } = this.els;
      const layout = document.querySelector('.task-editor-layout');
      if (layout) layout.classList.remove('with-details');
      if (taskRightPanel) taskRightPanel.classList.remove('open');
      if (taskPanelOverlay) taskPanelOverlay.classList.add('is-hidden');
      if (taskDetailsPanel) taskDetailsPanel.classList.add('is-hidden');
      if (panelEmptyState) panelEmptyState.classList.remove('is-hidden');
      const sec = document.getElementById('tasksSection');
      if (sec) sec.querySelectorAll('.task-row').forEach((r) => r.classList.remove('selected'));
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
          // Toggle: if clicking the same selected task, close the panel
          if (this.selectedTask && String(this.selectedTask.id) === String(id)) {
            this.hidePanel();
            return;
          }
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
      // Sync selectedTaskIndex to match the row order for keyboard nav
      try {
        const list = Array.from(document.querySelectorAll('#tasksSection .task-bucket:not(.is-hidden) .bucket-content:not(.is-hidden) .task-row'));
        const idx = list.findIndex((r) => String(r.getAttribute('data-task-id')) === String(task.id));
        if (idx >= 0) this.selectedTaskIndex = idx; else this.selectedTaskIndex = -1;
      } catch (_) {}
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

  // EditorJS-based Tasks Overview and Inline Editing
  // - Replaces visual rendering of #taskList with an EditorJS checklist-based overview
  // - Right panel exposes metadata editing for the selected task

  (function() {
    const api = {
      async getTasks() {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load tasks');
        return data.tasks || [];
      },
      async updateTask(id, updates) {
        const res = await fetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update task');
        return data.task;
      },
      async createTask(payload) {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create task');
        return data.task;
      }
    };

    let editor = null;
    let tasks = [];
    // Simple in-memory index by title to id to support quick mapping
    const titleToId = new Map();
    let selectedTaskId = null;

    function setStatusPill(status) {
      const pill = document.getElementById('taskMetaStatusPill');
      if (!pill) return;
      pill.textContent = status === 'completed' ? 'Completed' : (status === 'in_progress' ? 'In progress' : 'Pending');
    }

    function fillMetaPanel(task) {
      if (!task) return;
      selectedTaskId = task.id;
      setStatusPill(task.status || 'pending');
      const t = (id) => document.getElementById(id);
      t('taskMetaTitle').value = task.title || '';
      if (task.due_date) t('taskMetaDate').value = task.due_date;
      else t('taskMetaDate').value = '';
      if (task.due_time) t('taskMetaTime').value = task.due_time?.slice(0,5) || '';
      else t('taskMetaTime').value = '';
      t('taskMetaPriority').value = task.priority || '';
      const tagNames = (task.tags || []).map(x => typeof x === 'object' ? x.name : x);
      t('taskMetaTags').value = tagNames.join(', ');
      t('taskMetaRepeat').value = task.repeat_pattern || '';
    }

    function taskToChecklistBlock(task) {
      // Show title in bold; add tiny pills for due time if present
      let titleHtml = `<b>${escapeHtml(task.title || '')}</b>`;
      const pills = [];
      if (task.due_date) pills.push(`📅 ${task.due_date}`);
      if (task.due_time) pills.push(`⏰ ${task.due_time.substring(0,5)}`);
      if (task.priority) pills.push(priorityPill(task.priority));
      if (pills.length) titleHtml += ` <span style="color:#888;">${pills.join(' · ')}</span>`;
      return {
        type: 'checklist',
        data: {
          items: [{ text: titleHtml, checked: task.status === 'completed' }]
        }
      };
    }

    function priorityPill(p) {
      const map = { urgente: '🔥', alta: '🔴', media: '🟡', baja: '🟢' };
      return `${map[p] || ''} ${p}`;
    }

    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
    }

    async function loadAndRender() {
      tasks = await api.getTasks();
      titleToId.clear();
      tasks.forEach(t => titleToId.set((t.title || '').trim().toLowerCase(), t.id));

      const blocks = tasks.map(taskToChecklistBlock);

      if (!editor) {
        const HeaderTool = window.Header;
        const ChecklistTool = window.Checklist;
        const ListTool = window.List;
        const MarkerTool = window.Marker;
        const ToggleBlockTool = window.ToggleBlock;

        const tools = {};
        if (HeaderTool) tools.header = { class: HeaderTool, inlineToolbar: ['link'] };
        if (ChecklistTool) tools.checklist = { class: ChecklistTool, inlineToolbar: ['bold', 'marker', 'link'] };
        if (ListTool) tools.list = { class: ListTool, inlineToolbar: true };
        if (MarkerTool) tools.marker = { class: MarkerTool };
        if (ToggleBlockTool) tools.toggle = { class: ToggleBlockTool };

        editor = new EditorJS({
          holder: 'taskEditor',
          autofocus: false,
          tools,
          data: { blocks }
        });
      } else {
        await editor.isReady;
        // Replace content
        const apiBlocks = editor.blocks;
        apiBlocks.clear();
        blocks.forEach(b => apiBlocks.insert(b.type, b.data));
      }
    }

    // Delegate checkbox toggles to API updates
    function bindEditorDomEvents() {
      const holder = document.getElementById('taskEditor');
      if (!holder) return;

      holder.addEventListener('change', async (e) => {
        const el = e.target;
        if (el && el.matches('input[type="checkbox"]')) {
          // Find the nearest checklist item text content
          const item = el.closest('.cdx-checklist__item');
          const textEl = item && item.querySelector('.cdx-checklist__item-text');
          const plain = textEl ? textEl.textContent.trim() : '';
          if (!plain) return;

          // Map by normalized title
          const id = titleToId.get(plain.toLowerCase());
          if (!id) return;

          try {
            const newStatus = el.checked ? 'completed' : 'pending';
            const updated = await api.updateTask(id, { status: newStatus });
            setStatusPill(updated.status);
          } catch (err) {
            console.error('Failed to update task status', err);
          }
        }
      });

      holder.addEventListener('click', (e) => {
        const item = e.target.closest('.cdx-checklist__item');
        if (!item) return;
        const textEl = item.querySelector('.cdx-checklist__item-text');
        const plain = textEl ? textEl.textContent.trim() : '';
        const id = titleToId.get(plain.toLowerCase());
        if (!id) return;
        const task = tasks.find(t => t.id === id);
        if (task) fillMetaPanel(task);
      });
    }

    function bindMetaPanelActions() {
      const saveBtn = document.getElementById('taskMetaSave');
      const completeBtn = document.getElementById('taskMetaComplete');
      const syncBtn = document.getElementById('taskEditorSync');
      if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
          // Create new tasks from any lines that don't match existing titles
          if (!editor) return;
          try {
            const saved = await editor.save();
            const seen = new Set([...titleToId.keys()]);
            const pendingCreates = [];
            saved.blocks.forEach(b => {
              if (b.type !== 'checklist') return;
              (b.data.items || []).forEach(item => {
                const title = (item.text || '').replace(/<[^>]*>/g, '').trim();
                if (!title) return;
                const key = title.toLowerCase();
                if (!titleToId.has(key)) {
                  pendingCreates.push({ title, status: item.checked ? 'completed' : 'pending' });
                } else {
                  seen.delete(key);
                }
              });
            });
            for (const payload of pendingCreates) {
              const created = await api.createTask(payload);
            }
            await loadAndRender();
          } catch (e) {
            console.error('Sync failed', e);
          }
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          if (!selectedTaskId) return;
          const t = (id) => document.getElementById(id);
          const updates = {
            title: t('taskMetaTitle').value.trim(),
            priority: t('taskMetaPriority').value || null,
            repeat_pattern: t('taskMetaRepeat').value || null,
          };
          const d = t('taskMetaDate').value;
          const tm = t('taskMetaTime').value;
          if (d) updates.due_date = d;
          if (tm) updates.due_time = tm + ':00';
          const tags = t('taskMetaTags').value.split(',').map(x => x.trim()).filter(Boolean);
          if (tags.length) updates.tags = tags;
          try {
            await api.updateTask(selectedTaskId, updates);
            await loadAndRender();
            const task = tasks.find(x => x.id === selectedTaskId);
            if (task) fillMetaPanel(task);
          } catch (e) {
            console.error('Failed saving task meta', e);
          }
        });
      }

      if (completeBtn) {
        completeBtn.addEventListener('click', async () => {
          if (!selectedTaskId) return;
          try {
            const task = tasks.find(t => t.id === selectedTaskId);
            const newStatus = task && task.status !== 'completed' ? 'completed' : 'pending';
            await api.updateTask(selectedTaskId, { status: newStatus });
            await loadAndRender();
            const updated = tasks.find(t => t.id === selectedTaskId);
            if (updated) fillMetaPanel(updated);
          } catch (e) {
            console.error('Failed toggling complete', e);
          }
        });
      }
    }

    document.addEventListener('DOMContentLoaded', async () => {
      if (!document.getElementById('tasksSection')) return;
      if (!document.getElementById('taskEditor')) return;
      try {
        bindEditorDomEvents();
        bindMetaPanelActions();
        await loadAndRender();
      } catch (e) {
        console.error('Task editor init error', e);
      }
    });
  })();

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

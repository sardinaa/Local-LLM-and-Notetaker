import { formatPreviewText } from './preview.js';
import { parseTaskDate } from './dates.js';

export function showPreview(ctrl, preview) {
  const { taskPreview, quickTaskPreview, previewText, confidenceFill, confidenceValue } = ctrl.els;
  if (!taskPreview || !quickTaskPreview || !previewText) return;
  previewText.innerHTML = formatPreviewText(preview);
  const conf = Math.round((preview.confidence || 0) * 100);
  if (confidenceFill) confidenceFill.style.width = conf + '%';
  if (confidenceValue) confidenceValue.textContent = conf + '%';
  taskPreview.classList.remove('is-hidden');
  quickTaskPreview.classList.add('active');
}

export function hidePreview(ctrl) {
  const { taskPreview, quickTaskPreview } = ctrl.els;
  if (taskPreview) taskPreview.classList.add('is-hidden');
  if (quickTaskPreview) quickTaskPreview.classList.remove('active');
}

export function renderTaskRow(task) {
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
          <span class="task-row-title ${isCompleted ? 'completed' : ''}">${escapeHtml(task.title || '')}</span>
        </div>
        ${metaStr}
      </div>
    </div>
  `;
}

export function renderBuckets(ctrl) {
  const { todayTasks, tomorrowTasks, next7daysTasks, completedTasksContainer } = ctrl.els;
  if (!todayTasks || !tomorrowTasks || !next7daysTasks || !completedTasksContainer) return;
  const groups = bucketTasksByDate(ctrl.tasks || []);
  todayTasks.innerHTML = groups.today.map(renderTaskRow).join('');
  tomorrowTasks.innerHTML = groups.tomorrow.map(renderTaskRow).join('');
  next7daysTasks.innerHTML = groups.next7days.map(renderTaskRow).join('');
  completedTasksContainer.innerHTML = groups.completed.map(renderTaskRow).join('');
}

export function renderGrouped(ctrl) {
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
            <span class="bucket-title">${escapeHtml(g.key)}</span>
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

export function sortTasks(list, viewSettings) {
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

export function bucketTasksByDate(tasks) {
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

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

import { TasksAPI } from './api.js';
import { notify } from './notifications.js';

export function updateTagPillDisplay(ctrl, task) {
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

export function bindTagSelector(ctrl) {
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
  const list = getRecent(ctrl);
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
  const list = getRecent(ctrl);
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

export async function setPrimaryTag(ctrl, name) {
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

export async function updateSuggestions(ctrl) {
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
    create.innerHTML = `Create "${escapeHtml(q)}"`;
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
      item.innerHTML = `<span>${escapeHtml(t.name)}</span>${t.usage ? `<span class="muted" style="margin-left:auto;">${t.usage}</span>` : ''}`;
      item.addEventListener('click', async () => {
        await setPrimaryTag(ctrl, t.name);
        toggleSelector(ctrl, false);
      });
      el.appendChild(item);
    });
  ctrl._suggestionIndex = Math.min(ctrl._suggestionIndex || 0, index - 1);
  highlightSuggestion(ctrl);
}

export function handleSuggestionKeys(ctrl, e) {
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

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}


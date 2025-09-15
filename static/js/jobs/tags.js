import { JobsAPI } from './api.js';
import { JobsState } from './state.js';

export async function ensureTagsLoaded() {
  if (JobsState.tags && JobsState.tags.size) return JobsState.tags;
  try {
    const res = await fetch('/api/tags?includeUsage=true&limit=1000');
    if (!res.ok) return (JobsState.tags = new Map());
    const data = await res.json();
    const map = new Map();
    (data.tags || []).forEach((t) => map.set(t.id, t));
    JobsState.tags = map;
    return map;
  } catch (e) {
    JobsState.tags = new Map();
    return JobsState.tags;
  }
}

export function tagPill(tagId) {
  const map = JobsState.tags || new Map();
  const t = map.get(tagId);
  if (!t) return '';
  const colorCls = `tag-${t.color || 'default'}`;
  const name = t.name || 'tag';
  return `<span class="tag-pill ${colorCls}" title="#${t.slug || name}"><span class="tag-name">${escapeHtml(name)}</span></span>`;
}

export async function openTagsEditor(anchorBtn) {
  const row = anchorBtn.closest('tr');
  const id = row?.getAttribute('data-id');
  const job = (JobsState.items || []).find((j) => j.id === id) || {};
  const current = new Set(job.tagIds || []);

  await ensureTagsLoaded();
  // Build popover
  const pop = document.createElement('div');
  pop.className = 'note-tags-menu jobs-tags-popover';
  pop.innerHTML = `
    <div class="tag-input-wrapper" style="margin-bottom:6px;">
      <input class="tag-input" type="text" placeholder="Filter tags...">
    </div>
    <div class="tag-suggestions" style="position:static; max-height:240px;">
      ${Array.from((JobsState.tags || new Map()).values())
        .map(
          (t) => `
        <label class="tag-suggestion" data-id="${t.id}" title="#${t.slug || ''}">
          <input type="checkbox" ${current.has(t.id) ? 'checked' : ''} ${JobsState.editMode ? '' : current.has(t.id) ? 'disabled' : ''}>
          <span class="dot dot-${t.color || 'default'}"></span>
          <span>${escapeHtml(t.name || '')}</span>
        </label>`
        )
        .join('')}
    </div>
  `;
  document.body.appendChild(pop);
  const rect = anchorBtn.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.left = Math.max(8, Math.min(window.innerWidth - 340, rect.left - 300)) + 'px';
  pop.style.top = rect.bottom + 6 + 'px';
  pop.style.width = '320px';

  const close = () => {
    pop.remove();
    document.removeEventListener('click', onDoc);
  };
  const onDoc = (e) => {
    if (!pop.contains(e.target) && e.target !== anchorBtn) close();
  };
  setTimeout(() => document.addEventListener('click', onDoc), 0);

  // Filter
  const input = pop.querySelector('.tag-input');
  input?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    pop.querySelectorAll('.tag-suggestion').forEach((l) => {
      const name = l.querySelector('span:nth-child(3)').textContent.toLowerCase();
      l.style.display = !q || name.includes(q) ? '' : 'none';
    });
  });

  // Toggle
  pop.querySelectorAll('.tag-suggestion input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      let selected;
      if (JobsState.editMode) {
        selected = Array.from(pop.querySelectorAll('.tag-suggestion input:checked')).map((x) => x.closest('label').getAttribute('data-id'));
      } else {
        const added = Array.from(pop.querySelectorAll('.tag-suggestion input:checked')).map((x) => x.closest('label').getAttribute('data-id'));
        const merged = new Set([...current, ...added]);
        selected = Array.from(merged);
      }
      try {
        const updated = await JobsAPI.patch(id, { tagIds: selected });
        const idx = (JobsState.items || []).findIndex((j) => j.id === id);
        if (idx >= 0) JobsState.items[idx] = { ...JobsState.items[idx], ...updated };
        document.dispatchEvent(new CustomEvent('jobs:render'));
      } catch (e) {
        alert('Update failed');
      }
    });
  });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}


import { JobsState } from './state.js';
import { qs, qsa } from './dom.js';
import { JobsAPI } from './api.js';
import { fmtSalary, fmtSalaryShort, openSalaryEditor } from './salary.js';
import { tagPill, openTagsEditor } from './tags.js';
import { openDetail } from './detail.js';
import { CLASSES } from '../constants/classes.js';
import { show, hide } from '../utils/dom.js';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function cellTextOrEdit(j, field) {
  const val = (j[field] ?? '').toString();
  if (JobsState.editMode) {
    return `<td class="col-${field}"><div class="editable" contenteditable="true" spellcheck="false" data-field="${field}" title="Click to edit">${escapeHtml(val)}</div></td>`;
  }
  if (field === 'position') {
    return `<td class="col-${field}" title="Open details"><a href="#" class="job-open" data-id="${j.id}">${escapeHtml(val || '(untitled)')}</a></td>`;
  }
  return `<td class="col-${field}" title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function updateBulkBar() {
  const bar = qs('#jobsBulkBar');
  const countEl = qs('#jobsBulkCount');
  const count = JobsState.selection.size;
  if (!bar || !countEl) return;
  if (count > 0) {
    show(bar);
    countEl.textContent = `${count} selected`;
  } else {
    hide(bar);
  }
}

function bindTableEvents() {
  const selectAll = qs('#jobsSelectAll');
  const checkboxes = qsa('.job-select');

  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      const on = e.target.checked;
      JobsState.selection.clear();
      checkboxes.forEach(cb => {
        cb.checked = on;
        const id = cb.getAttribute('data-id');
        if (on && id) JobsState.selection.add(id);
      });
      updateBulkBar();
    });
  }

  checkboxes.forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      if (!id) return;
      if (e.target.checked) JobsState.selection.add(id); else JobsState.selection.delete(id);
      updateBulkBar();
    });
  });

  // Inline text edits
  qsa('.editable').forEach((el) => {
    el.addEventListener('blur', async (e) => {
      const cell = e.currentTarget;
      const row = cell.closest('tr');
      const id = row.getAttribute('data-id');
      const field = cell.getAttribute('data-field');
      const value = cell.textContent.trim();
      await patchRow(id, { [field]: value || null });
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
    });
  });

  // Selects / checkboxes / dates
  qsa('select[data-field], input[data-field], input.date-input').forEach((el) => {
    el.addEventListener('change', async (e) => {
      const target = e.target;
      const row = target.closest('tr');
      const id = row.getAttribute('data-id');
      const field = target.getAttribute('data-field');
      let val;
      if (target.type === 'checkbox') val = target.checked ? 1 : 0;
      else val = target.value || null;
      await patchRow(id, { [field]: val });
    });
  });

  // Salary chip editor (only interactive when editable chip exists)
  qsa('.salary-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const row = chip.closest('tr');
      const id = row?.getAttribute('data-id');
      if (!id) return;
      openSalaryEditor(chip, id);
    });
  });

  // Tags editor button
  qsa('button[data-action="add-tag"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openTagsEditor(btn);
    });
  });

  // Open detail on position click or Enter on row
  qsa('.job-open').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('data-id');
      if (id) openDetail(id);
    });
  });
  qsa('tr[data-id]').forEach((tr) => {
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const id = tr.getAttribute('data-id');
        if (id) openDetail(id);
      }
    });
  });

  // Letters upload (detailed + edit mode renders button)
  qsa('button[data-action="upload-letter"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const id = row?.getAttribute('data-id');
      if (!id) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
          const res = await fetch(`/api/jobs/${id}/letters`, { method: 'POST', body: fd });
          if (!res.ok) throw new Error('Upload failed');
          const jres = await (await fetch(`/api/jobs/${id}`)).json();
          const idx = (JobsState.items || []).findIndex((x) => x.id === id);
          if (idx >= 0) JobsState.items[idx] = { ...JobsState.items[idx], ...jres };
          document.dispatchEvent(new CustomEvent('jobs:render'));
        } catch (e) {
          // eslint-disable-next-line no-alert
          alert('Upload failed');
        }
      };
      input.click();
    });
  });
}

async function patchRow(id, patch) {
  try {
    const updated = await JobsAPI.patch(id, patch);
    const idx = (JobsState.items || []).findIndex((j) => j.id === id);
    if (idx >= 0) {
      JobsState.items[idx] = { ...JobsState.items[idx], ...updated };
    }
    // Re-render to reflect changes
    document.dispatchEvent(new CustomEvent('jobs:render'));
    return true;
  } catch (e) {
    // eslint-disable-next-line no-alert
    alert('Update failed');
    return false;
  }
}

export function renderTable() {
  const wrap = qs('#jobsList');
  if (!wrap) return;
  const items = JobsState.items || [];
  if (!items.length) {
    wrap.innerHTML = '<div class="jobs-empty">No jobs yet. Click “New Job”.</div>';
    return;
  }
  let html = '';
  html += '<div class="jobs-table-scroll">';
  html += '<table class="jobs-table">';
  html += '<thead><tr>';
  const isCompact = JobsState.viewMode === 'compact';
  const cols = isCompact
    ? [
        { key: 'select', label: '' },
        { key: 'position', label: 'Position' },
        { key: 'company', label: 'Company' },
        { key: 'state', label: 'State' },
        { key: 'date_posted', label: 'Date Posted' },
      ]
    : [
        { key: 'select', label: '' },
        { key: 'position', label: 'Position' },
        { key: 'company', label: 'Company' },
        { key: 'location', label: 'Location' },
        { key: 'salary', label: 'Salary' },
        { key: 'state', label: 'State' },
        { key: 'job_type', label: 'Job Type' },
        { key: 'applied', label: 'Applied' },
        { key: 'responded', label: 'Responded' },
        { key: 'letters', label: 'Letters' },
        { key: 'tags', label: 'Tags' },
        { key: 'date_posted', label: 'Date Posted' },
      ];
  html += cols
    .map((c) => (c.key === 'select' ? `<th class="col-select"><input type="checkbox" id="jobsSelectAll" title="Select/Deselect all"></th>` : `<th>${c.label}</th>`))
    .join('');
  html += '</tr></thead>';
  html += '<tbody>';
  for (const j of items) {
    html += `<tr data-id="${j.id}">`;
    // select
    html += `<td class="col-select"><input type="checkbox" class="job-select" data-id="${j.id}"></td>`;
    // position/company (text or editable)
    html += cellTextOrEdit(j, 'position');
    html += cellTextOrEdit(j, 'company');

    // detailed-only columns
    if (!isCompact) {
      html += cellTextOrEdit(j, 'location');
      // salary chip
      const title = fmtSalary(j.salary_min, j.salary_max, j.salary_currency) || 'Set salary';
      const display = fmtSalaryShort(j.salary_min, j.salary_max);
      const chipCls = JobsState.editMode ? 'chip chip--sm chip-action salary-chip' : 'chip chip--sm';
      html += `<td class="col-salary"><span class="${chipCls}" title="${title}" data-id="${j.id}"><span class="text">${display}</span></span></td>`;
    }

    // state (select in edit mode)
    if (JobsState.editMode) {
      const states = ['draft', 'applied', 'interview', 'offer', 'rejected'];
      const options = states.map(s => `<option value="${s}" ${String(j.state||'draft')===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('');
      html += `<td class="col-state"><select class="inline-select" data-field="state" title="Change state">${options}</select></td>`;
    } else {
      html += `<td class="col-state">${statePill(j.state)}</td>`;
    }

    if (!isCompact) {
      // job type (read-only for now)
      html += `<td class="col-jobtype">${escapeHtml(j.job_type || '')}</td>`;
      // flags
      if (JobsState.editMode) {
        html += `<td class="col-flag"><input type="checkbox" data-field="applied" ${j.applied ? 'checked' : ''}></td>`;
        html += `<td class="col-flag"><input type="checkbox" data-field="responded" ${j.responded ? 'checked' : ''}></td>`;
      } else {
        html += `<td class="col-flag">${j.applied ? '✓' : '—'}</td>`;
        html += `<td class="col-flag">${j.responded ? '✓' : '—'}</td>`;
      }
      const letters = Array.isArray(j.letters) ? j.letters.length : 0;
      if (JobsState.editMode) {
        html += `<td class="col-letters"><span class="muted">${letters}</span> <button class="btn-mini" data-action="upload-letter" title="Upload PDF letter">Letter</button></td>`;
      } else {
        html += `<td class="col-letters"><span class="muted">${letters}</span></td>`;
      }
      // tags
      const pills = (j.tagIds || []).map((id) => tagPill(id)).join('') || '<span class="muted">No tags</span>';
      html += `<td class="col-tags"><div class="tags-cell" style="width:100%"><div class="tags-left">${pills}</div><div class="icons-right"><button class="plus-btn" data-action="add-tag" title="Add tag">+</button></div></div></td>`;
    }

    // date posted (input in edit mode)
    if (JobsState.editMode) {
      html += `<td class="col-date"><input type="date" class="date-input" data-field="date_posted" value="${fmtDate(j.date_posted)}"></td>`;
    } else {
      html += `<td class="col-date">${fmtDate(j.date_posted)}</td>`;
    }

    html += '</tr>';
  }
  html += '</tbody></table></div>';
  wrap.innerHTML = html;
  // Ensure wrapper reflects modes for CSS
  if (JobsState.viewMode === 'compact') wrap.classList.add('jobs-compact'); else wrap.classList.remove('jobs-compact');
  if (JobsState.editMode) wrap.classList.add('jobs-editing'); else wrap.classList.remove('jobs-editing');
  bindTableEvents();
  updateBulkBar();
}

function statePill(state) {
  const s = String(state || 'draft').toLowerCase();
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return `<span class="state-pill state-${s}">${escapeHtml(label)}</span>`;
}

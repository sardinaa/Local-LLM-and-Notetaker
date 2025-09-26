import { JobsAPI } from './api.js';
import { JobsState } from './state.js';

export function fmtSalary(min, max, cur) {
  const currency = cur || 'USD';
  const fmt = (n) => {
    if (n == null) return '';
    const num = Number(n);
    if (!isFinite(num)) return String(n);
    try { return new Intl.NumberFormat('en-US').format(num); }
    catch (e) { return String(num); }
  };
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)} ${currency}`;
  if (min != null) return `${fmt(min)}+ ${currency}`;
  if (max != null) return `≤ ${fmt(max)} ${currency}`;
  return '';
}

export function fmtSalaryShort(min, max) {
  const kfmt = (n) => {
    if (n == null) return '';
    const num = Number(n);
    if (!isFinite(num)) return String(n);
    return Math.abs(num) >= 1000 ? Math.round(num / 1000) + 'k' : String(num);
  };
  if (min != null && max != null) return `${kfmt(min)}–${kfmt(max)}`;
  if (min != null) return `${kfmt(min)}+`;
  if (max != null) return `≤ ${kfmt(max)}`;
  return 'Set salary';
}

export function openSalaryEditor(anchorEl, jobId) {
  const job = (JobsState.items || []).find((j) => j.id === jobId);
  if (!job) return;

  // Close any existing popover
  document.querySelectorAll('.jobs-popover').forEach((p) => p.remove());
  const pop = document.createElement('div');
  pop.className = 'jobs-popover';
  const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
  pop.innerHTML = `
    <div class="row" style="margin-bottom:6px;">
      <input type="number" id="salMin" placeholder="Min" value="${job.salary_min ?? ''}">
      <input type="number" id="salMax" placeholder="Max" value="${job.salary_max ?? ''}">
      <select id="salCur">${currencies
        .map((c) => `<option value="${c}" ${job.salary_currency === c ? 'selected' : ''}>${c}</option>`)
        .join('')}</select>
    </div>
    <div class="popover-actions">
      <button class="btn" data-act="clear">Clear</button>
      <button class="btn" data-act="cancel">Cancel</button>
      <button class="btn" data-act="save">Save</button>
    </div>
  `;
  document.body.appendChild(pop);
  const r = anchorEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 340, Math.max(8, r.left));
  pop.style.left = left + 'px';
  pop.style.top = r.bottom + 8 + 'px';

  const close = () => {
    pop.remove();
    document.removeEventListener('click', onDoc);
    document.removeEventListener('keydown', onKey);
  };
  const onDoc = (e) => {
    if (!pop.contains(e.target) && e.target !== anchorEl) close();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  setTimeout(() => {
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
  }, 0);

  pop.querySelector('[data-act="cancel"]').addEventListener('click', close);
  pop.querySelector('[data-act="clear"]').addEventListener('click', async () => {
    try {
      const payload = { salary_min: null, salary_max: null, salary_currency: job.salary_currency || 'USD' };
      const updated = await JobsAPI.patch(job.id, payload);
      const idx = JobsState.items.findIndex((x) => x.id === job.id);
      if (idx >= 0) JobsState.items[idx] = { ...JobsState.items[idx], ...updated };
      document.dispatchEvent(new CustomEvent('jobs:render'));
    } catch (e) {
      alert('Update failed');
    }
    close();
  });
  pop.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const minVal = pop.querySelector('#salMin').value;
    const maxVal = pop.querySelector('#salMax').value;
    const curVal = pop.querySelector('#salCur').value || 'USD';
    const payload = {
      salary_min: minVal !== '' ? Number(minVal) : null,
      salary_max: maxVal !== '' ? Number(maxVal) : null,
      salary_currency: curVal,
    };
    try {
      const updated = await JobsAPI.patch(job.id, payload);
      const idx = JobsState.items.findIndex((x) => x.id === job.id);
      if (idx >= 0) JobsState.items[idx] = { ...JobsState.items[idx], ...updated };
      document.dispatchEvent(new CustomEvent('jobs:render'));
    } catch (e) {
      alert('Update failed');
    }
    close();
  });
}


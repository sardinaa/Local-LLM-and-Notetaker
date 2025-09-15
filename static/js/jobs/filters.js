import { JobsState } from './state.js';
import { JobsAPI } from './api.js';
import { qs } from './dom.js';
import { CLASSES } from '../constants/classes.js';

export function bindFilters() {
  const search = qs('#jobsSearch');
  const position = qs('#jobsPosition');
  const company = qs('#jobsCompany');
  const location = qs('#jobsLocation');
  const state = qs('#jobsState');
  const applied = qs('#jobsApplied');
  const responded = qs('#jobsResponded');
  const hasLetters = qs('#jobsHasLetters');
  const drafts = qs('#jobsDrafts');
  const refreshBtn = qs('#jobsRefresh');
  const advBtn = qs('#jobsAdvancedFilters');
  const advRow = qs('#jobsAdvancedRow');

  const debounce = (fn, ms = 250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
  const trigger = debounce(loadJobs);

  [search, position, company, location, state].forEach(el => el && el.addEventListener('input', trigger));
  [applied, responded, hasLetters, drafts].forEach(btn => btn && btn.addEventListener('click', () => { btn.classList.toggle(CLASSES.active); trigger(); }));

  qs('#jobsClearFilters')?.addEventListener('click', () => {
    [search, position, company, location, state].forEach(el => { if (el) el.value = ''; });
    [applied, responded, hasLetters, drafts].forEach(btn => btn && btn.classList.remove(CLASSES.active));
    trigger();
  });

  refreshBtn?.addEventListener('click', () => loadJobs());

  // Advanced filters toggle
  advBtn?.addEventListener('click', () => {
    if (!advRow) return;
    const visible = advRow.style.display !== 'none';
    advRow.style.display = visible ? 'none' : 'flex';
  });
}

export function buildQuery() {
  const val = (id) => { const el = qs(id); return el && el.value ? el.value.trim() : ''; };
  const q = {};
  if (val('#jobsSearch')) q.q = val('#jobsSearch');
  if (val('#jobsPosition')) q.position = val('#jobsPosition');
  if (val('#jobsCompany')) q.company = val('#jobsCompany');
  if (val('#jobsLocation')) q.location = val('#jobsLocation');
  if (val('#jobsState')) q.state = val('#jobsState');
  if (qs('#jobsApplied')?.classList.contains(CLASSES.active)) q.applied = 'true';
  if (qs('#jobsResponded')?.classList.contains(CLASSES.active)) q.responded = 'true';
  if (qs('#jobsHasLetters')?.classList.contains(CLASSES.active)) q.hasLetters = 'true';
  if (qs('#jobsDrafts')?.classList.contains(CLASSES.active)) q.state = 'draft';
  return q;
}

export async function loadJobs() {
  if (JobsState.loading) return;
  JobsState.loading = true;
  try {
    const q = buildQuery();
    const data = await JobsAPI.list(q);
    JobsState.items = data.jobs || [];
    document.dispatchEvent(new CustomEvent('jobs:render'));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Jobs load failed', e);
  } finally {
    JobsState.loading = false;
  }
}

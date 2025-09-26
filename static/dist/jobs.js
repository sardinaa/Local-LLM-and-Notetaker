(function () {
  'use strict';

  // Lightweight state container for Jobs
  const JobsState = {
    items: [],
    loading: false,
    viewMode: 'compact', // 'compact' | 'detailed'
    editMode: false,
    selection: new Set(),
    filters: {},
    tags: new Map(),
  };

  // Minimal API wrapper for Jobs feature
  async function api(endpoint, options = {}) {
    const res = await fetch(endpoint, { headers: { 'Content-Type': 'application/json' }, ...options });
    let json = null;
    try { json = await res.json(); } catch {}
    if (!res.ok) throw new Error(json?.error || `API ${res.status}`);
    return json;
  }

  const JobsAPI = {
    list: (query = {}) => api('/api/jobs' + (Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : '')),
    get: (id) => api(`/api/jobs/${id}`),
    create: (payload = {}) => api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) }),
    patch: (id, payload) => api(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    remove: (id) => api(`/api/jobs/${id}`, { method: 'DELETE' }),
  };

  // DOM helpers specific to Jobs feature
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const CLASSES = {
    isHidden: 'is-hidden',
    active: 'active',
    selected: 'selected',
  };

  function bindFilters() {
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

  function buildQuery() {
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

  async function loadJobs() {
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

  function fmtSalary(min, max, cur) {
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

  function fmtSalaryShort(min, max) {
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

  function openSalaryEditor(anchorEl, jobId) {
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

  async function ensureTagsLoaded() {
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

  function tagPill(tagId) {
    const map = JobsState.tags || new Map();
    const t = map.get(tagId);
    if (!t) return '';
    const colorCls = `tag-${t.color || 'default'}`;
    const name = t.name || 'tag';
    return `<span class="tag-pill ${colorCls}" title="#${t.slug || name}"><span class="tag-name">${escapeHtml$2(name)}</span></span>`;
  }

  async function openTagsEditor(anchorBtn) {
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
          <span>${escapeHtml$2(t.name || '')}</span>
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

  function escapeHtml$2(s) {
    return (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  const show = (el) => { if (el) el.classList.remove('is-hidden'); };
  const hide = (el) => { if (el) el.classList.add('is-hidden'); };

  const fmtDateTimeLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toIso = (localStr) => {
    if (!localStr) return null;
    try { return new Date(localStr).toISOString(); } catch (e) { return null; }
  };
  const escapeHtml$1 = (s) => (String(s || '')).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function computeInterviewCount(events) {
    return (events || []).filter((e) => (e.type || '').toLowerCase().includes('interview')).length;
  }
  function deriveStateFromEvents(events, current) {
    const types = (events || []).map((e) => (e.type || '').toLowerCase());
    if (types.includes('rejected')) return 'rejected';
    if (types.includes('offer')) return 'offer';
    if (types.some((t) => t.includes('interview') || t.includes('screen'))) return 'interview';
    return current || 'draft';
  }
  function nextUpcomingInterview(events) {
    const now = Date.now();
    const upcoming = (events || [])
      .filter((e) => (e.type || '').toLowerCase().includes('interview') && e.dt && !isNaN(new Date(e.dt)))
      .sort((a, b) => new Date(a.dt) - new Date(b.dt));
    return upcoming.find((e) => new Date(e.dt).getTime() >= now) || null;
  }

  async function fetchJob(jobId) {
    const r1 = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (!r1.ok) throw new Error('job_fetch_failed');
    const j = await r1.json();
    let events = [];
    try {
      const r2 = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/events`);
      if (r2.ok) {
        const evr = await r2.json();
        events = evr && Array.isArray(evr.events) ? evr.events : [];
      }
    } catch (e) {}
    return { job: j, events };
  }

  function buildModal(job, events, onUpdated, options = {}) {
    // Declare editMode immediately to avoid TDZ when referenced in inner functions
    let editMode = !!options.initialEditMode;
    const overlay = document.createElement('div');
    overlay.className = 'job-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
    <div class="job-modal" style="max-width:64rem;">
      <header class="job-modal-header">
        <div>
          <h2 class="job-modal-title">${escapeHtml$1(job.position || 'Untitled')}</h2>
          <div class="job-modal-subtitle">${escapeHtml$1(job.company || '')}${job.location ? ' • ' + escapeHtml$1(job.location) : ''}</div>
        </div>
        <div class="job-modal-actions iconbar">
          <button class="icon-btn" data-act="toggle-edit" title="Enable edit mode" aria-label="Toggle Edit Mode"><i class="fas fa-pen-to-square"></i></button>
          <span class="icon-sep"></span>
          <button class="icon-btn primary" data-act="save" title="Save changes" aria-label="Save"><i class="fas fa-save"></i></button>
          <button class="icon-btn" data-act="archive" title="Archive job" aria-label="Archive"><i class="fas fa-archive"></i></button>
          <button class="icon-btn" data-act="tags" title="Manage tags" aria-label="Tags"><i class="fas fa-tags"></i></button>
          <a class="icon-btn" data-act="open" title="Open job post" aria-label="Open" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i></a>
          <button class="icon-btn danger" data-act="delete" title="Delete job" aria-label="Delete"><i class="fas fa-trash"></i></button>
          <span class="icon-spacer"></span>
          <button class="modal-close" data-act="close" aria-label="Close">×</button>
        </div>
      </header>
      <nav class="job-modal-tabs" role="tablist">
        <button role="tab" aria-selected="true" data-tab="overview">Overview</button>
        <button role="tab" aria-selected="false" data-tab="timeline">Interviews & Timeline</button>
        <button role="tab" aria-selected="false" data-tab="notes">Notes & Files</button>
      </nav>
      <main class="job-modal-body">
        <section data-panel="overview">
          <div id="j_summary_card" class="job-result view-only">
            <div class="job-result-header">
              <h3 id="j_card_title" class="job-title">${escapeHtml$1(job.position || 'Untitled')}</h3>
            </div>
            <div id="j_card_meta" class="job-meta"></div>
            <div class="job-description">
              <div id="j_desc_preview" class="job-description-content"></div>
              <button class="description-toggle" id="j_desc_preview_toggle" type="button">
                Show more <i class="fas fa-chevron-down"></i>
              </button>
            </div>
            <div class="result-actions" style="margin-top:8px;">
              <a class="btn-link" id="j_open_link" href="#" target="_blank"><i class="fas fa-up-right-from-square"></i> Open</a>
              <button class="btn-link" id="j_copy_link" type="button"><i class="fas fa-link"></i> Copy link</button>
            </div>
          </div>
          <div class="grid-auto edit-only">
            <div class="cell">
              <label>Title</label>
              <input type="text" id="j_pos" class="edit-only" value="${escapeHtml$1(job.position || '')}">
              <div class="view-only redundant-view">${escapeHtml$1(job.position || '')}</div>
            </div>
            <div class="cell">
              <label>Company</label>
              <input type="text" id="j_company" class="edit-only" value="${escapeHtml$1(job.company || '')}">
              <div class="view-only redundant-view">${escapeHtml$1(job.company || '')}</div>
            </div>
            <div class="cell">
              <label>Location</label>
              <input type="text" id="j_loc" class="edit-only" value="${escapeHtml$1(job.location || '')}">
              <div class="view-only redundant-view">${escapeHtml$1(job.location || '')}</div>
            </div>
          </div>
          <div class="grid-auto edit-only">
            <div class="cell">
              <label>Job type</label>
              <input type="text" id="j_type" class="edit-only" value="${escapeHtml$1(job.job_type || '')}">
              <div class="view-only redundant-view">${escapeHtml$1(job.job_type || '')}</div>
            </div>
            <div class="cell">
              <label>Salary min</label>
              <input type="number" id="j_sal_min" class="edit-only" value="${job.salary_min ?? ''}">
              <div class="view-only redundant-view">${escapeHtml$1(job.salary_min ?? '')}</div>
            </div>
            <div class="cell">
              <label>Salary max</label>
              <input type="number" id="j_sal_max" class="edit-only" value="${job.salary_max ?? ''}">
              <div class="view-only redundant-view">${escapeHtml$1(job.salary_max ?? '')}</div>
            </div>
            <div class="cell">
              <label>Currency</label>
              <input type="text" id="j_sal_cur" class="edit-only" value="${escapeHtml$1(job.salary_currency || '')}">
              <div class="view-only redundant-view">${escapeHtml$1(job.salary_currency || '')}</div>
            </div>
            <div class="cell">
              <label>Date Posted</label>
              <input type="date" id="j_date_posted" class="edit-only" value="${job.date_posted ? escapeHtml$1(String(job.date_posted).slice(0,10)) : ''}">
              <div class="view-only redundant-view">${escapeHtml$1(job.date_posted ? String(job.date_posted).slice(0,10) : '')}</div>
            </div>
          </div>
          <div class="detail-card">
            <div class="detail-card-header">Recruiter / Contact</div>
            <div class="grid-auto">
              <div class="cell"><label class="form-label">Name</label><input type="text" id="j_rec_name" class="form-input edit-only" value="${escapeHtml$1(job.contact_name || '')}"><div class="view-only kv-row"><span class="kv-value" id="j_rec_name_view">${escapeHtml$1(job.contact_name || '')}</span></div></div>
              <div class="cell"><label class="form-label">Role</label><input type="text" id="j_rec_role" class="form-input edit-only" placeholder="Role" value="${escapeHtml$1(job.contact_role || '')}"><div class="view-only kv-row"><span class="kv-value" id="j_rec_role_view">${escapeHtml$1(job.contact_role || '')}</span></div></div>
            </div>
            <div class="grid-auto">
              <div class="cell full">
                <label class="form-label">Contacts</label>
                <div class="contact-edit-list" id="j_contacts_list"></div>
                <div class="row edit-only" id="j_contacts_add">
                  <input type="text" id="j_contact_value" class="form-input" placeholder="Add email, phone, or URL and press Enter">
                  <button class="icon-btn" id="j_contact_add_btn" title="Add contact"><i class="fas fa-plus"></i></button>
                </div>
              </div>
            </div>
          </div>

          <div class="detail-card">
            <div class="detail-card-header">Next Steps</div>
            <div class="grid-auto">
              <div class="cell">
                <label class="form-label">Next follow-up</label>
                <div class="row">
                  <span class="view-only kv-value pill" id="j_follow_view"></span>
                  <input type="datetime-local" id="j_follow" class="form-input edit-only" value="${fmtDateTimeLocal(job.next_follow_up)}">
                  <button class="btn" data-act="follow+1d">+1d</button>
                  <button class="btn" data-act="follow+1w">+1w</button>
                </div>
              </div>
              <div class="cell full">
                <label class="form-label">Application Source URL</label>
                <div class="row">
                  <a class="view-only btn-link" id="j_src_view" href="#" target="_blank"></a>
                  <input type="url" id="j_src" class="form-input edit-only" placeholder="https://…" value="${escapeHtml$1(job.source_url || '')}">
                  <button class="btn" id="j_src_autofill" type="button" title="Autofill from URL">Autofill</button>
                </div>
              </div>
            </div>
          </div>

          

          <div class="detail-card edit-only">
            <div class="detail-card-header">Job Description</div>
            <div class="desc-block">
              <textarea id="j_desc" class="form-textarea" rows="6" placeholder="Job description (Markdown supported)">${escapeHtml$1(job.description || '')}</textarea>
            </div>
          </div>
        </section>
        <section class="is-hidden" data-panel="timeline">
          <div class="timeline-head">
            <div id="j_next_cta" class="next-interview"></div>
            <button class="btn btn-primary" data-act="add-event">Add event</button>
          </div>
          <div id="j_timeline" class="timeline"></div>
        </section>
        <section class="is-hidden" data-panel="notes">
          <div class="row space-between">
            <label>Notes (markdown supported)</label>
            <span class="muted">Autosaves (Ctrl/Cmd+S)</span>
          </div>
          <textarea id="j_notes" rows="10" placeholder="Notes...">${escapeHtml$1(job.notes || '')}</textarea>
          <div class="files-row">
            <div>
              <strong>Letters:</strong> <span id="j_letters_count">${(job.letters || []).length}</span>
              <button class="btn" data-act="upload-letter">Upload letter</button>
            </div>
            <div id="j_letters_list" class="letters-list">${(job.letters || [])
              .map((l) => `<a href="/api/jobs/${job.id}/letters/${encodeURIComponent(l.filename)}" target="_blank">${escapeHtml$1(l.filename)}</a>`)
              .join(' ')}</div>
          </div>
        </section>
      </main>
    </div>
  `;

    const q = (id) => overlay.querySelector(`#${id}`);
    const aopen = overlay.querySelector('[data-act="open"]');
    if (aopen) aopen.href = job.source_url || '#';

    // Autofill from URL with preview
    const autoBtn = overlay.querySelector('#j_src_autofill');
    if (autoBtn) {
      const getVal = (id) => { const el = overlay.querySelector('#' + id); return el ? (el.value || '') : ''; };
      autoBtn.addEventListener('click', async () => {
        const inp = q('j_src');
        const url = (inp && inp.value) ? inp.value.trim() : '';
        if (!url) { alert('Paste a job URL first'); return; }
        const prev = autoBtn.textContent;
        autoBtn.disabled = true;
        autoBtn.textContent = 'Autofilling…';
        try {
          const res = await fetch('/api/jobs/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
          if (!res.ok) throw new Error('scrape_failed');
          const data = await res.json();
          const pf = (data && data.prefill) || {};
          const prov = (data && data.provenance) || {};

          const current = {
            position: getVal('j_pos'),
            company: getVal('j_company'),
            location: getVal('j_loc'),
            job_type: getVal('j_type'),
            salary_min: getVal('j_sal_min'),
            salary_max: getVal('j_sal_max'),
            salary_currency: getVal('j_sal_cur'),
            date_posted: getVal('j_date_posted'),
            description: getVal('j_desc'),
            source_url: getVal('j_src'),
          };
          const candidates = {};
          const fields = ['position','company','location','job_type','salary_min','salary_max','salary_currency','date_posted','description','source_url'];
          fields.forEach((k) => {
            const provK = prov && prov[k] ? prov[k] : null;
            const candVal = k in pf ? pf[k] : provK ? provK.value : undefined;
            const score = provK ? provK.score : null;
            const oldVal = String(current[k] ?? '');
            const newVal = candVal != null ? String(candVal) : '';
            const changed = newVal !== '' && newVal !== oldVal;
            const canApply = newVal !== '';
            candidates[k] = { old: oldVal, value: candVal, score, changed, canApply };
          });
          const coreSet = new Set(['position', 'company', 'location', 'description']);
          let coverageHit = 0;
          coreSet.forEach((k) => { const c = candidates[k]; if (c && c.canApply && (c.score == null || c.score >= 0.7)) coverageHit++; });

          const preview = document.createElement('div');
          preview.className = 'autofill-preview';
          preview.style.cssText = 'margin-top:6px;border:1px solid #ddd;border-radius:6px;padding:8px;background:#fafafa;';
          preview.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <strong>Autofill Preview</strong>
            <span class="muted">Select fields to apply • Coverage: ${coverageHit}/${coreSet.size}</span>
            <span style="margin-left:auto"></span>
            <button class="btn btn-secondary" data-act="cancel">Cancel</button>
            <button class="btn btn-primary" data-act="apply">Apply selected</button>
          </div>
          <div class="af-list" style="max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:6px;"></div>
        `;
          const list = preview.querySelector('.af-list');
          const label = (k) => ({ position: 'Title', company: 'Company', location: 'Location', job_type: 'Job type', salary_min: 'Salary min', salary_max: 'Salary max', salary_currency: 'Currency', date_posted: 'Date Posted', description: 'Description', source_url: 'Source URL' })[k] || k;
          Object.entries(candidates).forEach(([k, v]) => {
            const row = document.createElement('label');
            row.style.cssText = 'display:block;background:#fff;border:1px solid #eee;border-radius:6px;padding:6px;';
            const score = v.score != null ? ` (${(v.score * 100) | 0}%)` : '';
            const checked = v.changed && (v.score != null ? v.score >= 0.7 : true);
            const disabled = !v.canApply;
            const oldShort = String(v.old || '').slice(0, 120);
            const newShort = v.value != null ? String(v.value).slice(0, 120) : '';
            const content = v.canApply ? `${v.changed ? `<span style=\"text-decoration:line-through;color:#a00;\">${escapeHtml$1(oldShort)}</span> → ` : ''}<span>${escapeHtml$1(newShort)}</span>` : `<span class=\"muted\">— not detected</span>`;
            row.innerHTML = `
            <input type=\"checkbox\" data-key=\"${k}\" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style=\"margin-right:6px;\">\n
            <strong>${label(k)}</strong><span class=\"muted\">${score}</span>\n
            <div class=\"muted\" style=\"margin-top:4px;\">${content}</div>`;
            list.appendChild(row);
          });
          const urlRow = q('j_src')?.closest('.row');
          if (urlRow) {
            const prevPrev = overlay.querySelector('.autofill-preview');
            if (prevPrev) prevPrev.remove();
            urlRow.parentElement.appendChild(preview);
          }
          preview.querySelector('[data-act="cancel"]').addEventListener('click', () => preview.remove());
          preview.querySelector('[data-act="apply"]').addEventListener('click', () => {
            const selected = Array.from(preview.querySelectorAll('input[type="checkbox"]')).filter((x) => x.checked && !x.disabled).map((x) => x.getAttribute('data-key'));
            selected.forEach((k) => {
              const v = candidates[k]?.value;
              const el = q(
                k === 'position' ? 'j_pos' :
                k === 'company' ? 'j_company' :
                k === 'location' ? 'j_loc' :
                k === 'job_type' ? 'j_type' :
                k === 'salary_min' ? 'j_sal_min' :
                k === 'salary_max' ? 'j_sal_max' :
                k === 'salary_currency' ? 'j_sal_cur' :
                k === 'date_posted' ? 'j_date_posted' :
                k === 'description' ? 'j_desc' :
                k === 'source_url' ? 'j_src' : ''
              );
              if (el) el.value = v != null ? v : '';
            });
            // sync job object from inputs
            job.position = q('j_pos')?.value || job.position;
            job.company = q('j_company')?.value || job.company;
            job.location = q('j_loc')?.value || job.location;
            job.job_type = q('j_type')?.value || job.job_type;
            job.salary_min = q('j_sal_min')?.value ? Number(q('j_sal_min').value) : null;
            job.salary_max = q('j_sal_max')?.value ? Number(q('j_sal_max').value) : null;
            job.salary_currency = q('j_sal_cur')?.value || job.salary_currency;
            job.date_posted = q('j_date_posted')?.value || job.date_posted;
            job.description = q('j_desc')?.value || job.description;
            job.source_url = q('j_src')?.value || job.source_url;
            renderSummaryCard();
            renderReadViews();
            if (aopen && q('j_src')) aopen.href = q('j_src').value;
            preview.remove();
          });
        } catch (e) {
          console.warn('Autofill failed', e);
          alert('Could not autofill from the provided URL');
        } finally {
          autoBtn.textContent = prev;
          autoBtn.disabled = !overlay.classList.contains('editing');
        }
      });
    }

    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(true); }
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="close"]').addEventListener('click', close);
    document.body.appendChild(overlay);

    // Tabs
    const tabs = overlay.querySelectorAll('.job-modal-tabs [role="tab"]');
    const panels = overlay.querySelectorAll('[data-panel]');
    tabs.forEach((btn) => btn.addEventListener('click', () => {
      tabs.forEach((b) => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      const name = btn.getAttribute('data-tab');
      panels.forEach((p) => p.classList.toggle(CLASSES.isHidden, p.getAttribute('data-panel') !== name));
    }));

    // Render summary card meta pills
    const fmtSalaryLong = (min, max, cur) => {
      const currency = cur || 'USD';
      const fmt = (n) => { if (n == null) return ''; const num = Number(n); if (!isFinite(num)) return String(n); try { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num); } catch (e) { return String(num); } };
      if (min != null && max != null) return `${fmt(min)} – ${fmt(max)} ${currency}`;
      if (min != null) return `${fmt(min)}+ ${currency}`;
      if (max != null) return `≤ ${fmt(max)} ${currency}`;
      return '';
    };
    function renderSummaryCard() {
      const titleEl = overlay.querySelector('#j_card_title');
      if (titleEl) titleEl.textContent = job.position || 'Untitled';
      const metaEl = overlay.querySelector('#j_card_meta');
      if (metaEl) {
        const locText = (job.location || '').trim();
        const salText = fmtSalaryLong(job.salary_min, job.salary_max, job.salary_currency) || '';
    const pills = [];
        pills.push(`<span class=\"job-pill company\"><i class=\"fas fa-building\"></i>${escapeHtml$1(job.company || 'Unknown')}</span>`);
    if ((job.job_type || '').trim()) pills.push(`<span class=\"job-pill work-type\"><i class=\"fas fa-briefcase\"></i>${escapeHtml$1(job.job_type)}</span>`);
        if (locText) pills.push(`<span class=\"job-pill location\"><i class=\"fas fa-location-dot\"></i>${escapeHtml$1(locText)}</span>`);
        if (salText) pills.push(`<span class=\"job-pill salary\"><i class=\"fas fa-money-bill-1\"></i>${escapeHtml$1(salText)}</span>`);
        const state = (job.state || 'draft').toLowerCase();
        pills.push(`<span class=\"job-pill posted-date\"><i class=\"fas fa-circle\"></i>${escapeHtml$1(state.replace(/^./, c=>c.toUpperCase()))} • Int: <strong id=\"j_int_count\">${computeInterviewCount(events)}</strong></span>`);
        metaEl.innerHTML = pills.join(' ');
      }
      const openA = overlay.querySelector('#j_open_link');
      if (openA) openA.href = job.source_url || '#';
      const copyBtn = overlay.querySelector('#j_copy_link');
      if (copyBtn) copyBtn.onclick = async () => {
        try { await navigator.clipboard.writeText(job.source_url || ''); copyBtn.textContent = 'Copied'; setTimeout(()=>copyBtn.textContent='Copy link', 1200); } catch {}
      };
      const prevEl = overlay.querySelector('#j_desc_preview');
      if (prevEl) {
        const md = job.description || '';
        const html = (window.marked && typeof window.marked.parse==='function') ? window.marked.parse(md) : escapeHtml$1(md).replace(/\n/g,'<br>');
        prevEl.innerHTML = html;
        prevEl.classList.remove('expanded');
      }
    }
    renderSummaryCard();

    // Recruiter contacts list - declare contactHandles before renderReadViews
    const contactHandles = Array.isArray(job.contact_handles) ? job.contact_handles : [];

    renderReadViews();

    const previewToggle = overlay.querySelector('#j_desc_preview_toggle');
    if (previewToggle) {
      let expanded = false;
      previewToggle.addEventListener('click', () => {
        expanded = !expanded;
        const c = overlay.querySelector('#j_desc_preview');
        if (c) c.classList.toggle('expanded', expanded);
        previewToggle.innerHTML = expanded ? 'Show less <i class="fas fa-chevron-up"></i>' : 'Show more <i class="fas fa-chevron-down"></i>';
      });
    }

    // benefits removed
    function renderContactsEdit() {
      const wrap = q('j_contacts_list'); if (!wrap) return;
      wrap.innerHTML = (contactHandles || []).map((h, idx) => `
      <div class=\"row\" data-idx=\"${idx}\">
        <span class=\"pill muted\" style=\"min-width:88px;text-align:center;\">${escapeHtml$1(h.type || 'Other')}</span>
        <input type=\"text\" class=\"j_contact_value_in\" value=\"${escapeHtml$1(h.value||'')}\"> 
        <button class=\"btn btn-mini danger\" data-act=\"rm\">Remove</button>
      </div>`).join('');
      wrap.querySelectorAll('[data-act="rm"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = btn.closest('[data-idx]'); const idx = Number(row.getAttribute('data-idx'));
          const arr = Array.isArray(job.contact_handles) ? job.contact_handles : contactHandles;
          arr.splice(idx, 1);
          job.contact_handles = arr;
          renderContactsEdit();
          renderContactsView();
        });
      });
      wrap.querySelectorAll('.j_contact_value_in').forEach((inp) => {
        inp.addEventListener('input', () => {
          const row = inp.closest('[data-idx]');
          const idx = Number(row.getAttribute('data-idx'));
          const arr = Array.isArray(job.contact_handles) ? job.contact_handles : contactHandles;
          if (arr[idx]) arr[idx].value = inp.value;
        });
      });
    }
    
    renderContactsEdit();
    function renderContactsView() {
      const wrap = q('j_contacts_list'); if (!wrap) return;
      if (editMode) { return; }
      const arr = Array.isArray(job.contact_handles) ? job.contact_handles : contactHandles;
      const toHref = (h) => {
        const t = (h.type || '').toLowerCase(); const v = h.value || '';
        if (t === 'email' || /@/.test(v)) return `mailto:${v}`;
        if (t === 'phone' || /^\+?\d[\d\s\-().]{5,}$/.test(v)) return `tel:${v.replace(/[^+\d]/g,'')}`;
        if (t === 'linkedin' || /linkedin/i.test(v)) return v;
        if (/^https?:\/\//i.test(v)) return v;
        return '';
      };
      wrap.innerHTML = arr.map((h) => {
        const cls = (h.type && h.type.toLowerCase()==='email') ? 'company' : 'work-type';
        const href = toHref(h);
        const label = `${escapeHtml$1(h.type || '')}: ${escapeHtml$1(h.value || '')}`;
        return href ? `<a class="job-pill ${cls}" href="${escapeHtml$1(href)}" target="${href.startsWith('http') ? '_blank' : '_self'}" rel="noopener">${label}</a>`
                    : `<span class="job-pill ${cls}">${label}</span>`;
      }).join(' ');
    }
    const addContactBtn = q('j_contact_add_btn');
    if (addContactBtn) {
      addContactBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const raw = (q('j_contact_value')?.value || '').trim();
        if (!raw) return;
        const detectType = (txt) => {
          const v = txt.trim();
          if (/^mailto:/i.test(v)) return { type: 'Email', value: v.replace(/^mailto:/i, '') };
          if (/^tel:/i.test(v)) return { type: 'Phone', value: v.replace(/^tel:/i, '') };
          if (/^https?:\/\//i.test(v) && /linkedin/i.test(v)) return { type: 'LinkedIn', value: v };
          if (/^https?:\/\//i.test(v)) return { type: 'Other', value: v };
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { type: 'Email', value: v };
          if (/^\+?\d[\d\s\-().]{5,}$/.test(v)) return { type: 'Phone', value: v };
          return { type: 'Other', value: v };
        };
        const { type, value } = detectType(raw);
        const arr = Array.isArray(job.contact_handles) ? job.contact_handles : (job.contact_handles = contactHandles);
        arr.push({ type, value });
        q('j_contact_value').value = '';
        q('j_contact_value').focus();
        renderContactsEdit();
        renderContactsView();
      });
    }
    q('j_contact_value')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addContactBtn.click(); } });

    // Description render + collapse
    // Keep live sync: update summary when key fields change in edit mode
    const syncFields = ['j_pos','j_company','j_loc','j_type','j_sal_min','j_sal_max','j_sal_cur','j_desc','j_src'];
    syncFields.forEach((id) => {
      const el = q(id);
      if (el) el.addEventListener('input', () => {
        if (id==='j_pos') job.position = el.value;
        if (id==='j_company') job.company = el.value;
        if (id==='j_loc') job.location = el.value;
    if (id==='j_type') job.job_type = el.value;
        if (id==='j_sal_min') job.salary_min = el.value ? Number(el.value) : null;
        if (id==='j_sal_max') job.salary_max = el.value ? Number(el.value) : null;
        if (id==='j_sal_cur') job.salary_currency = el.value;
        if (id==='j_desc') job.description = el.value;
        if (id==='j_src') job.source_url = el.value;
        renderSummaryCard();
      });
    });

    // benefits removed

    // Minimal read-mode KV updates
    function renderReadViews() {
      const fmtFollow = (iso) => {
        if (!iso) return '';
        const d = new Date(iso); if (isNaN(d)) return '';
        return d.toLocaleString();
      };
      const fn = q('j_follow_view'); if (fn) fn.textContent = fmtFollow(job.next_follow_up);
      const srcA = q('j_src_view'); if (srcA) { const url = job.source_url || ''; srcA.href = url || '#'; srcA.textContent = url ? 'Open Source' : ''; srcA.style.display = url ? '' : 'none'; }
      const nameV = q('j_rec_name_view'); if (nameV) nameV.textContent = job.contact_name || '';
      const roleV = q('j_rec_role_view'); if (roleV) roleV.textContent = job.contact_role || '';
      // method/handle inputs removed; reflect via contacts list chips
      renderContactsView();
    }

    // Follow-up helpers
    const follow = q('j_follow');
    overlay.querySelector('[data-act="follow+1d"]').addEventListener('click', () => { const base = follow.value || fmtDateTimeLocal(new Date().toISOString()); const d = new Date(base); d.setDate(d.getDate() + 1); follow.value = fmtDateTimeLocal(d.toISOString()); });
    overlay.querySelector('[data-act="follow+1w"]').addEventListener('click', () => { const base = follow.value || fmtDateTimeLocal(new Date().toISOString()); const d = new Date(base); d.setDate(d.getDate() + 7); follow.value = fmtDateTimeLocal(d.toISOString()); });
    follow.addEventListener('change', async () => { const next_follow_up = toIso(follow.value); job.next_follow_up = next_follow_up; if (job.id) { await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ next_follow_up }) }); } });

    // Timeline
    function renderTimeline() {
      const wrap = q('j_timeline'); if (!wrap) return;
      wrap.innerHTML = (events || []).map((ev) => `
      <div class=\"tl-item\" data-id=\"${ev.id}\"> 
        <div class=\"tl-dot\"></div>
        <div class=\"tl-content\"> 
          <div class=\"tl-head\"><strong>${escapeHtml$1(ev.type || 'Event')}</strong> <span class=\"muted\">${ev.dt ? escapeHtml$1(new Date(ev.dt).toLocaleString()) : ''}</span></div>
          <div class=\"tl-meta\">${[ev.participants, ev.medium, ev.outcome].filter(Boolean).map(escapeHtml$1).join(' • ')}</div>
          ${ev.notes ? `<div class=\"tl-notes\">${escapeHtml$1(ev.notes)}</div>` : ''}
        </div>
      </div>`).join('');
      const next = nextUpcomingInterview(events);
      const cta = q('j_next_cta');
    if (cta) { cta.innerHTML = next ? `<strong>Next interview:</strong> ${escapeHtml$1(new Date(next.dt).toLocaleString())} <button class=\"btn\" data-act=\"add-cal\">Add to calendar</button>` : ''; }
      const btn = overlay.querySelector('[data-act="add-cal"]');
    if (btn) btn.addEventListener('click', () => { const detail = { jobId: job.id, event: next }; document.dispatchEvent(new CustomEvent('job:addToCalendar', { detail })); });
    const cnt = q('j_int_count'); if (cnt) cnt.textContent = String(computeInterviewCount(events));
    if (editMode) wrap.querySelectorAll('.tl-item').forEach((el) => { el.addEventListener('click', async () => { const id = el.getAttribute('data-id'); const ev = events.find((x) => x.id === id); if (!ev) return; const newType = prompt('Event type (e.g., Interview, Offer, Rejected, Recruiter call):', ev.type || ''); if (newType === null) return; const newDt = prompt('Date/time (YYYY-MM-DD HH:MM, empty to keep):', ev.dt ? new Date(ev.dt).toLocaleString() : ''); const patch = { type: newType }; if (newDt && newDt.trim()) { const guess = new Date(newDt); if (!isNaN(guess)) patch.dt = guess.toISOString(); } const res = await fetch(`/api/jobs/${job.id}/events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); if (res.ok) { const upd = await res.json(); Object.assign(ev, upd); const newState = deriveStateFromEvents(events, job.state); if (newState !== job.state) { await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: newState }) }); job.state = newState; renderSummaryCard(); } renderTimeline(); } }); });
    }
    renderTimeline();
    overlay.querySelector('[data-act="add-event"]').addEventListener('click', async () => { const nowIso = new Date().toISOString(); const payload = { type: 'Interview', dt: nowIso }; const res = await fetch(`/api/jobs/${job.id}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (res.ok) { const ev = await res.json(); events.push(ev); const newState = deriveStateFromEvents(events, job.state); if (newState !== job.state) { await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: newState }) }); job.state = newState; renderSummaryCard(); } renderTimeline(); } });

    // Notes autosave
    let tNotes; const saveNotes = async () => { clearTimeout(tNotes); tNotes = setTimeout(async () => { const notes = q('j_notes')?.value || ''; await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) }); }, 300); };
    q('j_notes')?.addEventListener('input', saveNotes);

    // Letters upload
    overlay.querySelector('[data-act="upload-letter"]').addEventListener('click', () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/pdf'; input.onchange = async () => { if (!input.files || !input.files[0]) return; const fd = new FormData(); fd.append('file', input.files[0]); const res = await fetch(`/api/jobs/${job.id}/letters`, { method: 'POST', body: fd }); if (res.ok) { const letter = await res.json(); job.letters = job.letters || []; job.letters.unshift(letter); const cnt = q('j_letters_count'); if (cnt) cnt.textContent = String(job.letters.length); const a = document.createElement('a'); a.href = `/api/jobs/${job.id}/letters/${encodeURIComponent(letter.filename)}`; a.target = '_blank'; a.textContent = letter.filename; const lst = q('j_letters_list'); if (lst) lst.prepend(a); } else { alert('Upload failed'); } }; input.click(); });

    async function save(silent) {
      const src = (q('j_src')?.value || '').trim();
      if (src && !/^https?:\/\//i.test(src)) { alert('Source URL must start with http:// or https://'); return; }
      const payload = {
        position: q('j_pos')?.value.trim() || null,
        company: q('j_company')?.value.trim() || null,
        location: q('j_loc')?.value.trim() || null,
        job_type: q('j_type')?.value.trim() || null,
        salary_min: q('j_sal_min')?.value ? Number(q('j_sal_min').value) : null,
        salary_max: q('j_sal_max')?.value ? Number(q('j_sal_max').value) : null,
        salary_currency: q('j_sal_cur')?.value.trim() || null,
        source_url: src || null,
        contact_name: q('j_rec_name')?.value.trim() || null,
        contact_role: q('j_rec_role')?.value.trim() || null,
    // contact method/handle removed; rely on contact_handles instead
        next_follow_up: toIso(q('j_follow')?.value || ''),
        date_posted: q('j_date_posted')?.value || null,
        description: q('j_desc')?.value || null,
        contact_handles: (Array.isArray(job.contact_handles) ? job.contact_handles : [])
      };
      try {
        let updated = null;
        if (!job.id) {
          const res = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: job.state || 'draft', ...payload }) });
          if (!res.ok) throw new Error('create_failed');
          updated = await res.json();
        } else {
          const res = await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error('update_failed');
          updated = await res.json();
        }
        if (updated) { Object.assign(job, updated); if (!silent) close(); if (typeof onUpdated === 'function') ; }
      } catch (e) { console.error('Save failed', e); alert('Save failed'); }
    }
    overlay.querySelector('[data-act="save"]').addEventListener('click', () => save(false));
    overlay.querySelector('[data-act="delete"]').addEventListener('click', async () => { if (!confirm('Delete this job?')) return; const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' }); if (res.ok) { close(); } });
    overlay.querySelector('[data-act="archive"]').addEventListener('click', async () => {
      try {
        await ensureTagsLoaded();
        let archived = Array.from((JobsState.tags || new Map()).values()).find((t) => (t.name || '').toLowerCase() === 'archived');
        if (!archived) {
          const r = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'archived' }) });
          if (r.ok) archived = await r.json();
          if (archived) { const map = JobsState.tags || new Map(); map.set(archived.id, archived); JobsState.tags = map; }
        }
        if (archived) {
          const tagIds = new Set(job.tagIds || []); tagIds.add(archived.id);
          await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagIds: Array.from(tagIds) }) });
          job.tagIds = Array.from(tagIds);
          if (typeof onUpdated === 'function') ;
        }
      } catch (e) { console.warn('Archive failed', e); }
    });
    overlay.querySelector('[data-act="tags"]').addEventListener('click', () => { alert('Open tags manager from main UI.'); });

    // Contact actions removed; anchor pills now handle navigation in read mode.
    // keep contact actions in sync via list edits

    // Edit mode toggle and field enable/disable
    function applyEditMode() {
      overlay.classList.toggle('editing', editMode);
      overlay.querySelectorAll('.view-only').forEach((el) => { el.style.display = editMode ? 'none' : ''; });
      overlay.querySelectorAll('.edit-only').forEach((el) => { el.style.display = editMode ? '' : 'none'; });
      // Hide redundant view-only duplicates even when not editing
      overlay.querySelectorAll('.view-only.redundant-view').forEach((el) => { el.style.display = 'none'; });
      const controls = overlay.querySelectorAll('input, select, textarea');
      controls.forEach((el) => { const id = el.id || ''; const follow = id === 'j_follow'; if (el.tagName === 'TEXTAREA') { el.readOnly = !editMode && !follow; } else { el.disabled = !editMode && !follow; } });
      const ab = q('j_src_autofill'); if (ab) ab.disabled = !editMode;
    // benefits UI removed
      const addEvBtn = overlay.querySelector('[data-act="add-event"]'); if (addEvBtn) addEvBtn.disabled = !editMode;
      renderTimeline();
      const tbtn = overlay.querySelector('[data-act="toggle-edit"]'); if (tbtn) tbtn.title = editMode ? 'Disable edit mode' : 'Enable edit mode';
      if (!editMode) { renderReadViews(); } else { renderContactsEdit(); }
    }
    overlay.querySelector('[data-act="toggle-edit"]').addEventListener('click', () => { editMode = !editMode; applyEditMode(); });
    overlay.querySelectorAll('.edit-only').forEach((el) => (el.style.display = 'none'));
    applyEditMode();

    if (window.locationSuggestions) { window.locationSuggestions.attachToInput(q('j_loc')); }

    // Accessibility: focus trap
    const focusable = overlay.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Tab') { if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } });
    (first || overlay).focus();
  }

  async function openDetail(jobId, onUpdated) {
    await ensureTagsLoaded().catch(() => {});
    try {
      const { job, events } = await fetchJob(jobId);
      buildModal(job, events, onUpdated, { initialEditMode: false, isNew: false });
    } catch (e) {
      console.error('Job detail load failed:', e);
      alert('Failed to load job details');
    }
  }

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

  function renderTable() {
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

  // Modular Job Scraper UI (panel, config modal, manual search, import)

  class JobsScraper {
    constructor() {
      this.isInitialized = false;
      this.selectedResults = new Set();
      this.currentSearchResults = [];
    }

    init() {
      if (this.isInitialized) return;
      this.bindEvents();
      this.loadStatus();
      this.isInitialized = true;
    }

    // Event wiring
    bindEvents() {
      this.on('#jobScraperBtn', 'click', () => this.toggleScraperPanel());
      this.on('#manualSearchBtn', 'click', () => this.openManualSearch());

      // Panel controls
      this.on('#scraperPanelClose', 'click', () => this.closeScraperPanel());
      this.on('#scraperPanelRefresh', 'click', () => this.refreshScraperData());
      this.on('#newScraperConfig', 'click', () => this.openConfigModal());
      this.on('#manualJobSearch', 'click', () => this.openManualSearch());

      // Config modal
      this.on('#jobScraperModalClose', 'click', () => this.closeConfigModal());
      this.on('#jobScraperCancel', 'click', () => this.closeConfigModal());
      this.on('#jobScraperForm', 'submit', (e) => this.saveConfiguration(e));
      this.on('#jobScraperModal', 'click', (e) => { if (e.target.classList?.contains('modal-overlay')) this.closeConfigModal(); });

      // Manual search modal
      this.on('#manualSearchModalClose', 'click', () => this.closeManualSearchModal());
      this.on('#manualSearchCancel', 'click', () => this.closeManualSearchModal());
      this.on('#manualSearchForm', 'submit', (e) => this.executeManualSearch(e));
      this.on('#manualSearchImportFooter', 'click', () => this.importSelectedJobs());
      this.on('#manualSearchModal', 'click', (e) => { if (e.target.classList?.contains('modal-overlay')) this.closeManualSearchModal(); });

      // Select all toggle for manual search results
      this.on('#selectAllToggle', 'change', (e) => this.toggleSelectAll(e.target.checked));

      // Inline search term pill creation
      this.on('#scraperSearchTerm', 'blur', (e) => {
        const value = e.target.value.trim();
        if (value && !this.hasInlineSearchTermPill('scraperSearchTermPills')) {
          this.addInlineSearchTermPill(value, 'scraperSearchTermPills', 'scraperSearchTerm');
        }
      });
      this.on('#scraperSearchTerm', 'change', (e) => {
        const value = e.target.value.trim();
        if (value && !this.hasInlineSearchTermPill('scraperSearchTermPills')) {
          this.addInlineSearchTermPill(value, 'scraperSearchTermPills', 'scraperSearchTerm');
        }
      });
      this.on('#manualSearchTerm', 'blur', (e) => {
        const value = e.target.value.trim();
        if (value && !this.hasInlineSearchTermPill('manualSearchTermPills')) {
          this.addInlineSearchTermPill(value, 'manualSearchTermPills', 'manualSearchTerm');
        }
      });
      this.on('#manualSearchTerm', 'change', (e) => {
        const value = e.target.value.trim();
        if (value && !this.hasInlineSearchTermPill('manualSearchTermPills')) {
          this.addInlineSearchTermPill(value, 'manualSearchTermPills', 'manualSearchTerm');
        }
      });
      // Add Enter key support for creating pills immediately
      this.on('#scraperSearchTerm', 'keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = e.target.value.trim();
          if (value && !this.hasInlineSearchTermPill('scraperSearchTermPills')) {
            this.addInlineSearchTermPill(value, 'scraperSearchTermPills', 'scraperSearchTerm');
          }
        }
      });
      this.on('#manualSearchTerm', 'keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = e.target.value.trim();
          if (value && !this.hasInlineSearchTermPill('manualSearchTermPills')) {
            this.addInlineSearchTermPill(value, 'manualSearchTermPills', 'manualSearchTerm');
          }
        }
      });
      // When user focuses on search input, if there's a pill, populate the input with the pill's value for editing
      this.on('#scraperSearchTerm', 'focus', (e) => {
        const container = qs('#scraperSearchTermPills');
        const pill = container?.querySelector('.location-pill');
        if (pill && pill.dataset.term && !e.target.value.trim()) {
          e.target.value = pill.dataset.term;
          e.target.disabled = false;
        }
      });
      this.on('#manualSearchTerm', 'focus', (e) => {
        const container = qs('#manualSearchTermPills');
        const pill = container?.querySelector('.location-pill');
        if (pill && pill.dataset.term && !e.target.value.trim()) {
          e.target.value = pill.dataset.term;
          e.target.disabled = false;
        }
      });

      // Sliders
      this.initializeSliders();
    }

    // Helpers
    on(sel, evt, fn) { const el = qs(sel); if (el) el.addEventListener(evt, fn); }

    // Status
    async loadStatus() {
      try {
        const res = await fetch('/api/job-scraper/status');
        const data = await res.json();
        const statusEl = qs('#scraperStatus');
        const activeConfigsEl = qs('#activeConfigs');
        if (statusEl) { statusEl.textContent = data.running ? 'Running' : 'Stopped'; statusEl.className = `status-value ${data.running ? 'status-running' : 'status-stopped'}`; }
        if (activeConfigsEl) activeConfigsEl.textContent = data.active_configs || 0;
      } catch (e) { /* no-op */ }
    }

    async refreshScraperData() {
      await this.loadStatus();
      await this.loadRecentRuns();
      await this.loadConfigurations();
    }

    async loadRecentRuns() {
      try {
        const res = await fetch('/api/job-scraper/runs?limit=20');
        const data = await res.json();
        const runs = data && Array.isArray(data.runs) ? data.runs : [];
        this.renderRuns(runs);
        return runs;
      } catch (e) {
        this.renderRuns([]);
        return null;
      }
    }

    async loadConfigurations() {
      try {
        const res = await fetch('/api/job-scraper/configs');
        const data = await res.json();
        const configs = data && Array.isArray(data.configs) ? data.configs : [];
        this.renderConfigs(configs);
        return configs;
      } catch (e) {
        this.renderConfigs([]);
        return null;
      }
    }

    // Panel open/close
    toggleScraperPanel() {
      const sidebar = qs('#jobScraperPanel');
      if (!sidebar) return;
      if (sidebar.classList.contains(CLASSES.isHidden)) this.openScraperPanel(); else this.closeScraperPanel();
    }
    openScraperPanel() {
      const sidebar = qs('#jobScraperPanel');
      const mainContent = document.querySelector('.jobs-main-content');
      if (sidebar) { show(sidebar); this.refreshScraperData(); }
      if (mainContent) mainContent.classList.add('with-sidebar');
    }
    closeScraperPanel() {
      const sidebar = qs('#jobScraperPanel');
      const mainContent = document.querySelector('.jobs-main-content');
      if (sidebar) hide(sidebar);
      if (mainContent) mainContent.classList.remove('with-sidebar');
    }

    // Config modal
    openConfigModal() {
      const modal = qs('#jobScraperModal');
      if (modal) { modal.classList.remove(CLASSES.isHidden); document.body.classList.add('modal-open'); }
    }
    closeConfigModal() {
      const modal = qs('#jobScraperModal');
      if (modal) { modal.classList.add(CLASSES.isHidden); document.body.classList.remove('modal-open'); }
    }

    // Manual search modal
    openManualSearch() {
      const modal = qs('#manualSearchModal');
      if (modal) {
        modal.classList.remove(CLASSES.isHidden);
        document.body.classList.add('modal-open');
        this.resetManualSearchUI();
      }
    }
    closeManualSearchModal() {
      const modal = qs('#manualSearchModal');
      if (modal) { modal.classList.add(CLASSES.isHidden); document.body.classList.remove('modal-open'); }
    }

    // Sliders
    initializeSliders() {
      const hoursSlider = qs('#manualSearchHours');
      const hoursDisplay = qs('#hoursDisplay');
      if (hoursSlider && hoursDisplay) {
        const apply = (val) => { const snapped = this.snapToLogicalHoursValue(parseInt(val || '72', 10)); hoursSlider.value = snapped; hoursDisplay.textContent = this.formatHoursDisplay(snapped); };
        hoursSlider.addEventListener('input', (e) => apply(e.target.value)); apply(hoursSlider.value);
      }
      const freqSlider = qs('#scraperFrequencySlider');
      const freqDisplay = qs('#frequencyDisplay');
      if (freqSlider && freqDisplay) {
        const apply = (val) => { const snapped = this.snapToLogicalHoursValue(parseInt(val || '24', 10)); freqSlider.value = snapped; freqDisplay.textContent = this.formatHoursDisplay(snapped); };
        freqSlider.addEventListener('input', (e) => apply(e.target.value)); apply(freqSlider.value);
      }
      const maxSlider = qs('#manualSearchMax');
      const maxDisplay = qs('#maxDisplay');
      if (maxSlider && maxDisplay) { maxSlider.addEventListener('input', (e) => { maxDisplay.textContent = `${parseInt(e.target.value, 10)} jobs`; }); maxDisplay.textContent = `${maxSlider.value} jobs`; }
      const sMax = qs('#scraperMaxResults');
      const sMaxDisp = qs('#scraperMaxDisplay');
      if (sMax && sMaxDisp) { sMax.addEventListener('input', (e) => { sMaxDisp.textContent = `${parseInt(e.target.value, 10)} jobs`; }); sMaxDisp.textContent = `${sMax.value} jobs`; }
    }
    snapToLogicalHoursValue(hours) {
      const vals = [1,2,3,4,5,6,7,8,9,10,12,16,20,24,36,48,60,72,84,96,108,120];
      let closest = vals[0]; let diff = Math.abs(hours - closest);
      for (const v of vals) { const d = Math.abs(hours - v); if (d < diff) { diff = d; closest = v; } }
      return closest;
    }
    formatHoursDisplay(h) {
      if (h === 1) return '1 hour'; if (h < 24) return `${h} hours`; if (h === 24) return '1 day';
      const days = Math.round((h / 24) * 10) / 10; return `${days} days`;
    }

    // Config save (minimal)
    async saveConfiguration(e) {
      e.preventDefault();
      const term = (qs('#scraperSearchTerm')?.value || this.getInlineSearchTerm('#scraperSearchTermPills'))?.trim();
      const locations = this.getLocations('#scraperLocationsPills');
      if (!term || !locations.length) { this.notify('Position and at least one location are required', 'error'); return; }
      
      // Generate configuration name from job title
      const configName = this.generateConfigName(term, locations);
      
      const body = {
        name: configName,
        search_terms: [term],
        target_locations: locations,
        scrape_frequency_hours: parseInt(qs('#scraperFrequencySlider')?.value || '24', 10),
        max_results_per_run: parseInt(qs('#scraperMaxResults')?.value || '50', 10),
        min_score_threshold: parseFloat(qs('#scraperMinScore')?.value || '0.5'),
        enabled: !!qs('#scraperEnabled')?.checked,
        job_boards: this.getCheckedValues('jobBoards'),
        employment_types: this.getCheckedValues('employmentTypes'),
        seniority_levels: this.getCheckedValues('seniorityLevels')
      };
      const btn = qs('#jobScraperSave'); const text = btn?.querySelector('.save-text');
      try {
        if (btn) { btn.disabled = true; btn.classList.add('loading'); if (text) text.textContent = 'Saving...'; }
        const res = await fetch('/api/job-scraper/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('Save failed');
        this.notify('Configuration saved', 'success');
        this.closeConfigModal();
        this.refreshScraperData();
      } catch (e) { this.notify('Failed to save configuration', 'error'); }
      finally { if (btn) { btn.disabled = false; btn.classList.remove('loading'); if (text) text.textContent = 'Save'; } }
    }

    // Manual search + import
    async executeManualSearch(e) {
      e.preventDefault();
      const term = (qs('#manualSearchTerm')?.value || this.getInlineSearchTerm('#manualSearchTermPills'))?.trim();
      const locations = this.getLocations('#locationsPills'); // use correct pills container
      if (!term || !locations.length) { this.notify('Position and at least one location are required', 'error'); return; }
      
      // Manual search only supports one location at a time (JobSpy limitation)
      const firstLocation = locations[0];
      if (locations.length > 1) {
        this.notify(`Searching in "${firstLocation}" only. Manual search supports one location at a time.`, 'info');
      }
      
      const params = {
        search_term: term,
        location: firstLocation,
        job_boards: this.getCheckedValues('manualJobBoards'),
        hours_old: parseInt(qs('#manualSearchHours')?.value || '72', 10),
        max_results: parseInt(qs('#manualSearchMax')?.value || '50', 10)
      };
      await this.runManualSearch(params);
    }

    async runManualSearch(params) {
      const button = qs('#manualSearchSubmit');
      const importButtonFooter = qs('#manualSearchImportFooter');
      const resultsContainer = qs('#resultsList');
      try {
        if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...'; }
        if (importButtonFooter) importButtonFooter.classList.add(CLASSES.isHidden);
        if (resultsContainer) resultsContainer.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i><p>Searching for jobs...</p></div>';
        const res = await fetch('/api/job-scraper/manual-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
        if (!res.ok) throw new Error((await res.json()).error || 'Search failed');
        const data = await res.json();
        this.displaySearchResults(data.jobs || []);
      } catch (e) { this.notify(`Search failed: ${e.message || e}`, 'error'); }
      finally { if (button) { button.disabled = false; button.innerHTML = '<i class="fas fa-search"></i> Search Jobs'; } }
    }

    displaySearchResults(jobs) {
      this.currentSearchResults = jobs || [];
      this.selectedResults.clear();
      const section = qs('#manualSearchResults');
      const header = section?.querySelector('.results-header');
      const footer = section?.querySelector('.results-footer');
      const list = qs('#resultsList');
      const countEl = qs('#resultsCount');
      if (section) section.classList.remove(CLASSES.isHidden);
      if (countEl) countEl.textContent = String(jobs.length);
      if (!list) return;
      if (!jobs.length) {
        list.innerHTML = '<div class="no-results-message"><i class="fas fa-search"></i><p>No jobs found for your search criteria.</p></div>';
        if (header) header.classList.add(CLASSES.isHidden);
        if (footer) footer.classList.add(CLASSES.isHidden);
        return;
      }
      if (header) header.classList.remove(CLASSES.isHidden);
      if (footer) footer.classList.remove(CLASSES.isHidden);
      list.innerHTML = jobs.map((job, i) => {
        const title = this.escape(job.title || job.position || 'Untitled Position');
        const company = this.escape(job.company || 'Unknown Company');
        const location = this.escape(job.location || 'Location not specified');
        
        // Format posted date with relative time
        const postedDate = this.formatPostedDate(job.date_posted);
        
        // Format salary
        const salary = this.formatSalary(job.salary_min, job.salary_max, job.salary_currency);
        
        // Get work type
        const workType = this.getWorkType(job);
        
        // Get remote status
        const isRemote = job.is_remote || (job.location && job.location.toLowerCase().includes('remote'));
        
        // Format match score if available
        const matchScore = job.relevance_score || job.match_score;
        
        // Format job description
        const description = this.formatJobDescription(job.description, i);
        
        return `
        <div class="job-result" data-index="${i}">
          <div class="job-result-header">
            <input type="checkbox" class="job-result-checkbox" id="job-${i}">
            <h3 class="job-title">${title}</h3>
            ${matchScore ? `<span class="match-score" title="Relevance Score">${Math.round(matchScore * 100)}%</span>` : ''}
          </div>
          <div class="job-meta">
            <span class="job-pill company"><i class="fas fa-building"></i>${company}</span>
            <span class="job-pill location"><i class="fas fa-map-marker-alt"></i>${location}</span>
            ${postedDate ? `<span class="job-pill posted-date"><i class="fas fa-clock"></i>${postedDate}</span>` : ''}
            ${salary ? `<span class="job-pill salary"><i class="fas fa-dollar-sign"></i>${salary}</span>` : ''}
            ${workType ? `<span class="job-pill work-type"><i class="fas fa-briefcase"></i>${workType}</span>` : ''}
            ${isRemote ? `<span class="job-pill remote"><i class="fas fa-home"></i>Remote</span>` : ''}
          </div>
          ${description ? `<div class="job-description">${description}</div>` : ''}
        </div>`;
      }).join('');
      // Toggle selection on click
      list.querySelectorAll('.job-result').forEach((card, idx) => {
        card.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox' && !e.target.classList.contains('description-toggle')) {
            const cb = card.querySelector('.job-result-checkbox');
            cb.checked = !cb.checked; this.toggleJobSelection(idx);
          }
        });
      });
      this.updateSelectionCount();
    }

    toggleJobSelection(index) {
      const cb = qs(`#job-${index}`);
      const card = cb?.closest('.job-result');
      if (cb?.checked) { this.selectedResults.add(index); card?.classList.add(CLASSES.selected); }
      else { this.selectedResults.delete(index); card?.classList.remove(CLASSES.selected); }
      this.updateSelectionCount();
    }

    updateSelectionCount() {
      const count = this.selectedResults.size;
      const total = this.currentSearchResults.length;
      const sel = qs('#selectedCount'); const selFooter = qs('#selectedCountFooter');
      const importBtnFooter = qs('#manualSearchImportFooter');
      const searchBtn = qs('#manualSearchSubmit');
      const selectAllToggle = qs('#selectAllToggle');
      const selectAllLabel = qs('.select-all-label');
      
      if (sel) sel.textContent = String(count);
      if (selFooter) selFooter.textContent = String(count);
      if (importBtnFooter) importBtnFooter.classList.toggle(CLASSES.isHidden, count === 0);
      if (searchBtn) searchBtn.classList.toggle(CLASSES.isHidden, count > 0);
      
      // Update select all toggle state
      if (selectAllToggle && selectAllLabel) {
        if (count === 0) {
          selectAllToggle.checked = false;
          selectAllToggle.indeterminate = false;
          selectAllLabel.textContent = 'Select All';
        } else if (count === total) {
          selectAllToggle.checked = true;
          selectAllToggle.indeterminate = false;
          selectAllLabel.textContent = 'Clear All';
        } else {
          selectAllToggle.checked = false;
          selectAllToggle.indeterminate = true;
          selectAllLabel.textContent = 'Select All';
        }
      }
    }

    toggleSelectAll(selectAll) {
      const checkboxes = document.querySelectorAll('.job-result-checkbox');
      const label = qs('.select-all-label');
      
      checkboxes.forEach((cb, idx) => {
        cb.checked = selectAll;
        if (selectAll) {
          this.selectedResults.add(idx);
          cb.closest('.job-result')?.classList.add(CLASSES.selected);
        } else {
          this.selectedResults.delete(idx);
          cb.closest('.job-result')?.classList.remove(CLASSES.selected);
        }
      });
      
      if (label) {
        label.textContent = selectAll ? 'Clear All' : 'Select All';
      }
      
      this.updateSelectionCount();
    }

    async importSelectedJobs() {
      const selectedJobs = Array.from(this.selectedResults).map((idx) => this.currentSearchResults[idx]).filter(Boolean);
      if (!selectedJobs.length) return;
      try {
        const res = await fetch('/api/job-scraper/import-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobs: selectedJobs }) });
        if (!res.ok) throw new Error('Import failed');
        this.notify('Imported selected jobs', 'success');
        this.closeManualSearchModal();
      } catch (e) { this.notify('Import failed', 'error'); }
    }

    // UI helpers
    resetManualSearchUI() {
      this.selectedResults.clear();
      const section = qs('#manualSearchResults');
      const header = section?.querySelector('.results-header');
      const footer = section?.querySelector('.results-footer');
      const list = qs('#resultsList');
      if (section) section.classList.remove(CLASSES.isHidden);
      if (header) header.classList.add(CLASSES.isHidden);
      if (footer) footer.classList.add(CLASSES.isHidden);
      if (list) list.innerHTML = '<div class="no-results-message"><i class="fas fa-search"></i><p>Enter your search criteria and click "Search Jobs"</p></div>';
      const selectAll = qs('#selectAllToggle'); const label = qs('.select-all-label');
      if (selectAll) selectAll.checked = false; if (label) label.textContent = 'Select All';
      const importBtnFooter = qs('#manualSearchImportFooter'); const searchBtn = qs('#manualSearchSubmit');
      if (importBtnFooter) importBtnFooter.classList.add(CLASSES.isHidden); if (searchBtn) searchBtn.classList.remove(CLASSES.isHidden);
    }

    // Form helpers
    getCheckedValues(groupName) { return Array.from(document.querySelectorAll(`input[name="${groupName}"]:checked`)).map((el) => el.value); }
    getInlineSearchTerm(containerSel) { const cont = qs(containerSel); const pill = cont?.querySelector('.location-pill'); return pill ? pill.dataset.term : (qs(containerSel.replace('Pills',''))?.value || '').trim(); }
    getLocations(containerSel) {
      // Prefer pills container, fallback to csv input
      const cont = qs(containerSel);
      if (cont) {
        const pills = Array.from(cont.querySelectorAll('[data-location]')).map((el) => el.getAttribute('data-location')).filter(Boolean);
        if (pills.length) return pills;
      }
      const raw = (qs('#manualSearchLocation')?.value || '').trim();
      return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    }

    // Location pill management (for compatibility with locationSuggestions.js)
    addLocationPill(location) {
      const container = qs('#locationsPills');
      if (!container) return;
      
      // Check if pill already exists
      const existing = container.querySelector(`[data-location="${this.escape(location)}"]`);
      if (existing) return;
      
      const pill = document.createElement('span');
      pill.className = 'location-pill';
      pill.setAttribute('data-location', location);
      pill.innerHTML = `
      ${this.escape(location)}
      <button type="button" class="pill-remove" onclick="this.parentElement.remove()">×</button>
    `;
      container.appendChild(pill);
    }

    addScraperLocationPill(location) {
      const container = qs('#scraperLocationsPills');
      if (!container) return;
      
      // Check if pill already exists
      const existing = container.querySelector(`[data-location="${this.escape(location)}"]`);
      if (existing) return;
      
      const pill = document.createElement('span');
      pill.className = 'location-pill';
      pill.setAttribute('data-location', location);
      pill.innerHTML = `
      ${this.escape(location)}
      <button type="button" class="pill-remove" onclick="this.parentElement.remove()">×</button>
    `;
      container.appendChild(pill);
    }

    // Inline search term pill management
    addInlineSearchTermPill(term, containerId, inputId) {
      if (!term || term.length === 0) return;
      const container = qs(`#${containerId}`);
      const input = qs(`#${inputId}`);
      if (!container || !input) return;
      
      // Clear existing pills first (only one allowed)
      container.innerHTML = '';
      
      const pill = document.createElement('span');
      pill.className = 'location-pill'; // Use same styling as location pills
      pill.dataset.term = term;
      pill.innerHTML = `${this.escape(term)} <button type="button" class="pill-remove" onclick="jobsScraper.removeInlineSearchTermPill('${containerId}', '${inputId}')">×</button>`;
      container.appendChild(pill);
      
      // Disable the input field since we have a pill
      input.disabled = true;
      input.value = '';
    }
    
    removeInlineSearchTermPill(containerId, inputId) {
      const container = qs(`#${containerId}`);
      const input = qs(`#${inputId}`);
      if (!container || !input) return;
      
      container.innerHTML = '';
      input.disabled = false;
      input.focus();
    }
    
    hasInlineSearchTermPill(containerId) {
      const container = qs(`#${containerId}`);
      return container && container.querySelector('.location-pill') !== null; // Updated to match new class
    }

    // Notifications
    notify(msg, type = 'info') { try { if (window.toast) return window.toast(msg, type); } catch {} console.log(`[scraper] ${msg}`); }
    escape(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    // Date and formatting utilities
    formatPostedDate(dateString) {
      if (!dateString) return null;
      
      try {
        const postedDate = new Date(dateString);
        const now = new Date();
        const diffInMs = now - postedDate;
        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
        
        if (diffInDays === 0) {
          return 'Today';
        } else if (diffInDays === 1) {
          return 'Yesterday';
        } else if (diffInDays < 7) {
          return `${diffInDays} days ago`;
        } else if (diffInDays < 30) {
          const weeks = Math.floor(diffInDays / 7);
          return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
        } else if (diffInDays < 365) {
          const months = Math.floor(diffInDays / 30);
          return months === 1 ? '1 month ago' : `${months} months ago`;
        } else {
          return postedDate.toLocaleDateString();
        }
      } catch (error) {
        return dateString; // Return original string if parsing fails
      }
    }

    formatSalary(min, max, currency) {
      if (!min && !max) return null;
      currency = currency || 'EUR';
      
      if (min && max) {
        return `${min.toLocaleString()}-${max.toLocaleString()} ${currency}`;
      } else if (min) {
        return `${min.toLocaleString()}+ ${currency}`;
      } else if (max) {
        return `Up to ${max.toLocaleString()} ${currency}`;
      }
      return null;
    }

    getWorkType(job) {
      if (job.job_type) {
        return job.job_type.charAt(0).toUpperCase() + job.job_type.slice(1);
      }
      return null;
    }

    formatJobDescription(description, jobIndex, isExpanded = false) {
      if (!description) return '';
      
      // Clean and format the description
      let cleanedDescription = this.cleanAndFormatDescription(description);
      
      // Always show full description if it's short
      if (cleanedDescription.length <= 200) {
        return `<div class="job-description-content">${cleanedDescription}</div>`;
      }
      
      // For longer descriptions, create expandable content
      const shortVersion = cleanedDescription.substring(0, 200);
      
      if (isExpanded) {
        return `
        <div class="job-description-content expanded" id="desc-${jobIndex}">
          ${cleanedDescription}
          <button class="description-toggle" onclick="jobsScraper.toggleDescription(${jobIndex}, false)">
            <i class="fas fa-chevron-up"></i> Show Less
          </button>
        </div>
      `;
      } else {
        return `
        <div class="job-description-content" id="desc-${jobIndex}">
          ${shortVersion}...
          <button class="description-toggle" onclick="jobsScraper.toggleDescription(${jobIndex}, true)">
            <i class="fas fa-chevron-down"></i> Read Full Description
          </button>
        </div>
      `;
      }
    }

    cleanAndFormatDescription(description) {
      if (!description) return '';
      
      // Don't truncate - preserve the full description
      let cleaned = description.trim();
      
      // Handle different line break formats
      cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // Convert markdown-style formatting to HTML
      cleaned = this.convertMarkdownToHtml(cleaned);
      
      // Clean up any existing HTML tags and ensure they're safe
      cleaned = this.sanitizeHtml(cleaned);
      
      return cleaned;
    }

    convertMarkdownToHtml(text) {
      // Convert common markdown patterns to HTML while preserving the full content
      return text
        // Bold text: **text** or __text__
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        // Italic text: *text* or _text_ (but not at word boundaries to avoid conflicts)
        .replace(/\*([^*\s][^*]*[^*\s])\*/g, '<em>$1</em>')
        .replace(/_([^_\s][^_]*[^_\s])_/g, '<em>$1</em>')
        // Headers: # ## ###
        .replace(/^### (.*$)/gm, '<h6>$1</h6>')
        .replace(/^## (.*$)/gm, '<h5>$1</h5>')
        .replace(/^# (.*$)/gm, '<h4>$1</h4>')
        // Bullet points: • or - or * at start of line
        .replace(/(?:^|\n)[\s]*[•\-\*][\s]+(.+)/g, '<br>• $1')
        // Numbers lists: 1. 2. etc
        .replace(/(?:^|\n)[\s]*(\d+)\.[\s]+(.+)/g, '<br>$1. $2')
        // Multiple line breaks
        .replace(/\n\s*\n/g, '<br><br>')
        // Single line breaks
        .replace(/\n/g, '<br>');
    }

    sanitizeHtml(html) {
      // Basic HTML sanitization - remove dangerous tags but keep formatting
      return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers
        .replace(/javascript:/gi, ''); // Remove javascript: protocols
    }

    toggleDescription(jobIndex, expand) {
      const job = this.currentSearchResults[jobIndex];
      if (!job) return;
      
      const descContainer = qs(`#desc-${jobIndex}`);
      if (!descContainer) return;
      
      const newHtml = this.formatJobDescription(job.description, jobIndex, expand);
      descContainer.outerHTML = newHtml;
    }

    // Rendering
    renderConfigs(configs) {
      const wrap = qs('#scraperConfigs');
      if (!wrap) return;
      if (!configs.length) {
        wrap.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fas fa-inbox"></i></div><p class="empty-description">No configurations yet</p></div>';
        return;
      }
      wrap.innerHTML = configs.map((c) => this.configCard(c)).join('');
      // Bind actions
      wrap.querySelectorAll('[data-act="run"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!id) return;
          try {
            const r = await fetch(`/api/job-scraper/configs/${id}/run`, { method: 'POST' });
            if (!r.ok) throw new Error('start_failed');
            this.notify('Scrape started', 'success');
            this.loadRecentRuns();
          } catch (e) { this.notify('Failed to start run', 'error'); }
        });
      });
      wrap.querySelectorAll('[data-act="toggle"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const enabled = btn.getAttribute('data-enabled') === 'true';
          try {
            const r = await fetch(`/api/job-scraper/configs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) });
            if (!r.ok) throw new Error('update_failed');
            this.notify(!enabled ? 'Enabled' : 'Disabled', 'info');
            this.loadConfigurations();
            this.loadStatus();
          } catch (e) { this.notify('Failed to update', 'error'); }
        });
      });
      wrap.querySelectorAll('[data-act="delete"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!id) return;
          if (!confirm('Delete this configuration?')) return;
          try {
            const r = await fetch(`/api/job-scraper/configs/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('deletion_failed');
            this.notify('Configuration deleted', 'success');
            this.loadConfigurations();
            this.loadStatus();
          } catch (e) { this.notify('Failed to delete', 'error'); }
        });
      });
    }

    configCard(c) {
      const terms = Array.isArray(c.search_terms) ? c.search_terms : [c.search_terms].filter(Boolean);
      const locs = Array.isArray(c.target_locations) ? c.target_locations : [c.target_locations].filter(Boolean);
      Array.isArray(c.job_boards) ? c.job_boards : [c.job_boards].filter(Boolean);
      const freq = c.scrape_frequency_hours || c.frequency_hours || 24;
      c.max_results_per_run || c.max_results || 50;
      const enabled = !!c.enabled;
      const name = this.escape(c.name || terms.join(', ') || 'Untitled');
      
      return `
      <div class="config-item" data-id="${c.id}">
        <div class="config-header">
          <h4>${name}</h4>
          <div class="config-status ${enabled ? 'enabled' : 'disabled'}">
            ${enabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>
        <div class="config-details">
          <div class="config-meta">
            <span>Every ${freq}h</span>
            <span>${terms.length} terms</span>
            <span>${locs.length} locations</span>
          </div>
          <div class="config-actions">
            <button class="btn-small" data-act="run" data-id="${c.id}" title="Run now">
              <i class="fas fa-play"></i> Run
            </button>
            <button class="btn-small config-toggle-btn ${enabled ? 'btn-stop' : 'btn-start'}" 
                    data-act="toggle" data-id="${c.id}" data-enabled="${enabled}" 
                    title="${enabled ? 'Disable' : 'Enable'}">
              <i class="fas ${enabled ? 'fa-stop' : 'fa-play'}"></i> 
              ${enabled ? 'Stop' : 'Start'}
            </button>
            <button class="btn-small btn-danger" data-act="delete" data-id="${c.id}" title="Delete">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>
      </div>`;
    }

    // Generate a meaningful configuration name based on job title and locations
    generateConfigName(jobTitle, locations) {
      const title = jobTitle?.trim();
      if (!title) return 'Untitled Config';
      
      // Capitalize the first letter of the job title
      const formattedTitle = title.charAt(0).toUpperCase() + title.slice(1);
      
      // Handle locations - show first location if multiple, or "Multiple locations"
      let locationStr = '';
      if (locations && locations.length > 0) {
        if (locations.length === 1) {
          locationStr = ` in ${locations[0]}`;
        } else {
          locationStr = ` in ${locations[0]} +${locations.length - 1} more`;
        }
      }
      
      return `${formattedTitle}${locationStr}`;
    }

    renderRuns(runs) {
      const wrap = qs('#scraperRuns');
      if (!wrap) return;
      if (!runs.length) {
        wrap.innerHTML = '<div class="empty-state">No runs yet.</div>';
        return;
      }
      wrap.innerHTML = runs.map((r) => {
        const st = String(r.status || 'completed').toLowerCase();
        const statusText = st.charAt(0).toUpperCase() + st.slice(1);
        const cfg = this.escape(r.config_name || r.config_id || 'Unknown Config');
        const when = r.started_at ? new Date(r.started_at).toLocaleString() : '—';
        const fetchedCount = r.jobs_fetched || 0;
        const insertedCount = r.jobs_inserted || 0;
        const dedupedCount = r.jobs_deduped || 0;
        const errorCount = r.jobs_failed || 0;
        
        return `
        <div class="run-item">
          <div class="run-header">
            <span class="run-config">${cfg}</span>
            <span class="run-status ${st}">${statusText}</span>
          </div>
          <div class="run-stats">
            <span>${fetchedCount} fetched</span>
            <span>${insertedCount} inserted</span>
            <span>${dedupedCount} duplicates</span>
            ${errorCount > 0 ? `<span class="errors">${errorCount} errors</span>` : ''}
          </div>
          <div class="run-time">${when}</div>
          ${r.error_message ? `<div class="run-error">${this.escape(r.error_message)}</div>` : ''}
        </div>`;
      }).join('');
    }
  }

  function initScraper() {
    // Avoid double-init when legacy is loaded
    if (typeof window !== 'undefined' && window.jobScraperManager) return window.jobScraperManager;
    const mgr = new JobsScraper();
    mgr.init();
    try { 
      window.jobScraperManager = mgr; 
      window.jobsScraper = mgr; // Also expose as jobsScraper for description toggle
    } catch {}
    return mgr;
  }

  function initJobs() {
    if (!document.getElementById('jobsSection')) return; // only if jobs UI exists

    // Wire filters and initial load
    bindFilters();
    document.addEventListener('jobs:render', renderTable);
    loadJobs();
    // Preload tags metadata for pills/editor
    ensureTagsLoaded().catch(() => {});
    // Initialize scraper panel manager if panel exists in template
    if (document.getElementById('jobScraperPanel')) {
      initScraper();
    }

    // New job
    qs('#jobsNewBtn')?.addEventListener('click', async () => {
      try {
        const job = await JobsAPI.create({ state: 'draft', applied: 0, responded: 0 });
        // Prepend and re-render
        JobsState.items = [job, ...(JobsState.items || [])];
        document.dispatchEvent(new CustomEvent('jobs:render'));
      } catch (e) {
        // eslint-disable-next-line no-alert
        alert('Could not create job');
      }
    });

    // Edit mode toggle
    qs('#jobsToggleEdit')?.addEventListener('click', () => {
      JobsState.editMode = !JobsState.editMode;
      const btn = qs('#jobsToggleEdit');
      if (btn) btn.textContent = JobsState.editMode ? 'Edit Mode: On' : 'Edit Mode';
      document.dispatchEvent(new CustomEvent('jobs:render'));
    });

    // View mode toggle
    qs('#jobsToggleView')?.addEventListener('click', () => {
      JobsState.viewMode = JobsState.viewMode === 'compact' ? 'detailed' : 'compact';
      // Update button label if element exists
      const btn = qs('#jobsToggleView');
      if (btn) btn.textContent = JobsState.viewMode === 'compact' ? 'Compact' : 'Detailed';
      document.dispatchEvent(new CustomEvent('jobs:render'));
    });
  }

  // Feature flag to avoid double-binding while migrating
  function shouldInit() {
    return typeof window !== 'undefined' && window.__USE_JOBS_MODULES__ === true;
  }

  // Auto-bootstrap only when flag is on
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (shouldInit()) initJobs(); });
  } else if (shouldInit()) {
    initJobs();
  }

})();
//# sourceMappingURL=jobs.js.map

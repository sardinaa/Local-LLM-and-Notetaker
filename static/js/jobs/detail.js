import { JobsState } from './state.js';
import { ensureTagsLoaded } from './tags.js';
import { CLASSES } from '../constants/classes.js';
import { show, hide, toggle } from '../utils/dom.js';

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
const escapeHtml = (s) => (String(s || '')).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

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

function renderTagsPills(tagIds) {
  const tv = JobsState.tags || new Map();
  return (tagIds || [])
    .map((id) => {
      const t = tv.get(id) || { name: id, color: 'default' };
      const colorCls = `tag-${t.color || 'default'}`;
      return `<span class="tag-pill ${colorCls}"><span class="tag-name">${escapeHtml(t.name || id)}</span></span>`;
    })
    .join('');
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
          <h2 class="job-modal-title">${escapeHtml(job.position || 'Untitled')}</h2>
          <div class="job-modal-subtitle">${escapeHtml(job.company || '')}${job.location ? ' • ' + escapeHtml(job.location) : ''}</div>
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
              <h3 id="j_card_title" class="job-title">${escapeHtml(job.position || 'Untitled')}</h3>
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
              <input type="text" id="j_pos" class="edit-only" value="${escapeHtml(job.position || '')}">
              <div class="view-only redundant-view">${escapeHtml(job.position || '')}</div>
            </div>
            <div class="cell">
              <label>Company</label>
              <input type="text" id="j_company" class="edit-only" value="${escapeHtml(job.company || '')}">
              <div class="view-only redundant-view">${escapeHtml(job.company || '')}</div>
            </div>
            <div class="cell">
              <label>Location</label>
              <input type="text" id="j_loc" class="edit-only" value="${escapeHtml(job.location || '')}">
              <div class="view-only redundant-view">${escapeHtml(job.location || '')}</div>
            </div>
          </div>
          <div class="grid-auto edit-only">
            <div class="cell">
              <label>Job type</label>
              <input type="text" id="j_type" class="edit-only" value="${escapeHtml(job.job_type || '')}">
              <div class="view-only redundant-view">${escapeHtml(job.job_type || '')}</div>
            </div>
            <div class="cell">
              <label>Salary min</label>
              <input type="number" id="j_sal_min" class="edit-only" value="${job.salary_min ?? ''}">
              <div class="view-only redundant-view">${escapeHtml(job.salary_min ?? '')}</div>
            </div>
            <div class="cell">
              <label>Salary max</label>
              <input type="number" id="j_sal_max" class="edit-only" value="${job.salary_max ?? ''}">
              <div class="view-only redundant-view">${escapeHtml(job.salary_max ?? '')}</div>
            </div>
            <div class="cell">
              <label>Currency</label>
              <input type="text" id="j_sal_cur" class="edit-only" value="${escapeHtml(job.salary_currency || '')}">
              <div class="view-only redundant-view">${escapeHtml(job.salary_currency || '')}</div>
            </div>
            <div class="cell">
              <label>Date Posted</label>
              <input type="date" id="j_date_posted" class="edit-only" value="${job.date_posted ? escapeHtml(String(job.date_posted).slice(0,10)) : ''}">
              <div class="view-only redundant-view">${escapeHtml(job.date_posted ? String(job.date_posted).slice(0,10) : '')}</div>
            </div>
          </div>
          <div class="detail-card">
            <div class="detail-card-header">Recruiter / Contact</div>
            <div class="grid-auto">
              <div class="cell"><label class="form-label">Name</label><input type="text" id="j_rec_name" class="form-input edit-only" value="${escapeHtml(job.contact_name || '')}"><div class="view-only kv-row"><span class="kv-value" id="j_rec_name_view">${escapeHtml(job.contact_name || '')}</span></div></div>
              <div class="cell"><label class="form-label">Role</label><input type="text" id="j_rec_role" class="form-input edit-only" placeholder="Role" value="${escapeHtml(job.contact_role || '')}"><div class="view-only kv-row"><span class="kv-value" id="j_rec_role_view">${escapeHtml(job.contact_role || '')}</span></div></div>
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
                  <input type="url" id="j_src" class="form-input edit-only" placeholder="https://…" value="${escapeHtml(job.source_url || '')}">
                  <button class="btn" id="j_src_autofill" type="button" title="Autofill from URL">Autofill</button>
                </div>
              </div>
            </div>
          </div>

          

          <div class="detail-card edit-only">
            <div class="detail-card-header">Job Description</div>
            <div class="desc-block">
              <textarea id="j_desc" class="form-textarea" rows="6" placeholder="Job description (Markdown supported)">${escapeHtml(job.description || '')}</textarea>
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
          <textarea id="j_notes" rows="10" placeholder="Notes...">${escapeHtml(job.notes || '')}</textarea>
          <div class="files-row">
            <div>
              <strong>Letters:</strong> <span id="j_letters_count">${(job.letters || []).length}</span>
              <button class="btn" data-act="upload-letter">Upload letter</button>
            </div>
            <div id="j_letters_list" class="letters-list">${(job.letters || [])
              .map((l) => `<a href="/api/jobs/${job.id}/letters/${encodeURIComponent(l.filename)}" target="_blank">${escapeHtml(l.filename)}</a>`)
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
          const content = v.canApply ? `${v.changed ? `<span style=\"text-decoration:line-through;color:#a00;\">${escapeHtml(oldShort)}</span> → ` : ''}<span>${escapeHtml(newShort)}</span>` : `<span class=\"muted\">— not detected</span>`;
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
      pills.push(`<span class=\"job-pill company\"><i class=\"fas fa-building\"></i>${escapeHtml(job.company || 'Unknown')}</span>`);
  if ((job.job_type || '').trim()) pills.push(`<span class=\"job-pill work-type\"><i class=\"fas fa-briefcase\"></i>${escapeHtml(job.job_type)}</span>`);
      if (locText) pills.push(`<span class=\"job-pill location\"><i class=\"fas fa-location-dot\"></i>${escapeHtml(locText)}</span>`);
      if (salText) pills.push(`<span class=\"job-pill salary\"><i class=\"fas fa-money-bill-1\"></i>${escapeHtml(salText)}</span>`);
      const state = (job.state || 'draft').toLowerCase();
      pills.push(`<span class=\"job-pill posted-date\"><i class=\"fas fa-circle\"></i>${escapeHtml(state.replace(/^./, c=>c.toUpperCase()))} • Int: <strong id=\"j_int_count\">${computeInterviewCount(events)}</strong></span>`);
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
      const html = (window.marked && typeof window.marked.parse==='function') ? window.marked.parse(md) : escapeHtml(md).replace(/\n/g,'<br>');
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
        <span class=\"pill muted\" style=\"min-width:88px;text-align:center;\">${escapeHtml(h.type || 'Other')}</span>
        <input type=\"text\" class=\"j_contact_value_in\" value=\"${escapeHtml(h.value||'')}\"> 
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
        updateContactActions();
      });
    });
    wrap.querySelectorAll('.j_contact_value_in').forEach((inp) => {
      inp.addEventListener('input', () => {
        const row = inp.closest('[data-idx]');
        const idx = Number(row.getAttribute('data-idx'));
        const arr = Array.isArray(job.contact_handles) ? job.contact_handles : contactHandles;
        if (arr[idx]) arr[idx].value = inp.value;
        updateContactActions();
      });
    });
  }
  
  function updateContactActions() {
    // Update UI state for contact-related actions
    // This function is called after contact modifications to ensure UI consistency
    // Currently a placeholder - can be expanded to update button states, validation, etc.
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
      const label = `${escapeHtml(h.type || '')}: ${escapeHtml(h.value || '')}`;
      return href ? `<a class="job-pill ${cls}" href="${escapeHtml(href)}" target="${href.startsWith('http') ? '_blank' : '_self'}" rel="noopener">${label}</a>`
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
  follow.addEventListener('change', async () => { const next_follow_up = toIso(follow.value); job.next_follow_up = next_follow_up; if (job.id) { await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ next_follow_up }) }); if (typeof onUpdated === 'function') onUpdated({ ...job }); } });

  // Timeline
  function renderTimeline() {
    const wrap = q('j_timeline'); if (!wrap) return;
    wrap.innerHTML = (events || []).map((ev) => `
      <div class=\"tl-item\" data-id=\"${ev.id}\"> 
        <div class=\"tl-dot\"></div>
        <div class=\"tl-content\"> 
          <div class=\"tl-head\"><strong>${escapeHtml(ev.type || 'Event')}</strong> <span class=\"muted\">${ev.dt ? escapeHtml(new Date(ev.dt).toLocaleString()) : ''}</span></div>
          <div class=\"tl-meta\">${[ev.participants, ev.medium, ev.outcome].filter(Boolean).map(escapeHtml).join(' • ')}</div>
          ${ev.notes ? `<div class=\"tl-notes\">${escapeHtml(ev.notes)}</div>` : ''}
        </div>
      </div>`).join('');
    const next = nextUpcomingInterview(events);
    const cta = q('j_next_cta');
  if (cta) { cta.innerHTML = next ? `<strong>Next interview:</strong> ${escapeHtml(new Date(next.dt).toLocaleString())} <button class=\"btn\" data-act=\"add-cal\">Add to calendar</button>` : ''; }
    const btn = overlay.querySelector('[data-act="add-cal"]');
  if (btn) btn.addEventListener('click', () => { const detail = { jobId: job.id, event: next }; document.dispatchEvent(new CustomEvent('job:addToCalendar', { detail })); });
  const cnt = q('j_int_count'); if (cnt) cnt.textContent = String(computeInterviewCount(events));
  if (editMode) wrap.querySelectorAll('.tl-item').forEach((el) => { el.addEventListener('click', async () => { const id = el.getAttribute('data-id'); const ev = events.find((x) => x.id === id); if (!ev) return; const newType = prompt('Event type (e.g., Interview, Offer, Rejected, Recruiter call):', ev.type || ''); if (newType === null) return; const newDt = prompt('Date/time (YYYY-MM-DD HH:MM, empty to keep):', ev.dt ? new Date(ev.dt).toLocaleString() : ''); const patch = { type: newType }; if (newDt && newDt.trim()) { const guess = new Date(newDt); if (!isNaN(guess)) patch.dt = guess.toISOString(); } const res = await fetch(`/api/jobs/${job.id}/events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); if (res.ok) { const upd = await res.json(); Object.assign(ev, upd); const newState = deriveStateFromEvents(events, job.state); if (newState !== job.state) { await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: newState }) }); job.state = newState; renderSummaryCard(); if (typeof onUpdated === 'function') onUpdated({ ...job }); } renderTimeline(); } }); });
  }
  renderTimeline();
  overlay.querySelector('[data-act="add-event"]').addEventListener('click', async () => { const nowIso = new Date().toISOString(); const payload = { type: 'Interview', dt: nowIso }; const res = await fetch(`/api/jobs/${job.id}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (res.ok) { const ev = await res.json(); events.push(ev); const newState = deriveStateFromEvents(events, job.state); if (newState !== job.state) { await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: newState }) }); job.state = newState; renderSummaryCard(); if (typeof onUpdated === 'function') onUpdated({ ...job }); } renderTimeline(); } });

  // Notes autosave
  let tNotes; const saveNotes = async () => { clearTimeout(tNotes); tNotes = setTimeout(async () => { const notes = q('j_notes')?.value || ''; await fetch(`/api/jobs/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) }); }, 300); };
  q('j_notes')?.addEventListener('input', saveNotes);

  // Letters upload
  overlay.querySelector('[data-act="upload-letter"]').addEventListener('click', () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/pdf'; input.onchange = async () => { if (!input.files || !input.files[0]) return; const fd = new FormData(); fd.append('file', input.files[0]); const res = await fetch(`/api/jobs/${job.id}/letters`, { method: 'POST', body: fd }); if (res.ok) { const letter = await res.json(); job.letters = job.letters || []; job.letters.unshift(letter); const cnt = q('j_letters_count'); if (cnt) cnt.textContent = String(job.letters.length); const a = document.createElement('a'); a.href = `/api/jobs/${job.id}/letters/${encodeURIComponent(letter.filename)}`; a.target = '_blank'; a.textContent = letter.filename; const lst = q('j_letters_list'); if (lst) lst.prepend(a); if (typeof onUpdated === 'function') onUpdated({ ...job }); } else { alert('Upload failed'); } }; input.click(); });

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
      if (updated) { Object.assign(job, updated); if (!silent) close(); if (typeof onUpdated === 'function') onUpdated({ ...job }); }
    } catch (e) { console.error('Save failed', e); alert('Save failed'); }
  }
  overlay.querySelector('[data-act="save"]').addEventListener('click', () => save(false));
  overlay.querySelector('[data-act="delete"]').addEventListener('click', async () => { if (!confirm('Delete this job?')) return; const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' }); if (res.ok) { close(); if (typeof onUpdated === 'function') onUpdated({ deleted: true, id: job.id }); } });
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
        if (typeof onUpdated === 'function') onUpdated({ ...job });
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

export async function openDetail(jobId, onUpdated) {
  await ensureTagsLoaded().catch(() => {});
  try {
    const { job, events } = await fetchJob(jobId);
    buildModal(job, events, onUpdated, { initialEditMode: false, isNew: false });
  } catch (e) {
    console.error('Job detail load failed:', e);
    alert('Failed to load job details');
  }
}

export function openCreate(prefill = {}, onUpdated) {
  const job = Object.assign({ id: null, state: 'draft', position: '', company: '', location: '', job_type: '', salary_min: null, salary_max: null, salary_currency: '', date_posted: null, source_url: '', contact_name: '', contact_role: '', contact_handles: [], notes: '', description: '', next_follow_up: null, letters: [], tagIds: [] }, prefill);
  const events = [];
  buildModal(job, events, onUpdated, { initialEditMode: true, isNew: true });
}

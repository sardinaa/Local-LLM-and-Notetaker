// Job Detail modal (Overview, Interviews & Timeline, Notes & Files)
// Provides window.openJobDetail(jobId, onUpdated)
(function(){
  const fmtDateTimeLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toIso = (localStr) => {
    if (!localStr) return null;
    try { return new Date(localStr).toISOString(); } catch { return null; }
  };
  const escape = (s) => (s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const byId = (id) => document.getElementById(id);

  function computeInterviewCount(events){
    return (events||[]).filter(e => (e.type||'').toLowerCase().includes('interview')).length;
  }
  function deriveStateFromEvents(events, current){
    const types = (events||[]).map(e => (e.type||'').toLowerCase());
    if (types.includes('rejected')) return 'rejected';
    if (types.includes('offer')) return 'offer';
    if (types.some(t => t.includes('interview') || t.includes('screen'))){
      return 'interview';
    }
    return current || 'draft';
  }

  function nextUpcomingInterview(events){
    const now = Date.now();
    const upcoming = (events||[]).filter(e => (e.type||'').toLowerCase().includes('interview') && e.dt && !isNaN(new Date(e.dt))).sort((a,b)=> new Date(a.dt)-new Date(b.dt));
    return upcoming.find(e => new Date(e.dt).getTime() >= now) || null;
  }

  async function fetchJob(jobId){
    const r1 = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (!r1.ok) {
      let msg = 'job_fetch_failed';
      try { const t = await r1.text(); msg = t; } catch {}
      throw new Error(msg);
    }
    const j = await r1.json();
    if (!j || j.error) throw new Error(j && j.error || 'job_not_found');
    let events = [];
    try {
      const r2 = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/events`);
      if (r2.ok) {
        const evr = await r2.json();
        events = evr && Array.isArray(evr.events) ? evr.events : [];
      }
    } catch (e) {
      console.warn('events fetch failed', e);
    }
    return { job: j, events };
  }

  function renderTagsPills(tagIds){
    // Minimal tag pills using name if available from global jobs view cache
    const tv = (window.jobsView && window.jobsView.tags) ? window.jobsView.tags : new Map();
    return (tagIds||[]).map(id => {
      const t = tv.get(id) || { name: id, color: 'default' };
      const colorCls = `tag-${t.color||'default'}`;
      return `<span class="tag-pill ${colorCls}"><span class="tag-name">${escape(t.name||id)}</span></span>`;
    }).join('');
  }

  function buildModal(job, events, onUpdated, options = {}){
    // Normalize benefits if sent as JSON string
    if (typeof job.benefits === 'string') {
      try { job.benefits = JSON.parse(job.benefits); } catch {}
    }
    const overlay = document.createElement('div');
    overlay.className = 'job-modal-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.innerHTML = `
      <div class="job-modal" style="max-width:64rem;">
        <header class="job-modal-header">
          <div>
            <h2 class="job-modal-title">${escape(job.position||'Untitled')}</h2>
            <div class="job-modal-subtitle">${escape(job.company||'')}${job.location? ' • '+escape(job.location):''}</div>
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
            <div id="j_meta_pills" class="meta-pills view-only"></div>
            <div class="grid2 edit-only" style="margin-top:6px;">
              <div>
                <label>Position</label>
                <input type="text" id="j_pos" value="${escape(job.position||'')}">
              </div>
              <div>
                <label>Company</label>
                <input type="text" id="j_company" value="${escape(job.company||'')}">
              </div>
            </div>
            <div class="grid-auto">
              <div class="cell">
                <label>Location</label>
                <input class="edit-only" type="text" id="j_loc" value="${escape(job.location||'')}">
              </div>
              <div class="cell">
                <label>Salary</label>
                <div class="row edit-only">
                  <input type="number" id="j_sal_min" placeholder="Min" value="${job.salary_min??''}">
                  <input type="number" id="j_sal_max" placeholder="Max" value="${job.salary_max??''}">
                  <input type="text" id="j_sal_cur" placeholder="CUR" value="${escape(job.salary_currency||'')}">
                </div>
              </div>
              <div class="cell">
                <label>Job type</label>
                <input class="edit-only" type="text" id="j_type" value="${escape(job.job_type||'')}">
              </div>
              <div class="cell">
                <label>Deadline</label>
                <input class="edit-only" type="date" id="j_deadline" value="${job.deadline? (new Date(job.deadline).toISOString().slice(0,10)) : ''}">
              </div>
            </div>
            <div class="grid-auto">
              <div class="cell full">
                <label>Recruiter</label>
                <div class="recruiter-card view-only" id="j_rec_card"></div>
                <div class="edit-only">
                  <div class="grid-auto">
                    <input type="text" id="j_rec_name" placeholder="Name" value="${escape(job.contact_name||'')}">
                    <input type="text" id="j_rec_role" placeholder="Role" value="${escape(job.contact_role||'')}">
                  </div>
                  <div class="contact-edit-list" id="j_contacts_list"></div>
                  <div class="row" id="j_contacts_add">
                    <select id="j_contact_type"><option>Email</option><option>Phone</option><option>LinkedIn</option><option>Other</option></select>
                    <input type="text" id="j_contact_value" placeholder="address / number / url">
                    <button class="btn" id="j_contact_add_btn">Add</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="grid-auto">
              <div class="cell">
                <label>Next follow-up</label>
                <div class="row">
                  <input type="datetime-local" id="j_follow" value="${fmtDateTimeLocal(job.next_follow_up)}">
                  <button class="btn" data-act="follow+3d">+3d</button>
                  <button class="btn" data-act="follow+1w">+1w</button>
                </div>
              </div>
              <div class="cell full">
                <label>Application Source URL</label>
                <input type="url" id="j_src" value="${escape(job.source_url||'')}">
              </div>
            </div>
            <div class="section-divider"></div>
            <div class="section-title">Benefits</div>
            <div>
              <div id="j_benefits" class="benefits-list"></div>
              <div class="row edit-only" id="j_benefits_addrow">
                <input type="text" id="j_ben_name" placeholder="Benefit (e.g., Remote)">
                <input type="text" id="j_ben_val" placeholder="Value (optional)">
                <button class="btn" data-act="add-benefit">Add</button>
              </div>
            </div>
            <div class="section-divider"></div>
            <div class="section-title">Job Description</div>
            <div class="desc-block">
              <div id="j_desc_view" class="desc-view"></div>
              <textarea id="j_desc" class="edit-only" rows="6" placeholder="Job description (Markdown supported)">${escape(job.description || '')}</textarea>
              <button class="btn btn-mini view-only" id="j_desc_toggle">Show more</button>
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
            <textarea id="j_notes" rows="10" placeholder="Notes...">${escape(job.notes||'')}</textarea>
            <div class="files-row">
              <div>
                <strong>Letters:</strong> <span id="j_letters_count">${(job.letters||[]).length}</span>
                <button class="btn" data-act="upload-letter">Upload letter</button>
              </div>
              <div id="j_letters_list" class="letters-list">${(job.letters||[]).map(l=>`<a href="/api/jobs/${job.id}/letters/${encodeURIComponent(l.filename)}" target="_blank">${escape(l.filename)}</a>`).join(' ')}</div>
            </div>
          </section>
        </main>
      </div>
    `;

    // Local query helper against overlay (not yet in DOM)
    const q = (id) => overlay.querySelector(`#${id}`);

    // Wire open job post URL
    const aopen = overlay.querySelector('[data-act="open"]');
    if (aopen) aopen.href = job.source_url || '#';

    function close(){
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }
    function onKey(e){
      if (e.key === 'Escape') close();
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='s') {
        e.preventDefault();
        save(true);
      }
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e)=>{ if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="close"]').addEventListener('click', close);

    // Append to DOM before disabling/enabling fields so querySelector works reliably
    document.body.appendChild(overlay);
    // Focus trap activation will run after we set up modes

    // Tabs
    const tabs = overlay.querySelectorAll('.job-modal-tabs [role="tab"]');
    const panels = overlay.querySelectorAll('[data-panel]');
    tabs.forEach(btn => btn.addEventListener('click', () => {
      tabs.forEach(b=>b.setAttribute('aria-selected','false'));
      btn.setAttribute('aria-selected','true');
      const name = btn.getAttribute('data-tab');
      panels.forEach(p => p.classList.toggle('is-hidden', p.getAttribute('data-panel') !== name));
    }));

    // Helpers
    const fmtSalaryLong = (min, max, cur) => {
      const currency = cur || 'USD';
      const fmt = (n) => {
        if (n == null) return '';
        const num = Number(n);
        if (!isFinite(num)) return String(n);
        try { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num); }
        catch (e) { return String(num); }
      };
      if (min != null && max != null) return `${fmt(min)} – ${fmt(max)} ${currency}`;
      if (min != null) return `${fmt(min)}+ ${currency}`;
      if (max != null) return `≤ ${fmt(max)} ${currency}`;
      return '';
    };

    // Render read-mode derived fields (meta pills, benefits, recruiter card, description)
    const meta = [];
    // Stage pill first
    const stage = (job.state || 'draft');
    const stageLabel = stage.replace(/^./, c=>c.toUpperCase());
    meta.push(`<span class=\"chip\"><span class=\"state-pill state-${(stage||'draft').toLowerCase()}\">${escape(stageLabel)}</span> <span class=\"muted\">Int: <strong id=\"j_int_count\">${computeInterviewCount(events)}</strong></span></span>`);
    const locText = (job.location || '').trim();
    const salText = fmtSalaryLong(job.salary_min, job.salary_max, job.salary_currency) || '';
    const typeText = (job.job_type || '').trim();
    let deadlineText = '';
    try { deadlineText = job.deadline ? new Date(job.deadline).toLocaleDateString() : ''; } catch { deadlineText = job.deadline || ''; }
    if (locText) meta.push(`<span class=\"chip\"><i class=\"fas fa-map-marker-alt\"></i> <span class=\"text\">${escape(locText)}</span></span>`);
    if (salText) meta.push(`<span class=\"chip\"><i class=\"fas fa-money-bill\"></i> <span class=\"text\">${escape(salText)}</span></span>`);
    if (typeText) meta.push(`<span class=\"chip\"><i class=\"fas fa-briefcase\"></i> <span class=\"text\">${escape(typeText)}</span></span>`);
    if (deadlineText) meta.push(`<span class=\"chip\"><i class=\"fas fa-calendar\"></i> <span class=\"text\">${escape(deadlineText)}</span></span>`);
    const metaWrap = q('j_meta_pills'); if (metaWrap) metaWrap.innerHTML = meta.join(' ');

    // Benefits (filter duplicates like Remote if location contains it)
    const benWrap = q('j_benefits');
    const benefitsArr = Array.isArray(job.benefits) ? job.benefits.slice() : [];
    const loc = (job.location || '').toLowerCase();
    const filtered = benefitsArr.filter(b => {
      const n = (b && b.name || '').toLowerCase();
      if (n === 'remote' && loc.includes('remote')) return false;
      return true;
    });
    if (benWrap) benWrap.innerHTML = filtered.map(b => `<span class="chip" data-name="${escape(b.name)}">${escape(b.name)}${b.value?': '+escape(b.value):''}<button class="chip-x" title="Remove">×</button></span>`).join('');

    // Recruiter card (multi-contact)
    const recCard = q('j_rec_card');
    const contactHandles = Array.isArray(job.contact_handles) ? job.contact_handles.slice() : [];
    // Seed with legacy single fields if not present
    if (job.contact_email && !contactHandles.find(c=>c.type==='Email' && c.value===job.contact_email)) contactHandles.push({type:'Email', value: job.contact_email});
    if (job.contact_phone && !contactHandles.find(c=>c.type==='Phone' && c.value===job.contact_phone)) contactHandles.push({type:'Phone', value: job.contact_phone});
    if (recCard) {
      const name = job.contact_name || '';
      const role = job.contact_role || '';
      const items = contactHandles.map(c => {
        const t = (c.type||'').toLowerCase();
        let v = (c.value || '').trim();
        if (!v) return '';
        if (t === 'email' || v.includes('@')) {
          return `<span class=\"chip\"><i class=\"fas fa-envelope\"></i> <a href=\"mailto:${escape(v)}\" title=\"Send Email\">${escape(v)}</a></span>`;
        }
        if (t === 'phone' || /^\+?\d[\d\s-]{3,}$/.test(v)) {
          return `<span class=\"chip\"><i class=\"fas fa-phone\"></i> <a href=\"tel:${escape(v)}\" title=\"Call Recruiter\">${escape(v)}</a></span>`;
        }
        if (t === 'linkedin' || v.includes('linkedin') || v.startsWith('in/')) {
          const href = v.startsWith('http') ? v : (v.startsWith('in/') ? `https://www.linkedin.com/${v}` : `https://www.linkedin.com/in/${v}`);
          return `<span class=\"chip\"><i class=\"fab fa-linkedin\"></i> <a href=\"${escape(href)}\" target=\"_blank\" rel=\"noopener\" title=\"View LinkedIn Profile\">LinkedIn</a></span>`;
        }
        const href = v.startsWith('http') ? v : `https://${v}`;
        return `<span class=\"chip\"><i class=\"fas fa-link\"></i> <a href=\"${escape(href)}\" target=\"_blank\" rel=\"noopener\" title=\"Open Link\">${escape(v)}</a></span>`;
      }).filter(Boolean).join(' ');
      recCard.innerHTML = `
        <div class="rec-name">${escape(name)}${role? ' — '+escape(role):''}</div>
        <div class="rec-contacts">${items || '<span class="muted">No contacts</span>'}</div>`;
    }

    // Edit mode: render current contacts list with remove buttons
    const recList = q('j_contacts_list');
    function renderContactsEdit(){
      if (!recList) return;
      recList.innerHTML = (Array.isArray(job.contact_handles)?job.contact_handles:contactHandles).map((c,idx)=>{
        const icon = (c.type||'').toLowerCase()==='email' || (c.value||'').includes('@') ? 'fa-envelope' : ((c.type||'').toLowerCase()==='phone' || /^\+?\d[\d\s-]{3,}$/.test(c.value||'')) ? 'fa-phone' : ((c.type||'').toLowerCase()==='linkedin' || (c.value||'').includes('linkedin')) ? 'fa-linkedin' : 'fa-link';
        return `<span class="chip" data-idx="${idx}"><i class="fas ${icon}"></i> <span class="text">${escape(c.value||'')}</span><button class="chip-x" title="Remove">×</button></span>`;
      }).join('');
      recList.querySelectorAll('.chip-x').forEach(btn => {
        btn.addEventListener('click', () => {
          const chip = btn.closest('.chip');
          const idx = Number(chip.getAttribute('data-idx'));
          const arr = Array.isArray(job.contact_handles)? job.contact_handles : contactHandles;
          arr.splice(idx,1);
          job.contact_handles = arr;
          renderContactsEdit();
        });
      });
    }
    renderContactsEdit();
    const addBtn = q('j_contact_add_btn');
    if (addBtn){
      addBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        const type = (q('j_contact_type')?.value || 'Other');
        const value = (q('j_contact_value')?.value || '').trim();
        if (!value) return;
        const arr = Array.isArray(job.contact_handles)? job.contact_handles : (job.contact_handles = contactHandles);
        arr.push({ type, value });
        q('j_contact_value').value = '';
        renderContactsEdit();
      });
    }

    // Description render (Markdown if available)
    const descView = q('j_desc_view');
    if (descView) {
      const md = job.description || '';
      try { descView.innerHTML = (window.marked ? window.marked.parse(md) : md.replace(/\n/g,'<br>')); } catch { descView.textContent = md; }
      // Collapse behavior
      const toggle = q('j_desc_toggle');
      let expanded = false;
      const applyCollapse = () => {
        descView.classList.toggle('collapsed', !expanded);
        if (toggle) toggle.textContent = expanded ? 'Show less' : 'Show more';
      };
      if (toggle) toggle.addEventListener('click', ()=>{ expanded = !expanded; applyCollapse(); });
      applyCollapse();
    }

    // Benefits add/remove
    overlay.querySelector('[data-act="add-benefit"]').addEventListener('click', () => {
      const n = q('j_ben_name')?.value.trim() || '';
      const v = q('j_ben_val')?.value.trim() || '';
      if (!n) return;
      const cont = q('j_benefits');
      const span = document.createElement('span');
      span.className = 'chip';
      span.setAttribute('data-name', n);
      span.innerHTML = `${escape(n)}${v?': '+escape(v):''}<button class="chip-x" title="Remove">×</button>`;
      cont && cont.appendChild(span);
      if (q('j_ben_name')) q('j_ben_name').value='';
      if (q('j_ben_val')) q('j_ben_val').value='';
    });
    q('j_benefits')?.addEventListener('click', (e)=>{
      const x = e.target.closest('.chip-x');
      if (!editMode) return;
      if (x) x.closest('.chip').remove();
    });

    // Follow-up quick actions
    const follow = q('j_follow');
    overlay.querySelector('[data-act="follow+3d"]').addEventListener('click', ()=>{
      const base = follow.value || fmtDateTimeLocal(new Date().toISOString());
      const d = new Date(base); d.setDate(d.getDate()+3); follow.value = fmtDateTimeLocal(d.toISOString());
    });
    overlay.querySelector('[data-act="follow+1w"]').addEventListener('click', ()=>{
      const base = follow.value || fmtDateTimeLocal(new Date().toISOString());
      const d = new Date(base); d.setDate(d.getDate()+7); follow.value = fmtDateTimeLocal(d.toISOString());
    });
    // Autosave follow-up change immediately to reduce friction (only if job exists)
    follow.addEventListener('change', async ()=>{
      const next_follow_up = toIso(follow.value);
      job.next_follow_up = next_follow_up;
      if (job.id) {
        await fetch(`/api/jobs/${job.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ next_follow_up }) });
        if (typeof onUpdated === 'function') onUpdated({ ...job });
      }
    });

    // Ensure editMode declared before any usage
    let editMode = !!options.initialEditMode;

    // Timeline render
    function renderTimeline(){
      const wrap = q('j_timeline');
      if (!wrap) return;
      wrap.innerHTML = (events||[]).map(ev => `
        <div class="tl-item" data-id="${ev.id}">
          <div class="tl-dot"></div>
          <div class="tl-content">
            <div class="tl-head"><strong>${escape(ev.type||'Event')}</strong> <span class="muted">${ev.dt?escape(new Date(ev.dt).toLocaleString()):''}</span></div>
            <div class="tl-meta">${[ev.participants, ev.medium, ev.outcome].filter(Boolean).map(escape).join(' • ')}</div>
            ${ev.notes?`<div class="tl-notes">${escape(ev.notes)}</div>`:''}
          </div>
        </div>
      `).join('');
      // Next interview CTA
      const next = nextUpcomingInterview(events);
      const cta = q('j_next_cta');
      if (cta){
        if (next){
          cta.innerHTML = `<strong>Next interview:</strong> ${escape(new Date(next.dt).toLocaleString())} <button class="btn" data-act="add-cal">Add to calendar</button>`;
        } else {
          cta.innerHTML = '';
        }
      }
      const btn = overlay.querySelector('[data-act="add-cal"]');
      if (btn){
        btn.addEventListener('click', ()=>{
          const detail = { jobId: job.id, event: next };
          document.dispatchEvent(new CustomEvent('job:addToCalendar', { detail }));
        });
      }
      const cnt = q('j_int_count'); if (cnt) cnt.textContent = String(computeInterviewCount(events));

      // Simple inline editor on click (only in edit mode)
      if (editMode) {
        wrap.querySelectorAll('.tl-item').forEach(el => {
          el.addEventListener('click', async ()=>{
            const id = el.getAttribute('data-id');
            const ev = events.find(x=>x.id===id);
            if (!ev) return;
            const newType = prompt('Event type (e.g., Interview, Offer, Rejected, Recruiter call):', ev.type||'')
            if (newType === null) return;
            const newDt = prompt('Date/time (YYYY-MM-DD HH:MM, empty to keep):', ev.dt ? new Date(ev.dt).toLocaleString() : '');
            const patch = { type: newType };
            if (newDt && newDt.trim()) {
              const guess = new Date(newDt);
              if (!isNaN(guess)) patch.dt = guess.toISOString();
            }
            const res = await fetch(`/api/jobs/${job.id}/events/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
            if (res.ok){
              const upd = await res.json();
              Object.assign(ev, upd);
              const newState = deriveStateFromEvents(events, job.state);
              if (newState !== job.state){
                await fetch(`/api/jobs/${job.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ state: newState }) });
                job.state = newState;
                const pill = overlay.querySelector('.state-pill');
                if (pill){ pill.textContent = newState.replace(/^./,c=>c.toUpperCase()); pill.className = `state-pill state-${newState}`; }
                if (typeof onUpdated === 'function') onUpdated({ ...job });
              }
              renderTimeline();
            }
          });
        });
      }
    }
    renderTimeline();

    overlay.querySelector('[data-act="add-event"]').addEventListener('click', async ()=>{
      const nowIso = new Date().toISOString();
      const payload = { type: 'Interview', dt: nowIso };
      const res = await fetch(`/api/jobs/${job.id}/events`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (res.ok){
        const ev = await res.json();
        events.push(ev);
        // Update stage based on events (set state at least to interview)
        const newState = deriveStateFromEvents(events, job.state);
        if (newState !== job.state){
          await fetch(`/api/jobs/${job.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ state: newState }) });
          job.state = newState;
          const pill = overlay.querySelector('.state-pill');
          if (pill){ pill.textContent = newState.replace(/^./,c=>c.toUpperCase()); pill.className = `state-pill state-${newState}`; }
          if (typeof onUpdated === 'function') onUpdated({ ...job });
        }
        renderTimeline();
      }
    });

    // Notes autosave (+ Ctrl/Cmd+S handled globally)
    let tNotes;
    const saveNotes = async () => {
      clearTimeout(tNotes);
      tNotes = setTimeout(async ()=>{
        const notes = q('j_notes')?.value || '';
        await fetch(`/api/jobs/${job.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ notes }) });
      }, 300);
    };
    q('j_notes')?.addEventListener('input', saveNotes);

    // Upload letter uses existing endpoint
    overlay.querySelector('[data-act="upload-letter"]').addEventListener('click', ()=>{
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/pdf';
      input.onchange = async ()=>{
        if (!input.files || !input.files[0]) return;
        const fd = new FormData(); fd.append('file', input.files[0]);
        const res = await fetch(`/api/jobs/${job.id}/letters`, { method:'POST', body: fd });
        if (res.ok){
          const letter = await res.json();
          job.letters = job.letters || []; job.letters.unshift(letter);
          const cnt = q('j_letters_count'); if (cnt) cnt.textContent = String(job.letters.length);
          const a = document.createElement('a'); a.href = `/api/jobs/${job.id}/letters/${encodeURIComponent(letter.filename)}`; a.target = '_blank'; a.textContent = letter.filename;
          const lst = q('j_letters_list'); if (lst) lst.prepend(a);
          if (typeof onUpdated === 'function') onUpdated({ ...job });
        } else { alert('Upload failed'); }
      };
      input.click();
    });

    async function save(silent){
      // Basic URL validation
      const src = (q('j_src')?.value || '').trim();
      if (src && !/^https?:\/\//i.test(src)) {
        alert('Source URL must start with http:// or https://');
        return;
      }
      const benefits = Array.from(overlay.querySelectorAll('#j_benefits .chip')).map(ch => {
        const text = ch.textContent.replace('×','').trim();
        const [name, ...rest] = text.split(':');
        const value = rest.join(':').trim() || null;
        return { name: name.trim(), value };
      });
      const patch = {
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
        contact_method: q('j_rec_method')?.value || null,
        // heuristics for contact handle to email/phone
        ...(function(){ const inp = q('j_rec_handle'); const h = (inp && inp.value.trim()) || ''; const o={}; if (h.includes('@')) o.contact_email=h; else if (/^\+?\d/.test(h)) o.contact_phone=h; else if (h) o.contact_email=h; return o; })(),
        next_follow_up: toIso(q('j_follow')?.value || ''),
        benefits: benefits,
        deadline: q('j_deadline')?.value || null,
        description: q('j_desc')?.value || null,
        contact_handles: (Array.isArray(job.contact_handles) ? job.contact_handles : contactHandles)
      };
      const res = await fetch(`/api/jobs/${job.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
      if (res.ok){
        const updated = await res.json();
        Object.assign(job, updated);
        if (!silent) close();
        if (typeof onUpdated === 'function') onUpdated({ ...job });
      } else {
        alert('Save failed');
      }
    }

    overlay.querySelector('[data-act="save"]').addEventListener('click', ()=> save(false));
    overlay.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
      if (!confirm('Delete this job?')) return;
      const res = await fetch(`/api/jobs/${job.id}`, { method:'DELETE' });
      if (res.ok){ close(); if (typeof onUpdated==='function') onUpdated({ deleted: true, id: job.id }); }
    });
    overlay.querySelector('[data-act="archive"]').addEventListener('click', async ()=>{
      // add archived tag if exists
      try {
        const tv = (window.jobsView && window.jobsView.tags) ? window.jobsView.tags : new Map();
        let archived = Array.from(tv.values()).find(t => (t.name||'').toLowerCase()==='archived');
        if (!archived){
          const r = await fetch('/api/tags', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: 'archived' })});
          if (r.ok) archived = await r.json();
        }
        if (archived){
          const tagIds = new Set(job.tagIds||[]); tagIds.add(archived.id);
          await fetch(`/api/jobs/${job.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tagIds: Array.from(tagIds) })});
          job.tagIds = Array.from(tagIds);
          if (typeof onUpdated === 'function') onUpdated({ ...job });
        }
      } catch (e) { console.warn('Archive failed', e); }
    });
    overlay.querySelector('[data-act="tags"]').addEventListener('click', ()=>{
      alert('Open tags manager from main UI.');
    });

    // Contact actions
    function updateContactActions(){
      const cont = q('j_rec_actions'); if (!cont) return;
      cont.innerHTML = '';
      const handle = q('j_rec_handle')?.value.trim() || '';
      const email = job.contact_email || (handle.includes('@') ? handle : '');
      const phone = job.contact_phone || (/^\+?\d[\d\s-]{3,}$/.test(handle) ? handle : '');
      const linked = (handle.startsWith('http') && handle.includes('linkedin')) ? handle : '';
      if (email){ const a=document.createElement('a'); a.href=`mailto:${email}`; a.className='icon-btn sm'; a.title='Send Email'; a.innerHTML='<i class="fas fa-envelope"></i>'; cont.appendChild(a);} 
      if (phone){ const a=document.createElement('a'); a.href=`tel:${phone}`; a.className='icon-btn sm'; a.title='Call Recruiter'; a.innerHTML='<i class="fas fa-phone"></i>'; cont.appendChild(a);} 
      if (linked){ const a=document.createElement('a'); a.href=linked; a.target='_blank'; a.rel='noopener'; a.className='icon-btn sm'; a.title='View LinkedIn Profile'; a.innerHTML='<i class="fab fa-linkedin"></i>'; cont.appendChild(a);} 
    }
    updateContactActions();

    // Edit mode toggle and field enable/disable
    function applyEditMode(){
      overlay.classList.toggle('editing', editMode);
      // Toggle view/edit blocks
      overlay.querySelectorAll('.view-only').forEach(el => { el.style.display = editMode ? 'none' : ''; });
      overlay.querySelectorAll('.edit-only').forEach(el => { el.style.display = editMode ? '' : 'none'; });
      const controls = overlay.querySelectorAll('input, select, textarea');
      controls.forEach(el => {
        const id = el.id || '';
        const follow = id === 'j_follow';
        if (el.tagName === 'TEXTAREA') {
          el.readOnly = !editMode && !follow; // notes should be read-only in read mode
        } else {
          el.disabled = !editMode && !follow;
        }
      });
      // Benefits add row visible only in edit mode
      const addrow = q('j_benefits_addrow'); if (addrow) addrow.style.display = editMode ? 'flex' : 'none';
      // Chip remove buttons only when editing
      overlay.querySelectorAll('#j_benefits .chip-x').forEach(b => { b.style.display = editMode ? '' : 'none'; });
      // Add event button disabled in read mode
      const addEvBtn = overlay.querySelector('[data-act="add-event"]'); if (addEvBtn) addEvBtn.disabled = !editMode;
      // Timeline editing only when editing
      renderTimeline();
      // Toggle tooltip/icon
      const tbtn = overlay.querySelector('[data-act="toggle-edit"]');
      if (tbtn){ tbtn.title = editMode ? 'Disable edit mode' : 'Enable edit mode'; }
    }
    overlay.querySelector('[data-act="toggle-edit"]').addEventListener('click', ()=>{ editMode = !editMode; applyEditMode(); });
    // Start in read mode: hide edit-only blocks
    overlay.querySelectorAll('.edit-only').forEach(el => el.style.display = 'none');
    applyEditMode();

    // Accessibility: focus trap
    const focusable = overlay.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    const first = focusable[0]; const last = focusable[focusable.length-1];
    overlay.addEventListener('keydown',(e)=>{
      if (e.key === 'Tab'){
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    });
    (first||overlay).focus();
  }

  async function openJobDetail(jobId, onUpdated){
    try {
      const { job, events } = await fetchJob(jobId);
      buildModal(job, events, onUpdated, { initialEditMode: false, isNew: false });
    } catch (e) {
      console.error('Job detail load failed:', e);
      alert('Failed to load job details');
    }
  }

  function openJobCreate(prefill = {}, onUpdated){
    const job = Object.assign({
      id: null,
      state: 'draft',
      position: '', company: '', location: '', job_type: '',
      salary_min: null, salary_max: null, salary_currency: '',
      deadline: null, source_url: '',
      contact_name: '', contact_role: '', contact_method: '', contact_handles: [],
      notes: '', description: '', next_follow_up: null, letters: [], tagIds: []
    }, prefill);
    const events = [];
    buildModal(job, events, onUpdated, { initialEditMode: true, isNew: true });
  }

  window.openJobDetail = openJobDetail;
  window.openJobCreate = openJobCreate;
})();

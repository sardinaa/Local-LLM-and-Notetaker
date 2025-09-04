/* Jobs Dashboard: minimal, full-width, inline-editable table */
(function(){
  class JobsView {
    constructor() {
      this.jobs = [];
      this.tags = new Map(); // id -> tag
      this.isInitialized = false;
      this.loading = false;
      this.selected = new Set();
      this.currentFilters = {};
      this.editMode = false; // view-only by default
      this.viewMode = 'compact'; // compact or detailed
    }

    async init() {
      if (this.isInitialized) return;
      this.cacheEls();
      this.bindEvents();
      this.updateToggleLabels();
      await this.loadTags();
      await this.refresh();
      this.isInitialized = true;
    }

    cacheEls() {
      this.$wrap = document.getElementById('jobsList');
      this.$new = document.getElementById('jobsNewBtn');
      this.$refresh = document.getElementById('jobsRefresh');
      this.$clear = document.getElementById('jobsClearFilters');
      this.$applyState = document.getElementById('jobsApplyState');
      this.$applyFlags = document.getElementById('jobsApplyFlags');
      // Bulk bar
      this.$bulkBar = document.getElementById('jobsBulkBar');
      this.$bulkCount = document.getElementById('jobsBulkCount');
      this.$bulkBtn = document.getElementById('jobsBulkActionsBtn');
      this.$bulkMenu = document.getElementById('jobsBulkMenu');
      this.$toggleEdit = document.getElementById('jobsToggleEdit');
      this.$toggleView = document.getElementById('jobsToggleView');
      this.$search = document.getElementById('jobsSearch');
      this.$position = document.getElementById('jobsPosition');
      this.$company = document.getElementById('jobsCompany');
      this.$location = document.getElementById('jobsLocation');
      this.$state = document.getElementById('jobsState');
      this.$minSalary = document.getElementById('jobsMinSalary');
      this.$maxSalary = document.getElementById('jobsMaxSalary');
      this.$applied = document.getElementById('jobsApplied');
      this.$responded = document.getElementById('jobsResponded');
      this.$hasLetters = document.getElementById('jobsHasLetters');
      this.$filterTagsChips = document.getElementById('jobsFilterTagsChips');
      this.$advancedRow = document.getElementById('jobsAdvancedRow');
      this.$advancedBtn = document.getElementById('jobsAdvancedFilters');
      this.filterTags = new Set(); // anyOf tag IDs
    }

    bindEvents() {
      const onFilter = () => this.debounce(() => this.refresh(), 250);
      [this.$search, this.$position, this.$company, this.$location, this.$state,
       this.$minSalary, this.$maxSalary].forEach(el => el && el.addEventListener('input', onFilter));
      // Toggle pills
      const bindToggle = (btn) => btn && btn.addEventListener('click', () => { btn.classList.toggle('active'); this.refresh(); });
      bindToggle(this.$applied);
      bindToggle(this.$responded);
      bindToggle(this.$hasLetters);

      this.$clear?.addEventListener('click', () => this.clearFilters());
      this.$refresh?.addEventListener('click', () => this.refresh());
      this.$new?.addEventListener('click', () => this.createJob());
      this.$advancedBtn?.addEventListener('click', () => this.toggleAdvancedFilters());
      const $sample = document.getElementById('jobsLoadTemplates');
      $sample?.addEventListener('click', async () => {
        try {
          // Clear filters so new data is visible
          this.clearFilters();
          // Load only the jobs template to avoid noise
          const res = await fetch('/api/dev/load_template?name=template2');
          const j = await res.json();
          if (j && j.status === 'ok') { await this.refresh(); this.notify('Sample jobs loaded'); }
          else this.notify('Failed to load sample jobs','error');
        } catch(e){ this.notify('Failed to load sample jobs','error'); }
      });

      // Bulk bar actions
      if (this.$bulkBtn) {
        this.$bulkBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.$bulkMenu) {
            this.$bulkMenu.classList.toggle('is-hidden');
            // Ensure menu aligns under the button
            const wrap = document.getElementById('jobsBulkWrap');
            if (wrap) { wrap.style.position = 'relative'; }
          }
        });
      }
      document.addEventListener('click', (e) => {
        if (this.$bulkMenu && !this.$bulkMenu.contains(e.target) && e.target !== this.$bulkBtn) {
          this.$bulkMenu.classList.add('is-hidden');
        }
      });
      if (this.$bulkMenu) {
        this.$bulkMenu.querySelector('[data-act="archive"]').addEventListener('click', async ()=>{ await this.bulkArchive(); this.$bulkMenu.classList.add('is-hidden'); });
        this.$bulkMenu.querySelector('[data-act="mark-applied"]').addEventListener('click', async ()=>{ await this.bulkMark('applied',1); this.$bulkMenu.classList.add('is-hidden'); });
        this.$bulkMenu.querySelector('[data-act="mark-responded"]').addEventListener('click', async ()=>{ await this.bulkMark('responded',1); this.$bulkMenu.classList.add('is-hidden'); });
        this.$bulkMenu.querySelector('[data-act="tags"]').addEventListener('click', async ()=>{ await this.bulkTags(); this.$bulkMenu.classList.add('is-hidden'); });
        this.$bulkMenu.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{ await this.bulkDelete(); this.$bulkMenu.classList.add('is-hidden'); });
      }

      // Basic keyboard affordance for quick search -> Enter triggers refresh
      this.$search?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.refresh();
      });
    }

    updateToggleLabels(){
      if (this.$toggleEdit) this.$toggleEdit.textContent = this.editMode ? 'Edit Mode: On' : 'Edit Mode';
      if (this.$toggleView) this.$toggleView.textContent = this.viewMode === 'compact' ? 'Compact' : 'Detailed';
      // Also set a class on the wrapper to hide compact-only columns in CSS
      const wrap = document.getElementById('jobsList');
      if (wrap) {
        if (this.viewMode === 'compact') wrap.classList.add('jobs-compact'); else wrap.classList.remove('jobs-compact');
        if (this.editMode) wrap.classList.add('jobs-editing'); else wrap.classList.remove('jobs-editing');
      }
    }

    onShown = async () => {
      if (!this.isInitialized) await this.init();
    }

    notify(msg, type){
      if (window.toast) { window.toast(msg, type); return; }
      console.log(`[jobs] ${msg}`);
    }

    debounce(fn, ms) {
      clearTimeout(this._t);
      this._t = setTimeout(fn, ms);
    }

    buildQuery() {
      const q = {};
      const v = (el) => (el && el.value ? el.value.trim() : '');
      if (v(this.$search)) q.q = v(this.$search);
      if (v(this.$position)) q.position = v(this.$position);
      if (v(this.$company)) q.company = v(this.$company);
      if (v(this.$location)) q.location = v(this.$location);
      if (v(this.$state)) q.state = v(this.$state);
      if (v(this.$minSalary)) q.minSalary = v(this.$minSalary);
      if (v(this.$maxSalary)) q.maxSalary = v(this.$maxSalary);
      // Only include quick toggle filters when active; otherwise do not constrain results
      if (this.$applied && this.$applied.classList.contains('active')) q.applied = 'true';
      if (this.$responded && this.$responded.classList.contains('active')) q.responded = 'true';
      if (this.$hasLetters && this.$hasLetters.classList.contains('active')) q.hasLetters = 'true';
      if (this.filterTags && this.filterTags.size) q.anyOf = Array.from(this.filterTags).join(',');
      return q;
    }

    async loadTags() {
      try {
        const res = await fetch('/api/tags?includeUsage=true&limit=1000');
        if (!res.ok) return;
        const data = await res.json();
        (data.tags || []).forEach(t => this.tags.set(t.id, t));
      } catch (e) {
        console.warn('Tags load failed', e);
      }
    }

    async refresh() {
      if (this.loading) return;
      this.loading = true;
      this.selected.clear();
      try {
        const q = this.buildQuery();
        const params = new URLSearchParams(q).toString();
        const res = await fetch('/api/jobs' + (params ? ('?' + params) : ''));
        const data = await res.json();
        this.jobs = data.jobs || [];
        this.render();
      } catch (e) {
        console.error('Failed to load jobs', e);
        this.$wrap.innerHTML = '<div class="jobs-empty">Failed to load jobs.</div>';
      } finally {
        this.loading = false;
      }
    }

    clearFilters() {
      [this.$search, this.$position, this.$company, this.$location, this.$state,
       this.$minSalary, this.$maxSalary].forEach(el => { if (el) el.value = ''; });
      [this.$applied, this.$responded, this.$hasLetters].forEach(btn => { if (btn) btn.classList.remove('active'); });
      this.filterTags.clear();
      if (this.$filterTagsChips) this.$filterTagsChips.innerHTML = '';
      this.refresh();
    }

    async createJob() {
      // Create a draft job with minimal fields, then focus Position for inline edit
      try {
        const payload = { state: 'draft', applied: 0, responded: 0 };
        const res = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('create failed');
        const job = await res.json();
        this.jobs.unshift(job);
        this.render();
        // Focus first row position
        requestAnimationFrame(() => {
          const el = this.$wrap.querySelector(`tr[data-id="${job.id}"] [data-field="position"]`);
          if (el) { el.focus(); document.execCommand && document.execCommand('selectAll', false, null); }
        });
      } catch (e) {
        console.error(e);
        alert('Could not create job');
      }
    }

    async patch(jobId, patch) {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
        if (!res.ok) throw new Error('patch failed');
        const updated = await res.json();
        const idx = this.jobs.findIndex(j => j.id === jobId);
        if (idx >= 0) this.jobs[idx] = updated;
        return true;
      } catch (e) {
        console.error('Patch failed', e);
        return false;
      }
    }

    async del(jobId) {
      if (!confirm('Delete this job?')) return;
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('delete failed');
        this.jobs = this.jobs.filter(j => j.id !== jobId);
        this.render();
      } catch (e) {
        console.error(e);
        alert('Delete failed');
      }
    }

    updateBulkBar() {
      if (!this.$bulkBar || !this.$bulkCount) return;
      const count = this.selected.size;
      if (count > 0) {
        this.$bulkBar.classList.remove('is-hidden');
        this.$bulkCount.textContent = `${count} selected`;
      } else {
        this.$bulkBar.classList.add('is-hidden');
        if (this.$bulkMenu) this.$bulkMenu.classList.add('is-hidden');
      }
    }

    async bulkMark(field, value){
      const ids = Array.from(this.selected);
      await Promise.all(ids.map(id => this.patch(id, { [field]: value })));
      this.refresh();
    }

    async ensureTagByName(name){
      // find in cache else create
      const lower = name.toLowerCase();
      let tag = Array.from(this.tags.values()).find(t => (t.name||'').toLowerCase() === lower);
      if (!tag) {
        const res = await fetch('/api/tags', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
        if (res.ok){ tag = await res.json(); this.tags.set(tag.id, tag); }
      }
      return tag;
    }

    async bulkArchive(){
      const tag = await this.ensureTagByName('archived');
      if (!tag) return;
      const ids = Array.from(this.selected);
      // add archived tag to each job
      for (const id of ids){
        const job = this.jobs.find(j=>j.id===id);
        const current = new Set(job?.tagIds || []);
        current.add(tag.id);
        await this.patch(id, { tagIds: Array.from(current) });
      }
      this.refresh();
    }

    async bulkTags(){
      // Show tags selector popover for bulk add/remove
      const anchor = this.$bulkBtn; if (!anchor) return;
      document.querySelectorAll('.jobs-popover').forEach(p => p.remove());
      const pop = document.createElement('div');
      pop.className = 'jobs-popover';
      pop.innerHTML = `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <label><input type="radio" name="bulkTagMode" value="add" checked> Add</label>
          <label><input type="radio" name="bulkTagMode" value="remove"> Remove</label>
        </div>
        <div class="tag-input-wrapper" style="margin-bottom:6px;">
          <input class="tag-input" type="text" placeholder="Filter tags...">
        </div>
        <div class="tag-suggestions" style="position:static; max-height:260px; overflow:auto;">
          ${Array.from(this.tags.values()).map(t => `
            <label class="tag-suggestion" data-id="${t.id}">
              <input type="checkbox">
              <span class="dot dot-${t.color||'default'}"></span>
              <span>${t.name}</span>
            </label>
          `).join('')}
        </div>
        <div class="popover-actions">
          <button class="btn" data-act="apply">Apply</button>
        </div>`;
      document.body.appendChild(pop);
      const r = anchor.getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 340, r.left)) + 'px';
      pop.style.top = (r.bottom + 6) + 'px';
      const close = () => { pop.remove(); document.removeEventListener('click', onDoc); };
      const onDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
      setTimeout(()=>document.addEventListener('click', onDoc),0);
      pop.querySelector('.tag-input').addEventListener('input', (e)=>{
        const q = e.target.value.toLowerCase();
        pop.querySelectorAll('.tag-suggestion').forEach(l=>{
          const name = l.querySelector('span:nth-child(3)').textContent.toLowerCase();
          l.style.display = (!q || name.includes(q)) ? '' : 'none';
        });
      });
      pop.querySelector('[data-act="apply"]').addEventListener('click', async ()=>{
        const mode = pop.querySelector('input[name="bulkTagMode"]:checked').value;
        const selected = Array.from(pop.querySelectorAll('.tag-suggestion input:checked')).map(x => x.closest('label').getAttribute('data-id'));
        const ids = Array.from(this.selected);
        for (const id of ids){
          const job = this.jobs.find(j=>j.id===id);
          const set = new Set(job?.tagIds || []);
          if (mode === 'add') selected.forEach(t=>set.add(t)); else selected.forEach(t=>set.delete(t));
          await this.patch(id, { tagIds: Array.from(set) });
        }
        close();
        this.refresh();
      });
    }

    // Rendering helpers
    fmtDate(s) {
      if (!s) return '';
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return s;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    }

    fmtSalary(min, max, cur) {
      // Long form with separators and currency, for title/tooltip
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

    fmtSalaryShort(min, max) {
      // Short form for pill text, e.g. 100k–120k
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

    statePill(state) {
      const s = (state || 'draft').toLowerCase();
      const label = s.charAt(0).toUpperCase() + s.slice(1);
      return `<span class="state-pill state-${s}" title="${label}">${label}</span>`;
    }

    tagPill(tagId) {
      const t = this.tags.get(tagId);
      if (!t) return '';
      const colorCls = `tag-${t.color || 'default'}`;
      const name = t.name || 'tag';
      return `<span class="tag-pill ${colorCls}" title="#${t.slug || name}"><span class="tag-name">${name}</span></span>`;
    }

    filterTagChip(tagId) {
      const t = this.tags.get(tagId);
      if (!t) return '';
      const colorCls = `tag-${t.color || 'default'}`;
      const name = t.name || 'tag';
      return `<span class="tag-pill ${colorCls}" data-id="${t.id}"><span class="tag-name">${name}</span><button class="tag-remove" title="Remove">×</button></span>`;
    }

    render() {
      // Column definitions (toggle visibility by view mode)
      const allCols = [
        { key: 'select', label: '', cls: 'col-select' },
        { key: 'position', label: 'Position', cls: 'col-position' },
        { key: 'company', label: 'Company', cls: 'col-company' },
        { key: 'location', label: 'Location', cls: 'col-location' },
        { key: 'salary', label: 'Salary', cls: 'col-salary' },
        { key: 'state', label: 'State', cls: 'col-state' },
        { key: 'job_type', label: 'Job Type', cls: 'col-jobtype' },
        { key: 'applied', label: 'Applied', cls: 'col-flag' },
        { key: 'responded', label: 'Responded', cls: 'col-flag' },
        { key: 'letters', label: 'Letters', cls: 'col-letters' },
        { key: 'created_at', label: 'Date Added', cls: 'col-date' },
        { key: 'deadline', label: 'Deadline', cls: 'col-date' },
        { key: 'tags', label: 'Tags / Categories', cls: 'col-tags' }
      ];
      const compactKeys = new Set(['select','position','company','state','deadline']);
      const cols = this.viewMode === 'compact' ? allCols.filter(c => compactKeys.has(c.key)) : allCols;

      let html = '';
      html += '<div class="jobs-table-scroll">';
      html += '<table class="jobs-table">';
      html += '<thead><tr>';
      html += cols.map(c => `<th class="${c.cls}">${c.label || ''}</th>`).join('');
      html += '</tr></thead>';
      html += '<tbody>';
      for (const j of this.jobs) {
        html += `<tr data-id="${j.id}">`;
        // select
        html += `<td class="col-select"><input type="checkbox" class="job-select" data-id="${j.id}"></td>`;
        // position/company/location
        if (cols.find(c => c.key==='position')) html += this.cellTextOrEdit(j, 'position');
        if (cols.find(c => c.key==='company')) html += this.cellTextOrEdit(j, 'company');
        if (cols.find(c => c.key==='location')) html += this.cellTextOrEdit(j, 'location');
        // salary
        if (cols.find(c => c.key==='salary')) {
          const title = this.fmtSalary(j.salary_min, j.salary_max, j.salary_currency) || 'Set salary';
          const display = this.fmtSalaryShort(j.salary_min, j.salary_max);
          if (this.editMode) {
            html += `<td class="col-salary">
                       <span class="chip chip--sm chip-action salary-chip" title="${title}" data-id="${j.id}">
                         <span class="text">${display}</span>
                       </span>
                     </td>`;
          } else {
            html += `<td class="col-salary">
                       <span class="chip chip--sm" title="${title}">
                         <span class="text">${display}</span>
                       </span>
                     </td>`;
          }
        }
        // state pill + select
        if (cols.find(c => c.key==='state')) {
          if (this.editMode) {
            html += `<td class="col-state">
                       <select class="inline-select" data-field="state" title="Change state">
                         ${['draft','applied','interview','offer','rejected'].map(s => `<option value="${s}" ${j.state===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}
                       </select>
                     </td>`;
          } else {
            html += `<td class="col-state">${this.statePill(j.state)}</td>`;
          }
        }
        // job type
        if (cols.find(c => c.key==='job_type')) {
          if (this.editMode) {
            html += `<td class="col-jobtype">
                       <select class="inline-select" data-field="job_type" title="Job type">
                         ${['','Full-time','Part-time','Internship','Contract'].map(s => `<option value="${s}">${s||'—'}</option>`).join('')}
                       </select>
                     </td>`;
          } else {
            html += `<td class="col-jobtype">${j.job_type || ''}</td>`;
          }
        }
        // applied/responded
        if (cols.find(c => c.key==='applied')) {
          if (this.editMode) html += `<td class="col-flag"><input type="checkbox" data-field="applied" ${j.applied? 'checked':''}></td>`;
          else html += `<td class="col-flag">${j.applied? '<span class="flag-yes" title="Applied">✓</span>':'<span class="flag-no" title="Not applied">—</span>'}</td>`;
        }
        if (cols.find(c => c.key==='responded')) {
          if (this.editMode) html += `<td class="col-flag"><input type="checkbox" data-field="responded" ${j.responded? 'checked':''}></td>`;
          else html += `<td class="col-flag">${j.responded? '<span class="flag-yes" title="Responded">✓</span>':'<span class="flag-no" title="No response">—</span>'}</td>`;
        }
        // letters: count + add
        const letters = Array.isArray(j.letters) ? j.letters : [];
        if (cols.find(c => c.key==='letters')) {
          html += `<td class="col-letters">
                     <span class="muted" title="Letters count">${letters.length}</span>
                     ${this.editMode ? '<button class="btn-mini" data-action="upload-letter" title="Upload PDF letter">Letter</button>' : ''}
                   </td>`;
        }
        // created_at, deadline
        if (cols.find(c => c.key==='created_at')) html += `<td class="col-date">${this.fmtDate(j.created_at)}</td>`;
        if (cols.find(c => c.key==='deadline')) {
          if (this.editMode) html += `<td class="col-date"><input type="date" class="date-input" data-field="deadline" value="${this.fmtDate(j.deadline)}"></td>`;
          else html += `<td class="col-date">${this.fmtDate(j.deadline)}</td>`;
        }
        // tags
        if (cols.find(c => c.key==='tags')){
          const tagHtml = (j.tagIds||[]).map(tid => this.tagPill(tid)).join('');
          html += `<td class="col-tags">
                     <div class="tags-cell" style="width:100%">
                       <div class="tags-left">${tagHtml || '<span class="muted">No tags</span>'}</div>
                       <div class="icons-right">
                         <button class="plus-btn" data-action="add-tag" title="Add tag">+</button>
                       </div>
                     </div>
                   </td>`;
        }
        // actions
        if (cols.find(c => c.key==='actions')){
          html += `<td class="col-actions">
                     <div class="actions" style="display:flex;gap:6px;align-items:center;">
                       ${j.source_url ? `<a class="btn-icon" href="${j.source_url}" target="_blank" title="Open source URL"><i class="fas fa-link"></i></a>` : ''}
                       <button class="btn-icon" data-action="edit-tags" title="Edit tags"><i class="fas fa-tags"></i></button>
                       <button class="btn-icon" data-action="delete" title="Delete"><i class="fas fa-trash"></i></button>
                     </div>
                   </td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      if (!this.jobs.length) html = '<div class="jobs-empty">No jobs yet. Click “New Job”.</div>';
      this.$wrap.innerHTML = html;

      // Initialize per-row widgets state (set select value for job_type)
      for (const j of this.jobs) {
        const row = this.$wrap.querySelector(`tr[data-id="${j.id}"]`);
        const sel = row && row.querySelector('select[data-field="job_type"]');
        if (sel) sel.value = j.job_type || '';
      }

      this.bindTableEvents();
    }

    cellTextOrEdit(j, field) {
      const val = (j[field] ?? '').toString();
      if (this.editMode) {
        return `<td class="col-${field}"><div class="editable" contenteditable="true" spellcheck="false" data-field="${field}" title="Click to edit">${this.escape(val)}</div></td>`;
      }
      return `<td class="col-${field}" title="${this.escape(val)}">${this.escape(val)}</td>`;
    }

    escape(s) {
      return (s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    }

    bindTableEvents() {
      const table = this.$wrap;
      if (!table) return;

      // Row selection
      table.querySelectorAll('.job-select').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const id = e.target.getAttribute('data-id');
          if (e.target.checked) this.selected.add(id); else this.selected.delete(id);
          this.updateBulkBar();
        });
      });

      // Inline text edits (only if edit mode)
      table.querySelectorAll('.editable').forEach(el => {
        el.addEventListener('blur', async (e) => {
          const cell = e.currentTarget;
          const row = cell.closest('tr');
          const id = row.getAttribute('data-id');
          const field = cell.getAttribute('data-field');
          const value = cell.textContent.trim();
          await this.patch(id, { [field]: value || null });
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        });
      });

      // Salary chip editor
      table.querySelectorAll('.salary-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          const id = chip.getAttribute('data-id');
          const job = this.jobs.find(x => x.id === id);
          if (!job) return;
          this.openSalaryEditor(chip, job);
        });
      });

      // State / type selects, flags, dates
      table.querySelectorAll('select[data-field], input[data-field], input.date-input').forEach(el => {
        el.addEventListener('change', async (e) => {
          const row = e.target.closest('tr');
          const id = row.getAttribute('data-id');
          const field = e.target.getAttribute('data-field');
          let val;
          if (e.target.type === 'checkbox') val = e.target.checked ? 1 : 0;
          else val = e.target.value || null;
          const ok = await this.patch(id, { [field]: val });
          if (ok && field === 'state' && !this.editMode) {
            const stCell = row.querySelector('.col-state');
            if (stCell) stCell.innerHTML = this.statePill(val);
          }
        });
      });

      // Upload letter button
      table.querySelectorAll('button[data-action="upload-letter"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('tr');
          const id = row.getAttribute('data-id');
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'application/pdf';
          input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`/api/jobs/${id}/letters`, { method: 'POST', body: fd });
            if (res.ok) {
              // Refresh only this row
              const j = await (await fetch(`/api/jobs/${id}`)).json();
              const idx = this.jobs.findIndex(x => x.id === id);
              if (idx >= 0) this.jobs[idx] = j;
              const cell = row.querySelector('.col-letters .muted');
              if (cell) cell.textContent = (j.letters||[]).length;
            } else {
              alert('Upload failed');
            }
          };
          input.click();
        });
      });

      // Add tag (+)
      table.querySelectorAll('button[data-action="add-tag"]').forEach(btn => {
        btn.addEventListener('click', (e) => this.openTagsEditor(e.currentTarget));
      });

      // Row delete removed to prevent accidental deletions
    }

    openFilterTags() {
      // Popover similar to openTagsEditor but writes to this.filterTags
      const anchorBtn = this.$filterTagsBtn;
      if (!anchorBtn) return;
      document.querySelectorAll('.jobs-popover').forEach(p => p.remove());
      const pop = document.createElement('div');
      pop.className = 'jobs-popover';
      pop.innerHTML = `
        <div class="tag-input-wrapper" style="margin-bottom:6px;">
          <input class="tag-input" type="text" placeholder="Filter tags...">
        </div>
        <div class="tag-suggestions" style="position:static; max-height:260px; overflow:auto;">
          ${Array.from(this.tags.values()).map(t => `
            <label class="tag-suggestion" data-id="${t.id}" title="#${t.slug}">
              <input type="checkbox" ${this.filterTags.has(t.id)?'checked':''}>
              <span class="dot dot-${t.color||'default'}"></span>
              <span>${t.name}</span>
            </label>
          `).join('')}
        </div>
        <div class="popover-actions">
          <button class="btn" data-act="clear">Clear</button>
          <button class="btn" data-act="apply">Apply</button>
        </div>
      `;
      document.body.appendChild(pop);
      const rect = anchorBtn.getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 340, rect.left)) + 'px';
      pop.style.top = (rect.bottom + 6) + 'px';
      const close = () => { pop.remove(); document.removeEventListener('click', onDoc); };
      const onDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchorBtn) close(); };
      setTimeout(() => document.addEventListener('click', onDoc), 0);
      const input = pop.querySelector('.tag-input');
      input.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        pop.querySelectorAll('.tag-suggestion').forEach(l => {
          const name = l.querySelector('span:nth-child(3)').textContent.toLowerCase();
          l.style.display = (!q || name.includes(q)) ? '' : 'none';
        });
      });
      pop.querySelector('[data-act="clear"]').addEventListener('click', () => {
        this.filterTags.clear();
        this.$filterTagsChips.innerHTML = '';
        close();
        this.refresh();
      });
      pop.querySelector('[data-act="apply"]').addEventListener('click', () => {
        const selected = Array.from(pop.querySelectorAll('.tag-suggestion input:checked')).map(x => x.closest('label').getAttribute('data-id'));
        this.filterTags = new Set(selected);
        this.$filterTagsChips.innerHTML = selected.map(id => this.filterTagChip(id)).join('');
        // Bind removal
        this.$filterTagsChips.querySelectorAll('.tag-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const chip = e.currentTarget.closest('.tag-pill');
            const id = chip.getAttribute('data-id');
            this.filterTags.delete(id);
            chip.remove();
            this.refresh();
          });
        });
        close();
        this.refresh();
      });
    }

    toggleAdvancedFilters(){
      if (!this.$advancedRow) return;
      const isHidden = this.$advancedRow.style.display === 'none' || this.$advancedRow.classList.contains('is-hidden');
      if (isHidden) {
        this.$advancedRow.style.display = 'flex';
        if (this.$advancedBtn) this.$advancedBtn.textContent = 'Hide';
      } else {
        this.$advancedRow.style.display = 'none';
        if (this.$advancedBtn) this.$advancedBtn.textContent = 'Advanced';
      }
    }

    openSalaryEditor(anchorEl, job){
      // Close any existing popover
      document.querySelectorAll('.jobs-popover').forEach(p => p.remove());
      const pop = document.createElement('div');
      pop.className = 'jobs-popover';
      const currencies = ['USD','EUR','GBP','JPY','CAD','AUD'];
      pop.innerHTML = `
        <div class="row" style="margin-bottom:6px;">
          <input type="number" id="salMin" placeholder="Min" value="${job.salary_min ?? ''}">
          <input type="number" id="salMax" placeholder="Max" value="${job.salary_max ?? ''}">
          <select id="salCur">${currencies.map(c => `<option value="${c}" ${job.salary_currency===c?'selected':''}>${c}</option>`).join('')}</select>
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
      pop.style.top = (r.bottom + 8) + 'px';

      const close = () => { pop.remove(); document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
      const onDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) close(); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      setTimeout(() => { document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey); }, 0);

      pop.querySelector('[data-act="cancel"]').addEventListener('click', close);
      pop.querySelector('[data-act="clear"]').addEventListener('click', async () => {
        const ok = await this.patch(job.id, { salary_min: null, salary_max: null, salary_currency: job.salary_currency || 'USD' });
        if (ok) {
          job.salary_min = null; job.salary_max = null;
          const cell = anchorEl.closest('td');
          const title = 'Set salary';
          const display = this.fmtSalaryShort(null, null);
          cell.innerHTML = `<span class="chip chip--sm chip-action salary-chip" title="${title}" data-id="${job.id}"><span class=\"text\">${display}</span></span>`;
          this.bindTableEvents();
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
          salary_currency: curVal
        };
        const ok = await this.patch(job.id, payload);
        if (ok) {
          job.salary_min = payload.salary_min; job.salary_max = payload.salary_max; job.salary_currency = payload.salary_currency;
          const cell = anchorEl.closest('td');
          const title = this.fmtSalary(payload.salary_min, payload.salary_max, payload.salary_currency) || 'Set salary';
          const display = this.fmtSalaryShort(payload.salary_min, payload.salary_max);
          cell.innerHTML = `<span class="chip chip--sm chip-action salary-chip" title="${title}" data-id="${job.id}"><span class=\"text\">${display}</span></span>`;
          this.bindTableEvents();
        }
        close();
      });
    }

    openTagsEditor(anchorBtn) {
      const row = anchorBtn.closest('tr');
      const id = row.getAttribute('data-id');
      const job = this.jobs.find(j => j.id === id) || {};
      const current = new Set(job.tagIds || []);

      const pop = document.createElement('div');
      pop.className = 'note-tags-menu jobs-tags-popover';
      pop.innerHTML = `
        <div class="tag-input-wrapper" style="margin-bottom:6px;">
          <input class="tag-input" type="text" placeholder="Filter tags...">
        </div>
        <div class="tag-suggestions" style="position:static; max-height:240px;">
          ${Array.from(this.tags.values()).map(t => `
            <label class="tag-suggestion" data-id="${t.id}" title="#${t.slug}">
              <input type="checkbox" ${current.has(t.id)?'checked':''} ${this.editMode ? '' : (current.has(t.id)?'disabled':'')}>
              <span class="dot dot-${t.color||'default'}"></span>
              <span>${t.name}</span>
            </label>
          `).join('')}
        </div>
      `;
      document.body.appendChild(pop);
      const rect = anchorBtn.getBoundingClientRect();
      pop.style.position = 'fixed';
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 340, rect.left - 300)) + 'px';
      pop.style.top = (rect.bottom + 6) + 'px';
      pop.style.width = '320px';

      const close = () => { pop.remove(); document.removeEventListener('click', onDoc); };
      const onDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchorBtn) close(); };
      setTimeout(() => document.addEventListener('click', onDoc), 0);

      // Filter
      const input = pop.querySelector('.tag-input');
      input.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        pop.querySelectorAll('.tag-suggestion').forEach(l => {
          const name = l.querySelector('span:nth-child(3)').textContent.toLowerCase();
          l.style.display = (!q || name.includes(q)) ? '' : 'none';
        });
      });

      // Toggle
      pop.querySelectorAll('.tag-suggestion input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', async () => {
          let selected;
          if (this.editMode) {
            selected = Array.from(pop.querySelectorAll('.tag-suggestion input:checked')).map(x => x.closest('label').getAttribute('data-id'));
          } else {
            const added = Array.from(pop.querySelectorAll('.tag-suggestion input:checked')).map(x => x.closest('label').getAttribute('data-id'));
            const merged = new Set([...current, ...added]);
            selected = Array.from(merged);
          }
          const ok = await this.patch(id, { tagIds: selected });
          if (ok) {
            job.tagIds = selected;
            const pills = selected.map(tid => this.tagPill(tid)).join('') || '<span class="muted">No tags</span>';
            const left = row.querySelector('.tags-left') || row.querySelector('.tags-cell');
            if (left) left.innerHTML = pills;
          }
        });
      });
    }
  }

  // Expose singleton
  window.jobsView = new JobsView();
  // Ensure controls are wired even if jobs tab isn't activated yet
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize immediately so buttons respond; refresh when first shown
    window.jobsView.init().catch(()=>{});
    // Fallback delegation in case direct listeners missed
    document.addEventListener('click', (e) => {
      const t = e.target.closest('#jobsToggleEdit');
      const v = e.target.closest('#jobsToggleView');
      if (t) { window.jobsView.editMode = !window.jobsView.editMode; window.jobsView.updateToggleLabels(); window.jobsView.render(); }
      if (v) { window.jobsView.viewMode = window.jobsView.viewMode === 'compact' ? 'detailed' : 'compact'; window.jobsView.updateToggleLabels(); window.jobsView.render(); }
    });
  });
})();

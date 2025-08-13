// Tag System: inline pills under title + submenu popover for search/create/color
(function() {
  const COLORS = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];
  const cache = new Map();
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

  function debounce(fn, ms) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
  function normalizeInput(s) { return (s||'').trim().replace(/\s+/g,' '); }

  function tagPill(tag) {
    const pill = document.createElement('span');
    pill.className = `tag-pill tag-${tag.color||'default'}`;
    pill.setAttribute('data-tag-id', tag.id);
    pill.innerHTML = `<span class="tag-name">${tag.name}</span><button class="tag-remove" aria-label="Remove tag">×</button>`;
    return pill;
  }

  async function apiListTags(q) {
    const key = `q:${q||''}`;
    if (cache.has(key)) return cache.get(key);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('limit','50'); params.set('includeUsage','true');
    const res = await fetch(`/api/tags?${params.toString()}`);
    const data = await res.json();
    cache.set(key, data.tags||[]); return data.tags||[];
  }
  async function apiCreateTag(name, color='default') {
    const res = await fetch('/api/tags',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, color})});
    if(!res.ok) throw new Error('create tag failed'); cache.clear();
    return res.json();
  }
  async function apiUpdateTagColor(tagId, color){
    const res = await fetch(`/api/tags/${encodeURIComponent(tagId)}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ color }) });
    if(!res.ok) throw new Error('update tag failed'); cache.clear(); return true;
  }
  async function apiUpdateTagName(tagId, name){
    const res = await fetch(`/api/tags/${encodeURIComponent(tagId)}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    if(!res.ok) throw new Error('update tag failed'); cache.clear(); return res.json();
  }
  async function apiGetNoteTags(noteId){ const r=await fetch(`/api/notes/${noteId}/tags`); const d=await r.json(); return d.tags||[]; }
  async function apiReplaceNoteTags(noteId, tagIds){ const r=await fetch(`/api/notes/${noteId}/tags`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({tagIds})}); return r.ok; }

  const state = { noteId:null, tags:[], inlineEl:null, triggerEl:null, menuEl:null, selectedColor:'default', menuSelectedTagId:null };

  function renderInline() {
    if (!state.inlineEl) return;
    state.inlineEl.innerHTML = '';
    state.tags.forEach(t => state.inlineEl.appendChild(tagPill(t)));
  }

  async function addTag(tag) {
    if (!state.noteId) return;
    if (state.tags.find(t=>t.id===tag.id)) return;
    const next = [...state.tags, tag];
    const ok = await apiReplaceNoteTags(state.noteId, next.map(t=>t.id));
    if (ok) { state.tags = next.sort((a,b)=>collator.compare(a.name,b.name)); renderInline(); buildMenuContent(); }
  }
  async function removeTagId(tagId) {
    if (!state.noteId) return;
    const next = state.tags.filter(t=>t.id!==tagId);
    const ok = await apiReplaceNoteTags(state.noteId, next.map(t=>t.id));
    if (ok) { state.tags = next; renderInline(); buildMenuContent(); }
  }

  function wireInlineEvents() {
    if (!state.inlineEl) return;
    state.inlineEl.addEventListener('click', async (e)=>{
      if (e.target.classList.contains('tag-remove')) {
        const pill = e.target.closest('.tag-pill');
        const id = pill && pill.getAttribute('data-tag-id');
        if (id) await removeTagId(id);
      }
    });
  }

  function openMenu() {
    if (!state.menuEl) return;
    const menu = state.menuEl;
    menu.classList.remove('is-hidden');
    // Unified: fixed near trigger, width capped to viewport
    const rect = state.triggerEl ? state.triggerEl.getBoundingClientRect() : { right: window.innerWidth - 8, bottom: 60 };
    menu.style.position = 'fixed';
    const desired = Math.min(320, window.innerWidth - 16);
    const left = Math.min(window.innerWidth - 8 - desired, Math.max(8, rect.right - desired));
    menu.style.left = `${left}px`;
    menu.style.width = `${desired}px`;
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.right = 'auto';
    menu.style.bottom = '';
    menu.style.maxHeight = '';
    menu.style.backgroundColor = '#ffffff';
    menu.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
    menu.style.borderRadius = '8px';
    menu.style.maxHeight = '70vh';
    menu.style.overflowY = 'auto';
    buildMenuContent();
    // Adjust to keep inside viewport after content is rendered
    requestAnimationFrame(()=>{
      const mh = menu.offsetHeight;
      let top = parseInt(menu.style.top || '0', 10);
      const bottomSpace = window.innerHeight - (top + mh) - 8;
      if (bottomSpace < 0) {
        top = Math.max(8, window.innerHeight - mh - 8);
        menu.style.top = `${top}px`;
      }
    });
    document.addEventListener('click', onDocClick, true);
  }
  function closeMenu() {
    if (!state.menuEl) return;
    state.menuEl.classList.add('is-hidden');
    state.menuSelectedTagId = null; // hide name editing when menu closes
    // Clear inline positioning so CSS can reapply later cleanly
    state.menuEl.style.left = '';
    state.menuEl.style.right = '';
    state.menuEl.style.top = '';
    state.menuEl.style.bottom = '';
    state.menuEl.style.width = '';
    state.menuEl.style.position = '';
    state.menuEl.style.maxHeight = '';
    document.removeEventListener('click', onDocClick, true);
  }
  function onDocClick(e){
    if (!state.menuEl) return;
    if (state.menuEl.contains(e.target) || (state.triggerEl && state.triggerEl.contains(e.target))) return;
    closeMenu();
  }

  function buildMenuContent() {
    if (!state.menuEl) return;
    const chosen = new Set(state.tags.map(t=>t.id));
    state.menuEl.innerHTML = `
      <div class=\"tag-menu-section\">
        <div class=\"tag-menu-label\">Current tags</div>
        <div class=\"tag-bar tag-bar--compact\"></div>
      </div>
      <div class=\"tag-menu-section\">
        <div class=\"tag-input-wrapper\">
          <input type=\"text\" class=\"tag-search-input tag-input\" placeholder=\"Search or create…\" aria-label=\"Search tags\" />
          <div class=\"tag-suggestions\" role=\"listbox\" aria-label=\"Tag suggestions\"></div>
        </div>
      </div>
      <div class=\"tag-menu-section\">
        <div class=\"tag-menu-label\">Color</div>
        <div class=\"tag-color-grid\"></div>
      </div>
      ${state.menuSelectedTagId ? `
      <div class=\"tag-menu-section\">
        <div class=\"tag-menu-label\">Tag name</div>
        <input type=\"text\" class=\"tag-name-input tag-input\" />
      </div>` : ''}
    `;
    // If a tag is selected for editing, prefill the name input
    const selectedTag = state.tags.find(t=>t.id===state.menuSelectedTagId) || null;
    if (selectedTag) {
      const nameInput = state.menuEl.querySelector('.tag-name-input');
      if (nameInput) {
        nameInput.value = selectedTag.name || '';
        const commit = async () => {
          const newName = (nameInput.value||'').trim();
          if (!newName || newName === selectedTag.name) return;
          const updated = await apiUpdateTagName(selectedTag.id, newName).catch(()=>null);
          if (updated) {
            // Update local state tag details
            const idx = state.tags.findIndex(t=>t.id===selectedTag.id);
            if (idx>=0) state.tags[idx] = { ...state.tags[idx], name: updated.name, slug: updated.slug };
            renderInline();
            buildMenuContent();
          }
        };
        nameInput.addEventListener('keydown', (e)=>{ if (e.key==='Enter') { e.preventDefault(); commit(); } });
        nameInput.addEventListener('blur', ()=> commit());
        // Focus name input when selecting a tag for edit
        setTimeout(()=>{ nameInput.focus(); nameInput.select(); }, 0);
      }
    }

    const grid = state.menuEl.querySelector('.tag-color-grid');
    const activeColor = selectedTag ? (selectedTag.color||'default') : state.selectedColor;
    COLORS.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tag-color-swatch dot dot-${c}` + (activeColor===c?' selected':'');
      btn.title = c;
      btn.addEventListener('click', async ()=>{
        if (selectedTag) {
          // Update existing tag color globally
          const ok = await apiUpdateTagColor(selectedTag.id, c).catch(()=>false);
          if (ok) {
            // update local state
            const idx = state.tags.findIndex(t=>t.id===selectedTag.id);
            if (idx>=0) state.tags[idx].color = c;
            state.selectedColor = c;
            renderInline();
            buildMenuContent();
          }
        } else {
          state.selectedColor=c; buildMenuContent();
        }
      });
      grid.appendChild(btn);
    });
    const bar = state.menuEl.querySelector('.tag-bar');
    state.tags.forEach(t => {
      const pill = tagPill(t);
      if (state.menuSelectedTagId===t.id) pill.classList.add('selected');
      // click selects for editing; the × remains for removal
      pill.addEventListener('click', (e)=>{
        if (e.target.classList.contains('tag-remove')) return; // handled elsewhere
        // toggle selection
        state.menuSelectedTagId = (state.menuSelectedTagId===t.id) ? null : t.id;
        state.selectedColor = t.color || 'default';
        buildMenuContent();
      });
      bar.appendChild(pill);
    });
    bar.addEventListener('click', async (e)=>{
      if (e.target.classList.contains('tag-remove')) {
        const pill = e.target.closest('.tag-pill');
        const id = pill && pill.getAttribute('data-tag-id');
        if (id) await removeTagId(id);
      }
    });

    const input = state.menuEl.querySelector('.tag-search-input');
    const dropdown = state.menuEl.querySelector('.tag-suggestions');
    // Focusing the search input unselects current tag (hide name editor)
    input.addEventListener('focus', ()=>{ if (state.menuSelectedTagId){ state.menuSelectedTagId = null; buildMenuContent(); } });
    const search = debounce(async ()=>{
      const q = normalizeInput(input.value);
      const list = await apiListTags(q);
      dropdown.innerHTML = '';
      const filtered = list.filter(t=>!chosen.has(t.id));
      if (q && !filtered.find(t=>t.name.toLowerCase()===q.toLowerCase())){
        const create = document.createElement('div');
        create.className = 'tag-suggestion create';
        create.textContent = `Create "${q}"`;
        create.addEventListener('click', async ()=>{
          const tag = await apiCreateTag(q, state.selectedColor).catch(()=>null);
          if(tag) await addTag(tag);
          input.value=''; dropdown.innerHTML='';
        });
        dropdown.appendChild(create);
      }
      filtered.slice(0,10).forEach(t=>{
        const el = document.createElement('div');
        el.className = 'tag-suggestion';
        el.innerHTML = `<span class="dot dot-${t.color||'default'}"></span>${t.name} ${t.usage?`<span class="muted">(${t.usage})</span>`:''}`;
        el.addEventListener('click', async ()=>{ await addTag(t); input.value=''; dropdown.innerHTML=''; });
        dropdown.appendChild(el);
      });
    }, 180);
    input.addEventListener('input', ()=>search());
    input.addEventListener('keydown', async (e)=>{
      if (e.key==='Enter' || e.key==='Tab' || e.key===','){
        e.preventDefault(); const q=normalizeInput(input.value); if(!q) return;
        const existing = (await apiListTags(q)).find(t=>t.name.toLowerCase()===q.toLowerCase());
        const tag = existing || await apiCreateTag(q, state.selectedColor).catch(()=>null);
        if(tag) await addTag(tag); input.value=''; dropdown.innerHTML='';
      }
      if (e.key==='Escape'){ closeMenu(); }
    });
  }

  const tagSystem = {
    mountInline(containerId){ state.inlineEl = document.getElementById(containerId); wireInlineEvents(); },
    mountMenu(triggerId, menuId){ state.triggerEl=document.getElementById(triggerId); state.menuEl=document.getElementById(menuId); if(state.triggerEl){ state.triggerEl.addEventListener('click',(e)=>{ e.stopPropagation(); if(state.menuEl.classList.contains('is-hidden')) openMenu(); else closeMenu(); }); } },
    async loadForNote(noteId){ state.noteId = noteId; state.tags = await apiGetNoteTags(noteId); renderInline(); if (state.menuEl && !state.menuEl.classList.contains('is-hidden')) buildMenuContent(); }
  };

  window.tagSystem = tagSystem;
})();

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

  // Reposition logic extracted so we can call on resize/scroll
  function positionMenu() {
    if (!state.menuEl) return;
    const menu = state.menuEl;
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;

    if (isMobile) {
      // Mobile: prefer full-content height without internal scroll when possible.
      const rect = state.triggerEl ? state.triggerEl.getBoundingClientRect() : { right: window.innerWidth - 8, bottom: 60, top: 20 };
      const margin = 8;
      const minWidth = 280;
      const desiredMax = Math.min(520, window.innerWidth - margin * 2);
      const rightEdge = Math.min(rect.right, window.innerWidth - margin); // rightmost x of trigger
      // Keep right edge fixed to the trigger by using CSS 'right'
      const rightOffset = Math.max(margin, window.innerWidth - rightEdge);
      const maxRightAlignedWidth = Math.max(160, rightEdge - margin);
      let width = Math.min(desiredMax, Math.max(minWidth, maxRightAlignedWidth));
      if (maxRightAlignedWidth < minWidth) width = Math.max(160, maxRightAlignedWidth);
      let top = rect.bottom + margin;

      // Apply basic positioning and width first
      menu.style.setProperty('position', 'fixed', 'important');
      menu.style.setProperty('right', `${rightOffset}px`, 'important');
      menu.style.setProperty('left', 'auto', 'important');
      menu.style.setProperty('top', `${top}px`, 'important');
      menu.style.setProperty('width', `${width}px`, 'important');
      // Remove height limits so we can measure full content height
      menu.style.removeProperty('max-height');
      menu.style.removeProperty('overflow-y');
      menu.style.setProperty('height', 'auto', 'important');

      // Next frame, measure height and reposition so it fully fits without scroll if possible
      requestAnimationFrame(() => {
        // Measure full content height
        const fullHeight = menu.scrollHeight;
        const spaceBelow = window.innerHeight - (rect.bottom + margin) - margin;
        const spaceAbove = rect.top - margin;
        // Prefer placing below; if not enough space, place higher to fit
        if (fullHeight <= spaceBelow) {
          top = rect.bottom + margin;
        } else if (fullHeight <= window.innerHeight - margin * 2) {
          // Center vertically if needed so the entire menu fits in viewport
          top = Math.max(margin, Math.min(rect.bottom + margin, window.innerHeight - margin - fullHeight));
        } else {
          // Fallback: content simply can't fit; use viewport height with scroll
          top = margin;
          const maxH = window.innerHeight - margin * 2;
          menu.style.setProperty('max-height', `${maxH}px`, 'important');
          menu.style.setProperty('overflow-y', 'auto', 'important');
        }
        menu.style.setProperty('top', `${top}px`, 'important');
        // Show only after final position is set to avoid flicker/column phase
        menu.style.visibility = 'visible';
      });
      return;
    }

    // Desktop/tablet: use fixed positioning relative to viewport to avoid clipping
    const rect = state.triggerEl ? state.triggerEl.getBoundingClientRect() : { right: window.innerWidth - 8, bottom: 60 };
    const desired = Math.min(320, window.innerWidth - 16);
    const left = Math.min(window.innerWidth - 8 - desired, Math.max(8, rect.right - desired));

    // Use inline styles so it stays aligned on resize/scroll
    menu.style.setProperty('position', 'fixed');
    menu.style.setProperty('left', `${left}px`);
    menu.style.setProperty('width', `${desired}px`);
    menu.style.setProperty('top', `${rect.bottom + 8}px`);
    menu.style.setProperty('right', 'auto');
    menu.style.setProperty('bottom', '');
    menu.style.setProperty('max-height', '70vh');
    menu.style.setProperty('overflow-y', 'auto');

    // After layout, ensure it fits in viewport vertically, then show
    requestAnimationFrame(() => {
      const mh = menu.offsetHeight;
      const currentTop = parseInt(menu.style.top || '0', 10);
      const bottomSpace = window.innerHeight - (currentTop + mh) - 8;
      if (bottomSpace < 0) {
        const top = Math.max(8, window.innerHeight - mh - 8);
        menu.style.setProperty('top', `${top}px`);
      }
      menu.style.visibility = 'visible';
    });
  }

  let boundReposition = null;

  function openMenu() {
    if (!state.menuEl) return;
    const menu = state.menuEl;
    menu.classList.remove('is-hidden');
    // Avoid flicker while we measure and position
    menu.style.visibility = 'hidden';
    // Visual styling (non-positional)
    menu.style.backgroundColor = '#ffffff';
    menu.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
    menu.style.borderRadius = '8px';
    // Initial build then position and fit
    buildMenuContent();
    positionMenu();
    // Reposition on viewport changes to match modelDropdown behavior
    boundReposition = () => positionMenu();
    window.addEventListener('resize', boundReposition, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', boundReposition, { passive: true });
    }
    // Capture scrolls in ancestors/viewport
    window.addEventListener('scroll', boundReposition, { passive: true, capture: true });
    document.addEventListener('click', onDocClick, true);
  }
  function closeMenu() {
    if (!state.menuEl) return;
    state.menuEl.classList.add('is-hidden');
    state.menuSelectedTagId = null; // hide name editing when menu closes
    // Clear inline positioning so CSS can reapply later cleanly
    const s = state.menuEl.style;
    s.removeProperty('left');
    s.removeProperty('right');
    s.removeProperty('top');
    s.removeProperty('bottom');
    s.removeProperty('width');
    s.removeProperty('position');
    s.removeProperty('max-height');
    s.removeProperty('overflow-y');
    s.removeProperty('height');
    s.removeProperty('visibility');
    document.removeEventListener('click', onDocClick, true);
    // Remove reposition listeners
    if (boundReposition) {
      window.removeEventListener('resize', boundReposition, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', boundReposition, { passive: true });
      }
      window.removeEventListener('scroll', boundReposition, { passive: true, capture: true });
      boundReposition = null;
    }
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
    // Focusing the search input unselects current tag (hide name editor) and shows initial suggestions
    input.addEventListener('focus', ()=>{ 
      if (state.menuSelectedTagId){ 
        state.menuSelectedTagId = null; 
        buildMenuContent(); 
      }
      // Trigger search on focus to show initial suggestions
      search();
    });
    
    // Hide dropdown when input loses focus (with a small delay to allow clicks on suggestions)
    input.addEventListener('blur', ()=>{
      setTimeout(()=> {
        if (dropdown && !dropdown.matches(':hover')) {
          dropdown.innerHTML = '';
        }
      }, 150);
    });
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

    // After content rebuilds, ensure position stays correct
    if (!state.menuEl.classList.contains('is-hidden')) {
      requestAnimationFrame(() => positionMenu());
    }
  }

  const tagSystem = {
    mountInline(containerId){ state.inlineEl = document.getElementById(containerId); wireInlineEvents(); },
    mountMenu(triggerId, menuId){ state.triggerEl=document.getElementById(triggerId); state.menuEl=document.getElementById(menuId); if(state.triggerEl){ state.triggerEl.addEventListener('click',(e)=>{ e.stopPropagation(); if(state.menuEl.classList.contains('is-hidden')) openMenu(); else closeMenu(); }); } },
    async loadForNote(noteId){ state.noteId = noteId; state.tags = await apiGetNoteTags(noteId); renderInline(); if (state.menuEl && !state.menuEl.classList.contains('is-hidden')) buildMenuContent(); }
  };

  window.tagSystem = tagSystem;
})();

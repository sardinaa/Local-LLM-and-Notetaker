// Tag picker utilities migrated from legacy class
export function initModalTagPicker(containerId, existingCsv) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const existing = (existingCsv || '').split(',').map(s => s.trim()).filter(Boolean);
    // store as objects: { name, color, id }
    this._modalTags = Array.from(new Set(existing)).map(name => ({ name, color: 'default' }));
    this._modalTagColor = 'default';
    const COLORS = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];
    const cache = new Map();
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
    const debounce = (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
    const apiListTags = async (q) => {
        const key = `q:${q||''}`;
        if (cache.has(key)) return cache.get(key);
        const params = new URLSearchParams(); if (q) params.set('q', q); params.set('limit','50');
        const res = await fetch(`/api/tags?${params.toString()}`).catch(()=>null);
        if (!res || !res.ok) return [];
        const data = await res.json().catch(()=>({tags:[]}));
        const list = data.tags || [];
        cache.set(key, list); return list;
    };
    const apiCreateTag = async (name, color='default') => {
        try {
            const res = await fetch('/api/tags', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, color }) });
            if (!res.ok) throw new Error('create failed');
            const tag = await res.json();
            cache.clear();
            return tag;
        } catch { return null; }
    };
    container.innerHTML = `
        <div class="tag-menu-section">
            <div class="tag-menu-label">Current tags</div>
            <div class="tag-bar tag-bar--compact" id="modalTagBar"></div>
        </div>
        <div class="tag-menu-section">
            <div class="tag-input-wrapper">
                <input type="text" class="tag-search-input tag-input" id="modalTagInput" placeholder="Type and press Enter…" aria-label="Add tag" />
                <div class="tag-suggestions" id="modalTagSuggestions" role="listbox" aria-label="Tag suggestions"></div>
            </div>
        </div>
        <div class="tag-menu-section">
            <div class="tag-menu-label">Color</div>
            <div class="tag-color-grid" id="modalTagColorGrid"></div>
        </div>
    `;
    const input = container.querySelector('#modalTagInput');
    const bar = container.querySelector('#modalTagBar');
    const suggestions = container.querySelector('#modalTagSuggestions');
    const grid = container.querySelector('#modalTagColorGrid');
    const renderBar = () => {
        bar.innerHTML = '';
        this._modalTags.forEach(t => {
            const pill = document.createElement('span');
            pill.className = `tag-pill tag-${t.color||'default'}`;
            pill.innerHTML = `<span class=\"tag-name\">${t.name}</span><button class=\"tag-remove\" aria-label=\"Remove tag\">×</button>`;
            pill.querySelector('.tag-remove').addEventListener('click', () => {
                this._modalTags = this._modalTags.filter(x => x.name !== t.name);
                renderBar();
            });
            bar.appendChild(pill);
        });
    };
    renderBar();
    const addTag = (tagOrName) => {
        const clean = (typeof tagOrName === 'string' ? tagOrName : tagOrName?.name || '').trim();
        if (!clean) return;
        if (!this._modalTags.find(t => t.name.toLowerCase() === clean.toLowerCase())) {
            const color = typeof tagOrName === 'string' ? (this._modalTagColor || 'default') : (tagOrName.color || 'default');
            const id = typeof tagOrName === 'string' ? null : (tagOrName.id || null);
            this._modalTags.push({ name: clean, color, id });
            this._modalTags.sort((a,b)=> collator.compare(a.name,b.name));
            renderBar();
        }
    };
    // Render color swatches
    if (grid) {
        grid.innerHTML = '';
        COLORS.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `tag-color-swatch dot dot-${c}` + (this._modalTagColor===c?' selected':'');
            btn.title = c;
            btn.addEventListener('click', ()=>{
                this._modalTagColor = c;
                // update selection styles
                grid.querySelectorAll('.tag-color-swatch').forEach(el=>el.classList.remove('selected'));
                btn.classList.add('selected');
            });
            grid.appendChild(btn);
        });
    }
    // Suggestions search
    const search = debounce(async ()=>{
        const q = (input.value||'').trim();
        const list = await apiListTags(q);
        suggestions.innerHTML = '';
        const chosen = new Set(this._modalTags.map(t=>t.name.toLowerCase()));
        const filtered = list.filter(t=>!chosen.has((t.name||'').toLowerCase()));
        if (q && !filtered.find(t=>t.name.toLowerCase()===q.toLowerCase())){
            const create = document.createElement('div');
            create.className = 'tag-suggestion create';
            create.textContent = `Create "${q}"`;
            create.addEventListener('click', async ()=>{
                const tag = await apiCreateTag(q, this._modalTagColor || 'default');
                addTag(tag || q);
                input.value=''; suggestions.innerHTML='';
            });
            suggestions.appendChild(create);
        }
        filtered.slice(0,10).forEach(t=>{
            const el = document.createElement('div');
            el.className = 'tag-suggestion';
            el.innerHTML = `<span class="dot dot-${t.color||'default'}"></span>${t.name} ${t.usage?`<span class=\"muted\">(${t.usage})</span>`:''}`;
            el.addEventListener('click', ()=>{ addTag(t); input.value=''; suggestions.innerHTML=''; });
            suggestions.appendChild(el);
        });
    }, 180);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
            e.preventDefault();
            const val = (input.value||'').trim();
            if (val) addTag(val);
            input.value = '';
        }
        if (e.key === 'Escape') {
            input.blur();
        }
    });
    input.addEventListener('input', ()=> search());
    input.addEventListener('focus', ()=> search());
    input.addEventListener('blur', () => { setTimeout(()=>{ suggestions.innerHTML = ''; }, 120); });
}

export function getModalSelectedTagNames() {
    return Array.isArray(this._modalTags) ? this._modalTags.map(t=>t.name) : [];
}

class ComposeManager {
  constructor(editorInstance) {
    this.editor = editorInstance;
    this.busy = false;
    this.mdLibReady = false;
    this.initUI();
  }

  async appendToShoppingNote(newItems) {
    try {
      const treeRes = await fetch('/api/tree');
      const tree = treeRes.ok ? await treeRes.json() : [];
      const findNode = (nodes) => {
        for (const n of nodes||[]) {
          if ((n.type === 'note') && (String(n.name||'').toLowerCase() === 'shopping list')) return n;
          const c = findNode(n.children||[]); if (c) return c;
        }
        return null;
      };
      let node = findNode(tree);
      if (!node) {
        const id = 'shopping-' + Date.now();
        const createRes = await fetch('/api/nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: 'Shopping List', type: 'note', parentId: null }) });
        if (!createRes.ok) throw new Error('Failed to create Shopping List node');
        node = { id, name: 'Shopping List', type: 'note' };
      }
      // Load existing content (support stringified content)
      let content = { blocks: [] };
      const noteRes = await fetch(`/api/notes/${encodeURIComponent(node.id)}`);
      if (noteRes.ok) {
        const note = await noteRes.json();
        let c = note && note.content;
        if (typeof c === 'string') {
          try { c = JSON.parse(c); } catch {}
        }
        if (c && typeof c === 'object' && Array.isArray(c.blocks)) content = c;
      }
      if (!content || !Array.isArray(content.blocks)) content = { blocks: [] };

      // Build a dedup set across all existing checklist items
      const toChecklistItem = (s) => ({ text: s, checked: false });
      const dedupSet = new Set();
      let lastChecklist = null;
      for (const b of content.blocks) {
        if (b && b.type === 'checklist' && b.data && Array.isArray(b.data.items)) {
          lastChecklist = b; // keep track of last checklist to append to
          for (const it of b.data.items) {
            if (typeof it === 'object') dedupSet.add(String(it.text||''));
            else dedupSet.add(String(it||''));
          }
        }
      }
      if (!lastChecklist) {
        lastChecklist = { type: 'checklist', data: { items: [] } };
        content.blocks.push(lastChecklist);
      }
      for (const it of newItems) {
        const s = String(it || '');
        if (!dedupSet.has(s)) { lastChecklist.data.items.push(toChecklistItem(s)); dedupSet.add(s); }
      }
      const saveRes = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: node.id, title: node.name, content }) });
      if (!saveRes.ok) throw new Error('Failed to save Shopping List note');
      // Refresh notes tree so the node appears immediately
      await this.refreshNotesTree();
      return { noteId: node.id };
    } catch (e) {
      console.warn('Failed to append to shopping note:', e);
      return null;
    }
  }

  async refreshNotesTree() {
    try {
      const res = await fetch('/api/tree');
      if (!res.ok) return;
      const treeData = await res.json();
      const filterNotesAndFolders = (nodes) => {
        const filtered = [];
        for (const node of nodes || []) {
          if (node.type === 'note' || node.type === 'folder') {
            const copy = { ...node };
            if (node.children && node.children.length) copy.children = filterNotesAndFolders(node.children);
            filtered.push(copy);
          }
        }
        return filtered;
      };
      const notesData = Array.isArray(treeData) ? filterNotesAndFolders(treeData) : [];
      if (window.noteTreeView && typeof window.noteTreeView.load === 'function') {
        window.noteTreeView.load(notesData);
      }
    } catch (e) {
      console.warn('Failed to refresh notes tree:', e);
    }
  }

  openNoteById(noteId) {
    try {
      const tv = window.noteTreeView;
      if (!tv || !tv.nodes || typeof tv.findNodeById !== 'function') return;
      const node = tv.findNodeById(tv.nodes, noteId);
      if (!node) return;
      tv.selectNode(noteId);
      const evt = new CustomEvent('nodeSelected', { detail: { nodeId: noteId, nodeType: node.type, nodeName: node.name } });
      document.getElementById('note-tree')?.dispatchEvent(evt);
      if (window.tabManager && typeof window.tabManager.showNotesTab === 'function') window.tabManager.showNotesTab();
    } catch {}
  }
  initUI() {
    try {
      const actionsHost = document.querySelector('.note-actions');
      if (!actionsHost || document.getElementById('composeBtn')) return;

      const btn = document.createElement('div');
      btn.id = 'composeBtn';
      btn.className = 'compose-button';
      btn.title = 'Assistant actions';
      btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>';

      const menu = document.createElement('div');
      menu.id = 'composeMenu';
      menu.className = 'compose-menu is-hidden';
      menu.innerHTML = `
        <button data-action="generate"><i class="fas fa-plus"></i> Generate (Prompt)</button>
        <button data-action="improve"><i class="fas fa-feather"></i> Improve Writing</button>
        <button data-action="simplify"><i class="fas fa-compress"></i> Simplify</button>
        <button data-action="expand"><i class="fas fa-expand"></i> Expand</button>
        <button data-action="format"><i class="fas fa-align-left"></i> Format as Markdown</button>
        <button data-action="translate"><i class="fas fa-language"></i> Translate…</button>
        <button data-action="highlight"><i class="fas fa-highlighter"></i> Highlight Keywords</button>
        <hr class="compose-sep" />
        <button data-action="shopping"><i class="fas fa-cart-plus"></i> Add to the shopping list</button>
      `;

        const wrapper = document.createElement('div');
        wrapper.className = 'compose-wrapper';
        wrapper.appendChild(btn);
        // Shopping action moved into menu for a cleaner UI
        wrapper.appendChild(menu);
        actionsHost.appendChild(wrapper);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.busy) return; // prevent opening while processing
        menu.classList.toggle('is-hidden');
      });
      document.addEventListener('click', () => menu.classList.add('is-hidden'));
      menu.addEventListener('click', (e) => e.stopPropagation());

      menu.querySelectorAll('button[data-action]').forEach(b => {
        b.addEventListener('click', async () => {
          const action = b.getAttribute('data-action');
          menu.classList.add('is-hidden');
          if (action === 'shopping') {
            await this.addToShoppingList();
          } else {
            await this.handleAction(action);
          }
        });
      });
    } catch (err) {
      console.warn('ComposeManager UI init failed:', err);
    }
  }

  getSelectionText() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    const redactor = document.querySelector('.codex-editor__redactor');
    if (!redactor || !redactor.contains(sel.anchorNode)) return '';
    return sel.toString() || '';
  }

  async addToShoppingList() {
    try {
      if (!this.editor || !this.editor.editor) return;
      const data = await this.editor.getData();
      if (!data || !Array.isArray(data.blocks)) return;
      const items = [];
      let inIngredients = false;
      for (const b of data.blocks) {
        const t = (b.type || '').toLowerCase();
        const d = b.data || {};
        if (t === 'header') {
          const text = (d.text || '').toLowerCase();
          inIngredients = /ingredients/.test(text);
          continue;
        }
        if (!inIngredients) continue;
        if (t === 'list') {
          (d.items || []).forEach(it => {
            const s = this.toPlainText(it).replace(/^•\s*/, '').trim();
            if (s) items.push(s);
          });
        } else if (t === 'table' && Array.isArray(d.content)) {
          const rows = d.content.slice();
          const header = rows.length ? rows[0].map(x => String(x||'').toLowerCase()) : [];
          const hasHead = d.withHeadings && header.length;
          const startIdx = hasHead ? 1 : 0;
          for (let i = startIdx; i < rows.length; i++) {
            const r = rows[i];
            const name = (r[0] || '').toString().trim();
            const qty = (r[1] || '').toString().trim();
            const unit = (r[2] || '').toString().trim();
            const note = (r[3] || '').toString().trim();
            const line = [name, qty && `x${qty}`, unit, note].filter(Boolean).join(' ');
            if (name) items.push(line);
          }
        } else if (t !== 'paragraph' && t !== 'quote') {
          // stop when reaching another major section
          break;
        }
      }
      if (!items.length) { alert('No ingredients found to add.'); return; }

      // Persist to Shopping List note and show polished dialog
      const result = await this.appendToShoppingNote(items);
      const pretty = `<ul style="margin:0;padding-left:18px;">${items.map(i=>`<li>${this.escape(i)}</li>`).join('')}</ul>`;
      if (window.modalManager && typeof window.modalManager.showDialog === 'function') {
        window.modalManager.showDialog('Added to Shopping List', `
          <div style="font-size:14px;color:#555;margin-bottom:8px;">These items were added:</div>
          ${pretty}
        `, [
          { label: 'Copy', action: () => { navigator.clipboard.writeText(items.join('\n')); } },
          { label: 'Open Shopping List', primary: true, action: () => { if (result && result.noteId) this.openNoteById(result.noteId); } }
        ]);
      } else {
        navigator.clipboard && navigator.clipboard.writeText(items.join('\n'));
        alert('Added to shopping list.');
      }
      try { document.dispatchEvent(new CustomEvent('shopping:add', { detail: { items } })); } catch {}
    } catch (e) {
      console.warn('Shopping list extraction failed:', e);
      alert('Could not add to shopping list.');
    }
  }

  toPlainText(val) {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) return val.map(v => this.toPlainText(v)).join(' ');
    if (typeof val === 'object') {
      // Common shapes: { text }, { content }, rich segments
      if (typeof val.text === 'string') return val.text;
      if (Array.isArray(val.content)) return val.content.map(v => this.toPlainText(v)).join(' ');
      if (typeof val.content === 'string') return val.content;
      // Fallback: join object values' primitive strings
      try {
        return Object.values(val).map(v => this.toPlainText(v)).join(' ');
      } catch { return ''; }
    }
    return '';
  }

  replaceSelectionWith(text) {
    try {
      // Prefer insertText to keep EditorJS content clean
      document.execCommand('insertText', false, text);
    } catch {
      document.execCommand('insertHTML', false, this.escape(text));
    }
  }

  escape(s) {
    return (s || '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  }

  getFullNoteTextFallback() {
    // Fallback plain-text extraction from rendered blocks
    const redactor = document.querySelector('.codex-editor__redactor');
    if (!redactor) return '';
    return Array.from(redactor.querySelectorAll('[contenteditable="true"], .ce-paragraph, h1,h2,h3,h4,h5,li,pre,blockquote'))
      .map(el => el.innerText || el.textContent || '')
      .join('\n')
      .trim();
  }

  async handleAction(action) {
    try {
      if (this.busy) return;
      this.setBusy(true);
      let text = '';
      let payload = { action, note_id: (this.editor && this.editor.currentNoteId) || undefined };

      if (action === 'generate') {
        const instr = prompt('Describe what to generate');
        if (!instr) return;
        payload.prompt = instr;
        payload.prefer_editorjs = true;
      } else if (action === 'translate') {
        const lang = prompt('Translate to language (e.g., en, es, fr)');
        if (!lang) return;
        payload.language = lang;
        text = this.getSelectionText() || this.getFullNoteTextFallback();
        if (!text) return alert('No text to translate. Select text or write something first.');
        payload.text = text;
      } else if (action === 'highlight') {
        text = this.getSelectionText() || this.getFullNoteTextFallback();
        if (!text) return alert('No text to analyze.');
        payload.text = text;
      } else {
        // rewrite/format actions operate on selection or fallback to entire note
        text = this.getSelectionText() || this.getFullNoteTextFallback();
        if (!text) return alert('No text to process.');
        payload.text = text;
        if (action === 'format' || action === 'template') {
          payload.prefer_editorjs = true;
        }
      }

      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok) {
        console.warn('Compose error:', json);
        if (json && json.error === 'busy') {
          alert('Assistant is busy. Please try again in a moment.');
        } else {
          alert('Assistant action failed.');
        }
        return;
      }

      if (action === 'highlight' && json.highlights) {
        this.applyHighlights(json.highlights);
        return;
      }

      // If server returned direct EditorJS blocks, insert them
      if (Array.isArray(json.blocks) && json.blocks.length) {
        const normalizedBlocks = this.normalizeBlocks(json.blocks);
        await this.insertBlocks(normalizedBlocks);
        return;
      }

      const result = json.result_text || '';
      if (!result) return;

      // If selection exists, replace it; else insert at cursor end
      if (this.getSelectionText()) {
        this.replaceSelectionWith(result);
      } else {
        // Try to insert parsed Markdown as EditorJS blocks (prefer external full parser)
        await this.ensureMdParserLoaded();
        const blocks = await this.parseMarkdownToBlocks(result);
        if (blocks && blocks.length) {
          try {
            const count = this.editor.editor.blocks.getBlocksCount();
            const startIdx = Math.max(0, this.editor.editor.blocks.getCurrentBlockIndex());
            let insertAt = isFinite(startIdx) && startIdx >= 0 ? startIdx + 1 : count;
            for (const b of blocks) {
              const type = b.type;
              const data = b.data || {};
              this.editor.editor.blocks.insert(type, data, {}, insertAt, true);
              insertAt += 1;
            }
          } catch (e) {
            // Fallback to plain text paragraph insert
            try {
              const idx = this.editor.editor.blocks.getBlocksCount();
              this.editor.editor.blocks.insert('paragraph', { text: this.escape(result) }, {}, idx, true);
            } catch {
              this.replaceSelectionWith('\n' + result + '\n');
            }
          }
        } else {
          // Fallback: append as paragraph
          try {
            const idx = this.editor.editor.blocks.getBlocksCount();
            this.editor.editor.blocks.insert('paragraph', { text: this.escape(result) }, {}, idx, true);
          } catch {
            this.replaceSelectionWith('\n' + result + '\n');
          }
        }
      }
    } catch (err) {
      console.error('Compose action error:', err);
      alert('Assistant action failed.');
    } finally {
      this.setBusy(false);
    }
  }

  applyHighlights(data) {
    try {
      const redactor = document.querySelector('.codex-editor__redactor');
      if (!redactor) return;

      // 1) Clear prior highlights by unwrapping mark tags
      redactor.querySelectorAll('mark.ai-highlight').forEach(m => {
        const parent = m.parentNode;
        if (!parent) return;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
      });

      // 2) Prepare keywords and regex
      let keywords = (data.keywords || []).filter(Boolean);
      if (!keywords.length) return;
      // Sort by length desc to prefer longer matches first
      keywords.sort((a, b) => (b.length || 0) - (a.length || 0));
      const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

      // 3) Use a TreeWalker to wrap matches only in text nodes
      const forbiddenTags = new Set(['CODE','PRE','SCRIPT','STYLE']);
      const walker = document.createTreeWalker(redactor, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node || !node.parentElement) return NodeFilter.FILTER_REJECT;
          // Skip within forbidden ancestors or inside existing links/marks
          let el = node.parentElement;
          while (el && el !== redactor) {
            const tag = el.tagName;
            if (forbiddenTags.has(tag)) return NodeFilter.FILTER_REJECT;
            if (tag === 'A' || tag === 'MARK') return NodeFilter.FILTER_REJECT;
            // Skip EditorJS tool wrappers that shouldn't be altered
            if (el.classList && (el.classList.contains('ce-code') || el.classList.contains('ce-delimiter'))) {
              return NodeFilter.FILTER_REJECT;
            }
            el = el.parentElement;
          }
          // Only consider nodes inside common text blocks
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          // Permit paragraphs, headers, list items, quotes
          const ok = p.closest('.ce-paragraph, .ce-header, li, blockquote');
          return ok ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });

      const toWrap = [];
      while (walker.nextNode()) {
        const nd = walker.currentNode;
        if (!nd || !nd.nodeValue) continue;
        if (regex.test(nd.nodeValue)) toWrap.push(nd);
        regex.lastIndex = 0; // reset for next test
      }

      for (const textNode of toWrap) {
        const frag = document.createDocumentFragment();
        let remaining = textNode.nodeValue;
        let m;
        regex.lastIndex = 0;
        let lastIndex = 0;
        while ((m = regex.exec(remaining)) !== null) {
          const before = remaining.slice(lastIndex, m.index);
          if (before) frag.appendChild(document.createTextNode(before));
          const mark = document.createElement('mark');
          mark.className = 'ai-highlight';
          mark.textContent = m[0];
          frag.appendChild(mark);
          lastIndex = m.index + m[0].length;
        }
        const tail = remaining.slice(lastIndex);
        if (tail) frag.appendChild(document.createTextNode(tail));
        textNode.parentNode.replaceChild(frag, textNode);
        regex.lastIndex = 0;
      }
    } catch (e) {
      console.warn('Failed to apply highlights:', e);
    }
  }

  // ---------
  // Markdown support (external full parser preferred)
  // ---------
  async ensureMdParserLoaded() {
    if (this.mdLibReady) return true;
    // Already present?
    if (this._hasExternalMdParser()) {
      this.mdLibReady = true;
      return true;
    }
    // Attempt to load from common CDNs (best-effort; browser will fetch)
    const candidates = [
      'https://cdn.jsdelivr.net/npm/editorjs-markdown-parser@latest/dist/umd/index.min.js',
      'https://unpkg.com/editorjs-markdown-parser@latest/dist/umd/index.min.js'
    ];
    for (const src of candidates) {
      try {
        // Avoid adding duplicates
        if ([...document.scripts].some(s => s.src === src)) continue;
        await this._loadScript(src, 6000);
        if (this._hasExternalMdParser()) { this.mdLibReady = true; return true; }
      } catch {/* try next */}
    }
    // Could not load; fallback will be used
    this.mdLibReady = false;
    return false;
  }

  _loadScript(src, timeoutMs=6000) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; s.remove(); reject(new Error('timeout')); } }, timeoutMs);
      s.onload = () => { if (!done) { done = true; clearTimeout(to); resolve(); } };
      s.onerror = () => { if (!done) { done = true; clearTimeout(to); reject(new Error('load_error')); } };
      document.head.appendChild(s);
    });
  }

  _hasExternalMdParser() {
    // Try to detect common globals exposed by editorjs-markdown-parser UMD builds
    const g = window;
    return !!(g.editorjsMarkdownParser || g.EdjsMarkdownParser || g.MarkdownToEditorJS || g.edjsParser);
  }

  async parseMarkdownToBlocks(md) {
    // Try external parser first (various shapes) then fallback to minimal
    const g = window;
    try {
      if (g.editorjsMarkdownParser) {
        // Try function style
        if (typeof g.editorjsMarkdownParser.parse === 'function') {
          const out = g.editorjsMarkdownParser.parse(md);
          if (out && out.blocks) return out.blocks;
        }
        // Try class MdParser style
        if (typeof g.editorjsMarkdownParser.MdParser === 'function') {
          const p = new g.editorjsMarkdownParser.MdParser();
          const out = p.parse(md);
          if (out && out.blocks) return out.blocks;
        }
        // Try default export class
        if (g.editorjsMarkdownParser.default && typeof g.editorjsMarkdownParser.default === 'function') {
          const p = new g.editorjsMarkdownParser.default();
          const out = p.parse(md);
          if (out && out.blocks) return out.blocks;
        }
      }
      if (g.EdjsMarkdownParser && typeof g.EdjsMarkdownParser.parse === 'function') {
        const out = g.EdjsMarkdownParser.parse(md);
        if (out && out.blocks) return out.blocks;
      }
      if (g.MarkdownToEditorJS && typeof g.MarkdownToEditorJS.parse === 'function') {
        const out = g.MarkdownToEditorJS.parse(md);
        if (out && out.blocks) return out.blocks;
      }
      if (g.edjsParser && typeof g.edjsParser.parse === 'function') {
        const out = g.edjsParser.parse(md);
        if (out && out.blocks) return out.blocks;
      }
    } catch (e) { console.warn('External MD parser failed, using fallback:', e); }

    // Fallback to minimal parser
    if (typeof g.mdToEditorJS === 'function') {
      try {
        const out = g.mdToEditorJS(md);
        return (out && out.blocks) ? out.blocks : [];
      } catch {}
    }
    // Last resort: single paragraph
    return [{ type: 'paragraph', data: { text: this.escape(md) } }];
  }

  // Normalize blocks (support variations) and fill image placeholders
  normalizeBlocks(blocks) {
    const ph = this.placeholderImage();
    const out = [];
    for (const b of (blocks || [])) {
      let t = (b.type || '').toLowerCase();
      const d = b.data || {};
      // If a non-columns block mistakenly contains cols/columns, split into two blocks
      const hasCols = Array.isArray(d.cols) || Array.isArray(d.columns);
      if (t !== 'columns' && hasCols) {
        // push original sans cols
        const dCopy = { ...d };
        delete dCopy.cols; delete dCopy.columns;
        out.push({ type: t, data: dCopy });
        // prepare columns block
        const rawCols = Array.isArray(d.cols) ? d.cols : (Array.isArray(d.columns) ? d.columns : []);
        const cols = rawCols.map(c => (Array.isArray(c) ? { blocks: c } : (c && Array.isArray(c.blocks) ? { blocks: c.blocks } : { blocks: [] })));
        out.push({ type: 'columns', data: { cols } });
        continue;
      }
      if (t === 'image') {
        if (!d.url) d.url = ph;
      } else if (t === 'columns') {
        const rawCols = Array.isArray(d.cols) ? d.cols : (Array.isArray(d.columns) ? d.columns : []);
        const cols = rawCols.map(c => (Array.isArray(c) ? { blocks: c } : (c && Array.isArray(c.blocks) ? { blocks: c.blocks } : { blocks: [] })));
        d.cols = cols; delete d.columns;
      } else if (t === 'table') {
        if (!Array.isArray(d.content)) d.content = [];
      }
      out.push({ type: t, data: d });
    }
    return out;
  }

  async insertBlocks(blocks) {
    const ed = this.editor && this.editor.editor;
    if (!ed) return;
    let insertAt = Math.max(0, ed.blocks.getCurrentBlockIndex());
    insertAt = isFinite(insertAt) && insertAt >= 0 ? insertAt + 1 : ed.blocks.getBlocksCount();
    for (const b of blocks) {
      try { ed.blocks.insert(b.type, b.data || {}, {}, insertAt, true); insertAt += 1; } catch {}
    }
  }

  placeholderImage() {
    // Lightweight SVG placeholder (data URL)
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='240'>
      <rect width='100%' height='100%' fill='#f0f0f0'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#999' font-size='18'>Image</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  setBusy(on) {
    try {
      this.busy = !!on;
      const btn = document.getElementById('composeBtn');
      const menu = document.getElementById('composeMenu');
      if (btn) {
        btn.classList.toggle('loading', this.busy);
        btn.innerHTML = this.busy ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-wand-magic-sparkles"></i>';
      }
      if (menu) {
        // Disable buttons visually during processing
        menu.querySelectorAll('button').forEach(b => b.disabled = this.busy);
      }
      document.body.style.cursor = this.busy ? 'progress' : '';
    } catch {}
  }
}

// Bootstrap when editor is ready
document.addEventListener('DOMContentLoaded', () => {
  const wait = setInterval(() => {
    if (window.editorInstance && window.editorInstance.isReady) {
      clearInterval(wait);
      window.composeManager = new ComposeManager(window.editorInstance);
    }
  }, 150);
});

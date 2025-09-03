/* Lightweight highlight plugin for the vendored pdf.js viewer.
 * Listens for postMessage({ type: 'editorHighlight', prompt, highlights })
 * and draws translucent rectangles over matches across all pages.
 */
(function () {
  const STOPWORDS = new Set(['the','and','for','with','that','this','from','into','your','about','what','when','where','which','then','than','also','have','has','are','was','were','will','shall','should','would','could','can','may','might','a','an','in','on','to','of','by','at','as','it','or','be','is']);

  const state = {
    lastPayload: null,
    cache: new Map(), // pageIndex -> { items, fullText, fullLower, charToItem, itemStartIdx }
    enabled: true,
    toggleBtn: null,
    markerActive: false,
    markerBtn: null,
    highlights: new Map(), // id -> meta
    pendingNav: null,
    aiOverlayEnabled: false, // disable AI multi-mark overlay by default
    // When user selects text (guided), constrain AI highlights strictly within selection rects
    selectionRegion: null,   // { pageIndex, xMin, xMax, yMin, yMax, margin, marginX, rects: Array<{x,y,width,height}> }
  };

  function dedupeTerms(arr) {
    const seen = new Set();
    const out = [];
    for (const t of arr || []) {
      const k = String(t || '').trim().toLowerCase();
      if (k && !seen.has(k)) { seen.add(k); out.push(k); }
    }
    return out;
  }

  function splitPromptToTerms(prompt) {
    if (!prompt) return [];
    const terms = [];
    const p = String(prompt);
    const regex = /\"([^\"]+)\"|'([^']+)'|([^,]+)(?:,|$)/g;
    let m;
    while ((m = regex.exec(p)) !== null) {
      const t = (m[1] || m[2] || m[3] || '').trim();
      if (t) terms.push(t);
    }
    return dedupeTerms(terms);
  }

  function buildTermsFromHighlights(highlights) {
    if (!Array.isArray(highlights)) return [];
    const terms = [];
    for (const h of highlights) {
      const txt = (h && h.text) ? String(h.text).trim() : '';
      if (!txt) continue;
      terms.push(txt);
      const words = txt.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9'-]{2,}/g) || [];
      for (const w of words) {
        const lw = w.toLowerCase();
        if (lw.length >= 4 && !STOPWORDS.has(lw)) terms.push(lw);
      }
    }
    return dedupeTerms(terms);
  }

  function ensureStyle() {
    if (document.getElementById('ai-highlight-style')) return;
    const style = document.createElement('style');
    style.id = 'ai-highlight-style';
    style.textContent = `
      .ai-highlight-layer { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; z-index: 50; }
      .ai-mark { position:absolute; border-radius:2px; pointer-events:none; box-shadow: 0 0 0 1px rgba(0,0,0,0.15) inset; }
      .ai-role-user { background: rgba(255, 230, 0, 0.45); outline: 2px solid rgba(255, 200, 0, 0.9); }
      .ai-role-ai { background: rgba(0, 140, 255, 0.28); outline: 1px solid rgba(0, 120, 255, 0.85); }
      .ai-corner { position:absolute; right:0; top:0; transform: translate(40%, -40%); font-size: 12px; line-height: 1; padding: 0; }
      .ai-role-user .ai-corner { color: #9aa0a6; background: transparent; }
      .ai-role-ai .ai-corner { color: #9aa0a6; background: transparent; }
      @keyframes ai-pulse { 0% { outline-width: 4px; } 100% { outline-width: 2px; } }
      .ai-pulse { animation: ai-pulse 900ms ease-out 2; }
      body.ai-marker-mode, #viewer.ai-marker-mode, .page.ai-marker-mode { cursor: text !important; }
    `;
    document.head.appendChild(style);
  }

  function clearHighlights() {
    document.querySelectorAll('.ai-highlight-layer').forEach(el => el.remove());
    if (state.highlights && state.highlights.size) {
      const removed = Array.from(state.highlights.keys());
      state.highlights.clear();
      try { parent.postMessage({ type: 'highlight:event', event: 'highlight:removed', data: { ids: removed } }, '*'); } catch {}
    }
  }

  function setLayersDisplay(display) {
    document.querySelectorAll('.ai-highlight-layer').forEach(el => { el.style.display = display; });
  }

  async function buildPageIndex(app, pageIndex) {
    const pageView = app.pdfViewer.getPageView(pageIndex);
    if (!pageView || !pageView.pdfPage) return null;
    const pdfPage = pageView.pdfPage;
    const viewport = pageView.viewport; // respects scale & rotation
    const textContent = await pdfPage.getTextContent();
    const items = [];
    let fullText = '';
    const charToItem = [];
    const itemStartIdx = [];
    let prevRight = null;
    for (let idx = 0; idx < textContent.items.length; idx++) {
      const item = textContent.items[idx];
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const x = tx[4], y = tx[5];
      const fontHeight = Math.hypot(tx[2], tx[3]);
      const rawWidth = item.width || 0;
      const width = rawWidth ? rawWidth * (viewport.scale || 1) : ((item.str ? item.str.length : 1) * (fontHeight * 0.6));
      const height = fontHeight;
      const str = item.str || '';
      const charWidth = str.length > 0 ? (width / str.length) : width;
      items.push({ str, bbox: [x, (y - height), width, height], charWidth });
      if (prevRight !== null) {
        const gap = x - prevRight;
        if (gap > Math.max(charWidth * 0.5, 1.0)) {
          fullText += ' ';
          charToItem.push(-1);
        }
      }
      itemStartIdx.push(fullText.length);
      fullText += str;
      for (let c = 0; c < str.length; c++) charToItem.push(idx);
      prevRight = x + width;
    }
    const rec = { items, fullText, fullLower: fullText.toLowerCase(), charToItem, itemStartIdx, viewport };
    state.cache.set(pageIndex, rec);
    return rec;
  }

  function getOrCreateLayer(pageDiv) {
    let layer = pageDiv.querySelector('.ai-highlight-layer');
    if (!layer) {
      // Mount overlay directly on the page container to match saved rect coordinates
      const parent = pageDiv;
      layer = document.createElement('div');
      layer.className = 'ai-highlight-layer';
      layer.style.position = 'absolute';
      layer.style.left = '0';
      layer.style.top = '0';
      layer.style.width = '100%';
      layer.style.height = '100%';
      layer.style.pointerEvents = 'none';
      layer.style.zIndex = '9999';
      parent.appendChild(layer);
      try { if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch {}
    } else {
      layer.innerHTML = '';
    }
    return layer;
  }

  function looksLikeFcmPrompt(p) {
    const s = String(p || '').toLowerCase();
    return (
      s.includes('fuzzy c-means') || s.includes('fuzzy c means') ||
      s.includes('fuzzy k-means') || s.includes('fuzzy k means') ||
      s.includes('soft k-means') || s.includes('soft k means') ||
      /\bfcm\b/.test(s)
    );
  }

  function computeSymbolDensity(str) {
    const s = String(str || '');
    if (!s.length) return 0;
    const nonLetters = s.replace(/[A-Za-zÀ-ÖØ-öø-ÿ0-9\s]/g, '');
    return nonLetters.length / s.length;
  }

  function groupItemsIntoLines(rec) {
    // Simple grouping by y proximity
    const lines = [];
    const items = rec.items || [];
    const threshold = 3; // px
    const sorted = items.map((it, idx) => ({ idx, it })).sort((a, b) => (a.it.bbox[1] - b.it.bbox[1]));
    for (const { idx, it } of sorted) {
      const y = it.bbox[1];
      let line = lines.find(l => Math.abs(l.y - y) <= threshold);
      if (!line) {
        line = { y, items: [], text: '', xMin: Infinity, xMax: -Infinity, h: it.bbox[3] };
        lines.push(line);
      }
      line.items.push({ idx, it });
      line.text += it.str || '';
      line.xMin = Math.min(line.xMin, it.bbox[0]);
      line.xMax = Math.max(line.xMax, it.bbox[0] + it.bbox[2]);
      line.h = Math.max(line.h, it.bbox[3]);
    }
    return lines;
  }

  function detectEquationNumberNear(lines, targetY, viewportWidth) {
    // Find a line near targetY that looks like (n) or Eq. (n)
    let best = null; let bestDy = Infinity;
    const re = /(eq\.?\s*\(?\s*\d+\s*\)?|\(\s*\d+\s*\))/i;
    for (const line of lines) {
      const dy = Math.abs(line.y - targetY);
      if (dy < Math.max(6, line.h * 0.6)) {
        if (re.test(line.text)) {
          if (dy < bestDy) { bestDy = dy; best = line; }
        }
      }
    }
    if (!best) return null;
    const m = best.text.match(/(\(\s*\d+\s*\))/);
    const eqLabel = m ? `Eq. ${m[1].replace(/\s+/g, '')}` : 'Eq.';
    return eqLabel;
  }

  function buildFcmCandidatesOnPage(rec, viewport) {
    const lines = groupItemsIntoLines(rec);
    const W = (viewport && viewport.width) || 0;
    const conceptHints = [/fuzzy\s*c[- ]?means/i, /soft\s*k[- ]?means/i, /fcm/i];
    const proseHints = [/membership/i, /centroid/i, /objective/i, /fuzzifier/i, /\bm\b/i];
    const mathGlyphs = /[∑Σ∏π√∞≈≃≅≤≥±·⋅×÷∘∥‖=≜→←⇒⇐≡∝^_]/;
    const fcmTokens = [/J\s*[_m]|Jm/i, /u\s*[_{]?ik[}\s]?/i, /c\s*[_{]?k[}\s]?/i, /‖|\|\|/];

    // scan for concept mentions
    const pageText = rec.fullText || '';
    const hasConcept = conceptHints.some(r => r.test(pageText));
    if (!hasConcept) return [];

    const candidates = [];
    for (const line of lines) {
      const t = line.text || '';
      const len = t.trim().length;
      if (!len || len > 160) continue;
      const sym = computeSymbolDensity(t);
      const hasMath = mathGlyphs.test(t) || sym >= 0.28 || /=/.test(t);
      if (!hasMath) continue;
      const fcmHit = fcmTokens.some(r => r.test(t));
      const proseNear = proseHints.some(r => r.test(pageText));
      const centerDist = Math.abs(((line.xMin + line.xMax) / 2) - (W / 2));
      const centered = centerDist < (W * 0.2);
      // score components
      const score = (fcmHit ? 3 : 0) + (proseNear ? 1 : 0) + (centered ? 1 : 0) + (sym > 0.4 ? 1 : 0) + (/\(/.test(t) && /\)/.test(t) ? 1 : 0);
      if (score >= 2) {
        candidates.push({ y: line.y, x: line.xMin, w: Math.max(2, line.xMax - line.xMin), h: Math.max(10, line.h), text: t, score });
      }
    }
    // sort by score descending, then y asc
    candidates.sort((a, b) => (b.score - a.score) || (a.y - b.y));
    // cap results per page
    return candidates.slice(0, 5);
  }

  async function applyFcmHighlight(app) {
    const refs = [];
    const pageCount = app.pdfDocument.numPages;
    // If preserving anchor and we have a selection region, restrict to that page
    const region = (payload && payload.preserveAnchor && state.selectionRegion) ? state.selectionRegion : null;
    const startPage = region ? region.pageIndex : 0;
    const endPage = region ? (region.pageIndex + 1) : pageCount;
    for (let i = startPage; i < endPage; i++) {
      const pageView = app.pdfViewer.getPageView(i);
      if (!pageView || !pageView.div) continue;
      const rec = (state.cache.get(i)) || (await buildPageIndex(app, i));
      if (!rec) continue;
      const layer = getOrCreateLayer(pageView.div);
      const viewport = rec.viewport;
      const cands = buildFcmCandidatesOnPage(rec, viewport);
      if (!cands.length) continue;
      const lines = groupItemsIntoLines(rec);
      cands.forEach((cand) => {
        // geometry guard
        if (!isFinite(cand.x) || !isFinite(cand.y) || !isFinite(cand.w) || !isFinite(cand.h) || cand.w < 1 || cand.h < 1) return;
        const m = document.createElement('div');
        m.className = 'ai-mark ai-role-ai';
        m.style.left = cand.x + 'px';
        m.style.top = cand.y + 'px';
        m.style.width = cand.w + 'px';
        m.style.height = cand.h + 'px';
        // corner icon to indicate AI highlight, consistent with chat action
        const corner = document.createElement('span');
        corner.className = 'ai-corner';
        corner.textContent = '✦';
        m.appendChild(corner);
        layer.appendChild(m);
        const eqLabel = detectEquationNumberNear(lines, cand.y, (viewport && viewport.width) || 0) || null;
        refs.push({ page: i + 1, eq: eqLabel, y: cand.y });
      });
    }
    // notify parent for chat references
    try { parent.postMessage({ type: 'highlightMatches', matches: refs, prompt: 'FCM formulas' }, '*'); } catch {}
  }

  async function applyEditorHighlight(app, payload) {
    ensureStyle();
    state.lastPayload = payload;
    if (!state.enabled) { setLayersDisplay('none'); return; }
    // In guided expansion mode we preserve any existing anchor marks
    if (!payload || !payload.preserveAnchor) {
      clearHighlights();
    }

    // Targeted path: FCM / Soft K-Means formulas
    if (looksLikeFcmPrompt(payload && payload.prompt)) {
      await applyFcmHighlight(app);
      return;
    }

    if (!app || !app.pdfDocument) return;
    // Restrict to selection page if preserving anchor and selectionRegion exists
    const region = (payload && payload.preserveAnchor && state.selectionRegion) ? state.selectionRegion : null;
    // If strict guided selection is present, draw only the selected rects as AI highlights and return
    if (region && Array.isArray(region.rects) && region.rects.length) {
      const pageView = app.pdfViewer.getPageView(region.pageIndex);
      if (!pageView || !pageView.div) return;
      const pageDiv = pageView.div;
      const layer = getOrCreateLayer(pageDiv);
      try { layer.querySelectorAll('.ai-mark.ai-role-ai').forEach(el => el.remove()); } catch {}
      const ordered = region.rects.slice(0, 48);
      if (ordered.length) {
        const first = ordered[0];
        if (first && isFinite(first.y)) scrollToPageY(pageDiv, first.y, 0.35);
      }
      const matches = [];
      for (const rc of ordered) {
        if (!rc || !isFinite(rc.x) || !isFinite(rc.y) || !isFinite(rc.width) || !isFinite(rc.height)) continue;
        const m = document.createElement('div');
        m.className = 'ai-mark ai-role-ai';
        m.style.left = rc.x + 'px';
        m.style.top = rc.y + 'px';
        m.style.width = Math.max(1, rc.width) + 'px';
        m.style.height = Math.max(1, rc.height) + 'px';
        m.title = `AI highlight — Selection`;
        try { const corner = document.createElement('span'); corner.className = 'ai-corner'; corner.textContent = '✦'; m.appendChild(corner); } catch {}
        layer.appendChild(m);
        matches.push({ page: (region.pageIndex + 1), y: rc.y, label: (region.anchor || 'Selection') });
      }
      try { parent.postMessage({ type: 'highlightMatches', matches, prompt: (payload && payload.prompt) || 'Highlights' }, '*'); } catch {}
      return;
    }

    const terms0 = buildTermsFromHighlights(payload.highlights);
    const terms = terms0.length ? terms0 : splitPromptToTerms(payload.prompt || '');
    if (!terms.length) return;

    const pageCount = app.pdfDocument.numPages;
    const startPage = 0;
    const endPage = pageCount;
    const collected = [];
    for (let i = startPage; i < endPage; i++) {
      const pageView = app.pdfViewer.getPageView(i);
      if (!pageView || !pageView.div) continue;
      const pageDiv = pageView.div;

      const rec = await buildPageIndex(app, i);
      if (!rec) continue;
      const { items, fullLower, charToItem, itemStartIdx } = rec;
      const layer = getOrCreateLayer(pageDiv);

      for (let tIdx = 0; tIdx < terms.length; tIdx++) {
        const term = terms[tIdx];
        let idx = 0;
        while ((idx = fullLower.indexOf(term.toLowerCase(), idx)) !== -1) {
          const matchEnd = idx + term.length;
          let pos = idx;
          while (pos < matchEnd) {
            const itemIndex = charToItem[pos];
            if (itemIndex === undefined || itemIndex === null || itemIndex < 0) { pos++; continue; }
            const it = items[itemIndex];
            const itemStart = itemStartIdx[itemIndex];
            let nextPos = pos;
            while (nextPos < matchEnd && charToItem[nextPos] === itemIndex) nextPos++;
            const localStart = Math.max(0, pos - itemStart);
            const localLen = Math.max(1, nextPos - pos);
            const [ix, iy] = it.bbox;
            // If guided selection exists, only draw marks that intersect the selected rects (strict)
            if (region && Array.isArray(region.rects) && region.rects.length) {
              const cx = ix + (it.charWidth * localStart);
              const cw = Math.max(2, it.charWidth * localLen);
              const ch = it.bbox[3];
              const markRect = { x: cx, y: iy, width: cw, height: ch };
              let inside = false;
              for (const r of region.rects) {
                if (!r) continue;
                const overlapX = markRect.x < (r.x + r.width) && (markRect.x + markRect.width) > r.x;
                const overlapY = markRect.y < (r.y + r.height) && (markRect.y + markRect.height) > r.y;
                if (overlapX && overlapY) { inside = true; break; }
              }
              if (!inside) { pos = nextPos; continue; }
            }
            const cx = ix + (it.charWidth * localStart);
            const cw = Math.max(2, it.charWidth * localLen);
            const ch = it.bbox[3];
            // Guard against invalid geometry
            if (!isFinite(cx) || !isFinite(iy) || !isFinite(cw) || !isFinite(ch) || cw < 1 || ch < 1) { pos = nextPos; continue; }
            const mark = document.createElement('div');
            mark.className = 'ai-mark ai-role-ai';
            mark.style.left = cx + 'px';
            mark.style.top = iy + 'px';
            mark.style.width = cw + 'px';
            mark.style.height = ch + 'px';
            mark.title = `AI highlight — Page ${i+1}`;
            // Add a small robot icon to distinguish AI overlays
            try {
              const corner = document.createElement('span');
              corner.className = 'ai-corner';
              corner.textContent = '✦';
              mark.appendChild(corner);
            } catch {}
            layer.appendChild(mark);
            // Collect a compact reference for chat jumps (first N only)
            if (collected.length < 12) {
              const yRef = Math.max(0, Math.floor(iy));
              collected.push({ page: (i + 1), y: yRef, term });
            }
            pos = nextPos;
          }
          idx += term.length;
        }
      }
    }
    // Notify parent with compact refs so chat can render Jump links/buttons
    if (collected.length) {
      try { parent.postMessage({ type: 'highlightMatches', matches: collected, prompt: (payload && payload.prompt) || 'Highlights' }, '*'); } catch {}
    }
  }

  function setupMessaging(app) {
    window.addEventListener('message', (e) => {
      const data = e.data || {};
      if (data.type === 'editorHighlight') {
        if (state.aiOverlayEnabled) {
          applyEditorHighlight(app, { prompt: data.prompt || '', highlights: data.highlights || [] });
        }
      } else if (data.type === 'clearHighlights') {
        state.lastPayload = null;
        clearHighlights();
      } else if (data.type === 'showAIHighlights') {
        // Force-enable AI highlight overlay visibility
        state.enabled = true;
        setLayersDisplay('');
        updateToggleButtonUI();
        if (state.lastPayload) {
          try { applyEditorHighlight(app, state.lastPayload); } catch {}
        }
      } else if (data.type === 'highlight:activate') {
        setMarkerActive(app, true, { source: 'parent' });
      } else if (data.type === 'highlight:deactivate') {
        setMarkerActive(app, false, { source: 'parent' });
      } else if (data.type === 'highlightSelectionOnly') {
        drawSelectionOnly(app, data.meta || {});
      } else if (data.type === 'selection:navigate') {
        navigateToSelection(app, data.meta || data.selection || {});
      } else if (data.type === 'navigateToY') {
        const pageNumber = Number(data.page) || 1;
        const y = Number(data.y) || 0;
        navigateToY(app, pageNumber - 1, y);
      } else if (data.type === 'enableAiOverlay') {
        state.aiOverlayEnabled = true;
      } else if (data.type === 'disableAiOverlay') {
        state.aiOverlayEnabled = false;
      }
    });
  }

  function scrollPageIntoView(app, pageIndex) {
    try {
      if (app && app.pdfViewer && typeof app.pdfViewer.scrollPageIntoView === 'function') {
        app.pdfViewer.scrollPageIntoView({ pageNumber: pageIndex + 1 });
        return;
      }
      const pageView = app && app.pdfViewer && app.pdfViewer.getPageView ? app.pdfViewer.getPageView(pageIndex) : null;
      const div = pageView && pageView.div;
      if (div && typeof div.scrollIntoView === 'function') {
        div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (e) { /* ignore */ }
  }

  function viewerContainer() {
    return document.getElementById('viewerContainer') || null;
  }

  function scrollToPageY(pageDiv, y, bias = 0.3) {
    try {
      const vc = viewerContainer();
      if (!vc || !pageDiv) return;
      const pageTop = pageDiv.offsetTop || 0;
      const target = Math.max(0, pageTop + Math.max(0, y) - Math.floor(vc.clientHeight * bias));
      vc.scrollTop = target;
    } catch (e) { /* ignore */ }
  }

  async function navigateToY(app, pageIndex, y) {
    try {
      const pageView = app.pdfViewer.getPageView(pageIndex);
      if (!pageView || !pageView.div) return;
      const pageDiv = pageView.div;
      scrollPageIntoView(app, pageIndex);
      const rec = (state.cache.get(pageIndex)) || (await buildPageIndex(app, pageIndex));
      if (!rec) return;
      const lines = groupItemsIntoLines(rec);
      if (!lines.length) return;
      let best = null; let bestDy = Infinity;
      for (const ln of lines) {
        const dy = Math.abs(ln.y - y);
        if (dy < bestDy) { bestDy = dy; best = ln; }
      }
      const lyr = getOrCreateLayer(pageDiv);
      if (best) {
        const rc = { x: best.xMin, y: best.y, width: Math.max(2, best.xMax - best.xMin), height: Math.max(10, best.h) };
        scrollToPageY(pageDiv, rc.y, 0.35);
        flashRects(lyr, [rc]);
      }
    } catch {}
  }

  async function drawSelectionOnly(app, meta) {
    if (!meta) return;
    const pageNumber = Number(meta.page) || 1;
    const pageIndex = Math.max(0, pageNumber - 1);
    const pageView = app.pdfViewer.getPageView(pageIndex);
    if (!pageView || !pageView.div) return;
    const pageDiv = pageView.div;
    scrollPageIntoView(app, pageIndex);
    clearHighlights();
    const layer = getOrCreateLayer(pageDiv);
    // Use pageDiv dimensions for scaling normalized rects
    const vw = pageDiv.clientWidth || 0;
    const vh = pageDiv.clientHeight || 0;

    // Helper to scale possibly normalized rects
    const scaleRect = (r) => {
      if (!r) return null;
      let { x, y, width, height } = r;
      if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) return null;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && width > 0 && width <= 1 && height > 0 && height <= 1 && vw && vh) {
        x = x * vw; y = y * vh; width = width * vw; height = height * vh;
      }
      return { x, y, width, height };
    };

    // Prefer anchor-derived rects (robust to zoom), else provided.rects (scaled)
    let anchorRects = [];
    if (meta.anchor) {
      const rec = (state.cache.get(pageIndex)) || (await buildPageIndex(app, pageIndex));
      anchorRects = findAnchorOnPage(rec, String(meta.anchor).toLowerCase()) || [];
    }
    const provided = Array.isArray(meta.rects) ? meta.rects.map(scaleRect).filter(Boolean) : [];

    // Choose the best set: prefer rects with reasonable x/width; else fallback to anchor
    const good = (rs) => (rs || []).filter(rc => isFinite(rc.x) && isFinite(rc.y) && rc.width > 3 && rc.height > 3 && rc.x > 5);
    const candProvided = good(provided);
    const candAnchor = good(anchorRects);
    if (anchorRects.length) {
      // Draw anchor-derived rects individually
      const ordered = anchorRects.slice().sort((a,b) => a.y - b.y);
      const first = ordered[0];
      if (first && isFinite(first.y)) scrollToPageY(pageDiv, first.y, 0.35);
      // Save selection region for constraining AI overlays
      try {
        const yMin = ordered.reduce((m, r) => Math.min(m, r.y), Infinity);
        const yMax = ordered.reduce((m, r) => Math.max(m, r.y + r.height), -Infinity);
        const xMin = ordered.reduce((m, r) => Math.min(m, r.x), Infinity);
        const xMax = ordered.reduce((m, r) => Math.max(m, r.x + r.width), -Infinity);
        const span = Math.max(10, (yMax - yMin));
        const width = Math.max(10, (xMax - xMin));
        state.selectionRegion = {
          pageIndex,
          xMin, xMax,
          yMin, yMax,
          margin: 0,
          marginX: 0,
          rects: ordered.slice(0, 32),
          anchor: meta.anchor || meta.text || ''
        };
      } catch {}
      ordered.slice(0, 8).forEach(rc => {
        const m = document.createElement('div');
        m.className = 'ai-mark ai-role-user';
        m.style.left = rc.x + 'px';
        m.style.top = rc.y + 'px';
        m.style.width = rc.width + 'px';
        m.style.height = rc.height + 'px';
        m.style.transition = 'background 1.2s ease, outline-color 1.2s ease, opacity 0.8s ease';
        layer.appendChild(m);
        setTimeout(() => {
          m.style.background = 'rgba(255, 235, 59, 0.65)';
          m.style.outlineWidth = '2px';
          setTimeout(() => { m.style.opacity = '0.0'; setTimeout(() => { try { m.remove(); } catch {} }, 900); }, 8000);
        }, 30);
      });
    } else if (candProvided.length) {
      // Draw each provided rect (accurate selection) to follow the text shape
      const ordered = candProvided.slice().sort((a,b) => a.y - b.y);
      const first = ordered[0];
      if (first && isFinite(first.y)) scrollToPageY(pageDiv, first.y, 0.35);
      // Save selection region for constraining AI overlays
      try {
        const yMin = ordered.reduce((m, r) => Math.min(m, r.y), Infinity);
        const yMax = ordered.reduce((m, r) => Math.max(m, r.y + r.height), -Infinity);
        const xMin = ordered.reduce((m, r) => Math.min(m, r.x), Infinity);
        const xMax = ordered.reduce((m, r) => Math.max(m, r.x + r.width), -Infinity);
        const span = Math.max(10, (yMax - yMin));
        const width = Math.max(10, (xMax - xMin));
        state.selectionRegion = {
          pageIndex,
          xMin, xMax,
          yMin, yMax,
          margin: 0,
          marginX: 0,
          rects: ordered.slice(0, 32),
          anchor: meta.anchor || meta.text || ''
        };
      } catch {}
      ordered.slice(0, 8).forEach(rc => {
        const m = document.createElement('div');
        m.className = 'ai-mark ai-role-user';
        m.style.left = rc.x + 'px';
        m.style.top = rc.y + 'px';
        m.style.width = rc.width + 'px';
        m.style.height = rc.height + 'px';
        m.style.transition = 'background 1.2s ease, outline-color 1.2s ease, opacity 0.8s ease';
        layer.appendChild(m);
        setTimeout(() => {
          m.style.background = 'rgba(255, 235, 59, 0.65)';
          m.style.outlineWidth = '2px';
          setTimeout(() => { m.style.opacity = '0.0'; setTimeout(() => { try { m.remove(); } catch {} }, 900); }, 8000);
        }, 30);
      });
    } else {
      // Fallback: snap anchor-derived rect to nearest text line
      const rec = (state.cache.get(pageIndex)) || (await buildPageIndex(app, pageIndex));
      const lines = rec ? groupItemsIntoLines(rec) : [];
      const lnSafe = (v) => (isFinite(v) ? v : 0);
      const snapToLine = (rc) => {
        if (!lines.length) return rc;
        let best = null; let bestDy = Infinity;
        for (const ln of lines) {
          const dy = Math.abs(ln.y - rc.y);
          const tol = Math.max(6, ln.h * 0.7);
          if (dy < tol && dy < bestDy) { bestDy = dy; best = ln; }
        }
        if (!best) return rc;
        return { x: Math.max(lnSafe(best.xMin), 6), y: best.y, width: Math.max(2, best.xMax - best.xMin), height: Math.max(10, best.h) };
      };
      const base = anchorRects.length ? anchorRects[0] : null;
      if (base) {
        const target = snapToLine(base);
        const m = document.createElement('div');
        m.className = 'ai-mark ai-role-user';
        m.style.left = target.x + 'px';
        m.style.top = target.y + 'px';
        m.style.width = target.width + 'px';
        m.style.height = target.height + 'px';
        m.style.transition = 'background 1.2s ease, outline-color 1.2s ease, opacity 0.8s ease';
        layer.appendChild(m);
        scrollToPageY(pageDiv, target.y, 0.35);
        // Save a narrow region around the snapped line
        try {
          const yMin = target.y;
          const yMax = target.y + target.height;
          const xMin = target.x;
          const xMax = target.x + target.width;
          const span = Math.max(10, (yMax - yMin));
          const width = Math.max(10, (xMax - xMin));
          state.selectionRegion = {
            pageIndex,
            xMin, xMax,
            yMin, yMax,
            margin: 0,
            marginX: 0,
            rects: [target],
            anchor: meta.anchor || meta.text || ''
          };
        } catch {}
        setTimeout(() => {
          m.style.background = 'rgba(255, 235, 59, 0.65)';
          m.style.outlineWidth = '2px';
          setTimeout(() => { m.style.opacity = '0.0'; setTimeout(() => { try { m.remove(); } catch {} }, 900); }, 8000);
        }, 30);
      }
    }

    // done
  }

  async function navigateToSelection(app, meta) {
    if (!app || !app.pdfDocument) {
      state.pendingNav = meta;
      return;
    }
    try {
      const pageNumber = Number(meta.page) || 1;
      const pageIndex = Math.max(0, pageNumber - 1);
      const pageView = app.pdfViewer.getPageView(pageIndex);
      if (!pageView || !pageView.div) throw new Error('page not found');
      const pageDiv = pageView.div;
      // Scroll into view first
      scrollPageIntoView(app, pageIndex);

      // Create a temporary flash overlay from rects or resolve from anchor text
      const layer = getOrCreateLayer(pageDiv);
      let flashed = false;
      if (Array.isArray(meta.rects) && meta.rects.length) {
        // Validate rects roughly against page size; if clearly off, ignore
        const pv = pageView.viewport;
        const valid = meta.rects.some(r => r && r.width > 1 && r.height > 1 && r.x >= -50 && r.y >= -50 && r.x < (pv.width + 50) && r.y < (pv.height + 50));
        if (valid) {
          flashed = true;
          flashRects(layer, meta.rects);
        }
      } else if (meta.anchor) {
        const term = String(meta.anchor).toLowerCase();
        const rec = (state.cache.get(pageIndex)) || (await buildPageIndex(app, pageIndex));
        const rects = findAnchorOnPage(rec, term);
        if (rects && rects.length) {
          flashed = rects.length > 0;
          if (flashed) flashRects(layer, rects);
        } else {
          // Not found on this page; try across the document for nearest match
          const found = await findAnchorAcrossDocument(app, term);
          if (found) {
            const { pageIndex: pi, rects, pageDiv: pDiv } = found;
            const pv = app.pdfViewer.getPageView(pi);
            if (pv) scrollPageIntoView(app, pi);
            const lyr = getOrCreateLayer(pDiv);
            // Ensure the found anchor is visible
            if (Array.isArray(rects) && rects.length && rects[0]) {
              scrollToPageY(pDiv, rects[0].y, 0.35);
            }
            flashRects(lyr, rects);
            flashed = true;
            // Notify parent to update saved selection (re-anchored)
            try { parent.postMessage({ type: 'selection:reanchored', data: { ...meta, page: pi + 1, rects } }, '*'); } catch {}
          }
        }
      }
      if (!flashed) {
        try { parent.postMessage({ type: 'selection:missing', data: meta }, '*'); } catch {}
      } else {
        try { parent.postMessage({ type: 'selection:navigate', data: meta }, '*'); } catch {}
      }
    } catch (err) {
      try { parent.postMessage({ type: 'selection:missing', error: String(err), data: meta }, '*'); } catch {}
    }
  }

  function regexEscape(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function buildRegexFromAnchor(term) {
    const words = (String(term).toLowerCase().match(/[a-z0-9]{3,}/g) || []).slice(0, 6);
    if (!words.length) return null;
    const parts = words.map(w => `\\b${regexEscape(w)}\\b`);
    const pattern = parts.join(`[\\s\\S]{0,120}?`);
    try { return new RegExp(pattern, 'i'); } catch { return null; }
  }

  function findAnchorOnPage(rec, termLower) {
    const lower = rec.fullLower || '';
    // 1) exact
    let idx = lower.indexOf(termLower);
    if (idx >= 0) return rectsFromSpan(rec, idx, termLower.length);
    // 2) variants by length
    const variants = buildAnchorVariants(termLower);
    for (const v of variants) {
      idx = lower.indexOf(v);
      if (idx >= 0) return rectsFromSpan(rec, idx, v.length);
    }
    // 3) regex of key words with gaps
    const re = buildRegexFromAnchor(termLower);
    if (re) {
      const m = lower.match(re);
      if (m && m.index !== undefined) {
        return rectsFromSpan(rec, m.index, m[0].length);
      }
    }
    return null;
  }

  async function findAnchorAcrossDocument(app, term) {
    if (!term) return null;
    const pdfDoc = app.pdfDocument;
    const total = pdfDoc ? pdfDoc.numPages : 0;
    const variants = buildAnchorVariants(term);
    for (let i = 0; i < total; i++) {
      const pageView = app.pdfViewer.getPageView(i);
      if (!pageView || !pageView.div) continue;
      const rec = (state.cache.get(i)) || (await buildPageIndex(app, i));
      const lower = rec.fullLower || '';
      for (const v of variants) {
        const idx = lower.indexOf(v);
        if (idx >= 0) {
          const rects = rectsFromSpan(rec, idx, v.length);
          if (rects.length) return { pageIndex: i, rects, pageDiv: pageView.div };
        }
      }
    }
    return null;
  }

  function buildAnchorVariants(anchorLower) {
    const variants = new Set();
    const t = String(anchorLower || '').toLowerCase().trim();
    if (!t) return [];
    variants.add(t);
    if (t.length > 80) variants.add(t.slice(0, 80));
    if (t.length > 60) variants.add(t.slice(0, 60));
    if (t.length > 40) variants.add(t.slice(0, 40));
    // Add first 6 words
    const words = t.split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
    if (words.length >= 12) variants.add(words);
    return Array.from(variants);
  }

  function rectsFromSpan(rec, startIdx, length) {
    const out = [];
    let pos = startIdx;
    const end = startIdx + length;
    while (pos < end) {
      const itemIndex = rec.charToItem[pos];
      if (itemIndex === undefined || itemIndex === null || itemIndex < 0) { pos++; continue; }
      const it = rec.items[itemIndex];
      const itemStart = rec.itemStartIdx[itemIndex];
      let nextPos = pos;
      while (nextPos < end && rec.charToItem[nextPos] === itemIndex) nextPos++;
      const localStart = Math.max(0, pos - itemStart);
      const localLen = Math.max(1, nextPos - pos);
      const [ix, iy] = it.bbox;
      const cx = ix + (it.charWidth * localStart);
      const cw = Math.max(2, it.charWidth * localLen);
      out.push({ x: cx, y: iy, width: cw, height: it.bbox[3] });
      pos = nextPos;
    }
    return out;
  }

  function flashRects(layer, rects) {
    const marks = [];
    rects.slice(0, 1).forEach(rc => {
      if (!rc || !isFinite(rc.x) || !isFinite(rc.y) || !isFinite(rc.width) || !isFinite(rc.height) || rc.width < 1 || rc.height < 1) return;
      const m = document.createElement('div');
      m.className = 'ai-mark ai-role-user';
      m.style.left = rc.x + 'px';
      m.style.top = rc.y + 'px';
      m.style.width = rc.width + 'px';
      m.style.height = rc.height + 'px';
      m.style.transition = 'background 1.2s ease, outline-color 1.2s ease, opacity 0.8s ease';
      layer.appendChild(m);
      // Pulse effect for visibility (no corner icon)
      m.classList.add('ai-pulse');
      marks.push(m);
    });
    // Highlight strongly, then keep visible for several seconds before fading out
    setTimeout(() => {
      marks.forEach(m => { m.style.background = 'rgba(255, 235, 59, 0.65)'; m.style.outlineWidth = '2px'; });
      // Keep visible for ~8s, then fade for ~0.8s, then remove
      setTimeout(() => {
        marks.forEach(m => { m.style.opacity = '0.0'; });
        setTimeout(() => marks.forEach(m => m.remove()), 900);
      }, 8000);
    }, 30);
  }

  function setupReflowHandling(app) {
    const bus = app && app.eventBus;
    if (!bus) return;
    const clearCacheAndReapply = () => {
      state.cache.clear();
      if (state.lastPayload && state.enabled) {
        // Delay slightly to allow pages to re-render
        setTimeout(() => applyEditorHighlight(app, state.lastPayload), 250);
      } else {
        clearHighlights();
      }
    };
    bus.on('scalechanging', clearCacheAndReapply);
    bus.on('rotationchanging', clearCacheAndReapply);
    bus.on('pagerendered', (evt) => {
      if (!state.lastPayload) return;
      // Reapply for the rendered page only
      const i = (evt && typeof evt.pageNumber === 'number') ? (evt.pageNumber - 1) : null;
      if (i == null) return;
      state.cache.delete(i);
      setTimeout(() => applyEditorHighlight(app, state.lastPayload), 0);
    });
  }

  function updateToggleButtonUI() {
    if (!state.toggleBtn) return;
    state.toggleBtn.classList.toggle('toggled', state.enabled);
    state.toggleBtn.setAttribute('aria-pressed', state.enabled ? 'true' : 'false');
    state.toggleBtn.setAttribute('title', state.enabled ? 'Hide AI Highlights' : 'Show AI Highlights');
  }

  function bindToggleButton(app) {
    const btn = document.getElementById('toggleAIHighlights');
    if (!btn) return;
    state.toggleBtn = btn;
    btn.addEventListener('click', () => {
      state.enabled = !state.enabled;
      updateToggleButtonUI();
      if (!state.enabled) {
        setLayersDisplay('none');
      } else {
        setLayersDisplay('');
        if (state.lastPayload) applyEditorHighlight(app, state.lastPayload);
      }
    });
    updateToggleButtonUI();
  }

  function initWhenReady() {
    const iv = setInterval(() => {
      const app = window.PDFViewerApplication;
      if (app && app.pdfViewer && app.eventBus) {
        clearInterval(iv);
        setupMessaging(app);
        setupReflowHandling(app);
        bindToggleButton(app);
        bindMarkerButton(app);
        bindSelectionHandlers(app);
        // Retry pending navigation if any
        if (state.pendingNav) {
          const pending = state.pendingNav; state.pendingNav = null;
          setTimeout(() => navigateToSelection(app, pending), 100);
        }
        // Also retry on initial load complete
        app.eventBus.on('pagesloaded', () => {
          if (state.pendingNav) { const p = state.pendingNav; state.pendingNav = null; navigateToSelection(app, p); }
        });
      }
    }, 50);
    setTimeout(() => clearInterval(iv), 15000);
  }

  function setMarkerActive(app, active, opts = {}) {
    state.markerActive = !!active;
    if (state.markerBtn) {
      state.markerBtn.classList.toggle('toggled', state.markerActive);
      state.markerBtn.setAttribute('aria-pressed', state.markerActive ? 'true' : 'false');
      state.markerBtn.setAttribute('title', 'Toggle guided selection (Esc to exit)');
    }
    const viewer = document.getElementById('viewer');
    if (viewer) viewer.classList.toggle('ai-marker-mode', state.markerActive);
    document.body.classList.toggle('ai-marker-mode', state.markerActive);
    // Notify parent unless parent initiated
    if (opts.source !== 'parent') {
      try { parent.postMessage({ type: 'highlight:event', event: state.markerActive ? 'highlight:activated' : 'highlight:deactivated' }, '*'); } catch {}
    }
  }

  function bindMarkerButton(app) {
    const btn = document.getElementById('toggleGuidedSelection');
    if (!btn) return;
    state.markerBtn = btn;
    btn.addEventListener('click', () => setMarkerActive(app, !state.markerActive));

    // Esc exits marker mode
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.markerActive) {
        setMarkerActive(app, false);
      }
    });
  }

  function bindSelectionHandlers(app) {
    const viewerContainer = document.getElementById('viewerContainer');
    if (!viewerContainer) return;

    viewerContainer.addEventListener('mouseup', () => {
      if (!state.markerActive) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text) return;
      // determine page (for metadata only; do not draw overlays here)
      let anchorNode = sel.anchorNode;
      if (anchorNode && anchorNode.nodeType === 3) anchorNode = anchorNode.parentElement;
      const pageDiv = anchorNode && anchorNode.closest('.page');
      if (!pageDiv) return;
      const pageIndex = parseInt(pageDiv.getAttribute('data-page-number'), 10) - 1;
      const rects = Array.from(sel.getRangeAt(0).getClientRects()).map(r => {
        const pageRect = pageDiv.getBoundingClientRect();
        return { x: r.left - pageRect.left, y: r.top - pageRect.top, width: r.width, height: r.height };
      });
      // Build metadata and notify parent (parent decides if/when to highlight)
      const id = 'h_' + Math.random().toString(36).slice(2, 9);
      const anchor = text.slice(0, 120);
      const meta = { id, role: 'user', page: pageIndex + 1, anchor, text, rects, color: 'user', createdAt: Date.now() };
      state.highlights.set(id, meta);
      try { parent.postMessage({ type: 'highlight:event', event: 'highlight:created', data: meta }, '*'); } catch {}
      // keep selection but end marker mode if desired? For now, remain in mode.
    });

    // Reflect deselection in real-time: when selection collapses, clear user marks and notify parent
    document.addEventListener('selectionchange', () => {
      if (!state.markerActive) return;
      const sel = window.getSelection();
      if (!sel) return;
      if (sel.isCollapsed) {
        try {
          const root = document.getElementById('viewer') || document;
          root.querySelectorAll('.ai-mark.ai-role-user').forEach(el => el.remove());
        } catch {}
        try { parent.postMessage({ type: 'highlight:event', event: 'highlight:removed' }, '*'); } catch {}
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
  } else {
    initWhenReady();
  }
})();

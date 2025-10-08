/* Lightweight highlight plugin for the vendored pdf.js viewer.
 * Listens for postMessage({ type: 'chunkHighlight', highlights })
 * and draws translucent rectangles over RAG-retrieved chunks with precise coordinates.
 */
(function () {
  const STOPWORDS = new Set(['the','and','for','with','that','this','from','into','your','about','what','when','where','which','then','than','also','have','has','are','was','were','will','shall','should','would','could','can','may','might','a','an','in','on','to','of','by','at','as','it','or','be','is']);

  const state = {
    lastPayload: null,
    cache: new Map(), // pageIndex -> { items, fullText, fullLower, charToItem, itemStartIdx }
    enabled: true,
    toggleBtn: null,
    highlights: new Map(), // id -> meta
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
      /* Text-level highlighting for RAG chunks */
      .rag-text-highlight {
        background-color: rgba(0, 140, 255, 0.35) !important;
        border-radius: 2px !important;
        box-shadow: 0 0 0 1px rgba(0, 120, 255, 0.2) !important;
        transition: background-color 200ms ease;
      }
      .rag-text-highlight:hover {
        background-color: rgba(0, 140, 255, 0.45) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function clearHighlights() {
    // Clear text-level highlights
    document.querySelectorAll('.rag-text-highlight').forEach(span => {
      span.classList.remove('rag-text-highlight');
      span.style.backgroundColor = '';
      span.style.borderRadius = '';
    });
    
    if (state.highlights && state.highlights.size) {
      const removed = Array.from(state.highlights.keys());
      state.highlights.clear();
      try { parent.postMessage({ type: 'highlight:event', event: 'highlight:removed', data: { ids: removed } }, '*'); } catch {}
    }
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

  /**
   * Apply text-level highlighting by finding and marking actual text spans
   * Uses PDF.js text layer for precise text highlighting (not box overlays)
   */
  async function applyChunkHighlight(app, payload) {
    ensureStyle();
    const isFirstApplication = !state.lastPayload || state.lastPayload !== payload;
    state.lastPayload = payload;
    // Skip the old box layer display logic - we're using text-level highlighting
    // if (!state.enabled) { setLayersDisplay('none'); return; }
    
    clearHighlights();
    
    if (!app || !app.pdfDocument || !payload || !payload.highlights) return;
    
    const highlights = payload.highlights;
    const collected = [];
    
    for (const highlight of highlights) {
      const pageNum = highlight.page || 1;
      const pageIndex = pageNum - 1;
      const bbox = highlight.bbox;
      const chunkText = highlight.text || '';
      
      if (!bbox || !isFinite(bbox.x) || !isFinite(bbox.y) || !isFinite(bbox.width) || !isFinite(bbox.height)) {
        continue;
      }
      
      const pageView = app.pdfViewer.getPageView(pageIndex);
      if (!pageView || !pageView.div) continue;
      
      const pageDiv = pageView.div;
      
      // Wait for text layer to be ready with multiple retries
      let textLayerDiv = null;
      const maxRetries = 10;
      const retryDelay = 200; // ms
      
      for (let retry = 0; retry < maxRetries; retry++) {
        if (pageView.textLayer && pageView.textLayer.div) {
          textLayerDiv = pageView.textLayer.div;
          break;
        }
        
        if (retry === 0) {
          console.warn(`⚠️ Text layer not ready on page ${pageNum}, waiting...`);
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
      
      if (!textLayerDiv) {
        console.error(`❌ Text layer still not ready on page ${pageNum} after ${maxRetries} retries, skipping`);
        continue;
      }
      
      // Find text spans that overlap with the bounding box
      const textSpans = Array.from(textLayerDiv.querySelectorAll('span'));
      let highlightedCount = 0;
      
      for (const span of textSpans) {
        const rect = span.getBoundingClientRect();
        const layerRect = textLayerDiv.getBoundingClientRect();
        
        // Convert to relative coordinates
        const spanX = rect.left - layerRect.left;
        const spanY = rect.top - layerRect.top;
        const spanRight = spanX + rect.width;
        const spanBottom = spanY + rect.height;
        
        // Check if this span overlaps with the highlight bbox
        const overlapsX = spanX < (bbox.x + bbox.width) && spanRight > bbox.x;
        const overlapsY = spanY < (bbox.y + bbox.height) && spanBottom > bbox.y;
        
        if (overlapsX && overlapsY) {
          // Apply highlight styling directly to the text span
          span.classList.add('rag-text-highlight');
          span.style.backgroundColor = 'rgba(0, 140, 255, 0.35)';
          span.style.borderRadius = '2px';
          highlightedCount++;
        }
      }
      
      // FIXED: Only scroll on FIRST application, not on re-renders
      if (isFirstApplication && collected.length === 0 && isFinite(bbox.y)) {
        scrollToPageY(pageDiv, bbox.y, 0.35);
      }
      
      collected.push({ 
        page: pageNum, 
        y: Math.floor(bbox.y), 
        text: chunkText
      });
    }
    
    // Notify parent (unless silent mode is enabled)
    if (collected.length && !payload.silent) {
      try { 
        parent.postMessage({ 
          type: 'highlightMatches', 
          matches: collected, 
          prompt: 'RAG Sources' 
        }, '*'); 
      } catch {}
    }
  }

  function setupMessaging(app) {
    window.addEventListener('message', (e) => {
      const data = e.data || {};
      
      if (data.type === 'chunkHighlight') {
        // Use chunk-based highlighting with precise coordinates
        if (state.aiOverlayEnabled) {
          applyChunkHighlight(app, data);
        } else {
          console.warn('⚠️ AI overlay not enabled! Call enableAiOverlay first');
        }
      } else if (data.type === 'enableAiOverlay') {
        state.aiOverlayEnabled = true;
      } else if (data.type === 'clearHighlights') {
        state.lastPayload = null;
        clearHighlights();
      } else if (data.type === 'showAIHighlights') {
        // Force-enable AI highlight overlay visibility
        state.enabled = true;
        // DON'T show old box layers, we're using text-level highlighting now
        // setLayersDisplay('');  // REMOVED - this was showing old box overlays
        updateToggleButtonUI();
        if (state.lastPayload) {
          try { applyChunkHighlight(app, state.lastPayload); } catch {}
        }
      } else if (data.type === 'navigateToY') {
        const pageNumber = Number(data.page) || 1;
        const y = Number(data.y) || 0;
        navigateToY(app, pageNumber - 1, y);
      } else if (data.type === 'navigateToPage') {
        const pageNumber = Number(data.page) || 1;
        scrollPageIntoView(app, pageNumber - 1);
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
      // Just scroll to the Y position without creating overlays
      scrollToPageY(pageDiv, y, 0.35);
    } catch {}
  }

  function setupReflowHandling(app) {
    const bus = app && app.eventBus;
    if (!bus) return;
    const clearCacheAndReapply = () => {
      state.cache.clear();
      if (state.lastPayload && state.enabled) {
        // Delay slightly to allow pages to re-render
        setTimeout(() => applyChunkHighlight(app, state.lastPayload), 250);
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
      setTimeout(() => applyChunkHighlight(app, state.lastPayload), 0);
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
      if (state.enabled && state.lastPayload) {
        applyChunkHighlight(app, state.lastPayload);
      } else if (!state.enabled) {
        clearHighlights();
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
      }
    }, 50);
    setTimeout(() => clearInterval(iv), 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
  } else {
    initWhenReady();
  }
})();

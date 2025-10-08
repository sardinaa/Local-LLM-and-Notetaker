# Highlight Plugin Cleanup & Simplification Plan

**Date:** October 8, 2025  
**Status:** ✅ Text-level highlighting working  
**Goal:** Simplify code, remove unused features, improve maintainability

---

## Current State Analysis

### What's Working ✅
1. **Text-level highlighting** - Applies background color directly to PDF.js text spans
2. **Backend chunk matching** - Fuzzy word matching finds chunks in PDF (10 words, 60% threshold)
3. **Reference clicking** - Opens PDF and highlights the relevant text
4. **Dynamic top-k retrieval** - 2-5 references based on relevance (threshold 0.5)
5. **Scroll positioning** - Navigates to highlighted page (fixed infinite loop)

### What's NOT Used ❌
1. **Box overlay system** - Old approach using positioned divs (`ai-mark`, `ai-highlight-layer`)
2. **FCM formula detection** - `applyFcmHighlight()`, equation matching (lines ~265-305)
3. **Marker mode** - Manual text selection highlighting (`ai-marker-mode`)
4. **User highlights** - `.ai-role-user` styling and selection-based highlights
5. **Page caching system** - `state.cache` for text items (may still be used by other features)
6. **Selection region constraints** - `state.selectionRegion` for guided highlighting

---

## Cleanup Tasks

### Phase 1: Remove Debug Logging (Priority: High)
**Files:** `pdfjs-config/highlight-plugin.js`, `static/js/chat/sourceDisplay.js`

**Remove:**
- [ ] `📨 PDF viewer received message:` logs
- [ ] `🔵 Creating highlight on page` logs
- [ ] `🎯 chunkHighlight received` logs
- [ ] `📤 Sending to PDF viewer:` logs
- [ ] `🔍 Searching for text in page` logs
- [ ] `📐 Layer positioning:` logs
- [ ] `📝 Sample of first 3 text spans:` logs
- [ ] `✅ Highlighted N text spans` logs

**Keep:**
- [ ] `⚠️ Text layer not ready` warning
- [ ] `❌ Text layer still not ready` error

**Lines to clean:**
- `pdfjs-config/highlight-plugin.js`: ~352-377, ~418-425
- `static/js/chat/sourceDisplay.js`: ~192-213

---

### Phase 2: Remove Unused Box Overlay System (Priority: High)
**Files:** `pdfjs-config/highlight-plugin.js`

**Remove:**
- [ ] `getOrCreateLayer()` function (lines ~152-160)
- [ ] `.ai-highlight-layer` CSS (line ~66)
- [ ] `.ai-mark` CSS (line ~67)
- [ ] `.ai-role-user` CSS (line ~69)
- [ ] `.ai-role-ai` CSS (line ~70) - No longer needed
- [ ] `.ai-corner` CSS (lines ~71-73)
- [ ] `@keyframes ai-pulse` CSS (line ~74)
- [ ] Box layer creation in `clearHighlights()` (line ~93)
- [ ] `setLayersDisplay()` function (lines ~108-110)

**Keep:**
- [x] `.rag-text-highlight` CSS (lines ~77-84) - Used for text highlighting
- [x] `clearHighlights()` text span cleanup (lines ~95-99)

---

### Phase 3: Remove FCM Formula Detection (Priority: Medium)
**Files:** `pdfjs-config/highlight-plugin.js`

**Remove:**
- [ ] `applyFcmHighlight()` function (lines ~267-305)
- [ ] `buildFcmCandidatesOnPage()` function (lines ~225-265)
- [ ] `detectEquationNumberNear()` function (if exists)
- [ ] `groupItemsIntoLines()` function (if only used by FCM)
- [ ] `buildPageIndex()` function (if only used by FCM)
- [ ] FCM-related message handler (search for `'fcm'` or `'formula'`)

**Investigate:**
- [ ] Is `state.cache` used anywhere else?
- [ ] Can we remove page caching entirely?

---

### Phase 4: Remove Manual Marker Mode (Priority: Medium)
**Files:** `pdfjs-config/highlight-plugin.js`

**Remove:**
- [ ] `state.markerActive` flag
- [ ] `state.markerBtn` reference
- [ ] `setMarkerActive()` function
- [ ] `.ai-marker-mode` CSS (line ~75)
- [ ] `'highlight:activate'` message handler
- [ ] `'highlight:deactivate'` message handler
- [ ] Marker button UI code (search for `markerBtn`)
- [ ] All `.ai-role-user` highlight creation code

**Files to check:**
- [ ] `static/js/chat/document_action/controller.js` - Remove marker activation
- [ ] UI templates - Remove marker mode buttons

---

### Phase 5: Remove Selection-Based Highlighting (Priority: Low)
**Files:** `pdfjs-config/highlight-plugin.js`

**Remove:**
- [ ] `state.selectionRegion` 
- [ ] `drawSelectionOnly()` function
- [ ] `'highlightSelectionOnly'` message handler
- [ ] `'selection:navigate'` message handler
- [ ] Selection constraint logic in remaining functions

---

### Phase 6: Simplify Message Handling (Priority: High)
**Current:** Multiple message types, some unused  
**Goal:** Keep only what's needed for RAG highlighting

**Keep:**
```javascript
- 'enableAiOverlay'    // Enable highlighting system
- 'chunkHighlight'     // Apply text-level highlights
- 'clearHighlights'    // Remove all highlights
- 'navigateToPage'     // Scroll to page
```

**Remove:**
```javascript
- 'showAIHighlights'   // Redundant with chunkHighlight
- 'highlight:activate' // Marker mode
- 'highlight:deactivate' // Marker mode
- 'highlightSelectionOnly' // Selection-based
- 'selection:navigate' // Selection-based
```

---

### Phase 7: Simplify State Management (Priority: Medium)
**Current state object:**
```javascript
{
  lastPayload: null,           // ✅ Keep - prevents re-application
  cache: new Map(),            // ❌ Remove if unused
  enabled: true,               // ❌ Remove - always enabled
  toggleBtn: null,             // ❌ Remove if no toggle
  markerActive: false,         // ❌ Remove - marker mode
  markerBtn: null,             // ❌ Remove - marker mode
  highlights: new Map(),       // ❓ Check usage
  pendingNav: null,            // ❓ Check usage
  aiOverlayEnabled: false,     // ✅ Keep - controls highlighting
  selectionRegion: null        // ❌ Remove - selection mode
}
```

**Simplified state:**
```javascript
{
  lastPayload: null,
  aiOverlayEnabled: false
}
```

---

### Phase 8: Remove Unused Helper Functions (Priority: Low)

**Audit these functions:**
- [ ] `dedupeTerms()` - Still used?
- [ ] `splitPromptToTerms()` - Used for what?
- [ ] `buildTermsFromHighlights()` - Text search? Remove?
- [ ] `scrollToPageY()` - ✅ Keep - used for navigation
- [ ] `updateToggleButtonUI()` - Remove if no toggle button

---

## Estimated Code Reduction

| Category | Current Lines | After Cleanup | Reduction |
|----------|---------------|---------------|-----------|
| Debug logs | ~50 | ~5 | -90% |
| Box overlays | ~100 | 0 | -100% |
| FCM detection | ~150 | 0 | -100% |
| Marker mode | ~200 | 0 | -100% |
| Selection mode | ~100 | 0 | -100% |
| Unused helpers | ~50 | ~10 | -80% |
| **Total** | **~1013 lines** | **~400 lines** | **-60%** |

---

## Implementation Order

### Week 1: Quick Wins
1. ✅ Remove debug logs (1 hour)
2. ✅ Remove box overlay CSS and functions (2 hours)
3. ✅ Test that highlighting still works

### Week 2: Feature Removal
4. ✅ Remove FCM formula detection (2 hours)
5. ✅ Remove marker mode (3 hours)
6. ✅ Simplify message handlers (1 hour)
7. ✅ Test all RAG highlighting workflows

### Week 3: Deep Cleanup
8. ✅ Remove selection-based highlighting (2 hours)
9. ✅ Simplify state management (1 hour)
10. ✅ Remove unused helper functions (2 hours)
11. ✅ Final testing and documentation update

---

## Testing Checklist

After each cleanup phase:
- [ ] Click reference icon in RAG chat
- [ ] Verify text-level highlighting appears (blue background on text)
- [ ] Verify correct page navigation
- [ ] Verify multiple highlights work
- [ ] Verify clearing highlights works
- [ ] Check browser console for errors
- [ ] Test with different PDF files

---

## Files to Modify

### High Priority
1. `pdfjs-config/highlight-plugin.js` - Main cleanup
2. `static/js/chat/sourceDisplay.js` - Remove debug logs
3. `config/setup_pdfjs.sh` - Ensure copying works

### Medium Priority
4. `static/js/chat/document_action/controller.js` - Remove marker mode
5. `services/retrieval/document_highlight_service.py` - Keep as-is (working well)

### Low Priority
6. UI templates - Remove marker buttons if they exist
7. Documentation - Update after cleanup

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Break existing highlighting | Low | High | Test after each phase |
| Remove needed code | Medium | Medium | Audit usage before removal |
| Break other features | Low | Medium | Search for function usage first |
| Introduce bugs | Low | Medium | Keep git commits small |

---

## Documentation Updates Needed

After cleanup:
1. Update `TEXT_LEVEL_HIGHLIGHTING.md` - Remove references to box overlays
2. Update `COMPLETE_HIGHLIGHTING_FIX_SUMMARY.md` - Add cleanup section
3. Create `HIGHLIGHT_PLUGIN_ARCHITECTURE.md` - Document final simplified version
4. Update inline code comments - Remove outdated explanations

---

## Future Enhancements (Post-Cleanup)

Once code is clean:
- [ ] Add multiple highlight colors (different sources = different colors)
- [ ] Add "jump to next/previous highlight" navigation
- [ ] Add highlight persistence across page reloads
- [ ] Add animation when highlights appear
- [ ] Export highlighted text as annotations
- [ ] Support highlighting across multiple pages

---

## Success Criteria

✅ Cleanup is successful when:
1. Code reduced by >50% (from ~1013 to ~400 lines)
2. All RAG highlighting features still work
3. No console errors
4. No unused functions remain
5. State management is simple and clear
6. Code is well-documented
7. All tests pass

---

## Commands for Quick Testing

```bash
# After each cleanup phase:
cd /home/sardina/Documents/Portfolio/LLM-Notetaker

# 1. Copy updated plugin to static folder
bash config/setup_pdfjs.sh

# 2. Rebuild frontend
npm run build

# 3. Hard refresh browser (Ctrl+Shift+R)

# 4. Test highlighting in RAG chat
```

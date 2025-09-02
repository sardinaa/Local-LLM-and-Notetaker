/**
 * Enhanced Document Actions Manager
 * Provides contextual document analysis actions in a minimalistic floating UI
 */
class DocumentActionsManager {
    constructor() {
        this.actionsBar = null;
        this.currentDocument = null;
        this.isVisible = false;
        this.isFileViewerOpen = false;
        this.actions = this.getActionDefinitions();
        this.init();
    }

    init() {
        this.createActionsBar();
        this.setupEventListeners();
        this.observeFileViewer();
        this.setupPdfHighlightSync();
        this.currentHighlightRef = null;
        this._docHashCache = null;
    }

    getActionDefinitions() {
        return [
            {
                id: 'summarize',
                icon: '∑',
                label: 'Summary',
                tooltip: 'Generate document summary',
                prompt: (docName) => `Please provide a comprehensive summary of "${docName}". Include the main topics, key findings, and overall purpose.`
            },
            {
                id: 'key-points',
                icon: '📋',
                label: 'Points',
                tooltip: 'Extract key points',
                prompt: (docName) => `Extract the most important key points and highlights from "${docName}". Focus on actionable insights and critical information.`
            },
            {
                id: 'highlight',
                icon: '✦',
                label: 'Highlight',
                tooltip: 'Highlight document (AI-assisted). Use chat to specify what to highlight.',
                special: true
            },
            {
                id: 'expand',
                icon: '✨',
                label: 'Expand',
                tooltip: 'Quickly expand the selected text',
                // Quick response: expand selected passage only
                prompt: () => `Expand and enrich the selected passage while preserving its meaning and tone. Add clarifying context, concrete examples, brief definitions of terms, and smooth transitions. Return a revised version of the passage that integrates the additions inline.`
            },
            {
                id: 'references',
                icon: '🔗',
                label: 'Refs',
                tooltip: 'Find references and citations',
                prompt: (docName) => `Find and list all references, citations, sources, and external links mentioned in "${docName}".`
            },
            {
                id: 'insights',
                icon: '💡',
                label: 'Ideas',
                tooltip: 'Generate insights and connections',
                prompt: (docName) => `Analyze "${docName}" and provide insights on how this connects to other knowledge areas. Suggest ways to expand or build upon these ideas.`
            },
            {
                id: 'ask',
                icon: '?',
                label: 'Ask',
                tooltip: 'Explain the selected passage (quick)',
                // Quick response: explain selection succinctly
                prompt: () => `Explain the selected passage clearly. Cover the main idea, why it matters, and any underlying assumptions. Define key terms briefly and avoid repeating the text verbatim.`
            }
        ];
    }

    createActionsBar() {
        const actionsHTML = `
            <div class="document-actions-bar" id="documentActionsBar">
                <div class="document-context-indicator" id="docContextIndicator">
                    Document
                </div>
                ${this.actions.map(action => `
                    <button class="doc-action-btn" 
                            data-action="${action.id}"
                            ${action.id === 'highlight' ? 'id="highlightDocumentBtn"' : ''}
                            title="${action.tooltip}">
                        <span class="icon">${action.icon}</span>
                        <span class="label">${action.label}</span>
                    </button>
                `).join('')}
            </div>
        `;

        // Insert into chat input area for proper relative positioning
        const chatInputArea = document.querySelector('.chat-input-area');
        if (chatInputArea) {
            chatInputArea.insertAdjacentHTML('afterbegin', actionsHTML);
            this.actionsBar = document.getElementById('documentActionsBar');
            
            // Add responsive behavior
            this.setupResponsiveBehavior();
        } else {
            // Fallback to body if area not found
            document.body.insertAdjacentHTML('beforeend', actionsHTML);
            this.actionsBar = document.getElementById('documentActionsBar');
        }
    }

    setupEventListeners() {
        if (!this.actionsBar) return;

        // Handle action button clicks
        this.actionsBar.addEventListener('click', (e) => {
            const button = e.target.closest('.doc-action-btn');
            if (!button || button.classList.contains('loading')) return;

            const actionId = button.dataset.action;
            const action = this.actions.find(a => a.id === actionId);
            if (action) {
                this.handleAction(action, button);
            }
        });

        // Listen for document selection from file viewer
        document.addEventListener('documentSelected', (e) => {
            this.setCurrentDocument(e.detail);
        });

        // Listen for file viewer state changes
        document.addEventListener('fileViewerStateChanged', (e) => {
            this.setFileViewerState(e.detail.isOpen);
        });

        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.isVisible && e.altKey && !e.ctrlKey && !e.metaKey) {
                const actionIndex = parseInt(e.key) - 1;
                if (actionIndex >= 0 && actionIndex < this.actions.length) {
                    e.preventDefault();
                    const button = this.actionsBar.querySelector(`[data-action="${this.actions[actionIndex].id}"]`);
                    if (button) button.click();
                }
            }
        });
    }

    observeFileViewer() {
        // Observe the file viewer for visibility changes
        // Updated to target the correct panel element id
        const fileViewer = document.getElementById('fileViewerPanel');
        if (fileViewer) {
            const computeOpen = () => {
                const classHidden = fileViewer.classList.contains('is-hidden');
                const display = window.getComputedStyle(fileViewer).display;
                return !classHidden && display !== 'none';
            };

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
                        this.setFileViewerState(computeOpen());
                    }
                }
            });

            observer.observe(fileViewer, {
                attributes: true,
                attributeFilter: ['class', 'style']
            });

            // Check initial state
            this.setFileViewerState(computeOpen());
        }
    }

    setCurrentDocument(document) {
        this.currentDocument = document;
        this.updateContextIndicator();
        this.updateVisibility();
        // Attempt to restore last saved selection for quick navigation
        this.restoreLastSelectionForDoc();
    }

    setFileViewerState(isOpen) {
        this.isFileViewerOpen = isOpen;
        this.updateVisibility();
    }

    updateContextIndicator() {
        const indicator = document.getElementById('docContextIndicator');
        if (indicator && this.currentDocument) {
            const shortName = this.currentDocument.filename.length > 12 
                ? this.currentDocument.filename.substring(0, 9) + '...'
                : this.currentDocument.filename;
            indicator.textContent = shortName;
        }
    }

    updateVisibility() {
        // Show the actions bar whenever the file viewer is open.
        // If no document is selected yet, actions that require a document
        // will no-op, but the bar remains visible for discoverability.
        const shouldShow = this.isFileViewerOpen;

        if (shouldShow && !this.isVisible) {
            this.show();
        } else if (!shouldShow && this.isVisible) {
            this.hide();
        }
    }

    restoreLastSelectionForDoc() {
        try {
            if (!this.currentDocument) return;
            const key = `docSelections:${this.getDocId()}`;
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            if (!Array.isArray(arr) || arr.length === 0) return;
            const last = arr[arr.length - 1];
            const meta = { page: last.page, anchor: last.anchor, rects: last.rects || [] };
            this.postToPdfViewer({ type: 'selection:navigate', meta });
        } catch (e) { /* ignore */ }
    }

    async handleAction(action, button) {
        if (!this.currentDocument) return;

        // Handle special actions (like highlight)
        if (action.special) {
            this.handleSpecialAction(action, button);
            return;
        }

        // Require a selection for quick Expand/Ask actions
        if ((action.id === 'expand' || action.id === 'ask') && !(this.currentHighlightRef && this.currentHighlightRef.page)) {
            this.showBriefFeedback(button, '!');
            const chatInput = document.querySelector('#chatInput');
            if (chatInput) {
                chatInput.focus();
                chatInput.placeholder = 'Select text in the PDF first…';
            }
            // Optionally nudge the PDF viewer into selection mode
            try { this.postToPdfViewer({ type: 'highlight:activate' }); } catch {}
            return;
        }

        // Single smooth animation - just show brief success feedback
        this.showBriefFeedback(button, '✓');

        try {
            // Ensure highlight mode doesn't intercept this send
            if (window.documentHighlightingEnabled) {
                const highlightBtn = document.querySelector('[data-action="highlight"]');
                this.disableHighlightMode(highlightBtn);
            }
            let prompt = action.prompt(this.currentDocument.filename);
            // If we have an active selection reference from PDF, scope and constrain output
            if (this.currentHighlightRef && this.currentHighlightRef.page) {
                // Ensure doc hash cached so docId includes version
                try { await this.computeAndCacheDocHash(); } catch (e) {}
                const ref = this.currentHighlightRef;
                const shortQuote = (ref.anchor || '').toString().normalize('NFC').slice(0, 120);
                const selectionText = (ref.text || ref.anchor || '').toString().normalize('NFC').slice(0, 4000);
                const constraints = this.buildConciseConstraints(action.id);
                const hiddenSelection = selectionText ? `
[SELECTION]
${selectionText}
[/SELECTION]` : '';
                prompt = `${prompt}

Context: Only use the user-selected highlight (page ${ref.page}).
Anchor: "${shortQuote}"${hiddenSelection}
${constraints}`;
            }
            const hasSel = !!(this.currentHighlightRef && this.currentHighlightRef.page);
            // Always show the compact action label only; if there's a selection, we'll add a Jump pill next to it in chat.js
            const displayLabel = `${action.label}`;
            const selectionRef = hasSel ? { ...this.currentHighlightRef, docId: this.getDocId(), docHash: this.getCachedDocHash(window.currentChatId || 'default', (this.currentDocument && this.currentDocument.filename) || 'unknown') } : null;
            await this.insertPromptToChat(prompt, action.interactive, { displayLabel, selectionRef });
            
        } catch (error) {
            console.error('Action failed:', error);
            // Show error feedback only if the action actually failed
            this.showBriefFeedback(button, '✗');
        }
    }

    buildConciseConstraints(actionId) {
        // Default tight constraints for short selections (one page or less)
        const common = [
            '- Keep it concise and non-repetitive.',
            '- Avoid restating the full text; synthesize only.',
        ];
        if (actionId === 'expand') {
            return `Constraints:\n- Return a revised, expanded passage.\n- Preserve original meaning, tone, and person.\n- About 1.5–3× the original length.\n- Keep formatting and line breaks sensible.\n${common.join('\n')}`;
        }
        if (actionId === 'ask') {
            return `Constraints:\n- Explain plainly in ≤ 150 words.\n- Define key terms briefly.\n${common.join('\n')}`;
        }
        if (actionId === 'key-points') {
            return `Constraints:\n- Return at most 5 bullet points.\n- Each bullet ≤ 12 words.\n${common.join('\n')}`;
        }
        if (actionId === 'insights') {
            return `Constraints:\n- Return at most 4 bullet points.\n- Each bullet ≤ 16 words.\n${common.join('\n')}`;
        }
        if (actionId === 'references') {
            return `Constraints:\n- Return at most 5 items.\n- Use one terse line per item.\n${common.join('\n')}`;
        }
        // summarize or other
        return `Constraints:\n- ≤ 120 words total.\n${common.join('\n')}`;
    }

    handleSpecialAction(action, button) {
        if (action.id === 'highlight') {
            // Check if highlight mode is already active
            if (window.documentHighlightingEnabled || document.querySelector('.highlight-pill')) {
                // If active, disable it
                this.disableHighlightMode(button);
            } else {
                // If not active, enable it
                this.enableHighlightMode(button);
            }
        } else if (action.id === 'ask') {
            // Single feedback animation for ask action
            this.showBriefFeedback(button, '✓');
            this.enableAskMode();
        } else if (action.id === 'expand') {
            // Guided expansion around current selection
            if (!this.currentHighlightRef || !this.currentHighlightRef.page) {
                // No anchor selection yet — hint the user
                this.showBriefFeedback(button, '!');
                const chatInput = document.querySelector('#chatInput');
                if (chatInput) {
                    chatInput.focus();
                    chatInput.placeholder = 'Select text in the PDF first, then click Expand…';
                }
                return;
            }
            this.showBriefFeedback(button, '✓');
            this.enableGuidedExpansionMode(button);
        }
    }

    enableGuidedExpansionMode(button) {
        // Avoid duplicates
        if (document.querySelector('.expand-pill')) return;

        // Mark guided expansion globally for chat interception
        window.guidedExpansionEnabled = true;

        const chatWrapper = document.querySelector('.chat-input-wrapper');
        if (!chatWrapper) return;

        const pill = document.createElement('div');
        pill.className = 'expand-pill';
        pill.innerHTML = `
            <div class="pill-icon wand"></div>
            <span class="pill-text">Expand around anchor</span>
            <button class="pill-close" title="Cancel">&times;</button>
        `;

        const inputButtonsLeft = chatWrapper.querySelector('.input-buttons-left');
        if (inputButtonsLeft) inputButtonsLeft.insertAdjacentElement('afterend', pill);
        else chatWrapper.prepend(pill);

        const closeBtn = pill.querySelector('.pill-close');
        closeBtn.addEventListener('click', () => this.disableGuidedExpansionMode(pill));

        const chatInput = document.querySelector('#chatInput');
        if (chatInput) {
            chatInput.focus();
            chatInput.placeholder = "Type what to expand (e.g. 'evidence near this claim')…";
        }
    }

    disableGuidedExpansionMode(pillEl = null) {
        window.guidedExpansionEnabled = false;
        const chatInput = document.querySelector('#chatInput');
        if (chatInput) chatInput.placeholder = 'Type your message...';
        const pill = pillEl || document.querySelector('.expand-pill');
        if (pill) {
            pill.style.opacity = '0';
            pill.style.transform = 'translateY(-10px)';
            setTimeout(() => pill.remove(), 180);
        }
    }

    enableHighlightMode(button, opts = {}) {
        // Check if pill already exists for AI mode
        if (document.querySelector('.highlight-pill')) {
            return;
        }

        // Set button to selected state with checkmark ONLY
        if (button) {
            button.innerHTML = `<span class="icon">✓</span>`;
            button.classList.add('selected');
        }

        const chatWrapper = document.querySelector('.chat-input-wrapper');
        if (!chatWrapper) {
            console.error('Chat input wrapper not found');
            return;
        }

        // Create AI highlight pill with distinct style
        const pill = document.createElement('div');
        pill.className = 'highlight-pill';
        pill.innerHTML = `
            <div class="pill-icon"></div>
            <span class="pill-text">AI Highlighter on</span>
            <button class="pill-close" title="Cancel">&times;</button>
        `;

        // Insert pill right after the input-buttons-left in the chat wrapper
        const inputButtonsLeft = chatWrapper.querySelector('.input-buttons-left');
        if (inputButtonsLeft) {
            // Insert after the left buttons
            inputButtonsLeft.insertAdjacentElement('afterend', pill);
        } else {
            // Fallback: prepend to chat wrapper
            chatWrapper.prepend(pill);
        }

        // Set global AI highlighting state (separate from guided selection toggle)
        window.documentHighlightingEnabled = true;

        // Setup event listeners with reference to the button
        this.setupPillEventListeners(pill, button);

        // Focus chat input and update placeholder
        const chatInput = document.querySelector('#chatInput');
        if (chatInput) {
            chatInput.focus();
            chatInput.placeholder = "Type what you want to highlight (e.g. 'key findings', 'methodology')...";
        }
    }

    enableAskMode() {
        // Focus chat input and change placeholder
        const chatInput = document.querySelector('#chatInput');
        if (chatInput) {
            chatInput.focus();
            chatInput.placeholder = "Ask a question about the document...";
        }
    }

    disableHighlightMode(button, opts = {}) {
        // Remove AI highlighting state
        window.documentHighlightingEnabled = false;
        
        // Reset button to original state (distinct icon from PDF viewer)
        if (button) {
            button.innerHTML = `<span class="icon">✦</span><span class="label">Highlight</span>`;
            button.classList.remove('selected');
        }
        
        // Do not toggle PDF viewer marker here; only clean up UI state.

        // Reset chat input placeholder
        const chatInput = document.querySelector('#chatInput');
        if (chatInput) {
            chatInput.placeholder = "Type your message...";
        }
        
        // Find and remove existing AI highlight pill
        const pill = document.querySelector('.highlight-pill');
        if (pill) {
            this.closePill(pill, button);
        }
    }

    setupPillEventListeners(pill, highlightButton) {
        const closeBtn = pill.querySelector('.pill-close');

        // Handle close action
        closeBtn.addEventListener('click', () => {
            this.closePill(pill, highlightButton);
        });
    }

    showGuidedSelectionPill(meta) {
        // Create or update a single guided pill reflecting anchor state
        window.guidedSelectionActive = true;
        const chatWrapper = document.querySelector('.chat-input-wrapper');
        if (!chatWrapper) return;
        let pill = document.querySelector('.guided-pill');
        if (!pill) {
            pill = document.createElement('div');
            pill.className = 'guided-pill expand-pill';
            pill.innerHTML = `
                <div class="pill-icon selection-icon" title="Selection"></div>
                <button class="pill-close" title="Clear">&times;</button>
            `;
            const left = chatWrapper.querySelector('.input-buttons-left');
            if (left) left.insertAdjacentElement('afterend', pill); else chatWrapper.prepend(pill);
            const closeBtn = pill.querySelector('.pill-close');
            closeBtn.addEventListener('click', () => {
                try { pill.remove(); } catch {}
                window.guidedSelectionActive = false;
                // Also deactivate guided selection in the PDF viewer toolbar
                try { this.postToPdfViewer({ type: 'highlight:deactivate' }); } catch {}
            });
        }
        // Do not set state here; caller decides (activated -> light, created -> dark)
        const chatInput = document.querySelector('#chatInput');
        if (chatInput) {
            chatInput.focus();
            chatInput.placeholder = 'Type query…';
        }
    }

    updateGuidedPillState(hasSelection) {
        const pill = document.querySelector('.guided-pill');
        if (!pill) return;
        pill.classList.toggle('on', !!hasSelection);
        pill.classList.toggle('off', !hasSelection);
    }

    closePill(pill, highlightButton = null) {
        // Remove AI highlighting state only if closing the AI pill
        if (pill && pill.classList.contains('highlight-pill')) {
            window.documentHighlightingEnabled = false;
        }

        // If closing guided selection pill, deactivate viewer marker mode too
        if (pill && pill.classList.contains('guided-pill')) {
            window.guidedSelectionActive = false;
            try { this.postToPdfViewer({ type: 'highlight:deactivate' }); } catch {}
        }
        
        // Reset highlight button to unselected state
        if (highlightButton) {
            highlightButton.innerHTML = `<span class="icon">✦</span><span class="label">Highlight</span>`;
            highlightButton.classList.remove('selected');
        } else {
            // Find highlight button if not provided
            const highlightBtn = document.querySelector('[data-action="highlight"]');
            if (highlightBtn) {
                highlightBtn.innerHTML = `<span class="icon">✦</span><span class="label">Highlight</span>`;
                highlightBtn.classList.remove('selected');
            }
        }
        
        // Reset chat input placeholder
        const chatInput = document.querySelector('#chatInput');
        if (chatInput) {
            chatInput.placeholder = "Type your message...";
        }
        
        // Remove pill with animation
        pill.style.opacity = '0';
        pill.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            if (pill.parentNode) {
                pill.parentNode.removeChild(pill);
            }
        }, 200);
    }

    setupPdfHighlightSync() {
        window.addEventListener('message', (e) => {
            const data = e.data || {};
            if (data.type !== 'highlight:event') return;
            if (data.event === 'highlight:activated') {
                // Viewer marker toggled on: show a guided pill in light state
                const hasPill = document.querySelector('.guided-pill');
                if (!hasPill) {
                    this.showGuidedSelectionPill({});
                }
                this.updateGuidedPillState(false);
                window.guidedSelectionActive = true;
            } else if (data.event === 'highlight:deactivated') {
                // Viewer marker toggled off: remove guided pill entirely
                const pill = document.querySelector('.guided-pill');
                if (pill) { try { pill.remove(); } catch {} }
                window.guidedSelectionActive = false;
            } else if (data.event === 'highlight:created' && data.data) {
                this.currentHighlightRef = data.data; // {id, role, page, anchor, rects, createdAt}
                // Persist selection for this document (with hash)
                this.saveSelection(this.currentHighlightRef);
                window.dispatchEvent(new CustomEvent('selection:saved', { detail: { selection: this.currentHighlightRef } }));
                // Make actions clearly scoped in UI (brief feedback)
                const actionsBar = this.actionsBar;
                if (actionsBar) {
                    actionsBar.classList.add('has-selection');
                    setTimeout(() => actionsBar.classList.remove('has-selection'), 1200);
                }
                const guided = document.querySelector('.guided-pill');
                if (!guided) this.showGuidedSelectionPill(this.currentHighlightRef);
                this.updateGuidedPillState(true);
            } else if (data.event === 'highlight:removed') {
                // A selection highlight was removed (e.g., cleared). Reflect light state if pill exists.
                if (document.querySelector('.guided-pill')) {
                    this.updateGuidedPillState(false);
                }
            }
        });

        // Handle navigation, matches, and missing selection notices from the viewer
        window.addEventListener('message', (e) => {
            const data = e.data || {};
            if (data.type === 'selection:navigate') {
                // Could add telemetry or UI feedback here
            } else if (data.type === 'selection:missing') {
                // Soft warning and offer to re-anchor via nearest match
                if (window.modalManager) {
                    window.modalManager.showToast({
                        message: 'Selection could not be located. You can re-anchor by selecting nearest text.',
                        type: 'warning',
                        duration: 3000
                    });
                }
            } else if (data.type === 'selection:reanchored' && data.data) {
                // Persist updated selection and notify
                const meta = data.data;
                this.saveSelection(meta);
                if (window.modalManager) {
                    window.modalManager.showToast({
                        message: `Selection re-anchored to page ${meta.page}.`,
                        type: 'success', duration: 2500
                    });
                }
            } else if (data.type === 'highlightMatches' && Array.isArray(data.matches)) {
                // Route to math-specific or general highlight references based on payload shape
                const isMath = data.matches.some(m => m && (m.eq || m.tag === 'math'));
                if (isMath) {
                    this.showMathReferencesInChat(data.matches);
                } else {
                    this.showHighlightReferencesInChat(data.matches, data.prompt || '', data.filename || '');
                }
            }
        });
    }

    showHighlightReferencesInChat(matches, prompt = '', filename = '') {
        try {
            const chatMessages = document.getElementById('chatMessages');
            if (!chatMessages) return;

            const normalized = (Array.isArray(matches) ? matches : [])
                .filter(m => m && (m.page != null) && (m.y != null));
            if (!normalized.length) return;

            // Cache last refs for navigation purposes
            this.lastHighlightRefs = normalized.slice();

            const key = 'hi:' + normalized.map(m => `${m.page||''}:${Math.round(Number(m.y)||0)}`).join('|') + `:${(prompt||'').slice(0,40)}`;

            const safeFilename = this.escapeHtml(filename || (this.currentDocument && this.currentDocument.filename) || 'document');
            const html = `
                <div class="chat-icon"><i class="fas fa-robot"></i></div>
                <div class="chat-text">Highlights in <strong>${safeFilename}</strong></div>
                <div class="response-actions"></div>
            `;

            const existing = chatMessages.querySelector(`.chat-message.bot[data-kind="highlight-references"][data-key="${CSS.escape(key)}"]`);
            if (existing) {
                existing.innerHTML = html;
                existing.querySelectorAll('.highlight-ref').forEach(a => {
                    a.addEventListener('click', (ev) => {
                        ev.preventDefault();
                    const page = Number(a.dataset.page||'1');
                    const y = Number(a.dataset.y||'0');
                    this.postToPdfViewer({ type: 'showAIHighlights' });
                    this.postToPdfViewer({ type: 'enableAiOverlay' });
                    this.postToPdfViewer({ type: 'navigateToY', page, y });
                });
                });
                // Insert pill-style Jump inside chat-text (like quick response)
                try {
                    const chatText = existing.querySelector('.chat-text');
                    if (chatText) {
                        const labelWrap = document.createElement('span');
                        labelWrap.className = 'chat-text-label';
                        labelWrap.innerHTML = chatText.innerHTML;
                        chatText.innerHTML = '';
                        chatText.appendChild(labelWrap);
                        const jump = document.createElement('a');
                        jump.href = '#';
                        jump.className = 'selection-jump';
                        jump.title = 'Jump to highlights';
                        jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                        chatText.appendChild(jump);
                        chatText.classList.add('has-jump');
                        const first = normalized[0];
                        jump.addEventListener('click', (ev) => {
                            ev.preventDefault();
                            if (!first) return;
                            this.postToPdfViewer({ type: 'showAIHighlights' });
                            this.postToPdfViewer({ type: 'enableAiOverlay' });
                            this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                        });
                    }
                } catch {}
                chatMessages.scrollTop = chatMessages.scrollHeight;
                return;
            }

            // Persist via chat system so the response is saved, then enrich with pill UI
            try {
                document.dispatchEvent(new CustomEvent('chat:add-bot-message', {
                    detail: { text: `Highlights in **${safeFilename}**`, kind: 'highlight-references', key }
                }));
                setTimeout(() => {
                    try {
                        const el = document.querySelector(`.chat-message.bot[data-kind="highlight-references"][data-key="${CSS.escape(key)}"]`);
                        if (!el) return;
                        el.innerHTML = html;
                        const chatText = el.querySelector('.chat-text');
                        if (chatText) {
                            const labelWrap = document.createElement('span');
                            labelWrap.className = 'chat-text-label';
                            labelWrap.innerHTML = chatText.innerHTML;
                            chatText.innerHTML = '';
                            chatText.appendChild(labelWrap);
                            const jump = document.createElement('a');
                            jump.href = '#';
                            jump.className = 'selection-jump';
                            jump.title = 'Jump to highlights';
                            jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                            chatText.appendChild(jump);
                            chatText.classList.add('has-jump');
                            const first = normalized[0];
                            jump.addEventListener('click', (ev) => {
                                ev.preventDefault();
                                if (!first) return;
                                this.postToPdfViewer({ type: 'showAIHighlights' });
                                this.postToPdfViewer({ type: 'enableAiOverlay' });
                                this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                            });
                        }
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    } catch {}
                }, 60);
            } catch {}
            return;

            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message bot';
            msgDiv.dataset.kind = 'highlight-references';
            msgDiv.dataset.key = key;
            msgDiv.innerHTML = html;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Insert pill-style Jump inside chat-text (like quick response)
            try {
                const chatText = msgDiv.querySelector('.chat-text');
                if (chatText) {
                    const labelWrap = document.createElement('span');
                    labelWrap.className = 'chat-text-label';
                    labelWrap.innerHTML = chatText.innerHTML;
                    chatText.innerHTML = '';
                    chatText.appendChild(labelWrap);
                    const jump = document.createElement('a');
                    jump.href = '#';
                    jump.className = 'selection-jump';
                    jump.title = 'Jump to highlights';
                    jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                    chatText.appendChild(jump);
                    chatText.classList.add('has-jump');
                    const first = normalized[0];
                    jump.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        if (!first) return;
                        this.postToPdfViewer({ type: 'enableAiOverlay' });
                        this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                    });
                }
            } catch {}
        } catch (e) { console.warn('showHighlightReferencesInChat failed', e); }
    }

    showMathReferencesInChat(matches) {
        try {
            const chatMessages = document.getElementById('chatMessages');
            if (!chatMessages) return;

            const normalized = (Array.isArray(matches) ? matches : [])
                .filter(m => m && (m.page || m.eq));
            if (!normalized.length) return;

            // Build a signature key based on refs to prevent duplicates on refresh
            const key = 'math:' + normalized.map(m => `${m.eq || 'Eq.'}:${m.page || ''}:${m.y || 0}`).join('|');

            const items = normalized
                .slice(0, 5)
                .map((m, idx) => {
                    const label = `${m.eq || 'Eq.'}`.replace(/\s+/g, ' ');
                    const page = m.page ? `p. ${m.page}` : '';
                    const id = `mathref-${Date.now()}-${idx}`;
                    return `<a href="#" class="math-ref" data-page="${m.page||''}" data-y="${m.y||0}" id="${id}">${this.escapeHtml(label)}${page ? ' — ' + page : ''}</a>`;
                })
                .join(', ');
            if (!items) return;

            const html = `
                <div class="chat-icon"><i class="fas fa-robot"></i></div>
                <div class="chat-text">Soft K-Means formulas: ${items}</div>
                <div class="response-actions" style="display:none;"></div>
            `;

            // If an identical math references cell already exists, update it
            const existing = chatMessages.querySelector(`.chat-message.bot[data-kind="math-references"][data-key="${CSS.escape(key)}"]`);
            if (existing) {
                existing.innerHTML = html;
                // Rebind jump handlers on the updated links
                existing.querySelectorAll('.math-ref').forEach(a => {
                    a.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        const page = Number(a.dataset.page||'1');
                        const y = Number(a.dataset.y||'0');
                        this.postToPdfViewer({ type: 'navigateToY', page, y });
                    });
                });
                chatMessages.scrollTop = chatMessages.scrollHeight;
                return;
            }

            // Otherwise append a new keyed message
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message bot';
            msgDiv.dataset.kind = 'math-references';
            msgDiv.dataset.key = key;
            msgDiv.innerHTML = html;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Bind jump handlers
            msgDiv.querySelectorAll('.math-ref').forEach(a => {
                a.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    const page = Number(a.dataset.page||'1');
                    const y = Number(a.dataset.y||'0');
                    this.navigateToY(page, y);
                });
            });
        } catch (e) { console.warn('showMathReferencesInChat failed', e); }
    }

    getDocId() {
        const chatId = window.currentChatId || 'default';
        const filename = (this.currentDocument && this.currentDocument.filename) || 'unknown';
        const hash = this.getCachedDocHash(chatId, filename);
        return hash ? `${chatId}:${filename}:${(hash||'').substring(0,12)}` : `${chatId}:${filename}`;
    }

    getCachedDocHash(chatId, filename) {
        try {
            const key = `docHash:${chatId}:${filename}`;
            return localStorage.getItem(key) || null;
        } catch { return null; }
    }

    async computeAndCacheDocHash() {
        const chatId = window.currentChatId || 'default';
        const filename = (this.currentDocument && this.currentDocument.filename) || null;
        if (!filename) return null;
        const existing = this.getCachedDocHash(chatId, filename);
        if (existing) return existing;
        const endpoint = this.getCurrentPdfEndpoint();
        if (!endpoint) return null;
        try {
            const res = await fetch(endpoint);
            if (!res.ok) return null;
            const buf = await res.arrayBuffer();
            const hashBuf = await crypto.subtle.digest('SHA-256', buf);
            const hashArr = Array.from(new Uint8Array(hashBuf));
            const hex = hashArr.map(b => b.toString(16).padStart(2,'0')).join('');
            const key = `docHash:${chatId}:${filename}`;
            try { localStorage.setItem(key, hex); } catch (e) {}
            return hex;
        } catch (e) { console.warn('computeAndCacheDocHash failed', e); return null; }
    }

    getCurrentPdfEndpoint() {
        if (window.FileViewerRedesigned && window.FileViewerRedesigned.instance && window.FileViewerRedesigned.instance.currentPdfUrl) {
            return window.FileViewerRedesigned.instance.currentPdfUrl;
        }
        const chatId = window.currentChatId || 'default';
        const fname = this.currentDocument && this.currentDocument.filename;
        if (!fname) return null;
        return `/api/rag/document-file/${chatId}/${encodeURIComponent(fname)}`;
    }

    saveSelection(meta) {
        try {
            const docId = this.getDocId();
            const record = { id: meta.id, docId, page: meta.page, anchor: meta.anchor, rects: meta.rects || [], type: meta.role || 'user', createdAt: meta.createdAt || Date.now() };
            const key = `docSelections:${docId}`;
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            // avoid duplicates by id
            const existingIdx = arr.findIndex(x => x.id === record.id);
            if (existingIdx >= 0) arr[existingIdx] = record; else arr.push(record);
            localStorage.setItem(key, JSON.stringify(arr));
        } catch (e) { console.warn('saveSelection failed', e); }
    }

    postToPdfViewer(payload) {
        try {
            const iframe = document.querySelector('.pdf-iframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage(payload, '*');
            }
        } catch (e) {}
    }

    // Ensure viewer exists, then navigate to approximate Y on page
    navigateToY(page, y) {
        try {
            let iframe = document.querySelector('.pdf-iframe');
            if (!iframe) {
                try { this.applyHighlightsToPDF([], null, {}); } catch (e) {}
                iframe = document.querySelector('.pdf-iframe');
            }
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'navigateToY', page, y }, '*');
                try { iframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
            } else {
                if (window.modalManager) {
                    window.modalManager.showToast({ message: 'Open the document viewer to navigate to reference.', type: 'info', duration: 2500 });
                }
            }
        } catch (e) { console.warn('navigateToY failed', e); }
    }

    // Function to be called when chat send button is clicked during highlighting or guided expansion
    processHighlightRequest(message) {
        if (!(window.documentHighlightingEnabled || window.guidedExpansionEnabled) || !this.currentDocument) {
            return false;
        }
        // Do not create any additional pill here; chat.js will append the
        // user's prompt as a chat message and manage generation state.
        
        // Show a transient typing indicator in chat while processing
        const progressEl = this.startHighlightProgress();

        // Perform highlighting/expansion in document and PDF viewer (async, fire-and-forget)
        const isGuided = !!window.guidedExpansionEnabled;
        setTimeout(async () => {
            try {
                await this.performHighlighting(message, { expansion: isGuided });
                this.finishHighlightProgress(progressEl, true, message);
            } catch (e) {
                console.warn('Highlight processing failed', e);
                this.finishHighlightProgress(progressEl, false, message);
            }
        }, 0);
        
        // Clear expansion pill only (do not touch guided selection pill)
        if (isGuided) {
            const expandPill = document.querySelector('.expand-pill:not(.guided-pill)');
            if (expandPill) this.disableGuidedExpansionMode(expandPill);
            window.guidedExpansionEnabled = false;
        }
        
        return true; // Indicates this was processed as a highlight request
    }

    startHighlightProgress() {
        try {
            const chatMessages = document.getElementById('chatMessages');
            if (!chatMessages) return null;
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message bot';
            msgDiv.innerHTML = `
                <div class="chat-icon"><i class="fas fa-robot"></i></div>
                <div class="chat-text">
                    <div class="typing-indicator" aria-live="polite" aria-label="Highlighting document">
                        <div class="typing-dots"><span></span><span></span><span></span></div>
                        <span class="typing-label">Highlighting…</span>
                    </div>
                </div>
                <div class="response-actions" style="display:none;"></div>
            `;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return msgDiv;
        } catch { return null; }
    }

    finishHighlightProgress(progressEl, ok = true, prompt = '') {
        try {
            if (!progressEl) return;
            if (ok) {
                // Remove the spinner; a separate reference message is added by performHighlighting
                progressEl.remove();
            } else {
                const text = progressEl.querySelector('.chat-text');
                if (text) text.innerHTML = '<span style="color:#c33;">Failed to apply highlights.</span>';
                setTimeout(() => { try { progressEl.remove(); } catch {} }, 2000);
            }
        } catch {}
        // Notify chat UI that highlighting finished so it can reset generation state
        try { window.dispatchEvent(new CustomEvent('highlight:done', { detail: { ok, prompt } })); } catch {}
    }

    showHighlightedText(text) {
        // Create a pill showing what text is being highlighted
        const chatWrapper = document.querySelector('.chat-input-wrapper');
        if (!chatWrapper) return;

        const highlightPill = document.createElement('div');
        highlightPill.className = 'highlight-pill';
        highlightPill.innerHTML = `
            <div class="pill-icon"></div>
            <span class="pill-text">Highlighting: "${text}"</span>
            <button class="pill-close" title="Remove highlight">&times;</button>
        `;

        // Insert after input-buttons-left in the chat wrapper
        const inputButtonsLeft = chatWrapper.querySelector('.input-buttons-left');
        if (inputButtonsLeft) {
            inputButtonsLeft.insertAdjacentElement('afterend', highlightPill);
        } else {
            chatWrapper.prepend(highlightPill);
        }

        // Setup close functionality
        const closeBtn = highlightPill.querySelector('.pill-close');
        closeBtn.addEventListener('click', () => {
            this.removeHighlights();
            if (highlightPill.parentNode) {
                highlightPill.parentNode.removeChild(highlightPill);
            }
        });

        // Auto-fade after 10 seconds
        setTimeout(() => {
            if (highlightPill.parentNode) {
                highlightPill.style.opacity = '0.6';
            }
        }, 10000);
    }

    removeHighlights() {
        // Remove highlights from document
        const highlights = document.querySelectorAll('.ai-highlight');
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
            parent.normalize();
        });

        // Remove highlights from PDF if available
        this.clearPDFHighlights();
    }

    clearPDFHighlights() {
        const pdfIframe = document.querySelector('.pdf-iframe');
        if (!pdfIframe) return;

        // If our PDF.js viewer is active, tell it to clear
        if (this.isCustomPdfViewer(pdfIframe)) {
            try { pdfIframe.contentWindow.postMessage({ type: 'clearHighlights' }, '*'); } catch (e) {}
            return;
        }

        // Native viewer: nothing to do beyond fragment cleanup
        try {
            const url = new URL(pdfIframe.src, window.location.origin);
            url.hash = '';
            pdfIframe.src = url.toString();
        } catch (e) {
            const src = pdfIframe.getAttribute('src') || '';
            const cleaned = src.split('#')[0];
            if (cleaned !== src) pdfIframe.src = cleaned;
        }
    }

    async performHighlighting(keywords, options = {}) {
        if (!this.currentDocument) {
            console.error('No document selected for highlighting');
            return;
        }

        try {
            // Call backend for intelligent highlighting
            const response = await fetch('/api/highlight-document', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    document_path: this.currentDocument.path,
                    keywords: keywords,
                    filename: this.currentDocument.filename
                })
            });

            const result = await response.json();
            
            if (result.success && result.highlights) {
                try { console.log('[doc-actions] retrieved highlights:', result.highlights.map(h => h.text).filter(Boolean)); } catch (e) {}
                this.lastAiHighlights = result.highlights;
                // Apply highlights to the document viewer (rich text fallback view)
                this.applyHighlights(result.highlights);

                // Apply highlights to PDF viewer (PDF.js inside iframe)
                this.applyHighlightsToPDF(result.highlights, keywords, { expansion: !!options.expansion });
                console.log(`Applied ${result.highlights.length} highlights for: ${keywords}`);
            } else {
                console.error('Highlighting failed:', result.message || 'Unknown error');
                // Fallback to simple text highlighting and prompt-driven PDF highlight
                this.simpleTextHighlight(keywords);
                this.applyHighlightsToPDF([], keywords, { expansion: !!options.expansion });
            }
        } catch (error) {
            console.error('Error performing highlighting:', error);
            // Fallback to simple text highlighting
            this.simpleTextHighlight(keywords);
            // Ensure PDF viewer still receives the prompt to self-highlight
            this.applyHighlightsToPDF([], keywords, { expansion: !!options.expansion });
        }
    }

    

    addHighlightReferenceMessage(prompt, filename) {
        try {
            const chatMessages = document.getElementById('chatMessages');
            if (!chatMessages) return;
            const safePrompt = (prompt || '').toString().slice(0, 120);
            const safeFilename = (filename || 'document');

            // Build a stable key to avoid duplicate reference cells on subsequent updates
            const key = `ref:${(safeFilename || '').toLowerCase()}::${safePrompt.toLowerCase()}`;

            const html = `
                <div class=\"chat-icon\"><i class=\"fas fa-robot\"></i></div>
                <div class=\"chat-text\">Applied highlights for \"${this.escapeHtml(safePrompt)}\" in <b>${this.escapeHtml(safeFilename)}</b>.</div>
                <div class=\"response-actions\"></div>
            `;

            // If an identical reference already exists, update its text instead of duplicating
            const existing = chatMessages.querySelector(`.chat-message.bot[data-kind="highlight-reference"][data-key="${CSS.escape(key)}"]`);
            if (existing) {
                existing.innerHTML = html;
                // Attach selection-style Jump pill inside chat text (like quick response)
                try {
                    const chatText = existing.querySelector('.chat-text');
                    if (chatText) {
                        const labelWrap = document.createElement('span');
                        labelWrap.className = 'chat-text-label';
                        labelWrap.innerHTML = chatText.innerHTML;
                        chatText.innerHTML = '';
                        chatText.appendChild(labelWrap);
                        const jump = document.createElement('a');
                        jump.href = '#';
                        jump.className = 'selection-jump';
                        jump.title = 'Jump to highlights';
                        jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                        chatText.appendChild(jump);
                        chatText.classList.add('has-jump');
                        const list = Array.isArray(this.lastHighlightRefs) ? this.lastHighlightRefs : [];
                        const first = list[0] || null;
                        jump.addEventListener('click', (ev) => {
                            ev.preventDefault();
                            if (!first) return;
                            this.postToPdfViewer({ type: 'enableAiOverlay' });
                            this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                        });
                    }
                } catch {}
                chatMessages.scrollTop = chatMessages.scrollHeight;
                return;
            }

            // Otherwise append and persist via chat.js so it's saved in history
            try {
                document.dispatchEvent(new CustomEvent('chat:add-bot-message', {
                    detail: { 
                        text: `Applied highlights for \"${safePrompt}\" in **${safeFilename}**. See the PDF viewer for details.`,
                        kind: 'highlight-reference',
                        key
                    }
                }));
                // After chat system appends the message, enrich it with a Jump button
                setTimeout(() => {
                    try {
                        const sel = `.chat-message.bot[data-kind="highlight-reference"][data-key="${CSS.escape(key)}"]`;
                        const el = document.querySelector(sel);
                        if (!el) return;
                        el.innerHTML = `
                            <div class="chat-icon"><i class="fas fa-robot"></i></div>
                            <div class="chat-text">Applied highlights for \"${this.escapeHtml(safePrompt)}\" in <b>${this.escapeHtml(safeFilename)}</b>.</div>
                            <div class="response-actions"></div>
                        `;
                        const chatText = el.querySelector('.chat-text');
                        const labelWrap = document.createElement('span');
                        labelWrap.className = 'chat-text-label';
                        labelWrap.innerHTML = chatText.innerHTML;
                        chatText.innerHTML = '';
                        chatText.appendChild(labelWrap);
                        const jump = document.createElement('a');
                        jump.href = '#';
                        jump.className = 'selection-jump';
                        jump.title = 'Jump to highlights';
                        jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                        chatText.appendChild(jump);
                        chatText.classList.add('has-jump');
                        const list = Array.isArray(this.lastHighlightRefs) ? this.lastHighlightRefs : [];
                        const first = list[0] || null;
                        jump.addEventListener('click', (ev) => {
                            ev.preventDefault();
                            if (!first) return;
                            this.postToPdfViewer({ type: 'enableAiOverlay' });
                            this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                        });
                    } catch {}
                }, 60);
            } catch (e) {
                // Fallback to direct DOM append if event fails
                const msgDiv = document.createElement('div');
                msgDiv.className = 'chat-message bot';
                msgDiv.dataset.kind = 'highlight-reference';
                msgDiv.dataset.key = key;
                msgDiv.innerHTML = html;
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                // Attach Jump button
                try {
                    const actions = msgDiv.querySelector('.response-actions');
                    if (actions) {
                        const list = Array.isArray(this.lastHighlightRefs) ? this.lastHighlightRefs : [];
                        const first = list[0] || null;
                        actions.innerHTML = `<button class=\"btn-secondary\" data-action=\"jump-highlight\">Jump</button>`;
                        const btn = actions.querySelector('[data-action="jump-highlight"]');
                        if (btn) {
                            btn.disabled = !first;
                            btn.title = first ? 'Jump to first highlight' : 'No highlight references available yet';
                            btn.addEventListener('click', (ev) => {
                                ev.preventDefault();
                                if (!first) return;
                                this.postToPdfViewer({ type: 'enableAiOverlay' });
                                this.navigateToY(Number(first.page||'1'), Number(first.y||'0'));
                            });
                        }
                    }
                } catch {}
            }
        } catch (e) {
            console.warn('Could not append highlight reference message:', e);
        }
    }

    // Ensure the PDF viewer loads the correct document and navigates to a saved selection
    async navigateToSelection(meta) {
        try {
            if (!meta) return;
            // Try to detect target filename from meta.docId (format: chatId:filename[:hash])
            let targetFilename = null;
            if (meta.docId && typeof meta.docId === 'string') {
                const parts = meta.docId.split(':');
                if (parts.length >= 2) targetFilename = parts[1];
            }

            // If we can, ensure the viewer has the right file loaded
            if (targetFilename && window.FileViewerRedesigned && window.FileViewerRedesigned.instance) {
                try {
                    const inst = window.FileViewerRedesigned.instance;
                    const current = (inst.currentFile && inst.currentFile.filename) || null;
                    if (!current || current !== targetFilename) {
                        await inst.loadDocument(targetFilename);
                    }
                } catch (e) { /* ignore load errors; fallback to posting */ }
            }

            // Find or initialize the PDF iframe
            let iframe = document.querySelector('.pdf-iframe');
            if (!iframe) {
                // Attempt to trigger viewer load using existing APIs
                try { this.applyHighlightsToPDF([], null, {}); } catch (e) {}
                iframe = document.querySelector('.pdf-iframe');
            }

            const payload = { type: 'highlightSelectionOnly', meta };
            if (iframe && iframe.contentWindow) {
                try { iframe.contentWindow.postMessage(payload, '*'); } catch (e) {}
                try { iframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
            } else {
                if (window.modalManager) {
                    window.modalManager.showToast({ message: 'Open the document viewer to jump to the selection.', type: 'info', duration: 2500 });
                }
            }
        } catch (e) {
            console.warn('navigateToSelection failed', e);
        }
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    simpleTextHighlight(keywords) {
        // Simple client-side highlighting as fallback
        const docViewer = document.querySelector('.document-viewer-content');
        if (!docViewer) return;

        const keywordList = keywords.split(',').map(k => k.trim().toLowerCase());
        
        keywordList.forEach(keyword => {
            if (keyword.length < 2) return;
            
            const walker = document.createTreeWalker(
                docViewer,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                textNodes.push(node);
            }

            textNodes.forEach(textNode => {
                const text = textNode.textContent;
                const regex = new RegExp(`(${keyword})`, 'gi');
                if (regex.test(text)) {
                    const highlighted = text.replace(regex, '<mark class="ai-highlight">$1</mark>');
                    const span = document.createElement('span');
                    span.innerHTML = highlighted;
                    textNode.parentNode.replaceChild(span, textNode);
                }
            });
        });
    }

    applyHighlights(highlights) {
        // Apply highlights from backend response to document
        highlights.forEach(highlight => {
            if (highlight.text && highlight.relevance > 6) { // Only highlight high-relevance items
                this.highlightText(highlight.text);
            }
        });
    }

    highlightText(text) {
        // Find and highlight specific text in the document
        const docViewer = document.querySelector('.document-viewer-content');
        if (!docViewer) return;

        const walker = document.createTreeWalker(
            docViewer,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach(textNode => {
            const content = textNode.textContent;
            if (content.toLowerCase().includes(text.toLowerCase())) {
                const regex = new RegExp(`(${text})`, 'gi');
                const highlighted = content.replace(regex, '<mark class="ai-highlight">$1</mark>');
                const span = document.createElement('span');
                span.innerHTML = highlighted;
                textNode.parentNode.replaceChild(span, textNode);
            }
        });
    }

    applyHighlightsToPDF(highlights, prompt = null, opts = {}) {
        const pdfIframe = document.querySelector('.pdf-iframe');
        if (!pdfIframe) return;

        const hasSelection = !!(this.currentHighlightRef && this.currentHighlightRef.page);
        const isGuided = !!opts.expansion;
        const selectionMeta = hasSelection ? { ...this.currentHighlightRef, docId: this.getDocId() } : null;
        // Always draw the explicit selection anchor first if present; then overlay AI marks
        if (hasSelection && this.isCustomPdfViewer(pdfIframe)) {
            try { pdfIframe.contentWindow.postMessage({ type: 'highlightSelectionOnly', meta: selectionMeta }, '*'); } catch (e) {}
        }

        const payload = {
            type: 'editorHighlight',
            prompt: prompt || '',
            highlights: Array.isArray(highlights) ? highlights.map(h => ({ text: h.text || '', relevance: h.relevance || 0 })) : [],
            preserveAnchor: hasSelection
        };

        // If our PDF.js viewer is already active, ensure anchor, enable overlay and post the message
        if (this.isCustomPdfViewer(pdfIframe)) {
            if (hasSelection) {
                try { pdfIframe.contentWindow.postMessage({ type: 'highlightSelectionOnly', meta: selectionMeta }, '*'); } catch (e) {}
            }
            try { pdfIframe.contentWindow.postMessage({ type: 'enableAiOverlay' }, '*'); } catch (e) {}
            try { pdfIframe.contentWindow.postMessage(payload, '*'); } catch (e) {}
            try { pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
            return;
        }

        // Switch to the custom viewer temporarily for accurate highlights
        const endpoint = (window.FileViewerRedesigned && window.FileViewerRedesigned.instance && window.FileViewerRedesigned.instance.currentPdfUrl)
            ? window.FileViewerRedesigned.instance.currentPdfUrl
            : (window.currentChatId && this.currentDocument?.filename
                ? `/api/rag/document-file/${window.currentChatId}/${encodeURIComponent(this.currentDocument.filename)}`
                : null);
        if (!endpoint) {
            console.warn('Cannot determine PDF endpoint for highlighting');
            return;
        }
        const viewerUrl = `/static/pdfjs/web/viewer.html?file=${encodeURIComponent(endpoint)}`;
        
        // Swap iframe to our viewer and post selection + AI highlight once loaded
        const onload = () => {
            if (hasSelection) {
                try { pdfIframe.contentWindow.postMessage({ type: 'highlightSelectionOnly', meta: selectionMeta }, '*'); } catch (e) {}
            }
            try { pdfIframe.contentWindow.postMessage({ type: 'enableAiOverlay' }, '*'); } catch (e) {}
            try { pdfIframe.contentWindow.postMessage(payload, '*'); } catch (e) {}
            try { pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
            pdfIframe.removeEventListener('load', onload);
        };
        pdfIframe.addEventListener('load', onload);
        pdfIframe.src = viewerUrl;

        // Hook for other listeners if needed
        document.dispatchEvent(new CustomEvent('applyHighlights', { detail: { highlights, prompt } }));
        console.log('Switched to custom PDF viewer for accurate highlights');
    }

    isCustomPdfViewer(iframe) {
        try {
            const src = iframe && typeof iframe.src === 'string' ? iframe.src : '';
            return src.includes('/static/pdf-viewer/index.html') || src.includes('/static/pdfjs/web/viewer.html');
        }
        catch { return false; }
    }

    extractSearchTerms(prompt) {
        const terms = [];
        if (!prompt) return terms;
        const p = String(prompt);
        // Prefer quoted phrases first
        const quoted = p.match(/"([^"]+)"|'([^']+)'/g) || [];
        for (const q of quoted) {
            const cleaned = q.replace(/^['"]|['"]$/g, '').trim();
            if (cleaned) terms.push(cleaned);
        }
        if (terms.length) return terms;
        // Split by commas
        p.split(',').forEach(seg => {
            const t = seg.trim();
            if (t) terms.push(t);
        });
        if (terms.length) return terms;
        // Fallback: pick meaningful words (>3 chars)
        const words = p.split(/\s+/).filter(w => w.length > 3);
        if (words.length) terms.push(words[0]);
        return terms;
    }

    setButtonLoading(button, isLoading) {
        if (isLoading) {
            button.classList.add('loading');
            button.innerHTML = `
                <span class="loading-spinner"></span>
                <span class="label">Processing...</span>
            `;
        } else {
            button.classList.remove('loading');
        }
    }

    showBriefFeedback(button, symbol) {
        const originalHTML = button.innerHTML;
        const originalClasses = button.className;
        
        // Simple, quick feedback animation
        button.innerHTML = `<span class="icon">${symbol}</span>`;
        
        // Apply feedback styling via CSS classes
        if (symbol === '✓') {
            button.classList.add('feedback-success');
        } else {
            button.classList.add('feedback-error');
        }
        
        // Restore original state quickly
        setTimeout(() => {
            button.className = originalClasses;
            button.innerHTML = originalHTML;
        }, 400); // Reduced from 600ms to 400ms for quicker feedback
    }

    async insertPromptToChat(prompt, isInteractive = false, meta = {}) {
        const chatInput = document.querySelector('#chatInput');
        if (!chatInput) {
            throw new Error('Chat input not found');
        }

        // Build display label and selection ref for minimal UI
        const displayLabel = meta.displayLabel || '';
        const selectionRef = meta.selectionRef || null;

        // Stash expanded prompt and optional selection reference on the input
        chatInput.dataset.expandedPrompt = prompt;
        if (displayLabel) chatInput.dataset.displayLabel = displayLabel;
        if (selectionRef) chatInput.dataset.selectionRef = JSON.stringify(selectionRef);

        // Set minimal visible value
        chatInput.value = displayLabel || prompt;
        chatInput.focus();
        
        // Trigger input event to ensure any listeners are notified
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        if (isInteractive) {
            // For interactive actions, position cursor at the end for user input
            chatInput.setSelectionRange(prompt.length, prompt.length);
        } else {
            // For non-interactive actions, programmatically send after a brief delay
            setTimeout(() => {
                try {
                    // Prefer event-based send to avoid click race conditions
                    document.dispatchEvent(new CustomEvent('chat:send'));
                } catch (e) {
                    // Fallback to button click if needed
                    const sendButton = document.querySelector('#chatSendBtn');
                    if (sendButton) sendButton.click();
                }
            }, 120);
        }
    }

    show() {
        if (!this.actionsBar || this.isVisible) return;
        
        this.actionsBar.classList.add('visible');
        this.isVisible = true;
        
        // Adjust chat input area to make room
        const chatInputArea = document.querySelector('.chat-input-area');
        if (chatInputArea) {
            chatInputArea.classList.add('actions-visible');
        }
        
        // Hide legacy document actions
        const legacyActions = document.querySelector('.document-actions');
        if (legacyActions) {
            legacyActions.classList.add('legacy');
        }
    }

    hide() {
        if (!this.actionsBar || !this.isVisible) return;
        
        this.actionsBar.classList.remove('visible');
        this.isVisible = false;
        
        // Reset chat input area
        const chatInputArea = document.querySelector('.chat-input-area');
        if (chatInputArea) {
            chatInputArea.classList.remove('actions-visible');
        }
        
        // Show legacy document actions
        const legacyActions = document.querySelector('.document-actions');
        if (legacyActions) {
            legacyActions.classList.remove('legacy');
        }
    }

    // Public API methods
    triggerAction(actionId) {
        if (!this.isVisible) return false;
        
        const button = this.actionsBar.querySelector(`[data-action="${actionId}"]`);
        if (button) {
            button.click();
            return true;
        }
        return false;
    }

    getAvailableActions() {
        return this.actions.map(action => ({
            id: action.id,
            label: action.label,
            tooltip: action.tooltip
        }));
    }

    isActionBarVisible() {
        return this.isVisible;
    }

    getCurrentDocument() {
        return this.currentDocument;
    }

    setupResponsiveBehavior() {
        // Check if we have enough space for labels
        const checkWidth = () => {
            if (!this.actionsBar) return;
            
            const chatInputArea = document.querySelector('.chat-input-area');
            if (!chatInputArea) return;
            
            const chatWidth = chatInputArea.offsetWidth;
            const minWidthForLabels = 600; // Minimum width to show labels
            
            if (chatWidth >= minWidthForLabels) {
                this.actionsBar.classList.add('show-labels');
            } else {
                this.actionsBar.classList.remove('show-labels');
            }
        };
        
        // Check on resize
        window.addEventListener('resize', checkWidth);
        
        // Initial check
        setTimeout(checkWidth, 100);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for required elements to be available
    function initializeWhenReady() {
        const chatInputArea = document.querySelector('.chat-input-area');
        const chatInput = document.querySelector('#chatInput');
        
        if (chatInputArea && chatInput) {
            window.documentActionsManager = new DocumentActionsManager();
            
            // Dispatch ready event for other components
            document.dispatchEvent(new CustomEvent('documentActionsReady', {
                detail: { manager: window.documentActionsManager }
            }));
        } else {
            // Retry after a short delay
            setTimeout(initializeWhenReady, 100);
        }
    }
    
    // Start the initialization process
    setTimeout(initializeWhenReady, 100);
});

// Integration helper for file viewer
if (typeof window.FileViewerManager !== 'undefined') {
    document.addEventListener('documentActionsReady', (e) => {
        const manager = e.detail.manager;
        
        // Integrate with existing file viewer events
        const originalSelectDocument = window.FileViewerManager.selectDocument;
        if (originalSelectDocument) {
            window.FileViewerManager.selectDocument = function(document) {
                const result = originalSelectDocument.apply(this, arguments);
                
                // Notify document actions manager
                if (document) {
                    manager.setCurrentDocument(document);
                }
                
                return result;
            };
        }
    });

    // Integration with chat system for highlighting
    document.addEventListener('chatSendClick', (e) => {
        if (window.documentHighlightingEnabled && window.documentActionsManager) {
            const message = e.detail.message;
            if (message && message.trim()) {
                const processed = window.documentActionsManager.processHighlightRequest(message.trim());
                if (processed) {
                    // Prevent normal chat processing
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        }
    });

}

// Export for global access
window.DocumentActionsManager = DocumentActionsManager;

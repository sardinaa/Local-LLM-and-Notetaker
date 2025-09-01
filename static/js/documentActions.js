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
                icon: '🖍️',
                label: 'Highlight',
                tooltip: 'Enable highlighting mode - use chat input to specify what to highlight',
                special: true
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
                tooltip: 'Ask questions about the document - use chat input to specify your question',
                special: true
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
        const fileViewer = document.getElementById('fileViewer');
        if (fileViewer) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const isOpen = !fileViewer.classList.contains('is-hidden');
                        this.setFileViewerState(isOpen);
                    }
                });
            });

            observer.observe(fileViewer, {
                attributes: true,
                attributeFilter: ['class']
            });

            // Check initial state
            this.setFileViewerState(!fileViewer.classList.contains('is-hidden'));
        }
    }

    setCurrentDocument(document) {
        this.currentDocument = document;
        this.updateContextIndicator();
        this.updateVisibility();
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
        const shouldShow = this.isFileViewerOpen && this.currentDocument;
        
        if (shouldShow && !this.isVisible) {
            this.show();
        } else if (!shouldShow && this.isVisible) {
            this.hide();
        }
    }

    async handleAction(action, button) {
        if (!this.currentDocument) return;

        // Handle special actions (like highlight)
        if (action.special) {
            this.handleSpecialAction(action, button);
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
                try { await this.computeAndCacheDocHash(); } catch {}
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
        }
    }

    enableHighlightMode(button) {
        // Check if pill already exists
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

        // Create simple highlight pill with marker icon and "Highlight" label
        const pill = document.createElement('div');
        pill.className = 'highlight-pill';
        pill.innerHTML = `
            <div class="pill-icon"></div>
            <span class="pill-text">Highlight</span>
            <button class="pill-close" title="Cancel highlighting">&times;</button>
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

        // Set global highlighting state
        window.documentHighlightingEnabled = true;

        // Activate marker inside PDF viewer
        this.postToPdfViewer({ type: 'highlight:activate' });

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

    disableHighlightMode(button) {
        // Remove highlighting state
        window.documentHighlightingEnabled = false;
        
        // Reset button to original state (icon only)
        if (button) {
            button.innerHTML = `<span class="icon">🖍️</span><span class="label">Highlight</span>`;
            button.classList.remove('selected');
        }
        
        // Deactivate marker inside PDF viewer
        this.postToPdfViewer({ type: 'highlight:deactivate' });

        // Reset chat input placeholder
        const chatInput = document.querySelector('#chatInput');
        if (chatInput) {
            chatInput.placeholder = "Type your message...";
        }
        
        // Find and remove existing pill
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

    closePill(pill, highlightButton = null) {
        // Remove highlighting state
        window.documentHighlightingEnabled = false;

        // Deactivate marker inside PDF viewer
        this.postToPdfViewer({ type: 'highlight:deactivate' });
        
        // Reset highlight button to unselected state
        if (highlightButton) {
            highlightButton.innerHTML = `<span class="icon">🖍️</span><span class="label">Highlight</span>`;
            highlightButton.classList.remove('selected');
        } else {
            // Find highlight button if not provided
            const highlightBtn = document.querySelector('[data-action="highlight"]');
            if (highlightBtn) {
                highlightBtn.innerHTML = `<span class="icon">🖍️</span><span class="label">Highlight</span>`;
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
                if (!document.querySelector('.highlight-pill')) {
                    // Create pill but avoid echoing back to iframe (we only show UI)
                    const btn = document.querySelector('[data-action="highlight"]');
                    this.enableHighlightMode(btn);
                }
            } else if (data.event === 'highlight:deactivated') {
                const pill = document.querySelector('.highlight-pill');
                if (pill) this.closePill(pill, document.querySelector('[data-action="highlight"]'));
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
                // Optionally show tiny reference in chat input placeholder
                const chatInput = document.querySelector('#chatInput');
                if (chatInput) {
                    chatInput.placeholder = `Actions will use selection on page ${this.currentHighlightRef.page}…`;
                }
            }
        });

        // Handle navigation and missing selection notices from the viewer
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
            }
        });
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
            try { localStorage.setItem(key, hex); } catch {}
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
        } catch {}
    }

    // Function to be called when chat send button is clicked during highlighting
    processHighlightRequest(message) {
        if (!window.documentHighlightingEnabled || !this.currentDocument) {
            return false;
        }

        // Create a highlighting pill to show what's being highlighted
        this.showHighlightedText(message);
        
        // Perform highlighting in document and PDF viewer
        this.performHighlighting(message);
        
        // Clear highlighting mode
        const pill = document.querySelector('.highlight-pill');
        if (pill) {
            // Also reset the highlight button when processing highlight request
            const highlightBtn = document.querySelector('[data-action="highlight"]');
            this.closePill(pill, highlightBtn);
        }
        
        return true; // Indicates this was processed as a highlight request
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
            try { pdfIframe.contentWindow.postMessage({ type: 'clearHighlights' }, '*'); } catch {}
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

    async performHighlighting(keywords) {
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
                try { console.log('[doc-actions] retrieved highlights:', result.highlights.map(h => h.text).filter(Boolean)); } catch {}
                this.lastAiHighlights = result.highlights;
                // Apply highlights to the document viewer (rich text fallback view)
                this.applyHighlights(result.highlights);

                // Apply highlights to PDF viewer (PDF.js inside iframe)
                this.applyHighlightsToPDF(result.highlights, keywords);
                // Do not dump all content in chat; the viewer will send clickable references

                console.log(`Applied ${result.highlights.length} highlights for: ${keywords}`);
            } else {
                console.error('Highlighting failed:', result.message || 'Unknown error');
                // Fallback to simple text highlighting and prompt-driven PDF highlight
                this.simpleTextHighlight(keywords);
                this.applyHighlightsToPDF([], keywords);
            }
        } catch (error) {
            console.error('Error performing highlighting:', error);
            // Fallback to simple text highlighting
            this.simpleTextHighlight(keywords);
            // Ensure PDF viewer still receives the prompt to self-highlight
            this.applyHighlightsToPDF([], keywords);
        }
    }

    

    addHighlightReferenceMessage(prompt, filename) {
        try {
            const chatMessages = document.getElementById('chatMessages');
            if (!chatMessages) return;
            const safePrompt = (prompt || '').toString().slice(0, 120);
            const safeFilename = (filename || 'document');

            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message bot';
            msgDiv.innerHTML = `
                <div class=\"chat-icon\"><i class=\"fas fa-robot\"></i></div>
                <div class=\"chat-text\">Applied highlights for \"${this.escapeHtml(safePrompt)}\" in <b>${this.escapeHtml(safeFilename)}</b>. See the PDF viewer for details.</div>
                <div class=\"response-actions\" style=\"display: none;\"></div>
            `;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (e) {
            console.warn('Could not append highlight reference message:', e);
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

    applyHighlightsToPDF(highlights, prompt = null) {
        const pdfIframe = document.querySelector('.pdf-iframe');
        if (!pdfIframe) return;

        // If we have a current explicit selection, draw only that selection and do not apply term-based highlights
        if (this.currentHighlightRef && this.currentHighlightRef.page) {
            const meta = { ...this.currentHighlightRef, docId: this.getDocId() };
            if (this.isCustomPdfViewer(pdfIframe)) {
                try { pdfIframe.contentWindow.postMessage({ type: 'highlightSelectionOnly', meta }, '*'); } catch {}
                try { pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
                return;
            }
            const endpoint = this.getCurrentPdfEndpoint();
            if (!endpoint) return;
            const viewerUrl = `/static/pdfjs/web/viewer.html?file=${encodeURIComponent(endpoint)}`;
            const onload = () => {
                try { pdfIframe.contentWindow.postMessage({ type: 'highlightSelectionOnly', meta }, '*'); } catch {}
                try { pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
                pdfIframe.removeEventListener('load', onload);
            };
            pdfIframe.addEventListener('load', onload);
            pdfIframe.src = viewerUrl;
            document.dispatchEvent(new CustomEvent('applyHighlights', { detail: { highlights: [], prompt } }));
            console.log('Switched to custom PDF viewer for selection-only highlight');
            return;
        }

        const payload = {
            type: 'editorHighlight',
            prompt: prompt || '',
            highlights: Array.isArray(highlights) ? highlights.map(h => ({ text: h.text || '', relevance: h.relevance || 0 })) : []
        };

        // If our PDF.js viewer is already active, just post the message
        if (this.isCustomPdfViewer(pdfIframe)) {
            try { pdfIframe.contentWindow.postMessage(payload, '*'); } catch {}
            try { pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
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
        
        // Swap iframe to our viewer and post highlight once loaded
        const onload = () => {
            try { pdfIframe.contentWindow.postMessage(payload, '*'); } catch {}
            try { pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
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
            // For non-interactive actions, auto-send after a brief delay
            setTimeout(() => {
                const sendButton = document.querySelector('#chatSendBtn');
                if (sendButton) {
                    sendButton.click();
                }
            }, 100);
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

    // Store global reference
    window.documentActionsManager = manager;
}

// Export for global access
window.DocumentActionsManager = DocumentActionsManager;

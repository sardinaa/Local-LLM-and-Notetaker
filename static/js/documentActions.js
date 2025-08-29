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
            const prompt = action.prompt(this.currentDocument.filename);
            await this.insertPromptToChat(prompt, action.interactive);
            
        } catch (error) {
            console.error('Action failed:', error);
            // Show error feedback only if the action actually failed
            this.showBriefFeedback(button, '✗');
        }
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
        if (pdfIframe && pdfIframe.contentWindow) {
            try {
                pdfIframe.contentWindow.postMessage({
                    type: 'clearHighlights'
                }, '*');
            } catch (e) {
                console.log('Could not clear PDF highlights:', e);
            }
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
                // Apply highlights to the document viewer
                this.applyHighlights(result.highlights);
                
                // Apply highlights to PDF viewer if available
                this.applyHighlightsToPDF(result.highlights);
                
                console.log(`Applied ${result.highlights.length} highlights for: ${keywords}`);
            } else {
                console.error('Highlighting failed:', result.message || 'Unknown error');
                // Fallback to simple text highlighting
                this.simpleTextHighlight(keywords);
            }
        } catch (error) {
            console.error('Error performing highlighting:', error);
            // Fallback to simple text highlighting
            this.simpleTextHighlight(keywords);
        }
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

    applyHighlightsToPDF(highlights) {
        // Send highlights to PDF viewer via postMessage
        const pdfIframe = document.querySelector('.pdf-iframe');
        if (pdfIframe && pdfIframe.contentWindow) {
            try {
                pdfIframe.contentWindow.postMessage({
                    type: 'editorHighlight',
                    highlights: highlights.map(h => ({
                        text: h.text,
                        relevance: h.relevance
                    }))
                }, '*');
            } catch (e) {
                console.log('Could not send highlights to PDF:', e);
            }
        }
        
        // Also try dispatching a custom event for other PDF viewers
        const event = new CustomEvent('applyHighlights', {
            detail: { highlights }
        });
        document.dispatchEvent(event);
        
        console.log('Applying highlights:', highlights);
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

    async insertPromptToChat(prompt, isInteractive = false) {
        const chatInput = document.querySelector('#chatInput');
        if (!chatInput) {
            throw new Error('Chat input not found');
        }

        // Clear and set new value
        chatInput.value = prompt;
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

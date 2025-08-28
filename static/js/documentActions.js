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
                icon: '📝',
                label: 'Summary',
                tooltip: 'Generate document summary',
                prompt: (docName) => `Please provide a comprehensive summary of "${docName}". Include the main topics, key findings, and overall purpose.`
            },
            {
                id: 'key-points',
                icon: '🎯',
                label: 'Points',
                tooltip: 'Extract key points',
                prompt: (docName) => `Extract the most important key points and highlights from "${docName}". Focus on actionable insights and critical information.`
            },
            {
                id: 'highlight',
                icon: '🎨',
                label: 'Highlight',
                tooltip: 'Highlight relevant parts',
                prompt: (docName) => `Highlight relevant parts and keywords in "${docName}": `,
                interactive: true,
                special: true
            },
            {
                id: 'references',
                icon: '🔗',
                label: 'Refs',
                tooltip: 'Find references',
                prompt: (docName) => `Find and list all references, citations, sources, and external links mentioned in "${docName}".`
            },
            {
                id: 'insights',
                icon: '💡',
                label: 'Ideas',
                tooltip: 'Generate insights',
                prompt: (docName) => `Analyze "${docName}" and provide insights on how this connects to other knowledge areas. Suggest ways to expand or build upon these ideas.`
            },
            {
                id: 'ask',
                icon: '❓',
                label: 'Ask',
                tooltip: 'Ask about document',
                prompt: (docName) => `I have a question about "${docName}": `,
                interactive: true
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

        const originalContent = button.innerHTML;
        this.setButtonLoading(button, true);

        try {
            const prompt = action.prompt(this.currentDocument.filename);
            await this.insertPromptToChat(prompt, action.interactive);
            
            // Show success feedback
            this.showBriefFeedback(button, '✓');
            
        } catch (error) {
            console.error('Action failed:', error);
            this.showBriefFeedback(button, '✗');
        } finally {
            setTimeout(() => {
                this.setButtonLoading(button, false);
                button.innerHTML = originalContent;
            }, 800);
        }
    }

    handleSpecialAction(action, button) {
        if (action.id === 'highlight') {
            this.createHighlightPill();
            // Show success feedback
            this.showBriefFeedback(button, '✓');
        }
    }

    createHighlightPill() {
        // Check if pill already exists
        if (document.querySelector('.highlight-pill')) {
            return;
        }

        const chatWrapper = document.querySelector('#input-chat-wrapper');
        if (!chatWrapper) {
            console.error('Chat wrapper not found');
            return;
        }

        // Create pill element
        const pill = document.createElement('div');
        pill.className = 'highlight-pill';
        pill.innerHTML = `
            <span class="pill-icon">🎨</span>
            <span class="pill-label">Highlight</span>
            <input type="text" class="pill-input" placeholder="Enter keywords or phrases to highlight..." />
            <button class="pill-action" title="Apply Highlighting">✨</button>
            <button class="pill-close" title="Close">&times;</button>
        `;

        // Insert pill before chat input
        const chatInput = document.querySelector('#chatInput');
        if (chatInput) {
            chatWrapper.insertBefore(pill, chatInput);
        }

        // Add event listeners
        this.setupPillEventListeners(pill);
    }

    setupPillEventListeners(pill) {
        const input = pill.querySelector('.pill-input');
        const actionBtn = pill.querySelector('.pill-action');
        const closeBtn = pill.querySelector('.pill-close');

        // Handle highlight action
        actionBtn.addEventListener('click', () => {
            const keywords = input.value.trim();
            if (keywords) {
                this.performHighlighting(keywords);
            }
        });

        // Handle Enter key in input
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const keywords = input.value.trim();
                if (keywords) {
                    this.performHighlighting(keywords);
                }
            }
        });

        // Handle close
        closeBtn.addEventListener('click', () => {
            pill.remove();
        });

        // Focus on input
        input.focus();
    }

    async performHighlighting(keywords) {
        if (!this.currentDocument) {
            console.error('No document selected for highlighting');
            return;
        }

        try {
            // Show loading state
            const pill = document.querySelector('.highlight-pill');
            const actionBtn = pill.querySelector('.pill-action');
            const originalContent = actionBtn.innerHTML;
            actionBtn.innerHTML = '⟳';
            actionBtn.disabled = true;

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
            
            if (result.success) {
                // Apply highlighting to PDF viewer
                this.applyHighlightsToPDF(result.highlights);
                
                // Show success and remove pill
                actionBtn.innerHTML = '✓';
                setTimeout(() => {
                    pill.remove();
                }, 1000);
            } else {
                throw new Error(result.error || 'Highlighting failed');
            }

        } catch (error) {
            console.error('Highlighting failed:', error);
            const pill = document.querySelector('.highlight-pill');
            const actionBtn = pill.querySelector('.pill-action');
            actionBtn.innerHTML = '✗';
            actionBtn.disabled = false;
            
            setTimeout(() => {
                actionBtn.innerHTML = '✨';
            }, 2000);
        }
    }

    applyHighlightsToPDF(highlights) {
        // This will apply visual highlights to the PDF viewer
        // For now, we'll dispatch an event that can be handled by the PDF viewer
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
        button.innerHTML = `<span class="icon">${symbol}</span>`;
        button.style.background = symbol === '✓' ? '#27ae60' : '#e74c3c';
        button.style.color = 'white';
        
        setTimeout(() => {
            button.style.background = '';
            button.style.color = '';
        }, 600);
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit to ensure other components are initialized
    setTimeout(() => {
        window.documentActionsManager = new DocumentActionsManager();
        
        // Dispatch ready event for other components
        document.dispatchEvent(new CustomEvent('documentActionsReady', {
            detail: { manager: window.documentActionsManager }
        }));
    }, 100);
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
}

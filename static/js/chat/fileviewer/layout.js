// Layout and visibility controls
export function initializeResizer() {
    const resizer = document.getElementById('resizeDivider');
    const fileViewerPanel = document.getElementById('fileViewerPanel');
    
    if (!resizer || !fileViewerPanel) return;

    resizer.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.startX = e.clientX;
        this.startWidth = parseInt(document.defaultView.getComputedStyle(fileViewerPanel).width, 10);
        
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        
        const width = this.startWidth + e.clientX - this.startX;
        const minWidth = 250;
        const maxWidth = window.innerWidth * 0.8;
        
        if (width >= minWidth && width <= maxWidth) {
            fileViewerPanel.style.width = width + 'px';
            
            // Force layout recalculation for chat container
            const chatContainer = document.querySelector('.chat-with-viewer-container .chat-container');
            if (chatContainer) {
                // Trigger reflow to ensure proper layout adjustment
                chatContainer.style.width = `calc(100% - ${width}px)`;
                // Reset to flex after a frame to maintain responsive behavior
                requestAnimationFrame(() => {
                    chatContainer.style.width = '';
                    // Dispatch resize event to trigger any layout updates
                    window.dispatchEvent(new Event('resize'));
                });
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (this.isDragging) {
            this.isDragging = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Final layout update after resize is complete
            requestAnimationFrame(() => {
                window.dispatchEvent(new Event('resize'));
                // Force reflow on chat messages to ensure proper scrolling
                const chatMessages = document.querySelector('.chat-with-viewer-container .chat-messages');
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollTop; // Force reflow
                }
            });
        }
    });
}

export function toggleFileViewer() {
    if (this.isVisible) {
        this.hideFileViewer();
    } else {
        this.showFileViewer();
    }
}

export function showFileViewer() {
    if (this.isVisible) return;

    const panel = document.getElementById('fileViewerPanel');
    const divider = document.getElementById('resizeDivider');
    
    if (panel) {
        panel.classList.remove('is-hidden');
        divider?.classList.remove('is-hidden');
        this.isVisible = true;
        
        this.updateToggleButtonState(true);
        
        // Load documents if no file is selected
        if (!this.currentFile) {
            this.refreshDocumentList();
        }

        // Notify document actions manager
        if (typeof window !== 'undefined' && window.document) {
            window.document.dispatchEvent(new CustomEvent('fileViewerStateChanged', {
                detail: { isOpen: true }
            }));
        }
    }
}

export function hideFileViewer() {
    if (!this.isVisible) return;

    const panel = document.getElementById('fileViewerPanel');
    const divider = document.getElementById('resizeDivider');
    
    if (panel) {
        panel.classList.add('is-hidden');
        divider?.classList.add('is-hidden');
        this.isVisible = false;
        
        this.updateToggleButtonState(false);

        // Notify document actions manager
        if (typeof window !== 'undefined' && window.document) {
            window.document.dispatchEvent(new CustomEvent('fileViewerStateChanged', {
                detail: { isOpen: false }
            }));
        }
    }
}

export function updateToggleButtonState(isVisible) {
    const toggleBtn = document.getElementById('fileViewerToggle');
    if (toggleBtn) {
        toggleBtn.style.display = 'flex';
        toggleBtn.style.opacity = '1';
        toggleBtn.disabled = false;
        toggleBtn.title = 'Toggle Document Viewer';
        if (isVisible) {
            toggleBtn.classList.add('active');
        } else {
            toggleBtn.classList.remove('active');
        }
    }
}

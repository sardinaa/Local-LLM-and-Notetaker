// Event binding helpers
export function initializeEventHandlers() {
    // File viewer toggle
    document.getElementById('fileViewerToggle')?.addEventListener('click', () => {
        this.toggleFileViewer();
    });

    // Close button handler
    document.getElementById('fileViewerClose')?.addEventListener('click', () => {
        this.hideFileViewer();
    });

    // Document selection and management
    document.getElementById('selectDocumentBtn')?.addEventListener('click', () => {
        this.openDocumentModal();
    });

    document.getElementById('manageDocumentsBtn')?.addEventListener('click', () => {
        this.openDocumentModal();
    });

    // Analysis buttons
    document.getElementById('generateSummaryBtn')?.addEventListener('click', () => {
        this.performAnalysis('summary');
    });

    document.getElementById('extractReferencesBtn')?.addEventListener('click', () => {
        this.performAnalysis('references');
    });

    document.getElementById('findHighlightsBtn')?.addEventListener('click', () => {
        this.performAnalysis('highlights');
    });

    document.getElementById('suggestInsightsBtn')?.addEventListener('click', () => {
        this.performAnalysis('insights');
    });

    // Listen for RAG document updates
    document.addEventListener('rag:documents-updated', () => {
        this.refreshDocumentList();
        this.updateToggleButtonState(this.isVisible);
    });

    // Listen for chat changes
    document.addEventListener('chat:changed', () => {
        this.refreshDocumentList();
        this.clearSelection();
        this.updateToggleButtonState(this.isVisible);
    });

    // Listen for highlight events from document actions
    document.addEventListener('applyHighlights', (e) => {
        this.applyHighlights(e.detail.highlights);
    });
}

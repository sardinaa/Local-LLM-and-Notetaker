/**
 * Redesigned File Viewer Component for Split-Screen Chat Layout
 * Features: Resizable panels, document modal, enhanced AI analysis
 */

class FileViewerRedesigned {
    constructor() {
        this.isVisible = false;
        this.currentFile = null;
        this.selectedDocumentInModal = null;
        this.isLoadingDocument = false;
        this.isDragging = false;
        this.startX = 0;
        this.startWidth = 0;
        
        // Notes editor properties
        this.notesEditorInstance = null;
        this.currentNoteId = null;
        this.currentNoteName = 'Untitled Note';
        this.currentNoteTags = '';
        this.currentNoteCreatedAt = null;
        this.pendingNoteData = null;
        
        // Temporary note storage for unsaved content within chat session
        this.tempNoteContent = null;
        this.hasUnsavedChanges = false;
        this.tempNoteSessionKey = null;
        
        // Backup properties for header restoration
        this.originalControlsHTML = null;
        this.originalFileTypeLabel = null;
        this.originalFileTypeIcon = null;
        
        this.initializeEventHandlers();
        this.initializeResizer();
        this.initializeModal();
        
        // Listen for chat changes to update document list
        document.addEventListener('chat-changed', () => {
            this.onChatChanged();
        });
        
        // Listen for document changes to update preview
        document.addEventListener('rag:documents-updated', () => {
            this.refreshDocumentList();
        });
        
        // Initialize with current chat documents
        if (window.currentChatId) {
            this.refreshDocumentList();
        }
        
        // Expose this instance globally for integration with other components
        window.FileViewerRedesigned = window.FileViewerRedesigned || {};
        window.FileViewerRedesigned.instance = this;
    }

    onChatChanged() {
        // Reset current file when chat changes
        this.currentFile = null;
        
        // Refresh document list for new chat
        this.refreshDocumentList();
    }

    initializeEventHandlers() {
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
        });

        // Listen for chat changes
        document.addEventListener('chat:changed', () => {
            this.refreshDocumentList();
            this.clearSelection();
        });

        // Listen for highlight events from document actions
        document.addEventListener('applyHighlights', (e) => {
            this.applyHighlights(e.detail.highlights);
        });
    }

    initializeResizer() {
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

    initializeModal() {
        // Modal event handlers
        document.getElementById('documentModalClose')?.addEventListener('click', () => {
            this.closeDocumentModal();
        });

        document.getElementById('cancelDocumentModal')?.addEventListener('click', () => {
            this.closeDocumentModal();
        });

        document.getElementById('selectDocumentFromModal')?.addEventListener('click', () => {
            this.selectDocumentFromModal();
        });

        document.getElementById('refreshDocuments')?.addEventListener('click', () => {
            this.refreshDocumentList();
        });

        // File upload handlers
        this.initializeFileUpload();

        // Close modal on overlay click
        document.querySelector('#documentModal .modal-overlay')?.addEventListener('click', (e) => {
            console.log('Overlay clicked', e.target);
            // Only close if clicking the overlay itself, not its children
            if (e.target.classList.contains('modal-overlay')) {
                this.closeDocumentModal();
            }
        });

        // ESC key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('documentModal');
                if (modal && !modal.classList.contains('is-hidden')) {
                    console.log('ESC key pressed, closing modal');
                    this.closeDocumentModal();
                }
            }
        });
    }

    initializeFileUpload() {
        const uploadZone = document.getElementById('documentUploadZone');
        const fileInput = document.getElementById('documentFileInput');
        const browseBtn = document.getElementById('browseDocumentsBtn');

        if (!uploadZone || !fileInput) return;

        // File browse button
        browseBtn?.addEventListener('click', () => {
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });

        // Drag and drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });

        uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            this.handleFileUpload(e.dataTransfer.files);
        });

        // Click to browse (but not on the button)
        uploadZone.addEventListener('click', (e) => {
            if (e.target !== browseBtn && !browseBtn?.contains(e.target)) {
                fileInput.click();
            }
        });
    }

    async handleFileUpload(files) {
        if (!files || files.length === 0) return;

        const currentChatId = window.currentChatId;
        if (!currentChatId) {
            this.showToast('Please create a chat first', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('chat_id', currentChatId);

        Array.from(files).forEach(file => {
            formData.append('file', file);
        });

        try {
            const response = await fetch('/api/rag/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                this.showToast(`Successfully uploaded ${result.successful_uploads} file(s)`, 'success');
                this.refreshDocumentList();
                
                // Trigger document update event
                document.dispatchEvent(new CustomEvent('rag:documents-updated'));
            } else {
                this.showToast(result.message || 'Upload failed', 'error');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('Upload failed', 'error');
        }
    }

    async refreshDocumentList() {
        const currentChatId = window.currentChatId;
        if (!currentChatId) return;

        try {
            const response = await fetch(`/api/rag/documents/${currentChatId}`);
            if (response.ok) {
                const result = await response.json();
                const documents = result.documents || [];
                this.displayDocumentList(documents);
                
                // Auto-load logic: if only one document, load it automatically
                if (documents.length === 1 && !this.currentFile) {
                    const doc = documents[0];
                    console.log('Auto-loading single document:', doc.filename);
                    await this.loadDocument(doc.filename, doc.full_path);
                    this.showFileViewer();
                } else if (documents.length > 0 && !this.currentFile) {
                    // Show document list in preview placeholder
                    this.showDocumentListInPreview(documents);
                }
            } else {
                this.showEmptyDocumentList();
                this.showEmptyPreviewPlaceholder();
            }
        } catch (error) {
            console.error('Error fetching documents:', error);
            this.showEmptyDocumentList();
            this.showEmptyPreviewPlaceholder();
        }
    }

    displayDocumentList(documents) {
        const documentList = document.getElementById('documentList');
        const emptyState = document.getElementById('documentListEmpty');

        if (!documentList) return;

        // Update document count
        this.updateDocumentCount(documents.length);

        if (documents.length === 0) {
            documentList.innerHTML = '';
            emptyState?.classList.remove('is-hidden');
        } else {
            emptyState?.classList.add('is-hidden');
            
            const documentsHTML = documents.map(doc => {
                const isCurrentlyLoaded = this.currentFile && this.currentFile.filename === doc.filename;
                const statusClass = isCurrentlyLoaded ? 'currently-loaded' : '';
                const statusIcon = isCurrentlyLoaded ? 'fa-check-circle' : '';
                
                return `
                <div class="document-item ${statusClass}" data-filename="${doc.filename}" data-full-path="${doc.full_path || ''}">
                    <div class="document-item-icon">
                        <i class="fas ${this.getFileIcon(doc.filename)}"></i>
                    </div>
                    <div class="document-item-info">
                        <div class="document-item-name">${doc.filename}</div>
                        <div class="document-item-meta">
                            ${doc.size ? this.formatFileSize(doc.size) : 'Unknown size'}
                        </div>
                    </div>
                    ${isCurrentlyLoaded ? `
                        <div class="document-item-status">
                            <i class="fas fa-check-circle" title="Currently loaded"></i>
                        </div>
                    ` : ''}
                </div>
            `;
            }).join('');

            documentList.innerHTML = documentsHTML;

            // Add click handlers
            documentList.querySelectorAll('.document-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.selectDocumentInList(item);
                });
            });
        }
    }

    showDocumentListInPreview(documents) {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;

        const documentsHTML = `
            <div class="preview-document-list">
                <div class="preview-header">
                    <i class="fas fa-files"></i>
                    <h3>Documents in this chat</h3>
                    <p class="document-count">${documents.length} ${documents.length === 1 ? 'document' : 'documents'} available</p>
                </div>
                <div class="preview-documents">
                    ${documents.map(doc => `
                        <div class="preview-document-item" data-filename="${doc.filename}" data-full-path="${doc.full_path || ''}">
                            <div class="preview-doc-icon">
                                <i class="fas ${this.getFileIcon(doc.filename)}"></i>
                            </div>
                            <div class="preview-doc-info">
                                <div class="preview-doc-name">${doc.filename}</div>
                                <div class="preview-doc-meta">
                                    ${doc.size ? this.formatFileSize(doc.size) : 'Click to open'}
                                </div>
                            </div>
                            <div class="preview-doc-actions">
                                <button class="preview-doc-load" title="Load document">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="preview-actions">
                    <button id="previewManageDocsBtn" class="btn-secondary">
                        <i class="fas fa-cog"></i>
                        Manage Documents
                    </button>
                </div>
            </div>
        `;

        previewContent.innerHTML = documentsHTML;

        // Add click handlers for document items
        previewContent.querySelectorAll('.preview-document-item').forEach(item => {
            const loadBtn = item.querySelector('.preview-doc-load');
            const filename = item.dataset.filename;
            const fullPath = item.dataset.fullPath;

            const loadDocument = async () => {
                try {
                    await this.loadDocument(filename, fullPath || null);
                } catch (error) {
                    console.error('Error loading document from preview:', error);
                    this.showToast('Failed to load document', 'error');
                }
            };

            // Load on item click or button click
            item.addEventListener('click', loadDocument);
            loadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                loadDocument();
            });
        });

        // Add manage documents button handler
        document.getElementById('previewManageDocsBtn')?.addEventListener('click', () => {
            this.showDocumentModal();
        });
    }

    showEmptyPreviewPlaceholder() {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;

        previewContent.innerHTML = `
            <div class="preview-placeholder">
                <i class="fas fa-file-alt"></i>
                <p>No documents in this chat</p>
                <button id="selectDocumentBtn" class="btn-primary">
                    <i class="fas fa-folder-open"></i>
                    Upload Document
                </button>
            </div>
        `;

        // Re-attach the document selection handler
        document.getElementById('selectDocumentBtn')?.addEventListener('click', () => {
            this.showDocumentModal();
        });
    }

    updateDocumentCount(count) {
        const countElement = document.getElementById('documentCount');
        if (countElement) {
            const text = count === 1 ? '1 document' : `${count} documents`;
            countElement.textContent = text;
        }
    }

    selectDocumentInList(item) {
        // Remove previous selection
        document.querySelectorAll('.document-item').forEach(el => {
            el.classList.remove('selected');
        });

        // Add selection to clicked item
        item.classList.add('selected');
        
        const filename = item.dataset.filename;
        const full_path = item.dataset.fullPath;
        this.selectedDocumentInModal = { 
            filename, 
            full_path: full_path || null 
        };

        // Enable select button and update its state
        const selectBtn = document.getElementById('selectDocumentFromModal');
        if (selectBtn) {
            // Check if this document is already loaded
            const isAlreadyLoaded = this.currentFile && this.currentFile.filename === filename;
            selectBtn.disabled = false;
            
            if (isAlreadyLoaded) {
                selectBtn.innerHTML = `
                    <i class="fas fa-check-circle"></i>
                    Already Selected
                `;
                selectBtn.style.opacity = '0.8';
                selectBtn.title = 'This document is already loaded';
            } else {
                selectBtn.innerHTML = `
                    <i class="fas fa-check"></i>
                    Select Document
                `;
                selectBtn.style.opacity = '1';
                selectBtn.title = 'Select this document';
            }
        }
    }

    showEmptyDocumentList() {
        const documentList = document.getElementById('documentList');
        const emptyState = document.getElementById('documentListEmpty');

        if (documentList) documentList.innerHTML = '';
        emptyState?.classList.remove('is-hidden');
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            // Documents
            'pdf': 'fa-file-pdf',
            'doc': 'fa-file-word',
            'docx': 'fa-file-word',
            'odt': 'fa-file-word',
            'rtf': 'fa-file-word',
            
            // Spreadsheets
            'xlsx': 'fa-file-excel',
            'xls': 'fa-file-excel',
            'csv': 'fa-file-csv',
            'ods': 'fa-file-excel',
            
            // Presentations
            'ppt': 'fa-file-powerpoint',
            'pptx': 'fa-file-powerpoint',
            'odp': 'fa-file-powerpoint',
            
            // Text files
            'txt': 'fa-file-alt',
            'md': 'fa-file-alt',
            'markdown': 'fa-file-alt',
            
            // Code files
            'js': 'fa-file-code',
            'ts': 'fa-file-code',
            'py': 'fa-file-code',
            'java': 'fa-file-code',
            'cpp': 'fa-file-code',
            'c': 'fa-file-code',
            'cs': 'fa-file-code',
            'php': 'fa-file-code',
            'rb': 'fa-file-code',
            'go': 'fa-file-code',
            'rs': 'fa-file-code',
            'swift': 'fa-file-code',
            'kt': 'fa-file-code',
            'scala': 'fa-file-code',
            
            // Web files
            'html': 'fa-file-code',
            'htm': 'fa-file-code',
            'xml': 'fa-file-code',
            'css': 'fa-file-code',
            'scss': 'fa-file-code',
            'sass': 'fa-file-code',
            'less': 'fa-file-code',
            'json': 'fa-file-code',
            'yaml': 'fa-file-code',
            'yml': 'fa-file-code',
            
            // Config files
            'ini': 'fa-file-alt',
            'conf': 'fa-file-alt',
            'cfg': 'fa-file-alt',
            'toml': 'fa-file-alt',
            
            // Images
            'jpg': 'fa-file-image',
            'jpeg': 'fa-file-image',
            'png': 'fa-file-image',
            'gif': 'fa-file-image',
            'bmp': 'fa-file-image',
            'svg': 'fa-file-image',
            'webp': 'fa-file-image',
            
            // Archives
            'zip': 'fa-file-archive',
            'rar': 'fa-file-archive',
            '7z': 'fa-file-archive',
            'tar': 'fa-file-archive',
            'gz': 'fa-file-archive'
        };
        return iconMap[ext] || 'fa-file';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Public API methods
    toggleFileViewer() {
        if (this.isVisible) {
            this.hideFileViewer();
        } else {
            this.showFileViewer();
        }
    }

    showFileViewer() {
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

    hideFileViewer() {
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

    updateToggleButtonState(isVisible) {
        const toggleBtn = document.getElementById('fileViewerToggle');
        if (toggleBtn) {
            if (isVisible) {
                toggleBtn.classList.add('active');
            } else {
                toggleBtn.classList.remove('active');
            }
        }
    }

    openDocumentModal() {
        const modal = document.getElementById('documentModal');
        if (modal) {
            console.log('Opening document modal');
            modal.classList.remove('is-hidden');
            modal.style.display = 'flex';
            modal.style.zIndex = '10000';
            modal.setAttribute('aria-hidden', 'false');
            
            this.refreshDocumentList();
            
            // Focus the modal for accessibility
            setTimeout(() => {
                modal.focus();
            }, 100);
        } else {
            console.error('Document modal not found');
        }
    }

    closeDocumentModal() {
        const modal = document.getElementById('documentModal');
        if (modal) {
            console.log('Closing document modal');
            modal.classList.add('is-hidden');
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
        this.selectedDocumentInModal = null;
        
        // Reset loading state
        this.isLoadingDocument = false;
        
        // Reset select button
        const selectBtn = document.getElementById('selectDocumentFromModal');
        if (selectBtn) {
            selectBtn.disabled = true;
            selectBtn.innerHTML = `
                <i class="fas fa-check"></i>
                Select Document
            `;
            selectBtn.style.opacity = '1';
            selectBtn.title = '';
        }

        // Hide any error messages
        const errorElement = document.getElementById('modal-error-message');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    async selectDocumentFromModal() {
        if (!this.selectedDocumentInModal) return;
        
        // Prevent multiple simultaneous selections
        const selectBtn = document.getElementById('selectDocumentFromModal');
        if (this.isLoadingDocument || (selectBtn && selectBtn.disabled)) {
            console.log('Document already loading, ignoring duplicate request');
            return;
        }

        // Set loading state
        this.isLoadingDocument = true;
        this.setSelectButtonLoading(true);

        try {
            const filename = this.selectedDocumentInModal.filename;
            const full_path = this.selectedDocumentInModal.full_path;
            
            // Check if this document is already loaded
            if (this.currentFile && this.currentFile.filename === filename) {
                console.log('Document already loaded:', filename);
                this.closeDocumentModal();
                return;
            }

            await this.loadDocument(filename, full_path);
            this.closeDocumentModal();
            
            // Show file viewer if not visible
            if (!this.isVisible) {
                this.showFileViewer();
            }
        } catch (error) {
            console.error('Error selecting document:', error);
            // Show error feedback to user
            this.showErrorMessage('Failed to load document. Please try again.');
        } finally {
            // Reset loading state
            this.isLoadingDocument = false;
            this.setSelectButtonLoading(false);
        }
    }

    setSelectButtonLoading(isLoading) {
        const selectBtn = document.getElementById('selectDocumentFromModal');
        if (!selectBtn) return;

        if (isLoading) {
            selectBtn.disabled = true;
            selectBtn.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Loading...
            `;
            selectBtn.style.opacity = '0.7';
        } else {
            selectBtn.disabled = !this.selectedDocumentInModal;
            selectBtn.innerHTML = `
                <i class="fas fa-check"></i>
                Select Document
            `;
            selectBtn.style.opacity = '1';
        }
    }

    showErrorMessage(message) {
        // Create or update error message element
        let errorElement = document.getElementById('modal-error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'modal-error-message';
            errorElement.className = 'modal-error-message';
            
            // Insert before modal footer
            const modalFooter = document.querySelector('.document-modal .modal-footer');
            if (modalFooter) {
                modalFooter.parentNode.insertBefore(errorElement, modalFooter);
            }
        }

        errorElement.innerHTML = `
            <div class="error-content">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${message}</span>
                <button class="error-close" onclick="this.parentElement.parentElement.style.display='none'">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        errorElement.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (errorElement) {
                errorElement.style.display = 'none';
            }
        }, 5000);
    }

    async loadDocument(filename, full_path = null) {
        // Clean up any previous PDF blob URLs
        this.cleanup();
        
        this.currentFile = { 
            filename,
            full_path: full_path 
        };
        
        // Update UI - basic update, will be enhanced in loadFilePreview for PDF/DOC files
        this.updateBasicFileInfo(filename);
        this.enableAnalysisButtons();
        
        // Load content preview
        await this.loadFilePreview(filename);
    }

    updateBasicFileInfo(filename) {
        const nameElement = document.getElementById('selectedFileName');
        const sizeElement = document.getElementById('selectedFileSize');
        
        if (nameElement) {
            nameElement.textContent = filename;
        }
        
        // Clear any existing PDF controls for non-PDF files
        const existingPdfControls = document.querySelector('.file-viewer-actions .pdf-controls');
        if (existingPdfControls) {
            existingPdfControls.remove();
        }
        
        // You could fetch file size here if available
        if (sizeElement) {
            sizeElement.textContent = '';
        }
    }

    updateFileInfo(filename) {
        // Legacy method - redirect to basic update
        this.updateBasicFileInfo(filename);
    }

    updateFileViewerHeader(filename, typeLabel, iconClassOrOptions, isDocFormat) {
        const nameElement = document.getElementById('selectedFileName');
        const sizeElement = document.getElementById('selectedFileSize');
        const actionsContainer = document.querySelector('.file-viewer-actions');
        
        // Handle both old and new calling patterns
        let iconClass, options = {};
        if (typeof iconClassOrOptions === 'object') {
            options = iconClassOrOptions;
            iconClass = this.getFileIcon(filename);
        } else {
            iconClass = iconClassOrOptions;
        }
        
        if (nameElement) {
            // Always show the full file name with ellipsis and tooltip
            nameElement.innerHTML = `
                <i class="${iconClass}" style="color: var(--primary-color); margin-right: 8px;"></i>
                <span class="file-type-label">${typeLabel}</span>
                <span class="file-name-text" title="${filename}" style="max-width: 100%; display: inline-block; vertical-align: middle;">${filename}</span>
            `;
        }
        
        if (actionsContainer) {
            // Remove any existing PDF controls
            const existingPdfControls = actionsContainer.querySelector('.pdf-controls');
            if (existingPdfControls) {
                existingPdfControls.remove();
            }
            
            // Add PDF controls for PDF/DOC files or when specifically requested
            if (typeLabel === 'PDF' || isDocFormat || options.showPdfToggle) {
                const pdfControls = document.createElement('div');
                pdfControls.className = 'pdf-controls';
                
                if (options.showPdfToggle) {
                    // We're in toggle mode
                    if (options.isPdfView) {
                        // Currently showing PDF, offer EditorJS view
                        pdfControls.innerHTML = `
                            <button class="btn-secondary pdf-control-btn" onclick="window.open('${options.pdfUrl}', '_blank')" title="Open in new tab">
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                            <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.showEditorJSVersion('${filename}')" title="Show rich editor">
                                <i class="fas fa-edit"></i>
                            </button>
                        `;
                    } else {
                        // Currently showing EditorJS, offer PDF view
                        pdfControls.innerHTML = `
                            <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.showPdfVersion()" title="Show PDF version">
                                <i class="fas fa-file-pdf"></i>
                            </button>
                        `;
                    }
                } else {
                    // Default PDF controls - show EditorJS option
                    pdfControls.innerHTML = `
                        <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.showEditorJSVersion('${filename}')" title="Show rich editor">
                            <i class="fas fa-edit"></i>
                        </button>
                    `;
                }
                
                // Add notes button
                const notesBtn = document.createElement('button');
                notesBtn.className = 'btn-secondary pdf-control-btn';
                notesBtn.id = 'notesEditorBtn';
                notesBtn.title = 'Open Notes Editor';
                notesBtn.innerHTML = '<i class="fas fa-sticky-note"></i>';
                notesBtn.onclick = () => FileViewerRedesigned.instance.openNotesEditor();
                pdfControls.appendChild(notesBtn);
                
                // Insert before the manage documents button
                const manageBtn = actionsContainer.querySelector('#manageDocumentsBtn');
                if (manageBtn) {
                    actionsContainer.insertBefore(pdfControls, manageBtn);
                } else {
                    actionsContainer.insertBefore(pdfControls, actionsContainer.firstChild);
                }
            }
        }
        
        // Set up instance reference for PDF controls
        FileViewerRedesigned.instance = this;
    }

    enableAnalysisButtons() {
        const buttons = [
            'generateSummaryBtn',
            'extractReferencesBtn', 
            'findHighlightsBtn',
            'suggestInsightsBtn'
        ];
        
        buttons.forEach(buttonId => {
            const btn = document.getElementById(buttonId);
            if (btn) {
                btn.disabled = false;
            }
        });
    }

    disableAnalysisButtons() {
        const buttons = [
            'generateSummaryBtn',
            'extractReferencesBtn',
            'findHighlightsBtn', 
            'suggestInsightsBtn'
        ];
        
        buttons.forEach(buttonId => {
            const btn = document.getElementById(buttonId);
            if (btn) {
                btn.disabled = true;
            }
        });
    }

    async loadFilePreview(filename) {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;

        previewContent.innerHTML = '<div class="loading">Loading preview...</div>';

        try {
            // Get file metadata first
            const response = await fetch(`/api/rag/document-content/${window.currentChatId}/${encodeURIComponent(filename)}`);
            
            if (response.ok) {
                const result = await response.json();
                const content = result.content || 'Content not available';
                const fileType = result.file_type || this.getFileExtension(filename);
                
                // For PDFs, try to load the original file for better viewing
                if (fileType === 'pdf') {
                    await this.loadPdfPreview(filename, result);
                } else if (fileType === 'docx' || fileType === 'doc') {
                    // For DOC/DOCX files, try to load as converted PDF first
                    await this.loadPdfPreview(filename, result);
                } else {
                    // Display content with basic formatting for other file types
                    this.displayContent(content, filename);
                }
            } else {
                previewContent.innerHTML = `
                    <div class="preview-unavailable">
                        <i class="fas fa-file"></i>
                        <p>Preview not available for this file type</p>
                        <p class="file-info">File: ${filename}</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading file preview:', error);
            previewContent.innerHTML = `
                <div class="preview-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading file preview</p>
                </div>
            `;
        }

        // Notify document actions manager about document selection (include server path when available)
        if (typeof window !== 'undefined' && window.document) {
            const detail = {
                filename: filename,
                chatId: window.currentChatId,
                timestamp: Date.now()
            };
            if (this.currentFile && this.currentFile.full_path) {
                detail.path = this.currentFile.full_path;
            }
            window.document.dispatchEvent(new CustomEvent('documentSelected', { detail }));
        }
    }
    
    async loadPdfPreview(filename, fallbackData) {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;
        
        const fileExt = this.getFileExtension(filename).toLowerCase();
        const isDocFormat = fileExt === 'doc' || fileExt === 'docx';
        const isPdfFormat = fileExt === 'pdf';
        
        // Determine appropriate icon and label
        let iconClass = 'fas fa-file';
        let typeLabel = 'Document';
        
        if (isPdfFormat) {
            iconClass = 'fas fa-file-pdf';
            typeLabel = 'PDF Document';
        } else if (isDocFormat) {
            iconClass = 'fas fa-file-word';
            typeLabel = 'Word Document';
        }
        
        // Update file viewer header with file type info and controls
        this.updateFileViewerHeader(filename, typeLabel, iconClass, isDocFormat);

        // Keep the existing styled loading state instead of replacing it
        // The "Loading preview..." message is already showing and styled
        
        // Set up instance reference
        FileViewerRedesigned.instance = this;
        
        try {
            // Try to load the original PDF file or converted PDF
            const chatId = window.currentChatId || 'default';
            const pdfResponse = await fetch(`/api/rag/document-file/${chatId}/${encodeURIComponent(filename)}`);
            
            if (pdfResponse.ok) {
                // Always use our PDF.js-based viewer for accurate, scriptable highlights
                const pdfEndpoint = `/api/rag/document-file/${chatId}/${encodeURIComponent(filename)}`;
                // Use the full pdf.js default viewer UI vendored under static/pdfjs
                const viewerUrl = `/static/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfEndpoint)}`;

                previewContent.innerHTML = `
                    <div class="pdf-viewer-container">
                        <div class="pdf-content-container">
                            <iframe 
                                src="${viewerUrl}"
                                class="pdf-iframe"
                                frameborder="0"
                                title="Document Preview"
                                onload="console.log('PDF.js viewer loaded')">
                                <p>Your browser doesn't support PDF viewing. <a href="${pdfEndpoint}" target="_blank">Click here to view the document</a></p>
                            </iframe>
                        </div>
                        <div class="pdf-text-fallback" style="display: none;">
                            ${this.formatPdfContent(fallbackData.content)}
                        </div>
                    </div>
                `;

                // Update header with full PDF controls (open in new tab should open original PDF)
                this.updateFileViewerHeader(filename, typeLabel, {
                    showPdfToggle: true,
                    isPdfView: true,
                    pdfUrl: pdfEndpoint
                });

                // Store endpoint for highlight actions
                this.currentPdfUrl = pdfEndpoint;
                console.log('Document loaded with PDF.js viewer');
                return;
            } else if (pdfResponse.status === 422) {
                // Conversion failed, try to get error details
                try {
                    const errorData = await pdfResponse.json();
                    if (errorData.fallback) {
                        console.log('Document conversion failed, showing text version');
                        this.showTextVersion(filename);
                        return;
                    }
                } catch (e) {
                    // Ignore JSON parsing errors, fall through to text version
                }
            }
            
            // If we reach here, PDF serving failed - show text fallback
            console.log('PDF serving failed, showing text version');
            this.showTextVersion(filename);
                
        } catch (error) {
            console.error('Error loading PDF preview:', error);
            this.showTextVersion(filename);
        }
    }
    
    showPdfTextFallback(filename, data) {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;
        
        previewContent.innerHTML = `
            <div class="pdf-text-viewer">
                <div class="file-type-header">
                    <div class="file-type-info">
                        <i class="fas fa-file-pdf"></i>
                        <span class="file-type-label">PDF Document (Text View)</span>
                        <span class="file-name">${filename}</span>
                    </div>
                </div>
                <div class="pdf-text-content">
                    ${this.formatPdfContent(data.content)}
                </div>
                ${data.truncated ? '<div class="truncation-notice"><i class="fas fa-info-circle"></i> Content has been truncated for preview</div>' : ''}
            </div>
        `;
    }
    
    // Clean up blob URLs when switching files
    cleanup() {
        if (this.currentPdfUrl) {
            URL.revokeObjectURL(this.currentPdfUrl);
            this.currentPdfUrl = null;
        }
    }

    displayContent(content, filename) {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;

        const fileExtension = this.getFileExtension(filename);
        const fileType = this.detectFileType(filename);
        const typeLabel = this.getFileTypeLabel(fileType);
        const iconClass = this.getFileIcon(filename);
        
        // Update file viewer header with file type info
        this.updateFileViewerHeader(filename, typeLabel, iconClass, false);
        
        // Clear previous content
        previewContent.innerHTML = '';
        
        // Create content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = `document-content file-type-${fileType}`;
        
        // Format content based on file type (no separate header needed since it's in main header now)
        const formattedContent = this.formatContentByType(content, fileType, filename);
        
        const contentBody = document.createElement('div');
        contentBody.className = 'file-content-body';
        contentBody.innerHTML = formattedContent;
        contentWrapper.appendChild(contentBody);
        
        previewContent.appendChild(contentWrapper);
        
        // Apply post-processing (syntax highlighting, etc.)
        this.applyContentEnhancements(contentBody, fileType, filename);
    }
    
    getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }
    
    detectFileType(filename) {
        const ext = this.getFileExtension(filename);
        const typeMap = {
            // Documents
            'pdf': 'pdf',
            'doc': 'word',
            'docx': 'word',
            'odt': 'word',
            'rtf': 'word',
            
            // Spreadsheets
            'xlsx': 'excel',
            'xls': 'excel',
            'csv': 'csv',
            'ods': 'excel',
            
            // Presentations
            'ppt': 'powerpoint',
            'pptx': 'powerpoint',
            'odp': 'powerpoint',
            
            // Text files
            'txt': 'text',
            'md': 'markdown',
            'markdown': 'markdown',
            
            // Code files
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'php': 'php',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'swift': 'swift',
            'kt': 'kotlin',
            'scala': 'scala',
            
            // Web files
            'html': 'html',
            'htm': 'html',
            'xml': 'xml',
            'css': 'css',
            'scss': 'scss',
            'sass': 'sass',
            'less': 'less',
            'json': 'json',
            'yaml': 'yaml',
            'yml': 'yaml',
            
            // Config files
            'ini': 'config',
            'conf': 'config',
            'cfg': 'config',
            'toml': 'config',
            
            // Images
            'jpg': 'image',
            'jpeg': 'image',
            'png': 'image',
            'gif': 'image',
            'bmp': 'image',
            'svg': 'image',
            'webp': 'image',
            
            // Archives
            'zip': 'archive',
            'rar': 'archive',
            '7z': 'archive',
            'tar': 'archive',
            'gz': 'archive'
        };
        
        return typeMap[ext] || 'unknown';
    }
    
    getFileTypeLabel(fileType) {
        const labels = {
            'pdf': 'PDF',
            'word': 'Word',
            'excel': 'Excel',
            'csv': 'CSV',
            'powerpoint': 'PowerPoint',
            'text': 'Text',
            'markdown': 'Markdown',
            'javascript': 'JavaScript',
            'typescript': 'TypeScript',
            'python': 'Python',
            'java': 'Java',
            'cpp': 'C++',
            'c': 'C',
            'csharp': 'C#',
            'php': 'PHP',
            'ruby': 'Ruby',
            'go': 'Go',
            'rust': 'Rust',
            'swift': 'Swift',
            'kotlin': 'Kotlin',
            'scala': 'Scala',
            'html': 'HTML',
            'xml': 'XML',
            'css': 'CSS',
            'scss': 'SCSS',
            'sass': 'SASS',
            'less': 'LESS',
            'json': 'JSON',
            'yaml': 'YAML',
            'config': 'Config',
            'image': 'Image',
            'archive': 'Archive',
            'unknown': 'Document'
        };
        
        return labels[fileType] || 'Document';
    }
    
    formatContentByType(content, fileType, filename) {
        switch (fileType) {
            case 'pdf':
                return this.formatPdfContent(content);
            case 'word':
                return this.formatWordContent(content);
            case 'excel':
            case 'csv':
                return this.formatSpreadsheetContent(content, fileType);
            case 'powerpoint':
                return this.formatPresentationContent(content);
            case 'markdown':
                return this.formatMarkdownContent(content);
            case 'json':
                return this.formatJsonContent(content);
            case 'xml':
                return this.formatXmlContent(content);
            case 'yaml':
                return this.formatYamlContent(content);
            case 'html':
                return this.formatHtmlContent(content);
            case 'css':
            case 'scss':
            case 'sass':
            case 'less':
                return this.formatStylesheetContent(content, fileType);
            case 'javascript':
            case 'typescript':
            case 'python':
            case 'java':
            case 'cpp':
            case 'c':
            case 'csharp':
            case 'php':
            case 'ruby':
            case 'go':
            case 'rust':
            case 'swift':
            case 'kotlin':
            case 'scala':
                return this.formatCodeContent(content, fileType);
            case 'config':
                return this.formatConfigContent(content);
            case 'image':
                return this.formatImageContent(content, filename);
            default:
                return this.formatTextContent(content);
        }
    }
    
    formatPdfContent(content) {
        // Enhanced PDF content formatting with better structure preservation
        if (!content || content.trim() === '') {
            return '<p class="no-content">No content available</p>';
        }
        
        // Split content into pages if page markers are present
        const pages = content.split(/(?:Page\s+\d+|---+\s*Page\s*\d+\s*---+|^\s*\d+\s*$)/im);
        
        if (pages.length > 1) {
            return pages.map((page, index) => {
                if (index === 0 && !page.trim()) return '';
                
                const pageNum = index === 0 ? 1 : index;
                const pageContent = this.formatPdfPageContent(page.trim());
                
                return `
                    <div class="pdf-page">
                        <div class="page-header">
                            <i class="fas fa-file-pdf"></i>
                            <span class="page-number">Page ${pageNum}</span>
                        </div>
                        <div class="page-content">${pageContent}</div>
                    </div>
                `;
            }).filter(p => p).join('');
        }
        
        return `<div class="pdf-content">${this.formatPdfPageContent(content)}</div>`;
    }
    
    formatPdfPageContent(content) {
        if (!content || content.trim() === '') {
            return '<p class="no-content">No content available</p>';
        }
        
        // Enhanced text processing for better structure preservation
        let formatted = content;
        
        // Preserve and enhance headings (lines that look like titles)
        formatted = formatted.replace(/^([A-Z][A-Z\s\d\.\-:]{10,80})$/gm, '<h3 class="pdf-heading">$1</h3>');
        
        // Preserve and enhance numbered sections
        formatted = formatted.replace(/^(\d+\.?\s+[A-Z][^.\n]{10,100})$/gm, '<h4 class="pdf-section">$1</h4>');
        
        // Preserve bullet points
        formatted = formatted.replace(/^(\s*)[•\-\*]\s+(.+)$/gm, '$1<li class="pdf-bullet">$2</li>');
        
        // Wrap consecutive bullet points in lists
        formatted = formatted.replace(/(<li class="pdf-bullet">.*?<\/li>)(\s*<li class="pdf-bullet">.*?<\/li>)+/gs, '<ul class="pdf-list">$&</ul>');
        
        // Preserve numbered lists
        formatted = formatted.replace(/^(\s*)(\d+\.)\s+(.+)$/gm, '$1<li class="pdf-numbered" data-number="$2">$3</li>');
        
        // Wrap consecutive numbered items in lists
        formatted = formatted.replace(/(<li class="pdf-numbered".*?<\/li>)(\s*<li class="pdf-numbered".*?<\/li>)+/gs, '<ol class="pdf-numbered-list">$&</ol>');
        
        // Preserve paragraph structure
        formatted = formatted.replace(/\n\s*\n/g, '</p><p class="pdf-paragraph">');
        
        // Wrap in paragraph tags if not already wrapped
        if (!formatted.includes('<p') && !formatted.includes('<h') && !formatted.includes('<li')) {
            formatted = `<p class="pdf-paragraph">${formatted}</p>`;
        } else {
            // Ensure we start with a paragraph if needed
            if (!formatted.startsWith('<')) {
                formatted = `<p class="pdf-paragraph">${formatted}`;
            }
        }
        
        // Clean up any malformed tags
        formatted = formatted.replace(/<p class="pdf-paragraph">\s*<\/p>/g, '');
        formatted = formatted.replace(/<p class="pdf-paragraph">\s*(<[hul])/g, '$1');
        
        return formatted;
    }
    
    formatWordContent(content) {
        // Format Word document content with paragraph structure
        const paragraphs = content.split(/\n\s*\n/);
        
        return paragraphs.map(paragraph => {
            const trimmed = paragraph.trim();
            if (!trimmed) return '';
            
            // Detect headings (lines that are short and might be titles)
            if (trimmed.length < 80 && !trimmed.endsWith('.') && !trimmed.includes('\n')) {
                return `<h3 class="document-heading">${this.escapeHtml(trimmed)}</h3>`;
            }
            
            return `<p class="document-paragraph">${this.formatTextContent(trimmed)}</p>`;
        }).join('');
    }
    
    formatSpreadsheetContent(content, fileType) {
        if (fileType === 'csv') {
            return this.formatCsvContent(content);
        }
        
        // For Excel files, try to parse as CSV-like content
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length === 0) return '<p>No data available</p>';
        
        // Try to detect if it's tabular data
        const firstLine = lines[0];
        if (firstLine.includes('\t') || firstLine.includes(',')) {
            return this.formatCsvContent(content);
        }
        
        return this.formatTextContent(content);
    }
    
    formatCsvContent(content) {
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length === 0) return '<p>No data available</p>';
        
        // Detect delimiter
        const firstLine = lines[0];
        const delimiter = firstLine.includes('\t') ? '\t' : ',';
        
        const rows = lines.map(line => line.split(delimiter));
        const maxColumns = Math.max(...rows.map(row => row.length));
        
        if (rows.length === 0) return '<p>No data available</p>';
        
        let html = '<div class="csv-table-container"><table class="csv-table">';
        
        // Header row
        if (rows.length > 0) {
            html += '<thead><tr>';
            for (let i = 0; i < maxColumns; i++) {
                const cell = rows[0][i] || '';
                html += `<th>${this.escapeHtml(cell)}</th>`;
            }
            html += '</tr></thead>';
        }
        
        // Data rows
        html += '<tbody>';
        for (let i = 1; i < Math.min(rows.length, 101); i++) { // Limit to 100 data rows
            html += '<tr>';
            for (let j = 0; j < maxColumns; j++) {
                const cell = rows[i][j] || '';
                html += `<td>${this.escapeHtml(cell)}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        
        if (rows.length > 101) {
            html += `<p class="table-truncated">Showing first 100 rows of ${rows.length - 1} total rows</p>`;
        }
        
        html += '</div>';
        return html;
    }
    
    formatPresentationContent(content) {
        // Format PowerPoint content with slide structure
        const slides = content.split(/(?:Slide\s+\d+|---+)/i);
        
        if (slides.length > 1) {
            return slides.map((slide, index) => {
                if (index === 0 && !slide.trim()) return '';
                
                const slideNum = index === 0 ? 1 : index;
                const slideContent = this.formatTextContent(slide.trim());
                
                return `
                    <div class="presentation-slide">
                        <div class="slide-header">
                            <i class="fas fa-file-powerpoint"></i>
                            Slide ${slideNum}
                        </div>
                        <div class="slide-content">${slideContent}</div>
                    </div>
                `;
            }).join('');
        }
        
        return `<div class="presentation-content">${this.formatTextContent(content)}</div>`;
    }
    
    formatMarkdownContent(content) {
        // Simple markdown-to-HTML conversion
        let html = content
            // Headers
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            // Bold and italic
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Code blocks
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            // Lists
            .replace(/^\* (.*$)/gim, '<li>$1</li>')
            .replace(/^- (.*$)/gim, '<li>$1</li>')
            // Line breaks
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        // Wrap in paragraphs and fix lists
        html = '<p>' + html + '</p>';
        html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
        html = html.replace(/<\/ul><ul>/g, '');
        
        return html;
    }
    
    formatJsonContent(content) {
        try {
            // Try to parse and pretty-print JSON
            const parsed = JSON.parse(content);
            const prettyJson = JSON.stringify(parsed, null, 2);
            return `<pre class="json-content"><code class="language-json">${this.escapeHtml(prettyJson)}</code></pre>`;
        } catch (e) {
            // If not valid JSON, treat as text
            return `<pre class="json-content"><code>${this.escapeHtml(content)}</code></pre>`;
        }
    }
    
    formatXmlContent(content) {
        // Basic XML formatting with indentation
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(content, 'text/xml');
            
            if (xmlDoc.documentElement.nodeName === 'parsererror') {
                throw new Error('Invalid XML');
            }
            
            // Simple indentation
            const formatted = content
                .replace(/></g, '>\n<')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .join('\n');
            
            return `<pre class="xml-content"><code class="language-xml">${this.escapeHtml(formatted)}</code></pre>`;
        } catch (e) {
            return `<pre class="xml-content"><code>${this.escapeHtml(content)}</code></pre>`;
        }
    }
    
    formatYamlContent(content) {
        return `<pre class="yaml-content"><code class="language-yaml">${this.escapeHtml(content)}</code></pre>`;
    }
    
    formatHtmlContent(content) {
        return `<pre class="html-content"><code class="language-html">${this.escapeHtml(content)}</code></pre>`;
    }
    
    formatStylesheetContent(content, fileType) {
        const language = fileType === 'scss' ? 'scss' : fileType === 'sass' ? 'sass' : fileType === 'less' ? 'less' : 'css';
        return `<pre class="stylesheet-content"><code class="language-${language}">${this.escapeHtml(content)}</code></pre>`;
    }
    
    formatCodeContent(content, fileType) {
        const languageMap = {
            'javascript': 'javascript',
            'typescript': 'typescript',
            'python': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'csharp': 'csharp',
            'php': 'php',
            'ruby': 'ruby',
            'go': 'go',
            'rust': 'rust',
            'swift': 'swift',
            'kotlin': 'kotlin',
            'scala': 'scala'
        };
        
        const language = languageMap[fileType] || fileType;
        return `<pre class="code-content"><code class="language-${language}">${this.escapeHtml(content)}</code></pre>`;
    }
    
    formatConfigContent(content) {
        return `<pre class="config-content"><code class="language-ini">${this.escapeHtml(content)}</code></pre>`;
    }
    
    formatImageContent(content, filename) {
        // For images, we might receive base64 data or a description
        if (content.startsWith('data:image/') || content.startsWith('iVBORw0KGgo') || content.includes('base64')) {
            return `
                <div class="image-preview">
                    <img src="${content}" alt="${filename}" class="preview-image" />
                    <p class="image-info">Image: ${filename}</p>
                </div>
            `;
        }
        
        // If it's not image data, show a placeholder with file info
        return `
            <div class="image-placeholder">
                <i class="fas fa-image"></i>
                <p>Image file: ${filename}</p>
                <p class="file-note">Image preview not available in text format</p>
            </div>
        `;
    }
    
    formatTextContent(content) {
        // Enhanced text formatting with paragraph detection
        const paragraphs = content.split(/\n\s*\n/);
        
        return paragraphs.map(paragraph => {
            const trimmed = paragraph.trim();
            if (!trimmed) return '';
            
            // Format line breaks within paragraphs
            const formatted = trimmed.replace(/\n/g, '<br>');
            return `<p class="text-paragraph">${this.escapeHtml(formatted)}</p>`;
        }).join('');
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    applyContentEnhancements(contentElement, fileType, filename) {
        // Apply syntax highlighting if highlight.js is available
        if (window.hljs) {
            contentElement.querySelectorAll('pre code[class*="language-"]').forEach(block => {
                try {
                    window.hljs.highlightElement(block);
                } catch (e) {
                    console.warn('Syntax highlighting failed:', e);
                }
            });
        }
        
        // Add copy buttons to code blocks
        contentElement.querySelectorAll('pre').forEach(pre => {
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-code-btn';
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
            copyButton.title = 'Copy code';
            
            copyButton.addEventListener('click', () => {
                const code = pre.textContent;
                navigator.clipboard.writeText(code).then(() => {
                    copyButton.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => {
                        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                    }, 2000);
                });
            });
            
            pre.style.position = 'relative';
            pre.appendChild(copyButton);
        });
        
        // Add line numbers to long code blocks
        contentElement.querySelectorAll('pre code').forEach(codeBlock => {
            const lines = codeBlock.textContent.split('\n');
            if (lines.length > 10) {
                codeBlock.classList.add('line-numbers');
            }
        });
        
        // Make tables responsive
        contentElement.querySelectorAll('table').forEach(table => {
            if (!table.parentElement.classList.contains('csv-table-container')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-responsive';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });
    }

    async performAnalysis(analysisType) {
        if (!this.currentFile) {
            this.showToast('Please select a document first', 'warning');
            return;
        }

        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;

        let prompt = '';
        const filename = this.currentFile.filename;

        switch (analysisType) {
            case 'summary':
                prompt = `Please provide a comprehensive summary of the document "${filename}". Include the main topics, key points, and conclusions.`;
                break;
            case 'references':
                prompt = `Extract all references, citations, and links mentioned in the document "${filename}". Include any bibliographic information or sources cited.`;
                break;
            case 'highlights':
                prompt = `Find and extract the key highlights, important annotations, and emphasized points from the document "${filename}". Look for any highlighted text, bold statements, or specially marked sections.`;
                break;
            case 'insights':
                prompt = `Based on the content of "${filename}", suggest related insights, knowledge expansions, and connections to other topics. What additional research or questions might be relevant?`;
                break;
        }

        // Set the prompt in chat input
        chatInput.value = prompt;
        chatInput.focus();
        
        // Trigger input event to update UI
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Auto-scroll chat input into view
        chatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    clearSelection() {
        this.currentFile = null;
        this.disableAnalysisButtons();
        
        // Reset UI
        const nameElement = document.getElementById('selectedFileName');
        const sizeElement = document.getElementById('selectedFileSize');
        const previewContent = document.getElementById('filePreviewContent');
        
        if (nameElement) nameElement.textContent = 'Select a document';
        if (sizeElement) sizeElement.textContent = '';
        if (previewContent) {
            previewContent.innerHTML = `
                <div class="preview-placeholder">
                    <i class="fas fa-file-alt"></i>
                    <p>Select a document to preview</p>
                    <button id="selectDocumentBtn" class="btn-primary">
                        <i class="fas fa-folder-open"></i>
                        Browse Documents
                    </button>
                </div>
            `;
            
            // Re-attach event listener
            document.getElementById('selectDocumentBtn')?.addEventListener('click', () => {
                this.openDocumentModal();
            });
        }
    }

    showToast(message, type = 'info') {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--primary-color);
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        if (type === 'error') {
            toast.style.background = '#e74c3c';
        } else if (type === 'success') {
            toast.style.background = '#27ae60';
        } else if (type === 'warning') {
            toast.style.background = '#f39c12';
        }
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }

    isFileViewerVisible() {
        return this.isVisible;
    }
    
    showEditorJSVersion(filename) {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;
        
        // Show the EditorJS version
        const container = previewContent.querySelector('.pdf-viewer-container');
        if (container) {
            const pdfContainer = container.querySelector('.pdf-content-container');
            let editorContainer = container.querySelector('.editorjs-fallback');
            
            // Create EditorJS container if it doesn't exist
            if (!editorContainer) {
                editorContainer = document.createElement('div');
                editorContainer.className = 'editorjs-fallback';
                editorContainer.style.cssText = `
                    display: none;
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    background: var(--surface);
                `;
                
                // Create EditorJS container
                const editorJSContainer = document.createElement('div');
                editorJSContainer.id = 'fileViewerEditorJS';
                editorJSContainer.style.cssText = `
                    width: 100%;
                    max-width: 100%;
                    margin: 0 auto;
                `;
                
                editorContainer.appendChild(editorJSContainer);
                container.appendChild(editorContainer);
            }
            
            if (pdfContainer && editorContainer) {
                pdfContainer.style.display = 'none';
                editorContainer.style.display = 'flex';
                
                // Initialize EditorJS with document content
                this.initializeEditorJS(filename);
                
                // Always use correct file type label
                const fname = filename || this.currentFile?.filename;
                const ext = fname ? fname.split('.').pop().toLowerCase() : '';
                const isDoc = ext === 'doc' || ext === 'docx';
                const typeLabel = isDoc ? 'Word Document' : 'PDF Document';
                this.updateFileViewerHeader(fname, typeLabel, {
                    showPdfToggle: true,
                    isPdfView: false,
                    pdfUrl: this.currentPdfUrl
                });
            }
        }
    }
    
    showPdfVersion() {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;
        
        const container = previewContent.querySelector('.pdf-viewer-container');
        if (container) {
            const pdfContainer = container.querySelector('.pdf-content-container');
            const editorContainer = container.querySelector('.editorjs-fallback');
            
            if (pdfContainer) {
                pdfContainer.style.display = 'flex';
                
                // Hide EditorJS container if it exists
                if (editorContainer) {
                    editorContainer.style.display = 'none';
                    // Destroy EditorJS instance to free memory
                    this.destroyEditorJS();
                }
                
                // Always use correct file type label
                const fname = this.currentFile?.filename;
                const ext = fname ? fname.split('.').pop().toLowerCase() : '';
                const isDoc = ext === 'doc' || ext === 'docx';
                const typeLabel = isDoc ? 'Word Document' : 'PDF Document';
                this.updateFileViewerHeader(fname, typeLabel, {
                    showPdfToggle: true,
                    isPdfView: true,
                    pdfUrl: this.currentPdfUrl
                });
            }
        }
    }

    async initializeEditorJS(filename) {
        try {
            // Destroy existing instance if any
            this.destroyEditorJS();
            
            // Get document content for EditorJS
            const documentText = await this.getDocumentContentForEditorJS(filename);
            
            // Initialize EditorJS
            this.editorJSInstance = new EditorJS({
                holder: 'fileViewerEditorJS',
                readOnly: true, // Make it read-only for viewing
                tools: {
                    header: {
                        class: Header,
                        config: {
                            placeholder: 'Enter a header',
                            levels: [1, 2, 3, 4, 5, 6],
                            defaultLevel: 2
                        }
                    },
                    paragraph: {
                        class: Paragraph,
                        inlineToolbar: true,
                    },
                    list: {
                        class: EditorjsList,
                        inlineToolbar: true,
                        config: {
                            defaultStyle: 'unordered'
                        }
                    },
                    quote: {
                        class: Quote,
                        inlineToolbar: true,
                        config: {
                            quotePlaceholder: 'Enter a quote',
                            captionPlaceholder: 'Quote\'s author',
                        },
                    },
                    marker: {
                        class: Marker,
                    },
                    code: {
                        class: CodeTool,
                        config: {
                            placeholder: 'Enter code'
                        }
                    },
                    delimiter: Delimiter,
                    table: {
                        class: Table,
                        inlineToolbar: true,
                        config: {
                            rows: 2,
                            cols: 3,
                        },
                    },
                },
                data: documentText,
                placeholder: 'Document content will appear here...'
            });

            console.log('EditorJS initialized for file viewer');
        } catch (error) {
            console.error('Failed to initialize EditorJS:', error);
            // Fallback to simple text display
            this.showSimpleTextFallback(filename);
        }
    }

    async getDocumentContentForEditorJS(filename) {
        try {
            if (!this.currentFile) {
                throw new Error('No current file selected');
            }

            // Call backend to convert document to EditorJS format
            console.log('Current file object:', this.currentFile);
            
            const response = await fetch('/api/document-to-editorjs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    document_path: this.currentFile.full_path || this.currentFile.filename,
                    filename: filename
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Backend error:', errorText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            console.log('EditorJS data received:', result.editorjs_data);
            
            // Debug: Check if accents are present in first block
            if (result.editorjs_data && result.editorjs_data.blocks && result.editorjs_data.blocks[0]) {
                const firstBlockText = result.editorjs_data.blocks[0].data?.text || '';
                console.log('First block text sample:', firstBlockText.substring(0, 200));
                console.log('First block text with accents check:', /[áéíóúñü]/i.test(firstBlockText) ? 'HAS ACCENTS' : 'NO ACCENTS');
            }
            
            if (result.success) {
                return result.editorjs_data;
            } else {
                throw new Error(result.error || 'Failed to convert document');
            }
        } catch (error) {
            console.error('Error getting document content for EditorJS:', error);
            
            // Fallback: create simple EditorJS structure from any available text
            const textFallback = document.querySelector('.pdf-text-fallback');
            let content = '';
            
            if (textFallback) {
                content = textFallback.textContent || textFallback.innerText || '';
            }
            
            if (!content.trim()) {
                content = `Document: ${filename}\n\nContent could not be extracted for rich editing. Please view the PDF version for the complete document.`;
            }

            // Convert plain text to basic EditorJS blocks
            const paragraphs = content.split('\n\n').filter(p => p.trim());
            const blocks = paragraphs.map((paragraph, index) => {
                const text = paragraph.trim();
                if (!text) return null;
                
                // Simple heuristic for headers (lines that are short and followed by content)
                if (text.length < 100 && index < paragraphs.length - 1 && !text.endsWith('.')) {
                    return {
                        type: 'header',
                        data: {
                            text: text,
                            level: 2
                        }
                    };
                } else {
                    return {
                        type: 'paragraph',
                        data: {
                            text: text
                        }
                    };
                }
            }).filter(block => block !== null);

            return {
                time: Date.now(),
                blocks: blocks.length > 0 ? blocks : [{
                    type: 'paragraph',
                    data: {
                        text: content
                    }
                }],
                version: '2.28.0'
            };
        }
    }

    showSimpleTextFallback(filename) {
        const container = document.getElementById('fileViewerEditorJS');
        if (container) {
            const textFallback = document.querySelector('.pdf-text-fallback');
            let content = textFallback ? textFallback.textContent || textFallback.innerText || '' : '';
            
            if (!content.trim()) {
                content = `Document: ${filename}\n\nContent could not be displayed. Please view the PDF version.`;
            }

            container.innerHTML = `
                <div style="padding: 20px; background: var(--surface-2); border-radius: 8px; font-family: var(--font-family);">
                    <h3 style="margin-top: 0; color: var(--text-color);">Document Content</h3>
                    <pre style="white-space: pre-wrap; font-family: inherit; color: var(--text-color); line-height: 1.6;">${content}</pre>
                </div>
            `;
        }
    }

    destroyEditorJS() {
        if (this.editorJSInstance) {
            try {
                this.editorJSInstance.destroy();
                this.editorJSInstance = null;
                console.log('EditorJS instance destroyed');
            } catch (error) {
                console.warn('Error destroying EditorJS instance:', error);
                this.editorJSInstance = null;
            }
        }
    }

    applyHighlights(highlights) {
        /**
         * Apply visual highlights to the currently displayed document
         * @param {Array} highlights - Array of highlight objects with text, relevance, and context
         */
        console.log('Applying highlights to document:', highlights);
        
        if (!highlights || highlights.length === 0) {
            console.warn('No highlights to apply');
            return;
        }

        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) {
            console.error('Preview content not found');
            return;
        }

        // Check if we're viewing PDF or text version
        const container = previewContent.querySelector('.pdf-viewer-container');
        if (container) {
            const pdfContainer = container.querySelector('.pdf-content-container');
            const textFallback = container.querySelector('.pdf-text-fallback');
            
            // If PDF is visible, apply highlights to text overlay
            if (pdfContainer && pdfContainer.style.display !== 'none') {
                this.applyHighlightsToPDF(highlights);
            }
            
            // If text version is visible, apply highlights to text content
            if (textFallback && textFallback.style.display !== 'none') {
                this.applyHighlightsToText(highlights, textFallback);
            }
        } else {
            // Apply highlights to regular content
            this.applyHighlightsToText(highlights, previewContent);
        }

        // Show notification
        this.showHighlightNotification(highlights.length);
    }

    applyHighlightsToPDF(highlights) {
        /**
         * Apply highlights to PDF viewer (overlay method)
         */
        console.log('Applying PDF highlights (overlay method)');
        
        // Create or update highlight overlay
        const pdfFrame = document.querySelector('#filePreviewContent iframe');
        if (!pdfFrame) {
            console.warn('PDF iframe not found for highlighting');
            return;
        }

        // For now, we'll create a notification overlay
        // In a full implementation, you would integrate with PDF.js for proper highlighting
        const overlay = document.createElement('div');
        overlay.className = 'pdf-highlight-overlay';
        overlay.innerHTML = `
            <div class="highlight-notification">
                <span class="highlight-icon">🎨</span>
                <span class="highlight-text">${highlights.length} sections highlighted</span>
                <button class="highlight-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;
        
        const container = pdfFrame.parentElement;
        container.style.position = 'relative';
        container.appendChild(overlay);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (overlay.parentElement) {
                overlay.remove();
            }
        }, 5000);
    }

    applyHighlightsToText(highlights, container) {
        /**
         * Apply highlights to text content using mark elements
         */
        console.log('Applying text highlights');
        
        let content = container.innerHTML;
        
        // Sort highlights by relevance (highest first)
        const sortedHighlights = highlights.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
        
        // Apply highlights with different colors based on relevance
        sortedHighlights.forEach((highlight, index) => {
            const text = highlight.text;
            if (!text || text.length < 3) return; // Skip very short text
            
            const relevance = highlight.relevance || 5;
            const intensity = Math.min(relevance / 10, 1); // Normalize to 0-1
            
            // Create highlight with opacity based on relevance
            const highlightClass = `highlight-${Math.ceil(relevance / 2)}`; // Classes 1-5
            const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedText})`, 'gi');
            
            content = content.replace(regex, `<mark class="ai-highlight ${highlightClass}" data-relevance="${relevance}" title="${highlight.context || 'Highlighted text'}">$1</mark>`);
        });
        
        container.innerHTML = content;
    }

    showHighlightNotification(count) {
        /**
         * Show a brief notification about applied highlights
         */
        const notification = document.createElement('div');
        notification.className = 'highlight-success-notification';
        notification.innerHTML = `
            <span class="success-icon">✨</span>
            <span class="success-text">${count} highlights applied</span>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Notes Editor functionality
    openNotesEditor() {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;

        // Show notes editor content area
        previewContent.innerHTML = `
            <div class="notes-editor-content">
                <div id="notesEditorJS"></div>
            </div>
        `;

        // Update the existing header to show notes mode
        this.updateHeaderForNotesMode();

        // Initialize the notes editor
        this.initializeNotesEditor();
    }

    updateHeaderForNotesMode() {
        // Update the file name to show current note name
        const fileNameElement = document.querySelector('.file-name-text');
        if (fileNameElement) {
            fileNameElement.textContent = this.currentNoteName || 'Untitled Note';
        }

        // Find the PDF controls section and modify existing buttons
        const pdfControls = document.querySelector('.pdf-controls');
        if (pdfControls) {
            // Store original state for restoration later
            this.originalControlsHTML = pdfControls.innerHTML;
            
            // Replace controls with notes-specific controls including a back to PDF button
            pdfControls.innerHTML = `
                <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.returnToDocument()" title="Back to Document (PDF)">
                    <i class="fas fa-file-pdf"></i>
                </button>
                <div class="notes-controls-section">
                    <button class="btn-primary pdf-control-btn" onclick="FileViewerRedesigned.instance.saveCurrentNote()" title="Save Note">
                        <i class="fas fa-save"></i>
                    </button>
                    <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.openNotesList()" title="Open Note">
                        <i class="fas fa-folder-open"></i>
                    </button>
                    <div class="current-note-info-inline">
                        <div class="note-tags" id="noteTags"></div>
                    </div>
                </div>
            `;
        }

        // Update the file type info to show "Notes Editor"
        const fileTypeLabel = document.querySelector('.file-type-label');
        if (fileTypeLabel) {
            this.originalFileTypeLabel = fileTypeLabel.textContent;
            fileTypeLabel.textContent = 'Notes Editor';
        }

        const fileTypeIcon = document.querySelector('.file-type-info i');
        if (fileTypeIcon) {
            this.originalFileTypeIcon = fileTypeIcon.className;
            fileTypeIcon.className = 'fas fa-sticky-note';
        }
    }

    async initializeNotesEditor() {
        try {
            // Destroy existing editor instance if any
            this.destroyNotesEditor();
            
            // Initialize EditorJS for notes
            this.notesEditorInstance = new EditorJS({
                holder: 'notesEditorJS',
                placeholder: 'Start writing your note...',
                tools: {
                    header: {
                        class: Header,
                        config: {
                            placeholder: 'Enter a header',
                            levels: [1, 2, 3, 4, 5, 6],
                            defaultLevel: 2
                        }
                    },
                    paragraph: {
                        class: Paragraph,
                        inlineToolbar: true,
                    },
                    list: {
                        class: EditorjsList,
                        inlineToolbar: true,
                        config: {
                            defaultStyle: 'unordered'
                        }
                    },
                    quote: {
                        class: Quote,
                        inlineToolbar: true,
                        config: {
                            quotePlaceholder: 'Enter a quote',
                            captionPlaceholder: 'Quote\'s author',
                        },
                    },
                    marker: {
                        class: Marker,
                    },
                    code: {
                        class: CodeTool,
                        config: {
                            placeholder: 'Enter code'
                        }
                    },
                    delimiter: Delimiter,
                    table: {
                        class: Table,
                        inlineToolbar: true,
                        config: {
                            rows: 2,
                            cols: 3,
                        },
                    }
                },
                data: {
                    blocks: []
                }
            });

            await this.notesEditorInstance.isReady;
            console.log('Notes EditorJS initialized successfully');
            
            // EditorJS doesn't have onChange, so we'll track changes differently
            // We'll mark as changed when addToCurrentNote is called or when saving
            
            // Load the last opened note or create blank note
            this.loadDefaultNote();
            
        } catch (error) {
            console.error('Failed to initialize notes EditorJS:', error);
            this.showNotesError('Failed to initialize notes editor');
        }
    }

    loadDefaultNote() {
        // First check for temporary storage from this chat session
        const tempData = this.loadFromTempStorage();
        if (tempData && tempData.hasUnsavedChanges) {
            // Load temporary note content
            this.currentNoteId = tempData.noteId;
            this.currentNoteName = tempData.noteName;
            this.currentNoteTags = tempData.noteTags;
            this.hasUnsavedChanges = true;
            
            if (this.notesEditorInstance && tempData.content) {
                this.notesEditorInstance.render(tempData.content);
            }
            
            this.updateCurrentNoteDisplay();
            this.updateNotesEditorUI();
            
            // Show notification about restored content
            this.showNotesSuccess('Restored unsaved note content from this chat session');
            return;
        }
        
        // Try to load the last opened note from localStorage if no temp data
        const lastNoteId = localStorage.getItem('lastOpenedNoteId');
        if (lastNoteId) {
            this.loadNote(lastNoteId);
        } else {
            // Start with a blank note
            this.currentNoteId = null;
            this.currentNoteName = 'Untitled Note';
            this.hasUnsavedChanges = false;
            this.updateCurrentNoteDisplay();
            this.updateNotesEditorUI();
        }
    }

    async saveCurrentNote() {
        if (!this.notesEditorInstance) return;

        try {
            const noteData = await this.notesEditorInstance.save();
            
            // Show save dialog
            this.showNoteSaveDialog(noteData);
            
        } catch (error) {
            console.error('Error saving note:', error);
            this.showNotesError('Failed to save note');
        }
    }

    showNoteSaveDialog(noteData) {
        const dialogHTML = `
            <div class="note-save-modal" id="noteSaveModal">
                <div class="modal-overlay" onclick="FileViewerRedesigned.instance.closeNoteSaveDialog()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Save Note</h3>
                        <button class="modal-close" onclick="FileViewerRedesigned.instance.closeNoteSaveDialog()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Note Name:</label>
                            <input type="text" id="noteNameInput" value="${this.currentNoteName || 'Untitled Note'}" placeholder="Enter note name">
                        </div>
                        <div class="form-group">
                            <label>Tags (comma-separated):</label>
                            <input type="text" id="noteTagsInput" value="${this.currentNoteTags || ''}" placeholder="tag1, tag2, tag3">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="FileViewerRedesigned.instance.closeNoteSaveDialog()">Cancel</button>
                        <button class="btn-primary" onclick="FileViewerRedesigned.instance.saveNoteWithDetails()">Save</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
        
        // Store note data temporarily
        this.pendingNoteData = noteData;
        
        // Focus on name input
        setTimeout(() => {
            const nameInput = document.getElementById('noteNameInput');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        }, 100);
    }

    async saveNoteWithDetails() {
        const nameInput = document.getElementById('noteNameInput');
        const tagsInput = document.getElementById('noteTagsInput');
        
        if (!nameInput || !this.pendingNoteData) return;

        const noteName = nameInput.value.trim() || 'Untitled Note';
        const tagsList = tagsInput.value.trim().split(',').map(tag => tag.trim()).filter(tag => tag);
        
        try {
            // Create note object
            const noteObject = {
                id: this.currentNoteId || Date.now().toString(),
                name: noteName,
                tags: tagsList,
                content: this.pendingNoteData,
                createdAt: this.currentNoteId ? this.currentNoteCreatedAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Save to localStorage (could be extended to backend)
            this.saveNoteToStorage(noteObject);
            
            // Update current note info
            this.currentNoteId = noteObject.id;
            this.currentNoteName = noteObject.name;
            this.currentNoteTags = tagsList.join(', ');
            this.currentNoteCreatedAt = noteObject.createdAt;
            
            // Clear temporary storage since note is now saved
            this.hasUnsavedChanges = false;
            this.clearTempStorage();
            
            // Update display
            this.updateCurrentNoteDisplay();
            this.updateNotesEditorUI();
            
            // Close dialog
            this.closeNoteSaveDialog();
            
            // Show success message
            this.showNotesSuccess(`Note "${noteName}" saved successfully`);
            
            // Remember this as the last opened note
            localStorage.setItem('lastOpenedNoteId', noteObject.id);
            
        } catch (error) {
            console.error('Error saving note:', error);
            this.showNotesError('Failed to save note');
        }
    }

    saveNoteToStorage(noteObject) {
        // Get existing notes
        const existingNotes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
        
        // Update or add note
        const existingIndex = existingNotes.findIndex(note => note.id === noteObject.id);
        if (existingIndex >= 0) {
            existingNotes[existingIndex] = noteObject;
        } else {
            existingNotes.push(noteObject);
        }
        
        // Save back to localStorage
        localStorage.setItem('editorJSNotes', JSON.stringify(existingNotes));
    }

    openNotesList() {
        const notes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
        
        const dialogHTML = `
            <div class="notes-list-modal" id="notesListModal">
                <div class="modal-overlay" onclick="FileViewerRedesigned.instance.closeNotesListDialog()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Open Note</h3>
                        <button class="modal-close" onclick="FileViewerRedesigned.instance.closeNotesListDialog()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="notes-list">
                            ${notes.length === 0 ? '<p class="no-notes">No saved notes found.</p>' : 
                                notes.map(note => `
                                    <div class="note-item" data-note-id="${note.id}">
                                        <div class="note-info">
                                            <h4>${note.name}</h4>
                                            <p class="note-meta">
                                                Updated: ${new Date(note.updatedAt).toLocaleDateString()}
                                                ${note.tags.length > 0 ? `• Tags: ${note.tags.join(', ')}` : ''}
                                            </p>
                                        </div>
                                        <div class="note-actions">
                                            <button class="btn-primary btn-sm" onclick="FileViewerRedesigned.instance.loadNoteFromList('${note.id}')">
                                                <i class="fas fa-folder-open"></i>
                                            </button>
                                            <button class="btn-danger btn-sm" onclick="FileViewerRedesigned.instance.deleteNoteFromList('${note.id}')">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-primary" onclick="FileViewerRedesigned.instance.createNewNoteFromModal()" title="Create New Note">
                            <i class="fas fa-plus"></i> New Note
                        </button>
                        <button class="btn-secondary" onclick="FileViewerRedesigned.instance.closeNotesListDialog()">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
    }

    loadNoteFromList(noteId) {
        this.loadNote(noteId);
        this.closeNotesListDialog();
    }

    createNewNoteFromModal() {
        this.closeNotesListDialog();
        this.newBlankNote();
    }

    loadNote(noteId) {
        const notes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
        const note = notes.find(n => n.id === noteId);
        
        if (!note) {
            this.showNotesError('Note not found');
            return;
        }

        // Load note content into editor
        if (this.notesEditorInstance) {
            this.notesEditorInstance.render(note.content || { blocks: [] });
        }
        
        // Update current note info
        this.currentNoteId = note.id;
        this.currentNoteName = note.name;
        this.currentNoteTags = note.tags.join(', ');
        this.currentNoteCreatedAt = note.createdAt;
        
        // Clear unsaved changes since we're loading a saved note
        this.hasUnsavedChanges = false;
        this.clearTempStorage();
        
        // Update display
        this.updateCurrentNoteDisplay();
        this.updateNotesEditorUI();
        
        // Remember as last opened
        localStorage.setItem('lastOpenedNoteId', noteId);
    }

    deleteNoteFromList(noteId) {
        if (!confirm('Are you sure you want to delete this note?')) return;

        // Remove from storage
        const notes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
        const filteredNotes = notes.filter(note => note.id !== noteId);
        localStorage.setItem('editorJSNotes', JSON.stringify(filteredNotes));
        
        // Clear last opened if it was this note
        if (localStorage.getItem('lastOpenedNoteId') === noteId) {
            localStorage.removeItem('lastOpenedNoteId');
        }
        
        // Refresh the list
        this.closeNotesListDialog();
        this.openNotesList();
        
        this.showNotesSuccess('Note deleted successfully');
    }

    newBlankNote() {
        // Check if there are unsaved changes before creating new note
        if (this.hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Are you sure you want to create a new note? Unsaved changes will be lost.')) {
                return;
            }
        }
        
        if (this.notesEditorInstance) {
            this.notesEditorInstance.render({ blocks: [] });
        }
        
        // Reset current note info
        this.currentNoteId = null;
        this.currentNoteName = 'Untitled Note';
        this.currentNoteTags = '';
        this.currentNoteCreatedAt = null;
        
        // Clear temporary storage and unsaved changes
        this.hasUnsavedChanges = false;
        this.clearTempStorage();
        
        // Update display
        this.updateCurrentNoteDisplay();
        this.updateNotesEditorUI();
    }

    closeNotesEditor() {
        // Check for unsaved changes before closing
        if (this.hasUnsavedChanges) {
            if (!confirm('You have unsaved changes in your note. Are you sure you want to close the notes editor? Changes will be preserved for this chat session.')) {
                return;
            }
            // Save current state to temporary storage before closing
            if (this.notesEditorInstance) {
                this.notesEditorInstance.save().then(data => {
                    this.saveToTempStorage(data);
                }).catch(error => {
                    console.error('Error saving to temp storage:', error);
                });
            }
        }
        
        this.destroyNotesEditor();
        
        // Restore the original header state
        this.restoreHeaderFromNotesMode();
        
        // Return to document view if we have a current file
        if (this.currentFile) {
            // Explicitly show PDF version when returning from notes
            this.currentView = 'pdf';
            // Reload the file to ensure proper display
            this.loadFilePreview(this.currentFile.filename);
        } else {
            // Show the document list
            this.showDocumentListInPreview();
        }
    }

    returnToDocument() {
        // Same functionality as closeNotesEditor but with clearer naming for user navigation
        this.closeNotesEditor();
    }

    restoreHeaderFromNotesMode() {
        // Restore original PDF controls HTML
        const pdfControls = document.querySelector('.pdf-controls');
        if (pdfControls && this.originalControlsHTML) {
            pdfControls.innerHTML = this.originalControlsHTML;
        }

        // Restore file type info if we have a current file
        if (this.currentFile) {
            const fileTypeLabel = document.querySelector('.file-type-label');
            if (fileTypeLabel && this.originalFileTypeLabel) {
                fileTypeLabel.textContent = this.originalFileTypeLabel;
            }

            const fileTypeIcon = document.querySelector('.file-type-info i');
            if (fileTypeIcon && this.originalFileTypeIcon) {
                fileTypeIcon.className = this.originalFileTypeIcon;
            }

            const fileNameElement = document.querySelector('.file-name-text');
            if (fileNameElement) {
                fileNameElement.textContent = this.currentFile.filename;
            }
        }
    }

    updateCurrentNoteDisplay() {
        // Update the file name in the header
        const fileNameElement = document.querySelector('.file-name-text');
        if (fileNameElement) {
            fileNameElement.textContent = this.currentNoteName || 'Untitled Note';
        }
        
        // Update tags in the inline note info
        const tagsElement = document.getElementById('noteTags');
        if (tagsElement) {
            if (this.currentNoteTags) {
                const tags = this.currentNoteTags.split(',').map(tag => tag.trim());
                tagsElement.innerHTML = tags.map(tag => `<span class="note-tag">${tag}</span>`).join('');
            } else {
                tagsElement.innerHTML = '';
            }
        }
    }

    // Dialog close methods
    closeNoteSaveDialog() {
        const modal = document.getElementById('noteSaveModal');
        if (modal) {
            modal.remove();
        }
        this.pendingNoteData = null;
    }

    closeNotesListDialog() {
        const modal = document.getElementById('notesListModal');
        if (modal) {
            modal.remove();
        }
    }

    // Notification methods for notes
    showNotesSuccess(message) {
        this.showToast(message, 'success');
    }

    showNotesError(message) {
        this.showToast(message, 'error');
    }

    destroyNotesEditor() {
        if (this.notesEditorInstance) {
            if (typeof this.notesEditorInstance.destroy === 'function') {
                this.notesEditorInstance.destroy();
            }
            this.notesEditorInstance = null;
        }
    }

    // Method to add content from chat to current note
    async addToCurrentNote(content) {
        if (!this.notesEditorInstance) {
            this.showNotesError('No note editor is open');
            return;
        }

        try {
            // Get current editor data
            const currentData = await this.notesEditorInstance.save();
            
            // Add new content as a block
            const newBlock = {
                type: 'paragraph',
                data: {
                    text: content
                }
            };
            
            // Add to existing blocks
            currentData.blocks.push(newBlock);
            
            // Render updated content
            await this.notesEditorInstance.render(currentData);
            
            // Mark as having unsaved changes and save to temp storage
            this.hasUnsavedChanges = true;
            this.saveToTempStorage(currentData);
            this.updateNotesEditorUI();
            
            this.showNotesSuccess('Content added to note');
            
        } catch (error) {
            console.error('Error adding content to note:', error);
            this.showNotesError('Failed to add content to note');
        }
    }

    // Save current note content to temporary storage within chat session
    saveToTempStorage(noteData) {
        const chatId = window.currentChatId || 'default';
        this.tempNoteSessionKey = `tempNote_${chatId}`;
        
        const tempData = {
            noteId: this.currentNoteId,
            noteName: this.currentNoteName,
            noteTags: this.currentNoteTags,
            content: noteData,
            timestamp: new Date().toISOString(),
            hasUnsavedChanges: this.hasUnsavedChanges
        };
        
        // Store in sessionStorage (persists within tab/session but not across browser restarts)
        sessionStorage.setItem(this.tempNoteSessionKey, JSON.stringify(tempData));
        
        console.log('Saved note to temporary storage for chat:', chatId);
    }

    // Load note content from temporary storage
    loadFromTempStorage() {
        const chatId = window.currentChatId || 'default';
        this.tempNoteSessionKey = `tempNote_${chatId}`;
        
        const tempData = sessionStorage.getItem(this.tempNoteSessionKey);
        if (tempData) {
            try {
                const parsed = JSON.parse(tempData);
                return parsed;
            } catch (error) {
                console.error('Error parsing temp note data:', error);
            }
        }
        return null;
    }

    // Clear temporary storage for current chat
    clearTempStorage() {
        if (this.tempNoteSessionKey) {
            sessionStorage.removeItem(this.tempNoteSessionKey);
            this.hasUnsavedChanges = false;
            this.updateNotesEditorUI();
        }
    }

    // Update notes editor UI to show unsaved changes indicator
    updateNotesEditorUI() {
        const noteNameElement = document.getElementById('currentNoteName');
        if (noteNameElement) {
            const baseName = this.currentNoteName || 'Untitled Note';
            noteNameElement.textContent = this.hasUnsavedChanges ? `${baseName} *` : baseName;
            
            if (this.hasUnsavedChanges) {
                noteNameElement.style.fontStyle = 'italic';
                noteNameElement.title = 'Note has unsaved changes';
            } else {
                noteNameElement.style.fontStyle = 'normal';
                noteNameElement.title = '';
            }
        }

        // Update file name in header too
        const fileNameElement = document.querySelector('.file-name-text');
        if (fileNameElement && fileNameElement.textContent.includes('Notes Editor')) {
            const baseName = this.currentNoteName || 'Untitled Note';
            fileNameElement.textContent = this.hasUnsavedChanges ? `${baseName} *` : baseName;
        }
    }
}

// Initialize the redesigned file viewer
document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.fileViewer === 'undefined') {
        window.fileViewer = new FileViewerRedesigned();
    }
});

// Add CSS animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

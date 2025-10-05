import { createInitialState, applyState } from './state.js';
import { initModalTagPicker, getModalSelectedTagNames } from './tags.js';
import { initializeEventHandlers as bindEventHandlers } from './events.js';
import {
    initializeResizer as bindResizer,
    toggleFileViewer as layoutToggleFileViewer,
    showFileViewer as layoutShowFileViewer,
    hideFileViewer as layoutHideFileViewer,
    updateToggleButtonState as layoutUpdateToggleButtonState,
    checkAndShowFileViewer as layoutCheckAndShowFileViewer
} from './layout.js';
import * as preview from './preview.js';
import * as pdf from './pdf.js';
import * as notes from './notes.js';

/**
 * Redesigned File Viewer Component for Split-Screen Chat Layout
 * Features: Resizable panels, document modal, enhanced AI analysis
 */

export default class FileViewerRedesigned {
    constructor() {
        applyState(this, createInitialState());
        
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

        // Ensure toggle button is enabled on init
        this.updateToggleButtonState(this.isVisible);
    }

    // Modal Tag Picker: lightweight local tag selector embedded in save dialog
    initModalTagPicker(containerId, existingCsv) {
        return initModalTagPicker.call(this, containerId, existingCsv);
    }

    getModalSelectedTagNames() {
        return getModalSelectedTagNames.call(this);
    }

    onChatChanged() {
        console.log('FileViewer: Chat changed, resetting state');
        // Reset current file when chat changes
        this.currentFile = null;
        
        // Hide the fileviewer initially when chat changes
        // It will be shown again if documents are found
        this.hideFileViewer();
        
        // Refresh document list for new chat
        this.refreshDocumentList();
    }

    initializeEventHandlers() {
        return bindEventHandlers.call(this);
    }

    initializeResizer() {
        return bindResizer.call(this);
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
                // Transform v2 API format to v1 format for compatibility
                const documents = (result.documents || []).map(doc => ({
                    filename: doc.source || doc.filename,
                    full_path: doc.full_path || doc.source,
                    size: doc.size || null,
                    chunk_count: doc.chunk_count,
                    source_type: doc.source_type
                }));
                
                this.displayDocumentList(documents);
                
                // Auto-load logic: Only auto-show if fileviewer was already visible
                // or if there's exactly one document and no file is loaded yet
                if (documents.length === 1 && !this.currentFile && !this.isVisible) {
                    const doc = documents[0];
                    console.log('Auto-loading single document:', doc.filename);
                    await this.loadDocument(doc.filename, doc.full_path);
                    // Don't auto-show, let user decide when to open
                } else if (documents.length > 0 && !this.currentFile) {
                    // Show document list in preview placeholder
                    this.showDocumentListInPreview(documents);
                }
                
                // If fileviewer is visible and we have documents, keep it visible
                // If no documents, this will be handled by displayDocumentList showing empty state
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
                
                // Display chunk count if available (v2 API), otherwise file size
                const metaText = doc.chunk_count 
                    ? `${doc.chunk_count} chunks` 
                    : (doc.size ? this.formatFileSize(doc.size) : 'Unknown size');
                
                return `
                <div class="document-item ${statusClass}" data-filename="${doc.filename}" data-full-path="${doc.full_path || ''}">
                    <div class="document-item-icon">
                        <i class="fas ${this.getFileIcon(doc.filename)}"></i>
                    </div>
                    <div class="document-item-info">
                        <div class="document-item-name">${doc.filename}</div>
                        <div class="document-item-meta">
                            ${metaText}
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

}

Object.entries(preview).forEach(([key, fn]) => {
    if (typeof fn === 'function') {
        FileViewerRedesigned.prototype[key] = fn;
    }
});

Object.entries(pdf).forEach(([key, fn]) => {
    if (typeof fn === 'function') {
        FileViewerRedesigned.prototype[key] = fn;
    }
});

Object.entries(notes).forEach(([key, fn]) => {
    if (typeof fn === 'function') {
        FileViewerRedesigned.prototype[key] = fn;
    }
});

const layoutMethods = {
    toggleFileViewer: layoutToggleFileViewer,
    showFileViewer: layoutShowFileViewer,
    hideFileViewer: layoutHideFileViewer,
    updateToggleButtonState: layoutUpdateToggleButtonState,
    checkAndShowFileViewer: layoutCheckAndShowFileViewer,
};

Object.entries(layoutMethods).forEach(([key, fn]) => {
    if (typeof fn === 'function') {
        FileViewerRedesigned.prototype[key] = fn;
    }
});

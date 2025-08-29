/**
 * File Viewer Component for Split-Screen Chat Layout
 * Displays uploaded documents and provides file-specific AI analysis
 */

class FileViewer {
    constructor() {
        this.currentFile = null;
        this.selectedFiles = new Set();
        this.isVisible = false;
        this.init();
    }

    init() {
        this.createFileViewerUI();
        this.setupEventListeners();
    }

    createFileViewerUI() {
        // Create file viewer container (initially hidden)
        const fileViewerContainer = document.createElement('div');
        fileViewerContainer.id = 'fileViewerContainer';
        fileViewerContainer.className = 'file-viewer-container';
        fileViewerContainer.innerHTML = `
            <div class="file-viewer-header">
                <div class="file-viewer-title">
                    <i class="fas fa-file-alt"></i>
                    <span>Document Viewer</span>
                </div>
                <div class="file-viewer-actions">
                    <button id="fileViewerAnalyzeBtn" class="btn-icon" title="Analyze with AI" disabled>
                        <i class="fas fa-brain"></i>
                    </button>
                    <button id="fileViewerCloseBtn" class="btn-icon" title="Close viewer">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="file-viewer-content">
                <div class="file-list-panel">
                    <div class="file-list-header">
                        <h4>Documents</h4>
                        <button id="refreshFileList" class="btn-icon" title="Refresh file list">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                    <div class="file-list">
                        <div class="file-list-empty">
                            <i class="fas fa-file-upload"></i>
                            <p>No documents uploaded</p>
                            <button id="uploadFromViewer" class="btn-primary">
                                <i class="fas fa-plus"></i> Upload Documents
                            </button>
                        </div>
                    </div>
                </div>
                <div class="file-preview-panel">
                    <div class="file-preview-empty">
                        <i class="fas fa-mouse-pointer"></i>
                        <p>Select a document to preview</p>
                    </div>
                    <div class="file-preview-content" style="display: none;">
                        <div class="file-preview-header">
                            <div class="file-info">
                                <h3 id="currentFileName"></h3>
                                <span id="currentFileSize" class="file-size"></span>
                            </div>
                            <div class="file-actions">
                                <button id="extractKeyPoints" class="btn-secondary" title="Extract key points">
                                    <i class="fas fa-list-ul"></i> Key Points
                                </button>
                                <button id="summarizeFile" class="btn-secondary" title="Summarize document">
                                    <i class="fas fa-compress-alt"></i> Summary
                                </button>
                                <button id="findReferences" class="btn-secondary" title="Find references">
                                    <i class="fas fa-link"></i> References
                                </button>
                            </div>
                        </div>
                        <div class="file-preview-body">
                            <div id="filePreviewContent" class="file-content"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Insert into chat section (initially hidden)
        const chatSection = document.getElementById('chatSection');
        if (chatSection) {
            chatSection.appendChild(fileViewerContainer);
        }
    }

    setupEventListeners() {
        // Close file viewer
        document.getElementById('fileViewerCloseBtn')?.addEventListener('click', () => {
            this.hideFileViewer();
        });

        // Refresh file list
        document.getElementById('refreshFileList')?.addEventListener('click', () => {
            this.refreshFileList();
        });

        // Upload from viewer
        document.getElementById('uploadFromViewer')?.addEventListener('click', () => {
            if (window.ragManager) {
                window.ragManager.showUploadModal();
            }
        });

        // AI analysis buttons
        document.getElementById('extractKeyPoints')?.addEventListener('click', () => {
            this.extractKeyPoints();
        });

        document.getElementById('summarizeFile')?.addEventListener('click', () => {
            this.summarizeDocument();
        });

        document.getElementById('findReferences')?.addEventListener('click', () => {
            this.findReferences();
        });

        document.getElementById('fileViewerAnalyzeBtn')?.addEventListener('click', () => {
            this.openDocumentAnalyst();
        });

        // Close button handler
        document.getElementById('fileViewerClose')?.addEventListener('click', () => {
            this.hideFileViewer();
        });

        // Listen for RAG document updates
        document.addEventListener('rag:documents-updated', () => {
            this.refreshFileList();
        });

        // Listen for chat changes
        document.addEventListener('chat:changed', () => {
            this.refreshFileList();
        });
    }

    async refreshFileList() {
        const currentChatId = window.currentChatId;
        if (!currentChatId) {
            this.showEmptyState();
            return;
        }

        try {
            const response = await fetch(`/api/rag/documents/${currentChatId}`);
            if (response.ok) {
                const result = await response.json();
                const documents = result.documents || [];
                this.displayFileList(documents);
            } else {
                this.showEmptyState();
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            this.showEmptyState();
        }
    }

    displayFileList(documents) {
        const fileList = document.querySelector('.file-list');
        const emptyState = document.querySelector('.file-list-empty');

        if (documents.length === 0) {
            this.showEmptyState();
            return;
        }

        // Hide empty state
        if (emptyState) {
            emptyState.style.display = 'none';
        }

        // Create file list items
        const fileListHTML = documents.map(doc => `
            <div class="file-item" data-filename="${doc.filename}">
                <div class="file-icon">
                    <i class="fas ${this.getFileIcon(doc.filename)}"></i>
                </div>
                <div class="file-details">
                    <div class="file-name" title="${doc.filename}">${doc.filename}</div>
                    <div class="file-meta">
                        ${doc.size ? this.formatFileSize(doc.size) : ''}
                        ${doc.uploaded_at ? '• ' + this.formatDate(doc.uploaded_at) : ''}
                    </div>
                </div>
                <div class="file-actions">
                    <button class="view-file-btn" title="View document">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="analyze-file-btn" title="Analyze with AI">
                        <i class="fas fa-brain"></i>
                    </button>
                </div>
            </div>
        `).join('');

        fileList.innerHTML = fileListHTML;

        // Add click handlers for file items
        fileList.querySelectorAll('.file-item').forEach(item => {
            const filename = item.dataset.filename;
            const doc = documents.find(d => d.filename === filename);

            // View file button
            item.querySelector('.view-file-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewFile(doc);
            });

            // Analyze file button
            item.querySelector('.analyze-file-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.analyzeFile(doc);
            });

            // Click on file item to view
            item.addEventListener('click', () => {
                this.viewFile(doc);
            });
        });
    }

    showEmptyState() {
        const fileList = document.querySelector('.file-list');
        const emptyState = document.querySelector('.file-list-empty');

        if (fileList) {
            fileList.innerHTML = '';
        }
        if (emptyState) {
            emptyState.style.display = 'flex';
        }

        // Hide preview panel
        this.hidePreview();
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'pdf': 'fa-file-pdf',
            'doc': 'fa-file-word',
            'docx': 'fa-file-word',
            'txt': 'fa-file-alt',
            'csv': 'fa-file-csv',
            'xlsx': 'fa-file-excel',
            'xls': 'fa-file-excel',
            'ppt': 'fa-file-powerpoint',
            'pptx': 'fa-file-powerpoint'
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

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
    }

    async viewFile(fileDoc) {
        this.currentFile = fileDoc;
        
        // Update UI state
        this.updateFileSelection(fileDoc.filename);
        this.showPreview();
        
        // Update file info
        document.getElementById('currentFileName').textContent = fileDoc.filename;
        document.getElementById('currentFileSize').textContent = 
            fileDoc.size ? this.formatFileSize(fileDoc.size) : '';

        // Enable analyze button
        const analyzeBtn = document.getElementById('fileViewerAnalyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
        }

        // Load file content preview
        await this.loadFilePreview(fileDoc);
    }

    updateFileSelection(filename) {
        // Remove previous selection
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Add selection to current file
        const currentItem = document.querySelector(`[data-filename="${filename}"]`);
        if (currentItem) {
            currentItem.classList.add('selected');
        }
    }

    showPreview() {
        const emptyState = document.querySelector('.file-preview-empty');
        const content = document.querySelector('.file-preview-content');

        if (emptyState) emptyState.style.display = 'none';
        if (content) content.style.display = 'block';
    }

    hidePreview() {
        const emptyState = document.querySelector('.file-preview-empty');
        const content = document.querySelector('.file-preview-content');

        if (emptyState) emptyState.style.display = 'flex';
        if (content) content.style.display = 'none';

        // Disable analyze button
        const analyzeBtn = document.getElementById('fileViewerAnalyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
        }

        this.currentFile = null;
    }

    async loadFilePreview(fileDoc) {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;

        previewContent.innerHTML = '<div class="loading">Loading preview...</div>';

        try {
            // Try to get document content from RAG system
            const response = await fetch(`/api/rag/document-content/${window.currentChatId}/${encodeURIComponent(fileDoc.filename)}`);
            
            if (response.ok) {
                const result = await response.json();
                const content = result.content || 'Content not available';
                
                // Display content with syntax highlighting for code files
                this.displayContent(content, fileDoc.filename);
            } else {
                previewContent.innerHTML = `
                    <div class="preview-unavailable">
                        <i class="fas fa-file"></i>
                        <p>Preview not available for this file type</p>
                        <p class="file-info">File: ${fileDoc.filename}</p>
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
    }

    displayContent(content, filename) {
        const previewContent = document.getElementById('filePreviewContent');
        if (!previewContent) return;

        const ext = filename.split('.').pop().toLowerCase();
        
        if (ext === 'txt' || ext === 'md') {
            // For text files, display as preformatted text
            previewContent.innerHTML = `<pre class="text-content">${this.escapeHtml(content)}</pre>`;
        } else if (ext === 'csv') {
            // For CSV files, try to display as a table
            this.displayCSVContent(content, previewContent);
        } else {
            // For other files, display as plain text with word wrapping
            previewContent.innerHTML = `<div class="document-content">${this.escapeHtml(content)}</div>`;
        }

        // Add scroll behavior
        previewContent.scrollTop = 0;
    }

    displayCSVContent(content, container) {
        try {
            const lines = content.split('\n').filter(line => line.trim());
            if (lines.length === 0) {
                container.innerHTML = '<p>Empty CSV file</p>';
                return;
            }

            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            const rows = lines.slice(1, Math.min(51, lines.length)); // Show max 50 rows

            let tableHTML = '<div class="csv-table-container"><table class="csv-table">';
            
            // Headers
            tableHTML += '<thead><tr>';
            headers.forEach(header => {
                tableHTML += `<th>${this.escapeHtml(header)}</th>`;
            });
            tableHTML += '</tr></thead>';

            // Rows
            tableHTML += '<tbody>';
            rows.forEach(row => {
                const cells = row.split(',').map(c => c.trim().replace(/"/g, ''));
                tableHTML += '<tr>';
                cells.forEach((cell, index) => {
                    if (index < headers.length) {
                        tableHTML += `<td>${this.escapeHtml(cell)}</td>`;
                    }
                });
                tableHTML += '</tr>';
            });
            tableHTML += '</tbody></table>';

            if (lines.length > 51) {
                tableHTML += `<p class="csv-note">Showing first 50 rows of ${lines.length - 1} total rows</p>`;
            }

            tableHTML += '</div>';
            container.innerHTML = tableHTML;
        } catch (error) {
            container.innerHTML = `<pre class="text-content">${this.escapeHtml(content)}</pre>`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // AI Analysis Methods
    async extractKeyPoints() {
        if (!this.currentFile) return;
        
        await this.performAnalysis('key_points');
    }

    async summarizeDocument() {
        if (!this.currentFile) return;
        
        await this.performAnalysis('summary');
    }

    async findReferences() {
        if (!this.currentFile) return;
        
        await this.performAnalysis('references');
    }

    async analyzeFile(fileDoc) {
        this.currentFile = fileDoc;
        await this.openDocumentAnalyst();
    }

    async openDocumentAnalyst() {
        if (!this.currentFile) return;

        await this.performAnalysis('insights');
    }

    async performAnalysis(analysisType) {
        if (!this.currentFile) return;

        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;

        // Show loading state
        const loadingToast = this.showLoadingToast(`Analyzing document with AI...`);

        try {
            // Get selected model from the chat system
            const selectedModel = window.getSelectedModel ? window.getSelectedModel() : null;
            
            // Call the analysis API
            const response = await fetch('/api/rag/analyze-document', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: window.currentChatId,
                    filename: this.currentFile.filename,
                    analysis_type: analysisType,
                    model: selectedModel
                })
            });

            // Remove loading toast
            if (loadingToast && loadingToast.parentNode) {
                loadingToast.parentNode.removeChild(loadingToast);
            }

            if (response.ok) {
                const result = await response.json();
                
                // Format the analysis result as a user message
                const analysisTypes = {
                    'summary': 'Provide a summary',
                    'key_points': 'Extract key points',
                    'references': 'Find references and citations',
                    'insights': 'Analyze and provide insights'
                };

                const userPrompt = `${analysisTypes[analysisType] || 'Analyze'} from the document "${this.currentFile.filename}"`;
                
                // Insert into chat as if user asked the question
                chatInput.value = userPrompt;
                
                // Trigger the chat to show user message and then AI response
                await this.simulateUserMessage(userPrompt, result.analysis);
                
            } else {
                this.showToast('Failed to analyze document. Please try again.', 'error');
            }

        } catch (error) {
            console.error('Error analyzing document:', error);
            
            // Remove loading toast on error
            if (loadingToast && loadingToast.parentNode) {
                loadingToast.parentNode.removeChild(loadingToast);
            }
            
            // Fallback to manual prompt
            const analysisPrompts = {
                'summary': `Please provide a comprehensive summary of the document "${this.currentFile.filename}". Include the main topics, key findings, and important insights.`,
                'key_points': `Extract and list the key points from the document "${this.currentFile.filename}". Focus on the most important information and takeaways.`,
                'references': `Identify and extract all references, citations, links, and important entities mentioned in the document "${this.currentFile.filename}".`,
                'insights': `Analyze the document "${this.currentFile.filename}" and provide insights including key themes, connections to other knowledge areas, and suggestions for expanding our notes.`
            };

            chatInput.value = analysisPrompts[analysisType] || analysisPrompts['summary'];
            chatInput.focus();
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            this.showToast('Using manual analysis prompt due to error', 'warning');
        }
    }

    async simulateUserMessage(userMessage, aiResponse) {
        // Use the existing chat system to show both user message and AI response
        if (window.appendMessage) {
            // Add user message
            await window.appendMessage(userMessage, 'user');
            
            // Add AI response
            await window.appendMessage(aiResponse, 'bot');
            
            // Clear the input
            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.value = '';
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    showLoadingToast(message) {
        const toast = document.createElement('div');
        toast.className = 'file-viewer-toast loading';
        toast.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);
        return toast;
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `file-viewer-toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);

        // Allow manual removal
        toast.onclick = () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        };
        
        return toast;
    }

    insertAnalysisPrompt(prompt) {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = prompt;
            chatInput.focus();
            
            // Trigger input event to update UI
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Auto-scroll chat input into view
            chatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // Public API methods
    showFileViewer() {
        if (this.isVisible) return;

        const panel = document.getElementById('fileViewerPanel');
        
        if (panel) {
            // Show file viewer panel
            panel.classList.remove('is-hidden');
            this.isVisible = true;
            
            // Refresh file list
            this.refreshFileList();
            
            // Update toggle button state
            this.updateToggleButtonState(true);
        }
    }

    hideFileViewer() {
        if (!this.isVisible) return;

        const panel = document.getElementById('fileViewerPanel');
        
        if (panel) {
            // Hide file viewer panel
            panel.classList.add('is-hidden');
            this.isVisible = false;
            
            // Clear selection
            this.hidePreview();
            
            // Update toggle button state
            this.updateToggleButtonState(false);
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

    adjustSplitScreenLayout() {
        // Trigger any necessary layout adjustments
        if (window.adjustChatLayoutPadding) {
            setTimeout(() => {
                window.adjustChatLayoutPadding();
            }, 100);
        }
    }

    isFileViewerVisible() {
        return this.isVisible;
    }
}

// Initialize file viewer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const initFileViewer = () => {
        if (document.getElementById('chatSection')) {
            window.fileViewer = new FileViewer();
            console.log('File Viewer initialized');
        } else {
            setTimeout(initFileViewer, 100);
        }
    };
    initFileViewer();
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.FileViewer = FileViewer;
}

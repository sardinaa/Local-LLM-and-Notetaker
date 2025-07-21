/**
 * RAG (Retrieval-Augmented Generation) Manager
 * Handles document upload and RAG-enhanced chat functionality
 */

class RAGManager {
    constructor() {
        this.uploadedDocuments = new Set();
        this.hasDocuments = false;
        this.init();
    }

    init() {
        this.setupDocumentUpload();
        this.setupDocumentList();
        this.checkRAGModeForCurrentChat();
    }

    setupDocumentUpload() {
        this.addUploadButtonToChatInput();

        // Create file input (hidden) - Enable multiple file selection
        if (!document.getElementById('docFileInput')) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'docFileInput';
            fileInput.accept = '.txt,.pdf,.doc,.docx,.ppt,.pptx,.csv';
            fileInput.multiple = true; // Enable multiple file selection
            fileInput.style.display = 'none';
            fileInput.onchange = (e) => this.handleFileUpload(e);
            
            document.body.appendChild(fileInput);
        }
    }

    addUploadButtonToChatInput() {
        // Find the left buttons container
        const leftButtonsContainer = document.querySelector('.input-buttons-left');
        
        if (!leftButtonsContainer || document.getElementById('uploadDocBtn')) {
            return; // Already added or container not found
        }

        // Create upload button for chat input area
        const uploadBtn = document.createElement('button');
        uploadBtn.id = 'uploadDocBtn';
        uploadBtn.className = 'input-btn';
        uploadBtn.innerHTML = '<i class="fas fa-paperclip"></i>';
        uploadBtn.title = 'Upload Document(s) - Multiple files supported';
        uploadBtn.onclick = () => this.showUploadModal();
        
        // Add to the left side buttons
        leftButtonsContainer.appendChild(uploadBtn);

        // Create file input (hidden) - Enable multiple file selection
        if (!document.getElementById('docFileInput')) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'docFileInput';
            fileInput.accept = '.txt,.pdf,.doc,.docx,.ppt,.pptx,.csv';
            fileInput.multiple = true; // Enable multiple file selection
            fileInput.style.display = 'none';
            fileInput.onchange = (e) => this.handleFileUpload(e);
            
            document.body.appendChild(fileInput);
        }
    }

    setupDocumentList() {
        // Create document list container
        if (!document.getElementById('documentList')) {
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer) {
                const docListContainer = document.createElement('div');
                docListContainer.id = 'documentList';
                docListContainer.className = 'document-list-container';
                docListContainer.style.display = 'none';
                docListContainer.innerHTML = `
                    <div class="document-list-header">
                        <h4><i class="fas fa-file-alt"></i> <span class="doc-count">Documents (0)</span></h4>
                        <button class="clear-docs-btn" onclick="ragManager.clearAllDocuments()">
                            <i class="fas fa-trash"></i> Clear All
                        </button>
                    </div>
                    <div class="document-list-content">
                        <p class="no-documents">No documents uploaded yet</p>
                    </div>
                `;
                
                // Insert before chat messages
                const chatMessages = document.getElementById('chatMessages');
                chatContainer.insertBefore(docListContainer, chatMessages);
            }
        }
    }

    async checkRAGModeForCurrentChat() {
        const currentChatId = this.getCurrentChatId();
        if (!currentChatId) return;

        // Check if current chat has documents
        try {
            const response = await fetch(`/api/rag/documents/${currentChatId}`);
            if (response.ok) {
                const result = await response.json();
                const documents = result.documents || [];
                
                this.hasDocuments = documents.length > 0;
                this.updateUIForRAGMode();
                this.updateDocumentList(documents);
                this.updateChatTreeIndicator(currentChatId, this.hasDocuments);
            }
        } catch (error) {
            console.error('Error checking RAG mode:', error);
        }
    }

    updateUIForRAGMode() {
        const docList = document.getElementById('documentList');
        const chatContainer = document.getElementById('chatContainer');

        if (this.hasDocuments) {
            // Show document list and add visual indicators
            if (docList) docList.style.display = 'block';
            if (chatContainer) chatContainer.classList.add('rag-mode');
        } else {
            // Hide document list and remove indicators
            if (docList) docList.style.display = 'none';
            if (chatContainer) chatContainer.classList.remove('rag-mode');
        }
    }

    showUploadModal() {
        const fileInput = document.getElementById('docFileInput');
        fileInput.click();
    }

    async handleFileUpload(event) {
        const files = Array.from(event.target.files);
        if (!files || files.length === 0) return;

        let currentChatId = this.getCurrentChatId();
        
        // If no chat is selected, create a default chat for RAG
        if (!currentChatId) {
            console.log('No chat selected, creating RAG chat...');
            
            try {
                // Create a new chat for RAG documents
                const chatId = 'rag-chat-' + Date.now();
                const firstFileName = files[0].name.split('.')[0];
                const chatName = files.length > 1 
                    ? `RAG Chat - ${files.length} Documents`
                    : `RAG Chat - ${firstFileName}`;
                
                // Create the chat using the same method as the main chat system
                if (window.createDefaultChat) {
                    const success = await window.createDefaultChat(chatId, chatName);
                    if (success) {
                        window.currentChatId = chatId;
                        currentChatId = chatId;
                        
                        // Refresh the tree to show the new chat
                        if (window.chatTreeView && typeof window.chatTreeView.renderTree === 'function') {
                            window.chatTreeView.renderTree();
                        }
                        
                        // Load the new chat
                        if (window.loadChatMessages) {
                            await window.loadChatMessages(chatId);
                        }
                    } else {
                        this.showToast('Failed to create chat for RAG. Please create a chat first.', 'error');
                        return;
                    }
                } else {
                    this.showToast('Please select or create a chat first', 'error');
                    return;
                }
            } catch (error) {
                console.error('Error creating RAG chat:', error);
                this.showToast('Please select or create a chat first', 'error');
                return;
            }
        }

        // Check file sizes (10MB limit per file)
        const oversizedFiles = files.filter(file => file.size > 10 * 1024 * 1024);
        if (oversizedFiles.length > 0) {
            this.showToast(`${oversizedFiles.length} file(s) too large. Maximum size is 10MB per file.`, 'error');
            return;
        }

        // Show upload progress with file count
        const fileCountText = files.length > 1 ? `${files.length} documents` : '1 document';
        const progressToast = this.showProgressToast(`Uploading ${fileCountText}...`, files.length);

        try {
            const formData = new FormData();
            
            // Append all files
            files.forEach(file => {
                formData.append('file', file);
            });
            
            formData.append('chat_id', currentChatId);

            const response = await fetch('/api/rag/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            // Remove progress toast
            if (progressToast && progressToast.parentNode) {
                progressToast.parentNode.removeChild(progressToast);
            }

            if (response.ok && result.status === 'success') {
                const successMsg = files.length > 1 
                    ? `${result.successful_uploads} of ${files.length} documents uploaded successfully!`
                    : `Document "${result.results[0]?.filename}" uploaded successfully!`;
                
                this.showToast(successMsg, 'success');
                
                // Update state for successful uploads
                result.results.forEach(fileResult => {
                    if (fileResult.status === 'success') {
                        this.uploadedDocuments.add(fileResult.filename);
                    }
                });
                
                this.hasDocuments = this.uploadedDocuments.size > 0;
                this.updateUIForRAGMode();
                this.loadDocumentsForCurrentChat();
                this.updateChatTreeIndicator(currentChatId, true);
                
                // Show detailed results if there were any failures
                if (result.failed_uploads > 0) {
                    const failedFiles = result.results
                        .filter(r => r.status === 'error')
                        .map(r => r.filename)
                        .join(', ');
                    this.showToast(`Failed to upload: ${failedFiles}`, 'error');
                }
            } else {
                const errorMsg = result.message || 'Failed to upload documents';
                this.showToast(errorMsg, 'error');
            }
        } catch (error) {
            console.error('Upload error:', error);
            
            // Remove progress toast on error
            if (progressToast && progressToast.parentNode) {
                progressToast.parentNode.removeChild(progressToast);
            }
            
            this.showToast('Error uploading documents', 'error');
        }

        // Clear file input
        event.target.value = '';
    }

    async loadDocumentsForCurrentChat() {
        const currentChatId = this.getCurrentChatId();
        if (!currentChatId) return;

        try {
            const response = await fetch(`/api/rag/documents/${currentChatId}`);
            const result = await response.json();

            if (response.ok) {
                this.updateDocumentList(result.documents || []);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    }

    updateDocumentList(documents) {
        const listContent = document.querySelector('.document-list-content');
        const docCountElement = document.querySelector('.doc-count');
        
        if (!listContent) return;

        // Update document count in header
        if (docCountElement) {
            docCountElement.textContent = `Documents (${documents.length})`;
        }

        if (documents.length === 0) {
            listContent.innerHTML = '<p class="no-documents">No documents uploaded yet</p>';
            return;
        }

        const documentsHTML = documents.map(doc => `
            <div class="document-item">
                <i class="fas fa-file-alt"></i>
                <span class="doc-name">${doc.filename}</span>
                <button class="remove-doc-btn" onclick="ragManager.removeDocument('${doc.filename}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');

        listContent.innerHTML = documentsHTML;
    }

    async removeDocument(filename) {
        const currentChatId = this.getCurrentChatId();
        if (!currentChatId) return;

        try {
            const response = await fetch(`/api/rag/documents/${currentChatId}/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok) {
                this.showToast(`Document "${filename}" removed`, 'success');
                this.uploadedDocuments.delete(filename);
                this.loadDocumentsForCurrentChat();
                // Check if we still have documents after removal
                this.checkRAGModeForCurrentChat();
            } else {
                this.showToast(result.message || 'Failed to remove document', 'error');
            }
        } catch (error) {
            console.error('Error removing document:', error);
            this.showToast('Error removing document', 'error');
        }
    }

    async clearAllDocuments() {
        const currentChatId = this.getCurrentChatId();
        if (!currentChatId) return;

        if (!confirm('Are you sure you want to remove all documents from this chat?')) {
            return;
        }

        try {
            const response = await fetch(`/api/rag/documents/${currentChatId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok) {
                this.showToast('All documents cleared', 'success');
                this.uploadedDocuments.clear();
                this.hasDocuments = false;
                this.updateUIForRAGMode();
                this.loadDocumentsForCurrentChat();
                this.updateChatTreeIndicator(currentChatId, false);
            } else {
                this.showToast(result.message || 'Failed to clear documents', 'error');
            }
        } catch (error) {
            console.error('Error clearing documents:', error);
            this.showToast('Error clearing documents', 'error');
        }
    }

    // Method to send RAG-enhanced message
    async sendRAGMessage(message, abortSignal = null) {
        const currentChatId = this.getCurrentChatId();
        if (!currentChatId) {
            throw new Error('No chat selected');
        }

        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: currentChatId,
                message: message,
                stream: true,
                k: 3
            })
        };

        // Add abort signal if provided
        if (abortSignal) {
            requestOptions.signal = abortSignal;
        }

        const response = await fetch('/api/rag/chat', requestOptions);

        if (!response.ok) {
            throw new Error('RAG request failed');
        }

        return response;
    }

    getCurrentChatId() {
        // Get current chat ID from the global chat system
        return window.currentChatId || null;
    }

    showToast(message, type = 'info') {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `rag-toast rag-toast-${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
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

    showProgressToast(message, fileCount = 1) {
        // Create enhanced progress toast notification
        const toast = document.createElement('div');
        toast.className = 'rag-toast upload-progress';
        
        const progressBar = fileCount > 1 ? `
            <div class="upload-progress-bar">
                <div class="upload-progress-fill" style="width: 0%"></div>
            </div>
            <div class="upload-progress-text">Uploading ${fileCount} files...</div>
        ` : '';
        
        toast.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span>${message}</span>
            ${progressBar}
        `;

        document.body.appendChild(toast);

        // For multiple files, simulate progress updates
        if (fileCount > 1) {
            let progress = 0;
            const progressFill = toast.querySelector('.upload-progress-fill');
            const progressText = toast.querySelector('.upload-progress-text');
            
            const updateProgress = () => {
                if (progress < 90 && toast.parentNode) {
                    progress += Math.random() * 20;
                    if (progress > 90) progress = 90;
                    
                    if (progressFill) {
                        progressFill.style.width = `${progress}%`;
                    }
                    
                    const completedFiles = Math.floor((progress / 100) * fileCount);
                    if (progressText) {
                        progressText.textContent = `Processing ${completedFiles + 1} of ${fileCount} files...`;
                    }
                    
                    setTimeout(updateProgress, 500 + Math.random() * 1000);
                }
            };
            
            setTimeout(updateProgress, 500);
        }

        return toast;
    }

    updateChatTreeIndicator(chatId, hasDocuments) {
        // Find the chat tree item and update its icon
        const treeItem = document.querySelector(`[data-id="${chatId}"]`);
        if (treeItem) {
            const icon = treeItem.querySelector('i');
            
            if (icon) {
                if (hasDocuments) {
                    // Replace with RAG icon
                    icon.className = 'fas fa-file-alt';
                    icon.style.color = '#f5576c';
                    icon.title = 'This chat has uploaded documents (RAG enabled)';
                } else {
                    // Restore original chat icon
                    icon.className = 'fas fa-comments';
                    icon.style.color = '';
                    icon.title = '';
                }
            }
        }
    }

    // Method to check if current chat has documents (automatic detection)
    hasDocumentsInCurrentChat() {
        return this.hasDocuments;
    }

    // Method to update document list when chat changes
    onChatChange() {
        this.checkRAGModeForCurrentChat();
    }

    // Method to check all chats for RAG status on page load
    async checkAllChatsForRAG() {
        try {
            // Get all chat nodes from the tree
            const chatItems = document.querySelectorAll('[data-id]');
            
            for (const item of chatItems) {
                const chatId = item.getAttribute('data-id');
                if (chatId) {
                    try {
                        const response = await fetch(`/api/rag/documents/${chatId}`);
                        if (response.ok) {
                            const result = await response.json();
                            const documents = result.documents || [];
                            const hasDocuments = documents.length > 0;
                            
                            // Update the tree indicator for this chat
                            this.updateChatTreeIndicator(chatId, hasDocuments);
                        }
                    } catch (error) {
                        // Silently continue if this chat doesn't exist or has no documents
                        console.debug(`No RAG documents found for chat ${chatId}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error checking all chats for RAG:', error);
        }
    }
}

// Initialize RAG manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for chat system to be ready
    const initRAG = () => {
        if (document.getElementById('chatInput')) {
            window.ragManager = new RAGManager();
            console.log('RAG Manager initialized with automatic detection');
            
            // Wait a bit for the tree to load, then check all chats
            setTimeout(() => {
                if (window.ragManager && typeof window.ragManager.checkAllChatsForRAG === 'function') {
                    window.ragManager.checkAllChatsForRAG();
                }
            }, 1000);
        } else {
            setTimeout(initRAG, 100);
        }
    };
    initRAG();
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.RAGManager = RAGManager;
}

// PDF rendering helpers
export async function loadPdfPreview(filename, fallbackData) {
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
    if (typeof window !== 'undefined' && window.FileViewerRedesigned) {
        window.FileViewerRedesigned.instance = this;
    }
    
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


export function showPdfTextFallback(filename, data) {
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

export function cleanup() {
    if (this.currentPdfUrl) {
        URL.revokeObjectURL(this.currentPdfUrl);
        this.currentPdfUrl = null;
    }
}


export function showEditorJSVersion(filename) {
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


export function showPdfVersion() {
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


export async function initializeEditorJS(filename) {
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


export async function getDocumentContentForEditorJS(filename) {
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


export function showSimpleTextFallback(filename) {
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


export function destroyEditorJS() {
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


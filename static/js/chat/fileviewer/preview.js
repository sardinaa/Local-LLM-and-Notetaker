// Preview rendering helpers
export async function loadFilePreview(filename) {
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


export async function showTextVersion(filename) {
    try {
        const chatId = window.currentChatId || 'default';
        const res = await fetch(`/api/rag/document-content/${chatId}/${encodeURIComponent(filename)}`);
        if (!res.ok) {
            const previewContent = document.getElementById('filePreviewContent');
            if (previewContent) {
                previewContent.innerHTML = `
                    <div class="preview-unavailable">
                        <i class="fas fa-file"></i>
                        <p>Preview not available</p>
                        <p class="file-info">File: ${filename}</p>
                    </div>
                `;
            }
            return;
        }
        const data = await res.json();
        const ext = this.getFileExtension(filename);
        if (ext === 'pdf') {
            this.showPdfTextFallback(filename, data);
        } else {
            this.displayContent(data.content || '', filename);
        }
    } catch (e) {
        console.error('Error showing text version:', e);
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


export function displayContent(content, filename) {
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


export function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}


export function detectFileType(filename) {
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


export function getFileTypeLabel(fileType) {
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


export function formatContentByType(content, fileType, filename) {
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


export function formatPdfContent(content) {
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


export function formatPdfPageContent(content) {
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


export function formatWordContent(content) {
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


export function formatSpreadsheetContent(content, fileType) {
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


export function formatCsvContent(content) {
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


export function formatPresentationContent(content) {
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


export function formatMarkdownContent(content) {
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


export function formatJsonContent(content) {
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


export function formatXmlContent(content) {
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


export function formatYamlContent(content) {
    return `<pre class="yaml-content"><code class="language-yaml">${this.escapeHtml(content)}</code></pre>`;
}


export function formatHtmlContent(content) {
    return `<pre class="html-content"><code class="language-html">${this.escapeHtml(content)}</code></pre>`;
}


export function formatStylesheetContent(content, fileType) {
    const language = fileType === 'scss' ? 'scss' : fileType === 'sass' ? 'sass' : fileType === 'less' ? 'less' : 'css';
    return `<pre class="stylesheet-content"><code class="language-${language}">${this.escapeHtml(content)}</code></pre>`;
}


export function formatCodeContent(content, fileType) {
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


export function formatConfigContent(content) {
    return `<pre class="config-content"><code class="language-ini">${this.escapeHtml(content)}</code></pre>`;
}


export function formatImageContent(content, filename) {
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


export function formatTextContent(content) {
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


export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


export function applyContentEnhancements(contentElement, fileType, filename) {
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



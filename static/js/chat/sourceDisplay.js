/**
 * Source Display Manager
 * Handles parsing and displaying web search sources in chat messages
 */

export default class SourceDisplayManager {
    constructor() {
        this.currentSources = [];
        // Basic URL regex for detecting links in free-form lines
        this.urlPattern = /(https?:\/\/[^\s)]+)\)?/i;
        this._initialized = false;
        this.initializeSidebar();
        this.initializeReferenceClickHandlers();
    }

    /**
     * Initialize click handlers for document references
     */
    initializeReferenceClickHandlers() {
        // Use event delegation to handle dynamically added references
        document.addEventListener('click', (e) => {
            const refElement = e.target.closest('.doc-reference');
            if (refElement) {
                e.preventDefault();
                this.handleReferenceClick(refElement);
            }
        });
    }

    /**
     * Handle click on a document reference
     * @param {Element} refElement - The reference element clicked
     */
    handleReferenceClick(refElement) {
        const page = parseInt(refElement.dataset.page) || 1;
        const text = refElement.dataset.text || '';
        const refId = refElement.dataset.refId || '0';
        
        console.log(`Reference clicked: page=${page}, text=${text.substring(0, 50)}...`);
        
        // Get the message element to retrieve all sources
        const messageElement = refElement.closest('.chat-message');
        if (!messageElement) return;
        
        let sources = [];
        try {
            if (messageElement.dataset.sources) {
                sources = JSON.parse(messageElement.dataset.sources);
            }
        } catch (e) {
            console.warn('Failed to parse sources from message:', e);
        }
        
        const refIdNum = parseInt(refId);
        const source = sources[refIdNum];
        
        if (!source || !source.text) {
            console.warn('No source data found for reference:', refId);
            return;
        }
        
        console.log('Full source object:', source);
        
        // Highlight and navigate to the reference in the PDF viewer
        this.highlightAndNavigateToPDF(source);
    }

    /**
     * Highlight text in PDF viewer and navigate to its location
     * @param {Object} source - Source object with page, text, and other metadata
     */
    async highlightAndNavigateToPDF(source) {
        console.log('Highlighting source:', source);
        
        const viewer = window.FileViewerRedesigned?.instance;
        
        // Extract filename from source
        let filename = source.source || source.file || source.document;
        if (source.file_path) {
            // Extract filename from full path
            const parts = source.file_path.split('/');
            filename = parts[parts.length - 1];
        }
        
        console.log('Target filename:', filename);
        
        // Check if file viewer exists and if correct document is loaded
        const currentDoc = viewer?.currentDocument;
        const isCorrectDocumentLoaded = currentDoc && currentDoc.filename === filename;
        
        console.log('Current document:', currentDoc?.filename);
        console.log('Is correct document loaded?', isCorrectDocumentLoaded);
        
        // Ensure viewer is available
        if (!viewer) {
            console.warn('File viewer not available');
            this.showDocumentNotLoadedMessage(source);
            return;
        }
        
        // Show file viewer if it's not visible (always ensure it's visible)
        if (!viewer.isVisible) {
            console.log('Showing file viewer...');
            viewer.showFileViewer();
            // Wait for the file viewer to animate in
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // If wrong document is loaded, load the correct one
        if (!isCorrectDocumentLoaded) {
            if (!viewer) {
                console.warn('File viewer not available');
                this.showDocumentNotLoadedMessage(source);
                return;
            }
            
            console.log('Opening document:', filename);
            try {
                // Open the document and wait for it to load
                await viewer.loadDocument(filename, source.file_path || null);
                
                // Wait a bit for the PDF to fully load
                await new Promise(resolve => setTimeout(resolve, 800));
            } catch (e) {
                console.error('Failed to open document:', e);
                this.showDocumentNotLoadedMessage(source);
                return;
            }
        }
        
        // Now check if PDF iframe is available
        const pdfIframe = document.querySelector('.pdf-iframe');
        if (!pdfIframe) {
            console.warn('PDF viewer iframe not found after opening document');
            return;
        }
        
        // Extract agent/folder and filename from document path for API call
        let agentName = 'default';
        let documentPath = source.file_path || filename;
        
        if (documentPath && documentPath.includes('/')) {
            const parts = documentPath.split('/');
            // If path is like "instance/uploads/letters/hash/file.pdf"
            // parts = ["instance", "uploads", "letters", "hash", "file.pdf"]
            const uploadsIndex = parts.indexOf('uploads');
            if (uploadsIndex !== -1 && parts.length > uploadsIndex + 1) {
                agentName = parts[uploadsIndex + 1];  // "letters"
            }
        }
        
        console.log('Extracted - agent:', agentName, '| filename:', filename);
        
        // Use chunk-based highlighting with precise coordinates from backend
        try {
            // Use agent name as chat_id (matches backend folder structure)
            const chatId = agentName;
            
            console.log('Calling highlight API with:', {
                chat_id: chatId,
                filename: filename,
                chunk_count: 1
            });
            
            const response = await fetch('/api/rag/highlight-chunks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    filename: filename,
                    chunks: [source.text]  // Send the text content as chunk
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Highlight API failed: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log('Highlight API result:', result);
            
            if (result.highlights && result.highlights.length > 0) {
                // Send chunk-based highlights to PDF viewer
                const highlightPayload = {
                    type: 'chunkHighlight',
                    highlights: result.highlights,
                    preserveAnchor: false,
                    silent: true
                };
                
                // Wait for PDF viewer to fully initialize
                setTimeout(() => {
                    pdfIframe.contentWindow.postMessage({ type: 'enableAiOverlay' }, '*');
                }, 500);
                
                setTimeout(() => {
                    pdfIframe.contentWindow.postMessage(highlightPayload, '*');
                }, 700);
                
                setTimeout(() => {
                    pdfIframe.contentWindow.postMessage({ type: 'showAIHighlights' }, '*');
                }, 900);
                
                // Navigate to the first highlight's page
                if (result.highlights[0].page) {
                    setTimeout(() => {
                        pdfIframe.contentWindow.postMessage({
                            type: 'navigateToPage',
                            page: result.highlights[0].page
                        }, '*');
                    }, 1100);
                }
            } else {
                // Show user-friendly message
                this.showNoHighlightsMessage(source);
            }
            
            // Scroll PDF viewer into view
            pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {
            console.error('Failed to highlight chunk:', e);
            // Show error message
            this.showHighlightErrorMessage(source, e);
        }
    }
    
    /**
     * Show message when no highlights are found
     */
    showNoHighlightsMessage(source) {
        console.warn('No highlights found for source:', source.text?.substring(0, 100));
        // Could show a toast notification here
    }
    
    /**
     * Show message when document is not loaded
     */
    showDocumentNotLoadedMessage(source) {
        console.warn('Document not loaded. Please open the document first.');
        // Could show a toast notification here
    }
    
    /**
     * Show error message when highlighting fails
     * @param {Object} source - Source object
     * @param {Error} error - The error that occurred
     */
    showHighlightErrorMessage(source, error) {
        console.error('Failed to highlight chunk:', error.message);
        console.warn('Please check that the document is loaded and the chunk exists in the PDF');
        // Could show a toast notification here
    }

    /**
     * Get current chat ID from URL or controller
     * @returns {string} Chat ID
     */
    getCurrentChatId() {
        // Try to get from chat controller first
        if (window.chatController && window.chatController.chatId) {
            return window.chatController.chatId;
        }
        
        // Try to extract from URL (e.g., /chat/123)
        const urlMatch = window.location.pathname.match(/\/chat\/(\d+)/);
        if (urlMatch) {
            return urlMatch[1];
        }
        
        // Try to get from URL params
        const params = new URLSearchParams(window.location.search);
        const chatIdParam = params.get('chat_id') || params.get('id');
        if (chatIdParam) {
            return chatIdParam;
        }
        
        // Default fallback
        console.warn('Could not determine chat_id, using "default"');
        return 'default';
    }

    /**
     * Initialize the sources sidebar functionality
     */
    initializeSidebar() {
        const sidebar = document.getElementById('sourcesSidebar');
        const overlay = document.getElementById('sourcesSidebarOverlay');
        const closeBtn = sidebar?.querySelector('.sources-sidebar-close');

        // Close sidebar when clicking close button
        closeBtn?.addEventListener('click', () => {
            this.closeSidebar();
        });

        // Close sidebar when clicking overlay
        overlay?.addEventListener('click', () => {
            this.closeSidebar();
        });

        // Close sidebar with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar?.classList.contains('open')) {
                this.closeSidebar();
            }
        });
    }

    /**
     * Open sources sidebar with sources data
     * @param {Array} sources - Array of source objects
     */
    openSidebar(sources) {
        const sidebar = document.getElementById('sourcesSidebar');
        const overlay = document.getElementById('sourcesSidebarOverlay');
        const content = sidebar?.querySelector('.sources-sidebar-content');

        if (!sidebar || !overlay || !content) {
            console.error('Sources sidebar elements not found');
            return;
        }

        // Clear existing content
        content.innerHTML = '';

        if (sources.length === 0) {
            content.innerHTML = '<p style="color: var(--muted-text); text-align: center; margin-top: 20px;">No sources available</p>';
        } else {
            sources.forEach((source, index) => {
                const sourceItem = this.createSourceElement(source, index);
                content.appendChild(sourceItem);
            });
        }

        // Show sidebar and overlay
        sidebar.classList.add('open');
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent body scroll
    }

    /**
     * Close sources sidebar
     */
    closeSidebar() {
        const sidebar = document.getElementById('sourcesSidebar');
        const overlay = document.getElementById('sourcesSidebarOverlay');

        sidebar?.classList.remove('open');
        overlay?.classList.remove('show');
        document.body.style.overflow = ''; // Restore body scroll
    }

    /**
     * Setup the sources button for a message
     * @param {Element} messageElement - The message DOM element
     * @param {Array} sources - Array of source objects
     */
    setupSourcesButton(messageElement, sources) {
        const sourcesBtn = messageElement.querySelector('.sources-btn');
        if (!sourcesBtn) return;

        // Show the button
        sourcesBtn.style.display = 'inline-flex';
        
        // Update button text to show count
        const countBadge = sources.length;
        sourcesBtn.innerHTML = `<i class="fas fa-link"></i> ${countBadge}`;
        
        // Remove any existing event listeners
        const newBtn = sourcesBtn.cloneNode(true);
        sourcesBtn.parentNode.replaceChild(newBtn, sourcesBtn);
        
        // Add click handler to open sidebar
        newBtn.addEventListener('click', () => {
            this.openSidebar(sources);
        });
    }

    /**
     * Hide the sources button for a message
     * @param {Element} messageElement - The message DOM element
     */
    hideSourcesButton(messageElement) {
        const sourcesBtn = messageElement.querySelector('.sources-btn');
        if (sourcesBtn) {
            sourcesBtn.style.display = 'none';
        }
    }

    /**
     * Remove trailing Sources/References section and return main content.
     */
    stripSourcesSection(content) {
        if (!content) return '';
        const match = content.match(/(Sources?:|References?:)[\s\S]*$/i);
        if (match) {
            return content.replace(match[0], '').trim();
        }
        return content;
    }

    /**
     * Format the main message content with hyperlinked sources
     * @param {string} content - The message content
     * @param {Array} sources - Array of source objects
     * @returns {string} Formatted HTML content with hyperlinked sources
     */
    formatMessageContentWithLinks(content, sources) {
        let formattedContent = content;
        
        // Create a mapping of source titles to URLs
        const sourceMap = {};
        sources.forEach((source, index) => {
            sourceMap[source.title] = {
                url: source.url,
                index: index + 1
            };
        });
        
        // Replace explicit source mentions with hyperlinks
        // Look for patterns like "Source 1: Title"
        for (const [title, sourceInfo] of Object.entries(sourceMap)) {
            // Escape special regex characters in title
            const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Pattern for "Source X: Title" format
            const sourcePattern = new RegExp(`(Source\\s+${sourceInfo.index}:?\\s*)(${escapedTitle})`, 'gi');
            formattedContent = formattedContent.replace(sourcePattern, 
                `$1<a href="${sourceInfo.url}" target="_blank" rel="noopener noreferrer" class="source-link">${title}</a>`
            );
        }
        
        // Apply markdown formatting
        formattedContent = formattedContent
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        
        return formattedContent;
    }

    /**
     * Format the main message content with clickable reference numbers for PDF documents
     * @param {string} content - The message content
     * @param {Array} sources - Array of source objects with page/text info
     * @returns {string} Formatted HTML content with clickable reference numbers
     */
    formatMessageContentWithReferences(content, sources) {
        let formattedContent = content;
        
        // Remove LLM-generated citations in various formats
        formattedContent = formattedContent
            // Remove markdown quote blocks (>) at start of lines or after newlines
            .replace(/^>\s*/gm, '')
            .replace(/\n>\s*/g, '\n')
            
            // Remove citation references with document names
            .replace(/\s*\([^)]*[A-Z]{2}[‑-][A-Z0-9][^)]*\)/gi, '')  // (CV-B2-T6, ...) or similar
            .replace(/\s*\([^)]*\.pdf[^)]*\)/gi, '')  // (filename.pdf, ...) 
            .replace(/\s*\(Source:\s*[^)]+\)/gi, '')  // (Source: ...)
            
            // Remove square bracket citations
            .replace(/\s*\[[^\]]*\.pdf[^\]]*\]/gi, '')  // [filename.pdf, ...]
            .replace(/\s*\[Source:\s*[^\]]+\]/gi, '')  // [Source: ...]
            
            // Remove full-width bracket citations: 【1】【2】【3】etc.
            .replace(/【\d+】/g, '')
            
            // Remove any remaining numbered citations like [1] [2] that LLM added
            .replace(/\s*\[\d+\]/g, '')
            
            // Remove standalone citation lines like "> (CV-B2-T6) "
            .replace(/^[""]?\s*\([^)]+\)\s*[""]?\s*$/gm, '')
            
            // Clean up extra quotes around content
            .replace(/^[""\s]+|[""\s]+$/g, '')
            
            // Clean up multiple spaces and trim
            .replace(/\s{2,}/g, ' ')
            .trim();
        
        // Filter PDF/document sources that have page information
        const docSources = sources.filter(s => 
            s.source_type === 'document' && 
            (s.page !== undefined && s.page !== null) &&
            s.text
        );
        
        // Apply markdown formatting FIRST (before adding sup tags to avoid escaping them)
        formattedContent = formattedContent
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        
        if (docSources.length > 0) {
            // Add inline reference numbers as clickable superscripts
            const refs = docSources.map((source, idx) => {
                const refNum = idx + 1;
                const sourceTitle = source.source || 'Document';
                const pageText = source.page ? ` (Page ${source.page})` : '';
                return `<sup class="doc-reference" data-ref-id="${idx}" data-page="${source.page || 1}" data-text="${this.escapeHtml(source.text || '')}" title="Jump to ${sourceTitle}${pageText}">[${refNum}]</sup>`;
            }).join(' ');
            
            // Append references at the end of the content
            formattedContent = formattedContent + ' ' + refs;
        }
        
        return formattedContent;
    }

    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Parse sources from text into structured data
     * @param {string} sourcesText - Raw sources text
     * @returns {Array} Array of source objects
     */
    parseSources(sourcesText) {
        const sources = [];
        const lines = sourcesText.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const source = this.parseSourceLine(line.trim());
            if (source) {
                sources.push(source);
            }
        }

        return sources;
    }

    /**
     * Apply structured sources directly to a message element without re-parsing text
     * @param {Element} messageElement
     * @param {Array} sources
     * @param {string} [fullContent]
     */
    applyStructuredSources(messageElement, sources, fullContent) {
        if (!messageElement || !Array.isArray(sources) || sources.length === 0) {
            this.hideSourcesButton(messageElement);
            return;
        }

        const contentDiv = messageElement.querySelector('.chat-text');
        if (contentDiv) {
            const baseText = typeof fullContent === 'string' && fullContent.length
                ? this.stripSourcesSection(fullContent)
                : (contentDiv.textContent || '');
            const formattedContent = this.formatMessageContentWithReferences(baseText, sources);
            contentDiv.innerHTML = formattedContent;
        }

        try { messageElement.dataset.sources = JSON.stringify(sources); } catch {}
        
        // Only show sources button if there are web sources (with URLs)
        const webSources = sources.filter(s => 
            s.source_type === 'web' || (s.url && s.url.startsWith('http'))
        );
        
        if (webSources.length > 0) {
            this.setupSourcesButton(messageElement, webSources);
        } else {
            this.hideSourcesButton(messageElement);
        }
    }

    /**
     * Parse a single source line
     * @param {string} line - Source line text
     * @returns {Object|null} Source object or null if parsing fails
     */
    parseSourceLine(line) {
        // Try to match "Title - URL" or "1. Title - URL" format
        const match = line.match(/^(?:\d+\.\s*)?(.+?)\s*-\s*(https?:\/\/[^\s]+)$/);
        
        if (match) {
            const title = match[1].trim();
            const url = match[2];
            return {
                title: this.cleanTitle(title),
                url: url,
                quality: this.estimateQualityFromUrl(url)
            };
        }
        
        // Try to find any URL in the line
        const urlMatch = line.match(this.urlPattern);
        if (urlMatch) {
            const url = urlMatch[0];
            const title = line.replace(this.urlPattern, '').trim() || this.getTitleFromUrl(url);
            return {
                title: this.cleanTitle(title),
                url: url,
                quality: this.estimateQualityFromUrl(url)
            };
        }
        
        return null;
    }

    /**
     * Clean up source title
     * @param {string} title - Raw title
     * @returns {string} Cleaned title
     */
    cleanTitle(title) {
        return title
            .replace(/^[-•\*\s]+/, '') // Remove leading bullets/dashes
            .replace(/[-•\*\s]+$/, '') // Remove trailing bullets/dashes
            .replace(/^\d+\.\s*/, '') // Remove numbering
            .trim();
    }

    /**
     * Extract title from URL
     * @param {string} url - Source URL
     * @returns {string} Extracted title
     */
    getTitleFromUrl(url) {
        try {
            const parsed = new URL(url);
            const domain = parsed.hostname.replace('www.', '');
            const path = parsed.pathname.split('/').filter(p => p).join(' › ');
            return path ? `${domain} › ${path}` : domain;
        } catch {
            return url;
        }
    }

    /**
     * Estimate quality score from URL
     * @param {string} url - Source URL
     * @returns {string} Quality level: 'high', 'medium', or 'low'
     */
    estimateQualityFromUrl(url) {
        const domain = url.toLowerCase();
        
        const highQuality = [
            'wikipedia.org', 'github.com', 'stackoverflow.com', 'arxiv.org',
            'nature.com', 'science.org', 'ieee.org', 'pubmed.ncbi.nlm.nih.gov',
            'reuters.com', 'bbc.com', 'nytimes.com', 'theguardian.com', 'apnews.com',
            'mit.edu', 'stanford.edu', '.gov', '.edu'
        ];
        
        const lowQuality = [
            'pinterest.com', 'quora.com', 'yahoo.com', 'ehow.com',
            'wikihow.com', 'answers.com', 'ask.com'
        ];
        
        for (const high of highQuality) {
            if (domain.includes(high)) return 'high';
        }
        
        for (const low of lowQuality) {
            if (domain.includes(low)) return 'low';
        }
        
        return 'medium';
    }

    /**
     * Create a DOM element for a source
     * @param {Object} source - Source object
     * @param {number} index - Source index
     * @returns {Element} Source DOM element
     */
    createSourceElement(source, index) {
        const sourceItem = document.createElement('a');
        sourceItem.className = 'source-item';
        sourceItem.href = source.url;
        sourceItem.target = '_blank';
        sourceItem.rel = 'noopener noreferrer';
        
        const title = document.createElement('div');
        title.className = 'source-title';
        title.textContent = source.title;
        sourceItem.appendChild(title);
        
        const url = document.createElement('div');
        url.className = 'source-url';
        url.textContent = source.url;
        sourceItem.appendChild(url);
        
        if (source.quality) {
            const quality = document.createElement('span');
            quality.className = `source-quality ${source.quality}`;
            quality.textContent = source.quality.charAt(0).toUpperCase() + source.quality.slice(1);
            sourceItem.appendChild(quality);
        }
        
        return sourceItem;
    }
}
let instance = null;
let initPromise = null;

function ensureInstance() {
    if (!instance) {
        instance = new SourceDisplayManager();
        try { window.sourceDisplayManager = instance; } catch {}
    }
    return instance;
}

export function init() {
    if (initPromise) return initPromise;
    initPromise = new Promise((resolve) => {
        const start = () => {
            const manager = ensureInstance();
            if (!manager._initialized) {
                manager._initialized = true;
            }
            resolve(manager);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    });
    return initPromise;
}

export function getManager() {
    return instance;
}

try { window.SourceDisplayManager = SourceDisplayManager; } catch {}

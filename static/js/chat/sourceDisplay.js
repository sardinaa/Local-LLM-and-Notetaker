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
        
        // Highlight and navigate to the reference in the PDF viewer
        this.highlightAndNavigateToPDF(source);
    }

    /**
     * Highlight text in PDF viewer and navigate to its location
     * @param {Object} source - Source object with page, text, and other metadata
     */
    highlightAndNavigateToPDF(source) {
        const pdfIframe = document.querySelector('.pdf-iframe');
        if (!pdfIframe) {
            console.warn('PDF viewer not found');
            // Try to open file viewer if available
            if (window.FileViewerRedesigned && window.FileViewerRedesigned.instance) {
                const viewer = window.FileViewerRedesigned.instance;
                if (viewer.currentDocument && viewer.currentDocument.filename) {
                    viewer.openDocument(viewer.currentDocument);
                }
            }
            return;
        }
        
        // Prepare highlight payload for PDF.js viewer
        const highlightPayload = {
            type: 'editorHighlight',
            prompt: source.text || '',
            highlights: [{
                text: source.text || '',
                page: source.page || 1
            }],
            preserveAnchor: false
        };
        
        // Send highlight command to PDF viewer
        try {
            pdfIframe.contentWindow.postMessage(highlightPayload, '*');
            
            // Enable AI overlay to show highlights
            setTimeout(() => {
                pdfIframe.contentWindow.postMessage({ type: 'enableAiOverlay' }, '*');
                pdfIframe.contentWindow.postMessage({ type: 'showAIHighlights' }, '*');
            }, 100);
            
            // Navigate to the page if page number is available
            if (source.page) {
                setTimeout(() => {
                    pdfIframe.contentWindow.postMessage({
                        type: 'navigateToPage',
                        page: source.page
                    }, '*');
                }, 200);
            }
            
            // Scroll PDF viewer into view
            pdfIframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {
            console.error('Failed to communicate with PDF viewer:', e);
        }
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
     * Process message sources and set up the sources button
     * @param {string} content - Full message content including sources
     * @param {Element} messageElement - The message DOM element
     */
    processMessageSources(content, messageElement) {
        try {
            // Extract sources text from the content
            const sourcesMatch = content.match(/(Sources?:.*?)$/s);
            if (!sourcesMatch) {
                // Hide sources button if no sources
                this.hideSourcesButton(messageElement);
                return [];
            }

            const sourcesText = sourcesMatch[1];
            const mainContent = content.replace(sourcesMatch[0], '').trim();
            
            if (sourcesText.trim()) {
                // Parse sources and store them
                const sources = this.parseSources(sourcesText);
                
                if (sources.length > 0) {
                    // Update the message content without sources and add hyperlinks
                    const contentDiv = messageElement.querySelector('.chat-text');
                    if (contentDiv) {
                        const formattedContent = this.formatMessageContentWithLinks(mainContent, sources);
                        contentDiv.innerHTML = formattedContent;
                    }
                    
                    // Persist sources on the element for later retrieval
                    try { messageElement.dataset.sources = JSON.stringify(sources); } catch {}

                    // Show and configure sources button
                    this.setupSourcesButton(messageElement, sources);
                    return sources;
                } else {
                    this.hideSourcesButton(messageElement);
                }
            }
            return [];
        } catch (error) {
            console.warn('Error processing message sources:', error);
            this.hideSourcesButton(messageElement);
            return [];
        }
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
     * Format the main message content (without sources)
     * @param {string} content - The message content
     * @returns {string} Formatted HTML content
     */
    formatMessageContent(content) {
        // Convert markdown-style formatting
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
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
        
        // Filter PDF/document sources that have page information
        const docSources = sources.filter(s => 
            s.source_type === 'document' && 
            (s.page !== undefined && s.page !== null) &&
            s.text
        );
        
        if (docSources.length > 0) {
            // Add inline reference numbers [1], [2], etc. at the end for now
            // In a more sophisticated implementation, the LLM could insert these inline
            const refs = docSources.map((source, idx) => {
                const refNum = idx + 1;
                const sourceTitle = source.source || 'Document';
                const pageText = source.page ? ` (Page ${source.page})` : '';
                return `<sup class="doc-reference" data-ref-id="${idx}" data-page="${source.page || 1}" data-text="${this.escapeHtml(source.text || '')}" title="Jump to ${sourceTitle}${pageText}">[${refNum}]</sup>`;
            }).join(' ');
            
            // Append references at the end of the content
            formattedContent = formattedContent + ' ' + refs;
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
        this.setupSourcesButton(messageElement, sources);
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

    /**
     * Initialize source processing for existing messages
     */
    initializeExistingMessages() {
        // Process bot messages currently rendered in the chat pane
        const messages = document.querySelectorAll('.chat-message.bot');
        messages.forEach(messageElement => {
            const contentDiv = messageElement.querySelector('.chat-text');
            if (!contentDiv) return;
            const messageText = contentDiv.textContent || contentDiv.innerText || '';
            this.processMessageSources(messageText, messageElement);
        });
    }

    /**
     * Process a new message as it's being received
     * @param {Element} messageElement - The message DOM element
     * @param {string} content - The message content
     */
    processNewMessage(messageElement, content) {
        // Only process when the message is complete
        if (content.includes('Sources:') || content.includes('References:')) {
            this.processMessageSources(content, messageElement);
        }
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
                manager.initializeExistingMessages();
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

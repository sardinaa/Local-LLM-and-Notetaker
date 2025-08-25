class NoteEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.editor = null;
        this.currentNoteId = null;
        this.onChangeCallback = null; // Add callback for change detection
        this.isReady = false; // Track ready state
        
        this.init();
    }
    
    init() {
        // Debug: Check if required classes are available
        const requiredClasses = ['Header', 'Paragraph', 'EditorjsList', 'Quote', 'Table', 'CodeTool', 'Embed', 'Delimiter', 'editorjsColumns', 'Marker', 'Annotation', 'Undo'];
        console.log('Checking required classes:');
        requiredClasses.forEach(className => {
            const isAvailable = typeof window[className] !== 'undefined';
            console.log(`${className}: ${isAvailable ? 'Available' : 'NOT AVAILABLE'}`);
        });
        
        // Also check for alternative class names
        const alternativeClasses = ['EditorjsAnnotation', 'EditorjsUndo'];
        console.log('Checking alternative class names:');
        alternativeClasses.forEach(className => {
            const isAvailable = typeof window[className] !== 'undefined';
            console.log(`${className}: ${isAvailable ? 'Available' : 'NOT AVAILABLE'}`);
        });
        
        const tools = {
            header: {
                class: Header,
                config: {
                    levels: [1, 2, 3, 4, 5, 6],
                    defaultLevel: 2
                }
            },
            paragraph: {
                class: Paragraph,
                inlineToolbar: true
            },
            list: {
                class: EditorjsList,
                inlineToolbar: true
            },
            checklist: (typeof Checklist !== 'undefined') ? {
                class: Checklist,
                inlineToolbar: true
            } : undefined,
            quote: {
                class: Quote,
                inlineToolbar: true
            },
            table: {
                class: Table,
                inlineToolbar: true
            },
            code: CodeTool,
            image: {
                class: SimpleImage,
                inlineToolbar: true
            },
            delimiter: Delimiter
        };

        // Always use custom marker implementation with color selection
        tools.marker = {
            class: CustomMarker,
            shortcut: 'CMD+SHIFT+M'
        };

        // Add annotation tool with proper class detection
        if (typeof Annotation !== 'undefined') {
            tools.annotation = {
                class: Annotation,
                config: {
                    placeholder: 'Add annotation...'
                }
            };
        } else if (typeof EditorjsAnnotation !== 'undefined') {
            tools.annotation = {
                class: EditorjsAnnotation,
                config: {
                    placeholder: 'Add annotation...'
                }
            };
        }

        // Add a simple spoiler/details block as toggle alternative
        tools.spoiler = {
            class: SimpleToggle,
            inlineToolbar: true
        };

        // Add emoji picker tool
        tools.emoji = {
            class: EmojiPicker,
            inlineToolbar: false
        };

        // Remove tunes configuration for now to prevent errors
        const tunes = {};

        // Add Columns tool only if the class is available
        if (typeof editorjsColumns !== 'undefined') {
            tools.columns = {
                class: editorjsColumns,
                config: {
                    EditorJsLibrary: EditorJS, // Pass the EditorJS library
                    tools: {
                        header: Header,
                        paragraph: Paragraph,
                        quote: Quote,
                        list: EditorjsList,
                        code: CodeTool,
                        image: SimpleImage,
                        delimiter: Delimiter
                    }
                }
            };
        } else {
            console.warn('editorjsColumns class not available, skipping columns tool');
        }

        // Add Embed tool only if the class is available
        if (typeof Embed !== 'undefined') {
            tools.embed = {
                class: Embed,
                config: {
                    services: {
                        youtube: true,
                        coub: true,
                        codepen: true,
                        imgur: true,
                        gfycat: true,
                        vimeo: true,
                        twitter: true,
                        instagram: true,
                        facebook: true
                    }
                },
                inlineToolbar: true
            };
        } else {
            console.warn('Embed class not available, skipping embed tool');
        }

        // Check and add new tools only if available
        if (typeof Marker === 'undefined') {
            console.warn('Marker class not available, skipping marker tool');
        }

        if (typeof Annotation === 'undefined' && typeof EditorjsAnnotation === 'undefined') {
            console.warn('Annotation class not available, skipping annotation tool');
        }

        this.editor = new EditorJS({
            holder: this.container,
            autofocus: true,
            placeholder: 'Start writing your note here...',
            onChange: () => {
                // Trigger callback when content changes
                if (this.onChangeCallback) {
                    this.onChangeCallback();
                }
            },
            tools: tools,
            // Remove tunes configuration to prevent errors
            // Add max width to prevent horizontal overflow
            minHeight: 0,
            logLevel: 'ERROR',
            data: { blocks: [] },
            onReady: () => {
                // Apply custom styling for content area after editor is ready
                console.log('EditorJS onReady callback fired');
                
                // Debug: Log available tools
                console.log('Available tools:', Object.keys(this.editor.configuration.tools || {}));
                
                // Add a small delay to ensure everything is fully initialized
                setTimeout(() => {
                    this.isReady = true;
                    console.log('Editor marked as ready');
                    this.applyEditorStyles();
                    // Install the inline Note Link tool once editor UI exists
                    this.installNoteLinkInlineTool();
                    // Enable click-to-open for note links inside the editor
                    this.enableNoteLinkClickNavigation();
                    // Initialize Undo/Redo if available
                    this.initializeUndo();
                    // Initialize enhanced drag and drop
                    this.initializeDragDrop();
                }, 100);
                
                // Add helper for adding blocks after columns
                this.setupColumnHelpers();
            }
        });
    }
    
    // Initialize Undo/Redo functionality
    initializeUndo() {
        try {
            // Check for different possible class names for the undo plugin
            let UndoClass = null;
            if (typeof Undo !== 'undefined') {
                UndoClass = Undo;
            } else if (typeof EditorjsUndo !== 'undefined') {
                UndoClass = EditorjsUndo;
            } else if (typeof window.Undo !== 'undefined') {
                UndoClass = window.Undo;
            }

            if (UndoClass && this.editor) {
                this.undoManager = new UndoClass({ editor: this.editor });
                
                // Add keyboard shortcuts for undo/redo
                document.addEventListener('keydown', (e) => {
                    if (!this.editor) return;
                    
                    // Ctrl/Cmd + Z: Undo
                    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                        e.preventDefault();
                        this.undoManager.undo();
                    }
                    
                    // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
                    if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') || 
                        ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
                        e.preventDefault();
                        this.undoManager.redo();
                    }
                });
                
                console.log('Undo/Redo functionality initialized');
            } else {
                console.warn('Undo class not available, skipping undo initialization');
            }
        } catch (error) {
            console.error('Failed to initialize undo functionality:', error);
        }
    }
    
    // Initialize enhanced drag and drop functionality
    initializeDragDrop() {
        try {
            // Initialize the basic DragDrop (for file uploads)
            if (typeof DragDrop !== 'undefined' && this.editor) {
                new DragDrop(this.editor);
                console.log('Basic drag and drop functionality initialized');
            }
            
            // Initialize the enhanced EditorJS Drag Drop (for block reordering)
            if (typeof window.EditorjsDragDrop !== 'undefined' && this.editor) {
                new window.EditorjsDragDrop(this.editor);
                console.log('Enhanced drag and drop functionality for block reordering initialized');
            } else if (typeof window.DragDrop !== 'undefined' && this.editor) {
                // Alternative initialization pattern
                new window.DragDrop(this.editor);
                console.log('Alternative enhanced drag and drop functionality initialized');
            } else {
                console.warn('Enhanced drag and drop class not available');
            }
        } catch (error) {
            console.error('Failed to initialize drag and drop functionality:', error);
        }
    }
    
    // Helper function to make it easier to add blocks after columns
    setupColumnHelpers() {
        // Add click handler to help users add content after columns
        document.addEventListener('click', (e) => {
            if (!this.editor) return;
            
            // Check if we clicked after a columns block
            const columnsBlock = e.target.closest('.editorjs-columns');
            if (columnsBlock) {
                const blockElement = columnsBlock.closest('.ce-block');
                if (blockElement) {
                    // Add a small delay to ensure the editor is ready
                    setTimeout(() => {
                        try {
                            const blockIndex = Array.from(blockElement.parentElement.children)
                                .indexOf(blockElement);
                            
                            // Add a new paragraph block after the columns
                            this.editor.blocks.insert('paragraph', {}, {}, blockIndex + 1, true);
                        } catch (error) {
                            console.log('Could not auto-add block after columns:', error);
                        }
                    }, 100);
                }
            }
        });
        
        // Add keyboard shortcuts for column management
        document.addEventListener('keydown', (e) => {
            if (!this.editor) return;
            
            // Ctrl/Cmd + Enter: Add new block after current block (useful for columns)
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                try {
                    const currentBlockIndex = this.editor.blocks.getCurrentBlockIndex();
                    this.editor.blocks.insert('paragraph', {}, {}, currentBlockIndex + 1, true);
                } catch (error) {
                    console.log('Could not add new block:', error);
                }
            }
        });
    }
    
    // New method to apply specific styles to ensure content wrapping
    applyEditorStyles() {
        // Find editor elements and apply proper wrapping styles
        setTimeout(() => {
            const editorElement = document.querySelector('.codex-editor');
            if (editorElement) {
                // Ensure the editor takes full width of its container
                editorElement.style.width = '100%';
                editorElement.style.maxWidth = '100%';
                
                const redactorElement = document.querySelector('.codex-editor__redactor');
                if (redactorElement) {
                    redactorElement.style.width = '100%';
                    redactorElement.style.maxWidth = '100%';
                    redactorElement.style.padding = '0';
                }
            }
        }, 100);
    }
    
    // Add method to set change callback
    setOnChangeCallback(callback) {
        this.onChangeCallback = callback;
    }
    
    async getData() {
        try {
            const data = await this.editor.save();
            return data;
        } catch (error) {
            console.error('Failed to save editor data:', error);
            return null;
        }
    }
    
    async render(data) {
        if (!this.editor) {
            console.warn('Editor instance not available');
            return;
        }

        // Wait for editor to be ready if it's not yet
        if (!this.isReady) {
            console.log('Waiting for editor to be ready...');
            await this.waitForReady();
        }

        try {
            // Always use render instead of clear to avoid block removal issues
            const dataToRender = (data && data.blocks && data.blocks.length > 0) 
                ? data 
                : { blocks: [] };
                
            await this.editor.render(dataToRender);
            console.log('Content rendered successfully');
            
            // Re-apply styles after content is rendered
            this.applyEditorStyles();
        } catch (error) {
            console.error('Error rendering editor content:', error);
            // Fallback: try to render empty content
            try {
                await this.editor.render({ blocks: [] });
            } catch (fallbackError) {
                console.error('Fallback render also failed:', fallbackError);
            }
        }
    }

    // Helper method to wait for editor readiness
    waitForReady(timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (this.isReady) {
                resolve();
                return;
            }

            const startTime = Date.now();
            const checkReady = () => {
                if (this.isReady) {
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error('Editor readiness timeout'));
                } else {
                    setTimeout(checkReady, 50);
                }
            };
            
            checkReady();
        });
    }
    
    setCurrentNote(noteId) {
        this.currentNoteId = noteId;
    }

    // Add a button to the inline toolbar to link selection to an existing note
    installNoteLinkInlineTool() {
        try {
            const ensureButton = () => {
                const toolbars = document.querySelectorAll('.ce-inline-toolbar');
                toolbars.forEach(tb => {
                    const pop = tb.querySelector('.ce-popover__container');
                    const actions = (pop && pop.querySelector('.ce-inline-toolbar__actions')) || tb.querySelector('.ce-inline-toolbar__actions') || pop || tb;
                    if (!actions) return;
                    if (actions.querySelector('.ce-inline-tool--note-link')) return;
                    const btn = document.createElement('button');
                    btn.className = 'ce-inline-tool ce-inline-tool--note-link';
                    btn.type = 'button';
                    btn.title = 'Link to an existing note';
                    btn.innerHTML = '<i class="fas fa-book"></i>';
                    btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSelectionRange(); });
                    btn.addEventListener('click', (e) => { e.preventDefault(); this.saveSelectionRange(); this.openNoteLinkPicker(btn); });
                    actions.appendChild(btn);
                });
            };
            // Try immediately and then observe DOM changes for popover creation
            ensureButton();
            const observer = new MutationObserver(ensureButton);
            observer.observe(document.body, { childList: true, subtree: true });
        } catch (err) {
            console.warn('Failed to install note link tool:', err);
        }
    }

    openNoteLinkPicker(anchorEl) {
        try {
            if (!window.modalManager) window.modalManager = new ModalManager();
            const notesTree = window.noteTreeView ? window.noteTreeView.nodes : [];
            window.modalManager.showNoteSubmenu(anchorEl, notesTree, (selectedNoteId) => {
                if (!selectedNoteId) return;
                this.restoreSelectionRange();
                // Use currently selected text as link text
                const sel = window.getSelection();
                const text = sel && sel.toString() ? sel.toString() : 'Open note';
                this.wrapSelectionWithNoteLink(selectedNoteId, text);
            });
        } catch (err) {
            console.error('Error opening note link picker:', err);
        }
    }

    wrapSelectionWithNoteLink(noteId, defaultText) {
        try {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            // Ensure selection is within editor
            const redactor = document.querySelector('.codex-editor__redactor');
            if (!redactor || !redactor.contains(range.commonAncestorContainer)) return;
            const selected = sel.toString() || defaultText || 'Open note';
            const noteTitle = this.getNoteTitleById(noteId) || 'Open note';
            const html = `<a href="#note:${noteId}" class="note-link" data-note-id="${noteId}" title="${this.escapeHtml(noteTitle)}">${this.escapeHtml(selected)}</a>`;
            // Insert HTML for the selection
            document.execCommand('insertHTML', false, html);
        } catch (err) {
            console.error('Failed to create note link:', err);
        }
    }

    enableNoteLinkClickNavigation() {
        const handleOpen = (e, isAux = false) => {
            const link = e.target.closest('a.note-link');
            if (!link) return;
            const noteId = link.getAttribute('data-note-id');
            if (noteId && window.noteTreeView) {
                // Open in a new internal dynamic tab
                e.preventDefault();
                const noteTitle = this.getNoteTitleById(noteId) || 'Note';
                if (window.tabManager && typeof window.tabManager.getOrCreateTabForContent === 'function') {
                    window.tabManager.getOrCreateTabForContent('note', noteId, noteTitle);
                } else {
                    // Fallback: load in current view
                    const nodeData = window.noteTreeView.selectNode(noteId);
                    if (window.loadNoteContent && nodeData) {
                        window.loadNoteContent(noteId, nodeData.name);
                    }
                }
            }
        };
        document.addEventListener('click', (e) => handleOpen(e, false), true);
        document.addEventListener('auxclick', (e) => handleOpen(e, true), true);
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Selection helpers to preserve cursor/selection through UI interactions
    saveSelectionRange() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            this._savedRange = sel.getRangeAt(0).cloneRange();
        } else {
            this._savedRange = null;
        }
    }

    restoreSelectionRange() {
        if (this._savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this._savedRange);
        }
    }

    getNoteTitleById(noteId) {
        try {
            if (!window.noteTreeView) return null;
            const node = window.noteTreeView.findNodeById(window.noteTreeView.nodes, noteId);
            return node ? node.name : null;
        } catch (e) {
            return null;
        }
    }
}

// Full implementation of SimpleImage tool for EditorJS
class SimpleImage {
    static get toolbox() {
        return {
            title: 'Image',
            icon: '<svg width="17" height="15" viewBox="0 0 336 276" xmlns="http://www.w3.org/2000/svg"><path d="M291 150V79c0-19-15-34-34-34H79c-19 0-34 15-34 34v42l67-44 81 72 56-29 42 30zm0 52l-43-30-56 30-81-67-66 39v23c0 19 15 34 34 34h178c17 0 31-13 34-29zM79 0h178c44 0 79 35 79 79v118c0 44-35 79-79 79H79c-44 0-79-35-79-79V79C0 35 35 0 79 0z"/></svg>'
        };
    }
    
    static get pasteConfig() {
        return {
            patterns: {
                image: /https?:\/\/\S+\.(gif|jpe?g|tiff|png|svg|webp)(\?[a-z0-9=]*)?$/i,
            },
            files: {
                mimeTypes: ['image/*'],
            },
        };
    }
    
    constructor({data, config, api, readOnly}) {
        this.api = api;
        this.readOnly = readOnly;
        this.config = config || {};
        this.data = {
            url: data.url || '',
            caption: data.caption || '',
            withBorder: data.withBorder !== undefined ? data.withBorder : false,
            withBackground: data.withBackground !== undefined ? data.withBackground : false,
            stretched: data.stretched !== undefined ? data.stretched : false,
            size: data.size || 'full', // Default to full size
            customWidth: data.customWidth || null, // For custom pixel width
            captionAlign: data.captionAlign || 'left', // Caption alignment: left, center, right
        };
        this.wrapper = undefined;
        this.settings = [
            {
                name: 'withBorder',
                icon: '<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M15.8 10.592v2.043h2.35v2.138H15.8v2.232h-2.25v-2.232h-2.4v-2.138h2.4v-2.043h2.25zm-10.4 2.043h2.4v2.138h-2.4v-2.138zm2.4-2.043v2.043H5.4v-2.043h2.4z"/></svg>'
            },
            {
                name: 'stretched',
                icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><path d="M13.568 5.925H4.056l1.703 1.703a1.125 1.125 0 0 1-1.59 1.591L.962 6.014A1.069 1.069 0 0 1 .588 4.26L4.38.469a1.069 1.069 0 0 1 1.512 1.511L4.084 3.787h9.606l-1.85-1.85a1.069 1.069 0 1 1 1.512-1.51l3.792 3.791a1.069 1.069 0 0 1-.475 1.789L13.514 9.16a1.125 1.125 0 0 1-1.59-1.591l1.644-1.644z"/></svg>'
            },
            {
                name: 'withBackground',
                icon: '<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10.043 8.265l3.183-3.183h-2.924L4.75 10.636v2.923l4.15-4.15v2.351l-2.158 2.159H8.9v2.137H4.7c-1.215 0-2.2-.936-2.2-2.09v-8.93c0-1.154.985-2.09 2.2-2.09h10.663c1.215 0 2.2.936 2.2 2.09v3.183L15.4 9.829V6.364H2.15v-.056c0-.154.1-.26.253-.26h15.194c.152 0 .253.106.253.26v9.794c0 .154-.1.26-.253.26H5.331l2.35-2.158H10.8V8.265z"/></svg>'
            }
        ];

        // Size presets
        this.sizeSettings = [
            { name: 'small', label: 'Small', width: '25%' },
            { name: 'medium', label: 'Medium', width: '50%' },
            { name: 'large', label: 'Large', width: '75%' },
            { name: 'full', label: 'Full', width: '100%' }
        ];

        // Caption alignment options
        this.captionAlignSettings = [
            { name: 'left', label: 'Left', icon: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 3h12v1H2V3zm0 3h8v1H2V6zm0 3h12v1H2V9zm0 3h8v1H2v-1z"/></svg>' },
            { name: 'center', label: 'Center', icon: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 3h12v1H2V3zm2 3h8v1H4V6zm-2 3h12v1H2V9zm2 3h8v1H4v-1z"/></svg>' },
            { name: 'right', label: 'Right', icon: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 3h12v1H2V3zm4 3h8v1H6V6zm-4 3h12v1H2V9zm4 3h8v1H6v-1z"/></svg>' }
        ];
    }
    
    render() {
        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('simple-image');

        if (this.data && this.data.url) {
            this._createImage(this.data.url, this.data.caption);
            return this.wrapper;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';

        const button = document.createElement('div');
        button.innerHTML = `
            <div class="simple-image__upload-button">
                <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3.15 13.628A7.749 7.749 0 0 0 10 18.5a7.749 7.749 0 0 0 6.85-4.872A8.38 8.38 0 0 1 14.041 14c-.636.405-1.041 1.022-1.041 1.714 0 .827.36 1.517.955 2.122L10 20.5l-3.955-2.664c.595-.605.955-1.295.955-2.122 0-.692-.405-1.309-1.041-1.714a8.38 8.38 0 0 1-2.809-.372zM14.5 12.5c0 1.933-1.567 3.5-3.5 3.5S7.5 14.433 7.5 12.5 9.067 9 11 9s3.5 1.567 3.5 3.5z"/>
                </svg>
                Select an image
            </div>
        `;
        button.classList.add('simple-image__upload-button-wrapper');
        button.addEventListener('click', () => input.click());

        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && file.type.startsWith('image/')) {
                this._uploadFile(file);
            }
        });

        this.wrapper.appendChild(button);
        this.wrapper.appendChild(input);

        return this.wrapper;
    }

    _createImage(url, captionText) {
        const imageContainer = document.createElement('div');
        const image = document.createElement('img');
        const caption = document.createElement('div');
        const resizeHandle = document.createElement('div');

        imageContainer.classList.add('simple-image__container');
        image.src = url;
        image.classList.add('simple-image__picture');

        // Apply size
        this._applyImageSize(image);

        caption.classList.add('simple-image__caption');
        caption.contentEditable = !this.readOnly;
        caption.innerHTML = captionText || '';
        
        // Apply caption alignment
        this._applyCaptionAlignment(caption);

        // Resize handle
        resizeHandle.classList.add('simple-image__resize-handle');
        resizeHandle.innerHTML = '↘';
        resizeHandle.style.display = this.readOnly ? 'none' : 'block';

        if (this.data.withBorder) {
            image.classList.add('simple-image__picture--with-border');
        }

        if (this.data.withBackground) {
            image.classList.add('simple-image__picture--with-background');
        }

        if (this.data.stretched) {
            image.classList.add('simple-image__picture--stretched');
        }

        this.wrapper.innerHTML = '';
        imageContainer.appendChild(image);
        imageContainer.appendChild(resizeHandle);
        this.wrapper.appendChild(imageContainer);
        this.wrapper.appendChild(caption);

        // Add resize functionality
        this._addResizeListeners(image, resizeHandle);
    }

    _applyImageSize(image) {
        if (this.data.customWidth) {
            image.style.width = this.data.customWidth + 'px';
            image.style.maxWidth = '100%';
        } else {
            const sizeConfig = this.sizeSettings.find(s => s.name === this.data.size);
            if (sizeConfig) {
                image.style.width = sizeConfig.width;
                image.style.maxWidth = '100%';
            }
        }
    }

    _addResizeListeners(image, resizeHandle) {
        let isResizing = false;
        let startX, startWidth;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = parseInt(window.getComputedStyle(image).width, 10);
            
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        });

        const handleResize = (e) => {
            if (!isResizing) return;
            
            const currentX = e.clientX;
            const diff = currentX - startX;
            const newWidth = startWidth + diff;
            
            // Constrain between 100px and container width
            const containerWidth = this.wrapper.offsetWidth;
            const constrainedWidth = Math.max(100, Math.min(newWidth, containerWidth));
            
            image.style.width = constrainedWidth + 'px';
            this.data.customWidth = constrainedWidth;
            this.data.size = 'custom'; // Mark as custom size
        };

        const stopResize = () => {
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
        };
    }

    _uploadFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            this.data.url = event.target.result;
            this._createImage(this.data.url, this.data.caption);
        };
        reader.readAsDataURL(file);
    }

    onPaste(event) {
        switch (event.type) {
            case 'tag':
                const img = event.detail.data;
                this.data.url = img.src;
                this._createImage(this.data.url, this.data.caption);
                break;

            case 'pattern':
                const url = event.detail.data;
                this.data.url = url;
                this._createImage(this.data.url, this.data.caption);
                break;

            case 'file':
                const file = event.detail.file;
                this._uploadFile(file);
                break;
        }
    }

    renderSettings() {
        const wrapper = document.createElement('div');
        wrapper.classList.add('simple-image__settings');

        // Style toggles
        const styleWrapper = document.createElement('div');
        styleWrapper.classList.add('simple-image__style-settings');
        
        this.settings.forEach(tune => {
            let button = document.createElement('div');
            button.classList.add('cdx-settings-button');
            button.classList.toggle('cdx-settings-button--active', this.data[tune.name]);
            button.innerHTML = tune.icon;
            button.title = tune.name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            
            styleWrapper.appendChild(button);

            button.addEventListener('click', () => {
                this._toggleTune(tune.name);
                button.classList.toggle('cdx-settings-button--active');
            });
        });

        // Size controls
        const sizeWrapper = document.createElement('div');
        sizeWrapper.classList.add('simple-image__size-settings');
        
        const sizeLabel = document.createElement('div');
        sizeLabel.classList.add('simple-image__size-label');
        sizeLabel.textContent = 'Size:';
        sizeWrapper.appendChild(sizeLabel);

        this.sizeSettings.forEach(sizeOption => {
            const button = document.createElement('div');
            button.classList.add('cdx-settings-button', 'simple-image__size-button');
            button.classList.toggle('cdx-settings-button--active', this.data.size === sizeOption.name);
            button.textContent = sizeOption.label;
            button.title = `Set image to ${sizeOption.label.toLowerCase()} size (${sizeOption.width})`;
            
            sizeWrapper.appendChild(button);

            button.addEventListener('click', () => {
                // Remove active class from all size buttons
                sizeWrapper.querySelectorAll('.simple-image__size-button').forEach(btn => {
                    btn.classList.remove('cdx-settings-button--active');
                });
                
                // Add active class to clicked button
                button.classList.add('cdx-settings-button--active');
                
                // Update data and apply size
                this.data.size = sizeOption.name;
                this.data.customWidth = null; // Clear custom width
                this._applySizeToImage();
            });
        });

        // Caption alignment controls
        const alignWrapper = document.createElement('div');
        alignWrapper.classList.add('simple-image__align-settings');
        
        const alignLabel = document.createElement('div');
        alignLabel.classList.add('simple-image__align-label');
        alignLabel.textContent = 'Caption:';
        alignWrapper.appendChild(alignLabel);

        this.captionAlignSettings.forEach(alignOption => {
            const button = document.createElement('div');
            button.classList.add('cdx-settings-button', 'simple-image__align-button');
            button.classList.toggle('cdx-settings-button--active', this.data.captionAlign === alignOption.name);
            button.innerHTML = alignOption.icon;
            button.title = `Align caption to ${alignOption.label.toLowerCase()}`;
            
            alignWrapper.appendChild(button);

            button.addEventListener('click', () => {
                // Remove active class from all align buttons
                alignWrapper.querySelectorAll('.simple-image__align-button').forEach(btn => {
                    btn.classList.remove('cdx-settings-button--active');
                });
                
                // Add active class to clicked button
                button.classList.add('cdx-settings-button--active');
                
                // Update data and apply alignment
                this.data.captionAlign = alignOption.name;
                this._applyCaptionAlignmentToExisting();
            });
        });

        wrapper.appendChild(styleWrapper);
        wrapper.appendChild(sizeWrapper);
        wrapper.appendChild(alignWrapper);
        return wrapper;
    }

    _applySizeToImage() {
        const image = this.wrapper.querySelector('.simple-image__picture');
        if (image) {
            this._applyImageSize(image);
        }
    }

    _applyCaptionAlignment(caption) {
        // Remove existing alignment classes
        caption.classList.remove('simple-image__caption--left', 'simple-image__caption--center', 'simple-image__caption--right');
        
        // Apply current alignment
        caption.classList.add(`simple-image__caption--${this.data.captionAlign}`);
    }

    _applyCaptionAlignmentToExisting() {
        const caption = this.wrapper.querySelector('.simple-image__caption');
        if (caption) {
            this._applyCaptionAlignment(caption);
        }
    }

    _toggleTune(tune) {
        this.data[tune] = !this.data[tune];
        
        if (tune === 'stretched') {
            this.api.blocks.stretchBlock(this.api.blocks.getCurrentBlockIndex(), !!this.data.stretched);
        }

        this._acceptTuneView();
    }

    _acceptTuneView() {
        this.settings.forEach(tune => {
            const image = this.wrapper.querySelector('.simple-image__picture');
            const isActive = this.data[tune.name];
            const buttonClass = `simple-image__picture--${tune.name.replace(/([A-Z])/g, (g) => `-${g[0].toLowerCase()}`)}`;

            if (isActive) {
                image.classList.add(buttonClass);
            } else {
                image.classList.remove(buttonClass);
            }
        });
    }

    save() {
        const caption = this.wrapper.querySelector('.simple-image__caption');
        return Object.assign(this.data, {
            caption: caption ? caption.innerHTML : ''
        });
    }

    static get sanitize() {
        return {
            url: {},
            withBorder: {},
            withBackground: {},
            stretched: {},
            size: {},
            customWidth: {},
            captionAlign: {},
            caption: {
                br: true,
            },
        };
    }
}

// Custom Marker implementation with color selection and deletion
class CustomMarker {
    static get isInline() {
        return true;
    }

    static get sanitize() {
        return {
            mark: {
                'data-color': true,
                'class': true
            }
        };
    }

    constructor({ api }) {
        this.api = api;
        this.button = null;
        this.state = false;
        this.currentColor = 'yellow';
        this.isExpanded = false;
        
        this.colors = [
            { name: 'yellow', value: '#fcf392', label: 'Yellow' },
            { name: 'green', value: '#a4f7a4', label: 'Green' },
            { name: 'blue', value: '#a4d7f7', label: 'Blue' },
            { name: 'red', value: '#f7a4a4', label: 'Red' },
            { name: 'purple', value: '#d7a4f7', label: 'Purple' },
            { name: 'orange', value: '#f7d4a4', label: 'Orange' }
        ];

        this.tag = 'MARK';
        this.class = 'cdx-marker';
    }

    render() {
        this.button = document.createElement('div');
        this.button.classList.add('ce-inline-tool');
        this.button.classList.add('ce-inline-tool--marker');
        this.button.title = 'Highlight text (Click to expand color options)';

        this.updateButtonContent();

        // Add click handler to toggle expanded state
        this.button.addEventListener('click', (event) => {
            event.stopPropagation();
            this.toggleExpanded();
        });

        return this.button;
    }

    updateButtonContent() {
        const isActive = this.checkState();
        
        if (this.isExpanded) {
            // Show expanded color picker in inline toolbar
            this.button.innerHTML = `
                <div class="marker-inline-picker">
                    <div class="marker-inline-picker__main">
                        ${this.getMainIcon()}
                    </div>
                    <div class="marker-inline-picker__colors">
                        ${this.colors.map(color => `
                            <button class="marker-inline-picker__color ${color.name === this.currentColor ? 'active' : ''}" 
                                    data-color="${color.name}" 
                                    style="background-color: ${color.value}" 
                                    title="${color.label}">
                            </button>
                        `).join('')}
                        <button class="marker-inline-picker__remove" title="Remove highlight">
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <path d="M10.5 1.5L1.5 10.5M1.5 1.5l9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            // Add event listeners to color buttons
            setTimeout(() => {
                const colorButtons = this.button.querySelectorAll('.marker-inline-picker__color');
                const removeButton = this.button.querySelector('.marker-inline-picker__remove');
                
                colorButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const color = btn.getAttribute('data-color');
                        console.log('Color button clicked:', color); // Debug log
                        this.selectColor(color);
                    });
                });

                if (removeButton) {
                    removeButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeMarker();
                        this.collapse();
                    });
                }
            }, 0);
        } else {
            // Show compact button
            this.button.innerHTML = `
                <button class="marker-inline-button ${isActive ? 'active' : ''}" type="button">
                    ${this.getMainIcon()}
                </button>
            `;
        }
    }

    getMainIcon() {
        return `<svg width="20" height="18" viewBox="0 0 20 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M15.6 4.2l-1.4-1.4c-.2-.2-.6-.2-.8 0L3.6 12.6c-.2.2-.2.6 0 .8l1.4 1.4c.2.2.6.2.8 0L15.6 5c.2-.2.2-.6 0-.8z"/>
            <path d="M2.5 15.5h15v2h-15z" fill="${this.colors.find(c => c.name === this.currentColor)?.value || '#fcf392'}"/>
        </svg>`;
    }

    toggleExpanded() {
        this.isExpanded = !this.isExpanded;
        this.updateButtonContent();
        
        if (!this.isExpanded) {
            // If collapsing and we have a selection, apply the current color
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && selection.toString().trim()) {
                this.applyMarker();
            }
        }
    }

    collapse() {
        this.isExpanded = false;
        this.updateButtonContent();
    }

    selectColor(color) {
        console.log('Selecting color:', color); // Debug log
        this.currentColor = color;
        
        // Store current selection before applying marker
        const selection = window.getSelection();
        let range = null;
        
        if (selection.rangeCount > 0) {
            range = selection.getRangeAt(0).cloneRange();
        }
        
        // Apply the marker to current selection if any
        if (range && range.toString().trim()) {
            // Restore selection and apply marker
            selection.removeAllRanges();
            selection.addRange(range);
            this.applyMarker();
        }
        
        this.updateButtonContent();
        // Don't collapse immediately to allow for quick color changes
    }

    applyMarker() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        
        if (!selectedText) return;

        console.log('Applying marker with color:', this.currentColor); // Debug log

        // Check if selection is already marked
        const existingMark = this.findMarkedParent(range.commonAncestorContainer);
        if (existingMark) {
            console.log('Updating existing mark to color:', this.currentColor); // Debug log
            // Change color of existing mark
            existingMark.className = `${this.class} ${this.class}--${this.currentColor}`;
            existingMark.setAttribute('data-color', this.currentColor);
            existingMark.style.backgroundColor = this.colors.find(c => c.name === this.currentColor)?.value || '#fcf392';
        } else {
            console.log('Creating new mark with color:', this.currentColor); // Debug log
            // Create new mark
            const mark = document.createElement(this.tag);
            mark.className = `${this.class} ${this.class}--${this.currentColor}`;
            mark.setAttribute('data-color', this.currentColor);
            mark.style.backgroundColor = this.colors.find(c => c.name === this.currentColor)?.value || '#fcf392';
            
            try {
                range.surroundContents(mark);
            } catch (e) {
                // Fallback for complex selections
                mark.appendChild(range.extractContents());
                range.insertNode(mark);
            }
        }

        // Clear selection after applying
        selection.removeAllRanges();
        this.state = true;
        this.updateButtonContent();
    }

    removeMarker() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const markedElement = this.findMarkedParent(range.commonAncestorContainer);
        
        if (markedElement) {
            const parent = markedElement.parentNode;
            while (markedElement.firstChild) {
                parent.insertBefore(markedElement.firstChild, markedElement);
            }
            parent.removeChild(markedElement);
            this.state = false;
            this.updateButtonContent();
        }
    }

    findMarkedParent(element) {
        while (element && element !== document.body) {
            if (element.tagName === this.tag && element.classList.contains(this.class)) {
                return element;
            }
            element = element.parentNode;
        }
        return null;
    }

    checkState() {
        const selection = window.getSelection();
        if (!selection.rangeCount) {
            this.state = false;
            return false;
        }

        const range = selection.getRangeAt(0);
        const markedElement = this.findMarkedParent(range.commonAncestorContainer);
        
        this.state = !!markedElement;
        
        if (markedElement) {
            const color = markedElement.getAttribute('data-color') || 'yellow';
            this.currentColor = color;
        }

        return this.state;
    }

    static get shortcut() {
        return 'CMD+SHIFT+M';
    }
}

// Simple Toggle/Spoiler block implementation
class SimpleToggle {
    static get toolbox() {
        return {
            title: 'Spoiler',
            icon: '<svg width="17" height="15" viewBox="0 0 17 15" xmlns="http://www.w3.org/2000/svg"><path d="M15.5 0h-14C1.224 0 1 .448 1 1v13c0 .552.224 1 .5 1h14c.276 0 .5-.448.5-1V1c0-.552-.224-1-.5-1zM14 13H2V2h12v11zM8.5 4L12 7.5 8.5 11"/></svg>'
        };
    }

    constructor({data}) {
        this.data = data || {};
        this.wrapper = null;
    }

    render() {
        this.wrapper = document.createElement('details');
        this.wrapper.classList.add('simple-toggle');
        
        const summary = document.createElement('summary');
        summary.contentEditable = true;
        summary.textContent = this.data.title || 'Click to expand';
        summary.classList.add('simple-toggle__summary');
        
        const content = document.createElement('div');
        content.contentEditable = true;
        content.innerHTML = this.data.content || 'Enter content here...';
        content.classList.add('simple-toggle__content');
        
        this.wrapper.appendChild(summary);
        this.wrapper.appendChild(content);
        
        return this.wrapper;
    }

    save() {
        const summary = this.wrapper.querySelector('.simple-toggle__summary');
        const content = this.wrapper.querySelector('.simple-toggle__content');
        
        return {
            title: summary ? summary.textContent : '',
            content: content ? content.innerHTML : ''
        };
    }

    static get sanitize() {
        return {
            title: {},
            content: {
                br: true,
                p: true,
                strong: true,
                em: true,
                u: true,
                a: {
                    href: true,
                    target: '_blank'
                }
            }
        };
    }
}

// Emoji Picker block implementation for EditorJS
class EmojiPicker {
    static get toolbox() {
        return {
            title: 'Emoji',
            icon: '<svg width="17" height="15" viewBox="0 0 17 15" xmlns="http://www.w3.org/2000/svg"><circle cx="8.5" cy="7.5" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="5.5" r="0.8" fill="currentColor"/><circle cx="11" cy="5.5" r="0.8" fill="currentColor"/><path d="M5.5 9.5c1 1.5 3.5 1.5 4.5 0" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>'
        };
    }

    constructor({data, api, config}) {
        this.api = api;
        this.data = data || {};
        this.config = config || {};
        this.wrapper = null;
        this.currentBlockIndex = null;
    }

    render() {
        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('emoji-picker-block');
        
        // Create a button to trigger emoji picker
        const pickerButton = document.createElement('button');
        pickerButton.type = 'button';
        pickerButton.classList.add('emoji-picker-trigger');
        pickerButton.innerHTML = `
            <span class="emoji-picker-icon">😀</span>
            <span class="emoji-picker-text">Choose an emoji</span>
        `;
        
        // Create hidden input for the picker to work with
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.value = '';
        
        this.wrapper.appendChild(pickerButton);
        this.wrapper.appendChild(hiddenInput);
        
        // Initialize emoji picker when button is clicked
        pickerButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.openEmojiPicker(pickerButton, hiddenInput);
        });
        
        return this.wrapper;
    }

    openEmojiPicker(anchorButton, hiddenInput) {
        // Store current block index
        this.currentBlockIndex = this.api.blocks.getCurrentBlockIndex();
        
        // Initialize emoji picker if not already done
        if (!hiddenInput._iconPicker) {
            // Check if attachIconPicker is available
            if (typeof window.attachIconPicker === 'function') {
                window.attachIconPicker(hiddenInput, {
                    anchorEl: anchorButton,
                    onSelect: (emoji) => {
                        this.insertEmojiIntoCurrentBlock(emoji);
                    }
                });
            } else {
                console.error('Icon picker not available. Make sure iconPicker.js is loaded.');
                return;
            }
        }
        
        // Show the picker
        if (hiddenInput._iconPicker) {
            hiddenInput._iconPicker.show();
        }
    }

    insertEmojiIntoCurrentBlock(emoji) {
        try {
            // First, find the current focused editable element or the last text block
            const focusedElement = document.activeElement;
            let targetElement = null;
            let targetBlockIndex = null;

            // Check if we have a focused contenteditable element
            if (focusedElement && 
                focusedElement.hasAttribute('contenteditable') && 
                focusedElement.getAttribute('contenteditable') !== 'false') {
                targetElement = focusedElement;
                
                // Find the block index for this element
                const blockElement = focusedElement.closest('.ce-block');
                if (blockElement) {
                    const blockElements = document.querySelectorAll('.ce-block');
                    targetBlockIndex = Array.from(blockElements).indexOf(blockElement);
                }
            } else {
                // No focused element, find the block before the emoji picker block
                const emojiBlockIndex = this.currentBlockIndex;
                
                // Look for the previous block that can accept text
                for (let i = emojiBlockIndex - 1; i >= 0; i--) {
                    const block = this.api.blocks.getBlockByIndex(i);
                    if (block && (block.name === 'paragraph' || block.name === 'header')) {
                        const blockElement = block.holder;
                        const editableElement = blockElement.querySelector('[contenteditable="true"]');
                        if (editableElement) {
                            targetElement = editableElement;
                            targetBlockIndex = i;
                            break;
                        }
                    }
                }
            }

            if (targetElement && targetBlockIndex !== null) {
                // Insert emoji into existing block
                this.insertEmojiIntoElement(targetElement, emoji);
                
                // Remove the emoji picker block
                this.api.blocks.delete(this.currentBlockIndex);
                
                // Focus the target element
                targetElement.focus();
            } else {
                // No suitable block found, create a new paragraph with the emoji
                this.api.blocks.insert('paragraph', {
                    text: emoji
                }, {}, this.currentBlockIndex, true);
                
                // Remove the emoji picker block
                this.api.blocks.delete(this.currentBlockIndex + 1);
            }
        } catch (error) {
            console.error('Error inserting emoji:', error);
            
            // Fallback: just insert a new paragraph with the emoji
            this.api.blocks.insert('paragraph', {
                text: emoji
            }, {}, this.currentBlockIndex + 1, true);
            
            // Remove current emoji picker block
            try {
                this.api.blocks.delete(this.currentBlockIndex);
            } catch (deleteError) {
                console.error('Error removing emoji picker block:', deleteError);
            }
        }
    }

    insertEmojiIntoElement(element, emoji) {
        // Focus the element first
        element.focus();
        
        // Get current selection or place at end
        const selection = window.getSelection();
        let range;
        
        if (selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
            range = selection.getRangeAt(0);
        } else {
            // If no selection or selection is outside, place at end
            range = document.createRange();
            if (element.childNodes.length > 0) {
                // If element has content, place at end
                const lastNode = element.childNodes[element.childNodes.length - 1];
                if (lastNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(lastNode, lastNode.textContent.length);
                } else {
                    range.setStartAfter(lastNode);
                }
            } else {
                // Empty element, place at start
                range.setStart(element, 0);
            }
            range.collapse(true);
        }
        
        // Insert emoji at cursor position
        const emojiNode = document.createTextNode(emoji);
        range.deleteContents();
        range.insertNode(emojiNode);
        
        // Move cursor after emoji
        range.setStartAfter(emojiNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Trigger input event to notify EditorJS of changes
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    save() {
        // This block doesn't save data as it's just for triggering emoji insertion
        return {};
    }

    static get sanitize() {
        return {};
    }
}

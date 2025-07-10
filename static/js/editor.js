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
            tools: {
                header: {
                    class: Header,
                    config: {
                        levels: [1, 2, 3, 4, 5, 6],
                        defaultLevel: 2
                    }
                },
                list: {
                    class: EditorjsList,
                    inlineToolbar: true
                },
                quote: {
                    class: Quote,
                    inlineToolbar: true
                },
                code: CodeTool,
                image: {
                    class: SimpleImage,
                    inlineToolbar: true
                }
            },
            // Add max width to prevent horizontal overflow
            minHeight: 0,
            logLevel: 'ERROR',
            data: { blocks: [] },
            onReady: () => {
                // Apply custom styling for content area after editor is ready
                console.log('EditorJS onReady callback fired');
                
                // Add a small delay to ensure everything is fully initialized
                setTimeout(() => {
                    this.isReady = true;
                    console.log('Editor marked as ready');
                    this.applyEditorStyles();
                }, 100);
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
}

// Simple mock implementation for the SimpleImage tool, as we're just
// demonstrating the structure here
class SimpleImage {
    static get toolbox() {
        return {
            title: 'Image',
            icon: '<svg width="17" height="15" viewBox="0 0 336 276" xmlns="http://www.w3.org/2000/svg"><path d="M291 150V79c0-19-15-34-34-34H79c-19 0-34 15-34 34v42l67-44 81 72 56-29 42 30zm0 52l-43-30-56 30-81-67-66 39v23c0 19 15 34 34 34h178c17 0 31-13 34-29zM79 0h178c44 0 79 35 79 79v118c0 44-35 79-79 79H79c-44 0-79-35-79-79V79C0 35 35 0 79 0z"/></svg>'
        };
    }
    
    constructor({data}) {
        this.data = data || {};
    }
    
    render() {
        const container = document.createElement('div');
        container.innerHTML = `<p>Image placeholder</p>`;
        return container;
    }
    
    save() {
        return this.data;
    }
}
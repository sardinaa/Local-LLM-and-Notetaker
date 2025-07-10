class NoteEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.editor = null;
        this.currentNoteId = null;
        this.onChangeCallback = null; // Add callback for change detection
        
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
                this.applyEditorStyles();
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
    
    render(data) {
        if (!data || !data.blocks) {
            this.editor.clear();
            return;
        }
        
        this.editor.render(data).then(() => {
            // Re-apply styles after content is rendered
            this.applyEditorStyles();
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
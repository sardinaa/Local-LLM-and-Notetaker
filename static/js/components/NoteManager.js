export class NoteManager {
    constructor(apiService) {
        this.apiService = apiService;
        this.editor = null;
        this.initEditor();
    }

    initEditor(content = { blocks: [] }) {
        this.editor = new EditorJS({
            holder: 'editorjs',
            tools: {
                header: { // Include the header tool
                    class: Header,
                    config: {
                        placeholder: 'Enter a header',
                        levels: [1, 2, 3, 4],
                        defaultLevel: 2
                    },
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
                    },
                },
                Marker: {
                    class: Marker,
                    shortcut: 'CTRL+SHIFT+M',
                },
                toggle: {
                    class: ToggleBlock,
                    inlineToolbar: true,
                },
                attaches: {
                    class: AttachesTool,
                    config: {
                      endpoint: 'http://127.0.0.1:5000/uploadFile'
                    }
                },
                linkTool: {
                    class: LinkTool,
                    config: {
                      endpoint: 'http://127.0.0.1:5000/fetchUrl',
                    }
                },
                code: CodeTool,
                paragraph: {
                    class: Paragraph,
                    inlineToolbar: true,
                },
            },
            data: content,
            onChange: () => this.saveNoteContent(),
            onReady: () => {
                new Undo({ editor: this.editor });
                new DragDrop(this.editor);

                // Key sequence for 'hh' to convert paragraph to header
                const editorHolder = document.getElementById('editorjs');
                let keySequence = '';
                editorHolder.addEventListener('keydown', async (event) => {
                    if (event.repeat) return;

                    keySequence += event.key;
                    if (keySequence.endsWith('hh')) {
                        event.preventDefault();
                        try {
                            const blocks = await this.editor.save();
                            const lastBlock = blocks.blocks.at(-1);
                            if (lastBlock && lastBlock.type === 'paragraph') {
                                this.editor.blocks.delete(lastBlock.id);
                                this.editor.blocks.insert('header', { text: lastBlock.data.text, level: 2 });
                            }
                        } catch (error) {
                            console.error('Error transforming paragraph to header:', error);
                        }
                        keySequence = '';
                    }

                    if (keySequence.length > 2) {
                        keySequence = keySequence.slice(-2);
                    }
                });
            },
        });
    }

    async saveNoteContent() {
        const content = await this.editor.save();
        const noteId = document.getElementById('editorjs').dataset.noteId;
        this.apiService.post(`/update_note/${noteId}`, { content })
        .catch((error) => {
            console.error('Failed to save note content:', error);
        });
    }

    async loadNoteContent(noteId) {
        const note = await this.apiService.get(`/get_note/${noteId}`);
        document.getElementById('editorjs').dataset.noteId = note.id;
        this.editor.render(note.content);
    }

    async createNote(name, folderId = null) {
        try {
            const response = await this.apiService.post('/create_note', { name, folder_id: folderId });
            return response;
        } catch (error) {
            console.error('Error creating note:', error);
        }
    }

    async renameNote(noteId, newName) {
        await this.apiService.post(`/rename_note/${noteId}`, { name: newName });
        const noteElement = document.querySelector(`.tree-item[data-id="${noteId}"]`);
        if (noteElement) {
            noteElement.querySelector(".item-name").textContent = newName;
        }
    }

    async deleteNote(noteId) {
        const confirmation = confirm("Are you sure you want to delete this note?");
        if (!confirmation) return;

        await this.apiService.post(`/delete_note/${noteId}`);
        const noteElement = document.querySelector(`.tree-item[data-id="${noteId}"]`);
        if (noteElement) {
            noteElement.remove();
        }
    }

    async moveNote(noteId, targetFolderId) {
        await this.apiService.post(`/move_note/${noteId}`, { folder_id: targetFolderId });
        console.log(`Moved note ${noteId} to folder ${targetFolderId}`);
    }
}

export function addNoteToUI(note) {
    const treeContainer = document.getElementById('tree-container');
    const noteItem = document.createElement('div');
    noteItem.classList.add('tree-item');
    noteItem.dataset.id = note.id;
    noteItem.dataset.type = 'note';
    noteItem.textContent = note.name;
    treeContainer.appendChild(noteItem);
}
// Notes editor helpers
export function openNotesEditor() {
    const previewContent = document.getElementById('filePreviewContent');
    if (!previewContent) return;

    // Show notes editor content area
    previewContent.innerHTML = `
        <div class="notes-editor-content">
            <div id="notesEditorJS"></div>
        </div>
    `;

    // Update the existing header to show notes mode
    this.updateHeaderForNotesMode();

    // Initialize the notes editor
    this.initializeNotesEditor();
}


export function updateHeaderForNotesMode() {
    // Update the file name to show current note name
    const fileNameElement = document.querySelector('.file-name-text');
    if (fileNameElement) {
        fileNameElement.textContent = this.currentNoteName || 'Untitled Note';
    }

    // Find the PDF controls section and modify existing buttons
    const pdfControls = document.querySelector('.pdf-controls');
    if (pdfControls) {
        // Store original state for restoration later
        this.originalControlsHTML = pdfControls.innerHTML;
        
        // Replace controls with notes-specific controls including a back to PDF button
        pdfControls.innerHTML = `
            <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.returnToDocument()" title="Back to Document (PDF)">
                <i class="fas fa-file-pdf"></i>
            </button>
            <div class="notes-controls-section">
                <button class="btn-primary pdf-control-btn" onclick="FileViewerRedesigned.instance.saveCurrentNote()" title="Save Note">
                    <i class="fas fa-save"></i>
                </button>
                <button class="btn-secondary pdf-control-btn" onclick="FileViewerRedesigned.instance.openNotesList()" title="Open Note">
                    <i class="fas fa-folder-open"></i>
                </button>
                <div class="current-note-info-inline">
                    <div class="note-tags" id="noteTags"></div>
                </div>
            </div>
        `;
    }

    // Update the file type info to show "Notes Editor"
    const fileTypeLabel = document.querySelector('.file-type-label');
    if (fileTypeLabel) {
        this.originalFileTypeLabel = fileTypeLabel.textContent;
        fileTypeLabel.textContent = 'Notes Editor';
    }

    const fileTypeIcon = document.querySelector('.file-type-info i');
    if (fileTypeIcon) {
        this.originalFileTypeIcon = fileTypeIcon.className;
        fileTypeIcon.className = 'fas fa-sticky-note';
    }
}


export async function initializeNotesEditor() {
    try {
        // Destroy existing editor instance if any
        this.destroyNotesEditor();
        
        // Initialize EditorJS for notes
        this.notesEditorInstance = new EditorJS({
            holder: 'notesEditorJS',
            placeholder: 'Start writing your note...',
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
                }
            },
            data: {
                blocks: []
            }
        });

        await this.notesEditorInstance.isReady;
        console.log('Notes EditorJS initialized successfully');
        
        // EditorJS doesn't have onChange, so we'll track changes differently
        // We'll mark as changed when addToCurrentNote is called or when saving
        
        // Load the last opened note or create blank note
        this.loadDefaultNote();
        // Typeset math after initial load (if any)
        this.typesetNotesMath();
        
    } catch (error) {
        console.error('Failed to initialize notes EditorJS:', error);
        this.showNotesError('Failed to initialize notes editor');
    }
}


export function loadDefaultNote() {
    // First check for temporary storage from this chat session
    const tempData = this.loadFromTempStorage();
    if (tempData && tempData.hasUnsavedChanges) {
        // Load temporary note content
        this.currentNoteId = tempData.noteId;
        this.currentNoteName = tempData.noteName;
        this.currentNoteTags = tempData.noteTags;
        this.hasUnsavedChanges = true;
        
        if (this.notesEditorInstance && tempData.content) {
            this.notesEditorInstance.render(tempData.content);
        }
        
        this.updateCurrentNoteDisplay();
        this.updateNotesEditorUI();
        // Typeset restored content
        this.typesetNotesMath();
        
        // Show notification about restored content
        this.showNotesSuccess('Restored unsaved note content from this chat session');
        return;
    }
    
    // Try to load the last opened note from localStorage if no temp data
    const lastNoteId = localStorage.getItem('lastOpenedNoteId');
    if (lastNoteId) {
        this.loadNote(lastNoteId);
    } else {
        // Start with a blank note
        this.currentNoteId = null;
        this.currentNoteName = 'Untitled Note';
        this.hasUnsavedChanges = false;
        this.updateCurrentNoteDisplay();
        this.updateNotesEditorUI();
    }
}


export async function saveCurrentNote() {
    if (!this.notesEditorInstance) return;

    try {
        const noteData = await this.notesEditorInstance.save();
        
        // Show save dialog
        this.showNoteSaveDialog(noteData);
        
    } catch (error) {
        console.error('Error saving note:', error);
        this.showNotesError('Failed to save note');
    }
}


export function showNoteSaveDialog(noteData) {
    const dialogHTML = `
        <div class="note-save-modal" id="noteSaveModal">
            <div class="modal-overlay" onclick="FileViewerRedesigned.instance.closeNoteSaveDialog()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Save Note</h3>
                    <button class="modal-close" onclick="FileViewerRedesigned.instance.closeNoteSaveDialog()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Note Name:</label>
                        <input type="text" id="noteNameInput" value="${this.currentNoteName || 'Untitled Note'}" placeholder="Enter note name">
                    </div>
                    <div class="form-group">
                        <label>Tags:</label>
                        <div id="noteTagsContentModal"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="FileViewerRedesigned.instance.closeNoteSaveDialog()">Cancel</button>
                    <button class="btn-primary" onclick="FileViewerRedesigned.instance.saveNoteWithDetails()">Save</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', dialogHTML);
    
    // Store note data temporarily
    this.pendingNoteData = noteData;
// Initialize embedded tag picker with current tags (inline content, no popover)
try { this.initModalTagPicker('noteTagsContentModal', this.currentNoteTags || ''); } catch(e) { console.warn('Tag picker init failed', e); }
    
    // Focus on name input
    setTimeout(() => {
        const nameInput = document.getElementById('noteNameInput');
        if (nameInput) {
            nameInput.focus();
            nameInput.select();
        }
    }, 100);
}


export async function saveNoteWithDetails() {
    const nameInput = document.getElementById('noteNameInput');
    
    if (!nameInput || !this.pendingNoteData) return;

    const noteName = nameInput.value.trim() || 'Untitled Note';
    const tagsList = (this.getModalSelectedTagNames && this.getModalSelectedTagNames()) || [];
    
    try {
        // Create note object
        const noteObject = {
            id: this.currentNoteId || Date.now().toString(),
            name: noteName,
            tags: tagsList,
            content: this.pendingNoteData,
            createdAt: this.currentNoteId ? this.currentNoteCreatedAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Save to localStorage (could be extended to backend)
        this.saveNoteToStorage(noteObject);
        
        // Update current note info
        this.currentNoteId = noteObject.id;
        this.currentNoteName = noteObject.name;
        this.currentNoteTags = tagsList.join(', ');
        this.currentNoteCreatedAt = noteObject.createdAt;
        
        // Clear temporary storage since note is now saved
        this.hasUnsavedChanges = false;
        this.clearTempStorage();
        
        // Update display
        this.updateCurrentNoteDisplay();
        this.updateNotesEditorUI();
        
        // Close dialog
        this.closeNoteSaveDialog();
        
        // Show success message
        this.showNotesSuccess(`Note "${noteName}" saved successfully`);
        
        // Remember this as the last opened note
        localStorage.setItem('lastOpenedNoteId', noteObject.id);
        
    } catch (error) {
        console.error('Error saving note:', error);
        this.showNotesError('Failed to save note');
    }
}


export function saveNoteToStorage(noteObject) {
    // Get existing notes
    const existingNotes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
    
    // Update or add note
    const existingIndex = existingNotes.findIndex(note => note.id === noteObject.id);
    if (existingIndex >= 0) {
        existingNotes[existingIndex] = noteObject;
    } else {
        existingNotes.push(noteObject);
    }
    
    // Save back to localStorage
    localStorage.setItem('editorJSNotes', JSON.stringify(existingNotes));
}


export function openNotesList() {
    const notes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
    
    const dialogHTML = `
        <div class="notes-list-modal" id="notesListModal">
            <div class="modal-overlay" onclick="FileViewerRedesigned.instance.closeNotesListDialog()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Open Note</h3>
                    <button class="modal-close" onclick="FileViewerRedesigned.instance.closeNotesListDialog()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="notes-list">
                        ${notes.length === 0 ? '<p class="no-notes">No saved notes found.</p>' : 
                            notes.map(note => `
                                <div class="note-item" data-note-id="${note.id}">
                                    <div class="note-info">
                                        <h4>${note.name}</h4>
                                        <p class="note-meta">
                                            Updated: ${new Date(note.updatedAt).toLocaleDateString()}
                                            ${note.tags.length > 0 ? `• Tags: ${note.tags.join(', ')}` : ''}
                                        </p>
                                    </div>
                                    <div class="note-actions">
                                        <button class="btn-primary btn-sm" onclick="FileViewerRedesigned.instance.loadNoteFromList('${note.id}')">
                                            <i class="fas fa-folder-open"></i>
                                        </button>
                                        <button class="btn-danger btn-sm" onclick="FileViewerRedesigned.instance.deleteNoteFromList('${note.id}')">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" onclick="FileViewerRedesigned.instance.createNewNoteFromModal()" title="Create New Note">
                        <i class="fas fa-plus"></i> New Note
                    </button>
                    <button class="btn-secondary" onclick="FileViewerRedesigned.instance.closeNotesListDialog()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', dialogHTML);
}


export function loadNoteFromList(noteId) {
    this.loadNote(noteId);
    this.closeNotesListDialog();
}


export function createNewNoteFromModal() {
    this.closeNotesListDialog();
    this.newBlankNote();
}


export function loadNote(noteId) {
    const notes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
    const note = notes.find(n => n.id === noteId);
    
    if (!note) {
        this.showNotesError('Note not found');
        return;
    }

    // Load note content into editor
    if (this.notesEditorInstance) {
        this.notesEditorInstance.render(note.content || { blocks: [] });
        // Typeset math after rendering note
        this.typesetNotesMath();
    }
    
    // Update current note info
    this.currentNoteId = note.id;
    this.currentNoteName = note.name;
    this.currentNoteTags = note.tags.join(', ');
    this.currentNoteCreatedAt = note.createdAt;
    
    // Clear unsaved changes since we're loading a saved note
    this.hasUnsavedChanges = false;
    this.clearTempStorage();
    
    // Update display
    this.updateCurrentNoteDisplay();
    this.updateNotesEditorUI();
    
    // Remember as last opened
    localStorage.setItem('lastOpenedNoteId', noteId);
}


export function deleteNoteFromList(noteId) {
    if (!confirm('Are you sure you want to delete this note?')) return;

    // Remove from storage
    const notes = JSON.parse(localStorage.getItem('editorJSNotes') || '[]');
    const filteredNotes = notes.filter(note => note.id !== noteId);
    localStorage.setItem('editorJSNotes', JSON.stringify(filteredNotes));
    
    // Clear last opened if it was this note
    if (localStorage.getItem('lastOpenedNoteId') === noteId) {
        localStorage.removeItem('lastOpenedNoteId');
    }
    
    // Refresh the list
    this.closeNotesListDialog();
    this.openNotesList();
    
    this.showNotesSuccess('Note deleted successfully');
}


export function newBlankNote() {
    // Check if there are unsaved changes before creating new note
    if (this.hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Are you sure you want to create a new note? Unsaved changes will be lost.')) {
            return;
        }
    }
    
    if (this.notesEditorInstance) {
        this.notesEditorInstance.render({ blocks: [] });
        this.typesetNotesMath();
    }
    
    // Reset current note info
    this.currentNoteId = null;
    this.currentNoteName = 'Untitled Note';
    this.currentNoteTags = '';
    this.currentNoteCreatedAt = null;
    
    // Clear temporary storage and unsaved changes
    this.hasUnsavedChanges = false;
    this.clearTempStorage();
    
    // Update display
    this.updateCurrentNoteDisplay();
    this.updateNotesEditorUI();
}


export function closeNotesEditor() {
    // Check for unsaved changes before closing
    if (this.hasUnsavedChanges) {
        if (!confirm('You have unsaved changes in your note. Are you sure you want to close the notes editor? Changes will be preserved for this chat session.')) {
            return;
        }
        // Save current state to temporary storage before closing
        if (this.notesEditorInstance) {
            this.notesEditorInstance.save().then(data => {
                this.saveToTempStorage(data);
            }).catch(error => {
                console.error('Error saving to temp storage:', error);
            });
        }
    }
    
    this.destroyNotesEditor();
    
    // Restore the original header state
    this.restoreHeaderFromNotesMode();
    
    // Return to document view if we have a current file
    if (this.currentFile) {
        // Explicitly show PDF version when returning from notes
        this.currentView = 'pdf';
        // Reload the file to ensure proper display
        this.loadFilePreview(this.currentFile.filename);
    } else {
        // Show the document list
        this.showDocumentListInPreview();
    }
}


export function returnToDocument() {
    // Same functionality as closeNotesEditor but with clearer naming for user navigation
    this.closeNotesEditor();
}


export function restoreHeaderFromNotesMode() {
    // Restore original PDF controls HTML
    const pdfControls = document.querySelector('.pdf-controls');
    if (pdfControls && this.originalControlsHTML) {
        pdfControls.innerHTML = this.originalControlsHTML;
    }

    // Restore file type info if we have a current file
    if (this.currentFile) {
        const fileTypeLabel = document.querySelector('.file-type-label');
        if (fileTypeLabel && this.originalFileTypeLabel) {
            fileTypeLabel.textContent = this.originalFileTypeLabel;
        }

        const fileTypeIcon = document.querySelector('.file-type-info i');
        if (fileTypeIcon && this.originalFileTypeIcon) {
            fileTypeIcon.className = this.originalFileTypeIcon;
        }

        const fileNameElement = document.querySelector('.file-name-text');
        if (fileNameElement) {
            fileNameElement.textContent = this.currentFile.filename;
        }
    }
}


export function updateCurrentNoteDisplay() {
    // Update the file name in the header
    const fileNameElement = document.querySelector('.file-name-text');
    if (fileNameElement) {
        fileNameElement.textContent = this.currentNoteName || 'Untitled Note';
    }
    
    // Update tags in the inline note info
    const tagsElement = document.getElementById('noteTags');
    if (tagsElement) {
        if (this.currentNoteTags) {
            const tags = this.currentNoteTags.split(',').map(tag => tag.trim());
            tagsElement.innerHTML = tags.map(tag => `<span class="note-tag">${tag}</span>`).join('');
        } else {
            tagsElement.innerHTML = '';
        }
    }
}

// Dialog close methods

export function closeNoteSaveDialog() {
    const modal = document.getElementById('noteSaveModal');
    if (modal) {
        modal.remove();
    }
    this.pendingNoteData = null;
}


export function closeNotesListDialog() {
    const modal = document.getElementById('notesListModal');
    if (modal) {
        modal.remove();
    }
}

// Notification methods for notes

export function showNotesSuccess(message) {
    this.showToast(message, 'success');
}


export function showNotesError(message) {
    this.showToast(message, 'error');
}


export function destroyNotesEditor() {
    if (this.notesEditorInstance) {
        if (typeof this.notesEditorInstance.destroy === 'function') {
            this.notesEditorInstance.destroy();
        }
        this.notesEditorInstance = null;
    }
}

// Method to add content from chat to current note

export async function addToCurrentNote(content) {
    if (!this.notesEditorInstance) {
        this.showNotesError('No note editor is open');
        return;
    }

    try {
        // Get current editor data
        const currentData = await this.notesEditorInstance.save();

        // Derive blocks to insert from incoming content (string markdown or Editor.js data)
        let blocksToInsert = [];

        // If content is an Editor.js-like object
        if (content && typeof content === 'object') {
            if (Array.isArray(content.blocks)) {
                blocksToInsert = content.blocks;
            } else if (Array.isArray(content)) {
                blocksToInsert = content; // assume array of blocks
            }
        }

        // If content is a string (likely Markdown), convert to blocks
        if (!blocksToInsert.length && typeof content === 'string') {
            const md = content.trim();
            if (md) {
                try {
                    if (typeof window.mdToEditorJS === 'function') {
                        const out = window.mdToEditorJS(md);
                        if (out && Array.isArray(out.blocks)) {
                            blocksToInsert = out.blocks;
                        }
                    }
                } catch (e) {
                    console.warn('mdToEditorJS conversion failed, falling back to paragraph:', e);
                }
            }
        }

        // Final fallback: single paragraph with raw text
        if (!blocksToInsert.length && typeof content === 'string') {
            blocksToInsert = [{ type: 'paragraph', data: { text: content } }];
        }

        if (!blocksToInsert.length) {
            this.showNotesError('No content to add');
            return;
        }

        // Append new blocks to existing content
        currentData.blocks = (currentData.blocks || []).concat(blocksToInsert);

        // Render updated content
        await this.notesEditorInstance.render(currentData);
        // Typeset any math in the updated note
        this.typesetNotesMath();

        // Mark as having unsaved changes and save to temp storage
        this.hasUnsavedChanges = true;
        this.saveToTempStorage(currentData);
        this.updateNotesEditorUI();

        this.showNotesSuccess('Content added to note');

    } catch (error) {
        console.error('Error adding content to note:', error);
        this.showNotesError('Failed to add content to note');
    }
}

// Typeset MathJax within the notes editor container (debounced and visibility-guarded)

export function typesetNotesMath() {
    try {
        const holder = document.getElementById('notesEditorJS');
        if (!holder || holder.offsetParent === null) return; // not visible
        if (this._mathTypesetTimer) clearTimeout(this._mathTypesetTimer);
        this._mathTypesetTimer = setTimeout(() => {
            try {
                if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                    window.MathJax.typesetPromise([holder]).catch(() => {});
                } else {
                    if (!window._pendingMathEls) window._pendingMathEls = [];
                    window._pendingMathEls.push(holder);
                }
            } catch {}
        }, 120);
    } catch {}
}

// Save current note content to temporary storage within chat session

export function saveToTempStorage(noteData) {
    const chatId = window.currentChatId || 'default';
    this.tempNoteSessionKey = `tempNote_${chatId}`;
    
    const tempData = {
        noteId: this.currentNoteId,
        noteName: this.currentNoteName,
        noteTags: this.currentNoteTags,
        content: noteData,
        timestamp: new Date().toISOString(),
        hasUnsavedChanges: this.hasUnsavedChanges
    };
    
    // Store in sessionStorage (persists within tab/session but not across browser restarts)
    sessionStorage.setItem(this.tempNoteSessionKey, JSON.stringify(tempData));
    
    console.log('Saved note to temporary storage for chat:', chatId);
}

// Load note content from temporary storage

export function loadFromTempStorage() {
    const chatId = window.currentChatId || 'default';
    this.tempNoteSessionKey = `tempNote_${chatId}`;
    
    const tempData = sessionStorage.getItem(this.tempNoteSessionKey);
    if (tempData) {
        try {
            const parsed = JSON.parse(tempData);
            return parsed;
        } catch (error) {
            console.error('Error parsing temp note data:', error);
        }
    }
    return null;
}

// Clear temporary storage for current chat

export function clearTempStorage() {
    if (this.tempNoteSessionKey) {
        sessionStorage.removeItem(this.tempNoteSessionKey);
        this.hasUnsavedChanges = false;
        this.updateNotesEditorUI();
    }
}

// Update notes editor UI to show unsaved changes indicator

export function updateNotesEditorUI() {
    const noteNameElement = document.getElementById('currentNoteName');
    if (noteNameElement) {
        const baseName = this.currentNoteName || 'Untitled Note';
        noteNameElement.textContent = this.hasUnsavedChanges ? `${baseName} *` : baseName;
        
        if (this.hasUnsavedChanges) {
            noteNameElement.style.fontStyle = 'italic';
            noteNameElement.title = 'Note has unsaved changes';
        } else {
            noteNameElement.style.fontStyle = 'normal';
            noteNameElement.title = '';
        }
    }

    // Update file name in header too
    const fileNameElement = document.querySelector('.file-name-text');
    if (fileNameElement && fileNameElement.textContent.includes('Notes Editor')) {
        const baseName = this.currentNoteName || 'Untitled Note';
        fileNameElement.textContent = this.hasUnsavedChanges ? `${baseName} *` : baseName;
    }
}

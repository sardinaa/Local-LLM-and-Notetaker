// Notes editor helpers

function getCurrentChatId() {
    if (typeof window !== 'undefined' && window.currentChatId) {
        return String(window.currentChatId);
    }
    return null;
}


function getModeStorageKey() {
    const chatId = getCurrentChatId();
    return chatId ? `fileviewerMode_${chatId}` : null;
}


function getLastNoteStorageKey(chatId = getCurrentChatId()) {
    return chatId ? `lastOpenedNoteId_${chatId}` : null;
}


function getTempNoteStorageKey(chatId = getCurrentChatId()) {
    return chatId ? `tempNote_${chatId}` : null;
}


function readLastOpenedNoteId(chatId = getCurrentChatId()) {
    const storageKey = getLastNoteStorageKey(chatId);
    if (!storageKey) return null;
    try {
        return localStorage.getItem(storageKey);
    } catch (error) {
        console.warn('Failed to read last opened note id', error);
        return null;
    }
}


function rememberLastOpenedNoteId(noteId, chatId = getCurrentChatId()) {
    const storageKey = getLastNoteStorageKey(chatId);
    if (!storageKey) return;
    try {
        if (!noteId) {
            localStorage.removeItem(storageKey);
        } else {
            localStorage.setItem(storageKey, noteId);
        }
    } catch (error) {
        console.warn('Failed to persist last opened note id', error);
    }
}


function hasTempNoteForChat(chatId = getCurrentChatId()) {
    const storageKey = getTempNoteStorageKey(chatId);
    if (!storageKey) return false;
    try {
        const tempData = sessionStorage.getItem(storageKey);
        if (!tempData) return false;
        const parsed = JSON.parse(tempData);
        if (!parsed || typeof parsed !== 'object') return false;
        if (parsed.hasUnsavedChanges) return true;
        if (parsed.content && Array.isArray(parsed.content.blocks) && parsed.content.blocks.length) {
            return true;
        }
        return false;
    } catch (error) {
        console.warn('Failed to inspect temporary note storage', error);
        return false;
    }
}


function storeNotesMode(mode) {
    try {
        const key = getModeStorageKey();
        if (!key) return;
        sessionStorage.setItem(key, mode);
    } catch (error) {
        console.warn('Failed to store notes mode', error);
    }
}


function readNotesMode() {
    try {
        const key = getModeStorageKey();
        if (!key) return null;
        return sessionStorage.getItem(key);
    } catch (error) {
        console.warn('Failed to read notes mode', error);
        return null;
    }
}


export function getStoredNotesMode() {
    return readNotesMode();
}


async function renderEditorContent(editorInstance, data) {
    if (!editorInstance) return;
    const blocksApi = editorInstance.blocks;

    if (blocksApi && typeof blocksApi.render === 'function') {
        await blocksApi.render(data);
        return;
    }

    if (typeof editorInstance.render === 'function') {
        await editorInstance.render(data);
        return;
    }

    console.warn('EditorJS instance missing render capability');
}


export function hasStoredNoteForChat(chatId = getCurrentChatId()) {
    if (!chatId) return false;
    if (hasTempNoteForChat(chatId)) return true;
    const lastNoteId = readLastOpenedNoteId(chatId);
    return Boolean(lastNoteId);
}


export function openNotesEditor() {
    if (typeof this.ensureFileViewerVisibleForNotes === 'function') {
        this.ensureFileViewerVisibleForNotes();
    }

    this.currentView = 'notes';
    storeNotesMode('notes');

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
    const actionsContainer = document.querySelector('.file-viewer-actions');
    let pdfControls = document.querySelector('.pdf-controls');

    const shouldCaptureOriginal = typeof this.originalControlsHTML === 'undefined' || this.originalControlsHTML === null;

    if (!pdfControls && actionsContainer) {
        pdfControls = document.createElement('div');
        pdfControls.className = 'pdf-controls';
        const manageBtn = actionsContainer.querySelector('#manageDocumentsBtn');
        if (manageBtn) {
            actionsContainer.insertBefore(pdfControls, manageBtn);
        } else {
            actionsContainer.insertBefore(pdfControls, actionsContainer.firstChild);
        }
        this.createdNotesControlsContainer = true;
    }

    if (pdfControls) {
        if (shouldCaptureOriginal && !this.createdNotesControlsContainer) {
            this.originalControlsHTML = pdfControls.innerHTML;
        }

        if (typeof this.originalControlsHTML === 'undefined' || this.originalControlsHTML === null) {
            this.originalControlsHTML = '';
        }

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
    await this.loadDefaultNote();
        // Typeset math after initial load (if any)
        this.typesetNotesMath();
        
    } catch (error) {
        console.error('Failed to initialize notes EditorJS:', error);
        this.showNotesError('Failed to initialize notes editor');
    }
}


function generateNoteId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `note-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}


function findFirstFolderNode(nodes) {
    if (!Array.isArray(nodes)) return null;
    for (const node of nodes) {
        if (!node) continue;
        if (node.type === 'folder') {
            return node;
        }
        const fromChildren = findFirstFolderNode(node.children);
        if (fromChildren) return fromChildren;
    }
    return null;
}


function findNodeById(nodes, targetId) {
    if (!Array.isArray(nodes)) return null;
    for (const node of nodes) {
        if (!node) continue;
        if (node.id === targetId) return node;
        const match = findNodeById(node.children, targetId);
        if (match) return match;
    }
    return null;
}


function normalizeNodeId(value) {
    return value == null ? null : String(value);
}


function findNodeAncestors(nodes, targetId, ancestors = []) {
    if (!Array.isArray(nodes)) return null;
    const normalizedTarget = normalizeNodeId(targetId);
    if (normalizedTarget == null) return null;

    for (const node of nodes) {
        if (!node) continue;
        const nodeId = normalizeNodeId(node.id);
        if (nodeId === normalizedTarget) {
            return { node, ancestors };
        }
        if (node.children && node.children.length > 0) {
            const result = findNodeAncestors(node.children, normalizedTarget, ancestors.concat(node));
            if (result) {
                return result;
            }
        }
    }
    return null;
}


function ensureNoteNodeInTree(noteId, noteName, parentId, content) {
    const tree = window.noteTreeView;
    if (!tree || !Array.isArray(tree.nodes)) return;

    const normalizedId = normalizeNodeId(noteId);
    const normalizedParent = normalizeNodeId(parentId);
    if (!normalizedId) return;

    const existing = tree.findNodeById(tree.nodes, normalizedId);
    if (existing) {
        existing.name = noteName;
        if (content) existing.content = content;
        if (normalizedParent !== null) {
            existing.parentId = normalizedParent;
        }
    } else {
        const newNode = {
            id: normalizedId,
            name: noteName,
            type: 'note',
            parentId: normalizedParent,
            children: [],
            content: content || null,
        };

        if (normalizedParent) {
            const parentNode = tree.findNodeById(tree.nodes, normalizedParent);
            if (parentNode) {
                parentNode.children = Array.isArray(parentNode.children) ? parentNode.children : [];
                parentNode.children.push(newNode);
                parentNode.collapsed = false;
            } else {
                tree.nodes.push(newNode);
            }
        } else {
            tree.nodes.push(newNode);
        }
    }

    if (tree.isSearchActive && typeof tree.toggleSearch === 'function') {
        tree.toggleSearch();
    }

    if (typeof tree.render === 'function') {
        tree.render();
    }

    if (typeof tree.selectNode === 'function') {
        tree.selectNode(normalizedId);
    }
}


async function fetchTreeData() {
    try {
        const response = await fetch('/api/tree');
        if (!response.ok) {
            console.error('Failed to fetch notes tree:', response.status);
            return [];
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching notes tree:', error);
        return [];
    }
}


async function determineDefaultParentId(instance) {
    if (instance.currentNoteParentId) {
        return instance.currentNoteParentId;
    }

    if (window.noteTreeView && Array.isArray(window.noteTreeView.nodes)) {
        const folder = findFirstFolderNode(window.noteTreeView.nodes);
        if (folder && folder.id) {
            return folder.id;
        }
    }

    const treeData = await fetchTreeData();
    const folder = findFirstFolderNode(treeData);
    return folder && folder.id ? folder.id : null;
}


async function fetchNoteDetails(noteId) {
    try {
        const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`);
        if (!response.ok) {
            console.error('Failed to fetch note details:', response.status);
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching note details:', error);
        return null;
    }
}


function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


function flattenNotes(nodes, trail = []) {
    if (!Array.isArray(nodes)) return [];
    const items = [];
    for (const node of nodes) {
        if (!node) continue;
        if (node.type === 'folder') {
            items.push(...flattenNotes(node.children, trail.concat(node.name || 'Untitled Folder')));
            continue;
        }
        if (node.type === 'note') {
            items.push({
                id: node.id,
                name: node.name || 'Untitled Note',
                updatedAt: node.updated_at || node.updatedAt,
                path: trail,
            });
        }
    }
    return items;
}


export async function loadDefaultNote() {
    const chatId = getCurrentChatId();

    // Always reset to a blank state first to avoid showing stale content
    this.currentNoteId = null;
    this.currentNoteName = 'Untitled Note';
    this.currentNoteTags = '';
    this.hasUnsavedChanges = false;

    if (this.notesEditorInstance) {
        await renderEditorContent(this.notesEditorInstance, { blocks: [] });
    }

    // Without a chat context we cannot restore anything meaningful
    if (!chatId) {
        this.updateCurrentNoteDisplay();
        this.updateNotesEditorUI();
        return;
    }

    // First check for temporary storage from this chat session
    const tempData = this.loadFromTempStorage();
    if (tempData && tempData.hasUnsavedChanges) {
        await this.applyNoteFromTempData(tempData);
        return;
    }

    // Only load a stored note if this chat has an explicit note history
    if (!hasStoredNoteForChat(chatId)) {
        this.updateCurrentNoteDisplay();
        this.updateNotesEditorUI();
        return;
    }

    const lastNoteId = readLastOpenedNoteId(chatId);
    if (lastNoteId) {
        await this.loadNote(lastNoteId, { chatId });
        return;
    }

    // No stored note, keep blank
    this.updateCurrentNoteDisplay();
    this.updateNotesEditorUI();
    this.typesetNotesMath();
}


function getNoteContentOrEmpty(content) {
    if (!content || typeof content !== 'object') {
        return { blocks: [] };
    }
    if (Array.isArray(content.blocks)) {
        return content;
    }
    return { blocks: [] };
}


export async function applyNoteFromTempData(tempData) {
    const safeContent = getNoteContentOrEmpty(tempData?.content);

    this.currentNoteId = tempData?.noteId || null;
    this.currentNoteName = tempData?.noteName || 'Untitled Note';
    this.currentNoteTags = tempData?.noteTags || '';
    this.hasUnsavedChanges = Boolean(tempData?.hasUnsavedChanges);

    if (this.notesEditorInstance) {
        await renderEditorContent(this.notesEditorInstance, safeContent);
    }

    this.updateCurrentNoteDisplay();
    this.updateNotesEditorUI();
    this.typesetNotesMath();

    if (this.hasUnsavedChanges) {
        this.showNotesSuccess('Restored unsaved note content from this chat session');
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
        const isNewNote = !this.currentNoteId;
        const noteId = this.currentNoteId || generateNoteId();
        const parentId = await determineDefaultParentId(this);

        // Create note object
        const noteObject = {
            id: noteId,
            name: noteName,
            tags: tagsList,
            content: this.pendingNoteData,
            createdAt: this.currentNoteId ? this.currentNoteCreatedAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            parentId
        };

        await this.saveNoteToStorage(noteObject, { isNewNote, previousName: this.currentNoteName });

        const serverNote = await fetchNoteDetails(noteId);
        
        // Update current note info
        this.currentNoteId = noteObject.id;
        this.currentNoteName = noteObject.name;
        this.currentNoteTags = tagsList.join(', ');
        this.currentNoteCreatedAt = serverNote?.created_at || serverNote?.createdAt || noteObject.createdAt;
        this.currentNoteParentId = serverNote?.parent_id || serverNote?.parentId || parentId || null;
        
        // Clear temporary storage since note is now saved
        this.hasUnsavedChanges = false;
        this.clearTempStorage();
        
        // Update display
        this.updateCurrentNoteDisplay();
        this.updateNotesEditorUI();

    ensureNoteNodeInTree(this.currentNoteId, this.currentNoteName, this.currentNoteParentId, this.pendingNoteData);
        
        // Close dialog
        this.closeNoteSaveDialog();
        
        // Show success message
        this.showNotesSuccess(`Note "${noteName}" saved successfully`);
        
    // Remember this as the last opened note for the active chat
    rememberLastOpenedNoteId(noteObject.id);
        
        // Refresh the notes tree view to show the new note
    await this.refreshNotesTree({ selectNodeId: noteId });
        
    } catch (error) {
        console.error('Error saving note:', error);
        this.showNotesError('Failed to save note');
    }
}


export async function saveNoteToStorage(noteObject, options = {}) {
    const { isNewNote = false, previousName = null } = options;
    const payload = {
        id: noteObject.id,
        title: noteObject.name,
        content: noteObject.content,
    };

    if (isNewNote) {
        const parentId = noteObject.parentId ?? null;
        const createBody = {
            id: noteObject.id,
            name: noteObject.name,
            type: 'note',
            parentId,
        };

        const createResponse = await fetch('/api/nodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createBody),
        });

        if (!createResponse.ok) {
            throw new Error('Failed to create note node');
        }
    } else if (previousName !== null && previousName !== noteObject.name) {
        const updateResponse = await fetch(`/api/nodes/${encodeURIComponent(noteObject.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: noteObject.name }),
        });

        if (!updateResponse.ok) {
            throw new Error('Failed to rename note');
        }
    }

    const saveResponse = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!saveResponse.ok) {
        throw new Error('Failed to persist note content');
    }
}


export async function openNotesList() {
    try {
        let treeData = [];
        if (window.noteTreeView && Array.isArray(window.noteTreeView.nodes) && window.noteTreeView.nodes.length) {
            treeData = window.noteTreeView.nodes;
        } else {
            treeData = await fetchTreeData();
        }

        const notes = flattenNotes(treeData).sort((a, b) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bTime - aTime;
        });

        const listMarkup = notes.length === 0
            ? '<p class="no-notes">No saved notes found.</p>'
            : notes.map(note => {
                const updatedLabel = note.updatedAt ? new Date(note.updatedAt).toLocaleString() : 'Never saved';
                const pathLabel = note.path.length ? `${note.path.join(' / ')}` : '';
                return `
                    <div class="note-item" data-note-id="${escapeHtml(note.id)}">
                        <div class="note-info">
                            <h4>${escapeHtml(note.name)}</h4>
                            <p class="note-meta">
                                Updated: ${escapeHtml(updatedLabel)}
                                ${pathLabel ? `• ${escapeHtml(pathLabel)}` : ''}
                            </p>
                        </div>
                        <div class="note-actions">
                            <button class="btn-primary btn-sm" onclick="FileViewerRedesigned.instance.loadNoteFromList('${escapeHtml(note.id)}')">
                                <i class="fas fa-folder-open"></i>
                            </button>
                            <button class="btn-danger btn-sm" onclick="FileViewerRedesigned.instance.deleteNoteFromList('${escapeHtml(note.id)}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

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
                        <div class="notes-list">${listMarkup}</div>
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
    } catch (error) {
        console.error('Failed to open notes list:', error);
        this.showNotesError('Failed to load notes list');
    }
}


export async function loadNoteFromList(noteId) {
    const chatId = getCurrentChatId();
    await this.loadNote(noteId, { chatId });
    this.closeNotesListDialog();
}


export function createNewNoteFromModal() {
    this.closeNotesListDialog();
    this.newBlankNote();
}


export async function loadNote(noteId, options = {}) {
    const chatContext = options.chatId || getCurrentChatId();
    const startedChatId = chatContext || null;

    try {
        const note = await fetchNoteDetails(noteId);
        if (!note) {
            this.showNotesError('Note not found');
            return;
        }

        if (startedChatId && getCurrentChatId() !== startedChatId) {
            console.info('Chat changed while loading note, skipping apply');
            return;
        }

        let content = note.content;
        if (typeof content === 'string') {
            try {
                content = JSON.parse(content);
            } catch (parseError) {
                console.warn('Failed to parse note content, using empty note');
                content = { blocks: [] };
            }
        }
        if (!content || typeof content !== 'object' || !Array.isArray(content.blocks)) {
            content = { blocks: [] };
        }

        if (this.notesEditorInstance) {
            await renderEditorContent(this.notesEditorInstance, content);
            this.typesetNotesMath();
        }

        this.currentNoteId = note.id || noteId;
        this.currentNoteName = note.name || note.title || 'Untitled Note';
        const tagList = Array.isArray(note.tags) ? note.tags : [];
        this.currentNoteTags = tagList.join(', ');
        this.currentNoteCreatedAt = note.created_at || note.createdAt || null;
        this.currentNoteParentId = note.parent_id || note.parentId || this.currentNoteParentId || null;

        if (!this.currentNoteParentId) {
            let nodesSource = window.noteTreeView && Array.isArray(window.noteTreeView.nodes) ? window.noteTreeView.nodes : null;
            let treeNode = nodesSource ? findNodeById(nodesSource, this.currentNoteId) : null;
            if (!treeNode) {
                const treeData = await fetchTreeData();
                treeNode = findNodeById(treeData, this.currentNoteId);
            }
            if (treeNode && (treeNode.parent_id || treeNode.parentId)) {
                this.currentNoteParentId = treeNode.parent_id || treeNode.parentId;
            }
        }

        this.hasUnsavedChanges = false;
        if (startedChatId) {
            this.clearTempStorage(startedChatId);
        } else {
            this.clearTempStorage();
        }

        this.updateCurrentNoteDisplay();
        this.updateNotesEditorUI();

        rememberLastOpenedNoteId(this.currentNoteId, startedChatId || undefined);
    } catch (error) {
        console.error('Error loading note:', error);
        this.showNotesError('Failed to load note');
    }
}


export async function deleteNoteFromList(noteId) {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
        const response = await fetch(`/api/nodes/${encodeURIComponent(noteId)}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to delete note');
        }

        const chatId = getCurrentChatId();
        if (readLastOpenedNoteId(chatId) === noteId) {
            rememberLastOpenedNoteId(null, chatId);
        }

        this.closeNotesListDialog();
        await this.refreshNotesTree();
        await this.openNotesList();

        this.showNotesSuccess('Note deleted successfully');
    } catch (error) {
        console.error('Error deleting note:', error);
        this.showNotesError('Failed to delete note');
    }
}


export function newBlankNote() {
    // Check if there are unsaved changes before creating new note
    if (this.hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Are you sure you want to create a new note? Unsaved changes will be lost.')) {
            return;
        }
    }
    
    if (this.notesEditorInstance) {
        renderEditorContent(this.notesEditorInstance, { blocks: [] })
            .then(() => this.typesetNotesMath())
            .catch((error) => {
                console.warn('Failed to reset note editor content', error);
            });
    }
    
    // Reset current note info
    this.currentNoteId = null;
    this.currentNoteName = 'Untitled Note';
    this.currentNoteTags = '';
    this.currentNoteCreatedAt = null;
    this.currentNoteParentId = null;
    
    // Clear temporary storage and unsaved changes
    this.hasUnsavedChanges = false;
    this.clearTempStorage();
    
    // Update display
    this.updateCurrentNoteDisplay();
    this.updateNotesEditorUI();
}


export function closeNotesEditor() {
    storeNotesMode('preview');
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
    if (pdfControls) {
        if (this.createdNotesControlsContainer && pdfControls.parentElement) {
            pdfControls.parentElement.removeChild(pdfControls);
        } else if (typeof this.originalControlsHTML === 'string') {
            pdfControls.innerHTML = this.originalControlsHTML;
        }
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

    this.originalControlsHTML = null;
    this.createdNotesControlsContainer = false;
    this.originalFileTypeLabel = null;
    this.originalFileTypeIcon = null;
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
    await renderEditorContent(this.notesEditorInstance, currentData);
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
    const chatId = getCurrentChatId();
    const storageKey = getTempNoteStorageKey(chatId);
    if (!storageKey) return;
    this.tempNoteSessionKey = storageKey;
    
    const tempData = {
        noteId: this.currentNoteId,
        noteName: this.currentNoteName,
        noteTags: this.currentNoteTags,
        content: noteData,
        timestamp: new Date().toISOString(),
        hasUnsavedChanges: this.hasUnsavedChanges
    };
    
    // Store in sessionStorage (persists within tab/session but not across browser restarts)
    sessionStorage.setItem(storageKey, JSON.stringify(tempData));
    
    console.log('Saved note to temporary storage for chat:', chatId);
}

// Load note content from temporary storage

export function loadFromTempStorage() {
    const chatId = getCurrentChatId();
    const storageKey = getTempNoteStorageKey(chatId);
    if (!storageKey) return null;
    this.tempNoteSessionKey = storageKey;
    
    const tempData = sessionStorage.getItem(storageKey);
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

export function clearTempStorage(chatId = getCurrentChatId()) {
    const storageKey = chatId ? getTempNoteStorageKey(chatId) : this.tempNoteSessionKey;
    if (storageKey) {
        sessionStorage.removeItem(storageKey);
        if (this.tempNoteSessionKey === storageKey) {
            this.tempNoteSessionKey = null;
        }
    }

    if (!chatId || chatId === getCurrentChatId()) {
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

// Refresh the notes tree view to show newly created/updated notes
export async function refreshNotesTree(options = {}) {
    if (!window.noteTreeView) {
        console.warn('noteTreeView not available');
        return;
    }
    
    const { selectNodeId = null } = options;
    const normalizedTargetId = normalizeNodeId(selectNodeId);

    try {
        // Fetch the latest notes tree data from the backend
        const response = await fetch('/api/tree');
        if (!response.ok) {
            console.error('Failed to fetch notes tree:', response.status);
            return;
        }
        
        const treeData = await response.json();
        
        // Filter to only include notes and folders (exclude chats)
        const filterNotesAndFolders = (nodes) => {
            const filtered = [];
            for (const node of nodes) {
                if (node.type === 'note' || node.type === 'folder') {
                    const filteredNode = { ...node };
                    if (node.children && node.children.length > 0) {
                        filteredNode.children = filterNotesAndFolders(node.children);
                    }
                    filtered.push(filteredNode);
                }
            }
            return filtered;
        };
        
        let notesData = [];
        if (treeData && Array.isArray(treeData)) {
            notesData = filterNotesAndFolders(treeData);
        }
        
        const loaded = window.noteTreeView.load(notesData);
        if (loaded) {
            if (normalizedTargetId) {
                const pathInfo = findNodeAncestors(window.noteTreeView.nodes, normalizedTargetId);
                if (pathInfo) {
                    pathInfo.ancestors.forEach(parentNode => {
                        if (parentNode && parentNode.type === 'folder') {
                            parentNode.collapsed = false;
                        }
                    });

                    window.noteTreeView.render();
                    window.noteTreeView.selectNode(normalizedTargetId);

                    setTimeout(() => {
                        const selectedEl = document.getElementById(`tree-item-${normalizedTargetId}`);
                        if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
                            selectedEl.scrollIntoView({ block: 'nearest' });
                        }
                    }, 0);
                }
            }
            console.log('Notes tree refreshed successfully');
        }
    } catch (error) {
        console.error('Error refreshing notes tree:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('App script loaded');
    
    try {
        // Get separate tree container elements for notes, chat, and flashcards
        const noteTreeRoot = document.getElementById('note-tree');
        const chatTreeRoot = document.getElementById('chat-tree');
        const flashcardsTreeRoot = document.getElementById('flashcards-tree');
        if (!noteTreeRoot || !chatTreeRoot || !flashcardsTreeRoot) throw new Error('Tree elements not found');
        
        // Initialize separate TreeView instances
        const noteTreeView = new TreeView(noteTreeRoot);
        const chatTreeView = new TreeView(chatTreeRoot);
        const flashcardsTreeView = new TreeView(flashcardsTreeRoot);
        
        // Make tree views available globally for tab manager
        window.noteTreeView = noteTreeView;
        window.chatTreeView = chatTreeView;
        window.flashcardsTreeView = flashcardsTreeView;
        
        console.log('All TreeView instances initialized');
        
        // Initialize the editor for notes (chat and flashcards use their own interfaces)
        window.editorInstance = new NoteEditor('editorjs');
        console.log('Editor initialized');
        
        // Initialize OCR and other features
        if (window.initializeOcr) {
            window.initializeOcr(noteTreeView, window.editorInstance);
            console.log('OCR functionality initialized for notes');
        }
        
        // Initialize flashcards
        if (window.initializeFlashcards) {
            window.initializeFlashcards(flashcardsTreeView, window.editorInstance);
            console.log('Flashcards functionality initialized');
        }
        
        // Setup tab switching logic
        const notesTabBtn = document.getElementById('notesTabBtn');
        const chatTabBtn = document.getElementById('chatTabBtn');
        const flashcardsTabBtn = document.getElementById('flashcardsTabBtn');
        const notesSection = document.getElementById('notesSection');
        const chatSection = document.getElementById('chatSection');
        const flashcardsSection = document.getElementById('flashcardsSection');
        const noteTreeContainer = document.getElementById('noteTreeContainer');
        const chatTreeContainer = document.getElementById('chatTreeContainer');
        const flashcardsTreeContainer = document.getElementById('flashcardsTreeContainer');
        const notesButtons = document.getElementById('notesButtons');
        const chatButtons = document.getElementById('chatButtons');
        const flashcardsButtons = document.getElementById('flashcardsButtons');
        
        notesTabBtn.addEventListener('click', () => {
            notesTabBtn.classList.add('active');
            chatTabBtn.classList.remove('active');
            flashcardsTabBtn.classList.remove('active');
            notesSection.style.display = 'block';
            chatSection.style.display = 'none';
            flashcardsSection.style.display = 'none';
            noteTreeContainer.style.display = 'block';
            chatTreeContainer.style.display = 'none';
            flashcardsTreeContainer.style.display = 'none';
            notesButtons.style.display = 'flex';
            chatButtons.style.display = 'none';
            flashcardsButtons.style.display = 'none';
        });
        
        chatTabBtn.addEventListener('click', () => {
            chatTabBtn.classList.add('active');
            notesTabBtn.classList.remove('active');
            flashcardsTabBtn.classList.remove('active');
            notesSection.style.display = 'none';
            chatSection.style.display = 'block';
            flashcardsSection.style.display = 'none';
            noteTreeContainer.style.display = 'none';
            chatTreeContainer.style.display = 'block';
            flashcardsTreeContainer.style.display = 'none';
            notesButtons.style.display = 'none';
            chatButtons.style.display = 'flex';
            flashcardsButtons.style.display = 'none';
        });
        
        flashcardsTabBtn.addEventListener('click', () => {
            flashcardsTabBtn.classList.add('active');
            notesTabBtn.classList.remove('active');
            chatTabBtn.classList.remove('active');
            notesSection.style.display = 'none';
            chatSection.style.display = 'none';
            flashcardsSection.style.display = 'block';
            noteTreeContainer.style.display = 'none';
            chatTreeContainer.style.display = 'none';
            flashcardsTreeContainer.style.display = 'block';
            notesButtons.style.display = 'none';
            chatButtons.style.display = 'none';
            flashcardsButtons.style.display = 'flex';
        });
        
        // Helper: debounce function (unchanged)
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
        
        // Set autosave for note editor (only for notes)
        window.editorInstance.setOnChangeCallback(debounce(async () => {
            const noteId = window.editorInstance.currentNoteId;
            if (!noteId) return;
            try {
                const noteContent = await window.editorInstance.getData();
                const noteNode = noteTreeView.findNodeById(noteTreeView.nodes, noteId);
                if (noteNode) {
                    noteTreeView.updateNode(noteId, { content: noteContent });
                    saveToBackend(noteId, noteNode.name, noteContent);
                    console.log('Auto-saved note:', noteNode.name);
                }
            } catch (error) {
                console.error('Error auto-saving note:', error);
            }
        }, 1000)); // 1-second debounce
        
        // Initialize drag and drop for all trees
        const notesDragDrop = new DragDrop(noteTreeView);
        const chatDragDrop = new DragDrop(chatTreeView);
        const flashcardsDragDrop = new DragDrop(flashcardsTreeView);
        console.log('DragDrop initialized for all tree views');
        
        // Form elements for creation (shared form)
        const createForm = document.getElementById('createForm');
        const createNameInput = document.getElementById('createNameInput');
        const createType = document.getElementById('createType');
        const confirmCreate = document.getElementById('confirmCreate');
        const cancelCreate = document.getElementById('cancelCreate');
        if (!createForm || !createNameInput || !createType || !confirmCreate || !cancelCreate) {
            throw new Error('One or more form elements not found');
        }
        
        // Set up event listeners for create buttons in notes tab
        const createFolder = document.getElementById('createFolder');
        const createNote = document.getElementById('createNote');
        if (!createFolder || !createNote) throw new Error('Note create buttons not found');
        
        createFolder.onclick = () => { showCreateForm('folder', 'note'); };
        createNote.onclick = () => { showCreateForm('note', 'note'); };
        
        // Set up event listeners for create buttons in chat tab
        const createFolderChat = document.getElementById('createFolderChat');
        const createChat = document.getElementById('createChat');
        if (!createFolderChat || !createChat) throw new Error('Chat create buttons not found');
        
        createFolderChat.onclick = () => { showCreateForm('folder', 'chat'); };
        createChat.onclick = () => { showCreateForm('chat', 'chat'); };
        
        // Set up event listeners for create buttons in flashcards tab
        const createFolderFlashcards = document.getElementById('createFolderFlashcards');
        if (!createFolderFlashcards) throw new Error('Flashcards create button not found');
        
        createFolderFlashcards.onclick = () => { showCreateForm('folder', 'flashcards'); };
        // Note: We don't set up a direct create button for flashcards here since they're created from the modal
        
        // Shared create form event listeners
        confirmCreate.onclick = () => { handleCreateSubmission(); };
        cancelCreate.onclick = () => {
            createNameInput.value = '';
            createForm.style.display = 'none';
        };
        createNameInput.onkeypress = (e) => { if (e.key === 'Enter') handleCreateSubmission(); };
        
        // showCreateForm accepts a mode parameter to determine which tab we're in
        function showCreateForm(type, mode = 'note') {
            createType.value = type;
            createForm.style.display = 'block';
            createNameInput.placeholder = `Enter ${type} name...`;
            // Store the current mode as a data attribute
            createForm.dataset.mode = mode;
            setTimeout(() => { createNameInput.focus(); }, 100);
        }
        
        // Modified handleCreateSubmission to work with all tabs including flashcards
        function handleCreateSubmission() {
            const name = createNameInput.value.trim();
            const type = createType.value;
            const mode = createForm.dataset.mode || 'note';
            
            if (name) {
                // Determine current tree based on mode
                let currentTree;
                if (mode === 'note') currentTree = noteTreeView;
                else if (mode === 'chat') currentTree = chatTreeView;
                else if (mode === 'flashcards') currentTree = flashcardsTreeView;
                else currentTree = noteTreeView; // Default fallback
                
                // For hierarchical creation, use selected node if it is a folder
                const selectedId = currentTree.selectedNode;
                const parentNode = selectedId ? currentTree.findNodeById(currentTree.nodes, selectedId) : null;
                const parentId = parentNode && parentNode.type === 'folder' ? selectedId : null;
                
                try {
                    const nodeData = {
                        name: name,
                        type: type
                    };
                    
                    // Set appropriate content based on type
                    if (type === 'note') {
                        nodeData.content = { blocks: [] };
                    } else if (type === 'chat') {
                        nodeData.content = { messages: [] };
                    } else if (type === 'flashcards') {
                        nodeData.cards = [];
                    }
                    
                    const newNodeId = currentTree.addNode(nodeData, parentId);
                    console.log(`New ${type} created with ID:`, newNodeId);
                    
                    // Handle specific behavior based on mode
                    if (mode === 'note' && type === 'note') {
                        // Handle note creation
                        const node = currentTree.selectNode(newNodeId);
                        document.getElementById('note-title-display').textContent = node.name;
                        
                        // Update the active tab if available
                        if (window.tabManager) {
                            window.tabManager.updateActiveTabContent('note', newNodeId, name);
                        } else {
                            // Fall back to old behavior
                            window.editorInstance.render(node.content);
                            window.editorInstance.setCurrentNote(newNodeId);
                        }
                    } else if (mode === 'chat' && type === 'chat') {
                        // Handle chat creation
                        const node = currentTree.selectNode(newNodeId);
                        
                        // Update the active tab if available
                        if (window.tabManager) {
                            window.tabManager.updateActiveTabContent('chat', newNodeId, name);
                        } else if (window.loadChatMessages) {
                            window.loadChatMessages(newNodeId);
                        }
                    } else if (mode === 'flashcards' && type === 'flashcards') {
                        // Handle flashcards creation (typically handled through the modal)
                        const node = currentTree.selectNode(newNodeId);
                        
                        // Update the active tab if available
                        if (window.tabManager) {
                            window.tabManager.updateActiveTabContent('flashcards', newNodeId, name);
                        }
                    }
                    
                    // Save to backend based on mode
                    const endpoint = mode === 'chat' ? '/api/chats' : '/api/tree';
                    saveTreeToBackend(currentTree.nodes, endpoint);
                    
                } catch (error) {
                    console.error('Error creating new node:', error);
                }
            }
            createNameInput.value = '';
            createForm.style.display = 'none';
        }
        
        // Enhanced saveTreeToBackend with better error logging
        async function saveTreeToBackend(treeData, endpoint) {
            try {
                console.log(`Saving to ${endpoint}:`, JSON.stringify(treeData));
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(treeData)
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Failed to save to ${endpoint}:`, response.status, errorText);
                } else {
                    console.log(`Successfully saved to ${endpoint}`);
                }
            } catch (error) {
                console.error(`Error saving to ${endpoint}:`, error);
            }
        }
        
        async function saveToBackend(noteId, title, content) {
            try {
                const response = await fetch('/api/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: noteId, title, content })
                });
                if (response.ok) console.log('Note saved successfully!');
                else console.error('Failed to save note:', await response.text());
            } catch (error) {
                console.error('Error saving note:', error);
            }
        }
        
        // Load trees from backend
        async function loadFromBackend() {
            try {
                // Load notes tree
                const noteRes = await fetch('/api/tree');
                if (noteRes.ok) {
                    const notesData = await noteRes.text();
                    console.log("Loaded notes data:", notesData);
                    if (notesData && notesData.trim().length > 0) {
                        noteTreeView.load(notesData);
                    } else {
                        console.log("Empty notes data, creating sample tree");
                        createSampleNoteTree();
                    }
                } else {
                    console.error("Failed to load notes data:", noteRes.status);
                    createSampleNoteTree();
                }
            } catch (error) {
                console.error("Error loading notes data:", error);
                createSampleNoteTree();
            }
            
            try {
                // Load chats tree
                const chatRes = await fetch('/api/chats');
                if (chatRes.ok) {
                    const chatsData = await chatRes.text();
                    console.log("Loaded chats data:", chatsData);
                    if (chatsData && chatsData.trim().length > 0) {
                        chatTreeView.load(chatsData);
                        console.log("Chat tree loaded with nodes:", chatTreeView.nodes.length);
                    } else {
                        console.log("No chat data available");
                    }
                } else {
                    console.error("Failed to load chats data:", chatRes.status);
                }
            } catch (error) {
                console.error("Error loading chats data:", error);
            }
            
            try {
                // Load flashcards tree
                const flashcardsRes = await fetch('/api/flashcards');
                if (flashcardsRes.ok) {
                    const flashcardsData = await flashcardsRes.text();
                    console.log("Loaded flashcards data:", flashcardsData);
                    if (flashcardsData && flashcardsData.trim().length > 0) {
                        flashcardsTreeView.load(flashcardsData);
                        console.log("Flashcards tree loaded with nodes:", flashcardsTreeView.nodes.length);
                    } else {
                        console.log("No flashcards data available");
                    }
                } else {
                    console.error("Failed to load flashcards data:", flashcardsRes.status);
                }
            } catch (error) {
                console.error("Error loading flashcards data:", error);
            }
        }
        
        function createSampleNoteTree() {
            const rootFolderId = noteTreeView.addNode({ name: 'My Notes', type: 'folder' });
            noteTreeView.addNode({ 
                name: 'Welcome Note', 
                type: 'note',
                content: { blocks: [
                    { type: 'header', data: { text: 'Welcome to Notes Web App', level: 2 } },
                    { type: 'paragraph', data: { text: 'This is a simple web app for taking notes.' } }
                ] }
            }, rootFolderId);
        }
        
        loadFromBackend();
        
        // Note header customization remains unchanged
        function setupNoteCustomizer() {
            const noteCustomizer = document.getElementById('noteCustomizer');
            if (!noteCustomizer) return;
            noteCustomizer.addEventListener('click', () => {
                const noteHeader = document.querySelector('.note-header');
                const currentColor = window.getComputedStyle(noteHeader).backgroundColor || '#ecf0f1';
                const bgImage = noteHeader.style.backgroundImage;
                let imageUrl = null;
                if (bgImage && bgImage !== 'none') {
                    imageUrl = bgImage.replace(/url\((['"])?(.*?)\1\)/, '$2');
                }
                const modalManager = new ModalManager();
                modalManager.openBackgroundEditor(
                    { currentColor, imageUrl },
                    (result) => {
                        if (result.color) noteHeader.style.backgroundColor = result.color;
                        if (result.gridSelection && imageUrl) {
                            noteHeader.style.backgroundImage = `url(${imageUrl})`;
                        } else if (!result.gridSelection) {
                            noteHeader.style.backgroundImage = '';
                        }
                        const noteId = window.editorInstance.currentNoteId;
                        if (noteId) {
                            const noteNode = noteTreeView.findNodeById(noteTreeView.nodes, noteId);
                            if (noteNode) {
                                noteNode.customization = {
                                    backgroundColor: result.color,
                                    backgroundImage: result.gridSelection ? imageUrl : null
                                };
                                saveTreeToBackend(noteTreeView.nodes, '/api/tree');
                            }
                        }
                    },
                    () => {}
                );
            });
        }
        setupNoteCustomizer();
        
        // Setup tree item click handlers for flashcards
        if (flashcardsTreeRoot) {
            flashcardsTreeRoot.addEventListener('click', (e) => {
                // Find clicked item
                const item = e.target.closest('.tree-item');
                if (!item) return;
                
                // Get node ID
                const nodeId = item.getAttribute('data-id');
                if (!nodeId) return;
                
                // Find the node
                const node = flashcardsTreeView.findNodeById(flashcardsTreeView.nodes, nodeId);
                if (!node) return;
                
                // Handle click based on node type
                if (node.type === 'flashcards') {
                    // Start flashcard review
                    if (window.flashcardManager) {
                        window.flashcardManager.startReview(nodeId);
                    }
                    
                    // Update the active tab if available
                    if (window.tabManager) {
                        window.tabManager.getOrCreateTabForContent('flashcards', nodeId, node.name);
                    }
                }
            });
        }
        
    } catch (error) {
        console.error('Error initializing app:', error);
    }
});
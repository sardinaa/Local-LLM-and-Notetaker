class FlashcardManager {
    constructor(treeView, editorInstance) {
        this.treeView = treeView;
        this.editorInstance = editorInstance;
        this.flashcardSets = [];
        this.currentSetId = null;
        this.reviewMode = false;
        this.currentCardIndex = 0;
        this.showingAnswer = false;
        
        this.setupEventListeners();
        this.initFlashcardsContainer();
    }
    
    setupEventListeners() {
        // Create flashcard button
        const createFlashcardBtn = document.getElementById('createFlashcard');
        if (createFlashcardBtn) {
            createFlashcardBtn.addEventListener('click', () => this.showNoteSelector());
        }
        
        // Initialize review mode listeners when needed
        document.addEventListener('keydown', (event) => {
            if (!this.reviewMode) return;
            
            // Space to flip card
            if (event.code === 'Space') {
                this.flipCurrentCard();
                event.preventDefault();
            }
            
            // Arrow keys for navigation
            if (event.code === 'ArrowLeft') {
                this.previousCard();
                event.preventDefault();
            }
            
            if (event.code === 'ArrowRight') {
                this.nextCard();
                event.preventDefault();
            }
        });
    }
    
    initFlashcardsContainer() {
        const flashcardsContent = document.getElementById('flashcardsContent');
        if (!flashcardsContent) return;
        
        // Create the basic flashcard layout
        flashcardsContent.innerHTML = `
            <div class="flashcards-container">
                <div class="flashcard-viewer" style="display:none;">
                    <div class="flashcard">
                        <div class="flashcard-inner">
                            <div class="flashcard-front"></div>
                            <div class="flashcard-back"></div>
                        </div>
                    </div>
                    <div class="flashcard-controls">
                        <button class="flashcard-btn" id="prevCardBtn"><i class="fas fa-arrow-left"></i></button>
                        <button class="flashcard-btn" id="flipCardBtn"><i class="fas fa-sync-alt"></i></button>
                        <button class="flashcard-btn" id="nextCardBtn"><i class="fas fa-arrow-right"></i></button>
                        <button class="flashcard-btn" id="exitReviewBtn"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="flashcard-progress">
                        <span id="cardCounter">Card 0/0</span>
                    </div>
                </div>
                <div class="flashcards-empty-state">
                    <div class="empty-state-icon">
                        <i class="fas fa-layer-group"></i>
                    </div>
                    <h3>No Flashcards Selected</h3>
                    <p>Create a new flashcard set or select an existing one from the sidebar.</p>
                </div>
            </div>
        `;
        
        // Setup additional event listeners for the viewer
        const prevBtn = document.getElementById('prevCardBtn');
        const nextBtn = document.getElementById('nextCardBtn');
        const flipBtn = document.getElementById('flipCardBtn');
        const exitBtn = document.getElementById('exitReviewBtn');
        
        if (prevBtn) prevBtn.addEventListener('click', () => this.previousCard());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextCard());
        if (flipBtn) flipBtn.addEventListener('click', () => this.flipCurrentCard());
        if (exitBtn) exitBtn.addEventListener('click', () => this.exitReviewMode());
    }
    
    showNoteSelector() {
        const modalManager = new ModalManager();
        
        // Create the modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'note-selector-modal';
        
        modalContent.innerHTML = `
            <div class="modal-header">
                <h3>Select Notes for Flashcards</h3>
                <span class="modal-close">&times;</span>
            </div>
            <div class="modal-body">
                <div class="note-search-container">
                    <input type="text" class="note-search-input" placeholder="Search notes...">
                </div>
                <div class="notes-list-container">
                    <ul class="notes-list"></ul>
                </div>
                <div class="flashcard-options">
                    <h4>Flashcard Name</h4>
                    <input type="text" id="flashcardSetName" placeholder="Enter flashcard set name...">
                    <label class="checkbox-container">
                        <input type="checkbox" id="useOllama" checked>
                        <span class="checkmark"></span>
                        Use Ollama to generate Q&A
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn cancel">Cancel</button>
                <button class="modal-btn confirm">Create Flashcards</button>
            </div>
        `;
        
        modalManager.openCustomModal(modalContent);
        
        // Fill the notes list
        this.populateNotesList(modalContent.querySelector('.notes-list'));
        
        // Setup search functionality
        const searchInput = modalContent.querySelector('.note-search-input');
        searchInput.addEventListener('input', (e) => {
            this.filterNotesList(modalContent.querySelector('.notes-list'), e.target.value);
        });
        
        // Setup close functionality
        const closeBtn = modalContent.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modalManager.closeModal();
            });
        }
        
        // Setup cancel button
        const cancelBtn = modalContent.querySelector('.modal-btn.cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modalManager.closeModal();
            });
        }
        
        // Setup confirm button
        const confirmBtn = modalContent.querySelector('.modal-btn.confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.processSelectedNotes(
                    modalContent.querySelector('.notes-list'),
                    document.getElementById('flashcardSetName').value,
                    document.getElementById('useOllama').checked
                );
                modalManager.closeModal();
            });
        }
    }
    
    populateNotesList(listElement) {
        listElement.innerHTML = '';
        
        // Get all notes from the tree
        const notes = this.getAllNotes(this.treeView.nodes);
        
        if (notes.length === 0) {
            listElement.innerHTML = '<li class="no-notes-message">No notes found</li>';
            return;
        }
        
        notes.forEach(note => {
            const li = document.createElement('li');
            li.className = 'note-item';
            li.dataset.id = note.id;
            
            li.innerHTML = `
                <input type="checkbox" class="note-checkbox">
                <i class="fas fa-file-alt"></i>
                <span>${note.name}</span>
            `;
            
            li.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const checkbox = li.querySelector('.note-checkbox');
                checkbox.checked = !checkbox.checked;
            });
            
            listElement.appendChild(li);
        });
    }
    
    filterNotesList(listElement, searchTerm) {
        const items = listElement.querySelectorAll('.note-item');
        const normalizedSearchTerm = searchTerm.toLowerCase();
        
        items.forEach(item => {
            const noteName = item.querySelector('span').textContent.toLowerCase();
            if (noteName.includes(normalizedSearchTerm)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
        
        // Show "no results" if all items are hidden
        const visibleItems = Array.from(items).filter(item => item.style.display !== 'none');
        
        if (visibleItems.length === 0 && items.length > 0) {
            // Check if we already have the no-results message
            let noResultsMsg = listElement.querySelector('.no-notes-message');
            if (!noResultsMsg) {
                noResultsMsg = document.createElement('li');
                noResultsMsg.className = 'no-notes-message';
                noResultsMsg.textContent = 'No matching notes found';
                listElement.appendChild(noResultsMsg);
            }
        } else {
            // Remove the no-results message if there are visible items
            const noResultsMsg = listElement.querySelector('.no-notes-message');
            if (noResultsMsg) {
                listElement.removeChild(noResultsMsg);
            }
        }
    }
    
    getAllNotes(nodes) {
        let notes = [];
        
        for (const node of nodes) {
            if (node.type === 'note') {
                notes.push(node);
            } else if (node.type === 'folder' && node.children) {
                notes = notes.concat(this.getAllNotes(node.children));
            }
        }
        
        return notes;
    }
    
    async processSelectedNotes(listElement, setName, useOllama) {
        const selectedNotes = [];
        const checkboxes = listElement.querySelectorAll('.note-checkbox:checked');
        
        if (checkboxes.length === 0) {
            this.showToast('Please select at least one note', 'warning');
            return;
        }
        
        if (!setName) {
            setName = 'Flashcards ' + new Date().toLocaleDateString();
        }
        
        checkboxes.forEach(checkbox => {
            const noteId = checkbox.closest('.note-item').dataset.id;
            const noteNode = this.treeView.findNodeById(this.treeView.nodes, noteId);
            if (noteNode) {
                selectedNotes.push(noteNode);
            }
        });
        
        // Create flashcard set node in tree
        const flashcardSetId = this.createFlashcardSet(setName);
        
        // Show loading status
        this.showToast('Creating flashcards...', 'info');
        
        // Process each selected note
        const cards = [];
        for (const note of selectedNotes) {
            try {
                const noteCards = await this.createCardsFromNote(note, useOllama);
                cards.push(...noteCards);
            } catch (error) {
                console.error('Error creating cards from note:', error);
            }
        }
        
        // Update the flashcard set with the generated cards
        this.updateFlashcardSet(flashcardSetId, cards);
        
        // Save to backend
        this.saveTreeToBackend();
        
        // Show completion status
        this.showToast(`Created ${cards.length} flashcards in "${setName}"`, 'success');
    }
    
    async createCardsFromNote(note, useOllama) {
        if (!note.content || !note.content.blocks) {
            return [];
        }
        
        const cards = [];
        
        // Extract paragraphs and headers from the note content
        const contentBlocks = note.content.blocks.filter(block => 
            ['paragraph', 'header', 'list'].includes(block.type) && 
            block.data.text && block.data.text.trim().length > 0
        );
        
        if (useOllama) {
            // Use Ollama to generate flashcards
            try {
                const blocksText = contentBlocks.map(block => {
                    if (block.type === 'header') {
                        return `# ${block.data.text}`;
                    } else if (block.type === 'paragraph') {
                        return block.data.text;
                    } else if (block.type === 'list') {
                        return block.data.items.map(item => `- ${item}`).join('\n');
                    }
                    return '';
                }).join('\n\n');
                
                const generatedCards = await this.generateFlashcardsWithOllama(blocksText);
                cards.push(...generatedCards);
            } catch (error) {
                console.error('Error generating flashcards with Ollama:', error);
                
                // Fallback: Create simple cards from headers
                contentBlocks.forEach(block => {
                    if (block.type === 'header') {
                        cards.push({
                            front: block.data.text,
                            back: "Review your notes for this topic"
                        });
                    }
                });
            }
        } else {
            // Simple approach: Create cards from headers and paragraphs
            for (let i = 0; i < contentBlocks.length; i++) {
                const block = contentBlocks[i];
                
                if (block.type === 'header') {
                    // Find next paragraph to use as the back of the card
                    const nextBlock = contentBlocks[i + 1];
                    if (nextBlock && nextBlock.type === 'paragraph') {
                        cards.push({
                            front: block.data.text,
                            back: nextBlock.data.text
                        });
                        i++; // Skip the next block since we used it
                    } else {
                        cards.push({
                            front: block.data.text,
                            back: "Review your notes for this topic"
                        });
                    }
                }
            }
        }
        
        return cards;
    }
    
    async generateFlashcardsWithOllama(contentText) {
        // Send content to Ollama API to generate flashcards
        const prompt = `
            Generate 5-10 flashcards based on the following content. 
            Each flashcard should have a question or term on the front 
            and the answer or explanation on the back. Focus on key concepts 
            and important information. Format your response as a JSON array 
            with 'front' and 'back' properties for each flashcard.
            
            Content:
            ${contentText}
        `;
        
        try {
            const response = await fetch('/api/ollama', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            const data = await response.json();
            
            if (Array.isArray(data)) {
                return data;
            } else if (data.cards && Array.isArray(data.cards)) {
                return data.cards;
            } else {
                // Try to parse the response text as JSON
                try {
                    const textContent = data.response || data.text || data.content || data.result || '';
                    // Find JSON array in text
                    const jsonMatch = textContent.match(/\[(.|\n)*\]/);
                    if (jsonMatch) {
                        const parsedCards = JSON.parse(jsonMatch[0]);
                        if (Array.isArray(parsedCards)) {
                            return parsedCards;
                        }
                    }
                } catch (e) {
                    console.error("Error parsing Ollama response as JSON:", e);
                }
                
                // Fallback: create one card with the full response
                return [{
                    front: "Generated Content",
                    back: JSON.stringify(data)
                }];
            }
        } catch (error) {
            console.error('Error calling Ollama API:', error);
            throw error;
        }
    }
    
    createFlashcardSet(name) {
        // Find selected folder or default to root
        const selectedId = this.treeView.selectedNode;
        const parentNode = selectedId ? this.treeView.findNodeById(this.treeView.nodes, selectedId) : null;
        const parentId = parentNode && parentNode.type === 'folder' ? selectedId : null;
        
        // Create a new flashcard set node
        const newNodeId = this.treeView.addNode({
            name: name,
            type: 'flashcards',
            cards: []
        }, parentId);
        
        return newNodeId;
    }
    
    updateFlashcardSet(setId, cards) {
        const node = this.treeView.findNodeById(this.treeView.nodes, setId);
        if (node) {
            node.cards = cards;
        }
    }
    
    startReview(setId) {
        const node = this.treeView.findNodeById(this.treeView.nodes, setId);
        if (!node || !node.cards || node.cards.length === 0) {
            this.showToast('No flashcards found in this set', 'warning');
            return;
        }
        
        this.currentSetId = setId;
        this.currentCardIndex = 0;
        this.showingAnswer = false;
        this.reviewMode = true;
        
        // Hide empty state and show viewer
        const emptyState = document.querySelector('.flashcards-empty-state');
        const viewer = document.querySelector('.flashcard-viewer');
        
        if (emptyState) emptyState.style.display = 'none';
        if (viewer) viewer.style.display = 'block';
        
        // Update the first card
        this.updateCardDisplay();
    }
    
    exitReviewMode() {
        this.reviewMode = false;
        
        // Show empty state and hide viewer
        const emptyState = document.querySelector('.flashcards-empty-state');
        const viewer = document.querySelector('.flashcard-viewer');
        
        if (emptyState) emptyState.style.display = 'flex';
        if (viewer) viewer.style.display = 'none';
    }
    
    updateCardDisplay() {
        if (!this.currentSetId) return;
        
        const node = this.treeView.findNodeById(this.treeView.nodes, this.currentSetId);
        if (!node || !node.cards || node.cards.length === 0) return;
        
        const cards = node.cards;
        const currentCard = cards[this.currentCardIndex];
        
        // Update the flashcard content
        const frontElement = document.querySelector('.flashcard-front');
        const backElement = document.querySelector('.flashcard-back');
        const cardCounter = document.getElementById('cardCounter');
        const flashcard = document.querySelector('.flashcard');
        
        if (frontElement) frontElement.innerHTML = currentCard.front;
        if (backElement) backElement.innerHTML = currentCard.back;
        if (cardCounter) cardCounter.textContent = `Card ${this.currentCardIndex + 1}/${cards.length}`;
        
        // Reset card to front side
        if (flashcard) {
            flashcard.classList.remove('flipped');
        }
        this.showingAnswer = false;
    }
    
    flipCurrentCard() {
        const flashcard = document.querySelector('.flashcard');
        if (flashcard) {
            flashcard.classList.toggle('flipped');
            this.showingAnswer = !this.showingAnswer;
        }
    }
    
    nextCard() {
        if (!this.currentSetId) return;
        
        const node = this.treeView.findNodeById(this.treeView.nodes, this.currentSetId);
        if (!node || !node.cards || node.cards.length === 0) return;
        
        const cards = node.cards;
        
        if (this.currentCardIndex < cards.length - 1) {
            this.currentCardIndex++;
            this.updateCardDisplay();
        }
    }
    
    previousCard() {
        if (!this.currentSetId) return;
        
        if (this.currentCardIndex > 0) {
            this.currentCardIndex--;
            this.updateCardDisplay();
        }
    }
    
    showToast(message, type = 'info') {
        // Check if we have a toast container, if not create one
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            document.body.appendChild(toastContainer);
        }
        
        // Create the toast notification
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        
        // Set icon based on type
        let icon = 'info-circle';
        switch (type) {
            case 'success': icon = 'check-circle'; break;
            case 'warning': icon = 'exclamation-triangle'; break;
            case 'error': icon = 'times-circle'; break;
        }
        
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon"><i class="fas fa-${icon}"></i></div>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        // Add to container
        toastContainer.appendChild(toast);
        
        // Trigger animation after a small delay to ensure DOM update
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Remove after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300); // Wait for fade out animation
        }, 5000);
    }
    
    saveTreeToBackend() {
        fetch('/api/tree', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this.treeView.nodes)
        }).catch(error => {
            console.error('Error saving tree:', error);
        });
    }
}

// Initialize Flashcards functionality
document.addEventListener('DOMContentLoaded', () => {
    if (!window.initializeFlashcards) {
        window.initializeFlashcards = function(treeView, editorInstance) {
            window.flashcardManager = new FlashcardManager(treeView, editorInstance);
        };
    }
});

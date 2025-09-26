class DragDrop {
    constructor(treeView) {
        this.treeView = treeView;
        this.draggedItem = null;
        this.initEventListeners();
    }

    initEventListeners() {
        document.addEventListener('click', (e) => {
            this.handleClickEvent(e);
        });

        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('tree-item')) {
                this.handleDragStart(e);
            }
        });

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.target.classList.contains('tree-item') || e.target.classList.contains('tree-container')) {
                this.handleDragOver(e);
            }
        });

        document.addEventListener('dragleave', (e) => {
            if (e.target.classList.contains('tree-item') || e.target.classList.contains('tree-container')) {
                e.target.classList.remove('drag-over');
            }
        });

        document.addEventListener('drop', (e) => {
            if (e.target.classList.contains('tree-item') || e.target.classList.contains('tree-container')) {
                this.handleDrop(e);
            }
        });

        document.addEventListener('dragend', () => {
            const items = document.querySelectorAll('.tree-item, .tree-container');
            items.forEach(item => {
                item.classList.remove('drag-over');
                item.classList.remove('dragging');
            });
        });
    }

    async handleClickEvent(e) {
        const treeItem = e.target.closest('.tree-item');
        if (treeItem) {
            const nodeId = treeItem.getAttribute('data-id');
            const node = this.treeView.selectNode(nodeId);
            
            if (node) {
                // Check if this is a note tree node or chat tree node
                const isNoteMode = document.getElementById('notesTabBtn').classList.contains('active');
                
                if (isNoteMode && node.type === 'note') {
                    // Update the title display
                    document.getElementById('note-title-display').textContent = node.name;
                    
                    // If tab system is available, update the active tab content instead of creating a new one
                    if (window.tabManager) {
                        // Update the active tab with this note content
                        window.tabManager.updateActiveTabContent('note', nodeId, node.name);
                    } else {
                        // Fall back to old behavior
                        try {
                            await window.editorInstance.render(node.content);
                            window.editorInstance.setCurrentNote(nodeId);
                        } catch (error) {
                            console.error('Error rendering note content in drag drop:', error);
                        }
                    }
                } else if (!isNoteMode && node.type === 'chat') {
                    // If tab system is available, update the active tab content instead of creating a new one
                    if (window.tabManager) {
                        // Update the active tab with this chat content
                        window.tabManager.updateActiveTabContent('chat', nodeId, node.name);
                    } else {
                        // Fall back to old behavior
                        if (window.loadChatMessages) {
                            window.loadChatMessages(nodeId);
                        }
                    }
                }
            }
        }
    }

    handleDragStart(e) {
        this.draggedItem = e.target;
        e.target.classList.add('dragging');
        e.dataTransfer.setData('text/plain', e.target.getAttribute('data-id'));
        e.dataTransfer.effectAllowed = 'move';
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (e.target !== this.draggedItem) {
            e.target.classList.add('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        e.target.classList.remove('drag-over');
        
        const draggedId = e.dataTransfer.getData('text/plain');
        
        if (draggedId) {
            let targetId = null;
            
            // Check if dropping on a tree item
            if (e.target.classList.contains('tree-item')) {
                targetId = e.target.getAttribute('data-id');
                const targetNode = this.treeView.findNodeById(this.treeView.nodes, targetId);
                
                // Only allow dropping onto folders
                if (targetNode && targetNode.type === 'folder' && draggedId !== targetId) {
                    this.treeView.moveNode(draggedId, targetId);
                }
            }
            // Check if dropping on tree container (move to root)
            else if (e.target.classList.contains('tree-container')) {
                this.treeView.moveNode(draggedId, null);
            }
        }
    }
}
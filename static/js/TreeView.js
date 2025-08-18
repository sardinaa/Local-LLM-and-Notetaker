class TreeView {
    constructor(rootElement) {
        this.rootElement = rootElement;
        this.nodes = [];
        this.selectedNode = null;
        this.modalManager = new ModalManager();
        this.activeSubmenu = null; // Add tracking for active submenu
        this.filteredNodes = []; // For search functionality
        this.isSearchActive = false;
        this.isEditMode = false;
        this.selectedItems = new Set(); // For multi-select functionality
        
        // Identify which tree this instance represents to enforce icon behavior
        const elId = (rootElement && rootElement.id) ? rootElement.id : '';
        // Modes: 'notes' for note tree, 'chat' for chat tree, 'flashcards' for flashcards tree
        if (elId.includes('note-tree')) {
            this.mode = 'notes';
        } else if (elId.includes('chat-tree')) {
            this.mode = 'chat';
        } else if (elId.includes('flashcards-tree')) {
            this.mode = 'flashcards';
        } else {
            this.mode = 'generic';
        }
        
        // Initialize UI elements
        this.initializeSearchAndEditUI();
        
        // Add document-level click handler to close submenus
        document.addEventListener('click', (e) => {
            // Only close if clicking outside any submenu or options button
            if (this.activeSubmenu && 
                !e.target.closest('.options-submenu') && 
                !e.target.closest('.options-button')) {
                this.activeSubmenu.style.display = 'none';
                this.activeSubmenu = null;
            }
        });
    }

    // Initialize search and edit mode UI elements
    initializeSearchAndEditUI() {
        // Get the parent container of the tree
        const treeContainer = this.rootElement.closest('.tree-container');
        if (!treeContainer) return;
        
        // Create search container
        this.createSearchUI(treeContainer);
        
        // Create edit mode controls
        this.createEditModeUI(treeContainer);
        
        // Add search toggle button to sidebar icons
        this.addSearchToggleButton();
    }

    // Create search UI elements
    createSearchUI(container) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'tree-search-container is-hidden';
        searchContainer.innerHTML = `
            <div class="tree-search-wrapper">
                <div class="tree-search-input-container">
                    <i class="fas fa-search tree-search-icon"></i>
                    <input type="text" class="tree-search-input" placeholder="Search ${this.mode}...">
                    <button class="tree-search-clear" title="Clear search">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <button class="tree-edit-toggle-inline" title="Edit Mode">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        `;
        
        // Insert search container before the tree
        container.insertBefore(searchContainer, this.rootElement);
        
        // Store references
        this.searchContainer = searchContainer;
        this.searchInput = searchContainer.querySelector('.tree-search-input');
        this.searchClear = searchContainer.querySelector('.tree-search-clear');
        this.editToggleInline = searchContainer.querySelector('.tree-edit-toggle-inline');
        
        // Add event listeners
        this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        this.searchClear.addEventListener('click', () => this.clearSearch());
        this.editToggleInline.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.toggleEditMode();
        });
        
        // Close search on Escape key
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.toggleSearch();
            }
        });
    }

    // Create edit mode UI elements
    createEditModeUI(container) {
        const editContainer = document.createElement('div');
        editContainer.className = 'tree-edit-container is-hidden';
        editContainer.innerHTML = `
            <div class="tree-edit-toolbar">
                <button class="tree-edit-select-all" title="Select/Unselect All">
                    <i class="fas fa-square"></i>
                    <span>Select All</span>
                </button>
                <div class="tree-edit-actions">
                    <button class="tree-edit-delete" title="Delete Selected" disabled>
                        <i class="fas fa-trash"></i>
                        <span>Delete (<span class="selected-count">0</span>)</span>
                    </button>
                </div>
            </div>
        `;
        
        // Insert edit container before the tree
        container.insertBefore(editContainer, this.rootElement);
        
        // Store references
        this.editContainer = editContainer;
        this.selectAllBtn = editContainer.querySelector('.tree-edit-select-all');
        this.deleteBtn = editContainer.querySelector('.tree-edit-delete');
        this.selectedCountSpan = editContainer.querySelector('.selected-count');
        
        // Add event listeners
        this.selectAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.toggleSelectAll();
        });
        this.deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.deleteSelected();
        });
    }

    // Add search toggle button to sidebar icons
    addSearchToggleButton() {
        const sidebarContainer = this.rootElement.closest('.sidebar');
        if (!sidebarContainer) return;
        
        // Find the appropriate sidebar icons container based on mode
        let iconsContainer;
        if (this.mode === 'notes') {
            iconsContainer = sidebarContainer.querySelector('#notesButtons');
        } else if (this.mode === 'chat') {
            iconsContainer = sidebarContainer.querySelector('#chatButtons');
        } else if (this.mode === 'flashcards') {
            iconsContainer = sidebarContainer.querySelector('#flashcardsButtons');
        }
        
        if (!iconsContainer) return;
        
        // Create search toggle button
        const searchToggle = document.createElement('button');
        searchToggle.className = 'btn-icon tree-search-toggle';
        searchToggle.title = 'Search';
        searchToggle.innerHTML = '<i class="fas fa-search"></i>';
        
        // Add button to the right side of the icons container
        iconsContainer.appendChild(searchToggle);
        
        // Add event listener
        searchToggle.addEventListener('click', () => this.toggleSearch());
        
        // Store reference
        this.searchToggle = searchToggle;
    }

    // Show notification using the existing modal manager
    showNotification(options) {
        if (this.modalManager && this.modalManager.showToast) {
            this.modalManager.showToast(options);
        }
    }

    // Toggle search visibility
    toggleSearch() {
        this.isSearchActive = !this.isSearchActive;
        
        if (this.isSearchActive) {
            this.searchContainer.classList.remove('is-hidden');
            this.searchToggle.classList.add('active');
            this.searchInput.focus();
            
            // Don't deactivate edit mode when activating search
        } else {
            this.searchContainer.classList.add('is-hidden');
            this.searchToggle.classList.remove('active');
            this.clearSearch();
        }
    }

    // Handle search input
    handleSearch(query) {
        if (!query.trim()) {
            this.clearSearch();
            return;
        }
        
        this.filteredNodes = this.filterNodes(this.nodes, query.toLowerCase());
        this.renderSearchResults();
        
        // Show/hide clear button
        this.searchClear.style.display = query.length > 0 ? 'block' : 'none';
    }

    // Filter nodes based on search query
    filterNodes(nodes, query) {
        const results = [];
        
        for (const node of nodes) {
            const matches = node.name.toLowerCase().includes(query);
            const childMatches = this.filterNodes(node.children || [], query);
            
            if (matches || childMatches.length > 0) {
                results.push({
                    ...node,
                    children: childMatches,
                    _isSearchResult: matches
                });
            }
        }
        
        return results;
    }

    // Render search results
    renderSearchResults() {
        this.rootElement.innerHTML = '';
        this.renderNodes(this.filteredNodes, this.rootElement, true);
    }

    // Clear search
    clearSearch() {
        this.searchInput.value = '';
        this.searchClear.style.display = 'none';
        this.filteredNodes = [];
        this.render(); // Re-render full tree
    }

    // Toggle edit mode
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        
        if (this.isEditMode) {
            this.editContainer.classList.remove('is-hidden');
            if (this.editToggleInline) this.editToggleInline.classList.add('active');
            this.rootElement.classList.add('edit-mode');
            
            // Don't deactivate search when activating edit mode
        } else {
            this.editContainer.classList.add('is-hidden');
            if (this.editToggleInline) this.editToggleInline.classList.remove('active');
            this.rootElement.classList.remove('edit-mode');
            this.selectedItems.clear();
            this.updateEditControls();
        }
        
        this.render();
    }

    // Toggle select all/none
    toggleSelectAll() {
        const selectableNodes = this.getAllSelectableNodes();
        const allSelected = selectableNodes.every(node => this.selectedItems.has(node.id));
        
        if (allSelected) {
            // Unselect all
            this.selectedItems.clear();
            this.selectAllBtn.innerHTML = '<i class="fas fa-square"></i><span>Select All</span>';
        } else {
            // Select all
            selectableNodes.forEach(node => this.selectedItems.add(node.id));
            this.selectAllBtn.innerHTML = '<i class="fas fa-check-square"></i><span>Unselect</span>';
        }
        
        this.updateEditControls();
        this.render();
    }

    // Get all selectable nodes (excluding folders)
    getAllSelectableNodes() {
        const selectableNodes = [];
        
        const traverse = (nodes) => {
            for (const node of nodes) {
                if (node.type !== 'folder') {
                    selectableNodes.push(node);
                }
                if (node.children && node.children.length > 0) {
                    traverse(node.children);
                }
            }
        };
        
        traverse(this.nodes);
        return selectableNodes;
    }

    // Update edit mode controls
    updateEditControls() {
        const selectedCount = this.selectedItems.size;
        this.selectedCountSpan.textContent = selectedCount;
        this.deleteBtn.disabled = selectedCount === 0;
        
        if (selectedCount === 0) {
            this.deleteBtn.classList.add('disabled');
        } else {
            this.deleteBtn.classList.remove('disabled');
        }
        
        // Update select all button state
        const selectableNodes = this.getAllSelectableNodes();
        const allSelected = selectableNodes.length > 0 && selectableNodes.every(node => this.selectedItems.has(node.id));
        
        if (allSelected) {
            this.selectAllBtn.innerHTML = '<i class="fas fa-check-square"></i><span>Unselect</span>';
        } else {
            this.selectAllBtn.innerHTML = '<i class="fas fa-square"></i><span>Select All</span>';
        }
    }

    // Delete selected items
    async deleteSelected() {
        if (this.selectedItems.size === 0) return;
        
        const itemWord = this.selectedItems.size === 1 ? 'item' : 'items';
        const confirmed = await this.modalManager.showConfirmationDialog({
            title: `Delete ${this.selectedItems.size} ${itemWord}`,
            message: `Are you sure you want to delete ${this.selectedItems.size} selected ${itemWord}? This cannot be undone.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            isDelete: true
        });
        
        if (confirmed) {
            // Delete each selected item
            const selectedIds = Array.from(this.selectedItems);
            for (const nodeId of selectedIds) {
                await this.deleteNodeFromBackend(nodeId);
            }
            
            // Remove from local tree
            selectedIds.forEach(nodeId => {
                this.removeNodeFromTree(nodeId);
            });
            
            // Clear selection and update UI
            this.selectedItems.clear();
            this.updateEditControls();
            this.render();
        }
    }

    // Remove node from local tree structure
    removeNodeFromTree(nodeId) {
        const removeFromArray = (nodes) => {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].id === nodeId) {
                    nodes.splice(i, 1);
                    return true;
                }
                if (nodes[i].children && nodes[i].children.length > 0) {
                    if (removeFromArray(nodes[i].children)) return true;
                }
            }
            return false;
        };
        
        return removeFromArray(this.nodes);
    }

    // Handle item selection in edit mode
    toggleItemSelection(nodeId) {
        if (this.selectedItems.has(nodeId)) {
            this.selectedItems.delete(nodeId);
        } else {
            this.selectedItems.add(nodeId);
        }
        
        this.updateEditControls();
        this.render();
    }

    // Add a new node to the tree
    async addNode(node, parentId = null) {
        console.log("TreeView.js loaded");
        const newNode = {
            id: Date.now().toString(),
            name: node.name,
            type: node.type, // 'folder', 'note' or new 'chat'
            content: node.type === 'note' ? (node.content || { blocks: [] }) :
                     node.type === 'chat' ? (node.content || { messages: [] }) :
                     null,
            parentId: parentId,
            children: [],
            // Set collapsed state for folder nodes
            collapsed: node.type === 'folder' ? false : undefined
        };
        
        // Add to local tree first for immediate UI feedback
        if (parentId === null) {
            this.nodes.push(newNode);
        } else {
            const parent = this.findNodeById(this.nodes, parentId);
            if (parent) {
                parent.children.push(newNode);
            }
        }
        
        // Render immediately for better UX
        this.render();
        
        // Save to backend - if it fails, we could show an error but keep the node
        try {
            const success = await this.saveNodeToBackend(newNode);
            if (!success) {
                console.error('Failed to save node to backend, but keeping in local tree');
                // Optionally, you could remove the node from local tree here
                // or show a "retry" option to the user
            }
        } catch (error) {
            console.error('Error saving node to backend:', error);
        }
        
        return newNode.id;
    }

    // Save a single node to backend
    async saveNodeToBackend(node) {
        // Show saving notification (skip for chat types)
        if (node.type !== 'chat') {
            this.showNotification({
                message: `Creating ${node.type}...`,
                type: 'progress',
                icon: 'plus-circle',
                duration: 2000
            });
        }

        try {
            const response = await fetch('/api/nodes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: node.id,
                    name: node.name,
                    type: node.type,
                    parentId: node.parentId,
                    customization: node.customization
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Node saved successfully:', result);
                // Show success notification (skip for chat types)
                if (node.type !== 'chat') {
                    this.showNotification({
                        message: `${node.type.charAt(0).toUpperCase() + node.type.slice(1)} created successfully`,
                        type: 'success',
                        duration: 2000
                    });
                }
                return true;
            } else {
                console.error('Failed to save node:', await response.text());
                // Show error notification (skip for chat types)
                if (node.type !== 'chat') {
                    this.showNotification({
                        message: `Failed to create ${node.type}`,
                        type: 'error',
                        duration: 3000
                    });
                }
                return false;
            }
        } catch (error) {
            console.error('Error saving node:', error);
            // Show error notification (skip for chat types)
            if (node.type !== 'chat') {
                this.showNotification({
                    message: `Error creating ${node.type}`,
                    type: 'error',
                    duration: 3000
                });
            }
            return false;
        }
    }

    // Delete a node from backend
    async deleteNodeFromBackend(nodeId) {
        // Show deleting notification
        this.showNotification({
            message: 'Deleting item...',
            type: 'progress',
            icon: 'trash',
            duration: 2000
        });

        try {
            const response = await fetch(`/api/nodes/${nodeId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Node deleted successfully:', result);
                this.showNotification({
                    message: 'Item deleted successfully',
                    type: 'success',
                    duration: 2000
                });
                return true;
            } else {
                console.error('Failed to delete node:', await response.text());
                this.showNotification({
                    message: 'Failed to delete item',
                    type: 'error',
                    duration: 3000
                });
                return false;
            }
        } catch (error) {
            console.error('Error deleting node:', error);
            this.showNotification({
                message: 'Error deleting item',
                type: 'error',
                duration: 3000
            });
            return false;
        }
    }

    // Update a node in backend
    async updateNodeInBackend(nodeId, data) {
        // Show updating notification
        this.showNotification({
            message: 'Updating item...',
            type: 'progress',
            icon: 'sync-alt',
            duration: 2000
        });

        try {
            const response = await fetch(`/api/nodes/${nodeId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Node updated successfully:', result);
                this.showNotification({
                    message: 'Item updated successfully',
                    type: 'success',
                    duration: 2000
                });
                return true;
            } else {
                console.error('Failed to update node:', await response.text());
                this.showNotification({
                    message: 'Failed to update item',
                    type: 'error',
                    duration: 3000
                });
                return false;
            }
        } catch (error) {
            console.error('Error updating node:', error);
            this.showNotification({
                message: 'Error updating item',
                type: 'error',
                duration: 3000
            });
            return false;
        }
    }

    // Find a node by its ID
    findNodeById(nodes, id) {
        for (const node of nodes) {
            if (node.id === id) {
                return node;
            }
            if (node.children.length > 0) {
                const found = this.findNodeById(node.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    // Remove a node by its ID
    removeNode(id) {
        // Delete from backend first
        this.deleteNodeFromBackend(id)
            .then(success => {
                if (success) {
                    // Only remove from local tree if backend deletion was successful
                    const removeFromArray = (nodes) => {
                        for (let i = 0; i < nodes.length; i++) {
                            if (nodes[i].id === id) {
                                nodes.splice(i, 1);
                                return true;
                            }
                            if (nodes[i].children.length > 0) {
                                if (removeFromArray(nodes[i].children)) return true;
                            }
                        }
                        return false;
                    };
                    
                    removeFromArray(this.nodes);
                    this.render();
                } else {
                    console.error('Failed to delete node from backend');
                }
            })
            .catch(error => {
                console.error('Error deleting node from backend:', error);
            });
    }

    // Update a node
    updateNode(id, data) {
        const node = this.findNodeById(this.nodes, id);
        if (node) {
            // Update backend first
            this.updateNodeInBackend(id, data)
                .then(success => {
                    if (success) {
                        // Only update local tree if backend update was successful
                        if (data.name) node.name = data.name;
                        if (data.content) node.content = data.content;
                        if (data.customization) node.customization = data.customization;
                        this.render();
                    } else {
                        console.error('Failed to update node in backend');
                    }
                })
                .catch(error => {
                    console.error('Error updating node in backend:', error);
                });
        }
    }

    // Move a node to a new parent
    moveNode(nodeId, newParentId) {
        const node = this.findNodeById(this.nodes, nodeId);
        if (!node) return false;
        
        // Show moving notification
        this.showNotification({
            message: 'Moving item...',
            type: 'progress',
            icon: 'arrows-alt',
            duration: 2000
        });
        
        // Call API to move node on backend
        fetch(`/api/nodes/${nodeId}/move`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                parentId: newParentId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                this.showNotification({
                    message: 'Item moved successfully',
                    type: 'success',
                    duration: 2000
                });
                
                // Remove from current parent
                const oldParentId = node.parentId;
                if (oldParentId === null) {
                    const index = this.nodes.findIndex(n => n.id === nodeId);
                    if (index !== -1) this.nodes.splice(index, 1);
                } else {
                    const oldParent = this.findNodeById(this.nodes, oldParentId);
                    if (oldParent) {
                        const index = oldParent.children.findIndex(n => n.id === nodeId);
                        if (index !== -1) oldParent.children.splice(index, 1);
                    }
                }
                
                // Add to new parent
                if (newParentId === null) {
                    node.parentId = null;
                    this.nodes.push(node);
                } else {
                    const newParent = this.findNodeById(this.nodes, newParentId);
                    if (newParent && newParent.type === 'folder') {
                        node.parentId = newParentId;
                        newParent.children.push(node);
                    }
                }
                
                this.render();
            } else {
                console.error('Failed to move node:', data.message);
                this.showNotification({
                    message: 'Failed to move item',
                    type: 'error',
                    duration: 3000
                });
            }
        })
        .catch(error => {
            console.error('Error moving node:', error);
            this.showNotification({
                message: 'Error moving item',
                type: 'error',
                duration: 3000
            });
        });
        
        return true;
    }

    // Select a node
    selectNode(id) {
        if (this.selectedNode) {
            const oldSelected = document.getElementById(`tree-item-${this.selectedNode}`);
            if (oldSelected) oldSelected.classList.remove('selected');
        }
        
        this.selectedNode = id;
        
        if (id) {
            const newSelected = document.getElementById(`tree-item-${id}`);
            if (newSelected) newSelected.classList.add('selected');
            
            // Get the selected node data
            const nodeData = this.findNodeById(this.nodes, id);
            
            // Do not dispatch events here to avoid duplicate handlers when
            // callers (like renderNodes or external code) already dispatch.
            
            // Return the selected node data
            return nodeData;
        }
        return null;
    }

    // Render the tree
    render() {
        this.rootElement.innerHTML = '';
        this.renderNodes(this.nodes, this.rootElement);
        
        // After rendering, update RAG icons if RAG manager is available
        setTimeout(() => {
            if (window.ragManager && typeof window.ragManager.checkAllChatsForRAG === 'function') {
                window.ragManager.checkAllChatsForRAG();
            }
        }, 100);
    }

    // Render a list of nodes
    renderNodes(nodes, parent, isSearchResult = false) {
        nodes.forEach(node => {
            const li = document.createElement('li');
            const div = document.createElement('div');
            div.className = 'tree-item';
            div.id = `tree-item-${node.id}`;
            div.setAttribute('draggable', 'true');
            div.setAttribute('data-id', node.id);
            div.style.position = 'relative'; // for submenu positioning
            
            // Add search result highlighting
            if (isSearchResult && node._isSearchResult) {
                div.classList.add('search-highlight');
            }
            
            // Add edit mode checkbox for non-folder items
            if (this.isEditMode && node.type !== 'folder') {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'tree-item-checkbox';
                checkbox.checked = this.selectedItems.has(node.id);
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.toggleItemSelection(node.id);
                });
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
                div.appendChild(checkbox);
            }
            
            // For folders, attach toggle on click
            if (node.type === 'folder') {
                div.addEventListener('click', (e) => {
                    // Don't toggle if in edit mode or clicking checkbox
                    if (this.isEditMode || e.target.type === 'checkbox') return;
                    
                    node.collapsed = !node.collapsed;
                    this.render();
                    e.stopPropagation();
                });
            } else if (node.type === 'note' || node.type === 'chat') {
                // For notes and chats, trigger selection and notify parent
                div.addEventListener('click', (e) => {
                    // Don't select if clicking on options button, submenu, or checkbox
                    if (e.target.classList.contains('options-button') || 
                        e.target.closest('.options-submenu') ||
                        e.target.type === 'checkbox') {
                        return;
                    }
                    
                    // In edit mode, toggle selection instead of opening
                    if (this.isEditMode && node.type !== 'folder') {
                        e.stopPropagation();
                        e.preventDefault();
                        this.toggleItemSelection(node.id);
                        return;
                    }
                    
                    this.selectNode(node.id);
                    
                    // Trigger custom event for note/chat selection
                    const event = new CustomEvent('nodeSelected', {
                        detail: {
                            nodeId: node.id,
                            nodeType: node.type,
                            nodeName: node.name
                        }
                    });
                    this.rootElement.dispatchEvent(event);
                    
                    e.stopPropagation();
                });
            }
            
            // Update icon based on node type and tree mode; allow custom emoji icon
            if (node.customIcon) {
                const emoji = document.createElement('span');
                emoji.className = 'emoji-icon';
                emoji.textContent = node.customIcon;
                div.appendChild(emoji);
            } else {
                const icon = document.createElement('i');
                if (node.type === 'folder') {
                    icon.className = node.collapsed ? 'fas fa-folder' : 'fas fa-folder-open';
                } else if (node.type === 'note') {
                    icon.className = 'fas fa-file-alt';
                } else if (node.type === 'chat') {
                    icon.className = 'fas fa-comments';
                } else {
                    if (this.mode === 'notes') {
                        icon.className = 'fas fa-file-alt';
                    } else if (this.mode === 'chat') {
                        icon.className = 'fas fa-comments';
                    } else {
                        icon.className = 'fas fa-file-alt';
                    }
                }
                div.appendChild(icon);
            }
            
            const span = document.createElement('span');
            span.textContent = node.name;
            div.appendChild(span);
            
            // Check for text overflow after adding to DOM
            setTimeout(() => {
                if (span.scrollWidth > span.clientWidth) {
                    span.classList.add('overflow-text');
                }
            }, 0);
            
            // Append options button (three dots) - only show in non-edit mode
            if (!this.isEditMode) {
                const optionsBtn = document.createElement('span');
                optionsBtn.className = 'options-button';
                optionsBtn.innerHTML = '&bull;&bull;&bull;'; // horizontal dots
                div.appendChild(optionsBtn);
                
                // Create submenu for options: Rename and Delete
                const submenu = document.createElement('div');
                submenu.className = 'options-submenu';
                submenu.style.display = 'none';
                submenu.innerHTML = '<div class="submenu-item" data-action="rename">Rename</div><div class="submenu-item" data-action="delete">Delete</div>';
                div.appendChild(submenu);
                
                // Toggle submenu on options button click with improved event handling
                optionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close other open menus first
                    if (this.activeSubmenu && this.activeSubmenu !== submenu) {
                        this.activeSubmenu.style.display = 'none';
                    }
                    
                    // Toggle current submenu
                    const isCurrentlyOpen = submenu.style.display === 'block';
                    submenu.style.display = isCurrentlyOpen ? 'none' : 'block';
                    
                    // Update active submenu reference
                    this.activeSubmenu = isCurrentlyOpen ? null : submenu;
                });
                
                // Handle submenu options with modals
                submenu.querySelectorAll('.submenu-item').forEach(item => {
                    item.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const action = e.target.getAttribute('data-action');
                        
                        if (action === 'delete') {
                            const itemType = node.type === 'folder' ? 'folder' : 'note';
                            const confirmed = await this.modalManager.showConfirmationDialog({
                                title: `Delete ${itemType}`,
                                message: `Are you sure you want to delete "${node.name}"? This cannot be undone.`,
                                confirmText: 'Delete',
                                cancelText: 'Cancel',
                                isDelete: true
                            });
                            
                            if (confirmed) {
                                this.removeNode(node.id);
                            }
                        } else if (action === 'rename') {
                            const itemType = node.type === 'folder' ? 'folder' : 'note';
                            const newName = await this.modalManager.showInputDialog({
                                title: `Rename ${itemType}`,
                                initialValue: node.name,
                                confirmText: 'Rename',
                                cancelText: 'Cancel',
                                icon: 'edit'
                            });
                            
                            if (newName) {
                                this.updateNode(node.id, { name: newName });
                            }
                        }
                        submenu.style.display = 'none';
                        this.activeSubmenu = null;
                    });
                });
            }
            
            li.appendChild(div);
            // Render children only if folder is not collapsed or for notes
            if (node.children.length > 0 && (node.type !== 'folder' || (node.type === 'folder' && !node.collapsed))) {
                const ul = document.createElement('ul');
                li.appendChild(ul);
                this.renderNodes(node.children, ul, isSearchResult);
            }
            parent.appendChild(li);
        });
    }
    
    // Save tree data
    save() {
        return JSON.stringify(this.nodes);
    }
    
    // Load tree data with better error handling
    load(jsonData) {
        try {
            if (!jsonData) {
                console.warn('Empty tree data provided');
                this.nodes = [];
                this.render();
                return false;
            }
            
            let parsedData;
            
            // Handle both JSON string and already parsed array
            if (typeof jsonData === 'string') {
                if (jsonData.trim() === '') {
                    console.warn('Empty tree data string provided');
                    this.nodes = [];
                    this.render();
                    return false;
                }
                parsedData = JSON.parse(jsonData);
            } else {
                parsedData = jsonData;
            }
            
            console.log('Parsed tree data:', parsedData);
            
            if (!Array.isArray(parsedData)) {
                console.error('Tree data is not an array:', parsedData);
                return false;
            }
            
            // Collapse all folder nodes by default
            const collapseAllFolders = (nodes) => {
                nodes.forEach(node => {
                    if (node.type === 'folder') {
                        node.collapsed = true;
                    }
                    if (node.children && node.children.length > 0) {
                        collapseAllFolders(node.children);
                    }
                });
            };
            collapseAllFolders(parsedData);
            
            this.nodes = parsedData;
            this.render();
            return true;
        } catch (error) {
            console.error('Failed to load tree data:', error);
            console.error('Raw data was:', jsonData);
            return false;
        }
    }
}

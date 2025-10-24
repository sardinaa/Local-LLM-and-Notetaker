function getOptionsMenuApi() {
    if (typeof window !== 'undefined' && window.OptionsMenu && typeof window.OptionsMenu.create === 'function') {
        return window.OptionsMenu;
    }
    if (typeof globalThis !== 'undefined' && globalThis.OptionsMenu && typeof globalThis.OptionsMenu.create === 'function') {
        return globalThis.OptionsMenu;
    }
    return null;
}

class TreeView {
    constructor(rootElement) {
        this.rootElement = rootElement;
        this.nodes = [];
        this.selectedNode = null;
        this.modalManager = new ModalManager();
        this.filteredNodes = []; // For search functionality
        this.isSearchActive = false;
        this.isEditMode = false;
        this.selectedItems = new Set(); // For multi-select functionality
        
        // Identify which tree this instance represents to enforce icon behavior
        const elId = (rootElement && rootElement.id) ? rootElement.id : '';
        // Modes: 'notes' for note tree, 'chat' for chat tree
        if (elId.includes('note-tree')) {
            this.mode = 'notes';
        } else if (elId.includes('chat-tree')) {
            this.mode = 'chat';
        } else {
            this.mode = 'generic';
        }
        
        // Initialize UI elements
        this.initializeSearchAndEditUI();
        
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
        
        // Insert search container below the buttons inside the notes icons container when in notes mode
        if (this.mode === 'notes') {
            const sidebar = this.rootElement.closest('.sidebar');
            const notesButtons = sidebar ? sidebar.querySelector('#notesButtons') : null;
            if (notesButtons) {
                notesButtons.appendChild(searchContainer);
            } else {
                container.insertBefore(searchContainer, this.rootElement);
            }
        } else {
            // Default: before the tree
            container.insertBefore(searchContainer, this.rootElement);
        }
        
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
        
        // Insert edit container after the search container
        if (this.mode === 'notes') {
            const sidebar = this.rootElement.closest('.sidebar');
            const notesButtons = sidebar ? sidebar.querySelector('#notesButtons') : null;
            if (notesButtons) {
                notesButtons.appendChild(editContainer);
            } else {
                container.insertBefore(editContainer, this.rootElement);
            }
        } else {
            // Default: before the tree
            container.insertBefore(editContainer, this.rootElement);
        }
        
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
        }
        
        if (!iconsContainer) return;
        
        // Create search toggle button
        const searchToggle = document.createElement('button');
        searchToggle.className = 'btn-icon tree-search-toggle';
        searchToggle.title = 'Search';
        searchToggle.innerHTML = '<i class="fas fa-search"></i>';
        
        // Place toggle with other primary buttons inside the actions row if present
        const notesActionsRow = iconsContainer.querySelector('.notes-actions-row');
        const chatActionsRow = iconsContainer.querySelector('.chat-actions-row');
        
        let buttonToStore = searchToggle; // Keep reference to the button we'll store
        
        if (notesActionsRow) {
            const notesButton = searchToggle.cloneNode(true);
            notesButton.addEventListener('click', () => this.toggleSearch());
            notesActionsRow.appendChild(notesButton);
            buttonToStore = notesButton; // Store the first added button
        }
        
        if (chatActionsRow) {
            const chatButton = searchToggle.cloneNode(true);
            chatButton.addEventListener('click', () => this.toggleSearch());
            chatActionsRow.appendChild(chatButton);
            if (!notesActionsRow) buttonToStore = chatButton; // Store if no notes button
        }
        
        // If neither action row exists, append to the main container
        if (!notesActionsRow && !chatActionsRow) {
            searchToggle.addEventListener('click', () => this.toggleSearch());
            iconsContainer.appendChild(searchToggle);
            buttonToStore = searchToggle;
        }
        
        // Store reference to one of the buttons for state management
        this.searchToggle = buttonToStore;
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
            // Update all search toggle buttons to active state
            this.updateSearchToggleButtons(true);
            this.searchInput.focus();
            // Ensure create form is closed when search opens (notes only)
            if (this.mode === 'notes') {
                const createForm = document.getElementById('createForm');
                if (createForm) {
                    if (window.ui && typeof window.ui.hide === 'function') {
                        window.ui.hide(createForm);
                    } else {
                        createForm.classList.add('is-hidden');
                        createForm.style.removeProperty('display');
                    }
                }
            }
            
            // Don't deactivate edit mode when activating search
        } else {
            this.searchContainer.classList.add('is-hidden');
            // Update all search toggle buttons to inactive state
            this.updateSearchToggleButtons(false);
            this.clearSearch();
        }
    }
    
    // Update all search toggle buttons state
    updateSearchToggleButtons(isActive) {
        const sidebarContainer = this.rootElement.closest('.sidebar');
        if (!sidebarContainer) return;
        
        // Find all search toggle buttons in the sidebar
        const searchButtons = sidebarContainer.querySelectorAll('.tree-search-toggle');
        searchButtons.forEach(button => {
            if (isActive) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
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
        const menuApi = getOptionsMenuApi();
        if (menuApi && typeof menuApi.closeActive === 'function') {
            menuApi.closeActive();
        }
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
        const menuApi = getOptionsMenuApi();
        if (menuApi && typeof menuApi.closeActive === 'function') {
            menuApi.closeActive();
        }
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
            id: node.id || Date.now().toString(), // Use provided ID if available, otherwise generate
            name: node.name,
            type: node.type, // 'folder', 'note' or new 'chat'
            content: node.type === 'note' ? (node.content || { blocks: [] }) :
                     node.type === 'chat' ? (node.content || { messages: [] }) :
                     null,
            parentId: parentId,
            customization: node.customization ? { ...node.customization } : null,
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
        // Check if we're deleting the currently active chat
        const node = this.findNodeById(this.nodes, nodeId);
        const isCurrentChat = node && node.type === 'chat' && window.currentChatId === nodeId;
        
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
                
                // If we deleted the currently active chat, redirect to welcome screen
                if (isCurrentChat && window.resetChatState) {
                    console.log('Redirecting to welcome screen after deleting active chat');
                    window.resetChatState();
                    
                    // Also update the URL to reflect no chat is selected
                    if (window.history && window.history.pushState) {
                        window.history.pushState({}, '', '/');
                    }
                }
                
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
            // Merge customization with existing to avoid overwriting sibling fields
            let payload = data || {};
            if (payload && Object.prototype.hasOwnProperty.call(payload, 'customization')) {
                const node = this.findNodeById(this.nodes, nodeId);
                const existing = (node && node.customization) ? node.customization : {};
                payload = { ...payload, customization: { ...existing, ...payload.customization } };
            }
            const response = await fetch(`/api/nodes/${nodeId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
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

    // Show icon color picker modal for folders
    showIconColorPicker(node, currentColor) {
        const colors = [
            { name: 'Blue', value: '#3b82f6' },
            { name: 'Red', value: '#ef4444' },
            { name: 'Green', value: '#10b981' },
            { name: 'Yellow', value: '#f59e0b' },
            { name: 'Purple', value: '#8b5cf6' },
            { name: 'Pink', value: '#ec4899' },
            { name: 'Indigo', value: '#6366f1' },
            { name: 'Teal', value: '#14b8a6' },
            { name: 'Orange', value: '#f97316' },
            { name: 'Gray', value: '#6b7280' },
            { name: 'Cyan', value: '#06b6d4' },
            { name: 'Lime', value: '#84cc16' }
        ];

        // Get custom colors from localStorage (max 11)
        const savedCustomColors = JSON.parse(localStorage.getItem('iconCustomColors') || '[]').slice(0, 11);
        
        // Generate preset color options
        const colorOptions = colors.map(color => {
            const isSelected = color.value === currentColor;
            return `
                <button type="button" 
                    class="icon-color-option${isSelected ? ' is-selected' : ''}" 
                    data-color="${color.value}"
                    style="background: ${color.value};"
                    title="${color.name}">
                    ${isSelected ? '<i class="fas fa-check"></i>' : ''}
                </button>
            `;
        }).join('');

        // Check if current color is in preset or custom list
        const isPresetColor = colors.some(c => c.value === currentColor);
        const isInCustomList = savedCustomColors.includes(currentColor);

        // Generate custom color slots (11 max)
        let customColorOptions = '';
        for (let i = 0; i < 11; i++) {
            const customColor = savedCustomColors[i];
            if (customColor) {
                const isSelected = customColor === currentColor;
                customColorOptions += `
                    <button type="button" 
                        class="icon-color-option icon-color-custom-slot${isSelected ? ' is-selected' : ''}" 
                        data-color="${customColor}"
                        data-slot="${i}"
                        style="background: ${customColor};"
                        title="Custom Color ${i + 1}">
                        ${isSelected ? '<i class="fas fa-check"></i>' : ''}
                    </button>
                `;
            } else {
                // Empty slot
                customColorOptions += `
                    <button type="button" 
                        class="icon-color-option icon-color-empty-slot" 
                        data-slot="${i}"
                        title="Empty Slot"
                        disabled>
                    </button>
                `;
            }
        }

        // Plus button (always last, 12th position in second row)
        const plusButton = `
            <button type="button" 
                class="icon-color-option icon-color-custom-add" 
                title="Add Custom Color">
                <i class="fas fa-plus"></i>
            </button>
        `;

        const html = `
            <div class="icon-color-picker">
                <div class="icon-color-preview">
                    <i class="fas fa-folder" style="color: ${currentColor}; font-size: 2rem;"></i>
                    <span>Preview</span>
                </div>
                <div class="icon-color-grid">
                    ${colorOptions}
                    ${customColorOptions}
                    ${plusButton}
                </div>
                <input type="color" id="iconColorInput" style="display: none;" value="${currentColor}" />
            </div>
        `;

        this.modalManager.showDialog('Choose Folder Icon Color', html, [
            {
                label: 'Cancel',
                close: true
            },
            {
                label: 'Reset',
                close: false,
                action: async () => {
                    await this.updateNode(node.id, { 
                        customization: { iconColor: null } 
                    });
                    this.modalManager.closeModal();
                }
            },
            {
                label: 'Apply',
                primary: true,
                close: false,
                action: async () => {
                    const selectedBtn = document.querySelector('.icon-color-option.is-selected');
                    const selectedColor = selectedBtn?.dataset.color || currentColor;
                    await this.updateNode(node.id, { 
                        customization: { iconColor: selectedColor } 
                    });
                    this.modalManager.closeModal();
                }
            }
        ]);

        // Add event listeners for color selection
        setTimeout(() => {
            const previewIcon = document.querySelector('.icon-color-preview i');
            const presetButtons = document.querySelectorAll('.icon-color-option:not(.icon-color-custom-slot):not(.icon-color-custom-add):not(.icon-color-empty-slot)');
            const customSlotButtons = document.querySelectorAll('.icon-color-custom-slot');
            const addButton = document.querySelector('.icon-color-custom-add');
            const colorInput = document.getElementById('iconColorInput');
            
            // Handle preset color buttons
            presetButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    const color = button.dataset.color;
                    
                    // Update selection state
                    document.querySelectorAll('.icon-color-option').forEach(btn => {
                        btn.classList.remove('is-selected');
                        btn.innerHTML = btn.querySelector('i')?.outerHTML || '';
                    });
                    button.classList.add('is-selected');
                    button.innerHTML = '<i class="fas fa-check"></i>';
                    
                    // Update preview
                    if (previewIcon) {
                        previewIcon.style.color = color;
                    }
                });
            });

            // Handle custom color slot buttons
            customSlotButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    const color = button.dataset.color;
                    
                    // Update selection state
                    document.querySelectorAll('.icon-color-option').forEach(btn => {
                        btn.classList.remove('is-selected');
                        if (btn.classList.contains('icon-color-custom-add')) {
                            btn.innerHTML = '<i class="fas fa-plus"></i>';
                        } else if (!btn.classList.contains('icon-color-empty-slot')) {
                            btn.innerHTML = '';
                        }
                    });
                    button.classList.add('is-selected');
                    button.innerHTML = '<i class="fas fa-check"></i>';
                    
                    // Update preview
                    if (previewIcon) {
                        previewIcon.style.color = color;
                    }
                });
            });

            // Handle add custom color button
            if (addButton && colorInput) {
                addButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    
                    // Check if a custom slot is currently selected
                    const selectedCustomSlot = document.querySelector('.icon-color-custom-slot.is-selected');
                    if (selectedCustomSlot) {
                        // Set the color picker to the current color for editing
                        colorInput.value = selectedCustomSlot.dataset.color;
                    }
                    
                    colorInput.click();
                });

                colorInput.addEventListener('change', (e) => {
                    const newColor = e.target.value;
                    const savedColors = JSON.parse(localStorage.getItem('iconCustomColors') || '[]');
                    
                    // Check if a custom slot is selected for editing
                    const selectedCustomSlot = document.querySelector('.icon-color-custom-slot.is-selected');
                    
                    if (selectedCustomSlot) {
                        // Edit mode: replace the color in the selected slot
                        const slotIndex = parseInt(selectedCustomSlot.dataset.slot, 10);
                        savedColors[slotIndex] = newColor;
                        localStorage.setItem('iconCustomColors', JSON.stringify(savedColors));
                        
                        // Update the slot in place
                        selectedCustomSlot.style.background = newColor;
                        selectedCustomSlot.dataset.color = newColor;
                        
                        // Update preview
                        if (previewIcon) {
                            previewIcon.style.color = newColor;
                        }
                    } else {
                        // Add mode: check if color already exists
                        if (savedColors.includes(newColor)) {
                            // Just select it
                            const existingBtn = Array.from(customSlotButtons).find(btn => btn.dataset.color === newColor);
                            if (existingBtn) {
                                existingBtn.click();
                            }
                            return;
                        }
                        
                        // Add to saved colors if there's space (max 11)
                        if (savedColors.length < 11) {
                            savedColors.push(newColor);
                            localStorage.setItem('iconCustomColors', JSON.stringify(savedColors));
                            
                            // Find the first empty slot and convert it to a custom color slot
                            const emptySlot = document.querySelector('.icon-color-empty-slot');
                            if (emptySlot) {
                                const slotIndex = parseInt(emptySlot.dataset.slot, 10);
                                
                                // Remove empty slot classes
                                emptySlot.classList.remove('icon-color-empty-slot');
                                emptySlot.classList.add('icon-color-custom-slot', 'is-selected');
                                emptySlot.removeAttribute('disabled');
                                
                                // Set color and style
                                emptySlot.dataset.color = newColor;
                                emptySlot.style.background = newColor;
                                emptySlot.innerHTML = '<i class="fas fa-check"></i>';
                                emptySlot.title = `Custom Color ${slotIndex + 1}`;
                                
                                // Deselect other buttons
                                document.querySelectorAll('.icon-color-option:not(.icon-color-custom-add)').forEach(btn => {
                                    if (btn !== emptySlot) {
                                        btn.classList.remove('is-selected');
                                        if (!btn.classList.contains('icon-color-empty-slot')) {
                                            btn.innerHTML = '';
                                        }
                                    }
                                });
                                
                                // Add click handler to the new slot
                                emptySlot.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    const color = emptySlot.dataset.color;
                                    
                                    // Update selection state
                                    document.querySelectorAll('.icon-color-option').forEach(btn => {
                                        btn.classList.remove('is-selected');
                                        if (btn.classList.contains('icon-color-custom-add')) {
                                            btn.innerHTML = '<i class="fas fa-plus"></i>';
                                        } else if (!btn.classList.contains('icon-color-empty-slot')) {
                                            btn.innerHTML = '';
                                        }
                                    });
                                    emptySlot.classList.add('is-selected');
                                    emptySlot.innerHTML = '<i class="fas fa-check"></i>';
                                    
                                    // Update preview
                                    if (previewIcon) {
                                        previewIcon.style.color = color;
                                    }
                                });
                                
                                // Update preview
                                if (previewIcon) {
                                    previewIcon.style.color = newColor;
                                }
                            }
                        }
                    }
                });
            }
        }, 100);
    }

    // Show move node dialog to select destination folder
    async showMoveNodeDialog(node) {
        const itemType = node.type === 'folder' ? 'folder' : 'note';
        const destinations = this.computeValidMoveDestinations(node);

        if (destinations.length === 0) {
            this.showNotification({
                message: 'No available folders to move this item to',
                type: 'warning',
                duration: 3000
            });
            return false;
        }

        const modalApi = (typeof window !== 'undefined' ? window.FolderMoveModal : null) ||
            (typeof globalThis !== 'undefined' ? globalThis.FolderMoveModal : null);

        if (!modalApi || typeof modalApi.show !== 'function') {
            const promptMessage = 'Enter destination folder ID (leave empty for Root):';
            const fallback = typeof window !== 'undefined' && typeof window.prompt === 'function'
                ? window.prompt(promptMessage)
                : null;
            if (fallback === null) {
                return false;
            }
            const trimmed = fallback.trim();
            const targetId = trimmed ? trimmed : null;
            await this.moveNodeToFolder(node.id, targetId);
            return true;
        }

        const formattedDestinations = destinations.map((dest) => ({
            id: dest.id === null ? null : String(dest.id),
            name: dest.name,
            depth: dest.depth || 0,
            searchText: dest.name,
            icon: dest.id === null ? 'fa-home' : 'fa-folder'
        }));

        const result = await modalApi.show({
            modalManager: this.modalManager,
            title: `Move ${itemType}`,
            labelText: `Move "${node.name}" to`,
            destinations: formattedDestinations,
            rootValue: '__ROOT__',
            confirmLabel: 'Move',
            cancelLabel: 'Cancel',
            searchPlaceholder: 'Search folders',
            emptyStateText: 'No folders match your search.',
            getIconColor: (id) => {
                if (!id) {
                    return '';
                }
                const folderNode = this.findNodeById(this.nodes, id);
                if (folderNode && folderNode.customization && folderNode.customization.iconColor) {
                    return folderNode.customization.iconColor;
                }
                return '';
            },
            onSubmit: async (targetId) => {
                await this.moveNodeToFolder(node.id, targetId);
                return true;
            }
        });

        return typeof result !== 'undefined';
    }

    // Compute valid move destinations (exclude node itself and its descendants)
    computeValidMoveDestinations(node) {
        const destinations = [];
        const excludedIds = new Set([node.id]);
        
        // Collect all descendant IDs to exclude
        const collectDescendants = (n) => {
            if (n.children) {
                n.children.forEach(child => {
                    excludedIds.add(child.id);
                    collectDescendants(child);
                });
            }
        };
        collectDescendants(node);

        // Add root as option (if node is not already at root and not moving folder to itself)
        if (node.parentId !== null) {
            destinations.push({ id: null, name: 'Root', depth: 0 });
        }

        // Recursively add all folders except excluded ones
        const addFolders = (nodes, depth = 0) => {
            nodes.forEach(n => {
                if (n.type === 'folder' && !excludedIds.has(n.id)) {
                    destinations.push({ id: n.id, name: n.name, depth });
                    if (n.children) {
                        addFolders(n.children, depth + 1);
                    }
                }
            });
        };
        addFolders(this.nodes);

        return destinations;
    }

    // Move node to a different folder
    async moveNodeToFolder(nodeId, targetParentId) {
        try {
            const response = await fetch(`/api/nodes/${nodeId}/move`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentId: targetParentId })
            });

            if (response.ok) {
                this.showNotification({
                    message: 'Item moved successfully',
                    type: 'success',
                    duration: 2000
                });
                
                // Reload tree from backend
                await this.load();
                this.render();
                return true;
            } else {
                this.showNotification({
                    message: 'Failed to move item',
                    type: 'error',
                    duration: 3000
                });
                return false;
            }
        } catch (error) {
            console.error('Error moving node:', error);
            this.showNotification({
                message: 'Error moving item',
                type: 'error',
                duration: 3000
            });
            return false;
        }
    }

    // Duplicate a note
    async duplicateNote(node) {
        if (node.type !== 'note') {
            this.showNotification({
                message: 'Only notes can be duplicated',
                type: 'warning',
                duration: 2000
            });
            return;
        }

        const newName = await this.modalManager.showInputDialog({
            title: 'Duplicate Note',
            message: 'Enter name for the duplicated note:',
            initialValue: `${node.name} (Copy)`,
            confirmText: 'Duplicate',
            cancelText: 'Cancel',
            icon: 'copy'
        });

        if (!newName) return;

        try {
            // First, get the note content
            const noteResponse = await fetch(`/api/notes/${node.id}`);
            if (!noteResponse.ok) {
                throw new Error('Failed to fetch note content');
            }
            const noteData = await noteResponse.json();

            // Generate new ID for the duplicate
            const newId = 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            // Create new node with same parent
            const createResponse = await fetch('/api/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: newId,
                    name: newName,
                    type: 'note',
                    parentId: node.parentId,
                    customization: node.customization
                })
            });

            if (!createResponse.ok) {
                throw new Error('Failed to create duplicate node');
            }

            // Save the content to the new note
            const saveResponse = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: newId,
                    title: newName,
                    content: noteData.content || ''
                })
            });

            if (!saveResponse.ok) {
                throw new Error('Failed to save duplicate note content');
            }

            this.showNotification({
                message: 'Note duplicated successfully',
                type: 'success',
                duration: 2000
            });

            // Reload tree
            await this.load();
            this.render();

        } catch (error) {
            console.error('Error duplicating note:', error);
            this.showNotification({
                message: 'Failed to duplicate note',
                type: 'error',
                duration: 3000
            });
        }
    }

    // Save note as template
    async saveNoteAsTemplate(node) {
        if (node.type !== 'note') {
            this.showNotification({
                message: 'Only notes can be saved as templates',
                type: 'warning',
                duration: 2000
            });
            return;
        }

        this.showNotification({
            message: 'Save as Template feature coming soon!',
            type: 'info',
            duration: 3000
        });

        // TODO: Implement template saving functionality
        // This would involve:
        // 1. Get note content
        // 2. Show dialog for template name, description, category
        // 3. POST to /api/templates endpoint (needs to be created)
        // 4. Save template file in templates/note_templates/
        // 5. Update templates/note_templates/index.json
    }

    async handleNodeAction(node, action) {
        if (!node || !action) {
            return;
        }
        const itemType = node.type === 'folder' ? 'folder' : (node.type === 'chat' ? 'chat' : 'note');
        const normalized = String(action);

        if (normalized === 'delete') {
            let confirmed = true;
            if (this.modalManager && typeof this.modalManager.showConfirmationDialog === 'function') {
                confirmed = await this.modalManager.showConfirmationDialog({
                    title: `Delete ${itemType}`,
                    message: `Are you sure you want to delete "${node.name}"? This cannot be undone.`,
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                    isDelete: true
                });
            } else if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
                confirmed = window.confirm(`Delete ${itemType} "${node.name}"? This cannot be undone.`);
            }
            if (confirmed) {
                this.removeNode(node.id);
            }
            return;
        }

        if (normalized === 'rename') {
            if (this.modalManager && typeof this.modalManager.showInputDialog === 'function') {
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
            } else if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
                const fallback = window.prompt(`Enter a new name for the ${itemType}:`, node.name || '');
                if (fallback) {
                    this.updateNode(node.id, { name: fallback });
                }
            }
            return;
        }

        if (normalized === 'iconcolor') {
            if (node.type === 'folder') {
                const currentColor = node.customization && node.customization.iconColor ? node.customization.iconColor : '#3b82f6';
                this.showIconColorPicker(node, currentColor);
            }
            return;
        }

        if (normalized === 'move') {
            await this.showMoveNodeDialog(node);
            return;
        }

        if (normalized === 'duplicate') {
            await this.duplicateNote(node);
            return;
        }

        if (normalized === 'savetemplate') {
            await this.saveNoteAsTemplate(node);
        }
    }

    // Find a node by its ID
    findNodeById(nodes, id) {
        const targetId = id !== null && id !== undefined ? String(id) : null;
        for (const node of nodes) {
            if (!node) continue;
            const nodeId = node.id !== null && node.id !== undefined ? String(node.id) : null;
            if (nodeId !== null && nodeId === targetId) {
                return node;
            }
            if (Array.isArray(node.children) && node.children.length > 0) {
                const found = this.findNodeById(node.children, targetId);
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
                        if (data.customization) {
                            node.customization = { ...(node.customization || {}), ...data.customization };
                            if (Object.prototype.hasOwnProperty.call(data.customization, 'customIcon')) {
                                node.customIcon = data.customization.customIcon || null;
                            }
                        }
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
        const normalizedNodeId = node.id !== null && node.id !== undefined ? String(node.id) : String(nodeId);
        
        // Show moving notification
        this.showNotification({
            message: 'Moving item...',
            type: 'progress',
            icon: 'arrows-alt',
            duration: 2000
        });
        
        // Call API to move node on backend
        const request = fetch(`/api/nodes/${nodeId}/move`, {
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
                if (oldParentId === null || oldParentId === undefined) {
                    const index = this.nodes.findIndex(n => String(n.id) === normalizedNodeId);
                    if (index !== -1) this.nodes.splice(index, 1);
                } else {
                    const oldParent = this.findNodeById(this.nodes, oldParentId);
                    if (oldParent) {
                        const index = oldParent.children.findIndex(n => String(n.id) === normalizedNodeId);
                        if (index !== -1) oldParent.children.splice(index, 1);
                    }
                }
                
                // Add to new parent
                if (newParentId === null || newParentId === undefined) {
                    node.parentId = null;
                    this.nodes.push(node);
                } else {
                    const newParent = this.findNodeById(this.nodes, newParentId);
                    if (newParent && newParent.type === 'folder') {
                        node.parentId = newParent.id;
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
        
        return request;
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
        const menuApi = getOptionsMenuApi();
        if (menuApi && typeof menuApi.closeActive === 'function') {
            menuApi.closeActive();
        }
        this.rootElement.innerHTML = '';
        this.renderNodes(this.nodes, this.rootElement);
        
        // RAG icon checking removed - all chats are treated equally
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
                    // Apply custom icon color if set
                    if (node.customization && node.customization.iconColor) {
                        icon.style.color = node.customization.iconColor;
                    }
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
            
            if (!this.isEditMode) {
                const menuApi = getOptionsMenuApi();
                if (menuApi && typeof menuApi.create === 'function') {
                    const items = () => {
                        const entries = [
                            {
                                action: 'rename',
                                label: 'Rename',
                                icon: 'fas fa-pen',
                                onSelect: () => this.handleNodeAction(node, 'rename')
                            }
                        ];
                        if (node.type === 'folder') {
                            entries.push({
                                action: 'iconcolor',
                                label: 'Icon Color',
                                icon: 'fas fa-palette',
                                onSelect: () => this.handleNodeAction(node, 'iconcolor')
                            });
                            entries.push({
                                action: 'move',
                                label: 'Move Folder',
                                icon: 'fas fa-folder-open',
                                onSelect: () => this.handleNodeAction(node, 'move')
                            });
                        } else if (node.type === 'note') {
                            entries.push({
                                action: 'move',
                                label: 'Move Note',
                                icon: 'fas fa-folder-open',
                                onSelect: () => this.handleNodeAction(node, 'move')
                            });
                            entries.push({
                                action: 'duplicate',
                                label: 'Duplicate Note',
                                icon: 'fas fa-clone',
                                onSelect: () => this.handleNodeAction(node, 'duplicate')
                            });
                            entries.push({
                                action: 'savetemplate',
                                label: 'Save as Template',
                                icon: 'fas fa-bookmark',
                                onSelect: () => this.handleNodeAction(node, 'savetemplate')
                            });
                        }
                        entries.push({
                            action: 'delete',
                            label: 'Delete',
                            icon: 'fas fa-trash-alt',
                            onSelect: () => this.handleNodeAction(node, 'delete')
                        });
                        return entries;
                    };
                    menuApi.create({
                        container: div,
                        items,
                        buttonClass: 'options-button',
                        buttonTag: 'span',
                        buttonContent: '&bull;&bull;&bull;',
                        menuClass: 'options-submenu'
                    });
                }
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
            
            // Collapse all folder nodes by default and map customization fields
            const collapseAllFolders = (nodes) => {
                nodes.forEach(node => {
                    if (node.type === 'folder') {
                        node.collapsed = true;
                    }
                    // Map customization fields for rendering
                    if (node.customization) {
                        if (Object.prototype.hasOwnProperty.call(node.customization, 'customIcon')) {
                            node.customIcon = node.customization.customIcon || null;
                        }
                        // iconColor is accessed directly from node.customization during rendering
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

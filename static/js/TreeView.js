class TreeView {
    constructor(rootElement) {
        this.rootElement = rootElement;
        this.nodes = [];
        this.selectedNode = null;
        this.modalManager = new ModalManager();
        this.activeSubmenu = null; // Add tracking for active submenu
        
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

    // Show notification using the existing modal manager
    showNotification(options) {
        if (this.modalManager && this.modalManager.showToast) {
            this.modalManager.showToast(options);
        }
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
            
            // Dispatch event for mobile manager
            if (nodeData) {
                document.dispatchEvent(new CustomEvent('nodeSelected', { 
                    detail: { 
                        id: id,
                        name: nodeData.name,
                        type: nodeData.type
                    } 
                }));
            }
            
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
    renderNodes(nodes, parent) {
        nodes.forEach(node => {
            const li = document.createElement('li');
            const div = document.createElement('div');
            div.className = 'tree-item';
            div.id = `tree-item-${node.id}`;
            div.setAttribute('draggable', 'true');
            div.setAttribute('data-id', node.id);
            div.style.position = 'relative'; // for submenu positioning
            
            // For folders, attach toggle on click
            if (node.type === 'folder') {
                div.addEventListener('click', (e) => {
                    node.collapsed = !node.collapsed;
                    this.render();
                    e.stopPropagation();
                });
            } else if (node.type === 'note' || node.type === 'chat') {
                // For notes and chats, trigger selection and notify parent
                div.addEventListener('click', (e) => {
                    // Don't select if clicking on options button or submenu
                    if (e.target.classList.contains('options-button') || e.target.closest('.options-submenu')) {
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
            
            // Update icon based on node type
            const icon = document.createElement('i');
            if (node.type === 'folder') {
                icon.className = node.collapsed ? 'fas fa-folder' : 'fas fa-folder-open';
            } else if (node.type === 'chat') {
                icon.className = 'fas fa-comments';
            } else {
                icon.className = 'fas fa-file-alt';
            }
            div.appendChild(icon);
            
            const span = document.createElement('span');
            span.textContent = node.name;
            div.appendChild(span);
            
            // Check for text overflow after adding to DOM
            setTimeout(() => {
                if (span.scrollWidth > span.clientWidth) {
                    span.classList.add('overflow-text');
                }
            }, 0);
            
            // Append options button (three dots) - changed to horizontal dots
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
            
            li.appendChild(div);
            // Render children only if folder is not collapsed or for notes
            if (node.children.length > 0 && (node.type !== 'folder' || (node.type === 'folder' && !node.collapsed))) {
                const ul = document.createElement('ul');
                li.appendChild(ul);
                this.renderNodes(node.children, ul);
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
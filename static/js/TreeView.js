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

    // Add a new node to the tree
    addNode(node, parentId = null) {
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
        
        if (parentId === null) {
            this.nodes.push(newNode);
        } else {
            const parent = this.findNodeById(this.nodes, parentId);
            if (parent) {
                parent.children.push(newNode);
            }
        }
        
        this.render();
        return newNode.id;
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
    }

    // Update a node
    updateNode(id, data) {
        const node = this.findNodeById(this.nodes, id);
        if (node) {
            if (data.name) node.name = data.name;
            if (data.content) node.content = data.content;
            this.render();
        }
    }

    // Move a node to a new parent
    moveNode(nodeId, newParentId) {
        const node = this.findNodeById(this.nodes, nodeId);
        if (!node) return false;
        
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
            
            // Return the selected node data
            return this.findNodeById(this.nodes, id);
        }
        return null;
    }

    // Render the tree
    render() {
        this.rootElement.innerHTML = '';
        this.renderNodes(this.nodes, this.rootElement);
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
            }
            
            // Update icon
            const icon = document.createElement('i');
            icon.className = node.type === 'folder' ?
                (node.collapsed ? 'fas fa-folder' : 'fas fa-folder-open') :
                'fas fa-file-alt';
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
            if (!jsonData || jsonData.trim() === '') {
                console.warn('Empty tree data provided');
                this.nodes = [];
                this.render();
                return false;
            }
            
            const parsedData = JSON.parse(jsonData);
            console.log('Parsed tree data:', parsedData);
            
            if (!Array.isArray(parsedData)) {
                console.error('Tree data is not an array:', parsedData);
                return false;newTabBtn
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
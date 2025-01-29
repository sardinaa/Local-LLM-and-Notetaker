import { displayFolderInUI } from "./FolderManager.js";
import { addNoteToUI } from "./NoteManager.js";

export function renderTree(data, container) {
    data.forEach(item => {
        // Create a tree item
        const treeItem = document.createElement('div');
        treeItem.classList.add('tree-item');
        treeItem.dataset.id = item.id;
        treeItem.dataset.type = item.type;

        // Display folder or note
        treeItem.innerHTML = `
            <span class="item-name">${item.name}</span>
            ${item.type === "folder" ? `<i class="bi ${item.expanded ? 'bi-folder2-open' : 'bi-folder'}"></i>` : `<i class="bi bi-file-earmark"></i>`}
        `;

        // Append the tree item to the container
        container.appendChild(treeItem);

        // If it's a folder, create a container for children
        if (item.type === "folder") {
            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('tree-children');
            treeItem.appendChild(childrenContainer);

            // Recursively render children
            if (item.children && item.children.length > 0) {
                renderTree(item.children, childrenContainer);
            }
        }

        // Update icon based on expanded state
        const icon = folderElement.querySelector('i');
        if (icon) {
            icon.className = folderElement.classList.contains('expanded') ? 'bi bi-folder2-open' : 'bi bi-folder';
        }
    });
}


export class TreeView {
    constructor() {
        this.treeContainer = document.getElementById('tree-container');
        if (!this.treeContainer) {
            console.error("Error: 'tree-container' element not found in the DOM.");
            return;
        }
    }

    initializeTreeView(data) {
        data.forEach((item) => this.addTreeItem(item));
        this.enableDragAndDrop();
    }

    addTreeItem(item) {
        const treeItem = document.createElement('div');
        treeItem.textContent = item.name;
        treeItem.dataset.id = item.id;
        treeItem.dataset.type = item.type;
        treeItem.draggable = true;
        treeItem.classList.add('tree-item');
        this.treeContainer.appendChild(treeItem);

        // If it's a folder, create a container for children
        if (item.type === "folder") {
            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('tree-children');
            treeItem.appendChild(childrenContainer);

            // Recursively render children
            if (item.children && item.children.length > 0) {
                renderTree(item.children, childrenContainer);
            }
        }

        // Handle folder expansion/collapse
        if (item.type === 'folder') {
            treeItem.addEventListener('click', () => this.toggleFolder(treeItem));
        }
    }

    toggleFolder(folderElement) {
        folderElement.classList.toggle('expanded');
        const childrenContainer = folderElement.nextElementSibling;

        if (childrenContainer) {
            if (folderElement.classList.contains('expanded')) {
                childrenContainer.style.maxHeight = `${childrenContainer.scrollHeight}px`;
            } else {
                childrenContainer.style.maxHeight = '0';
            }
        }
    }

    enableDragAndDrop(onDropCallback) {
        this.treeContainer.addEventListener('dragstart', (event) => {
            const draggedItem = event.target.closest('.tree-item');
            if (draggedItem) {
                event.dataTransfer.setData('text/plain', JSON.stringify({
                    id: draggedItem.dataset.id,
                    type: draggedItem.dataset.type,
                }));
                draggedItem.classList.add('dragging');
            }
        });

        this.treeContainer.addEventListener('dragover', (event) => {
            event.preventDefault();
            const target = event.target.closest('.tree-item');
            if (target) {
                target.classList.add('drag-over');
            }
        });

        this.treeContainer.addEventListener('dragleave', (event) => {
            const target = event.target.closest('.tree-item');
            if (target) {
                target.classList.remove('drag-over');
            }
        });

        this.treeContainer.addEventListener('drop', (event) => {
            event.preventDefault();
            const dropTarget = event.target.closest('.tree-item');
            const draggedData = JSON.parse(event.dataTransfer.getData('text/plain'));

            if (dropTarget) {
                const targetId = dropTarget.dataset.id;
                const targetType = dropTarget.dataset.type;
                if (targetType === 'folder') {
                    onDropCallback(draggedData.id, targetId, draggedData.type);
                }
            }
        });

        this.treeContainer.addEventListener('dragend', (event) => {
            const draggingItem = event.target.closest('.dragging');
            if (draggingItem) {
                draggingItem.classList.remove('dragging');
            }
        });
    }
}
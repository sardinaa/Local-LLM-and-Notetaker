// Main application script to coordinate modular JavaScript functionality
import { NoteManager } from './components/NoteManager.js';
import { FolderManager } from './components/FolderManager.js';
import { TreeView } from './components/TreeView.js';
import { ModalManager } from './components/ModalManager.js';
import { APIService } from './services/ApiService.js';

document.addEventListener('DOMContentLoaded', () => {
    const apiService = new APIService();
    const treeView = new TreeView(document.getElementById('tree-container'));
    const noteManager = new NoteManager(apiService, treeView);
    const folderManager = new FolderManager(apiService);
    const modalManager = new ModalManager();

    console.log('create-folder-btn:', document.getElementById('create-folder-btn'));
    console.log('create-note-btn:', document.getElementById('create-note-btn'));
    console.log('tree-container:', document.getElementById('tree-container'));
    console.log('record-btn:', document.getElementById('record-btn'));
    console.log('file-upload:', document.getElementById('file-upload'));
    console.log('open-background-modal:', document.getElementById('open-background-modal'));
    console.log('save-background-btn:', document.getElementById('save-background-btn'));

    // Load initial folders and notes data
    apiService.get('/get_folders_and_notes').then((data) => {
        console.log('Folders and Notes:', data);
        treeView.initializeTreeView(data);
    }).catch((error) => {
        console.error('Failed to load tree data:', error);
    });


    const frontPageDropdownToggle = document.getElementById("frontpage-options-toggle");
    const frontPageDropdown = document.getElementById("frontpage-dropdown");
    const colorPicker = document.getElementById("color-picker");
    const imageUpload = document.getElementById("image-upload");

    /**
     * Toggles the dropdown menu for the front page.
     */
    const toggleOptionsMenu = (event, dropdownMenu) => {
        event.stopPropagation();
        const isActive = dropdownMenu.style.display === "block";

        // Close all dropdown menus
        document.querySelectorAll(".dropdown-menu").forEach((menu) => {
            menu.style.display = "none";
        });

        // Toggle the current menu
        dropdownMenu.style.display = isActive ? "none" : "block";
    };

    /**
     * Opens the color picker to set the background color.
     */
    const openColorPicker = () => {
        colorPicker.click();
    };

    /**
     * Updates the background color dynamically.
     */
    colorPicker.addEventListener("input", (event) => {
        const selectedColor = event.target.value;
        document.getElementById("note-front-page").style.backgroundColor = selectedColor;

        // Save background color to localStorage
        localStorage.setItem("backgroundColor", selectedColor);
        localStorage.removeItem("backgroundImage"); // Remove image if color is set
    });

    /**
     * Initializes dropdown toggle behavior for the front page.
     */
    frontPageDropdownToggle.addEventListener("click", (event) => {
        toggleOptionsMenu(event, frontPageDropdown);
    });

    // Close dropdown menu if clicked outside
    document.addEventListener("click", () => {
        frontPageDropdown.style.display = "none";
    });

    // Add event listeners for dropdown actions
    document.getElementById("open-background-modal").addEventListener("click", openColorPicker);

    // Event Listeners
    document.getElementById('create-folder-btn').addEventListener('click', () => {
        const folderName = prompt('Enter folder name:');
        if (folderName) {
            folderManager.createFolder(folderName).then((folder) => {
                treeView.addTreeItem(folder);
                treeView.renderTree();
            });
        }
    });

    document.getElementById('create-note-btn').addEventListener('click', () => {
        const noteName = prompt('Enter note name:');
        if (noteName) {
            noteManager.createNote(noteName).then((note) => {
                treeView.addTreeItem(note);
                treeView.renderTree();
            }).catch((error) => {
                console.error('Failed to create note:', error);
            });
        }
        
    });

    document.getElementById('tree-container').addEventListener('click', (event) => {
        let target = event.target.closest('.tree-item');
        if (target && target.dataset.type === 'folder') {
            const action = event.target.dataset.action;

            const folderId = target.dataset.id;

            if (target.classList.contains("expanded")) {
                // Collapse the folder
                target.classList.remove("expanded");
                target.nextElementSibling.innerHTML = ""; // Clear children
            } else {
                // Expand and fetch children
                target.classList.add("expanded");
                apiService.get(`/get_folders_and_notes/${folderId}`).then((children) => {
                    treeView.renderTree(children, target.nextElementSibling);
                }).catch((error) => {
                    console.error('Failed to fetch children:', error);
                });
            }

            if (action === 'rename') {
                const newName = prompt('Enter new folder name:');
                if (newName) {
                    folderManager.renameFolder(folderId, newName);
                }
            } else if (action === 'delete') {
                folderManager.deleteFolder(folderId);
            }
        }
        if (target && target.dataset.type === 'note') {
            const action = event.target.dataset.action;
            if (action === 'rename') {
                const newName = prompt('Enter new note name:');
                if (newName) {
                    noteManager.renameNote(target.dataset.id, newName);
                }
            } else if (action === 'delete') {
                noteManager.deleteNote(target.dataset.id);
            } else {
                noteManager.loadNoteContent(target.dataset.id);
            }
        }
        if (target && target.dataset.action === 'delete') {
            const itemId = target.dataset.id;
            const itemType = target.dataset.type;
            modalManager.showModal('deleteModal', {
                message: itemType === 'folder'
                    ? "Are you sure you want to delete this folder and all its contents?"
                    : "Are you sure you want to delete this note?",
                confirmHandler: () => {
                    apiService.post(`/${itemType === "folder" ? "delete_folder" : "delete_note"}/${itemId}`)
                        .then(() => {
                            target.remove();
                            modalManager.closeModals();
                        })
                        .catch((error) => console.error(`Failed to delete ${itemType}:`, error));
                },
            });
        }
        if (target && target.dataset.action === 'rename') {
            const itemId = target.dataset.id;
            const itemType = target.dataset.type;
            const currentName = target.querySelector('.item-name').textContent;
            modalManager.showModal('editModal', {
                inputValue: currentName,
                confirmHandler: () => {
                    const newName = document.getElementById('editInput').value;
                    apiService.post(`/${itemType === "folder" ? "rename_folder" : "rename_note"}/${itemId}`, { name: newName })
                        .then(() => {
                            target.querySelector('.item-name').textContent = newName;
                            modalManager.closeModals();
                        })
                        .catch((error) => console.error(`Failed to rename ${itemType}:`, error));
                },
            });
        }

        target = event.target.closest('.edit-btn');
        if (target) {
            const itemId = target.dataset.id;
            const itemType = target.dataset.type;
            const currentName = target.closest('.tree-item').querySelector('.item-name').textContent;
            modalManager.showModal('editModal', {
                inputValue: currentName,
                confirmHandler: () => {
                    const newName = document.getElementById('newNameInput').value;
                    if (itemType === 'folder') {
                        folderManager.renameFolder(itemId, newName);
                    } else {
                        noteManager.renameNote(itemId, newName);
                    }
                    target.closest('.tree-item').querySelector('.item-name').textContent = newName;
                    modalManager.closeModals();
                },
            });
        }
        target = event.target.closest('.delete-btn');
        if (target) {
            const itemId = target.dataset.id;
            const itemType = target.dataset.type;
            modalManager.showModal('deleteModal', {
                message: `Are you sure you want to delete this ${itemType}?`,
                confirmHandler: () => {
                    if (itemType === 'folder') {
                        folderManager.deleteFolder(itemId);
                    } else {
                        noteManager.deleteNote(itemId);
                    }
                    target.closest('.tree-item').remove();
                    modalManager.closeModals();
                },
            });
        }
    });
    
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', () => {
            modalManager.closeModals();
        });
    });

    // Drag-and-Drop for Folders and Notes
    treeView.enableDragAndDrop((draggedId, targetId) => {
        const draggedElement = document.querySelector(`.tree-item[data-id="${draggedId}"]`);
        if (draggedElement.dataset.type === 'folder') {
            folderManager.moveFolder(draggedId, targetId);
        } else if (draggedElement.dataset.type === 'note') {
            noteManager.moveNote(draggedId, targetId);
        }
    });

    document.getElementById('record-btn').addEventListener('click', () => {
        const recordBtn = document.getElementById('record-btn');
        if (recordBtn.textContent === 'Start Recording') {
            fetch('/record', { method: 'POST' }).then(() => {
                recordBtn.textContent = 'Stop Recording';
                recordBtn.classList.replace('btn-primary', 'btn-danger');
            });
        } else {
            fetch('/stop_recording', { method: 'POST' }).then(() => {
                recordBtn.textContent = 'Start Recording';
                recordBtn.classList.replace('btn-danger', 'btn-primary');
            });
        }
    });

    document.getElementById('file-upload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        const formData = new FormData();
        formData.append('file', file);

        fetch('/upload', { method: 'POST', body: formData })
            .then(() => console.log('File uploaded successfully'))
            .catch((error) => console.error('Error uploading file:', error));
    });


    document.getElementById('save-background-btn').addEventListener('click', () => {
        modalManager.saveBackgroundSettings();
    });
});
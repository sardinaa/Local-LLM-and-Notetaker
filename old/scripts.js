let expandedFolders = new Set();
let editor;
let currentNoteId = null; // Global variable to track the current note ID

// ========== FUNCIONES DEL ÁRBOL ==========
function updateTree(newItem = null, parentId = null, itemType = null, action = null, newName = null) {
    const treeContainer = document.getElementById("tree-container");

    // Si no se proporciona acción, renderizar el árbol completo
    if (!action) {
        // Renderizar el árbol completo desde el backend
        fetch("/get_folders_and_notes")
            .then((response) => response.json())
            .then((data) => {
                treeContainer.innerHTML = "";
                data.forEach((item) => renderTreeItem(item, treeContainer));

                // Restaurar estado de carpetas expandidas
                expandedFolders.forEach(folderId => {
                    const folder = document.querySelector(`.tree-item[data-id="${folderId}"]`);
                    if (folder) {
                        const container = folder.nextElementSibling;
                        if (container) {
                            container.style.maxHeight = container.scrollHeight + "px";
                        }
                    }
                });
            })
            .catch((error) => console.error("Error al actualizar el árbol:", error));
    }

    // Acciones específicas: create, delete, rename, move
    if (action === "create") {
        const parentContainer = parentId
            ? document.querySelector(`.tree-item[data-id='${parentId}'][data-type='folder']`).nextElementSibling
            : treeContainer;
    
        if (!parentContainer) return;
    
        const optionsMenu = document.createElement("div");
        optionsMenu.className = "options-menu";
        const optionsIcon = document.createElement("i");
        optionsIcon.className = "bi bi-three-dots";
        optionsIcon.onclick = (e) => {
            e.stopPropagation();
            toggleOptionsMenu(e, optionsIcon);
        };

        const dropdownMenu = document.createElement("div");
        dropdownMenu.className = "dropdown-menu";

        const editOption = document.createElement("button");
        editOption.innerHTML = '<i class="bi bi-pencil me-2"></i>Editar';
        editOption.onclick = (e) => {
            e.stopPropagation();
            editItem(newItem.id, itemType);
        };

        const deleteOption = document.createElement("button");
        deleteOption.innerHTML = '<i class="bi bi-trash me-2"></i>Eliminar';
        deleteOption.onclick = (e) => {
            e.stopPropagation();
            deleteItem(newItem.id, itemType);
        };

        dropdownMenu.appendChild(editOption);
        dropdownMenu.appendChild(deleteOption);
        optionsMenu.appendChild(optionsIcon);
        optionsMenu.appendChild(dropdownMenu);
        newTreeItem.appendChild(optionsMenu); // ¡Usar newTreeItem en lugar de treeItem!
    
        // Expandir la carpeta si corresponde
        if (parentId) {
            const parentTreeItem = document.querySelector(`.tree-item[data-id='${parentId}'][data-type='folder']`);
            if (parentTreeItem) {
                parentTreeItem.classList.add("expanded");
                parentContainer.style.maxHeight = parentContainer.scrollHeight + "px";
    
                const parentIcon = parentTreeItem.querySelector("i");
                if (parentIcon) {
                    parentIcon.classList.remove("bi-folder");
                    parentIcon.classList.add("bi-folder2-open");
                }
            }
        }
        if (parentId && expandedFolders.has(parentId)) {
            parentContainer.style.maxHeight = parentContainer.scrollHeight + "px";
        
            // Forzar recalculo de la altura para evitar cortes
            setTimeout(() => {
                parentContainer.style.maxHeight = `${parentContainer.scrollHeight}px`;
            }, 0);
        
            // Forzar renderizado completo de hijos expandidos
            parentContainer.querySelectorAll('.tree-item[data-type="folder"]').forEach(item => {
                if (expandedFolders.has(item.dataset.id)) {
                    const children = item.nextElementSibling;
                    children.style.maxHeight = children.scrollHeight + "px";
                }
            });
        }
    
    } else if (action === "rename") {
        const itemElement = document.querySelector(`.tree-item[data-id='${newItem.id}'][data-type='${itemType}']`);
        if (itemElement) {
            itemElement.querySelector(".item-name").textContent = newName;
        }
    } else if (action === "delete") {
        const itemElement = document.querySelector(`.tree-item[data-id='${newItem.id}'][data-type='${itemType}']`);
        if (itemElement) {
            if (itemType === "folder") {
                const childrenContainer = itemElement.nextElementSibling;
                if (childrenContainer && childrenContainer.classList.contains("tree-children")) {
                    childrenContainer.remove();
                }
            }
            itemElement.remove();
        }
    } else if (action === "move") {
        const movingItem = document.querySelector(`.tree-item[data-id="${newItem.id}"][data-type="${itemType}"]`);
        if (!movingItem) return;

        const targetContainer = parentId
            ? document.querySelector(`.tree-item[data-id="${parentId}"][data-type="folder"]`).nextElementSibling
            : treeContainer;

        if (!targetContainer) return;

        const oldParent = movingItem.closest(".tree-children") || movingItem.parentElement;
        if (oldParent) oldParent.removeChild(movingItem);

        targetContainer.appendChild(movingItem);

        if (parentId) {
            const parentTreeItem = document.querySelector(`.tree-item[data-id="${parentId}"][data-type="folder"]`);
            if (parentTreeItem && !parentTreeItem.classList.contains("expanded")) {
                const childrenContainer = parentTreeItem.nextElementSibling;
                if (childrenContainer) {
                    childrenContainer.style.maxHeight = null;
                }
            }
        }
    }
}


function renderTreeItem(item, container) {
    const treeItem = document.createElement("div");
    treeItem.className = "tree-item d-flex align-items-center justify-content-between";
    treeItem.dataset.id = item.id;
    treeItem.dataset.type = item.type;
    treeItem.draggable = true;

    const icon = document.createElement("i");
    icon.className = item.type === "folder" ? "bi bi-folder" : "bi bi-file-earmark";
    icon.style.marginRight = "8px";

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;

    const leftSide = document.createElement("div");
    leftSide.className = "d-flex align-items-center";
    leftSide.appendChild(icon);
    leftSide.appendChild(name);

    treeItem.appendChild(leftSide);

    const optionsMenu = document.createElement("div");
    optionsMenu.className = "options-menu";
    const optionsIcon = document.createElement("i");
    optionsIcon.className = "bi bi-three-dots";
    optionsIcon.onclick = (e) => {
        e.stopPropagation();
        toggleOptionsMenu(e, optionsIcon);
    };

    const dropdownMenu = document.createElement("div");
    dropdownMenu.className = "dropdown-menu";

    const editOption = document.createElement("button");
    editOption.innerHTML = '<i class="bi bi-pencil me-2"></i>Editar';
    editOption.onclick = (e) => {
        e.stopPropagation();
        editItem(item.id, item.type);
    };

    const deleteOption = document.createElement("button");
    deleteOption.innerHTML = '<i class="bi bi-trash me-2"></i>Eliminar';
    deleteOption.onclick = (e) => {
        e.stopPropagation();
        deleteItem(item.id, item.type);
    };

    dropdownMenu.appendChild(editOption);
    dropdownMenu.appendChild(deleteOption);
    optionsMenu.appendChild(optionsIcon);
    optionsMenu.appendChild(dropdownMenu);
    treeItem.appendChild(optionsMenu);

    container.appendChild(treeItem);

    if (item.children && item.children.length > 0) {
        const childrenContainer = document.createElement("div");
        childrenContainer.className = "tree-children";
        childrenContainer.style.maxHeight = "0";

        if (expandedFolders.has(item.id)) {
            childrenContainer.style.maxHeight = childrenContainer.scrollHeight + "px";
        }

        item.children.forEach(child => renderTreeItem(child, childrenContainer));

        container.appendChild(childrenContainer);

        childrenContainer.addEventListener("transitionend", () => {
            // Recalcular alturas de los padres cuando finaliza la transición
            updateParentHeights(childrenContainer);
        });
    }
}

// ========== FUNCIONES DE INTERACCIÓN ==========
function toggleFolder(folderId) {
    const folderElement = document.querySelector(`.tree-item[data-id="${folderId}"]`);
    if (!folderElement) return;

    const childrenContainer = folderElement.nextElementSibling;
    if (!childrenContainer || !childrenContainer.classList.contains("tree-children")) return;

    const wasExpanded = expandedFolders.has(folderId);

    if (wasExpanded) {
        // Colapsar la carpeta
        childrenContainer.style.maxHeight = "0";
        folderElement.classList.remove("expanded");
        expandedFolders.delete(folderId);
    } else {
        // Expandir la carpeta y ajustar la altura inmediatamente
        folderElement.classList.add("expanded");
        expandedFolders.add(folderId);

        // Calcular y aplicar la altura total de los hijos
        const totalHeight = childrenContainer.scrollHeight;
        childrenContainer.style.maxHeight = `${totalHeight}px`;
    }

    // Recalcular la altura del contenedor padre para mantener la coherencia
    updateParentHeights(childrenContainer);
}

function updateParentHeights(element) {
    let parentFolder = element.closest(".tree-children")?.previousElementSibling;
    while (parentFolder) {
        const parentContainer = parentFolder.nextElementSibling;
        if (parentContainer && expandedFolders.has(parentFolder.dataset.id)) {
            const totalHeight = Array.from(parentContainer.children).reduce((acc, child) => {
                return acc + child.scrollHeight + 20;
            }, 0);
            parentContainer.style.maxHeight = `${totalHeight}px`;
        }
        parentFolder = parentFolder.closest(".tree-children")?.previousElementSibling;
    }
}

function createFolder(parentId = null) {
    const folderName = prompt("Introduce el nombre de la nueva carpeta:");
    if (!folderName) {
        alert("El nombre de la carpeta no puede estar vacío.");
        return;
    }

    fetch("/create_folder", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name: folderName,
            parent_id: parentId
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error("Error al crear la carpeta.");
        }
        return response.json();
    })
    .then(newFolder => {
        // Crear el nuevo elemento en el árbol visual
        const targetContainer = parentId
            ? document.querySelector(`.tree-item[data-id="${parentId}"][data-type="folder"]`).nextElementSibling
            : document.getElementById("tree-container");

        if (targetContainer) {
            renderTreeItem(newFolder, targetContainer);
        }
    })
    .catch(error => {
        console.error("Error:", error);
        alert("No se pudo crear la carpeta.");
    });
}

// Debugging createNote
function createNote(folderId) {
    const noteName = prompt("Enter the name of the note:");
    if (!noteName) {
        console.log("Note creation canceled.");
        return;
    }

    // API call to create a note
    console.log(`Sending request to create note: ${noteName}, folderId: ${folderId}`);
    fetch("/create_note", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name: noteName,
            folder_id: folderId
        })
    })
    .then(response => {
        console.log("Response received for create_note:", response);
        if (!response.ok) {
            throw new Error("Failed to create note");
        }
        return response.json();
    })
    .then(data => {
        console.log("Note created successfully:", data);
        // Call updateTree to refresh the UI
        updateTree();
    })
    .catch(error => console.error("Error creating note:", error));
}


function toggleOptionsMenu(event, iconElement) {
    event.stopPropagation();
    const dropdownMenu = iconElement.nextElementSibling;
    const isActive = dropdownMenu.style.display === "block";
    
    // Cerrar todos los menús
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.style.display = 'none';
    });
    
    // Alternar el menú actual
    dropdownMenu.style.display = isActive ? 'none' : 'block';
    iconElement.closest('.options-menu').classList.toggle('active', !isActive);
}

function editItem(itemId, itemType) {
    // Configurar modal de edición
    const modalBackdrop = document.getElementById('modalBackdrop');
    const editModal = document.getElementById('editModal');
    const newNameInput = document.getElementById('newNameInput');
    
    // Resetear valores
    newNameInput.value = '';
    
    // Configurar eventos inline
    const confirmHandler = () => {
        const newName = newNameInput.value;
        if (!newName) {
            alert("El nombre no puede estar vacío");
            return;
        }
        
        fetch(`/${itemType === "folder" ? "rename_folder" : "rename_note"}/${itemId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName }),
        }).then(() => {
            updateTree({ id: itemId }, null, itemType, "rename", newName);
            closeModals();
        });
        
        // Limpiar listeners
        editModal.querySelector('.confirm').replaceWith(editModal.querySelector('.confirm').cloneNode(true));
    };

    // Mostrar modal
    modalBackdrop.style.display = 'block';
    editModal.style.display = 'block';
    
    // Asignar nuevo listener
    editModal.querySelector('.confirm').addEventListener('click', confirmHandler);
}

function deleteItem(itemId, itemType) {
    // Configurar modal de eliminación
    const modalBackdrop = document.getElementById('modalBackdrop');
    const deleteModal = document.getElementById('deleteModal');
    const deleteMessage = document.getElementById('deleteMessage');
    
    // Configurar mensaje contextual
    deleteMessage.textContent = itemType === 'folder' 
        ? "¿Estás seguro que quieres eliminar la carpeta y todo su contenido?" 
        : "¿Estás seguro que quieres eliminar la nota?";

    // Configurar eventos inline
    const confirmHandler = () => {
        fetch(`/${itemType === "folder" ? "delete_folder" : "delete_note"}/${itemId}`, {
            method: "POST",
        }).then(() => {
            const item = document.querySelector(`.tree-item[data-id='${itemId}'][data-type='${itemType}']`);
            if (item) item.remove();
            closeModals();
        });
        
        // Limpiar listeners
        deleteModal.querySelector('.confirm').replaceWith(deleteModal.querySelector('.confirm').cloneNode(true));
    };

    // Mostrar modal
    modalBackdrop.style.display = 'block';
    deleteModal.style.display = 'block';
    
    // Asignar nuevo listener
    deleteModal.querySelector('.confirm').addEventListener('click', confirmHandler);
}

// Función para cerrar modales (se mantiene igual)
function closeModals() {
    document.getElementById('modalBackdrop').style.display = 'none';
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('deleteModal').style.display = 'none';
}

// ========== FUNCIONES PARA CARGAR NOTAS ==========
function loadNoteContent(noteContent) {
    editor.clear().then(() => {
        console.log("Editor cleared. Loading new content...");

        let parsedContent;

        try {
            // Ensure valid JSON; fallback to default if null or empty
            parsedContent = noteContent && typeof noteContent === "object" 
                ? noteContent 
                : { blocks: [] };
        } catch (error) {
            console.error("Error parsing note content:", error);
            parsedContent = { blocks: [] }; // Default to an empty structure
        }

        console.log("Content to render:", parsedContent);

        // Render the content in the editor
        editor.render(parsedContent)
            .then(() => {
                console.log("Editor content loaded successfully.");
            })
            .catch((error) => {
                console.error("Error rendering editor content:", error);
            });
    }).catch((error) => {
        console.error("Error clearing editor content:", error);
    });
}


// ========== FUNCIONES PARA GUARDAR NOTAS ==========
function saveNote(noteId) {
    editor.save().then((outputData) => {
        console.log("Sending content:", outputData); // Debug the content
        fetch(`/update_note/${noteId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: outputData }),
        })
        .then(response => {
            if (response.status === 204) {  // Handle empty response
                return { success: true };
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                console.log("Note saved successfully");
            } else {
                console.error("Error:", data.error);
            }
        })
        .catch(error => {
            console.error("Network error:", error);
        });
    });
}

// ========== FUNCIONES DE GRABACIÓN Y SUBIDA ==========
function toggleRecording() {
    const recordBtn = document.getElementById("record-btn");
    if (recordBtn.textContent === "Grabar Audio") {
        fetch("/record", { method: "POST" })
            .then(() => {
                recordBtn.textContent = "Detener Grabación";
                recordBtn.classList.replace("btn-primary", "btn-danger");
            });
    } else {
        fetch("/stop_recording", { method: "POST" })
            .then(() => {
                recordBtn.textContent = "Grabar Audio";
                recordBtn.classList.replace("btn-danger", "btn-primary");
                updateTree();
            });
    }
}

function uploadImage(e) {
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);

    fetch("/upload", {
        method: "POST",
        body: formData
    }).then(() => updateTree());
}

// ========== INICIALIZACIÓN ==========
document.addEventListener("DOMContentLoaded", () => {

    updateTree();
    initializeEditor();
    
    // Añadir eventos drag-and-drop a carpetas y notas
    const treeContainer = document.getElementById("tree-container");

    // Evento para cargar contenido de la nota al hacer clic
    treeContainer.addEventListener("click", (event) => {
        const target = event.target.closest(".tree-item");
    
        if (!target) {
            // Cerrar todos los menús al hacer clic fuera
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                menu.style.display = 'none';
            });
            return;
        }
    
        // Cerrar menús de otros elementos
        document.querySelectorAll('.tree-item').forEach(item => {
            if (item !== target) {
                item.classList.remove('selected');
                item.querySelector('.dropdown-menu').style.display = 'none';
            }
        });
    
        // Alternar selección
        target.classList.toggle('selected');
        
        // Cerrar menú si ya está abierto
        const dropdown = target.querySelector('.dropdown-menu');
        if (target.classList.contains('selected') && dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
        }
    
        // Agregar evento de clic a todas las notas
        document.querySelectorAll('.tree-item[data-type="note"]').forEach((note) => {
            note.addEventListener('click', () => {
                const noteId = note.getAttribute('data-id'); // ID de la nota seleccionada
                loadNote(noteId); // Llamar a la función para cargar la nota
            });
        });

        // Si es una carpeta, alternar visualización
        if (target.dataset.type === "folder") {
            const icon = target.querySelector("i");
            const childrenContainer = target.nextElementSibling;
    
            if (target.classList.contains("expanded")) {
                target.classList.remove("expanded");
                if (icon) icon.className = "bi bi-folder";
                if (childrenContainer) childrenContainer.style.maxHeight = "0";
            } else {
                target.classList.add("expanded");
                if (icon) icon.className = "bi bi-folder2-open";
                if (childrenContainer) {
                    childrenContainer.style.maxHeight = `${childrenContainer.scrollHeight}px`;
                }
            }
    
            toggleFolder(target.dataset.id, true);
        }
    });
        

    treeContainer.addEventListener("dragstart", (event) => {
        const target = event.target.closest(".tree-item");
        if (target) {
            document.body.style.userSelect = "none"; // Evitar selección de texto
    
            const id = target.dataset.id;
            const type = target.dataset.type;
    
            // Personalizar el contenido visible durante el drag
            const dragIcon = document.createElement("div");
            dragIcon.style.position = "absolute";
            dragIcon.style.pointerEvents = "none";
            dragIcon.style.backgroundColor = "white";
            dragIcon.style.border = "1px solid #dee2e6";
            dragIcon.style.borderRadius = "4px";
            dragIcon.style.padding = "5px 10px";
            dragIcon.style.boxShadow = "0px 2px 6px rgba(0, 0, 0, 0.2)";
            dragIcon.style.display = "flex";
            dragIcon.style.alignItems = "center";
    
            const icon = document.createElement("i");
            icon.className = type === "folder" ? "bi bi-folder" : "bi bi-file-earmark";
            icon.style.marginRight = "8px";
    
            const text = document.createElement("span");
            text.textContent = target.querySelector(".item-name").textContent;
    
            dragIcon.appendChild(icon);
            dragIcon.appendChild(text);
            document.body.appendChild(dragIcon);
    
            event.dataTransfer.setDragImage(dragIcon, 10, 10);
            event.dataTransfer.setData(
                "text/plain",
                JSON.stringify({ id, type })
            );
    
            setTimeout(() => document.body.removeChild(dragIcon), 0);
        }
    });

    treeContainer.addEventListener("dragenter", (event) => {
        const target = event.target.closest(".tree-item");
        if (target && target.dataset.type === "folder") {
            target.classList.add("drag-over");
        }
        else {
            treeContainer.classList.add("drag-over-root");
        }
    });
    
    treeContainer.addEventListener("dragleave", (event) => {
        const target = event.target.closest(".tree-item");
        if (target && target.dataset.type === "folder") {
            target.classList.remove("drag-over");
        }
        else {
            treeContainer.classList.remove("drag-over-root");
        }
    });

    treeContainer.addEventListener("dragover", (event) => {
        event.preventDefault(); // Permitir el drop
    });

    treeContainer.addEventListener("dragend", () => {
        document.body.style.userSelect = ""; // Restaurar selección de texto
    });

    treeContainer.addEventListener("drop", (event) => {
        event.preventDefault();
    
        const dropTarget = event.target.closest(".tree-item");
        const draggedData = JSON.parse(event.dataTransfer.getData("text/plain"));
    
        if (!dropTarget) {
            // Mover a la raíz si no estamos sobre ningún elemento
            if (draggedData.type === "folder") {
                moveFolder(draggedData.id, null);
            } else if (draggedData.type === "note") {
                moveNote(draggedData.id, null);
            }
        } else if (dropTarget.dataset.type === "folder") {
            // Mover a una carpeta específica
            const targetFolderId = dropTarget.dataset.id;
    
            if (draggedData.type === "folder") {
                moveFolder(draggedData.id, targetFolderId);
            } else if (draggedData.type === "note") {
                moveNote(draggedData.id, targetFolderId);
            }
        }
    
        // Siempre limpiar el estado de la raíz
        treeContainer.classList.remove("drag-over-root");
    });
    
    function moveFolder(folderId, targetFolderId) {
        fetch(`/move_folder/${folderId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parent_id: targetFolderId }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Error al mover la carpeta");
                }
                // Actualizar el DOM después de mover
                updateTree({ id: folderId }, targetFolderId, "folder", "move");
            })
            .catch((error) => console.error("Error al mover la carpeta:", error));
    }    
    
    function moveNote(noteId, targetFolderId) {
        fetch(`/move_note/${noteId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder_id: targetFolderId }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Error al mover la nota"); ini
                }
                // Actualizar el DOM después de mover
                updateTree({ id: noteId }, targetFolderId, "note", "move");
            })
            .catch((error) => console.error("Error al mover la nota:", error));
    }
    
    // Función para cargar contenido de una nota y manejar su selección
    function loadNote(noteId) {
        console.log("Loading note with ID:", noteId);
    
        fetch(`/get_note/${noteId}`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch note with ID ${noteId}`);
                }
                return response.json();
            })
            .then((note) => {
                console.log("Raw note content:", note.content);
    
                // Update the current note ID globally
                currentNoteId = noteId;

                const noteTitle = document.getElementById("note-title");
                noteTitle.innerHTML = `<h3>${note.name}</h3>`;
    
                // Ensure content is valid JSON
                let content;
                if (typeof note.content === "object") {
                    content = note.content; // Use the object directly
                } else {
                    try {
                        content = note.content ? JSON.parse(note.content) : { blocks: [] };
                    } catch (error) {
                        console.error("Error parsing note content. Using default structure.", error);
                        content = { blocks: [] }; // Fallback to default structure
                    }
                }
    
                // Clear the editor and load the new content
                editor.clear()
                    .then(() => {
                        console.log("Editor cleared. Rendering note content...");
    
                        // Dynamically update the onChange event to save the correct note
                        editor.configuration.onChange = () => {
                            saveNote(noteId, editor);
                        };
    
                        editor.render(content)
                            .then(() => {
                                console.log("Note content loaded successfully.");
                            })
                            .catch((error) => {
                                console.error("Error rendering note content:", error);
                            });
                    })
                    .catch((error) => {
                        console.error("Error clearing editor content:", error);
                    });
            })
            .catch((error) => {
                console.error("Error loading note:", error);
            });
    }
    
    

    // Función para inicializar el editor
    function initializeEditor(content = {}) {
        if (editor) {
            editor.clear(); // Destruir cualquier instancia previa
        }

        try {
            editor = new EditorJS({
                holder: 'editorjs',
                tools: {
                    header: { // Include the header tool
                        class: Header,
                        config: {
                            placeholder: 'Enter a header',
                            levels: [1, 2, 3, 4],
                            defaultLevel: 2
                        },
                    },
                    list: {
                        class: EditorjsList,
                        inlineToolbar: true,
                        config: {
                            defaultStyle: 'unordered'
                        },
                    },
                    Marker: {
                        class: Marker,
                        shortcut: 'CTRL+SHIFT+M',
                    },
                    toggle: {
                        class: ToggleBlock,
                        inlineToolbar: true,
                    },
                    attaches: {
                        class: AttachesTool,
                        config: {
                          endpoint: 'http://127.0.0.1:5000/uploadFile'
                        }
                    },
                    linkTool: {
                        class: LinkTool,
                        config: {
                          endpoint: 'http://127.0.0.1:5000/fetchUrl',
                        }
                    },
                    code: CodeTool,
                    paragraph: {
                        class: Paragraph,
                        inlineToolbar: true,
                    },
                },
                data: content,
                onChange: () => saveNote(currentNoteId, editor),
                onReady: () => {
                    new Undo({ editor });
                    new DragDrop(editor, "2px solid #fff");
                    const editorHolder = document.getElementById('editorjs');
                    let keySequence = '';

                    editorHolder.addEventListener('keydown', async (event) => {
                        console.log(`Key: ${event.key}, repeat: ${event.repeat}`);

                        // Ignore auto-repeat events
                        if (event.repeat) {
                            return;
                        }

                        // Add the key to the buffer
                        keySequence += event.key;

                        // Check if "hh" was typed
                        if (keySequence.endsWith('hh')) {
                            event.preventDefault();

                            try {
                                // Save the current editor state
                                const blocks = await editor.save();
                                const lastBlockIndex = blocks.blocks.length - 1;

                                // Ensure there is at least one block and it's a paragraph
                                if (blocks.blocks.length > 0 && blocks.blocks[lastBlockIndex].type === 'paragraph') {
                                    const lastBlock = blocks.blocks[lastBlockIndex];
                                
                                    // Replace "hh" in the block's text
                                    const updatedText = lastBlock.data.text.replace(/hh$/, '');
                                
                                    // Delete the last block
                                    editor.blocks.delete(lastBlockIndex);
                                
                                    // Insert a new header block with the updated text
                                    editor.blocks.insert('header', {
                                        text: updatedText,
                                        level: 2, // Specify the header level (e.g., h2)
                                    });
                                }
                                 else {
                                    console.warn('No valid paragraph block to transform into a header.');
                                }
                            } catch (error) {
                                console.error('Error updating block:', error);
                            }

                            // Reset the key buffer
                            keySequence = '';
                        }

                        // Limit the buffer length to avoid growing indefinitely
                        if (keySequence.length > 2) {
                            keySequence = keySequence.slice(-2);
                        }
                    });
                },
            });
        } catch (error) {
            console.error("Error initializing Editor.js:", error);
        }
    }

});

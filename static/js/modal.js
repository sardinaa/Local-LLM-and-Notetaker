class ModalManager {
    constructor() {
        // Create overlay container
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.id = 'modalOverlay';
        this.modalOverlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        document.body.appendChild(this.modalOverlay);
    }
    
    // Helper: convert hex color to hue value (0-360)
    hexToHslHue(hex) {
        hex = hex.replace('#', '');
        if(hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        let r = parseInt(hex.substring(0,2), 16) / 255;
        let g = parseInt(hex.substring(2,4), 16) / 255;
        let b = parseInt(hex.substring(4,6), 16) / 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b), h;
        let d = max - min;
        if(d === 0) {
            h = 0;
        } else if(max === r) {
            h = ((g - b) / d) % 6;
        } else if(max === g) {
            h = (b - r) / d + 2;
        } else {
            h = (r - g) / d + 4;
        }
        h = Math.round(h * 60);
        if(h < 0) h += 360;
        return h;
    }

    // Add a more robust color parser that returns full HSL values
    parseColor(color) {
        // Default values
        let h = 0, s = 100, l = 50;
        
        if (!color) return { h, s, l };
        
        // Extract values from different formats
        if (color.startsWith('#')) {
            // Handle hex
            h = this.hexToHslHue(color);
        } else if (color.startsWith('hsl')) {
            // Extract from HSL format
            const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                h = parseInt(match[1]);
                s = parseInt(match[2]);
                l = parseInt(match[3]);
            }
        } else if (color.startsWith('rgb')) {
            // Convert RGB to HSL
            const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
                const r = parseInt(match[1]) / 255;
                const g = parseInt(match[2]) / 255;
                const b = parseInt(match[3]) / 255;
                
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                l = (max + min) / 2;
                
                if (max === min) {
                    h = s = 0; // achromatic
                } else {
                    const d = max - min;
                    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                    
                    switch (max) {
                        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    
                    h = Math.round(h * 60);
                    s = Math.round(s * 100);
                }
                
                l = Math.round(l * 100);
            }
        }
        
        return { h, s, l };
    }

    // Open the background editor modal:
    // options: { currentColor, imageUrl }
    // onSave: callback receiving { color, gridSelection }
    openBackgroundEditor(options = {}, onSave, onCancel) {
        // Parse the current color to get full HSL values
        const { h: initialHue, s: initialSaturation, l: initialBrightness } = this.parseColor(options.currentColor);
        
        // Initialize values for color tab
        let selectedHue = initialHue;
        let selectedSaturation = initialSaturation;
        let selectedBrightness = initialBrightness;
        
        // Variables for image tab
        let uploadedImageURL = options.imageUrl || '';
        this.selectedGridCell = null;
        
        // Set up modal with tab headers and two panels
        this.modalOverlay.innerHTML = `
            <div id="backgroundModal" style="background:#fff; padding:20px; border-radius:8px; max-width:600px; width:90%; box-shadow:0 2px 10px rgba(0,0,0,0.3);">
                <div id="tabHeaders" style="display:flex; margin-bottom:15px;">
                    <button id="tabColor" style="flex:1; padding:10px; background:#eee; border:none; cursor:pointer;">Color</button>
                    <button id="tabImage" style="flex:1; padding:10px; background:#fff; border:none; cursor:pointer;">Image</button>
                </div>
                <div id="tabContents" style="margin-bottom: 20px;">
                    <div id="colorTab">
                        <div id="colorPickerContainer" style="width:250px; height:250px; display:flex; flex-direction:column; gap:10px; margin: auto;">
                            <div style="display:flex; flex-grow:1; gap:10px;">
                                <div id="modalColorPreview" style="width:40px; height:100%; border:1px solid #ccc; border-radius:4px; background-color: hsl(${initialHue}, ${initialSaturation}%, ${initialBrightness}%);"></div>
                                <div id="modalColorPalette" style="position:relative; flex-grow:1; height:100%; border:1px solid #ccc; border-radius:4px; 
                                      background: linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%, rgba(255,255,255,1) 100%),
                                                  linear-gradient(to right, rgba(255,255,255,1) 0%, hsl(${initialHue},100%,50%) 100%);">
                                    <div id="paletteSelector" style="position:absolute; top: ${100 - selectedBrightness}%; left: ${selectedSaturation}%; 
                                         transform: translate(-50%, -50%); width:12px; height:12px; border:2px solid #fff; border-radius:50%; box-shadow:0 0 2px rgba(0,0,0,0.6); cursor:pointer;"></div>
                                </div>
                            </div>
                            <input type="range" id="modalColorRange" min="0" max="360" value="${initialHue}" 
                                style="width:100%; -webkit-appearance:none; height:12px; border-radius:6px; background: linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red);">
                        </div>
                    </div>
                    <div id="imageTab" style="display:none; text-align:center;">
                        <div class="file-input-container" style="margin-bottom:15px;">
                            <label for="modalImageUpload" class="file-input-label">Choose Image</label>
                            <input id="modalImageUpload" type="file" accept="image/*" style="display:none;">
                            <div id="selectedFileName" style="font-size:0.8rem; margin-top:5px; color:#666; overflow:hidden; text-overflow:ellipsis; max-width:100%;">No file selected</div>
                        </div>
                        <div id="modalImagePreviewContainer" style="position: relative; display: inline-block; max-width:100%; overflow:hidden;">
                            ${uploadedImageURL ? `<img id="modalImagePreview" src="${uploadedImageURL}" style="max-width:100%; display:block;">` : '<img id="modalImagePreview" style="display:none;">'}
                            <div id="gridOverlayContainer" style="position:absolute; top:10%; left:10%; width:80%; height:80%;">
                                <div id="gridOverlay" style="width:100%; height:100%; display:grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); border:2px dashed #3498db;"></div>
                                <div class="resize-handle top-left" style="position:absolute; top:-5px; left:-5px; width:10px; height:10px; background:#3498db; cursor:nwse-resize;"></div>
                                <div class="resize-handle top-right" style="position:absolute; top:-5px; right:-5px; width:10px; height:10px; background:#3498db; cursor:nesw-resize;"></div>
                                <div class="resize-handle bottom-left" style="position:absolute; bottom:-5px; left:-5px; width:10px; height:10px; background:#3498db; cursor:nesw-resize;"></div>
                                <div class="resize-handle bottom-right" style="position:absolute; bottom:-5px; right:-5px; width:10px; height:10px; background:#3498db; cursor:nwse-resize;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="modalCancel" class="modal-btn cancel">Cancel</button>
                    <button id="modalSave" class="modal-btn confirm">Save</button>
                </div>
            </div>
        `;
        
        // Add CSS for the file input button
        const style = document.createElement('style');
        style.textContent = `
            .file-input-label {
                display: inline-block;
                padding: 8px 16px;
                background-color: #3498db;
                color: white;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .file-input-label:hover {
                background-color: #2980b9;
            }
        `;
        document.head.appendChild(style);
        
        // Tab switching logic
        const tabColor = this.modalOverlay.querySelector('#tabColor');
        const tabImage = this.modalOverlay.querySelector('#tabImage');
        const colorTab = this.modalOverlay.querySelector('#colorTab');
        const imageTab = this.modalOverlay.querySelector('#imageTab');
        tabColor.addEventListener('click', () => {
            tabColor.style.background = "#eee";
            tabImage.style.background = "#fff";
            colorTab.style.display = "block";
            imageTab.style.display = "none";
        });
        tabImage.addEventListener('click', () => {
            tabImage.style.background = "#eee";
            tabColor.style.background = "#fff";
            colorTab.style.display = "none";
            imageTab.style.display = "block";
        });
        
        // Color tab event listeners (same as previous)
        const modalColorRange = this.modalOverlay.querySelector('#modalColorRange');
        const modalColorPreview = this.modalOverlay.querySelector('#modalColorPreview');
        const modalColorPalette = this.modalOverlay.querySelector('#modalColorPalette');
        const paletteSelector = this.modalOverlay.querySelector('#paletteSelector');
        modalColorRange.addEventListener('input', () => {
            selectedHue = parseInt(modalColorRange.value);
            modalColorPreview.style.backgroundColor = `hsl(${selectedHue}, ${selectedSaturation}%, ${selectedBrightness}%)`;
            modalColorPalette.style.background = `
                linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%, rgba(255,255,255,1) 100%),
                linear-gradient(to right, rgba(255,255,255,1) 0%, hsl(${selectedHue},100%,50%) 100%)
            `;
        });
        let dragging = false;
        const updateSelector = (e) => {
            const rect = modalColorPalette.getBoundingClientRect();
            let x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
            let y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
            selectedSaturation = Math.round((x / rect.width) * 100);
            selectedBrightness = Math.round(100 - (y / rect.height) * 100);
            paletteSelector.style.left = `${selectedSaturation}%`;
            paletteSelector.style.top = `${100 - selectedBrightness}%`;
            modalColorPreview.style.backgroundColor = `hsl(${selectedHue}, ${selectedSaturation}%, ${selectedBrightness}%)`;
        };
        modalColorPalette.addEventListener('mousedown', (e) => { dragging = true; updateSelector(e); });
        document.addEventListener('mousemove', (e) => { if(dragging) updateSelector(e); });
        document.addEventListener('mouseup', () => { dragging = false; });
        
        // Image tab: File upload handling and grid overlay events
        const modalImageUpload = this.modalOverlay.querySelector('#modalImageUpload');
        const modalImagePreview = this.modalOverlay.querySelector('#modalImagePreview');
        const selectedFileName = this.modalOverlay.querySelector('#selectedFileName');
        const gridOverlay = this.modalOverlay.querySelector('#gridOverlay');
        
        modalImageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    uploadedImageURL = ev.target.result;
                    modalImagePreview.src = uploadedImageURL;
                    modalImagePreview.style.display = "block";
                    selectedFileName.textContent = file.name;
                };
                reader.readAsDataURL(file);
            }
        });
        
        gridOverlay.querySelectorAll('.grid-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                gridOverlay.querySelectorAll('.grid-cell').forEach(c => c.style.backgroundColor = 'transparent');
                cell.style.backgroundColor = 'rgba(52,152,219,0.5)';
                this.selectedGridCell = cell.getAttribute('data-index');
            });
        });
        
        // NEW: Resizing and moving the grid overlay container
        const gridOverlayContainer = this.modalOverlay.querySelector('#gridOverlayContainer');
        let resizing = false, moving = false, currentHandle = null, startX, startY, initialRect;
        const handles = gridOverlayContainer.querySelectorAll('.resize-handle');
        
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                resizing = true;
                currentHandle = handle;
                initialRect = gridOverlayContainer.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
            });
        });
        
        // Move overlay when dragging anywhere in container except on handles
        gridOverlayContainer.addEventListener('mousedown', (e) => {
            if(e.target.classList.contains('resize-handle')) return;
            moving = true;
            initialRect = gridOverlayContainer.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
        });
        
        document.addEventListener('mousemove', (e) => {
            const containerRect = modalImagePreview.getBoundingClientRect();
            if (resizing) {
                const aspectRatio = 16 / 9; // desired aspect ratio (adjust as needed)
                let dx = e.clientX - startX;
                let newWidth, newHeight, newLeft, newTop;
                if (currentHandle.classList.contains('top-left')) {
                    newWidth = initialRect.width - dx;
                    newHeight = newWidth / aspectRatio;
                    newLeft = initialRect.right - newWidth;
                    newTop = initialRect.bottom - newHeight;
                } else if (currentHandle.classList.contains('top-right')) {
                    newWidth = initialRect.width + dx;
                    newHeight = newWidth / aspectRatio;
                    newLeft = initialRect.left;
                    newTop = initialRect.bottom - newHeight;
                } else if (currentHandle.classList.contains('bottom-left')) {
                    newWidth = initialRect.width - dx;
                    newHeight = newWidth / aspectRatio;
                    newLeft = initialRect.right - newWidth;
                    newTop = initialRect.top;
                } else if (currentHandle.classList.contains('bottom-right')) {
                    newWidth = initialRect.width + dx;
                    newHeight = newWidth / aspectRatio;
                    newLeft = initialRect.left;
                    newTop = initialRect.top;
                }
                // Clamp so the overlay doesn't go outside the image preview:
                if (newLeft < containerRect.left) {
                    newLeft = containerRect.left;
                }
                if (newTop < containerRect.top) {
                    newTop = containerRect.top;
                }
                if (newLeft + newWidth > containerRect.right) {
                    newWidth = containerRect.right - newLeft;
                    newHeight = newWidth / aspectRatio;
                }
                if (newTop + newHeight > containerRect.bottom) {
                    newHeight = containerRect.bottom - newTop;
                    newWidth = newHeight * aspectRatio;
                }
                gridOverlayContainer.style.left = (newLeft - containerRect.left) + 'px';
                gridOverlayContainer.style.top = (newTop - containerRect.top) + 'px';
                gridOverlayContainer.style.width = Math.max(20, newWidth) + 'px';
                gridOverlayContainer.style.height = Math.max(20, newHeight) + 'px';
            }
            if (moving) {
                let dx = e.clientX - startX, dy = e.clientY - startY;
                const currentWidth = initialRect.width, currentHeight = initialRect.height;
                let newLeft = initialRect.left + dx;
                let newTop = initialRect.top + dy;
                // Clamp moving so the overlay stays within container boundaries:
                newLeft = Math.max(newLeft, containerRect.left);
                newTop = Math.max(newTop, containerRect.top);
                if (newLeft + currentWidth > containerRect.right) {
                    newLeft = containerRect.right - currentWidth;
                }
                if (newTop + currentHeight > containerRect.bottom) {
                    newTop = containerRect.bottom - currentHeight;
                }
                gridOverlayContainer.style.left = (newLeft - containerRect.left) + 'px';
                gridOverlayContainer.style.top = (newTop - containerRect.top) + 'px';
            }
        });
        document.addEventListener('mouseup', () => { resizing = false; moving = false; });
        
        // Save / Cancel handling depending on active tab
        const modalSave = this.modalOverlay.querySelector('#modalSave');
        const modalCancel = this.modalOverlay.querySelector('#modalCancel');
        modalSave.addEventListener('click', () => {
            if(colorTab.style.display !== "none") {
                const color = `hsl(${selectedHue}, ${selectedSaturation}%, ${selectedBrightness}%)`;
                if (onSave) onSave({ color, gridSelection: null });
            } else {
                // Compute cropping coordinates relative to modalImagePreview boundaries:
                const containerRect = modalImagePreview.getBoundingClientRect();
                const overlayRect = gridOverlayContainer.getBoundingClientRect();
                const left = ((overlayRect.left - containerRect.left) / containerRect.width) * 100;
                const top = ((overlayRect.top - containerRect.top) / containerRect.height) * 100;
                const width = (overlayRect.width / containerRect.width) * 100;
                const height = (overlayRect.height / containerRect.height) * 100;
                if (onSave) onSave({ imageUrl: uploadedImageURL, gridSelection: { left, top, width, height } });
                // NEW: Update note header background with the selected part of the image:
                const noteHeader = document.querySelector('.note-header');
                if (noteHeader) {
                    noteHeader.style.backgroundImage = `url(${uploadedImageURL})`;
                    noteHeader.style.backgroundPosition = `${left}% ${top}%`;
                    noteHeader.style.backgroundSize = 'cover';
                }
            }
            this.closeModal();
        });
        modalCancel.addEventListener('click', () => {
            if (onCancel) onCancel();
            this.closeModal();
        });
        
        this.modalOverlay.style.display = 'flex';
    }
    
    // New method for confirmation dialogs
    showConfirmationDialog(options = {}) {
        const title = options.title || 'Confirmation';
        const message = options.message || 'Are you sure you want to proceed?';
        const confirmText = options.confirmText || 'Confirm';
        const cancelText = options.cancelText || 'Cancel';
        const confirmClass = options.isDelete ? 'delete-confirm' : 'confirm';
        const icon = options.isDelete ? 'trash-alt' : options.icon || 'question-circle';
        
        this.modalOverlay.innerHTML = `
            <div class="confirmation-modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                </div>
                <div class="modal-body">
                    <div class="modal-icon">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button id="modalCancelBtn" class="modal-btn cancel">${cancelText}</button>
                    <button id="modalConfirmBtn" class="modal-btn ${confirmClass}">${confirmText}</button>
                </div>
            </div>
        `;
        
        return new Promise((resolve) => {
            const confirmBtn = this.modalOverlay.querySelector('#modalConfirmBtn');
            const cancelBtn = this.modalOverlay.querySelector('#modalCancelBtn');
            
            confirmBtn.addEventListener('click', () => {
                this.closeModal();
                resolve(true);
            });
            
            cancelBtn.addEventListener('click', () => {
                this.closeModal();
                resolve(false);
            });
            
            // Close on clicking the overlay
            this.modalOverlay.addEventListener('click', (e) => {
                if (e.target === this.modalOverlay) {
                    this.closeModal();
                    resolve(false);
                }
            }, { once: true });
            
            this.modalOverlay.style.display = 'flex';
        });
    }
    
    // New method for input dialogs
    showInputDialog(options = {}) {
        const title = options.title || 'Input';
        const label = options.label || '';
        const confirmText = options.confirmText || 'Save';
        const cancelText = options.cancelText || 'Cancel';
        const initialValue = options.initialValue || '';
        const icon = options.icon || 'edit';
        
        this.modalOverlay.innerHTML = `
            <div class="confirmation-modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                </div>
                <div class="modal-body">
                    <div class="modal-icon">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div class="input-container">
                        <label for="modalInput">${label}</label>
                        <input type="text" id="modalInput" value="${initialValue}" class="modal-input">
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="modalCancelBtn" class="modal-btn cancel">${cancelText}</button>
                    <button id="modalConfirmBtn" class="modal-btn confirm">${confirmText}</button>
                </div>
            </div>
        `;
        
        return new Promise((resolve) => {
            const input = this.modalOverlay.querySelector('#modalInput');
            const confirmBtn = this.modalOverlay.querySelector('#modalConfirmBtn');
            const cancelBtn = this.modalOverlay.querySelector('#modalCancelBtn');
            
            // Focus on the input field
            setTimeout(() => input.focus(), 100);
            
            // Submit on Enter key
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.closeModal();
                    resolve(input.value);
                }
            });
            
            confirmBtn.addEventListener('click', () => {
                this.closeModal();
                resolve(input.value);
            });
            
            cancelBtn.addEventListener('click', () => {
                this.closeModal();
                resolve(null);
            });
            
            // Close on clicking the overlay
            this.modalOverlay.addEventListener('click', (e) => {
                if (e.target === this.modalOverlay) {
                    this.closeModal();
                    resolve(null);
                }
            }, { once: true });
            
            this.modalOverlay.style.display = 'flex';
        });
    }

    // New method for showing note selector modal
    showNoteSelector(notes, onSelect) {
        // Create a flattened array of notes (exclude folders)
        const flattenedNotes = this.flattenNotes(notes);
        
        this.modalOverlay.innerHTML = `
            <div class="note-selector-modal">
                <div class="modal-header">
                    <h3>Select Destination Note</h3>
                    <span class="modal-close">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="note-search-container">
                        <input type="text" id="noteSearchInput" placeholder="Search notes..." class="modal-input">
                    </div>
                    <div class="notes-list-container">
                        <ul class="notes-list" id="notesList">
                            ${flattenedNotes.map(note => 
                                `<li class="note-item" data-id="${note.id}">
                                    <i class="fas fa-file-alt"></i>
                                    <span>${note.name}</span>
                                </li>`
                            ).join('')}
                        </ul>
                        ${flattenedNotes.length === 0 ? 
                            '<div class="no-notes-message">No notes available. Create a note first.</div>' : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancelNoteSelect" class="modal-btn cancel">Cancel</button>
                    <button id="confirmNoteSelect" class="modal-btn confirm" disabled>Send to Note</button>
                </div>
            </div>
        `;
        
        const modalClose = this.modalOverlay.querySelector('.modal-close');
        const cancelBtn = this.modalOverlay.querySelector('#cancelNoteSelect');
        const confirmBtn = this.modalOverlay.querySelector('#confirmNoteSelect');
        const searchInput = this.modalOverlay.querySelector('#noteSearchInput');
        const notesList = this.modalOverlay.querySelector('#notesList');
        
        // Handle note search
        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const noteItems = notesList.querySelectorAll('.note-item');
            
            noteItems.forEach(item => {
                const noteName = item.querySelector('span').textContent.toLowerCase();
                if (noteName.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
        
        // Handle note selection
        let selectedNoteId = null;
        notesList.addEventListener('click', (e) => {
            const noteItem = e.target.closest('.note-item');
            if (!noteItem) return;
            
            // Remove selection from previously selected item
            const prevSelected = notesList.querySelector('.selected');
            if (prevSelected) {
                prevSelected.classList.remove('selected');
            }
            
            // Add selection to clicked item
            noteItem.classList.add('selected');
            selectedNoteId = noteItem.dataset.id;
            
            // Enable the confirm button
            confirmBtn.disabled = false;
        });
        
        // Handle double-click to immediately select and confirm
        notesList.addEventListener('dblclick', (e) => {
            const noteItem = e.target.closest('.note-item');
            if (!noteItem) return;
            
            selectedNoteId = noteItem.dataset.id;
            this.closeModal();
            if (onSelect) onSelect(selectedNoteId);
        });
        
        // Handle cancel button
        cancelBtn.addEventListener('click', () => {
            this.closeModal();
            if (onSelect) onSelect(null);
        });
        
        // Handle confirm button
        confirmBtn.addEventListener('click', () => {
            this.closeModal();
            if (onSelect) onSelect(selectedNoteId);
        });
        
        // Handle close button
        modalClose.addEventListener('click', () => {
            this.closeModal();
            if (onSelect) onSelect(null);
        });
        
        // Close on clicking the overlay
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) {
                this.closeModal();
                if (onSelect) onSelect(null);
            }
        }, { once: true });
        
        // Focus the search input
        setTimeout(() => searchInput.focus(), 100);
        
        // Show the modal
        this.modalOverlay.style.display = 'flex';
    }
    
    // Helper method to flatten notes hierarchy (exclude folders)
    flattenNotes(nodes, result = []) {
        if (!nodes) return result;
        
        for (const node of nodes) {
            if (node.type === 'note') {
                result.push({
                    id: node.id,
                    name: node.name
                });
            }
            
            // If this node has children, recurse into them
            if (node.children && node.children.length > 0) {
                this.flattenNotes(node.children, result);
            }
        }
        
        return result;
    }

    // New method for showing a note submenu
    showNoteSubmenu(anchorEl, notes, onSelect) {
        // Create a flattened array of notes (exclude folders)
        const flattenedNotes = this.flattenNotes(notes);
        
        // Create submenu container
        const submenu = document.createElement('div');
        submenu.className = 'note-submenu';
        submenu.innerHTML = `
            <div class="note-search-container">
                <input type="text" class="note-search-input" placeholder="Search notes...">
            </div>
            <div class="notes-list-container">
                <ul class="notes-list">
                    ${flattenedNotes.map(note => 
                        `<li class="note-item" data-id="${note.id}">
                            <i class="fas fa-file-alt"></i>
                            <span>${note.name}</span>
                        </li>`
                    ).join('')}
                </ul>
                ${flattenedNotes.length === 0 ? 
                    '<div class="no-notes-message">No notes available</div>' : ''}
            </div>
        `;
        
        // Add submenu to the document with absolute positioning but invisible
        // to calculate its dimensions
        submenu.style.position = 'fixed';
        submenu.style.visibility = 'hidden';
        document.body.appendChild(submenu);
        
        // Get dimensions for smart positioning
        const rect = anchorEl.getBoundingClientRect();
        const submenuHeight = submenu.offsetHeight;
        const submenuWidth = submenu.offsetWidth;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Smart positioning - check if there's enough space below
        let topPos, leftPos;
        
        // Vertical positioning
        const spaceBelowAnchor = viewportHeight - rect.bottom;
        if (spaceBelowAnchor < submenuHeight && rect.top > submenuHeight) {
            // Not enough space below but enough space above - position above
            topPos = rect.top - submenuHeight;
        } else {
            // Enough space below or not enough space above - position below
            topPos = Math.min(rect.bottom + 5, viewportHeight - submenuHeight - 5);
        }
        
        // Horizontal positioning - ensure it doesn't go offscreen
        leftPos = Math.max(5, Math.min(rect.left, viewportWidth - submenuWidth - 5));
        
        // Apply the calculated position
        submenu.style.top = `${topPos}px`;
        submenu.style.left = `${leftPos}px`;
        submenu.style.zIndex = '1050';
        submenu.style.visibility = 'visible';
        
        // Focus the search input
        const searchInput = submenu.querySelector('.note-search-input');
        setTimeout(() => searchInput.focus(), 10);
        
        // Handle note search
        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const noteItems = submenu.querySelectorAll('.note-item');
            
            noteItems.forEach(item => {
                const noteName = item.querySelector('span').textContent.toLowerCase();
                if (noteName.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
        
        // Handle note selection
        const notesList = submenu.querySelector('.notes-list');
        notesList.addEventListener('click', (e) => {
            const noteItem = e.target.closest('.note-item');
            if (!noteItem) return;
            
            const selectedNoteId = noteItem.dataset.id;
            closeSubmenu();
            if (onSelect) onSelect(selectedNoteId);
        });
        
        // Handle keyboard navigation and selection
        searchInput.addEventListener('keydown', (e) => {
            const noteItems = Array.from(submenu.querySelectorAll('.note-item')).filter(
                item => item.style.display !== 'none'
            );
            
            // Get currently selected item
            const selectedItem = submenu.querySelector('.note-item.selected');
            let selectedIndex = selectedItem ? noteItems.indexOf(selectedItem) : -1;
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (selectedIndex < noteItems.length - 1) {
                        if (selectedItem) selectedItem.classList.remove('selected');
                        noteItems[selectedIndex + 1].classList.add('selected');
                        noteItems[selectedIndex + 1].scrollIntoView({ block: 'nearest' });
                    }
                    break;
                    
                case 'ArrowUp':
                    e.preventDefault();
                    if (selectedIndex > 0) {
                        if (selectedItem) selectedItem.classList.remove('selected');
                        noteItems[selectedIndex - 1].classList.add('selected');
                        noteItems[selectedIndex - 1].scrollIntoView({ block: 'nearest' });
                    }
                    break;
                    
                case 'Enter':
                    e.preventDefault();
                    if (selectedItem) {
                        const selectedNoteId = selectedItem.dataset.id;
                        closeSubmenu();
                        if (onSelect) onSelect(selectedNoteId);
                    } else if (noteItems.length > 0) {
                        // Select the first visible item if none selected
                        const selectedNoteId = noteItems[0].dataset.id;
                        closeSubmenu();
                        if (onSelect) onSelect(selectedNoteId);
                    }
                    break;
                    
                case 'Escape':
                    e.preventDefault();
                    closeSubmenu();
                    break;
            }
        });
        
        // Close when clicking outside
        function handleClickOutside(e) {
            if (!submenu.contains(e.target) && e.target !== anchorEl) {
                closeSubmenu();
            }
        }
        
        // Function to close the submenu
        function closeSubmenu() {
            document.removeEventListener('mousedown', handleClickOutside);
            submenu.remove();
        }
        
        // Add click outside event listener
        document.addEventListener('mousedown', handleClickOutside);
        
        // Return the submenu element in case more manipulation is needed
        return submenu;
    }

    // New method for showing toast notifications
    showToast(options = {}) {
        const message = options.message || 'Operation completed successfully';
        const type = options.type || 'success';
        const duration = options.duration || 3000; // default 3 seconds
        const icon = options.icon || this.getToastIconForType(type);
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="toast-icon fas fa-${icon}"></i>
                <span class="toast-message">${message}</span>
            </div>
        `;
        
        // Create or get toast container
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            document.body.appendChild(toastContainer);
        }
        
        // Add toast to container
        toastContainer.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Auto remove after duration
        setTimeout(() => {
            toast.classList.remove('show');
            // Remove from DOM after animation completes
            setTimeout(() => {
                if (toast.parentElement === toastContainer) {
                    toastContainer.removeChild(toast);
                }
                // Remove container if empty
                if (toastContainer.children.length === 0) {
                    toastContainer.remove();
                }
            }, 300);
        }, duration);
        
        return toast;
    }
    
    // Helper to get appropriate icon for toast type
    getToastIconForType(type) {
        switch (type) {
            case 'success':
                return 'check-circle';
            case 'error':
                return 'exclamation-circle';
            case 'warning':
                return 'exclamation-triangle';
            case 'info':
                return 'info-circle';
            default:
                return 'bell';
        }
    }

    closeModal() {
        this.modalOverlay.style.display = 'none';
    }
}

window.ModalManager = ModalManager;
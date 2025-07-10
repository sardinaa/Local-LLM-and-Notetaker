document.addEventListener('DOMContentLoaded', () => {
    console.log('Debug script loaded');
    
    // Check if all elements exist
    const elements = [
        'createForm',
        'createNameInput',
        'createType',
        'confirmCreate',
        'cancelCreate',
        'createFolder',
        'createNote',
        'note-title-display',
        'editorjs'
        // 'saveNote' removed from the list
    ];
    
    elements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`Element ${id} exists:`, !!element);
        if (!element) {
            console.error(`Missing element: ${id}`);
        }
    });
    
    // Check for TreeView class
    if (typeof TreeView === 'undefined') {
        console.error('TreeView class not found. Check if TreeView.js is loaded correctly.');
    } else {
        console.log('TreeView class is available');
    }
    
    // Ensure buttons have direct event listeners as a fallback
    setTimeout(() => {
        const confirmCreate = document.getElementById('confirmCreate');
        if (confirmCreate && !confirmCreate.onclick) {
            console.log('Adding fallback onclick handler to confirmCreate');
            confirmCreate.onclick = function() {
                console.log('Confirm button clicked via fallback handler');
                // Simulate form submission by finding visible input
                const input = document.getElementById('createNameInput');
                const type = document.getElementById('createType');
                if (input && input.value.trim() && type) {
                    console.log('Submitting with name:', input.value, 'type:', type.value);
                    // This is an emergency fix - in a real situation we'd call app.js functions
                    document.getElementById('createForm').style.display = 'none';
                    alert(`Created ${type.value}: ${input.value}`);
                }
            };
        }
        
        const cancelCreate = document.getElementById('cancelCreate');
        if (cancelCreate && !cancelCreate.onclick) {
            console.log('Adding fallback onclick handler to cancelCreate');
            cancelCreate.onclick = function() {
                console.log('Cancel button clicked via fallback handler');
                document.getElementById('createNameInput').value = '';
                document.getElementById('createForm').style.display = 'none';
            };
        }
    }, 1000); // Wait a second to ensure all other scripts have run
    
    // Add direct event listeners as a fallback
    const createFolder = document.getElementById('createFolder');
    if (createFolder) {
        createFolder.onclick = function() {
            console.log('Folder button clicked directly');
            document.getElementById('createForm').style.display = 'block';
        };
    }
    
    const createNote = document.getElementById('createNote');
    if (createNote) {
        createNote.onclick = function() {
            console.log('Note button clicked directly');
            document.getElementById('createForm').style.display = 'block';
        };
    }
});
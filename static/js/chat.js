document.addEventListener('DOMContentLoaded', () => {
    // Tab switching logic
    const notesTabBtn = document.getElementById('notesTabBtn');
    const chatTabBtn = document.getElementById('chatTabBtn');
    const notesSection = document.getElementById('notesSection');
    const chatSection = document.getElementById('chatSection');

    // Track the current chat id and get reference to chatTreeView
    let currentChatId = null;
    let chatTreeView = null;

    // Initialize references after a short delay to ensure app.js has run
    setTimeout(() => {
        // Get reference to the chatTreeView
        if (window.chatTreeView) {
            chatTreeView = window.chatTreeView;
        }
    }, 500);

    notesTabBtn.addEventListener('click', () => {
        notesTabBtn.classList.add('active');
        chatTabBtn.classList.remove('active');
        notesSection.style.display = 'block';
        chatSection.style.display = 'block'; // keep overall content height consistent
        chatSection.style.display = 'none';
    });

    chatTabBtn.addEventListener('click', () => {
        chatTabBtn.classList.add('active');
        notesTabBtn.classList.remove('active');
        notesSection.style.display = 'none';
        chatSection.style.display = 'block';
    });

    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatMessages = document.getElementById('chatMessages');
    const voiceChatBtn = document.getElementById('voiceChatBtn');
    
    // Initialize audio transcription
    const audioTranscription = new AudioTranscriptionManager(chatInput);
    audioTranscription.init('chatRecordBtn');

    // Set up voice chat button handler (the actual functionality is in voiceChat.js)
    if (voiceChatBtn) {
        voiceChatBtn.title = "Start voice conversation";
    }

    // Check if marked library is available
    if (!window.marked) {
        console.error("Marked library not loaded. Please add it to your HTML.");
        // Add the script to the document if it's missing
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
        document.head.appendChild(script);
    }

    // Check if highlight.js is available
    if (!window.hljs) {
        console.error("Highlight.js not loaded. Please add it to your HTML.");
        // Add the script to the document if it's missing
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js";
        document.head.appendChild(script);
        
        // Add a default style if not present
        const link = document.createElement('link');
        link.rel = "stylesheet";
        link.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css";
        document.head.appendChild(link);
    }

    // Function to add copy button to code blocks
    function addCopyButtonsToCodeBlocks(container) {
        const codeBlocks = container.querySelectorAll('pre code');
        codeBlocks.forEach(codeBlock => {
            // Create a copy button
            const copyButton = document.createElement('button');
            copyButton.className = 'code-copy-btn';
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
            copyButton.title = 'Copy to clipboard';
            
            // Add the button to the parent pre element
            const preElement = codeBlock.parentElement;
            preElement.style.position = 'relative';
            preElement.appendChild(copyButton);
            
            // Position the button in the upper-right corner
            copyButton.style.position = 'absolute';
            copyButton.style.top = '5px';
            copyButton.style.right = '5px';
            copyButton.style.background = 'rgba(0,0,0,0.3)';
            copyButton.style.color = '#fff';
            copyButton.style.border = 'none';
            copyButton.style.borderRadius = '3px';
            copyButton.style.width = '30px';
            copyButton.style.height = '30px';
            copyButton.style.display = 'flex';
            copyButton.style.alignItems = 'center';
            copyButton.style.justifyContent = 'center';
            copyButton.style.cursor = 'pointer';
            copyButton.style.transition = 'background-color 0.2s';
            
            // Add click event listener to copy code
            copyButton.addEventListener('click', () => {
                const codeText = codeBlock.textContent;
                navigator.clipboard.writeText(codeText)
                    .then(() => {
                        // Visual feedback on successful copy
                        copyButton.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy text: ', err);
                        copyButton.innerHTML = '<i class="fas fa-times"></i>';
                        setTimeout(() => {
                            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 1500);
                    });
            });
            
            // Add hover effect
            copyButton.addEventListener('mouseover', () => {
                copyButton.style.background = 'rgba(0,0,0,0.5)';
            });
            
            copyButton.addEventListener('mouseout', () => {
                copyButton.style.background = 'rgba(0,0,0,0.3)';
            });
        });
    }

    // Configure marked for safety and better formatting with code highlighting
    if (window.marked) {
        marked.setOptions({
            breaks: true,        // Add line breaks when \n is encountered
            gfm: true,           // Use GitHub Flavored Markdown
            headerIds: false,    // Don't add ids to headers for security
            mangle: false,       // Don't mangle email addresses
            sanitize: false,     // Handle sanitization at our level for more control
            highlight: function(code, language) {
                // Use highlight.js for syntax highlighting if available
                if (window.hljs && language) {
                    try {
                        return hljs.highlight(code, {language}).value;
                    } catch (e) {
                        console.warn('Error highlighting code:', e);
                    }
                }
                return code; // Return original code if highlighting fails
            }
        });
    }

    // Helper: append message to chat (modified for better markdown and code highlighting)
    function appendMessage(text, sender, autoSave = true, messageIndex = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message ' + sender;
        
        // Parse the text with marked if available, otherwise use the raw text
        let formattedText = text;
        if (window.marked) {
            // Replace basic markdown patterns to help with formatting
            text = text.replace(/\* /g, '- '); // Convert * lists to - for better markdown parsing
            
            // Format the text using marked
            formattedText = marked.parse(text);
        }
        
        if (sender === 'user') {
            // Restructured to ensure proper ordering of elements
            msgDiv.innerHTML = `
                <div class="edit-message-btn"><i class="fas fa-pencil-alt"></i></div>
                <div class="chat-text" data-original-text="${text.replace(/"/g, '&quot;')}">${formattedText}</div>
                <div class="chat-icon">
                    <i class="fas fa-user"></i>
                </div>
            `;
            
            // Add edit functionality to user messages
            const editBtn = msgDiv.querySelector('.edit-message-btn');
            const chatTextDiv = msgDiv.querySelector('.chat-text');
            
            editBtn.addEventListener('click', function() {
                if (!editBtn.classList.contains('editing')) {
                    // Start editing
                    startMessageEditing(msgDiv, text);
                } else {
                    // Save changes
                    const editTextarea = msgDiv.querySelector('.edit-textarea');
                    confirmMessageEdit(msgDiv, editTextarea.value, messageIndex);
                }
            });
            
        } else {
            // Bot message structure with added response action buttons
            msgDiv.innerHTML = `
                <div class="chat-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="chat-text">${formattedText}</div>
                <div class="response-actions">
                    <button class="response-action-btn regenerate-btn" title="Regenerate response">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="response-action-btn copy-btn" title="Copy response">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="response-action-btn listen-btn" title="Listen to response">
                        <i class="fas fa-volume-up"></i>
                    </button>
                    <button class="response-action-btn send-to-note-btn" title="Send to note">
                        <i class="fas fa-file-export"></i>
                    </button>
                </div>
            `;
            
            // Add functionality to regenerate button
            const regenerateBtn = msgDiv.querySelector('.regenerate-btn');
            regenerateBtn.addEventListener('click', function() {
                // Find the previous user message
                let userMessage = msgDiv.previousElementSibling;
                while (userMessage && !userMessage.classList.contains('user')) {
                    userMessage = userMessage.previousElementSibling;
                }
                
                if (userMessage) {
                    const userText = userMessage.querySelector('.chat-text').getAttribute('data-original-text');
                    
                    // Remove current bot response
                    msgDiv.remove();
                    
                    // Show loading indicator
                    const loadingDiv = document.createElement('div');
                    loadingDiv.className = 'chat-message bot loading';
                    loadingDiv.innerHTML = `
                        <div class="chat-icon">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="chat-text">Generating response...</div>
                    `;
                    chatMessages.appendChild(loadingDiv);
                    
                    // Call API to regenerate response
                    fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: userText, regenerate: true })
                    })
                    .then(response => response.json())
                    .then(data => {
                        // Remove loading message
                        loadingDiv.remove();
                        // Add new response
                        appendMessage(data.response, 'bot');
                    })
                    .catch(error => {
                        // Remove loading message
                        loadingDiv.remove();
                        appendMessage('Error regenerating response.', 'bot');
                        console.error(error);
                    });
                }
            });
            
            // Add functionality to copy button
            const copyBtn = msgDiv.querySelector('.copy-btn');
            copyBtn.addEventListener('click', function() {
                // Get the original markdown text
                const originalText = text;
                
                // Copy to clipboard
                navigator.clipboard.writeText(originalText)
                    .then(() => {
                        // Visual feedback on successful copy
                        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy text: ', err);
                        copyBtn.innerHTML = '<i class="fas fa-times"></i>';
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 1500);
                    });
            });
            
            // Add functionality to listen button
            const listenBtn = msgDiv.querySelector('.listen-btn');
            listenBtn.addEventListener('click', function() {
                // Check if window.textToSpeech is available
                if (!window.textToSpeech) {
                    console.error('Text-to-speech manager not available');
                    return;
                }
                
                // If already speaking this response, stop it
                if (window.textToSpeech.isSpeaking() && msgDiv.classList.contains('speaking')) {
                    window.textToSpeech.stop();
                    msgDiv.classList.remove('speaking');
                    listenBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                    listenBtn.title = "Listen to response";
                    return;
                }
                
                // Stop any current speech first
                window.textToSpeech.stop();
                
                // Remove speaking class from any other message
                document.querySelectorAll('.chat-message.speaking').forEach(msg => {
                    msg.classList.remove('speaking');
                    const btn = msg.querySelector('.listen-btn');
                    if (btn) {
                        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
                        btn.title = "Listen to response";
                    }
                });
                
                // Get the original markdown text
                const originalText = text;
                
                // Start speech
                window.textToSpeech.speak(
                    originalText,
                    // onStart callback
                    () => {
                        msgDiv.classList.add('speaking');
                        listenBtn.innerHTML = '<i class="fas fa-stop"></i>';
                        listenBtn.title = "Stop speaking";
                    },
                    // onEnd callback
                    () => {
                        msgDiv.classList.remove('speaking');
                        listenBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                        listenBtn.title = "Listen to response";
                    },
                    // onError callback
                    (error) => {
                        console.error('Speech error:', error);
                        msgDiv.classList.remove('speaking');
                        listenBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                        listenBtn.title = "Listen to response";
                        
                        // Show error toast or notification
                        if (window.modalManager) {
                            window.modalManager.showConfirmationDialog({
                                title: 'Text-to-Speech Error',
                                message: error || 'Failed to read response aloud.',
                                confirmText: 'OK',
                                icon: 'exclamation-triangle'
                            });
                        }
                    }
                );
            });
            
            // Add functionality to send-to-note button
            const sendToNoteBtn = msgDiv.querySelector('.send-to-note-btn');
            sendToNoteBtn.addEventListener('click', function() {
                // Get the original markdown text
                const originalText = text;
                
                // Initialize modalManager if needed
                if (!window.modalManager) {
                    window.modalManager = new ModalManager();
                }
                
                // Get notes tree
                const notesTree = window.noteTreeView ? window.noteTreeView.nodes : [];
                
                // Show the note submenu instead of full modal
                window.modalManager.showNoteSubmenu(sendToNoteBtn, notesTree, (selectedNoteId) => {
                    if (selectedNoteId) {
                        sendMarkdownToNote(originalText, selectedNoteId);
                    }
                });
            });
        }
        
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Apply syntax highlighting to any code blocks that were just added
        if (window.hljs) {
            msgDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }

        // Add copy buttons to code blocks
        addCopyButtonsToCodeBlocks(msgDiv);
        
        // Save the message only when autoSave is true (i.e. not loading history)
        if (autoSave && currentChatId && chatTreeView) {
            saveMessageToChat(text, sender);
        }
        
        return msgDiv;
    }
    
    // Function to show note selector modal
    function showNoteSelectorModal(markdownText) {
        if (!window.modalManager) {
            window.modalManager = new ModalManager();
        }
        
        const notesTree = window.noteTreeView ? window.noteTreeView.nodes : [];
        
        window.modalManager.showNoteSelector(notesTree, (selectedNoteId) => {
            if (selectedNoteId) {
                sendMarkdownToNote(markdownText, selectedNoteId);
            }
        });
    }
    
    // Function to convert markdown to EditorJS format and append to a note
    function sendMarkdownToNote(markdownText, noteId) {
        // First convert markdown to EditorJS blocks format
        const editorJsBlocks = convertMarkdownToEditorJS(markdownText);
        
        if (!editorJsBlocks || !editorJsBlocks.length) {
            console.error("Failed to convert markdown to EditorJS format");
            return;
        }
        
        // Get the note node from the tree view
        const noteNode = window.noteTreeView.findNodeById(window.noteTreeView.nodes, noteId);
        if (!noteNode) {
            console.error("Note not found:", noteId);
            return;
        }
        
        // Get the current note content
        let noteContent = noteNode.content;
        if (!noteContent) {
            noteContent = { blocks: [] };
        }
        
        // Append the new blocks to the note content
        noteContent.blocks = noteContent.blocks.concat(editorJsBlocks);
        
        // Update the note content in the tree
        window.noteTreeView.updateNode(noteId, { content: noteContent });
        
        // If the note is currently open in the editor, update the editor
        if (window.editorInstance && window.editorInstance.currentNoteId === noteId) {
            window.editorInstance.render(noteContent);
        }
        
        // Save the updated note to backend
        saveToBackend(noteId, noteNode.name, noteContent);
        
        // Show a toast notification instead of a confirmation dialog
        if (window.modalManager) {
            window.modalManager.showToast({
                message: `Content added to "${noteNode.name}"`,
                type: 'success',
                duration: 3000
            });
        }
    }
    
    // Function to convert markdown to EditorJS blocks
    function convertMarkdownToEditorJS(markdownText) {
        const blocks = [];
        
        // Split the markdown into lines
        const lines = markdownText.split('\n');
        
        let currentCodeBlock = null;
        let currentListItems = [];
        let currentListType = null; // 'ordered' or 'unordered'
        
        // Process each line
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // If we're in a code block, check if this line ends it
            if (currentCodeBlock !== null) {
                if (line.trim() === '```') {
                    // End of code block
                    blocks.push({
                        type: 'code',
                        data: {
                            code: currentCodeBlock.code,
                            language: currentCodeBlock.language || 'plaintext'
                        }
                    });
                    currentCodeBlock = null;
                } else {
                    // Add this line to the current code block
                    currentCodeBlock.code += line + '\n';
                }
                continue;
            }
            
            // Check if this line starts a code block
            const codeBlockMatch = line.trim().match(/^```(\w*)$/);
            if (codeBlockMatch) {
                // Start a code block
                currentCodeBlock = {
                    code: '',
                    language: codeBlockMatch[1] || 'plaintext'
                };
                continue;
            }
            
            // Check for list items
            const unorderedListMatch = line.trim().match(/^[-*]\s+(.+)$/);
            const orderedListMatch = line.trim().match(/^\d+\.\s+(.+)$/);
            
            if (unorderedListMatch) {
                // Unordered list item
                if (currentListType && currentListType !== 'unordered') {
                    // Previous list was different type, flush it
                    flushCurrentList();
                }
                
                currentListType = 'unordered';
                currentListItems.push({
                    content: processInlineFormatting(unorderedListMatch[1]),
                    items: []
                });
                continue;
            } else if (orderedListMatch) {
                // Ordered list item
                if (currentListType && currentListType !== 'ordered') {
                    // Previous list was different type, flush it
                    flushCurrentList();
                }
                
                currentListType = 'ordered';
                currentListItems.push({
                    content: processInlineFormatting(orderedListMatch[1]),
                    items: []
                });
                continue;
            } else if (currentListItems.length > 0) {
                // We're no longer in a list, flush the current list
                flushCurrentList();
            }
            
            // Check for headers
            const headerMatch = line.trim().match(/^(#{1,6})\s+(.+)$/);
            if (headerMatch) {
                // It's a header
                const level = headerMatch[1].length;
                const text = headerMatch[2];
                blocks.push({
                    type: 'header',
                    data: {
                        text: text,
                        level: level
                    }
                });
                continue;
            }
            
            // Check for horizontal rule
            if (line.trim().match(/^([-*_])\1{2,}$/)) {
                // It's a horizontal rule (not directly supported by EditorJS)
                // Add as a delimiter (closest equivalent)
                blocks.push({
                    type: 'delimiter',
                    data: {}
                });
                continue;
            }
            
            // Check for quotes
            const quoteMatch = line.trim().match(/^>\s+(.+)$/);
            if (quoteMatch) {
                // It's a quote
                blocks.push({
                    type: 'quote',
                    data: {
                        text: quoteMatch[1],
                        caption: ''
                    }
                });
                continue;
            }
            
            // Plain paragraph (skip empty lines)
            if (line.trim()) {
                blocks.push({
                    type: 'paragraph',
                    data: {
                        text: processInlineFormatting(line)
                    }
                });
            }
        }
        
        // Flush any remaining list
        if (currentListItems.length > 0) {
            flushCurrentList();
        }
        
        // Helper function to flush current list items into a block
        function flushCurrentList() {
            if (currentListItems.length > 0) {
                blocks.push({
                    type: 'list',
                    data: {
                        style: currentListType === 'ordered' ? 'ordered' : 'unordered',
                        items: currentListItems.map(item => item.content)
                    }
                });
                
                currentListItems = [];
                currentListType = null;
            }
        }
        
        return blocks;
    }
    
    // Helper function to process inline formatting (e.g., bold, italic)
    function processInlineFormatting(text) {
        // Replace bold (**text** or __text__) with <b>text</b>
        text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        text = text.replace(/__(.*?)__/g, '<b>$1</b>');
        
        // Replace italic (*text* or _text_) with <i>text</i>
        text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
        text = text.replace(/_(.*?)_/g, '<i>$1</i>');
        
        return text;
    }
    
    // Helper function to save note to backend
    function saveToBackend(noteId, title, content) {
        fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: noteId, title, content })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save note');
            }
            console.log('Note saved successfully!');
        })
        .catch(error => {
            console.error('Error saving note:', error);
        });
    }

    // Function to start editing a message
    function startMessageEditing(msgDiv, originalText) {
        const editBtn = msgDiv.querySelector('.edit-message-btn');
        const chatTextDiv = msgDiv.querySelector('.chat-text');
        
        // Change edit button to confirm button
        editBtn.innerHTML = '<i class="fas fa-check"></i>';
        editBtn.classList.add('editing');
        
        // Add cancel button
        const cancelBtn = document.createElement('div');
        cancelBtn.className = 'cancel-edit-btn';
        cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
        msgDiv.insertBefore(cancelBtn, editBtn.nextSibling);
        
        // Store original content, dimensions and computed styles
        const originalContent = chatTextDiv.innerHTML;
        const computedStyle = window.getComputedStyle(chatTextDiv);
        const originalWidth = chatTextDiv.offsetWidth;
        const originalHeight = chatTextDiv.offsetHeight;
        
        // Add editing class before changing content
        chatTextDiv.classList.add('editing');
        
        // Create textarea with exact sizing
        const textarea = document.createElement('textarea');
        textarea.className = 'edit-textarea';
        textarea.value = originalText;
        
        // Force exact same dimensions as original container
        textarea.style.width = originalWidth + 'px';
        textarea.style.minHeight = originalHeight + 'px';
        
        // Clear and append textarea
        chatTextDiv.innerHTML = '';
        chatTextDiv.appendChild(textarea);
        textarea.focus();
        
        // Position cursor at the end of the text
        textarea.setSelectionRange(originalText.length, originalText.length);
        
        // Add event listener to cancel button
        cancelBtn.addEventListener('click', function() {
            // Restore original content and styling
            chatTextDiv.innerHTML = originalContent;
            chatTextDiv.classList.remove('editing');
            
            // Remove cancel button
            cancelBtn.remove();
            
            // Reset edit button
            editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
            editBtn.classList.remove('editing');
        });
    }
    
    // Function to confirm message edit and regenerate response
    function confirmMessageEdit(msgDiv, newText, messageIndex) {
        const editBtn = msgDiv.querySelector('.edit-message-btn');
        const cancelBtn = msgDiv.querySelector('.cancel-edit-btn');
        const chatTextDiv = msgDiv.querySelector('.chat-text');
        
        // Remove editing class
        chatTextDiv.classList.remove('editing');
        
        // Format the text using marked
        let formattedText = newText;
        if (window.marked) {
            newText = newText.replace(/\* /g, '- ');
            formattedText = marked.parse(newText);
        }
        
        // Update chat text with new content
        chatTextDiv.innerHTML = formattedText;
        chatTextDiv.setAttribute('data-original-text', newText);
        
        // Apply syntax highlighting to any code blocks
        if (window.hljs) {
            chatTextDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
        
        // Add copy buttons to code blocks
        addCopyButtonsToCodeBlocks(chatTextDiv);
        
        // Reset edit button
        editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        editBtn.classList.remove('editing');
        
        // Remove cancel button
        if (cancelBtn) cancelBtn.remove();
        
        // Find the edited message in the chat node
        if (currentChatId && chatTreeView) {
            const chatNode = chatTreeView.findNodeById(chatTreeView.nodes, currentChatId);
            if (chatNode && chatNode.content && chatNode.content.messages) {
                // Find the message index if not provided
                if (messageIndex === null) {
                    const messages = Array.from(chatMessages.querySelectorAll('.chat-message'));
                    messageIndex = messages.indexOf(msgDiv);
                }
                
                // Update the message in the chat node
                if (messageIndex !== -1 && messageIndex < chatNode.content.messages.length) {
                    chatNode.content.messages[messageIndex].text = newText;
                    
                    // Remove all messages after this one
                    const messagesToRemove = chatNode.content.messages.length - messageIndex - 1;
                    if (messagesToRemove > 0) {
                        chatNode.content.messages.splice(messageIndex + 1);
                        
                        // Remove corresponding elements from the DOM
                        let nextSibling = msgDiv.nextElementSibling;
                        while (nextSibling) {
                            const current = nextSibling;
                            nextSibling = nextSibling.nextElementSibling;
                            current.remove();
                        }
                    }
                    
                    // Save the updated tree to backend
                    saveTreeToBackend();
                    
                    // Send the edited message to generate a new response
                    fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: newText })
                    })
                    .then(response => response.json())
                    .then(data => {
                        appendMessage(data.response, 'bot');
                    })
                    .catch(error => {
                        appendMessage('Error retrieving response.', 'bot');
                        console.error(error);
                    });
                }
            }
        }
    }
    
    // Function to save messages to the chat node
    function saveMessageToChat(text, sender) {
        try {
            const chatNode = chatTreeView.findNodeById(chatTreeView.nodes, currentChatId);
            if (!chatNode) return;
            
            // Initialize messages array if it doesn't exist
            if (!chatNode.content) {
                chatNode.content = { messages: [] };
            } else if (!chatNode.content.messages) {
                chatNode.content.messages = [];
            }
            
            // Add the new message
            chatNode.content.messages.push({
                text: text,
                sender: sender,
                timestamp: new Date().toISOString()
            });
            
            // Save the updated tree to backend
            saveTreeToBackend();
            
            console.log('Message saved to chat:', currentChatId);
        } catch (error) {
            console.error('Error saving message to chat:', error);
        }
    }
    
    // Helper function to save chat tree to backend
    function saveTreeToBackend() {
        fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatTreeView.nodes)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save chat tree');
            }
            return response.json();
        })
        .then(data => console.log('Chat tree saved:', data))
        .catch(error => console.error('Error saving chat tree:', error));
    }

    // Send message on button click or Enter key
    function sendMessage() {
        const prompt = chatInput.value.trim();
        if (!prompt || !currentChatId) return;
        
        appendMessage(prompt, 'user');
        chatInput.value = '';

        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        })
        .then(response => response.json())
        .then(data => {
            appendMessage(data.response, 'bot');
        })
        .catch(error => {
            appendMessage('Error retrieving response.', 'bot');
            console.error(error);
        });
    }

    chatSendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Function to load chat history when a chat is selected (modified to apply highlighting)
    window.loadChatMessages = function(chatId) {
        if (!chatId || !chatTreeView) return;
        
        currentChatId = chatId;
        const chatNode = chatTreeView.findNodeById(chatTreeView.nodes, chatId);
        
        // Update the tab title and content ID if we're using the tab system
        if (window.tabManager && window.tabManager.activeTabId) {
            window.tabManager.setActiveTabContent(chatId, chatNode ? chatNode.name : 'Chat');
        }
        
        // Clear the chat messages
        chatMessages.innerHTML = '';
        
        // If chat node exists and has messages, display them without saving again
        if (chatNode && chatNode.content && chatNode.content.messages) {
            chatNode.content.messages.forEach((message, index) => {
                appendMessage(message.text, message.sender, false, index);
            });
        }
        
        // Focus the chat input
        setTimeout(() => chatInput.focus(), 100);
    };
});

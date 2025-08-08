document.addEventListener('DOMContentLoaded', () => {
    // Tab switching logic
    const notesTabBtn = document.getElementById('notesTabBtn');
    const chatTabBtn = document.getElementById('chatTabBtn');
    const notesSection = document.getElementById('notesSection');
    const chatSection = document.getElementById('chatSection');

    // Track the current chat id and get reference to chatTreeView
    let currentChatId = null;
    let chatTreeView = null;
    
    // Track generation state and abort controller
    let isGenerating = false;
    let currentAbortController = null;

    // Expose currentChatId globally for other modules to access
    Object.defineProperty(window, 'currentChatId', {
        get: function() { return currentChatId; },
        set: function(value) { currentChatId = value; }
    });

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
        
        // Add body class for styling
        document.body.classList.remove('chat-mode');
        document.body.classList.add('notes-mode');
    });

    chatTabBtn.addEventListener('click', () => {
        chatTabBtn.classList.add('active');
        notesTabBtn.classList.remove('active');
        notesSection.style.display = 'none';
        chatSection.style.display = 'block';
        
        // Add body class for styling
        document.body.classList.remove('notes-mode');
        document.body.classList.add('chat-mode');
        
        // Focus the chat input when switching to chat tab
        setTimeout(() => {
            if (chatInput) {
                chatInput.focus();
            }
        }, 100);
        
        // Show helpful message if no chat is loaded and no messages are displayed
        if (!currentChatId && chatMessages && chatMessages.children.length === 0) {
            chatMessages.innerHTML = `
                <div class="chat-message bot" style="opacity: 0.7;">
                    <div class="chat-icon">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="chat-text">
                        👋 Welcome! You can start chatting right away - just type your message below and I'll respond!
                    </div>
                </div>
            `;
        }
        
        // Clear any ongoing chat creation process
        window.creatingDefaultChat = false;
    });

    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatMessages = document.getElementById('chatMessages');
    const voiceChatBtn = document.getElementById('voiceChatBtn');
    
    // Initialize textarea auto-resize
    if (chatInput) {
        // Set initial height
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.max(chatInput.scrollHeight, 24) + 'px';
    }
    
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
    async function appendMessage(text, sender, autoSave = true, messageIndex = null) {
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
            // Restructured to place edit button below and to the right of chat-text
            msgDiv.innerHTML = `
                <div class="message-content">
                    <div class="chat-text" data-original-text="${text.replace(/"/g, '&quot;')}">${formattedText}</div>
                    <div class="chat-icon">
                        <i class="fas fa-user"></i>
                    </div>
                </div>
                <div class="message-controls">
                    <div class="edit-message-btn"><i class="fas fa-pencil-alt"></i></div>
                </div>
            `;
            
            // Add edit functionality to user messages
            const editBtn = msgDiv.querySelector('.edit-message-btn');
            const chatTextDiv = msgDiv.querySelector('.chat-text');
            
            editBtn.addEventListener('click', async function() {
                if (!editBtn.classList.contains('editing')) {
                    // Start editing
                    startMessageEditing(msgDiv, text);
                } else {
                    // Save changes
                    const editTextarea = msgDiv.querySelector('.edit-textarea');
                    await confirmMessageEdit(msgDiv, editTextarea.value, messageIndex);
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
            regenerateBtn.addEventListener('click', async function() {
                // Prevent regeneration if already generating
                if (isGenerating) {
                    return;
                }
                
                // Find the previous user message
                let userMessage = msgDiv.previousElementSibling;
                while (userMessage && !userMessage.classList.contains('user')) {
                    userMessage = userMessage.previousElementSibling;
                }
                
                if (userMessage) {
                    const userText = userMessage.querySelector('.chat-text').getAttribute('data-original-text');
                    
                    // Remove current bot response
                    msgDiv.remove();
                    
                    // Create a new placeholder message for streaming response
                    const newBotMessageDiv = await appendMessage('', 'bot', false);
                    const newBotTextDiv = newBotMessageDiv.querySelector('.chat-text');
                    
                    // Set generation state and update button
                    isGenerating = true;
                    updateSendButtonState(true);
                    
                    // Create abort controller for this request
                    currentAbortController = new AbortController();
                    
                    // Add typing indicator
                    newBotTextDiv.innerHTML = '<span class="typing-indicator">AI is regenerating response...</span>';
                    
                    try {
                        const selectedModel = window.getSelectedModel ? window.getSelectedModel() : null;
                        const response = await fetch('/api/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                prompt: userText, 
                                stream: true,
                                model: selectedModel,
                                chat_id: currentChatId || 'default'
                            }),
                            signal: currentAbortController.signal
                        });

                        if (!response.ok) {
                            throw new Error('Network response was not ok');
                        }

                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();
                        let botResponse = '';
                        
                        // Clear typing indicator
                        newBotTextDiv.innerHTML = '';
                        
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            
                            const chunk = decoder.decode(value);
                            const lines = chunk.split('\n');
                            
                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    try {
                                        const data = JSON.parse(line.slice(6));
                                        
                                        if (data.error) {
                                            botResponse = data.error;
                                            break;
                                        } else if (data.token) {
                                            botResponse += data.token;
                                            
                                            // Update the bot message with current response
                                            let formattedText = botResponse;
                                            if (window.marked) {
                                                const processedText = botResponse.replace(/\* /g, '- ');
                                                formattedText = marked.parse(processedText);
                                            }
                                            
                                            newBotTextDiv.innerHTML = formattedText;
                                            
                                            // Apply syntax highlighting
                                            if (window.hljs) {
                                                newBotTextDiv.querySelectorAll('pre code').forEach((block) => {
                                                    hljs.highlightElement(block);
                                                });
                                            }
                                            
                                            // Add copy buttons to code blocks
                                            addCopyButtonsToCodeBlocks(newBotTextDiv);
                                            
                                            // Auto scroll to bottom
                                            chatMessages.scrollTop = chatMessages.scrollHeight;
                                        } else if (data.done) {
                                            break;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            }
                        }
                        
                        // Save the complete message to chat
                        if (currentChatId && chatTreeView && botResponse) {
                            await saveMessageToChat(botResponse, 'bot');
                        }
                        
                    } catch (error) {
                        console.error('Regeneration streaming error:', error);
                        
                        // Check if it was aborted by user
                        if (error.name === 'AbortError') {
                            // Keep the partial response that was generated
                            if (botResponse) {
                                // Save partial response if we have any
                                if (currentChatId && chatTreeView) {
                                    await saveMessageToChat(botResponse, 'bot');
                                }
                            } else {
                                newBotTextDiv.innerHTML = '<span style="color: #666; font-style: italic;">Regeneration stopped by user.</span>';
                            }
                        } else {
                            newBotTextDiv.innerHTML = 'Error regenerating response.';
                        }
                    } finally {
                        // Reset generation state
                        isGenerating = false;
                        updateSendButtonState(false);
                        currentAbortController = null;
                    }
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
            await saveMessageToChat(text, sender);
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
    async function sendMarkdownToNote(markdownText, noteId) {
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
            try {
                await window.editorInstance.render(noteContent);
            } catch (error) {
                console.error('Error rendering updated note content:', error);
            }
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
        // Show saving notification
        if (window.modalManager && window.modalManager.showToast) {
            window.modalManager.showToast({
                message: 'Saving note...',
                type: 'progress',
                icon: 'save',
                duration: 2000
            });
        }

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
            // Show success notification
            if (window.modalManager && window.modalManager.showToast) {
                window.modalManager.showToast({
                    message: 'Note saved successfully',
                    type: 'success',
                    duration: 2000
                });
            }
        })
        .catch(error => {
            console.error('Error saving note:', error);
            // Show error notification
            if (window.modalManager && window.modalManager.showToast) {
                window.modalManager.showToast({
                    message: 'Error saving note',
                    type: 'error',
                    duration: 3000
                });
            }
        });
    }

    // Function to start editing a message
    function startMessageEditing(msgDiv, originalText) {
        const editBtn = msgDiv.querySelector('.edit-message-btn');
        const chatTextDiv = msgDiv.querySelector('.chat-text');
        const messageControls = msgDiv.querySelector('.message-controls');
        
        // Change edit button to confirm button
        editBtn.innerHTML = '<i class="fas fa-check"></i>';
        editBtn.classList.add('editing');
        
        // Add editing class to message controls for visibility
        messageControls.classList.add('editing');
        
        // Add cancel button to the message controls container
        const cancelBtn = document.createElement('div');
        cancelBtn.className = 'cancel-edit-btn';
        cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
        messageControls.appendChild(cancelBtn);
        messageControls.classList.add('has-cancel');
        
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
            
            // Remove cancel button and classes
            cancelBtn.remove();
            messageControls.classList.remove('has-cancel');
            messageControls.classList.remove('editing');
            
            // Reset edit button
            editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
            editBtn.classList.remove('editing');
        });
    }
    
    // Function to confirm message edit and regenerate response
    async function confirmMessageEdit(msgDiv, newText, messageIndex) {
        // Prevent editing if already generating
        if (isGenerating) {
            return;
        }
        
        const editBtn = msgDiv.querySelector('.edit-message-btn');
        const cancelBtn = msgDiv.querySelector('.cancel-edit-btn');
        const chatTextDiv = msgDiv.querySelector('.chat-text');
        const messageControls = msgDiv.querySelector('.message-controls');
        
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
        
        // Remove cancel button and clean up classes
        if (cancelBtn) {
            cancelBtn.remove();
            messageControls.classList.remove('has-cancel');
        }
        messageControls.classList.remove('editing');
        
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
                    
                    // Create a placeholder for the new streaming response
                    const newBotMessageDiv = await appendMessage('', 'bot', false);
                    const newBotTextDiv = newBotMessageDiv.querySelector('.chat-text');
                    
                    // Set generation state and update button
                    isGenerating = true;
                    updateSendButtonState(true);
                    
                    // Create abort controller for this request
                    currentAbortController = new AbortController();
                    
                    newBotTextDiv.innerHTML = '<span class="typing-indicator">AI is processing your edit...</span>';
                    
                    try {
                        const selectedModel = window.getSelectedModel ? window.getSelectedModel() : null;
                        const response = await fetch('/api/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                prompt: newText, 
                                stream: true,
                                model: selectedModel,
                                chat_id: currentChatId || 'default'
                            }),
                            signal: currentAbortController.signal
                        });

                        if (!response.ok) {
                            throw new Error('Network response was not ok');
                        }

                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();
                        let botResponse = '';
                        
                        // Clear typing indicator
                        newBotTextDiv.innerHTML = '';
                        
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            
                            const chunk = decoder.decode(value);
                            const lines = chunk.split('\n');
                            
                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    try {
                                        const data = JSON.parse(line.slice(6));
                                        
                                        if (data.error) {
                                            botResponse = data.error;
                                            break;
                                        } else if (data.token) {
                                            botResponse += data.token;
                                            
                                            // Update the bot message with current response
                                            let formattedText = botResponse;
                                            if (window.marked) {
                                                const processedText = botResponse.replace(/\* /g, '- ');
                                                formattedText = marked.parse(processedText);
                                            }
                                            
                                            newBotTextDiv.innerHTML = formattedText;
                                            
                                            // Apply syntax highlighting
                                            if (window.hljs) {
                                                newBotTextDiv.querySelectorAll('pre code').forEach((block) => {
                                                    hljs.highlightElement(block);
                                                });
                                            }
                                            
                                            // Add copy buttons to code blocks
                                            addCopyButtonsToCodeBlocks(newBotTextDiv);
                                            
                                            // Auto scroll to bottom
                                            chatMessages.scrollTop = chatMessages.scrollHeight;
                                        } else if (data.done) {
                                            break;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            }
                        }
                        
                        // Save the complete message to chat
                        if (currentChatId && chatTreeView && botResponse) {
                            await saveMessageToChat(botResponse, 'bot');
                        }
                        
                    } catch (error) {
                        console.error('Edit streaming error:', error);
                        
                        // Check if it was aborted by user
                        if (error.name === 'AbortError') {
                            // Keep the partial response that was generated
                            if (botResponse) {
                                // Save partial response if we have any
                                if (currentChatId && chatTreeView) {
                                    await saveMessageToChat(botResponse, 'bot');
                                }
                            } else {
                                newBotTextDiv.innerHTML = '<span style="color: #666; font-style: italic;">Edit processing stopped by user.</span>';
                            }
                        } else {
                            newBotTextDiv.innerHTML = 'Error retrieving response.';
                        }
                    } finally {
                        // Reset generation state
                        isGenerating = false;
                        updateSendButtonState(false);
                        currentAbortController = null;
                    }
                }
            }
        }
    }
    
    // Function to save messages to the chat node
    async function saveMessageToChat(text, sender) {
        try {
            console.log('Saving message to chat:', currentChatId, sender, text.substring(0, 50) + '...');
            
            if (!currentChatId) {
                console.warn('No current chat ID, cannot save message');
                return false;
            }
            
            // Try to find the chat node in the tree view
            let chatNode = null;
            if (chatTreeView && typeof chatTreeView.findNodeById === 'function') {
                chatNode = chatTreeView.findNodeById(chatTreeView.nodes, currentChatId);
            }
            
            // If we don't have the chat node, create it or get the data from backend
            if (!chatNode) {
                console.log('Chat node not found in tree view, creating it...');
                chatNode = {
                    id: currentChatId,
                    name: 'Quick Chat',
                    type: 'chat',
                    content: { messages: [] }
                };
                
                if (chatTreeView && typeof chatTreeView.addNode === 'function') {
                    chatTreeView.addNode(chatNode);
                }
            }
            
            // Initialize messages array if it doesn't exist
            if (!chatNode.content) {
                chatNode.content = { messages: [] };
            } else if (!chatNode.content.messages) {
                chatNode.content.messages = [];
            }
            
            // Add the new message
            const newMessage = {
                text: text,
                sender: sender,
                timestamp: new Date().toISOString()
            };
            
            chatNode.content.messages.push(newMessage);
            console.log('Message added to chat node, total messages:', chatNode.content.messages.length);
            
            // Save the messages to backend
            const success = await saveChatMessages(currentChatId, chatNode.content.messages);
            
            if (success) {
                console.log('Message saved successfully to backend');
            } else {
                console.error('Failed to save message to backend');
            }
            
            return success;
        } catch (error) {
            console.error('Error saving message to chat:', error);
            return false;
        }
    }
    
    // Helper function to save chat messages to backend
    async function saveChatMessages(chatId, messages) {
        try {
            console.log('Saving chat messages to backend:', chatId, messages.length, 'messages');
            
            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: chatId,
                    messages: messages
                })
            });
            
            const data = await response.json();
            console.log('Save chat messages response:', data);
            
            if (!response.ok) {
                console.error('Failed to save chat messages:', response.status, data);
                return false;
            }
            
            if (data.status === 'success') {
                console.log('Chat messages saved successfully');
                return true;
            } else {
                console.error('Backend reported error saving chat messages:', data);
                return false;
            }
        } catch (error) {
            console.error('Error saving chat messages:', error);
            return false;
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

    // Function to update send button state
    function updateSendButtonState(generating = false) {
        const chatSendBtn = document.getElementById('chatSendBtn');
        const chatSendIcon = chatSendBtn.querySelector('i');
        
        if (generating) {
            chatSendBtn.classList.add('generating');
            chatSendBtn.title = 'Stop generating';
            chatSendIcon.className = 'fas fa-stop';
        } else {
            chatSendBtn.classList.remove('generating');
            chatSendBtn.title = 'Send message';
            chatSendIcon.className = 'fas fa-paper-plane';
        }
        
        // Also update regenerate buttons
        updateRegenerateButtons(generating);
    }

    // Function to update regenerate button states
    function updateRegenerateButtons(disabled = false) {
        const regenerateBtns = document.querySelectorAll('.regenerate-btn');
        regenerateBtns.forEach(btn => {
            btn.disabled = disabled;
            btn.style.opacity = disabled ? '0.5' : '1';
            btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
        });
    }

    // Function to stop generation
    function stopGeneration() {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        isGenerating = false;
        updateSendButtonState(false);
    }

    // Send message on button click or Enter key
    async function sendMessage() {
        // If we're currently generating, stop the generation instead
        if (isGenerating) {
            stopGeneration();
            return;
        }
        
        const prompt = chatInput.value.trim();
        if (!prompt) return;
        
        console.log('Sending message:', prompt);
        console.log('Current chat ID:', currentChatId);
        
        // If no chat is selected, either find an existing "Quick Chat" or create one
        if (!currentChatId) {
            console.log('No chat selected, finding or creating default chat...');
            
            // Check if we're already in the process of creating a chat
            if (window.creatingDefaultChat) {
                console.log('Already creating a default chat, waiting...');
                return;
            }
            
            window.creatingDefaultChat = true;
            
            try {
                // First try to find an existing empty chat (Quick Chat or New Chat) without messages
                let existingQuickChat = null;
                if (chatTreeView && chatTreeView.nodes) {
                    existingQuickChat = chatTreeView.nodes.find(node => 
                        node.type === 'chat' && 
                        (node.name === 'Quick Chat' || node.name === 'New Chat') &&
                        (!node.content || !node.content.messages || node.content.messages.length === 0)
                    );
                }
                
                if (existingQuickChat) {
                    // Use existing empty chat
                    console.log('Found existing empty chat:', existingQuickChat.id);
                    window.currentChatId = existingQuickChat.id;
                } else {
                    // Create a new Quick Chat
                    const defaultChatId = 'quick-chat-' + Date.now();
                    const success = await createDefaultChat(defaultChatId, 'Quick Chat');
                    if (success) {
                        window.currentChatId = defaultChatId;
                        console.log('New Quick Chat created successfully:', currentChatId);
                    } else {
                        console.error('Failed to create default chat');
                        // Show error message to user
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'chat-message bot';
                        errorDiv.style.color = '#ff6b6b';
                        errorDiv.innerHTML = `
                            <div class="chat-icon">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                            <div class="chat-text">
                                ⚠️ Unable to create chat session. Please refresh the page and try again.
                            </div>
                        `;
                        chatMessages.appendChild(errorDiv);
                        return;
                    }
                }
                
                // Update the welcome message area to show we're in a chat now
                if (chatMessages.querySelector('.chat-message[style*="opacity: 0.7"]')) {
                    chatMessages.innerHTML = '';
                }
                
            } finally {
                window.creatingDefaultChat = false;
            }
        }
        
        await appendMessage(prompt, 'user');
        chatInput.value = '';
        updateInputState(); // Update button state after clearing input
        
        // If this is the first message in a new chat, rename it based on the message
        if (chatTreeView && currentChatId) {
            const chatNode = chatTreeView.findNodeById(chatTreeView.nodes, currentChatId);
            if (chatNode && (chatNode.name === 'Quick Chat' || chatNode.name === 'New Chat') && 
                (!chatNode.content || !chatNode.content.messages || chatNode.content.messages.length <= 1)) {
                
                // Generate a meaningful name using the LLM endpoint
                try {
                    const titleResponse = await fetch('/api/generate-chat-title', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: prompt })
                    });
                    
                    if (titleResponse.ok) {
                        const titleData = await titleResponse.json();
                        const newName = titleData.title || prompt.split(' ').slice(0, 4).join(' ');
                        
                        // Update the chat name
                        const response = await fetch(`/api/nodes/${currentChatId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName })
                        });
                        
                        if (response.ok) {
                            chatNode.name = newName;
                            // Refresh the tree view to show the new name
                            if (typeof chatTreeView.renderTree === 'function') {
                                chatTreeView.renderTree();
                            }
                            console.log('Chat renamed to:', newName);
                            // Show success notification
                            if (window.modalManager && window.modalManager.showToast) {
                                window.modalManager.showToast({
                                    message: 'Chat renamed successfully',
                                    type: 'success',
                                    duration: 2000
                                });
                            }
                        } else {
                            // Show error notification
                            if (window.modalManager && window.modalManager.showToast) {
                                window.modalManager.showToast({
                                    message: 'Failed to rename chat',
                                    type: 'error',
                                    duration: 3000
                                });
                            }
                        }
                    } else {
                        // Fallback to simple approach if title generation fails
                        const words = prompt.split(' ').slice(0, 4).join(' ');
                        const fallbackName = words.length > 30 ? words.substring(0, 30) + '...' : words;
                        
                        const response = await fetch(`/api/nodes/${currentChatId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: fallbackName })
                        });
                        
                        if (response.ok) {
                            chatNode.name = fallbackName;
                            if (typeof chatTreeView.renderTree === 'function') {
                                chatTreeView.renderTree();
                            }
                            // Show success notification
                            if (window.modalManager && window.modalManager.showToast) {
                                window.modalManager.showToast({
                                    message: 'Chat renamed successfully',
                                    type: 'success',
                                    duration: 2000
                                });
                            }
                        } else {
                            // Show error notification
                            if (window.modalManager && window.modalManager.showToast) {
                                window.modalManager.showToast({
                                    message: 'Failed to rename chat',
                                    type: 'error',
                                    duration: 3000
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error renaming chat:', error);
                    // Fallback to simple approach
                    const words = prompt.split(' ').slice(0, 4).join(' ');
                    const fallbackName = words.length > 30 ? words.substring(0, 30) + '...' : words;
                    
                    try {
                        const response = await fetch(`/api/nodes/${currentChatId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: fallbackName })
                        });
                        
                        if (response.ok) {
                            chatNode.name = fallbackName;
                            if (typeof chatTreeView.renderTree === 'function') {
                                chatTreeView.renderTree();
                            }
                        }
                    } catch (fallbackError) {
                        console.error('Error in fallback renaming:', fallbackError);
                    }
                }
            }
        }

        // Create a placeholder message for streaming response
        const botMessageDiv = await appendMessage('', 'bot', false); // Don't auto-save yet
        const botTextDiv = botMessageDiv.querySelector('.chat-text');
        
        // Set generation state and update button
        isGenerating = true;
        updateSendButtonState(true);
        
        // Create abort controller for this request
        currentAbortController = new AbortController();
        
        // Add typing indicator
        botTextDiv.innerHTML = '<span class="typing-indicator">AI is typing...</span>';
        
        try {
            // Get current chat messages for context
            let chatHistory = [];
            if (currentChatId) {
                try {
                    const chatData = await fetch(`/api/chats/${currentChatId}`);
                    if (chatData.ok) {
                        const chatJson = await chatData.json();
                        if (chatJson.messages) {
                            chatHistory = chatJson.messages;
                        }
                    }
                } catch (historyError) {
                    console.warn('Could not load chat history:', historyError);
                }
            }

            // Check if current chat has documents and use RAG endpoint automatically
            let response;
            if (window.ragManager && window.ragManager.hasDocumentsInCurrentChat()) {
                // Use RAG endpoint for document-enhanced responses
                response = await window.ragManager.sendRAGMessage(prompt, currentAbortController.signal);
            } else {
                // Use regular chat endpoint with selected model
                const selectedModel = window.getSelectedModel ? window.getSelectedModel() : null;
                response = await fetch('/api/chat-with-context', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chat_id: currentChatId || 'default',
                        message: prompt, 
                        stream: true,
                        history: chatHistory,
                        model: selectedModel
                    }),
                    signal: currentAbortController.signal
                });
            }

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let botResponse = '';
            
            // Clear typing indicator
            botTextDiv.innerHTML = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.error) {
                                botResponse = data.error;
                                break;
                            } else if (data.token) {
                                botResponse += data.token;
                                
                                // Update the bot message with current response
                                let formattedText = botResponse;
                                if (window.marked) {
                                    // Process markdown for display
                                    const processedText = botResponse.replace(/\* /g, '- ');
                                    formattedText = marked.parse(processedText);
                                }
                                
                                botTextDiv.innerHTML = formattedText;
                                
                                // Apply syntax highlighting
                                if (window.hljs) {
                                    botTextDiv.querySelectorAll('pre code').forEach((block) => {
                                        hljs.highlightElement(block);
                                    });
                                }
                                
                                // Add copy buttons to code blocks
                                addCopyButtonsToCodeBlocks(botTextDiv);
                                
                                // Auto scroll to bottom
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            } else if (data.done) {
                                // Response completed
                                break;
                            }
                        } catch (e) {
                            // Ignore JSON parse errors for incomplete chunks
                            continue;
                        }
                    }
                }
            }
            
            // Save the complete message to chat
            if (currentChatId && botResponse) {
                console.log('Saving bot response to chat:', currentChatId);
                await saveMessageToChat(botResponse, 'bot');
            } else {
                console.warn('Could not save bot response - missing chatId or response');
            }
            
        } catch (error) {
            console.error('Streaming error:', error);
            
            // Check if it was aborted by user
            if (error.name === 'AbortError') {
                // Keep the partial response that was generated
                if (botResponse) {
                    // Save partial response if we have any
                    if (currentChatId) {
                        await saveMessageToChat(botResponse, 'bot');
                    }
                } else {
                    botTextDiv.innerHTML = '<span style="color: #666; font-style: italic;">Generation stopped by user.</span>';
                }
            } else {
                botTextDiv.innerHTML = 'Error retrieving response.';
            }
        } finally {
            // Reset generation state
            isGenerating = false;
            updateSendButtonState(false);
            currentAbortController = null;
        }
    }

    // Function to create a default chat when none exists
    async function createDefaultChat(chatId, chatName) {
        try {
            console.log('Creating default chat:', chatId, chatName);
            
            // First check if this chat already exists
            if (chatTreeView && typeof chatTreeView.findNodeById === 'function') {
                const existingNode = chatTreeView.findNodeById(chatTreeView.nodes, chatId);
                if (existingNode) {
                    console.log('Chat already exists, not creating duplicate');
                    return true;
                }
            }
            
            // Check with backend too
            try {
                const checkResponse = await fetch(`/api/chats/${chatId}`);
                if (checkResponse.ok) {
                    console.log('Chat already exists in backend, not creating duplicate');
                    return true;
                }
            } catch (error) {
                // Chat doesn't exist, continue with creation
                console.log('Chat does not exist in backend, proceeding with creation');
            }
            
            const response = await fetch('/api/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: chatId,
                    name: chatName,
                    type: 'chat'
                })
            });
            
            const responseData = await response.json();
            console.log('Create node response:', responseData);
            
            if (response.ok && responseData.status === 'success') {
                // Show success notification
                if (window.modalManager && window.modalManager.showToast) {
                    window.modalManager.showToast({
                        message: 'Chat created successfully',
                        type: 'success',
                        duration: 2000
                    });
                }
                
                // Add the chat to the tree view if it exists
                if (chatTreeView && typeof chatTreeView.addNode === 'function') {
                    const newNode = {
                        id: chatId,
                        name: chatName,
                        type: 'chat',
                        content: { messages: [] },
                        children: []
                    };
                    
                    console.log('Adding node to tree view:', newNode);
                    chatTreeView.addNode(newNode);
                } else {
                    console.warn('chatTreeView not available or addNode method missing');
                }
                
                // Create an initial empty chat record
                const chatResponse = await fetch('/api/chats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: chatId,
                        messages: []
                    })
                });
                
                const chatData = await chatResponse.json();
                console.log('Create chat response:', chatData);
                
                return true;
            } else {
                console.error('Failed to create node:', responseData);
                // Show error notification
                if (window.modalManager && window.modalManager.showToast) {
                    window.modalManager.showToast({
                        message: 'Failed to create chat',
                        type: 'error',
                        duration: 3000
                    });
                }
                return false;
            }
        } catch (error) {
            console.error('Error creating default chat:', error);
            // Show error notification
            if (window.modalManager && window.modalManager.showToast) {
                window.modalManager.showToast({
                    message: 'Error creating chat',
                    type: 'error',
                    duration: 3000
                });
            }
            return false;
        }
    }

    // Expose createDefaultChat globally for RAG manager
    window.createDefaultChat = createDefaultChat;

    chatSendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Auto-resize textarea function
    function autoResizeTextarea() {
        // Reset height to auto to get the correct scrollHeight
        chatInput.style.height = 'auto';
        // Set height based on scrollHeight, with min and max constraints
        const minHeight = 24; // minimum height
        const maxHeight = 120; // maximum height from CSS
        const newHeight = Math.min(Math.max(chatInput.scrollHeight, minHeight), maxHeight);
        chatInput.style.height = newHeight + 'px';
    }
    
    // Add input state management for better UX
    function updateInputState() {
        const chatInputWrapper = document.querySelector('.chat-input-wrapper');
        if (chatInputWrapper) {
            if (chatInput.value.trim()) {
                chatInputWrapper.classList.add('has-text');
            } else {
                chatInputWrapper.classList.remove('has-text');
            }
        }
        // Auto-resize on input change
        autoResizeTextarea();
    }
    
    // Listen for input changes
    chatInput.addEventListener('input', updateInputState);
    chatInput.addEventListener('keyup', updateInputState);
    chatInput.addEventListener('paste', () => setTimeout(updateInputState, 10));
    
    // Initial state check
    updateInputState();
    
    // Global function to reset chat state
    window.resetChatState = function() {
        console.log('Resetting chat state');
        window.currentChatId = null;
        window.creatingDefaultChat = false;
        
        // Clear messages area
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
        
        // Show welcome message if in chat tab
        if (chatSection && chatSection.style.display !== 'none') {
            if (chatMessages && chatMessages.children.length === 0) {
                chatMessages.innerHTML = `
                    <div class="chat-message bot" style="opacity: 0.7;">
                        <div class="chat-icon">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="chat-text">
                            👋 Welcome! You can start chatting right away - just type your message below and I'll respond!
                        </div>
                    </div>
                `;
            }
        }
    };
    
    // Function to load chat history when a chat is selected (modified to apply highlighting)
    window.loadChatMessages = async function(chatId) {
        if (!chatId) {
            console.warn('loadChatMessages called with no chatId');
            return;
        }
        
        console.log('Loading chat messages for:', chatId);
        console.log('Current chat ID was:', currentChatId);
        
        // Set the current chat ID first
        window.currentChatId = chatId;
        
        // Notify RAG manager about chat change
        if (window.ragManager && typeof window.ragManager.onChatChange === 'function') {
            window.ragManager.onChatChange();
        }
        
        // Clear any chat creation flags
        window.creatingDefaultChat = false;
        
        let chatNode = null;
        if (chatTreeView && typeof chatTreeView.findNodeById === 'function') {
            chatNode = chatTreeView.findNodeById(chatTreeView.nodes, chatId);
            console.log('Found chat node in tree:', chatNode);
        }
        
        // Update the tab title and content ID if we're using the tab system
        if (window.tabManager && window.tabManager.activeTabId) {
            window.tabManager.setActiveTabContent(chatId, chatNode ? chatNode.name : 'Chat');
        }
        
        // Clear the chat messages (including welcome message)
        chatMessages.innerHTML = '';
        
        // If chat node exists and has messages, display them without saving again
        if (chatNode && chatNode.content && chatNode.content.messages) {
            console.log('Found chat node with', chatNode.content.messages.length, 'messages');
            for (const [index, message] of chatNode.content.messages.entries()) {
                await appendMessage(message.text, message.sender, false, index);
            }
        } else {
            console.log('No messages found in tree node for chat:', chatId);
            console.log('Chat node structure:', chatNode);
            // Try to load messages from backend if not in tree view
            try {
                console.log('Attempting to load messages from backend...');
                const response = await fetch(`/api/chats/${chatId}`);
                if (response.ok) {
                    const chatData = await response.json();
                    console.log('Backend response:', chatData);
                    if (chatData.content && chatData.content.messages) {
                        console.log('Loaded messages from backend:', chatData.content.messages.length);
                        for (const [index, message] of chatData.content.messages.entries()) {
                            await appendMessage(message.text, message.sender, false, index);
                        }
                    } else {
                        console.log('No messages in backend response');
                    }
                } else {
                    console.log('Backend request failed:', response.status);
                }
            } catch (error) {
                console.error('Error loading chat from backend:', error);
            }
        }
        
        // Focus the chat input
        setTimeout(() => {
            if (chatInput) {
                chatInput.focus();
            }
        }, 100);
        
        console.log('Chat loaded successfully, currentChatId is now:', currentChatId);
    };

    // Model Selector Functionality
    let availableModels = [];
    let selectedModel = 'llama3.2:1b'; // Default model

    const modelSelectorBtn = document.getElementById('modelSelectorBtn');
    const modelDropdown = document.getElementById('modelDropdown');
    const modelList = document.getElementById('modelList');
    const selectedModelName = document.getElementById('selectedModelName');

    // Load available models on initialization
    async function loadAvailableModels() {
        console.log('Loading available models...');
        try {
            const response = await fetch('/api/ollama/models');
            console.log('Models API response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Models data received:', data);
                availableModels = data.models || [];
                renderModelList();
            } else {
                console.error('Models API error:', response.statusText);
                throw new Error('Failed to fetch models');
            }
        } catch (error) {
            console.error('Error loading models:', error);
            if (modelList) {
                modelList.innerHTML = '<div class="model-error">Error loading models. Check if Ollama is running.</div>';
            }
        }
    }

    // Render the model list in the dropdown
    function renderModelList() {
        if (!modelList) {
            console.error('Model list element not found');
            return;
        }

        if (availableModels.length === 0) {
            modelList.innerHTML = '<div class="model-error">No models available</div>';
            return;
        }

        console.log('Rendering model list with', availableModels.length, 'models');

        modelList.innerHTML = availableModels.map(model => {
            const isSelected = model.name === selectedModel;
            const sizeText = model.size ? formatBytes(model.size) : '';
            
            return `
                <div class="model-item ${isSelected ? 'selected' : ''}" data-model="${model.name}">
                    <div class="model-name">${model.name}</div>
                    <div class="model-info">
                        ${sizeText}
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers to model items
        modelList.querySelectorAll('.model-item').forEach(item => {
            item.addEventListener('click', () => {
                const modelName = item.dataset.model;
                selectModel(modelName);
                hideDropdown();
            });
        });
    }

    // Select a model
    function selectModel(modelName) {
        selectedModel = modelName;
        selectedModelName.textContent = modelName;
        
        // Update visual selection in dropdown
        modelList.querySelectorAll('.model-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.model === modelName);
        });
        
        console.log('Selected model:', modelName);
    }

    // Show dropdown
    function showDropdown() {
        modelDropdown.classList.add('show');
        modelSelectorBtn.classList.add('open');
    }

    // Hide dropdown
    function hideDropdown() {
        modelDropdown.classList.remove('show');
        modelSelectorBtn.classList.remove('open');
    }

    // Toggle dropdown
    function toggleDropdown() {
        if (modelDropdown.classList.contains('show')) {
            hideDropdown();
        } else {
            showDropdown();
        }
    }

    // Format bytes for display
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Event listeners
    if (modelSelectorBtn) {
        modelSelectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Model selector button clicked');
            
            // If models haven't been loaded yet, try to load them
            if (availableModels.length === 0) {
                console.log('No models loaded, attempting to load now...');
                loadAvailableModels();
            }
            
            toggleDropdown();
        });
        console.log('Model selector button event listener added');
    } else {
        console.error('Model selector button not found');
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (modelSelectorBtn && modelDropdown && 
            !modelSelectorBtn.contains(e.target) && !modelDropdown.contains(e.target)) {
            hideDropdown();
        }
    });

    // Load models when chat section is shown
    if (chatTabBtn) {
        chatTabBtn.addEventListener('click', () => {
            setTimeout(() => {
                console.log('Chat tab clicked, loading models...');
                loadAvailableModels();
            }, 100);
        });
    }

    // Load models initially if chat is already visible or when DOM is ready
    setTimeout(() => {
        console.log('Initial model loading check...');
        console.log('Chat section display:', chatSection ? chatSection.style.display : 'chatSection not found');
        console.log('Model selector button:', modelSelectorBtn ? 'found' : 'not found');
        console.log('Model list element:', modelList ? 'found' : 'not found');
        
        if (chatSection && (chatSection.style.display !== 'none' && 
            getComputedStyle(chatSection).display !== 'none')) {
            console.log('Chat section is visible, loading models...');
            loadAvailableModels();
        } else {
            console.log('Chat section not visible, will load models when shown');
        }
    }, 1000); // Increased delay to ensure everything is loaded

    // Also try to load models when the chat tab is first clicked
    let modelsLoaded = false;
    const originalChatTabClick = chatTabBtn ? chatTabBtn.onclick : null;
    
    if (chatTabBtn) {
        chatTabBtn.addEventListener('click', () => {
            setTimeout(() => {
                console.log('Chat tab clicked, checking if models should be loaded...');
                if (!modelsLoaded) {
                    console.log('Loading models for the first time...');
                    loadAvailableModels();
                    modelsLoaded = true;
                } else {
                    console.log('Models already loaded');
                }
            }, 200);
        });
    }

    // Expose selected model for use in other functions
    window.getSelectedModel = () => selectedModel;
    
    // Debug function - expose loadAvailableModels for manual testing
    window.debugLoadModels = loadAvailableModels;
    
    console.log('Model selector initialization complete');
});

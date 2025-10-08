let initialized = false;

export function init() {
    if (initialized) return;
    initialized = true;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupChatUI);
    } else {
        setupChatUI();
    }
}

function setupChatUI() {
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
    if (!window.hasOwnProperty('currentChatId')) {
        Object.defineProperty(window, 'currentChatId', {
            get: function() { return currentChatId; },
            set: function(value) { currentChatId = value; },
            configurable: true
        });
    }

    // Initialize references after a short delay to ensure app.js has run
    setTimeout(() => {
        // Get reference to the chatTreeView
        if (window.chatTreeView) {
            chatTreeView = window.chatTreeView;
        }
    }, 500);

    // React to tab changes from app.js instead of owning click handlers
    document.addEventListener('tabChanged', (ev) => {
        const tabType = ev && ev.detail && ev.detail.tabType;
        if (tabType === 'notes') {
            document.body.classList.remove('chat-mode');
            document.body.classList.add('notes-mode');
        }
        if (tabType === 'chat') {
            document.body.classList.remove('notes-mode');
            document.body.classList.add('chat-mode');
            // Ensure the model selector shows a model immediately when entering chat
            initDefaultModelIfNeeded();
            // Focus the chat input when switching to chat tab
            setTimeout(() => { if (chatInput) chatInput.focus(); }, 100);
            // Ensure input height and scroll positions are correct on mobile
            setTimeout(() => {
                if (chatInput) {
                    chatInput.style.height = 'auto';
                    const minHeight = 24;
                    const maxHeight = 120;
                    const newHeight = Math.min(Math.max(chatInput.scrollHeight, minHeight), maxHeight);
                    chatInput.style.height = newHeight + 'px';
                }
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                adjustChatLayoutPadding();
            }, 150);
            // Show helpful message if no chat is loaded and no messages are displayed
            if (!currentChatId && chatMessages && chatMessages.children.length === 0) {
                chatMessages.innerHTML = `
                    <div class="chat-message bot is-muted">
                        <div class="chat-icon"><i class="fas fa-robot"></i></div>
                        <div class="chat-text">👋 Welcome! You can start chatting right away - just type your message below and I'll respond!</div>
                    </div>
                `;
            }
            // Clear any ongoing chat creation process
            window.creatingDefaultChat = false;
        }
    });

    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatMessages = document.getElementById('chatMessages');
    const voiceChatBtn = document.getElementById('voiceChatBtn');
    const chatPlusBtn = document.getElementById('chatPlusBtn');
    const chatPlusMenu = document.getElementById('chatPlusMenu');

    // Inject a cancel/stop button next to Send for aborting generation
    let chatCancelBtn = document.getElementById('chatCancelBtn');
    const inputButtonsRight = document.querySelector('.input-buttons-right');
    if (!chatCancelBtn && inputButtonsRight) {
        chatCancelBtn = document.createElement('button');
        chatCancelBtn.id = 'chatCancelBtn';
        chatCancelBtn.className = 'input-btn cancel-btn';
        chatCancelBtn.title = 'Stop generating';
        chatCancelBtn.style.display = 'none';
        chatCancelBtn.innerHTML = '<i class="fas fa-stop"></i>';
        inputButtonsRight.appendChild(chatCancelBtn);
    }
    if (chatCancelBtn) {
        chatCancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Immediate UI reset
            isGenerating = false;
            updateSendButtonState(false);
            // Dispatch normalized abort event for modular controller
            try { window.dispatchEvent(new CustomEvent('chat:abort')); } catch {}
        });
    }

    // Plus submenu toggle
    if (chatPlusBtn && chatPlusMenu) {
        chatPlusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chatPlusMenu.classList.toggle('open');
        });
        // Close on outside click
        document.addEventListener('click', (e) => {
            const leftContainer = document.querySelector('.input-buttons-left');
            if (!leftContainer) return;
            if (!leftContainer.contains(e.target)) {
                chatPlusMenu.classList.remove('open');
            }
        });
        // Close when focusing input or sending
        if (chatInput) {
            chatInput.addEventListener('focus', () => chatPlusMenu.classList.remove('open'));
        }
    }

    // Add agent selector to plus menu
    try {
        if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.agentsUI) {
            window.ChatModules.agentsUI.addAgentSelectorToPlusMenu();
        } else {
            addAgentSelectorToPlusMenu();
        }
    } catch (_) { try { addAgentSelectorToPlusMenu(); } catch {} }

    // Ensure message area leaves room for the fixed input area on phones
    function adjustChatLayoutPadding() {
        const inputArea = document.querySelector('.chat-input-area');
        if (inputArea && chatMessages) {
            const h = inputArea.offsetHeight || 0;
            chatMessages.style.paddingBottom = (h + 20) + 'px';
        }
    }
    
    // Initialize textarea auto-resize
    if (chatInput) {
        // Set initial height
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.max(chatInput.scrollHeight, 24) + 'px';
        adjustChatLayoutPadding();
    }

    // Update padding when messages change (e.g., history loads, streaming tokens)
    if (chatMessages) {
        const obs = new MutationObserver((mutations) => {
            setTimeout(adjustChatLayoutPadding, 50);
            // Typeset math for new/changed chat-text nodes
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(node => {
                        if (node && node.nodeType === 1) {
                            const el = node.matches && node.matches('.chat-text') ? node : node.querySelector && node.querySelector('.chat-text');
                            if (el) queueMathTypeset(el);
                        }
                    });
                } else if (m.type === 'characterData') {
                    const el = m.target && m.target.parentElement && m.target.parentElement.closest('.chat-text');
                    if (el) queueMathTypeset(el);
                }
            }
        });
        obs.observe(chatMessages, { childList: true, subtree: true, characterData: true });
    }

    // Also adjust on window and viewport changes
    window.addEventListener('resize', adjustChatLayoutPadding);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', adjustChatLayoutPadding);
    }
    // If MathJax loads after initial render, typeset existing messages
    if (window.MathJax && window.MathJax.typesetPromise) {
        const all = document.querySelectorAll('.chat-text');
        if (all.length) {
            window.MathJax.typesetPromise(Array.from(all)).catch(() => {});
        }
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

    // Ensure MathJax is present and configured; load if missing or not ready
    (function ensureMathJax(){
        try {
            // Initialize pending queue
            if (!window._pendingMathEls) window._pendingMathEls = [];
            const hasTypeset = !!(window.MathJax && typeof window.MathJax.typesetPromise === 'function');
            if (!window.MathJax) {
                window.MathJax = {
                    tex: {
                        inlineMath: [['$', '$'], ['\\(', '\\)']],
                        displayMath: [['$$','$$'], ['\\[','\\]']]
                    },
                    options: { skipHtmlTags: ['script','noscript','style','textarea','pre','code'] }
                };
            }
            // If the runtime is not ready, inject the script unless it already exists
            if (!hasTypeset) {
                const already = document.querySelector('script[src*="mathjax@3"][src*="tex-chtml.js"]');
                if (!already) {
                    const mj = document.createElement('script');
                    mj.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js';
                    mj.async = true;
                    mj.onload = () => {
                        try {
                            if (window._pendingMathEls && window._pendingMathEls.length && window.MathJax && window.MathJax.typesetPromise) {
                                const uniq = Array.from(new Set(window._pendingMathEls.filter(Boolean)));
                                window.MathJax.typesetPromise(uniq).finally(() => { window._pendingMathEls = []; });
                            }
                        } catch {}
                    };
                    document.head.appendChild(mj);
                }
            }
        } catch {}
    })();

    // Function to add copy button to code blocks
    function addCopyButtonsToCodeBlocks(container) {
        const codeBlocks = container.querySelectorAll('pre code');
        codeBlocks.forEach(codeBlock => {
            const preElement = codeBlock.parentElement;
            if (!preElement) return;
            // Avoid duplicate copy buttons during streaming updates
            if (preElement.querySelector('.code-copy-btn')) return;
            // Create a copy button
            const copyButton = document.createElement('button');
            copyButton.className = 'code-copy-btn';
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
            copyButton.title = 'Copy to clipboard';
            // Add the button to the parent pre element
            preElement.appendChild(copyButton);
            
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

    // Pretty typing indicator HTML generator
    function getTypingIndicatorHTML(labelText = 'AI is typing') {
        return `
            <span class="typing-indicator typing-indicator--inline" aria-live="polite" aria-label="${labelText}">
                <span class="typing-bar"></span>
                <span class="typing-label">${labelText}</span>
            </span>
        `;
    }

    // Delegate to shared render helpers
    function normalizeMathDelimiters(src) {
        try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.normalizeMathDelimiters)
            ? window.ChatModules.render.normalizeMathDelimiters(src)
            : src; } catch { return src; }
    }

    // Protect math segments from Markdown parsing (so _ and * inside LaTeX aren't mangled)
    function protectMathSegments(src) {
        try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.protectMathSegments)
            ? window.ChatModules.render.protectMathSegments(src)
            : { text: src, placeholders: [] }; } catch { return { text: src, placeholders: [] }; }
    }

function restoreMathSegments(html, placeholders) {
        try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.restoreMathSegments)
            ? window.ChatModules.render.restoreMathSegments(html, placeholders)
            : html; } catch { return html; }
}

    // Render full markdown safely with math protection and minor bullet normalization
    // Heuristic: convert model outputs like "Eq [ ... ] (22)" or "Equation (22): ..." into LaTeX blocks
    function coercePlainMathToLatex(src) {
        try {
            if (!src) return src;
            let out = String(src);
            // Case 1: Eq [ ... ] (22)
            out = out.replace(/\bEq(?:uation)?\.?\s*\[([\s\S]*?)\](?:\s*\(\d+\))?/g, (m, inner) => {
                let s = inner;
                const sym = { '∑':'\\sum', '≥':'\\ge', '≤':'\\le', '∫':'\\int', '∏':'\\prod', '∞':'\\infty' };
                for (const k in sym) { s = s.split(k).join(sym[k]); }
                const greek = { 'θ':'\\theta', 'μ':'\\mu', 'π':'\\pi', 'σ':'\\sigma', 'φ':'\\phi', 'λ':'\\lambda', 'α':'\\alpha', 'β':'\\beta', 'γ':'\\gamma', 'δ':'\\delta', 'ω':'\\omega' };
                for (const k in greek) { s = s.split(k).join(greek[k]); }
                // Normalize unicode minus
                s = s.replace(/−/g, '-');
                // Common pθ -> p_{\theta}
                s = s.replace(/p\s*θ/g, 'p_{\\theta}');
                return `$$${s}$$`;
            });
            // Case 2: Equation (22): ...  or Eq. (22): ... — wrap content after the colon
            out = out.replace(/\bEq(?:uation)?\.?\s*\(\d+\)\s*:\s*([^\n]+)/g, (m, rhs) => {
                let s = rhs;
                const sym = { '∑':'\\sum', '≥':'\\ge', '≤':'\\le', '∫':'\\int', '∏':'\\prod', '∞':'\\infty' };
                for (const k in sym) { s = s.split(k).join(sym[k]); }
                const greek = { 'θ':'\\theta', 'μ':'\\mu', 'π':'\\pi', 'σ':'\\sigma', 'φ':'\\phi', 'λ':'\\lambda', 'α':'\\alpha', 'β':'\\beta', 'γ':'\\gamma', 'δ':'\\delta', 'ω':'\\omega' };
                for (const k in greek) { s = s.split(k).join(greek[k]); }
                s = s.replace(/−/g, '-');
                s = s.replace(/p\s*θ/g, 'p_{\\theta}');
                return `$$${s}$$`;
            });
            return out;
        } catch { return src; }
    }

    function renderMarkdownSafe(src) {
        try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.renderMarkdownSafe)
            ? window.ChatModules.render.renderMarkdownSafe(src)
            : (window.marked ? window.marked.parse(String(src || '')) : String(src || '')); } catch { return String(src || ''); }
    }

    // Finalize a bot message: set HTML, highlight code, add copy buttons, and typeset math
    function finalizeBotMessage(targetEl, fullText) {
        try { return (window.ChatModules && window.ChatModules.render && window.ChatModules.render.finalizeBotMessage)
            ? window.ChatModules.render.finalizeBotMessage(targetEl, fullText)
            : (function(){ if (!targetEl) return; targetEl.textContent = fullText || ''; })(); } catch {}
    }

    // Expose render helpers for modular chat integration
    try {
        if (!window.renderMarkdownSafe) window.renderMarkdownSafe = renderMarkdownSafe;
        if (!window.finalizeBotMessage) window.finalizeBotMessage = finalizeBotMessage;
    } catch {}

    // Queue MathJax typeset for a given element
    function queueMathTypeset(el) {
        try {
            if (!el) return;
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([el]).catch(() => {});
            } else {
                // Defer until MathJax loads
                if (!window._pendingMathEls) window._pendingMathEls = [];
                window._pendingMathEls.push(el);
            }
        } catch {}
    }

    // Expose helpers for modular chat
    try {
        if (!window.addCopyButtonsToCodeBlocks) window.addCopyButtonsToCodeBlocks = addCopyButtonsToCodeBlocks;
        if (!window.queueMathTypeset) window.queueMathTypeset = queueMathTypeset;
    } catch {}

    

    // Helper: append message to chat (modified for better markdown, code highlighting, and math)
    async function appendMessage(text, sender, autoSave = true, messageIndex = null, extras = null) {
        // Validate text input
        if (text === null || text === undefined) {
            console.warn('appendMessage called with null/undefined text, using empty string');
            text = '';
        } else if (typeof text !== 'string') {
            console.warn('appendMessage called with non-string text, converting:', typeof text, text);
            text = String(text);
        }
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message ' + sender;
        
        // Parse the text with marked if available, otherwise use the raw text
        let formattedText = text;
        if (window.marked) {
            // Normalize math delimiters and protect math tokens from Markdown
            const normalized = normalizeMathDelimiters(text);
            const { text: mdSafe, placeholders } = protectMathSegments(normalized);
            const html = marked.parse(mdSafe);
            formattedText = restoreMathSegments(html, placeholders);
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

            // If extras contain a selectionRef or displayLabel, augment the message
            try {
                if (extras && (extras.selectionRef || extras.displayLabel)) {
                    const chatText = msgDiv.querySelector('.chat-text');
                    if (chatText && extras.displayLabel && text === extras.displayLabel) {
                        // Append jump pill (no reference text) if selection provided, aligned to right
                        if (extras.selectionRef && !chatText.querySelector('.selection-jump')) {
                            const meta = extras.selectionRef;
                            // Wrap existing label content to enable right-aligned jump
                            const labelWrap = document.createElement('span');
                            labelWrap.className = 'chat-text-label';
                            labelWrap.innerHTML = chatText.innerHTML;
                            chatText.innerHTML = '';
                            chatText.appendChild(labelWrap);
                            const jump = document.createElement('a');
                            jump.href = '#';
                            jump.className = 'selection-jump';
                            jump.title = 'Go to selection';
                            jump.innerHTML = '<span class="pill"><span class="icon">↗</span> Jump</span>';
                            jump.addEventListener('click', async (ev) => {
                                ev.preventDefault();
                                try {
                                    // Optional version check if available
                                    if (window.documentActionsManager && meta && meta.docId) {
                                        try { await window.documentActionsManager.computeAndCacheDocHash(); } catch {}
                                        const currentDocId = window.documentActionsManager.getDocId();
                                        if (currentDocId && meta.docId && currentDocId !== meta.docId) {
                                            if (window.modalManager) {
                                                window.modalManager.showToast({
                                                    message: 'This selection was saved for a different version of the document. Attempting to re-anchor…',
                                                    type: 'warning', duration: 3000
                                                });
                                            }
                                        }
                                    }
                                    if (window.documentActionsManager && typeof window.documentActionsManager.navigateToSelection === 'function') {
                                        window.documentActionsManager.navigateToSelection(meta);
                                    } else {
                                        const iframe = document.querySelector('.pdf-iframe');
                                        if (iframe && iframe.contentWindow) {
                                            iframe.contentWindow.postMessage({ type: 'selection:navigate', meta }, '*');
                                        }
                                        window.dispatchEvent(new CustomEvent('selection:navigate', { detail: { selection: meta } }));
                                    }
                                } catch {}
                            });
                            chatText.appendChild(jump);
                            chatText.classList.add('has-jump');
                        }
                    }
                }
            } catch {}
            
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
            // 🆕 ADD UNIQUE MESSAGE ID for source tracking
            const uniqueMessageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            msgDiv.dataset.messageId = uniqueMessageId;
            
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
                    <button class="response-action-btn sources-btn" title="View sources" style="display: none;">
                        <i class="fas fa-link"></i>
                    </button>
                </div>
            `;
            
            // Add functionality to regenerate button via modular controller
            const regenerateBtn = msgDiv.querySelector('.regenerate-btn');
            regenerateBtn.addEventListener('click', async function() {
                if (isGenerating) return;
                // Find the previous user message
                let userMessage = msgDiv.previousElementSibling;
                while (userMessage && !userMessage.classList.contains('user')) {
                    userMessage = userMessage.previousElementSibling;
                }
                if (!userMessage) return;
                const userText = userMessage.querySelector('.chat-text').getAttribute('data-original-text');
                // Remove current bot response
                msgDiv.remove();
                // Update UI state during generation
                isGenerating = true;
                updateSendButtonState(true);
                try {
                    const forceWebSearch = window.shouldForceWebSearch ? window.shouldForceWebSearch() : false;
                    if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.controller) {
                        await window.ChatModules.controller.sendMessage(userText, { forceSearch: forceWebSearch });
                    } else {
                        // Fallback to default send path
                        chatInput.value = userText;
                        await __chatFlaggedSendHandler();
                    }
                } catch (e) {
                    console.error('Regenerate via controller failed:', e);
                } finally {
                    isGenerating = false;
                    updateSendButtonState(false);
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
                
                // Validate we have content to send
                if (!originalText || !originalText.trim()) {
                    console.warn('No content to send to note');
                    if (window.modalManager) {
                        window.modalManager.showToast({
                            message: 'No content to send to note',
                            type: 'warning',
                            duration: 3000
                        });
                    }
                    return;
                }

                // Check if file viewer notes editor is open
                if (window.fileViewer && 
                    window.fileViewer.instance && 
                    window.fileViewer.instance.notesEditorInstance) {
                    
                    // Send directly to open notes editor
                    window.fileViewer.instance.addToCurrentNote(originalText);
                    return;
                }
                
                // Check if FileViewerRedesigned instance is available and has notes editor open
                if (window.FileViewerRedesigned && 
                    window.FileViewerRedesigned.instance && 
                    window.FileViewerRedesigned.instance.notesEditorInstance) {
                    
                    // Send directly to open notes editor
                    window.FileViewerRedesigned.instance.addToCurrentNote(originalText);
                    return;
                }
                
                // If no notes editor is open, show options
                showSendToNoteOptions(originalText);
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

        // Typeset math in this message if MathJax is available
        queueMathTypeset(msgDiv.querySelector('.chat-text'));
        
        // Note: Sources are now handled via applyStructuredSources() separately
        // The old text-parsing approach (processMessageSources) has been removed
        // Sources come structured from the backend and are applied after appendMessage

        // Save the message only when autoSave is true (i.e. not loading history)
        if (autoSave && currentChatId && chatTreeView) {
            await saveMessageToChat(text, sender, [], extras);
        }
        
        return msgDiv;
    }

    // Expose for other modules to append messages consistently
    window.appendMessage = appendMessage;
    
    // Function to show options when no notes editor is open
    function showSendToNoteOptions(markdownText) {
        const dialogHTML = `
            <div class="send-to-note-modal" id="sendToNoteModal">
                <div class="modal-overlay" onclick="closeSendToNoteModal()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Send to Note</h3>
                        <button class="modal-close" onclick="closeSendToNoteModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <p>Choose how to send this content to a note:</p>
                        <div class="send-options">
                            <button class="btn-primary option-btn" onclick="openNotesEditorAndAdd('${markdownText.replace(/'/g, "\\'")}')">
                                <i class="fas fa-plus"></i>
                                Open Notes Editor
                            </button>
                            <button class="btn-secondary option-btn" onclick="sendToExistingNoteSystem('${markdownText.replace(/'/g, "\\'")}')">
                                <i class="fas fa-sticky-note"></i>
                                Send to Existing Notes
                            </button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="closeSendToNoteModal()">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
    }
    
    // Function to close the send to note modal
    function closeSendToNoteModal() {
        const modal = document.getElementById('sendToNoteModal');
        if (modal) {
            modal.remove();
        }
    }
    
    // Function to open notes editor and add content
    function openNotesEditorAndAdd(markdownText) {
        closeSendToNoteModal();
        
        // Open the file viewer panel if not visible
        const fileViewerPanel = document.querySelector('.file-viewer-panel');
        if (fileViewerPanel && fileViewerPanel.style.display === 'none') {
            fileViewerPanel.style.display = 'block';
        }
        
        // Check if we have FileViewerRedesigned instance
        if (window.FileViewerRedesigned && window.FileViewerRedesigned.instance) {
            // Open notes editor
            window.FileViewerRedesigned.instance.openNotesEditor();
            
            // Wait a moment for editor to initialize, then add content
            setTimeout(() => {
                window.FileViewerRedesigned.instance.addToCurrentNote(markdownText);
            }, 1000);
        } else {
            console.error('FileViewerRedesigned instance not found');
        }
    }
    
    // Function to use existing note system (backwards compatibility)
    function sendToExistingNoteSystem(markdownText) {
        closeSendToNoteModal();
        
        // Initialize modalManager if needed
        if (!window.modalManager) {
            window.modalManager = new ModalManager();
        }
        
        // Get notes tree
        const notesTree = window.noteTreeView ? window.noteTreeView.nodes : [];
        
        // Show the note submenu instead of full modal
        window.modalManager.showNoteSubmenu(document.querySelector('.send-to-note-btn'), notesTree, (selectedNoteId) => {
            if (selectedNoteId) {
                sendMarkdownToNote(markdownText, selectedNoteId);
            }
        });
    }
    
    // Expose functions globally so they can be called from onclick handlers
    window.closeSendToNoteModal = closeSendToNoteModal;
    window.openNotesEditorAndAdd = openNotesEditorAndAdd;
    window.sendToExistingNoteSystem = sendToExistingNoteSystem;
    
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
        // Validate input first
        if (!markdownText || typeof markdownText !== 'string' || !markdownText.trim()) {
            console.warn("Invalid or empty markdown text provided to sendMarkdownToNote");
            if (window.modalManager) {
                window.modalManager.showToast({
                    message: 'No content to send to note',
                    type: 'warning',
                    duration: 3000
                });
            }
            return;
        }
        
        // First convert markdown to EditorJS blocks format
        const editorJsBlocks = convertMarkdownToEditorJS(markdownText);
        
        if (!editorJsBlocks || !editorJsBlocks.length) {
            console.error("Failed to convert markdown to EditorJS format - no blocks generated");
            if (window.modalManager) {
                window.modalManager.showToast({
                    message: 'Failed to process content for note',
                    type: 'error',
                    duration: 3000
                });
            }
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
                // Set loading flag
                window.isLoadingNote = true;
                
                await window.editorInstance.render(noteContent);
                
                // Clear loading flag
                setTimeout(() => {
                    window.isLoadingNote = false;
                }, 300);
            } catch (error) {
                console.error('Error rendering updated note content:', error);
                window.isLoadingNote = false;
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
        try {
            if (!markdownText || typeof markdownText !== 'string') {
                console.warn('Invalid markdown text provided to convertMarkdownToEditorJS');
                return [];
            }

            const trimmedText = markdownText.trim();
            if (!trimmedText) {
                console.warn('Empty markdown text provided to convertMarkdownToEditorJS');
                return [];
            }

            // Prefer the shared minimal parser if available (handles tables, code fences, etc.)
            try {
                if (typeof window.mdToEditorJS === 'function') {
                    const out = window.mdToEditorJS(trimmedText);
                    if (out && Array.isArray(out.blocks) && out.blocks.length) return out.blocks;
                }
            } catch (e) {
                console.warn('mdToEditorJS failed, using local fallback:', e);
            }

            const blocks = [];
            const lines = trimmedText.split('\n');

            let i = 0;
            let currentCodeBlock = null;
            let currentListItems = [];
            let currentListType = null; // 'ordered' or 'unordered'
            let paragraphBuffer = []; // [{text, br}]

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

            function flushParagraph() {
                if (!paragraphBuffer.length) return;
                let text = '';
                for (let idx = 0; idx < paragraphBuffer.length; idx++) {
                    const seg = paragraphBuffer[idx];
                    text += processInlineFormatting(seg.text);
                    if (seg.br && idx < paragraphBuffer.length - 1) {
                        text += '<br/>';
                    } else if (idx < paragraphBuffer.length - 1) {
                        text += ' ';
                    }
                }
                if (text.trim()) {
                    blocks.push({ type: 'paragraph', data: { text } });
                }
                paragraphBuffer = [];
            }

            function isBoldOnly(line) {
                const t = line.trim();
                return (/^\*\*[^*].*\*\*$/.test(t) || /^__[^_].*__$/.test(t)) && !t.includes('** ') && !t.includes(' **');
            }

            function stripBoldMarkers(line) {
                return line.trim().replace(/^\*\*\s*|\s*\*\*$/g, '').replace(/^__\s*|\s*__$/g, '');
            }

            function isPlainTitle(line, nextLine) {
                const t = (line || '').trim();
                const n = (nextLine || '').trim();
                if (!t) return false;
                if (n !== '') return false; // must be followed by blank line
                if (/^\s*[#>\-*`]|^\d+\./.test(t)) return false; // not other md constructs
                if (t.length > 80) return false;
                if (/[.!?:]$/.test(t)) return false;
                // Letters, numbers, spaces, simple punctuation
                return /^[\p{L}\p{N} ,;\-–—'"()]+$/u.test(t);
            }

            while (i < lines.length) {
                const rawLine = lines[i];
                const line = rawLine; // keep spaces for double-space breaks

                // Inside code fence
                if (currentCodeBlock !== null) {
                    if (line.trim() === '```') {
                        blocks.push({ type: 'code', data: { code: currentCodeBlock.code, language: currentCodeBlock.language || 'plaintext' } });
                        currentCodeBlock = null;
                    } else {
                        currentCodeBlock.code += rawLine + '\n';
                    }
                    i++; continue;
                }

                // Blank line: flush paragraph/list
                if (/^\s*$/.test(line)) {
                    flushParagraph();
                    flushCurrentList();
                    i++; continue;
                }

                // Code fence start
                const codeStart = line.trim().match(/^```(\w*)$/);
                if (codeStart) {
                    flushParagraph();
                    flushCurrentList();
                    currentCodeBlock = { code: '', language: codeStart[1] || 'plaintext' };
                    i++; continue;
                }

                // Header with #
                const headerMatch = line.trim().match(/^(#{1,6})\s+(.+)$/);
                if (headerMatch) {
                    flushParagraph();
                    flushCurrentList();
                    blocks.push({ type: 'header', data: { text: headerMatch[2], level: headerMatch[1].length } });
                    i++; continue;
                }

                // Bold-only line -> header (level 3)
                if (isBoldOnly(line)) {
                    flushParagraph();
                    flushCurrentList();
                    blocks.push({ type: 'header', data: { text: stripBoldMarkers(line), level: 3 } });
                    i++; continue;
                }

                // Plain standalone title line -> header (level 3)
                const nextLine = (i + 1 < lines.length) ? lines[i + 1] : '';
                if (isPlainTitle(line, nextLine)) {
                    flushParagraph();
                    flushCurrentList();
                    blocks.push({ type: 'header', data: { text: line.trim(), level: 3 } });
                    i += 2; // skip following blank line
                    continue;
                }

                // Blockquote
                const quoteMatch = line.trim().match(/^>\s+(.+)$/);
                if (quoteMatch) {
                    flushParagraph();
                    flushCurrentList();
                    blocks.push({ type: 'quote', data: { text: quoteMatch[1], caption: '' } });
                    i++; continue;
                }

                // Horizontal rule
                if (line.trim().match(/^([-*_])\1{2,}$/)) {
                    flushParagraph();
                    flushCurrentList();
                    blocks.push({ type: 'delimiter', data: {} });
                    i++; continue;
                }

                // Lists
                const ul = line.trim().match(/^[-*]\s+(.+)$/);
                const ol = line.trim().match(/^\d+\.\s+(.+)$/);
                if (ul) {
                    flushParagraph();
                    if (currentListType && currentListType !== 'unordered') flushCurrentList();
                    currentListType = 'unordered';
                    currentListItems.push({ content: processInlineFormatting(ul[1]), items: [] });
                    i++; continue;
                }
                if (ol) {
                    flushParagraph();
                    if (currentListType && currentListType !== 'ordered') flushCurrentList();
                    currentListType = 'ordered';
                    currentListItems.push({ content: processInlineFormatting(ol[1]), items: [] });
                    i++; continue;
                }

                // Normal paragraph line; track hard line break via two trailing spaces
                const hasHardBreak = /\s\s$/.test(line);
                const cleaned = line.replace(/\s+$/g, '');
                paragraphBuffer.push({ text: cleaned, br: hasHardBreak });
                i++;
            }

            // Flush tail
            flushParagraph();
            flushCurrentList();

            return blocks.length ? blocks : [{ type: 'paragraph', data: { text: processInlineFormatting(trimmedText) } }];

        } catch (error) {
            console.error('Error in convertMarkdownToEditorJS:', error);
            // Fallback: single paragraph
            return [{ type: 'paragraph', data: { text: (markdownText || '').trim() } }];
        }
    }
    
    // Helper function to process inline formatting (e.g., bold, italic)
    function processInlineFormatting(text) {
        if (!text) return text;
        
        // Replace bold (**text** or __text__) with <b>text</b>
        // Process bold first to avoid conflicts with italic
        text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
        text = text.replace(/__([^_]+)__/g, '<b>$1</b>');
        
        // Replace italic (*text* or _text_) with <i>text</i>
        text = text.replace(/\*([^*]+)\*/g, '<i>$1</i>');
        text = text.replace(/_([^_]+)_/g, '<i>$1</i>');
        
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
                                            newBotTextDiv.innerHTML = renderMarkdownSafe(botResponse);
                                            
                                            // Apply syntax highlighting
                                            if (window.hljs) {
                                                newBotTextDiv.querySelectorAll('pre code').forEach((block) => {
                                                    hljs.highlightElement(block);
                                                });
                                            }
                                            
                                            // Add copy buttons to code blocks
                                            addCopyButtonsToCodeBlocks(newBotTextDiv);
                                            
                                            // Auto scroll removed to allow free scrolling during streaming
                                        } else if (data.done) {
                                            // Finalize full rendering
                                            finalizeBotMessage(newBotTextDiv, botResponse);
                                            break;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            }
                        }

                        // If we forced web search, reset the toggle now
                        if (window.completeWebSearch && (window.shouldForceWebSearch ? window.shouldForceWebSearch() : false)) {
                            window.completeWebSearch();
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
    async function saveMessageToChat(text, sender, sources = [], extras = null) {
        try {
            let preview = '';
            try { preview = (text || '').substring(0, 50) + '...'; } catch {}
            console.log('Saving message to chat:', currentChatId, sender, preview);
            
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
            if (Array.isArray(sources) && sources.length > 0) {
                newMessage.sources = sources;
            }
            if (extras && (extras.displayLabel || extras.selectionRef)) {
                if (extras.displayLabel) newMessage.displayLabel = extras.displayLabel;
                if (extras.selectionRef) newMessage.selectionRef = extras.selectionRef;
            }
            
            
            chatNode.content.messages.push(newMessage);
            console.log('Message added to chat node, total messages:', chatNode.content.messages.length);
            
            // Save the messages to backend
            const success = await saveChatMessages(currentChatId, chatNode.content.messages);
            
            if (success) {
                console.log('Message saved successfully to backend');
                // Refresh the chat tree to show updated order with a small delay
                // to ensure database triggers have completed
                setTimeout(async () => {
                    if (window.loadChatTree && typeof window.loadChatTree === 'function') {
                        try {
                            console.log('Refreshing chat tree after message save...');
                            await window.loadChatTree();
                            console.log('Chat tree refreshed successfully');
                        } catch (error) {
                            console.error('Error refreshing chat tree:', error);
                        }
                    } else {
                        console.warn('loadChatTree function not available');
                    }
                }, 100); // Small delay to ensure database update is complete
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
        const chatCancelBtn = document.getElementById('chatCancelBtn');
        
        if (generating) {
            // Hide Send, show Stop (replacement behavior)
            chatSendBtn.classList.add('generating');
            chatSendBtn.setAttribute('disabled', 'disabled');
            chatSendBtn.title = 'Generating…';
            chatSendBtn.style.display = 'none';
            // Keep plane icon state; it will be restored when shown again
            chatSendIcon.className = 'fas fa-paper-plane';
            if (chatCancelBtn) {
                chatCancelBtn.style.display = 'inline-block';
                chatCancelBtn.removeAttribute('disabled');
                chatCancelBtn.title = 'Stop generating';
                // Move focus to Stop for accessibility
                try { chatCancelBtn.focus(); } catch (_) {}
            }
        } else {
            // Show Send, hide Stop
            chatSendBtn.classList.remove('generating');
            chatSendBtn.removeAttribute('disabled');
            chatSendBtn.title = 'Send message';
            chatSendIcon.className = 'fas fa-paper-plane';
            chatSendBtn.style.display = 'inline-block';
            if (chatCancelBtn) {
                chatCancelBtn.style.display = 'none';
                chatCancelBtn.setAttribute('disabled', 'disabled');
                chatCancelBtn.title = 'Stop generating';
            }
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

    // Function to add agent selector to the plus menu
    function addAgentSelectorToPlusMenu() {
        const plusMenuContent = document.querySelector('.chat-plus-menu .chat-plus-menu-content');
        
        if (!plusMenuContent || document.getElementById('agentSelectorBtn')) {
            return; // Already added or container not found
        }

        // Create agent selector button
        const agentBtn = document.createElement('button');
        agentBtn.id = 'agentSelectorBtn';
        agentBtn.className = 'input-btn agent-selector-btn chat-plus-menu-btn';
        agentBtn.innerHTML = '<i class="fas fa-robot"></i><span class="btn-text">Select Agent</span>';
        agentBtn.title = 'Select an agent to use in chat';
        agentBtn.onclick = (e) => {
            e.stopPropagation();
            showAgentSelector(agentBtn);
        };
        
        // Add to plus menu content
        plusMenuContent.appendChild(agentBtn);
    }

    // In-memory icon overrides for unsaved agent edits
    window.agentIconOverrides = window.agentIconOverrides || {};

    // Function to show agent selector submenu
    async function showAgentSelector(anchorEl) {
        try {
            // Load available agents
            const response = await fetch('/api/agents');
            if (!response.ok) {
                throw new Error('Failed to load agents');
            }
            
            const data = await response.json();
            const agents = data.agents || [];
            
            // Initialize modalManager if needed
            if (!window.modalManager) {
                window.modalManager = new ModalManager();
            }
            
            // Create a modified version of the notes submenu for agents
            showAgentSubmenu(anchorEl, agents, (selectedAgent) => {
                if (selectedAgent) {
                    selectAgent(selectedAgent);
                }
            });
            
        } catch (error) {
            console.error('Error loading agents:', error);
            
            // Show error toast
            if (window.modalManager) {
                window.modalManager.showToast({
                    message: 'Failed to load agents. Please try again.',
                    type: 'error',
                    duration: 3000
                });
            }
        }
    }

    // Function to show agent submenu (similar to note submenu)
    function showAgentSubmenu(anchorEl, agents, onSelect) {
        // Create submenu container
        const submenu = document.createElement('div');
        submenu.className = 'agent-submenu note-submenu'; // Reuse note-submenu styles
        submenu.innerHTML = `
            <div class="note-search-container">
                <input type="text" class="note-search-input" placeholder="Search agents...">
            </div>
            <div class="notes-list-container">
                <ul class="notes-list">
                    ${agents.map(agent => {
                        const icon = (window.agentIconOverrides && window.agentIconOverrides[agent.name]) || agent.icon;
                        const iconHtml = icon ? `<span class=\"agent-emoji\">${icon}</span>` : '<i class=\"fas fa-robot\"></i>';
                        return `<li class=\"note-item agent-item\" data-agent-name=\"${agent.name}\">${iconHtml}<span title=\"${agent.description || agent.name}\">${agent.name}</span></li>`;
                    }).join('')}
                </ul>
                ${agents.length === 0 ? 
                    '<div class="no-notes-message">No agents available</div>' : ''}
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
        
        // Smart positioning - for chatPlusMenu buttons, we need to position above
        let topPos, leftPos;
        
        // Vertical positioning - position above the button since chatPlusMenu is at bottom
        const spaceAboveAnchor = rect.top;
        const spaceBelowAnchor = viewportHeight - rect.bottom;
        
        if (spaceAboveAnchor >= submenuHeight) {
            // Enough space above - position above the button
            topPos = rect.top - submenuHeight - 5;
        } else if (spaceBelowAnchor >= submenuHeight) {
            // Not enough space above but enough below - position below
            topPos = rect.bottom + 5;
        } else {
            // Not enough space in either direction - position where it fits best
            topPos = spaceAboveAnchor > spaceBelowAnchor ? 
                Math.max(5, rect.top - submenuHeight) : 
                Math.min(rect.bottom, viewportHeight - submenuHeight - 5);
        }
        
        // Horizontal positioning - align with the button but ensure it doesn't go offscreen
        leftPos = Math.max(5, Math.min(rect.left, viewportWidth - submenuWidth - 5));
        
        // Apply the calculated position
        submenu.style.top = `${topPos}px`;
        submenu.style.left = `${leftPos}px`;
        submenu.style.zIndex = '1300'; // Higher than chatPlusMenu (1200)
        submenu.style.visibility = 'visible';
        
        // Focus the search input
        const searchInput = submenu.querySelector('.note-search-input');
        setTimeout(() => searchInput.focus(), 10);
        
        // Handle agent search
        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const agentItems = submenu.querySelectorAll('.agent-item');
            
            agentItems.forEach(item => {
                const agentName = item.querySelector('span').textContent.toLowerCase();
                if (agentName.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
        
        // Handle agent selection
        const agentsList = submenu.querySelector('.notes-list');
        agentsList.addEventListener('click', (e) => {
            const agentItem = e.target.closest('.agent-item');
            if (!agentItem) return;
            
            const selectedAgentName = agentItem.dataset.agentName;
            const selectedAgent = agents.find(a => a.name === selectedAgentName);
            closeSubmenu();
            if (onSelect) onSelect(selectedAgent);
        });
        
        // Handle keyboard navigation and selection
        searchInput.addEventListener('keydown', (e) => {
            const agentItems = Array.from(submenu.querySelectorAll('.agent-item')).filter(
                item => item.style.display !== 'none'
            );
            
            // Get currently selected item
            const selectedItem = submenu.querySelector('.agent-item.selected');
            let selectedIndex = selectedItem ? agentItems.indexOf(selectedItem) : -1;
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (selectedIndex < agentItems.length - 1) {
                        if (selectedItem) selectedItem.classList.remove('selected');
                        agentItems[selectedIndex + 1].classList.add('selected');
                        agentItems[selectedIndex + 1].scrollIntoView({ block: 'nearest' });
                    }
                    break;
                    
                case 'ArrowUp':
                    e.preventDefault();
                    if (selectedIndex > 0) {
                        if (selectedItem) selectedItem.classList.remove('selected');
                        agentItems[selectedIndex - 1].classList.add('selected');
                        agentItems[selectedIndex - 1].scrollIntoView({ block: 'nearest' });
                    }
                    break;
                    
                case 'Enter':
                    e.preventDefault();
                    if (selectedItem) {
                        const selectedAgentName = selectedItem.dataset.agentName;
                        const selectedAgent = agents.find(a => a.name === selectedAgentName);
                        closeSubmenu();
                        if (onSelect) onSelect(selectedAgent);
                    } else if (agentItems.length > 0) {
                        // Select the first visible item if none selected
                        const selectedAgentName = agentItems[0].dataset.agentName;
                        const selectedAgent = agents.find(a => a.name === selectedAgentName);
                        closeSubmenu();
                        if (onSelect) onSelect(selectedAgent);
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

    // Current selected agent
    let selectedAgent = null;

    // Function to select an agent
    function selectAgent(agent) {
        selectedAgent = agent;
        
        // Update the button text to show selected agent
        const agentBtn = document.getElementById('agentSelectorBtn');
        if (agentBtn) {
            const icon = (window.agentIconOverrides && window.agentIconOverrides[agent.name]) || agent.icon;
            const iconHtml = icon ? `<span class="agent-emoji">${icon}</span>` : '<i class="fas fa-robot"></i>';
            agentBtn.innerHTML = `${iconHtml}<span class="btn-text">${agent.name}</span><i class="fas fa-times clear-agent" title="Clear agent selection"></i>`;
            agentBtn.title = `Selected agent: ${agent.name}${agent.description ? ' - ' + agent.description : ''}`;
            agentBtn.classList.add('selected');
            
            // Add clear functionality
            const clearIcon = agentBtn.querySelector('.clear-agent');
            if (clearIcon) {
                clearIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearSelectedAgent();
                });
            }
        }
        
        // Close the plus menu
        const chatPlusMenu = document.getElementById('chatPlusMenu');
        if (chatPlusMenu) {
            chatPlusMenu.classList.remove('open');
        }
        
        // Show success notification
        if (window.modalManager) {
            window.modalManager.showToast({
                message: `Agent "${agent.name}" selected`,
                type: 'success',
                duration: 2000
            });
        }
        
        console.log('Selected agent:', agent);
    }

    // Function to clear the selected agent
    function clearSelectedAgent() {
        selectedAgent = null;
        
        // Reset the button to default state
        const agentBtn = document.getElementById('agentSelectorBtn');
        if (agentBtn) {
            agentBtn.innerHTML = '<i class="fas fa-robot"></i><span class="btn-text">Select Agent</span>';
            agentBtn.title = 'Select an agent to use in chat';
            agentBtn.classList.remove('selected');
        }
        
        // Show notification
        if (window.modalManager) {
            window.modalManager.showToast({
                message: 'Agent selection cleared',
                type: 'info',
                duration: 2000
            });
        }
        
        console.log('Agent selection cleared');
    }

    // Function to get the currently selected agent
    function getSelectedAgent() {
        return selectedAgent;
    }

    // Expose the selected agent function globally (proxy to modular state when available)
    try {
        if (!window.getSelectedAgent) {
            window.getSelectedAgent = function() {
                if (window.ChatModules && window.ChatModules.state && window.ChatModules.state.getSelectedAgentLocal) {
                    return window.ChatModules.state.getSelectedAgentLocal();
                }
                return getSelectedAgent();
            };
        }
    } catch {}

    // Live-update agent icon in chat UI when edited in Agents tab
    document.addEventListener('agent:icon-updated', (e) => {
        try {
            const detail = e.detail || {};
            if (!detail.name) return;
            window.agentIconOverrides[detail.name] = detail.icon;
            const agentBtn = document.getElementById('agentSelectorBtn');
            if (agentBtn && selectedAgent && selectedAgent.name === detail.name) {
                const iconHtml = detail.icon ? `<span class="agent-emoji">${detail.icon}</span>` : '<i class="fas fa-robot"></i>';
                agentBtn.innerHTML = `${iconHtml}<span class="btn-text">${selectedAgent.name}</span><i class="fas fa-times clear-agent" title="Clear agent selection"></i>`;
            }
        } catch {}
    });

    // Send message on button click or Enter key (delegated to modular controller)
    async function sendMessage() {
        // Prevent multiple concurrent send requests
        if (isGenerating) {
            console.log('Already generating, ignoring send request');
            return;
        }
        
        const txtRaw = (chatInput && chatInput.value) || '';
        let prompt = txtRaw.trim();
        const expanded = chatInput.dataset && chatInput.dataset.expandedPrompt;
        const displayLabel = chatInput.dataset && chatInput.dataset.displayLabel;
        let selectionRefJson = chatInput.dataset && chatInput.dataset.selectionRef;
        const displayText = (displayLabel || prompt).trim();
        if (!displayText) return;
        if (expanded) prompt = expanded;

        // Guided-selection interception: let document actions handle and return early
        if ((window.documentHighlightingEnabled || window.guidedExpansionEnabled) && window.documentActionsManager) {
            try {
                await appendMessage(displayText, 'user', true);
                isGenerating = true; updateSendButtonState(true);
                const processed = window.documentActionsManager.processHighlightRequest(prompt);
                if (processed) { chatInput.value = ''; updateInputState(); return; }
            } catch { isGenerating = false; updateSendButtonState(false); }
        }

        // Enrich selectionRef if needed
        if (!selectionRefJson && window.guidedSelectionActive && window.documentActionsManager && window.documentActionsManager.currentHighlightRef) {
            try {
                await window.documentActionsManager.computeAndCacheDocHash();
                const docId = window.documentActionsManager.getDocId();
                const docHash = window.documentActionsManager.getCachedDocHash(window.currentChatId || 'default', (window.documentActionsManager.currentDocument && window.documentActionsManager.currentDocument.filename) || 'unknown');
                const meta = { ...window.documentActionsManager.currentHighlightRef, docId, docHash };
                selectionRefJson = JSON.stringify(meta);
                if (chatInput && chatInput.dataset) chatInput.dataset.selectionRef = selectionRefJson;
            } catch {}
        }
        const extras = {};
        if (displayLabel) extras.displayLabel = displayLabel;
        if (selectionRefJson) { try { extras.selectionRef = JSON.parse(selectionRefJson); } catch {} }

        // Remove welcome message if it exists (when sending first message to default chat)
        try {
            const welcomeMsg = chatMessages.querySelector('.chat-message.bot.is-muted');
            if (welcomeMsg) {
                welcomeMsg.remove();
                console.log('Removed welcome message from UI');
            }
        } catch (_) {}

        // Clear input datasets before delegating
        if (chatInput.dataset) { delete chatInput.dataset.expandedPrompt; delete chatInput.dataset.displayLabel; delete chatInput.dataset.selectionRef; }
        chatInput.value = ''; updateInputState();

        // Delegate to modular controller
        const forceWebSearch = window.shouldForceWebSearch ? window.shouldForceWebSearch() : false;
        if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.controller) {
            return window.ChatModules.controller.sendMessage(prompt, { forceSearch: forceWebSearch, extras });
        }
        // Fallback (should rarely happen): append and use old path
        return window.appendMessage ? window.appendMessage(displayText, 'user', true, null, extras) : null;
    }

    // Expose a programmatic send hook to ensure consistent behavior from other modules
    document.addEventListener('chat:send', (ev) => {
        if (isGenerating) return;
        try {
            if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.controller) {
                const detail = (ev && ev.detail) || {};
                const txt = (detail && detail.message) || (chatInput && chatInput.value) || '';
                if (!txt.trim()) return;
                return window.ChatModules.controller.sendMessage(txt, { forceSearch: (window.shouldForceWebSearch ? window.shouldForceWebSearch() : false) });
            }
        } catch (e) {}
        sendMessage();
    });

    // Reset generation state when document highlighting completes
    window.addEventListener('highlight:done', () => {
        isGenerating = false;
        updateSendButtonState(false);
    try { window.dispatchEvent(new CustomEvent('chat:abort')); } catch {}
    });

    // Sync legacy UI with modular controller generation events
    window.addEventListener('chat:generation-state', (ev) => {
        try {
            const gen = !!(ev && ev.detail && ev.detail.generating);
            isGenerating = gen;
            updateSendButtonState(gen);
        } catch (_) {}
    });
    window.addEventListener('chat:send-started', () => {
        try {
            isGenerating = true;
            updateSendButtonState(true);
        } catch (_) {}
    });
    window.addEventListener('chat:aborted', () => {
        try {
            isGenerating = false;
            updateSendButtonState(false);
        } catch (_) {}
    });

    // Function to create a default chat when none exists
    async function createDefaultChat(chatId, chatName) {
        try {
            console.log('Creating default chat:', chatId, chatName);
            const controller = (window.ChatModules && window.ChatModules.controller) ? window.ChatModules.controller : null;
            
            // First check if this chat already exists in the tree
            if (chatTreeView && typeof chatTreeView.findNodeById === 'function') {
                const existingNode = chatTreeView.findNodeById(chatTreeView.nodes, chatId);
                if (existingNode) {
                    console.log('Chat already exists in tree, not creating duplicate');
                    return false; // Return false to indicate chat already exists (not newly created)
                }
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
                
                if (controller && typeof controller.clearCachedMessages === 'function') {
                    controller.clearCachedMessages(chatId);
                }
                if (controller && typeof controller.syncMessageCache === 'function') {
                    controller.syncMessageCache(chatId, []);
                }
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

    function __chatFlaggedSendHandler() {
        // Prevent multiple requests if already generating
        if (isGenerating) {
            console.log('Already generating, ignoring send request');
            return;
        }
        try {
            if (window.__USE_CHAT_MODULES__ && window.ChatModules && window.ChatModules.controller) {
                const txt = (chatInput && chatInput.value) ? chatInput.value : '';
                if (!txt.trim()) return;
                return window.ChatModules.controller.sendMessage(txt, { forceSearch: (window.shouldForceWebSearch ? window.shouldForceWebSearch() : false) });
            }
        } catch (e) {}
        return sendMessage();
    }
    chatSendBtn.addEventListener('click', __chatFlaggedSendHandler);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            __chatFlaggedSendHandler();
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
        adjustChatLayoutPadding();
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
    
    // Expose updateInputState for use by controller
    window.updateInputState = updateInputState;
    
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
        if (chatSection && !chatSection.classList.contains('is-hidden')) {
            if (chatMessages && chatMessages.children.length === 0) {
                chatMessages.innerHTML = `
                    <div class="chat-message bot is-muted">
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
        
        const controller = (window.ChatModules && window.ChatModules.controller) ? window.ChatModules.controller : null;
        try {
            if (controller && typeof controller.clearCachedMessages === 'function') {
                controller.clearCachedMessages(chatId);
            }
            if (controller && typeof controller.syncMessageCache === 'function') {
                controller.syncMessageCache(chatId, []);
            }
        } catch (_) {}
        
        // Set the current chat ID first
        window.currentChatId = chatId;
        
        // Notify RAG manager about chat change
        if (window.ragManager && typeof window.ragManager.onChatChange === 'function') {
            // Don't await to avoid blocking the UI, but handle potential errors
            window.ragManager.onChatChange().catch(error => {
                console.warn('Error in RAG manager chat change:', error);
            });
        }
        
        // Clear any chat creation flags
        window.creatingDefaultChat = false;
        
        let chatNode = null;
        if (chatTreeView && typeof chatTreeView.findNodeById === 'function') {
            chatNode = chatTreeView.findNodeById(chatTreeView.nodes, chatId);
        }
        
        // Update the tab title and content ID if we're using the tab system
        if (window.tabManager && window.tabManager.activeTabId) {
            window.tabManager.setActiveTabContent(chatId, chatNode ? chatNode.name : 'Chat');
        }
        
        // Clear the chat messages (including welcome message)
        chatMessages.innerHTML = '';
        
        // Always fetch latest messages from backend for freshness
        try {
            const response = await fetch(`/api/chats/${chatId}`);
            if (response.ok) {
                const chatData = await response.json();
                if (chatData.content && chatData.content.messages) {
                    if (controller && typeof controller.syncMessageCache === 'function') {
                        controller.syncMessageCache(chatId, chatData.content.messages);
                    }
                    for (const [index, message] of chatData.content.messages.entries()) {
                        const extras = {};
                        if (message.displayLabel) extras.displayLabel = message.displayLabel;
                        if (message.selectionRef) extras.selectionRef = message.selectionRef;
                        const msgEl = await appendMessage(message.text, message.sender, false, index, extras);
                        if (message.sender === 'bot' && Array.isArray(message.sources) && message.sources.length && window.sourceDisplayManager) {
                            window.sourceDisplayManager.applyStructuredSources(msgEl, message.sources, message.text);
                        }
                    }
                } else {
                    if (controller && typeof controller.syncMessageCache === 'function') {
                        controller.syncMessageCache(chatId, []);
                    }
                }
            } else {
                // Fallback to tree node content if available
                if (chatNode && chatNode.content && chatNode.content.messages) {
                    if (controller && typeof controller.syncMessageCache === 'function') {
                        controller.syncMessageCache(chatId, chatNode.content.messages);
                    }
                    for (const [index, message] of chatNode.content.messages.entries()) {
                        const extras = {};
                        if (message.displayLabel) extras.displayLabel = message.displayLabel;
                        if (message.selectionRef) extras.selectionRef = message.selectionRef;
                        const msgEl = await appendMessage(message.text, message.sender, false, index, extras);
                        if (message.sender === 'bot' && Array.isArray(message.sources) && message.sources.length && window.sourceDisplayManager) {
                            window.sourceDisplayManager.applyStructuredSources(msgEl, message.sources, message.text);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading chat from backend:', error);
            // Fallback to tree node content if available
            if (chatNode && chatNode.content && chatNode.content.messages) {
                console.log('Falling back to tree node messages:', chatNode.content.messages.length);
                if (controller && typeof controller.syncMessageCache === 'function') {
                    controller.syncMessageCache(chatId, chatNode.content.messages);
                }
                for (const [index, message] of chatNode.content.messages.entries()) {
                    const extras = {};
                    if (message.displayLabel) extras.displayLabel = message.displayLabel;
                    if (message.selectionRef) extras.selectionRef = message.selectionRef;
                    const msgEl = await appendMessage(message.text, message.sender, false, index, extras);
                    if (message.sender === 'bot' && Array.isArray(message.sources) && message.sources.length && window.sourceDisplayManager) {
                        window.sourceDisplayManager.applyStructuredSources(msgEl, message.sources, message.text);
                    }
                }
            }
        }
        
        // Focus the chat input
        setTimeout(() => {
            if (chatInput) {
                chatInput.focus();
            }
            // Recompute input height and scroll to bottom on mobile
            chatInput.style.height = 'auto';
            const minHeight = 24;
            const maxHeight = 120;
            const newHeight = Math.min(Math.max(chatInput.scrollHeight, minHeight), maxHeight);
            chatInput.style.height = newHeight + 'px';
            adjustChatLayoutPadding();
        }, 150);
        // Ensure we end scrolled to the latest message after rendering
        setTimeout(() => {
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
            adjustChatLayoutPadding();
        }, 200);
        
        console.log('Chat loaded successfully, currentChatId is now:', currentChatId);
    };

    // Model Selector Functionality
    let availableModels = [];
    let selectedModel = null; // Will be set from backend defaults

    const modelSelectorBtn = document.getElementById('modelSelectorBtn');
    const modelDropdown = document.getElementById('modelDropdown');
    const modelList = document.getElementById('modelList');
    const selectedModelName = document.getElementById('selectedModelName');

    // Ensure the selector shows a default immediately using backend defaults
    async function initDefaultModelIfNeeded() {
        try {
            const currentText = selectedModelName ? selectedModelName.textContent : '';
            if (selectedModel || !selectedModelName || (currentText && currentText !== 'Loading...')) {
                return; // Already initialized
            }
            const resp = await fetch('/api/config/defaults');
            if (resp.ok) {
                const cfg = await resp.json();
                selectedModel = cfg.default_model || 'llama3.2:1b';
                selectedModelName.textContent = selectedModel;
            } else {
                // Fall back to a safe default if API not available
                selectedModel = 'llama3.2:1b';
                selectedModelName.textContent = selectedModel;
            }
        } catch (_) {
            // Silent fallback to safe default
            if (!selectedModel) {
                selectedModel = 'llama3.2:1b';
            }
            if (selectedModelName) {
                selectedModelName.textContent = selectedModel;
            }
        }
    }

    // Load available models on initialization
    async function loadAvailableModels() {
        console.log('Loading available models...');
        try {
            // Load models and default configuration in parallel
            const [modelsResponse, configResponse] = await Promise.all([
                fetch('/api/ollama/models'),
                fetch('/api/config/defaults')
            ]);
            
            console.log('Models API response status:', modelsResponse.status);
            console.log('Config API response status:', configResponse.status);
            
            if (modelsResponse.ok) {
                const modelsData = await modelsResponse.json();
                console.log('Models data received:', modelsData);
                availableModels = modelsData.models || [];
            } else {
                console.error('Models API error:', modelsResponse.statusText);
                throw new Error('Failed to fetch models');
            }

            // Set default model from configuration
            if (configResponse.ok && !selectedModel) {
                const configData = await configResponse.json();
                console.log('Config data received:', configData);
                selectedModel = configData.default_model || 'llama3.2:1b';
                if (selectedModelName) {
                    selectedModelName.textContent = selectedModel;
                }
            }

            renderModelList();
        } catch (error) {
            console.error('Error loading models:', error);
            if (modelList) {
                modelList.innerHTML = '<div class="model-error">Error loading models. Check if Ollama is running.</div>';
            }
            // Fallback to hardcoded default if all else fails
            if (!selectedModel) {
                selectedModel = 'llama3.2:1b';
                if (selectedModelName) {
                    selectedModelName.textContent = selectedModel;
                }
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
            // First, ensure default label is set immediately
            initDefaultModelIfNeeded();
            loadAvailableModels();
        } else {
            console.log('Chat section not visible, will load models when shown');
        }
    }, 500); // Slight delay to ensure DOM ready, but keep snappy

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

// Allow other modules to append and persist bot messages
document.addEventListener('chat:add-bot-message', async (ev) => {
    try {
        const detail = (ev && ev.detail) || {};
        const text = String(detail.text || '');
        const extras = detail.extras || null;
        const kind = detail.kind || null;
        const key = detail.key || null;

        // Optional dedupe: if a keyed bot message already exists, skip
        if (kind && key) {
            const existing = document.querySelector(`.chat-message.bot[data-kind="${CSS.escape(kind)}"][data-key="${CSS.escape(key)}"]`);
            if (existing) return;
        }

        const el = window.appendMessage ? await window.appendMessage(text, 'bot', true, null, extras) : null;
        if (el && kind && key) {
            try {
                el.dataset.kind = kind;
                el.dataset.key = key;
            } catch (_) {}
        }
    } catch (e) { console.warn('chat:add-bot-message failed', e); }
});

// Listen for chat changes globally to update file viewer
document.addEventListener('tabChanged', (ev) => {
    const tabType = ev && ev.detail && ev.detail.tabType;
    if (tabType === 'chat') {
        // Emit chat changed event for file viewer
        document.dispatchEvent(new CustomEvent('chat:changed', {
            detail: { chatId: window.currentChatId }
        }));
        
        // Delay to ensure chat is loaded
        setTimeout(() => {
            const viewerInstance = window.FileViewerRedesigned?.instance;
            if (viewerInstance && typeof viewerInstance.updateToggleButtonState === 'function') {
                viewerInstance.updateToggleButtonState(viewerInstance.isVisible);
            }
            if (window.fileViewer && window.ragManager) {
                window.fileViewer.refreshDocumentList();
            }
        }, 500);
    }
});
}

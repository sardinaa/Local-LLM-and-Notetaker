class VoiceChatManager {
    constructor() {
        this.isListening = false;
        this.isSpeaking = false;
        this.modalOverlay = null;
        this.modal = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.conversationHistory = [];
        this.selectedVoice = null;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationFrame = null;
        this.audioVolume = 0;
        
        // Initialize when document is ready
        document.addEventListener('DOMContentLoaded', () => {
            this.initializeButton();
        });
    }
    
    initializeButton() {
        const voiceChatBtn = document.getElementById('voiceChatBtn');
        if (!voiceChatBtn) return;
        
        voiceChatBtn.addEventListener('click', () => {
            this.openVoiceChatModal();
        });
        
        // Add compact voice conversation button to the left side
        this.addVoiceConversationButton();
    }
    
    addVoiceConversationButton() {
        // Prefer the plus-menu content; fallback to left container
        const plusMenuContent = document.querySelector('.chat-plus-menu .chat-plus-menu-content');
        const leftButtonsContainer = plusMenuContent || document.querySelector('.input-buttons-left');
        
        if (!leftButtonsContainer || document.getElementById('voiceConversationBtn')) {
            return; // Already added or container not found
        }

        // Create voice conversation button
        const voiceConvBtn = document.createElement('button');
        voiceConvBtn.id = 'voiceConversationBtn';
        voiceConvBtn.className = 'input-btn';
        voiceConvBtn.innerHTML = '<i class="fas fa-comment-dots"></i>';
        voiceConvBtn.title = 'Start voice conversation';
        voiceConvBtn.onclick = () => this.openVoiceChatModal();
        
        // Add into submenu (or left side if submenu missing)
        leftButtonsContainer.appendChild(voiceConvBtn);
    }
    
    async openVoiceChatModal() {
        // Create modal overlay
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.id = 'voiceChatModalOverlay';
        this.modalOverlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        
        // Fetch available voices for the selector
        let voicesOptions = '';
        if (window.textToSpeech) {
            const voices = window.textToSpeech.getVoices();
            if (voices && voices.length > 0) {
                for (const voice of voices) {
                    voicesOptions += `<option value="${voice.id}">${voice.name}</option>`;
                }
            } else {
                voicesOptions = '<option value="">Default voice</option>';
            }
        } else {
            voicesOptions = '<option value="">Default voice</option>';
        }
        
        // Create modal content with improved visualization
        this.modalOverlay.innerHTML = `
            <div id="voiceChatModal" class="voice-chat-modal">
                <div class="voice-chat-modal-header">
                    <h3>Voice Conversation</h3>
                    <button class="voice-chat-modal-close">&times;</button>
                </div>
                <div class="voice-chat-modal-body">
                    <div class="voice-chat-status">
                        Click "Start" to begin a voice conversation
                    </div>
                    <div class="voice-chat-waveform">
                        <div class="voice-visualization">
                            <i class="fas fa-microphone" style="color: #fff; z-index: 2;"></i>
                        </div>
                        <div class="audio-level-indicator">No audio input</div>
                    </div>
                    <div class="voice-chat-messages">
                        <div class="voice-chat-message system">
                            <strong>System:</strong> Welcome to voice chat. I'll transcribe what you say and respond with voice.
                        </div>
                    </div>
                    <div class="voice-chat-controls">
                        <div class="voice-chat-voice-selector">
                            <label for="voiceChatVoiceSelect">Voice:</label>
                            <select id="voiceChatVoiceSelect">
                                ${voicesOptions}
                            </select>
                        </div>
                        <div class="voice-chat-buttons">
                            <button id="startVoiceChatBtn" class="voice-chat-button start">
                                <i class="fas fa-play"></i> Start Conversation
                            </button>
                            <button id="stopVoiceChatBtn" class="voice-chat-button stop" disabled>
                                <i class="fas fa-stop"></i> Stop
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.modalOverlay);
        this.modal = document.getElementById('voiceChatModal');
        
        // Set up event listeners
        const closeBtn = this.modal.querySelector('.voice-chat-modal-close');
        closeBtn.addEventListener('click', () => this.closeVoiceChatModal());
        
        // Voice selector
        const voiceSelect = document.getElementById('voiceChatVoiceSelect');
        if (window.textToSpeech) {
            const currentVoice = window.textToSpeech.settings.voice;
            if (currentVoice && voiceSelect.querySelector(`[value="${currentVoice}"]`)) {
                voiceSelect.value = currentVoice;
            }
            
            voiceSelect.addEventListener('change', () => {
                if (window.textToSpeech) {
                    window.textToSpeech.setVoice(voiceSelect.value);
                    this.selectedVoice = voiceSelect.value;
                }
            });
        }
        
        // Start/Stop buttons
        const startBtn = document.getElementById('startVoiceChatBtn');
        const stopBtn = document.getElementById('stopVoiceChatBtn');
        
        startBtn.addEventListener('click', () => {
            this.startVoiceConversation();
            startBtn.disabled = true;
            stopBtn.disabled = false;
        });
        
        stopBtn.addEventListener('click', () => {
            this.stopVoiceConversation();
            stopBtn.disabled = true;
            startBtn.disabled = false;
        });
        
        // Close when clicking outside
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) {
                this.closeVoiceChatModal();
            }
        });
    }
    
    closeVoiceChatModal() {
        // Make sure to stop any ongoing conversation
        this.stopVoiceConversation();
        
        // Remove the modal
        if (this.modalOverlay) {
            document.body.removeChild(this.modalOverlay);
            this.modalOverlay = null;
            this.modal = null;
        }
    }
    
    async startVoiceConversation() {
        try {
            // Update status
            this.updateStatus("Listening...");
            this.addSystemMessage("Listening for your voice input...");
            
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
            
            this.audioChunks = [];
            this.isListening = true;
            
            // Create media recorder
            this.mediaRecorder = new MediaRecorder(stream);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            // Set up voice visualization with the improved animation
            this.setupVoiceVisualization(stream);
            
            // Handle when recording stops
            this.mediaRecorder.onstop = () => {
                // Stop the visualization
                this.stopVoiceVisualization();
                
                // Process the audio if we have data and were in listening mode
                if (this.isListening && this.audioChunks.length > 0) {
                    this.processAudioAndRespond();
                }
            };
            
            // Show the listening animation
            const visualization = this.modal.querySelector('.voice-visualization');
            visualization.classList.add('active');
            
            // Start recording
            this.mediaRecorder.start();
            
            // Add welcome message from bot if this is first interaction
            if (this.conversationHistory.length === 0) {
                if (window.textToSpeech && !this.isSpeaking) {
                    setTimeout(() => {
                        if (this.modal) { 
                            this.isSpeaking = true;
                            this.updateStatus("Assistant is speaking...");
                            
                            window.textToSpeech.speak(
                                "Hello! I'm listening to you. What can I help you with today?",
                                () => {}, // onStart
                                () => {   // onEnd
                                    this.isSpeaking = false;
                                    if (this.isListening) {
                                        this.updateStatus("Listening...");
                                    }
                                },
                                (error) => {
                                    console.error("TTS Error:", error);
                                    this.isSpeaking = false;
                                    this.updateStatus("Listening...");
                                }
                            );
                        }
                    }, 500);
                }
            }
            
            // Set up silence detection to stop recording after a period of silence
            this.setupSilenceDetection(stream);
            
        } catch (error) {
            console.error("Error accessing microphone:", error);
            this.updateStatus("Error: Could not access microphone");
            this.addSystemMessage("Error: Could not access microphone. Please check your permissions and try again.");
            
            // Reset the buttons
            const startBtn = document.getElementById('startVoiceChatBtn');
            const stopBtn = document.getElementById('stopVoiceChatBtn');
            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
        }
    }
    
    setupVoiceVisualization(stream) {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);
            
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
            
            // Start visualization loop
            this.updateVoiceVisualization();
        } catch (error) {
            console.error("Error setting up voice visualization:", error);
        }
    }
    
    updateVoiceVisualization() {
        if (!this.isListening || !this.analyser || !this.modal) {
            return;
        }
        
        try {
            // Get audio data
            this.analyser.getByteFrequencyData(this.dataArray);
            
            // Calculate average volume
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) {
                sum += this.dataArray[i];
            }
            this.audioVolume = sum / this.dataArray.length;
            
            // Update the audio level indicator
            const levelIndicator = this.modal.querySelector('.audio-level-indicator');
            if (levelIndicator) {
                if (this.audioVolume < 10) {
                    levelIndicator.textContent = "No speech detected";
                } else if (this.audioVolume < 30) {
                    levelIndicator.textContent = "Low volume";
                } else if (this.audioVolume < 60) {
                    levelIndicator.textContent = "Speaking...";
                } else {
                    levelIndicator.textContent = "Good volume detected";
                }
            }
            
            // Continue the visualization loop
            this.animationFrame = requestAnimationFrame(() => this.updateVoiceVisualization());
        } catch (error) {
            console.error("Error updating voice visualization:", error);
        }
    }
    
    stopVoiceVisualization() {
        // Stop the animation loop
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        // Remove the active class from visualization
        if (this.modal) {
            const visualization = this.modal.querySelector('.voice-visualization');
            if (visualization) {
                visualization.classList.remove('active');
            }
            
            // Reset the audio level indicator
            const levelIndicator = this.modal.querySelector('.audio-level-indicator');
            if (levelIndicator) {
                levelIndicator.textContent = "No audio input";
            }
        }
    }
    
    setupSilenceDetection(stream) {
        try {
            let silenceStart = null;
            const SILENCE_THRESHOLD = 10;
            const SILENCE_DURATION = 2000; // 2 seconds of silence to stop recording
            
            const checkSilence = () => {
                if (!this.isListening || !this.modal || !this.audioVolume) return;
                
                // Check for silence based on the calculated audio volume
                if (this.audioVolume < SILENCE_THRESHOLD) {
                    if (!silenceStart) {
                        silenceStart = Date.now();
                    } else if (Date.now() - silenceStart > SILENCE_DURATION) {
                        // Stop recording after silence threshold
                        if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
                            // Add a message indicating that silence was detected
                            this.addSystemMessage("Silence detected, processing your input...");
                            
                            this.mediaRecorder.stop();
                            this.updateStatus("Processing speech...");
                            return; // Don't continue checking after stopping
                        }
                    }
                } else {
                    silenceStart = null; // Reset silence timer on sound
                }
                
                // Continue checking while listening
                if (this.isListening) {
                    setTimeout(() => checkSilence(), 100);
                }
            };
            
            // Start silence detection
            checkSilence();
            
        } catch (error) {
            console.error("Error setting up silence detection:", error);
        }
    }
    
    updateStatus(message) {
        if (!this.modal) return;
        
        const statusElement = this.modal.querySelector('.voice-chat-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }
    
    addMessageToChat(sender, text) {
        if (!this.modal) return;
        
        const messagesElement = this.modal.querySelector('.voice-chat-messages');
        if (!messagesElement) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `voice-chat-message ${sender}`;
        
        const senderName = sender === 'user' ? 'You' : 
                           sender === 'assistant' ? 'Assistant' : 'System';
        messageDiv.innerHTML = `<strong>${senderName}:</strong> ${text}`;
        
        messagesElement.appendChild(messageDiv);
        messagesElement.scrollTop = messagesElement.scrollHeight;
        
        // Add to conversation history for user and assistant messages
        if (sender === 'user' || sender === 'assistant') {
            this.conversationHistory.push({ role: sender, content: text });
        }
    }
    
    addSystemMessage(text) {
        this.addMessageToChat('system', text);
    }
    
    addTranscribingIndicator() {
        if (!this.modal) return;
        
        const messagesElement = this.modal.querySelector('.voice-chat-messages');
        if (!messagesElement) return;
        
        // Create and add the indicator
        const indicatorDiv = document.createElement('div');
        indicatorDiv.className = 'transcribing-indicator';
        indicatorDiv.innerHTML = `
            <span>Transcribing your speech</span>
            <div class="dot-animation">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
        
        messagesElement.appendChild(indicatorDiv);
        messagesElement.scrollTop = messagesElement.scrollHeight;
        
        return indicatorDiv;
    }
    
    addThinkingIndicator() {
        if (!this.modal) return;
        
        const messagesElement = this.modal.querySelector('.voice-chat-messages');
        if (!messagesElement) return;
        
        // Create and add the indicator
        const indicatorDiv = document.createElement('div');
        indicatorDiv.className = 'thinking-indicator';
        indicatorDiv.innerHTML = `
            <span>Assistant is thinking</span>
            <div class="dot-animation">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
        
        messagesElement.appendChild(indicatorDiv);
        messagesElement.scrollTop = messagesElement.scrollHeight;
        
        return indicatorDiv;
    }
    
    async processAudioAndRespond() {
        if (!this.isListening) return;
        
        this.updateStatus("Processing your speech...");
        
        // Show transcribing indicator
        const transcribingIndicator = this.addTranscribingIndicator();
        
        try {
            // Create audio blob
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            this.audioChunks = [];
            
            // Create FormData for the API request
            const formData = new FormData();
            formData.append('audio', audioBlob);
            
            // Send to server for transcription
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            // Remove the transcribing indicator
            if (transcribingIndicator) transcribingIndicator.remove();
            
            const result = await response.json();
            
            if (result.text && result.text.trim()) {
                const userText = result.text.trim();
                
                // Display the transcribed text to the user
                this.addMessageToChat('user', userText);
                
                // Now get AI response
                this.updateStatus("Getting assistant response...");
                
                // Show thinking indicator
                const thinkingIndicator = this.addThinkingIndicator();
                
                await this.getAIResponse(userText, thinkingIndicator);
            } else {
                this.updateStatus("No speech detected");
                this.addSystemMessage("I couldn't hear anything. Please try again.");
                
                // Restart listening after a short delay
                setTimeout(() => {
                    if (this.isListening && this.modal) {
                        this.startVoiceConversation();
                    }
                }, 1500);
            }
            
        } catch (error) {
            console.error("Error processing audio:", error);
            this.updateStatus("Error processing speech");
            this.addSystemMessage("Error processing your speech. Please try again.");
            
            // Remove the indicator if it exists
            if (transcribingIndicator) transcribingIndicator.remove();
            
            // Restart listening after a short delay
            setTimeout(() => {
                if (this.isListening && this.modal) {
                    this.startVoiceConversation();
                }
            }, 2000);
        }
    }
    
    async getAIResponse(userText, thinkingIndicator) {
        try {
            // Call the chat API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt: userText,
                    conversationId: 'voice-chat'
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            // Remove the thinking indicator if it exists
            if (thinkingIndicator) thinkingIndicator.remove();
            
            const result = await response.json();
            
            if (result.response) {
                const botText = result.response;
                
                // Display the assistant's text response
                this.addMessageToChat('assistant', botText);
                
                // Speak the response if we have TTS
                if (window.textToSpeech) {
                    this.isSpeaking = true;
                    this.updateStatus("Assistant is speaking...");
                    
                    window.textToSpeech.speak(
                        botText,
                        () => {}, // onStart
                        () => {   // onEnd
                            this.isSpeaking = false;
                            // Restart listening if still in conversation
                            if (this.isListening && this.modal) {
                                this.updateStatus("Listening...");
                                this.startVoiceConversation();
                            }
                        },
                        (error) => {  // onError
                            console.error("TTS Error:", error);
                            this.isSpeaking = false;
                            // Restart listening if still in conversation
                            if (this.isListening && this.modal) {
                                this.updateStatus("Listening...");
                                this.startVoiceConversation();
                            }
                        }
                    );
                } else {
                    // If no TTS, just start listening again after a delay
                    setTimeout(() => {
                        if (this.isListening && this.modal) {
                            this.updateStatus("Listening...");
                            this.startVoiceConversation();
                        }
                    }, 1000);
                }
            } else {
                throw new Error("No response from AI");
            }
            
        } catch (error) {
            console.error("Error getting AI response:", error);
            this.updateStatus("Error getting response");
            this.addSystemMessage("Sorry, I couldn't generate a response. Please try again.");
            
            // Remove the thinking indicator if it exists
            if (thinkingIndicator) thinkingIndicator.remove();
            
            // Restart listening after a short delay
            setTimeout(() => {
                if (this.isListening && this.modal) {
                    this.updateStatus("Listening...");
                    this.startVoiceConversation();
                }
            }, 2000);
        }
    }
    
    stopVoiceConversation() {
        // Stop recording if active
        if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
            this.mediaRecorder.stop();
        }
        
        // Stop voice visualization
        this.stopVoiceVisualization();
        
        // Stop any ongoing speech
        if (window.textToSpeech && this.isSpeaking) {
            window.textToSpeech.stop();
            this.isSpeaking = false;
        }
        
        // Close audio context if it exists
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(err => console.error('Error closing audio context:', err));
            this.audioContext = null;
            this.analyser = null;
        }
        
        // Reset state
        this.isListening = false;
        this.audioChunks = [];
        this.updateStatus("Conversation ended");
        this.addSystemMessage("Voice conversation ended. Click Start to begin again.");
    }
}

// Initialize the Voice Chat Manager
const voiceChatManager = new VoiceChatManager();

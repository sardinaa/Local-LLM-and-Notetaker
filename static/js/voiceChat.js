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
        // User/mic analysis
        this.analyser = null;
        this.dataArray = null;
        this.audioVolume = 0;

        // Bot/TTS analysis
        this.botAudioContext = null;
        this.botAnalyser = null;
        this.botDataArray = null;

        // Canvas-based visualization
        this.vizCanvas = null;
        this.vizCtx = null;
        this.vizAnimationFrame = null;
        this.currentState = 'idle'; // idle | listening | thinking | speaking
        this.transcriptionLanguage = 'auto';
        
        // Initialize when document is ready
        document.addEventListener('DOMContentLoaded', () => {
            this.initializeButton();
            try {
                const saved = localStorage.getItem('voiceChatTranscriptionLang');
                if (saved) this.transcriptionLanguage = saved;
            } catch {}

            // Listen for TTS start/end to visualize bot audio
            window.addEventListener('tts-audio-start', (e) => {
                const audio = e?.detail?.audio;
                if (audio) this.attachBotVisualization(audio);
                // Even without an audio element (browser TTS), show speaking state
                this.currentState = 'speaking';
            });
            window.addEventListener('tts-audio-end', () => {
                this.detachBotVisualization();
                // Resume listening visualization if still in conversation
                if (this.isListening) this.currentState = 'listening';
            });
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
        voiceConvBtn.className = 'input-btn chat-plus-menu-btn';
        voiceConvBtn.innerHTML = '<i class="fas fa-comment-dots"></i><span class="btn-text">Voice Chat</span>';
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
        
        // Create modal content with updated, minimalist UI
        this.modalOverlay.innerHTML = `
            <div id="voiceChatModal" class="voice-chat-modal">
                <div class="aurora-element"></div>
                <div class="voice-chat-modal-header">
                    <button class="voice-chat-modal-close" title="Close">&times;</button>
                </div>
                <div class="voice-chat-modal-body">
                    <div class="voice-chat-waveform" style="height: 50vh; position: relative;">
                        <canvas id="voiceVizCanvas" width="640" height="320" style="width: 100%; height: 100%;"></canvas>
                        <div class="audio-level-indicator">No audio input</div>
                    </div>
                    <div class="voice-chat-messages carousel" id="voiceChatMessages">
                        <div class="voice-chat-message system">Welcome to voice chat. I'll transcribe what you say and respond with voice.</div>
                    </div>
                    <div class="voice-chat-controls unified">
                        <div class="voice-chat-control-bar">
                            <button id="muteMicBtn" class="vc-control vc-mic" title="Mute microphone"><i class="fas fa-microphone"></i></button>
                            <button id="startVoiceChatBtn" class="vc-control vc-start" title="Start"><i class="fas fa-play"></i></button>
                            <button id="stopVoiceChatBtn" class="vc-control vc-stop" title="Stop" disabled><i class="fas fa-stop"></i></button>
                        </div>
                        <div class="voice-chat-carousel-controls">
                            <button id="vcPrevMsg" class="vc-nav" title="Previous"><i class="fas fa-chevron-up"></i></button>
                            <button id="vcNextMsg" class="vc-nav" title="Next"><i class="fas fa-chevron-down"></i></button>
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
        
        // No voice/language selectors in the new UI; keep default settings

        // Start/Stop/Mute buttons
        const startBtn = document.getElementById('startVoiceChatBtn');
        const stopBtn = document.getElementById('stopVoiceChatBtn');
        const muteBtn = document.getElementById('muteMicBtn');
        this.isMicMuted = false;
        
        startBtn.addEventListener('click', () => {
            this.startVoiceConversation();
            startBtn.disabled = true;
            stopBtn.disabled = false;
            muteBtn.disabled = false;
        });
        
        stopBtn.addEventListener('click', () => {
            this.stopVoiceConversation();
            stopBtn.disabled = true;
            startBtn.disabled = false;
            muteBtn.disabled = true;
            this.isMicMuted = false;
            muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        });
        
        muteBtn.addEventListener('click', () => {
            this.toggleMicMute(muteBtn);
        });

        // Vertical carousel controls
        const prevBtn = document.getElementById('vcPrevMsg');
        const nextBtn = document.getElementById('vcNextMsg');
        const msgEl = document.getElementById('voiceChatMessages');
        prevBtn.addEventListener('click', ()=> this.scrollMessages(msgEl, -1));
        nextBtn.addEventListener('click', ()=> this.scrollMessages(msgEl, 1));
        
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
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                },
                video: false
            });
            
            this.audioChunks = [];
            this.isListening = true;
            this.micStream = stream;
            
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
            this.currentState = 'listening';
            // Prepare canvas and start render loop if needed
            this.setupCanvas();
            
            // Start recording
            this.mediaRecorder.start(200);
            
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
        } catch (error) {
            console.error("Error setting up voice visualization:", error);
        }
    }

    setupCanvas() {
        if (!this.modal) return;
        this.vizCanvas = this.modal.querySelector('#voiceVizCanvas');
        if (!this.vizCanvas) return;
        // ensure canvas matches container height for crisp rendering
        const parent = this.vizCanvas.parentElement;
        if (parent) {
            const rect = parent.getBoundingClientRect();
            this.vizCanvas.width = Math.max(640, Math.floor(rect.width));
            this.vizCanvas.height = Math.max(320, Math.floor(rect.height));
        }
        this.vizCtx = this.vizCanvas.getContext('2d');
        if (!this.vizAnimationFrame) {
            const draw = () => {
                this.renderVisualization();
                this.vizAnimationFrame = requestAnimationFrame(draw);
            };
            this.vizAnimationFrame = requestAnimationFrame(draw);
        }
    }

    populateLanguageSelector(selectEl) {
        if (!selectEl) return;
        const languages = {
            'auto': 'Auto-detect',
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'nl': 'Dutch',
            'pl': 'Polish',
            'ru': 'Russian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh': 'Chinese',
            'ar': 'Arabic',
            'hi': 'Hindi'
        };
        selectEl.innerHTML = Object.entries(languages)
            .map(([code, name]) => `<option value="${code}">${name}</option>`)
            .join('');
    }

    stopVoiceVisualization() {
        if (this.vizAnimationFrame) {
            cancelAnimationFrame(this.vizAnimationFrame);
            this.vizAnimationFrame = null;
        }
        // Reset indicator text
        if (this.modal) {
            const levelIndicator = this.modal.querySelector('.audio-level-indicator');
            if (levelIndicator) levelIndicator.textContent = 'No audio input';
        }
    }

    renderVisualization() {
        if (!this.vizCtx || !this.vizCanvas) return;
        const ctx = this.vizCtx;
        const { width, height } = this.vizCanvas;
        ctx.clearRect(0, 0, width, height);

        // Keep canvas transparent to reveal modal's translucid background

        // Read mic data if available
        if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) sum += this.dataArray[i];
            this.audioVolume = this.dataArray.length ? sum / this.dataArray.length : 0;
            const levelIndicator = this.modal?.querySelector('.audio-level-indicator');
            if (levelIndicator) {
                if (this.currentState === 'listening') {
                    if (this.audioVolume < 10) levelIndicator.textContent = 'No speech detected';
                    else if (this.audioVolume < 30) levelIndicator.textContent = 'Low volume';
                    else if (this.audioVolume < 60) levelIndicator.textContent = 'Speaking...';
                    else levelIndicator.textContent = 'Good volume detected';
                } else if (this.currentState === 'speaking') {
                    levelIndicator.textContent = 'Assistant speaking';
                } else if (this.currentState === 'thinking') {
                    levelIndicator.textContent = 'Assistant thinking…';
                }
            }
        }

        // Draw mic shape (blue) when listening
        if (this.currentState === 'listening' && this.dataArray) {
            this.drawRadialShape(this.dataArray, '#2d91e5', 0.85, 0.9);
        }

        // Draw bot shape (purple) when speaking with TTS
        if (this.currentState === 'speaking' && this.botAnalyser && this.botDataArray) {
            this.botAnalyser.getByteFrequencyData(this.botDataArray);
            this.drawRadialShape(this.botDataArray, '#7b5cff', 0.8, 1.0, 0.65);
        }

        // Draw calm blinking pulse while thinking
        if (this.currentState === 'thinking') {
            const t = Date.now() / 800;
            const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2; // 0..1
            ctx.save();
            ctx.translate(width / 2, height / 2);
            const r = Math.min(width, height) * (0.18 + pulse * 0.06);
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(45, 145, 229, ${0.15 + 0.15 * pulse})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(123, 92, 255, ${0.12 + 0.12 * (1 - pulse)})`;
            ctx.fill();
            ctx.restore();
        }
    }

    drawRadialShape(freqArray, color, innerScale = 0.8, ampScale = 1.0, alpha = 0.8) {
        const ctx = this.vizCtx;
        const { width, height } = this.vizCanvas;
        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(width, height) * innerScale * 0.25;
        const bins = Math.min(64, freqArray.length);
        const step = Math.floor(freqArray.length / bins) || 1;
        const points = [];
        for (let i = 0; i < bins; i++) {
            const idx = i * step;
            const val = freqArray[idx] / 255; // 0..1
            const ang = (i / bins) * Math.PI * 2;
            const r = baseRadius + val * baseRadius * ampScale;
            points.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
        }
        // Smooth path
        ctx.save();
        ctx.beginPath();
        if (points.length) {
            ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
            ctx.closePath();
        }
        ctx.fillStyle = this.hexToRgba(color, alpha * 0.35);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.hexToRgba(color, alpha);
        ctx.stroke();
        ctx.restore();
    }

    hexToRgba(hex, a = 1) {
        const m = hex.replace('#', '');
        const bigint = parseInt(m, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    attachBotVisualization(audioEl) {
        try {
            // Ensure canvas render loop is running
            this.setupCanvas();
            // Use a dedicated audio context for media element
            this.botAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.botAudioContext.createMediaElementSource(audioEl);
            this.botAnalyser = this.botAudioContext.createAnalyser();
            this.botAnalyser.fftSize = 256;
            // Connect element -> analyser (no need to route to destination to avoid double-audio)
            source.connect(this.botAnalyser);
            this.botDataArray = new Uint8Array(this.botAnalyser.frequencyBinCount);
            this.currentState = 'speaking';
        } catch (e) {
            console.warn('Bot visualization attach failed', e);
        }
    }

    detachBotVisualization() {
        try {
            if (this.botAudioContext) {
                this.botAudioContext.close().catch(() => {});
            }
        } catch {}
        this.botAudioContext = null;
        this.botAnalyser = null;
        this.botDataArray = null;
    }
    
    setupSilenceDetection(stream) {
        try {
            // Use time-domain RMS with hysteresis
            const analyser = this.analyser;
            if (!analyser) return;
            const buf = new Float32Array(analyser.fftSize);
            let silenceMs = 0;
            let speechMs = 0;
            let speechStarted = false;
            const MIN_SPEECH_MS = 300;   // require at least 0.3s of speech
            const MIN_SILENCE_MS = 1200; // 1.2s of silence to end
            const FRAME_MS = 100;
            let noiseFloor = 0.01; // baseline RMS
            let calibrating = 6;   // ~600ms calibration frames
            let totalMs = 0;
            const MAX_NO_SPEECH_MS = 7000;

            const tick = () => {
                if (!this.isListening || !this.modal || !this.mediaRecorder) return;
                if (this.isSpeaking) { // don't detect while TTS speaking
                    setTimeout(tick, FRAME_MS);
                    return;
                }
                try {
                    analyser.getFloatTimeDomainData(buf);
                    // Compute RMS
                    let rms = 0;
                    for (let i = 0; i < buf.length; i++) {
                        const v = buf[i];
                        rms += v * v;
                    }
                    rms = Math.sqrt(rms / buf.length);
                    // Calibrate baseline in first ~600ms
                    if (calibrating > 0) {
                        noiseFloor = noiseFloor * 0.8 + rms * 0.2;
                        calibrating -= 1;
                    }
                    const highThresh = Math.max(noiseFloor * 2.5, 0.02);
                    const lowThresh = Math.max(noiseFloor * 1.4, 0.012);

                    if (rms > highThresh) {
                        speechMs += FRAME_MS;
                        silenceMs = 0;
                        if (!speechStarted && speechMs >= MIN_SPEECH_MS) {
                            speechStarted = true;
                        }
                    } else if (rms < lowThresh) {
                        silenceMs += FRAME_MS;
                    } else {
                        // mid band: decay slowly
                        silenceMs += FRAME_MS / 2;
                    }

                    totalMs += FRAME_MS;
                    if (!speechStarted && totalMs >= MAX_NO_SPEECH_MS) {
                        if (this.mediaRecorder.state === 'recording') {
                            this.addSystemMessage('No speech detected, ready when you are.');
                            this.mediaRecorder.stop();
                            this.updateStatus('No speech detected');
                            return;
                        }
                    }

                    if (speechStarted && silenceMs >= MIN_SILENCE_MS) {
                        if (this.mediaRecorder.state === 'recording') {
                            this.addSystemMessage('Silence detected, processing your input...');
                            this.mediaRecorder.stop();
                            this.updateStatus('Processing speech...');
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('Silence detection tick error', e);
                }
                if (this.isListening) setTimeout(tick, FRAME_MS);
            };
            setTimeout(tick, FRAME_MS);
        } catch (error) {
            console.error('Error setting up silence detection:', error);
        }
    }
    
    updateStatus(message) {
        // New UI: no visible status line; keep method for compatibility
        return;
    }
    
    addMessageToChat(sender, text) {
        if (!this.modal) return;
        
        const messagesElement = this.modal.querySelector('.voice-chat-messages');
        if (!messagesElement) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `voice-chat-message ${sender}`;
        
        messageDiv.textContent = text;
        
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
        
        // Set calm blinking visualization state
        this.currentState = 'thinking';
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
            if (this.transcriptionLanguage && this.transcriptionLanguage !== 'auto') {
                formData.append('language', this.transcriptionLanguage);
            }
            
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
            // Enter thinking state while waiting for the model
            this.currentState = 'thinking';

            // Call the chat API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt: userText,
                    chat_id: 'voice-chat',
                    stream: false
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
                                this.currentState = 'listening';
                                this.startVoiceConversation();
                            }
                        },
                        (error) => {  // onError
                            console.error("TTS Error:", error);
                            this.isSpeaking = false;
                            // Restart listening if still in conversation
                            if (this.isListening && this.modal) {
                                this.updateStatus("Listening...");
                                this.currentState = 'listening';
                                this.startVoiceConversation();
                            }
                        }
                    );
                } else {
                    // If no TTS, just start listening again after a delay
                    setTimeout(() => {
                        if (this.isListening && this.modal) {
                            this.updateStatus("Listening...");
                            this.currentState = 'listening';
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
                    this.currentState = 'listening';
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
        }
        this.audioContext = null;
        this.analyser = null;

        // Stop mic stream tracks
        try {
            if (this.micStream) {
                this.micStream.getTracks().forEach(t => t.stop());
            }
        } catch {}
        this.micStream = null;

        // Detach bot viz if present
        this.detachBotVisualization();
        
        // Reset state
        this.isListening = false;
        this.audioChunks = [];
        this.currentState = 'idle';
        // Minimal UI in new design: no explicit end/status text
    }
}

// --- Extended controls for new UI ---
VoiceChatManager.prototype.toggleMicMute = function(btn){
    if (!this.mediaRecorder) return;
    try {
        if (!this.isMicMuted) {
            if (this.mediaRecorder.state === 'recording' && this.mediaRecorder.pause) this.mediaRecorder.pause();
            this.isMicMuted = true;
            btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            const levelIndicator = this.modal?.querySelector('.audio-level-indicator');
            if (levelIndicator) levelIndicator.textContent = 'Microphone muted';
        } else {
            if (this.mediaRecorder.state === 'paused' && this.mediaRecorder.resume) this.mediaRecorder.resume();
            this.isMicMuted = false;
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    } catch (e) {
        console.warn('Mute toggle not supported:', e);
    }
}

VoiceChatManager.prototype.scrollMessages = function(container, direction = 1){
    if (!container) return;
    const children = Array.from(container.querySelectorAll('.voice-chat-message, .transcribing-indicator, .thinking-indicator'));
    if (children.length === 0) return;
    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;
    let idx = 0;
    for (let i = 0; i < children.length; i++) {
        const el = children[i];
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        if (top >= viewportTop - 2 && bottom <= viewportBottom + 2) { idx = i; break; }
        if (bottom > viewportTop) { idx = i; break; }
    }
    let next = Math.min(children.length - 1, Math.max(0, idx + direction));
    const target = children[next];
    container.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
}

// Initialize the Voice Chat Manager
const voiceChatManager = new VoiceChatManager();

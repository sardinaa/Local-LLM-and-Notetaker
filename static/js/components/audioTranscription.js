class AudioTranscriptionManager {
    constructor(inputElement) {
        this.inputElement = inputElement;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.recordButton = null;
        this.recordingTimer = null;
        this.recordingSeconds = 0;
        this.maxRecordingTime = 60; // Max recording time in seconds
        this.modalManager = new ModalManager();
        this.selectedLanguage = 'auto'; // Default to auto-detection
        
        // Supported languages for transcription
        this.supportedLanguages = {
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
    }

    init(recordButtonId) {
        this.recordButton = document.getElementById(recordButtonId);
        if (!this.recordButton) {
            console.error('Record button not found');
            return;
        }

        // Check browser support for audio recording
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('Audio recording not supported in this browser');
            this.recordButton.style.display = 'none';
            return;
        }

        // Add click event for normal recording
        this.recordButton.addEventListener('click', () => this.toggleRecording());
        
        // Add long-press event for language selection (mobile-friendly)
        let pressTimer;
        this.recordButton.addEventListener('mousedown', (e) => {
            pressTimer = setTimeout(() => {
                this.showLanguageSelector();
            }, 500); // 500ms long press
        });
        
        this.recordButton.addEventListener('mouseup', () => {
            clearTimeout(pressTimer);
        });
        
        this.recordButton.addEventListener('mouseleave', () => {
            clearTimeout(pressTimer);
        });
        
        // Add touch events for mobile
        this.recordButton.addEventListener('touchstart', (e) => {
            pressTimer = setTimeout(() => {
                this.showLanguageSelector();
            }, 500);
        });
        
        this.recordButton.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });
        
        // Right-click for language selection
        this.recordButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showLanguageSelector();
        });
        
        // Update button title to show current language
        this.updateButtonTitle();
    }

    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            // Request microphone access with optimal audio constraints for speech recognition
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,  // Optimal for Whisper
                    channelCount: 1,    // Mono for speech
                    volume: 1.0
                },
                video: false
            });

            this.audioChunks = [];
            this.recordingSeconds = 0;
            
            // Create media recorder with specific options for better compatibility
            let options = { mimeType: 'audio/webm' };
            
            // Try different codecs for better browser compatibility
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options.mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options.mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                options.mimeType = 'audio/ogg;codecs=opus';
            }
            
            console.log('Using media recorder with options:', options);
            this.mediaRecorder = new MediaRecorder(stream, options);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    console.log('Audio chunk received:', event.data.size, 'bytes');
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstart = () => {
                console.log('Recording started');
                this.isRecording = true;
                this.recordButton.innerHTML = '<i class="fas fa-stop"></i>';
                this.recordButton.classList.add('recording');
                // Show recording indicator
                this.showRecordingIndicator();
                // Start recording timer
                this.startRecordingTimer();
            };

            this.mediaRecorder.onstop = () => {
                console.log('Recording stopped, chunks collected:', this.audioChunks.length);
                this.isRecording = false;
                this.recordButton.innerHTML = '<i class="fas fa-microphone"></i>';
                this.recordButton.classList.remove('recording');
                // Remove recording indicator
                this.hideRecordingIndicator();
                // Stop recording timer
                this.stopRecordingTimer();
                // Release microphone
                stream.getTracks().forEach(track => track.stop());
                // Process the audio
                this.processAudio();
            };

            // Start recording with data collection every 100ms for better chunk collection
            this.mediaRecorder.start(100);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.modalManager.showConfirmationDialog({
                title: 'Microphone Access Error',
                message: 'Could not access your microphone. Please check permissions and try again.',
                confirmText: 'OK',
                icon: 'microphone-slash'
            });
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
        }
    }

    async processAudio() {
        if (this.audioChunks.length === 0) {
            console.warn('No audio recorded');
            this.modalManager.showConfirmationDialog({
                title: 'Recording Failed',
                message: 'No audio was recorded. Please try again.',
                confirmText: 'OK',
                icon: 'exclamation-triangle'
            });
            return;
        }

        // Check minimum recording duration (at least 1 second for better accuracy)
        if (this.recordingSeconds < 1.0) {
            console.warn('Recording too short:', this.recordingSeconds, 'seconds');
            this.modalManager.showConfirmationDialog({
                title: 'Recording Too Short',
                message: 'Please record for at least one second. Try speaking a complete word or phrase.',
                confirmText: 'OK',
                icon: 'exclamation-triangle'
            });
            return;
        }

        try {
            // Show loading indicator
            this.showTranscribingIndicator();

            // Create audio blob from recorded chunks
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // Check if audio blob has content
            if (audioBlob.size === 0) {
                throw new Error('Audio recording is empty');
            }
            
            console.log(`Audio blob size: ${audioBlob.size} bytes, duration: ${this.recordingSeconds}s`);
            
            // Create FormData to send the audio file
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            
            // Add selected language for transcription
            if (this.selectedLanguage !== 'auto') {
                formData.append('language', this.selectedLanguage);
            }
            // If auto, don't send language parameter to enable auto-detection
            
            // Add debug flag to bypass preprocessing if needed
            // You can set this to true temporarily for debugging
            const bypassPreprocessing = false; // Set to true for debugging
            if (bypassPreprocessing) {
                formData.append('bypass_preprocessing', 'true');
                console.log('Audio preprocessing bypassed for debugging');
            }
            
            // Send to server for transcription
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            // Hide loading indicator
            this.hideTranscribingIndicator();
            
            if (!response.ok) {
                throw new Error(result.error || `Server returned ${response.status}: ${response.statusText}`);
            }
            
            if (result.text && result.text.trim()) {
                // Add transcribed text to input, appending to existing text
                const transcribedText = result.text.trim();
                if (this.inputElement.value) {
                    this.inputElement.value += ' ' + transcribedText;
                } else {
                    this.inputElement.value = transcribedText;
                }
                // Trigger input event to update UI state
                this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                // Focus the input element
                this.inputElement.focus();
                
                console.log('Transcription successful:', transcribedText);
                console.log('Language detected:', result.language);
                console.log('Confidence score:', result.confidence);
                
                // Show language detection result if auto-detect was used
                if (this.selectedLanguage === 'auto' && result.language) {
                    const detectedLangName = this.supportedLanguages[result.language] || result.language;
                    console.log(`Auto-detected language: ${detectedLangName}`);
                }
                
                // Show warning if confidence is low
                if (result.warning) {
                    console.warn('Transcription warning:', result.warning);
                    // You can optionally show a brief notification here
                    // For now, we'll just log it
                }
            } else {
                throw new Error('No transcription text returned from server');
            }
        } catch (error) {
            console.error('Transcription error:', error);
            this.hideTranscribingIndicator();
            
            this.modalManager.showConfirmationDialog({
                title: 'Transcription Failed',
                message: error.message || 'Could not transcribe audio. Please try speaking louder and longer, then try again.',
                confirmText: 'OK',
                icon: 'exclamation-triangle'
            });
        }
    }

    showRecordingIndicator() {
        const chatInput = this.inputElement;
        
        // Create recording indicator element
        const indicator = document.createElement('div');
        indicator.className = 'recording-indicator';
        indicator.innerHTML = '<i class="fas fa-microphone"></i> Recording...';
        
        // Insert indicator before input
        chatInput.parentNode.insertBefore(indicator, chatInput);
        
        // Style the indicator
        indicator.style.position = 'absolute';
        indicator.style.bottom = '60px';
        indicator.style.left = '50%';
        indicator.style.transform = 'translateX(-50%)';
        indicator.style.padding = '8px 16px';
        indicator.style.backgroundColor = 'rgba(220, 53, 69, 0.8)';
        indicator.style.color = '#fff';
        indicator.style.borderRadius = '4px';
        indicator.style.fontWeight = 'bold';
        indicator.style.zIndex = '100';
        
        // Add time counter span
        const timeCounter = document.createElement('span');
        timeCounter.className = 'recording-time';
        timeCounter.textContent = ' 0:00';
        indicator.appendChild(timeCounter);
    }

    hideRecordingIndicator() {
        const indicator = document.querySelector('.recording-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    showTranscribingIndicator() {
        const chatInput = this.inputElement;
        
        // Create transcribing indicator element
        const indicator = document.createElement('div');
        indicator.className = 'transcribing-indicator';
        indicator.innerHTML = '<i class="fas fa-cog fa-spin"></i> Transcribing...';
        
        // Insert indicator before input
        chatInput.parentNode.insertBefore(indicator, chatInput);
        
        // Style the indicator
        indicator.style.position = 'absolute';
        indicator.style.bottom = '60px';
        indicator.style.left = '50%';
        indicator.style.transform = 'translateX(-50%)';
        indicator.style.padding = '8px 16px';
        indicator.style.backgroundColor = 'rgba(0, 123, 255, 0.8)';
        indicator.style.color = '#fff';
        indicator.style.borderRadius = '4px';
        indicator.style.fontWeight = 'bold';
        indicator.style.zIndex = '100';
    }

    hideTranscribingIndicator() {
        const indicator = document.querySelector('.transcribing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    startRecordingTimer() {
        this.recordingSeconds = 0;
        this.recordingTimer = setInterval(() => {
            this.recordingSeconds++;
            
            // Update time display
            const minutes = Math.floor(this.recordingSeconds / 60);
            const seconds = this.recordingSeconds % 60;
            const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const timeCounter = document.querySelector('.recording-time');
            if (timeCounter) {
                timeCounter.textContent = ` ${timeDisplay}`;
            }
            
            // Check if max time reached
            if (this.recordingSeconds >= this.maxRecordingTime) {
                this.stopRecording();
            }
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }
    
    showLanguageSelector() {
        // Prevent normal recording when showing language selector
        if (this.isRecording) return;
        
        // Create language selector modal
        const languages = Object.entries(this.supportedLanguages).map(([code, name]) => ({
            id: code,
            name: name,
            selected: code === this.selectedLanguage
        }));
        
        const languageOptions = languages.map(lang => 
            `<div class="language-option ${lang.selected ? 'selected' : ''}" data-lang="${lang.id}">
                <i class="fas ${lang.selected ? 'fa-check-circle' : 'fa-circle'}"></i>
                ${lang.name}
            </div>`
        ).join('');
        
        const modalContent = `
            <div class="language-selector-modal">
                <h3><i class="fas fa-language"></i> Select Transcription Language</h3>
                <p class="language-description">
                    Choose the language for speech transcription. Auto-detect will automatically identify the spoken language.
                </p>
                <div class="language-options">
                    ${languageOptions}
                </div>
                <div class="language-modal-actions">
                    <button class="btn-secondary" id="cancelLanguageSelect">Cancel</button>
                    <button class="btn-primary" id="confirmLanguageSelect">Apply</button>
                </div>
            </div>
        `;
        
        // Create and show modal
        const modal = document.createElement('div');
        modal.className = 'language-modal-overlay';
        modal.innerHTML = modalContent;
        document.body.appendChild(modal);
        
        // Add styles
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        
        const modalDiv = modal.querySelector('.language-selector-modal');
        modalDiv.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 20px;
            max-width: 400px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        `;
        
        // Style language options
        const optionsContainer = modal.querySelector('.language-options');
        optionsContainer.style.cssText = `
            max-height: 300px;
            overflow-y: auto;
            margin: 15px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
        `;
        
        // Add event listeners
        let selectedLang = this.selectedLanguage;
        
        modal.querySelectorAll('.language-option').forEach(option => {
            option.style.cssText = `
                padding: 10px 15px;
                cursor: pointer;
                border-bottom: 1px solid #eee;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: background-color 0.2s;
            `;
            
            option.addEventListener('click', () => {
                // Remove selection from all options
                modal.querySelectorAll('.language-option').forEach(opt => {
                    opt.classList.remove('selected');
                    opt.querySelector('i').className = 'fas fa-circle';
                });
                
                // Select this option
                option.classList.add('selected');
                option.querySelector('i').className = 'fas fa-check-circle';
                selectedLang = option.dataset.lang;
            });
            
            // Hover effect
            option.addEventListener('mouseenter', () => {
                if (!option.classList.contains('selected')) {
                    option.style.backgroundColor = '#f5f5f5';
                }
            });
            
            option.addEventListener('mouseleave', () => {
                if (!option.classList.contains('selected')) {
                    option.style.backgroundColor = '';
                }
            });
        });
        
        // Style selected option
        const selectedOption = modal.querySelector('.language-option.selected');
        if (selectedOption) {
            selectedOption.style.backgroundColor = '#e3f2fd';
        }
        
        // Cancel button
        modal.querySelector('#cancelLanguageSelect').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Confirm button
        modal.querySelector('#confirmLanguageSelect').addEventListener('click', () => {
            this.selectedLanguage = selectedLang;
            this.updateButtonTitle();
            document.body.removeChild(modal);
            
            // Show confirmation
            console.log(`Language changed to: ${this.supportedLanguages[selectedLang]}`);
        });
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // Close on escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }
    
    updateButtonTitle() {
        if (this.recordButton) {
            const langName = this.supportedLanguages[this.selectedLanguage];
            this.recordButton.title = `Record audio (${langName}) - Long press to change language`;
        }
    }
}

// Initialize when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    // The class will be initialized from chat.js after elements are ready
});

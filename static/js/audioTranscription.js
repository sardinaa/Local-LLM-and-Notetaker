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

        this.recordButton.addEventListener('click', () => this.toggleRecording());
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
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            this.audioChunks = [];
            this.recordingSeconds = 0;
            
            // Create media recorder
            this.mediaRecorder = new MediaRecorder(stream);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
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
                console.log('Recording stopped');
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

            // Start recording
            this.mediaRecorder.start();
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
            return;
        }

        try {
            // Show loading indicator
            this.showTranscribingIndicator();

            // Create audio blob from recorded chunks
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // Create FormData to send the audio file
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            
            // Send to server for transcription
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            // Hide loading indicator
            this.hideTranscribingIndicator();
            
            if (result.text) {
                // Add transcribed text to input, appending to existing text
                if (this.inputElement.value) {
                    this.inputElement.value += ' ' + result.text;
                } else {
                    this.inputElement.value = result.text;
                }
                // Focus the input element
                this.inputElement.focus();
            } else {
                throw new Error('No transcription returned');
            }
        } catch (error) {
            console.error('Transcription error:', error);
            this.hideTranscribingIndicator();
            
            this.modalManager.showConfirmationDialog({
                title: 'Transcription Failed',
                message: 'Could not transcribe audio. Please try again.',
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
}

// Initialize when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    // The class will be initialized from chat.js after elements are ready
});

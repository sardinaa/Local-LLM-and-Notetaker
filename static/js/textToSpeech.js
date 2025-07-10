class TextToSpeechManager {
    constructor() {
        // Track state for speech playback
        this.speaking = false;
        this.currentAudio = null;
        this.currentMessageId = null;
        
        // Voice settings
        this.settings = {
            // Default voice settings
            voice: 'en-US-Neural2-F', // Default female voice
            rate: 1.0,
            pitch: 0,
            volume: 1.0,
            // List of preferred voices in order of preference
            preferredVoices: [
                'en-US-Neural2-F',    // Female US English
                'en-GB-Neural2-F',    // Female British English
                'en-US-Neural2-M',    // Male US English
                'en-GB-Neural2-M'     // Male British English
            ]
        };
        
        // Create audio context for smoother playback and controls
        this.audioContext = null;
        try {
            // Modern browsers require user interaction before creating audio context
            window.addEventListener('click', this.initAudioContext.bind(this), { once: true });
        } catch (e) {
            console.warn('Audio Context not supported in this browser');
        }
        
        // Initialize with available voices from server
        this.loadAvailableVoices();
    }
    
    // Initialize audio context after user interaction
    initAudioContext() {
        if (!this.audioContext) {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContext();
                console.log('Audio context initialized');
            } catch (e) {
                console.warn('Failed to create audio context:', e);
            }
        }
    }
    
    // Load available voices from the server
    async loadAvailableVoices() {
        try {
            const response = await fetch('/api/tts/voices');
            if (!response.ok) throw new Error('Failed to fetch voices');
            
            const data = await response.json();
            if (data.voices && data.voices.length > 0) {
                console.log(`Loaded ${data.voices.length} voices from Kokoro TTS`);
                
                // Update settings with server-provided voices
                this.availableVoices = data.voices;
                
                // Select best voice
                this.selectBestVoice();
            }
        } catch (error) {
            console.warn('Could not load voices from server:', error);
        }
    }
    
    // Select the best voice based on preferences
    selectBestVoice() {
        if (!this.availableVoices || this.availableVoices.length === 0) return;
        
        // Try to find a preferred voice
        for (const voiceId of this.settings.preferredVoices) {
            const voice = this.availableVoices.find(v => v.id === voiceId);
            if (voice) {
                this.settings.voice = voice.id;
                console.log(`Selected voice: ${voice.name} (${voice.id})`);
                return;
            }
        }
        
        // If no preferred voice found, use first available
        this.settings.voice = this.availableVoices[0].id;
        console.log(`Using default voice: ${this.availableVoices[0].name}`);
    }
    
    // Speak text using Kokoro TTS via backend
    async speak(text, onStart, onEnd, onError) {
        // Stop any current speech
        this.stop();
        
        if (!text) {
            if (onError) onError('No text provided for speech');
            return false;
        }
        
        try {
            // Generate a unique ID for this speech request
            const speechId = Date.now().toString();
            this.currentMessageId = speechId;
            
            // Clean up text - remove markdown formatting and code blocks
            const cleanText = this.cleanTextForSpeech(text);
            
            // Initialize the audio context if needed
            this.initAudioContext();
            
            // Call onStart callback
            if (onStart) onStart();
            this.speaking = true;
            
            // Show visual progress indicator
            this.showProgressIndicator();
            
            // Send request to backend endpoint
            const response = await fetch('/api/tts/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: cleanText,
                    voice: this.settings.voice,
                    rate: this.settings.rate,
                    pitch: this.settings.pitch,
                    volume: this.settings.volume
                })
            });
            
            // Hide progress indicator
            this.hideProgressIndicator();
            
            // Check if request was cancelled
            if (this.currentMessageId !== speechId) {
                console.log('TTS request cancelled');
                return false;
            }
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API error: ${error}`);
            }
            
            // Get the audio data as blob
            const audioBlob = await response.blob();
            
            // Check if request was cancelled during download
            if (this.currentMessageId !== speechId) {
                console.log('TTS playback cancelled');
                return false;
            }
            
            // Create audio element and play
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // Store reference to control playback
            this.currentAudio = audio;
            
            // Set up event handlers
            audio.onended = () => {
                this.speaking = false;
                this.currentAudio = null;
                URL.revokeObjectURL(audioUrl); // Clean up blob URL
                if (onEnd) onEnd();
            };
            
            audio.onerror = (e) => {
                this.speaking = false;
                this.currentAudio = null;
                URL.revokeObjectURL(audioUrl); // Clean up blob URL
                if (onError) onError(`Error playing audio: ${e.message || 'Unknown error'}`);
            };
            
            // Play the audio
            audio.play();
            return true;
            
        } catch (error) {
            this.hideProgressIndicator();
            this.speaking = false;
            console.error('Text-to-speech error:', error);
            if (onError) onError(`Error generating speech: ${error.message}`);
            return false;
        }
    }
    
    // Show a subtle progress indicator while generating speech
    showProgressIndicator() {
        // Create indicator if it doesn't exist
        if (!document.getElementById('tts-progress-indicator')) {
            const indicator = document.createElement('div');
            indicator.id = 'tts-progress-indicator';
            indicator.innerHTML = 'Generating natural voice...';
            
            // Style the indicator
            Object.assign(indicator.style, {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                background: 'rgba(52, 152, 219, 0.9)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '4px',
                zIndex: '9999',
                fontSize: '14px',
                transition: 'opacity 0.3s ease'
            });
            
            document.body.appendChild(indicator);
        }
        
        // Show the indicator
        document.getElementById('tts-progress-indicator').style.display = 'block';
    }
    
    // Hide the progress indicator
    hideProgressIndicator() {
        const indicator = document.getElementById('tts-progress-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
    
    // Pause the current speech
    pause() {
        if (!this.currentAudio || !this.speaking) return false;
        
        this.currentAudio.pause();
        return true;
    }
    
    // Resume the current speech
    resume() {
        if (!this.currentAudio || !this.speaking) return false;
        
        this.currentAudio.play();
        return true;
    }
    
    // Stop the current speech
    stop() {
        this.currentMessageId = null; // Cancel any pending requests
        
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
        
        this.speaking = false;
        this.hideProgressIndicator();
        return true;
    }
    
    // Clean up text for speech - keep existing function
    cleanTextForSpeech(text) {
        // Remove code blocks (text between triple backticks)
        let cleanText = text.replace(/```[\s\S]*?```/g, 'Code block omitted.');
        
        // Remove inline code (text between single backticks)
        cleanText = cleanText.replace(/`([^`]+)`/g, '$1');
        
        // Remove markdown links, keeping the link text
        cleanText = cleanText.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
        
        // Remove markdown bold/italic formatting
        cleanText = cleanText.replace(/(\*\*|__)(.*?)\1/g, '$2'); // Bold
        cleanText = cleanText.replace(/(\*|_)(.*?)\1/g, '$2');    // Italic
        
        // Remove hash symbols from headers
        cleanText = cleanText.replace(/^#{1,6}\s+/gm, '');
        
        // Remove HTML tags
        cleanText = cleanText.replace(/<[^>]*>/g, '');
        
        // Add natural pauses at punctuation
        cleanText = cleanText.replace(/([.!?])\s+/g, '$1. ');
        cleanText = cleanText.replace(/([,;:])\s+/g, '$1 ');
        
        return cleanText;
    }
    
    // Apply user settings to change voice characteristics
    updateSettings(newSettings) {
        this.settings = {...this.settings, ...newSettings};
    }
    
    // Get a list of available voices for UI selection
    getVoices() {
        return this.availableVoices || [];
    }
    
    // Set a specific voice by ID
    setVoice(voiceId) {
        if (this.availableVoices && this.availableVoices.some(v => v.id === voiceId)) {
            this.settings.voice = voiceId;
            return true;
        }
        return false;
    }
    
    isSpeaking() {
        return this.speaking;
    }
}

// Initialize when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    window.textToSpeech = new TextToSpeechManager();
});

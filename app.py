from flask import Flask, request, jsonify, send_from_directory, render_template
import json
import os
import requests  # For proxying to Ollama
import tempfile  # For temporary audio files
import whisper   # You'll need to install this: pip install openai-whisper
import io
from flask import send_file

# Import Kokoro for TTS
try:
    from kokoro import KPipeline
    import soundfile as sf
    import numpy as np
    import torch
    KOKORO_AVAILABLE = True
    print("Kokoro TTS library loaded successfully")
except ImportError:
    KOKORO_AVAILABLE = False
    print("Kokoro TTS library not available. Install with: pip install kokoro>=0.8.4 soundfile")

app = Flask(__name__, 
            static_folder='static',
            template_folder='templates')

# Ensure data directory exists
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

TREE_FILE = os.path.join(DATA_DIR, 'tree.json')
CHAT_FILE = os.path.join(DATA_DIR, 'chats.json')

# Helper functions
def save_tree(tree_data):
    with open(TREE_FILE, 'w') as f:
        json.dump(tree_data, f)

def load_tree():
    if os.path.exists(TREE_FILE):
        try:
            with open(TREE_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return []
    return []

# Helper functions for chats
def save_chats(chats):
    with open(CHAT_FILE, 'w') as f:
        json.dump(chats, f)

def load_chats():
    if os.path.exists(CHAT_FILE):
        try:
            with open(CHAT_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return []
    return []

# Load Whisper model globally (small model for better performance)
try:
    whisper_model = whisper.load_model("base")
    print("Whisper model loaded successfully")
except Exception as e:
    print(f"Error loading Whisper model: {e}")
    whisper_model = None

# Initialize Kokoro TTS pipelines with different language models
tts_pipelines = {}
if KOKORO_AVAILABLE:
    try:
        # American English pipeline
        tts_pipelines['en-US'] = KPipeline(lang_code='a')  # 'a' for American English
        # British English pipeline
        tts_pipelines['en-GB'] = KPipeline(lang_code='b')  # 'b' for British English
        print(f"Initialized {len(tts_pipelines)} Kokoro TTS pipelines")
    except Exception as e:
        print(f"Error initializing Kokoro pipelines: {e}")
        KOKORO_AVAILABLE = False

# Available voices mapping
AVAILABLE_VOICES = {
    'en-US-Neural2-F': {'lang': 'en-US', 'voice': 'af_heart', 'description': 'US Female - Heart'},
    'en-US-Neural2-M': {'lang': 'en-US', 'voice': 'am_full', 'description': 'US Male - Full'},
    'en-GB-Neural2-F': {'lang': 'en-GB', 'voice': 'bf_gentle', 'description': 'UK Female - Gentle'},
    'en-GB-Neural2-M': {'lang': 'en-GB', 'voice': 'bm_full', 'description': 'UK Male - Full'}
}

# Routes for static files
@app.route('/')
def index():
    return render_template('index.html')

# API endpoints for tree
@app.route('/api/tree', methods=['GET', 'POST'])
def manage_tree():
    if request.method == 'GET':
        tree_data = load_tree()
        return json.dumps(tree_data)
    elif request.method == 'POST':
        tree_data = request.json
        save_tree(tree_data)
        return jsonify({"status": "success"})

@app.route('/api/notes', methods=['POST'])
def save_note():
    note_data = request.json
    
    # In a real app, you'd save this to a database
    # Here we just update the tree
    tree_data = load_tree()
    
    # Find and update the note in the tree
    def update_note_in_tree(nodes, note_id, title, content):
        for node in nodes:
            if node.get('id') == note_id:
                node['name'] = title
                node['content'] = content
                return True
            if node.get('children') and isinstance(node['children'], list):
                if update_note_in_tree(node['children'], note_id, title, content):
                    return True
        return False
    
    if update_note_in_tree(tree_data, note_data['id'], note_data['title'], note_data['content']):
        save_tree(tree_data)
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "Note not found"}), 404

# API endpoint for chats
@app.route('/api/chats', methods=['GET', 'POST'])
def manage_chats():
    if request.method == 'GET':
        chats = load_chats()
        return json.dumps(chats)
    elif request.method == 'POST':
        # Save the entire tree structure instead of appending
        chats_tree = request.json
        save_chats(chats_tree)
        return jsonify({"status": "success"})

# Route for LLM chat
@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    prompt = data.get('prompt', '')
    try:
        response = requests.post(
            "http://127.0.0.1:11434/api/generate",
            json={
                "model": "llama3.2:1b",  # Specify the desired model
                "prompt": prompt,
                "stream": False
            },
            timeout=100
        )
        bot_reply = response.json().get("response", "Error processing response")
    except Exception as e:
        print("Error contacting Ollama:", e)
        bot_reply = "Error contacting LLM service."
    return jsonify({"response": bot_reply})

# Endpoint for audio transcription
@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    audio_file = request.files['audio']
    
    if not whisper_model:
        return jsonify({"error": "Whisper model not available"}), 500
    
    # Save to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
        audio_path = temp_file.name
        audio_file.save(audio_path)
    
    try:
        # Transcribe audio using Whisper
        result = whisper_model.transcribe(audio_path)
        transcribed_text = result["text"]
        
        # Clean up the temporary file
        os.unlink(audio_path)
        
        return jsonify({"text": transcribed_text})
    except Exception as e:
        # Clean up on error
        if os.path.exists(audio_path):
            os.unlink(audio_path)
        print(f"Transcription error: {e}")
        return jsonify({"error": str(e)}), 500

# TTS voices API endpoint - provides available voices
@app.route('/api/tts/voices', methods=['GET'])
def tts_voices():
    if not KOKORO_AVAILABLE:
        return jsonify({"error": "Kokoro TTS not available"}), 500

    # Return the available voices
    voices_list = []
    for voice_id, details in AVAILABLE_VOICES.items():
        voices_list.append({
            "id": voice_id,
            "name": details['description'],
            "language": details['lang']
        })
    
    return jsonify({"voices": voices_list})

# TTS generation endpoint - generates audio from text
@app.route('/api/tts/generate', methods=['POST'])
def tts_generate():
    if not KOKORO_AVAILABLE:
        return jsonify({"error": "Kokoro TTS not available"}), 500
    
    data = request.json
    
    if not data or 'text' not in data:
        return jsonify({"error": "No text provided"}), 400
        
    text = data.get('text', '')
    voice_id = data.get('voice', 'en-US-Neural2-F')
    speed = float(data.get('rate', 1.0))
    
    # If the requested voice isn't available, default to the first one
    if voice_id not in AVAILABLE_VOICES:
        voice_id = list(AVAILABLE_VOICES.keys())[0]
    
    voice_details = AVAILABLE_VOICES[voice_id]
    lang = voice_details['lang']
    voice_name = voice_details['voice']
    
    try:
        # Get the appropriate pipeline for the language
        if lang not in tts_pipelines:
            return jsonify({"error": f"Language {lang} not supported"}), 400
            
        pipeline = tts_pipelines[lang]
        
        # Using a temporary file for the audio output
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_audio:
            audio_path = temp_audio.name
        
        # Generate audio using Kokoro
        full_audio = np.array([])
        
        # Process the text in smaller chunks to avoid too long sentences
        generator = pipeline(
            text,
            voice=voice_name,
            speed=speed,
            split_pattern=r'[.!?;:]\s+'  # Split on sentence boundaries
        )
        
        # Process each chunk
        for _, _, audio_chunk in generator:
            if len(audio_chunk) > 0:
                # Append to the full audio array
                if len(full_audio) == 0:
                    full_audio = audio_chunk
                else:
                    # Add a small pause between sentences
                    pause = np.zeros(int(24000 * 0.3))  # 0.3s pause at 24kHz
                    full_audio = np.concatenate((full_audio, pause, audio_chunk))
        
        # Save the audio to the temporary file
        if len(full_audio) > 0:
            sf.write(audio_path, full_audio, 24000)  # Kokoro uses 24kHz sample rate
        else:
            # If no audio was generated, create a silent file
            sf.write(audio_path, np.zeros(1000), 24000)
            print("Warning: No audio content was generated")
        
        # Return the audio file - Fix: remove attachment_filename parameter
        return send_file(
            audio_path,
            mimetype="audio/wav",
            as_attachment=True,
            download_name="speech.wav"
        )
        
    except Exception as e:
        print(f"Error generating speech: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
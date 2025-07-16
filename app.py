from flask import Flask, request, jsonify, send_from_directory, render_template, Response
import json
import os
import requests  # For proxying to Ollama
import tempfile  # For temporary audio files
import whisper   # You'll need to install this: pip install openai-whisper
import io
import logging
from flask import send_file
from data_service import DataService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# Legacy file paths for migration
TREE_FILE = os.path.join(DATA_DIR, 'tree.json')
CHAT_FILE = os.path.join(DATA_DIR, 'chats.json')

# Initialize improved data service
data_service = DataService()

# Check if migration is needed
if os.path.exists(TREE_FILE) or os.path.exists(CHAT_FILE):
    logger.info("Migrating from JSON files to database...")
    success = data_service.migrate_from_json_files(TREE_FILE, CHAT_FILE)
    if success:
        logger.info("Migration completed successfully")
        # Backup old files
        if os.path.exists(TREE_FILE):
            os.rename(TREE_FILE, TREE_FILE + '.backup')
        if os.path.exists(CHAT_FILE):
            os.rename(CHAT_FILE, CHAT_FILE + '.backup')
    else:
        logger.error("Migration failed, using legacy system")

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
        tree_data = data_service.get_tree()
        return jsonify(tree_data)
    elif request.method == 'POST':
        tree_data = request.json
        # For now, we'll handle individual node updates
        # This endpoint might need refactoring for bulk operations
        return jsonify({"status": "success", "message": "Use specific node endpoints for updates"})

@app.route('/api/nodes', methods=['POST'])
def create_node():
    """Create a new node in the tree."""
    node_data = request.json
    
    success = data_service.create_node(
        node_data['id'],
        node_data['name'],
        node_data['type'],
        node_data.get('parentId'),
        customization=node_data.get('customization')
    )
    
    if success:
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "Failed to create node"}), 500

@app.route('/api/nodes/<node_id>', methods=['PUT', 'DELETE'])
def manage_node(node_id):
    """Update or delete a specific node."""
    if request.method == 'PUT':
        node_data = request.json
        logger.info(f"Updating node {node_id} with data: {node_data}")
        
        try:
            success = data_service.update_node(node_id, **node_data)
            logger.info(f"Update result for node {node_id}: {success}")
            
            if success:
                return jsonify({"status": "success"})
            else:
                logger.error(f"Failed to update node {node_id}")
                return jsonify({"status": "error", "message": "Failed to update node"}), 500
        except Exception as e:
            logger.error(f"Exception updating node {node_id}: {e}")
            return jsonify({"status": "error", "message": f"Exception: {str(e)}"}), 500
    
    elif request.method == 'DELETE':
        success = data_service.delete_node(node_id)
        
        if success:
            return jsonify({"status": "success"})
        else:
            return jsonify({"status": "error", "message": "Failed to delete node"}), 500

@app.route('/api/nodes/<node_id>/move', methods=['PUT'])
def move_node(node_id):
    """Move a node to a new parent and/or position."""
    move_data = request.json
    new_parent_id = move_data.get('parentId')
    new_sort_order = move_data.get('sortOrder')
    
    success = data_service.move_node(node_id, new_parent_id, new_sort_order)
    
    if success:
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "Failed to move node"}), 500

@app.route('/api/notes', methods=['POST'])
def save_note():
    note_data = request.json
    
    success = data_service.save_note(
        note_data['id'],
        note_data['title'],
        note_data['content']
    )
    
    if success:
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "Failed to save note"}), 500

@app.route('/api/notes/<note_id>', methods=['GET'])
def get_note(note_id):
    """Get a specific note by ID."""
    note = data_service.get_note(note_id)
    
    if note:
        return jsonify(note)
    else:
        return jsonify({"status": "error", "message": "Note not found"}), 404

# API endpoint for chats
@app.route('/api/chats', methods=['GET', 'POST'])
def manage_chats():
    if request.method == 'GET':
        # Get all chat nodes from the tree
        tree = data_service.get_tree()
        chat_nodes = []
        
        def extract_chats(nodes):
            for node in nodes:
                if node['type'] == 'chat':
                    chat_nodes.append(node)
                if 'children' in node:
                    extract_chats(node['children'])
        
        extract_chats(tree)
        return jsonify(chat_nodes)
    
    elif request.method == 'POST':
        # Save chat messages for a specific chat node
        chat_data = request.json
        
        if 'id' in chat_data and 'messages' in chat_data:
            success = data_service.save_chat(chat_data['id'], chat_data['messages'])
            
            if success:
                return jsonify({"status": "success"})
            else:
                return jsonify({"status": "error", "message": "Failed to save chat"}), 500
        else:
            return jsonify({"status": "error", "message": "Invalid chat data"}), 400

@app.route('/api/chats/<chat_id>', methods=['GET'])
def get_chat(chat_id):
    """Get a specific chat by ID."""
    chat = data_service.get_chat(chat_id)
    
    if chat:
        return jsonify(chat)
    else:
        return jsonify({"status": "error", "message": "Chat not found"}), 404

# Route for LLM chat with streaming support
@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    prompt = data.get('prompt', '')
    use_stream = data.get('stream', True)  # Default to streaming
    
    if use_stream:
        # Return streaming response
        def generate():
            try:
                response = requests.post(
                    "http://127.0.0.1:11434/api/generate",
                    json={
                        "model": "llama3.2:1b",
                        "prompt": prompt,
                        "stream": True
                    },
                    stream=True,
                    timeout=100
                )
                
                for line in response.iter_lines():
                    if line:
                        try:
                            json_response = json.loads(line.decode('utf-8'))
                            if 'response' in json_response:
                                # Send each chunk as Server-Sent Events
                                yield f"data: {json.dumps({'token': json_response['response']})}\n\n"
                            
                            # Check if this is the final chunk
                            if json_response.get('done', False):
                                yield f"data: {json.dumps({'done': True})}\n\n"
                                break
                        except json.JSONDecodeError:
                            continue
                            
            except Exception as e:
                print("Error contacting Ollama:", e)
                yield f"data: {json.dumps({'error': 'Error contacting LLM service.'})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
    else:
        # Non-streaming response (backward compatibility)
        try:
            response = requests.post(
                "http://127.0.0.1:11434/api/generate",
                json={
                    "model": "llama3.2:1b",
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

# Route for generating chat titles from first messages
@app.route('/api/generate-chat-title', methods=['POST'])
def generate_chat_title():
    data = request.json
    first_message = data.get('message', '')
    
    if not first_message:
        return jsonify({"title": "New Chat"}), 400
    
    # Create a prompt to generate a concise title
    title_prompt = f"""Generate a short, descriptive title (2-5 words) for a chat conversation that starts with this message: "{first_message[:200]}"

Rules:
- Maximum 5 words
- No quotes or special characters
- Descriptive and relevant
- Professional tone

Title:"""
    
    try:
        response = requests.post(
            "http://127.0.0.1:11434/api/generate",
            json={
                "model": "llama3.2:1b",
                "prompt": title_prompt,
                "stream": False
            },
            timeout=30
        )
        
        if response.ok:
            generated_title = response.json().get("response", "").strip()
            # Clean up the response - remove any unwanted text
            lines = generated_title.split('\n')
            title = lines[0].strip()
            
            # Remove common prefixes/suffixes and quotes
            title = title.replace('Title:', '').replace('"', '').replace("'", '').strip()
            
            # Ensure it's not too long
            if len(title) > 50:
                title = title[:50].rsplit(' ', 1)[0] + '...'
            
            # Fallback to simple approach if generated title is empty or too generic
            if not title or title.lower() in ['chat', 'conversation', 'discussion']:
                words = first_message.split()[:4]
                title = ' '.join(words)
                if len(title) > 30:
                    title = title[:30] + '...'
            
            return jsonify({"title": title or "New Chat"})
        else:
            # Fallback to simple word extraction
            words = first_message.split()[:4]
            title = ' '.join(words)
            if len(title) > 30:
                title = title[:30] + '...'
            return jsonify({"title": title or "New Chat"})
            
    except Exception as e:
        print(f"Error generating chat title: {e}")
        # Fallback to simple word extraction
        words = first_message.split()[:4]
        title = ' '.join(words)
        if len(title) > 30:
            title = title[:30] + '...'
        return jsonify({"title": title or "New Chat"})

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

# Additional API endpoints for improved functionality

@app.route('/api/search', methods=['GET'])
def search_content():
    """Search across all content."""
    query = request.args.get('q', '')
    content_type = request.args.get('type', 'all')
    
    if not query:
        return jsonify({"results": []})
    
    results = data_service.search_content(query, content_type)
    return jsonify({"results": results})

@app.route('/api/recent', methods=['GET'])
def get_recent_items():
    """Get recently updated items."""
    limit = int(request.args.get('limit', 10))
    recent_items = data_service.get_recent_items(limit)
    return jsonify({"items": recent_items})

@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    """Get application statistics."""
    stats = data_service.get_statistics()
    return jsonify(stats)

@app.route('/api/export', methods=['GET'])
def export_data():
    """Export all data for backup."""
    data = data_service.export_data()
    return jsonify(data)

@app.route('/api/import', methods=['POST'])
def import_data():
    """Import data from backup."""
    import_data = request.json
    
    success = data_service.import_data(import_data)
    
    if success:
        return jsonify({"status": "success", "message": "Data imported successfully"})
    else:
        return jsonify({"status": "error", "message": "Failed to import data"}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    health = data_service.health_check()
    status_code = 200 if health['status'] == 'healthy' else 500
    return jsonify(health), status_code

if __name__ == '__main__':
    app.run(debug=True)
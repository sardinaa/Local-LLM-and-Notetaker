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
from chat_history_manager import ChatHistoryManager
from rag_manager import RAGManager
from agent_manager import AgentsManager
import numpy as np

# Import audio processing libraries
try:
    from pydub import AudioSegment
    import librosa
    import soundfile as sf
    AUDIO_PROCESSING_AVAILABLE = True
    print("Audio processing libraries loaded successfully")
except ImportError as e:
    AUDIO_PROCESSING_AVAILABLE = False
    print(f"Audio processing libraries not available: {e}")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import Kokoro for TTS
try:
    from kokoro import KPipeline
    import soundfile as sf
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

# Initialize improved data service (honor DATABASE_PATH env var)
DB_PATH = os.getenv('DATABASE_PATH', 'instance/notetaker.db')
logger.info(f"Using database at: {DB_PATH}")
data_service = DataService(db_path=DB_PATH)

# Initialize chat history manager
chat_history_manager = ChatHistoryManager()

# Initialize RAG manager
try:
    rag_manager = RAGManager()
    logger.info("RAG manager initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize RAG manager: {e}")
    rag_manager = None

# Initialize Agents manager
try:
    agents_manager = AgentsManager(data_service)
    logger.info("Agents manager initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Agents manager: {e}")
    agents_manager = None

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

# Load Whisper model globally (prefer higher-accuracy model)
WHISPER_MODEL_NAME = os.getenv('WHISPER_MODEL', 'medium')  # e.g., 'medium', 'large-v3', 'small', 'base'
whisper_model = None
try:
    whisper_model = whisper.load_model(WHISPER_MODEL_NAME)
    print(f"Whisper model '{WHISPER_MODEL_NAME}' loaded successfully")
except Exception as e:
    print(f"Error loading Whisper model '{WHISPER_MODEL_NAME}': {e}")
    # Fallback chain
    fallback_models = []
    if WHISPER_MODEL_NAME != 'medium':
        fallback_models.append('medium')
    fallback_models += ['small', 'base', 'tiny']
    for m in fallback_models:
        try:
            whisper_model = whisper.load_model(m)
            print(f"Fell back to Whisper model '{m}' successfully")
            break
        except Exception as ex:
            print(f"Error loading Whisper model '{m}': {ex}")
            continue
    if whisper_model is None:
        print("Failed to load any Whisper model")

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

def preprocess_audio_for_whisper(audio_path):
    """
    Preprocess audio file to improve Whisper transcription quality.
    Returns the path to the processed audio file.
    """
    if not AUDIO_PROCESSING_AVAILABLE:
        return audio_path
    
    try:
        # Load audio with pydub for basic format conversion only
        audio = AudioSegment.from_file(audio_path)
        
        # Get audio statistics
        duration_ms = len(audio)
        logger.info(f"Original audio - Duration: {duration_ms}ms, Sample rate: {audio.frame_rate}Hz, Channels: {audio.channels}")
        
        # Check minimum duration (500ms for better accuracy)
        if duration_ms < 500:
            logger.warning(f"Audio too short: {duration_ms}ms")
            return None
        
        # Enhanced audio processing for better recognition
        # Convert to mono if stereo
        if audio.channels > 1:
            audio = audio.set_channels(1)
            logger.info("Converted to mono")
        
        # Normalize volume to improve recognition
        audio = audio.normalize()
        
        # Set optimal sample rate for Whisper (16kHz is optimal)
        if audio.frame_rate != 16000:
            audio = audio.set_frame_rate(16000)
            logger.info("Resampled to 16kHz")
        
        # Apply noise reduction using librosa for better accuracy
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_wav:
            temp_wav_path = temp_wav.name
        
        # Export to WAV first
        audio.export(temp_wav_path, format='wav')
        
        # Use librosa for noise reduction and enhancement
        try:
            y, sr = librosa.load(temp_wav_path, sr=16000)
            
            if len(y) > 0:
                # Trim silence more aggressively
                y_trimmed, _ = librosa.effects.trim(y, top_db=30)
                
                if len(y_trimmed) > 0.5 * sr:  # At least 0.5 seconds after trimming
                    # Normalize audio levels
                    y_normalized = librosa.util.normalize(y_trimmed)
                    
                    # Apply light noise reduction using spectral gating
                    # This helps remove background noise
                    stft = librosa.stft(y_normalized)
                    magnitude = np.abs(stft)
                    
                    # Simple noise gate - suppress very quiet parts
                    noise_threshold = np.percentile(magnitude, 20)  # Bottom 20% considered noise
                    magnitude_gated = np.where(magnitude > noise_threshold, magnitude, magnitude * 0.1)
                    
                    # Reconstruct audio
                    phase = np.angle(stft)
                    stft_cleaned = magnitude_gated * np.exp(1j * phase)
                    y_cleaned = librosa.istft(stft_cleaned)
                    
                    # Final normalization
                    y_final = librosa.util.normalize(y_cleaned)
                    
                    # Save the processed audio
                    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as processed_file:
                        processed_path = processed_file.name
                    
                    sf.write(processed_path, y_final, sr)
                    
                    # Clean up temporary file
                    os.unlink(temp_wav_path)
                    
                    logger.info(f"Audio preprocessed with noise reduction - Duration: {len(y_final)/sr:.2f}s")
                    return processed_path
                else:
                    logger.warning("Audio became too short after trimming silence")
                    os.unlink(temp_wav_path)
                    return None
            else:
                logger.warning("Audio data is empty")
                os.unlink(temp_wav_path)
                return None
                
        except Exception as librosa_error:
            logger.warning(f"Librosa processing failed: {librosa_error}, using basic processing")
            # Fallback to basic processing
            os.unlink(temp_wav_path)
            
            # Create output file with basic processing only
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as processed_file:
                processed_path = processed_file.name
            
            # Export as WAV with basic processing
            audio.export(processed_path, format='wav')
            logger.info(f"Audio preprocessed (basic) - Duration: {duration_ms/1000:.2f}s")
            return processed_path
            
    except Exception as e:
        logger.error(f"Error preprocessing audio: {e}")
        return audio_path  # Return original if preprocessing fails

# Routes for static files
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/mobile-test')
def mobile_test():
    return send_from_directory('.', 'mobile-test.html')

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

# Mark chat as used (updates ordering by timestamp)
@app.route('/api/chats/<chat_id>/touch', methods=['POST'])
def touch_chat(chat_id):
    try:
        success = data_service.touch_chat(chat_id)
        if success:
            return jsonify({"status": "success"})
        else:
            return jsonify({"status": "error", "message": "Failed to touch chat"}), 500
    except Exception as e:
        logger.error(f"Error touching chat {chat_id}: {e}")
        return jsonify({"status": "error", "message": "Exception while touching chat"}), 500

# Route for LLM chat with streaming support and context awareness
@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    prompt = data.get('prompt', '')
    chat_id = data.get('chat_id', 'default')  # Get chat ID for context management
    model_name = data.get('model', None)  # Get selected model
    use_stream = data.get('stream', True)  # Default to streaming
    force_search = data.get('force_search', False)  # Manual web search override
    
    # Load existing chat history if available
    if chat_id != 'default':
        try:
            existing_chat = data_service.get_chat(chat_id)
            if existing_chat and 'messages' in existing_chat:
                chat_history_manager.load_chat_history(chat_id, existing_chat['messages'])
        except Exception as e:
            logger.warning(f"Could not load chat history for {chat_id}: {e}")
    
    if use_stream:
        # Return streaming response with context
        def generate():
            try:
                for chunk in chat_history_manager.get_response_stream(chat_id, prompt, model_name, force_search):
                    if chunk:
                        yield f"data: {json.dumps({'token': chunk})}\n\n"
                
                yield f"data: {json.dumps({'done': True})}\n\n"
                            
            except Exception as e:
                logger.error(f"Error in streaming chat: {e}")
                yield f"data: {json.dumps({'error': 'Error contacting LLM service.'})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
    else:
        # Non-streaming response with context
        try:
            bot_reply = chat_history_manager.get_response(chat_id, prompt, model_name, force_search)
            return jsonify({"response": bot_reply})
        except Exception as e:
            logger.error(f"Error in non-streaming chat: {e}")
            return jsonify({"response": "Error contacting LLM service."})

# New endpoint for chat with explicit context management
@app.route('/api/chat-with-context', methods=['POST'])
def chat_with_context():
    """
    Enhanced chat endpoint that explicitly manages conversation context.
    Expected payload:
    {
        "chat_id": "unique_chat_identifier",
        "message": "user message",
        "history": [{"role": "user|assistant", "content": "message"}],  # optional
        "stream": true/false,
        "model": "model_name",  # optional
        "force_search": true/false  # optional
    }
    """
    data = request.json
    chat_id = data.get('chat_id')
    message = data.get('message', '')
    history = data.get('history', [])
    model_name = data.get('model', None)  # Get selected model
    use_stream = data.get('stream', True)
    force_search = data.get('force_search', False)  # Manual web search override
    
    if not chat_id:
        return jsonify({"error": "chat_id is required"}), 400
    
    if not message:
        return jsonify({"error": "message is required"}), 400
    
    # Load provided history into the chat manager
    if history:
        try:
            chat_history_manager.load_chat_history(chat_id, history)
        except Exception as e:
            logger.warning(f"Could not load provided history for {chat_id}: {e}")
    
    if use_stream:
        def generate():
            try:
                for chunk in chat_history_manager.get_response_stream(chat_id, message, model_name, force_search):
                    if chunk:
                        yield f"data: {json.dumps({'token': chunk})}\n\n"
                
                yield f"data: {json.dumps({'done': True})}\n\n"
                            
            except Exception as e:
                logger.error(f"Error in streaming chat with context: {e}")
                yield f"data: {json.dumps({'error': 'Error contacting LLM service.'})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
    else:
        try:
            response = chat_history_manager.get_response(chat_id, message, model_name, force_search)
            return jsonify({"response": response})
        except Exception as e:
            logger.error(f"Error in chat with context: {e}")
            return jsonify({"response": "Error contacting LLM service."})

# Endpoint to get chat summaryOpen file in editor (ctrl + click)


@app.route('/api/chat-summary/<chat_id>', methods=['GET'])
def get_chat_summary(chat_id):
    """Get a summary of the chat conversation."""
    try:
        summary = chat_history_manager.get_chat_summary(chat_id)
        return jsonify({"summary": summary})
    except Exception as e:
        logger.error(f"Error getting chat summary for {chat_id}: {e}")
        return jsonify({"error": "Could not generate summary"}), 500

# Endpoint to clear chat context
@app.route('/api/chat-context/<chat_id>', methods=['DELETE'])
def clear_chat_context(chat_id):
    """Clear the context for a specific chat session."""
    try:
        success = chat_history_manager.clear_session(chat_id)
        if success:
            return jsonify({"status": "success", "message": "Chat context cleared"})
        else:
            return jsonify({"status": "error", "message": "Chat session not found"}), 404
    except Exception as e:
        logger.error(f"Error clearing chat context for {chat_id}: {e}")
        return jsonify({"error": "Could not clear chat context"}), 500

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
    
    # Check if audio file has content
    if audio_file.filename == '':
        return jsonify({"error": "No audio file selected"}), 400
    
    # Save to temporary file with proper extension based on content type
    file_extension = '.webm'  # Default
    if audio_file.content_type:
        if 'wav' in audio_file.content_type:
            file_extension = '.wav'
        elif 'mp3' in audio_file.content_type:
            file_extension = '.mp3'
        elif 'ogg' in audio_file.content_type:
            file_extension = '.ogg'
        elif 'm4a' in audio_file.content_type:
            file_extension = '.m4a'
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
        original_audio_path = temp_file.name
        audio_file.save(original_audio_path)
    
    processed_audio_path = None
    
    try:
        # Check file size
        file_size = os.path.getsize(original_audio_path)
        logger.info(f"Processing audio file: {audio_file.filename}, size: {file_size} bytes, type: {audio_file.content_type}")
        
        if file_size == 0:
            os.unlink(original_audio_path)
            return jsonify({"error": "Audio file is empty"}), 400
        
        # Preprocess audio for better transcription quality
        # Try without preprocessing first to debug
        bypass_preprocessing = request.form.get('bypass_preprocessing', 'false').lower() == 'true'
        
        if bypass_preprocessing:
            logger.info("Bypassing audio preprocessing for debugging")
            processed_audio_path = original_audio_path
        else:
            processed_audio_path = preprocess_audio_for_whisper(original_audio_path)
        
        if processed_audio_path is None:
            os.unlink(original_audio_path)
            return jsonify({"error": "Audio preprocessing failed - audio may be too short or silent"}), 400
        
        # Use processed audio if different from original, otherwise use original
        transcription_path = processed_audio_path if processed_audio_path != original_audio_path else original_audio_path
        
        # Get language preference from form data (auto-detect by default)
        preferred_language = request.form.get('language', 'auto')

        # Auto-detect language more reliably using Whisper's detect_language
        whisper_language = None
        detected_language = 'unknown'
        detected_prob = 0.0
        if preferred_language and preferred_language != 'auto':
            whisper_language = preferred_language
            logger.info(f"Using preferred transcription language: {whisper_language}")
        else:
            try:
                audio_array = whisper.load_audio(transcription_path)
                audio_array = whisper.pad_or_trim(audio_array)
                mel = whisper.log_mel_spectrogram(audio_array).to(whisper_model.device)
                _, lang_probs = whisper_model.detect_language(mel)
                # Select top language
                detected_language, detected_prob = max(lang_probs.items(), key=lambda x: x[1])
                logger.info(f"Detected language: {detected_language} with prob {detected_prob:.2f}")
                # Use detected language if confident
                if detected_prob >= 0.70:
                    whisper_language = detected_language
            except Exception as e_lang:
                logger.warning(f"Language detection failed: {e_lang}. Falling back to auto.")

        # Transcribe audio using Whisper with optimized settings for accuracy
        logger.info(f"Starting transcription with Whisper using language: {whisper_language or 'auto'}")

        try:
            result = whisper_model.transcribe(
                transcription_path,
                language=whisper_language,  # None for auto-detect, or specific language
                task='transcribe',
                verbose=False,
                temperature=[0.0, 0.2],  # fallback sampling temperatures
                beam_size=5,
                best_of=5,
                patience=1.0,
                condition_on_previous_text=False,
                compression_ratio_threshold=2.4,
                logprob_threshold=-1.0,
                no_speech_threshold=0.4,  # slightly lower to reduce missed quiet speech
            )
        except Exception as whisper_error:
            logger.warning(f"Transcription failed: {whisper_error}; retrying with auto language and safe defaults")
            # Fallback to auto-detect transcription
            result = whisper_model.transcribe(
                transcription_path,
                language=None,
                task='transcribe',
                verbose=False,
                temperature=[0.0, 0.2],
                beam_size=5,
                best_of=5,
                patience=1.0,
                condition_on_previous_text=False,
                compression_ratio_threshold=2.4,
                logprob_threshold=-1.0,
                no_speech_threshold=0.4,
            )
        
        transcribed_text = result.get("text", "").strip()
        detected_language = result.get("language", detected_language or "unknown")
        confidence_segments = result.get("segments", [])
        
        # Debug: Log the full Whisper result
        logger.info(f"Full Whisper result: {result}")
        
        # Calculate average confidence if segments are available
        avg_confidence = 0.0
        if confidence_segments:
            confidences = [segment.get("avg_logprob", 0.0) for segment in confidence_segments]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            
            # Debug: Log segment details
            for i, segment in enumerate(confidence_segments[:3]):  # Log first 3 segments
                logger.info(f"Segment {i}: text='{segment.get('text', '')}', confidence={segment.get('avg_logprob', 0.0)}")
        
        # Log detailed result for debugging
        logger.info(f"Whisper result - Language: {detected_language}, Text: '{transcribed_text}', Length: {len(transcribed_text)}, Avg confidence: {avg_confidence:.3f}")
        
        # Clean up temporary files
        os.unlink(original_audio_path)
        if processed_audio_path and processed_audio_path != original_audio_path:
            os.unlink(processed_audio_path)
        
        # Check if we got any meaningful transcription
        if not transcribed_text:
            logger.warning("No transcription returned from Whisper model")
            return jsonify({"error": "No speech detected in audio. Please try speaking more clearly and ensure good microphone placement."}), 400
        
        # Check for very low confidence transcriptions and provide feedback
        if avg_confidence < -1.5:  # Very low confidence
            logger.warning(f"Very low confidence transcription: {avg_confidence:.3f}")
            return jsonify({
                "text": transcribed_text,
                "language": detected_language,
                "confidence": avg_confidence,
                "warning": "Low confidence transcription. Try recording again with better audio quality."
            })
        elif avg_confidence < -1.0:  # Moderately low confidence
            logger.warning(f"Low confidence transcription: {avg_confidence:.3f}")
            return jsonify({
                "text": transcribed_text,
                "language": detected_language,
                "confidence": avg_confidence,
                "warning": "Transcription may not be fully accurate. Consider recording again if needed."
            })
        
        return jsonify({
            "text": transcribed_text,
            "language": detected_language,
            "confidence": avg_confidence
        })
        
    except Exception as e:
        # Clean up on error
        if os.path.exists(original_audio_path):
            os.unlink(original_audio_path)
        if processed_audio_path and processed_audio_path != original_audio_path and os.path.exists(processed_audio_path):
            os.unlink(processed_audio_path)
        logger.error(f"Transcription error: {e}")
        return jsonify({"error": f"Transcription failed: {str(e)}"}), 500

# Debug endpoint for audio transcription testing
@app.route('/api/transcribe-debug', methods=['POST'])
def transcribe_audio_debug():
    """Debug version of transcription with minimal processing."""
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    audio_file = request.files['audio']
    
    if not whisper_model:
        return jsonify({"error": "Whisper model not available"}), 500
    
    # Save audio directly without any preprocessing
    with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
        audio_path = temp_file.name
        audio_file.save(audio_path)
    
    try:
        file_size = os.path.getsize(audio_path)
        logger.info(f"DEBUG: Processing audio file directly - size: {file_size} bytes")
        
        # Use minimal Whisper options
        result = whisper_model.transcribe(audio_path, verbose=True)
        
        logger.info(f"DEBUG: Raw Whisper result: {result}")
        
        # Clean up
        os.unlink(audio_path)
        
        return jsonify({
            "debug": True,
            "raw_result": result,
            "text": result.get("text", "").strip(),
            "language": result.get("language", "unknown")
        })
        
    except Exception as e:
        if os.path.exists(audio_path):
            os.unlink(audio_path)
        logger.error(f"DEBUG transcription error: {e}")
        return jsonify({"error": f"Debug transcription failed: {str(e)}"}), 500

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

# =========================
# Tag System API
# =========================
@app.route('/api/tags', methods=['GET', 'POST'])
def tags_index():
    if request.method == 'GET':
        q = request.args.get('q')
        limit = int(request.args.get('limit', 50))
        include_usage = request.args.get('includeUsage', 'false').lower() == 'true'
        parent_id = request.args.get('parentId')
        tags = data_service.list_tags(q=q, limit=limit, include_usage=include_usage, parent_id=parent_id)
        return jsonify({ 'tags': tags })
    else:
        payload = request.json or {}
        tag = data_service.create_tag(payload)
        if tag:
            return jsonify(tag)
        return jsonify({ 'error': 'failed_to_create' }), 400

@app.route('/api/tags/<tag_id>', methods=['PATCH', 'DELETE'])
def tags_item(tag_id):
    if request.method == 'PATCH':
        patch = request.json or {}
        tag = data_service.update_tag(tag_id, patch)
        if tag:
            return jsonify(tag)
        return jsonify({ 'error': 'not_found' }), 404
    else:
        cascade = request.args.get('cascade', 'false').lower() == 'true'
        force = request.args.get('force', 'false').lower() == 'true'
        result = data_service.delete_tag(tag_id, cascade=cascade, force=force)
        status = 200 if result.get('deleted') else 400
        return jsonify(result), status

@app.route('/api/tags/merge', methods=['POST'])
def tags_merge():
    payload = request.json or {}
    source_ids = payload.get('sourceIds') or []
    target_id = payload.get('targetId')
    if not target_id or not isinstance(source_ids, list) or not source_ids:
        return jsonify({ 'error': 'invalid_params' }), 400
    res = data_service.merge_tags(source_ids, target_id)
    status = 200 if res.get('merged') else 400
    return jsonify(res), status

@app.route('/api/notes/<note_id>/tags', methods=['GET', 'POST', 'PUT'])
def note_tags(note_id):
    if request.method == 'GET':
        return jsonify({ 'tags': data_service.get_tags_for_note(note_id) })
    else:
        payload = request.json or {}
        tag_ids = payload.get('tagIds') or []
        if not isinstance(tag_ids, list):
            return jsonify({ 'error': 'tagIds must be an array' }), 400
        ok = False
        if request.method == 'POST':
            ok = data_service.assign_tags_to_note(note_id, tag_ids)
        else:
            ok = data_service.replace_note_tags(note_id, tag_ids)
        return jsonify({ 'status': 'success' if ok else 'error' }), (200 if ok else 500)

@app.route('/api/notes/search-by-tags', methods=['GET'])
def notes_search_by_tags():
    def parse_ids(param):
        v = request.args.get(param)
        if not v:
            return []
        return [x for x in v.split(',') if x]
    any_of = parse_ids('anyOf')
    all_of = parse_ids('allOf')
    none_of = parse_ids('noneOf')
    limit = int(request.args.get('limit', 50))
    cursor = request.args.get('cursor')
    ids = data_service.search_notes_by_tags(any_of, all_of, none_of, limit, cursor)
    return jsonify({ 'noteIds': ids })

@app.route('/api/tags/<tag_id>/dashboard', methods=['GET'])
def tag_dashboard(tag_id):
    data = data_service.get_tag_dashboard(tag_id)
    if not data:
        return jsonify({ 'error': 'not_found' }), 404
    return jsonify(data)

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

@app.route('/api/ollama/models', methods=['GET'])
def get_ollama_models():
    """Get list of available Ollama models."""
    try:
        response = requests.get(
            "http://127.0.0.1:11434/api/tags",
            timeout=10
        )
        
        if response.ok:
            models_data = response.json()
            models = []
            for model in models_data.get("models", []):
                models.append({
                    "name": model.get("name", ""),
                    "modified_at": model.get("modified_at", ""),
                    "size": model.get("size", 0)
                })
            return jsonify({"models": models})
        else:
            return jsonify({"error": "Failed to fetch models from Ollama"}), 500
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Error connecting to Ollama: {e}")
        return jsonify({"error": "Cannot connect to Ollama service"}), 500
    except Exception as e:
        logger.error(f"Error fetching Ollama models: {e}")
        return jsonify({"error": "Internal server error"}), 500

# =============================================================================
# Agents Endpoints
# =============================================================================

@app.route('/api/agents', methods=['GET', 'POST'])
def agents_index():
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    if request.method == 'GET':
        return jsonify({"agents": agents_manager.list_agents()})
    else:
        payload = request.json or {}
        agent = agents_manager.create_agent(payload)
        if agent:
            return jsonify(agent)
        return jsonify({"error": "failed_to_create_or_duplicate"}), 400


@app.route('/api/agents/<name>', methods=['GET', 'PATCH', 'DELETE'])
def agents_item(name):
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    if request.method == 'GET':
        agent = agents_manager.get_agent(name)
        if agent:
            return jsonify(agent)
        return jsonify({"error": "not_found"}), 404
    elif request.method == 'PATCH':
        patch = request.json or {}
        agent = agents_manager.update_agent(name, patch)
        if agent:
            return jsonify(agent)
        return jsonify({"error": "not_found"}), 404
    else:
        ok = agents_manager.delete_agent(name)
        return jsonify({"deleted": ok}), (200 if ok else 404)


@app.route('/api/agents/export', methods=['GET'])
def agents_export():
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    return jsonify(agents_manager.export_all())


@app.route('/api/agents/import', methods=['POST'])
def agents_import():
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    data = request.json or {}
    count = agents_manager.import_all(data)
    return jsonify({"imported": count})


@app.route('/api/agents/run', methods=['POST'])
def agents_run():
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    data = request.json or {}
    agent_name = data.get('agent_name')
    query = data.get('query', '')
    model = data.get('model')
    if not agent_name or not query:
        return jsonify({"error": "agent_name and query required"}), 400
    res = agents_manager.run_agent(agent_name, query, model)
    status = 200 if res.get('status') in ('success', 'no_results', 'needs_tags') else 400
    return jsonify(res), status

# ------------------------------
# Agent Knowledge Endpoints
# ------------------------------

@app.route('/api/agents/<name>/knowledge', methods=['GET'])
def agents_knowledge_list(name):
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        docs = agents_manager.list_agent_documents(name)
        return jsonify({"status": "success", "documents": docs})
    except Exception as e:
        logger.error(f"Failed to list knowledge for {name}: {e}")
        return jsonify({"status": "error", "message": "Failed to list knowledge"}), 500


@app.route('/api/agents/<name>/knowledge', methods=['DELETE'])
def agents_knowledge_delete(name):
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    data = request.json or {}
    filename = (data.get('filename') or '').strip()
    if not filename:
        return jsonify({"status": "error", "message": "filename required"}), 400
    res = agents_manager.remove_agent_document(name, filename)
    code = 200 if res.get('status') == 'success' else 400
    return jsonify(res), code


@app.route('/api/agents/<name>/knowledge/upload', methods=['POST'])
def agents_knowledge_upload(name):
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    files = []
    if 'files' in request.files:
        files = request.files.getlist('files')
    elif 'file' in request.files:
        files = [request.files['file']]
    if not files:
        return jsonify({"status": "error", "message": "No file uploaded"}), 400
    try:
        results = []
        ok = 0
        for f in files:
            if not f or f.filename == '':
                results.append({"status": "error", "message": "Empty filename"})
                continue
            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                f.save(tmp.name)
                result = agents_manager.add_agent_document(name, tmp.name, f.filename)
            try:
                os.unlink(tmp.name)
            except Exception:
                pass
            if result.get('status') == 'success':
                ok += 1
            results.append(result)
        code = 200 if ok == len(results) else (207 if ok > 0 else 400)
        return jsonify({"status": ("success" if ok == len(results) else ("partial" if ok > 0 else "error")), "uploaded": ok, "total": len(results), "results": results}), code
    except Exception as e:
        logger.error(f"Upload failed for agent {name}: {e}")
        return jsonify({"status": "error", "message": "Upload failed"}), 500


# Links management
@app.route('/api/agents/<name>/links', methods=['GET', 'POST', 'DELETE'])
def agents_links(name):
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        if request.method == 'GET':
            return jsonify({"status": "success", "links": agents_manager.list_agent_links(name)})
        data = request.json or {}
        url = (data.get('url') or '').strip()
        if not url:
            return jsonify({"status": "error", "message": "url required"}), 400
        if request.method == 'POST':
            ingest = bool(data.get('ingest', True))
            res = agents_manager.add_agent_link(name, url, ingest)
            code = 200 if res.get('status') == 'success' else 400
            return jsonify(res), code
        else:  # DELETE
            res = agents_manager.remove_agent_link(name, url)
            code = 200 if res.get('status') == 'success' else 400
            return jsonify(res), code
    except Exception as e:
        logger.error(f"Links endpoint error: {e}")
        return jsonify({"status": "error", "message": "Links operation failed"}), 500


# Databases management
@app.route('/api/agents/<name>/databases', methods=['GET', 'POST'])
def agents_databases(name):
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        if request.method == 'GET':
            return jsonify({"status": "success", "databases": agents_manager.list_agent_databases(name)})
        data = request.json or {}
        res = agents_manager.add_agent_database(name, data)
        code = 200 if res.get('status') == 'success' else 400
        return jsonify(res), code
    except Exception as e:
        logger.error(f"Databases endpoint error: {e}")
        return jsonify({"status": "error", "message": "Database operation failed"}), 500


@app.route('/api/agents/<name>/databases/<db_name>', methods=['DELETE'])
def agents_database_delete(name, db_name):
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    res = agents_manager.remove_agent_database(name, db_name)
    code = 200 if res.get('status') == 'success' else 400
    return jsonify(res), code


@app.route('/api/agents/<name>/databases/<db_name>/ingest', methods=['POST'])
def agents_database_ingest(name, db_name):
    if not agents_manager:
        return jsonify({"error": "Agents service unavailable"}), 503
    res = agents_manager.ingest_agent_database(name, db_name)
    code = 200 if res.get('status') == 'success' else 400
    return jsonify(res), code

# =============================================================================
# RAG (Retrieval-Augmented Generation) Endpoints
# =============================================================================

@app.route('/api/rag/health', methods=['GET'])
def rag_health_check():
    """Check if RAG functionality is available."""
    if not rag_manager:
        return jsonify({
            "status": "unavailable", 
            "message": "RAG manager not initialized"
        }), 503
    
    try:
        # Test basic RAG functionality
        # This could include checking Ollama connection, vector store, etc.
        return jsonify({
            "status": "available",
            "message": "RAG service is operational"
        }), 200
    except Exception as e:
        logger.error(f"RAG health check failed: {e}")
        return jsonify({
            "status": "error",
            "message": f"RAG service error: {str(e)}"
        }), 503

@app.route('/api/rag/upload', methods=['POST'])
def upload_document():
    """Upload one or multiple documents for RAG functionality."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    chat_id = request.form.get('chat_id')
    
    if not chat_id:
        return jsonify({"error": "chat_id is required"}), 400
    
    # Handle both single and multiple file uploads
    files = request.files.getlist('file') if 'file' in request.files else []
    if not files:
        return jsonify({"error": "No files provided"}), 400
    
    results = []
    successful_uploads = 0
    failed_uploads = 0
    temp_files = []
    
    try:
        for file in files:
            if file.filename == '':
                failed_uploads += 1
                results.append({
                    "filename": "unknown",
                    "status": "error",
                    "message": "No file selected"
                })
                continue
            
            # Check file size (limit to 10MB per file)
            if file.content_length and file.content_length > 10 * 1024 * 1024:
                failed_uploads += 1
                results.append({
                    "filename": file.filename,
                    "status": "error",
                    "message": "File too large (max 10MB)"
                })
                continue
            
            # Save to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
                temp_path = temp_file.name
                temp_files.append(temp_path)
                file.save(temp_path)
            
            try:
                # Add document to RAG system
                result = rag_manager.add_document_from_file(chat_id, temp_path, file.filename)
                results.append(result)
                
                if result["status"] == "success":
                    successful_uploads += 1
                else:
                    failed_uploads += 1
                    
            except Exception as e:
                failed_uploads += 1
                logger.error(f"Error processing document {file.filename}: {e}")
                results.append({
                    "filename": file.filename,
                    "status": "error",
                    "message": f"Failed to process document: {str(e)}"
                })
        
        # Clean up all temporary files
        for temp_path in temp_files:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        
        # Return comprehensive results
        response = {
            "status": "success" if successful_uploads > 0 else "error",
            "message": f"Processed {len(files)} files: {successful_uploads} successful, {failed_uploads} failed",
            "successful_uploads": successful_uploads,
            "failed_uploads": failed_uploads,
            "results": results
        }
        
        status_code = 200 if successful_uploads > 0 else 400
        return jsonify(response), status_code
            
    except Exception as e:
        # Clean up on error
        for temp_path in temp_files:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        logger.error(f"Error uploading documents: {e}")
        return jsonify({"error": "Failed to process documents"}), 500

@app.route('/api/rag/query', methods=['POST'])
def query_documents():
    """Query documents using RAG."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    data = request.json
    chat_id = data.get('chat_id')
    query = data.get('query', '')
    k = data.get('k', 5)  # Number of results to return
    
    if not chat_id:
        return jsonify({"error": "chat_id is required"}), 400
    
    if not query:
        return jsonify({"error": "query is required"}), 400
    
    try:
        result = rag_manager.query_documents(chat_id, query, k)
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error querying documents: {e}")
        return jsonify({"error": "Failed to query documents"}), 500

@app.route('/api/rag/chat', methods=['POST'])
def rag_chat():
    """Chat with RAG-enhanced responses."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    data = request.json
    chat_id = data.get('chat_id')
    message = data.get('message', '')
    use_stream = data.get('stream', True)
    k = data.get('k', 5)  # Number of documents to retrieve
    
    if not chat_id:
        return jsonify({"error": "chat_id is required"}), 400
    
    if not message:
        return jsonify({"error": "message is required"}), 400
    
    if use_stream:
        def generate():
            try:
                for chunk in rag_manager.get_rag_response_stream(chat_id, message, k):
                    if chunk:
                        yield f"data: {json.dumps({'token': chunk})}\n\n"
                
                yield f"data: {json.dumps({'done': True})}\n\n"
                            
            except Exception as e:
                logger.error(f"Error in streaming RAG chat: {e}")
                yield f"data: {json.dumps({'error': 'Error processing your request.'})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
    else:
        try:
            response = rag_manager.get_rag_response(chat_id, message, k)
            return jsonify({"response": response})
        except Exception as e:
            logger.error(f"Error in RAG chat: {e}")
            return jsonify({"response": "Error processing your request."})

@app.route('/api/rag/documents/<chat_id>', methods=['GET'])
def list_chat_documents(chat_id):
    """List documents for a specific chat."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    try:
        documents = rag_manager.list_documents_for_chat(chat_id)
        return jsonify({"documents": documents}), 200
        
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        return jsonify({"error": "Failed to list documents"}), 500

@app.route('/api/rag/documents/<chat_id>/<filename>', methods=['DELETE'])
def remove_document(chat_id, filename):
    """Remove a specific document from a chat."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    try:
        success = rag_manager.remove_document_from_chat(chat_id, filename)
        if success:
            return jsonify({"status": "success", "message": "Document removed"}), 200
        else:
            return jsonify({"status": "error", "message": "Failed to remove document"}), 400
            
    except Exception as e:
        logger.error(f"Error removing document: {e}")
        return jsonify({"error": "Failed to remove document"}), 500

@app.route('/api/rag/documents/<chat_id>', methods=['DELETE'])
def clear_chat_documents(chat_id):
    """Clear all documents for a specific chat."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    try:
        success = rag_manager.clear_chat_documents(chat_id)
        if success:
            return jsonify({"status": "success", "message": "All documents cleared"}), 200
        else:
            return jsonify({"status": "error", "message": "Failed to clear documents"}), 400
            
    except Exception as e:
        logger.error(f"Error clearing documents: {e}")
        return jsonify({"error": "Failed to clear documents"}), 500

if __name__ == '__main__':
    app.run(debug=True)

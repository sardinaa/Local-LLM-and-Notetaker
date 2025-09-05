from flask import Flask, request, jsonify, send_from_directory, render_template, Response
import json
import os
import re
import time
import requests  # For proxying to Ollama
import tempfile  # For temporary audio files
import whisper   # You'll need to install this: pip install openai-whisper
import io
import logging
import threading
from flask import send_file
from data_service import DataService
from chat_history_manager import ChatHistoryManager
from rag_manager import RAGManager
from agent_manager import AgentsManager
import numpy as np
from typing import Optional
from threading import BoundedSemaphore

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("python-dotenv not installed. Environment variables from .env file will not be loaded.")

# Configure LibreOffice path for unstructured library
if os.path.exists('/opt/libreoffice24.8/program/soffice'):
    os.environ['PATH'] = '/opt/libreoffice24.8/program:' + os.environ.get('PATH', '')
    print("Added LibreOffice 24.8 to PATH for document processing")

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
ollama_url = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434')
chat_history_manager = ChatHistoryManager(
    ollama_base_url=ollama_url
)

# Initialize RAG manager
try:
    rag_embedding_model = os.getenv('RAG_EMBEDDING_MODEL', 'nomic-embed-text')
    
    rag_manager = RAGManager(
        embedding_model=rag_embedding_model,
        ollama_base_url=ollama_url
    )
    logger.info(f"RAG manager initialized successfully with model: {rag_manager.model_name}, embeddings: {rag_embedding_model}")
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

# Initialize Job Scraper service
try:
    from job_scraper_service import get_scraper_service
    app.job_scraper_service = get_scraper_service(data_service.db, data_service)
    
    # Start the scheduler if there are enabled configs
    enabled_configs = [c for c in data_service.db.get_scraper_configs() if c.get('enabled', True)]
    if enabled_configs:
        app.job_scraper_service.start_scheduler()
        # Schedule all enabled configs
        for config in enabled_configs:
            app.job_scraper_service.schedule_config(config)
        logger.info(f"Job scraper service initialized with {len(enabled_configs)} active configurations")
    else:
        logger.info("Job scraper service initialized with no active configurations")
        
except Exception as e:
    logger.error(f"Failed to initialize Job Scraper service: {e}")
    app.job_scraper_service = None

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

# API endpoints for note templates
@app.route('/api/templates', methods=['GET'])
def get_templates():
    """Get all available note templates."""
    try:
        templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates', 'note_templates')
        index_path = os.path.join(templates_dir, 'index.json')
        
        if not os.path.exists(index_path):
            return jsonify({"status": "error", "message": "Templates index not found"}), 404
        
        with open(index_path, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
        
        # Load each template's metadata
        templates = []
        for template_info in index_data.get('templates', []):
            template_file = os.path.join(templates_dir, template_info['file'])
            if os.path.exists(template_file):
                with open(template_file, 'r', encoding='utf-8') as f:
                    template_data = json.load(f)
                    templates.append({
                        'id': template_info['id'],
                        'name': template_data['name'],
                        'description': template_data['description'],
                        'icon': template_data['icon'],
                        'category': template_info['category'],
                        'isCustom': template_info.get('isCustom', False)
                    })
        
        return jsonify({
            'templates': templates,
            'categories': index_data.get('categories', {})
        })
    
    except Exception as e:
        logger.error(f"Error loading templates: {e}")
        return jsonify({"status": "error", "message": "Failed to load templates"}), 500

@app.route('/api/templates/<template_id>', methods=['GET'])
def get_template(template_id):
    """Get a specific template by ID."""
    try:
        templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates', 'note_templates')
        index_path = os.path.join(templates_dir, 'index.json')
        
        if not os.path.exists(index_path):
            return jsonify({"status": "error", "message": "Templates index not found"}), 404
        
        with open(index_path, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
        
        # Find the template in the index
        template_info = None
        for template in index_data.get('templates', []):
            if template['id'] == template_id:
                template_info = template
                break
        
        if not template_info:
            return jsonify({"status": "error", "message": "Template not found"}), 404
        
        # Load the template content
        template_file = os.path.join(templates_dir, template_info['file'])
        if not os.path.exists(template_file):
            return jsonify({"status": "error", "message": "Template file not found"}), 404
        
        with open(template_file, 'r', encoding='utf-8') as f:
            template_data = json.load(f)
        
        return jsonify(template_data)
    
    except Exception as e:
        logger.error(f"Error loading template {template_id}: {e}")
        return jsonify({"status": "error", "message": "Failed to load template"}), 500

@app.route('/api/templates', methods=['POST'])
def create_custom_template():
    """Create a new custom template from note content."""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or not all(k in data for k in ['name', 'description', 'content']):
            return jsonify({"status": "error", "message": "Missing required fields: name, description, content"}), 400
        
        template_name = data['name'].strip()
        template_description = data['description'].strip()
        template_content = data['content']
        template_icon = data.get('icon', 'fas fa-file-alt')
        template_category = data.get('category', 'Custom')
        
        if not template_name:
            return jsonify({"status": "error", "message": "Template name cannot be empty"}), 400
        
        # Create template ID from name
        template_id = template_name.lower().replace(' ', '_').replace('-', '_')
        # Remove special characters
        import re
        template_id = re.sub(r'[^a-z0-9_]', '', template_id)
        
        templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates', 'note_templates')
        custom_templates_dir = os.path.join(templates_dir, 'custom')
        
        # Create custom templates directory if it doesn't exist
        if not os.path.exists(custom_templates_dir):
            os.makedirs(custom_templates_dir)
        
        # Check if template already exists
        template_file = os.path.join(custom_templates_dir, f"{template_id}.json")
        if os.path.exists(template_file):
            return jsonify({"status": "error", "message": "A template with this name already exists"}), 409
        
        # Create template data
        template_data = {
            "name": template_name,
            "description": template_description,
            "icon": template_icon,
            "content": template_content,
            "isCustom": True,
            "createdAt": json.dumps(None, default=str)  # Will be replaced with actual timestamp
        }
        
        # Add timestamp
        from datetime import datetime
        template_data["createdAt"] = datetime.now().isoformat()
        
        # Save template file
        with open(template_file, 'w', encoding='utf-8') as f:
            json.dump(template_data, f, indent=2, ensure_ascii=False)
        
        # Update index.json
        index_path = os.path.join(templates_dir, 'index.json')
        with open(index_path, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
        
        # Add new template to index
        new_template_info = {
            "id": template_id,
            "file": f"custom/{template_id}.json",
            "category": template_category,
            "isCustom": True
        }
        
        index_data['templates'].append(new_template_info)
        
        # Add Custom category if it doesn't exist
        if template_category not in index_data.get('categories', {}):
            if 'categories' not in index_data:
                index_data['categories'] = {}
            
            # Assign appropriate icon based on category name
            category_icon = "fas fa-user-edit"  # default
            if template_category.lower() in ['work', 'business', 'professional']:
                category_icon = "fas fa-briefcase"
            elif template_category.lower() in ['personal', 'life', 'diary']:
                category_icon = "fas fa-user"
            elif template_category.lower() in ['education', 'study', 'learning', 'school']:
                category_icon = "fas fa-graduation-cap"
            elif template_category.lower() in ['health', 'fitness', 'medical']:
                category_icon = "fas fa-heartbeat"
            elif template_category.lower() in ['food', 'recipe', 'cooking', 'meal']:
                category_icon = "fas fa-utensils"
            elif template_category.lower() in ['travel', 'trip', 'vacation']:
                category_icon = "fas fa-plane"
            elif template_category.lower() in ['finance', 'money', 'budget']:
                category_icon = "fas fa-dollar-sign"
            elif template_category.lower() in ['project', 'task', 'todo']:
                category_icon = "fas fa-tasks"
            elif template_category.lower() in ['meeting', 'conference', 'call']:
                category_icon = "fas fa-users"
            elif template_category.lower() in ['creative', 'art', 'design']:
                category_icon = "fas fa-palette"
            
            index_data['categories'][template_category] = {
                "icon": category_icon,
                "description": f"User-created {template_category.lower()} templates"
            }
        
        # Save updated index
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, indent=2, ensure_ascii=False)
        
        return jsonify({
            "status": "success", 
            "message": "Template created successfully",
            "templateId": template_id,
            "template": {
                'id': template_id,
                'name': template_name,
                'description': template_description,
                'icon': template_icon,
                'category': template_category,
                'isCustom': True
            }
        })
        
    except Exception as e:
        logger.error(f"Error creating custom template: {e}")
        return jsonify({"status": "error", "message": "Failed to create template"}), 500

@app.route('/api/templates/<template_id>', methods=['PUT'])
def update_custom_template(template_id):
    """Update an existing custom template."""
    try:
        data = request.get_json()
        
        # Log the received data for debugging
        logger.info(f"Received template update data: {data}")
        
        # Validate required fields
        if not data:
            return jsonify({"status": "error", "message": "No data received"}), 400
            
        missing_fields = []
        if not data.get('name', '').strip():
            missing_fields.append('name')
        if not data.get('description', '').strip():
            missing_fields.append('description')
        if 'content' not in data or data.get('content') is None:
            missing_fields.append('content')
            
        if missing_fields:
            return jsonify({"status": "error", "message": f"Missing required fields: {', '.join(missing_fields)}"}), 400
        
        template_name = data['name'].strip()
        template_description = data['description'].strip()
        template_content = data['content']
        template_icon = data.get('icon', 'fas fa-file-alt')
        template_category = data.get('category', 'Custom')
        
        if not template_name:
            return jsonify({"status": "error", "message": "Template name cannot be empty"}), 400
        
        templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates', 'note_templates')
        index_path = os.path.join(templates_dir, 'index.json')
        
        # Load index to find the template
        with open(index_path, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
        
        # Find the template in the index
        template_info = None
        template_index = -1
        for i, template in enumerate(index_data.get('templates', [])):
            if template['id'] == template_id:
                template_info = template
                template_index = i
                break
        
        if not template_info:
            return jsonify({"status": "error", "message": "Template not found"}), 404
        
        # Only allow updating of custom templates
        if not template_info.get('isCustom', False):
            return jsonify({"status": "error", "message": "Cannot edit built-in templates"}), 403
        
        # Update template file
        template_file = os.path.join(templates_dir, template_info['file'])
        if not os.path.exists(template_file):
            return jsonify({"status": "error", "message": "Template file not found"}), 404
        
        # Create new template ID if name changed
        new_template_id = template_name.lower().replace(' ', '_').replace('-', '_')
        import re
        new_template_id = re.sub(r'[^a-z0-9_]', '', new_template_id)
        
        # Check if we need to rename the template
        if new_template_id != template_id:
            # Check if new ID already exists
            for template in index_data.get('templates', []):
                if template['id'] == new_template_id and template['id'] != template_id:
                    return jsonify({"status": "error", "message": "A template with this name already exists"}), 409
            
            # Create new file path
            new_template_file = os.path.join(os.path.dirname(template_file), f"{new_template_id}.json")
            
            # Remove old file
            os.remove(template_file)
            
            # Update template info
            template_info['id'] = new_template_id
            template_info['file'] = f"custom/{new_template_id}.json"
            template_file = new_template_file
        
        # Update template data
        from datetime import datetime
        template_data = {
            "name": template_name,
            "description": template_description,
            "icon": template_icon,
            "content": template_content,
            "isCustom": True,
            "updatedAt": datetime.now().isoformat()
        }
        
        # Save template file
        with open(template_file, 'w', encoding='utf-8') as f:
            json.dump(template_data, f, indent=2, ensure_ascii=False)
        
        # Update index with new category if needed
        template_info['category'] = template_category
        
        # Add category if it doesn't exist
        if template_category not in index_data.get('categories', {}):
            if 'categories' not in index_data:
                index_data['categories'] = {}
            
            # Assign appropriate icon based on category name
            category_icon = "fas fa-user-edit"  # default
            if template_category.lower() in ['work', 'business', 'professional']:
                category_icon = "fas fa-briefcase"
            elif template_category.lower() in ['personal', 'life', 'diary']:
                category_icon = "fas fa-user"
            elif template_category.lower() in ['education', 'study', 'learning', 'school']:
                category_icon = "fas fa-graduation-cap"
            elif template_category.lower() in ['health', 'fitness', 'medical']:
                category_icon = "fas fa-heartbeat"
            elif template_category.lower() in ['food', 'recipe', 'cooking', 'meal']:
                category_icon = "fas fa-utensils"
            elif template_category.lower() in ['travel', 'trip', 'vacation']:
                category_icon = "fas fa-plane"
            elif template_category.lower() in ['finance', 'money', 'budget']:
                category_icon = "fas fa-dollar-sign"
            elif template_category.lower() in ['project', 'task', 'todo']:
                category_icon = "fas fa-tasks"
            elif template_category.lower() in ['meeting', 'conference', 'call']:
                category_icon = "fas fa-users"
            elif template_category.lower() in ['creative', 'art', 'design']:
                category_icon = "fas fa-palette"
            
            index_data['categories'][template_category] = {
                "icon": category_icon,
                "description": f"User-created {template_category.lower()} templates"
            }
        
        # Save updated index
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, indent=2, ensure_ascii=False)
        
        return jsonify({
            "status": "success", 
            "message": "Template updated successfully",
            "templateId": new_template_id,
            "template": {
                'id': new_template_id,
                'name': template_name,
                'description': template_description,
                'icon': template_icon,
                'category': template_category,
                'isCustom': True
            }
        })
        
    except Exception as e:
        logger.error(f"Error updating custom template: {e}")
        return jsonify({"status": "error", "message": "Failed to update template"}), 500

@app.route('/api/templates/<template_id>', methods=['DELETE'])
def delete_custom_template(template_id):
    """Delete a custom template."""
    try:
        templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates', 'note_templates')
        index_path = os.path.join(templates_dir, 'index.json')
        
        # Load index
        with open(index_path, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
        
        # Find the template in the index
        template_info = None
        template_index = -1
        for i, template in enumerate(index_data.get('templates', [])):
            if template['id'] == template_id:
                template_info = template
                template_index = i
                break
        
        if not template_info:
            return jsonify({"status": "error", "message": "Template not found"}), 404
        
        # Only allow deletion of custom templates
        if not template_info.get('isCustom', False):
            return jsonify({"status": "error", "message": "Cannot delete built-in templates"}), 403
        
        # Delete the template file
        template_file = os.path.join(templates_dir, template_info['file'])
        if os.path.exists(template_file):
            os.remove(template_file)
        
        # Remove from index
        index_data['templates'].pop(template_index)
        
        # Save updated index
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, indent=2, ensure_ascii=False)
        
        return jsonify({"status": "success", "message": "Template deleted successfully"})
        
    except Exception as e:
        logger.error(f"Error deleting template {template_id}: {e}")
        return jsonify({"status": "error", "message": "Failed to delete template"}), 500

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
    
    # Load existing chat history if available (convert DB schema -> role/content)
    if chat_id != 'default':
        try:
            existing_chat = data_service.get_chat(chat_id)
            if existing_chat and isinstance(existing_chat, dict):
                content = existing_chat.get('content') or {}
                raw_messages = content.get('messages') or []
                if isinstance(raw_messages, list) and raw_messages:
                    history_msgs = []
                    for m in raw_messages:
                        try:
                            sender = (m.get('sender') or '').lower()
                            text = m.get('text') or ''
                            role = 'assistant' if sender == 'bot' else 'user'
                            history_msgs.append({'role': role, 'content': text})
                        except Exception:
                            continue
                    if history_msgs:
                        chat_history_manager.load_chat_history(chat_id, history_msgs)
        except Exception as e:
            logger.warning(f"Could not load chat history for {chat_id}: {e}")
    
    if use_stream:
        # Return streaming response with context
        def generate():
            try:
                bot_response = ""
                for chunk in chat_history_manager.get_response_stream(chat_id, prompt, model_name, force_search):
                    if chunk:
                        bot_response += chunk
                        yield f"data: {json.dumps({'token': chunk})}\n\n"
                # Persist full interaction after stream completes
                try:
                    existing = data_service.get_chat(chat_id)
                    messages = []
                    if existing and isinstance(existing, dict):
                        content = existing.get('content') or {}
                        messages = content.get('messages') or []
                    from datetime import datetime
                    now = datetime.utcnow().isoformat()
                    messages = list(messages) if isinstance(messages, list) else []
                    messages.append({'text': prompt, 'sender': 'user', 'timestamp': now})
                    messages.append({'text': bot_response, 'sender': 'bot', 'timestamp': now})
                    data_service.save_chat(chat_id, messages)
                except Exception as persist_err:
                    logger.warning(f"Failed to persist streamed chat for {chat_id}: {persist_err}")
                
                yield f"data: {json.dumps({'done': True})}\n\n"
                            
            except Exception as e:
                logger.error(f"Error in streaming chat: {e}")
                yield f"data: {json.dumps({'error': 'Error contacting LLM service.'})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
    else:
        # Non-streaming response with context
        try:
            bot_reply = chat_history_manager.get_response(chat_id, prompt, model_name, force_search)
            # Persist full interaction
            try:
                existing = data_service.get_chat(chat_id)
                messages = []
                if existing and isinstance(existing, dict):
                    content = existing.get('content') or {}
                    messages = content.get('messages') or []
                from datetime import datetime
                now = datetime.utcnow().isoformat()
                messages = list(messages) if isinstance(messages, list) else []
                messages.append({'text': prompt, 'sender': 'user', 'timestamp': now})
                messages.append({'text': bot_reply, 'sender': 'bot', 'timestamp': now})
                data_service.save_chat(chat_id, messages)
            except Exception as persist_err:
                logger.warning(f"Failed to persist chat for {chat_id}: {persist_err}")
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
                bot_response = ""
                for chunk in chat_history_manager.get_response_stream(chat_id, message, model_name, force_search):
                    if chunk:
                        bot_response += chunk
                        yield f"data: {json.dumps({'token': chunk})}\n\n"
                # Persist full interaction after stream completes
                try:
                    existing = data_service.get_chat(chat_id)
                    messages = []
                    if existing and isinstance(existing, dict):
                        content = existing.get('content') or {}
                        messages = content.get('messages') or []
                    from datetime import datetime
                    now = datetime.utcnow().isoformat()
                    messages = list(messages) if isinstance(messages, list) else []
                    messages.append({'text': message, 'sender': 'user', 'timestamp': now})
                    messages.append({'text': bot_response, 'sender': 'bot', 'timestamp': now})
                    data_service.save_chat(chat_id, messages)
                except Exception as persist_err:
                    logger.warning(f"Failed to persist streamed chat-with-context for {chat_id}: {persist_err}")
                
                yield f"data: {json.dumps({'done': True})}\n\n"
                            
            except Exception as e:
                logger.error(f"Error in streaming chat with context: {e}")
                yield f"data: {json.dumps({'error': 'Error contacting LLM service.'})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
    else:
        try:
            response = chat_history_manager.get_response(chat_id, message, model_name, force_search)
            # Persist full interaction
            try:
                existing = data_service.get_chat(chat_id)
                messages = []
                if existing and isinstance(existing, dict):
                    content = existing.get('content') or {}
                    messages = content.get('messages') or []
                from datetime import datetime
                now = datetime.utcnow().isoformat()
                messages = list(messages) if isinstance(messages, list) else []
                messages.append({'text': message, 'sender': 'user', 'timestamp': now})
                messages.append({'text': response, 'sender': 'bot', 'timestamp': now})
                data_service.save_chat(chat_id, messages)
            except Exception as persist_err:
                logger.warning(f"Failed to persist chat-with-context for {chat_id}: {persist_err}")
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
                "model": os.getenv('AGENT_MODEL', 'llama3.2:1b'),
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
# Endpoint for audio transcription
@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        # Check if this is a URL-based request
        if request.content_type == 'application/json':
            data = request.get_json()
            if data and data.get('type') == 'url':
                return transcribe_from_url(data.get('url'))
        
        # Handle file upload (existing functionality)
        file_param_name = 'file' if 'file' in request.files else 'audio'
        
        if file_param_name not in request.files:
            return jsonify({"success": False, "error": "No audio file provided"}), 400
        
        audio_file = request.files[file_param_name]
        
        if not whisper_model:
            return jsonify({"success": False, "error": "Whisper model not available"}), 500
        
        # Check if audio file has content
        if audio_file.filename == '':
            return jsonify({"success": False, "error": "No audio file selected"}), 400
        
        return transcribe_file_content(audio_file)
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return jsonify({"success": False, "error": f"Transcription failed: {str(e)}"}), 500

def transcribe_from_url(url):
    """Transcribe audio from YouTube or Instagram URL"""
    if not url:
        return jsonify({"success": False, "error": "No URL provided"}), 400
    
    try:
        # Import yt-dlp for downloading
        import yt_dlp
    except ImportError:
        return jsonify({"success": False, "error": "yt-dlp not installed. Please install with: pip install yt-dlp"}), 500
    
    # Validate URL
    if not _is_supported_url(url):
        return jsonify({"success": False, "error": "URL must be from YouTube or Instagram"}), 400
    
    temp_file_path = None
    
    try:
        # Configure yt-dlp options for audio extraction
        ydl_opts = {
            'format': 'bestaudio/best',
            'extractaudio': True,
            'audioformat': 'mp3',
            'outtmpl': tempfile.gettempdir() + '/%(title)s.%(ext)s',
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract info first to get the title and check if audio is available
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'Unknown')
            
            # Download the audio
            ydl.download([url])
            
            # Find the downloaded file
            download_path = ydl.prepare_filename(info)
            # yt-dlp might change the extension, so check for common audio formats
            for ext in ['.mp3', '.m4a', '.webm', '.ogg']:
                potential_path = download_path.rsplit('.', 1)[0] + ext
                if os.path.exists(potential_path):
                    temp_file_path = potential_path
                    break
            
            if not temp_file_path or not os.path.exists(temp_file_path):
                return jsonify({"success": False, "error": "Failed to download audio from URL"}), 400
        
        # Transcribe the downloaded file
        result = transcribe_audio_file(temp_file_path)
        
        if result.get('success'):
            result['source_title'] = title
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"URL transcription error: {e}")
        return jsonify({"success": False, "error": f"Failed to process URL: {str(e)}"}), 500
    finally:
        # Clean up downloaded file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except:
                pass

def transcribe_file_content(audio_file):
    """Transcribe audio from uploaded file"""
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
        temp_file_path = temp_file.name
        audio_file.save(temp_file_path)
    
    try:
        result = transcribe_audio_file(temp_file_path)
        return jsonify(result)
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)

def transcribe_audio_file(file_path):
    """Core transcription logic for audio files"""
    try:
        # Check file size
        file_size = os.path.getsize(file_path)
        logger.info(f"Processing audio file: {file_path}, size: {file_size} bytes")
        
        if file_size == 0:
            return {"success": False, "error": "Audio file is empty"}
        
        # Preprocess audio for better transcription quality
        processed_audio_path = preprocess_audio_for_whisper(file_path)
        
        if processed_audio_path is None:
            return {"success": False, "error": "Audio preprocessing failed - audio may be too short or silent"}
        
        # Use processed audio if different from original, otherwise use original
        transcription_path = processed_audio_path if processed_audio_path != file_path else file_path
        
        # Auto-detect language using Whisper's detect_language
        whisper_language = None
        detected_language = 'unknown'
        detected_prob = 0.0
        
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

        # Transcribe audio using Whisper
        logger.info(f"Starting transcription with Whisper using language: {whisper_language or 'auto'}")

        try:
            result = whisper_model.transcribe(
                transcription_path,
                language=whisper_language,
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
        except Exception as whisper_error:
            logger.warning(f"Transcription failed: {whisper_error}; retrying with auto language")
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
        
        # Calculate average confidence if segments are available
        avg_confidence = 0.0
        if confidence_segments:
            confidences = [segment.get("avg_logprob", 0.0) for segment in confidence_segments]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        logger.info(f"Transcription result - Language: {detected_language}, Text length: {len(transcribed_text)}, Avg confidence: {avg_confidence:.3f}")
        
        # Clean up processed file if different from original
        if processed_audio_path and processed_audio_path != file_path:
            try:
                os.unlink(processed_audio_path)
            except:
                pass
        
        # Check if we got any meaningful transcription
        if not transcribed_text:
            logger.warning("No transcription returned from Whisper model")
            return {"success": False, "error": "No speech detected in audio. Please try speaking more clearly and ensure good microphone placement."}
        
        # Return successful result
        return {
            "success": True,
            "transcription": transcribed_text,
            "language": detected_language,
            "confidence": avg_confidence
        }
        
    except Exception as e:
        logger.error(f"Audio transcription error: {e}")
        return {"success": False, "error": f"Transcription failed: {str(e)}"}

def _is_supported_url(url):
    """Check if URL is from a supported platform"""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        
        # Check for YouTube
        if any(domain.endswith(d) for d in ['youtube.com', 'youtu.be', 'm.youtube.com']):
            return True
        
        # Check for Instagram
        if any(domain.endswith(d) for d in ['instagram.com', 'm.instagram.com']):
            return True
        
        return False
    except:
        return False

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

# Document highlighting API endpoint - uses Ollama for intelligent highlighting
@app.route('/api/highlight-document', methods=['POST'])
def highlight_document():
    """Intelligent document highlighting using Ollama models."""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        document_path = data.get('document_path')
        keywords = data.get('keywords')
        filename = data.get('filename', 'Unknown Document')
        
        if not document_path or not keywords:
            return jsonify({"error": "Document path and keywords are required"}), 400
        
        # Check if document exists
        if not os.path.exists(document_path):
            return jsonify({"error": "Document not found"}), 404
        
        # Read document content based on file type
        try:
            if document_path.lower().endswith('.pdf'):
                # For PDF files, try to extract text
                document_text = extract_pdf_text(document_path)
            else:
                # For text-based documents
                with open(document_path, 'r', encoding='utf-8') as f:
                    document_text = f.read()
        except Exception as e:
            logger.error(f"Failed to read document {document_path}: {e}")
            return jsonify({"error": f"Failed to read document: {str(e)}"}), 500
        
        if not document_text.strip():
            return jsonify({"error": "Document appears to be empty or unreadable"}), 400
        
        # Create prompt for Ollama to identify relevant sections
        highlight_prompt = f"""Document: {filename}
Keywords to highlight: {keywords}

Please analyze the following document and identify the most relevant sections, sentences, or phrases that relate to the keywords "{keywords}".

Return your response as a JSON array of objects, where each object has:
- "text": the exact text to highlight
- "relevance": a score from 1-10 indicating relevance
- "context": brief explanation of why this text is relevant

Document content:
{document_text[:4000]}

Respond only with valid JSON array format."""
        
        # Call Ollama API
        try:
            ollama_response = requests.post(
                'http://localhost:11434/api/generate',
                json={
                    'model': os.getenv('RAG_MODEL', 'llama3.2:3b'),
                    'prompt': highlight_prompt,
                    'stream': False,
                    'options': {
                        'temperature': 0.3,  # Lower temperature for more consistent JSON
                        'top_p': 0.9
                    }
                },
                timeout=300
            )
            
            if ollama_response.status_code != 200:
                logger.error(f"Ollama API error: {ollama_response.status_code}")
                return jsonify({"error": "AI analysis service unavailable"}), 503
            
            ollama_result = ollama_response.json()
            ai_response = ollama_result.get('response', '')
            
            # Try to parse the AI response as JSON
            try:
                # Clean the response - remove markdown code blocks if present
                clean_response = ai_response.strip()
                if clean_response.startswith('```json'):
                    clean_response = clean_response[7:]
                if clean_response.endswith('```'):
                    clean_response = clean_response[:-3]
                clean_response = clean_response.strip()
                
                highlights = json.loads(clean_response)
                
                # Validate the format
                if not isinstance(highlights, list):
                    raise ValueError("Response is not a list")
                
                # Filter and validate highlights
                valid_highlights = []
                for highlight in highlights:
                    if isinstance(highlight, dict) and 'text' in highlight and 'relevance' in highlight:
                        # Only include high-relevance highlights
                        if highlight.get('relevance', 0) >= 6:
                            valid_highlights.append(highlight)
                
                logger.info(f"Generated {len(valid_highlights)} highlights for keywords: {keywords}")
                
                return jsonify({
                    "success": True,
                    "highlights": valid_highlights,
                    "keywords": keywords,
                    "filename": filename
                })
                
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(f"Failed to parse AI response as JSON: {e}")
                logger.error(f"AI Response: {ai_response}")
                
                # Fallback: simple keyword highlighting
                return generate_simple_highlights(document_text, keywords, filename)
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to connect to Ollama: {e}")
            # Fallback to simple highlighting
            return generate_simple_highlights(document_text, keywords, filename)
        
    except Exception as e:
        logger.error(f"Highlight document error: {e}")
        return jsonify({"error": f"Highlighting failed: {str(e)}"}), 500

def extract_pdf_text(pdf_path):
    """Extract text from PDF file with OCR fallback for better content retrieval."""
    try:
        text = ""
        use_ocr_fallback = False
        
        # Try pdfplumber first (better for text extraction with accents)
        try:
            import pdfplumber
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            
            if text.strip():
                # Normalize Unicode characters - fix decomposed accents
                import unicodedata
                # First try to compose any decomposed characters
                text = unicodedata.normalize('NFC', text)
                
                # Fix specific Spanish accent issues
                text = text.replace('a´', 'á')
                text = text.replace('e´', 'é')
                text = text.replace('i´', 'í')
                text = text.replace('o´', 'ó')
                text = text.replace('u´', 'ú')
                text = text.replace('n~', 'ñ')
                text = text.replace('A´', 'Á')
                text = text.replace('E´', 'É')
                text = text.replace('I´', 'Í')
                text = text.replace('O´', 'Ó')
                text = text.replace('U´', 'Ú')
                text = text.replace('N~', 'Ñ')
                
                # Fix other common encoding issues
                text = text.replace('ü', 'ü')  # Fix u with diaeresis
                text = text.replace('Ü', 'Ü')
                
                logger.info(f"Extracted {len(text)} characters using pdfplumber")
                logger.info(f"Sample corrected text: {repr(text[:200])}")
                
                # Check if text extraction seems incomplete (very little text might indicate scanned PDF)
                if len(text.strip()) < 100:
                    logger.info("Text extraction produced very little content, will try OCR fallback")
                    use_ocr_fallback = True
                else:
                    return text
            else:
                use_ocr_fallback = True
                
        except ImportError:
            logger.info("pdfplumber not available, trying pypdf")
            use_ocr_fallback = True
        except Exception as e:
            logger.warning(f"pdfplumber extraction failed: {e}, trying pypdf")
            use_ocr_fallback = True
        
        # Try pypdf if pdfplumber failed
        if not text.strip():
            try:
                import pypdf
                with open(pdf_path, 'rb') as file:
                    pdf_reader = pypdf.PdfReader(file)
                    for page in pdf_reader.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                
                if text.strip():
                    # Normalize Unicode characters and fix accent issues
                    import unicodedata
                    text = unicodedata.normalize('NFC', text)
                    
                    # Fix common encoding issues
                    text = text.replace('\x00', '')  # Remove null bytes
                    text = text.replace('\ufeff', '')  # Remove BOM
                    
                    # Fix specific Spanish accent issues
                    text = text.replace('a´', 'á')
                    text = text.replace('e´', 'é')
                    text = text.replace('i´', 'í')
                    text = text.replace('o´', 'ó')
                    text = text.replace('u´', 'ú')
                    text = text.replace('n~', 'ñ')
                    text = text.replace('A´', 'Á')
                    text = text.replace('E´', 'É')
                    text = text.replace('I´', 'Í')
                    text = text.replace('O´', 'Ó')
                    text = text.replace('U´', 'Ú')
                    text = text.replace('N~', 'Ñ')
                    
                    logger.info(f"Extracted {len(text)} characters using pypdf")
                    logger.info(f"Sample corrected text: {repr(text[:200])}")
                    
                    # Check if text extraction seems incomplete
                    if len(text.strip()) < 100:
                        logger.info("pypdf extraction also produced little content, will try OCR")
                        use_ocr_fallback = True
                    else:
                        return text
                else:
                    use_ocr_fallback = True
                    
            except Exception as e:
                logger.warning(f"pypdf also failed: {e}, trying OCR")
                use_ocr_fallback = True
        
        # OCR fallback for scanned documents or when text extraction fails
        if use_ocr_fallback:
            try:
                logger.info("Attempting OCR extraction as fallback")
                ocr_text = extract_pdf_text_with_ocr(pdf_path)
                if ocr_text and len(ocr_text.strip()) > len(text.strip()):
                    logger.info(f"OCR extracted {len(ocr_text)} characters (better than {len(text)})")
                    return ocr_text
                elif ocr_text:
                    logger.info(f"OCR extracted {len(ocr_text)} characters, combining with existing text")
                    # Combine OCR text with existing text
                    combined_text = text + "\n\n" + ocr_text if text.strip() else ocr_text
                    return combined_text
            except Exception as e:
                logger.error(f"OCR extraction failed: {e}")
        
        return text
        
    except Exception as e:
        logger.error(f"Failed to extract PDF text: {e}")
        return ""

def extract_pdf_text_with_ocr(pdf_path):
    """Extract text from PDF using OCR (Tesseract via Python)."""
    try:
        # Check if required packages are available
        try:
            import pytesseract
            from PIL import Image
            import pdf2image
        except ImportError as e:
            logger.warning(f"OCR dependencies not available: {e}")
            return ""
        
        # Convert PDF pages to images
        images = pdf2image.convert_from_path(pdf_path)
        
        ocr_text = ""
        for i, image in enumerate(images):
            try:
                # Configure Tesseract for better Spanish text recognition
                custom_config = r'--oem 3 --psm 6 -l eng+spa'
                page_text = pytesseract.image_to_string(image, config=custom_config)
                
                if page_text.strip():
                    ocr_text += f"\n\n--- Page {i + 1} ---\n"
                    ocr_text += page_text
                    logger.debug(f"OCR extracted {len(page_text)} characters from page {i + 1}")
                    
            except Exception as e:
                logger.warning(f"OCR failed for page {i + 1}: {e}")
                continue
        
        if ocr_text.strip():
            # Normalize Unicode characters and fix accent issues
            import unicodedata
            ocr_text = unicodedata.normalize('NFC', ocr_text)
            
            # Fix specific Spanish accent issues in OCR text
            ocr_text = ocr_text.replace('a´', 'á')
            ocr_text = ocr_text.replace('e´', 'é')
            ocr_text = ocr_text.replace('i´', 'í')
            ocr_text = ocr_text.replace('o´', 'ó')
            ocr_text = ocr_text.replace('u´', 'ú')
            ocr_text = ocr_text.replace('n~', 'ñ')
            ocr_text = ocr_text.replace('A´', 'Á')
            ocr_text = ocr_text.replace('E´', 'É')
            ocr_text = ocr_text.replace('I´', 'Í')
            ocr_text = ocr_text.replace('O´', 'Ó')
            ocr_text = ocr_text.replace('U´', 'Ú')
            ocr_text = ocr_text.replace('N~', 'Ñ')
            
            logger.info(f"OCR total extraction: {len(ocr_text)} characters")
            logger.info(f"OCR sample corrected text: {repr(ocr_text[:200])}")
            
        return ocr_text.strip()
        
    except Exception as e:
        logger.error(f"OCR extraction error: {e}")
        return ""

def generate_simple_highlights(document_text, keywords, filename):
    """Fallback highlighting method using simple keyword matching."""
    keywords_list = [k.strip().lower() for k in keywords.split(',')]
    highlights = []
    
    # Split document into sentences
    sentences = document_text.split('. ')
    
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
            
        lower_sentence = sentence.lower()
        relevance = 0
        
        # Check for keyword matches
        for keyword in keywords_list:
            if keyword in lower_sentence:
                relevance += 3
        
        if relevance >= 3:
            highlights.append({
                "text": sentence + ".",
                "relevance": min(relevance, 10),
                "context": f"Contains keywords related to: {keywords}"
            })
    
    # Limit to top 10 highlights
    highlights = sorted(highlights, key=lambda x: x['relevance'], reverse=True)[:10]
    
    return jsonify({
        "success": True,
        "highlights": highlights,
        "keywords": keywords,
        "filename": filename,
        "fallback": True
    })

# Document to EditorJS API endpoint - converts documents to EditorJS format
@app.route('/api/document-to-editorjs', methods=['POST'])
def document_to_editorjs():
    """Convert document content to EditorJS format for rich text viewing."""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        document_path = data.get('document_path')
        filename = data.get('filename', 'Unknown Document')
        
        logger.info(f"Document conversion request - path: {document_path}, filename: {filename}")
        
        if not document_path:
            return jsonify({"error": "Document path is required"}), 400
        
        # If document_path is just a filename, try to resolve full path
        if not os.path.isabs(document_path) and filename:
            logger.info(f"Resolving relative path: {document_path}")
            # Try to get the full path from RAG manager if we have chat context
            # For now, let's look in common upload directories
            possible_paths = [
                os.path.join('data', 'uploads', document_path),
                os.path.join('data', 'uploads', filename),
                document_path
            ]
            
            logger.info(f"Checking possible paths: {possible_paths}")
            
            resolved_path = None
            for path in possible_paths:
                full_path = os.path.join(os.getcwd(), path) if not os.path.isabs(path) else path
                logger.info(f"Checking path: {full_path}")
                if os.path.exists(full_path):
                    resolved_path = full_path
                    logger.info(f"Found file at: {resolved_path}")
                    break
            
            if resolved_path:
                document_path = resolved_path
            else:
                logger.error(f"Document not found in any of the possible paths")
                return jsonify({"error": f"Document not found: {filename}"}), 404
        
        # Check if document exists
        if not os.path.exists(document_path):
            return jsonify({"error": "Document not found"}), 404
        
        # Extract text content from document
        try:
            logger.info(f"Attempting to extract text from: {document_path}")
            if document_path.lower().endswith('.pdf'):
                document_text = extract_pdf_text(document_path)
            elif document_path.lower().endswith(('.doc', '.docx')):
                document_text = extract_word_text(document_path)
            elif document_path.lower().endswith('.txt'):
                with open(document_path, 'r', encoding='utf-8', errors='replace') as f:
                    document_text = f.read()
            else:
                # Try to read as text file with fallback encoding
                try:
                    with open(document_path, 'r', encoding='utf-8', errors='replace') as f:
                        document_text = f.read()
                except UnicodeDecodeError:
                    # Try with latin-1 as fallback
                    with open(document_path, 'r', encoding='latin-1') as f:
                        document_text = f.read()
            
            logger.info(f"Extracted {len(document_text)} characters from document")
            
            # Debug: Log a sample of the extracted text to check accents
            if document_text:
                sample_text = document_text[:200].replace('\n', '\\n')
                logger.info(f"Sample extracted text: {repr(sample_text)}")
        except Exception as e:
            logger.error(f"Failed to read document {document_path}: {e}")
            return jsonify({"error": f"Failed to read document: {str(e)}"}), 500
        
        if not document_text.strip():
            return jsonify({"error": "Document appears to be empty or unreadable"}), 400
        
        # Convert to EditorJS format
        editorjs_data = convert_text_to_editorjs(document_text, filename)
        
        # Debug: Log a sample of the converted EditorJS data
        if editorjs_data and editorjs_data.get('blocks'):
            first_block = editorjs_data['blocks'][0] if editorjs_data['blocks'] else {}
            if first_block.get('data', {}).get('text'):
                sample_editorjs = first_block['data']['text'][:200]
                logger.info(f"Sample EditorJS text: {repr(sample_editorjs)}")
        
        return jsonify({
            "success": True,
            "editorjs_data": editorjs_data,
            "filename": filename
        })
        
    except Exception as e:
        logger.error(f"Document to EditorJS conversion error: {e}")
        return jsonify({"error": f"Conversion failed: {str(e)}"}), 500

def extract_word_text(doc_path):
    """Extract text from Word documents."""
    try:
        from docx import Document
        doc = Document(doc_path)
        text = ""
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        return text
    except ImportError:
        logger.warning("python-docx not available, trying LibreOffice conversion")
        try:
            # Try to convert to PDF first using LibreOffice, then extract text
            import tempfile
            with tempfile.TemporaryDirectory() as temp_dir:
                # Convert DOC to PDF using LibreOffice
                pdf_path = _convert_to_pdf_with_libreoffice(doc_path, temp_dir)
                if pdf_path and os.path.exists(pdf_path):
                    return extract_pdf_text(pdf_path)
                else:
                    return ""
        except Exception as e:
            logger.error(f"Failed to convert Word document via LibreOffice: {e}")
            return ""
    except Exception as e:
        logger.error(f"Failed to extract Word text: {e}")
        return ""

def convert_text_to_editorjs(text, filename):
    """Convert text to EditorJS format with proper PDF structure detection and Unicode handling."""
    try:
        import re
        import unicodedata
        
        # Ensure proper Unicode handling
        if isinstance(text, bytes):
            text = text.decode('utf-8', errors='replace')
        
        # Normalize Unicode to ensure accents are preserved
        text = unicodedata.normalize('NFC', text)
        
        # Fix specific Spanish accent encoding issues
        text = text.replace('a´', 'á')
        text = text.replace('e´', 'é')
        text = text.replace('i´', 'í')
        text = text.replace('o´', 'ó')
        text = text.replace('u´', 'ú')
        text = text.replace('n~', 'ñ')
        text = text.replace('A´', 'Á')
        text = text.replace('E´', 'É')
        text = text.replace('I´', 'Í')
        text = text.replace('O´', 'Ó')
        text = text.replace('U´', 'Ú')
        text = text.replace('N~', 'Ñ')
        
        # Clean up the text but preserve structure
        text = text.strip()
        if not text:
            return {
                "time": int(time.time() * 1000),
                "blocks": [{
                    "type": "paragraph",
                    "data": {
                        "text": f"Document: {filename}"
                    }
                }],
                "version": "2.28.0"
            }
        
        # Debug: Log first 200 characters to check encoding
        logger.info(f"Text sample (first 200 chars): {repr(text[:200])}")
        
        blocks = []
        
        # Split text into lines and process line by line for better structure detection
        lines = text.split('\n')
        current_paragraph_lines = []
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            # Skip empty lines
            if not line:
                # If we have accumulated paragraph lines, create a paragraph block
                if current_paragraph_lines:
                    paragraph_text = ' '.join(current_paragraph_lines).strip()
                    if paragraph_text:
                        blocks.append({
                            "type": "paragraph",
                            "data": {
                                "text": paragraph_text
                            }
                        })
                    current_paragraph_lines = []
                i += 1
                continue
            
            # Detect headers based on various patterns
            is_header = False
            header_level = 2
            
            # Pattern 1: All caps lines (likely headers)
            if line.isupper() and len(line) < 80:
                is_header = True
                header_level = 1
            
            # Pattern 2: Lines ending with colon (section headers)
            elif line.endswith(':') and len(line) < 100:
                is_header = True
                header_level = 2
            
            # Pattern 3: Numbered sections (1., 2., etc.)
            elif re.match(r'^\d+\.?\s+[A-ZÁÉÍÓÚÑÜ]', line, re.UNICODE):
                is_header = True
                header_level = 2
            
            # Pattern 4: Roman numerals
            elif re.match(r'^[IVX]+\.?\s+[A-ZÁÉÍÓÚÑÜ]', line, re.UNICODE):
                is_header = True
                header_level = 2
            
            # Pattern 5: Chapter/Section keywords
            elif re.match(r'^(CAPÍTULO|CHAPTER|SECCIÓN|SECTION|PARTE|PART)\s+', line, re.IGNORECASE | re.UNICODE):
                is_header = True
                header_level = 1
            
            # Pattern 6: Standalone short lines that look like titles
            elif (len(line) < 80 and 
                  not line.endswith('.') and 
                  not line.endswith(',') and
                  not line.startswith('-') and
                  not line.startswith('•') and
                  re.search(r'[A-ZÁÉÍÓÚÑÜ]', line, re.UNICODE)):
                # Check if next line is empty or starts a paragraph (indicates this might be a header)
                if i + 1 < len(lines) and (not lines[i + 1].strip() or lines[i + 1].strip().startswith(('El ', 'La ', 'Los ', 'Las ', 'Un ', 'Una ', 'En ', 'Con ', 'Por ', 'Para '))):
                    is_header = True
                    header_level = 3
            
            if is_header:
                # Save current paragraph if exists
                if current_paragraph_lines:
                    paragraph_text = ' '.join(current_paragraph_lines).strip()
                    if paragraph_text:
                        blocks.append({
                            "type": "paragraph",
                            "data": {
                                "text": paragraph_text
                            }
                        })
                    current_paragraph_lines = []
                
                # Add header block
                blocks.append({
                    "type": "header",
                    "data": {
                        "text": line,
                        "level": header_level
                    }
                })
            
            # Detect lists with improved patterns
            elif (line.startswith(('•', '-', '*', '–', '—', '▪', '▫', '◦')) or 
                  re.match(r'^\d+[\.\)\]\}\:][\s\t]+', line) or  # 1. 1) 1] 1} 1:
                  re.match(r'^[a-zA-Z][\.\)\]\}\:][\s\t]+', line) or  # a. a) a] a} a:
                  re.match(r'^[ivxlcdm]+[\.\)\]\}\:][\s\t]+', line, re.IGNORECASE) or  # i. ii. iii.
                  re.match(r'^[IVXLCDM]+[\.\)\]\}\:][\s\t]+', line) or  # I. II. III.
                  re.match(r'^\(\d+\)[\s\t]+', line) or  # (1) (2) (3)
                  re.match(r'^\([a-zA-Z]\)[\s\t]+', line) or  # (a) (b) (c)
                  re.match(r'^-[\s\t]+', line) or  # Dash lists
                  re.match(r'^\d+\.[\d+\.]*[\s\t]+', line)):  # 1.1 1.2 1.1.1
                
                # Save current paragraph if exists
                if current_paragraph_lines:
                    paragraph_text = ' '.join(current_paragraph_lines).strip()
                    if paragraph_text:
                        blocks.append({
                            "type": "paragraph",
                            "data": {
                                "text": paragraph_text
                            }
                        })
                    current_paragraph_lines = []
                
                # Extract list items
                list_items = []
                list_style = "unordered"
                
                # Determine list style with improved detection
                if (re.match(r'^\d+[\.\)\]\}\:][\s\t]+', line) or 
                    re.match(r'^\(\d+\)[\s\t]+', line) or
                    re.match(r'^\d+\.[\d+\.]*[\s\t]+', line)):
                    list_style = "ordered"
                elif (re.match(r'^[a-zA-Z][\.\)\]\}\:][\s\t]+', line) or
                      re.match(r'^\([a-zA-Z]\)[\s\t]+', line)):
                    list_style = "ordered"  # Letter-based ordering
                elif (re.match(r'^[ivxlcdmIVXLCDM]+[\.\)\]\}\:][\s\t]+', line)):
                    list_style = "ordered"  # Roman numerals
                
                # Process this line and consecutive list items
                while i < len(lines):
                    current_line = lines[i].strip()
                    if not current_line:
                        i += 1
                        break
                    
                    # Check if this is a list item with improved patterns
                    is_list_item = (
                        current_line.startswith(('•', '-', '*', '–', '—', '▪', '▫', '◦')) or 
                        re.match(r'^\d+[\.\)\]\}\:][\s\t]+', current_line) or
                        re.match(r'^[a-zA-Z][\.\)\]\}\:][\s\t]+', current_line) or
                        re.match(r'^[ivxlcdm]+[\.\)\]\}\:][\s\t]+', current_line, re.IGNORECASE) or
                        re.match(r'^\(\d+\)[\s\t]+', current_line) or
                        re.match(r'^\([a-zA-Z]\)[\s\t]+', current_line) or
                        re.match(r'^-[\s\t]+', current_line) or
                        re.match(r'^\d+\.[\d+\.]*[\s\t]+', current_line)
                    )
                    
                    if is_list_item:
                        # Remove list markers with comprehensive patterns
                        item_text = current_line
                        
                        # Remove bullet points
                        item_text = re.sub(r'^[•\-\*–—▪▫◦][\s\t]*', '', item_text)
                        
                        # Remove numbered markers (1. 1) 1] 1} 1:)
                        item_text = re.sub(r'^\d+[\.\)\]\}\:][\s\t]*', '', item_text)
                        
                        # Remove letter markers (a. a) a] a} a:)
                        item_text = re.sub(r'^[a-zA-Z][\.\)\]\}\:][\s\t]*', '', item_text)
                        
                        # Remove roman numeral markers (i. ii. iii. I. II. III.)
                        item_text = re.sub(r'^[ivxlcdmIVXLCDM]+[\.\)\]\}\:][\s\t]*', '', item_text)
                        
                        # Remove parenthetical markers ((1) (a) (i))
                        item_text = re.sub(r'^\([^\)]+\)[\s\t]*', '', item_text)
                        
                        # Remove nested numbered markers (1.1 1.2.3)
                        item_text = re.sub(r'^\d+\.[\d+\.]*[\s\t]*', '', item_text)
                        
                        # Remove dash markers (- text)
                        item_text = re.sub(r'^-[\s\t]*', '', item_text)
                        
                        if item_text.strip():
                            list_items.append(item_text.strip())
                        i += 1
                    else:
                        # Not a list item, step back and break
                        break
                
                # Create list block
                if list_items:
                    blocks.append({
                        "type": "list",
                        "data": {
                            "style": list_style,
                            "items": list_items
                        }
                    })
                
                continue  # Skip the normal increment since we handled it in the loop
            
            else:
                # Regular paragraph line
                current_paragraph_lines.append(line)
            
            i += 1
        
        # Add any remaining paragraph
        if current_paragraph_lines:
            paragraph_text = ' '.join(current_paragraph_lines).strip()
            if paragraph_text:
                blocks.append({
                    "type": "paragraph",
                    "data": {
                        "text": paragraph_text
                    }
                })
        
        # Ensure at least one block
        if not blocks:
            blocks.append({
                "type": "paragraph",
                "data": {
                    "text": text[:2000] + "..." if len(text) > 2000 else text
                }
            })
        
        # Debug: Log sample of blocks to check encoding
        if blocks:
            logger.info(f"Sample block text: {repr(blocks[0]['data'].get('text', '')[:100])}")
        
        return {
            "time": int(time.time() * 1000),
            "blocks": blocks,
            "version": "2.28.0"
        }
        
    except Exception as e:
        logger.error(f"Failed to convert text to EditorJS: {e}")
        # Fallback to simple paragraph with proper encoding
        safe_text = text
        if isinstance(text, bytes):
            safe_text = text.decode('utf-8', errors='replace')
        
        import unicodedata
        safe_text = unicodedata.normalize('NFC', safe_text)
        
        # Fix accent issues in fallback as well
        safe_text = safe_text.replace('a´', 'á')
        safe_text = safe_text.replace('e´', 'é')
        safe_text = safe_text.replace('i´', 'í')
        safe_text = safe_text.replace('o´', 'ó')
        safe_text = safe_text.replace('u´', 'ú')
        safe_text = safe_text.replace('n~', 'ñ')
        safe_text = safe_text.replace('A´', 'Á')
        safe_text = safe_text.replace('E´', 'É')
        safe_text = safe_text.replace('I´', 'Í')
        safe_text = safe_text.replace('O´', 'Ó')
        safe_text = safe_text.replace('U´', 'Ú')
        safe_text = safe_text.replace('N~', 'Ñ')
        
        return {
            "time": int(time.time() * 1000),
            "blocks": [{
                "type": "paragraph",
                "data": {
                    "text": safe_text[:2000] + "..." if len(safe_text) > 2000 else safe_text
                }
            }],
            "version": "2.28.0"
        }

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

@app.route('/api/tags/<tag_id>/relations', methods=['GET', 'PUT'])
def tag_relations(tag_id):
    if request.method == 'GET':
        return jsonify({ 'relatedIds': data_service.get_tag_relations(tag_id) })
    payload = request.json or {}
    related_ids = payload.get('relatedIds') or []
    ok = data_service.set_tag_relations(tag_id, related_ids)
    return jsonify({ 'status': 'success' if ok else 'error' }), (200 if ok else 500)

@app.route('/api/tags/<tag_id>/dependencies', methods=['GET', 'PUT'])
def tag_dependencies(tag_id):
    if request.method == 'GET':
        return jsonify({ 'dependsOnIds': data_service.get_tag_dependencies(tag_id) })
    payload = request.json or {}
    depends_ids = payload.get('dependsOnIds') or []
    ok = data_service.set_tag_dependencies(tag_id, depends_ids)
    return jsonify({ 'status': 'success' if ok else 'error' }), (200 if ok else 500)

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

@app.route('/api/notes/query', methods=['GET'])
def notes_query():
    # Combine tag filters, text search, and date range
    def parse_ids(param):
        v = request.args.get(param)
        if not v:
            return []
        return [x for x in v.split(',') if x]
    any_of = parse_ids('anyOf')
    all_of = parse_ids('allOf')
    none_of = parse_ids('noneOf')
    text = request.args.get('text')
    start = request.args.get('start')
    end = request.args.get('end')
    ids = set(data_service.search_notes_by_tags(any_of, all_of, none_of, 1000))
    if text:
        text_results = data_service.search_content(text, 'notes')
        text_ids = {r['id'] for r in text_results}
        ids = ids.intersection(text_ids) if ids else text_ids
    if start or end:
        # Filter by date range using direct DB query for performance
        try:
            with data_service.db.get_connection() as conn:
                params = []
                where = []
                if start:
                    where.append('updated_at >= ?')
                    params.append(start)
                if end:
                    where.append('updated_at <= ?')
                    params.append(end)
                sql = 'SELECT id FROM notes'
                if where:
                    sql += ' WHERE ' + ' AND '.join(where)
                cur = conn.execute(sql, params)
                date_ids = {r['id'] for r in cur.fetchall()}
                ids = ids.intersection(date_ids) if ids else date_ids
        except Exception:
            pass
    return jsonify({ 'noteIds': list(ids) })

@app.route('/api/tags/<tag_id>/dashboard', methods=['GET'])
def tag_dashboard(tag_id):
    data = data_service.get_tag_dashboard(tag_id)
    if not data:
        return jsonify({ 'error': 'not_found' }), 404
    return jsonify(data)

@app.route('/api/tags/<tag_id>/notes', methods=['GET'])
def get_notes_for_tag(tag_id):
    """Get all notes that use a specific tag."""
    try:
        # First check if the tag exists
        try:
            with data_service.db.get_connection() as conn:
                cursor = conn.execute('SELECT id FROM tags WHERE id = ?', (tag_id,))
                if not cursor.fetchone():
                    return jsonify({'error': 'Tag not found', 'notes': [], 'count': 0}), 404
        except Exception:
            return jsonify({'error': 'Tag not found', 'notes': [], 'count': 0}), 404
            
        # Get note IDs that use this tag
        note_ids = data_service.search_notes_by_tags(any_of=[tag_id])
        
        # Get note details for each ID
        notes = []
        for note_id in note_ids:
            note = data_service.get_note(note_id)
            if note:
                notes.append({
                    'id': note_id,
                    'title': note.get('name', 'Untitled'),
                    'lastModified': note.get('updated_at'),
                    'content_preview': note.get('content', {}).get('content', '')[:200] if note.get('content') else ''
                })
        
        return jsonify({
            'notes': notes,
            'count': len(notes)
        })
    except Exception as e:
        logging.error(f"Error getting notes for tag {tag_id}: {e}")
        return jsonify({'error': 'internal_error', 'notes': [], 'count': 0}), 500

# =========================
# Jobs API
# =========================
@app.route('/api/jobs', methods=['GET', 'POST'])
def jobs_index():
    if request.method == 'GET':
        filters = {
            'q': request.args.get('q'),
            'applied': (request.args.get('applied') in ('1','true','True')) if request.args.get('applied') is not None else None,
            'responded': (request.args.get('responded') in ('1','true','True')) if request.args.get('responded') is not None else None,
            'state': request.args.get('state'),
            'location': request.args.get('location'),
            'minSalary': float(request.args.get('minSalary')) if request.args.get('minSalary') else None,
            'maxSalary': float(request.args.get('maxSalary')) if request.args.get('maxSalary') else None,
            'company': request.args.get('company'),
            'position': request.args.get('position'),
            'hasLetters': (request.args.get('hasLetters') in ('1','true','True')) if request.args.get('hasLetters') is not None else None,
            'anyOf': request.args.get('anyOf', '').split(',') if request.args.get('anyOf') else [],
            'allOf': request.args.get('allOf', '').split(',') if request.args.get('allOf') else [],
            'noneOf': request.args.get('noneOf', '').split(',') if request.args.get('noneOf') else []
        }
        # Remove None filters
        filters = {k:v for k,v in filters.items() if v is not None and v != ''}
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        jobs = data_service.list_jobs(filters, limit, offset)
        return jsonify({ 'jobs': jobs })
    payload = request.json or {}
    job = data_service.create_job(payload)
    if not job:
        return jsonify({ 'error': 'create_failed' }), 400
    return jsonify(job)

@app.route('/api/jobs/<job_id>', methods=['GET', 'PATCH', 'DELETE'])
def jobs_item(job_id):
    if request.method == 'GET':
        job = data_service.get_job(job_id)
        return (jsonify(job), 200) if job else (jsonify({ 'error': 'not_found' }), 404)
    if request.method == 'PATCH':
        patch = request.json or {}
        job = data_service.update_job(job_id, patch)
        return (jsonify(job), 200) if job else (jsonify({ 'error': 'update_failed' }), 400)
    ok = data_service.delete_job(job_id)
    return jsonify({ 'status': 'success' if ok else 'error' }), (200 if ok else 400)

@app.route('/api/jobs/<job_id>/letters', methods=['GET', 'POST'])
def jobs_letters(job_id):
    if request.method == 'GET':
        return jsonify({ 'letters': data_service.list_motivation_letters(job_id) })
    # POST upload
    if 'file' not in request.files:
        return jsonify({ 'error': 'no_file' }), 400
    f = request.files['file']
    if not f.filename.lower().endswith('.pdf'):
        return jsonify({ 'error': 'only_pdf_allowed' }), 400
    # Save under instance/uploads/letters/{job_id}
    base = os.path.join('instance','uploads','letters', job_id)
    os.makedirs(base, exist_ok=True)
    filename = f.filename
    safe_name = re.sub(r'[^a-zA-Z0-9_.\-]', '_', filename)
    dest = os.path.join(base, safe_name)
    f.save(dest)
    letter = data_service.add_motivation_letter(job_id, dest, filename=safe_name)
    if not letter:
        return jsonify({ 'error': 'save_failed' }), 500
    return jsonify(letter)

@app.route('/api/jobs/<job_id>/letters/<path:filename>', methods=['GET'])
def serve_job_letter(job_id, filename):
    base = os.path.join('instance', 'uploads', 'letters', job_id)
    return send_from_directory(base, filename, as_attachment=False)

@app.route('/api/jobs/<job_id>/events', methods=['GET', 'POST'])
def jobs_events(job_id):
    if request.method == 'GET':
        return jsonify({ 'events': data_service.list_job_events(job_id) })
    payload = request.json or {}
    ev = data_service.add_job_event(job_id, payload)
    if not ev:
        return jsonify({ 'error': 'create_failed' }), 400
    return jsonify(ev)

@app.route('/api/jobs/<job_id>/events/<event_id>', methods=['PATCH', 'DELETE'])
def jobs_event_item(job_id, event_id):
    if request.method == 'PATCH':
        patch = request.json or {}
        ev = data_service.update_job_event(event_id, patch)
        return (jsonify(ev), 200) if ev else (jsonify({ 'error': 'update_failed' }), 400)
    ok = data_service.delete_job_event(event_id)
    return jsonify({ 'deleted': ok }), (200 if ok else 400)

@app.route('/api/jobs/scrape', methods=['POST'])
def jobs_scrape():
    """Job scraping via JobSpy adapter only.
    Returns: { prefill, provenance }
    """
    payload = request.json or {}
    url = payload.get('url', '')
    if not url:
        return jsonify({'error': 'missing_url'}), 400
    try:
        from jobspy_adapter import extract as js_extract, is_supported as js_supported
    except Exception:
        return jsonify({'error': 'jobspy_not_installed'}), 501
    try:
        if not js_supported(url):
            return jsonify({'error': 'unsupported_domain'}), 422
        result = js_extract(url)
        if not result:
            return jsonify({'error': 'extraction_failed'}), 502
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': 'scrape_internal_error', 'details': str(e)}), 500

# =========================
# Job Scraper API
# =========================
@app.route('/api/job-scraper/configs', methods=['GET', 'POST'])
def job_scraper_configs():
    """Manage job scraper configurations"""
    if request.method == 'GET':
        configs = data_service.db.get_scraper_configs()
        return jsonify({'configs': configs})
    
    # POST - Create new config
    payload = request.json or {}
    config_id = data_service.db.create_scraper_config(payload)
    
    if config_id:
        # Schedule the config if enabled
        try:
            # Use the app's job scraper service
            if not hasattr(app, 'job_scraper_service') or app.job_scraper_service is None:
                return jsonify({'error': 'Job scraper service not available'}), 503
                
            scraper_service = app.job_scraper_service
            
            config = next((c for c in data_service.db.get_scraper_configs() if c['id'] == config_id), None)
            if config and config.get('enabled', True):
                scraper_service.schedule_config(config)
                
        except Exception as e:
            logger.warning(f"Could not schedule new config: {e}")
        
        return jsonify({'id': config_id, 'status': 'created'}), 201
    else:
        return jsonify({'error': 'creation_failed'}), 400

@app.route('/api/job-scraper/configs/<config_id>', methods=['GET', 'PATCH', 'DELETE'])
def job_scraper_config_item(config_id):
    """Manage individual job scraper configuration"""
    configs = data_service.db.get_scraper_configs()
    config = next((c for c in configs if c['id'] == config_id), None)
    
    if not config:
        return jsonify({'error': 'config_not_found'}), 404
    
    if request.method == 'GET':
        return jsonify(config)
    
    elif request.method == 'PATCH':
        updates = request.json or {}
        success = data_service.db.update_scraper_config(config_id, updates)
        
        if success:
            # Update scheduling if needed
            try:
                updated_config = next((c for c in data_service.db.get_scraper_configs() if c['id'] == config_id), None)
                if updated_config and hasattr(app, 'job_scraper_service') and app.job_scraper_service:
                    app.job_scraper_service.schedule_config(updated_config)
            except Exception as e:
                logger.warning(f"Could not update schedule for config: {e}")
            
            return jsonify({'status': 'updated'})
        else:
            return jsonify({'error': 'update_failed'}), 400
    
    elif request.method == 'DELETE':
        success = data_service.db.delete_scraper_config(config_id)
        
        if success:
            # Clear scheduling
            try:
                import schedule
                schedule.clear(f"config_{config_id}")
            except ImportError:
                logger.warning("Schedule package not available")
            except Exception as e:
                logger.warning(f"Could not clear schedule for deleted config: {e}")
            
            return jsonify({'status': 'deleted'})
        else:
            return jsonify({'error': 'deletion_failed'}), 400

@app.route('/api/job-scraper/configs/<config_id>/run', methods=['POST'])
def job_scraper_run_config(config_id):
    """Manually run a job scraper configuration"""
    configs = data_service.db.get_scraper_configs()
    config = next((c for c in configs if c['id'] == config_id), None)
    
    if not config:
        return jsonify({'error': 'config_not_found'}), 404
    
    try:
        if not hasattr(app, 'job_scraper_service') or app.job_scraper_service is None:
            return jsonify({'error': 'Job scraper service not available'}), 503
        
        # Run in background thread to avoid blocking
        def run_async():
            app.job_scraper_service.run_scrape(config)
        
        thread = threading.Thread(target=run_async, daemon=True)
        thread.start()
        
        return jsonify({'status': 'started', 'message': 'Scrape job started in background'})
        
    except Exception as e:
        logger.error(f"Error starting scrape: {e}")
        return jsonify({'error': 'start_failed', 'details': str(e)}), 500

@app.route('/api/job-scraper/manual-search', methods=['POST'])
def job_scraper_manual_search():
    """Perform a manual job search"""
    try:
        payload = request.json or {}
        
        required_fields = ['search_term', 'location']
        for field in required_fields:
            if not payload.get(field):
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Check if job scraper service is available
        if not hasattr(app, 'job_scraper_service') or app.job_scraper_service is None:
            return jsonify({'error': 'Job scraper service not available'}), 503
        
        logger.info(f"Starting manual search for: {payload.get('search_term')} in {payload.get('location')}")
        
        results = app.job_scraper_service.manual_search(payload)
        logger.info(f"Manual search returned {len(results)} results")
        
        # Clean NaN values from results for JSON serialization
        import math
        
        def clean_nan_values(obj):
            if isinstance(obj, dict):
                return {k: clean_nan_values(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_nan_values(item) for item in obj]
            elif isinstance(obj, float) and math.isnan(obj):
                return None
            else:
                return obj
        
        cleaned_results = clean_nan_values(results)
        
        return jsonify({'jobs': cleaned_results, 'count': len(cleaned_results)})
        
    except ImportError as e:
        logger.error(f"Import error in manual search: {e}")
        return jsonify({'error': 'Service dependency missing', 'details': str(e)}), 503
    except Exception as e:
        logger.error(f"Manual search failed: {e}", exc_info=True)
        return jsonify({'error': 'Search failed', 'details': str(e)}), 500

@app.route('/api/job-scraper/import-jobs', methods=['POST'])
def job_scraper_import_jobs():
    """Import selected jobs from manual search"""
    payload = request.json or {}
    job_selections = payload.get('jobs', [])
    
    logger.info(f"Received job import request with {len(job_selections)} jobs")
    
    if not job_selections:
        return jsonify({'error': 'no_jobs_selected'}), 400
    
    # Log the structure of the first job for debugging
    if job_selections and len(job_selections) > 0:
        first_job = job_selections[0]
        logger.info(f"First job structure: {first_job}")
        if first_job is None:
            logger.error("First job is None!")
        elif not isinstance(first_job, dict):
            logger.error(f"First job is not a dict, it's a {type(first_job)}")
    
    try:
        if not hasattr(app, 'job_scraper_service') or app.job_scraper_service is None:
            return jsonify({'error': 'Job scraper service not available'}), 503
        
        stats = app.job_scraper_service.import_selected_jobs(job_selections)
        logger.info(f"Import completed: {stats}")
        return jsonify(stats)
        
    except Exception as e:
        logger.error(f"Job import failed: {e}", exc_info=True)
        return jsonify({'error': 'import_failed', 'details': str(e)}), 500

@app.route('/api/job-scraper/runs', methods=['GET'])
def job_scraper_runs():
    """Get scraper run history"""
    config_id = request.args.get('config_id')
    limit = int(request.args.get('limit', 50))
    
    runs = data_service.db.get_scraper_runs_history(config_id, limit)
    return jsonify({'runs': runs})

@app.route('/api/job-scraper/status', methods=['GET'])
def job_scraper_status():
    """Get overall scraper service status"""
    try:
        if not hasattr(app, 'job_scraper_service') or app.job_scraper_service is None:
            return jsonify({
                'running': False,
                'active_configs': 0,
                'total_configs': len(data_service.db.get_scraper_configs()),
                'error': 'Service not available'
            })
        
        return jsonify({
            'running': app.job_scraper_service.running,
            'active_configs': len([c for c in data_service.db.get_scraper_configs() if c.get('enabled', True)]),
            'total_configs': len(data_service.db.get_scraper_configs())
        })
        
    except Exception as e:
        return jsonify({
            'running': False,
            'error': str(e),
            'active_configs': 0,
            'total_configs': 0
        })

# =========================
# Time Tracking API
# =========================
@app.route('/api/time/activities', methods=['GET', 'POST'])
def time_activities():
    if request.method == 'GET':
        return jsonify({ 'activities': data_service.list_activities() })
    payload = request.json or {}
    name = payload.get('name')
    if not name:
        return jsonify({ 'error': 'missing_name' }), 400
    color = payload.get('color')
    tag_id = payload.get('tagId')
    act = data_service.upsert_activity(name, color, tag_id)
    return jsonify(act)

@app.route('/api/time/entries', methods=['GET', 'POST'])
def time_entries():
    if request.method == 'GET':
        start = request.args.get('start')
        end = request.args.get('end')
        day = request.args.get('day')
        entries = data_service.list_time_entries(start, end, day)
        return jsonify({ 'entries': entries })
    payload = request.json or {}
    activity_id = payload.get('activityId')
    if not activity_id:
        return jsonify({ 'error': 'missing_activity' }), 400
    start_time = payload.get('startTime')
    note_id = payload.get('noteId')
    description = payload.get('description')
    entry = data_service.start_time_entry(activity_id, start_time, note_id, description)
    if not entry:
        return jsonify({ 'error': 'start_failed' }), 400
    return jsonify(entry)

@app.route('/api/time/entries/<entry_id>', methods=['PATCH'])
def time_entry_update(entry_id):
    patch = request.json or {}
    entry = data_service.update_time_entry(entry_id, patch)
    return (jsonify(entry), 200) if entry else (jsonify({ 'error': 'update_failed' }), 400)

@app.route('/api/time/entries/<entry_id>/stop', methods=['POST'])
def time_entry_stop(entry_id):
    entry = data_service.stop_time_entry(entry_id)
    return (jsonify(entry), 200) if entry else (jsonify({ 'error': 'stop_failed' }), 400)

# =========================
# Dev Templates Loader
# =========================
@app.route('/api/dev/load_template', methods=['POST', 'GET'])
def dev_load_template():
    name = request.args.get('name') or (request.json or {}).get('name') or 'all'
    result = data_service.load_template(name)
    code = 200 if result.get('status') == 'ok' else 500
    return jsonify(result), code

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
            return jsonify({"models": models, "status": "success"})
        else:
            return jsonify({"error": "Failed to fetch models from Ollama", "status": "error"}), 500
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Error connecting to Ollama: {e}")
        return jsonify({"error": "Cannot connect to Ollama service", "status": "error"}), 500
    except Exception as e:
        logger.error(f"Error fetching Ollama models: {e}")
        return jsonify({"error": "Internal server error", "status": "error"}), 500

@app.route('/api/compose/debug', methods=['GET'])
def compose_debug():
    """Debug endpoint to check compose configuration."""
    try:
        # Check Ollama connection
        ollama_status = "disconnected"
        models = []
        try:
            response = requests.get("http://127.0.0.1:11434/api/tags", timeout=5)
            if response.ok:
                ollama_status = "connected"
                models = [m.get('name', '') for m in response.json().get('models', [])]
        except:
            pass
        
        # Get current configuration
        config = {
            "ollama_status": ollama_status,
            "available_models": models,
            "configured_models": {
                "compose": os.getenv('COMPOSE_MODEL', 'llama3.2:1b'),
                "recipe": os.getenv('RECIPE_MODEL', 'llama3.2:3b'),
                "agent": os.getenv('AGENT_MODEL', 'llama3.2:1b')
            },
            "token_limits": {
                "recipe": int(os.getenv('RECIPE_MAX_TOKENS', '2000')),
                "template": int(os.getenv('TEMPLATE_MAX_TOKENS', '1500')),
                "generate": int(os.getenv('GENERATE_MAX_TOKENS', '1200')),
                "compose": int(os.getenv('COMPOSE_MAX_TOKENS', '800'))
            },
            "agents_manager_available": agents_manager is not None
        }
        
        return jsonify(config)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/config/defaults', methods=['GET'])
def get_default_config():
    """Get default configuration from environment variables."""
    try:
        return jsonify({
            "default_model": os.getenv('COMPOSE_MODEL', 'llama3.2:1b'),
            "rag_model": os.getenv('RAG_MODEL', 'llama3.2:3b'),
            "agent_model": os.getenv('AGENT_MODEL', 'llama3.2:1b'),
            "recipe_model": os.getenv('RECIPE_MODEL', 'llama3.2:3b')
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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
# Compose (Editor Assistant) Endpoint
# =============================================================================

def extract_template_from_text(text, template_id):
    """Extract structured content from plain text response for templates."""
    try:
        blocks = []
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        if not lines:
            return None
        
        # Try to identify a title (first line or line that looks like a title)
        title = None
        content_start = 0
        
        # Look for a title in the first few lines
        for i, line in enumerate(lines[:3]):
            if line and not line.startswith('-') and not line.startswith('•') and not re.match(r'^\d+\.', line):
                # This looks like a title
                title = line
                content_start = i + 1
                break
        
        if title:
            # Add emoji if it's a title and doesn't have one
            if not any(ord(char) > 127 for char in title):
                # Add appropriate emoji based on template type
                if template_id and 'meeting' in str(template_id).lower():
                    title = f"📅 {title}"
                elif template_id and 'project' in str(template_id).lower():
                    title = f"📋 {title}"
                elif template_id and 'note' in str(template_id).lower():
                    title = f"📝 {title}"
                else:
                    title = f"📄 {title}"
            
            blocks.append({
                'type': 'header',
                'data': {'text': title, 'level': 1}
            })
        
        # Process the rest of the content
        current_section = None
        current_list_items = []
        current_list_style = None
        
        for line in lines[content_start:]:
            # Check if this looks like a section header
            if (line.endswith(':') or 
                (not line.startswith('-') and not line.startswith('•') and 
                 not re.match(r'^\d+\.', line) and 
                 len(line) < 50 and 
                 any(word in line.lower() for word in ['overview', 'summary', 'details', 'notes', 'description', 'agenda', 'tasks', 'objectives', 'goals']))):
                
                # Finish any current list
                if current_list_items:
                    blocks.append({
                        'type': 'list',
                        'data': {'style': current_list_style, 'items': current_list_items}
                    })
                    current_list_items = []
                    current_list_style = None
                
                # Add section header
                section_title = line.rstrip(':').strip()
                blocks.append({
                    'type': 'header',
                    'data': {'text': section_title, 'level': 2}
                })
                current_section = section_title.lower()
                continue
            
            # Check for list items
            if line.startswith('- ') or line.startswith('• '):
                item_text = line[2:].strip()
                if item_text:
                    if current_list_style != 'unordered':
                        # Finish previous list if different style
                        if current_list_items:
                            blocks.append({
                                'type': 'list',
                                'data': {'style': current_list_style, 'items': current_list_items}
                            })
                        current_list_items = []
                        current_list_style = 'unordered'
                    current_list_items.append(item_text)
            elif re.match(r'^\d+\.\s', line):
                item_text = re.sub(r'^\d+\.\s*', '', line).strip()
                if item_text:
                    if current_list_style != 'ordered':
                        # Finish previous list if different style
                        if current_list_items:
                            blocks.append({
                                'type': 'list',
                                'data': {'style': current_list_style, 'items': current_list_items}
                            })
                        current_list_items = []
                        current_list_style = 'ordered'
                    current_list_items.append(item_text)
            # Check for checklist items
            elif line.startswith('- [ ] ') or line.startswith('- [x] ') or line.startswith('- [X] '):
                # Finish any current list
                if current_list_items:
                    blocks.append({
                        'type': 'list',
                        'data': {'style': current_list_style, 'items': current_list_items}
                    })
                    current_list_items = []
                    current_list_style = None
                
                checked = line.startswith('- [x] ') or line.startswith('- [X] ')
                item_text = line[6:].strip()
                if item_text:
                    blocks.append({
                        'type': 'checklist',
                        'data': {'items': [{'text': item_text, 'checked': checked}]}
                    })
            else:
                # Finish any current list
                if current_list_items:
                    blocks.append({
                        'type': 'list',
                        'data': {'style': current_list_style, 'items': current_list_items}
                    })
                    current_list_items = []
                    current_list_style = None
                
                # Add as paragraph if it's substantial content
                if len(line) > 10:  # Ignore very short lines
                    blocks.append({
                        'type': 'paragraph',
                        'data': {'text': line}
                    })
        
        # Finish any remaining list
        if current_list_items:
            blocks.append({
                'type': 'list',
                'data': {'style': current_list_style, 'items': current_list_items}
            })
        
        return blocks if len(blocks) > 1 else None
        
    except Exception as e:
        logger.warning(f"Template extraction failed: {e}")
        return None

def extract_recipe_from_text(text):
    """Extract recipe structure from plain text response when JSON parsing fails."""
    try:
        blocks = []
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        # Try to identify recipe components
        recipe_name = None
        description = None
        ingredients = []
        instructions = []
        equipment = []
        prep_time = None
        cook_time = None
        serves = None
        
        current_section = None
        
        for i, line in enumerate(lines):
            line_lower = line.lower()
            
            # Detect recipe name (first meaningful line or line with "recipe" in it)
            if not recipe_name and (i == 0 or 'recipe' in line_lower):
                # Clean up common prefixes
                recipe_name = re.sub(r'^(recipe:?\s*|for\s+)', '', line, flags=re.IGNORECASE).strip()
                if recipe_name:
                    # Add emoji if not present
                    if not any(char for char in recipe_name if ord(char) > 127):
                        recipe_name = f"🍽️ {recipe_name}"
                    continue
            
            # Detect sections
            if any(keyword in line_lower for keyword in ['ingredient', 'what you need', 'shopping']):
                current_section = 'ingredients'
                continue
            elif any(keyword in line_lower for keyword in ['instruction', 'method', 'direction', 'how to', 'steps']):
                current_section = 'instructions'
                continue
            elif any(keyword in line_lower for keyword in ['equipment', 'tools', 'utensil']):
                current_section = 'equipment'
                continue
            elif any(keyword in line_lower for keyword in ['description', 'about']):
                current_section = 'description'
                continue
            
            # Extract timing info
            if 'prep' in line_lower and ('time' in line_lower or 'min' in line_lower):
                prep_time = line
                continue
            elif 'cook' in line_lower and ('time' in line_lower or 'min' in line_lower):
                cook_time = line
                continue
            elif 'serve' in line_lower and any(char.isdigit() for char in line):
                serves = line
                continue
            
            # Add content to appropriate section
            if current_section == 'ingredients' and (line.startswith('-') or line.startswith('•') or re.match(r'^\d+\.?\s', line)):
                ingredient = re.sub(r'^[-•\d\.]\s*', '', line).strip()
                if ingredient:
                    ingredients.append(ingredient)
            elif current_section == 'instructions' and (line.startswith('-') or line.startswith('•') or re.match(r'^\d+\.?\s', line)):
                instruction = re.sub(r'^[-•\d\.]\s*', '', line).strip()
                if instruction:
                    instructions.append(instruction)
            elif current_section == 'equipment' and (line.startswith('-') or line.startswith('•') or re.match(r'^\d+\.?\s', line)):
                equip = re.sub(r'^[-•\d\.]\s*', '', line).strip()
                if equip:
                    equipment.append(equip)
            elif current_section == 'description' and not any(keyword in line_lower for keyword in ['ingredient', 'instruction', 'equipment']):
                if not description:
                    description = line
                else:
                    description += " " + line
        
        # Build recipe blocks
        if recipe_name:
            blocks.append({
                'type': 'header',
                'data': {'text': recipe_name, 'level': 1}
            })
        
        # Recipe details section
        if prep_time or cook_time or serves:
            blocks.append({
                'type': 'header',
                'data': {'text': 'Recipe Details', 'level': 2}
            })
            
            # Create timing info
            timing_items = []
            if prep_time:
                timing_items.append(f"⏱️ {prep_time}")
            if cook_time:
                timing_items.append(f"🔥 {cook_time}")
            if serves:
                timing_items.append(f"👥 {serves}")
            
            if timing_items:
                blocks.append({
                    'type': 'list',
                    'data': {'style': 'unordered', 'items': timing_items}
                })
        
        # Description
        if description:
            blocks.append({
                'type': 'header',
                'data': {'text': 'Description', 'level': 2}
            })
            blocks.append({
                'type': 'paragraph',
                'data': {'text': description}
            })
        
        # Ingredients
        if ingredients:
            blocks.append({
                'type': 'header',
                'data': {'text': 'Ingredients', 'level': 2}
            })
            blocks.append({
                'type': 'list',
                'data': {'style': 'unordered', 'items': ingredients}
            })
        
        # Equipment
        if equipment:
            blocks.append({
                'type': 'header',
                'data': {'text': 'Equipment Needed', 'level': 2}
            })
            blocks.append({
                'type': 'list',
                'data': {'style': 'unordered', 'items': equipment}
            })
        
        # Instructions
        if instructions:
            blocks.append({
                'type': 'header',
                'data': {'text': 'Instructions', 'level': 2}
            })
            blocks.append({
                'type': 'list',
                'data': {'style': 'ordered', 'items': instructions}
            })
        
        # Add default sections if we have a basic recipe structure
        if blocks and (ingredients or instructions):
            # My Notes section
            blocks.append({
                'type': 'header',
                'data': {'text': 'My Notes', 'level': 2}
            })
            blocks.append({
                'type': 'paragraph',
                'data': {'text': 'Add your personal notes and modifications here...'}
            })
            
            # Rating section
            blocks.append({
                'type': 'header',
                'data': {'text': 'Rating & Review', 'level': 2}
            })
            blocks.append({
                'type': 'paragraph',
                'data': {'text': '⭐ Rating: /5\n📝 Notes: \n✅ Would make again: '}
            })
        
        return blocks if len(blocks) > 1 else None
        
    except Exception as e:
        logger.warning(f"Recipe extraction failed: {e}")
        return None

@app.route('/api/compose', methods=['POST'])
def compose_action():
    """
    Perform assistant actions on provided text using Ollama and optional Agent context.

    Payload:
    {
      "action": "simplify|expand|improve|translate|format|highlight|generate|template",
      "text": "...",                 # Source text (for rewrite actions)
      "prompt": "...",               # Additional instruction (generate/template)
      "language": "es|en|...",       # For translate
      "agent_name": "Researcher",    # Optional: use agent persona + knowledge
      "note_id": "...",              # Optional: current note context (for reference)
      "prefer_editorjs": true        # Optional: return EditorJS format (default: true)
    }

    Returns JSON with either { blocks: [...] } (EditorJS), { result_text } or { highlights: { keywords:[], sentences:[] } }.
    """
    # Concurrency control to avoid saturating Ollama
    try:
        max_parallel = int(os.getenv('COMPOSE_CONCURRENCY', '2'))
    except Exception:
        max_parallel = 2
    # Create semaphore once and cache on app config
    if not hasattr(app, 'compose_semaphore'):
        app.compose_semaphore = BoundedSemaphore(max_parallel)

    if not app.compose_semaphore.acquire(blocking=False):
        return jsonify({ 'error': 'busy', 'message': 'Assistant is processing other requests. Please try again shortly.' }), 429

    data = request.json or {}
    action = (data.get('action') or '').strip().lower()
    text = (data.get('text') or '').strip()
    prompt = (data.get('prompt') or '').strip()
    language = (data.get('language') or '').strip()
    agent_name = (data.get('agent_name') or '').strip() or None
    note_id = data.get('note_id')
    prefer_editorjs = bool(data.get('prefer_editorjs', True))  # Default to True for notes tab
    template_skeleton = data.get('template_skeleton')  # optional JSON skeleton from selected template
    template_id = data.get('template_id')

    if action not in { 'simplify','expand','improve','translate','format','highlight','generate','template' }:
        app.compose_semaphore.release()
        return jsonify({ 'error': 'invalid_action' }), 400

    # Build system/user prompt for the model
    def build_compose_prompt(agent_cfg: Optional[dict]) -> str:
        persona = ''
        if agent_cfg:
            persona = agent_cfg.get('role_prompt') or ''
        base_ctx = ''
        if note_id:
            base_ctx = f"NoteID: {note_id}.\n"

        # Schema guidance for EditorJS JSON when requested
        edjs_schema = ""
        if prefer_editorjs:
            if action == 'template' and (str(template_id or '').lower() in ('recipe_cooking','recipe', 'recipes') or 'recipe' in str(template_id or '').lower()):
                # Simplified schema specifically for recipes
                edjs_schema = (
                    "Return ONLY valid JSON for a recipe in this format:\n"
                    "{\n"
                    "  \"blocks\": [\n"
                    "    { \"type\": \"header\", \"data\": { \"text\": \"Recipe Name\", \"level\": 1 } },\n"
                    "    { \"type\": \"paragraph\", \"data\": { \"text\": \"Brief description of the dish\" } },\n"
                    "    { \"type\": \"header\", \"data\": { \"text\": \"Ingredients\", \"level\": 2 } },\n"
                    "    { \"type\": \"list\", \"data\": { \"style\": \"unordered\", \"items\": [\"1 cup flour\", \"2 eggs\", \"1/2 cup milk\"] } },\n"
                    "    { \"type\": \"header\", \"data\": { \"text\": \"Instructions\", \"level\": 2 } },\n"
                    "    { \"type\": \"list\", \"data\": { \"style\": \"ordered\", \"items\": [\"Step 1 instruction\", \"Step 2 instruction\"] } },\n"
                    "    { \"type\": \"header\", \"data\": { \"text\": \"Cooking Info\", \"level\": 2 } },\n"
                    "    { \"type\": \"list\", \"data\": { \"style\": \"unordered\", \"items\": [\"Prep time: 15 minutes\", \"Cook time: 30 minutes\", \"Serves: 4 people\"] } }\n"
                    "  ]\n"
                    "}\n\n"
                    "RULES: Use ONLY header, paragraph, and list blocks. NO trailing commas. Valid JSON only.\n"
                )
            else:
                # Comprehensive schema for all EditorJS features
                edjs_schema = (
                    "Return ONLY valid JSON using EditorJS format. Available block types:\n"
                    "{\n"
                    "  \"blocks\": [\n"
                    "    // Headers with levels 1-6\n"
                    "    { \"type\": \"header\", \"data\": { \"text\": \"Title\", \"level\": 1 } },\n"
                    "    \n"
                    "    // Paragraphs with inline formatting\n"
                    "    { \"type\": \"paragraph\", \"data\": { \"text\": \"Text with <mark>highlights</mark> and <b>bold</b>\" } },\n"
                    "    \n"
                    "    // Lists (ordered/unordered)\n"
                    "    { \"type\": \"list\", \"data\": { \"style\": \"unordered\", \"items\": [\"Item 1\", \"Item 2\"] } },\n"
                    "    { \"type\": \"list\", \"data\": { \"style\": \"ordered\", \"items\": [\"Step 1\", \"Step 2\"] } },\n"
                    "    \n"
                    "    // Checklists\n"
                    "    { \"type\": \"checklist\", \"data\": { \"items\": [{ \"text\": \"Task 1\", \"checked\": false }, { \"text\": \"Task 2\", \"checked\": true }] } },\n"
                    "    \n"
                    "    // Tables\n"
                    "    { \"type\": \"table\", \"data\": { \"withHeadings\": true, \"content\": [[\"Header 1\", \"Header 2\"], [\"Row 1 Col 1\", \"Row 1 Col 2\"]] } },\n"
                    "    \n"
                    "    // Code blocks\n"
                    "    { \"type\": \"code\", \"data\": { \"code\": \"function example() { return 'hello'; }\" } },\n"
                    "    \n"
                    "    // Quotes\n"
                    "    { \"type\": \"quote\", \"data\": { \"text\": \"Quote text\", \"caption\": \"Author\", \"alignment\": \"left\" } },\n"
                    "    \n"
                    "    // Delimiters\n"
                    "    { \"type\": \"delimiter\", \"data\": {} },\n"
                    "    \n"
                    "    // Spoilers/Collapsible sections\n"
                    "    { \"type\": \"spoiler\", \"data\": { \"title\": \"Click to expand\", \"content\": \"Hidden content here\" } },\n"
                    "    \n"
                    "    // Raw HTML\n"
                    "    { \"type\": \"raw\", \"data\": { \"html\": \"<div>Custom HTML</div>\" } },\n"
                    "    \n"
                    "    // Embeds (YouTube, Vimeo, etc.)\n"
                    "    { \"type\": \"embed\", \"data\": { \"service\": \"youtube\", \"source\": \"https://youtube.com/watch?v=...\", \"embed\": \"iframe_url\", \"width\": 580, \"height\": 320, \"caption\": \"Video title\" } },\n"
                    "    \n"
                    "    // Images\n"
                    "    { \"type\": \"image\", \"data\": { \"url\": \"image_url\", \"caption\": \"Image caption\", \"withBorder\": false, \"withBackground\": false, \"stretched\": false } },\n"
                    "    \n"
                    "    // Columns (2-column layout)\n"
                    "    { \"type\": \"columns\", \"data\": { \"cols\": [{ \"blocks\": [{ \"type\": \"paragraph\", \"data\": { \"text\": \"Left column\" } }] }, { \"blocks\": [{ \"type\": \"paragraph\", \"data\": { \"text\": \"Right column\" } }] }] } },\n"
                    "    \n"
                    "    // Annotations/Comments\n"
                    "    { \"type\": \"annotation\", \"data\": { \"text\": \"Annotation text\", \"title\": \"Note\" } }\n"
                    "  ]\n"
                    "}\n\n"
                    "RULES:\n"
                    "- Use appropriate block types for content structure\n"
                    "- NO trailing commas in JSON\n"
                    "- Valid JSON only, no comments in actual output\n"
                    "- For lists: style can be 'ordered' or 'unordered'\n"
                    "- For headers: level can be 1-6\n"
                    "- For tables: content is array of arrays, withHeadings boolean\n"
                    "- For embeds: use supported services (youtube, vimeo, codepen, etc.)\n"
                    "- For images: url is required, other properties optional\n"
                    "- For spoilers: title is the header, content is the collapsible text\n"
                    "- Inline formatting in text: <b>bold</b>, <i>italic</i>, <mark>highlight</mark>, <code>code</code>\n"
                )

        if action == 'simplify':
            return (
                f"You are a helpful writing assistant. {('Persona: '+persona+'\n') if persona else ''}"
                "Rewrite the given text to be simpler, clearer, and suitable for a general audience. "
                "Preserve meaning and key facts. "
                + ("Return as structured EditorJS JSON per schema.\n\n" + edjs_schema if prefer_editorjs else "Return only the rewritten text.\n\n")
                + f"{base_ctx}TEXT:\n{text}\n\n"
                + ("JSON:" if prefer_editorjs else "Rewritten:")
            )
        if action == 'expand':
            return (
                f"You are a helpful writing assistant. {('Persona: '+persona+'\n') if persona else ''}"
                "Expand the given text with helpful details, examples, and explanations while staying on topic. "
                "Avoid fabrications. "
                + ("Return as structured EditorJS JSON per schema.\n\n" + edjs_schema if prefer_editorjs else "Return only the expanded text.\n\n")
                + f"{base_ctx}TEXT:\n{text}\n\n"
                + ("JSON:" if prefer_editorjs else "Expanded:")
            )
        if action == 'improve':
            return (
                f"You are a helpful writing assistant. {('Persona: '+persona+'\n') if persona else ''}"
                "Improve the writing (clarity, grammar, flow, concision) without changing meaning or tone. "
                + ("Return as structured EditorJS JSON per schema.\n\n" + edjs_schema if prefer_editorjs else "Return only the improved text.\n\n")
                + f"{base_ctx}TEXT:\n{text}\n\n"
                + ("JSON:" if prefer_editorjs else "Improved:")
            )
        if action == 'format':
            return (
                f"You are a helpful formatter. {('Persona: '+persona+'\n') if persona else ''}"
                + ("When possible, return EditorJS JSON per schema. " if prefer_editorjs else "Format into Markdown. ")
                + "Do not invent new content.\n\n"
                + (edjs_schema if prefer_editorjs else '')
                + f"{base_ctx}TEXT:\n{text}\n\n"
                + ("JSON:" if prefer_editorjs else "Markdown:")
            )
        if action == 'translate':
            tgt = language or 'en'
            return (
                f"You are a precise translator. {('Persona: '+persona+'\n') if persona else ''}"
                f"Translate the text into {tgt}. Keep code, names, and technical terms accurate. "
                + ("Return as structured EditorJS JSON per schema.\n\n" + edjs_schema if prefer_editorjs else "Return only the translation.\n\n")
                + f"{base_ctx}TEXT:\n{text}\n\n"
                + ("JSON:" if prefer_editorjs else "Translation:")
            )
        if action == 'highlight':
            return (
                f"You extract key information. {('Persona: '+persona+'\n') if persona else ''}"
                "From the text, identify 8-12 important keywords and 2-4 key sentences. "
                "Return strict JSON: {\"keywords\": [..], \"sentences\": [..]} with no extra text.\n\n"
                f"{base_ctx}TEXT:\n{text}\n\nJSON:"
            )
        if action == 'generate':
            return (
                f"You are a helpful writing assistant. {('Persona: '+persona+'\n') if persona else ''}"
                + ("Generate content as structured EditorJS JSON. " if prefer_editorjs else "Generate Markdown content. ")
                + "Be accurate and helpful, avoid making up information.\n\n"
                + (edjs_schema if prefer_editorjs else '')
                + f"Instruction:\n{prompt}\n\n"
                + ("Return only the JSON, no additional text:" if prefer_editorjs else "Generated content:")
            )
        if action == 'template':
            instruction_text = f"Instruction:\n{prompt}\n\n" if prompt else ""
            skeleton_text = ""
            if prefer_editorjs and template_skeleton:
                skeleton_text = f"Use this structure as a guide:\n{json.dumps(template_skeleton)}\n\n"
            
            # Check if this is a recipe template
            is_recipe = (str(template_id or '').lower() in ('recipe_cooking','recipe', 'recipes') or 'recipe' in str(template_id or '').lower())
            
            if is_recipe and prefer_editorjs:
                return (
                    f"You are a recipe creation assistant. {('Persona: '+persona+'\n') if persona else ''}"
                    "Create a complete, detailed recipe following the proper EditorJS structure. Include all necessary information.\n\n"
                    + edjs_schema
                    + instruction_text
                    + skeleton_text
                    + "Create a complete recipe with the following structure:\n"
                    + "- Recipe name as header level 1 with emoji (e.g., '🍽️ [Recipe Name]')\n"
                    + "- 'Recipe Details' as header level 2\n"
                    + "- Two-column layout for timing info (prep time, cook time, total time vs serves, difficulty, category)\n"
                    + "- 'Description' header level 2 with paragraph description\n"
                    + "- 'Ingredients' header level 2 with a table (columns: Ingredient, Quantity, Unit, Notes)\n"
                    + "- 'Equipment Needed' header level 2 with unordered list\n"
                    + "- 'Instructions' header level 2 with ordered list of detailed steps\n"
                    + "- 'Tips & Variations' header level 2 with spoiler blocks for tips and variations\n"
                    + "- Optional 'Nutritional Info' header level 2 with nutrition table\n"
                    + "- 'My Notes' header level 2 with paragraph for personal notes\n"
                    + "- 'Rating & Review' header level 2 with rating paragraph\n\n"
                    + "Use appropriate block types (table for ingredients, spoiler for tips, columns for layout).\n"
                    + "Return only the JSON, no additional text:"
                )
            else:
                return (
                    f"You are a note-structuring assistant. {('Persona: '+persona+'\n') if persona else ''}"
                    + ("Create a well-structured note using EditorJS JSON format. " if prefer_editorjs else "Produce Markdown with sections/headers/lists. ")
                    + "Be accurate and helpful, avoid making up information.\n\n"
                    + edjs_schema
                    + instruction_text
                    + skeleton_text
                    + ("Return only the JSON, no additional text:" if prefer_editorjs else "Generated content:")
                )
        return ''

    # Optionally fetch agent to provide persona and (future) context; do not hard-fail on absence
    agent_cfg = agents_manager.get_agent(agent_name) if (agents_manager and agent_name) else None

    # Choose model - prefer larger models for recipes
    model_name = os.getenv('COMPOSE_MODEL') or os.getenv('AGENT_MODEL') or 'llama3.2:1b'
    
    # Use a larger model specifically for recipe templates if available
    if action == 'template' and (str(template_id or '').lower() in ('recipe_cooking','recipe', 'recipes') or 'recipe' in str(template_id or '').lower()):
        recipe_model = os.getenv('RECIPE_MODEL') or model_name
        model_name = recipe_model
    
    # Validate that the model exists in Ollama
    try:
        models_response = requests.get("http://127.0.0.1:11434/api/tags", timeout=10)
        if models_response.ok:
            available_models = [m.get('name', '') for m in models_response.json().get('models', [])]
            if model_name not in available_models:
                logger.warning(f"Model {model_name} not found. Available models: {available_models}")
                # Fallback to first available model
                if available_models:
                    model_name = available_models[0]
                    logger.info(f"Using fallback model: {model_name}")
                else:
                    return jsonify({'error': 'no_models', 'message': 'No models available in Ollama'}), 500
    except Exception as e:
        logger.warning(f"Could not check available models: {e}. Proceeding with {model_name}")
    
    logger.info(f"Using model: {model_name} for action: {action}")
    try:
        # Avoid oversized payloads
        try:
            max_chars = int(os.getenv('COMPOSE_MAX_CHARS', '8000'))
        except Exception:
            max_chars = 8000
        if text and len(text) > max_chars:
            text = text[:max_chars]
        if prompt and len(prompt) > max_chars:
            prompt = prompt[:max_chars]

        full_prompt = build_compose_prompt(agent_cfg)
        # Use direct Ollama API call instead of relying on agents_manager
        # Temperature lower for deterministic edits
        temp = 0.2
        # Increase tokens for template generation, especially recipes
        if action == 'template':
            # Check if this is a recipe template and give even more tokens
            is_recipe = (str(template_id or '').lower() in ('recipe_cooking','recipe', 'recipes') or 'recipe' in str(template_id or '').lower())
            # Allow environment variable override for recipe token limits
            recipe_tokens = int(os.getenv('RECIPE_MAX_TOKENS', '2000'))
            template_tokens = int(os.getenv('TEMPLATE_MAX_TOKENS', '1500'))
            max_toks = recipe_tokens if is_recipe else template_tokens
        elif action in ('generate', 'expand'):
            max_toks = int(os.getenv('GENERATE_MAX_TOKENS', '1200'))  # More tokens for content generation
        else:
            max_toks = int(os.getenv('COMPOSE_MAX_TOKENS', '800'))   # Standard for other actions
        
        # Call Ollama directly
        try:
            logger.info(f"Calling Ollama with model: {model_name}, action: {action}, max_tokens: {max_toks}")
            response = requests.post(
                "http://127.0.0.1:11434/api/generate",
                json={
                    "model": model_name,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {
                        "temperature": temp,
                        "num_predict": max_toks
                    }
                },
                timeout=120  # Longer timeout for template generation
            )
            
            if response.ok:
                response_text = response.json().get("response", "").strip()
                logger.info(f"Received response from Ollama: {len(response_text)} characters")
            else:
                logger.error(f"Ollama API error: {response.status_code} - {response.text}")
                return jsonify({'error': 'llm_service_error', 'message': f'LLM service returned error: {response.status_code}'}), 500
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to connect to Ollama: {e}")
            return jsonify({'error': 'llm_connection_error', 'message': 'Cannot connect to LLM service. Please check if Ollama is running.'}), 500
        
        # Check if we got a valid response
        if not response_text:
            logger.error("Empty response from LLM service")
            return jsonify({'error': 'empty_response', 'message': 'LLM service returned empty response'}), 500

        # If structured EditorJS was requested, attempt to parse JSON blocks
        if prefer_editorjs and action in ('generate','template','format','simplify','expand','improve','translate'):
            logger.info(f"Processing EditorJS response for action: {action}")
            try:
                # Clean and extract JSON from response
                response_clean = response_text.strip()
                logger.debug(f"Original response length: {len(response_text)}")
                
                # Remove common markdown code block wrapping
                if response_clean.startswith('```json'):
                    response_clean = response_clean[7:]
                if response_clean.startswith('```'):
                    response_clean = response_clean[3:]
                if response_clean.endswith('```'):
                    response_clean = response_clean[:-3]
                
                # Remove any text before the first { and after the last }
                start = response_clean.find('{')
                end = response_clean.rfind('}')
                if start != -1 and end != -1 and end > start:
                    candidate = response_clean[start:end+1]
                else:
                    candidate = response_clean
                
                logger.debug(f"JSON candidate length: {len(candidate)}")
                
                # Clean up common JSON formatting issues
                candidate = candidate.strip()
                # Remove trailing commas before closing brackets/braces
                candidate = re.sub(r',(\s*[}\]])', r'\1', candidate)
                # Remove extra spaces before closing brackets/braces
                candidate = re.sub(r'\s+([}\]])', r'\1', candidate)
                # Fix common bracket/brace mismatches by ensuring proper closure
                candidate = re.sub(r'\s+\}+\s*\}', '}', candidate)
                # Fix the specific issue you encountered: "} }}" pattern
                candidate = re.sub(r'\}\s*\}\s*\}', '}', candidate)
                # Remove any trailing incomplete JSON
                candidate = re.sub(r'\}\s*[^}\]]*$', '}', candidate)
                
                # Try to parse JSON
                data_json = json.loads(candidate)
                blocks = data_json.get('blocks')
                
                logger.info(f"Successfully parsed JSON with {len(blocks) if isinstance(blocks, list) else 0} blocks")
                
                if isinstance(blocks, list) and blocks:
                    # Sanitize and validate blocks - comprehensive EditorJS support
                    allowed_types = {
                        'header', 'paragraph', 'list', 'checklist', 'table', 'code', 'quote', 
                        'delimiter', 'raw', 'embed', 'image', 'columns', 'annotation', 'spoiler'
                    }
                    safe_blocks = []
                    
                    for b in blocks:
                        if not isinstance(b, dict):
                            continue
                            
                        block_type = (b.get('type') or '').lower()
                        block_data = b.get('data') or {}
                        
                        if block_type in allowed_types and isinstance(block_data, dict):
                            # Validation for specific block types
                            if block_type == 'header':
                                if 'text' in block_data and block_data['text']:
                                    level = block_data.get('level', 1)
                                    if isinstance(level, int) and 1 <= level <= 6:
                                        safe_blocks.append({
                                            'type': block_type, 
                                            'data': {
                                                'text': str(block_data['text']),
                                                'level': level
                                            }
                                        })
                            elif block_type == 'paragraph':
                                if 'text' in block_data and block_data['text']:
                                    safe_blocks.append({
                                        'type': block_type, 
                                        'data': {'text': str(block_data['text'])}
                                    })
                            elif block_type == 'list':
                                items = block_data.get('items', [])
                                if isinstance(items, list) and items:
                                    style = block_data.get('style', 'unordered')
                                    if style in ['unordered', 'ordered']:
                                        clean_items = [str(item).strip() for item in items if str(item).strip()]
                                        if clean_items:
                                            safe_blocks.append({
                                                'type': block_type, 
                                                'data': {
                                                    'style': style,
                                                    'items': clean_items
                                                }
                                            })
                            elif block_type == 'checklist':
                                items = block_data.get('items', [])
                                if isinstance(items, list) and items:
                                    clean_items = []
                                    for item in items:
                                        if isinstance(item, dict) and 'text' in item:
                                            clean_items.append({
                                                'text': str(item['text']).strip(),
                                                'checked': bool(item.get('checked', False))
                                            })
                                        elif isinstance(item, str):
                                            clean_items.append({
                                                'text': str(item).strip(),
                                                'checked': False
                                            })
                                    if clean_items:
                                        safe_blocks.append({
                                            'type': block_type,
                                            'data': {'items': clean_items}
                                        })
                            elif block_type == 'table':
                                content = block_data.get('content')
                                if isinstance(content, list) and content:
                                    # Validate table structure
                                    valid_table = True
                                    for row in content:
                                        if not isinstance(row, list):
                                            valid_table = False
                                            break
                                    if valid_table:
                                        safe_blocks.append({
                                            'type': block_type, 
                                            'data': {
                                                'withHeadings': bool(block_data.get('withHeadings', False)),
                                                'content': content
                                            }
                                        })
                            elif block_type == 'code':
                                if 'code' in block_data:
                                    safe_blocks.append({
                                        'type': block_type,
                                        'data': {'code': str(block_data['code'])}
                                    })
                            elif block_type == 'quote':
                                if 'text' in block_data and block_data['text']:
                                    quote_data = {'text': str(block_data['text'])}
                                    if 'caption' in block_data:
                                        quote_data['caption'] = str(block_data['caption'])
                                    if 'alignment' in block_data and block_data['alignment'] in ['left', 'center']:
                                        quote_data['alignment'] = str(block_data['alignment'])
                                    safe_blocks.append({
                                        'type': block_type,
                                        'data': quote_data
                                    })
                            elif block_type == 'raw':
                                if 'html' in block_data:
                                    # Basic HTML sanitization - remove script tags and dangerous attributes
                                    html_content = str(block_data['html'])
                                    # Remove script tags completely
                                    html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
                                    # Remove dangerous event handlers
                                    html_content = re.sub(r'\s*on\w+\s*=\s*["\'][^"\']*["\']', '', html_content, flags=re.IGNORECASE)
                                    safe_blocks.append({
                                        'type': block_type,
                                        'data': {'html': html_content}
                                    })
                            elif block_type == 'embed':
                                required_fields = ['service', 'source']
                                if all(field in block_data for field in required_fields):
                                    embed_data = {
                                        'service': str(block_data['service']),
                                        'source': str(block_data['source'])
                                    }
                                    # Optional fields
                                    for field in ['embed', 'width', 'height', 'caption']:
                                        if field in block_data:
                                            if field in ['width', 'height']:
                                                try:
                                                    embed_data[field] = int(block_data[field])
                                                except (ValueError, TypeError):
                                                    pass
                                            else:
                                                embed_data[field] = str(block_data[field])
                                    safe_blocks.append({
                                        'type': block_type,
                                        'data': embed_data
                                    })
                            elif block_type == 'image':
                                if 'url' in block_data:
                                    image_data = {'url': str(block_data['url'])}
                                    # Optional fields
                                    for field in ['caption']:
                                        if field in block_data:
                                            image_data[field] = str(block_data[field])
                                    for field in ['withBorder', 'withBackground', 'stretched']:
                                        if field in block_data:
                                            image_data[field] = bool(block_data[field])
                                    safe_blocks.append({
                                        'type': block_type,
                                        'data': image_data
                                    })
                            elif block_type == 'columns':
                                cols = block_data.get('cols', [])
                                if isinstance(cols, list) and cols:
                                    # Validate and sanitize nested blocks in columns
                                    safe_cols = []
                                    for col in cols:
                                        if isinstance(col, dict) and 'blocks' in col:
                                            col_blocks = col['blocks']
                                            if isinstance(col_blocks, list):
                                                # Recursively validate nested blocks (simplified)
                                                safe_col_blocks = []
                                                for nested_block in col_blocks:
                                                    if isinstance(nested_block, dict):
                                                        nested_type = (nested_block.get('type') or '').lower()
                                                        nested_data = nested_block.get('data') or {}
                                                        # Only allow safe nested block types
                                                        if nested_type in ['paragraph', 'header', 'list']:
                                                            safe_col_blocks.append(nested_block)
                                                if safe_col_blocks:
                                                    safe_cols.append({'blocks': safe_col_blocks})
                                    if safe_cols:
                                        safe_blocks.append({
                                            'type': block_type,
                                            'data': {'cols': safe_cols}
                                        })
                            elif block_type == 'annotation':
                                if 'text' in block_data and block_data['text']:
                                    annotation_data = {'text': str(block_data['text'])}
                                    if 'title' in block_data:
                                        annotation_data['title'] = str(block_data['title'])
                                    safe_blocks.append({
                                        'type': block_type,
                                        'data': annotation_data
                                    })
                            elif block_type == 'spoiler':
                                if 'title' in block_data and 'content' in block_data:
                                    spoiler_data = {
                                        'title': str(block_data['title']),
                                        'content': str(block_data['content'])
                                    }
                                    safe_blocks.append({
                                        'type': block_type,
                                        'data': spoiler_data
                                    })
                            elif block_type == 'delimiter':
                                # Delimiter doesn't need data validation
                                safe_blocks.append({'type': block_type, 'data': {}})
                    
                    if safe_blocks:
                        logger.info(f"Successfully parsed {len(safe_blocks)} EditorJS blocks")
                        return jsonify({ 'blocks': safe_blocks })
                    else:
                        logger.warning("No valid blocks found after sanitization")
                else:
                    logger.warning("No blocks array found in JSON response")
                        
            except json.JSONDecodeError as je:
                logger.warning(f"EditorJS JSON parse failed: {je}")
                logger.debug(f"Failed to parse JSON: {candidate[:1000]}...")
                # Try one more time with additional cleaning
                try:
                    # More aggressive cleaning for malformed JSON
                    cleaned = candidate
                    # Fix multiple closing braces
                    cleaned = re.sub(r'\}\s*\}\s*\}', '}', cleaned)
                    # Fix spacing issues in arrays/objects
                    cleaned = re.sub(r'(\w+)\s*:\s*([{\[])', r'\1:\2', cleaned)
                    # Fix missing closing brackets in complex structures
                    # Count opening and closing braces/brackets
                    open_braces = cleaned.count('{')
                    close_braces = cleaned.count('}')
                    open_brackets = cleaned.count('[')
                    close_brackets = cleaned.count(']')
                    
                    # Add missing closing braces
                    if open_braces > close_braces:
                        cleaned += '}' * (open_braces - close_braces)
                    
                    # Add missing closing brackets  
                    if open_brackets > close_brackets:
                        cleaned += ']' * (open_brackets - close_brackets)
                    
                    # Try parsing again
                    data_json = json.loads(cleaned)
                    blocks = data_json.get('blocks')
                    if isinstance(blocks, list) and blocks:
                        logger.info(f"Successfully parsed JSON on second attempt with {len(blocks)} blocks")
                        # Continue with block validation below
                        safe_blocks = []
                        allowed_types = {
                            'header', 'paragraph', 'list', 'checklist', 'table', 'code', 'quote', 
                            'delimiter', 'raw', 'embed', 'image', 'columns', 'annotation', 'spoiler'
                        }
                        # Re-run validation logic here too (simplified)
                        for b in blocks:
                            if isinstance(b, dict):
                                block_type = (b.get('type') or '').lower()
                                if block_type in allowed_types:
                                    safe_blocks.append(b)
                        if safe_blocks:
                            logger.info(f"Returning {len(safe_blocks)} validated blocks from second attempt")
                            return jsonify({ 'blocks': safe_blocks })
                except Exception as e2:
                    logger.debug(f"Second JSON parse attempt also failed: {e2}")
            except Exception as e:
                logger.warning(f"EditorJS processing failed: {e}")
                
            # Enhanced fallback: try to convert response to simple blocks
            logger.info("Attempting enhanced fallback conversion to EditorJS blocks")
            try:
                # First, try to extract structured content from the text response
                # Look for recipe-like patterns or structured content
                fallback_blocks = []
                
                # If this is a recipe template and we have structured-looking content
                is_recipe_template = action == 'template' and (str(template_id or '').lower() in ('recipe_cooking','recipe', 'recipes') or 'recipe' in str(template_id or '').lower())
                
                if is_recipe_template:
                    logger.info("Attempting recipe-specific content extraction")
                    # Try to parse recipe content from text
                    recipe_blocks = extract_recipe_from_text(response_text)
                    if recipe_blocks:
                        logger.info(f"Successfully extracted recipe with {len(recipe_blocks)} blocks")
                        return jsonify({ 'blocks': recipe_blocks })
                
                # For other templates, try to extract structured content
                elif action == 'template':
                    logger.info("Attempting template-specific content extraction")
                    template_blocks = extract_template_from_text(response_text, template_id)
                    if template_blocks:
                        logger.info(f"Successfully extracted template with {len(template_blocks)} blocks")
                        return jsonify({ 'blocks': template_blocks })
                
                # General markdown-to-blocks conversion
                lines = response_text.strip().split('\n')
                current_list_items = []
                current_list_style = None
                
                for line in lines:
                    line = line.strip()
                    if not line:
                        # Finish any current list and continue
                        if current_list_items:
                            fallback_blocks.append({
                                'type': 'list',
                                'data': {'style': current_list_style, 'items': current_list_items}
                            })
                            current_list_items = []
                            current_list_style = None
                        continue
                        
                    # Check for headers
                    if line.startswith('#'):
                        # Finish any current list
                        if current_list_items:
                            fallback_blocks.append({
                                'type': 'list',
                                'data': {'style': current_list_style, 'items': current_list_items}
                            })
                            current_list_items = []
                            current_list_style = None
                            
                        level = min(len(line) - len(line.lstrip('#')), 6)
                        text = line.lstrip('#').strip()
                        if text:
                            fallback_blocks.append({
                                'type': 'header',
                                'data': {'text': text, 'level': max(1, level)}
                            })
                    # Check for list items
                    elif line.startswith('- ') or line.startswith('* '):
                        item_text = line[2:].strip()
                        if item_text:
                            if current_list_style != 'unordered':
                                # Finish previous list if different style
                                if current_list_items:
                                    fallback_blocks.append({
                                        'type': 'list',
                                        'data': {'style': current_list_style, 'items': current_list_items}
                                    })
                                current_list_items = []
                                current_list_style = 'unordered'
                            current_list_items.append(item_text)
                    elif re.match(r'^\d+\.\s', line):
                        item_text = re.sub(r'^\d+\.\s*', '', line).strip()
                        if item_text:
                            if current_list_style != 'ordered':
                                # Finish previous list if different style
                                if current_list_items:
                                    fallback_blocks.append({
                                        'type': 'list',
                                        'data': {'style': current_list_style, 'items': current_list_items}
                                    })
                                current_list_items = []
                                current_list_style = 'ordered'
                            current_list_items.append(item_text)
                    # Check for checklist items
                    elif line.startswith('- [ ] ') or line.startswith('- [x] ') or line.startswith('- [X] '):
                        # Finish any current list
                        if current_list_items:
                            fallback_blocks.append({
                                'type': 'list',
                                'data': {'style': current_list_style, 'items': current_list_items}
                            })
                            current_list_items = []
                            current_list_style = None
                            
                        checked = line.startswith('- [x] ') or line.startswith('- [X] ')
                        item_text = line[6:].strip()
                        if item_text:
                            fallback_blocks.append({
                                'type': 'checklist',
                                'data': {'items': [{'text': item_text, 'checked': checked}]}
                            })
                    # Check for quotes
                    elif line.startswith('> '):
                        # Finish any current list
                        if current_list_items:
                            fallback_blocks.append({
                                'type': 'list',
                                'data': {'style': current_list_style, 'items': current_list_items}
                            })
                            current_list_items = []
                            current_list_style = None
                            
                        quote_text = line[2:].strip()
                        if quote_text:
                            fallback_blocks.append({
                                'type': 'quote',
                                'data': {'text': quote_text, 'alignment': 'left'}
                            })
                    # Check for code blocks
                    elif line.startswith('```'):
                        # Finish any current list
                        if current_list_items:
                            fallback_blocks.append({
                                'type': 'list',
                                'data': {'style': current_list_style, 'items': current_list_items}
                            })
                            current_list_items = []
                            current_list_style = None
                            
                        # Simple code block detection (single line for fallback)
                        code_content = line[3:].strip()
                        if code_content:
                            fallback_blocks.append({
                                'type': 'code',
                                'data': {'code': code_content}
                            })
                    # Check for horizontal rules/delimiters
                    elif line in ['---', '***', '___'] or re.match(r'^-{3,}$|^\*{3,}$|^_{3,}$', line):
                        # Finish any current list
                        if current_list_items:
                            fallback_blocks.append({
                                'type': 'list',
                                'data': {'style': current_list_style, 'items': current_list_items}
                            })
                            current_list_items = []
                            current_list_style = None
                            
                        fallback_blocks.append({
                            'type': 'delimiter',
                            'data': {}
                        })
                    else:
                        # Finish any current list
                        if current_list_items:
                            fallback_blocks.append({
                                'type': 'list',
                                'data': {'style': current_list_style, 'items': current_list_items}
                            })
                            current_list_items = []
                            current_list_style = None
                            
                        # Convert to paragraph
                        fallback_blocks.append({
                            'type': 'paragraph',
                            'data': {'text': line}
                        })
                
                # Finish any remaining list
                if current_list_items:
                    fallback_blocks.append({
                        'type': 'list',
                        'data': {'style': current_list_style, 'items': current_list_items}
                    })
                
                if fallback_blocks:
                    logger.info(f"Enhanced fallback conversion created {len(fallback_blocks)} blocks")
                    return jsonify({ 'blocks': fallback_blocks })
                    
            except Exception as fe:
                logger.warning(f"Enhanced fallback conversion failed: {fe}")

        if action == 'highlight':
            # Try parse JSON
            try:
                parsed = json.loads(response_text)
                keywords = parsed.get('keywords') or []
                sentences = parsed.get('sentences') or []
                return jsonify({ 'highlights': { 'keywords': keywords, 'sentences': sentences } })
            except Exception:
                # Fallback: naive keyword split by commas/lines
                kws = []
                for line in response_text.splitlines():
                    kws.extend([x.strip() for x in line.split(',') if x.strip()])
                return jsonify({ 'highlights': { 'keywords': kws[:12], 'sentences': [] } })

        # Final fallback: return as plain text
        logger.info(f"Falling back to plain text response for action: {action}")
        return jsonify({ 'result_text': response_text })
    except Exception as e:
        logger.error(f"Compose action failed: {e}")
        return jsonify({ 'error': 'compose_failed' }), 500
    finally:
        try:
            app.compose_semaphore.release()
        except Exception:
            pass

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
            
            # Create uploads directory if it doesn't exist
            uploads_dir = os.path.join('data', 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            
            # Generate a unique filename to avoid conflicts
            timestamp = str(int(time.time() * 1000))
            base_name, ext = os.path.splitext(file.filename)
            safe_filename = f"{timestamp}_{base_name}{ext}"
            permanent_path = os.path.join(uploads_dir, safe_filename)
            
            # Save the file permanently for serving
            file.save(permanent_path)
            
            # Also create a temporary copy for processing (in case the RAG system modifies it)
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
                temp_path = temp_file.name
                temp_files.append(temp_path)
                # Copy the permanent file to temp for processing
                import shutil
                shutil.copy2(permanent_path, temp_path)
            
            try:
                # Add document to RAG system using temp file for processing
                # but store the permanent path for serving
                result = rag_manager.add_document_from_file(chat_id, temp_path, file.filename, permanent_path)
                results.append(result)
                
                if result["status"] == "success":
                    successful_uploads += 1
                else:
                    failed_uploads += 1
                    # If failed, clean up the permanent file
                    if os.path.exists(permanent_path):
                        os.unlink(permanent_path)
                    
            except Exception as e:
                failed_uploads += 1
                # Clean up the permanent file on error
                if os.path.exists(permanent_path):
                    os.unlink(permanent_path)
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
    model_name = data.get('model', None)  # Get selected model
    
    if not chat_id:
        return jsonify({"error": "chat_id is required"}), 400
    
    if not message:
        return jsonify({"error": "message is required"}), 400
    
    if use_stream:
        def generate():
            try:
                bot_response = ""
                for chunk in rag_manager.get_rag_response_stream(chat_id, message, k, model_name):
                    if chunk:
                        bot_response += chunk
                        yield f"data: {json.dumps({'token': chunk})}\n\n"
                # Persist full interaction after stream completes
                try:
                    existing = data_service.get_chat(chat_id)
                    messages = []
                    if existing and isinstance(existing, dict):
                        content = existing.get('content') or {}
                        messages = content.get('messages') or []
                    from datetime import datetime
                    now = datetime.utcnow().isoformat()
                    messages = list(messages) if isinstance(messages, list) else []
                    messages.append({'text': message, 'sender': 'user', 'timestamp': now})
                    messages.append({'text': bot_response, 'sender': 'bot', 'timestamp': now})
                    data_service.save_chat(chat_id, messages)
                except Exception as persist_err:
                    logger.warning(f"Failed to persist streamed RAG chat for {chat_id}: {persist_err}")
                
                yield f"data: {json.dumps({'done': True})}\n\n"
                            
            except Exception as e:
                logger.error(f"Error in streaming RAG chat: {e}")
                yield f"data: {json.dumps({'error': 'Error processing your request.'})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
    else:
        try:
            response = rag_manager.get_rag_response(chat_id, message, k, model_name)
            # Persist full interaction
            try:
                existing = data_service.get_chat(chat_id)
                messages = []
                if existing and isinstance(existing, dict):
                    content = existing.get('content') or {}
                    messages = content.get('messages') or []
                from datetime import datetime
                now = datetime.utcnow().isoformat()
                messages = list(messages) if isinstance(messages, list) else []
                messages.append({'text': message, 'sender': 'user', 'timestamp': now})
                messages.append({'text': response, 'sender': 'bot', 'timestamp': now})
                data_service.save_chat(chat_id, messages)
            except Exception as persist_err:
                logger.warning(f"Failed to persist RAG chat for {chat_id}: {persist_err}")
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

@app.route('/api/rag/debug/<chat_id>', methods=['GET'])
def debug_rag_documents(chat_id):
    """Debug endpoint to inspect RAG documents and metadata."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    try:
        # Get first few documents to inspect metadata
        debug_info = rag_manager.debug_documents(chat_id)
        return jsonify(debug_info)
    except Exception as e:
        return jsonify({
            "error": f"Debug error: {str(e)}"
        }), 500

@app.route('/api/rag/document-content/<chat_id>/<filename>', methods=['GET'])
def get_document_content(chat_id, filename):
    """Get the content of a specific document for preview."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    try:
        # Get document content from RAG manager
        content = rag_manager.get_document_content(chat_id, filename)
        if content is not None:
            # For PDF files, return both content and metadata
            file_ext = filename.lower().split('.')[-1] if '.' in filename else ''
            
            if file_ext == 'pdf':
                # For PDFs, don't truncate as much since we want to preserve structure
                max_preview_length = 50 * 1024  # 50KB for PDFs
            else:
                max_preview_length = 10 * 1024  # 10KB for other files
            
            truncated = len(content) > max_preview_length
            if truncated:
                content = content[:max_preview_length] + "\n\n... (content truncated for preview) ..."
            
            return jsonify({
                "status": "success", 
                "content": content,
                "truncated": truncated,
                "file_type": file_ext,
                "filename": filename
            }), 200
        else:
            return jsonify({"error": "Document not found or content not available"}), 404
            
    except Exception as e:
        logger.error(f"Error getting document content: {e}")
        return jsonify({"error": "Failed to get document content"}), 500

def _serve_converted_document(file_path, filename):
    """Convert DOC/DOCX files to PDF for native viewing."""
    try:
        import tempfile
        import os
        import subprocess
        from flask import Response, send_file
        
        # Create a cache directory for converted files
        cache_dir = os.path.join('data', 'document_cache')
        os.makedirs(cache_dir, exist_ok=True)
        
        # Generate cache filename (PDF)
        base_name = os.path.splitext(filename)[0]
        cache_file = os.path.join(cache_dir, f"{base_name}.pdf")
        
        # Check if cached version exists and is newer than source
        if os.path.exists(cache_file) and os.path.getmtime(cache_file) > os.path.getmtime(file_path):
            return send_file(cache_file, mimetype='application/pdf')
        
        # Convert to PDF using LibreOffice
        pdf_path = _convert_to_pdf_with_libreoffice(file_path, cache_dir)
        
        if pdf_path and os.path.exists(pdf_path):
            # Move to cache location if needed
            if pdf_path != cache_file:
                import shutil
                shutil.move(pdf_path, cache_file)
            
            return send_file(cache_file, mimetype='application/pdf')
        else:
            # Fallback to text content if conversion fails
            logger.warning(f"PDF conversion failed for {filename}, falling back to text extraction")
            return jsonify({"error": "Document conversion failed", "fallback": True}), 422
        
    except Exception as e:
        logger.error(f"Error converting document {filename}: {e}")
        # Fallback: return error for client to handle
        return jsonify({"error": "Document conversion failed", "fallback": True}), 422

def _docx_to_html(doc, filename):
    """Convert a DOCX document to HTML format."""
    html_parts = [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<meta charset="UTF-8">',
        f'<title>{filename}</title>',
        '<style>',
        'body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }',
        'h1, h2, h3, h4, h5, h6 { color: #333; margin-top: 20px; }',
        'p { margin-bottom: 10px; }',
        '.document-title { text-align: center; color: #666; margin-bottom: 30px; }',
        'table { border-collapse: collapse; width: 100%; margin: 10px 0; }',
        'td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }',
        'th { background-color: #f2f2f2; }',
        '.bold { font-weight: bold; }',
        '.italic { font-style: italic; }',
        '</style>',
        '</head>',
        '<body>',
        f'<h1 class="document-title">{filename}</h1>'
    ]
    
    for paragraph in doc.paragraphs:
        if paragraph.text.strip():
            # Check if this looks like a heading
            if len(paragraph.text) < 100 and paragraph.text.strip().endswith((':',)) == False:
                # Simple heading detection
                if paragraph.style.name.startswith('Heading'):
                    level = paragraph.style.name.replace('Heading ', '')
                    try:
                        level = int(level)
                        level = min(level, 6)  # HTML only supports h1-h6
                    except:
                        level = 2
                    html_parts.append(f'<h{level}>{paragraph.text.strip()}</h{level}>')
                else:
                    html_parts.append(f'<p>{paragraph.text.strip()}</p>')
            else:
                html_parts.append(f'<p>{paragraph.text.strip()}</p>')
    
    # Add tables if any
    for table in doc.tables:
        html_parts.append('<table>')
        for row in table.rows:
            html_parts.append('<tr>')
            for cell in row.cells:
                html_parts.append(f'<td>{cell.text.strip()}</td>')
            html_parts.append('</tr>')
        html_parts.append('</table>')
    
    html_parts.extend(['</body>', '</html>'])
    return '\n'.join(html_parts)

def _convert_to_pdf_with_libreoffice(file_path, output_dir):
    """Convert DOC/DOCX files to PDF using LibreOffice headless mode."""
    try:
        import subprocess
        import os
        
        # LibreOffice command to convert to PDF
        cmd = [
            '/opt/libreoffice24.8/program/soffice',
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', output_dir,
            file_path
        ]
        
        logger.info(f"Converting {file_path} to PDF using LibreOffice")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            # Find the generated PDF file
            base_name = os.path.splitext(os.path.basename(file_path))[0]
            pdf_file = os.path.join(output_dir, f"{base_name}.pdf")
            
            if os.path.exists(pdf_file):
                logger.info(f"Successfully converted {file_path} to PDF")
                return pdf_file
            else:
                logger.error(f"PDF file not found after conversion: {pdf_file}")
        else:
            logger.error(f"LibreOffice conversion failed: {result.stderr}")
            
    except subprocess.TimeoutExpired:
        logger.error(f"LibreOffice conversion timeout for {file_path}")
    except Exception as e:
        logger.error(f"Error with LibreOffice PDF conversion: {e}")
    
    return None

def _convert_doc_with_libreoffice(file_path, filename):
    """Convert DOC files using LibreOffice headless mode."""
    try:
        import subprocess
        import tempfile
        import os
        
        # Create temporary directory for conversion
        with tempfile.TemporaryDirectory() as temp_dir:
            # LibreOffice command to convert to HTML
            cmd = [
                '/opt/libreoffice24.8/program/soffice',
                '--headless',
                '--convert-to', 'html',
                '--outdir', temp_dir,
                file_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                # Find the generated HTML file
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                html_file = os.path.join(temp_dir, f"{base_name}.html")
                
                if os.path.exists(html_file):
                    with open(html_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Clean up the HTML and add our styling
                    return _enhance_libreoffice_html(content, filename)
            
            logger.warning(f"LibreOffice conversion failed: {result.stderr}")
            
    except Exception as e:
        logger.error(f"Error with LibreOffice conversion: {e}")
    
    # Fallback: create a simple HTML wrapper
    return f'''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>{filename}</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }}
            .error {{ color: #666; text-align: center; padding: 20px; }}
        </style>
    </head>
    <body>
        <div class="error">
            <h2>Document Conversion</h2>
            <p>Unable to display the original formatting for this document.</p>
            <p>Please download the file to view it in its native application.</p>
        </div>
    </body>
    </html>
    '''

def _enhance_libreoffice_html(content, filename):
    """Clean up and enhance LibreOffice-generated HTML."""
    # Simple enhancement - add better styling
    enhanced_content = content.replace(
        '<body>',
        f'''<body>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }}
            h1, h2, h3, h4, h5, h6 {{ color: #333; margin-top: 20px; }}
            p {{ margin-bottom: 10px; }}
            .document-title {{ text-align: center; color: #666; margin-bottom: 30px; }}
            table {{ border-collapse: collapse; width: 100%; margin: 10px 0; }}
            td, th {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
            th {{ background-color: #f2f2f2; }}
        </style>
        <h1 class="document-title">{filename}</h1>'''
    )
    return enhanced_content

def _convert_to_pdf_with_libreoffice(file_path, filename):
    """Convert DOC/DOCX files to PDF using LibreOffice headless mode."""
    try:
        import subprocess
        import tempfile
        import os
        
        logger.info(f"Converting {filename} to PDF using LibreOffice...")
        logger.info(f"Source file path: {file_path}")
        
        # Create temporary directory for conversion
        with tempfile.TemporaryDirectory() as temp_dir:
            # LibreOffice command to convert to PDF
            cmd = [
                '/opt/libreoffice24.8/program/soffice',
                '--headless',
                '--convert-to', 'pdf',
                '--outdir', temp_dir,
                file_path
            ]
            
            logger.info(f"Running command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            logger.info(f"LibreOffice exit code: {result.returncode}")
            logger.info(f"LibreOffice stdout: {result.stdout}")
            logger.info(f"LibreOffice stderr: {result.stderr}")
            
            if result.returncode == 0:
                # Find the generated PDF file
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                pdf_file = os.path.join(temp_dir, f"{base_name}.pdf")
                
                logger.info(f"Looking for PDF file: {pdf_file}")
                if os.path.exists(pdf_file):
                    # Read the PDF content and return it
                    with open(pdf_file, 'rb') as f:
                        pdf_content = f.read()
                    logger.info(f"Successfully converted {filename} to PDF ({len(pdf_content)} bytes)")
                    return pdf_content
                else:
                    logger.warning(f"PDF file was not created: {pdf_file}")
            
            logger.warning(f"LibreOffice PDF conversion failed: {result.stderr}")
            return None
            
    except Exception as e:
        logger.error(f"Error with LibreOffice PDF conversion: {e}")
        return None

@app.route('/api/rag/document-file/<chat_id>/<filename>', methods=['GET'])
def serve_document_file(chat_id, filename):
    """Serve the original document file for direct viewing (e.g., PDFs, converted DOC/DOCX)."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    try:
        # First, try to get the stored file path
        file_path = rag_manager.get_document_file_path(chat_id, filename)
        
        if file_path and os.path.exists(file_path):
            # For DOC/DOCX files, convert to PDF for native viewing
            if filename.lower().endswith(('.doc', '.docx')):
                pdf_content = _convert_to_pdf_with_libreoffice(file_path, filename)
                if pdf_content:
                    return Response(
                        pdf_content,
                        mimetype='application/pdf',
                        headers={'Content-Disposition': f'inline; filename="{os.path.splitext(filename)[0]}.pdf"'}
                    )
                else:
                    logger.warning(f"PDF conversion failed for {filename}, falling back to text extraction")
                    return jsonify({"error": "Document conversion failed"}), 422
            
            # Serve PDF files directly
            return send_file(
                file_path,
                as_attachment=False,
                download_name=filename,
                mimetype='application/pdf' if filename.lower().endswith('.pdf') else None
            )
        
        # If stored path doesn't exist, try to find the file in upload directories
        possible_paths = [
            os.path.join('data', 'uploads', filename),  # New upload location
            os.path.join('uploads', filename),  # Legacy upload directory
            os.path.join('instance', 'uploads', filename),  # Instance uploads
            os.path.join(tempfile.gettempdir(), filename),  # Temp directory
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                # Store this path for future use
                rag_manager._store_file_path(chat_id, filename, path)
                
                # For DOC/DOCX files, convert to HTML for better viewing
                if filename.lower().endswith(('.doc', '.docx')):
                    return _serve_converted_document(path, filename)
                
                return send_file(
                    path,
                    as_attachment=False,
                    download_name=filename,
                    mimetype='application/pdf' if filename.lower().endswith('.pdf') else None
                )
        
        # If no file found, check if we can reconstruct from uploaded files
        if hasattr(rag_manager, 'find_uploaded_file'):
            found_path = rag_manager.find_uploaded_file(filename)
            if found_path:
                # Store this path for future use
                rag_manager._store_file_path(chat_id, filename, found_path)
                
                # For DOC/DOCX files, convert to HTML for better viewing
                if filename.lower().endswith(('.doc', '.docx')):
                    return _serve_converted_document(found_path, filename)
                
                return send_file(
                    found_path,
                    as_attachment=False,
                    download_name=filename,
                    mimetype='application/pdf' if filename.lower().endswith('.pdf') else None
                )
        
        return jsonify({"error": "Original file not found"}), 404
            
    except Exception as e:
        logger.error(f"Error serving document file: {e}")
        return jsonify({"error": "Failed to serve document file"}), 500

# Add a test endpoint to serve sample PDFs for demonstration
@app.route('/api/test/sample-pdf')
def serve_sample_pdf():
    """Serve a sample PDF for testing the PDF viewer."""
    # Create a simple PDF for testing if none exists
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        import io
        
        # Create a simple PDF in memory
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        
        # Add some content
        p.drawString(100, 750, "Sample PDF Document")
        p.drawString(100, 700, "This is a test PDF to demonstrate the PDF viewer functionality.")
        p.drawString(100, 650, "")
        p.drawString(100, 600, "Features:")
        p.drawString(120, 570, "• Native PDF viewing in browser")
        p.drawString(120, 540, "• Original format preservation")
        p.drawString(120, 510, "• Toggle between PDF and text view")
        p.drawString(120, 480, "• Download and external viewing options")
        
        p.showPage()
        p.save()
        
        buffer.seek(0)
        
        return send_file(
            io.BytesIO(buffer.read()),
            mimetype='application/pdf',
            as_attachment=False,
            download_name='sample-document.pdf'
        )
        
    except ImportError:
        # If reportlab is not available, return a simple response
        return jsonify({
            "error": "ReportLab not available for PDF generation",
            "message": "Please upload a real PDF file to test the viewer"
        }), 404

@app.route('/api/rag/analyze-document', methods=['POST'])
def analyze_document():
    """Provide AI-powered document analysis including summaries, key points, and insights."""
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    
    try:
        data = request.get_json()
        chat_id = data.get('chat_id')
        filename = data.get('filename')
        analysis_type = data.get('analysis_type', 'summary')  # summary, key_points, references, insights
        model_name = data.get('model', None)  # Get selected model
        
        if not chat_id or not filename:
            return jsonify({"error": "chat_id and filename are required"}), 400
        
        # Get document content
        content = rag_manager.get_document_content(chat_id, filename)
        if not content:
            return jsonify({"error": "Document not found"}), 404
        
        # Create analysis prompts based on type
        analysis_prompts = {
            'summary': f"""Please provide a comprehensive summary of the document "{filename}". 
                        Include the main topics, key findings, conclusions, and important insights.
                        Structure your response with clear headings and bullet points where appropriate.""",
            
            'key_points': f"""Extract and list the key points from the document "{filename}".
                           Organize them as a bulleted list with clear, concise statements.
                           Focus on the most important information, facts, and takeaways.""",
            
            'references': f"""Identify and extract all references, citations, links, external sources, 
                           names, dates, and important entities mentioned in the document "{filename}".
                           Organize them by category (e.g., People, Organizations, Dates, External References).""",
            
            'insights': f"""Analyze the document "{filename}" and provide insights including:
                        1. Key themes and topics
                        2. Important highlights and takeaways  
                        3. Connections to potential knowledge areas
                        4. Suggestions for expanding research or notes
                        5. Related concepts worth exploring
                        6. Questions that arise from this content"""
        }
        
        prompt = analysis_prompts.get(analysis_type, analysis_prompts['summary'])
        
        # Use RAG to get context-aware response
        full_query = f"{prompt}\n\nDocument content: {content[:8000]}..."  # Limit content for API
        
        try:
            response = rag_manager.get_rag_response(chat_id, full_query, k=3, model_name=model_name)
            
            return jsonify({
                "status": "success",
                "analysis": response,
                "analysis_type": analysis_type,
                "filename": filename
            }), 200
            
        except Exception as e:
            logger.error(f"Error generating analysis: {e}")
            # Fallback to direct LLM if RAG fails
            from langchain_ollama import OllamaLLM
            
            # Use the selected model or fall back to a default from env
            fallback_model = model_name if model_name else os.getenv('RAG_MODEL', 'llama3.2:3b')
            
            llm = OllamaLLM(
                model=fallback_model,
                base_url="http://127.0.0.1:11434"
            )
            
            fallback_prompt = f"{prompt}\n\nBased on this document content:\n{content[:6000]}..."
            response = llm.invoke(fallback_prompt)
            
            return jsonify({
                "status": "success",
                "analysis": response,
                "analysis_type": analysis_type,
                "filename": filename,
                "fallback_used": True
            }), 200
            
    except Exception as e:
        logger.error(f"Error in document analysis: {e}")
        return jsonify({"error": "Failed to analyze document"}), 500

if __name__ == '__main__':
    app.run(debug=True)

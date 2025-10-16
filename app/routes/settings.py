"""
Settings API Routes
Handles reading and updating application configuration
"""

import os
import json
from pathlib import Path
from flask import Blueprint, jsonify, request, current_app
from dotenv import load_dotenv, set_key, find_dotenv

settings_bp = Blueprint('settings', __name__)

# Define which .env variables are safe to edit via UI
SAFE_ENV_VARS = {
    # Model Configuration
    'MODEL_SIZE',
    'COMPOSE_MODEL',
    'AGENT_MODEL',
    'RAG_MODEL',
    'RECIPE_MODEL',
    
    # Token Limits
    'RECIPE_MAX_TOKENS',
    'TEMPLATE_MAX_TOKENS',
    'GENERATE_MAX_TOKENS',
    'COMPOSE_MAX_TOKENS',
    
    # Search Engines
    'BRAVE_API_KEY',
    'SEARXNG_URL',
    'YACY_URL',
    
    # RAG Configuration
    'RAG_EMBEDDING_MODEL',
    'CHAT_AGENT_TOP_K',
    'CHAT_AGENT_MIN_TOP_K',
    'CHAT_AGENT_RELEVANCE_THRESHOLD',
    'CHAT_AGENT_TEMPERATURE',
    'CHAT_AGENT_MAX_TOKENS',
    'CHAT_AGENT_CHUNK_SIZE',
    'CHAT_AGENT_CHUNK_OVERLAP',
}


def get_env_file_path():
    """Get the path to the .env file"""
    env_path = find_dotenv()
    if not env_path:
        # If .env doesn't exist, create it in the project root
        project_root = Path(__file__).parent.parent.parent
        env_path = project_root / '.env'
    return env_path


@settings_bp.route('/api/settings/env', methods=['GET'])
def get_env_settings():
    """
    Get current environment variable settings
    Returns only safe-to-edit variables
    """
    try:
        # Reload environment variables
        load_dotenv(override=True)
        
        settings = {}
        for var in SAFE_ENV_VARS:
            value = os.environ.get(var, '')
            # Mask sensitive values (API keys)
            if 'API_KEY' in var and value:
                settings[var] = '••••••••' + value[-4:] if len(value) > 4 else '••••'
            else:
                settings[var] = value
        
        return jsonify(settings), 200
    
    except Exception as e:
        current_app.logger.error(f"Error reading env settings: {str(e)}")
        return jsonify({'error': 'Failed to read settings', 'message': str(e)}), 500


@settings_bp.route('/api/settings/env', methods=['POST'])
def update_env_settings():
    """
    Update environment variable settings
    Only updates safe-to-edit variables
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        env_path = get_env_file_path()
        
        # Validate that we only update safe variables
        updates = {}
        for key, value in data.items():
            if key in SAFE_ENV_VARS:
                # Skip masked API keys (not changed)
                if 'API_KEY' in key and value.startswith('••••'):
                    continue
                updates[key] = str(value)
            else:
                current_app.logger.warning(f"Attempted to update unsafe variable: {key}")
        
        if not updates:
            return jsonify({'message': 'No valid updates provided'}), 200
        
        # Validate values before writing
        validation_errors = validate_env_values(updates)
        if validation_errors:
            return jsonify({
                'error': 'Validation failed',
                'errors': validation_errors
            }), 400
        
        # Update .env file
        for key, value in updates.items():
            set_key(env_path, key, value)
        
        # Reload environment
        load_dotenv(env_path, override=True)
        
        current_app.logger.info(f"Updated {len(updates)} environment variables")
        
        return jsonify({
            'message': 'Settings updated successfully',
            'updated': list(updates.keys()),
            'note': 'Restart the application for changes to take effect'
        }), 200
    
    except Exception as e:
        current_app.logger.error(f"Error updating env settings: {str(e)}")
        return jsonify({'error': 'Failed to update settings', 'message': str(e)}), 500


def validate_env_values(updates):
    """
    Validate environment variable values
    Returns list of error messages, empty if all valid
    """
    errors = []
    
    for key, value in updates.items():
        # Validate token limits
        if 'MAX_TOKENS' in key:
            try:
                tokens = int(value)
                if tokens < 100 or tokens > 10000:
                    errors.append(f"{key}: Must be between 100 and 10000")
            except ValueError:
                errors.append(f"{key}: Must be a valid number")
        
        # Validate URLs
        elif 'URL' in key and value:
            if not (value.startswith('http://') or value.startswith('https://')):
                errors.append(f"{key}: Must be a valid URL starting with http:// or https://")
        
        # Validate numeric ranges
        elif key == 'CHAT_AGENT_TOP_K':
            try:
                val = int(value)
                if val < 1 or val > 20:
                    errors.append(f"{key}: Must be between 1 and 20")
            except ValueError:
                errors.append(f"{key}: Must be a valid number")
        
        elif key == 'CHAT_AGENT_MIN_TOP_K':
            try:
                val = int(value)
                if val < 1 or val > 10:
                    errors.append(f"{key}: Must be between 1 and 10")
            except ValueError:
                errors.append(f"{key}: Must be a valid number")
        
        elif key in ['CHAT_AGENT_RELEVANCE_THRESHOLD', 'CHAT_AGENT_TEMPERATURE']:
            try:
                val = float(value)
                if key == 'CHAT_AGENT_RELEVANCE_THRESHOLD' and (val < 0 or val > 1):
                    errors.append(f"{key}: Must be between 0.0 and 1.0")
                elif key == 'CHAT_AGENT_TEMPERATURE' and (val < 0 or val > 2):
                    errors.append(f"{key}: Must be between 0.0 and 2.0")
            except ValueError:
                errors.append(f"{key}: Must be a valid number")
        
        elif key == 'MODEL_SIZE':
            if value not in ['SMALL', 'MEDIUM', 'HIGH']:
                errors.append(f"{key}: Must be SMALL, MEDIUM, or HIGH")
    
    return errors


@settings_bp.route('/api/settings/info', methods=['GET'])
def get_settings_info():
    """
    Get information about available settings and their constraints
    """
    info = {
        'categories': {
            'models': {
                'title': 'Model Configuration',
                'variables': ['MODEL_SIZE', 'COMPOSE_MODEL', 'AGENT_MODEL', 'RAG_MODEL', 'RECIPE_MODEL']
            },
            'tokens': {
                'title': 'Token Limits',
                'variables': ['RECIPE_MAX_TOKENS', 'TEMPLATE_MAX_TOKENS', 'GENERATE_MAX_TOKENS', 'COMPOSE_MAX_TOKENS']
            },
            'search': {
                'title': 'Search Engines',
                'variables': ['BRAVE_API_KEY', 'SEARXNG_URL', 'YACY_URL']
            },
            'rag': {
                'title': 'RAG Configuration',
                'variables': ['RAG_EMBEDDING_MODEL', 'CHAT_AGENT_TOP_K', 'CHAT_AGENT_MIN_TOP_K', 
                            'CHAT_AGENT_RELEVANCE_THRESHOLD', 'CHAT_AGENT_TEMPERATURE']
            }
        },
        'embedding_models': [
            {
                'value': 'nomic-embed-text:latest',
                'label': 'nomic-embed-text (Ollama - English only)',
                'type': 'ollama'
            },
            {
                'value': 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
                'label': 'paraphrase-multilingual-MiniLM-L12-v2 (Fast, 50+ languages)',
                'type': 'huggingface'
            },
            {
                'value': 'sentence-transformers/intfloat/multilingual-e5-base',
                'label': 'multilingual-e5-base (Balanced, 100+ languages)',
                'type': 'huggingface'
            },
            {
                'value': 'sentence-transformers/intfloat/multilingual-e5-large',
                'label': 'multilingual-e5-large (Best quality, 100+ languages)',
                'type': 'huggingface'
            },
            {
                'value': 'sentence-transformers/BAAI/bge-m3',
                'label': 'bge-m3 (Production, 100+ languages)',
                'type': 'huggingface'
            }
        ],
        'restart_required': True
    }
    
    return jsonify(info), 200

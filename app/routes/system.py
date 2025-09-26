from __future__ import annotations

import os
import requests
import json
from flask import Blueprint, jsonify, request, current_app, Response


system_bp = Blueprint("system", __name__)


def json_response(data, status_code=200):
    """Create a JSON response with proper Unicode handling."""
    response = Response(
        json.dumps(data, ensure_ascii=False, indent=2),
        status=status_code,
        mimetype='application/json; charset=utf-8'
    )
    return response


@system_bp.route("/dev/load_template", methods=["POST", "GET"])
def dev_load_template():
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"error": "Data service not available"}), 503
    name = request.args.get("name") or (request.get_json() or {}).get("name") or "all"
    result = ds.load_template(name)
    code = 200 if result.get("status") == "ok" else 500
    return jsonify(result), code


@system_bp.get("/export")
def export_data():
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"error": "Data service not available"}), 503
    data = ds.export_data()
    return jsonify(data)


@system_bp.post("/import")
def import_data():
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"error": "Data service not available"}), 503
    import_data = request.get_json() or {}
    success = ds.import_data(import_data)
    if success:
        return jsonify({"status": "success", "message": "Data imported successfully"})
    else:
        return jsonify({"status": "error", "message": "Failed to import data"}), 500


@system_bp.get("/health")
def health_check():
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"error": "Data service not available"}), 503
    health = ds.health_check()
    status_code = 200 if health.get("status") == "healthy" else 500
    return jsonify(health), status_code


@system_bp.get("/search")
def search_content():
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"error": "Data service not available"}), 503
    query = request.args.get("q", "")
    content_type = request.args.get("type", "all")
    if not query:
        return jsonify({"results": []})
    results = ds.search_content(query, content_type)
    return jsonify({"results": results})


@system_bp.get("/recent")
def recent_items():
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"error": "Data service not available"}), 503
    limit = int(request.args.get("limit", 10))
    items = ds.get_recent_items(limit)
    return jsonify({"items": items})


@system_bp.get("/statistics")
def statistics():
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"error": "Data service not available"}), 503
    return jsonify(ds.get_statistics())


@system_bp.get("/ollama/models")
def get_ollama_models():
    try:
        response = requests.get("http://127.0.0.1:11434/api/tags", timeout=10)
        if response.ok:
            models_data = response.json()
            models = []
            for model in models_data.get("models", []):
                models.append(
                    {
                        "name": model.get("name", ""),
                        "modified_at": model.get("modified_at", ""),
                        "size": model.get("size", 0),
                    }
                )
            return jsonify({"models": models, "status": "success"})
        else:
            return jsonify({"error": "Failed to fetch models from Ollama", "status": "error"}), 500
    except requests.exceptions.RequestException:
        return jsonify({"error": "Cannot connect to Ollama service", "status": "error"}), 500
    except Exception:
        return jsonify({"error": "Internal server error", "status": "error"}), 500


@system_bp.get("/compose/debug")
def compose_debug():
    try:
        ollama_status = "disconnected"
        models = []
        try:
            response = requests.get("http://127.0.0.1:11434/api/tags", timeout=5)
            if response.ok:
                ollama_status = "connected"
                models = [m.get("name", "") for m in response.json().get("models", [])]
        except Exception:
            pass

        config = {
            "ollama_status": ollama_status,
            "available_models": models,
            "configured_models": {
                "compose": os.getenv("COMPOSE_MODEL", "llama3.2:1b"),
                "recipe": os.getenv("RECIPE_MODEL", "llama3.2:3b"),
                "agent": os.getenv("AGENT_MODEL", "llama3.2:1b"),
            },
            "token_limits": {
                "recipe": int(os.getenv("RECIPE_MAX_TOKENS", "2000")),
                "template": int(os.getenv("TEMPLATE_MAX_TOKENS", "1500")),
                "generate": int(os.getenv("GENERATE_MAX_TOKENS", "1200")),
                "compose": int(os.getenv("COMPOSE_MAX_TOKENS", "800")),
            },
            "agents_manager_available": getattr(current_app, "agents_manager", None) is not None,
        }
        return jsonify(config)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@system_bp.get("/config/defaults")
def get_default_config():
    try:
        return jsonify(
            {
                "default_model": os.getenv("COMPOSE_MODEL", "llama3.2:1b"),
                "rag_model": os.getenv("RAG_MODEL", "llama3.2:3b"),
                "agent_model": os.getenv("AGENT_MODEL", "llama3.2:1b"),
                "recipe_model": os.getenv("RECIPE_MODEL", "llama3.2:3b"),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@system_bp.post("/compose")
def compose_action():
    """Handle compose/AI assistant actions."""
    try:
        data = request.get_json() or {}
        action = data.get("action", "")
        
        # Get the chat history manager from app context
        chat_manager = getattr(current_app, "chat_history_manager", None)
        if not chat_manager:
            return json_response({"error": "Chat manager not available"}, 503)
        
        # Handle different compose actions
        if action == "generate":
            return _handle_generate_action(data, chat_manager)
        elif action == "translate":
            return _handle_translate_action(data, chat_manager)
        elif action == "highlight":
            return _handle_highlight_action(data, chat_manager)
        elif action == "rewrite":
            return _handle_rewrite_action(data, chat_manager)
        elif action == "format":
            return _handle_format_action(data, chat_manager)
        elif action == "template":
            return _handle_template_action(data, chat_manager)
        else:
            return json_response({"error": f"Unknown action: {action}"}, 400)
            
    except Exception as e:
        return json_response({"error": str(e)}, 500)


def _handle_generate_action(data, chat_manager):
    """Handle generate action - create content from prompt."""
    prompt = data.get("prompt", "")
    if not prompt:
        return json_response({"error": "No prompt provided"}, 400)
    
    # Create a temporary chat session for generation
    chat_id = f"compose_generate_{hash(prompt) % 100000}"
    
    try:
        # Generate content using the chat manager
        result = chat_manager.get_response(chat_id, prompt)
        
        # Format as EditorJS blocks if requested
        if data.get("prefer_editorjs", False):
            content = _format_as_editorjs(result)
        else:
            content = result
            
        return json_response({"content": content, "success": True})
    except Exception as e:
        return json_response({"error": str(e)}, 500)


def _handle_translate_action(data, chat_manager):
    """Handle translate action - translate text to target language."""
    text = data.get("text", "")
    language = data.get("language", "")
    
    if not text:
        return json_response({"error": "No text provided"}, 400)
    if not language:
        return json_response({"error": "No target language provided"}, 400)
    
    # Create translation prompt
    prompt = f"Translate the following text to {language}. Only provide the translation, no additional commentary:\n\n{text}"
    chat_id = f"compose_translate_{hash(text + language) % 100000}"
    
    try:
        result = chat_manager.get_response(chat_id, prompt)
        return json_response({"content": result.strip(), "success": True})
    except Exception as e:
        return json_response({"error": str(e)}, 500)


def _handle_highlight_action(data, chat_manager):
    """Handle highlight action - analyze text and identify keywords to highlight."""
    text = data.get("text", "")
    
    if not text:
        return json_response({"error": "No text provided"}, 400)
    
    # Create highlighting prompt to identify keywords
    prompt = f"Analyze the following text and identify the most important keywords, phrases, and terms that should be highlighted. Return only the exact words/phrases as they appear in the text, as a JSON array of strings. Focus on key concepts, important terms, and significant phrases:\n\n{text}"
    chat_id = f"compose_highlight_{hash(text) % 100000}"
    
    try:
        result = chat_manager.get_response(chat_id, prompt)
        
        # Try to parse as JSON, fall back to simple list if needed
        keywords = []
        try:
            # Clean up common JSON markdown formatting
            clean_result = result.strip()
            if clean_result.startswith("```json"):
                clean_result = clean_result.replace("```json", "").replace("```", "").strip()
            
            parsed_keywords = json.loads(clean_result)
            if isinstance(parsed_keywords, list):
                keywords = [str(kw).strip() for kw in parsed_keywords if str(kw).strip()]
            else:
                keywords = [str(parsed_keywords).strip()]
        except:
            # If JSON parsing fails, split by newlines and clean up
            lines = [line.strip("- •[]\"`,") for line in result.split("\n") if line.strip()]
            keywords = [line for line in lines if line and not line.startswith(("```", "[", "]"))]
        
        # Filter out empty keywords and ensure they exist in the original text
        valid_keywords = []
        for keyword in keywords:
            if keyword and keyword.lower() in text.lower():
                valid_keywords.append(keyword)
        
        # Return in the format expected by applyHighlights function
        return json_response({
            "highlights": {
                "keywords": valid_keywords
            }, 
            "success": True
        })
    except Exception as e:
        return json_response({"error": str(e)}, 500)


def _handle_rewrite_action(data, chat_manager):
    """Handle rewrite action - improve or rewrite existing text."""
    text = data.get("text", "")
    style = data.get("style", "improve")
    
    if not text:
        return json_response({"error": "No text provided"}, 400)
    
    # Create style-specific rewrite prompt
    if style == "simple":
        prompt = f"Simplify the following text to make it clearer and easier to understand. Use simpler words and shorter sentences:\n\n{text}"
    elif style == "detailed":
        prompt = f"Expand and elaborate on the following text with more detail and explanation while maintaining clarity:\n\n{text}"
    else:
        prompt = f"Rewrite and improve the following text while maintaining its meaning and intent. Focus on clarity, flow, and readability:\n\n{text}"
    
    chat_id = f"compose_rewrite_{hash(text + style) % 100000}"
    
    try:
        result = chat_manager.get_response(chat_id, prompt)
        
        # Format as EditorJS blocks if requested
        if data.get("prefer_editorjs", False):
            content = _format_as_editorjs(result)
        else:
            content = result
            
        return json_response({"content": content, "success": True})
    except Exception as e:
        return json_response({"error": str(e)}, 500)


def _handle_format_action(data, chat_manager):
    """Handle format action - format text according to specific requirements."""
    text = data.get("text", "")
    format_type = data.get("format", "readable")
    
    if not text:
        return json_response({"error": "No text provided"}, 400)
    
    # Create format-specific prompt
    if format_type == "markdown":
        prompt = f"Convert the following text to properly formatted Markdown. Use appropriate headers, lists, emphasis, and other Markdown syntax:\n\n{text}"
    else:
        prompt = f"Format and structure the following text to make it more readable and well-organized:\n\n{text}"
    
    chat_id = f"compose_format_{hash(text + format_type) % 100000}"
    
    try:
        result = chat_manager.get_response(chat_id, prompt)
        
        # Format as EditorJS blocks if requested
        if data.get("prefer_editorjs", False):
            content = _format_as_editorjs(result)
        else:
            content = result
            
        return json_response({"content": content, "success": True})
    except Exception as e:
        return json_response({"error": str(e)}, 500)


def _handle_template_action(data, chat_manager):
    """Handle template action - generate content using template and prompt."""
    prompt = data.get("prompt", "")
    template_skeleton = data.get("template_skeleton")
    
    if not prompt:
        return json_response({"error": "No prompt provided"}, 400)
    
    # Create template-based generation prompt
    if template_skeleton:
        prompt = f"Using the following template structure, generate content based on this prompt: {prompt}\n\nTemplate structure: {template_skeleton}"
    else:
        prompt = f"Generate structured content for: {prompt}"
    
    chat_id = f"compose_template_{hash(prompt) % 100000}"
    
    try:
        result = chat_manager.get_response(chat_id, prompt)
        
        # Format as EditorJS blocks if requested
        if data.get("prefer_editorjs", False):
            content = _format_as_editorjs(result)
        else:
            content = result
            
        return json_response({"content": content, "success": True})
    except Exception as e:
        return json_response({"error": str(e)}, 500)


def _format_as_editorjs(text):
    """Convert plain text to EditorJS format."""
    if not text:
        return {"blocks": []}
    
    # Simple conversion - split by paragraphs and create paragraph blocks
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    
    blocks = []
    for para in paragraphs:
        # Check if it looks like a header (starts with # or is short and ends with :)
        if para.startswith('#'):
            level = len(para) - len(para.lstrip('#'))
            text = para.lstrip('# ').strip()
            blocks.append({
                "type": "header",
                "data": {
                    "text": text,
                    "level": min(level, 6)
                }
            })
        elif len(para) < 60 and para.endswith(':'):
            blocks.append({
                "type": "header",
                "data": {
                    "text": para.rstrip(':'),
                    "level": 3
                }
            })
        else:
            # Regular paragraph
            blocks.append({
                "type": "paragraph",
                "data": {
                    "text": para
                }
            })
    
    return {"blocks": blocks}

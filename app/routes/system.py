from __future__ import annotations

import os
import requests
from flask import Blueprint, jsonify, request, current_app


system_bp = Blueprint("system", __name__)


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
def compose_action_stub():
    return jsonify({"error": "compose endpoint not yet ported to factory"}), 501

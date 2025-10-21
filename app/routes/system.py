from __future__ import annotations

import os
import requests
import json
from urllib.parse import urljoin
from typing import Iterable
from bs4 import BeautifulSoup
from flask import Blueprint, jsonify, request, current_app, Response, stream_with_context


system_bp = Blueprint("system", __name__)


def json_response(data, status_code=200):
    """Create a JSON response with proper Unicode handling."""
    response = Response(
        json.dumps(data, ensure_ascii=False, indent=2),
        status=status_code,
        mimetype='application/json; charset=utf-8'
    )
    return response


def _get_ollama_base_url() -> str:
    base_url = os.getenv("OLLAMA_URL") or current_app.config.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    return base_url.rstrip("/")


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
        response = requests.get(f"{_get_ollama_base_url()}/api/tags", timeout=10)
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


@system_bp.get("/ollama/models/<path:model_name>/info")
def get_ollama_model_info(model_name: str):
    cleaned_name = (model_name or "").strip()
    if not cleaned_name:
        return jsonify({"error": "Model name is required"}), 400

    request_payload = {"name": cleaned_name}
    show_url = f"{_get_ollama_base_url()}/api/show"

    try:
        upstream_response = requests.post(show_url, json=request_payload, timeout=10)
    except requests.exceptions.RequestException as exc:
        return jsonify({"error": f"Failed to contact Ollama: {exc}"}), 502

    if not upstream_response.ok:
        try:
            error_payload = upstream_response.json()
        except ValueError:
            error_payload = {"error": upstream_response.text or "Failed to retrieve model info"}
        return jsonify(error_payload), upstream_response.status_code

    try:
        payload = upstream_response.json()
    except ValueError:
        return jsonify({"error": "Invalid response from Ollama"}), 502

    return jsonify({
        "status": "success",
        "model": cleaned_name,
        "data": payload
    })


@system_bp.post("/ollama/pull")
def pull_ollama_model():
    payload = request.get_json(silent=True) or {}
    model_name = (payload.get("model") or payload.get("name") or "").strip()

    if not model_name:
        return jsonify({"error": "Model name is required"}), 400

    pull_url = f"{_get_ollama_base_url()}/api/pull"

    try:
        upstream_response = requests.post(
            pull_url,
            json={"name": model_name},
            stream=True,
            timeout=(5, None),
        )
    except requests.exceptions.RequestException as exc:
        return jsonify({"error": f"Failed to contact Ollama: {exc}"}), 502

    if upstream_response.status_code >= 400:
        try:
            error_payload = upstream_response.json()
        except ValueError:
            error_payload = {"error": upstream_response.text or "Ollama pull failed"}
        response_obj = jsonify(error_payload)
        response_obj.status_code = upstream_response.status_code
        upstream_response.close()
        return response_obj

    def generate():
        try:
            for raw_line in upstream_response.iter_lines(decode_unicode=False):
                if not raw_line:
                    continue

                if isinstance(raw_line, bytes):
                    line = raw_line.decode("utf-8", errors="ignore")
                else:
                    line = raw_line

                if line:
                    yield line + "\n"
        finally:
            upstream_response.close()

    return Response(stream_with_context(generate()), mimetype="application/x-ndjson")


@system_bp.delete("/ollama/models/<path:model_name>")
def delete_ollama_model(model_name: str):
    model_name = (model_name or "").strip()
    if not model_name:
        return jsonify({"error": "Model name is required"}), 400

    delete_url = f"{_get_ollama_base_url()}/api/models/{model_name}"

    try:
        upstream_response = requests.delete(delete_url, timeout=10)
    except requests.exceptions.RequestException as exc:
        return jsonify({"error": f"Failed to contact Ollama: {exc}"}), 502

    if upstream_response.ok:
        try:
            payload = upstream_response.json()
        except ValueError:
            payload = {"status": "success", "model": model_name}
        return jsonify(payload)

    try:
        error_payload = upstream_response.json()
    except ValueError:
        error_payload = {"error": upstream_response.text or "Failed to delete model"}

    return jsonify(error_payload), upstream_response.status_code


def _parse_ollama_catalog_results(html_fragment: str) -> list[dict[str, object]]:
    soup = BeautifulSoup(html_fragment, "html.parser")
    results: list[dict[str, object]] = []

    for item in soup.select("li[x-test-model]"):
        link = item.find("a", href=True)
        if not link:
            continue

        title_el = link.select_one("[x-test-search-response-title]")
        model_name = (title_el.get_text(strip=True) if title_el else link.get("title") or "").strip()
        if not model_name:
            continue

        href = link.get("href", "").strip()
        absolute_url = urljoin("https://ollama.com", href)
        slug = href.split("/library/")[-1] if "/library/" in href else href.lstrip("/")

        description_el = link.find("p")
        description = description_el.get_text(strip=True) if description_el else ""

        capabilities = [span.get_text(strip=True) for span in link.select("[x-test-capability]") if span.get_text(strip=True)]
        sizes = [span.get_text(strip=True) for span in link.select("[x-test-size]") if span.get_text(strip=True)]

        stats_map = {
            "pulls": link.select_one("[x-test-pull-count]"),
            "tags": link.select_one("[x-test-tag-count]"),
            "updated": link.select_one("[x-test-updated]")
        }
        stats = {
            key: element.get_text(strip=True)
            for key, element in stats_map.items()
            if element and element.get_text(strip=True)
        }

        results.append({
            "provider": "ollama",
            "name": model_name,
            "slug": slug,
            "description": description,
            "url": absolute_url,
            "capabilities": capabilities,
            "sizes": sizes,
            "stats": stats
        })

    return results


def _extract_hf_quantizations(model_id: str, existing_siblings: Iterable[dict[str, object]] | None = None) -> list[str]:
    siblings: list[dict[str, object]] = []
    if existing_siblings:
        siblings = [s for s in existing_siblings if isinstance(s, dict)]

    if not siblings:
        detail_url = f"https://huggingface.co/api/models/{model_id}"
        params = {"expand": "files"}
        try:
            response = requests.get(detail_url, params=params, timeout=10)
            if response.status_code >= 400:
                return []
            payload = response.json()
        except (requests.exceptions.RequestException, ValueError):
            return []
        siblings = payload.get("siblings") or []

    quant_names: list[str] = []
    seen: set[str] = set()
    for sibling in siblings:
        if not isinstance(sibling, dict):
            continue
        rfilename = sibling.get("rfilename") or sibling.get("filename") or sibling.get("path")
        if not rfilename:
            continue
        basename = rfilename.rsplit("/", 1)[-1]
        if not basename.lower().endswith(".gguf"):
            continue
        quant = basename.rsplit(".", 1)[0].strip()
        if not quant or quant in seen:
            continue
        seen.add(quant)
        quant_names.append(quant)

    return quant_names


def _search_huggingface_models(query: str, limit: int = 6, _is_secondary: bool = False) -> list[dict[str, object]]:
    if not query:
        return []

    limit = max(1, min(limit, 12))
    api_limit = max(limit * 6, 30)
    params = {
        "search": query,
        "limit": str(api_limit),
        "cardData": "true",
        "full": "true",
    }

    headers = {
        "Accept": "application/json",
        "User-Agent": "LLM-Notetaker/1.0 (+https://github.com/sardinaa/LLM-Notetaker)",
    }

    try:
        response = requests.get("https://huggingface.co/api/models", params=params, headers=headers, timeout=10)
    except requests.exceptions.RequestException:
        return []

    if response.status_code >= 400:
        return []

    try:
        models_data = response.json()
    except ValueError:
        return []

    if not isinstance(models_data, list):
        return []

    results: list[dict[str, object]] = []

    for entry in models_data:
        if not isinstance(entry, dict):
            continue

        model_id = entry.get("modelId") or entry.get("id")
        if not model_id or entry.get("private"):
            continue

        siblings = entry.get("siblings") if isinstance(entry.get("siblings"), list) else None
        quantizations = _extract_hf_quantizations(model_id, siblings)
        if not quantizations:
            continue

        description = entry.get("description")
        if not description:
            card_data = entry.get("cardData")
            if isinstance(card_data, dict):
                description = card_data.get("summary") or card_data.get("description")

        capabilities: list[str] = []
        pipeline_tag = entry.get("pipeline_tag")
        if isinstance(pipeline_tag, str) and pipeline_tag:
            capabilities.append(pipeline_tag)
        tags_source = entry.get("tags")
        if not isinstance(tags_source, list):
            card_data = entry.get("cardData")
            if isinstance(card_data, dict):
                candidate = card_data.get("tags")
                if isinstance(candidate, list):
                    tags_source = candidate
        if isinstance(tags_source, list):
            for tag in tags_source:
                if isinstance(tag, str) and tag.startswith("task:"):
                    capabilities.append(tag.split(":", 1)[-1])

        stats = {}
        stats_candidates = {
            "likes": entry.get("likes"),
            "downloads": entry.get("downloads"),
            "updated": entry.get("lastModified") or entry.get("lastModifiedAt") or entry.get("lastModifiedTime") or entry.get("lastUpdated") or entry.get("updatedAt")
        }
        for label, value in stats_candidates.items():
            if value is None or value == "":
                continue
            stats[label] = value

        result = {
            "provider": "huggingface",
            "name": f"hf.co/{model_id}",
            "display_name": model_id,
            "description": description or "",
            "url": f"https://huggingface.co/{model_id}",
            "capabilities": capabilities,
            "sizes": quantizations,
            "stats": stats,
        }

        results.append(result)

        if len(results) >= limit:
            break

    if not results and not _is_secondary and "gguf" not in query.lower():
        return _search_huggingface_models(f"{query} gguf", limit=limit, _is_secondary=True)

    return results


@system_bp.get("/ollama/catalog/search")
def search_ollama_catalog():
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"status": "success", "query": "", "results": []})

    params = [("q", query)]
    for capability in request.args.getlist("c"):
        cap_value = capability.strip()
        if cap_value:
            params.append(("c", cap_value))

    sort_value = (request.args.get("sort") or "").strip()
    if sort_value:
        params.append(("sort", sort_value))

    headers = {
        "HX-Request": "true",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": request.headers.get("User-Agent", "Mozilla/5.0"),
        "Referer": "https://ollama.com/"
    }

    try:
        upstream = requests.get(
            "https://ollama.com/search",
            params=params,
            headers=headers,
            timeout=10
        )
    except requests.exceptions.RequestException as exc:
        return jsonify({"status": "error", "error": f"Failed to reach Ollama catalog: {exc}"}), 502

    if upstream.status_code >= 500:
        return jsonify({"status": "error", "error": "Ollama catalog unavailable"}), upstream.status_code

    if upstream.status_code == 404:
        return jsonify({"status": "success", "query": query, "results": []})

    if upstream.status_code >= 400:
        return jsonify({"status": "error", "error": "Catalog search failed"}), upstream.status_code

    results = _parse_ollama_catalog_results(upstream.text)

    huggingface_results = _search_huggingface_models(query, limit=6)
    combined_results = results + huggingface_results

    return jsonify({
        "status": "success",
        "query": query,
        "results": combined_results,
        "counts": {
            "ollama": len(results),
            "huggingface": len(huggingface_results)
        }
    })


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

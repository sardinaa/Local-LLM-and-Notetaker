from __future__ import annotations

import json
from flask import Blueprint, jsonify, request, current_app, Response
import requests
import os
import logging


logger = logging.getLogger(__name__)
chat_llm_bp = Blueprint("chat_llm", __name__)


@chat_llm_bp.post("/chat")
def chat():
    data = request.get_json() or {}
    prompt = data.get("prompt", "")
    chat_id = data.get("chat_id", "default")
    model_name = data.get("model")
    use_stream = data.get("stream", True)
    force_search = data.get("force_search", False)

    ds = getattr(current_app, "data_service", None)
    mgr = getattr(current_app, "chat_history_manager", None)
    if not ds or not mgr:
        return jsonify({"error": "Chat service unavailable"}), 503

    if chat_id != "default":
        try:
            existing_chat = ds.get_chat(chat_id)
            if isinstance(existing_chat, dict):
                content = existing_chat.get("content") or {}
                raw_messages = content.get("messages") or []
                history_msgs = []
                for m in raw_messages or []:
                    try:
                        sender = (m.get("sender") or "").lower()
                        text = m.get("text") or ""
                        role = "assistant" if sender == "bot" else "user"
                        history_msgs.append({"role": role, "content": text})
                    except Exception:
                        continue
                if history_msgs:
                    mgr.load_chat_history(chat_id, history_msgs)
        except Exception as e:
            logger.warning(f"Could not load chat history for {chat_id}: {e}")

    if use_stream:
        def generate():
            try:
                bot_response = ""
                for chunk in mgr.get_response_stream(chat_id, prompt, model_name, force_search):
                    if chunk:
                        bot_response += chunk
                        yield f"data: {json.dumps({'token': chunk})}\n\n"
                try:
                    existing = ds.get_chat(chat_id)
                    messages = []
                    if isinstance(existing, dict):
                        content = existing.get("content") or {}
                        messages = content.get("messages") or []
                    from datetime import datetime
                    now = datetime.utcnow().isoformat()
                    messages = list(messages) if isinstance(messages, list) else []
                    messages.append({"text": prompt, "sender": "user", "timestamp": now})
                    messages.append({"text": bot_response, "sender": "bot", "timestamp": now})
                    ds.save_chat(chat_id, messages)
                except Exception as persist_err:
                    logger.warning(f"Failed to persist streamed chat for {chat_id}: {persist_err}")
                yield f"data: {json.dumps({'done': True})}\n\n"
            except Exception as e:
                logger.error(f"Error in streaming chat: {e}")
                yield f"data: {json.dumps({'error': 'Error contacting LLM service.'})}\n\n"

        return Response(generate(), mimetype="text/plain")
    else:
        try:
            bot_reply = mgr.get_response(chat_id, prompt, model_name, force_search)
            try:
                existing = ds.get_chat(chat_id)
                messages = []
                if isinstance(existing, dict):
                    content = existing.get("content") or {}
                    messages = content.get("messages") or []
                from datetime import datetime
                now = datetime.utcnow().isoformat()
                messages = list(messages) if isinstance(messages, list) else []
                messages.append({"text": prompt, "sender": "user", "timestamp": now})
                messages.append({"text": bot_reply, "sender": "bot", "timestamp": now})
                ds.save_chat(chat_id, messages)
            except Exception as persist_err:
                logger.warning(f"Failed to persist chat for {chat_id}: {persist_err}")
            return jsonify({"response": bot_reply})
        except Exception as e:
            logger.error(f"Error in chat: {e}")
            return jsonify({"response": "Error contacting LLM service."})


@chat_llm_bp.post("/chat-with-context")
def chat_with_context():
    data = request.get_json() or {}
    chat_id = data.get("chat_id")
    message = data.get("message")
    history = data.get("history")
    model_name = data.get("model")
    use_stream = data.get("stream", True)
    force_search = data.get("force_search", False)

    ds = getattr(current_app, "data_service", None)
    mgr = getattr(current_app, "chat_history_manager", None)
    if not ds or not mgr:
        return jsonify({"error": "Chat service unavailable"}), 503
    if not chat_id:
        return jsonify({"error": "chat_id is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400

    if history:
        try:
            mgr.load_chat_history(chat_id, history)
        except Exception as e:
            logger.warning(f"Could not load provided history for {chat_id}: {e}")

    if use_stream:
        def generate():
            try:
                bot_response = ""
                for chunk in mgr.get_response_stream(chat_id, message, model_name, force_search):
                    if chunk:
                        bot_response += chunk
                        yield f"data: {json.dumps({'token': chunk})}\n\n"
                try:
                    existing = ds.get_chat(chat_id)
                    messages = []
                    if isinstance(existing, dict):
                        content = existing.get("content") or {}
                        messages = content.get("messages") or []
                    from datetime import datetime
                    now = datetime.utcnow().isoformat()
                    messages = list(messages) if isinstance(messages, list) else []
                    messages.append({"text": message, "sender": "user", "timestamp": now})
                    messages.append({"text": bot_response, "sender": "bot", "timestamp": now})
                    ds.save_chat(chat_id, messages)
                except Exception as persist_err:
                    logger.warning(f"Failed to persist streamed chat-with-context for {chat_id}: {persist_err}")
                yield f"data: {json.dumps({'done': True})}\n\n"
            except Exception as e:
                logger.error(f"Error in streaming chat with context: {e}")
                yield f"data: {json.dumps({'error': 'Error contacting LLM service.'})}\n\n"

        return Response(generate(), mimetype="text/plain")
    else:
        try:
            response = mgr.get_response(chat_id, message, model_name, force_search)
            try:
                existing = ds.get_chat(chat_id)
                messages = []
                if isinstance(existing, dict):
                    content = existing.get("content") or {}
                    messages = content.get("messages") or []
                from datetime import datetime
                now = datetime.utcnow().isoformat()
                messages = list(messages) if isinstance(messages, list) else []
                messages.append({"text": message, "sender": "user", "timestamp": now})
                messages.append({"text": response, "sender": "bot", "timestamp": now})
                ds.save_chat(chat_id, messages)
            except Exception as persist_err:
                logger.warning(f"Failed to persist chat-with-context for {chat_id}: {persist_err}")
            return jsonify({"response": response})
        except Exception as e:
            logger.error(f"Error in chat with context: {e}")
            return jsonify({"response": "Error contacting LLM service."})


@chat_llm_bp.get("/chat-summary/<chat_id>")
def get_chat_summary(chat_id: str):
    mgr = getattr(current_app, "chat_history_manager", None)
    if not mgr:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        summary = mgr.get_chat_summary(chat_id)
        return jsonify({"summary": summary})
    except Exception as e:
        logger.error(f"Error getting chat summary for {chat_id}: {e}")
        return jsonify({"error": "Could not generate summary"}), 500


@chat_llm_bp.delete("/chat-context/<chat_id>")
def clear_chat_context(chat_id: str):
    mgr = getattr(current_app, "chat_history_manager", None)
    if not mgr:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        success = mgr.clear_session(chat_id)
        if success:
            return jsonify({"status": "success", "message": "Chat context cleared"})
        else:
            return jsonify({"status": "error", "message": "Chat session not found"}), 404
    except Exception as e:
        logger.error(f"Error clearing chat context for {chat_id}: {e}")
        return jsonify({"error": "Could not clear chat context"}), 500


@chat_llm_bp.post("/generate-chat-title")
def generate_chat_title():
    data = request.get_json() or {}
    first_message = data.get("message", "")
    if not first_message:
        return jsonify({"title": "New Chat"}), 400
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
            json={"model": os.getenv("AGENT_MODEL", "llama3.2:1b"), "prompt": title_prompt, "stream": False},
            timeout=30,
        )
        if response.ok:
            generated_title = response.json().get("response", "").strip()
            lines = generated_title.split("\n")
            title = lines[0].strip()
            title = title.replace("Title:", "").replace('"', "").replace("'", "").strip()
            if len(title) > 50:
                title = title[:50].rsplit(" ", 1)[0] + "..."
            if not title or title.lower() in ["chat", "conversation", "discussion"]:
                words = first_message.split()[:4]
                title = " ".join(words)
                if len(title) > 30:
                    title = title[:30] + "..."
            return jsonify({"title": title or "New Chat"})
        else:
            words = first_message.split()[:4]
            title = " ".join(words)
            if len(title) > 30:
                title = title[:30] + "..."
            return jsonify({"title": title or "New Chat"})
    except Exception as e:
        words = first_message.split()[:4]
        title = " ".join(words)
        if len(title) > 30:
            title = title[:30] + "..."
        return jsonify({"title": title or "New Chat"})


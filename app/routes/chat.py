from __future__ import annotations

from flask import Blueprint, jsonify, request, current_app
import logging


logger = logging.getLogger(__name__)
chat_bp = Blueprint("chat", __name__)


@chat_bp.route("/chats", methods=["GET", "POST"])
def chats_index():
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"status": "error", "message": "Data service not available"}), 503
    if request.method == "GET":
        tree = ds.get_tree()
        chat_nodes = []

        def extract(nodes):
            for node in nodes:
                if node.get("type") == "chat":
                    chat_nodes.append(node)
                if node.get("children"):
                    extract(node["children"])

        extract(tree)
        return jsonify(chat_nodes)

    # POST - save chat messages for a specific chat node
    chat_data = request.get_json() or {}
    if "id" in chat_data and "messages" in chat_data:
        ok = ds.save_chat(chat_data["id"], chat_data["messages"])
        if ok:
            return jsonify({"status": "success"})
        return jsonify({"status": "error", "message": "Failed to save chat"}), 500
    return jsonify({"status": "error", "message": "Invalid chat data"}), 400


@chat_bp.get("/chats/<chat_id>")
def chats_item(chat_id: str):
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"status": "error", "message": "Data service not available"}), 503
    chat = ds.get_chat(chat_id)
    if chat:
        return jsonify(chat)
    return jsonify({"status": "error", "message": "Chat not found"}), 404


@chat_bp.post("/chats/<chat_id>/touch")
def chats_touch(chat_id: str):
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"status": "error", "message": "Data service not available"}), 503
    try:
        ok = ds.touch_chat(chat_id)
        if ok:
            return jsonify({"status": "success"})
        return jsonify({"status": "error", "message": "Failed to touch chat"}), 500
    except Exception:
        logger.exception("Error touching chat")
        return jsonify({"status": "error", "message": "Exception while touching chat"}), 500


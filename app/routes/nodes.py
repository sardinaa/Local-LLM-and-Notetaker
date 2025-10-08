"""
Node Management Routes
Handles CRUD operations for all node types (chats, notes, folders, tags, etc.)
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, current_app
import logging


logger = logging.getLogger(__name__)
nodes_bp = Blueprint("nodes", __name__)


def _svc():
    svc = getattr(current_app, "notes_service", None)
    if not svc:
        raise RuntimeError("Notes service not available")
    return svc


def _ds():
    return getattr(current_app, "data_service", None)


# Tree and nodes
@nodes_bp.get("/tree")
def get_tree():
    """Get the complete node tree structure"""
    try:
        svc = _svc()
    except RuntimeError:
        ds = _ds()
        if not ds:
            return jsonify({"error": "Data service not available"}), 503
        return jsonify(ds.get_tree())
    return jsonify(svc.get_tree())


@nodes_bp.post("/nodes")
def create_node():
    """Create a new node of any type (note, chat, folder, tag, etc.)"""
    try:
        svc = _svc()
        node = request.get_json() or {}
        node_id = node.get("id")
        logger.info(f"Creating node: {node}")
        
        # Check if node already exists (idempotent operation)
        ds = _ds()
        if ds:
            existing_node = ds.notes_repo.get_node(node_id)
            if existing_node:
                logger.info(f"Node {node_id} already exists, returning success")
                return jsonify({"status": "success", "message": "Node already exists"})
        
        ok = svc.create_node(
            node_id,
            node.get("name"),
            node.get("type"),
            node.get("parentId"),
            customization=node.get("customization"),
        )
        if ok:
            return jsonify({"status": "success"})
        return jsonify({"status": "error", "message": "Failed to create node"}), 500
    except Exception as e:
        logger.exception("Error creating node")
        return jsonify({"status": "error", "message": f"Exception: {str(e)}"}), 500


@nodes_bp.route("/nodes/<node_id>", methods=["PUT", "DELETE"])
def manage_node(node_id: str):
    """Update or delete a node (works for all node types)"""
    svc = _svc()
    if request.method == "PUT":
        node_data = request.get_json() or {}
        try:
            ok = svc.update_node(node_id, **node_data)
            if ok:
                return jsonify({"status": "success"})
            return jsonify({"status": "error", "message": "Failed to update node"}), 500
        except Exception as e:
            logger.exception("Exception updating node")
            return jsonify({"status": "error", "message": f"Exception: {e}"}), 500
    else:
        # DELETE request
        logger.info(f"DELETE request received for node_id: {node_id}")
        try:
            ok = svc.delete_node(node_id)
            if ok:
                logger.info(f"Successfully deleted node: {node_id}")
                return jsonify({"status": "success"})
            logger.error(f"Failed to delete node: {node_id}")
            return jsonify({"status": "error", "message": "Failed to delete node"}), 500
        except Exception as e:
            logger.exception(f"Exception deleting node {node_id}")
            return jsonify({"status": "error", "message": f"Exception: {e}"}), 500


@nodes_bp.put("/nodes/<node_id>/move")
def move_node(node_id: str):
    """Move a node to a different parent or change its sort order"""
    svc = _svc()
    data = request.get_json() or {}
    ok = svc.move_node(node_id, data.get("parentId"), data.get("sortOrder"))
    if ok:
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "Failed to move node"}), 500

from __future__ import annotations

import json
import os
import re
from flask import Blueprint, jsonify, request, current_app
import logging


logger = logging.getLogger(__name__)
notes_bp = Blueprint("notes", __name__)


def _svc():
    svc = getattr(current_app, "notes_service", None)
    if not svc:
        raise RuntimeError("Notes service not available")
    return svc


def _ds():
    return getattr(current_app, "data_service", None)


# Tree and nodes
@notes_bp.get("/tree")
def get_tree():
    try:
        svc = _svc()
    except RuntimeError:
        ds = _ds()
        if not ds:
            return jsonify({"error": "Data service not available"}), 503
        return jsonify(ds.get_tree())
    return jsonify(svc.get_tree())


@notes_bp.post("/nodes")
def create_node():
    svc = _svc()
    node = request.get_json() or {}
    ok = svc.create_node(
        node.get("id"),
        node.get("name"),
        node.get("type"),
        node.get("parentId"),
        customization=node.get("customization"),
    )
    if ok:
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "Failed to create node"}), 500


@notes_bp.route("/nodes/<node_id>", methods=["PUT", "DELETE"])
def manage_node(node_id: str):
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
        ok = svc.delete_node(node_id)
        if ok:
            return jsonify({"status": "success"})
        return jsonify({"status": "error", "message": "Failed to delete node"}), 500


@notes_bp.put("/nodes/<node_id>/move")
def move_node(node_id: str):
    svc = _svc()
    data = request.get_json() or {}
    ok = svc.move_node(node_id, data.get("parentId"), data.get("sortOrder"))
    if ok:
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "Failed to move node"}), 500


# Notes content
@notes_bp.post("/notes")
def save_note():
    svc = _svc()
    note_data = request.get_json() or {}
    node_id = note_data.get("id")
    title = note_data.get("title")
    content = note_data.get("content")
    ok = svc.save_note(node_id, title, content) if node_id else False
    if ok:
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "Failed to save note"}), 500


@notes_bp.get("/notes/<note_id>")
def get_note(note_id: str):
    svc = _svc()
    note = svc.get_note(note_id)
    if note:
        return jsonify(note)
    return jsonify({"status": "error", "message": "Note not found"}), 404


# Templates
def _templates_dir() -> str:
    # Resolve absolute path to the templates/note_templates directory
    base = current_app.template_folder or "templates"
    if not os.path.isabs(base):
        base = os.path.join(current_app.root_path, base)
    return os.path.join(base, "note_templates")


@notes_bp.get("/templates")
def get_templates():
    try:
        templates_dir = _templates_dir()
        index_path = os.path.join(templates_dir, "index.json")
        if not os.path.exists(index_path):
            return jsonify({"status": "error", "message": "Templates index not found"}), 404
        with open(index_path, "r", encoding="utf-8") as f:
            index_data = json.load(f)

        templates = []
        for t in index_data.get("templates", []):
            t_file = os.path.join(templates_dir, t["file"]) if t.get("file") else None
            if t_file and os.path.exists(t_file):
                with open(t_file, "r", encoding="utf-8") as tf:
                    t_data = json.load(tf)
                templates.append(
                    {
                        "id": t["id"],
                        "name": t_data.get("name"),
                        "description": t_data.get("description"),
                        "icon": t_data.get("icon"),
                        "category": t.get("category"),
                        "isCustom": t.get("isCustom", False),
                    }
                )
        return jsonify({"templates": templates, "categories": index_data.get("categories", {})})
    except Exception:
        logger.exception("Error loading templates")
        return jsonify({"status": "error", "message": "Failed to load templates"}), 500


@notes_bp.get("/templates/<template_id>")
def get_template(template_id: str):
    try:
        templates_dir = _templates_dir()
        index_path = os.path.join(templates_dir, "index.json")
        if not os.path.exists(index_path):
            return jsonify({"status": "error", "message": "Templates index not found"}), 404
        with open(index_path, "r", encoding="utf-8") as f:
            index_data = json.load(f)
        entry = next((t for t in index_data.get("templates", []) if t["id"] == template_id), None)
        if not entry:
            return jsonify({"status": "error", "message": "Template not found"}), 404
        t_file = os.path.join(templates_dir, entry["file"])
        if not os.path.exists(t_file):
            return jsonify({"status": "error", "message": "Template file not found"}), 404
        with open(t_file, "r", encoding="utf-8") as tf:
            return jsonify(json.load(tf))
    except Exception:
        logger.exception("Error loading template")
        return jsonify({"status": "error", "message": "Failed to load template"}), 500


@notes_bp.post("/templates")
def create_custom_template():
    try:
        data = request.get_json() or {}
        if not all(k in data for k in ("name", "description", "content")):
            return jsonify({"status": "error", "message": "Missing required fields: name, description, content"}), 400

        name = data["name"].strip()
        if not name:
            return jsonify({"status": "error", "message": "Template name cannot be empty"}), 400
        description = data["description"].strip()
        content = data["content"]
        icon = data.get("icon", "fas fa-file-alt")
        category = data.get("category", "Custom")

        template_id = re.sub(r"[^a-z0-9_]", "", name.lower().replace(" ", "_").replace("-", "_"))
        templates_dir = _templates_dir()
        custom_dir = os.path.join(templates_dir, "custom")
        os.makedirs(custom_dir, exist_ok=True)
        template_path = os.path.join(custom_dir, f"{template_id}.json")
        if os.path.exists(template_path):
            return jsonify({"status": "error", "message": "A template with this name already exists"}), 409

        from datetime import datetime
        t_data = {
            "name": name,
            "description": description,
            "icon": icon,
            "content": content,
            "isCustom": True,
            "createdAt": datetime.now().isoformat(),
        }
        with open(template_path, "w", encoding="utf-8") as f:
            json.dump(t_data, f, indent=2, ensure_ascii=False)

        index_path = os.path.join(templates_dir, "index.json")
        with open(index_path, "r", encoding="utf-8") as f:
            index_data = json.load(f)
        index_data.setdefault("templates", []).append(
            {"id": template_id, "file": f"custom/{template_id}.json", "category": category, "isCustom": True}
        )
        index_data.setdefault("categories", {}).setdefault(
            category,
            {
                "icon": "fas fa-user-edit",
                "description": f"User-created {category.lower()} templates",
            },
        )
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index_data, f, indent=2, ensure_ascii=False)

        return jsonify(
            {
                "status": "success",
                "message": "Template created successfully",
                "templateId": template_id,
                "template": {
                    "id": template_id,
                    "name": name,
                    "description": description,
                    "icon": icon,
                    "category": category,
                    "isCustom": True,
                },
            }
        )
    except Exception:
        logger.exception("Error creating template")
        return jsonify({"status": "error", "message": "Failed to create template"}), 500


@notes_bp.put("/templates/<template_id>")
def update_custom_template(template_id: str):
    try:
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        description = (data.get("description") or "").strip()
        if not name or "content" not in data:
            return jsonify({"status": "error", "message": "Missing required fields: name, description, content"}), 400
        content = data["content"]
        icon = data.get("icon", "fas fa-file-alt")
        category = data.get("category", "Custom")

        templates_dir = _templates_dir()
        index_path = os.path.join(templates_dir, "index.json")
        with open(index_path, "r", encoding="utf-8") as f:
            index_data = json.load(f)
        entry = next((t for t in index_data.get("templates", []) if t["id"] == template_id), None)
        if not entry:
            return jsonify({"status": "error", "message": "Template not found"}), 404
        if not entry.get("isCustom", False):
            return jsonify({"status": "error", "message": "Cannot edit built-in templates"}), 403

        # Compute new ID if the name changed
        new_id = re.sub(r"[^a-z0-9_]", "", name.lower().replace(" ", "_").replace("-", "_"))
        t_file = os.path.join(templates_dir, entry["file"])
        if new_id != template_id:
            # ensure uniqueness
            if any(t["id"] == new_id for t in index_data.get("templates", []) if t is not entry):
                return jsonify({"status": "error", "message": "A template with this name already exists"}), 409
            # move file
            new_file = os.path.join(os.path.dirname(t_file), f"{new_id}.json")
            if os.path.exists(t_file):
                os.unlink(t_file)
            entry["id"] = new_id
            entry["file"] = f"custom/{new_id}.json"
            t_file = new_file

        from datetime import datetime
        t_data = {
            "name": name,
            "description": description,
            "icon": icon,
            "content": content,
            "isCustom": True,
            "updatedAt": datetime.now().isoformat(),
        }
        with open(t_file, "w", encoding="utf-8") as f:
            json.dump(t_data, f, indent=2, ensure_ascii=False)

        entry["category"] = category
        index_data.setdefault("categories", {}).setdefault(
            category,
            {"icon": "fas fa-user-edit", "description": f"User-created {category.lower()} templates"},
        )
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index_data, f, indent=2, ensure_ascii=False)

        return jsonify(
            {
                "status": "success",
                "message": "Template updated successfully",
                "templateId": new_id,
                "template": {
                    "id": new_id,
                    "name": name,
                    "description": description,
                    "icon": icon,
                    "category": category,
                    "isCustom": True,
                },
            }
        )
    except Exception:
        logger.exception("Error updating template")
        return jsonify({"status": "error", "message": "Failed to update template"}), 500


@notes_bp.delete("/templates/<template_id>")
def delete_custom_template(template_id: str):
    try:
        templates_dir = _templates_dir()
        index_path = os.path.join(templates_dir, "index.json")
        with open(index_path, "r", encoding="utf-8") as f:
            index_data = json.load(f)
        entry_idx = next((i for i, t in enumerate(index_data.get("templates", [])) if t["id"] == template_id), -1)
        if entry_idx < 0:
            return jsonify({"status": "error", "message": "Template not found"}), 404
        entry = index_data["templates"][entry_idx]
        if not entry.get("isCustom", False):
            return jsonify({"status": "error", "message": "Cannot delete built-in templates"}), 403
        t_file = os.path.join(templates_dir, entry["file"])
        if os.path.exists(t_file):
            os.unlink(t_file)
        index_data["templates"].pop(entry_idx)
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index_data, f, indent=2, ensure_ascii=False)
        return jsonify({"status": "success", "message": "Template deleted successfully"})
    except Exception:
        logger.exception("Error deleting template")
        return jsonify({"status": "error", "message": "Failed to delete template"}), 500

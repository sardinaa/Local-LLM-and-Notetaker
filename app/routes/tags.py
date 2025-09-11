from __future__ import annotations

from flask import Blueprint, jsonify, request, current_app
import logging
import os


logger = logging.getLogger(__name__)
tags_bp = Blueprint("tags", __name__)


def _svc():
    svc = getattr(current_app, "tags_service", None)
    if not svc:
        raise RuntimeError("Tags service not available")
    return svc


@tags_bp.route("/tags", methods=["GET", "POST"])
def tags_index():
    svc = _svc()
    if request.method == "GET":
        q = request.args.get("q")
        limit = int(request.args.get("limit", 50))
        include_usage = request.args.get("includeUsage", "false").lower() == "true"
        parent_id = request.args.get("parentId")
        tags = svc.list_tags(q=q, limit=limit, include_usage=include_usage, parent_id=parent_id)
        return jsonify({"tags": tags})
    payload = request.get_json() or {}
    tag = svc.create_tag(payload)
    if tag:
        return jsonify(tag)
    return jsonify({"error": "failed_to_create"}), 400


@tags_bp.route("/tags/<tag_id>", methods=["PATCH", "DELETE"])
def tags_item(tag_id: str):
    svc = _svc()
    if request.method == "PATCH":
        patch = request.get_json() or {}
        tag = svc.update_tag(tag_id, patch)
        if tag:
            return jsonify(tag)
        return jsonify({"error": "not_found"}), 404
    cascade = request.args.get("cascade", "false").lower() == "true"
    force = request.args.get("force", "false").lower() == "true"
    result = svc.delete_tag(tag_id, cascade=cascade, force=force)
    status = 200 if result.get("deleted") else 400
    return jsonify(result), status


@tags_bp.post("/tags/merge")
def tags_merge():
    svc = _svc()
    payload = request.get_json() or {}
    source_ids = payload.get("sourceIds") or []
    target_id = payload.get("targetId")
    if not target_id or not isinstance(source_ids, list) or not source_ids:
        return jsonify({"error": "invalid_params"}), 400
    res = svc.merge_tags(source_ids, target_id)
    status = 200 if res.get("merged") else 400
    return jsonify(res), status


@tags_bp.route("/tags/<tag_id>/relations", methods=["GET", "PUT"])
def tag_relations(tag_id: str):
    svc = _svc()
    if request.method == "GET":
        return jsonify({"relatedIds": svc.get_tag_relations(tag_id)})
    payload = request.get_json() or {}
    related_ids = payload.get("relatedIds") or []
    ok = svc.set_tag_relations(tag_id, related_ids)
    return jsonify({"status": "success" if ok else "error"}), (200 if ok else 500)


@tags_bp.route("/tags/<tag_id>/dependencies", methods=["GET", "PUT"])
def tag_dependencies(tag_id: str):
    svc = _svc()
    if request.method == "GET":
        return jsonify({"dependsOnIds": svc.get_tag_dependencies(tag_id)})
    payload = request.get_json() or {}
    depends_ids = payload.get("dependsOnIds") or []
    ok = svc.set_tag_dependencies(tag_id, depends_ids)
    return jsonify({"status": "success" if ok else "error"}), (200 if ok else 500)


@tags_bp.route("/notes/<note_id>/tags", methods=["GET", "POST", "PUT"])
def note_tags(note_id: str):
    svc = _svc()
    if request.method == "GET":
        return jsonify({"tags": svc.get_tags_for_note(note_id)})
    payload = request.get_json() or {}
    tag_ids = payload.get("tagIds") or []
    if not isinstance(tag_ids, list):
        return jsonify({"error": "tagIds must be an array"}), 400
    ok = False
    if request.method == "POST":
        ok = svc.assign_tags_to_note(note_id, tag_ids)
    else:
        ok = svc.replace_note_tags(note_id, tag_ids)
    return jsonify({"status": "success" if ok else "error"}), (200 if ok else 500)


@tags_bp.get("/notes/search-by-tags")
def notes_search_by_tags():
    svc = _svc()
    def parse_ids(param: str):
        v = request.args.get(param)
        if not v:
            return []
        return [x for x in v.split(",") if x]

    any_of = parse_ids("anyOf")
    all_of = parse_ids("allOf")
    none_of = parse_ids("noneOf")
    limit = int(request.args.get("limit", 50))
    cursor = request.args.get("cursor")
    ids = svc.search_notes_by_tags(any_of, all_of, none_of, limit, cursor)
    return jsonify({"noteIds": ids})


@tags_bp.get("/notes/query")
def notes_query():
    svc = _svc()
    def parse_ids(param: str):
        v = request.args.get(param)
        if not v:
            return []
        return [x for x in v.split(",") if x]

    any_of = parse_ids("anyOf")
    all_of = parse_ids("allOf")
    none_of = parse_ids("noneOf")
    text = request.args.get("text")
    start = request.args.get("start")
    end = request.args.get("end")

    ids = svc.query_notes(any_of, all_of, none_of, text, start, end)
    return jsonify({"noteIds": ids})


@tags_bp.get("/tags/<tag_id>/dashboard")
def tag_dashboard(tag_id: str):
    svc = _svc()
    data = svc.get_tag_dashboard(tag_id)
    if not data:
        return jsonify({"error": "not_found"}), 404
    return jsonify(data)


@tags_bp.get("/tags/<tag_id>/notes")
def get_notes_for_tag(tag_id: str):
    svc = _svc()
    try:
        result = svc.get_notes_for_tag(tag_id)
        code = 200 if not result.get("error") else (404 if result.get("error") == "Tag not found" else 500)
        return jsonify(result), code
    except Exception as e:
        logger.error(f"Error getting notes for tag {tag_id}: {e}")
        return jsonify({"error": "internal_error", "notes": [], "count": 0}), 500

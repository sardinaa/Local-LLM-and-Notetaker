from __future__ import annotations

from flask import Blueprint, jsonify, request, current_app


time_bp = Blueprint("time", __name__)


@time_bp.route("/time/activities", methods=["GET", "POST"])
def time_activities():
    svc = getattr(current_app, "time_service", None)
    if not svc:
        return jsonify({"error": "Time service not available"}), 503
    if request.method == "GET":
        return jsonify({"activities": svc.list_activities()})
    payload = request.get_json() or {}
    name = payload.get("name")
    if not name:
        return jsonify({"error": "missing_name"}), 400
    color = payload.get("color")
    tag_id = payload.get("tagId")
    act = svc.upsert_activity(name, color, tag_id)
    return jsonify(act)


@time_bp.route("/time/entries", methods=["GET", "POST"])
def time_entries():
    svc = getattr(current_app, "time_service", None)
    if not svc:
        return jsonify({"error": "Time service not available"}), 503
    if request.method == "GET":
        start = request.args.get("start")
        end = request.args.get("end")
        day = request.args.get("day")
        entries = svc.list_time_entries(start, end, day)
        return jsonify({"entries": entries})
    payload = request.get_json() or {}
    activity_id = payload.get("activityId")
    if not activity_id:
        return jsonify({"error": "missing_activity"}), 400
    start_time = payload.get("startTime")
    note_id = payload.get("noteId")
    description = payload.get("description")
    entry = svc.start_time_entry(activity_id, start_time, note_id, description)
    if not entry:
        return jsonify({"error": "start_failed"}), 400
    return jsonify(entry)


@time_bp.patch("/time/entries/<entry_id>")
def time_entry_update(entry_id: str):
    svc = getattr(current_app, "time_service", None)
    if not svc:
        return jsonify({"error": "Time service not available"}), 503
    patch = request.get_json() or {}
    entry = svc.update_time_entry(entry_id, patch)
    return (jsonify(entry), 200) if entry else (jsonify({"error": "update_failed"}), 400)


@time_bp.post("/time/entries/<entry_id>/stop")
def time_entry_stop(entry_id: str):
    svc = getattr(current_app, "time_service", None)
    if not svc:
        return jsonify({"error": "Time service not available"}), 503
    entry = svc.stop_time_entry(entry_id)
    return (jsonify(entry), 200) if entry else (jsonify({"error": "stop_failed"}), 400)

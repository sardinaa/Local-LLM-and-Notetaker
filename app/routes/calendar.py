from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app
from datetime import datetime
from typing import Optional


calendar_bp = Blueprint("calendar", __name__)


def _iso(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    try:
        # Accept both 'YYYY-MM-DDTHH:MM' and 'YYYY-MM-DD HH:MM:SS' formats
        dt = None
        try:
            dt = datetime.fromisoformat(s.replace('Z', '').replace('T', ' '))
        except Exception:
            # Fallback parse of date only
            dt = datetime.strptime(s, '%Y-%m-%d')
        return dt.isoformat(sep=' ', timespec='seconds')
    except Exception:
        return s


def _to_api(e: dict) -> dict:
    return {
        "id": e.get("id"),
        "title": e.get("title"),
        "start": e.get("start_ts") or e.get("start"),
        "end": e.get("end_ts") or e.get("end"),
        "allDay": bool(e.get("all_day")) if "all_day" in e else bool(e.get("allDay")),
        "category": e.get("category"),
        "color": e.get("color"),
        "description": e.get("description"),
    }


@calendar_bp.get("/calendar/events")
def list_events():
    repo = getattr(current_app, "calendar_repo", None)
    if not repo:
        return jsonify({"error": "Calendar repository not available"}), 503
    try:
        start = request.args.get("start")
        end = request.args.get("end")
        events = repo.list_events(_iso(start), _iso(end))
        return jsonify({"events": [_to_api(e) for e in events]})
    except Exception:
        return jsonify({"error": "Failed to list events"}), 500


@calendar_bp.post("/calendar/events")
def create_event():
    repo = getattr(current_app, "calendar_repo", None)
    if not repo:
        return jsonify({"error": "Calendar repository not available"}), 503
    try:
        data = request.get_json() or {}
        payload = {
            "title": (data.get("title") or "").strip(),
            "start": _iso(data.get("start")),
            "end": _iso(data.get("end")),
            "allDay": bool(data.get("allDay")),
            "category": data.get("category"),
            "color": data.get("color"),
            "description": data.get("description"),
        }
        created = repo.create_event(payload)
        if not created:
            return jsonify({"error": "Invalid event payload"}), 400
        return jsonify({"event": _to_api(created)})
    except Exception:
        return jsonify({"error": "Failed to create event"}), 500


@calendar_bp.route("/calendar/events/<event_id>", methods=["GET", "PUT", "DELETE"])
def event_item(event_id: str):
    repo = getattr(current_app, "calendar_repo", None)
    if not repo:
        return jsonify({"error": "Calendar repository not available"}), 503
    try:
        if request.method == "GET":
            ev = repo.get_event(event_id)
            if not ev:
                return jsonify({"error": "Not found"}), 404
            return jsonify({"event": _to_api(ev)})
        elif request.method == "PUT":
            patch = request.get_json() or {}
            # Normalize fields
            norm = {}
            if "title" in patch:
                norm["title"] = (patch.get("title") or "").strip()
            if "start" in patch:
                norm["start"] = _iso(patch.get("start"))
            if "end" in patch:
                norm["end"] = _iso(patch.get("end"))
            if "allDay" in patch:
                norm["allDay"] = bool(patch.get("allDay"))
            for k in ("category", "color", "description"):
                if k in patch:
                    norm[k] = patch.get(k)
            updated = repo.update_event(event_id, norm)
            if not updated:
                return jsonify({"error": "Update failed"}), 400
            return jsonify({"event": _to_api(updated)})
        else:
            ok = repo.delete_event(event_id)
            return jsonify({"deleted": ok}), (200 if ok else 404)
    except Exception:
        return jsonify({"error": "Failed"}), 500

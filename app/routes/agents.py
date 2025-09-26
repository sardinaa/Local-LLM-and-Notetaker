from __future__ import annotations

from flask import Blueprint, jsonify, request, current_app
import tempfile
import os
import logging


logger = logging.getLogger(__name__)
agents_bp = Blueprint("agents", __name__)


def _svc():
    svc = getattr(current_app, "agents_service", None)
    if not svc:
        raise RuntimeError("Agents service unavailable")
    return svc


@agents_bp.route("/agents", methods=["GET", "POST"])
def agents_index():
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    if request.method == "GET":
        return jsonify({"agents": svc.list_agents()})
    payload = request.get_json() or {}
    agent = svc.create_agent(payload)
    if agent:
        return jsonify(agent)
    return jsonify({"error": "failed_to_create_or_duplicate"}), 400


@agents_bp.route("/agents/<name>", methods=["GET", "PATCH", "DELETE"])
def agents_item(name: str):
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    if request.method == "GET":
        agent = svc.get_agent(name)
        return jsonify(agent) if agent else (jsonify({"error": "not_found"}), 404)
    if request.method == "PATCH":
        patch = request.get_json() or {}
        agent = svc.update_agent(name, patch)
        return jsonify(agent) if agent else (jsonify({"error": "not_found"}), 404)
    ok = svc.delete_agent(name)
    return jsonify({"deleted": ok}), (200 if ok else 404)


@agents_bp.get("/agents/export")
def agents_export():
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    return jsonify(svc.export_all())


@agents_bp.post("/agents/import")
def agents_import():
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    data = request.get_json() or {}
    count = svc.import_all(data)
    return jsonify({"imported": count})


@agents_bp.post("/agents/run")
def agents_run():
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    data = request.get_json() or {}
    agent_name = data.get("agent_name")
    query = data.get("query", "")
    model = data.get("model")
    if not agent_name or not query:
        return jsonify({"error": "agent_name and query required"}), 400
    res = svc.run_agent(agent_name, query, model)
    status = 200 if res.get("status") in ("success", "no_results", "needs_tags") else 400
    return jsonify(res), status


@agents_bp.get("/agents/<name>/knowledge")
def agents_knowledge_list(name: str):
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        docs = svc.list_agent_documents(name)
        return jsonify({"status": "success", "documents": docs})
    except Exception as e:
        logger.error(f"Failed to list knowledge for {name}: {e}")
        return jsonify({"status": "error", "message": "Failed to list knowledge"}), 500


@agents_bp.delete("/agents/<name>/knowledge")
def agents_knowledge_delete(name: str):
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    data = request.get_json() or {}
    filename = (data.get("filename") or "").strip()
    if not filename:
        return jsonify({"status": "error", "message": "filename required"}), 400
    res = svc.remove_agent_document(name, filename)
    code = 200 if res.get("status") == "success" else 400
    return jsonify(res), code


@agents_bp.post("/agents/<name>/knowledge/upload")
def agents_knowledge_upload(name: str):
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    files = []
    if "files" in request.files:
        files = request.files.getlist("files")
    elif "file" in request.files:
        files = [request.files["file"]]
    if not files:
        return jsonify({"status": "error", "message": "No file uploaded"}), 400
    try:
        results = []
        ok = 0
        for f in files:
            if not f or f.filename == "":
                results.append({"status": "error", "message": "Empty filename"})
                continue
            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                f.save(tmp.name)
                result = svc.add_agent_document(name, tmp.name, f.filename)
            try:
                os.unlink(tmp.name)
            except Exception:
                pass
            if result.get("status") == "success":
                ok += 1
            results.append(result)
        code = 200 if ok == len(results) else (207 if ok > 0 else 400)
        return (
            jsonify(
                {
                    "status": ("success" if ok == len(results) else ("partial" if ok > 0 else "error")),
                    "uploaded": ok,
                    "total": len(results),
                    "results": results,
                }
            ),
            code,
        )
    except Exception as e:
        logger.error(f"Upload failed for agent {name}: {e}")
        return jsonify({"status": "error", "message": "Upload failed"}), 500


@agents_bp.route("/agents/<name>/links", methods=["GET", "POST", "DELETE"])
def agents_links(name: str):
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        if request.method == "GET":
            return jsonify({"status": "success", "links": svc.list_agent_links(name)})
        data = request.get_json() or {}
        url = (data.get("url") or "").strip()
        if not url:
            return jsonify({"status": "error", "message": "url required"}), 400
        if request.method == "POST":
            ingest = bool(data.get("ingest", True))
            res = svc.add_agent_link(name, url, ingest)
            code = 200 if res.get("status") == "success" else 400
            return jsonify(res), code
        else:  # DELETE
            res = svc.remove_agent_link(name, url)
            code = 200 if res.get("status") == "success" else 400
            return jsonify(res), code
    except Exception as e:
        logger.error(f"Links endpoint error: {e}")
        return jsonify({"status": "error", "message": "Links operation failed"}), 500


@agents_bp.route("/agents/<name>/databases", methods=["GET", "POST"])
def agents_databases(name: str):
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        if request.method == "GET":
            return jsonify({"status": "success", "databases": svc.list_agent_databases(name)})
        data = request.get_json() or {}
        res = svc.add_agent_database(name, data)
        code = 200 if res.get("status") == "success" else 400
        return jsonify(res), code
    except Exception as e:
        logger.error(f"Databases endpoint error: {e}")
        return jsonify({"status": "error", "message": "Database operation failed"}), 500


@agents_bp.delete("/agents/<name>/databases/<db_name>")
def agents_database_delete(name: str, db_name: str):
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    res = svc.remove_agent_database(name, db_name)
    code = 200 if res.get("status") == "success" else 400
    return jsonify(res), code


@agents_bp.post("/agents/<name>/databases/<db_name>/ingest")
def agents_database_ingest(name: str, db_name: str):
    try:
        svc = _svc()
    except RuntimeError:
        return jsonify({"error": "Agents service unavailable"}), 503
    res = svc.ingest_agent_database(name, db_name)
    code = 200 if res.get("status") == "success" else 400
    return jsonify(res), code

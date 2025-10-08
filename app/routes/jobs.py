from __future__ import annotations

import os
import re
import threading
from flask import Blueprint, jsonify, request, current_app, send_from_directory
import logging


logger = logging.getLogger(__name__)
jobs_bp = Blueprint("jobs", __name__)


@jobs_bp.route("/jobs", methods=["GET", "POST"])
def jobs_index():
    svc = getattr(current_app, "jobs_service", None)
    if not svc:
        return jsonify({"error": "Jobs service not available"}), 503
    if request.method == "GET":
        filters = {
            "q": request.args.get("q"),
            "applied": (request.args.get("applied") in ("1", "true", "True")) if request.args.get("applied") is not None else None,
            "responded": (request.args.get("responded") in ("1", "true", "True")) if request.args.get("responded") is not None else None,
            "state": request.args.get("state"),
            "location": request.args.get("location"),
            "minSalary": float(request.args.get("minSalary")) if request.args.get("minSalary") else None,
            "maxSalary": float(request.args.get("maxSalary")) if request.args.get("maxSalary") else None,
            "company": request.args.get("company"),
            "position": request.args.get("position"),
            "hasLetters": (request.args.get("hasLetters") in ("1", "true", "True")) if request.args.get("hasLetters") is not None else None,
            "anyOf": request.args.get("anyOf", "").split(",") if request.args.get("anyOf") else [],
            "allOf": request.args.get("allOf", "").split(",") if request.args.get("allOf") else [],
            "noneOf": request.args.get("noneOf", "").split(",") if request.args.get("noneOf") else [],
        }
        filters = {k: v for k, v in filters.items() if v is not None and v != ""}
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))
        jobs = svc.list_jobs(filters, limit, offset)
        return jsonify({"jobs": jobs})

    payload = request.get_json() or {}
    job = svc.create_job(payload)
    if not job:
        return jsonify({"error": "create_failed"}), 400
    return jsonify(job)


@jobs_bp.route("/jobs/<job_id>", methods=["GET", "PATCH", "DELETE"])
def jobs_item(job_id: str):
    svc = getattr(current_app, "jobs_service", None)
    if not svc:
        return jsonify({"error": "Jobs service not available"}), 503
    if request.method == "GET":
        job = svc.get_job(job_id)
        return (jsonify(job), 200) if job else (jsonify({"error": "not_found"}), 404)
    if request.method == "PATCH":
        patch = request.get_json() or {}
        job = svc.update_job(job_id, patch)
        return (jsonify(job), 200) if job else (jsonify({"error": "update_failed"}), 400)
    ok = svc.delete_job(job_id)
    return jsonify({"status": "success" if ok else "error"}), (200 if ok else 400)


@jobs_bp.route("/jobs/<job_id>/letters", methods=["GET", "POST"])
def jobs_letters(job_id: str):
    svc = getattr(current_app, "jobs_service", None)
    if not svc:
        return jsonify({"error": "Jobs service not available"}), 503
    if request.method == "GET":
        return jsonify({"letters": svc.list_motivation_letters(job_id)})
    if "file" not in request.files:
        return jsonify({"error": "no_file"}), 400
    f = request.files["file"]
    if not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "only_pdf_allowed"}), 400
    base = os.path.join("instance", "uploads", "letters", job_id)
    os.makedirs(base, exist_ok=True)
    filename = f.filename
    safe_name = re.sub(r"[^a-zA-Z0-9_.\-]", "_", filename)
    dest = os.path.join(base, safe_name)
    f.save(dest)
    letter = svc.add_motivation_letter(job_id, dest, filename=safe_name)
    if not letter:
        return jsonify({"error": "save_failed"}), 500
    return jsonify(letter)


@jobs_bp.get("/jobs/<job_id>/letters/<path:filename>")
def serve_job_letter(job_id: str, filename: str):
    base = os.path.join("instance", "uploads", "letters", job_id)
    return send_from_directory(base, filename, as_attachment=False)


@jobs_bp.route("/jobs/<job_id>/events", methods=["GET", "POST"])
def jobs_events(job_id: str):
    svc = getattr(current_app, "jobs_service", None)
    if not svc:
        return jsonify({"error": "Jobs service not available"}), 503
    if request.method == "GET":
        return jsonify({"events": svc.list_job_events(job_id)})
    payload = request.get_json() or {}
    ev = svc.add_job_event(job_id, payload)
    if not ev:
        return jsonify({"error": "create_failed"}), 400
    return jsonify(ev)


@jobs_bp.route("/jobs/<job_id>/events/<event_id>", methods=["PATCH", "DELETE"])
def jobs_event_item(job_id: str, event_id: str):
    svc = getattr(current_app, "jobs_service", None)
    if not svc:
        return jsonify({"error": "Jobs service not available"}), 503
    if request.method == "PATCH":
        patch = request.get_json() or {}
        ev = svc.update_job_event(event_id, patch)
        return (jsonify(ev), 200) if ev else (jsonify({"error": "update_failed"}), 400)
    ok = svc.delete_job_event(event_id)
    return jsonify({"deleted": ok}), (200 if ok else 400)


@jobs_bp.get("/jobs/locations")
def jobs_locations():
    svc = getattr(current_app, "jobs_service", None)
    if not svc:
        return jsonify({"error": "Jobs service not available"}), 503
    try:
        locations = svc.list_job_locations()
        return jsonify({"locations": locations})
    except Exception as e:
        logger.error(f"Error fetching locations: {e}")
        return jsonify({"error": "Failed to fetch locations", "locations": []}), 500


@jobs_bp.post("/jobs/scrape")
def jobs_scrape():
    payload = request.get_json() or {}
    url = payload.get("url", "")
    if not url:
        return jsonify({"error": "missing_url"}), 400
    try:
        from jobspy_adapter import extract as js_extract, is_supported as js_supported
    except Exception:
        return jsonify({"error": "jobspy_not_installed"}), 501
    try:
        if not js_supported(url):
            return jsonify({"error": "unsupported_domain"}), 422
        result = js_extract(url)
        if not result:
            return jsonify({"error": "extraction_failed"}), 502
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": "scrape_internal_error", "details": str(e)}), 500


@jobs_bp.route("/job-scraper/configs", methods=["GET", "POST"])
def job_scraper_configs():
    svc = getattr(current_app, "jobs_service", None)
    if not svc:
        return jsonify({"error": "Jobs service not available"}), 503
    if request.method == "GET":
        configs = svc.get_scraper_configs()
        return jsonify({"configs": configs})

    payload = request.get_json() or {}
    try:
        from app.plugins.jobspy_utils import validate_jobspy_locations  # type: ignore
        if "target_locations" in payload:
            errs = validate_jobspy_locations(payload["target_locations"])  # type: ignore
            if errs:
                return jsonify({"error": "Invalid locations", "details": errs}), 400
    except Exception:
        pass

    config_id = svc.create_scraper_config(payload)
    if not config_id:
        return jsonify({"error": "creation_failed"}), 400
    try:
        scraper = getattr(current_app, "job_scraper_service", None)
        if not scraper:
            return jsonify({"error": "Job scraper service not available"}), 503
        cfgs = svc.get_scraper_configs()
        cfg = next((c for c in cfgs if c["id"] == config_id), None)
        if cfg and cfg.get("enabled", True):
            scraper.schedule_config(cfg)
    except Exception as e:
        logger.warning(f"Could not schedule new config: {e}")
    return jsonify({"id": config_id, "status": "created"}), 201


@jobs_bp.route("/job-scraper/configs/<config_id>", methods=["GET", "PATCH", "DELETE"])
def job_scraper_config_item(config_id: str):
    svc = getattr(current_app, "jobs_service", None)
    if not svc:
        return jsonify({"error": "Jobs service not available"}), 503
    configs = svc.get_scraper_configs()
    config = next((c for c in configs if c["id"] == config_id), None)
    if not config:
        return jsonify({"error": "config_not_found"}), 404
    if request.method == "GET":
        return jsonify(config)
    if request.method == "PATCH":
        updates = request.get_json() or {}
        success = svc.update_scraper_config(config_id, updates)
        if success:
            try:
                updated = next((c for c in svc.get_scraper_configs() if c["id"] == config_id), None)
                scraper = getattr(current_app, "job_scraper_service", None)
                if updated and scraper:
                    scraper.schedule_config(updated)
            except Exception as e:
                logger.warning(f"Could not update schedule: {e}")
            return jsonify({"status": "updated"})
        return jsonify({"error": "update_failed"}), 400
    success = svc.delete_scraper_config(config_id)
    if success:
        try:
            import schedule
            schedule.clear(f"config_{config_id}")
        except Exception:
            pass
        return jsonify({"status": "deleted"})
    return jsonify({"error": "deletion_failed"}), 400


@jobs_bp.post("/job-scraper/configs/<config_id>/run")
def job_scraper_run_config(config_id: str):
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"error": "Data service not available"}), 503
    
    # Use JobsRepository to get configs
    from app.repositories.jobs import JobsRepository
    jobs_repo = JobsRepository(ds.db_path)
    configs = jobs_repo.get_scraper_configs()
    
    config = next((c for c in configs if c["id"] == config_id), None)
    if not config:
        return jsonify({"error": "config_not_found"}), 404
    scraper = getattr(current_app, "job_scraper_service", None)
    if not scraper:
        return jsonify({"error": "Job scraper service not available"}), 503

    def run_async():
        scraper.run_scrape(config)

    thread = threading.Thread(target=run_async, daemon=True)
    thread.start()
    return jsonify({"status": "started", "message": "Scrape job started in background"})


@jobs_bp.post("/job-scraper/manual-search")
def job_scraper_manual_search():
    payload = request.get_json() or {}
    for field in ["search_term", "location"]:
        if not payload.get(field):
            return jsonify({"error": f"Missing required field: {field}"}), 400
    try:
        from app.plugins.jobspy_utils import validate_jobspy_locations  # type: ignore
        errs = validate_jobspy_locations([payload.get("location")])
        if errs:
            return jsonify({"error": "Invalid location", "details": errs[0]}), 400
    except Exception:
        pass
    scraper = getattr(current_app, "job_scraper_service", None)
    if not scraper:
        return jsonify({"error": "Job scraper service not available"}), 503
    try:
        results = scraper.manual_search(payload)
        import math
        def clean(obj):
            if isinstance(obj, dict):
                return {k: clean(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [clean(x) for x in obj]
            if isinstance(obj, float) and math.isnan(obj):
                return None
            return obj
        cleaned = clean(results)
        return jsonify({"jobs": cleaned, "count": len(cleaned)})
    except Exception as e:
        logger.error(f"Manual search failed: {e}", exc_info=True)
        return jsonify({"error": "Search failed", "details": str(e)}), 500


@jobs_bp.get("/job-scraper/valid-countries")
def job_scraper_valid_countries():
    from app.plugins.jobspy_utils import VALID_JOBSPY_COUNTRIES  # type: ignore
    return jsonify({"countries": sorted(list(VALID_JOBSPY_COUNTRIES)), "count": len(VALID_JOBSPY_COUNTRIES)})


@jobs_bp.post("/job-scraper/import-jobs")
def job_scraper_import_jobs():
    scraper = getattr(current_app, "job_scraper_service", None)
    if not scraper:
        return jsonify({"error": "Job scraper service not available"}), 503
    payload = request.get_json() or {}
    job_selections = payload.get("jobs", [])
    if not job_selections:
        return jsonify({"error": "no_jobs_selected"}), 400
    try:
        stats = scraper.import_selected_jobs(job_selections)
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Job import failed: {e}", exc_info=True)
        return jsonify({"error": "import_failed", "details": str(e)}), 500


@jobs_bp.get("/job-scraper/runs")
def job_scraper_runs():
    ds = getattr(current_app, "data_service", None)
    if not ds:
        return jsonify({"error": "Data service not available"}), 503
    config_id = request.args.get("config_id")
    limit = int(request.args.get("limit", 50))
    runs = getattr(current_app, "jobs_service", None).get_scraper_runs_history(config_id, limit)  # type: ignore
    return jsonify({"runs": runs})


@jobs_bp.get("/job-scraper/status")
def job_scraper_status():
    svc = getattr(current_app, "jobs_service", None)
    if not svc:
        return jsonify({"error": "Jobs service not available"}), 503
    scraper = getattr(current_app, "job_scraper_service", None)
    if not scraper:
        return jsonify({
            "running": False,
            "active_configs": 0,
            "total_configs": len(svc.get_scraper_configs()),
            "error": "Service not available",
        })
    return jsonify(
        {
            "running": scraper.running,
            "active_configs": len([c for c in svc.get_scraper_configs() if c.get("enabled", True)]),
            "total_configs": len(svc.get_scraper_configs()),
        }
    )

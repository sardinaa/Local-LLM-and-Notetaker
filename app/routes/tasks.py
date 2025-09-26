from __future__ import annotations

from flask import Blueprint, request, jsonify, send_file, current_app
import os
import uuid
import logging


logger = logging.getLogger(__name__)
tasks_bp = Blueprint("tasks", __name__)


@tasks_bp.post("/tasks/quick-create")
def quick_create_task():
    """Quick task creation from natural language input."""
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503

    try:
        data = request.get_json() or {}
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "Text input is required"}), 400

        auto_save = data.get("auto_save", True)
        result = task_service.quick_create_task(text, auto_save=auto_save)

        if result.get("success"):
            return jsonify({
                "status": "success",
                "task": result.get("created_task"),
                "parsed": result.get("parsed"),
                "preview": result.get("preview"),
                "confidence": result.get("parsed", {}).get("confidence", 0.0),
            })
        else:
            return (
                jsonify(
                    {
                        "status": "error",
                        "error": result.get("error", "Unknown error"),
                        "parsed": result.get("parsed"),
                        "preview": result.get("preview"),
                    }
                ),
                400,
            )
    except Exception as e:
        logger.exception("Error in quick_create_task")
        return jsonify({"error": "Failed to create task"}), 500


@tasks_bp.post("/tasks/parse-preview")
def parse_task_preview():
    """Parse text and return preview without saving."""
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503

    try:
        data = request.get_json() or {}
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "Text input is required"}), 400

        result = task_service.parse_text_preview(text)
        return jsonify(
            {
                "status": "success",
                "parsed": result.get("parsed"),
                "preview": result.get("preview"),
                "confidence": result.get("confidence", 0.0),
            }
        )
    except Exception:
        logger.exception("Error in parse_task_preview")
        return jsonify({"error": "Failed to parse text"}), 500


@tasks_bp.route("/tasks", methods=["GET", "POST"])
def manage_tasks():
    """List or create tasks."""
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503

    try:
        if request.method == "GET":
            filters: dict = {}

            # Status filter
            if request.args.get("status"):
                status_values = request.args.get("status").split(",")
                filters["status"] = status_values if len(status_values) > 1 else status_values[0]

            # Priority filter
            if request.args.get("priority"):
                priority_values = request.args.get("priority").split(",")
                filters["priority"] = (
                    priority_values if len(priority_values) > 1 else priority_values[0]
                )

            # Date filters
            if request.args.get("due_today") == "true":
                filters["due_today"] = True
            if request.args.get("due_this_week") == "true":
                filters["due_this_week"] = True
            if request.args.get("overdue") == "true":
                filters["overdue"] = True

            # Search query
            if request.args.get("q"):
                filters["q"] = request.args.get("q")

            # Tag filters
            if request.args.get("any_tags"):
                filters["any_tags"] = request.args.get("any_tags").split(",")
            if request.args.get("all_tags"):
                filters["all_tags"] = request.args.get("all_tags").split(",")

            # Sorting
            if request.args.get("order_by"):
                filters["order_by"] = request.args.get("order_by")

            tasks = task_service.list_tasks(filters, limit=200)
            return jsonify({"tasks": tasks})

        # POST - create task
        data = request.get_json() or {}
        created = task_service.create_task(data)
        if created:
            return jsonify({"task": created})
        return jsonify({"error": "Failed to create task"}), 400
    except Exception:
        logger.exception("Error in manage_tasks")
        return jsonify({"error": "Failed to process request"}), 500


@tasks_bp.route("/tasks/<task_id>", methods=["GET", "PUT", "DELETE"])
def manage_task_item(task_id: str):
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503

    try:
        if request.method == "GET":
            task = task_service.get_task(task_id)
            if task:
                return jsonify({"task": task})
            return jsonify({"error": "Not found"}), 404
        elif request.method == "PUT":
            updates = request.get_json() or {}
            updated = task_service.update_task(task_id, updates)
            if updated:
                return jsonify({"task": updated})
            return jsonify({"error": "Update failed"}), 400
        else:  # DELETE
            ok = task_service.delete_task(task_id)
            return jsonify({"deleted": ok}), (200 if ok else 404)
    except Exception:
        logger.exception("Error managing task item")
        return jsonify({"error": "Failed"}), 500


@tasks_bp.post("/tasks/<task_id>/complete")
def complete_task(task_id: str):
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503

    try:
        updated = task_service.mark_task_complete(task_id)
        if updated:
            return jsonify({"task": updated})
        return jsonify({"error": "Failed to complete task"}), 400
    except Exception:
        logger.exception("Error completing task")
        return jsonify({"error": "Failed"}), 500


@tasks_bp.get("/tasks/stats")
def task_stats():
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        stats = task_service.get_task_stats()
        return jsonify({"stats": stats})
    except Exception:
        logger.exception("Error getting task stats")
        return jsonify({"error": "Failed to get stats"}), 500


@tasks_bp.get("/tasks/today")
def tasks_today():
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        grouped_tasks = task_service.get_today_tasks()
        return jsonify({"groups": grouped_tasks})
    except Exception:
        logger.exception("Error getting today tasks")
        return jsonify({"error": "Failed"}), 500


@tasks_bp.get("/tasks/overdue")
def tasks_overdue():
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        return jsonify({"tasks": task_service.get_overdue_tasks()})
    except Exception:
        logger.exception("Error getting overdue tasks")
        return jsonify({"error": "Failed"}), 500


@tasks_bp.get("/tasks/search")
def search_tasks():
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        q = (request.args.get("q") or "").strip()
        return jsonify({"tasks": task_service.search_tasks(q)})
    except Exception:
        logger.exception("Error searching tasks")
        return jsonify({"error": "Failed"}), 500


@tasks_bp.get("/tasks/by-tag/<tag_id>")
def tasks_by_tag(tag_id: str):
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        return jsonify({"tasks": task_service.get_tasks_by_tag(tag_id)})
    except Exception:
        logger.exception("Error listing tasks by tag")
        return jsonify({"error": "Failed"}), 500

@tasks_bp.get("/tasks/next-7-days")
def tasks_next_7_days():
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        return jsonify({"tasks": task_service.get_next_7_days_tasks()})
    except Exception:
        logger.exception("Error getting next 7 days tasks")
        return jsonify({"error": "Failed"}), 500

@tasks_bp.get("/tasks/inbox")
def tasks_inbox():
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        return jsonify({"tasks": task_service.get_inbox_tasks()})
    except Exception:
        logger.exception("Error getting inbox tasks")
        return jsonify({"error": "Failed"}), 500

@tasks_bp.get("/tasks/eisenhower")
def tasks_eisenhower():
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        return jsonify({"quadrants": task_service.get_tasks_by_urgency_importance()})
    except Exception:
        logger.exception("Error getting Eisenhower matrix tasks")
        return jsonify({"error": "Failed"}), 500

@tasks_bp.get("/tasks/counts")
def task_counts():
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        return jsonify({"counts": task_service.get_task_counts_by_view()})
    except Exception:
        logger.exception("Error getting task counts")
        return jsonify({"error": "Failed"}), 500


@tasks_bp.post("/tasks/generate-recurring")
def generate_recurring():
    task_service = getattr(current_app, "task_service", None)
    if not task_service:
        return jsonify({"error": "Task service not available"}), 503
    try:
        data = request.get_json() or {}
        days = int(data.get("days_ahead", 7))
        result = task_service.generate_recurring_tasks(days)
        return jsonify(result)
    except Exception:
        logger.exception("Error generating recurring tasks")
        return jsonify({"error": "Failed"}), 500


@tasks_bp.post("/tasks/files")
def upload_task_files():
    """Upload one or multiple files and attach to a task.

    This mirrors the existing behavior in app.py for continuity.
    """
    data_service = getattr(current_app, "data_service", None)
    tasks_repo = getattr(current_app, "tasks_repo", None)
    notes_repo = getattr(current_app, "notes_repo", None)
    if not data_service or not tasks_repo or not notes_repo:
        return jsonify({"success": False, "error": "Repositories not available"}), 503

    try:
        task_id = request.form.get("task_id")
        if not task_id:
            return jsonify({"success": False, "error": "task_id is required"}), 400

        # Validate task exists
        task = tasks_repo.get_task(task_id)
        if not task:
            return jsonify({"success": False, "error": "Task not found"}), 404

        uploaded_files = []
        if "files" not in request.files:
            return jsonify({"success": False, "error": "No files uploaded"}), 400

        for file in request.files.getlist("files"):
            if not file.filename:
                continue

            uploads_dir = os.path.join("uploads", "tasks", task_id)
            os.makedirs(uploads_dir, exist_ok=True)

            file_id = str(uuid.uuid4())
            filename = file.filename
            stored_path = os.path.join(uploads_dir, f"{file_id}_{filename}")
            file.save(stored_path)

            record = tasks_repo.add_task_file(
                task_id,
                {
                    "id": file_id,
                    "original_name": filename,
                    "file_path": stored_path,
                    "mime_type": file.mimetype,
                },
            )
            if record:
                uploaded_files.append(record)

        return jsonify({
            "success": True,
            "files": uploaded_files,
            "message": f"Uploaded {len(uploaded_files)} files",
        })
    except Exception:
        logger.exception("Error uploading task files")
        return jsonify({"success": False, "error": "Failed to upload files"}), 500


@tasks_bp.delete("/tasks/<task_id>/files/<file_id>")
def delete_task_file(task_id: str, file_id: str):
    tasks_repo = getattr(current_app, "tasks_repo", None)
    if not tasks_repo:
        return jsonify({"success": False, "error": "Task repository not available"}), 503
    try:
        from flask import current_app
        data_service = getattr(current_app, "data_service", None)
        task = tasks_repo.get_task(task_id)
        if not task:
            return jsonify({"success": False, "error": "Task not found"}), 404

        task_files = tasks_repo.get_task_files(task_id)
        file_to_delete = None
        for f in task_files:
            if f["id"] == file_id:
                file_to_delete = f
                break
        if not file_to_delete:
            return jsonify({"success": False, "error": "File not found"}), 404

        if tasks_repo.remove_task_file(task_id, file_id):
            try:
                if os.path.exists(file_to_delete["file_path"]):
                    os.unlink(file_to_delete["file_path"])
            except Exception:
                logger.warning("Could not delete physical file", exc_info=True)
            return jsonify({"success": True, "message": "File deleted"})
        else:
            return jsonify({"success": False, "error": "Failed to delete file"}), 500
    except Exception:
        logger.exception("Error deleting task file")
        return jsonify({"success": False, "error": "Failed to delete file"}), 500


@tasks_bp.get("/files/<file_id>/download")
def download_file(file_id: str):
    tasks_repo = getattr(current_app, "tasks_repo", None)
    if not tasks_repo:
        return jsonify({"success": False, "error": "Task repository not available"}), 503
    try:
        file_record = tasks_repo.get_file_by_id(file_id)
        if not file_record:
            return jsonify({"success": False, "error": "File not found"}), 404

        file_path = file_record["file_path"]
        original_name = file_record.get("original_name", file_record.get("filename", "download"))
        if not os.path.exists(file_path):
            return jsonify({"success": False, "error": "File not found on disk"}), 404

        return send_file(
            file_path,
            as_attachment=True,
            download_name=original_name,
            mimetype=file_record.get("mime_type", "application/octet-stream"),
        )
    except Exception:
        logger.exception("Error downloading file")
        return jsonify({"success": False, "error": "Failed to download file"}), 500


@tasks_bp.post("/tasks/<task_id>/notes")
def add_task_note_references(task_id: str):
    data_service = getattr(current_app, "data_service", None)
    tasks_repo = getattr(current_app, "tasks_repo", None)
    notes_repo = getattr(current_app, "notes_repo", None)
    if not data_service or not tasks_repo or not notes_repo:
        return jsonify({"success": False, "error": "Task repository not available"}), 503
    try:
        data = request.get_json() or {}
        note_ids = data.get("note_ids", [])
        if not note_ids:
            return jsonify({"success": False, "error": "No note IDs provided"}), 400

        task = tasks_repo.get_task(task_id)
        if not task:
            return jsonify({"success": False, "error": "Task not found"}), 404

        for note_id in note_ids:
            note = notes_repo.get_node(note_id)
            if not note or note.get("type") != "note":
                return jsonify({"success": False, "error": f"Note {note_id} not found"}), 404

        if tasks_repo.add_task_note_references(task_id, note_ids):
            return jsonify({"success": True, "message": f"Added {len(note_ids)} note references"})
        else:
            return jsonify({"success": False, "error": "Failed to add note references"}), 500
    except Exception:
        logger.exception("Error adding task note references")
        return jsonify({"success": False, "error": "Failed to add note references"}), 500


@tasks_bp.delete("/tasks/<task_id>/notes/<note_id>")
def remove_task_note_reference(task_id: str, note_id: str):
    tasks_repo = getattr(current_app, "tasks_repo", None)
    if not tasks_repo:
        return jsonify({"success": False, "error": "Task repository not available"}), 503
    try:
        task = tasks_repo.get_task(task_id)
        if not task:
            return jsonify({"success": False, "error": "Task not found"}), 404

        if tasks_repo.remove_task_note_reference(task_id, note_id):
            return jsonify({"success": True, "message": "Note reference removed"})
        else:
            return jsonify({"success": False, "error": "Note reference not found or failed to remove"}), 404
    except Exception:
        logger.exception("Error removing task note reference")
        return jsonify({"success": False, "error": "Failed to remove note reference"}), 500


@tasks_bp.get("/notes/list")
def list_notes_for_selection():
    notes_repo = getattr(current_app, "notes_repo", None)
    if not notes_repo:
        return jsonify({"success": False, "error": "Notes repository not available"}), 503
    try:
        search_query = (request.args.get("q") or "").strip()
        notes = notes_repo.get_all_notes_for_selection(search_query if search_query else None)
        return jsonify({"success": True, "notes": notes})
    except Exception:
        logger.exception("Error listing notes for selection")
        return jsonify({"success": False, "error": "Failed to list notes"}), 500

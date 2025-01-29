from flask import Flask, render_template, request, jsonify, send_from_directory
import os
from core.database.notes_db import NotesDatabase
import json
import requests

app = Flask(__name__, static_folder='static')
app.config["DATABASE"] = "notes.db"
notes_db = NotesDatabase(app.config["DATABASE"])
# En app.py, justo después de inicializar notes_db
with app.app_context():
    notes_db.create_tables()

# ========== RUTAS PRINCIPALES ==========
@app.route("/")
def home():
    folders_and_notes = notes_db.get_folders_with_children()
    return render_template("index.html", folder=folders_and_notes)

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route("/get_folders_and_notes", methods=["GET"])
def get_folders_and_notes():
    return jsonify(notes_db.get_folders_with_children())

# ========== OPERACIONES CRUD ==========
@app.route("/create_folder", methods=["POST"])
def create_folder():
    data = request.json
    new_folder = notes_db.create_folder(data["name"], data.get("parent_id"))
    return jsonify(new_folder), 201

@app.route("/create_note", methods=["POST"])
def create_note():
    data = request.json
    new_note = notes_db.create_note(data["name"], data.get("folder_id"))
    return jsonify(new_note), 201

@app.route("/get_note/<int:note_id>", methods=["GET"])
def get_note(note_id):
    note = notes_db.get_note_by_id(note_id)
    if note:
        return jsonify({"id": note["id"], "name": note["name"], "content": note["content"]})
    return jsonify({"error": "Note not found"}), 404

@app.route("/delete_folder/<int:folder_id>", methods=["POST"])
def delete_folder(folder_id):
    notes_db.delete_folder(folder_id)
    return jsonify({"success": True}), 200

@app.route("/delete_note/<int:note_id>", methods=["POST"])
def delete_note(note_id):
    notes_db.delete_note(note_id)
    return jsonify({"success": True}), 200

@app.route("/rename_folder/<int:folder_id>", methods=["POST"])
def rename_folder(folder_id):
    new_name = request.json["name"]
    notes_db.rename_folder(folder_id, new_name)
    return "", 204

@app.route("/rename_note/<int:note_id>", methods=["POST"])
def rename_note(note_id):
    new_name = request.json["name"]
    notes_db.rename_note(note_id, new_name)
    return "", 204

@app.route("/update_note/<int:note_id>", methods=["POST"])
def update_note(note_id):
    data = request.json
    if "content" not in data:
        return jsonify({"error": "Missing 'content' in request"}), 400

    try:
        # Validate content structure
        content = json.dumps(data["content"])
        notes_db.update_note_content(note_id, content)
        return jsonify({"success": True}), 200  # Return valid JSON
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/move_folder/<int:folder_id>", methods=["POST"])
def move_folder(folder_id):
    data = request.json
    notes_db.update_folder_parent(folder_id, data["parent_id"])
    return "", 204

@app.route("/move_note/<int:note_id>", methods=["POST"])
def move_note(note_id):
    data = request.json
    notes_db.update_note_folder(note_id, data["folder_id"])
    return "", 204

@app.route("/uploadFile", methods=["POST"])
def upload_file():
    file = request.files.get('file')
    if file:
        upload_folder = "static/uploads"
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)  # Create the folder if it doesn't exist
        filepath = os.path.join(upload_folder, file.filename)
        file.save(filepath)
        return jsonify({"success": True, "file": {"url": f"/static/uploads/{file.filename}"}})
    return jsonify({"success": False, "message": "No file uploaded"}), 400

@app.route("/fetchUrl", methods=["POST"])
def fetch_url():
    data = request.json
    image_url = data.get("url")
    if not image_url:
        return jsonify({"success": False, "message": "URL not provided"}), 400

    # Download the file from the URL
    response = requests.get(image_url, stream=True)
    if response.status_code == 200:
        upload_folder = os.path.join("static", "uploads")
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
        # Save the file locally
        filename = os.path.basename(image_url)
        filepath = os.path.join(upload_folder, filename)
        with open(filepath, "wb") as file:
            for chunk in response.iter_content(1024):
                file.write(chunk)
        # Return the file's accessible URL
        return jsonify({"success": True, "file": {"url": f"/static/uploads/{filename}"}})
    return jsonify({"success": False, "message": "Failed to fetch URL"}), 400


if __name__ == "__main__":
    app.run(debug=True)
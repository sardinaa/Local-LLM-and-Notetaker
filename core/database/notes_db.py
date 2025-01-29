import sqlite3
from flask import g
import json

class NotesDatabase:
    def __init__(self, db_path):
        self.db_path = db_path

    def get_db(self):
        if "db" not in g:
            g.db = sqlite3.connect(self.db_path)
            g.db.row_factory = sqlite3.Row
        return g.db

    def create_tables(self):
        db = self.get_db()
        db.execute("""
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                parent_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES folders(id)
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                content TEXT,
                folder_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (folder_id) REFERENCES folders(id)
            )
        """)
        db.commit()

    def get_folders_with_children(self, parent_id=None):
        """Obtiene carpetas y notas de forma jerárquica."""
        db = self.get_db()
        folders = db.execute("""
            SELECT id, name, 'folder' as type 
            FROM folders 
            WHERE parent_id IS ? 
            ORDER BY name
        """, (parent_id,)).fetchall()

        result = []
        for folder in folders:
            folder_data = dict(folder)  # Convertir Row a diccionario
            folder_data["children"] = self.get_folders_with_children(folder["id"]) + \
                                    self.get_notes(folder["id"])
            result.append(folder_data)
        
        if parent_id is None:
            # Añadir notas sin carpeta padre al nivel raíz
            result += self.get_notes(None)
        
        return result
        
    def create_folder(self, name, parent_id=None):
        """Crea una nueva carpeta."""
        db = self.get_db()
        cursor = db.execute("""
            INSERT INTO folders (name, parent_id) 
            VALUES (?, ?)
        """, (name, parent_id))
        db.commit()
        return {
            "id": cursor.lastrowid,
            "name": name,
            "parent_id": parent_id,
            "type": "folder"
        }

    def create_note(self, name: str, folder_id: int = None):
        """Creates a new note with default content."""
        db = self.get_db()
        cursor = db.execute(
            "INSERT INTO notes (name, folder_id, content) VALUES (?, ?, ?)",
            (name, folder_id, json.dumps({"blocks": []})),
        )
        db.commit()
        return {
            "id": cursor.lastrowid,
            "name": name,
            "folder_id": folder_id,
            "content": {"blocks": []},  # Return the default content
            "type": "note"
        }


    def get_folders(self):
        """Obtiene todas las carpetas."""
        db = self.get_db()
        cursor = db.execute("SELECT id, name FROM folders ORDER BY created_at DESC")
        return cursor.fetchall()

    def get_notes(self, folder_id=None):
        """Obtiene las notas de una carpeta o las notas sin carpeta padre."""
        db = self.get_db()
        if folder_id is not None:
            # Obtener notas dentro de una carpeta específica
            notes = db.execute("""
                SELECT id, name, content, 'note' as type 
                FROM notes 
                WHERE folder_id = ? 
                ORDER BY name
            """, (folder_id,)).fetchall()
        else:
            # Obtener notas sin carpeta padre (folder_id es NULL)
            notes = db.execute("""
                SELECT id, name, content, 'note' as type 
                FROM notes 
                WHERE folder_id IS NULL 
                ORDER BY name
            """).fetchall()
        return [dict(note) for note in notes]  # Convertir cada Row a diccionario
    
    def get_note_by_id(self, note_id):
        """Fetch a note by its ID."""
        db = self.get_db()
        cursor = db.execute("SELECT id, name, content FROM notes WHERE id = ?", (note_id,))
        note = cursor.fetchone()

        if not note:
            return None

        # Ensure content is valid JSON
        content = note["content"]
        try:
            content = json.loads(content) if content else {"blocks": []}
        except json.JSONDecodeError:
            content = {"blocks": []}

        return {
            "id": note["id"],
            "name": note["name"],
            "content": content,
        }


    def delete_note(self, note_id: int):
        """Elimina una nota por su ID."""
        db = self.get_db()
        db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        self.reorder_ids("notes")
        db.commit()

    def delete_folder(self, folder_id: int):
        """Elimina una carpeta y todas las carpetas y notas que contiene."""
        db = self.get_db()

        # Obtener todas las carpetas hijas de esta carpeta
        child_folders = db.execute("SELECT id FROM folders WHERE parent_id = ?", (folder_id,)).fetchall()
        for child in child_folders:
            self.delete_folder(child["id"])  # Llamada recursiva para eliminar carpetas hijas

        # Eliminar todas las notas asociadas a esta carpeta
        db.execute("DELETE FROM notes WHERE folder_id = ?", (folder_id,))

        # Eliminar la carpeta actual
        db.execute("DELETE FROM folders WHERE id = ?", (folder_id,))

        db.commit()


    def rename_folder(self, folder_id, new_name):
        """Renombra una carpeta."""
        db = self.get_db()
        db.execute("UPDATE folders SET name = ? WHERE id = ?", (new_name, folder_id))
        db.commit()

    def rename_note(self, note_id, new_name):
        """Renombra una nota."""
        db = self.get_db()
        db.execute("UPDATE notes SET name = ? WHERE id = ?", (new_name, note_id))
        db.commit()
    
    def update_note_content(self, note_id, content):
        """Actualiza el contenido de una nota."""
        db = self.get_db()
        db.execute("UPDATE notes SET content = ? WHERE id = ?", (content, note_id))
        db.commit()

    def update_folder_parent(self, folder_id, parent_id):
        db = self.get_db()
        db.execute("UPDATE folders SET parent_id = ? WHERE id = ?", (parent_id, folder_id))
        db.commit()

    def update_note_folder(self, note_id, folder_id):
        db = self.get_db()
        db.execute("UPDATE notes SET folder_id = ? WHERE id = ?", (folder_id, note_id))
        db.commit()
    
    def reorder_ids(self, table_name):
        """Reordena los IDs de una tabla para que sean consecutivos."""
        db = self.get_db()
        rows = db.execute(f"SELECT id FROM {table_name} ORDER BY id").fetchall()
        for index, row in enumerate(rows):
            db.execute(f"UPDATE {table_name} SET id = ? WHERE id = ?", (index, row["id"]))
        db.commit()


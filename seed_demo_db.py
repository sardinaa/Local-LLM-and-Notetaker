"""
Seed a demo SQLite database for LLM‑Notetaker with example folders, notes, and chats.

Usage:
  python seed_demo_db.py                # creates instance/demo_notetaker.db
  python seed_demo_db.py path/to.db     # creates a db at the given path

Then run the app pointing to this DB (example):
  DATABASE_PATH=instance/demo_notetaker.db FLASK_ENV=development python app.py
"""

import os
import sys
from datetime import datetime, timedelta
from typing import List, Dict

from database import DatabaseManager


def editorjs_note(title: str, paragraphs: List[str], bullets: List[str] = None) -> Dict:
    blocks = []
    blocks.append({"type": "header", "data": {"text": title, "level": 2}})
    for p in paragraphs:
        blocks.append({"type": "paragraph", "data": {"text": p}})
    if bullets:
        blocks.append({"type": "list", "data": {"style": "unordered", "items": bullets}})
    return {"time": int(datetime.utcnow().timestamp() * 1000), "blocks": blocks, "version": "2.29.0"}


def chat_message(text: str, sender: str, ts: datetime, sources: List[Dict] = None) -> Dict:
    m = {"text": text, "sender": sender, "timestamp": ts.isoformat()}
    if sources:
        m["sources"] = sources
    return m


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join("instance", "demo_notetaker.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    # Remove if exists to ensure a fresh demo
    if os.path.exists(db_path):
        os.remove(db_path)

    db = DatabaseManager(db_path=db_path)

    # Root folders
    demo_root = "demo-root"
    db.create_node(demo_root, "Demo", "folder")

    notes_folder = "demo-notes"
    db.create_node(notes_folder, "Sample Notes", "folder", parent_id=demo_root)

    chats_folder = "demo-chats"
    db.create_node(chats_folder, "Sample Chats", "folder", parent_id=demo_root)

    # Notes
    note1 = "note-welcome"
    db.create_node(note1, "Welcome Tour", "note", parent_id=notes_folder)
    db.save_note_content(
        note1,
        editorjs_note(
            "Welcome to LLM‑Notetaker",
            [
                "This demo note shows how headings, paragraphs, and lists render inside the editor.",
                "Use the chat panel to ask questions, then send key parts to notes for later.",
            ],
            bullets=["Use folders to organize", "Drag to reorder", "Export as PDF when ready"],
        ),
    )

    # EditorJS Showcase note (uses all configured tools in one note)
    showcase = "note-editorjs-showcase"
    db.create_node(showcase, "EditorJS Showcase", "note", parent_id=notes_folder)
    showcase_blocks = [
        {"type": "header", "data": {"text": "EditorJS Tools Showcase", "level": 2}},
        {"type": "paragraph", "data": {"text": "This note demonstrates all EditorJS tools enabled in this app: headers, lists (ordered/unordered), quotes, tables, code blocks, and images."}},
        {"type": "header", "data": {"text": "Headers", "level": 3}},
        {"type": "header", "data": {"text": "Level 4 Example", "level": 4}},
        {"type": "paragraph", "data": {"text": "Sub‑section details go here."}},
        {"type": "header", "data": {"text": "Lists", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Unordered item A",
            "Unordered item B",
            "Nested list (visual only):\n - child 1\n - child 2"
        ]}},
        {"type": "list", "data": {"style": "ordered", "items": [
            "Ordered step 1",
            "Ordered step 2",
            "Ordered step 3"
        ]}},
        {"type": "header", "data": {"text": "Quote", "level": 3}},
        {"type": "quote", "data": {"text": "Editing content should be effortless and fast.", "caption": "Product"}},
        {"type": "header", "data": {"text": "Table", "level": 3}},
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Field", "Value"],
            ["Status", "In Progress"],
            ["Owner", "Demo"],
            ["Priority", "High"],
        ]}},
        {"type": "header", "data": {"text": "Code", "level": 3}},
        {"type": "code", "data": {"code": "function hello() {\n  console.log('Hello, EditorJS!');\n}"}},
        {"type": "header", "data": {"text": "Image", "level": 3}},
        {"type": "image", "data": {"url": "", "caption": "Image placeholder via SimpleImage tool"}},
    ]
    db.save_note_content(showcase, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": showcase_blocks, "version": "2.29.0"})

    note2 = "note-rag"
    db.create_node(note2, "RAG Workflow", "note", parent_id=notes_folder)
    db.save_note_content(
        note2,
        editorjs_note(
            "RAG (Retrieval‑Augmented Generation)",
            [
                "Attach documents to a chat to enable grounded responses.",
                "You can upload PDFs, DOCX, or CSVs and then ask questions about them.",
            ],
            bullets=["Upload documents via the + button", "Ask focused questions", "Cite sources in the chat"],
        ),
    )

    # Recipes folder and menu + recipe notes demonstrating EditorJS tools
    recipes_folder = "demo-recipes"
    db.create_node(recipes_folder, "Recipes", "folder", parent_id=demo_root)

    # Weekly Menu note (table + links as text + quotes)
    menu_note = "note-weekly-menu"
    db.create_node(menu_note, "Weekly Menu", "note", parent_id=recipes_folder)
    menu_blocks = [
        {"type": "header", "data": {"text": "Weekly Menu", "level": 2}},
        {"type": "paragraph", "data": {"text": "This menu showcases classic Spanish recipes. Open each recipe note from the tree to view full details."}},
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Day", "Recipe", "Category"],
                ["Mon", "Paella Valenciana", "Main"],
                ["Tue", "Tortilla Española", "Main"],
                ["Wed", "Gazpacho Andaluz", "Starter"],
                ["Thu", "Pisto Manchego", "Main"],
                ["Fri", "Churros con Chocolate", "Dessert"],
            ]
        }},
        {"type": "quote", "data": {"text": "Pro tip: prep sofrito on Sunday to speed up weekday cooking.", "caption": "Chef"}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Ingredients are listed in each recipe note",
            "Nutritional info table is included",
            "Steps are in ordered lists with clear timings"
        ]}},
    ]
    db.save_note_content(menu_note, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": menu_blocks, "version": "2.29.0"})

    def save_recipe(note_id: str, title: str, subtitle: str, image_caption: str, ingredients: List[str], steps: List[str], nutrition_rows: List[List[str]], tip: str):
        db.create_node(note_id, title, "note", parent_id=recipes_folder)
        blocks = []
        blocks.append({"type": "header", "data": {"text": title, "level": 2}})
        blocks.append({"type": "paragraph", "data": {"text": subtitle}})
        # Image placeholder (SimpleImage tool shows a placeholder)
        blocks.append({"type": "image", "data": {"url": "", "caption": image_caption}})
        # Ingredients
        blocks.append({"type": "header", "data": {"text": "Ingredients", "level": 3}})
        blocks.append({"type": "list", "data": {"style": "unordered", "items": ingredients}})
        # Steps
        blocks.append({"type": "header", "data": {"text": "Steps", "level": 3}})
        blocks.append({"type": "list", "data": {"style": "ordered", "items": steps}})
        # Nutrition table
        blocks.append({"type": "header", "data": {"text": "Nutrition (per serving)", "level": 3}})
        blocks.append({"type": "table", "data": {"withHeadings": True, "content": nutrition_rows}})
        # Chef tip
        blocks.append({"type": "quote", "data": {"text": tip, "caption": "Chef"}})
        # Code block example (JSON structure for the recipe)
        sample_json = {
            "title": title,
            "ingredients": ingredients,
            "steps": steps
        }
        blocks.append({"type": "code", "data": {"code": f"{sample_json}"}})

        db.save_note_content(note_id, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": blocks, "version": "2.29.0"})

    # Save several recipe notes
    save_recipe(
        "recipe-paella",
        "Paella Valenciana",
        "Saffron rice with chicken and green beans.",
        "Traditional paella pan",
        ["400g Bomba rice", "800ml stock", "Saffron", "Chicken", "Green beans", "Paprika", "Olive oil", "Salt"],
        [
            "Sear chicken until browned.",
            "Add vegetables and paprika; cook 3–4 min.",
            "Stir in rice; toast lightly.",
            "Add hot stock with saffron; do not stir.",
            "Simmer 18–20 min until rice is al dente.",
            "Rest 5 min before serving."
        ],
        [["Nutrient", "Amount"], ["Calories", "520 kcal"], ["Protein", "28 g"], ["Carbs", "58 g"], ["Fat", "20 g"]],
        "Use a wide, shallow pan for even cooking; resist stirring after stock is added."
    )

    save_recipe(
        "recipe-tortilla",
        "Tortilla Española",
        "Classic potato omelette.",
        "Golden tortilla slice",
        ["6 eggs", "500g potatoes", "1 onion (optional)", "Olive oil", "Salt"],
        [
            "Slice potatoes (and onion); soften in oil.",
            "Beat eggs; season and combine with potatoes.",
            "Cook in pan until almost set; flip to finish.",
            "Rest and slice."
        ],
        [["Nutrient", "Amount"], ["Calories", "320 kcal"], ["Protein", "14 g"], ["Carbs", "28 g"], ["Fat", "18 g"]],
        "Let the tortilla rest a few minutes for a clean slice."
    )

    save_recipe(
        "recipe-gazpacho",
        "Gazpacho Andaluz",
        "Chilled tomato and vegetable soup.",
        "Chilled bowl of gazpacho",
        ["1 kg ripe tomatoes", "1 cucumber", "1 green pepper", "1 garlic clove", "50 ml olive oil", "Sherry vinegar", "Salt"],
        [
            "Blend chopped vegetables until smooth.",
            "Add oil and vinegar; adjust salt.",
            "Chill thoroughly before serving."
        ],
        [["Nutrient", "Amount"], ["Calories", "150 kcal"], ["Protein", "3 g"], ["Carbs", "12 g"], ["Fat", "9 g"]],
        "Use ripe, flavorful tomatoes; sieve for extra silky texture."
    )

    save_recipe(
        "recipe-pisto",
        "Pisto Manchego",
        "Spanish ratatouille with eggs (optional).",
        "Skillet of pisto",
        ["1 onion", "1 courgette", "1 aubergine", "1 red pepper", "400g crushed tomatoes", "Olive oil", "Salt"],
        [
            "Sweat diced vegetables in oil until tender.",
            "Add tomatoes; simmer to reduce.",
            "Serve with fried eggs if desired."
        ],
        [["Nutrient", "Amount"], ["Calories", "220 kcal"], ["Protein", "5 g"], ["Carbs", "20 g"], ["Fat", "12 g"]],
        "Cook low and slow to concentrate flavors; finish with a splash of good olive oil."
    )

    save_recipe(
        "recipe-churros",
        "Churros con Chocolate",
        "Crispy fried dough with thick hot chocolate.",
        "Fresh churros and chocolate",
        ["250g flour", "250ml water", "1 tbsp sugar", "A pinch of salt", "Oil for frying", "Sugar & cinnamon (dusting)"],
        [
            "Boil water with sugar and salt; add flour and mix.",
            "Pipe into hot oil; fry until golden.",
            "Dust with sugar and cinnamon; serve with hot chocolate."
        ],
        [["Nutrient", "Amount"], ["Calories", "430 kcal"], ["Protein", "7 g"], ["Carbs", "58 g"], ["Fat", "18 g"]],
        "Use a star tip for classic ridges; don’t overcrowd the pan."
    )

    # Chats
    chat1 = "chat-onboarding"
    db.create_node(chat1, "Getting Started", "chat", parent_id=chats_folder)
    msgs1: List[Dict] = []
    now = datetime.utcnow()
    msgs1.append(chat_message("How do I use this app?", "user", now - timedelta(minutes=15)))
    msgs1.append(
        chat_message(
            "You can create notes on the left and chat on the right. Try sending useful replies to notes using the Share button.",
            "bot",
            now - timedelta(minutes=14),
        )
    )
    msgs1.append(chat_message("Can I organize notes into folders?", "user", now - timedelta(minutes=12)))
    msgs1.append(
        chat_message(
            "Yes — create folders, drag notes to reorder, and rename as needed.",
            "bot",
            now - timedelta(minutes=11),
        )
    )
    db.save_chat_messages(chat1, msgs1)

    chat2 = "chat-web-search"
    db.create_node(chat2, "Spain News (Demo)", "chat", parent_id=chats_folder)
    msgs2: List[Dict] = []
    msgs2.append(chat_message("Últimas noticias en España hoy", "user", now - timedelta(minutes=9)))
    demo_sources = [
        {"title": "El País", "url": "https://elpais.com/", "quality": "high"},
        {"title": "RTVE", "url": "https://www.rtve.es/", "quality": "high"},
        {"title": "20minutos", "url": "https://www.20minutos.es/", "quality": "medium"},
    ]
    bot_text = (
        "Resumen de titulares destacados de hoy en medios españoles.\n\n"
        "- Gobierno y oposición debaten nuevas medidas económicas.\n"
        "- Actualización sobre movilidad y clima en grandes ciudades.\n\n"
        "Sources:\n"
        "  1. El País - https://elpais.com/\n"
        "  2. RTVE - https://www.rtve.es/\n"
        "  3. 20minutos - https://www.20minutos.es/\n"
    )
    msgs2.append(chat_message(bot_text, "bot", now - timedelta(minutes=8), sources=demo_sources))
    db.save_chat_messages(chat2, msgs2)

    chat3 = "chat-coding"
    db.create_node(chat3, "Code Help", "chat", parent_id=chats_folder)
    msgs3: List[Dict] = []
    msgs3.append(chat_message("Show a Python example that reads a CSV", "user", now - timedelta(minutes=6)))
    code_reply = (
        "```python\nimport csv\n\nwith open('data.csv', newline='') as f:\n    reader = csv.DictReader(f)\n    for row in reader:\n        print(row)\n```\n\n"
        "Tip: you can copy code with the copy icon on the block."
    )
    msgs3.append(chat_message(code_reply, "bot", now - timedelta(minutes=5)))
    db.save_chat_messages(chat3, msgs3)

    print(f"Demo database created: {db_path}")


if __name__ == "__main__":
    main()

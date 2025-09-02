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

    # Documentation folder
    docs_folder = "demo-docs"
    db.create_node(docs_folder, "Documentation", "folder", parent_id=demo_root)

    # -----------------------------
    # Tags (global registry)
    # -----------------------------
    # Define some useful demo tags with colors from the UI palette
    demo_tags = [
        {"id": "tag-onboarding", "name": "Onboarding", "color": "blue"},
        {"id": "tag-guide", "name": "Guide", "color": "gray"},
        {"id": "tag-editorjs", "name": "EditorJS", "color": "purple"},
        {"id": "tag-rag", "name": "RAG", "color": "orange"},
        {"id": "tag-recipes", "name": "Recipes", "color": "green"},
        {"id": "tag-main", "name": "Main", "color": "brown"},
        {"id": "tag-starter", "name": "Starter", "color": "yellow"},
        {"id": "tag-dessert", "name": "Dessert", "color": "pink"},
        {"id": "tag-spanish", "name": "Spanish", "color": "red"},
        {"id": "tag-links", "name": "Links", "color": "blue"},
        {"id": "tag-cooking", "name": "Cooking", "color": "brown"},
        {"id": "tag-howto", "name": "How-To", "color": "green"},
        {"id": "tag-template", "name": "Template", "color": "gray"},
        {"id": "tag-research", "name": "Research", "color": "purple"},
        {"id": "tag-faq", "name": "FAQ", "color": "yellow"},
        {"id": "tag-productivity", "name": "Productivity", "color": "blue"},
        # More cuisine and recipe tags for agent testing
        {"id": "tag-italian", "name": "Italian", "color": "green"},
        {"id": "tag-french", "name": "French", "color": "blue"},
        {"id": "tag-asian", "name": "Asian", "color": "orange"},
        {"id": "tag-mexican", "name": "Mexican", "color": "red"},
        {"id": "tag-indian", "name": "Indian", "color": "yellow"},
        {"id": "tag-greek", "name": "Greek", "color": "purple"},
        {"id": "tag-american", "name": "American", "color": "brown"},
        {"id": "tag-vegetarian", "name": "Vegetarian", "color": "green"},
        {"id": "tag-vegan", "name": "Vegan", "color": "green"},
        {"id": "tag-gluten-free", "name": "Gluten-Free", "color": "yellow"},
        {"id": "tag-quick", "name": "Quick", "color": "orange"},
        {"id": "tag-comfort-food", "name": "Comfort Food", "color": "brown"},
        {"id": "tag-healthy", "name": "Healthy", "color": "green"},
        {"id": "tag-spicy", "name": "Spicy", "color": "red"},
        {"id": "tag-pasta", "name": "Pasta", "color": "yellow"},
        {"id": "tag-rice", "name": "Rice", "color": "brown"},
        {"id": "tag-bread", "name": "Bread", "color": "brown"},
        {"id": "tag-soup", "name": "Soup", "color": "blue"},
        {"id": "tag-salad", "name": "Salad", "color": "green"},
        {"id": "tag-sandwich", "name": "Sandwich", "color": "yellow"},
    ]
    for t in demo_tags:
        # create_tag is idempotent by name, but we provide stable ids for demos
        db.create_tag(t)

    # Notes
    note1 = "note-welcome"
    db.create_node(note1, "Welcome Tour", "note", parent_id=notes_folder)
    # Include inline internal links (note links) and an external hyperlink example.
    # Note: The editor supports in-content anchors with class="note-link".
    welcome_blocks = [
        {"type": "header", "data": {"text": "Welcome to LLM‑Notetaker", "level": 2}},
        {"type": "paragraph", "data": {"text": "This demo shows headings, paragraphs, lists, tags, and links. Explore the samples to learn faster."}},
        {"type": "paragraph", "data": {"text": (
            "Try opening other notes directly: "
            "<a href=\"#note:note-editorjs-showcase\" class=\"note-link\" data-note-id=\"note-editorjs-showcase\">EditorJS Showcase</a>, "
            "<a href=\"#note:note-rag\" class=\"note-link\" data-note-id=\"note-rag\">RAG Workflow</a>, "
            "the <a href=\"#note:note-weekly-menu\" class=\"note-link\" data-note-id=\"note-weekly-menu\">Weekly Menu</a>, "
            "or the <a href=\"#note:note-best-practices\" class=\"note-link\" data-note-id=\"note-best-practices\">Note Best Practices</a>."
        )}},
        {"type": "paragraph", "data": {"text": (
            "External link example: <a href=\"https://editorjs.io/\" target=\"_blank\" rel=\"noopener\">EditorJS Docs</a>."
        )}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Use folders to organize",
            "Drag to reorder",
            "Export as PDF when ready",
            "Tag notes using the tag button near the title",
            "Create inline links between notes via the book icon in the inline toolbar",
        ]}},
    ]
    db.save_note_content(note1, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": welcome_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(note1, [
        "tag-onboarding", "tag-guide", "tag-links"
    ])

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
        {"type": "image", "data": {"url": "", "caption": "Image placeholder via SimpleImage tool", "withBorder": False, "withBackground": False, "stretched": False}},
    ]
    db.save_note_content(showcase, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": showcase_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(showcase, ["tag-editorjs", "tag-guide"]) 

    # Best practices note
    best = "note-best-practices"
    db.create_node(best, "Note Best Practices", "note", parent_id=notes_folder)
    best_blocks = [
        {"type": "header", "data": {"text": "Organize, Tag, Link", "level": 2}},
        {"type": "paragraph", "data": {"text": (
            "Good notes are scannable and connected. Prefer short sections, clear headings, and links to related notes like "
            "<a href=\"#note:note-links-demo\" class=\"note-link\" data-note-id=\"note-links-demo\">Links & References</a>."
        )}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "One topic per note, cross-link to details",
            "Use 2–3 relevant tags (not 10)",
            "Start with a TL;DR section when notes are long",
            "Add a References section with external links",
        ]}},
        {"type": "header", "data": {"text": "Example Structure", "level": 3}},
        {"type": "code", "data": {"code": (
            "# Title\n\nTL;DR: one-paragraph summary.\n\n## Key points\n- ...\n\n## Details\n- ...\n\n## References\n- [Link](https://example.com)\n"
        )}},
    ]
    db.save_note_content(best, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": best_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(best, ["tag-guide", "tag-productivity"]) 

    # How-To Template note
    howto = "note-howto-template"
    db.create_node(howto, "How-To Template", "note", parent_id=notes_folder)
    howto_blocks = [
        {"type": "header", "data": {"text": "How-To Template", "level": 2}},
        {"type": "paragraph", "data": {"text": "Use this template to create step-by-step guides."}},
        {"type": "header", "data": {"text": "Goal", "level": 3}},
        {"type": "paragraph", "data": {"text": "Describe the outcome and target audience."}},
        {"type": "header", "data": {"text": "Prerequisites", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": ["Accounts/permissions", "Required tools", "Sample data"]}},
        {"type": "header", "data": {"text": "Steps", "level": 3}},
        {"type": "list", "data": {"style": "ordered", "items": ["Step 1", "Step 2", "Step 3"]}},
        {"type": "header", "data": {"text": "Troubleshooting", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "If X fails, check logs at ...",
            "If Y is slow, try reducing ..."
        ]}},
        {"type": "paragraph", "data": {"text": (
            "See also: <a href=\"#note:note-editorjs-showcase\" class=\"note-link\" data-note-id=\"note-editorjs-showcase\">EditorJS Showcase</a>"
        )}},
    ]
    db.save_note_content(howto, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": howto_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(howto, ["tag-template", "tag-howto"]) 

    # Research Log Template
    research = "note-research-log"
    db.create_node(research, "Research Log (Template)", "note", parent_id=notes_folder)
    research_blocks = [
        {"type": "header", "data": {"text": "Research Log", "level": 2}},
        {"type": "paragraph", "data": {"text": "Track experiments, sources, and findings. Duplicate this note for each topic."}},
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Date", "Question", "Method", "Result", "Next"],
            ["2025-08-17", "How to structure notes?", "Compare tools", "Adopt EditorJS", "Link templates"],
        ]}},
        {"type": "header", "data": {"text": "References", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "https://editorjs.io/",
            "https://refactoring.guru/",
        ]}},
    ]
    db.save_note_content(research, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": research_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(research, ["tag-research", "tag-links"]) 

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
    db.assign_tags_to_note(note2, ["tag-rag", "tag-guide"]) 

    # Links demo note (internal + external)
    note_links = "note-links-demo"
    db.create_node(note_links, "Links & References", "note", parent_id=notes_folder)
    links_blocks = [
        {"type": "header", "data": {"text": "Linking Notes & External References", "level": 2}},
        {"type": "paragraph", "data": {"text": (
            "You can create internal links to other notes. Select text in the editor and use the inline book icon to pick a note."
        )}},
        {"type": "paragraph", "data": {"text": (
            "Example internal jump: <a href=\"#note:recipe-paella\" class=\"note-link\" data-note-id=\"recipe-paella\">Paella Valenciana</a> or "
            "<a href=\"#note:recipe-churros\" class=\"note-link\" data-note-id=\"recipe-churros\">Churros con Chocolate</a>."
        )}},
        {"type": "paragraph", "data": {"text": (
            "External references are supported too: "
            "<a href=\"https://www.wikipedia.org/\" target=\"_blank\" rel=\"noopener\">Wikipedia</a>, "
            "<a href=\"https://www.seriouseats.com/\" target=\"_blank\" rel=\"noopener\">Serious Eats</a>."
        )}},
        {"type": "paragraph", "data": {"text": (
            "Tip: you can also paste links directly; the app will preserve them on export."
        )}},
        {"type": "code", "data": {"code": (
            "<!-- Internal note link structure -->\n"
            "<a href=\"#note:NOTE_ID\" class=\"note-link\" data-note-id=\"NOTE_ID\">Link Text</a>\n"
        )}},
        {"type": "quote", "data": {"text": "Tip: use tags to categorize notes and then search by tags.", "caption": "Product"}},
    ]
    db.save_note_content(note_links, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": links_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(note_links, ["tag-links", "tag-guide"]) 

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
    db.assign_tags_to_note(menu_note, ["tag-recipes", "tag-spanish"]) 

    def save_recipe(note_id: str, title: str, subtitle: str, image_caption: str, ingredients: List[str], steps: List[str], nutrition_rows: List[List[str]], tip: str, recipe_tags: List[str]):
        db.create_node(note_id, title, "note", parent_id=recipes_folder)
        blocks = []
        blocks.append({"type": "header", "data": {"text": title, "level": 2}})
        blocks.append({"type": "paragraph", "data": {"text": subtitle}})
        
        # Use actual image URLs from the images folder
        image_filename = title.lower().replace(" ", "-").replace("(", "").replace(")", "").replace("'", "").replace("ñ", "n").replace("ó", "o").replace("é", "e").replace("í", "i").replace("á", "a").replace("ú", "u")
        # Map some special cases
        image_mapping = {
            "paella-valenciana": "paella-valenciana.jpg",
            "tortilla-española": "tortilla-espanola.jpg", 
            "gazpacho-andaluz": "gazpacho-andaluz.jpg",
            "pisto-manchego": "pisto-manchego.jpg",
            "churros-con-chocolate": "churros-con-chocolate.jpg",
            "spaghetti-carbonara": "spaghetti-carbonara.jpg",
            "pizza-margherita": "pizza-margherita.jpg",
            "risotto-ai-funghi": "risotto-ai-funghi.jpg",
            "tiramisu": "tiramisu.jpg",
            "coq-au-vin": "coq-au-vin.jpg",
            "ratatouille": "ratatouille.jpg",
            "french-onion-soup": "french-onion-soup.jpg",
            "pad-thai": "pad-thai.jpg",
            "fried-rice": "fried-rice.jpg",
            "miso-soup": "miso-soup.jpg",
            "tacos-al-pastor": "tacos-al-pastor.jpg",
            "guacamole": "guacamole.jpg",
            "butter-chicken": "butter-chicken.jpg",
            "dal-lentil-curry": "dal-lentils.jpg",
            "mac-and-cheese": "mac-and-cheese.jpg",
            "bbq-ribs": "bbq-ribs.jpg",
            "moussaka": "moussaka.jpg",
            "greek-salad-horiatiki": "greek-salad.jpg"
        }
        
        image_file = image_mapping.get(image_filename, f"{image_filename}.jpg")
        image_url = f"/static/images/{image_file}" if image_file else ""
        
        # Real image with actual URL
        blocks.append({"type": "image", "data": {"url": image_url, "caption": image_caption, "withBorder": False, "withBackground": False, "stretched": False}})
        
        # Ingredients
        blocks.append({"type": "header", "data": {"text": "Ingredients", "level": 3}})
        blocks.append({"type": "list", "data": {"style": "unordered", "items": ingredients}})
        # Steps
        blocks.append({"type": "header", "data": {"text": "Steps", "level": 3}})
        blocks.append({"type": "list", "data": {"style": "ordered", "items": steps}})
        # Variations & References (more depth)
        blocks.append({"type": "header", "data": {"text": "Variations", "level": 3}})
        blocks.append({"type": "list", "data": {"style": "unordered", "items": [
            "Adjust seasoning to taste",
            "Swap proteins or veggies based on availability",
            "Scale portions and timings accordingly",
        ]}})
        blocks.append({"type": "header", "data": {"text": "References", "level": 3}})
        blocks.append({"type": "list", "data": {"style": "unordered", "items": [
            "<a href=\"https://en.wikipedia.org/\" target=\"_blank\" rel=\"noopener\">Wikipedia Recipe Database</a>",
            "<a href=\"https://www.seriouseats.com/\" target=\"_blank\" rel=\"noopener\">Serious Eats Cooking Techniques</a>",
            "<a href=\"#note:note-weekly-menu\" class=\"note-link\" data-note-id=\"note-weekly-menu\">Weekly Menu Planning</a>",
        ]}})
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
        # Assign recipe-related tags
        # Ensure recipe_tags is a list
        if isinstance(recipe_tags, str):
            recipe_tags = [recipe_tags]
        tags_for_recipe = ["tag-recipes", "tag-cooking"] + recipe_tags
        db.assign_tags_to_note(note_id, tags_for_recipe)

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
        "Use a wide, shallow pan for even cooking; resist stirring after stock is added.",
        ["tag-spanish", "tag-main", "tag-rice"]
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
        "Let the tortilla rest a few minutes for a clean slice.",
        ["tag-spanish", "tag-main", "tag-vegetarian"]
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
        "Use ripe, flavorful tomatoes; sieve for extra silky texture.",
        ["tag-spanish", "tag-starter", "tag-soup", "tag-vegetarian", "tag-healthy"]
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
        "Cook low and slow to concentrate flavors; finish with a splash of good olive oil.",
        ["tag-spanish", "tag-main", "tag-vegetarian", "tag-healthy"]
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
        "Use a star tip for classic ridges; don't overcrowd the pan.",
        ["tag-spanish", "tag-dessert"]
    )

    # Italian Recipes
    save_recipe(
        "recipe-spaghetti-carbonara",
        "Spaghetti Carbonara",
        "Classic Roman pasta with eggs, cheese, and pancetta.",
        "Creamy carbonara in a bowl",
        ["400g spaghetti", "200g pancetta", "4 egg yolks", "100g Pecorino Romano", "Black pepper", "Salt"],
        [
            "Cook spaghetti until al dente.",
            "Fry pancetta until crispy.",
            "Mix egg yolks with cheese and pepper.",
            "Toss hot pasta with pancetta, then egg mixture off heat.",
            "Serve immediately."
        ],
        [["Nutrient", "Amount"], ["Calories", "650 kcal"], ["Protein", "32 g"], ["Carbs", "72 g"], ["Fat", "28 g"]],
        "Work quickly and off heat to avoid scrambling the eggs.",
        ["tag-italian", "tag-main", "tag-pasta", "tag-quick"]
    )

    save_recipe(
        "recipe-margherita-pizza",
        "Pizza Margherita",
        "Classic Neapolitan pizza with tomato, mozzarella, and basil.",
        "Wood-fired Margherita pizza",
        ["400g pizza dough", "200g crushed tomatoes", "200g fresh mozzarella", "Fresh basil", "Olive oil", "Salt"],
        [
            "Stretch dough into a circle.",
            "Spread tomato sauce, leaving a border.",
            "Add torn mozzarella and drizzle with oil.",
            "Bake in very hot oven (250°C) for 8-10 minutes.",
            "Top with fresh basil before serving."
        ],
        [["Nutrient", "Amount"], ["Calories", "420 kcal"], ["Protein", "18 g"], ["Carbs", "52 g"], ["Fat", "16 g"]],
        "Use the hottest oven possible and a pizza stone for best results.",
        ["tag-italian", "tag-main", "tag-vegetarian"]
    )

    save_recipe(
        "recipe-risotto-mushroom",
        "Risotto ai Funghi",
        "Creamy rice with mixed mushrooms and Parmesan.",
        "Creamy mushroom risotto",
        ["300g Arborio rice", "500g mixed mushrooms", "1.5L warm stock", "100ml white wine", "100g Parmesan", "Onion", "Butter", "Olive oil"],
        [
            "Sauté onions until soft, add rice and toast briefly.",
            "Add wine, stir until absorbed.",
            "Add stock one ladle at a time, stirring constantly.",
            "Sauté mushrooms separately, add to rice.",
            "Finish with butter and Parmesan."
        ],
        [["Nutrient", "Amount"], ["Calories", "480 kcal"], ["Protein", "16 g"], ["Carbs", "68 g"], ["Fat", "15 g"]],
        "Patience is key - stir constantly and add stock gradually.",
        ["tag-italian", "tag-main", "tag-rice", "tag-vegetarian"]
    )

    save_recipe(
        "recipe-tiramisu",
        "Tiramisu",
        "Coffee-flavored layered dessert with mascarpone.",
        "Elegant tiramisu slice",
        ["6 egg yolks", "500g mascarpone", "200g ladyfinger cookies", "Strong coffee", "Marsala wine", "Sugar", "Cocoa powder"],
        [
            "Whisk egg yolks with sugar until pale.",
            "Fold in mascarpone and Marsala.",
            "Dip cookies in coffee and layer with cream.",
            "Repeat layers and chill overnight.",
            "Dust with cocoa before serving."
        ],
        [["Nutrient", "Amount"], ["Calories", "520 kcal"], ["Protein", "12 g"], ["Carbs", "38 g"], ["Fat", "34 g"]],
        "Use strong espresso and chill for at least 4 hours for best texture.",
        ["tag-italian", "tag-dessert"]
    )

    # French Recipes
    save_recipe(
        "recipe-coq-au-vin",
        "Coq au Vin",
        "Chicken braised in red wine with vegetables.",
        "Rustic coq au vin in a pot",
        ["1 whole chicken", "750ml red wine", "200g bacon", "Pearl onions", "Mushrooms", "Carrots", "Thyme", "Bay leaves", "Flour"],
        [
            "Brown chicken pieces and bacon.",
            "Sauté vegetables until tender.",
            "Add wine and herbs, simmer covered 45 min.",
            "Thicken sauce with flour if needed.",
            "Serve with crusty bread."
        ],
        [["Nutrient", "Amount"], ["Calories", "580 kcal"], ["Protein", "42 g"], ["Carbs", "12 g"], ["Fat", "28 g"]],
        "Use a good-quality wine you'd drink - it makes all the difference.",
        ["tag-french", "tag-main", "tag-comfort-food"]
    )

    save_recipe(
        "recipe-ratatouille",
        "Ratatouille",
        "Provençal vegetable stew with herbs.",
        "Colorful ratatouille",
        ["2 aubergines", "2 courgettes", "2 bell peppers", "4 tomatoes", "1 onion", "4 garlic cloves", "Herbs de Provence", "Olive oil"],
        [
            "Dice all vegetables uniformly.",
            "Sauté onions and garlic until fragrant.",
            "Add vegetables in order of cooking time.",
            "Season with herbs and simmer until tender.",
            "Adjust seasoning and serve hot or cold."
        ],
        [["Nutrient", "Amount"], ["Calories", "180 kcal"], ["Protein", "4 g"], ["Carbs", "22 g"], ["Fat", "9 g"]],
        "Don't rush - let each vegetable cook properly for best flavor.",
        ["tag-french", "tag-main", "tag-vegetarian", "tag-healthy", "tag-vegan"]
    )

    save_recipe(
        "recipe-french-onion-soup",
        "French Onion Soup",
        "Rich onion soup topped with cheese and bread.",
        "Bubbling French onion soup",
        ["6 large onions", "1.5L beef stock", "125ml dry white wine", "Gruyère cheese", "Baguette slices", "Butter", "Thyme"],
        [
            "Caramelize onions slowly in butter for 45 minutes.",
            "Add wine and stock, simmer 30 minutes.",
            "Season with thyme, salt, and pepper.",
            "Top with bread and cheese, broil until bubbly.",
            "Serve immediately while cheese is melted."
        ],
        [["Nutrient", "Amount"], ["Calories", "380 kcal"], ["Protein", "18 g"], ["Carbs", "28 g"], ["Fat", "22 g"]],
        "Low and slow caramelization is the secret to deep onion flavor.",
        ["tag-french", "tag-starter", "tag-soup", "tag-comfort-food"]
    )

    # Asian Recipes
    save_recipe(
        "recipe-pad-thai",
        "Pad Thai",
        "Stir-fried rice noodles with tamarind, fish sauce, and peanuts.",
        "Authentic Pad Thai with lime",
        ["200g rice noodles", "2 eggs", "200g shrimp", "Bean sprouts", "Peanuts", "Lime", "Tamarind paste", "Fish sauce", "Sugar"],
        [
            "Soak noodles until soft, drain well.",
            "Scramble eggs, set aside.",
            "Stir-fry shrimp until pink.",
            "Add noodles, sauce, and vegetables.",
            "Toss with eggs and peanuts, serve with lime."
        ],
        [["Nutrient", "Amount"], ["Calories", "450 kcal"], ["Protein", "24 g"], ["Carbs", "58 g"], ["Fat", "14 g"]],
        "Have all ingredients prepped - this dish cooks very quickly.",
        ["tag-asian", "tag-main", "tag-quick"]
    )

    save_recipe(
        "recipe-fried-rice",
        "Fried Rice",
        "Wok-fried rice with vegetables and soy sauce.",
        "Colorful fried rice in wok",
        ["3 cups cooked rice", "3 eggs", "Mixed vegetables", "Soy sauce", "Sesame oil", "Green onions", "Garlic", "Ginger"],
        [
            "Use day-old rice for best texture.",
            "Scramble eggs and set aside.",
            "Stir-fry garlic, ginger, and vegetables.",
            "Add rice, breaking up clumps.",
            "Season with soy sauce and sesame oil."
        ],
        [["Nutrient", "Amount"], ["Calories", "320 kcal"], ["Protein", "12 g"], ["Carbs", "48 g"], ["Fat", "8 g"]],
        "High heat and day-old rice are essential for authentic texture.",
        ["tag-asian", "tag-main", "tag-rice", "tag-quick", "tag-vegetarian"]
    )

    save_recipe(
        "recipe-miso-soup",
        "Miso Soup",
        "Traditional Japanese soup with tofu and seaweed.",
        "Steaming bowl of miso soup",
        ["4 cups dashi stock", "3 tbsp miso paste", "Silken tofu", "Wakame seaweed", "Green onions"],
        [
            "Heat dashi stock gently.",
            "Whisk miso paste with small amount of stock.",
            "Add miso mixture back to pot.",
            "Add tofu and seaweed, simmer briefly.",
            "Garnish with green onions."
        ],
        [["Nutrient", "Amount"], ["Calories", "85 kcal"], ["Protein", "6 g"], ["Carbs", "8 g"], ["Fat", "3 g"]],
        "Don't boil after adding miso - it destroys the beneficial probiotics.",
        ["tag-asian", "tag-starter", "tag-soup", "tag-healthy", "tag-vegetarian"]
    )

    # Mexican Recipes
    save_recipe(
        "recipe-tacos-al-pastor",
        "Tacos al Pastor",
        "Marinated pork tacos with pineapple and cilantro.",
        "Street-style tacos al pastor",
        ["500g pork shoulder", "Pineapple", "Corn tortillas", "White onion", "Cilantro", "Lime", "Achiote paste", "Guajillo chiles"],
        [
            "Marinate pork in chile and achiote mixture overnight.",
            "Grill pork and pineapple until charred.",
            "Chop meat and pineapple finely.",
            "Warm tortillas on griddle.",
            "Assemble tacos with onion, cilantro, and lime."
        ],
        [["Nutrient", "Amount"], ["Calories", "380 kcal"], ["Protein", "28 g"], ["Carbs", "32 g"], ["Fat", "16 g"]],
        "The marinade is key - don't skip the overnight step.",
        ["tag-mexican", "tag-main", "tag-spicy"]
    )

    save_recipe(
        "recipe-guacamole",
        "Guacamole",
        "Fresh avocado dip with lime and cilantro.",
        "Fresh guacamole with tortilla chips",
        ["4 ripe avocados", "1 lime", "1 jalapeño", "1/4 cup white onion", "2 Roma tomatoes", "1/4 cup cilantro", "Salt"],
        [
            "Mash avocados with lime juice.",
            "Finely dice onion, jalapeño, and tomatoes.",
            "Fold in vegetables and cilantro.",
            "Season with salt to taste.",
            "Serve immediately or cover with plastic touching surface."
        ],
        [["Nutrient", "Amount"], ["Calories", "160 kcal"], ["Protein", "2 g"], ["Carbs", "8 g"], ["Fat", "15 g"]],
        "Save the avocado pit to prevent browning if storing.",
        ["tag-mexican", "tag-starter", "tag-vegetarian", "tag-vegan", "tag-healthy"]
    )

    # Indian Recipes
    save_recipe(
        "recipe-butter-chicken",
        "Butter Chicken",
        "Creamy tomato-based curry with tender chicken.",
        "Rich butter chicken curry",
        ["500g chicken", "400ml coconut milk", "400g crushed tomatoes", "Garam masala", "Ginger", "Garlic", "Butter", "Cream"],
        [
            "Marinate chicken in yogurt and spices.",
            "Sauté ginger and garlic in butter.",
            "Add tomatoes and spices, simmer 10 min.",
            "Add chicken and coconut milk.",
            "Finish with cream and fresh cilantro."
        ],
        [["Nutrient", "Amount"], ["Calories", "420 kcal"], ["Protein", "32 g"], ["Carbs", "12 g"], ["Fat", "28 g"]],
        "Marinating the chicken makes all the difference in tenderness.",
        ["tag-indian", "tag-main", "tag-spicy", "tag-comfort-food"]
    )

    save_recipe(
        "recipe-dal-lentils",
        "Dal (Lentil Curry)",
        "Spiced lentil curry with turmeric and cumin.",
        "Golden dal with rice",
        ["1 cup red lentils", "Turmeric", "Cumin seeds", "Onion", "Tomatoes", "Ginger", "Garlic", "Cilantro", "Ghee"],
        [
            "Rinse lentils and boil with turmeric until soft.",
            "Temper spices in ghee until fragrant.",
            "Add onions and cook until golden.",
            "Add tomatoes and cook until broken down.",
            "Combine with lentils and simmer."
        ],
        [["Nutrient", "Amount"], ["Calories", "220 kcal"], ["Protein", "12 g"], ["Carbs", "32 g"], ["Fat", "6 g"]],
        "Tempering the spices releases maximum flavor - don't skip this step.",
        ["tag-indian", "tag-main", "tag-vegetarian", "tag-vegan", "tag-healthy"]
    )

    # American Comfort Food
    save_recipe(
        "recipe-mac-and-cheese",
        "Mac and Cheese",
        "Creamy baked macaroni with three cheeses.",
        "Golden baked mac and cheese",
        ["500g macaroni", "Cheddar cheese", "Gruyère cheese", "Parmesan", "Milk", "Butter", "Flour", "Breadcrumbs"],
        [
            "Cook macaroni until just al dente.",
            "Make cheese sauce with butter, flour, and milk.",
            "Add cheeses until melted and smooth.",
            "Combine pasta and sauce, top with breadcrumbs.",
            "Bake until golden and bubbly."
        ],
        [["Nutrient", "Amount"], ["Calories", "520 kcal"], ["Protein", "22 g"], ["Carbs", "52 g"], ["Fat", "26 g"]],
        "Undercook the pasta slightly - it will finish cooking in the oven.",
        ["tag-american", "tag-main", "tag-comfort-food", "tag-vegetarian"]
    )

    save_recipe(
        "recipe-bbq-ribs",
        "BBQ Ribs",
        "Slow-cooked pork ribs with smoky barbecue sauce.",
        "Glazed BBQ ribs on a platter",
        ["2 racks pork ribs", "Brown sugar", "Paprika", "Garlic powder", "BBQ sauce", "Apple cider vinegar", "Liquid smoke"],
        [
            "Rub ribs with spice mixture, let sit 2 hours.",
            "Slow cook at 120°C for 3 hours.",
            "Brush with BBQ sauce every 30 minutes.",
            "Finish on high heat for caramelization.",
            "Rest 10 minutes before cutting."
        ],
        [["Nutrient", "Amount"], ["Calories", "680 kcal"], ["Protein", "45 g"], ["Carbs", "28 g"], ["Fat", "42 g"]],
        "Low and slow is the secret - don't rush the cooking process.",
        ["tag-american", "tag-main", "tag-comfort-food"]
    )

    # Greek Recipes
    save_recipe(
        "recipe-moussaka",
        "Moussaka",
        "Layered casserole with eggplant, meat, and béchamel.",
        "Traditional Greek moussaka",
        ["2 large eggplants", "500g ground lamb", "Onions", "Tomatoes", "White sauce", "Cheese", "Olive oil", "Cinnamon"],
        [
            "Slice and salt eggplant, let drain 30 minutes.",
            "Brown meat with onions and tomatoes.",
            "Layer eggplant and meat in baking dish.",
            "Top with white sauce and cheese.",
            "Bake until golden brown on top."
        ],
        [["Nutrient", "Amount"], ["Calories", "450 kcal"], ["Protein", "28 g"], ["Carbs", "22 g"], ["Fat", "28 g"]],
        "Salting the eggplant removes bitterness and excess moisture.",
        ["tag-greek", "tag-main", "tag-comfort-food"]
    )

    save_recipe(
        "recipe-greek-salad",
        "Greek Salad (Horiatiki)",
        "Traditional village salad with feta and olives.",
        "Colorful Greek salad",
        ["Tomatoes", "Cucumber", "Red onion", "Bell peppers", "Feta cheese", "Kalamata olives", "Olive oil", "Red wine vinegar", "Oregano"],
        [
            "Cut vegetables into large chunks.",
            "Arrange on platter without mixing.",
            "Top with feta block and olives.",
            "Drizzle with oil and vinegar.",
            "Sprinkle with oregano and salt."
        ],
        [["Nutrient", "Amount"], ["Calories", "280 kcal"], ["Protein", "8 g"], ["Carbs", "12 g"], ["Fat", "24 g"]],
        "Use the best olive oil you can afford - it's the star of this simple dish.",
        ["tag-greek", "tag-starter", "tag-salad", "tag-vegetarian", "tag-healthy"]
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
        "Let the tortilla rest a few minutes for a clean slice.",
        "tag-main"
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
        "Use ripe, flavorful tomatoes; sieve for extra silky texture.",
        "tag-starter"
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
        "Cook low and slow to concentrate flavors; finish with a splash of good olive oil.",
        "tag-main"
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
        "Use a star tip for classic ridges; don’t overcrowd the pan.",
        "tag-dessert"
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

    # Chat with explicit sources to showcase hyperlinking in the chat UI
    chat4 = "chat-sources-demo"
    db.create_node(chat4, "Sources Demo", "chat", parent_id=chats_folder)
    msgs4: List[Dict] = []
    msgs4.append(chat_message("Give me resources about EditorJS", "user", now - timedelta(minutes=4)))
    msg_text = (
        "EditorJS is a block-styled editor. See these resources for details.\n\n"
        "Sources:\n"
        "  1. EditorJS Docs - https://editorjs.io/\n"
        "  2. GitHub Repository - https://github.com/codex-team/editor.js\n"
    )
    msgs4.append(chat_message(msg_text, "bot", now - timedelta(minutes=3), sources=[
        {"title": "EditorJS Docs", "url": "https://editorjs.io/", "quality": "high"},
        {"title": "GitHub Repository", "url": "https://github.com/codex-team/editor.js", "quality": "high"},
    ]))
    db.save_chat_messages(chat4, msgs4)

    # RAG-enhanced chat with document analysis
    chat5 = "chat-rag-demo"
    db.create_node(chat5, "Document Analysis Chat", "chat", parent_id=chats_folder)
    msgs5: List[Dict] = []
    msgs5.append(chat_message("I've uploaded a research paper about AI. Can you summarize the key findings?", "user", now - timedelta(minutes=120)))
    rag_response = (
        "Based on the uploaded document 'AI_Research_Paper.pdf', here are the key findings:\n\n"
        "<b>Main Conclusions:</b>\n"
        "• Large language models show significant improvement in reasoning tasks\n"
        "• Multi-modal approaches combining text and vision achieve 15% better performance\n"
        "• Fine-tuning on domain-specific data improves accuracy by 23%\n\n"
        "<b>Methodology:</b>\n"
        "• Tested on benchmark datasets including GLUE and SuperGLUE\n"
        "• Compared 5 different model architectures\n"
        "• Used cross-validation with 3 independent runs\n\n"
        "<b>Implications:</b>\n"
        "• Current models still struggle with causal reasoning\n"
        "• Hybrid approaches show most promise for real-world applications\n"
        "• Need for better evaluation metrics beyond accuracy\n\n"
        "*Source: Analysis based on uploaded document content*"
    )
    msgs5.append(chat_message(rag_response, "bot", now - timedelta(minutes=118)))
    msgs5.append(chat_message("Can you extract the specific performance metrics mentioned?", "user", now - timedelta(minutes=115)))
    metrics_response = (
        "Here are the specific performance metrics from the paper:\n\n"
        "<b>Baseline Results:</b>\n"
        "• GPT-4: 87.2% accuracy on GLUE\n"
        "• Claude-2: 84.6% accuracy on GLUE\n"
        "• LLaMA-2: 81.3% accuracy on GLUE\n\n"
        "<b>Fine-tuned Results:</b>\n"
        "• Domain-specific fine-tuning: +23% improvement average\n"
        "• Multi-modal approach: +15% over text-only\n"
        "• Hybrid reasoning model: +18% on causal tasks\n\n"
        "<b>Resource Usage:</b>\n"
        "• Training time: 72 hours on 8x A100 GPUs\n"
        "• Memory usage: 24GB VRAM for inference\n"
        "• Cost: ~$1,200 per experiment run\n\n"
        "*Extracted from Tables 2-4 in the uploaded document*"
    )
    msgs5.append(chat_message(metrics_response, "bot", now - timedelta(minutes=113)))
    db.save_chat_messages(chat5, msgs5)

    # Compose/AI Assistant demonstration chat
    chat6 = "chat-compose-demo"
    db.create_node(chat6, "AI Writing Assistant", "chat", parent_id=chats_folder)
    msgs6: List[Dict] = []
    msgs6.append(chat_message("Help me write a professional email to request a meeting with a potential client", "user", now - timedelta(minutes=95)))
    compose_response = (
        "Here's a professional email template for requesting a client meeting:\n\n"
        "<b>Subject:</b> Request for Meeting - Exploring Partnership Opportunities\n\n"
        "Dear [Client Name],\n\n"
        "I hope this email finds you well. I am reaching out to explore potential collaboration opportunities between our organizations.\n\n"
        "We have been following [Client Company]'s impressive work in [specific area/industry], and believe there are synergies that could benefit both parties. I would welcome the opportunity to discuss how we might work together.\n\n"
        "Would you be available for a brief 30-minute meeting in the coming weeks? I'm flexible with timing and happy to accommodate your schedule. We could meet in person, via video call, or by phone—whatever works best for you.\n\n"
        "I look forward to hearing from you.\n\n"
        "Best regards,\n[Your Name]\n[Your Title]\n[Company Name]\n[Contact Information]\n\n"
        "*Generated using AI Compose - Edit as needed for your specific situation*"
    )
    msgs6.append(chat_message(compose_response, "bot", now - timedelta(minutes=93)))
    msgs6.append(chat_message("Make it more casual and friendly", "user", now - timedelta(minutes=90)))
    casual_response = (
        "Here's a more casual and friendly version:\n\n"
        "<b>Subject:</b> Coffee and a Chat? 😊\n\n"
        "Hi [Client Name],\n\n"
        "Hope you're having a great week! I've been following what [Client Company] has been up to lately, and I'm really impressed with your work on [specific project/area].\n\n"
        "I think there might be some interesting ways our teams could collaborate, and I'd love to chat about it over coffee (or tea, if that's more your style!). \n\n"
        "Are you free for a quick 30-minute catch-up sometime soon? I'm pretty flexible and happy to work around your schedule. We could grab coffee, hop on a video call, or whatever's easiest for you.\n\n"
        "Looking forward to connecting!\n\n"
        "Cheers,\n[Your Name]\n\n"
        "*Revised for casual tone - Feel free to adjust further!*"
    )
    msgs6.append(chat_message(casual_response, "bot", now - timedelta(minutes=88)))
    db.save_chat_messages(chat6, msgs6)

    # Technical troubleshooting chat
    chat7 = "chat-tech-help"
    db.create_node(chat7, "Tech Support Chat", "chat", parent_id=chats_folder)
    msgs7: List[Dict] = []
    msgs7.append(chat_message("My Python script keeps throwing a 'ModuleNotFoundError' for pandas. How do I fix this?", "user", now - timedelta(minutes=60)))
    tech_response = (
        "This error means Python can't find the pandas library. Here are the steps to fix it:\n\n"
        "<b>1. Check if pandas is installed:</b>\n"
        "```bash\npip list | grep pandas\n```\n\n"
        "<b>2. If not installed, install it:</b>\n"
        "```bash\npip install pandas\n```\n\n"
        "<b>3. If using virtual environment:</b>\n"
        "```bash\n# Activate your virtual environment first\nsource venv/bin/activate  # On Windows: venv\\Scripts\\activate\npip install pandas\n```\n\n"
        "<b>4. If using conda:</b>\n"
        "```bash\nconda install pandas\n```\n\n"
        "<b>5. Verify installation:</b>\n"
        "```python\nimport pandas as pd\nprint(pd.__version__)\n```\n\n"
        "<b>Common causes:</b>\n"
        "• Wrong Python environment\n"
        "• Package not installed in current environment\n"
        "• Typo in import statement\n"
        "• Using system Python instead of virtual environment\n\n"
        "Try these steps and let me know if you still have issues!"
    )
    msgs7.append(chat_message(tech_response, "bot", now - timedelta(minutes=58)))
    msgs7.append(chat_message("Thanks! That worked. Now I'm getting a 'KeyError' when trying to access a column. Here's my code:\n\n```python\ndf = pd.read_csv('data.csv')\nprint(df['Name'])\n```", "user", now - timedelta(minutes=55)))
    keyerror_response = (
        "The KeyError means the column 'Name' doesn't exist in your DataFrame. Here's how to debug this:\n\n"
        "<b>1. First, check what columns actually exist:</b>\n"
        "```python\nprint(df.columns.tolist())\n```\n\n"
        "<b>2. See the first few rows:</b>\n"
        "```python\nprint(df.head())\n```\n\n"
        "<b>3. Check for common issues:</b>\n"
        "```python\n# Check for extra spaces\nprint([col.strip() for col in df.columns])\n\n# Check column names case-sensitively\nprint('name' in df.columns)  # lowercase\nprint('Name' in df.columns)  # capitalize\nprint('NAME' in df.columns)  # uppercase\n```\n\n"
        "<b>Common solutions:</b>\n"
        "• Column might be named differently (e.g., 'name', 'full_name', 'Name ')\n"
        "• CSV might have no header row: `df = pd.read_csv('data.csv', header=None)`\n"
        "• Extra spaces in column names: `df.columns = df.columns.str.strip()`\n\n"
        "<b>Safe access pattern:</b>\n"
        "```python\nif 'Name' in df.columns:\n    print(df['Name'])\nelse:\n    print(f\"Available columns: {df.columns.tolist()}\")\n```\n\n"
        "What do you see when you run `df.columns.tolist()`?"
    )
    msgs7.append(chat_message(keyerror_response, "bot", now - timedelta(minutes=52)))
    db.save_chat_messages(chat7, msgs7)

    # Creative writing collaboration chat
    chat8 = "chat-creative-writing"
    db.create_node(chat8, "Creative Writing Session", "chat", parent_id=chats_folder)
    msgs8: List[Dict] = []
    msgs8.append(chat_message("I'm writing a sci-fi short story about time travel. Can you help me brainstorm some unique plot twists?", "user", now - timedelta(minutes=45)))
    creative_response = (
        "Great topic! Here are some unique time travel plot twists to consider:\n\n"
        "<b>Temporal Paradox Twists:</b>\n"
        "• The protagonist discovers they're not traveling through time, but between parallel dimensions where time moves differently\n"
        "• Every time they 'travel back,' they're actually creating the very problems they're trying to prevent\n"
        "• The time machine doesn't move the person—it moves everything else around them\n\n"
        "<b>Character Revelation Twists:</b>\n"
        "• The antagonist is revealed to be the protagonist from a future timeline who has become convinced that past events must not be changed\n"
        "• The 'time traveler' is actually an AI that experiences all timelines simultaneously and is trying to find the optimal outcome\n"
        "• Everyone except the protagonist is a time traveler, and they're all trying to manipulate the same historical event\n\n"
        "<b>Reality Bending Twists:</b>\n"
        "• Time travel is actually a form of mental illness, and the 'different times' are just different psychological states\n"
        "• The story takes place in a time loop, but each iteration changes the fundamental laws of physics slightly\n"
        "• What seems like time travel is actually the universe 'debugging' itself, and the protagonist is a glitch being corrected\n\n"
        "Which direction interests you most? I can help develop any of these further!"
    )
    msgs8.append(chat_message(creative_response, "bot", now - timedelta(minutes=43)))
    db.save_chat_messages(chat8, msgs8)

    # Advanced RAG demonstration with actual document uploads
    chat9 = "chat-rag-fileviewer-demo"
    db.create_node(chat9, "RAG File Viewer Demo", "chat", parent_id=chats_folder)
    msgs9: List[Dict] = []
    
    # Simulate uploaded documents (these would be actual PDFs in the uploads folder)
    msgs9.append(chat_message("I've uploaded several research papers about machine learning. Can you help me analyze them?", "user", now - timedelta(minutes=180)))
    
    upload_confirmation = (
        "I can see you've uploaded the following documents to this chat:\n\n"
        "<b>📄 Documents Available:</b>\n"
        "• `2508.21365v1.pdf` - Machine Learning Fundamentals (24 pages)\n"
        "• `2508.21376v1.pdf` - Neural Network Architectures (31 pages)\n"
        "• `2508.21411v1.pdf` - Deep Learning Applications (45 pages)\n"
        "• `2508.21648v1.pdf` - Computer Vision Advances (28 pages)\n\n"
        "<b>🔍 Available Actions:</b>\n"
        "You can now:\n"
        "• <b>View</b> any document using the file viewer panel\n"
        "• <b>Ask questions</b> about specific documents or across all documents\n"
        "• <b>Generate summaries</b> using the document actions toolbar\n"
        "• <b>Extract key points</b> and insights automatically\n"
        "• <b>Find references</b> and citations within the documents\n\n"
        "Try asking me something like:\n"
        "- \"What are the main differences between CNN and RNN architectures?\"\n"
        "- \"Summarize the key findings from the computer vision paper\"\n"
        "- \"What performance metrics are discussed across all papers?\"\n\n"
        "*Use the Documents button in the chat header to open the file viewer and see previews of each document.*"
    )
    msgs9.append(chat_message(upload_confirmation, "bot", now - timedelta(minutes=178)))
    
    msgs9.append(chat_message("What are the main machine learning architectures discussed in these papers?", "user", now - timedelta(minutes=175)))
    
    rag_architectures_response = (
        "Based on analysis of the uploaded documents, here are the main ML architectures discussed:\n\n"
        "## Neural Network Architectures\n\n"
        "<b>Convolutional Neural Networks (CNNs)</b>\n"
        "• Specialized for image processing and computer vision tasks\n"
        "• Key components: convolutional layers, pooling layers, activation functions\n"
        "• Popular architectures: ResNet, VGG, Inception, EfficientNet\n"
        "• Applications: image classification, object detection, medical imaging\n\n"
        "<b>Recurrent Neural Networks (RNNs)</b>\n"
        "• Designed for sequential data processing\n"
        "• Variants: LSTM (Long Short-Term Memory), GRU (Gated Recurrent Unit)\n"
        "• Applications: natural language processing, time series analysis\n"
        "• Challenges: vanishing gradient problem, computational complexity\n\n"
        "<b>Transformer Architectures</b>\n"
        "• Attention-based models revolutionizing NLP and beyond\n"
        "• Key innovation: self-attention mechanism\n"
        "• Examples: BERT, GPT, T5, Vision Transformer (ViT)\n"
        "• Advantages: parallelization, long-range dependencies\n\n"
        "## Performance Comparisons\n\n"
        "| Architecture | Best Use Case | Accuracy Range | Training Time |\n"
        "|--------------|---------------|----------------|---------------|\n"
        "| CNN | Image tasks | 85-98% | Moderate |\n"
        "| RNN/LSTM | Sequence tasks | 70-95% | High |\n"
        "| Transformer | Language/Vision | 90-99% | Very High |\n\n"
        "<b>📚 Sources:</b> Information synthesized from `2508.21376v1.pdf` (Neural Network Architectures), `2508.21411v1.pdf` (Deep Learning Applications), and `2508.21648v1.pdf` (Computer Vision Advances).\n\n"
        "*You can click on any document name in the file viewer to see the full PDF and verify these details.*"
    )
    msgs9.append(chat_message(rag_architectures_response, "bot", now - timedelta(minutes=172)))
    
    msgs9.append(chat_message("Can you extract performance benchmarks and metrics from the computer vision paper specifically?", "user", now - timedelta(minutes=168)))
    
    computer_vision_analysis = (
        "Here's a detailed analysis of performance metrics from the <b>Computer Vision Advances</b> paper (`2508.21648v1.pdf`):\n\n"
        "## Benchmark Datasets & Results\n\n"
        "<b>ImageNet Classification</b>\n"
        "• ResNet-50: 76.2% Top-1 accuracy\n"
        "• EfficientNet-B7: 84.3% Top-1 accuracy\n"
        "• Vision Transformer (ViT-L/16): 87.1% Top-1 accuracy\n"
        "• Training time: 4-72 hours on 8x V100 GPUs\n\n"
        "<b>COCO Object Detection</b>\n"
        "• YOLOv5: 50.7 mAP@0.5:0.95\n"
        "• Detectron2 (Mask R-CNN): 46.9 mAP@0.5:0.95\n"
        "• EfficientDet-D7: 55.1 mAP@0.5:0.95\n"
        "• Inference speed: 5-45 FPS depending on model size\n\n"
        "<b>Semantic Segmentation (Cityscapes)</b>\n"
        "• DeepLab v3+: 82.1% mIoU\n"
        "• PSPNet: 85.4% mIoU\n"
        "• Segformer-B5: 84.0% mIoU\n"
        "• Memory usage: 8-16GB VRAM for training\n\n"
        "## Key Performance Insights\n\n"
        "```python\n"
        "# Example performance tracking code from the paper\n"
        "def evaluate_model(model, test_loader):\n"
        "    metrics = {\n"
        "        'accuracy': 0.0,\n"
        "        'precision': 0.0,\n"
        "        'recall': 0.0,\n"
        "        'f1_score': 0.0,\n"
        "        'inference_time': 0.0\n"
        "    }\n"
        "    # Implementation details...\n"
        "    return metrics\n"
        "```\n\n"
        "## Resource Requirements\n\n"
        "| Model Type | GPU Memory | Training Time | Inference Speed |\n"
        "|------------|------------|---------------|----------------|\n"
        "| Small CNN | 4-8 GB | 2-6 hours | 100+ FPS |\n"
        "| Large CNN | 16-32 GB | 12-24 hours | 30-60 FPS |\n"
        "| Vision Transformer | 32-64 GB | 24-72 hours | 10-30 FPS |\n\n"
        "<b>💡 Key Findings:</b>\n"
        "• Larger models generally achieve higher accuracy but require more resources\n"
        "• Vision Transformers show best performance but need substantial computational power\n"
        "• Trade-offs exist between accuracy, speed, and resource requirements\n\n"
        "<b>📄 Source:</b> Detailed analysis from pages 15-23 of `2508.21648v1.pdf`\n\n"
        "*Open the document in the file viewer to see the full benchmark tables and experimental setup details.*"
    )
    msgs9.append(chat_message(computer_vision_analysis, "bot", now - timedelta(minutes=165)))
    
    msgs9.append(chat_message("Show me how to use the document actions toolbar to analyze these papers", "user", now - timedelta(minutes=160)))
    
    actions_tutorial = (
        "Here's how to use the <b>Document Actions Toolbar</b> for efficient document analysis:\n\n"
        "## 📋 Document Actions Overview\n\n"
        "The actions toolbar appears above the chat input when you have the file viewer open. Here are the available actions:\n\n"
        "### 🔍 <b>Summary</b>\n"
        "• <b>What it does</b>: Generates a comprehensive overview of the document\n"
        "• <b>Best for</b>: Getting the main points quickly\n"
        "• <b>Example output</b>: \"This paper presents three novel CNN architectures...\"\n\n"
        "### 📌 <b>Key Points</b>\n"
        "• <b>What it does</b>: Extracts bullet-pointed key findings\n"
        "• <b>Best for</b>: Creating study notes or quick reference\n"
        "• <b>Example output</b>: Bulleted list of main contributions\n\n"
        "### 📚 <b>References</b>\n"
        "• <b>What it does</b>: Identifies citations, authors, datasets, and external links\n"
        "• <b>Best for</b>: Finding related work and sources to explore\n"
        "• <b>Example output</b>: List of cited papers, datasets, and methodology references\n\n"
        "### 💡 <b>Insights</b>\n"
        "• <b>What it does</b>: Provides analysis, implications, and connections\n"
        "• <b>Best for</b>: Understanding broader significance and applications\n"
        "• <b>Example output</b>: \"These findings suggest that...\", \"This connects to...\"\n\n"
        "### ✨ <b>Highlight</b>\n"
        "• <b>What it does</b>: Identifies most important sentences and passages\n"
        "• <b>Best for</b>: Quick scanning and finding crucial information\n"
        "• <b>Example output</b>: Highlighted text snippets with importance scores\n\n"
        "### ❓ <b>Ask</b>\n"
        "• <b>What it does</b>: Opens a guided prompt to ask specific questions\n"
        "• <b>Best for</b>: Targeted investigation of specific topics\n"
        "• <b>Example prompts</b>: \"What methodology was used?\", \"What are the limitations?\"\n\n"
        "### 📈 <b>Expand</b>\n"
        "• <b>What it does</b>: Provides detailed analysis with follow-up questions\n"
        "• <b>Best for</b>: Deep dive analysis and research planning\n"
        "• <b>Example output</b>: Detailed breakdown with suggested next steps\n\n"
        "## 🎯 Workflow Example\n\n"
        "```\n"
        "1. Open Documents panel → Select a paper\n"
        "2. Click 'Summary' → Get overview\n"
        "3. Click 'Key Points' → Extract main findings  \n"
        "4. Click 'Ask' → \"What are the performance metrics?\"\n"
        "5. Click 'References' → Find related papers\n"
        "6. Click 'Insights' → Understand implications\n"
        "```\n\n"
        "## ⚡ Pro Tips\n\n"
        "• **Multiple documents**: Actions work across all uploaded documents\n"
        "• **Context aware**: Each action considers the current chat conversation\n"
        "• **Copy results**: Click any response to copy it to your notes\n"
        "• **Follow up**: Ask additional questions based on action results\n\n"
        "Try clicking the **Summary** button while viewing the Neural Networks paper to see it in action!"
    )
    msgs9.append(chat_message(actions_tutorial, "bot", now - timedelta(minutes=157)))
    
    db.save_chat_messages(chat9, msgs9)

    # Document processing and analysis chat
    chat10 = "chat-document-processing"
    db.create_node(chat10, "Document Processing Workflow", "chat", parent_id=chats_folder)
    msgs10: List[Dict] = []
    
    msgs10.append(chat_message("How does the document processing pipeline work in this system?", "user", now - timedelta(minutes=140)))
    
    pipeline_explanation = (
        "Here's how the **Document Processing Pipeline** works in LLM-Notetaker:\n\n"
        "## 🔄 Processing Flow\n\n"
        "```mermaid\n"
        "graph TD\n"
        "    A[File Upload] --> B[Security Scan]\n"
        "    B --> C[Content Extraction]\n"
        "    C --> D[Text Chunking]\n"
        "    D --> E[Vector Embeddings]\n"
        "    E --> F[ChromaDB Storage]\n"
        "    F --> G[RAG Query Ready]\n"
        "```\n\n"
        "## 📄 Supported File Types\n\n"
        "| File Type | Extraction Method | Preview Support | Max Size |\n"
        "|-----------|-------------------|-----------------|----------|\n"
        "| **PDF** | PyPDF2 + pdfplumber | Native PDF.js viewer | 50MB |\n"
        "| **DOCX** | python-docx | Converted to HTML | 25MB |\n"
        "| **DOC** | LibreOffice headless | Converted to PDF | 25MB |\n"
        "| **TXT** | Direct read | Text preview | 10MB |\n"
        "| **CSV** | pandas + preview | Table preview | 15MB |\n"
        "| **MD** | Direct read | Rendered preview | 5MB |\n\n"
        "## ⚙️ Technical Implementation\n\n"
        "**Content Extraction**\n"
        "```python\n"
        "def extract_content(file_path, file_type):\n"
        "    if file_type == 'pdf':\n"
        "        return extract_pdf_content(file_path)\n"
        "    elif file_type in ['docx', 'doc']:\n"
        "        return extract_word_content(file_path)\n"
        "    elif file_type == 'csv':\n"
        "        return extract_csv_content(file_path)\n"
        "    # ... other types\n"
        "```\n\n"
        "**Chunking Strategy**\n"
        "• **Chunk size**: 1000 tokens (approximately 750 words)\n"
        "• **Overlap**: 200 tokens to maintain context\n"
        "• **Smart splitting**: Preserves sentence and paragraph boundaries\n"
        "• **Metadata preservation**: Page numbers, headers, section titles\n\n"
        "**Vector Embeddings**\n"
        "• **Model**: OpenAI `text-embedding-ada-002` (primary)\n"
        "• **Fallback**: Sentence Transformers `all-MiniLM-L6-v2`\n"
        "• **Dimensions**: 1536 (OpenAI) or 384 (local)\n"
        "• **Storage**: ChromaDB with metadata indexing\n\n"
        "## 🔍 Query Process\n\n"
        "1. **User query** → Vector embedding\n"
        "2. **Similarity search** in ChromaDB\n"
        "3. **Retrieve top-k** relevant chunks (default k=5)\n"
        "4. **Re-ranking** by relevance score\n"
        "5. **Context assembly** with metadata\n"
        "6. **LLM generation** with grounded context\n\n"
        "## 📊 Performance Metrics\n\n"
        "Current system performance:\n"
        "• **Upload processing**: ~2-5 seconds per MB\n"
        "• **Query response**: ~1-3 seconds\n"
        "• **Embedding generation**: ~0.5 seconds per chunk\n"
        "• **Storage efficiency**: ~80% compression vs raw text\n\n"
        "The system processes documents in the background and provides real-time progress updates during upload."
    )
    msgs10.append(chat_message(pipeline_explanation, "bot", now - timedelta(minutes=137)))
    
    msgs10.append(chat_message("What happens when I click the different document action buttons?", "user", now - timedelta(minutes=134)))
    
    actions_detail = (
        "Here's what happens behind the scenes when you use **Document Actions**:\n\n"
        "## 🔍 Summary Action\n\n"
        "**Process:**\n"
        "```python\n"
        "def generate_summary(document_content):\n"
        "    prompt = f\"\"\"\n"
        "    Provide a comprehensive summary of this document.\n"
        "    Include main topics, key findings, and conclusions.\n"
        "    \n"
        "    Document: {document_content[:8000]}\n"
        "    \"\"\"\n"
        "    return llm.invoke(prompt)\n"
        "```\n\n"
        "**Output Example:**\n"
        "> \"This research paper investigates neural network architectures for computer vision tasks. The main contributions include: (1) A novel CNN architecture achieving 94.2% accuracy on ImageNet, (2) Comparative analysis of transformer vs convolutional approaches...\"\n\n"
        "## 📌 Key Points Action\n\n"
        "**Process:**\n"
        "• Extracts structured bullet points\n"
        "• Focuses on facts, numbers, and conclusions\n"
        "• Organizes by importance and topic\n\n"
        "**Output Example:**\n"
        "```\n"
        "• Proposed architecture achieves 94.2% ImageNet accuracy\n"
        "• 23% faster inference than ResNet-50\n"
        "• Memory usage reduced by 15% compared to EfficientNet\n"
        "• Tested on 5 benchmark datasets\n"
        "• Code and models publicly available\n"
        "```\n\n"
        "## 📚 References Action\n\n"
        "**Process:**\n"
        "• Scans for citations, URLs, dataset names\n"
        "• Extracts author names and publication details\n"
        "• Identifies external resources and tools\n"
        "• Categorizes by type (papers, datasets, code, etc.)\n\n"
        "**Output Example:**\n"
        "```\n"
        "**Key Papers:**\n"
        "• ResNet (He et al., 2016)\n"
        "• EfficientNet (Tan & Le, 2019)\n"
        "• Vision Transformer (Dosovitskiy et al., 2020)\n"
        "\n"
        "**Datasets:**\n"
        "• ImageNet-1K (1.2M images)\n"
        "• CIFAR-10/100\n"
        "• MS COCO (object detection)\n"
        "\n"
        "**Code & Tools:**\n"
        "• PyTorch implementation: github.com/example\n"
        "• Pretrained models: model-hub.com\n"
        "```\n\n"
        "## 💡 Insights Action\n\n"
        "**Process:**\n"
        "• Analyzes implications and significance\n"
        "• Identifies patterns and connections\n"
        "• Suggests follow-up research directions\n"
        "• Connects to broader field knowledge\n\n"
        "**Output Example:**\n"
        "```\n"
        "**Key Insights:**\n"
        "• This work bridges the gap between CNNs and Transformers\n"
        "• The efficiency gains make it viable for mobile deployment\n"
        "• Results suggest hybrid architectures are the future\n"
        "• Performance plateau may indicate need for new approaches\n"
        "\n"
        "**Research Implications:**\n"
        "• Could enable real-time vision on edge devices\n"
        "• May influence next generation of neural architectures\n"
        "• Raises questions about optimal inductive biases\n"
        "```\n\n"
        "## ✨ Highlight Action\n\n"
        "**Process:**\n"
        "• Identifies most important sentences\n"
        "• Scores by relevance and information density\n"
        "• Preserves context and readability\n\n"
        "**Output Example:**\n"
        "```\n"
        "🔸 \"Our proposed architecture achieves state-of-the-art performance \n"
        "   with 94.2% top-1 accuracy on ImageNet.\"\n"
        "   \n"
        "🔸 \"The key innovation is the adaptive attention mechanism \n"
        "   that dynamically adjusts receptive field size.\"\n"
        "   \n"
        "🔸 \"Experiments show 23% faster inference compared to ResNet-50 \n"
        "   while maintaining comparable accuracy.\"\n"
        "```\n\n"
        "## ⚡ Performance & Caching\n\n"
        "• **Response time**: 2-8 seconds depending on document size\n"
        "• **Caching**: Results cached per document + action type\n"
        "• **Incremental updates**: Re-analysis only when document changes\n"
        "• **Background processing**: Large documents processed asynchronously\n\n"
        "All actions leverage the same RAG pipeline but with specialized prompts optimized for each analysis type."
    )
    msgs10.append(chat_message(actions_detail, "bot", now - timedelta(minutes=131)))
    
    db.save_chat_messages(chat10, msgs10)

    # =============================================================================
    # Enhanced Notes Section - Template-based and Advanced EditorJS Examples
    # =============================================================================

    # Advanced EditorJS features showcase
    advanced_editor = "note-advanced-editorjs"
    db.create_node(advanced_editor, "Advanced EditorJS Features", "note", parent_id=notes_folder)
    advanced_blocks = [
        {"type": "header", "data": {"text": "Advanced EditorJS Features Demo", "level": 1}},
        {"type": "paragraph", "data": {"text": "This note showcases advanced features and formatting capabilities available in the enhanced EditorJS editor, including real images, embedded links, and interactive content."}},
        
        {"type": "header", "data": {"text": "Rich Text Formatting", "level": 2}},
        {"type": "paragraph", "data": {"text": "This paragraph demonstrates <b>bold text</b>, <i>italic text</i>, <code>inline code</code>, and <a href=\"https://editorjs.io\" target=\"_blank\" rel=\"noopener\">external links</a>. You can also create <mark>highlighted text</mark> for emphasis and combine with <a href=\"#note:note-links-demo\" class=\"note-link\" data-note-id=\"note-links-demo\">internal note links</a>."}},
        
        {"type": "header", "data": {"text": "Real Image Examples", "level": 2}},
        {"type": "paragraph", "data": {"text": "Here are examples of actual embedded images from our recipe collection:"}},
        {"type": "image", "data": {"url": "/static/images/paella-valenciana.jpg", "caption": "Traditional Paella Valenciana - demonstrating food photography integration", "withBorder": False, "withBackground": False, "stretched": False}},
        {"type": "paragraph", "data": {"text": "Images can be referenced in text and linked to related content like our <a href=\"#note:recipe-paella\" class=\"note-link\" data-note-id=\"recipe-paella\">Paella Valenciana recipe</a>."}},
        {"type": "image", "data": {"url": "/static/images/spaghetti-carbonara.jpg", "caption": "Spaghetti Carbonara - showing recipe presentation with actual food images", "withBorder": False, "withBackground": False, "stretched": False}},
        
        {"type": "header", "data": {"text": "Advanced Lists with Links", "level": 2}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Primary bullet point with <b>formatting</b> and <a href=\"https://developer.mozilla.org/\" target=\"_blank\" rel=\"noopener\">external documentation</a>",
            "Secondary point with <code>code snippets</code> and <a href=\"#note:note-editorjs-showcase\" class=\"note-link\" data-note-id=\"note-editorjs-showcase\">internal references</a>",
            "Nested information with multiple links:\n  • Sub-item A with <i>italic text</i> and <a href=\"https://github.com/codex-team/editor.js\" target=\"_blank\" rel=\"noopener\">GitHub repository</a>\n  • Sub-item B with <a href=\"#note:note-welcome\" class=\"note-link\" data-note-id=\"note-welcome\">welcome guide</a>",
            "Complex formatting: <mark>highlighted content</mark> with <b>bold</b> and <a href=\"#note:note-best-practices\" class=\"note-link\" data-note-id=\"note-best-practices\">best practices link</a>"
        ]}},
        
        {"type": "list", "data": {"style": "ordered", "items": [
            "Step one: Install dependencies from <a href=\"https://www.npmjs.com/package/@editorjs/editorjs\" target=\"_blank\" rel=\"noopener\">npm registry</a>",
            "Step two: Configure settings following the <a href=\"#note:note-howto-template\" class=\"note-link\" data-note-id=\"note-howto-template\">how-to template</a>",
            "Step three: Run the application and test with <a href=\"#note:note-research-log\" class=\"note-link\" data-note-id=\"note-research-log\">research methodology</a>",
            "Step four: Document results and share via <a href=\"https://docs.github.com/\" target=\"_blank\" rel=\"noopener\">GitHub documentation</a>"
        ]}},
        
        {"type": "header", "data": {"text": "Enhanced Data Tables", "level": 2}},
        {"type": "paragraph", "data": {"text": "Tables can include embedded links and formatting for comprehensive data presentation:"}},
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Feature", "Status", "Priority", "Documentation", "Implementation"],
                ["User Authentication", "✅ Complete", "High", "<a href=\"https://auth0.com/docs\" target=\"_blank\" rel=\"noopener\">Auth0 Guide</a>", "<a href=\"#note:note-project-planning-example\" class=\"note-link\" data-note-id=\"note-project-planning-example\">Project Plan</a>"],
                ["Document Upload", "🔄 In Progress", "High", "<a href=\"https://developer.mozilla.org/docs/Web/API/File\" target=\"_blank\" rel=\"noopener\">File API Docs</a>", "<a href=\"#note:note-meeting-example\" class=\"note-link\" data-note-id=\"note-meeting-example\">Meeting Notes</a>"],
                ["AI Chat Integration", "📋 Planned", "Medium", "<a href=\"https://openai.com/api/\" target=\"_blank\" rel=\"noopener\">OpenAI API</a>", "<a href=\"#note:research-analysis\" class=\"note-link\" data-note-id=\"research-analysis\">Research Analysis</a>"],
                ["Export Functions", "✅ Complete", "Low", "<a href=\"https://pdfkit.org/\" target=\"_blank\" rel=\"noopener\">PDF Generation</a>", "<a href=\"#note:note-daily-journal-example\" class=\"note-link\" data-note-id=\"note-daily-journal-example\">Journal Template</a>"],
                ["Mobile Responsive", "🔄 In Progress", "Medium", "<a href=\"https://developer.mozilla.org/docs/Web/CSS/CSS_Grid_Layout\" target=\"_blank\" rel=\"noopener\">CSS Grid Guide</a>", "<a href=\"#note:note-rag\" class=\"note-link\" data-note-id=\"note-rag\">RAG Workflow</a>"]
            ]
        }},
        
        {"type": "header", "data": {"text": "Interactive Code Examples", "level": 2}},
        {"type": "paragraph", "data": {"text": "Code blocks with context and related documentation links:"}},
        {"type": "code", "data": {"code": "// EditorJS configuration with custom tools\nconst editor = new EditorJS({\n  holder: 'editorjs',\n  tools: {\n    header: Header,\n    list: List,\n    quote: Quote,\n    table: Table,\n    code: CodeTool,\n    image: SimpleImage,\n    linkTool: LinkTool\n  },\n  data: {\n    blocks: [\n      {\n        type: 'paragraph',\n        data: {\n          text: 'Hello World! <a href=\"#note:note-welcome\">Welcome</a>'\n        }\n      }\n    ]\n  }\n});"}},
        {"type": "paragraph", "data": {"text": "This configuration enables all features shown in this demo. See the <a href=\"https://editorjs.io/getting-started\" target=\"_blank\" rel=\"noopener\">EditorJS getting started guide</a> and our <a href=\"#note:note-editorjs-showcase\" class=\"note-link\" data-note-id=\"note-editorjs-showcase\">tools showcase</a> for more details."}},
        
        {"type": "header", "data": {"text": "Enhanced Quotes with Attribution", "level": 2}},
        {"type": "quote", "data": {"text": "The best way to predict the future is to invent it. Documentation and knowledge sharing are fundamental to building lasting software systems.", "caption": "Alan Kay, Computer Scientist"}},
        {"type": "paragraph", "data": {"text": "Learn more about knowledge management principles in our <a href=\"#note:note-best-practices\" class=\"note-link\" data-note-id=\"note-best-practices\">best practices guide</a> and explore <a href=\"https://www.nngroup.com/articles/\" target=\"_blank\" rel=\"noopener\">Nielsen Norman Group articles</a>."}},
        {"type": "quote", "data": {"text": "Any sufficiently advanced technology is indistinguishable from magic. But well-documented technology is distinguishable from frustration.", "caption": "Arthur C. Clarke's Third Law (adapted)"}},
        
        {"type": "header", "data": {"text": "Cross-References & Navigation", "level": 2}},
        {"type": "paragraph", "data": {"text": (
            "This note system supports rich interconnections between content. Explore related topics: "
            "<a href=\"#note:note-editorjs-showcase\" class=\"note-link\" data-note-id=\"note-editorjs-showcase\">Basic EditorJS Tools</a>, "
            "<a href=\"#note:note-best-practices\" class=\"note-link\" data-note-id=\"note-best-practices\">Documentation Best Practices</a>, "
            "<a href=\"#note:recipe-paella\" class=\"note-link\" data-note-id=\"recipe-paella\">Recipe Examples</a>, and "
            "<a href=\"#note:note-project-planning-example\" class=\"note-link\" data-note-id=\"note-project-planning-example\">Project Planning</a>."
        )}},
        {"type": "paragraph", "data": {"text": (
            "External resources for continued learning: "
            "<a href=\"https://editorjs.io/\" target=\"_blank\" rel=\"noopener\">EditorJS Official Site</a>, "
            "<a href=\"https://developer.mozilla.org/docs/Web/HTML\" target=\"_blank\" rel=\"noopener\">MDN Web Docs</a>, "
            "<a href=\"https://github.com/codex-team/editor.js\" target=\"_blank\" rel=\"noopener\">EditorJS GitHub</a>, and "
            "<a href=\"https://www.w3.org/WAI/WCAG21/quickref/\" target=\"_blank\" rel=\"noopener\">WCAG Accessibility Guidelines</a>."
        )}},
        
        {"type": "header", "data": {"text": "Multi-Media Integration", "level": 2}},
        {"type": "paragraph", "data": {"text": "Demonstrating various content types and their integration:"}},
        {"type": "image", "data": {"url": "/static/images/tiramisu.jpg", "caption": "Tiramisu dessert - example of high-quality food photography integrated with recipe content", "withBorder": False, "withBackground": False, "stretched": False}},
        {"type": "paragraph", "data": {"text": "This image connects to our full <a href=\"#note:recipe-tiramisu\" class=\"note-link\" data-note-id=\"recipe-tiramisu\">Tiramisu recipe</a> with detailed instructions and nutritional information."}},
        
        {"type": "header", "data": {"text": "Workflow Integration Examples", "level": 2}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "**Content Creation**: Use <a href=\"#note:note-daily-journal-example\" class=\"note-link\" data-note-id=\"note-daily-journal-example\">journal templates</a> for daily documentation",
            "**Project Management**: Track progress with <a href=\"#note:note-meeting-example\" class=\"note-link\" data-note-id=\"note-meeting-example\">meeting notes</a> and <a href=\"#note:note-project-planning-example\" class=\"note-link\" data-note-id=\"note-project-planning-example\">planning documents</a>",
            "**Research**: Organize findings using <a href=\"#note:research-analysis\" class=\"note-link\" data-note-id=\"research-analysis\">research analysis</a> and <a href=\"#note:note-research-log\" class=\"note-link\" data-note-id=\"note-research-log\">research logs</a>",
            "**Knowledge Base**: Create interconnected documentation with <a href=\"#note:note-links-demo\" class=\"note-link\" data-note-id=\"note-links-demo\">linking strategies</a>",
            "**External Integration**: Connect to <a href=\"https://notion.so\" target=\"_blank\" rel=\"noopener\">Notion</a>, <a href=\"https://obsidian.md\" target=\"_blank\" rel=\"noopener\">Obsidian</a>, or <a href=\"https://github.com\" target=\"_blank\" rel=\"noopener\">GitHub</a> workflows"
        ]}},
        
        {"type": "header", "data": {"text": "Summary & Next Steps", "level": 2}},
        {"type": "paragraph", "data": {"text": "This comprehensive demo showcases the full potential of the enhanced EditorJS implementation including real images, embedded links, rich formatting, and seamless integration between different content types."}},
        {"type": "paragraph", "data": {"text": (
            "Continue exploring: "
            "<a href=\"#note:note-welcome\" class=\"note-link\" data-note-id=\"note-welcome\">Welcome Tour</a> → "
            "<a href=\"#note:note-editorjs-showcase\" class=\"note-link\" data-note-id=\"note-editorjs-showcase\">Basic Tools</a> → "
            "<a href=\"#note:note-best-practices\" class=\"note-link\" data-note-id=\"note-best-practices\">Best Practices</a> → "
            "<a href=\"#note:note-rag\" class=\"note-link\" data-note-id=\"note-rag\">RAG Features</a>"
        )}}
    ]
    db.save_note_content(advanced_editor, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": advanced_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(advanced_editor, ["tag-editorjs", "tag-guide", "tag-template"])

    # Template-based notes (simulating notes created from templates)
    
    # Daily Journal Template Note
    journal_note = "note-daily-journal-example"
    db.create_node(journal_note, "Daily Journal - Jan 15, 2025", "note", parent_id=notes_folder)
    journal_blocks = [
        {"type": "header", "data": {"text": "Daily Journal Entry", "level": 2}},
        {"type": "paragraph", "data": {"text": "January 15, 2025 • Wednesday"}},
        
        {"type": "header", "data": {"text": "Today's Priorities", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "✅ Complete project proposal review",
            "✅ Team meeting at 2 PM - discussed Q1 goals",
            "🔄 Research new AI tools for documentation",
            "📋 Schedule client call for Friday",
            "✅ Update personal knowledge base"
        ]}},
        
        {"type": "header", "data": {"text": "Key Insights", "level": 3}},
        {"type": "paragraph", "data": {"text": "Had an interesting discussion about RAG (Retrieval-Augmented Generation) implementation. The team is excited about integrating document analysis features. Need to research more about vector embeddings and their practical applications."}},
        
        {"type": "header", "data": {"text": "Challenges", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Time management - too many concurrent projects",
            "Need better documentation workflow",
            "Client communication could be more streamlined"
        ]}},
        
        {"type": "header", "data": {"text": "Tomorrow's Focus", "level": 3}},
        {"type": "list", "data": {"style": "ordered", "items": [
            "Finalize the demo database with enhanced features",
            "Test document upload and analysis workflows", 
            "Review and update project timeline",
            "Prepare presentation for stakeholder meeting"
        ]}},
        
        {"type": "header", "data": {"text": "Notes & Ideas", "level": 3}},
        {"type": "quote", "data": {"text": "The best documentation is the one that gets used. Make it accessible, searchable, and collaborative.", "caption": "Team brainstorming session"}},
        {"type": "paragraph", "data": {"text": "Consider implementing automated tagging based on content analysis. Could save significant time in organization."}},
    ]
    db.save_note_content(journal_note, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": journal_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(journal_note, ["tag-productivity", "tag-template"])

    # Meeting Notes Template Note
    meeting_note = "note-meeting-example"
    db.create_node(meeting_note, "Product Planning Meeting - Q1 2025", "note", parent_id=notes_folder)
    meeting_blocks = [
        {"type": "header", "data": {"text": "Product Planning Meeting", "level": 2}},
        
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Meeting Info", "Details"],
                ["Date", "January 15, 2025"],
                ["Time", "2:00 PM - 3:30 PM EST"],
                ["Location", "Conference Room B / Zoom Hybrid"],
                ["Meeting Type", "Product Planning"],
                ["Organizer", "Sarah Chen - Product Manager"]
            ]
        }},
        
        {"type": "header", "data": {"text": "Attendees", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "✅ Sarah Chen (Product Manager) - Organizer",
            "✅ Alex Rodriguez (Lead Developer)",
            "✅ Emily Watson (UX Designer)", 
            "✅ Michael Park (Data Scientist)",
            "❌ David Kim (QA Lead) - Sick leave",
            "✅ Lisa Zhang (Marketing) - Joined remotely"
        ]}},
        
        {"type": "header", "data": {"text": "Agenda Items", "level": 3}},
        {"type": "list", "data": {"style": "ordered", "items": [
            "Q1 Feature Roadmap Review",
            "RAG Integration Timeline",
            "User Feedback Analysis",
            "Technical Architecture Decisions",
            "Resource Allocation",
            "Next Steps & Action Items"
        ]}},
        
        {"type": "header", "data": {"text": "Key Decisions", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "**RAG Integration**: Approved for Q1 implementation with document upload priority",
            "**AI Compose Features**: Move to Q2 due to resource constraints", 
            "**Mobile Responsive**: High priority - must complete by end of January",
            "**User Authentication**: Integrate OAuth 2.0 with Google and Microsoft",
            "**Export Functions**: PDF export takes priority over other formats"
        ]}},
        
        {"type": "header", "data": {"text": "Technical Discussions", "level": 3}},
        {"type": "paragraph", "data": {"text": "Alex presented the current architecture for document processing. We decided to use ChromaDB for vector storage and implement chunking strategy for large documents. Emily shared UX mockups for the chat interface - positive feedback from team."}},
        
        {"type": "code", "data": {"code": "# Proposed document processing pipeline\n1. File Upload → Security Scan\n2. Content Extraction → Text/Metadata\n3. Chunking Strategy → 1000 tokens with 200 overlap\n4. Vector Embedding → OpenAI text-embedding-ada-002\n5. Storage → ChromaDB with metadata indexing\n6. Retrieval → Similarity search with reranking"}},
        
        {"type": "header", "data": {"text": "Action Items", "level": 3}},
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Task", "Assignee", "Due Date", "Priority"],
                ["Implement file upload security scanning", "Alex Rodriguez", "Jan 22", "High"],
                ["Design chat UI components", "Emily Watson", "Jan 20", "High"],
                ["Research vector embedding options", "Michael Park", "Jan 18", "Medium"],
                ["Create user testing plan", "Lisa Zhang", "Jan 25", "Medium"],
                ["Update technical documentation", "Alex Rodriguez", "Jan 30", "Low"]
            ]
        }},
        
        {"type": "header", "data": {"text": "Next Meeting", "level": 3}},
        {"type": "paragraph", "data": {"text": "**Date**: January 22, 2025 at 2:00 PM EST"}},
        {"type": "paragraph", "data": {"text": "**Focus**: RAG implementation progress review and UX testing results"}},
        
        {"type": "quote", "data": {"text": "We're building something that will fundamentally change how people interact with their documents and knowledge.", "caption": "Sarah Chen - Product Vision"}},
    ]
    db.save_note_content(meeting_note, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": meeting_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(meeting_note, ["tag-template", "tag-productivity"])

    # Project Planning Template Note  
    project_note = "note-project-planning-example"
    db.create_node(project_note, "LLM-Notetaker Enhancement Project", "note", parent_id=notes_folder)
    project_blocks = [
        {"type": "header", "data": {"text": "LLM-Notetaker Enhancement Project", "level": 1}},
        {"type": "paragraph", "data": {"text": "Comprehensive enhancement of the LLM-Notetaker application with advanced AI features, improved UX, and robust document handling capabilities."}},
        
        {"type": "header", "data": {"text": "Project Overview", "level": 2}},
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Attribute", "Details"],
                ["Project Name", "LLM-Notetaker Enhancement"],
                ["Start Date", "January 1, 2025"],
                ["Target Completion", "March 31, 2025"],
                ["Project Manager", "Sarah Chen"],
                ["Budget", "$75,000"],
                ["Team Size", "6 developers"],
                ["Status", "🔄 In Progress (Week 3)"]
            ]
        }},
        
        {"type": "header", "data": {"text": "Objectives", "level": 2}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "🎯 **Primary**: Implement RAG (Retrieval-Augmented Generation) for document-based chat",
            "🎯 **Primary**: Create AI-powered compose/writing assistant",
            "🎯 **Secondary**: Enhanced EditorJS integration with rich formatting",
            "🎯 **Secondary**: Improved mobile responsiveness and UX",
            "🎯 **Tertiary**: Advanced export capabilities (PDF, DOCX, Markdown)",
            "🎯 **Tertiary**: Real-time collaboration features"
        ]}},
        
        {"type": "header", "data": {"text": "Feature Breakdown", "level": 2}},
        
        {"type": "header", "data": {"text": "Phase 1: Core RAG Implementation", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "✅ Document upload system (PDF, DOCX, TXT, CSV)",
            "✅ Text extraction and preprocessing pipeline",
            "🔄 Vector embedding generation and storage",
            "🔄 Chat interface with document context",
            "📋 Document analysis and summarization",
            "📋 Source citation and reference linking"
        ]}},
        
        {"type": "header", "data": {"text": "Phase 2: AI Compose Features", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "📋 Template-based content generation",
            "📋 Text improvement and style adjustments",
            "📋 Language translation capabilities",
            "📋 Tone and format conversion",
            "📋 Content expansion and summarization",
            "📋 Grammar and spell checking integration"
        ]}},
        
        {"type": "header", "data": {"text": "Phase 3: Enhanced UX", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "🔄 Mobile-responsive design improvements",
            "🔄 Advanced EditorJS toolbar and formatting",
            "📋 Drag-and-drop file handling",
            "📋 Real-time collaborative editing",
            "📋 Advanced search and filtering",
            "📋 Customizable themes and layouts"
        ]}},
        
        {"type": "header", "data": {"text": "Technical Architecture", "level": 2}},
        {"type": "code", "data": {"code": "# Technology Stack\nBackend:\n  - Flask (Python web framework)\n  - SQLite → PostgreSQL (database migration)\n  - ChromaDB (vector storage)\n  - LangChain (LLM orchestration)\n  - Ollama (local LLM inference)\n\nFrontend:\n  - Vanilla JavaScript (ES6+)\n  - EditorJS (block editor)\n  - PDF.js (document viewing)\n  - CSS Grid/Flexbox (responsive layout)\n\nAI/ML:\n  - OpenAI Embeddings (text-embedding-ada-002)\n  - Llama 3.2 (local inference)\n  - Sentence Transformers (backup embeddings)\n  - NLTK/spaCy (text processing)"}},
        
        {"type": "header", "data": {"text": "Risk Assessment", "level": 2}},
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Risk", "Probability", "Impact", "Mitigation Strategy"],
                ["AI model performance issues", "Medium", "High", "Multiple model fallbacks, performance testing"],
                ["Document processing scalability", "Medium", "Medium", "Efficient chunking, async processing"],
                ["User adoption of new features", "Low", "High", "User testing, gradual rollout, training"],
                ["Integration complexity", "High", "Medium", "Modular design, extensive testing"],
                ["Performance with large documents", "Medium", "Medium", "Streaming, pagination, caching"]
            ]
        }},
        
        {"type": "header", "data": {"text": "Success Metrics", "level": 2}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "📊 **User Engagement**: 40% increase in daily active users",
            "📊 **Feature Adoption**: 60% of users try RAG chat within first month",
            "📊 **Performance**: Page load times under 2 seconds",
            "📊 **Reliability**: 99.5% uptime during business hours",
            "📊 **User Satisfaction**: Average rating of 4.5/5 in feedback",
            "📊 **Document Processing**: Support files up to 50MB"
        ]}},
        
        {"type": "header", "data": {"text": "Timeline", "level": 2}},
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Phase", "Duration", "Start Date", "End Date", "Key Deliverables"],
                ["Phase 1", "6 weeks", "Jan 1", "Feb 15", "RAG system, document upload, basic chat"],
                ["Phase 2", "4 weeks", "Feb 16", "Mar 15", "AI compose, templates, content generation"],
                ["Phase 3", "3 weeks", "Mar 16", "Mar 31", "UX polish, mobile responsive, final testing"],
                ["Testing", "2 weeks", "Mar 15", "Mar 31", "User acceptance testing, bug fixes"]
            ]
        }},
        
        {"type": "quote", "data": {"text": "Our goal is to create an intelligent knowledge management system that feels intuitive and powerful, not complicated and overwhelming.", "caption": "Project Vision Statement"}},
    ]
    db.save_note_content(project_note, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": project_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(project_note, ["tag-template", "tag-productivity", "tag-research"])

    # Document Analysis Examples (simulating AI-generated content)
    analysis_folder = "demo-analysis"
    db.create_node(analysis_folder, "Document Analysis Examples", "folder", parent_id=demo_root)

    # Research Paper Analysis
    research_analysis = "note-research-analysis"
    db.create_node(research_analysis, "AI Research Paper Analysis", "note", parent_id=analysis_folder)
    research_analysis_blocks = [
        {"type": "header", "data": {"text": "Analysis: 'Advances in Large Language Models for Code Generation'", "level": 2}},
        {"type": "paragraph", "data": {"text": "This analysis was generated using the AI document analysis feature on an uploaded research paper. The system extracted key insights, methodology, and findings automatically."}},
        
        {"type": "header", "data": {"text": "Document Summary", "level": 3}},
        {"type": "paragraph", "data": {"text": "The paper presents a comprehensive evaluation of large language models (LLMs) for automated code generation tasks. The research compares performance across multiple programming languages and evaluates both accuracy and code quality metrics. Key findings show significant improvements in Python and JavaScript generation, with promising results for more complex algorithmic challenges."}},
        
        {"type": "header", "data": {"text": "Key Findings", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "**Performance Gains**: 23% improvement in code correctness over baseline models",
            "**Language Coverage**: Python (92% accuracy), JavaScript (88% accuracy), Java (79% accuracy)",
            "**Complex Algorithms**: 67% success rate on medium-complexity algorithmic problems",
            "**Code Quality**: Generated code passes 84% of industry-standard linting rules",
            "**Efficiency**: 15x faster than traditional code completion tools",
            "**Context Understanding**: Better function signature prediction with 91% accuracy"
        ]}},
        
        {"type": "header", "data": {"text": "Methodology Overview", "level": 3}},
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Aspect", "Details"],
                ["Dataset Size", "2.5M code samples across 12 languages"],
                ["Evaluation Metrics", "Functional correctness, BLEU score, code quality"],
                ["Model Architectures", "Transformer-based: GPT-4, CodeT5, StarCoder"],
                ["Training Duration", "72 hours on 8x A100 GPUs"],
                ["Validation Method", "5-fold cross-validation with hold-out test set"],
                ["Benchmark Tasks", "HumanEval, MBPP, CodeContests"]
            ]
        }},
        
        {"type": "header", "data": {"text": "Technical Implementation", "level": 3}},
        {"type": "code", "data": {"code": "# Example evaluation pipeline from the paper\ndef evaluate_code_generation(model, test_cases):\n    results = {\n        'functional_correctness': 0,\n        'bleu_scores': [],\n        'execution_time': []\n    }\n    \n    for prompt, expected_output in test_cases:\n        generated_code = model.generate(prompt)\n        \n        # Test functional correctness\n        if execute_safely(generated_code) == expected_output:\n            results['functional_correctness'] += 1\n        \n        # Calculate BLEU score\n        bleu = calculate_bleu(generated_code, expected_output)\n        results['bleu_scores'].append(bleu)\n    \n    return results"}},
        
        {"type": "header", "data": {"text": "Implications for Practice", "level": 3}},
        {"type": "quote", "data": {"text": "These results suggest that LLMs are approaching human-level performance for routine coding tasks, but still require human oversight for complex system design and architecture decisions.", "caption": "Paper Conclusion"}},
        
        {"type": "list", "data": {"style": "unordered", "items": [
            "**Development Productivity**: Potential 30-40% reduction in routine coding time",
            "**Code Review**: AI-generated code still requires thorough human review",
            "**Learning Tool**: Valuable for educational purposes and rapid prototyping",
            "**Limitations**: Struggles with complex business logic and edge cases",
            "**Integration**: Best used as coding assistant rather than replacement"
        ]}},
        
        {"type": "header", "data": {"text": "Future Research Directions", "level": 3}},
        {"type": "list", "data": {"style": "ordered", "items": [
            "Improving performance on low-resource programming languages",
            "Better integration with existing development environments",
            "Enhanced understanding of software architecture patterns",
            "Improved handling of security and performance considerations",
            "Multi-modal approaches combining code and documentation"
        ]}},
        
        {"type": "header", "data": {"text": "References & Citations", "level": 3}},
        {"type": "paragraph", "data": {"text": "The paper cites 47 relevant studies and introduces novel evaluation metrics. Key referenced works include the original Transformer paper, CodeBERT, and recent advances in program synthesis."}},
        
        {"type": "paragraph", "data": {"text": "*This analysis was generated automatically from the uploaded PDF using RAG-enhanced AI processing. Original paper: 24 pages, published in ACM Computing Surveys, 2025.*"}},
    ]
    db.save_note_content(research_analysis, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": research_analysis_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(research_analysis, ["tag-research", "tag-rag"])

    # File Viewer and RAG Integration Guide
    fileviewer_guide = "note-fileviewer-guide"
    db.create_node(fileviewer_guide, "File Viewer & RAG Integration Guide", "note", parent_id=analysis_folder)
    fileviewer_blocks = [
        {"type": "header", "data": {"text": "File Viewer & RAG Integration Guide", "level": 2}},
        {"type": "paragraph", "data": {"text": "This guide demonstrates how to use the integrated File Viewer with RAG (Retrieval-Augmented Generation) for document analysis and chat functionality."}},
        
        {"type": "header", "data": {"text": "Getting Started", "level": 3}},
        {"type": "list", "data": {"style": "ordered", "items": [
            "Open any chat conversation",
            "Click the **Documents** button in the chat header",
            "Upload documents using the **Upload Documents** button",
            "Select a document from the list to preview it",
            "Use **Document Actions** for quick analysis"
        ]}},
        
        {"type": "header", "data": {"text": "Document Upload Process", "level": 3}},
        {"type": "paragraph", "data": {"text": "The system supports multiple file formats with intelligent processing:"}},
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["File Type", "Max Size", "Processing", "Preview Type"],
                ["PDF", "50 MB", "Text extraction + OCR", "Native PDF viewer"],
                ["DOCX", "25 MB", "Content extraction", "HTML preview"],
                ["DOC", "25 MB", "LibreOffice conversion", "PDF preview"],
                ["TXT", "10 MB", "Direct reading", "Text preview"],
                ["CSV", "15 MB", "Pandas processing", "Table preview"],
                ["MD", "5 MB", "Markdown parsing", "Rendered preview"]
            ]
        }},
        
        {"type": "header", "data": {"text": "File Viewer Features", "level": 3}},
        {"type": "paragraph", "data": {"text": "The File Viewer provides comprehensive document interaction capabilities:"}},
        
        {"type": "header", "data": {"text": "Document Preview", "level": 4}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "**PDF Viewer**: Native PDF.js integration with zoom, search, and navigation",
            "**Text Preview**: Formatted text with syntax highlighting for code files",
            "**Image Preview**: Support for common image formats (PNG, JPG, GIF)",
            "**Table Preview**: Interactive tables for CSV and spreadsheet data",
            "**Markdown Rendering**: Live preview of Markdown documents"
        ]}},
        
        {"type": "header", "data": {"text": "Document Actions Toolbar", "level": 4}},
        {"type": "paragraph", "data": {"text": "Quick access buttons for AI-powered document analysis:"}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "🔍 **Summary**: Generate comprehensive document overview",
            "📌 **Key Points**: Extract bullet-pointed main findings",
            "📚 **References**: Identify citations, sources, and external links",
            "💡 **Insights**: Provide analysis and implications",
            "✨ **Highlight**: Mark important passages and quotes",
            "❓ **Ask**: Guided prompts for specific questions",
            "📈 **Expand**: Detailed analysis with follow-up suggestions"
        ]}},
        
        {"type": "header", "data": {"text": "RAG Chat Integration", "level": 3}},
        {"type": "paragraph", "data": {"text": "Once documents are uploaded, you can chat about them naturally:"}},
        
        {"type": "code", "data": {"code": "Example Chat Interactions:\n\n🗣️ User: \"What are the main findings in the AI research paper?\"\n🤖 Bot: [Analyzes uploaded PDF and provides summary with citations]\n\n🗣️ User: \"Compare the methodologies across all uploaded papers\"\n🤖 Bot: [Cross-references multiple documents and provides comparison]\n\n🗣️ User: \"Extract all performance metrics from Table 3\"\n🤖 Bot: [Locates specific table and extracts data with context]"}},
        
        {"type": "header", "data": {"text": "Advanced Features", "level": 3}},
        
        {"type": "header", "data": {"text": "Multi-Document Analysis", "level": 4}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Ask questions that span multiple documents",
            "Compare findings across different papers",
            "Synthesize information from various sources",
            "Track citations and cross-references between documents"
        ]}},
        
        {"type": "header", "data": {"text": "Context-Aware Responses", "level": 4}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Citations include page numbers and section references",
            "Responses maintain document context throughout conversation",
            "Follow-up questions build on previous document analysis",
            "Smart chunking preserves document structure and meaning"
        ]}},
        
        {"type": "header", "data": {"text": "Document Management", "level": 4}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Per-chat document storage (documents are chat-specific)",
            "Easy upload, preview, and deletion of documents",
            "Progress indicators for large file processing",
            "Error handling and fallback processing for corrupted files"
        ]}},
        
        {"type": "header", "data": {"text": "Technical Implementation", "level": 3}},
        {"type": "quote", "data": {"text": "The File Viewer integrates seamlessly with the RAG pipeline, providing both visual document interaction and intelligent content analysis in a unified interface.", "caption": "System Architecture"}},
        
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Component", "Technology", "Purpose"],
                ["PDF Viewer", "PDF.js", "Native PDF rendering and interaction"],
                ["Text Extraction", "PyPDF2, pdfplumber", "Content extraction from PDFs"],
                ["Document Conversion", "python-docx, LibreOffice", "DOCX/DOC to readable format"],
                ["Vector Storage", "ChromaDB", "Semantic search and retrieval"],
                ["Embeddings", "OpenAI text-embedding-ada-002", "High-quality text representations"],
                ["Chat Interface", "WebSocket + REST API", "Real-time document chat"]
            ]
        }},
        
        {"type": "header", "data": {"text": "Best Practices", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "**File Organization**: Use descriptive filenames for better document identification",
            "**Upload Strategy**: Upload related documents to the same chat for cross-analysis",
            "**Question Formulation**: Be specific in your questions for more accurate responses",
            "**Document Quality**: Ensure documents are text-searchable (not scanned images)",
            "**Follow-up Queries**: Build on previous questions to dive deeper into topics"
        ]}},
        
        {"type": "header", "data": {"text": "Troubleshooting", "level": 3}},
        {"type": "table", "data": {
            "withHeadings": True,
            "content": [
                ["Issue", "Likely Cause", "Solution"],
                ["Upload fails", "File too large or corrupted", "Check file size limits and file integrity"],
                ["Poor text extraction", "Scanned PDF or image-based document", "Use OCR or convert to text-based format"],
                ["Slow responses", "Large document or complex query", "Break into smaller questions or reduce document size"],
                ["No preview", "Unsupported file format", "Convert to supported format (PDF, DOCX, TXT)"],
                ["Inaccurate answers", "Poor document quality or ambiguous question", "Improve document quality or rephrase question"]
            ]
        }},
        
        {"type": "header", "data": {"text": "Example Workflows", "level": 3}},
        
        {"type": "header", "data": {"text": "Research Analysis Workflow", "level": 4}},
        {"type": "list", "data": {"style": "ordered", "items": [
            "Upload research papers to a dedicated chat",
            "Use **Summary** action on each paper for overview",
            "Use **Key Points** to extract main findings",
            "Ask comparative questions: \"How do these methodologies differ?\"",
            "Use **References** action to find related work",
            "Export chat conversation as research notes"
        ]}},
        
        {"type": "header", "data": {"text": "Document Review Workflow", "level": 4}},
        {"type": "list", "data": {"style": "ordered", "items": [
            "Upload document for review",
            "Use **Highlight** action to identify key passages",
            "Ask specific questions about unclear sections",
            "Use **Insights** action for broader implications",
            "Create follow-up notes based on analysis",
            "Share findings with team members"
        ]}},
        
        {"type": "header", "data": {"text": "Related Resources", "level": 3}},
        {"type": "paragraph", "data": {"text": (
            "Explore related functionality: "
            "<a href=\"#note:note-rag\" class=\"note-link\" data-note-id=\"note-rag\">RAG Workflow Guide</a>, "
            "<a href=\"#note:research-analysis\" class=\"note-link\" data-note-id=\"research-analysis\">Document Analysis Examples</a>, "
            "<a href=\"#note:note-best-practices\" class=\"note-link\" data-note-id=\"note-best-practices\">Documentation Best Practices</a>."
        )}},
        {"type": "paragraph", "data": {"text": (
            "External documentation: "
            "<a href=\"https://mozilla.github.io/pdf.js/\" target=\"_blank\" rel=\"noopener\">PDF.js Documentation</a>, "
            "<a href=\"https://docs.trychroma.com/\" target=\"_blank\" rel=\"noopener\">ChromaDB Guide</a>, "
            "<a href=\"https://platform.openai.com/docs/guides/embeddings\" target=\"_blank\" rel=\"noopener\">OpenAI Embeddings API</a>."
        )}}
    ]
    db.save_note_content(fileviewer_guide, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": fileviewer_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(fileviewer_guide, ["tag-rag", "tag-guide", "tag-howto"])

    # -----------------------------
    # COMPREHENSIVE DOCUMENTATION
    # -----------------------------
    
    # Comprehensive Application Documentation
    app_overview = "note-app-overview"
    db.create_node(app_overview, "LLM Notetaker - Complete Guide", "note", parent_id=docs_folder)
    app_overview_blocks = [
        {"type": "header", "data": {"text": "LLM Notetaker - Complete Application Guide", "level": 1}},
        {"type": "paragraph", "data": {"text": "Welcome to LLM Notetaker, a powerful knowledge management system that combines structured note-taking with AI-powered chat functionality and document analysis capabilities."}},
        
        {"type": "header", "data": {"text": "🎯 Application Overview", "level": 2}},
        {"type": "paragraph", "data": {"text": "LLM Notetaker is designed to help you organize, create, and interact with your knowledge base through multiple channels:"}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Rich Note Editor</b>: Create structured notes using EditorJS with support for headers, lists, tables, code blocks, quotes, and images",
            "<b>AI Chat Interface</b>: Ask questions, get summaries, and generate content using advanced language models",
            "<b>Document Analysis (RAG)</b>: Upload PDFs, DOCX, and CSV files for AI-powered analysis and question answering",
            "<b>File Viewer</b>: Browse and preview uploaded documents with integrated chat functionality",
            "<b>Organizational Tools</b>: Folders, tags, and cross-references to keep your knowledge organized"
        ]}},

        {"type": "header", "data": {"text": "🏗️ Core Architecture", "level": 2}},
        {"type": "paragraph", "data": {"text": "The application is built with modern web technologies and AI frameworks:"}},
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Component", "Technology", "Purpose"],
            ["Backend", "Python Flask", "API server and business logic"],
            ["Database", "SQLite", "Data persistence and relationships"],
            ["Vector Store", "ChromaDB", "Document embeddings and similarity search"],
            ["AI Models", "OpenAI GPT", "Chat responses and content generation"],
            ["Frontend", "HTML/CSS/JS", "User interface and interactions"],
            ["Editor", "EditorJS", "Rich text editing capabilities"],
            ["File Viewer", "PDF.js", "Document preview and annotation"]
        ]}},

        {"type": "header", "data": {"text": "📁 Data Structure", "level": 2}},
        {"type": "paragraph", "data": {"text": "Understanding how data is organized helps you make the most of the application:"}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Nodes</b>: Core data structure representing notes, folders, and chats",
            "<b>Hierarchical Organization</b>: Folders can contain subfolders and notes in a tree structure",
            "<b>Tags</b>: Flexible labeling system for cross-cutting organization",
            "<b>Content Blocks</b>: EditorJS stores content as JSON blocks (paragraphs, headers, lists, etc.)",
            "<b>Chat Messages</b>: Conversations stored with timestamps, sources, and metadata",
            "<b>File Uploads</b>: Documents stored with metadata and vector embeddings for search"
        ]}},

        {"type": "code", "data": {"code": "# Example node structure\n{\n  \"id\": \"note-123\",\n  \"title\": \"My Research Note\",\n  \"type\": \"note\",\n  \"parent_id\": \"folder-research\",\n  \"created_at\": \"2025-09-02T10:30:00Z\",\n  \"content\": {\n    \"blocks\": [...],\n    \"version\": \"2.29.0\"\n  },\n  \"tags\": [\"research\", \"ai\", \"documentation\"]\n}"}},

        {"type": "header", "data": {"text": "🔗 Integration Features", "level": 2}},
        {"type": "paragraph", "data": {"text": "LLM Notetaker excels at connecting different types of content:"}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Internal Links</b>: Link between notes using the note-link syntax",
            "<b>External References</b>: Include web links that open in new tabs",
            "<b>Document References</b>: Chat about specific uploaded documents",
            "<b>Tag-based Discovery</b>: Find related content through shared tags",
            "<b>Full-text Search</b>: Search across all notes and chat history"
        ]}},

        {"type": "quote", "data": {"text": "The power of LLM Notetaker lies in its ability to seamlessly blend structured note-taking with conversational AI, creating a unified knowledge workspace.", "caption": "Design Philosophy"}}
    ]
    db.save_note_content(app_overview, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": app_overview_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(app_overview, ["tag-documentation", "tag-guide", "tag-overview"])

    # Detailed Feature Documentation
    features_guide = "note-features-guide"
    db.create_node(features_guide, "Feature Reference Guide", "note", parent_id=docs_folder)
    features_blocks = [
        {"type": "header", "data": {"text": "Feature Reference Guide", "level": 1}},
        {"type": "paragraph", "data": {"text": "Complete reference for all features available in LLM Notetaker."}},

        {"type": "header", "data": {"text": "📝 Note Editor Features", "level": 2}},
        {"type": "paragraph", "data": {"text": "The note editor supports rich content creation with the following block types:"}},
        
        {"type": "header", "data": {"text": "Text Blocks", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Paragraphs</b>: Basic text with inline formatting (bold, italic, links)",
            "<b>Headers</b>: Six levels of headings (H1-H6) for document structure",
            "<b>Quotes</b>: Highlighted text blocks with optional attribution",
            "<b>Code Blocks</b>: Syntax-highlighted code with language detection"
        ]}},

        {"type": "header", "data": {"text": "Structural Blocks", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Ordered Lists</b>: Numbered lists with automatic sequencing",
            "<b>Unordered Lists</b>: Bullet points for non-sequential items",
            "<b>Tables</b>: Data tables with headers and sortable columns",
            "<b>Images</b>: Visual content with captions and sizing options"
        ]}},

        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Block Type", "Keyboard Shortcut", "Use Case"],
            ["Header", "Ctrl/Cmd + H", "Document structure"],
            ["List", "Ctrl/Cmd + L", "Organizing items"],
            ["Quote", "Ctrl/Cmd + Q", "Highlighting quotes"],
            ["Code", "Ctrl/Cmd + K", "Code examples"],
            ["Table", "Ctrl/Cmd + T", "Structured data"],
            ["Image", "Ctrl/Cmd + I", "Visual content"]
        ]}},

        {"type": "header", "data": {"text": "💬 Chat Interface", "level": 2}},
        {"type": "paragraph", "data": {"text": "The chat interface provides AI-powered assistance with several interaction modes:"}},
        
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>General Chat</b>: Ask questions, get explanations, brainstorm ideas",
            "<b>Document Analysis</b>: Upload files and ask specific questions about their content",
            "<b>Code Assistance</b>: Get help with programming, debugging, and code review",
            "<b>Writing Support</b>: Generate content, improve writing, create templates",
            "<b>Research Help</b>: Summarize topics, find connections, organize information"
        ]}},

        {"type": "header", "data": {"text": "Chat Features", "level": 3}},
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Feature", "Description", "How to Use"],
            ["File Upload", "Attach documents for analysis", "Click + button in chat"],
            ["Sources", "View references for AI responses", "Look for 'Sources' section"],
            ["Copy Response", "Copy AI messages to clipboard", "Click copy icon on message"],
            ["Regenerate", "Get alternative response", "Click regenerate icon"],
            ["Share to Note", "Save chat response as note", "Click share button"],
            ["Search History", "Find previous conversations", "Use search in chat sidebar"]
        ]}},

        {"type": "header", "data": {"text": "📄 Document Viewer", "level": 2}},
        {"type": "paragraph", "data": {"text": "The integrated document viewer allows you to preview and interact with uploaded files:"}},
        
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>PDF Preview</b>: Full PDF rendering with zoom and navigation controls",
            "<b>Page Navigation</b>: Jump to specific pages or scroll through documents",
            "<b>Text Selection</b>: Select and copy text from documents",
            "<b>Document Actions</b>: Generate summaries, extract key points, ask questions",
            "<b>Chat Integration</b>: Ask questions about the currently viewed document"
        ]}},

        {"type": "header", "data": {"text": "Document Actions Toolbar", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>📋 Summary</b>: Generate an executive summary of the document",
            "<b>🔍 Key Points</b>: Extract main findings and important information",
            "<b>❓ Ask Question</b>: Open chat with document context pre-loaded",
            "<b>📝 Take Notes</b>: Create a new note with document reference",
            "<b>🔗 Share</b>: Generate shareable link to document view"
        ]}},

        {"type": "header", "data": {"text": "🏷️ Organization System", "level": 2}},
        {"type": "paragraph", "data": {"text": "Keep your knowledge organized with a flexible system of folders and tags:"}},
        
        {"type": "header", "data": {"text": "Folders", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Hierarchical Structure</b>: Create nested folders for logical organization",
            "<b>Drag & Drop</b>: Reorder items by dragging in the sidebar",
            "<b>Quick Actions</b>: Right-click for context menu with rename, delete, etc.",
            "<b>Breadcrumbs</b>: Navigate hierarchy with breadcrumb trail"
        ]}},

        {"type": "header", "data": {"text": "Tags", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Cross-cutting Organization</b>: Tag items across different folders",
            "<b>Filter by Tags</b>: Click tags to filter view to related items",
            "<b>Tag Suggestions</b>: System suggests relevant tags based on content",
            "<b>Tag Management</b>: Create, rename, and delete tags as needed"
        ]}},

        {"type": "code", "data": {"code": "# Tag naming conventions (recommended)\ntag-category-subcategory\n\nExamples:\ntag-research-ai\ntag-project-web-development\ntag-reference-documentation\ntag-todo-urgent"}},

        {"type": "header", "data": {"text": "🔍 Search and Discovery", "level": 2}},
        {"type": "paragraph", "data": {"text": "Find information quickly with powerful search capabilities:"}},
        
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Search Type", "Scope", "Best For"],
            ["Global Search", "All content", "Finding any mention of a term"],
            ["Tag Filter", "Tagged items", "Browsing related content"],
            ["Folder Search", "Current folder", "Focused exploration"],
            ["Chat Search", "Conversation history", "Finding past discussions"],
            ["Semantic Search", "AI-powered", "Conceptual similarities"]
        ]}},

        {"type": "paragraph", "data": {"text": (
            "Pro tip: Combine different organizational methods for maximum effectiveness. "
            "For example, use folders for project structure and tags for topics that span multiple projects. "
            "See <a href=\"#note:note-best-practices\" class=\"note-link\" data-note-id=\"note-best-practices\">Note Best Practices</a> for more guidance."
        )}}
    ]
    db.save_note_content(features_guide, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": features_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(features_guide, ["tag-documentation", "tag-features", "tag-reference"])

    # RAG and AI Documentation
    rag_guide = "note-rag-documentation"
    db.create_node(rag_guide, "RAG & AI Features Guide", "note", parent_id=docs_folder)
    rag_blocks = [
        {"type": "header", "data": {"text": "RAG & AI Features Guide", "level": 1}},
        {"type": "paragraph", "data": {"text": "Comprehensive guide to using Retrieval-Augmented Generation (RAG) and AI features in LLM Notetaker."}},

        {"type": "header", "data": {"text": "🧠 What is RAG?", "level": 2}},
        {"type": "paragraph", "data": {"text": "Retrieval-Augmented Generation (RAG) combines the power of large language models with your specific documents to provide accurate, grounded responses."}},
        
        {"type": "quote", "data": {"text": "RAG allows the AI to answer questions based on your uploaded documents rather than just its training data, ensuring responses are relevant and factual.", "caption": "Key Concept"}},

        {"type": "header", "data": {"text": "How RAG Works", "level": 3}},
        {"type": "list", "data": {"style": "ordered", "items": [
            "<b>Document Upload</b>: You upload PDFs, DOCX, or CSV files to a chat",
            "<b>Text Extraction</b>: The system extracts and processes text from your documents",
            "<b>Vectorization</b>: Document content is converted to mathematical vectors (embeddings)",
            "<b>Storage</b>: Vectors are stored in ChromaDB for efficient similarity search",
            "<b>Query Processing</b>: When you ask a question, it's also converted to a vector",
            "<b>Retrieval</b>: The system finds the most relevant document sections",
            "<b>Generation</b>: AI generates responses using both the question and relevant context"
        ]}},

        {"type": "header", "data": {"text": "📁 Supported File Types", "level": 2}},
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["File Type", "Extensions", "Best For", "Processing Notes"],
            ["PDF", ".pdf", "Research papers, reports, manuals", "Extracts text and preserves structure"],
            ["Word Documents", ".docx", "Drafts, proposals, documentation", "Maintains formatting context"],
            ["Spreadsheets", ".csv", "Data tables, lists, structured info", "Converts to searchable text format"],
            ["Text Files", ".txt, .md", "Plain text, markdown notes", "Direct text processing"]
        ]}},

        {"type": "header", "data": {"text": "💡 Best Practices for RAG", "level": 2}},
        {"type": "header", "data": {"text": "Document Preparation", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Quality Matters</b>: Use clear, well-formatted documents for best results",
            "<b>Size Considerations</b>: Larger documents work well, but very large files may need chunking",
            "<b>Multiple Sources</b>: Upload related documents together for comprehensive coverage",
            "<b>Clean Text</b>: Avoid heavily image-based PDFs or corrupted files"
        ]}},

        {"type": "header", "data": {"text": "Effective Questioning", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Be Specific</b>: Ask targeted questions rather than very broad ones",
            "<b>Reference Context</b>: Mention specific sections or topics when relevant",
            "<b>Follow Up</b>: Build on previous answers to dive deeper into topics",
            "<b>Request Sources</b>: Ask for specific page numbers or section references"
        ]}},

        {"type": "code", "data": {"code": "# Example effective questions:\n\n# ✅ Good questions:\n\"What are the performance metrics for ResNet mentioned in the paper?\"\n\"Compare the methodologies used in sections 3.1 and 3.2\"\n\"What limitations does the author mention for this approach?\"\n\n# ❌ Less effective:\n\"Tell me about this document\"\n\"What's in here?\"\n\"Summarize everything\""}},

        {"type": "header", "data": {"text": "🔧 AI Model Configuration", "level": 2}},
        {"type": "paragraph", "data": {"text": "Understanding the AI models and their capabilities helps you use them effectively:"}},
        
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Model Type", "Best For", "Strengths", "Limitations"],
            ["GPT-4", "Complex reasoning, analysis", "High accuracy, context understanding", "Slower, more expensive"],
            ["GPT-3.5-Turbo", "General chat, quick responses", "Fast, cost-effective", "Less nuanced reasoning"],
            ["Text Embeddings", "Document similarity, search", "Semantic understanding", "Not for text generation"]
        ]}},

        {"type": "header", "data": {"text": "🎯 Use Cases and Examples", "level": 2}},
        {"type": "header", "data": {"text": "Research Analysis", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Upload multiple research papers on a topic",
            "Ask for comparisons between different studies",
            "Extract key findings and methodologies",
            "Identify gaps in the research",
            "Generate literature review summaries"
        ]}},

        {"type": "header", "data": {"text": "Document Review", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Upload contracts or legal documents",
            "Ask about specific clauses or terms",
            "Identify potential issues or inconsistencies",
            "Compare different versions of documents",
            "Extract action items and deadlines"
        ]}},

        {"type": "header", "data": {"text": "Data Analysis", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Upload CSV files with structured data",
            "Ask questions about trends and patterns",
            "Get explanations of data relationships",
            "Identify outliers or anomalies",
            "Generate insights for decision-making"
        ]}},

        {"type": "header", "data": {"text": "⚠️ Limitations and Considerations", "level": 2}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Token Limits</b>: Very long documents may be truncated or chunked",
            "<b>Context Window</b>: AI has limited memory of very long conversations",
            "<b>Accuracy</b>: Always verify critical information from original sources",
            "<b>Privacy</b>: Be mindful of sensitive information in uploaded documents",
            "<b>Processing Time</b>: Large documents may take longer to process initially"
        ]}},

        {"type": "header", "data": {"text": "🔍 Troubleshooting", "level": 2}},
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Issue", "Possible Cause", "Solution"],
            ["No document context in responses", "File not processed", "Wait for processing, check file format"],
            ["Inaccurate responses", "Poor document quality", "Use cleaner, well-formatted documents"],
            ["Slow processing", "Large file size", "Break into smaller documents"],
            ["Missing information", "Content not in uploaded docs", "Upload additional relevant documents"]
        ]}},

        {"type": "paragraph", "data": {"text": (
            "For more specific examples of RAG in action, see the "
            "<a href=\"#chat:chat-rag-fileviewer-demo\" class=\"note-link\" data-note-id=\"chat-rag-fileviewer-demo\">RAG File Viewer Demo</a> "
            "chat conversation."
        )}}
    ]
    db.save_note_content(rag_guide, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": rag_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(rag_guide, ["tag-documentation", "tag-rag", "tag-ai", "tag-guide"])

    # API and Technical Documentation
    api_docs = "note-api-documentation"
    db.create_node(api_docs, "API & Technical Reference", "note", parent_id=docs_folder)
    api_blocks = [
        {"type": "header", "data": {"text": "API & Technical Reference", "level": 1}},
        {"type": "paragraph", "data": {"text": "Technical documentation for developers working with LLM Notetaker's codebase and API endpoints."}},

        {"type": "header", "data": {"text": "🛠️ Technology Stack", "level": 2}},
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Layer", "Technology", "Version", "Purpose"],
            ["Backend Framework", "Flask", "2.3+", "Web application framework"],
            ["Database", "SQLite", "3.x", "Data persistence"],
            ["Vector Database", "ChromaDB", "0.4+", "Document embeddings"],
            ["AI/ML", "OpenAI API", "1.x", "Language model access"],
            ["Frontend", "Vanilla JS", "ES6+", "User interface"],
            ["Editor", "EditorJS", "2.29+", "Rich text editing"],
            ["PDF Viewer", "PDF.js", "3.x", "Document rendering"]
        ]}},

        {"type": "header", "data": {"text": "📡 API Endpoints", "level": 2}},
        {"type": "paragraph", "data": {"text": "Core API endpoints for interacting with the application:"}},

        {"type": "header", "data": {"text": "Node Management", "level": 3}},
        {"type": "code", "data": {"code": "# Create a new node (note, folder, or chat)\nPOST /api/nodes\n{\n  \"title\": \"New Note\",\n  \"type\": \"note\",\n  \"parent_id\": \"folder-123\"\n}\n\n# Get node tree structure\nGET /api/tree\n\n# Update node properties\nPUT /api/nodes/{node_id}\n{\n  \"title\": \"Updated Title\",\n  \"tags\": [\"tag1\", \"tag2\"]\n}\n\n# Delete a node\nDELETE /api/nodes/{node_id}"}},

        {"type": "header", "data": {"text": "Content Management", "level": 3}},
        {"type": "code", "data": {"code": "# Save note content (EditorJS format)\nPOST /api/notes/{note_id}/content\n{\n  \"time\": 1693656000000,\n  \"blocks\": [...],\n  \"version\": \"2.29.0\"\n}\n\n# Get note content\nGET /api/notes/{note_id}/content\n\n# Search notes\nGET /api/search?q=query&type=note&tags=tag1,tag2"}},

        {"type": "header", "data": {"text": "Chat Operations", "level": 3}},
        {"type": "code", "data": {"code": "# Send chat message\nPOST /api/chats/{chat_id}/messages\n{\n  \"message\": \"Hello, AI!\",\n  \"attachments\": [\"file_id_1\", \"file_id_2\"]\n}\n\n# Get chat history\nGET /api/chats/{chat_id}/messages\n\n# Upload file for RAG\nPOST /api/chats/{chat_id}/upload\n# Form data with file"}},

        {"type": "header", "data": {"text": "File Management", "level": 3}},
        {"type": "code", "data": {"code": "# Upload document\nPOST /api/files/upload\n# Multipart form data\n\n# Get file metadata\nGET /api/files/{file_id}\n\n# Download file\nGET /api/files/{file_id}/download\n\n# Delete file\nDELETE /api/files/{file_id}"}},

        {"type": "header", "data": {"text": "🗄️ Database Schema", "level": 2}},
        {"type": "paragraph", "data": {"text": "Core database tables and relationships:"}},

        {"type": "header", "data": {"text": "Primary Tables", "level": 3}},
        {"type": "code", "data": {"code": "-- Nodes table (notes, folders, chats)\nCREATE TABLE nodes (\n    id TEXT PRIMARY KEY,\n    title TEXT NOT NULL,\n    type TEXT NOT NULL CHECK(type IN ('note', 'folder', 'chat')),\n    parent_id TEXT,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    sort_order INTEGER DEFAULT 0,\n    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE\n);\n\n-- Note content (EditorJS blocks)\nCREATE TABLE note_contents (\n    note_id TEXT PRIMARY KEY,\n    content TEXT NOT NULL, -- JSON\n    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (note_id) REFERENCES nodes(id) ON DELETE CASCADE\n);\n\n-- Chat messages\nCREATE TABLE chat_messages (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    chat_id TEXT NOT NULL,\n    role TEXT NOT NULL CHECK(role IN ('user', 'bot')),\n    content TEXT NOT NULL,\n    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    sources TEXT, -- JSON array\n    FOREIGN KEY (chat_id) REFERENCES nodes(id) ON DELETE CASCADE\n);\n\n-- Tags and relationships\nCREATE TABLE tags (\n    id TEXT PRIMARY KEY,\n    name TEXT UNIQUE NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE node_tags (\n    node_id TEXT,\n    tag_id TEXT,\n    PRIMARY KEY (node_id, tag_id),\n    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,\n    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE\n);\n\n-- File uploads\nCREATE TABLE uploaded_files (\n    id TEXT PRIMARY KEY,\n    filename TEXT NOT NULL,\n    original_filename TEXT NOT NULL,\n    file_size INTEGER,\n    mime_type TEXT,\n    chat_id TEXT,\n    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (chat_id) REFERENCES nodes(id) ON DELETE SET NULL\n);"}},

        {"type": "header", "data": {"text": "🔧 Configuration", "level": 2}},
        {"type": "paragraph", "data": {"text": "Environment variables and configuration options:"}},

        {"type": "code", "data": {"code": "# Required environment variables\nOPENAI_API_KEY=your_openai_api_key_here\n\n# Optional configuration\nFLASK_ENV=development  # or production\nDATABASE_URL=sqlite:///instance/notetaker.db\nUPLOAD_FOLDER=data/uploads\nCHROMA_PERSIST_DIRECTORY=data/chroma_db\nMAX_CONTENT_LENGTH=16777216  # 16MB file upload limit\n\n# AI model settings\nDEFAULT_MODEL=gpt-4\nEMBEDDING_MODEL=text-embedding-ada-002\nMAX_TOKENS=4000\nTEMPERATURE=0.7"}},

        {"type": "header", "data": {"text": "🏃 Development Setup", "level": 2}},
        {"type": "list", "data": {"style": "ordered", "items": [
            "Clone the repository: `git clone https://github.com/yourusername/llm-notetaker.git`",
            "Create virtual environment: `python -m venv notetaker`",
            "Activate environment: `source notetaker/bin/activate` (Linux/Mac) or `notetaker\\Scripts\\activate` (Windows)",
            "Install dependencies: `pip install -r requirements.txt`",
            "Set environment variables in `.env` file",
            "Initialize database: `python migrate_data.py`",
            "Seed demo data: `python seed_demo_db.py`",
            "Run application: `python app.py`"
        ]}},

        {"type": "header", "data": {"text": "🧪 Testing", "level": 2}},
        {"type": "code", "data": {"code": "# Run unit tests\npython -m pytest tests/\n\n# Run with coverage\npython -m pytest --cov=. tests/\n\n# Test specific module\npython -m pytest tests/test_database.py\n\n# Run integration tests\npython -m pytest tests/integration/"}},

        {"type": "header", "data": {"text": "📦 Deployment", "level": 2}},
        {"type": "paragraph", "data": {"text": "Production deployment considerations:"}},
        
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Environment</b>: Set `FLASK_ENV=production`",
            "<b>Database</b>: Consider PostgreSQL for production use",
            "<b>File Storage</b>: Configure cloud storage for uploaded files",
            "<b>Security</b>: Implement proper authentication and authorization",
            "<b>Monitoring</b>: Set up logging and error tracking",
            "<b>Backup</b>: Regular database and file backups"
        ]}},

        {"type": "code", "data": {"code": "# Example Docker deployment\nFROM python:3.11-slim\n\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\n\nCOPY . .\nEXPOSE 5000\n\nCMD [\"gunicorn\", \"--bind\", \"0.0.0.0:5000\", \"app:app\"]"}},

        {"type": "quote", "data": {"text": "Always test thoroughly in a staging environment before deploying to production. The AI integration requires careful API key management and rate limiting.", "caption": "Deployment Best Practice"}}
    ]
    db.save_note_content(api_docs, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": api_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(api_docs, ["tag-documentation", "tag-api", "tag-technical", "tag-development"])

    # Troubleshooting and FAQ Documentation
    troubleshooting_docs = "note-troubleshooting"
    db.create_node(troubleshooting_docs, "Troubleshooting & FAQ", "note", parent_id=docs_folder)
    troubleshooting_blocks = [
        {"type": "header", "data": {"text": "Troubleshooting & FAQ", "level": 1}},
        {"type": "paragraph", "data": {"text": "Common issues, solutions, and frequently asked questions about LLM Notetaker."}},

        {"type": "header", "data": {"text": "🚨 Common Issues", "level": 2}},
        
        {"type": "header", "data": {"text": "Application Won't Start", "level": 3}},
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Symptom", "Likely Cause", "Solution"],
            ["Import errors", "Missing dependencies", "Run `pip install -r requirements.txt`"],
            ["Database errors", "Database not initialized", "Run `python migrate_data.py`"],
            ["OpenAI API errors", "Missing or invalid API key", "Check `OPENAI_API_KEY` environment variable"],
            ["Port already in use", "Another Flask app running", "Kill other Flask processes or change port"]
        ]}},

        {"type": "header", "data": {"text": "File Upload Issues", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>File too large</b>: Check `MAX_CONTENT_LENGTH` setting (default 16MB)",
            "<b>Unsupported format</b>: Ensure file is PDF, DOCX, CSV, or TXT",
            "<b>Upload fails</b>: Check disk space and write permissions on upload folder",
            "<b>Processing stuck</b>: Large files may take time; check browser console for errors"
        ]}},

        {"type": "header", "data": {"text": "AI Chat Problems", "level": 3}},
        {"type": "table", "data": {"withHeadings": True, "content": [
            ["Issue", "Check This", "Fix"],
            ["No AI responses", "OpenAI API key", "Verify key is valid and has credits"],
            ["Slow responses", "Model selection", "Try GPT-3.5-turbo for faster responses"],
            ["Context not working", "File processing", "Wait for document processing to complete"],
            ["Rate limit errors", "API usage", "Reduce request frequency or upgrade plan"]
        ]}},

        {"type": "header", "data": {"text": "Editor Issues", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Content not saving</b>: Check browser console for JavaScript errors",
            "<b>Formatting lost</b>: Ensure EditorJS blocks are properly structured",
            "<b>Images not loading</b>: Verify image URLs and file paths",
            "<b>Slow typing</b>: Large documents may cause performance issues"
        ]}},

        {"type": "header", "data": {"text": "❓ Frequently Asked Questions", "level": 2}},

        {"type": "header", "data": {"text": "General Usage", "level": 3}},
        {"type": "quote", "data": {"text": "Q: How many documents can I upload?", "caption": "FAQ"}},
        {"type": "paragraph", "data": {"text": "There's no hard limit on document count, but consider performance implications. Each document is processed and stored as embeddings, which uses disk space and memory. For best performance, keep individual chats focused on related documents."}},

        {"type": "quote", "data": {"text": "Q: Can I export my notes?", "caption": "FAQ"}},
        {"type": "paragraph", "data": {"text": "Notes are stored in EditorJS JSON format in the database. You can access the raw data or implement export functionality. The API provides endpoints to retrieve all note content programmatically."}},

        {"type": "quote", "data": {"text": "Q: Is my data private?", "caption": "FAQ"}},
        {"type": "paragraph", "data": {"text": "Data is stored locally in your SQLite database. However, when using AI features, content is sent to OpenAI's API. Review OpenAI's privacy policy and consider using on-premises models for sensitive data."}},

        {"type": "header", "data": {"text": "Technical Questions", "level": 3}},
        {"type": "quote", "data": {"text": "Q: Can I use different AI models?", "caption": "FAQ"}},
        {"type": "paragraph", "data": {"text": "The application is designed for OpenAI models but can be adapted for other APIs. Modify the `agent_manager.py` and `rag_manager.py` files to integrate different model providers."}},

        {"type": "quote", "data": {"text": "Q: How much does it cost to run?", "caption": "FAQ"}},
        {"type": "paragraph", "data": {"text": "The main cost is OpenAI API usage. Typical usage ranges from $1-20/month depending on chat frequency and document analysis volume. Monitor your OpenAI dashboard for exact costs."}},

        {"type": "quote", "data": {"text": "Q: Can I run this offline?", "caption": "FAQ"}},
        {"type": "paragraph", "data": {"text": "The note-taking features work offline, but AI chat requires internet access to OpenAI's API. You could modify the code to use local LLMs like Ollama for offline operation."}},

        {"type": "header", "data": {"text": "🔧 Performance Optimization", "level": 2}},
        
        {"type": "header", "data": {"text": "Large Document Handling", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "<b>Split large PDFs</b>: Break documents over 100 pages into sections",
            "<b>Use selective upload</b>: Only upload relevant sections when possible",
            "<b>Clear old embeddings</b>: Periodically clean up ChromaDB storage",
            "<b>Monitor memory</b>: Large document processing requires significant RAM"
        ]}},

        {"type": "header", "data": {"text": "Database Maintenance", "level": 3}},
        {"type": "code", "data": {"code": "# Clean up orphaned data\npython -c \"from database import DatabaseManager; db = DatabaseManager(); db.cleanup_orphaned_data()\"\n\n# Vacuum database (reclaim space)\nsqlite3 instance/notetaker.db \"VACUUM;\"\n\n# Backup database\ncp instance/notetaker.db instance/backup_$(date +%Y%m%d).db\n\n# Check database integrity\nsqlite3 instance/notetaker.db \"PRAGMA integrity_check;\""}},

        {"type": "header", "data": {"text": "🆘 Getting Help", "level": 2}},
        {"type": "paragraph", "data": {"text": "If you're still experiencing issues after trying these solutions:"}},
        
        {"type": "list", "data": {"style": "ordered", "items": [
            "Check the browser console (F12) for JavaScript errors",
            "Look at the Flask application logs for server-side errors",
            "Verify all environment variables are set correctly",
            "Test with a fresh database and minimal data",
            "Check the GitHub issues page for known problems",
            "Create a new issue with detailed error information"
        ]}},

        {"type": "header", "data": {"text": "Debug Information to Include", "level": 3}},
        {"type": "list", "data": {"style": "unordered", "items": [
            "Operating system and Python version",
            "Error messages (full stack traces)",
            "Steps to reproduce the issue",
            "Browser type and version (for frontend issues)",
            "File types and sizes (for upload issues)",
            "Environment variable configuration (without API keys)"
        ]}},

        {"type": "code", "data": {"code": "# Generate debug info\npython -c \"\nimport sys, platform\nprint(f'Python: {sys.version}')\nprint(f'Platform: {platform.platform()}')\nprint(f'Architecture: {platform.architecture()}')\n\ntry:\n    import flask, openai\n    print(f'Flask: {flask.__version__}')\n    print(f'OpenAI: {openai.__version__}')\nexcept ImportError as e:\n    print(f'Import error: {e}')\n\""}},

        {"type": "quote", "data": {"text": "When reporting issues, the more specific information you provide, the faster we can help resolve the problem.", "caption": "Support Tip"}}
    ]
    db.save_note_content(troubleshooting_docs, {"time": int(datetime.utcnow().timestamp()*1000), "blocks": troubleshooting_blocks, "version": "2.29.0"})
    db.assign_tags_to_note(troubleshooting_docs, ["tag-documentation", "tag-troubleshooting", "tag-faq", "tag-support"])

    print(f"Enhanced demo database created: {db_path}")
    print(f"Added comprehensive features:")
    print(f"  • {len(demo_tags)} tags with color coding and categorization")
    print(f"  • Real images integrated from /static/images/ folder (set to small size)") 
    print(f"  • Advanced EditorJS notes with rich formatting and embedded links")
    print(f"  • RAG-enhanced chat examples with actual document analysis")
    print(f"  • File Viewer demonstrations with PDF processing")
    print(f"  • Document Actions toolbar examples (Summary, Key Points, References, etc.)")
    print(f"  • Template-based notes (journal, meeting, project planning)")
    print(f"  • COMPREHENSIVE DOCUMENTATION including:")
    print(f"    - Complete application guide and architecture overview")
    print(f"    - Detailed feature reference with shortcuts and use cases")
    print(f"    - RAG & AI features guide with best practices")
    print(f"    - API & technical reference for developers")
    print(f"    - Troubleshooting guide and FAQ section")
    print(f"  • AI compose/writing assistant demonstrations")
    print(f"  • Technical troubleshooting conversations with code examples")
    print(f"  • Creative writing collaboration examples")
    print(f"  • Multi-document analysis and comparison workflows")
    print(f"  • Document processing pipeline explanations")
    print(f"  • Research paper analysis with real academic content")
    print(f"  • Enhanced recipe collection with international cuisines and actual food images")
    print(f"  • Comprehensive cross-referenced notes with internal and external linking")
    print(f"  • File upload and RAG processing workflow demonstrations")
    print(f"  • Interactive tables with embedded links and formatting")
    print(f"  • Multi-media content integration examples")
    print(f"  • Complete user journey from upload to analysis to note-taking")
    print(f"")
    print(f"Key improvements in this version:")
    print(f"  ✓ Real images instead of placeholders (recipe photos)")
    print(f"  ✓ Actual document upload simulation with file references")
    print(f"  ✓ Comprehensive RAG workflow demonstrations")
    print(f"  ✓ File Viewer integration guide and examples")
    print(f"  ✓ Document Actions toolbar usage examples")
    print(f"  ✓ Enhanced linking between notes and external resources")
    print(f"  ✓ Multi-document analysis chat examples")
    print(f"  ✓ Technical implementation details and troubleshooting")
    print(f"")
    print(f"To use this database:")
    print(f"  DATABASE_PATH={db_path} python app.py")


if __name__ == "__main__":
    main()

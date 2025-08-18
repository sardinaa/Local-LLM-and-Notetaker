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
        {"type": "image", "data": {"url": "", "caption": "Image placeholder via SimpleImage tool"}},
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
        # Image placeholder (SimpleImage tool shows a placeholder)
        blocks.append({"type": "image", "data": {"url": "", "caption": image_caption}})
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
            "https://en.wikipedia.org/",
            "https://www.seriouseats.com/",
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

    print(f"Demo database created: {db_path}")


if __name__ == "__main__":
    main()

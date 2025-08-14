<!--
# Agents Tab — Prompt Specification

Create a new **“Agents”** tab to manage specialized assistants that query our tagged notes and answer via Ollama + RAG.

## A) UI/CRUD for agents
Provide UI to **Create / Read / Update / Delete** agents with these fields:
- **name** (string, required, unique)
- **description** (string, short)
- **role_prompt** (multiline system prompt template; supports handlebars `{{placeholders}}`)
- **tag_filters** (array of tag selectors; allow AND/OR logic)
- **search_strategy** (enum): `keyword`, `semantic`, `hybrid` (default: `hybrid`)
- **top_k** (int, default 6) — max retrieved chunks
- **chunk_size** (int, default 800 chars) — retrieval chunking
- **recency_boost_days** (int|null) — optional freshness bias
- **required_citations** (bool, default true)
- **answer_style** (enum): `concise`, `balanced`, `detailed` (default: `balanced`)
- **tooling** (checkboxes):
  - `rag_notes` (required): search notes by tags
  - `compose_actions` (optional): create/edit notes (needs explicit user toggle per run)
  - `web_search` (optional): disabled by default
- **safety_policies** (textarea): extra constraints
- **output_format** (enum): `markdown` | `plain` | `json` (default: `markdown`)
- **temperature** (float 0–1, default 0.2)
- **max_tokens** (int, default suitable to model)
- **visibility** (enum): `private` | `workspace` (default: `private`)
- **hotkeys/quick-run presets** (optional)

## B) Retrieval rules (RAG over notes)
- Always restrict retrieval to notes that match **tag_filters**.  
- If no tags are set, **ask the user to select tags** before answering.  
- Implement strategy:
  - **keyword**: BM25 over note titles + content.
  - **semantic**: embedding search using our embeddings index.
  - **hybrid**: combine and re-rank.
- Apply **chunking** with overlap; respect `chunk_size`.  
- Apply **recency_boost_days** if set (linear decay).  
- De-duplicate near-duplicates; re-rank by semantic score + recency.  
- Pass only the **top_k** chunks as `CONTEXT` to the model; never dump entire notes.

## C) Response contract
The agent must produce answers that:
- Are grounded in `CONTEXT`. If insufficient, ask a **targeted follow-up** or say “insufficient context.”  
- Include **citations** (note title or ID and anchor snippet) when `required_citations=true`.  
- Follow `answer_style` and `output_format`.  
- Avoid hallucinations; never invent sources or tags.  
- Reflect the `role_prompt` persona and constraints.

## D) Tool calling (functions the agent can use)
Expose these tools to the model:

\`\`\`json
[
  {
    "name": "search_notes",
    "description": "Retrieve note chunks by tags and query.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {"type": "string"},
        "tag_filters": {
          "type": "object",
          "properties": {
            "mode": {"type": "string", "enum": ["AND", "OR"]},
            "tags": {"type": "array", "items": {"type": "string"}}
          },
          "required": ["mode","tags"]
        },
        "strategy": {"type": "string", "enum": ["keyword","semantic","hybrid"]},
        "top_k": {"type": "integer"},
        "chunk_size": {"type": "integer"},
        "recency_boost_days": {"type": ["integer","null"]}
      },
      "required": ["query","tag_filters"]
    }
  },
  {
    "name": "compose_note",
    "description": "Create or update a note. Disabled unless user toggles.",
    "parameters": {
      "type": "object",
      "properties": {
        "note_id": {"type": ["string","null"]},
        "title": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "content": {"type": "string"},
        "mode": {"type": "string", "enum": ["create","update"]}
      },
      "required": ["title","tags","content","mode"]
    }
  },
  {
    "name": "web_search",
    "description": "Optional external search when notes lack coverage. Disabled by default.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {"type": "string"},
        "max_results": {"type": "integer", "default": 5}
      },
      "required": ["query"]
    }
  }
]
\`\`\`

## E) System prompt template (used by each agent)
\`\`\`
You are {{agent_name}}, a specialized assistant.
Follow the SAFETY and STYLE policies below and only use the provided tools.

POLICIES:
- Ground all answers in the retrieved CONTEXT. If context is insufficient, ask one clarifying question or say you need more notes/tags.
- Use only notes matching the configured tag filters.
- If web_search is disabled, do not use it or fabricate external facts.
- Provide citations when required, referencing note titles/IDs and brief quoted snippets.
- Keep private data private; do not reveal raw note IDs unless cited.
- Answer_style={{answer_style}}; Output_format={{output_format}}.
- Be concise and avoid filler.

When you need info, call \`search_notes\`. Use \`compose_note\` only if the user explicitly asked to create/update notes and the run has that permission enabled.

Return your FINAL ANSWER in {{output_format}}.
\`\`\`

## F) Run-time flow
1. On user query:
   - If no `tag_filters` → ask user to pick tags.
   - Else call `search_notes` with (query, tag_filters, strategy, top_k, chunk_size, recency_boost_days).
2. Build a **CONTEXT** block from results (title, note_id, snippet, score, timestamp).  
3. Generate answer using the agent’s **role_prompt** + CONTEXT.  
4. If `compose_actions` is enabled **and** user requested it, propose or execute `compose_note`.  
5. Output answer with citations (if enabled) and a short “Sources” list.

## G) Error handling & guardrails
- If a tool call fails, surface a brief apology + actionable next step.  
- If zero results: suggest relevant tags or a broader query.  
- Never expose stack traces or raw tool args.  
- Respect `max_tokens`; summarize when near limit.

## H) Storage & portability
- Persist agents as JSON objects using this schema keyset:
  `name, description, role_prompt, tag_filters, search_strategy, top_k, chunk_size, recency_boost_days, required_citations, answer_style, tooling, safety_policies, output_format, temperature, max_tokens, visibility`.
- Allow export/import of agent configs as JSON.

## I) Defaults
- `search_strategy=hybrid`, `top_k=6`, `chunk_size=800`, `recency_boost_days=null`,  
  `required_citations=true`, `answer_style=balanced`, `output_format=markdown`,  
  `temperature=0.2`, `visibility=private`, `tooling={rag_notes:true, compose_actions:false, web_search:false}`.
-->

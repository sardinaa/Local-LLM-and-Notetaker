"""
Agents Manager

Implements CRUD for agent configurations stored in instance/agents.json and
provides a minimal retrieval + generation pipeline over existing notes.

Notes:
- Retrieval strategies: implements 'keyword' fully; 'semantic' & 'hybrid' use
  a simple Chroma embedding index if available; otherwise fall back to keyword.
- Tag filters: supported via DataService.get_tags_for_note when backend is
  implemented. If tag APIs are not available yet, tag-filtered searches may
  return fewer/no results; we handle zero-result gracefully per spec.
- Generation: uses Ollama via HTTP API for portability.
"""

from __future__ import annotations

import json
import os
import re
import time
import logging
from typing import Any, Dict, List, Optional, Tuple

import requests

try:
    # Optional: semantic retrieval if LangChain + Chroma are available
    from langchain_chroma import Chroma
    from langchain_ollama import OllamaEmbeddings
    from langchain_core.documents import Document
    _SEMANTIC_AVAILABLE = True
except Exception:
    _SEMANTIC_AVAILABLE = False

logger = logging.getLogger(__name__)


DEFAULT_AGENT: Dict[str, Any] = {
    "name": "",
    "description": "",
    "role_prompt": "",
    "icon": "🤖",
    "tag_filters": {"mode": "AND", "tags": []},
    "search_strategy": "hybrid",
    "top_k": 6,
    "chunk_size": 800,
    "recency_boost_days": None,
    "required_citations": True,
    "answer_style": "balanced",
    "tooling": {"rag_notes": True, "compose_actions": False, "web_search": False},
    "safety_policies": "",
    "output_format": "markdown",
    "temperature": 0.2,
    "max_tokens": 1200,
    "visibility": "private"
}


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip())


def _flatten_tree(nodes: List[Dict]) -> List[Dict]:
    out = []
    for n in nodes or []:
        out.append(n)
        if n.get("children"):
            out.extend(_flatten_tree(n["children"]))
    return out


def _editorjs_to_text(content: Any) -> str:
    # Convert EditorJS structure to plain text for indexing/search
    try:
        if isinstance(content, dict):
            blocks = content.get("blocks") or []
            parts: List[str] = []
            for b in blocks:
                t = b.get("type")
                d = b.get("data", {})
                if t == "paragraph":
                    parts.append(str(d.get("text", "")))
                elif t == "header":
                    parts.append(str(d.get("text", "")))
                elif t == "list":
                    items = d.get("items", [])
                    parts.extend([str(x) for x in items])
                elif t == "code":
                    parts.append(str(d.get("code", "")))
                elif t == "quote":
                    parts.append(str(d.get("text", "")))
                else:
                    # generic fall-back
                    txt = d.get("text")
                    if txt:
                        parts.append(str(txt))
            return "\n".join(parts)
        # If already string
        return str(content or "")
    except Exception:
        return ""


class AgentsManager:
    def __init__(self, data_service, store_path: str = "instance/agents.json", ollama_url: str = "http://127.0.0.1:11434"):
        self.data_service = data_service
        self.store_path = store_path
        self.ollama_url = ollama_url.rstrip('/')
        os.makedirs(os.path.dirname(self.store_path), exist_ok=True)
        self._agents: Dict[str, Dict[str, Any]] = {}
        self._load()

        # Optional semantic index
        self._persist_dir = os.path.join("data", "chroma_db", "agents_notes")
        self._embeddings = None
        self._vectorstore = None
        if _SEMANTIC_AVAILABLE:
            try:
                os.makedirs(self._persist_dir, exist_ok=True)
                self._embeddings = OllamaEmbeddings(model=os.getenv("EMBED_MODEL", "nomic-embed-text"), base_url=self.ollama_url)
                self._vectorstore = Chroma(persist_directory=self._persist_dir, embedding_function=self._embeddings, collection_name="notes_index")
            except Exception as e:
                logger.warning(f"Semantic index unavailable: {e}")

    # -----------------
    # Storage
    # -----------------
    def _load(self):
        try:
            if os.path.exists(self.store_path):
                with open(self.store_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        # Migrate list -> dict keyed by name
                        self._agents = {a.get('name'): a for a in data if a.get('name')}
                    elif isinstance(data, dict):
                        self._agents = data
                    else:
                        self._agents = {}
            else:
                self._agents = {}
                self._save()
        except Exception as e:
            logger.error(f"Failed to load agents store: {e}")
            self._agents = {}

    def _save(self):
        try:
            with open(self.store_path, 'w', encoding='utf-8') as f:
                json.dump(self._agents, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save agents store: {e}")

    # -----------------
    # CRUD
    # -----------------
    def list_agents(self) -> List[Dict[str, Any]]:
        return list(self._agents.values())

    def get_agent(self, name: str) -> Optional[Dict[str, Any]]:
        return self._agents.get(name)

    def create_agent(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        name = _normalize_name(payload.get('name'))
        if not name:
            return None
        if name in self._agents:
            # must be unique
            return None
        agent = DEFAULT_AGENT.copy()
        agent.update(payload)
        agent['name'] = name
        # ensure defaults for nested keys
        if not isinstance(agent.get('tag_filters'), dict):
            agent['tag_filters'] = {"mode": "AND", "tags": []}
        if not isinstance(agent.get('tooling'), dict):
            agent['tooling'] = {"rag_notes": True, "compose_actions": False, "web_search": False}
        self._agents[name] = agent
        self._save()
        return agent

    def update_agent(self, name: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        agent = self._agents.get(name)
        if not agent:
            return None
        # prevent renaming via PATCH; use delete+create for rename
        safe_patch = {k: v for k, v in patch.items() if k != 'name'}
        # merge nested
        if 'tag_filters' in safe_patch and isinstance(safe_patch['tag_filters'], dict):
            agent['tag_filters'] = {**agent.get('tag_filters', {}), **safe_patch.pop('tag_filters')}
        if 'tooling' in safe_patch and isinstance(safe_patch['tooling'], dict):
            agent['tooling'] = {**agent.get('tooling', {}), **safe_patch.pop('tooling')}
        agent.update(safe_patch)
        self._save()
        return agent

    def delete_agent(self, name: str) -> bool:
        if name in self._agents:
            self._agents.pop(name)
            self._save()
            return True
        return False

    def export_all(self) -> Dict[str, Any]:
        return {"agents": self.list_agents(), "exported_at": time.time(), "version": 1}

    def import_all(self, data: Dict[str, Any]) -> int:
        agents = data.get('agents')
        if not isinstance(agents, list):
            return 0
        count = 0
        for a in agents:
            if not a or not a.get('name'):
                continue
            name = _normalize_name(a['name'])
            self._agents[name] = {**DEFAULT_AGENT, **a, "name": name}
            count += 1
        self._save()
        return count

    # -----------------
    # Retrieval over notes
    # -----------------
    def _get_all_notes(self) -> List[Dict[str, Any]]:
        """Return list of note dicts with id, name, content(text), updated_at, tags."""
        tree = self.data_service.get_tree()
        notes: List[Dict[str, Any]] = []
        for n in _flatten_tree(tree):
            if n.get('type') == 'note':
                note_id = n.get('id')
                # Load full content for better indexing
                note = self.data_service.get_note(note_id) or {}
                content = note.get('content') or n.get('content')
                text = _editorjs_to_text(content)
                # Tags (may require backend support)
                try:
                    tags = self.data_service.get_tags_for_note(note_id) or []
                    tag_names = [t.get('name') or t.get('slug') for t in tags]
                except Exception:
                    tag_names = []
                notes.append({
                    'id': note_id,
                    'name': n.get('name') or 'Untitled',
                    'text': text or '',
                    'updated_at': n.get('updated_at'),
                    'tags': [t for t in tag_names if t]
                })
        return notes

    def _note_matches_filters(self, note: Dict[str, Any], tag_filters: Dict[str, Any]) -> bool:
        if not tag_filters or not tag_filters.get('tags'):
            return True
        tags = set([t.lower() for t in (note.get('tags') or [])])
        sel = [t.lower() for t in tag_filters.get('tags') or []]
        mode = (tag_filters.get('mode') or 'AND').upper()
        if mode == 'AND':
            return all(s in tags for s in sel)
        return any(s in tags for s in sel)

    def _keyword_search(self, notes: List[Dict[str, Any]], query: str, top_k: int) -> List[Tuple[Dict[str, Any], float]]:
        q = (query or '').strip().lower()
        if not q:
            return []
        terms = re.findall(r"\w+", q)
        results: List[Tuple[Dict[str, Any], float]] = []
        for note in notes:
            text_l = (note['text'] or '').lower()
            name_l = (note['name'] or '').lower()
            # simple term frequency score with title boost
            score = 0.0
            for t in terms:
                score += text_l.count(t)
                score += 2.0 * name_l.count(t)
            if score > 0:
                results.append((note, score))
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    def _ensure_semantic_index(self, notes: List[Dict[str, Any]]):
        if not (_SEMANTIC_AVAILABLE and self._vectorstore and self._embeddings):
            return
        try:
            # Naive approach: if index empty, add all notes; else skip
            stats = self._vectorstore.get()
            existing = len(stats.get('ids', []) or [])
            if existing == 0:
                docs: List[Document] = []
                for n in notes:
                    if not n['text']:
                        continue
                    docs.append(Document(page_content=n['text'], metadata={"note_id": n['id'], "name": n['name'], "tags": n.get('tags', [])}))
                if docs:
                    self._vectorstore.add_documents(docs)
        except Exception as e:
            logger.warning(f"Failed to prepare semantic index: {e}")

    def _semantic_search(self, notes: List[Dict[str, Any]], query: str, top_k: int, tag_filters: Dict[str, Any]) -> List[Tuple[Dict[str, Any], float]]:
        if not (_SEMANTIC_AVAILABLE and self._vectorstore and self._embeddings):
            return self._keyword_search(notes, query, top_k)
        try:
            self._ensure_semantic_index(notes)
            # Retrieve top candidates
            docs = self._vectorstore.similarity_search(query, k=max(top_k * 2, top_k))
            out: List[Tuple[Dict[str, Any], float]] = []
            seen = set()
            for d in docs:
                nid = d.metadata.get('note_id')
                if not nid or nid in seen:
                    continue
                note = next((n for n in notes if n['id'] == nid), None)
                if not note:
                    continue
                if not self._note_matches_filters(note, tag_filters):
                    continue
                out.append((note, 1.0))
                seen.add(nid)
                if len(out) >= top_k:
                    break
            return out
        except Exception as e:
            logger.warning(f"Semantic search failed, falling back to keyword: {e}")
            return self._keyword_search(notes, query, top_k)

    # -----------------
    # Agent run
    # -----------------
    def search_notes(self, query: str, tag_filters: Dict[str, Any], strategy: str, top_k: int, chunk_size: int, recency_boost_days: Optional[int]) -> List[Dict[str, Any]]:
        from datetime import datetime
        notes = [n for n in self._get_all_notes() if self._note_matches_filters(n, tag_filters)]
        strat = (strategy or 'hybrid').lower()

        # Rank notes first
        if strat == 'keyword':
            ranked = self._keyword_search(notes, query, max(top_k * 3, top_k))
        elif strat == 'semantic':
            ranked = self._semantic_search(notes, query, max(top_k * 3, top_k), tag_filters)
        else:  # hybrid
            kw = self._keyword_search(notes, query, max(top_k * 3, top_k))
            sem = self._semantic_search(notes, query, max(top_k * 3, top_k), tag_filters)
            combined: Dict[str, Tuple[Dict[str, Any], float]] = {}
            for n, s in kw:
                combined[n['id']] = (n, s)
            for n, s in sem:
                # prefer semantic by boosting a bit
                combined[n['id']] = (n, s + 1.0)
            ranked = sorted(combined.values(), key=lambda x: x[1], reverse=True)

        # Chunking with overlap and per-chunk scoring
        q_terms = re.findall(r"\w+", (query or '').lower())
        overlap = min(120, max(60, int(chunk_size * 0.125)))
        chunks_scored: List[Tuple[float, Dict[str, Any]]] = []

        def parse_when(ts: Optional[str]) -> Optional[datetime]:
            if not ts:
                return None
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                try:
                    return datetime.strptime(ts.split('.')[0], fmt)
                except Exception:
                    continue
            return None

        now = datetime.utcnow()
        def recency_factor(when: Optional[str]) -> float:
            if not recency_boost_days:
                return 1.0
            try:
                dt = parse_when(when)
                if not dt:
                    return 1.0
                age = (now - dt).days
                if age <= 0:
                    return 1.1
                # linear decay to ~0.2 at 2x window
                window = max(1, int(recency_boost_days))
                return max(0.2, 1.0 - (age / (2.0 * window)))
            except Exception:
                return 1.0

        for note, base_score in ranked:
            text = note.get('text') or ''
            if not text:
                continue
            # slide window
            i = 0
            N = len(text)
            while i < N:
                snippet = text[i:i+chunk_size].strip()
                if snippet:
                    sn_l = snippet.lower()
                    tf = 0.0
                    for t in q_terms:
                        tf += sn_l.count(t)
                    score = base_score + tf * 1.0
                    score *= recency_factor(note.get('updated_at'))
                    chunks_scored.append((score, {
                        'note_id': note['id'],
                        'title': note['name'],
                        'snippet': snippet,
                        'score': score,
                        'updated_at': note.get('updated_at')
                    }))
                # advance with overlap
                if i + chunk_size >= N:
                    break
                i += max(1, chunk_size - overlap)

        # Sort and de-duplicate near-equal snippets
        chunks_scored.sort(key=lambda x: x[0], reverse=True)
        seen_snips = set()
        out: List[Dict[str, Any]] = []
        for _, item in chunks_scored:
            key = (item['note_id'], (item['snippet'][:120] if item['snippet'] else ''))
            if key in seen_snips:
                continue
            seen_snips.add(key)
            out.append(item)
            if len(out) >= top_k:
                break
        return out

    def _build_prompt(self, agent: Dict[str, Any], query: str, context_chunks: List[Dict[str, Any]]) -> str:
        persona = agent.get('role_prompt') or ''
        style = agent.get('answer_style', 'balanced')
        output_format = agent.get('output_format', 'markdown')
        require_cite = agent.get('required_citations', True)
        # Build CONTEXT block
        ctx_lines = []
        for i, ch in enumerate(context_chunks, 1):
            ctx_lines.append(f"[{i}] {ch['title']} (id={ch['note_id']})\n{ch['snippet']}")
        ctx = "\n\n".join(ctx_lines) if ctx_lines else "(no context)"
        cite_instr = "Include citations like [1], [2] referencing the CONTEXT items." if require_cite else ""
        prompt = (
            f"You are {agent.get('name')}, a specialized assistant.\n"
            f"Persona:\n{persona}\n\n"
            f"POLICIES:\n- Ground all answers in the retrieved CONTEXT. If insufficient, ask one clarifying question or say you need more notes/tags.\n"
            f"- Use only notes matching the configured tag filters.\n"
            f"- Answer_style={style}; Output_format={output_format}. Be concise.\n{cite_instr}\n\n"
            f"CONTEXT:\n{ctx}\n\n"
            f"User question: {query}\n\n"
            f"Final answer (in {output_format}):"
        )
        return prompt

    def _call_ollama(self, model: str, prompt: str, temperature: float, max_tokens: int) -> str:
        try:
            resp = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": temperature,
                        "num_predict": max_tokens
                    }
                },
                timeout=60
            )
            if resp.ok:
                data = resp.json()
                return data.get('response', '').strip()
            logger.error(f"Ollama error: {resp.status_code} {resp.text}")
            return "Error contacting LLM service."
        except Exception as e:
            logger.error(f"Ollama request failed: {e}")
            return "Error contacting LLM service."

    def run_agent(self, agent_name: str, query: str, model: Optional[str] = None) -> Dict[str, Any]:
        agent = self.get_agent(agent_name)
        if not agent:
            return {"status": "error", "message": "Agent not found"}
        tag_filters = agent.get('tag_filters') or {"mode": "AND", "tags": []}
        if not tag_filters.get('tags'):
            return {"status": "needs_tags", "message": "Please select tags for this agent before running."}
        try:
            chunks = self.search_notes(
                query=query,
                tag_filters=tag_filters,
                strategy=agent.get('search_strategy', 'hybrid'),
                top_k=int(agent.get('top_k', 6)),
                chunk_size=int(agent.get('chunk_size', 800)),
                recency_boost_days=agent.get('recency_boost_days')
            )
            if not chunks:
                return {"status": "no_results", "message": "No matching notes found. Try different tags or a broader query.", "results": []}
            prompt = self._build_prompt(agent, query, chunks)
            model_name = model or os.getenv('AGENT_MODEL', 'llama3.2:1b')
            answer = self._call_ollama(model_name, prompt, float(agent.get('temperature', 0.2)), int(agent.get('max_tokens', 1200)))
            # Append minimal sources list
            sources = [
                {"title": c['title'], "note_id": c['note_id'], "snippet": c['snippet'][:160]} for c in chunks
            ]
            return {"status": "success", "answer": answer, "sources": sources}
        except Exception as e:
            logger.error(f"Agent run failed: {e}")
            return {"status": "error", "message": "Failed to run agent"}

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
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    from langchain_community.document_loaders import (
        TextLoader,
        PDFPlumberLoader,
        UnstructuredWordDocumentLoader,
        UnstructuredPowerPointLoader,
        CSVLoader,
    )
    try:
        from langchain_community.document_loaders import UnstructuredURLLoader
        _URL_LOADER = True
    except Exception:
        _URL_LOADER = False
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
    "visibility": "private",
    # Optional routing type: qa | curate | task
    "agent_type": "qa",
    # Knowledge sources config
    "knowledge": {
        "use_notes": True,
        "use_agent_docs": True,
        "use_links": True,
        "links": []  # future: list of URLs to ingest
    }
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

        # Optional semantic index (notes)
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

        # Agent-specific knowledge index root (per-agent collections)
        self._knowledge_dir = os.path.join("data", "chroma_db", "agent_knowledge")
        self._text_splitter = None
        if _SEMANTIC_AVAILABLE and self._embeddings is not None:
            try:
                os.makedirs(self._knowledge_dir, exist_ok=True)
                self._text_splitter = RecursiveCharacterTextSplitter(chunk_size=1800, chunk_overlap=300)
            except Exception as e:
                logger.warning(f"Agent knowledge index unavailable: {e}")

        # Fallback metadata store when embeddings/vector store is unavailable
        self._meta_path = os.path.join("instance", "agent_knowledge_meta.json")
        os.makedirs(os.path.dirname(self._meta_path), exist_ok=True)
        if not os.path.exists(self._meta_path):
            try:
                with open(self._meta_path, 'w', encoding='utf-8') as f:
                    json.dump({}, f)
            except Exception as e:
                logger.warning(f"Unable to init meta store: {e}")

    def _get_agent_vs(self, agent_name: str):
        if not (_SEMANTIC_AVAILABLE and self._embeddings is not None):
            return None

    # -------------
    # Fallback meta store helpers
    # -------------
    def _meta_load(self) -> Dict[str, Any]:
        try:
            with open(self._meta_path, 'r', encoding='utf-8') as f:
                return json.load(f) or {}
        except Exception:
            return {}

    def _meta_save(self, data: Dict[str, Any]):
        try:
            with open(self._meta_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save meta store: {e}")

    def _meta_add_doc(self, agent: str, filename: str):
        data = self._meta_load()
        arr = data.get(agent) or []
        if filename not in arr:
            arr.append(filename)
        data[agent] = arr
        self._meta_save(data)

    def _meta_remove_doc(self, agent: str, filename: str):
        data = self._meta_load()
        arr = [x for x in (data.get(agent) or []) if x != filename]
        data[agent] = arr
        self._meta_save(data)
        try:
            return Chroma(
                persist_directory=self._knowledge_dir,
                embedding_function=self._embeddings,
                collection_name=f"agent_{agent_name}_docs"
            )
        except Exception as e:
            logger.warning(f"Failed to access agent collection: {e}")
            return None

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
        if 'knowledge' in safe_patch and isinstance(safe_patch['knowledge'], dict):
            agent['knowledge'] = {**agent.get('knowledge', {}), **safe_patch.pop('knowledge')}
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

        # Chunking with sentence/paragraph awareness and per-chunk scoring
        q_terms = re.findall(r"\w+", (query or '').lower())
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

        sentence_splitter = re.compile(r"(?<=[.!?])\s+|\n{2,}")

        for note, base_score in ranked:
            text = (note.get('text') or '').strip()
            if not text:
                continue
            # Build sentence-aware windows up to chunk_size
            idx = 0
            sentences = []
            last = 0
            for m in sentence_splitter.finditer(text):
                end = m.start() if m.lastgroup is None else m.start()
                # m does not expose lastgroup for this pattern; use start()
                sentences.append((last, text[last:m.start()]))
                last = m.end()
            if last < len(text):
                sentences.append((last, text[last:]))

            # Aggregate sentences into chunks bounded by chunk_size
            cur_start = None
            cur_buf = []
            cur_len = 0
            for s_start, s_txt in sentences:
                s = (s_txt or '').strip()
                if not s:
                    continue
                if cur_start is None:
                    cur_start = s_start
                if cur_len + len(s) + (1 if cur_buf else 0) <= chunk_size:
                    cur_buf.append(s)
                    cur_len += len(s) + (1 if cur_buf else 0)
                else:
                    snippet = " ".join(cur_buf).strip()
                    if snippet:
                        sn_l = snippet.lower()
                        tf = sum(sn_l.count(t) for t in q_terms)
                        score = (base_score + tf * 1.0) * recency_factor(note.get('updated_at'))
                        chunks_scored.append((score, {
                            'note_id': note['id'],
                            'title': note['name'],
                            'snippet': snippet,
                            'score': score,
                            'updated_at': note.get('updated_at'),
                            'start': cur_start,
                            'end': cur_start + len(snippet)
                        }))
                    # reset
                    cur_start = s_start
                    cur_buf = [s]
                    cur_len = len(s)
            # flush remainder
            if cur_buf:
                snippet = " ".join(cur_buf).strip()
                if snippet:
                    sn_l = snippet.lower()
                    tf = sum(sn_l.count(t) for t in q_terms)
                    score = (base_score + tf * 1.0) * recency_factor(note.get('updated_at'))
                    chunks_scored.append((score, {
                        'note_id': note['id'],
                        'title': note['name'],
                        'snippet': snippet,
                        'score': score,
                        'updated_at': note.get('updated_at'),
                        'start': cur_start,
                        'end': cur_start + len(snippet)
                    }))

        # Optional semantic re-ranking using embeddings
        if _SEMANTIC_AVAILABLE and self._embeddings is not None and chunks_scored:
            try:
                q_emb = self._embeddings.embed_query(query)
                doc_embs = self._embeddings.embed_documents([it[1]['snippet'] for it in chunks_scored])
                # cosine similarity
                import math
                def cos(a, b):
                    dot = sum(x*y for x, y in zip(a, b))
                    na = math.sqrt(sum(x*x for x in a))
                    nb = math.sqrt(sum(y*y for y in b))
                    return (dot / (na * nb)) if na and nb else 0.0
                old_scores = [it[0] for it in chunks_scored]
                max_old = max(old_scores) or 1.0
                rescored: List[Tuple[float, Dict[str, Any]]] = []
                for (old_s, item), de in zip(chunks_scored, doc_embs):
                    sim = cos(q_emb, de)
                    combined = 0.6 * (old_s / max_old) + 0.4 * sim
                    item['score_semantic'] = sim
                    rescored.append((combined, item))
                chunks_scored = rescored
            except Exception as e:
                logger.warning(f"Re-ranking failed: {e}")

        # Sort and de-duplicate near-equal snippets
        chunks_scored.sort(key=lambda x: x[0], reverse=True)
        seen_snips = set()
        out: List[Dict[str, Any]] = []
        for rank, (_, item) in enumerate(chunks_scored, start=1):
            key = (item['note_id'], item.get('start', 0) // max(1, int(chunk_size * 0.5)))
            if key in seen_snips:
                continue
            seen_snips.add(key)
            item['rank'] = rank
            out.append(item)
            if len(out) >= top_k:
                break
        return out

    # -----------------
    # Agent knowledge (documents)
    # -----------------
    def _load_document(self, file_path: str, filename: str) -> List[Document]:
        if not _SEMANTIC_AVAILABLE:
            return []
        try:
            ext = os.path.splitext(filename)[1].lower()
            if ext == ".txt":
                loader = TextLoader(file_path, encoding="utf-8")
            elif ext == ".pdf":
                loader = PDFPlumberLoader(file_path)
            elif ext in (".doc", ".docx"):
                loader = UnstructuredWordDocumentLoader(file_path)
            elif ext in (".ppt", ".pptx"):
                loader = UnstructuredPowerPointLoader(file_path)
            elif ext == ".csv":
                loader = CSVLoader(file_path)
            else:
                loader = TextLoader(file_path, encoding="utf-8")
            docs = loader.load()
            for d in docs:
                d.metadata["filename"] = filename
            return docs
        except Exception as e:
            logger.error(f"Agent doc load failed for {filename}: {e}")
            return []

    def _doc_ids_for_filename(self, agent_name: str, filename: str, n_chunks: int) -> List[str]:
        base = f"{agent_name}::doc::{filename}::"
        return [base + str(i) for i in range(n_chunks)]

    def add_agent_document(self, agent_name: str, file_path: str, filename: str) -> Dict[str, Any]:
        if not self._text_splitter:
            # No chunking; still record filename in fallback meta
            self._meta_add_doc(agent_name, filename)
            return {"status": "success", "chunks": 0, "filename": filename, "note": "Stored filename only; embeddings unavailable"}
        try:
            docs = self._load_document(file_path, filename)
            if not docs:
                return {"status": "error", "message": "Could not parse document"}
            chunks = self._text_splitter.split_documents(docs)
            vs = self._get_agent_vs(agent_name)
            if not vs:
                # Record metadata fallback
                self._meta_add_doc(agent_name, filename)
                return {"status": "success", "chunks": 0, "filename": filename, "note": "Stored filename only; embeddings unavailable"}
            for ch in chunks:
                ch.metadata.update({
                    "agent": agent_name,
                    "collection": f"agent_{agent_name}_docs",
                    "source": "agent_doc",
                    "filename": filename,
                })
            ids = self._doc_ids_for_filename(agent_name, filename, len(chunks))
            try:
                vs.add_documents(chunks, ids=ids)
            except Exception as e:
                logger.error(f"Vector add failed, falling back to meta: {e}")
                self._meta_add_doc(agent_name, filename)
                return {"status": "success", "chunks": 0, "filename": filename, "note": "Stored filename only; embeddings unavailable"}
            return {"status": "success", "chunks": len(chunks), "filename": filename}
        except Exception as e:
            logger.error(f"Failed to add agent document: {e}")
            return {"status": "error", "message": str(e)}

    def list_agent_documents(self, agent_name: str) -> List[Dict[str, Any]]:
        vs = self._get_agent_vs(agent_name)
        if not vs:
            # Fallback to meta list
            files = self._meta_load().get(agent_name) or []
            return [{"filename": f} for f in files]
        try:
            res = vs.get(where={"agent": agent_name})
            filenames = set()
            for md in res.get("metadatas", []) or []:
                if md and md.get("filename"):
                    filenames.add(md["filename"])
            if not filenames:
                # Include meta fallback if vectorstore empty
                files = self._meta_load().get(agent_name) or []
                return [{"filename": f} for f in files]
            return [{"filename": f} for f in sorted(filenames)]
        except Exception as e:
            logger.warning(f"List agent docs failed: {e}")
            files = self._meta_load().get(agent_name) or []
            return [{"filename": f} for f in files]

    def remove_agent_document(self, agent_name: str, filename: str) -> Dict[str, Any]:
        vs = self._get_agent_vs(agent_name)
        if not vs:
            # Remove from meta fallback
            self._meta_remove_doc(agent_name, filename)
            return {"status": "success"}
        try:
            vs.delete(filter={"agent": agent_name, "filename": filename})
            # Also remove from meta if present
            self._meta_remove_doc(agent_name, filename)
            return {"status": "success"}
        except Exception as e:
            logger.error(f"Remove agent document failed: {e}")
            return {"status": "error", "message": str(e)}

    def search_agent_documents(self, agent_name: str, query: str, top_k: int) -> List[Dict[str, Any]]:
        vs = self._get_agent_vs(agent_name)
        if not vs:
            return []
        try:
            retriever = vs.as_retriever(search_kwargs={"k": max(top_k * 2, top_k), "filter": {"agent": agent_name}})
            docs = retriever.get_relevant_documents(query)
            out: List[Dict[str, Any]] = []
            seen = set()
            for d in docs:
                key = (d.metadata.get("filename"), d.page_content[:64])
                if key in seen:
                    continue
                seen.add(key)
                # Score via embedding similarity if possible
                score = 1.0
                out.append({
                    "note_id": (
                        f"doc:{d.metadata.get('filename','unknown')}" if d.metadata.get('source') == 'agent_doc'
                        else f"url:{d.metadata.get('url','unknown')}"
                    ),
                    "title": d.metadata.get("filename") or d.metadata.get("url") or "Document",
                    "snippet": d.page_content,
                    "score": score,
                    "source": d.metadata.get("source") or "agent_doc"
                })
                if len(out) >= top_k:
                    break
            return out
        except Exception as e:
            logger.warning(f"Search agent docs failed: {e}")
            return []

    # -----------------
    # Links ingestion
    # -----------------
    def _ingest_url(self, agent_name: str, url: str) -> Dict[str, Any]:
        vs = self._get_agent_vs(agent_name)
        if not vs:
            return {"status": "success", "chunks": 0, "note": "Embeddings unavailable; stored link only"}
        try:
            docs: List[Document] = []
            if _URL_LOADER:
                loader = UnstructuredURLLoader(urls=[url])
                docs = loader.load()
            else:
                # Fallback: simple requests + basic HTML tag stripping
                import requests, re
                resp = requests.get(url, timeout=20)
                resp.raise_for_status()
                html = resp.text
                text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html, flags=re.IGNORECASE)
                text = re.sub(r"<[^>]+>", "\n", text)
                docs = [Document(page_content=text, metadata={})]
            if not docs:
                return {"status": "error", "message": "No content found at URL"}
            # Split and index
            chunks = self._text_splitter.split_documents(docs) if self._text_splitter else docs
            base_id = f"{agent_name}::url::{abs(hash(url))}::"
            ids = [base_id + str(i) for i in range(len(chunks))]
            for ch in chunks:
                ch.metadata.update({
                    "agent": agent_name,
                    "collection": f"agent_{agent_name}_docs",
                    "source": "agent_link",
                    "url": url,
                })
            vs.add_documents(chunks, ids=ids)
            return {"status": "success", "chunks": len(chunks)}
        except Exception as e:
            logger.error(f"URL ingest failed: {e}")
            return {"status": "error", "message": str(e)}

    def list_agent_links(self, agent_name: str) -> List[str]:
        ag = self.get_agent(agent_name) or {}
        links = ((ag.get('knowledge') or {}).get('links')) or []
        return links

    def add_agent_link(self, agent_name: str, url: str, ingest: bool = True) -> Dict[str, Any]:
        ag = self.get_agent(agent_name)
        if not ag:
            return {"status": "error", "message": "Agent not found"}

        # Normalize URL (prepend https:// if missing)
        try:
            u = url.strip()
            if not u:
                return {"status": "error", "message": "Empty URL"}
            if not (u.lower().startswith('http://') or u.lower().startswith('https://')):
                u = 'https://' + u
            # Validate URL reachability with a lightweight request
            import requests as _rq
            try:
                resp = _rq.head(u, timeout=8, allow_redirects=True)
                if resp.status_code >= 400:
                    # Some servers don't support HEAD; try GET with small timeout
                    resp = _rq.get(u, timeout=10, allow_redirects=True, stream=True)
                if resp.status_code >= 400:
                    return {"status": "error", "message": f"URL not accessible (HTTP {resp.status_code})"}
            except Exception as ve:
                return {"status": "error", "message": f"Failed to reach URL: {ve}"}
        except Exception:
            return {"status": "error", "message": "Invalid URL"}

        # Store in agent knowledge links if not present
        k = ag.get('knowledge') or {}
        links = k.get('links') or []
        if u not in links:
            links.append(u)
            k['links'] = links
            self.update_agent(agent_name, {'knowledge': k})

        # Ingest into vector store if available; otherwise succeed with metadata only
        if ingest:
            res = self._ingest_url(agent_name, u)
            # Don't fail the request if indexing is unavailable; the link is already validated and saved.
            if res.get('status') != 'success':
                logger.warning(f"Link indexing failed for {u}: {res}")
                return {"status": "success", "message": "Link added (indexing unavailable)", "note": res.get('message')}
        return {"status": "success", "message": "Link added"}

    def remove_agent_link(self, agent_name: str, url: str) -> Dict[str, Any]:
        ag = self.get_agent(agent_name)
        if not ag:
            return {"status": "error", "message": "Agent not found"}
        k = ag.get('knowledge') or {}
        links = [u for u in (k.get('links') or []) if u != url]
        k['links'] = links
        self.update_agent(agent_name, {'knowledge': k})
        # Try to delete from vector store
        try:
            vs = self._get_agent_vs(agent_name)
            if vs:
                vs.delete(filter={"agent": agent_name, "url": url})
        except Exception as e:
            logger.warning(f"Failed to delete URL vectors: {e}")
        return {"status": "success", "message": "Link removed"}

    # -----------------
    # Databases (SQLite, read-only) ingestion
    # -----------------
    def list_agent_databases(self, agent_name: str) -> List[Dict[str, Any]]:
        ag = self.get_agent(agent_name) or {}
        dbs = ((ag.get('knowledge') or {}).get('databases')) or []
        return dbs

    def add_agent_database(self, agent_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Supported: SQLite only for now
        ag = self.get_agent(agent_name)
        if not ag:
            return {"status": "error", "message": "Agent not found"}
        k = ag.get('knowledge') or {}
        dbs = k.get('databases') or []
        name = payload.get('name')
        path = payload.get('path')
        if not name or not path:
            return {"status": "error", "message": "name and path required"}
        # Prevent duplicates by name
        if any(d.get('name') == name for d in dbs):
            return {"status": "error", "message": "Database with this name already exists"}
        dbs.append({
            'name': name,
            'type': 'sqlite',
            'path': path,
            'queries': payload.get('queries') or []
        })
        k['databases'] = dbs
        self.update_agent(agent_name, {'knowledge': k})
        return {"status": "success"}

    def remove_agent_database(self, agent_name: str, db_name: str) -> Dict[str, Any]:
        ag = self.get_agent(agent_name)
        if not ag:
            return {"status": "error", "message": "Agent not found"}
        k = ag.get('knowledge') or {}
        dbs = [d for d in (k.get('databases') or []) if d.get('name') != db_name]
        k['databases'] = dbs
        self.update_agent(agent_name, {'knowledge': k})
        # Try to delete from vector store
        try:
            vs = self._get_agent_vs(agent_name)
            if vs:
                vs.delete(filter={"agent": agent_name, "db": db_name})
        except Exception as e:
            logger.warning(f"Failed to delete DB vectors: {e}")
        return {"status": "success"}

    def ingest_agent_database(self, agent_name: str, db_name: str) -> Dict[str, Any]:
        vs = self._get_agent_vs(agent_name)
        if not vs:
            return {"status": "error", "message": "Semantic components unavailable"}
        ag = self.get_agent(agent_name) or {}
        dbs = ((ag.get('knowledge') or {}).get('databases')) or []
        db = next((d for d in dbs if d.get('name') == db_name), None)
        if not db:
            return {"status": "error", "message": "Database not found"}
        if (db.get('type') or 'sqlite') != 'sqlite':
            return {"status": "error", "message": "Only sqlite supported"}
        path = db.get('path')
        queries = db.get('queries') or []
        if not queries:
            return {"status": "error", "message": "No queries configured for this database"}
        # Open in read-only
        import sqlite3
        try:
            # Use URI mode for read-only if path is a file path
            conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
            cur = conn.cursor()
            added = 0
            for qi, q in enumerate(queries):
                try:
                    cur.execute(q)
                    rows = cur.fetchall()
                    cols = [d[0] for d in cur.description] if cur.description else []
                    docs: List[Document] = []
                    for r in rows:
                        if cols:
                            content = "\n".join(f"{c}: {v}" for c, v in zip(cols, r))
                        else:
                            content = ", ".join(str(v) for v in r)
                        docs.append(Document(page_content=content, metadata={}))
                    if not docs:
                        continue
                    chunks = self._text_splitter.split_documents(docs) if self._text_splitter else docs
                    base = f"{agent_name}::db::{db_name}::{qi}::"
                    ids = [base + str(i) for i in range(len(chunks))]
                    for ch in chunks:
                        ch.metadata.update({
                            "agent": agent_name,
                            "collection": f"agent_{agent_name}_docs",
                            "source": "agent_db",
                            "db": db_name,
                            "query": q,
                        })
                    vs.add_documents(chunks, ids=ids)
                    added += len(chunks)
                except Exception as e:
                    logger.warning(f"Query failed for DB {db_name}: {e}")
            conn.close()
            return {"status": "success", "chunks": added}
        except Exception as e:
            logger.error(f"DB ingest failed: {e}")
            return {"status": "error", "message": str(e)}

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
            # Collect knowledge per agent config
            knowledge_cfg = agent.get('knowledge', {}) or {}
            use_notes = knowledge_cfg.get('use_notes', True)
            use_docs = knowledge_cfg.get('use_agent_docs', True)
            use_links = knowledge_cfg.get('use_links', True)

            note_chunks = self.search_notes(
                query=query,
                tag_filters=tag_filters,
                strategy=agent.get('search_strategy', 'hybrid'),
                top_k=int(agent.get('top_k', 6)),
                chunk_size=int(agent.get('chunk_size', 800)),
                recency_boost_days=agent.get('recency_boost_days')
            )
            # Retrieve combined agent knowledge (docs + links), then filter by toggles
            combined_knowledge: List[Dict[str, Any]] = self.search_agent_documents(agent_name, query, int(agent.get('top_k', 6)))
            filtered_knowledge: List[Dict[str, Any]] = []
            for item in combined_knowledge:
                src = (item.get('source') or '').lower()
                if src == 'agent_doc' and use_docs:
                    filtered_knowledge.append(item)
                elif src == 'agent_link' and use_links:
                    filtered_knowledge.append(item)

            chunks: List[Dict[str, Any]] = []
            if use_notes:
                chunks.extend(note_chunks)
            chunks.extend(filtered_knowledge)

            if not chunks:
                return {"status": "no_results", "message": "No matching knowledge found. Try different tags, upload docs, or broaden the query.", "results": []}
            # Orchestrate via role-based agent
            try:
                from agents import AgentOrchestrator
                orchestrator = AgentOrchestrator(self._call_ollama)
                # Pass-through model override
                if model:
                    agent = {**agent, "model": model}
                result = orchestrator.run(agent, query, chunks)
                answer = result.get("answer", "")
            except Exception as e:
                logger.warning(f"Falling back to default prompt build: {e}")
                prompt = self._build_prompt(agent, query, chunks)
                model_name = model or os.getenv('AGENT_MODEL', 'llama3.2:1b')
                answer = self._call_ollama(model_name, prompt, float(agent.get('temperature', 0.2)), int(agent.get('max_tokens', 1200)))

            # Append sources with spans and scores
            # Normalize confidence 0..1 from combined score rank
            scores = [c.get('score') for c in chunks if isinstance(c.get('score'), (int, float))]
            max_s = max(scores) if scores else 1.0
            sources = []
            for c in chunks:
                conf = (c.get('score', 0.0) / max_s) if max_s else 0.0
                sources.append({
                    "title": c.get('title'),
                    "note_id": c.get('note_id'),
                    "snippet": c['snippet'][:200],
                    "start": c.get('start'),
                    "end": c.get('end'),
                    "score": round(float(c.get('score', 0.0)), 4),
                    "semantic": round(float(c.get('score_semantic', 0.0)), 4) if isinstance(c.get('score_semantic'), (int, float)) else None,
                    "confidence": round(float(conf), 3),
                    "rank": c.get('rank')
                })
            return {"status": "success", "answer": answer, "sources": sources}
        except Exception as e:
            logger.error(f"Agent run failed: {e}")
            return {"status": "error", "message": "Failed to run agent"}

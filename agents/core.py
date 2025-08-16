from __future__ import annotations

import os
from typing import Any, Dict, List, Optional


def _read_file(path: str) -> Optional[str]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


class BaseAgent:
    """Base class for all agents. Subclasses implement build_prompt()."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config or {}

    def load_template(self, name: str) -> str:
        # Try prompts/NAME.md, fallback to built-in minimal template
        base = os.path.join("prompts", f"{name}.md")
        txt = _read_file(base)
        if txt:
            return txt
        # Fallback minimal template
        return (
            "You are {agent_name}. Use the CONTEXT to answer the user.\n\n"
            "CONTEXT:\n{context}\n\n"
            "User: {question}\n\n"
            "Answer (with citations like [1], [2] if available):"
        )

    def build_context(self, chunks: List[Dict[str, Any]]) -> str:
        lines = []
        for i, ch in enumerate(chunks, 1):
            title = ch.get("title") or "Untitled"
            note_id = ch.get("note_id")
            snippet = ch.get("snippet") or ""
            lines.append(f"[{i}] {title} (id={note_id})\n{snippet}")
        return "\n\n".join(lines) if lines else "(no context)"

    def build_prompt(self, question: str, chunks: List[Dict[str, Any]]) -> str:
        tmpl = self.load_template("qa")
        persona = self.config.get("role_prompt", "")
        context = self.build_context(chunks)
        return tmpl.format(
            agent_name=self.config.get("name", "Agent"),
            persona=persona,
            question=question,
            context=context,
        )


class QAAgent(BaseAgent):
    pass


class CurateAgent(BaseAgent):
    def build_prompt(self, question: str, chunks: List[Dict[str, Any]]) -> str:
        tmpl = self.load_template("curate")
        return tmpl.format(
            agent_name=self.config.get("name", "Curator"),
            persona=self.config.get("role_prompt", ""),
            question=question,
            context=self.build_context(chunks),
        )


class TaskAgent(BaseAgent):
    def build_prompt(self, question: str, chunks: List[Dict[str, Any]]) -> str:
        tmpl = self.load_template("task")
        return tmpl.format(
            agent_name=self.config.get("name", "Tasker"),
            persona=self.config.get("role_prompt", ""),
            question=question,
            context=self.build_context(chunks),
        )


class AgentOrchestrator:
    """Simple router that picks an Agent class based on agent_type."""

    def __init__(self, llm_caller):
        self.llm_caller = llm_caller

    def _pick_agent(self, agent_config: Dict[str, Any]) -> BaseAgent:
        agent_type = (agent_config.get("agent_type") or "qa").lower()
        if agent_type == "curate":
            return CurateAgent(agent_config)
        if agent_type == "task":
            return TaskAgent(agent_config)
        # Default to QA
        return QAAgent(agent_config)

    def run(self, agent_config: Dict[str, Any], question: str, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        agent = self._pick_agent(agent_config)
        prompt = agent.build_prompt(question, chunks)
        # Call LLM using the function provided (e.g., AgentsManager._call_ollama)
        answer = self.llm_caller(
            agent_config.get("model") or os.getenv("AGENT_MODEL", "llama3.2:1b"),
            prompt,
            float(agent_config.get("temperature", 0.2)),
            int(agent_config.get("max_tokens", 1200)),
        )
        return {"answer": answer}


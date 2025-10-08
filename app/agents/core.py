from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from app.agents.intent_classifier import IntentClassifier


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
    """Router that picks an Agent class based on agent_type and determines if RAG is needed."""

    def __init__(self, llm_caller):
        self.llm_caller = llm_caller
        
        # Initialize simplified three-stage intent classifier
        # Stage 0: Bag-of-Words (<1ms)
        # Stage 1: Semantic Search (50-100ms)
        # Stage 2: LLM with context (100-300ms)
        self.intent_classifier = IntentClassifier(llm_caller=llm_caller)

    def _pick_agent(self, agent_config: Dict[str, Any]) -> BaseAgent:
        agent_type = (agent_config.get("agent_type") or "qa").lower()
        if agent_type == "curate":
            return CurateAgent(agent_config)
        if agent_type == "task":
            return TaskAgent(agent_config)
        # Default to QA
        return QAAgent(agent_config)

    def _needs_document_context(self, question: str, chunks: List[Dict[str, Any]]) -> bool:
        """
        Determine if the question requires document retrieval using intelligent three-stage classification.
        
        Uses a progressive refinement approach:
        1. Bag-of-Words Stage: Ultra-fast term overlap (<1ms) - resolves ~60% of queries
        2. Semantic Search Stage: Context-aware similarity (50-100ms) - resolves ~30% of queries
        3. LLM Stage: Intelligent classification with context (100-300ms) - handles remaining ~10%
        """
        # For AgentOrchestrator, we don't have access to document_terms or retrieval_function
        # So we'll use a simplified classification (just LLM stage)
        # TODO: If you want to use all three stages here, you'll need to pass those parameters
        result = self.intent_classifier.classify(question)
        
        # Log classification for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[AgentOrchestrator] Query classified as '{result.label.upper()}' with confidence {result.confidence:.2f} "
                    f"using {result.method} method (score: {result.score:.2f})")
        
        if result.label == 'general':
            logger.info(f"[AgentOrchestrator] No RAG needed → answering with general knowledge")
            return False
        elif result.label == 'retrieval':
            logger.info(f"[AgentOrchestrator] RAG needed → will retrieve from documents")
            return True
        else:  # ambiguous
            # For ambiguous cases, use retrieval if chunks are available
            decision = len(chunks) > 0
            logger.info(f"[AgentOrchestrator] Ambiguous query → using RAG={decision} (chunks available: {len(chunks)})")
            return decision

    def run(self, agent_config: Dict[str, Any], question: str, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        agent = self._pick_agent(agent_config)
        
        # Determine if we need document context
        needs_rag = self._needs_document_context(question, chunks)
        
        if not needs_rag:
            # Answer directly without RAG - build a simple prompt without context
            direct_prompt = self._build_direct_prompt(agent_config, question)
            answer = self.llm_caller(
                agent_config.get("model") or os.getenv("AGENT_MODEL", "llama3.2:1b"),
                direct_prompt,
                float(agent_config.get("temperature", 0.2)),
                int(agent_config.get("max_tokens", 1200)),
            )
            return {"answer": answer, "used_rag": False}
        
        # Use RAG - build prompt with context
        prompt = agent.build_prompt(question, chunks)
        answer = self.llm_caller(
            agent_config.get("model") or os.getenv("AGENT_MODEL", "llama3.2:1b"),
            prompt,
            float(agent_config.get("temperature", 0.2)),
            int(agent_config.get("max_tokens", 1200)),
        )
        return {"answer": answer, "used_rag": True}
    
    def _build_direct_prompt(self, agent_config: Dict[str, Any], question: str) -> str:
        """Build a prompt for direct answering without document context."""
        agent_name = agent_config.get("name", "Agent")
        persona = agent_config.get("role_prompt", "")
        
        prompt = f"""You are {agent_name}, a helpful AI assistant.

{persona if persona else "You are knowledgeable and provide helpful, accurate answers."}

Important: This question does not require searching through documents or notes. 
Answer based on your general knowledge and training.

Question: {question}

Answer:"""
        return prompt


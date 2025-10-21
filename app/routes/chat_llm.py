from __future__ import annotations

import json
from flask import Blueprint, jsonify, request, current_app, Response
import requests
import os
import logging


logger = logging.getLogger(__name__)
chat_llm_bp = Blueprint("chat_llm", __name__)


# ============================================================================
# OLD ENDPOINTS REMOVED (2025-10-14)
# ============================================================================
# /api/chat - Removed (old system, no memory)
# /api/chat-with-context - Removed (old system, no memory)
# 
# Migration: Use /api/chat-with-graph for all chat operations
# ============================================================================


@chat_llm_bp.get("/chat-summary/<chat_id>")
def get_chat_summary(chat_id: str):
    mgr = getattr(current_app, "chat_history_manager", None)
    if not mgr:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        summary = mgr.get_chat_summary(chat_id)
        return jsonify({"summary": summary})
    except Exception as e:
        logger.error(f"Error getting chat summary for {chat_id}: {e}")
        return jsonify({"error": "Could not generate summary"}), 500


@chat_llm_bp.delete("/chat-context/<chat_id>")
def clear_chat_context(chat_id: str):
    mgr = getattr(current_app, "chat_history_manager", None)
    if not mgr:
        return jsonify({"error": "Agents service unavailable"}), 503
    try:
        success = mgr.clear_session(chat_id)
        if success:
            return jsonify({"status": "success", "message": "Chat context cleared"})
        else:
            return jsonify({"status": "error", "message": "Chat session not found"}), 404
    except Exception as e:
        logger.error(f"Error clearing chat context for {chat_id}: {e}")
        return jsonify({"error": "Could not clear chat context"}), 500


@chat_llm_bp.post("/chat-with-graph")
def chat_with_graph():
    """
    Unified chat endpoint with conversational memory and adaptive features.
    
    This is the primary chat endpoint with all modern features:
    - ✅ Conversational memory (pronoun resolution, context-aware)
    - ✅ Multi-hop reasoning
    - ✅ Iterative refinement
    - ✅ Web search integration
    - ✅ Adaptive RAG retrieval
    - ✅ Streaming support
    
    Request body:
        - chat_id: Chat identifier (required)
        - message: User message (required)
        - memory: Enable conversation memory (default: true)
        - web_search: Force web search (default: false)
        - complexity: 'simple' (fast, 1 iteration) or 'adaptive' (thorough, 3 iterations) (default: 'simple')
        - stream: Enable streaming response (default: true)
        - nodes: Node configuration for adaptive mode (optional)
            - multi_hop: Enable multi-hop reasoning (default: true)
            - refinement: Enable answer refinement (default: true)
            - verification: Enable answer verification (default: true)
        - max_iterations: Manual override for iterations (optional)
        
    Returns:
        - Streaming: Server-sent events with tokens and final metadata
        - Non-streaming: JSON with answer, metadata, sources, debug_info
    """
    data = request.get_json() or {}
    chat_id = data.get("chat_id")
    message = data.get("message")
    
    # Feature toggles with smart defaults
    memory_enabled = data.get("memory", True)  # Memory ON by default
    web_search = data.get("web_search", False)  # Web OFF by default
    complexity = data.get("complexity", "simple")  # Simple (fast) by default
    use_stream = data.get("stream", True)  # Streaming ON by default
    
    # Node configuration for adaptive mode
    nodes_config = data.get("nodes", {
        "multi_hop": True,
        "refinement": True,
        "verification": True
    })
    
    # Determine iterations based on complexity
    if "max_iterations" in data:
        max_iterations = data.get("max_iterations")
    else:
        max_iterations = 1 if complexity == "simple" else 3
    
    facade = getattr(current_app, "chat_agent_facade", None)
    if not facade:
        return jsonify({"error": "Chat agent facade unavailable"}), 503
    
    if not chat_id:
        return jsonify({"error": "chat_id is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400
    
    # Log feature usage for debugging
    logger.info(f"[Chat] chat_id={chat_id}, memory={memory_enabled}, "
               f"web={web_search}, complexity={complexity}, iterations={max_iterations}, stream={use_stream}")
    if complexity == "adaptive":
        logger.info(f"[Chat] Node config: multi_hop={nodes_config.get('multi_hop')}, "
                   f"refinement={nodes_config.get('refinement')}, "
                   f"verification={nodes_config.get('verification')}")
    
    try:
        if use_stream:
            # Streaming response with node-by-node updates
            def generate():
                try:
                    bot_response = ""
                    metadata = None
                    
                    # Stream response with node updates and text chunks
                    for chunk in facade.query_with_graph_stream(
                        chat_id=chat_id,
                        query=message,
                        max_iterations=max_iterations
                    ):
                        if isinstance(chunk, dict):
                            if chunk.get('type') == 'node_update':
                                # Send node progress update
                                yield f"data: {json.dumps({'type': 'node', 'node': chunk['node'], 'data': chunk['data']})}\n\n"
                            elif chunk.get('type') == 'error':
                                # Send error
                                yield f"data: {json.dumps({'error': chunk.get('error', 'Unknown error')})}\n\n"
                                return
                            elif chunk.get('done'):
                                # This is the final metadata (last yield)
                                metadata = chunk
                        elif chunk:
                            # This is a text chunk
                            bot_response += chunk
                            yield f"data: {json.dumps({'token': chunk})}\n\n"
                    
                    # Send completion with metadata
                    completion_data = {'done': True}
                    
                    if metadata:
                        used_rag = metadata.get('used_rag', False)
                        used_web_search = metadata.get('used_web_search', False)
                        sources = metadata.get('sources', [])
                        
                        # Format sources for frontend
                        all_sources = []
                        for src in sources:
                            all_sources.append({
                                'source_type': src.get('source_type', 'document'),
                                'source': src.get('source', 'Unknown'),
                                'url': src.get('url', ''),
                                'title': src.get('title', src.get('source', 'Unknown')),
                                'text': src.get('text', ''),
                                'page': src.get('page'),
                                'chunk_id': src.get('chunk_id'),
                                'search_engine': src.get('search_engine', ''),
                                'has_scraped_content': src.get('has_scraped_content', False)
                            })
                        
                        completion_data['sources'] = all_sources
                        completion_data['used_rag'] = used_rag
                        completion_data['used_web_search'] = used_web_search
                        completion_data['metadata'] = metadata.get('metadata', {})
                        completion_data['metadata']['memory_enabled'] = memory_enabled
                        completion_data['metadata']['web_search_requested'] = web_search
                        completion_data['metadata']['complexity'] = complexity
                        if complexity == "adaptive":
                            completion_data['metadata']['nodes_config'] = nodes_config
                        
                        logger.info(f"[Chat] Graph streaming completed: used_rag={used_rag}, "
                                   f"used_web_search={used_web_search}, sources_count={len(all_sources)}")
                    else:
                        logger.warning(f"[Chat] No metadata received from graph executor!")
                    
                    yield f"data: {json.dumps(completion_data)}\n\n"
                    
                except Exception as e:
                    logger.error(f"Streaming error: {e}", exc_info=True)
                    yield f"data: {json.dumps({'error': 'Error processing request'})}\n\n"
            
            return Response(generate(), mimetype="text/event-stream")
        else:
            # Non-streaming response
            # TODO: Pass memory_enabled, web_search, and nodes_config to query_with_graph once implemented
            # For now, memory is always enabled via .env, web search is handled internally
            result = facade.query_with_graph(
                chat_id=chat_id,
                query=message,
                max_iterations=max_iterations
            )
            
            # Add feature flags to metadata for frontend
            result["metadata"]["memory_enabled"] = memory_enabled
            result["metadata"]["web_search_requested"] = web_search
            result["metadata"]["complexity"] = complexity
            if complexity == "adaptive":
                result["metadata"]["nodes_config"] = nodes_config
            
            return jsonify({
                "answer": result["answer"],
                "metadata": result["metadata"],
                "sources": result.get("sources", []),
                "debug_info": result.get("debug_info", {})
            })
        
    except Exception as e:
        logger.error(f"Error in chat: {e}", exc_info=True)
        if use_stream:
            def error_generate():
                yield f"data: {json.dumps({'error': f'Chat query failed: {str(e)}'})}\n\n"
            return Response(error_generate(), mimetype="text/event-stream")
        else:
            return jsonify({"error": f"Chat query failed: {str(e)}"}), 500



@chat_llm_bp.post("/generate-chat-title")
def generate_chat_title():
    data = request.get_json() or {}
    first_message = data.get("message", "")
    if not first_message:
        return jsonify({"title": "New Chat"}), 400
    title_prompt = f"""Generate a short, descriptive title (2-5 words) for a chat conversation that starts with this message: "{first_message[:200]}"

Rules:
- Maximum 5 words
- No quotes or special characters
- Descriptive and relevant
- Professional tone

Title:"""
    try:
        response = requests.post(
            "http://127.0.0.1:11434/api/generate",
            json={"model": os.getenv("AGENT_MODEL", "llama3.2:1b"), "prompt": title_prompt, "stream": False},
            timeout=30,
        )
        if response.ok:
            generated_title = response.json().get("response", "").strip()
            lines = generated_title.split("\n")
            title = lines[0].strip()
            title = title.replace("Title:", "").replace('"', "").replace("'", "").strip()
            if len(title) > 50:
                title = title[:50].rsplit(" ", 1)[0] + "..."
            if not title or title.lower() in ["chat", "conversation", "discussion"]:
                words = first_message.split()[:4]
                title = " ".join(words)
                if len(title) > 30:
                    title = title[:30] + "..."
            return jsonify({"title": title or "New Chat"})
        else:
            words = first_message.split()[:4]
            title = " ".join(words)
            if len(title) > 30:
                title = title[:30] + "..."
            return jsonify({"title": title or "New Chat"})
    except Exception as e:
        words = first_message.split()[:4]
        title = " ".join(words)
        if len(title) > 30:
            title = title[:30] + "..."
        return jsonify({"title": title or "New Chat"})


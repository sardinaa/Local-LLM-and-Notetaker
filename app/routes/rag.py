"""
RAG Routes - Using Chat Agent System with Intelligent Classification

Enhanced RAG endpoints using the new modular ChatAgentFacade with:
- Intelligent intent classification (3-stage system)
- URL ingestion
- Conversation memory
- Better source tracking
- Streaming with history
- Multi-language support (Spanish, English, etc.)
"""

from __future__ import annotations

import os
import json
import logging
import asyncio
from flask import Blueprint, jsonify, request, current_app, Response
from typing import List, Dict, Any

logger = logging.getLogger(__name__)
rag_bp = Blueprint("rag", __name__, url_prefix="/api/rag")


def serialize_documents(docs):
    """Convert Document objects to JSON-serializable dicts matching frontend expectations."""
    serializable = []
    for doc in docs:
        if hasattr(doc, 'page_content') and hasattr(doc, 'metadata'):
            # It's a Document object - extract metadata
            metadata = doc.metadata or {}
            serializable.append({
                'text': doc.page_content,  # Frontend expects 'text' not 'content'
                'source_type': metadata.get('source_type', 'document'),
                'source': metadata.get('source', 'Unknown'),
                'page': metadata.get('page'),
                'page_label': metadata.get('page_label'),
                'file_path': metadata.get('file_path'),
                'chat_id': metadata.get('chat_id'),
                'id': getattr(doc, 'id', None)
            })
        elif isinstance(doc, dict):
            # Already a dict - ensure it has required fields
            if 'text' not in doc and 'content' in doc:
                doc['text'] = doc.pop('content')
            if 'source_type' not in doc:
                doc['source_type'] = 'document'
            serializable.append(doc)
    return serializable


def get_chat_agent_facade():
    """Get ChatAgentFacade from app context."""
    facade = getattr(current_app, "chat_agent", None)
    if facade is None:
        raise RuntimeError("Chat Agent system not initialized")
    return facade


@rag_bp.get("/health")
def health():
    """Health check endpoint."""
    try:
        facade = get_chat_agent_facade()
        return jsonify({
            "status": "ok",
            "version": "2.0",
            "model": facade.llm.default_model,
            "embedding_model": facade.vector_store_manager.embedding_model,
            "features": ["document_upload", "url_ingestion", "conversation_memory", "streaming", "hybrid_search"]
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({"status": "error", "error": str(e)}), 503


@rag_bp.post("/upload")
def upload_documents():
    """
    Upload one or more documents to a chat's knowledge base.
    
    Form data:
        - chat_id: Chat identifier
        - file: File(s) to upload
        
    Returns:
        JSON with upload results
    """
    try:
        facade = get_chat_agent_facade()
        
        # Get chat_id from form or JSON
        chat_id = request.form.get("chat_id") or (request.get_json() or {}).get("chat_id")
        if not chat_id:
            return jsonify({"error": "chat_id required"}), 400
        
        # Get files from request
        files = []
        if "file" in request.files:
            files = request.files.getlist("file")
        
        if not files:
            return jsonify({"error": "no_file"}), 400
        
        # Prepare upload directory
        project_root = os.path.dirname(current_app.root_path)
        base_dir = os.path.join(project_root, "data", "uploads", chat_id)
        os.makedirs(base_dir, exist_ok=True)
        
        # Process each file
        results = []
        successful = 0
        
        for file in files:
            try:
                filename = file.filename or "uploaded_file"
                safe_filename = filename.replace("..", "_")
                file_path = os.path.join(base_dir, safe_filename)
                
                # Save file
                file.save(file_path)
                
                # Add to knowledge base
                result = facade.add_document(
                    chat_id=chat_id,
                    file_path=file_path,
                    filename=safe_filename
                )
                
                if result.get("success"):
                    successful += 1
                    results.append({
                        "filename": safe_filename,
                        "status": "success",
                        "chunks": result.get("chunks_added", 0),
                        "source_type": result.get("source_type", "document")
                    })
                else:
                    results.append({
                        "filename": safe_filename,
                        "status": "error",
                        "message": result.get("error", "Unknown error")
                    })
                    
            except Exception as e:
                logger.error(f"Error uploading {file.filename}: {e}")
                results.append({
                    "filename": file.filename,
                    "status": "error",
                    "message": str(e)
                })
        
        return jsonify({
            "status": "success" if successful > 0 else "error",
            "results": results,
            "successful_uploads": successful,
            "failed_uploads": len(results) - successful
        }), (200 if successful > 0 else 400)
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        return jsonify({"error": "upload_failed", "details": str(e)}), 500


@rag_bp.post("/add-url")
def add_url():
    """
    Add a URL to a chat's knowledge base.
    
    NEW FEATURE: URL ingestion not available in v1.
    
    JSON body:
        - chat_id: Chat identifier
        - url: URL to add
        
    Returns:
        JSON with ingestion result
    """
    try:
        facade = get_chat_agent_facade()
        
        data = request.get_json() or {}
        chat_id = data.get("chat_id")
        url = data.get("url")
        
        if not chat_id or not url:
            return jsonify({"error": "chat_id and url are required"}), 400
        
        # Validate URL format
        if not url.startswith(("http://", "https://")):
            return jsonify({"error": "Invalid URL format. Must start with http:// or https://"}), 400
        
        # Add URL to knowledge base
        result = facade.add_url(chat_id=chat_id, url=url)
        
        if result.get("success"):
            return jsonify({
                "status": "success",
                "url": url,
                "chunks": result.get("chunks_added", 0),
                "source_type": result.get("source_type", "url")
            })
        else:
            return jsonify({
                "status": "error",
                "error": result.get("error", "Failed to add URL")
            }), 400
            
    except Exception as e:
        logger.error(f"Add URL error: {e}")
        return jsonify({"error": "Failed to add URL", "details": str(e)}), 500


@rag_bp.post("/query")
def query():
    """
    Query documents with optional conversation history.
    
    ENHANCED: Now supports conversation_history for memory.
    
    JSON body:
        - chat_id: Chat identifier
        - query: User query
        - conversation_history: Optional list of messages for context
        - k: Optional number of documents to retrieve (default: 5)
        
    Returns:
        JSON with response, sources, and metadata
    """
    try:
        facade = get_chat_agent_facade()
        
        data = request.get_json() or {}
        chat_id = data.get("chat_id")
        query_text = data.get("query") or data.get("message")
        conversation_history = data.get("conversation_history", [])
        k = data.get("k", 5)
        
        if not chat_id or not query_text:
            return jsonify({"error": "chat_id and query are required"}), 400
        
        # Perform query with conversation history
        result = facade.query(
            chat_id=chat_id,
            query=query_text,
            conversation_history=conversation_history
        )
        
        if result.get("success"):
            # Save to chat history if data_service available
            try:
                ds = getattr(current_app, "data_service", None)
                if ds:
                    from datetime import datetime
                    now = datetime.utcnow().isoformat()
                    
                    existing = ds.get_chat(chat_id)
                    messages = []
                    if isinstance(existing, dict):
                        content = existing.get("content") or {}
                        messages = content.get("messages") or []
                    
                    messages = list(messages) if isinstance(messages, list) else []
                    messages.append({"text": query_text, "sender": "user", "timestamp": now})
                    messages.append({"text": result["response"], "sender": "bot", "timestamp": now})
                    
                    ds.save_chat(chat_id, messages)
            except Exception as persist_err:
                logger.warning(f"Failed to persist query to chat history: {persist_err}")
            
            return jsonify({
                "status": "success",
                "response": result["response"],
                "sources": result.get("sources", []),
                "num_sources": result.get("num_sources", 0),
                "has_memory": len(conversation_history) > 0
            })
        else:
            return jsonify({
                "status": "error",
                "error": result.get("error", "Query failed")
            }), 400
            
    except Exception as e:
        logger.error(f"Query error: {e}")
        return jsonify({"error": "Query failed", "details": str(e)}), 500


@rag_bp.post("/chat")
def chat_stream():
    """
    Streaming chat endpoint with conversation memory.
    
    ENHANCED: Now supports conversation_history for memory.
    
    JSON body:
        - chat_id: Chat identifier
        - message: User message
        - conversation_history: Optional list of messages for context
        - stream: Whether to stream response (default: true)
        - k: Optional number of documents to retrieve
        
    Returns:
        Server-sent events stream or JSON response
    """
    try:
        facade = get_chat_agent_facade()
        
        data = request.get_json() or {}
        chat_id = data.get("chat_id")
        message = data.get("message")
        conversation_history = data.get("conversation_history", [])
        use_stream = data.get("stream", True)
        k = data.get("k", 5)
        
        if not chat_id or not message:
            return jsonify({"error": "chat_id and message are required"}), 400
        
        if use_stream:
            # Capture data_service outside generator to avoid application context issues
            ds = getattr(current_app, "data_service", None)
            
            def generate():
                try:
                    bot_response = ""
                    metadata = None
                    
                    # Stream response with metadata
                    for chunk in facade.query_stream_with_metadata(
                        chat_id=chat_id,
                        query=message,
                        conversation_history=conversation_history
                    ):
                        if isinstance(chunk, dict):
                            # This is the metadata (last yield)
                            metadata = chunk
                        elif chunk:
                            # This is a text chunk
                            bot_response += chunk
                            yield f"data: {json.dumps({'token': chunk})}\n\n"
                    
                    # Save to chat history
                    try:
                        if ds:
                            from datetime import datetime
                            now = datetime.utcnow().isoformat()
                            
                            existing = ds.get_chat(chat_id)
                            messages = []
                            if isinstance(existing, dict):
                                content = existing.get("content") or {}
                                messages = content.get("messages") or []
                            
                            messages = list(messages) if isinstance(messages, list) else []
                            messages.append({"text": message, "sender": "user", "timestamp": now})
                            
                            # Include sources only if RAG was used (serialize Document objects)
                            bot_msg = {"text": bot_response, "sender": "bot", "timestamp": now}
                            if metadata and metadata.get("used_rag"):
                                raw_sources = metadata.get("sources", [])
                                bot_msg["sources"] = serialize_documents(raw_sources)
                            
                            messages.append(bot_msg)
                            
                            ds.save_chat(chat_id, messages)
                    except Exception as persist_err:
                        logger.warning(f"Failed to persist streamed chat: {persist_err}")
                    
                    # Send completion with metadata
                    completion_data = {'done': True}
                    
                    # 🐛 DEBUG: Log metadata
                    logger.info(f"[RAG_V2] Completion metadata: {metadata}")
                    
                    if metadata:
                        completion_data['used_rag'] = metadata.get('used_rag', False)
                        if metadata.get('used_rag'):
                            # Convert Document objects to serializable dicts
                            raw_sources = metadata.get('sources', [])
                            completion_data['sources'] = serialize_documents(raw_sources)
                        completion_data['classification'] = metadata.get('classification', 'unknown')
                        logger.info(f"[RAG_V2] Completion data being sent: used_rag={completion_data.get('used_rag')}, sources_count={len(completion_data.get('sources', []))}, classification={completion_data.get('classification')}")
                    else:
                        logger.warning(f"[RAG_V2] No metadata received from facade!")
                    
                    yield f"data: {json.dumps(completion_data)}\n\n"
                    
                except Exception as e:
                    logger.error(f"Streaming error: {e}")
                    yield f"data: {json.dumps({'error': 'Error processing request'})}\n\n"
            
            return Response(generate(), mimetype="text/event-stream")
        else:
            # Non-streaming response
            result = facade.query(
                chat_id=chat_id,
                query=message,
                conversation_history=conversation_history
            )
            
            if result.get("success"):
                # Save to chat history
                try:
                    ds = getattr(current_app, "data_service", None)
                    if ds:
                        from datetime import datetime
                        now = datetime.utcnow().isoformat()
                        
                        existing = ds.get_chat(chat_id)
                        messages = []
                        if isinstance(existing, dict):
                            content = existing.get("content") or {}
                            messages = content.get("messages") or []
                        
                        messages = list(messages) if isinstance(messages, list) else []
                        messages.append({"text": message, "sender": "user", "timestamp": now})
                        messages.append({"text": result["response"], "sender": "bot", "timestamp": now})
                        
                        ds.save_chat(chat_id, messages)
                except Exception as persist_err:
                    logger.warning(f"Failed to persist chat: {persist_err}")
                
                return jsonify({"response": result["response"]})
            else:
                return jsonify({"response": "Error processing your request."}), 500
                
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return jsonify({"error": "Chat failed", "details": str(e)}), 500


@rag_bp.get("/documents/<chat_id>")
def list_documents(chat_id: str):
    """
    List all documents in a chat's knowledge base.
    
    Returns:
        JSON with list of documents and their metadata
    """
    try:
        facade = get_chat_agent_facade()
        
        documents = facade.list_documents(chat_id)
        
        return jsonify({
            "status": "success",
            "documents": documents,
            "count": len(documents)
        })
        
    except Exception as e:
        logger.error(f"List documents error: {e}")
        return jsonify({"error": "Failed to list documents", "details": str(e)}), 500


@rag_bp.get("/document-content/<chat_id>/<filename>")
def get_document_content(chat_id: str, filename: str):
    """
    Get the text content of a document for preview.
    
    Returns:
        JSON with document content (may be truncated for large files)
    """
    try:
        facade = get_chat_agent_facade()
        
        # Get document path
        project_root = os.path.dirname(current_app.root_path)
        file_path = os.path.join(project_root, "data", "uploads", chat_id, filename)
        
        if not os.path.exists(file_path):
            return jsonify({"error": "Document not found"}), 404
        
        # Read content based on file type
        content = None
        file_ext = filename.lower().split(".")[-1] if "." in filename else ""
        
        if file_ext == "pdf":
            # For PDF, extract text using PyMuPDF (if available)
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(file_path)
                content = ""
                for page in doc:
                    content += page.get_text()
                doc.close()
            except ImportError:
                return jsonify({"error": "PDF text extraction not available"}), 500
        elif file_ext in ["txt", "md", "json", "csv"]:
            # Plain text files
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        else:
            return jsonify({"error": f"Unsupported file type: {file_ext}"}), 400
        
        # Truncate if too large
        max_preview_length = 50 * 1024 if file_ext == "pdf" else 10 * 1024
        truncated = len(content) > max_preview_length
        if truncated:
            content = content[:max_preview_length] + "\n\n... (content truncated for preview) ..."
        
        return jsonify({
            "status": "success",
            "content": content,
            "truncated": truncated,
            "file_type": file_ext,
            "filename": filename
        })
        
    except Exception as e:
        logger.error(f"Get document content error: {e}")
        return jsonify({"error": "Failed to get document content", "details": str(e)}), 500


@rag_bp.get("/document-file/<chat_id>/<filename>")
def serve_document_file(chat_id: str, filename: str):
    """
    Serve the original document file (for PDF viewer, etc).
    
    Returns:
        File download response
    """
    try:
        from flask import send_file
        
        # Get document path
        project_root = os.path.dirname(current_app.root_path)
        
        # Try common locations
        possible_paths = [
            os.path.join(project_root, "data", "uploads", chat_id, filename),
            os.path.join(project_root, "data", "uploads", filename),
            os.path.join(project_root, "uploads", chat_id, filename),
            os.path.join(project_root, "uploads", filename),
            os.path.join(project_root, "instance", "uploads", chat_id, filename),
            os.path.join(project_root, "instance", "uploads", filename),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                # Determine mimetype
                mimetype = None
                if filename.lower().endswith(".pdf"):
                    mimetype = "application/pdf"
                elif filename.lower().endswith((".doc", ".docx")):
                    mimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                elif filename.lower().endswith(".txt"):
                    mimetype = "text/plain"
                
                return send_file(
                    path,
                    as_attachment=False,
                    download_name=filename,
                    mimetype=mimetype
                )
        
        return jsonify({"error": "Document file not found"}), 404
        
    except Exception as e:
        logger.error(f"Serve document file error: {e}")
        return jsonify({"error": "Failed to serve document file", "details": str(e)}), 404


@rag_bp.delete("/documents/<chat_id>/<filename>")
def remove_document(chat_id: str, filename: str):
    """
    Remove a specific document from a chat's knowledge base.
    
    Returns:
        JSON with removal status
    """
    try:
        facade = get_chat_agent_facade()
        
        result = facade.remove_document(chat_id, filename)
        
        if result.get("success"):
            return jsonify({
                "status": "success",
                "message": "Document removed"
            })
        else:
            return jsonify({
                "status": "error",
                "message": result.get("error", "Failed to remove document")
            }), 400
            
    except Exception as e:
        logger.error(f"Remove document error: {e}")
        return jsonify({"error": "Failed to remove document", "details": str(e)}), 500


@rag_bp.delete("/documents/<chat_id>")
def clear_documents(chat_id: str):
    """
    Clear all documents from a chat's knowledge base.
    
    Returns:
        JSON with clear status
    """
    try:
        facade = get_chat_agent_facade()
        
        result = facade.delete_agent(chat_id)
        
        if result.get("success"):
            return jsonify({
                "status": "success",
                "message": "All documents cleared"
            })
        else:
            return jsonify({
                "status": "error",
                "message": result.get("error", "Failed to clear documents")
            }), 400
            
    except Exception as e:
        logger.error(f"Clear documents error: {e}")
        return jsonify({"error": "Failed to clear documents", "details": str(e)}), 500


@rag_bp.get("/stats/<chat_id>")
def get_stats(chat_id: str):
    """
    Get statistics about a chat's knowledge base.
    
    NEW FEATURE: Detailed stats not available in v1.
    
    Returns:
        JSON with knowledge base statistics
    """
    try:
        facade = get_chat_agent_facade()
        
        stats = facade.get_stats(chat_id)
        
        return jsonify({
            "status": "success",
            **stats
        })
        
    except Exception as e:
        logger.error(f"Get stats error: {e}")
        return jsonify({"error": "Failed to get stats", "details": str(e)}), 500


@rag_bp.post("/highlight-chunks")
def highlight_retrieved_chunks():
    """
    Highlight the ACTUAL text chunks that were retrieved by RAG.
    
    This is the correct highlighting approach - show users exactly what
    passages the LLM used to answer their question, not random keyword matches.
    
    JSON body:
        - chat_id: Chat identifier
        - filename: Document filename
        - chunks: Array of text chunks (strings) that were retrieved
        - metadata: Optional dict with page numbers, etc.
        
    Returns:
        JSON with precise highlight locations for the retrieved chunks
    """
    try:
        from services.retrieval.document_highlight_service import get_highlight_service
        
        data = request.get_json() or {}
        
        # Required parameters
        chat_id = data.get("chat_id")
        filename = data.get("filename")
        chunks = data.get("chunks", [])
        
        if not all([chat_id, filename]):
            return jsonify({
                "error": "missing_parameters",
                "message": "chat_id and filename are required"
            }), 400
        
        if not chunks or not isinstance(chunks, list):
            return jsonify({
                "error": "invalid_chunks",
                "message": "chunks must be a non-empty array of text strings"
            }), 400
        
        # Optional metadata
        metadata = data.get("metadata", {})
        
        # Resolve file path - handle different folder structures
        upload_folder = current_app.config['UPLOAD_FOLDER']
        file_path = None
        
        # Try multiple strategies to find the file
        # 1. Direct path: instance/uploads/{chat_id}/{filename}
        direct_path = os.path.join(upload_folder, str(chat_id), filename)
        if os.path.exists(direct_path):
            file_path = direct_path
        else:
            # 2. Search in agent folders: instance/uploads/{agent_name}/{hash}/{filename}
            for agent_folder in os.listdir(upload_folder):
                agent_path = os.path.join(upload_folder, agent_folder)
                if not os.path.isdir(agent_path):
                    continue
                    
                for hash_folder in os.listdir(agent_path):
                    hash_path = os.path.join(agent_path, hash_folder)
                    if not os.path.isdir(hash_path):
                        continue
                        
                    candidate = os.path.join(hash_path, filename)
                    if os.path.exists(candidate):
                        file_path = candidate
                        logger.info(f"Found file in agent structure: {candidate}")
                        break
                        
                if file_path:
                    break
            
            # 3. If still not found, search for ANY PDF (metadata might be outdated)
            if not file_path:
                logger.warning(f"Exact filename '{filename}' not found, searching for any PDF...")
                for agent_folder in os.listdir(upload_folder):
                    agent_path = os.path.join(upload_folder, agent_folder)
                    if not os.path.isdir(agent_path):
                        continue
                        
                    for hash_folder in os.listdir(agent_path):
                        hash_path = os.path.join(agent_path, hash_folder)
                        if not os.path.isdir(hash_path):
                            continue
                            
                        # Find first PDF in this folder
                        for file in os.listdir(hash_path):
                            if file.endswith('.pdf'):
                                candidate = os.path.join(hash_path, file)
                                file_path = candidate
                                logger.info(f"Using fallback PDF: {candidate}")
                                break
                        
                        if file_path:
                            break
                    
                    if file_path:
                        break
        
        if not file_path or not os.path.exists(file_path):
            logger.warning(f"File not found: {filename} (searched in {upload_folder})")
            return jsonify({
                "error": "file_not_found",
                "message": f"Document '{filename}' not found in chat {chat_id}"
            }), 404
        
        # Get highlight service and process
        highlight_service = get_highlight_service()
        
        # Run async method in sync context
        result = asyncio.run(highlight_service.highlight_retrieved_chunks(
            file_path=file_path,
            chunks=chunks,
            filename=filename,
            metadata=metadata
        ))
        
        if result.success:
            logger.info(
                f"Highlighted RAG chunks in '{filename}': "
                f"{result.total_matches} locations found for {len(chunks)} chunks"
            )
            return jsonify(result.to_dict())
        else:
            logger.error(f"Chunk highlight failed: {result.error}")
            return jsonify(result.to_dict()), 500
            
    except ImportError as e:
        logger.error(f"Highlight service not available: {e}")
        return jsonify({
            "error": "service_unavailable",
            "message": "Document highlight service is not properly configured",
            "details": str(e)
        }), 503
    except Exception as e:
        logger.error(f"Chunk highlight endpoint error: {e}", exc_info=True)
        return jsonify({
            "error": "highlight_failed",
            "message": "An unexpected error occurred during chunk highlighting",
            "details": str(e)
        }), 500

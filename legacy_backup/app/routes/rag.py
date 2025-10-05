from __future__ import annotations

import os
from flask import Blueprint, jsonify, request, current_app, Response, send_file, make_response
import json
import requests
import io
import os
import tempfile
import logging
import time
import warnings
from functools import wraps


logger = logging.getLogger(__name__)
rag_bp = Blueprint("rag", __name__)

# ========== Deprecation Decorator for v1 API ==========
def deprecated_endpoint(new_endpoint, sunset_date="2025-12-31"):
    """
    Decorator to mark v1 RAG endpoints as deprecated.
    
    Args:
        new_endpoint: The v2 endpoint that replaces this one
        sunset_date: Date when this endpoint will be removed
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            # Log deprecation warning
            warnings.warn(
                f"Endpoint {request.path} is deprecated. Use {new_endpoint} instead.",
                DeprecationWarning,
                stacklevel=2
            )
            
            # Execute original function
            result = f(*args, **kwargs)
            
            # Add deprecation headers to response
            if isinstance(result, tuple):
                response_data, status_code = result
            else:
                response_data, status_code = result, 200
            
            # Create response with deprecation headers
            if isinstance(response_data, Response):
                response = response_data
            else:
                response = make_response(response_data, status_code)
            
            response.headers['X-API-Deprecated'] = 'true'
            response.headers['X-API-Replacement'] = new_endpoint
            response.headers['X-API-Sunset-Date'] = sunset_date
            response.headers['X-API-Migration-Guide'] = '/api/rag/v1/migration-guide'
            
            return response
        return wrapper
    return decorator

@rag_bp.get("/rag/v1/migration-guide")
def migration_guide():
    """Provide migration guide from v1 to v2 API."""
    return jsonify({
        "message": "RAG v1 API is deprecated and will be removed on 2025-12-31",
        "current_date": "2025-10-05",
        "days_remaining": 87,
        "migration_deadline": "2025-12-31",
        "why_upgrade": {
            "new_features": [
                "Conversation memory for context-aware responses",
                "URL ingestion support (add web content directly)",
                "Hybrid search (semantic + keyword)",
                "Enhanced source attribution with metadata",
                "Real-time knowledge base statistics",
                "Environment-based configuration"
            ],
            "improvements": [
                "Better error handling and messages",
                "Cleaner API design",
                "Modular architecture (easier to maintain)",
                "Better performance and scalability"
            ]
        },
        "v2_health_check": "/api/rag/v2/health",
        "documentation": {
            "api_reference": "/docs/PHASE_2_COMPLETE.md",
            "frontend_guide": "/docs/PHASE_3_FRONTEND_GUIDE.md",
            "architecture": "/docs/CHAT_AGENT_ARCHITECTURE.md",
            "master_guide": "/docs/MASTER_IMPLEMENTATION_GUIDE.md"
        },
        "endpoints_mapping": {
            "/api/rag/health": "/api/rag/v2/health",
            "/api/rag/upload": "/api/rag/v2/upload",
            "/api/rag/chat": "/api/rag/v2/chat",
            "/api/rag/documents/<chat_id>": "/api/rag/v2/documents/<chat_id>",
            "/api/rag/documents/<chat_id>/<filename>": "/api/rag/v2/documents/<chat_id>/<filename>"
        },
        "new_v2_only_endpoints": {
            "/api/rag/v2/add-url": "Add URL to knowledge base",
            "/api/rag/v2/query": "Query with conversation history",
            "/api/rag/v2/stats/<chat_id>": "Get knowledge base statistics"
        },
        "breaking_changes": [
            "Conversation history parameter added (optional but recommended)",
            "Response format enhanced with source metadata",
            "Upload response includes chunk count"
        ],
        "support": "See documentation or contact development team"
    })

@rag_bp.post("/highlight-document")
def highlight_document_legacy():
    # Temporary alias preserved for frontend back-compat
    return highlight_document()


@rag_bp.post("/document-to-editorjs")
def document_to_editorjs():
    try:
        data = request.get_json() or {}
        document_path = data.get("document_path")
        filename = data.get("filename", "Unknown Document")
        if not document_path:
            return jsonify({"error": "Document path is required"}), 400
        # Resolve relative path heuristics
        if not os.path.isabs(document_path) and filename:
            candidates = [
                os.path.join("data", "uploads", document_path),
                os.path.join("data", "uploads", filename),
                document_path,
            ]
            for p in candidates:
                full = os.path.abspath(p)
                if os.path.exists(full):
                    document_path = full
                    break
        if not os.path.exists(document_path):
            return jsonify({"error": "Document not found"}), 404
        # Extract text
        try:
            logger.info(f"Extracting text from: {document_path}")
            if document_path.lower().endswith(".pdf"):
                document_text = extract_pdf_text(document_path)
            elif document_path.lower().endswith((".doc", ".docx")):
                document_text = extract_word_text(document_path)
            elif document_path.lower().endswith(".txt"):
                with open(document_path, "r", encoding="utf-8", errors="replace") as f:
                    document_text = f.read()
            else:
                # Attempt utf-8, fallback to latin-1
                try:
                    with open(document_path, "r", encoding="utf-8", errors="replace") as f:
                        document_text = f.read()
                except UnicodeDecodeError:
                    with open(document_path, "r", encoding="latin-1") as f:
                        document_text = f.read()
        except Exception as e:
            logger.error(f"Failed to read document {document_path}: {e}")
            return jsonify({"error": f"Failed to read document: {str(e)}"}), 500
        if not (document_text or "").strip():
            return jsonify({"error": "Document appears to be empty or unreadable"}), 400
        # Convert to EditorJS
        editorjs_data = convert_text_to_editorjs(document_text, filename)
        return jsonify({"success": True, "editorjs_data": editorjs_data, "filename": filename})
    except Exception as e:
        logger.error(f"Document to EditorJS conversion error: {e}")
        return jsonify({"error": f"Conversion failed: {str(e)}"}), 500


def extract_word_text(doc_path: str) -> str:
    try:
        from docx import Document  # type: ignore
        doc = Document(doc_path)
        return "\n".join(p.text for p in doc.paragraphs)
    except ImportError:
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                pdf_path = _convert_to_pdf_with_libreoffice(doc_path, temp_dir)
                if pdf_path and os.path.exists(pdf_path):
                    return extract_pdf_text(pdf_path)
                return ""
        except Exception:
            return ""
    except Exception:
        return ""


def _convert_to_pdf_with_libreoffice(file_path: str, output_dir: str):
    try:
        import subprocess
        cmd = [
            "/opt/libreoffice24.8/program/soffice",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            output_dir,
            file_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            base = os.path.splitext(os.path.basename(file_path))[0]
            pdf_path = os.path.join(output_dir, f"{base}.pdf")
            return pdf_path if os.path.exists(pdf_path) else None
        return None
    except Exception:
        return None


def convert_text_to_editorjs(text: str, filename: str):
    try:
        import re
        import unicodedata
        if isinstance(text, bytes):
            text = text.decode("utf-8", errors="replace")
        text = unicodedata.normalize("NFC", text)
        # Fix accent artifacts
        for a, b in [("a´", "á"), ("e´", "é"), ("i´", "í"), ("o´", "ó"), ("u´", "ú"), ("n~", "ñ"),
                     ("A´", "Á"), ("E´", "É"), ("I´", "Í"), ("O´", "Ó"), ("U´", "Ú"), ("N~", "Ñ")]:
            text = text.replace(a, b)
        text = text.strip()
        if not text:
            return {
                "time": int(time.time() * 1000),
                "blocks": [{"type": "paragraph", "data": {"text": f"Document: {filename}"}}],
                "version": "2.28.0",
            }
        blocks = []
        lines = text.split("\n")
        current: list[str] = []
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                if current:
                    paragraph_text = " ".join(current).strip()
                    if paragraph_text:
                        blocks.append({"type": "paragraph", "data": {"text": paragraph_text}})
                    current = []
                i += 1
                continue
            is_header = False
            header_level = 2
            if line.isupper() and len(line) < 80:
                is_header = True
                header_level = 1
            elif line.endswith(":") and len(line) < 100:
                is_header = True
                header_level = 2
            elif re.match(r"^\d+\.?\s+[A-ZÁÉÍÓÚÑÜ]", line):
                is_header = True
                header_level = 2
            elif re.match(r"^[IVX]+\.?\s+[A-ZÁÉÍÓÚÑÜ]", line):
                is_header = True
                header_level = 2
            elif re.match(r"^(CAPÍTULO|CHAPTER|SECCIÓN|SECTION|PARTE|PART)\s+", line, re.IGNORECASE):
                is_header = True
                header_level = 1
            elif (len(line) < 80 and not line.endswith(".") and not line.endswith(",") and not line.startswith("-") and not line.startswith("•") and re.search(r"[A-ZÁÉÍÓÚÑÜ]", line)):
                if i + 1 < len(lines) and (not lines[i + 1].strip()):
                    is_header = True
                    header_level = 3
            if is_header:
                if current:
                    paragraph_text = " ".join(current).strip()
                    if paragraph_text:
                        blocks.append({"type": "paragraph", "data": {"text": paragraph_text}})
                    current = []
                blocks.append({"type": "header", "data": {"text": line, "level": header_level}})
            else:
                current.append(line)
            i += 1
        if current:
            paragraph_text = " ".join(current).strip()
            if paragraph_text:
                blocks.append({"type": "paragraph", "data": {"text": paragraph_text}})
        if not blocks:
            blocks.append({"type": "paragraph", "data": {"text": text[:2000] + ("..." if len(text) > 2000 else "")}})
        return {"time": int(time.time() * 1000), "blocks": blocks, "version": "2.28.0"}
    except Exception:
        return {"time": int(time.time() * 1000), "blocks": [{"type": "paragraph", "data": {"text": text[:2000]}}], "version": "2.28.0"}


@rag_bp.post("/rag/analyze-document")
def analyze_document():
    rag_manager = getattr(current_app, "rag_manager", None)
    if not rag_manager:
        return jsonify({"error": "RAG functionality not available"}), 503
    try:
        data = request.get_json() or {}
        chat_id = data.get("chat_id")
        filename = data.get("filename")
        analysis_type = data.get("analysis_type", "summary")
        model_name = data.get("model")
        if not chat_id or not filename:
            return jsonify({"error": "chat_id and filename are required"}), 400
        content = rag_manager.get_document_content(chat_id, filename)
        if not content:
            return jsonify({"error": "Document not found"}), 404
        analysis_prompts = {
            "summary": f"Please provide a comprehensive summary of the document \"{filename}\". Include the main topics, key findings, conclusions, and important insights. Structure with headings and bullets.",
            "key_points": f"Extract and list key points from \"{filename}\" as a bulleted list with concise statements.",
            "references": f"Identify and extract references, citations, links, external sources, names, dates, and important entities in \"{filename}\". Organize by category.",
            "insights": f"Analyze \"{filename}\" and provide insights: key themes, highlights, connections, suggestions, related concepts, and questions.",
        }
        prompt = analysis_prompts.get(analysis_type, analysis_prompts["summary"])
        full_query = f"{prompt}\n\nDocument content: {content[:8000]}..."
        try:
            response = rag_manager.get_rag_response(chat_id, full_query, k=3, model_name=model_name)
            return jsonify({"status": "success", "analysis": response, "analysis_type": analysis_type, "filename": filename}), 200
        except Exception as e:
            logger.error(f"Error generating analysis: {e}")
            from langchain_ollama import OllamaLLM
            fallback_model = model_name if model_name else os.getenv("RAG_MODEL", "llama3.2:3b")
            llm = OllamaLLM(model=fallback_model, base_url="http://127.0.0.1:11434")
            fallback_prompt = f"{prompt}\n\nBased on this document content:\n{content[:6000]}..."
            response = llm.invoke(fallback_prompt)
            return jsonify({"status": "success", "analysis": response, "analysis_type": analysis_type, "filename": filename, "fallback_used": True}), 200
    except Exception as e:
        logger.error(f"Error in document analysis: {e}")
        return jsonify({"error": "Failed to analyze document"}), 500


@rag_bp.get("/rag/health")
@deprecated_endpoint("/api/rag/v2/health")
def rag_health():
    mgr = getattr(current_app, "rag_manager", None)
    if not mgr:
        return jsonify({"status": "unavailable"}), 503
    try:
        return jsonify({
            "status": "ok",
            "model": getattr(mgr, "model_name", None),
            "embedding_model": getattr(mgr, "embedding_model", None),
        })
    except Exception:
        return jsonify({"status": "ok"})


@rag_bp.post("/rag/upload")
@deprecated_endpoint("/api/rag/v2/upload")
def rag_upload():
    mgr = getattr(current_app, "rag_manager", None)
    if not mgr:
        return jsonify({"error": "RAG functionality not available"}), 503
    try:
        chat_id = request.form.get("chat_id") or (request.get_json() or {}).get("chat_id")
        if not chat_id:
            return jsonify({"error": "chat_id required"}), 400
        files = []
        if "file" in request.files:
            files = request.files.getlist("file")
        if not files:
            return jsonify({"error": "no_file"}), 400

        project_root = os.path.dirname(current_app.root_path)
        base = os.path.join(project_root, "data", "uploads", chat_id)
        os.makedirs(base, exist_ok=True)
        results = []
        ok = 0
        for f in files:
            try:
                filename = f.filename or "uploaded_file"
                safe = filename.replace("..", "_")
                dest = os.path.join(base, safe)
                f.save(dest)
                add_res = mgr.add_document_from_file(chat_id, dest, safe, permanent_path=dest)
                results.append({"filename": safe, **add_res})
                if add_res.get("status") == "success":
                    ok += 1
            except Exception as e:
                results.append({"filename": f.filename, "status": "error", "message": str(e)})
        return jsonify({
            "status": "success" if ok else "error",
            "results": results,
            "successful_uploads": ok,
            "failed_uploads": len(results) - ok,
        }), (200 if ok else 400)
    except Exception as e:
        logger.error(f"Upload error: {e}")
        return jsonify({"error": "upload_failed", "details": str(e)}), 500


@rag_bp.post("/rag/highlight-document")
def highlight_document():
    """Intelligent document highlighting using Ollama models."""
    try:
        data = request.get_json() or {}
        document_path = data.get("document_path")
        keywords = data.get("keywords")
        filename = data.get("filename", "Unknown Document")
        if not document_path or not keywords:
            return jsonify({"error": "Document path and keywords are required"}), 400
        if not os.path.exists(document_path):
            return jsonify({"error": "Document not found"}), 404
        try:
            if document_path.lower().endswith(".pdf"):
                document_text = extract_pdf_text(document_path)
            else:
                with open(document_path, "r", encoding="utf-8") as f:
                    document_text = f.read()
        except Exception as e:
            logger.error(f"Failed to read document {document_path}: {e}")
            return jsonify({"error": f"Failed to read document: {str(e)}"}), 500
        if not (document_text or "").strip():
            return jsonify({"error": "Document appears to be empty or unreadable"}), 400

        highlight_prompt = f"""Document: {filename}
Keywords to highlight: {keywords}

Please analyze the following document and identify the most relevant sections, sentences, or phrases that relate to the keywords "{keywords}".

Return your response as a JSON array of objects, where each object has:
- "text": the exact text to highlight
- "relevance": a score from 1-10 indicating relevance
- "context": brief explanation of why this text is relevant

Document content:
{document_text[:4000]}

Respond only with valid JSON array format."""
        try:
            ollama_response = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": os.getenv("RAG_MODEL", "llama3.2:3b"),
                    "prompt": highlight_prompt,
                    "stream": False,
                    "options": {"temperature": 0.3, "top_p": 0.9},
                },
                timeout=300,
            )
            if ollama_response.status_code != 200:
                logger.error(f"Ollama API error: {ollama_response.status_code}")
                return jsonify({"error": "AI analysis service unavailable"}), 503
            ollama_result = ollama_response.json()
            ai_response = ollama_result.get("response", "")
            try:
                clean_response = ai_response.strip()
                if clean_response.startswith("```json"):
                    clean_response = clean_response[7:]
                if clean_response.endswith("```"):
                    clean_response = clean_response[:-3]
                clean_response = clean_response.strip()
                highlights = json.loads(clean_response)
                if not isinstance(highlights, list):
                    raise ValueError("Response is not a list")
                valid_highlights = []
                for h in highlights:
                    if isinstance(h, dict) and "text" in h and "relevance" in h:
                        if h.get("relevance", 0) >= 6:
                            valid_highlights.append(h)
                logger.info(f"Generated {len(valid_highlights)} highlights for keywords: {keywords}")
                return jsonify({"success": True, "highlights": valid_highlights, "keywords": keywords, "filename": filename})
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(f"Failed to parse AI response as JSON: {e}")
                logger.error(f"AI Response: {ai_response}")
                return generate_simple_highlights(document_text, keywords, filename)
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to connect to Ollama: {e}")
            return generate_simple_highlights(document_text, keywords, filename)
    except Exception as e:
        logger.error(f"Highlight document error: {e}")
        return jsonify({"error": f"Highlighting failed: {str(e)}"}), 500


def extract_pdf_text(pdf_path: str) -> str:
    try:
        text = ""
        use_ocr_fallback = False
        try:
            import pdfplumber  # type: ignore
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            if text.strip():
                import unicodedata
                text = unicodedata.normalize("NFC", text)
                text = text.replace("a´", "á").replace("e´", "é").replace("i´", "í").replace("o´", "ó").replace("u´", "ú")
                text = text.replace("n~", "ñ").replace("A´", "Á").replace("E´", "É").replace("I´", "Í").replace("O´", "Ó").replace("U´", "Ú").replace("N~", "Ñ")
                if len(text.strip()) < 100:
                    use_ocr_fallback = True
                else:
                    return text
            else:
                use_ocr_fallback = True
        except Exception as e:
            use_ocr_fallback = True
        if not text.strip():
            try:
                import pypdf  # type: ignore
                with open(pdf_path, "rb") as file:
                    pdf_reader = pypdf.PdfReader(file)
                    for page in pdf_reader.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                if text.strip():
                    import unicodedata
                    text = unicodedata.normalize("NFC", text)
                    text = text.replace("\x00", "").replace("\ufeff", "")
                    text = text.replace("a´", "á").replace("e´", "é").replace("i´", "í").replace("o´", "ó").replace("u´", "ú").replace("n~", "ñ")
                    text = text.replace("A´", "Á").replace("E´", "É").replace("I´", "Í").replace("O´", "Ó").replace("U´", "Ú").replace("N~", "Ñ")
                    return text
            except Exception:
                pass
        if use_ocr_fallback:
            try:
                import pytesseract  # type: ignore
                from PIL import Image  # type: ignore
                import pdf2image  # type: ignore
                images = pdf2image.convert_from_path(pdf_path)
                text = "\n".join(pytesseract.image_to_string(img, lang="eng+spa") for img in images)
                return text
            except Exception:
                return ""
        return text
    except Exception:
        return ""


def generate_simple_highlights(document_text: str, keywords: str, filename: str):
    try:
        highlights = []
        kws = [k.strip() for k in (keywords or "").split(",") if k.strip()]
        if not kws:
            return jsonify({"success": True, "highlights": [], "keywords": keywords, "filename": filename})
        lowered = document_text.lower()
        for kw in kws:
            pos = 0
            while True:
                idx = lowered.find(kw.lower(), pos)
                if idx == -1:
                    break
                start = max(0, idx - 60)
                end = min(len(document_text), idx + len(kw) + 60)
                snippet = document_text[start:end]
                highlights.append({"text": snippet, "relevance": 7, "context": f"Match for '{kw}'"})
                pos = idx + len(kw)
        highlights = sorted(highlights, key=lambda x: x["relevance"], reverse=True)[:10]
        return jsonify({"success": True, "highlights": highlights, "keywords": keywords, "filename": filename})
    except Exception:
        return jsonify({"success": True, "highlights": [], "keywords": keywords, "filename": filename})


@rag_bp.post("/rag/chat")
def rag_chat():
    mgr = getattr(current_app, "rag_manager", None)
    ds = getattr(current_app, "data_service", None)
    if not mgr or not ds:
        return jsonify({"error": "RAG functionality not available"}), 503
    data = request.get_json() or {}
    chat_id = data.get("chat_id")
    message = data.get("message", "")
    use_stream = data.get("stream", True)
    k = data.get("k", 5)
    model_name = data.get("model")
    if not chat_id:
        return jsonify({"error": "chat_id is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400
    if use_stream:
        def generate():
            try:
                bot_response = ""
                for chunk in mgr.get_rag_response_stream(chat_id, message, k, model_name):
                    if chunk:
                        bot_response += chunk
                        yield f"data: {{\"token\": {json.dumps(chunk)} }}\n\n"
                try:
                    existing = ds.get_chat(chat_id)
                    messages = []
                    if isinstance(existing, dict):
                        content = existing.get("content") or {}
                        messages = content.get("messages") or []
                    from datetime import datetime
                    now = datetime.utcnow().isoformat()
                    messages = list(messages) if isinstance(messages, list) else []
                    messages.append({"text": message, "sender": "user", "timestamp": now})
                    messages.append({"text": bot_response, "sender": "bot", "timestamp": now})
                    ds.save_chat(chat_id, messages)
                except Exception as persist_err:
                    logger.warning(f"Failed to persist streamed RAG chat for {chat_id}: {persist_err}")
                yield f"data: {{\"done\": true}}\n\n"
            except Exception as e:
                logger.error(f"Error in streaming RAG chat: {e}")
                yield f"data: {{\"error\": \"Error processing your request.\"}}\n\n"
        return Response(generate(), mimetype="text/plain")
    else:
        try:
            response = mgr.get_rag_response(chat_id, message, k, model_name)
            try:
                existing = ds.get_chat(chat_id)
                messages = []
                if isinstance(existing, dict):
                    content = existing.get("content") or {}
                    messages = content.get("messages") or []
                from datetime import datetime
                now = datetime.utcnow().isoformat()
                messages = list(messages) if isinstance(messages, list) else []
                messages.append({"text": message, "sender": "user", "timestamp": now})
                messages.append({"text": response, "sender": "bot", "timestamp": now})
                ds.save_chat(chat_id, messages)
            except Exception as persist_err:
                logger.warning(f"Failed to persist RAG chat for {chat_id}: {persist_err}")
            return jsonify({"response": response})
        except Exception as e:
            logger.error(f"Error in RAG chat: {e}")
            return jsonify({"response": "Error processing your request."})


@rag_bp.get("/rag/documents/<chat_id>")
def list_chat_documents(chat_id: str):
    mgr = getattr(current_app, "rag_manager", None)
    if not mgr:
        return jsonify({"error": "RAG functionality not available"}), 503
    try:
        documents = mgr.list_documents_for_chat(chat_id)
        return jsonify({"documents": documents}), 200
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        return jsonify({"error": "Failed to list documents"}), 500


@rag_bp.delete("/rag/documents/<chat_id>/<filename>")
def remove_document(chat_id: str, filename: str):
    mgr = getattr(current_app, "rag_manager", None)
    if not mgr:
        return jsonify({"error": "RAG functionality not available"}), 503
    try:
        success = mgr.remove_document_from_chat(chat_id, filename)
        if success:
            return jsonify({"status": "success", "message": "Document removed"}), 200
        else:
            return jsonify({"status": "error", "message": "Failed to remove document"}), 400
    except Exception as e:
        logger.error(f"Error removing document: {e}")
        return jsonify({"error": "Failed to remove document"}), 500


@rag_bp.delete("/rag/documents/<chat_id>")
def clear_chat_documents(chat_id: str):
    mgr = getattr(current_app, "rag_manager", None)
    if not mgr:
        return jsonify({"error": "RAG functionality not available"}), 503
    try:
        success = mgr.clear_chat_documents(chat_id)
        if success:
            return jsonify({"status": "success", "message": "All documents cleared"}), 200
        else:
            return jsonify({"status": "error", "message": "Failed to clear documents"}), 400
    except Exception as e:
        logger.error(f"Error clearing documents: {e}")
        return jsonify({"error": "Failed to clear documents"}), 500


@rag_bp.get("/rag/debug/<chat_id>")
def debug_rag_documents(chat_id: str):
    mgr = getattr(current_app, "rag_manager", None)
    if not mgr:
        return jsonify({"error": "RAG functionality not available"}), 503
    try:
        debug_info = mgr.debug_documents(chat_id)
        return jsonify(debug_info)
    except Exception as e:
        return jsonify({"error": f"Debug error: {str(e)}"}), 500


@rag_bp.get("/rag/document-content/<chat_id>/<filename>")
def get_document_content(chat_id: str, filename: str):
    mgr = getattr(current_app, "rag_manager", None)
    if not mgr:
        return jsonify({"error": "RAG functionality not available"}), 503
    try:
        content = mgr.get_document_content(chat_id, filename)
        if content is not None:
            file_ext = filename.lower().split(".")[-1] if "." in filename else ""
            max_preview_length = 50 * 1024 if file_ext == "pdf" else 10 * 1024
            truncated = len(content) > max_preview_length
            if truncated:
                content = content[: max_preview_length] + "\n\n... (content truncated for preview) ..."
            return jsonify({"status": "success", "content": content, "truncated": truncated, "file_type": file_ext, "filename": filename}), 200
        else:
            return jsonify({"error": "Document not found or content not available"}), 404
    except Exception as e:
        logger.error(f"Error getting document content: {e}")
        return jsonify({"error": "Failed to get document content"}), 500


@rag_bp.get("/rag/document-file/<chat_id>/<filename>")
def serve_document_file(chat_id: str, filename: str):
    mgr = getattr(current_app, "rag_manager", None)
    if not mgr:
        return jsonify({"error": "RAG functionality not available"}), 503
    try:
        project_root = os.path.dirname(current_app.root_path)
        file_path = mgr.get_document_file_path(chat_id, filename)
        if file_path and os.path.exists(file_path):
            if filename.lower().endswith((".doc", ".docx")):
                return _serve_converted_document(file_path, filename)
            return send_file(file_path, as_attachment=False, download_name=filename, mimetype="application/pdf" if filename.lower().endswith(".pdf") else None)
        # Try common locations, both with and without chat_id subfolder
        possible_paths = [
            os.path.join(project_root, "data", "uploads", chat_id, filename),
            os.path.join(project_root, "data", "uploads", filename),
            os.path.join(project_root, "uploads", chat_id, filename),
            os.path.join(project_root, "uploads", filename),
            os.path.join(project_root, "instance", "uploads", chat_id, filename),
            os.path.join(project_root, "instance", "uploads", filename),
            os.path.join(tempfile.gettempdir(), filename),
        ]
        for path in possible_paths:
            if os.path.exists(path):
                mgr._store_file_path(chat_id, filename, path)
                if filename.lower().endswith((".doc", ".docx")):
                    return _serve_converted_document(path, filename)
                return send_file(path, as_attachment=False, download_name=filename, mimetype="application/pdf" if filename.lower().endswith(".pdf") else None)
        if hasattr(mgr, "find_uploaded_file"):
            found_path = mgr.find_uploaded_file(filename)
            if found_path:
                mgr._store_file_path(chat_id, filename, found_path)
                if filename.lower().endswith((".doc", ".docx")):
                    return _serve_converted_document(found_path, filename)
                return send_file(found_path, as_attachment=False, download_name=filename, mimetype="application/pdf" if filename.lower().endswith(".pdf") else None)
        return jsonify({"error": "Original file not found"}), 404
    except Exception as e:
        logger.error(f"Error serving document file: {e}")
        # Prefer explicit 404 over 500 for missing files
        return jsonify({"error": "Failed to serve document file"}), 404


@rag_bp.get("/test/sample-pdf")
def serve_sample_pdf():
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        p.drawString(100, 750, "Sample PDF Document")
        p.drawString(100, 700, "This is a test PDF to demonstrate the PDF viewer functionality.")
        p.drawString(100, 600, "Features:")
        p.drawString(120, 570, "• Native PDF viewing in browser")
        p.drawString(120, 540, "• Original format preservation")
        p.drawString(120, 510, "• Toggle between PDF and text view")
        p.drawString(120, 480, "• Download and external viewing options")
        p.showPage()
        p.save()
        buffer.seek(0)
        return send_file(io.BytesIO(buffer.read()), mimetype="application/pdf", as_attachment=False, download_name="sample-document.pdf")
    except ImportError:
        return jsonify({"error": "ReportLab not available for PDF generation", "message": "Please upload a real PDF file to test the viewer"}), 404


def _serve_converted_document(file_path: str, filename: str):
    try:
        cache_dir = os.path.join("data", "document_cache")
        os.makedirs(cache_dir, exist_ok=True)
        base_name = os.path.splitext(filename)[0]
        cache_file = os.path.join(cache_dir, f"{base_name}.pdf")
        if os.path.exists(cache_file) and os.path.getmtime(cache_file) > os.path.getmtime(file_path):
            return send_file(cache_file, mimetype="application/pdf")
        pdf_path = _convert_to_pdf_with_libreoffice(file_path, cache_dir)
        if pdf_path and os.path.exists(pdf_path):
            if pdf_path != cache_file:
                import shutil
                shutil.move(pdf_path, cache_file)
            return send_file(cache_file, mimetype="application/pdf")
        else:
            logger.warning(f"PDF conversion failed for {filename}, falling back to text extraction")
            return jsonify({"error": "Document conversion failed", "fallback": True}), 422
    except Exception as e:
        logger.error(f"Error converting document {filename}: {e}")
        return jsonify({"error": "Document conversion failed", "fallback": True}), 422


def _convert_to_pdf_with_libreoffice(file_path: str, output_dir: str):
    try:
        import subprocess
        cmd = [
            "/opt/libreoffice24.8/program/soffice",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            output_dir,
            file_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            base = os.path.splitext(os.path.basename(file_path))[0]
            pdf_path = os.path.join(output_dir, f"{base}.pdf")
            return pdf_path if os.path.exists(pdf_path) else None
        else:
            logger.warning(f"LibreOffice conversion failed: {result.stderr}")
            return None
    except Exception as e:
        logger.warning(f"LibreOffice conversion error: {e}")
        return None

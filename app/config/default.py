import os


class DefaultConfig:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")
    DEBUG = os.environ.get("FLASK_DEBUG", "0") == "1"

    # Paths
    DATABASE_PATH = os.environ.get("DATABASE_PATH", "data/db/notetaker.db")
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "data/uploads")
    CHROMA_PERSIST_DIRECTORY = os.environ.get("CHROMA_PERSIST_DIRECTORY", "data/chroma_db")

    # External services
    OLLAMA_BASE_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
    RAG_EMBEDDING_MODEL = os.environ.get("RAG_EMBEDDING_MODEL", "nomic-embed-text")

    # Models
    DEFAULT_MODEL = os.environ.get("COMPOSE_MODEL", "llama3:latest")
    RAG_MODEL = os.environ.get("RAG_MODEL", "llama3:latest")
    AGENT_MODEL = os.environ.get("AGENT_MODEL", "llama3:latest")
    RECIPE_MODEL = os.environ.get("RECIPE_MODEL", "llama3:latest")


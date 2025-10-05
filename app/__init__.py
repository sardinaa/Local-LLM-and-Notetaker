from flask import Flask
import os


def create_app(config_object: str | None = None) -> Flask:
    """Application factory for the LLM Notetaker app.

    This sets up config, extensions/services, and registers blueprints.
    """
    # Resolve folders relative to project root (repo root), not package dir
    pkg_dir = os.path.dirname(__file__)
    project_root = os.path.abspath(os.path.join(pkg_dir, os.pardir))

    def _abs_path(path: str) -> str:
        if os.path.isabs(path):
            return path
        return os.path.join(project_root, path)

    static_folder = os.environ.get("STATIC_FOLDER", os.path.join(project_root, "static"))
    template_folder = os.environ.get("TEMPLATE_FOLDER", os.path.join(project_root, "templates"))
    static_folder = _abs_path(static_folder)
    template_folder = _abs_path(template_folder)

    app = Flask(
        __name__,
        static_folder=static_folder,
        template_folder=template_folder,
        instance_relative_config=True,
    )

    # Load configuration
    _configure_app(app, config_object)

    # Initialize services/extensions and attach to app
    _init_services(app)

    # Register blueprints (feature routes)
    _register_blueprints(app)

    return app


def _configure_app(app: Flask, config_object: str | None) -> None:
    # Default config
    app.config.from_object("app.config.default.DefaultConfig")

    # Environment-specific override
    env = os.environ.get("FLASK_ENV", "development").lower()
    if env == "production":
        app.config.from_object("app.config.prod.ProdConfig")
    else:
        app.config.from_object("app.config.dev.DevConfig")

    # Explicit override via import path
    if config_object:
        app.config.from_object(config_object)

    # Instance config file if present
    app.config.from_pyfile("config.py", silent=True)


def _init_services(app: Flask) -> None:
    """Initialize and attach service singletons under app.* attributes.

    This mirrors the current monolith setup to avoid broad refactors at once.
    """
    # Lazy imports to keep factory lightweight and avoid optional deps at import time
    from core.data_service import DataService  # existing module
    from services.task_service import TaskService  # existing module

    # Optional/large components — import guarded
    try:
        from services.chat_history_manager import ChatHistoryManager  # type: ignore
    except Exception:
        ChatHistoryManager = None  # type: ignore

    try:
        from services.agents.facade import ChatAgentFacade  # type: ignore
    except Exception:
        ChatAgentFacade = None  # type: ignore

    try:
        from services.agent_manager import AgentsManager  # type: ignore
    except Exception:
        AgentsManager = None  # type: ignore

    try:
        from services.job_scraper_service import get_scraper_service  # type: ignore
    except Exception:
        get_scraper_service = None  # type: ignore

    # Database-backed services
    db_path = os.getenv("DATABASE_PATH", app.config.get("DATABASE_PATH", "instance/notetaker.db"))
    data_service = DataService(db_path=db_path)
    app.data_service = data_service  # type: ignore[attr-defined]

    # Task service
    try:
        app.task_service = TaskService(data_service.db)  # type: ignore[attr-defined]
    except Exception:
        app.task_service = None  # type: ignore[attr-defined]

    # Repositories
    try:
        from .repositories.notes import NotesRepository
        from .repositories.tags import TagsRepository
        from .repositories.jobs import JobsRepository
        from .repositories.tasks import TaskRepository
        from .repositories.calendar import CalendarRepository
        app.notes_repo = NotesRepository(data_service.db)  # type: ignore[attr-defined]
        app.tags_repo = TagsRepository(data_service.db)  # type: ignore[attr-defined]
        app.jobs_repo = JobsRepository(data_service.db)  # type: ignore[attr-defined]
        app.tasks_repo = TaskRepository(data_service.db)  # type: ignore[attr-defined]
        app.calendar_repo = CalendarRepository(data_service.db)  # type: ignore[attr-defined]
    except Exception:
        app.notes_repo = None  # type: ignore[attr-defined]
        app.tags_repo = None  # type: ignore[attr-defined]
        app.jobs_repo = None  # type: ignore[attr-defined]
        app.tasks_repo = None  # type: ignore[attr-defined]
        app.calendar_repo = None  # type: ignore[attr-defined]

    # Notes service
    try:
        from .services.notes_service import NotesService
        if app.notes_repo is not None:
            app.notes_service = NotesService(app.notes_repo, data_service)  # type: ignore[attr-defined]
        else:
            app.notes_service = None  # type: ignore[attr-defined]
    except Exception:
        app.notes_service = None  # type: ignore[attr-defined]

    # Tags service
    try:
        from .services.tags_service import TagsService
        if app.tags_repo is not None:
            app.tags_service = TagsService(app.tags_repo, data_service, data_service.db)  # type: ignore[attr-defined]
        else:
            app.tags_service = None  # type: ignore[attr-defined]
    except Exception:
        app.tags_service = None  # type: ignore[attr-defined]

    # Jobs service
    try:
        from .services.jobs_service import JobsService
        if app.jobs_repo is not None:
            app.jobs_service = JobsService(app.jobs_repo, data_service.db)  # type: ignore[attr-defined]
        else:
            app.jobs_service = None  # type: ignore[attr-defined]
    except Exception:
        app.jobs_service = None  # type: ignore[attr-defined]

    # Time service removed

    # Chat history
    ollama_url = os.getenv("OLLAMA_URL", app.config.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434"))
    if ChatHistoryManager is not None:
        try:
            app.chat_history_manager = ChatHistoryManager(ollama_base_url=ollama_url)  # type: ignore[attr-defined]
        except Exception:
            app.chat_history_manager = None  # type: ignore[attr-defined]
    else:
        app.chat_history_manager = None  # type: ignore[attr-defined]

    # Chat Agent Facade (RAG v2 system)
    if ChatAgentFacade is not None:
        try:
            # Initialize with Ollama URL from config
            app.chat_agent = ChatAgentFacade(ollama_url=ollama_url)  # type: ignore[attr-defined]
            import logging
            logging.info("✅ Chat Agent system initialized successfully")
        except Exception as e:
            app.chat_agent = None  # type: ignore[attr-defined]
            import logging
            logging.warning(f"⚠️ Chat Agent system initialization failed: {e}")
    else:
        app.chat_agent = None  # type: ignore[attr-defined]

    # Agents
    if AgentsManager is not None:
        try:
            app.agents_manager = AgentsManager(data_service)  # type: ignore[attr-defined]
        except Exception:
            app.agents_manager = None  # type: ignore[attr-defined]
    else:
        app.agents_manager = None  # type: ignore[attr-defined]

    # Agents service (wrap manager)
    try:
        from .services.agents_service import AgentsService
        if app.agents_manager is not None:
            app.agents_service = AgentsService(app.agents_manager)  # type: ignore[attr-defined]
        else:
            app.agents_service = None  # type: ignore[attr-defined]
    except Exception:
        app.agents_service = None  # type: ignore[attr-defined]

    # Chat Agent Facade (new modular agent system)
    try:
        from services.agents import ChatAgentFacade
        app.chat_agent_facade = ChatAgentFacade()  # type: ignore[attr-defined]
    except Exception as e:
        import logging
        logging.warning(f"Chat Agent Facade not available: {e}")
        app.chat_agent_facade = None  # type: ignore[attr-defined]

    # Job scraper service (optional)
    if get_scraper_service is not None:
        try:
            app.job_scraper_service = get_scraper_service(data_service.db, data_service)  # type: ignore[attr-defined]
            # Auto-start scheduler with enabled configs for parity with monolith
            try:
                if app.jobs_service is not None:  # type: ignore[attr-defined]
                    configs = app.jobs_service.get_scraper_configs()  # type: ignore[attr-defined]
                    enabled = [c for c in configs if c.get("enabled", True)]
                    if enabled and hasattr(app.job_scraper_service, "start_scheduler"):
                        app.job_scraper_service.start_scheduler()  # type: ignore[attr-defined]
                        for cfg in enabled:
                            try:
                                app.job_scraper_service.schedule_config(cfg)  # type: ignore[attr-defined]
                            except Exception:
                                pass
            except Exception:
                pass
        except Exception:
            app.job_scraper_service = None  # type: ignore[attr-defined]
    else:
        app.job_scraper_service = None  # type: ignore[attr-defined]


def _register_blueprints(app: Flask) -> None:
    # Core pages
    from .routes.main import main_bp
    app.register_blueprint(main_bp)

    # Tasks API
    try:
        from .routes.tasks import tasks_bp
        app.register_blueprint(tasks_bp, url_prefix="/api")
    except Exception:
        # Allow app to run without tasks blueprint if dependencies missing
        pass

    # Notes API
    try:
        from .routes.notes import notes_bp
        app.register_blueprint(notes_bp, url_prefix="/api")
    except Exception:
        pass

    # Chat API
    try:
        from .routes.chat import chat_bp
        app.register_blueprint(chat_bp, url_prefix="/api")
    except Exception:
        pass

    # Tags API
    try:
        from .routes.tags import tags_bp
        app.register_blueprint(tags_bp, url_prefix="/api")
    except Exception:
        pass

    # Jobs API
    try:
        from .routes.jobs import jobs_bp
        app.register_blueprint(jobs_bp, url_prefix="/api")
    except Exception:
        pass

    # Calendar API
    try:
        from .routes.calendar import calendar_bp
        app.register_blueprint(calendar_bp, url_prefix="/api")
    except Exception:
        pass

    # Agents API
    try:
        from .routes.agents import agents_bp
        app.register_blueprint(agents_bp, url_prefix="/api")
    except Exception:
        pass

    # Time API removed

    # System API (health, export, config)
    try:
        from .routes.system import system_bp
        app.register_blueprint(system_bp, url_prefix="/api")
    except Exception:
        pass

    # RAG API (Chat Agent system)
    try:
        from .routes.rag import rag_bp
        app.register_blueprint(rag_bp)
        import logging
        logging.info("✅ RAG API routes registered")
    except Exception as e:
        import logging
        logging.error(f"❌ RAG routes not available: {e}")

    # Audio plugin
    try:
        from .plugins.audio import audio_bp
        app.register_blueprint(audio_bp, url_prefix="/api")
    except Exception:
        pass

    # Chat LLM API
    try:
        from .routes.chat_llm import chat_llm_bp
        app.register_blueprint(chat_llm_bp, url_prefix="/api")
    except Exception:
        pass

    # Shopping List API
    try:
        from .routes.shopping import shopping_bp
        app.register_blueprint(shopping_bp, url_prefix="/api")
    except Exception as e:
        # Log the error for debugging but continue
        import logging
        logging.error(f"Failed to register shopping blueprint: {e}")
        pass

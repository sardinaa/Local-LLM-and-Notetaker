import sqlite3
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import uuid
import logging
import re

def _normalize_name(s: str) -> str:
    if s is None:
        return ''
    # Normalize whitespace and case for uniqueness
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    return s

def _slugify(s: str) -> str:
    s = (s or '').strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    # Preserve forward slashes for hierarchical tags
    s = re.sub(r"[^a-z0-9\-/]", "", s)
    s = re.sub(r"-+", "-", s).strip('-')
    return s or 'tag'

class DatabaseManager:
    """
    Database infrastructure manager.
    
    Responsibilities:
    - Database initialization and schema creation
    - Connection management  
    - Cross-domain search operations
    - Legacy data migration
    
    For domain-specific operations, use repositories:
    - NotesRepository: Note/node/chat CRUD operations
    - TagsRepository: Tag management and relationships
    - JobsRepository: Job offers and scraper operations
    - TaskRepository: Task management
    - TimeTrackingRepository: Time tracking activities and entries
    - CalendarRepository: Calendar events
    - ShoppingRepository: Shopping list management
    """
    
    def __init__(self, db_path: str = "data/db/notetaker.db"):
        """Initialize the database manager with SQLite database."""
        self.db_path = db_path
        self.ensure_database_exists()
        self.init_database()
    
    def ensure_database_exists(self):
        """Ensure the database directory exists."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
    
    def get_connection(self) -> sqlite3.Connection:
        """Get a database connection with proper configuration."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # Enable dict-like access to rows
        conn.execute("PRAGMA foreign_keys = ON")  # Enable foreign key constraints
        return conn
    
    def init_database(self):
        """Initialize the database with required tables and indexes."""
        with self.get_connection() as conn:
            # ==========================================
            # NODES & CONTENT TABLES
            # ==========================================
            
            # Create nodes table for tree structure
            conn.execute('''
                CREATE TABLE IF NOT EXISTS nodes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('note', 'folder', 'chat')),
                    parent_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    collapsed BOOLEAN DEFAULT FALSE,
                    customization TEXT,
                    sort_order INTEGER,
                    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
                )
            ''')
            
            # Create notes table for note content
            conn.execute('''
                CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    version INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
                )
            ''')
            
            # Create chats table for chat conversations
            conn.execute('''
                CREATE TABLE IF NOT EXISTS chats (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    messages TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
                )
            ''')
            
            # Create indexes for better performance
            conn.execute('CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_notes_node_id ON notes(node_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_chats_node_id ON chats(node_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at)')
            
            # Create triggers for auto-updating timestamps
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_nodes_timestamp 
                AFTER UPDATE ON nodes
                BEGIN
                    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')
            
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_notes_timestamp 
                AFTER UPDATE ON notes
                BEGIN
                    UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')
            
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_chats_timestamp 
                AFTER UPDATE ON chats
                BEGIN
                    UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.node_id;
                END
            ''')
            
            # Also update node timestamp when chat is inserted
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_nodes_on_chat_insert
                AFTER INSERT ON chats
                BEGIN
                    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.node_id;
                END
            ''')

            # ==========================================
            # TAGS TABLES
            # ==========================================
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT UNIQUE,
                    color TEXT DEFAULT 'default',
                    icon TEXT,
                    sections TEXT,
                    description TEXT,
                    parent_id TEXT NULL,
                    aliases TEXT,
                    last_used_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE SET NULL
                )
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS note_tags (
                    note_id TEXT NOT NULL,
                    tag_id  TEXT NOT NULL,
                    PRIMARY KEY (note_id, tag_id),
                    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                )
            ''')

            # Indexes for tags
            conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_lower_name ON tags(lower(name))')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id)')

            # Triggers for timestamps on tags
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_tags_timestamp
                AFTER UPDATE ON tags
                BEGIN
                    UPDATE tags SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')

            # Tag relations (related and dependencies)
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tag_relations (
                    tag_id TEXT NOT NULL,
                    related_tag_id TEXT NOT NULL,
                    PRIMARY KEY (tag_id, related_tag_id),
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                    FOREIGN KEY (related_tag_id) REFERENCES tags(id) ON DELETE CASCADE
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tag_relations_related ON tag_relations(related_tag_id)')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS tag_dependencies (
                    tag_id TEXT NOT NULL,
                    depends_on_tag_id TEXT NOT NULL,
                    PRIMARY KEY (tag_id, depends_on_tag_id),
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                    FOREIGN KEY (depends_on_tag_id) REFERENCES tags(id) ON DELETE CASCADE
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tag_dependencies_depends ON tag_dependencies(depends_on_tag_id)')

            # ==========================================
            # JOB OFFERS TABLES
            # ==========================================
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS job_offers (
                    id TEXT PRIMARY KEY,
                    position TEXT,
                    company TEXT,
                    location TEXT,
                    salary_min REAL,
                    salary_max REAL,
                    salary_currency TEXT,
                    applied INTEGER DEFAULT 0,
                    responded INTEGER DEFAULT 0,
                    state TEXT CHECK (state IN ('draft','applied','interview','offer','rejected')) DEFAULT 'draft',
                    job_type TEXT,
                    date_posted TEXT,
                    contact_name TEXT,
                    contact_role TEXT,
                    contact_email TEXT,
                    contact_phone TEXT,
                    contact_method TEXT,
                    contact_handles TEXT,
                    source_url TEXT,
                    description TEXT,
                    next_follow_up TEXT,
                    benefits TEXT,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Ensure new columns exist for older databases before creating indexes
            try:
                cur = conn.execute("PRAGMA table_info('job_offers')")
                cols = [r['name'] for r in cur.fetchall()]
                if 'job_type' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN job_type TEXT")
                if 'date_posted' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN date_posted TEXT")
                if 'contact_role' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN contact_role TEXT")
                if 'contact_method' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN contact_method TEXT")
                if 'contact_handles' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN contact_handles TEXT")
                if 'next_follow_up' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN next_follow_up TEXT")
                if 'benefits' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN benefits TEXT")
                if 'notes' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN notes TEXT")
                if 'match_score' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN match_score REAL DEFAULT 0.0")
                if 'source' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN source TEXT")
                if 'is_remote' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN is_remote BOOLEAN DEFAULT FALSE")
                if 'seniority_level' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN seniority_level TEXT")
            except Exception as e:
                logging.warning(f"Could not ensure job_offers extra columns: {e}")
                
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_state ON job_offers(state)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_applied ON job_offers(applied)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_responded ON job_offers(responded)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_location ON job_offers(location)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_salary_min ON job_offers(salary_min)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_salary_max ON job_offers(salary_max)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_source_url ON job_offers(source_url)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON job_offers(job_type)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_date_posted ON job_offers(date_posted)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_next_follow_up ON job_offers(next_follow_up)')

            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_jobs_timestamp 
                AFTER UPDATE ON job_offers
                BEGIN
                    UPDATE job_offers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS job_tags (
                    job_id TEXT NOT NULL,
                    tag_id TEXT NOT NULL,
                    PRIMARY KEY (job_id, tag_id),
                    FOREIGN KEY (job_id) REFERENCES job_offers(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_job_tags_tag_id ON job_tags(tag_id)')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS motivation_letters (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    filename TEXT,
                    version INTEGER DEFAULT 1,
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (job_id) REFERENCES job_offers(id) ON DELETE CASCADE
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_letters_job_id ON motivation_letters(job_id)')

            # Timeline/events for jobs
            conn.execute('''
                CREATE TABLE IF NOT EXISTS job_events (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    type TEXT,
                    dt TEXT,
                    participants TEXT,
                    medium TEXT,
                    outcome TEXT,
                    notes TEXT,
                    attachments TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (job_id) REFERENCES job_offers(id) ON DELETE CASCADE
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_job_events_dt ON job_events(dt)')
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_job_events_timestamp 
                AFTER UPDATE ON job_events
                BEGIN
                    UPDATE job_events SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')

            # Job scraper configuration table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS job_scraper_configs (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    search_terms TEXT NOT NULL,
                    target_locations TEXT NOT NULL,
                    job_boards TEXT NOT NULL,
                    scrape_frequency_hours INTEGER DEFAULT 24,
                    lookback_hours INTEGER DEFAULT 24,
                    max_results_per_run INTEGER DEFAULT 100,
                    max_results_per_source INTEGER DEFAULT 50,
                    remote_only BOOLEAN DEFAULT FALSE,
                    hybrid_allowed BOOLEAN DEFAULT TRUE,
                    onsite_allowed BOOLEAN DEFAULT TRUE,
                    employment_types TEXT DEFAULT '["full-time"]',
                    min_salary REAL,
                    salary_currency TEXT DEFAULT 'USD',
                    seniority_levels TEXT DEFAULT '["Mid","Senior"]',
                    dedup_strategy TEXT DEFAULT 'smart_hash',
                    auto_tag_rules TEXT,
                    notifications TEXT DEFAULT 'in_app',
                    min_score_threshold REAL DEFAULT 0.6,
                    enabled BOOLEAN DEFAULT TRUE,
                    last_run_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # De-duplication tracking table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS seen_jobs (
                    id TEXT PRIMARY KEY,
                    canonical_url_hash TEXT NOT NULL,
                    smart_hash TEXT NOT NULL,
                    job_id TEXT,
                    title TEXT,
                    company TEXT,
                    location TEXT,
                    date_posted TEXT,
                    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'active',
                    FOREIGN KEY (job_id) REFERENCES job_offers(id) ON DELETE SET NULL
                )
            ''')

            # Job scraper run logs
            conn.execute('''
                CREATE TABLE IF NOT EXISTS job_scraper_runs (
                    id TEXT PRIMARY KEY,
                    config_id TEXT NOT NULL,
                    status TEXT CHECK (status IN ('running','completed','failed')) DEFAULT 'running',
                    jobs_fetched INTEGER DEFAULT 0,
                    jobs_inserted INTEGER DEFAULT 0,
                    jobs_deduped INTEGER DEFAULT 0,
                    jobs_failed INTEGER DEFAULT 0,
                    error_message TEXT,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    FOREIGN KEY (config_id) REFERENCES job_scraper_configs(id) ON DELETE CASCADE
                )
            ''')

            # Provenance metadata for job fields
            conn.execute('''
                CREATE TABLE IF NOT EXISTS job_provenance (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    field_name TEXT NOT NULL,
                    source TEXT NOT NULL,
                    confidence_score REAL DEFAULT 0.0,
                    extraction_method TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (job_id) REFERENCES job_offers(id) ON DELETE CASCADE
                )
            ''')

            # Indexes for job scraper tables
            conn.execute('CREATE INDEX IF NOT EXISTS idx_seen_jobs_url_hash ON seen_jobs(canonical_url_hash)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_seen_jobs_smart_hash ON seen_jobs(smart_hash)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_seen_jobs_status ON seen_jobs(status)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_scraper_runs_config ON job_scraper_runs(config_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_scraper_runs_status ON job_scraper_runs(status)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_job_provenance_job ON job_provenance(job_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_job_provenance_field ON job_provenance(field_name)')

            # Triggers for scraper config timestamps
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_scraper_configs_timestamp 
                AFTER UPDATE ON job_scraper_configs
                BEGIN
                    UPDATE job_scraper_configs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')

            # ==========================================
            # TIME TRACKING TABLES
            # ==========================================
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS time_activities (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT,
                    tag_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE SET NULL
                )
            ''')
            conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_time_activities_name ON time_activities(lower(name))')

            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_time_activities_timestamp 
                AFTER UPDATE ON time_activities
                BEGIN
                    UPDATE time_activities SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS time_entries (
                    id TEXT PRIMARY KEY,
                    activity_id TEXT NOT NULL,
                    start_time TIMESTAMP NOT NULL,
                    end_time TIMESTAMP DEFAULT NULL,
                    note_id TEXT,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (activity_id) REFERENCES time_activities(id) ON DELETE CASCADE,
                    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_time_entries_activity ON time_entries(activity_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_time_entries_end ON time_entries(end_time)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_time_entries_note ON time_entries(note_id)')

            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_time_entries_timestamp 
                AFTER UPDATE ON time_entries
                BEGIN
                    UPDATE time_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')

            # ==========================================
            # TASKS TABLES
            # ==========================================
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    due_date TEXT,
                    due_time TEXT,
                    priority TEXT CHECK (priority IN ('baja', 'media', 'alta', 'urgente')) DEFAULT NULL,
                    status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
                    section_id TEXT,
                    repeat_pattern TEXT,
                    repeat_config TEXT,
                    parent_task_id TEXT,
                    original_input TEXT,
                    parsing_confidence REAL DEFAULT 0.0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP NULL,
                    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
                )
            ''')

            # Ensure new columns exist for older databases (migrations)
            try:
                cur = conn.execute("PRAGMA table_info('tags')")
                tag_cols = [r['name'] for r in cur.fetchall()]
                if 'sections' not in tag_cols:
                    conn.execute("ALTER TABLE tags ADD COLUMN sections TEXT")
            except Exception as e:
                logging.warning(f"Could not ensure tags.sections column: {e}")

            try:
                cur = conn.execute("PRAGMA table_info('tasks')")
                task_cols = [r['name'] for r in cur.fetchall()]
                if 'section_id' not in task_cols:
                    conn.execute("ALTER TABLE tasks ADD COLUMN section_id TEXT")
            except Exception as e:
                logging.warning(f"Could not ensure tasks.section_id column: {e}")

            # Create task tags junction table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS task_tags (
                    task_id TEXT NOT NULL,
                    tag_id TEXT NOT NULL,
                    PRIMARY KEY (task_id, tag_id),
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                )
            ''')

            # Create task reminders table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS task_reminders (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    reminder_time TEXT NOT NULL,
                    message TEXT,
                    sent BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
                )
            ''')

            # Create task files table for file attachments
            conn.execute('''
                CREATE TABLE IF NOT EXISTS task_files (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER,
                    mime_type TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
                )
            ''')

            # Create task notes table for note references
            conn.execute('''
                CREATE TABLE IF NOT EXISTS task_notes (
                    task_id TEXT NOT NULL,
                    note_id TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (task_id, note_id),
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    FOREIGN KEY (note_id) REFERENCES nodes(id) ON DELETE CASCADE
                )
            ''')

            # Create indexes for tasks
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_task_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags(task_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files(task_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_task_notes_note_id ON task_notes(note_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_task_reminders_task_id ON task_reminders(task_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_task_reminders_time ON task_reminders(reminder_time)')

            # Create triggers for task timestamps
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_tasks_timestamp 
                AFTER UPDATE ON tasks
                BEGIN
                    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')

            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_tasks_completed_timestamp 
                AFTER UPDATE OF status ON tasks
                WHEN NEW.status = 'completed' AND OLD.status != 'completed'
                BEGIN
                    UPDATE tasks SET completed_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')
            
            # ==========================================
            # CALENDAR TABLES
            # ==========================================
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS calendar_events (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    start_ts TEXT NOT NULL,
                    end_ts TEXT NOT NULL,
                    all_day INTEGER DEFAULT 0,
                    category TEXT,
                    color TEXT,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            conn.execute('CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_ts)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_calendar_events_end ON calendar_events(end_ts)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_calendar_events_all_day ON calendar_events(all_day)')

            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_calendar_events_timestamp 
                AFTER UPDATE ON calendar_events
                BEGIN
                    UPDATE calendar_events SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')

            # ==========================================
            # SHOPPING LIST TABLES
            # ==========================================
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS shopping_ingredients (
                    id TEXT PRIMARY KEY,
                    ingredient_name TEXT NOT NULL,
                    recipe_name TEXT,
                    quantity TEXT,
                    unit TEXT,
                    checked INTEGER DEFAULT 0,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            conn.execute('CREATE INDEX IF NOT EXISTS idx_shopping_ingredients_checked ON shopping_ingredients(checked)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_shopping_ingredients_added_at ON shopping_ingredients(added_at)')

            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS update_shopping_ingredients_timestamp 
                AFTER UPDATE ON shopping_ingredients
                BEGIN
                    UPDATE shopping_ingredients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            ''')

            conn.commit()
    
    # ==========================================
    # CROSS-DOMAIN OPERATIONS
    # ==========================================
    
    def search_content(self, query: str, content_type: str = 'all') -> List[Dict]:
        """
        Search for content across notes and chats.
        
        This is a cross-domain operation that searches across multiple content types.
        For domain-specific searches, use the appropriate repository.
        """
        try:
            with self.get_connection() as conn:
                results = []
                
                if content_type in ['all', 'notes']:
                    # Search in notes
                    cursor = conn.execute('''
                        SELECT n.id, n.name, n.type, notes.content, notes.updated_at
                        FROM nodes n
                        JOIN notes ON n.id = notes.node_id
                        WHERE notes.content LIKE ? OR n.name LIKE ?
                    ''', (f'%{query}%', f'%{query}%'))
                    
                    for row in cursor.fetchall():
                        results.append({
                            'id': row['id'],
                            'name': row['name'],
                            'type': row['type'],
                            'content': json.loads(row['content']),
                            'updated_at': row['updated_at']
                        })
                
                if content_type in ['all', 'chats']:
                    # Search in chats
                    cursor = conn.execute('''
                        SELECT n.id, n.name, n.type, chats.messages, chats.updated_at
                        FROM nodes n
                        JOIN chats ON n.id = chats.node_id
                        WHERE chats.messages LIKE ? OR n.name LIKE ?
                    ''', (f'%{query}%', f'%{query}%'))
                    
                    for row in cursor.fetchall():
                        results.append({
                            'id': row['id'],
                            'name': row['name'],
                            'type': row['type'],
                            'messages': json.loads(row['messages']),
                            'updated_at': row['updated_at']
                        })
                
                return results
        except sqlite3.Error as e:
            logging.error(f"Error searching content: {e}")
            return []
    
    def get_recent_items(self, limit: int = 10) -> List[Dict]:
        """
        Get recently updated items across all node types.
        
        This is a cross-domain operation. For domain-specific recent items,
        use the appropriate repository.
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT id, name, type, updated_at
                    FROM nodes
                    ORDER BY updated_at DESC
                    LIMIT ?
                ''', (limit,))
                
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting recent items: {e}")
            return []
    
    # ==========================================
    # LEGACY MIGRATION
    # ==========================================
    
    def migrate_from_json(self, tree_file: str, chats_file: str) -> bool:
        """
        Migrate existing JSON data to the new database structure.
        
        This is a legacy migration utility for backwards compatibility.
        """
        from app.repositories.notes import NotesRepository
        from app.repositories.chat import ChatRepository
        
        try:
            # Initialize repositories for migration
            notes_repo = NotesRepository(self.db_path)
            chat_repo = ChatRepository(self.db_path)
            
            # Load existing data
            tree_data = []
            if os.path.exists(tree_file):
                with open(tree_file, 'r') as f:
                    tree_data = json.load(f)
            
            chats_data = []
            if os.path.exists(chats_file):
                with open(chats_file, 'r') as f:
                    chats_data = json.load(f)
            
            # First pass: Create all nodes without content
            def create_nodes_only(node, parent_id=None):
                # Create node
                notes_repo.create_node(
                    node['id'],
                    node['name'],
                    node['type'],
                    parent_id,
                    node.get('customization')
                )
                
                # Recursively create children nodes
                for child in node.get('children', []):
                    create_nodes_only(child, node['id'])
            
            # Create tree structure first
            for root_node in tree_data:
                create_nodes_only(root_node)
            
            # Create chat nodes from chats data
            for chat in chats_data:
                if chat['type'] == 'chat':
                    notes_repo.create_node(
                        chat['id'],
                        chat['name'],
                        chat['type'],
                        chat.get('parentId'),
                        chat.get('customization')
                    )
            
            # Second pass: Save content for existing nodes
            def save_content(node):
                # Save content based on type
                if node['type'] == 'note' and 'content' in node and node['content']:
                    notes_repo.save_note_content(node['id'], node['content'])
                
                # Recursively save content for children
                for child in node.get('children', []):
                    save_content(child)
            
            # Save content for tree nodes
            for root_node in tree_data:
                save_content(root_node)
            
            # Save chat messages
            for chat in chats_data:
                if 'content' in chat and 'messages' in chat['content']:
                    chat_repo.save_chat_messages(chat['id'], chat['content']['messages'])
            
            return True
            
        except Exception as e:
            logging.error(f"Error migrating data: {e}")
            return False

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
    def __init__(self, db_path: str = "instance/notetaker.db"):
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
        """Initialize the database with required tables."""
        with self.get_connection() as conn:
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

            # Tags: global registry and junctions
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT UNIQUE,
                    color TEXT DEFAULT 'default',
                    icon TEXT,
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

            # Job offers and attachments
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
                # Remove deadline column if it exists and migrate to date_posted if needed
                if 'deadline' in cols:
                    # If date_posted doesn't exist yet, create it first
                    if 'date_posted' not in cols:
                        conn.execute("ALTER TABLE job_offers ADD COLUMN date_posted TEXT")
                    # For migration purposes, we'll drop the deadline column later
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
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON job_offers(job_type)')

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

            # Time tracking tables
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

            # Add match_score column to job_offers if it doesn't exist
            try:
                cur = conn.execute("PRAGMA table_info('job_offers')")
                cols = [r['name'] for r in cur.fetchall()]
                if 'match_score' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN match_score REAL DEFAULT 0.0")
                if 'source' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN source TEXT")
                if 'is_remote' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN is_remote BOOLEAN DEFAULT FALSE")
                if 'seniority_level' not in cols:
                    conn.execute("ALTER TABLE job_offers ADD COLUMN seniority_level TEXT")
            except Exception as e:
                logging.warning(f"Could not ensure job_offers scraper columns: {e}")

            # Create tasks table for task management
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    due_date TEXT,
                    due_time TEXT,
                    priority TEXT CHECK (priority IN ('baja', 'media', 'alta', 'urgente')) DEFAULT NULL,
                    status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
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
            
            conn.commit()
    
    def create_node(self, node_id: str, name: str, node_type: str, parent_id: Optional[str] = None, 
                   customization: Optional[Dict] = None) -> bool:
        """Create a new node in the tree structure."""
        try:
            with self.get_connection() as conn:
                # Get the next sort order for this parent
                cursor = conn.execute('''
                    SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order
                    FROM nodes WHERE parent_id = ? OR (parent_id IS NULL AND ? IS NULL)
                ''', (parent_id, parent_id))
                next_order = cursor.fetchone()['next_order']
                
                customization_json = json.dumps(customization) if customization else None
                conn.execute('''
                    INSERT INTO nodes (id, name, type, parent_id, customization, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (node_id, name, node_type, parent_id, customization_json, next_order))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error creating node: {e}")
            return False
    
    def get_node(self, node_id: str) -> Optional[Dict]:
        """Get a single node by ID."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT id, name, type, parent_id, created_at, updated_at, collapsed, customization
                    FROM nodes WHERE id = ?
                ''', (node_id,))
                row = cursor.fetchone()
                if row:
                    node = dict(row)
                    if node['customization']:
                        node['customization'] = json.loads(node['customization'])
                    return node
                return None
        except sqlite3.Error as e:
            logging.error(f"Error getting node: {e}")
            return None
    
    def get_tree(self) -> List[Dict]:
        """Get the complete tree structure."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT id, name, type, parent_id, sort_order, created_at, updated_at, collapsed, customization
                    FROM nodes 
                    ORDER BY 
                        parent_id NULLS FIRST,
                        CASE WHEN type = 'folder' THEN 0 ELSE 1 END,
                        sort_order,
                        name
                ''')
                nodes = []
                for row in cursor.fetchall():
                    node = dict(row)
                    if node['customization']:
                        node['customization'] = json.loads(node['customization'])
                    nodes.append(node)
                
                # Build tree structure
                return self._build_tree_structure(nodes)
        except sqlite3.Error as e:
            logging.error(f"Error getting tree: {e}")
            return []
    
    def _build_tree_structure(self, nodes: List[Dict]) -> List[Dict]:
        """Build hierarchical tree structure from flat node list.

        Initializes a children list for every node before linking, so ordering
        of rows from the database cannot cause KeyError when attaching children.
        Orphaned nodes (missing parent) are placed at root to avoid breakage.
        """
        node_map = {node['id']: node for node in nodes}
        # Initialize children for all nodes first to avoid KeyError regardless of order
        for node in nodes:
            node['children'] = []

        root_nodes: List[Dict] = []
        for node in nodes:
            parent_id = node.get('parent_id')
            if parent_id is None:
                root_nodes.append(node)
            else:
                parent = node_map.get(parent_id)
                if parent is not None:
                    parent.setdefault('children', []).append(node)
                else:
                    # If parent not found, treat as root to keep tree stable
                    root_nodes.append(node)
        
        # Sort children within each parent
        def sort_children(node):
            if node['children']:
                # Custom sorting: folders first, then chats by most recent modification, then others
                def sort_key(x):
                    if x['type'] == 'folder':
                        return (0, x.get('sort_order') or 0, x.get('name', ''))
                    elif x['type'] == 'chat':
                        # For chats, sort by updated_at descending (most recent first)
                        # Convert datetime string to negative timestamp for reverse sorting
                        updated_at = x.get('updated_at', '1970-01-01 00:00:00')
                        try:
                            from datetime import datetime
                            # Handle SQLite datetime format (YYYY-MM-DD HH:MM:SS)
                            if updated_at and updated_at != '1970-01-01 00:00:00':
                                # Remove any timezone info and parse as local time
                                dt_str = updated_at.replace('Z', '').replace('+00:00', '')
                                dt = datetime.fromisoformat(dt_str)
                                return (1, -dt.timestamp(), x.get('name', ''))
                            else:
                                return (1, 0, x.get('name', ''))
                        except Exception as e:
                            print(f"Error parsing datetime '{updated_at}': {e}")
                            return (1, 0, x.get('name', ''))
                    else:
                        # Other types (notes, etc.) sorted by sort_order then name
                        return (2, x.get('sort_order') or 0, x.get('name', ''))
                
                node['children'].sort(key=sort_key)
                for child in node['children']:
                    sort_children(child)
        
        for root in root_nodes:
            sort_children(root)
        
        # Sort root nodes with same logic
        def root_sort_key(x):
            if x['type'] == 'folder':
                return (0, x.get('sort_order') or 0, x.get('name', ''))
            elif x['type'] == 'chat':
                # For chats, sort by updated_at descending (most recent first)
                updated_at = x.get('updated_at', '1970-01-01 00:00:00')
                try:
                    from datetime import datetime
                    # Handle SQLite datetime format (YYYY-MM-DD HH:MM:SS)
                    if updated_at and updated_at != '1970-01-01 00:00:00':
                        # Remove any timezone info and parse as local time
                        dt_str = updated_at.replace('Z', '').replace('+00:00', '')
                        dt = datetime.fromisoformat(dt_str)
                        return (1, -dt.timestamp(), x.get('name', ''))
                    else:
                        return (1, 0, x.get('name', ''))
                except Exception as e:
                    print(f"Error parsing datetime '{updated_at}': {e}")
                    return (1, 0, x.get('name', ''))
            else:
                return (2, x.get('sort_order') or 0, x.get('name', ''))
        
        root_nodes.sort(key=root_sort_key)
        
        return root_nodes
    
    def update_node(self, node_id: str, **kwargs) -> bool:
        """Update a node's properties."""
        try:
            with self.get_connection() as conn:
                # Define allowed fields for nodes table
                allowed_fields = {
                    'name', 'type', 'parent_id', 'collapsed', 'customization', 'sort_order'
                }
                
                # Build dynamic update query
                update_fields = []
                values = []
                
                logging.info(f"Updating node {node_id} with kwargs: {kwargs}")
                
                for field, value in kwargs.items():
                    if field not in allowed_fields:
                        logging.warning(f"Ignoring invalid field: {field}")
                        continue
                        
                    if field == 'customization' and value is not None:
                        value = json.dumps(value)
                    elif field == 'collapsed' and value is not None:
                        value = 1 if value else 0  # Convert boolean to integer for SQLite
                    
                    update_fields.append(f"{field} = ?")
                    values.append(value)
                
                if not update_fields:
                    logging.info("No valid fields to update, returning True")
                    return True
                
                values.append(node_id)
                query = f"UPDATE nodes SET {', '.join(update_fields)} WHERE id = ?"
                
                logging.info(f"Executing query: {query} with values: {values}")
                
                cursor = conn.execute(query, values)
                rows_affected = cursor.rowcount
                conn.commit()
                
                logging.info(f"Update completed, rows affected: {rows_affected}")
                return rows_affected > 0
        except sqlite3.Error as e:
            logging.error(f"Error updating node: {e}")
            return False
    
    def delete_node(self, node_id: str) -> bool:
        """Delete a node and all its children."""
        try:
            with self.get_connection() as conn:
                # SQLite will handle cascading deletes
                conn.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error deleting node: {e}")
            return False
    
    def save_note_content(self, node_id: str, content: Dict) -> bool:
        """Save or update note content."""
        try:
            with self.get_connection() as conn:
                content_json = json.dumps(content)
                
                # Check if note already exists
                cursor = conn.execute("SELECT id FROM notes WHERE node_id = ?", (node_id,))
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing note
                    conn.execute('''
                        UPDATE notes SET content = ?, version = version + 1 
                        WHERE node_id = ?
                    ''', (content_json, node_id))
                else:
                    # Create new note
                    conn.execute('''
                        INSERT INTO notes (id, node_id, content)
                        VALUES (?, ?, ?)
                    ''', (node_id, node_id, content_json))
                
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error saving note content: {e}")
            return False
    
    def get_note_content(self, node_id: str) -> Optional[Dict]:
        """Get note content by node ID."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT content, version, created_at, updated_at
                    FROM notes WHERE node_id = ?
                ''', (node_id,))
                row = cursor.fetchone()
                if row:
                    return {
                        'content': json.loads(row['content']),
                        'version': row['version'],
                        'created_at': row['created_at'],
                        'updated_at': row['updated_at']
                    }
                return None
        except sqlite3.Error as e:
            logging.error(f"Error getting note content: {e}")
            return None
    
    def save_chat_messages(self, node_id: str, messages: List[Dict]) -> bool:
        """Save or update chat messages."""
        try:
            with self.get_connection() as conn:
                messages_json = json.dumps(messages)
                
                # Check if chat already exists
                cursor = conn.execute("SELECT id FROM chats WHERE node_id = ?", (node_id,))
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing chat
                    conn.execute('''
                        UPDATE chats SET messages = ? WHERE node_id = ?
                    ''', (messages_json, node_id))
                else:
                    # Create new chat
                    conn.execute('''
                        INSERT INTO chats (id, node_id, messages)
                        VALUES (?, ?, ?)
                    ''', (node_id, node_id, messages_json))
                
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error saving chat messages: {e}")
            return False
    
    def get_chat_messages(self, node_id: str) -> List[Dict]:
        """Get chat messages by node ID."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT messages FROM chats WHERE node_id = ?
                ''', (node_id,))
                row = cursor.fetchone()
                if row:
                    return json.loads(row['messages'])
                return []
        except sqlite3.Error as e:
            logging.error(f"Error getting chat messages: {e}")
            return []

    def touch_chat(self, node_id: str) -> bool:
        """Mark a chat as recently used by updating its timestamps.

        This updates the chats.updated_at (if chat row exists) which, via trigger,
        also updates nodes.updated_at. If the chat row does not exist yet, we fall
        back to directly updating nodes.updated_at to move the chat up in listings.
        """
        try:
            with self.get_connection() as conn:
                # Try to bump chats.updated_at via a no-op messages update
                cursor = conn.execute('SELECT id FROM chats WHERE node_id = ?', (node_id,))
                chat_exists = cursor.fetchone() is not None

                if chat_exists:
                    # Perform an update to trigger the timestamp trigger
                    conn.execute('''
                        UPDATE chats SET messages = messages WHERE node_id = ?
                    ''', (node_id,))
                else:
                    # No chat row yet; directly bump the node timestamp
                    conn.execute('''
                        UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = 'chat'
                    ''', (node_id,))

                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error touching chat '{node_id}': {e}")
            return False
    
    def search_content(self, query: str, content_type: str = 'all') -> List[Dict]:
        """Search for content across notes and chats."""
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
        """Get recently updated items."""
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

    # =========================
    # Tag System - Data Layer
    # =========================
    def _get_tag_by_name_or_alias(self, conn: sqlite3.Connection, name: str) -> Optional[Dict]:
        norm = _normalize_name(name)
        if not norm:
            return None
        cur = conn.execute('SELECT * FROM tags WHERE lower(name) = lower(?)', (norm,))
        row = cur.fetchone()
        if row:
            return dict(row)
        # Search in aliases JSON (stored as simple JSON array of strings)
        # SQLite json_each exists if JSON1 is enabled; fallback to LIKE search then verify in Python
        try:
            cur = conn.execute('''
                SELECT t.* FROM tags t, json_each(t.aliases)
                WHERE lower(json_each.value) = lower(?)
            ''', (norm,))
            row = cur.fetchone()
            return dict(row) if row else None
        except sqlite3.Error:
            # Fallback: scan
            cur = conn.execute('SELECT * FROM tags WHERE aliases IS NOT NULL')
            for r in cur.fetchall():
                try:
                    aliases = json.loads(r['aliases']) if r['aliases'] else []
                except Exception:
                    aliases = []
                if any(a.lower() == norm.lower() for a in aliases):
                    return dict(r)
            return None

    def _ensure_unique_slug(self, conn: sqlite3.Connection, base: str, current_id: Optional[str] = None) -> str:
        slug = _slugify(base)
        candidate = slug or 'tag'
        i = 1
        while True:
            if current_id:
                cur = conn.execute('SELECT id FROM tags WHERE slug = ? AND id != ?', (candidate, current_id))
            else:
                cur = conn.execute('SELECT id FROM tags WHERE slug = ?', (candidate,))
            if cur.fetchone() is None:
                return candidate
            i += 1
            candidate = f"{slug}-{i}"

    def list_tags(self, q: Optional[str] = None, limit: int = 50, include_usage: bool = False, parent_id: Optional[str] = None) -> List[Dict]:
        try:
            with self.get_connection() as conn:
                params: List[Any] = []
                where: List[str] = []
                if q:
                    params.extend([f"%{q}%", f"%{q}%"])
                    where.append('(lower(name) LIKE lower(?) OR lower(COALESCE(aliases, "")) LIKE lower(?))')
                if parent_id is None:
                    pass
                elif parent_id == 'root':
                    where.append('parent_id IS NULL')
                else:
                    where.append('parent_id = ?')
                    params.append(parent_id)
                sql = 'SELECT * FROM tags'
                if where:
                    sql += ' WHERE ' + ' AND '.join(where)
                sql += ' ORDER BY name COLLATE NOCASE LIMIT ?'
                params.append(limit)
                cur = conn.execute(sql, params)
                tags = [dict(row) for row in cur.fetchall()]
                for t in tags:
                    if t.get('aliases'):
                        try:
                            t['aliases'] = json.loads(t['aliases'])
                        except Exception:
                            t['aliases'] = []
                if include_usage and tags:
                    ids = [t['id'] for t in tags]
                    qmarks = ','.join('?' for _ in ids)
                    cur = conn.execute(f'SELECT tag_id, COUNT(*) as cnt FROM note_tags WHERE tag_id IN ({qmarks}) GROUP BY tag_id', ids)
                    usage = {row['tag_id']: row['cnt'] for row in cur.fetchall()}
                    for t in tags:
                        t['usage'] = usage.get(t['id'], 0)
                return tags
        except sqlite3.Error as e:
            logging.error(f"Error listing tags: {e}")
            return []

    def create_tag(self, tag: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                name = _normalize_name(tag.get('name', ''))
                if not name:
                    return None
                existing = self._get_tag_by_name_or_alias(conn, name)
                if existing:
                    return existing
                aliases = tag.get('aliases') or []
                if isinstance(aliases, str):
                    aliases = [aliases]
                # Normalize aliases
                aliases = [_normalize_name(a) for a in aliases if _normalize_name(a)]
                # Ensure aliases don't conflict with existing names
                for a in aliases:
                    if self._get_tag_by_name_or_alias(conn, a):
                        # Skip conflicting alias
                        aliases = [x for x in aliases if x != a]
                
                tag_id = tag.get('id') or name  # default stable id if provided else name; caller may pass ULID
                
                # Handle parent path and construct full slug
                parent_path = tag.get('parentPath', '').strip()
                parent_id = tag.get('parentId') or tag.get('parent_id')
                
                if parent_path and not parent_id:
                    # Find parent tag by slug or name
                    cur = conn.execute('SELECT id FROM tags WHERE slug = ? OR name = ?', (parent_path, parent_path))
                    parent_row = cur.fetchone()
                    if parent_row:
                        parent_id = parent_row['id']
                    else:
                        # If parent doesn't exist, create it as a root tag
                        parent_tag_id = _slugify(parent_path)
                        parent_slug = self._ensure_unique_slug(conn, parent_path)
                        conn.execute('''
                            INSERT INTO tags (id, name, slug, color)
                            VALUES (?, ?, ?, ?)
                        ''', (parent_tag_id, parent_path, parent_slug, 'default'))
                        parent_id = parent_tag_id
                
                if parent_path:
                    # Construct full slug: parentPath/tagName
                    full_slug = f"{parent_path.rstrip('/')}/{name}"
                else:
                    # Root level tag, just use the name
                    full_slug = name
                
                # Use provided slug or the constructed full slug
                slug = tag.get('slug') or full_slug
                slug = self._ensure_unique_slug(conn, slug)
                
                color = tag.get('color') or 'default'
                icon = tag.get('icon')
                description = tag.get('description')
                
                conn.execute('''
                    INSERT INTO tags (id, name, slug, color, icon, description, parent_id, aliases)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (tag_id, name, slug, color, icon, description, parent_id, json.dumps(aliases) if aliases else None))
                conn.commit()
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        except sqlite3.Error as e:
            logging.error(f"Error creating tag: {e}")
            return None

    def update_tag(self, tag_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                orig = cur.fetchone()
                if not orig:
                    return None
                updates: List[str] = []
                values: List[Any] = []
                if 'name' in patch and patch['name']:
                    name = _normalize_name(patch['name'])
                    # Check conflicts
                    cur = conn.execute('SELECT id FROM tags WHERE lower(name)=lower(?) AND id != ?', (name, tag_id))
                    if cur.fetchone():
                        # If conflict, ignore name change
                        pass
                    else:
                        updates.append('name = ?')
                        values.append(name)
                        # also refresh slug if not provided and we have a parent path
                        if 'slug' not in patch:
                            parent_path = patch.get('parentPath', '').strip()
                            if parent_path:
                                new_slug = f"{parent_path.rstrip('/')}/{name}"
                            else:
                                new_slug = name
                            new_slug = self._ensure_unique_slug(conn, new_slug, current_id=tag_id)
                            updates.append('slug = ?')
                            values.append(new_slug)
                
                # Handle parentPath separately from slug
                if 'parentPath' in patch:
                    parent_path = patch.get('parentPath', '').strip()
                    current_name = patch.get('name', orig['name'])
                    
                    # Find or create parent tag
                    parent_id = None
                    if parent_path:
                        cur = conn.execute('SELECT id FROM tags WHERE slug = ? OR name = ?', (parent_path, parent_path))
                        parent_row = cur.fetchone()
                        if parent_row:
                            parent_id = parent_row['id']
                        else:
                            # If parent doesn't exist, create it as a root tag
                            parent_tag_id = _slugify(parent_path)
                            parent_slug = self._ensure_unique_slug(conn, parent_path)
                            conn.execute('''
                                INSERT INTO tags (id, name, slug, color)
                                VALUES (?, ?, ?, ?)
                            ''', (parent_tag_id, parent_path, parent_slug, 'default'))
                            parent_id = parent_tag_id
                    
                    # Update parent_id
                    updates.append('parent_id = ?')
                    values.append(parent_id)
                    
                    # Update slug based on parent path
                    if parent_path:
                        new_slug = f"{parent_path.rstrip('/')}/{current_name}"
                    else:
                        new_slug = current_name
                    new_slug = self._ensure_unique_slug(conn, new_slug, current_id=tag_id)
                    updates.append('slug = ?')
                    values.append(new_slug)
                elif 'slug' in patch and patch['slug']:
                    updates.append('slug = ?')
                    values.append(self._ensure_unique_slug(conn, patch['slug'], current_id=tag_id))
                for key in ('color', 'icon', 'description'):
                    if key in patch:
                        updates.append(f'{key} = ?')
                        values.append(patch[key])
                if 'parentId' in patch or 'parent_id' in patch:
                    parent_id = patch.get('parentId', patch.get('parent_id'))
                    updates.append('parent_id = ?')
                    values.append(parent_id)
                if 'aliases' in patch:
                    aliases = patch.get('aliases') or []
                    if isinstance(aliases, str):
                        aliases = [aliases]
                    aliases = [_normalize_name(a) for a in aliases if _normalize_name(a)]
                    updates.append('aliases = ?')
                    values.append(json.dumps(aliases) if aliases else None)
                if not updates:
                    return dict(orig)
                values.append(tag_id)
                conn.execute(f'UPDATE tags SET {", ".join(updates)} WHERE id = ?', values)
                conn.commit()
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                return dict(cur.fetchone())
        except sqlite3.Error as e:
            logging.error(f"Error updating tag: {e}")
            return None

    def delete_tag(self, tag_id: str, cascade: bool = False, force: bool = False) -> Dict[str, Any]:
        try:
            with self.get_connection() as conn:
                # Children check
                cur = conn.execute('SELECT COUNT(*) as c FROM tags WHERE parent_id = ?', (tag_id,))
                has_children = (cur.fetchone()['c'] or 0) > 0
                # Usage check
                cur = conn.execute('SELECT COUNT(*) as c FROM note_tags WHERE tag_id = ?', (tag_id,))
                in_use = (cur.fetchone()['c'] or 0) > 0
                if (has_children and not cascade) or (in_use and not force):
                    return { 'deleted': False, 'has_children': has_children, 'in_use': in_use }
                if cascade:
                    conn.execute('UPDATE tags SET parent_id = NULL WHERE parent_id = ?', (tag_id,))
                if force:
                    conn.execute('DELETE FROM note_tags WHERE tag_id = ?', (tag_id,))
                conn.execute('DELETE FROM tags WHERE id = ?', (tag_id,))
                conn.commit()
                return { 'deleted': True }
        except sqlite3.Error as e:
            logging.error(f"Error deleting tag: {e}")
            return { 'deleted': False, 'error': str(e) }

    def merge_tags(self, source_ids: List[str], target_id: str) -> Dict[str, Any]:
        try:
            with self.get_connection() as conn:
                # Ensure target exists
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (target_id,))
                target = cur.fetchone()
                if not target:
                    return { 'merged': False, 'error': 'target_not_found' }
                # Re-point note_tags
                qmarks = ','.join('?' for _ in source_ids)
                if source_ids:
                    conn.execute(f'UPDATE OR IGNORE note_tags SET tag_id = ? WHERE tag_id IN ({qmarks})', [target_id, *source_ids])
                    # Delete potential duplicates after OR IGNORE
                    conn.execute(f'DELETE FROM note_tags WHERE tag_id IN ({qmarks}) AND note_id IN (SELECT note_id FROM note_tags WHERE tag_id = ?)', [*source_ids, target_id])
                # Merge aliases: add source names and aliases
                names = []
                aliases: List[str] = []
                for sid in source_ids:
                    cur = conn.execute('SELECT name, aliases FROM tags WHERE id = ?', (sid,))
                    r = cur.fetchone()
                    if r:
                        names.append(r['name'])
                        try:
                            al = json.loads(r['aliases']) if r['aliases'] else []
                        except Exception:
                            al = []
                        aliases.extend(al)
                try:
                    t_aliases = json.loads(target['aliases']) if target['aliases'] else []
                except Exception:
                    t_aliases = []
                merged_aliases = list({ _normalize_name(a) for a in (t_aliases + aliases + names) if _normalize_name(a) and _normalize_name(a).lower() != target['name'].lower() })
                conn.execute('UPDATE tags SET aliases = ? WHERE id = ?', (json.dumps(merged_aliases) if merged_aliases else None, target_id))
                # Delete sources
                if source_ids:
                    conn.execute(f'DELETE FROM tags WHERE id IN ({qmarks})', source_ids)
                conn.commit()
                return { 'merged': True, 'target_id': target_id, 'sources_deleted': source_ids }
        except sqlite3.Error as e:
            logging.error(f"Error merging tags: {e}")
            return { 'merged': False, 'error': str(e) }

    def assign_tags_to_note(self, note_id: str, tag_ids: List[str]) -> bool:
        try:
            with self.get_connection() as conn:
                # Expand with parent tags automatically
                expanded: List[str] = self._expand_with_parent_tags(conn, tag_ids)
                for tid in expanded:
                    conn.execute('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', (note_id, tid))
                    conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tid,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error assigning tags to note: {e}")
            return False

    def replace_note_tags(self, note_id: str, tag_ids: List[str]) -> bool:
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM note_tags WHERE note_id = ?', (note_id,))
                expanded: List[str] = self._expand_with_parent_tags(conn, tag_ids)
                for tid in expanded:
                    conn.execute('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', (note_id, tid))
                    conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tid,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error replacing note tags: {e}")
            return False

    # Helper: expand a list of tag IDs to include all parents
    def _expand_with_parent_tags(self, conn: sqlite3.Connection, tag_ids: List[str]) -> List[str]:
        seen = set(tag_ids)
        to_process = list(tag_ids)
        while to_process:
            tid = to_process.pop()
            cur = conn.execute('SELECT parent_id FROM tags WHERE id = ?', (tid,))
            row = cur.fetchone()
            if row and row['parent_id'] and row['parent_id'] not in seen:
                seen.add(row['parent_id'])
                to_process.append(row['parent_id'])
        return list(seen)

    # =========================
    # Tag Relations/Dependencies
    # =========================
    def get_tag_relations(self, tag_id: str) -> List[str]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT related_tag_id FROM tag_relations WHERE tag_id = ?', (tag_id,))
                return [r['related_tag_id'] for r in cur.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting tag relations: {e}")
            return []

    def set_tag_relations(self, tag_id: str, related_ids: List[str]) -> bool:
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM tag_relations WHERE tag_id = ?', (tag_id,))
                for rid in related_ids:
                    if rid == tag_id:
                        continue
                    conn.execute('INSERT OR IGNORE INTO tag_relations (tag_id, related_tag_id) VALUES (?,?)', (tag_id, rid))
                    # Ensure symmetric relation for convenience
                    conn.execute('INSERT OR IGNORE INTO tag_relations (tag_id, related_tag_id) VALUES (?,?)', (rid, tag_id))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error setting tag relations: {e}")
            return False

    def get_tag_dependencies(self, tag_id: str) -> List[str]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT depends_on_tag_id FROM tag_dependencies WHERE tag_id = ?', (tag_id,))
                return [r['depends_on_tag_id'] for r in cur.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting tag dependencies: {e}")
            return []

    def set_tag_dependencies(self, tag_id: str, depends_ids: List[str]) -> bool:
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM tag_dependencies WHERE tag_id = ?', (tag_id,))
                for did in depends_ids:
                    if did == tag_id:
                        continue
                    conn.execute('INSERT OR IGNORE INTO tag_dependencies (tag_id, depends_on_tag_id) VALUES (?,?)', (tag_id, did))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error setting tag dependencies: {e}")
            return False

    # =========================
    # Jobs CRUD + filtering
    # =========================
    def create_job(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                job_id = payload.get('id') or uuid.uuid4().hex
                fields = [
                    'position','company','location','salary_min','salary_max','salary_currency',
                    'applied','responded','state','job_type','date_posted',
                    'contact_name','contact_role','contact_email','contact_phone','contact_method','contact_handles',
                    'source_url','description','next_follow_up','benefits','notes'
                ]
                values = []
                for k in fields:
                    v = payload.get(k)
                    if k == 'benefits' and v is not None and not isinstance(v, str):
                        try:
                            v = json.dumps(v)
                        except Exception:
                            pass
                    if k == 'contact_handles' and v is not None and not isinstance(v, str):
                        try:
                            v = json.dumps(v)
                        except Exception:
                            pass
                    values.append(v)
                conn.execute(f'''
                    INSERT INTO job_offers (id, {', '.join(fields)})
                    VALUES (?, {', '.join(['?']*len(fields))})
                ''', (job_id, *values))
                # tags
                tag_ids = payload.get('tagIds') or []
                if tag_ids:
                    expanded = self._expand_with_parent_tags(conn, tag_ids)
                    for tid in expanded:
                        conn.execute('INSERT OR IGNORE INTO job_tags (job_id, tag_id) VALUES (?,?)', (job_id, tid))
                        conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tid,))
                conn.commit()
                return self.get_job(job_id)
        except sqlite3.Error as e:
            logging.error(f"Error creating job: {e}")
            return None

    def update_job(self, job_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                allowed = {
                    'position','company','location','salary_min','salary_max','salary_currency',
                    'applied','responded','state','job_type','date_posted',
                    'contact_name','contact_role','contact_email','contact_phone','contact_method','contact_handles',
                    'source_url','description','next_follow_up','benefits','notes',
                    'tagIds'
                }
                updates = []
                vals: List[Any] = []
                for k, v in patch.items():
                    if k in allowed:
                        if k == 'benefits' and v is not None and not isinstance(v, str):
                            try:
                                v = json.dumps(v)
                            except Exception:
                                pass
                        if k == 'contact_handles' and v is not None and not isinstance(v, str):
                            try:
                                v = json.dumps(v)
                            except Exception:
                                pass
                        updates.append(f"{k} = ?")
                        vals.append(v)
                if updates:
                    vals.append(job_id)
                    conn.execute(f"UPDATE job_offers SET {', '.join(updates)} WHERE id = ?", vals)
                if 'tagIds' in patch and isinstance(patch['tagIds'], list):
                    conn.execute('DELETE FROM job_tags WHERE job_id = ?', (job_id,))
                    expanded = self._expand_with_parent_tags(conn, patch['tagIds'])
                    for tid in expanded:
                        conn.execute('INSERT OR IGNORE INTO job_tags (job_id, tag_id) VALUES (?,?)', (job_id, tid))
                conn.commit()
                return self.get_job(job_id)
        except sqlite3.Error as e:
            logging.error(f"Error updating job: {e}")
            return None

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM job_offers WHERE id = ?', (job_id,))
                row = cur.fetchone()
                if not row:
                    return None
                job = dict(row)
                job['tagIds'] = self.get_tags_for_job(job_id)
                job['letters'] = self.list_motivation_letters(job_id)
                # Parse benefits JSON if present
                if job.get('benefits'):
                    try:
                        job['benefits'] = json.loads(job['benefits'])
                    except Exception:
                        pass
                if job.get('contact_handles'):
                    try:
                        job['contact_handles'] = json.loads(job['contact_handles'])
                    except Exception:
                        pass
                return job
        except sqlite3.Error as e:
            logging.error(f"Error getting job: {e}")
            return None

    def delete_job(self, job_id: str) -> bool:
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM job_offers WHERE id = ?', (job_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error deleting job: {e}")
            return False

    def list_jobs(self, filters: Dict[str, Any], limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                where: List[str] = []
                params: List[Any] = []
                # Simple filters
                if 'applied' in filters:
                    where.append('applied = ?')
                    params.append(1 if filters['applied'] else 0)
                if 'responded' in filters:
                    where.append('responded = ?')
                    params.append(1 if filters['responded'] else 0)
                if 'state' in filters and filters['state']:
                    where.append('state = ?')
                    params.append(filters['state'])
                if 'location' in filters and filters['location']:
                    where.append('location LIKE ?')
                    params.append(f"%{filters['location']}%")
                if 'company' in filters and filters['company']:
                    where.append('company LIKE ?')
                    params.append(f"%{filters['company']}%")
                if 'position' in filters and filters['position']:
                    where.append('position LIKE ?')
                    params.append(f"%{filters['position']}%")
                if 'minSalary' in filters:
                    where.append('(salary_max IS NOT NULL AND salary_max >= ?)')
                    params.append(filters['minSalary'])
                if 'maxSalary' in filters:
                    where.append('(salary_min IS NOT NULL AND salary_min <= ?)')
                    params.append(filters['maxSalary'])
                if 'q' in filters and filters['q']:
                    where.append('(position LIKE ? OR company LIKE ? OR description LIKE ? )')
                    q = f"%{filters['q']}%"
                    params.extend([q, q, q])
                if 'hasLetters' in filters:
                    if filters['hasLetters']:
                        where.append('EXISTS (SELECT 1 FROM motivation_letters ml WHERE ml.job_id = job_offers.id)')
                    else:
                        where.append('NOT EXISTS (SELECT 1 FROM motivation_letters ml WHERE ml.job_id = job_offers.id)')
                sql = 'SELECT * FROM job_offers'
                # Tag filtering
                any_tags = filters.get('anyOf') or []
                all_tags = filters.get('allOf') or []
                none_tags = filters.get('noneOf') or []
                if any_tags or all_tags or none_tags:
                    sql += ' WHERE '
                if where:
                    sql += (' WHERE ' if ' WHERE ' not in sql else '') + ' AND '.join(where)
                # Append tag exists clauses
                prefix = ' AND ' if where else ' WHERE '
                if any_tags:
                    qmarks = ','.join('?' for _ in any_tags)
                    sql += f"{prefix} EXISTS (SELECT 1 FROM job_tags jt1 WHERE jt1.job_id = job_offers.id AND jt1.tag_id IN ({qmarks}))"
                    params.extend(any_tags)
                    prefix = ' AND '
                if all_tags:
                    for i, tid in enumerate(all_tags):
                        sql += f"{prefix} EXISTS (SELECT 1 FROM job_tags jtA{i} WHERE jtA{i}.job_id = job_offers.id AND jtA{i}.tag_id = ?)"
                        params.append(tid)
                        prefix = ' AND '
                if none_tags:
                    qmarks = ','.join('?' for _ in none_tags)
                    sql += f"{prefix} NOT EXISTS (SELECT 1 FROM job_tags jtN WHERE jtN.job_id = job_offers.id AND jtN.tag_id IN ({qmarks}))"
                    params.extend(none_tags)
                sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?'
                params.extend([limit, offset])
                cur = conn.execute(sql, params)
                jobs = [dict(r) for r in cur.fetchall()]
                for j in jobs:
                    j['tagIds'] = self.get_tags_for_job(j['id'])
                    j['letters'] = self.list_motivation_letters(j['id'])
                    if j.get('benefits'):
                        try:
                            j['benefits'] = json.loads(j['benefits'])
                        except Exception:
                            pass
                    if j.get('contact_handles'):
                        try:
                            j['contact_handles'] = json.loads(j['contact_handles'])
                        except Exception:
                            pass
                return jobs
        except sqlite3.Error as e:
            logging.error(f"Error listing jobs: {e}")
            return []

    def get_tags_for_job(self, job_id: str) -> List[str]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT tag_id FROM job_tags WHERE job_id = ?', (job_id,))
                return [r['tag_id'] for r in cur.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting tags for job: {e}")
            return []

    def add_motivation_letter(self, job_id: str, file_path: str, filename: Optional[str] = None, version: int = 1) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                letter_id = uuid.uuid4().hex
                conn.execute('''
                    INSERT INTO motivation_letters (id, job_id, file_path, filename, version)
                    VALUES (?, ?, ?, ?, ?)
                ''', (letter_id, job_id, file_path, filename or os.path.basename(file_path), version))
                conn.commit()
                return {
                    'id': letter_id,
                    'job_id': job_id,
                    'file_path': file_path,
                    'filename': filename or os.path.basename(file_path),
                    'version': version
                }
        except sqlite3.Error as e:
            logging.error(f"Error adding motivation letter: {e}")
            return None

    def list_motivation_letters(self, job_id: str) -> List[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT id, filename, file_path, version, uploaded_at FROM motivation_letters WHERE job_id = ? ORDER BY uploaded_at DESC', (job_id,))
                return [dict(r) for r in cur.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error listing motivation letters: {e}")
            return []

    # =========================
    # Job events/timeline
    # =========================
    def list_job_events(self, job_id: str) -> List[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM job_events WHERE job_id = ? ORDER BY COALESCE(dt, created_at) ASC', (job_id,))
                rows = [dict(r) for r in cur.fetchall()]
                for r in rows:
                    if r.get('attachments'):
                        try:
                            r['attachments'] = json.loads(r['attachments'])
                        except Exception:
                            pass
                return rows
        except sqlite3.Error as e:
            logging.error(f"Error listing job events: {e}")
            return []

    def add_job_event(self, job_id: str, event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                ev_id = event.get('id') or uuid.uuid4().hex
                fields = ['type','dt','participants','medium','outcome','notes','attachments']
                vals = [event.get(k) for k in fields]
                # Store attachments as JSON
                if vals[-1] is not None and not isinstance(vals[-1], str):
                    vals[-1] = json.dumps(vals[-1])
                conn.execute(f'''
                    INSERT INTO job_events (id, job_id, {', '.join(fields)})
                    VALUES (?, ?, {', '.join(['?']*len(fields))})
                ''', (ev_id, job_id, *vals))
                conn.commit()
                return self.get_job_event(ev_id)
        except sqlite3.Error as e:
            logging.error(f"Error adding job event: {e}")
            return None

    def get_job_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM job_events WHERE id = ?', (event_id,))
                r = cur.fetchone()
                if not r:
                    return None
                ev = dict(r)
                if ev.get('attachments'):
                    try:
                        ev['attachments'] = json.loads(ev['attachments'])
                    except Exception:
                        pass
                return ev
        except sqlite3.Error as e:
            logging.error(f"Error getting job event: {e}")
            return None

    def update_job_event(self, event_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                allowed = {'type','dt','participants','medium','outcome','notes','attachments'}
                updates = []
                vals: List[Any] = []
                for k, v in patch.items():
                    if k in allowed:
                        if k == 'attachments' and v is not None and not isinstance(v, str):
                            v = json.dumps(v)
                        updates.append(f"{k} = ?")
                        vals.append(v)
                if not updates:
                    return self.get_job_event(event_id)
                vals.append(event_id)
                conn.execute(f"UPDATE job_events SET {', '.join(updates)} WHERE id = ?", vals)
                conn.commit()
                return self.get_job_event(event_id)
        except sqlite3.Error as e:
            logging.error(f"Error updating job event: {e}")
            return None

    def delete_job_event(self, event_id: str) -> bool:
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM job_events WHERE id = ?', (event_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error deleting job event: {e}")
            return False

    # =========================
    # Time tracking
    # =========================
    def upsert_activity(self, name: str, color: Optional[str] = None, tag_id: Optional[str] = None) -> Dict[str, Any]:
        try:
            with self.get_connection() as conn:
                # Try get existing by name
                cur = conn.execute('SELECT * FROM time_activities WHERE lower(name) = lower(?)', (name.strip(),))
                row = cur.fetchone()
                if row:
                    aid = row['id']
                    conn.execute('UPDATE time_activities SET color = COALESCE(?, color), tag_id = COALESCE(?, tag_id) WHERE id = ?', (color, tag_id, aid))
                    conn.commit()
                    cur = conn.execute('SELECT * FROM time_activities WHERE id = ?', (aid,))
                    return dict(cur.fetchone())
                aid = uuid.uuid4().hex
                conn.execute('INSERT INTO time_activities (id, name, color, tag_id) VALUES (?,?,?,?)', (aid, name.strip(), color, tag_id))
                conn.commit()
                return {'id': aid, 'name': name.strip(), 'color': color, 'tag_id': tag_id}
        except sqlite3.Error as e:
            logging.error(f"Error upserting activity: {e}")
            return {}

    def list_activities(self) -> List[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM time_activities ORDER BY name COLLATE NOCASE')
                return [dict(r) for r in cur.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error listing activities: {e}")
            return []

    def start_time_entry(self, activity_id: str, start_time: Optional[str] = None, note_id: Optional[str] = None, description: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                entry_id = uuid.uuid4().hex
                start_ts = start_time or datetime.now().isoformat(sep=' ', timespec='seconds')
                conn.execute('''
                    INSERT INTO time_entries (id, activity_id, start_time, end_time, note_id, description)
                    VALUES (?, ?, ?, NULL, ?, ?)
                ''', (entry_id, activity_id, start_ts, note_id, description))
                conn.commit()
                return self.get_time_entry(entry_id)
        except sqlite3.Error as e:
            logging.error(f"Error starting time entry: {e}")
            return None

    def stop_time_entry(self, entry_id: str, end_time: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                end_ts = end_time or datetime.now().isoformat(sep=' ', timespec='seconds')
                conn.execute('UPDATE time_entries SET end_time = ? WHERE id = ?', (end_ts, entry_id))
                conn.commit()
                return self.get_time_entry(entry_id)
        except sqlite3.Error as e:
            logging.error(f"Error stopping time entry: {e}")
            return None

    def update_time_entry(self, entry_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                allowed = {'activity_id','start_time','end_time','note_id','description'}
                updates = []
                vals: List[Any] = []
                for k, v in patch.items():
                    if k in allowed:
                        updates.append(f"{k} = ?")
                        vals.append(v)
                if updates:
                    vals.append(entry_id)
                    conn.execute(f"UPDATE time_entries SET {', '.join(updates)} WHERE id = ?", vals)
                    conn.commit()
                return self.get_time_entry(entry_id)
        except sqlite3.Error as e:
            logging.error(f"Error updating time entry: {e}")
            return None

    def get_time_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM time_entries WHERE id = ?', (entry_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        except sqlite3.Error as e:
            logging.error(f"Error getting time entry: {e}")
            return None

    def list_time_entries(self, start: Optional[str] = None, end: Optional[str] = None, day: Optional[str] = None) -> List[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                where: List[str] = []
                params: List[Any] = []
                if day:
                    where.append('date(start_time) = date(?)')
                    params.append(day)
                else:
                    if start:
                        where.append('start_time >= ?')
                        params.append(start)
                    if end:
                        where.append('start_time <= ?')
                        params.append(end)
                sql = 'SELECT * FROM time_entries'
                if where:
                    sql += ' WHERE ' + ' AND '.join(where)
                sql += ' ORDER BY start_time ASC'
                cur = conn.execute(sql, params)
                return [dict(r) for r in cur.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error listing time entries: {e}")
            return []

    # =========================
    # Dev templates
    # =========================
    def load_template(self, name: str) -> Dict[str, Any]:
        try:
            with self.get_connection() as conn:
                created = {'notes': 0, 'tags': 0, 'jobs': 0, 'time_entries': 0}
                # Template 4: Tag Hierarchies
                if name in ('template4', 'all'):
                    # jobs -> ai, ml; sport -> running, gym
                    def ensure_tag(obj: Dict[str, Any]):
                        t = self.create_tag(obj)
                        return t['id'] if t else None
                    jobs_id = ensure_tag({'name': 'jobs'})
                    ai_id = ensure_tag({'name': 'ai', 'parentId': jobs_id})
                    ml_id = ensure_tag({'name': 'ml', 'parentId': jobs_id})
                    sport_id = ensure_tag({'name': 'sport'})
                    running_id = ensure_tag({'name': 'running', 'parentId': sport_id})
                    gym_id = ensure_tag({'name': 'gym', 'parentId': sport_id})
                    created['tags'] += 6
                # Template 1: Notes + Tags
                if name in ('template1', 'all'):
                    # Create 5 notes under root with mixed tags
                    note_defs = [
                        ('Daily plan', ['work']),
                        ('Running log', ['sport','sport/running']),
                        ('Weekend ideas', ['free']),
                        ('AI jobs research', ['jobs/ai']),
                        ('Gym routine', ['sport/gym'])
                    ]
                    for title, tag_paths in note_defs:
                        nid = uuid.uuid4().hex
                        self.create_node(nid, title, 'note', None)
                        self.save_note_content(nid, {'blocks': [{'type': 'paragraph', 'data': {'text': title}}]})
                        # Resolve tags by slug/name
                        ids: List[str] = []
                        for path in tag_paths:
                            # If in jobs/ai style, split parentPath and name
                            if '/' in path:
                                parent, child = path.split('/', 1)
                                t = self.create_tag({'name': child, 'parentPath': parent})
                            else:
                                t = self.create_tag({'name': path})
                            if t:
                                ids.append(t['id'])
                        self.assign_tags_to_note(nid, ids)
                        created['notes'] += 1
                # Template 2: Jobs
                if name in ('template2', 'all'):
                    # Ensure a few job-related tags exist so tag pills can be tested
                    ai_tag = self.create_tag({'name': 'ai', 'parentPath': 'jobs'}) or {}
                    ml_tag = self.create_tag({'name': 'ml', 'parentPath': 'jobs'}) or {}
                    web_tag = self.create_tag({'name': 'web', 'parentPath': 'jobs'}) or {}

                    now = datetime.now()
                    def iso_plus(days: int, hours: int = 0):
                        from datetime import timedelta
                        return (now + timedelta(days=days, hours=hours)).isoformat(timespec='seconds')

                    jobs = [
                        {
                            'position': 'ML Engineer', 'company': 'DeepVision', 'location': 'Remote',
                            'salary_min': 120000, 'salary_max': 150000, 'salary_currency': 'USD',
                            'applied': 0, 'responded': 0, 'state': 'draft', 'job_type': 'Full-time',
                            'deadline': '2025-10-01', 'tagIds': [ai_tag.get('id')] if ai_tag.get('id') else [],
                            'source_url': 'https://jobs.example.com/deepvision/ml-engineer',
                            'contact_name': 'Alex Rivera', 'contact_role': 'Senior Recruiter',
                            'contact_email': 'alex.rivera@deepvision.ai', 'contact_method': 'Email',
                            'contact_handles': [
                                {'type':'Email','value':'alex.rivera@deepvision.ai'},
                                {'type':'Phone','value':'+1 555 000 1122'},
                                {'type':'LinkedIn','value':'in/alex-rivera'}
                            ],
                            'next_follow_up': iso_plus(1),
                            'benefits': [{'name':'Remote'},{'name':'PTO days','value':'25'},{'name':'RSUs','value':'$20k'},{'name':'Visa support'}],
                            'notes': 'Interesting role focusing on multimodal models. Prepare portfolio.',
                            'description': '# Responsibilities\n- Build and deploy ML models\n- Collaborate with research team\n\n## Requirements\n- Python, PyTorch, MLOps'
                        },
                        {
                            'position': 'AI Researcher', 'company': 'QuantumAI', 'location': 'Zurich, CH',
                            'salary_min': 110000, 'salary_max': 140000, 'salary_currency': 'EUR',
                            'applied': 1, 'responded': 0, 'state': 'applied', 'job_type': 'Full-time',
                            'deadline': '2025-09-20', 'tagIds': [ai_tag.get('id'), ml_tag.get('id')],
                            'source_url': 'https://careers.quantumai.ch/jobs/ai-researcher',
                            'contact_name': 'Marta Weiss', 'contact_role': 'TA Partner',
                            'contact_email': 'marta.weiss@quantumai.ch', 'contact_method': 'Email',
                            'contact_handles': [
                                {'type':'Email','value':'marta.weiss@quantumai.ch'},
                                {'type':'LinkedIn','value':'in/marta-weiss-qa'}
                            ],
                            'next_follow_up': iso_plus(-1),
                            'benefits': [{'name':'Relocation'},{'name':'Bonus %','value':'10%'}],
                            'notes': 'Strong math requirement. Brush up on variational methods.',
                            'description': 'Research position in variational inference and quantum-enhanced ML.'
                        },
                        {
                            'position': 'Data Scientist', 'company': 'InsightCorp', 'location': 'NYC, USA',
                            'salary_min': 100000, 'salary_max': 130000, 'salary_currency': 'USD',
                            'applied': 1, 'responded': 1, 'state': 'interview', 'job_type': 'Full-time',
                            'deadline': '2025-09-15', 'tagIds': [ml_tag.get('id')],
                            'source_url': 'https://insightcorp.com/careers/data-scientist',
                            'contact_name': 'Daniel Kim', 'contact_role': 'Recruiter',
                            'contact_email': 'daniel.kim@insightcorp.com', 'contact_method': 'Email',
                            'contact_handles': [
                                {'type':'Email','value':'daniel.kim@insightcorp.com'},
                                {'type':'Phone','value':'+1 212 555 7788'}
                            ],
                            'next_follow_up': iso_plus(2),
                            'benefits': [{'name':'Hybrid'},{'name':'PTO days','value':'20'}],
                            'notes': 'Panel interview scheduled. Prepare for case study.',
                            'description': 'Work with stakeholders to build predictive models and dashboards.'
                        },
                        {
                            'position': 'MLOps Engineer', 'company': 'CloudOps', 'location': 'Berlin, DE',
                            'salary_min': 85000, 'salary_max': 105000, 'salary_currency': 'EUR',
                            'applied': 0, 'responded': 0, 'state': 'applied', 'job_type': 'Contract',
                            'deadline': '2025-11-10', 'tagIds': [web_tag.get('id')],
                            'source_url': 'https://cloudops.dev/jobs/mlops-engineer',
                            'contact_name': 'Jonas Meier', 'contact_role': 'Hiring Manager',
                            'contact_email': 'jobs@cloudops.dev', 'contact_method': 'Email',
                            'contact_handles': [
                                {'type':'Email','value':'jobs@cloudops.dev'},
                                {'type':'LinkedIn','value':'company/cloudops'}
                            ],
                            'next_follow_up': iso_plus(5),
                            'benefits': [{'name':'Remote'},{'name':'Bonus %','value':'5%'}],
                            'notes': 'Contract role; confirm budget and duration.',
                            'description': 'Own CI/CD for ML pipelines and model deployments.'
                        },
                        {
                            'position': 'NLP Engineer', 'company': 'TextLabs', 'location': 'London, UK',
                            'salary_min': 70000, 'salary_max': 90000, 'salary_currency': 'GBP',
                            'applied': 0, 'responded': 0, 'state': 'draft', 'job_type': 'Part-time',
                            'deadline': '2025-12-31', 'tagIds': [ai_tag.get('id')],
                            'source_url': 'https://textlabs.ai/careers/nlp-engineer',
                            'contact_name': 'Sarah Johnson', 'contact_role': 'Recruiter',
                            'contact_email': 'sarah@textlabs.ai', 'contact_method': 'LinkedIn',
                            'contact_handles': [
                                {'type':'LinkedIn','value':'in/sarah-j'},
                                {'type':'Email','value':'sarah@textlabs.ai'}
                            ],
                            'next_follow_up': iso_plus(10),
                            'benefits': [{'name':'Hybrid'},{'name':'PTO days','value':'15'}],
                            'notes': 'Part-time flexibility is a plus.',
                            'description': 'NLP role with focus on LLM prompt engineering and evaluations.'
                        },
                        {
                            'position': 'Research Intern (NLP)', 'company': 'UniLab', 'location': 'Remote',
                            'salary_min': None, 'salary_max': None, 'salary_currency': 'USD',
                            'applied': 0, 'responded': 0, 'state': 'draft', 'job_type': 'Internship',
                            'deadline': '2025-09-30', 'tagIds': [],
                            'source_url': 'https://unilab.edu/internships/nlp',
                            'contact_name': 'Prof. Lee', 'contact_role': 'Lab Director',
                            'contact_email': 'lee@unilab.edu', 'contact_method': 'Email',
                            'contact_handles': [
                                {'type':'Email','value':'lee@unilab.edu'}
                            ],
                            'next_follow_up': iso_plus(3),
                            'benefits': [{'name':'Remote'}],
                            'notes': 'Good entry point for research exposure.',
                            'description': 'Assist with dataset curation and model training for NLP tasks.'
                        },
                        {
                            'position': 'Senior ML Engineer', 'company': 'VisionOps', 'location': 'Austin, USA',
                            'salary_min': 150000, 'salary_max': 180000, 'salary_currency': 'USD',
                            'applied': 1, 'responded': 1, 'state': 'offer', 'job_type': 'Full-time',
                            'deadline': '2025-10-20', 'tagIds': [ai_tag.get('id')],
                            'source_url': 'https://visionops.com/careers/senior-ml-engineer',
                            'contact_name': 'Priya Singh', 'contact_role': 'Recruiter',
                            'contact_email': 'priya@visionops.com', 'contact_method': 'Email',
                            'contact_handles': [
                                {'type':'Email','value':'priya@visionops.com'},
                                {'type':'Phone','value':'+1 737 555 0101'},
                                {'type':'LinkedIn','value':'in/priya-singh'}
                            ],
                            'next_follow_up': iso_plus(0),
                            'benefits': [{'name':'RSUs','value':'$40k'},{'name':'Bonus %','value':'12%'}],
                            'notes': 'Offer received; review comp and benefits.',
                            'description': 'Lead ML projects, mentor team, drive platform improvements.'
                        },
                        {
                            'position': 'Applied Scientist', 'company': 'DataForge', 'location': 'Remote',
                            'salary_min': 130000, 'salary_max': 0, 'salary_currency': 'USD',
                            'applied': 1, 'responded': 1, 'state': 'rejected', 'job_type': 'Full-time',
                            'deadline': '2025-08-31', 'tagIds': [ml_tag.get('id')],
                            'source_url': 'https://dataforge.example/jobs/applied-scientist',
                            'contact_name': 'HR Team', 'contact_role': 'People Ops',
                            'contact_email': 'careers@dataforge.example', 'contact_method': 'Email',
                            'contact_handles': [{'type':'Email','value':'careers@dataforge.example'}],
                            'next_follow_up': None,
                            'benefits': [{'name':'Remote'}],
                            'notes': 'Rejection received; move on.',
                            'description': 'Work on applied ML problems across product lines.'
                        },
                    ]
                    for j in jobs:
                        job = self.create_job(j) or {}
                        if job:
                            created['jobs'] += 1
                            # Seed a few events based on state
                            if job.get('state') in ('applied','interview'):
                                try:
                                    self.add_job_event(job['id'], {'type':'Applied', 'dt': iso_plus(-7)})
                                except Exception:
                                    pass
                            if job.get('state') == 'interview':
                                try:
                                    self.add_job_event(job['id'], {'type':'Recruiter call', 'dt': iso_plus(-3), 'notes':'Screening call'})
                                    self.add_job_event(job['id'], {'type':'Interview 1', 'dt': iso_plus(1, 3), 'notes':'Tech screen'})
                                except Exception:
                                    pass
                            if job.get('state') == 'offer':
                                try:
                                    self.add_job_event(job['id'], {'type':'Applied', 'dt': iso_plus(-14)})
                                    self.add_job_event(job['id'], {'type':'Interview loop', 'dt': iso_plus(-7)})
                                    self.add_job_event(job['id'], {'type':'Offer', 'dt': iso_plus(-1)})
                                except Exception:
                                    pass
                            if job.get('state') == 'rejected':
                                try:
                                    self.add_job_event(job['id'], {'type':'Applied', 'dt': iso_plus(-10)})
                                    self.add_job_event(job['id'], {'type':'Rejected', 'dt': iso_plus(-2), 'notes':'Generic rejection'})
                                except Exception:
                                    pass
                # Template 3: Time Tracking
                if name in ('template3', 'all'):
                    # Ensure basic activities
                    work = self.upsert_activity('Work', '#4285F4')
                    free = self.upsert_activity('Free', '#9E9E9E')
                    sport = self.upsert_activity('Sport', '#34A853')
                    today = datetime.now().strftime('%Y-%m-%d')
                    # Create 3 entries for today
                    self.start_time_entry(work.get('id'), f"{today} 09:00:00")
                    e1 = self.start_time_entry(sport.get('id'), f"{today} 12:00:00")
                    if e1: self.stop_time_entry(e1['id'], f"{today} 13:00:00")
                    e2 = self.start_time_entry(free.get('id'), f"{today} 18:00:00")
                    if e2: self.stop_time_entry(e2['id'], f"{today} 20:00:00")
                    created['time_entries'] += 3
                conn.commit()
                return {'status': 'ok', 'created': created}
        except sqlite3.Error as e:
            logging.error(f"Error loading template {name}: {e}")
            return {'status': 'error', 'message': str(e)}

    def get_tags_for_note(self, note_id: str) -> List[Dict[str, Any]]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('''
                    SELECT t.* FROM tags t
                    JOIN note_tags nt ON nt.tag_id = t.id
                    WHERE nt.note_id = ?
                    ORDER BY t.name COLLATE NOCASE
                ''', (note_id,))
                tags = [dict(row) for row in cur.fetchall()]
                for t in tags:
                    if t.get('aliases'):
                        try:
                            t['aliases'] = json.loads(t['aliases'])
                        except Exception:
                            t['aliases'] = []
                return tags
        except sqlite3.Error as e:
            logging.error(f"Error getting tags for note: {e}")
            return []

    def search_notes_by_tags(self, any_of: List[str] = None, all_of: List[str] = None, none_of: List[str] = None, limit: int = 50, cursor: Optional[str] = None) -> List[str]:
        any_of = any_of or []
        all_of = all_of or []
        none_of = none_of or []
        try:
            with self.get_connection() as conn:
                params: List[Any] = []
                base = 'SELECT n.id FROM notes n'
                where_clauses: List[str] = []
                if any_of:
                    qmarks = ','.join('?' for _ in any_of)
                    base += f' WHERE EXISTS (SELECT 1 FROM note_tags nt1 WHERE nt1.note_id = n.id AND nt1.tag_id IN ({qmarks}))'
                    params.extend(any_of)
                if all_of:
                    for i, tid in enumerate(all_of):
                        base += f' AND EXISTS (SELECT 1 FROM note_tags ntA{i} WHERE ntA{i}.note_id = n.id AND ntA{i}.tag_id = ? )'
                        params.append(tid)
                if none_of:
                    qmarks = ','.join('?' for _ in none_of)
                    base += f' AND NOT EXISTS (SELECT 1 FROM note_tags ntN WHERE ntN.note_id = n.id AND ntN.tag_id IN ({qmarks}))'
                    params.extend(none_of)
                base += ' ORDER BY n.updated_at DESC LIMIT ?'
                params.append(limit)
                cur = conn.execute(base, params)
                return [row['id'] for row in cur.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error searching notes by tags: {e}")
            return []

    def get_tag_dashboard(self, tag_id: str) -> Dict[str, Any]:
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                t = cur.fetchone()
                if not t:
                    return {}
                tag = dict(t)
                # usage
                cur = conn.execute('SELECT COUNT(*) as cnt FROM note_tags WHERE tag_id = ?', (tag_id,))
                usage = cur.fetchone()['cnt']
                # siblings and children
                pid = tag.get('parent_id')
                siblings = []
                if pid:
                    cur = conn.execute('SELECT * FROM tags WHERE parent_id = ? AND id != ? ORDER BY name COLLATE NOCASE', (pid, tag_id))
                    siblings = [dict(r) for r in cur.fetchall()]
                cur = conn.execute('SELECT * FROM tags WHERE parent_id = ? ORDER BY name COLLATE NOCASE', (tag_id,))
                children = [dict(r) for r in cur.fetchall()]
                # recent notes
                cur = conn.execute('''
                    SELECT n.id, n.name, n.updated_at FROM notes n
                    JOIN note_tags nt ON nt.note_id = n.id
                    WHERE nt.tag_id = ? ORDER BY n.updated_at DESC LIMIT 50
                ''', (tag_id,))
                recent_notes = [dict(r) for r in cur.fetchall()]
                # co-occurring tags (simple co-count)
                cur = conn.execute('''
                    SELECT nt2.tag_id as tag_id, COUNT(*) as cnt
                    FROM note_tags nt1
                    JOIN note_tags nt2 ON nt1.note_id = nt2.note_id AND nt2.tag_id != nt1.tag_id
                    WHERE nt1.tag_id = ?
                    GROUP BY nt2.tag_id
                    ORDER BY cnt DESC LIMIT 10
                ''', (tag_id,))
                co_ids = [r['tag_id'] for r in cur.fetchall()]
                co_tags = []
                if co_ids:
                    qmarks = ','.join('?' for _ in co_ids)
                    cur = conn.execute(f'SELECT * FROM tags WHERE id IN ({qmarks})', co_ids)
                    co_tags = [dict(r) for r in cur.fetchall()]
                return {
                    'tag': tag,
                    'usage': usage,
                    'siblings': siblings,
                    'children': children,
                    'coTags': co_tags,
                    'recentNotes': recent_notes,
                }
        except sqlite3.Error as e:
            logging.error(f"Error building tag dashboard: {e}")
            return {}
    
    def backup_database(self, backup_path: str) -> bool:
        """Create a backup of the database."""
        try:
            with self.get_connection() as conn:
                backup_conn = sqlite3.connect(backup_path)
                conn.backup(backup_conn)
                backup_conn.close()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error creating backup: {e}")
            return False
    
    def migrate_from_json(self, tree_file: str, chats_file: str) -> bool:
        """Migrate existing JSON data to the new database structure."""
        try:
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
                self.create_node(
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
                    self.create_node(
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
                    self.save_note_content(node['id'], node['content'])
                
                # Recursively save content for children
                for child in node.get('children', []):
                    save_content(child)
            
            # Save content for tree nodes
            for root_node in tree_data:
                save_content(root_node)
            
            # Save chat messages
            for chat in chats_data:
                if 'content' in chat and 'messages' in chat['content']:
                    self.save_chat_messages(chat['id'], chat['content']['messages'])
            
            return True
            
        except Exception as e:
            logging.error(f"Error migrating data: {e}")
            return False
    
    def move_node(self, node_id: str, new_parent_id: Optional[str] = None, new_sort_order: Optional[int] = None) -> bool:
        """Move a node to a new parent and/or position."""
        try:
            with self.get_connection() as conn:
                # Get current node info
                cursor = conn.execute('SELECT parent_id, sort_order FROM nodes WHERE id = ?', (node_id,))
                current_node = cursor.fetchone()
                if not current_node:
                    return False
                
                current_parent_id = current_node['parent_id']
                current_sort_order = current_node['sort_order']
                
                # If new_sort_order is not specified, add to end of new parent
                if new_sort_order is None:
                    cursor = conn.execute('''
                        SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order
                        FROM nodes WHERE parent_id = ? OR (parent_id IS NULL AND ? IS NULL)
                    ''', (new_parent_id, new_parent_id))
                    new_sort_order = cursor.fetchone()['next_order']
                
                # Update the node's parent and sort order
                conn.execute('''
                    UPDATE nodes SET parent_id = ?, sort_order = ? WHERE id = ?
                ''', (new_parent_id, new_sort_order, node_id))
                
                # Reorder siblings in the old parent (if parent changed)
                if current_parent_id != new_parent_id:
                    cursor = conn.execute('''
                        SELECT id FROM nodes 
                        WHERE (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))
                        AND sort_order > ?
                        ORDER BY sort_order
                    ''', (current_parent_id, current_parent_id, current_sort_order))
                    
                    for i, row in enumerate(cursor.fetchall()):
                        conn.execute('''
                            UPDATE nodes SET sort_order = ? WHERE id = ?
                        ''', (current_sort_order + i, row['id']))
                
                # Reorder siblings in the new parent (if inserting in the middle)
                if new_parent_id != current_parent_id or new_sort_order != current_sort_order:
                    cursor = conn.execute('''
                        SELECT id FROM nodes 
                        WHERE (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))
                        AND id != ?
                        AND sort_order >= ?
                        ORDER BY sort_order
                    ''', (new_parent_id, new_parent_id, node_id, new_sort_order))
                    
                    for i, row in enumerate(cursor.fetchall()):
                        conn.execute('''
                            UPDATE nodes SET sort_order = ? WHERE id = ?
                        ''', (new_sort_order + i + 1, row['id']))
                
                conn.commit()
                return True
                
        except sqlite3.Error as e:
            logging.error(f"Error moving node: {e}")
            return False

    # Job Scraper Configuration Methods
    def create_scraper_config(self, config_data: Dict[str, Any]) -> Optional[str]:
        """Create a new job scraper configuration."""
        try:
            config_id = str(uuid.uuid4())
            with self.get_connection() as conn:
                conn.execute('''
                    INSERT INTO job_scraper_configs (
                        id, name, search_terms, target_locations, job_boards,
                        scrape_frequency_hours, lookback_hours, max_results_per_run,
                        max_results_per_source, remote_only, hybrid_allowed, onsite_allowed,
                        employment_types, min_salary, salary_currency, seniority_levels,
                        dedup_strategy, auto_tag_rules, notifications, min_score_threshold,
                        enabled
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    config_id,
                    config_data.get('name', 'Untitled Config'),
                    json.dumps(config_data.get('search_terms', [])),
                    json.dumps(config_data.get('target_locations', [])),
                    json.dumps(config_data.get('job_boards', [])),
                    config_data.get('scrape_frequency_hours', 24),
                    config_data.get('lookback_hours', 24),
                    config_data.get('max_results_per_run', 100),
                    config_data.get('max_results_per_source', 50),
                    config_data.get('remote_only', False),
                    config_data.get('hybrid_allowed', True),
                    config_data.get('onsite_allowed', True),
                    json.dumps(config_data.get('employment_types', ['full-time'])),
                    config_data.get('min_salary'),
                    config_data.get('salary_currency', 'USD'),
                    json.dumps(config_data.get('seniority_levels', ['Mid', 'Senior'])),
                    config_data.get('dedup_strategy', 'smart_hash'),
                    json.dumps(config_data.get('auto_tag_rules', {})),
                    config_data.get('notifications', 'in_app'),
                    config_data.get('min_score_threshold', 0.6),
                    config_data.get('enabled', True)
                ))
                conn.commit()
                return config_id
        except sqlite3.Error as e:
            logging.error(f"Error creating scraper config: {e}")
            return None

    def get_scraper_configs(self) -> List[Dict[str, Any]]:
        """Get all job scraper configurations."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT * FROM job_scraper_configs ORDER BY created_at DESC
                ''')
                configs = []
                for row in cursor.fetchall():
                    config = dict(row)
                    # Parse JSON fields
                    config['search_terms'] = json.loads(config['search_terms'])
                    config['target_locations'] = json.loads(config['target_locations'])
                    config['job_boards'] = json.loads(config['job_boards'])
                    config['employment_types'] = json.loads(config['employment_types'])
                    config['seniority_levels'] = json.loads(config['seniority_levels'])
                    config['auto_tag_rules'] = json.loads(config['auto_tag_rules'])
                    configs.append(config)
                return configs
        except sqlite3.Error as e:
            logging.error(f"Error getting scraper configs: {e}")
            return []

    def update_scraper_config(self, config_id: str, updates: Dict[str, Any]) -> bool:
        """Update a job scraper configuration."""
        try:
            with self.get_connection() as conn:
                # Build dynamic update query
                set_clauses = []
                values = []
                
                for key, value in updates.items():
                    if key in ['search_terms', 'target_locations', 'job_boards', 'employment_types', 'seniority_levels', 'auto_tag_rules']:
                        set_clauses.append(f"{key} = ?")
                        values.append(json.dumps(value))
                    else:
                        set_clauses.append(f"{key} = ?")
                        values.append(value)
                
                if not set_clauses:
                    return True
                
                values.append(config_id)
                query = f"UPDATE job_scraper_configs SET {', '.join(set_clauses)} WHERE id = ?"
                conn.execute(query, values)
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error updating scraper config: {e}")
            return False

    def delete_scraper_config(self, config_id: str) -> bool:
        """Delete a job scraper configuration."""
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM job_scraper_configs WHERE id = ?', (config_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error deleting scraper config: {e}")
            return False

    def log_scraper_run(self, config_id: str, stats: Dict[str, Any]) -> Optional[str]:
        """Log a job scraper run."""
        try:
            run_id = str(uuid.uuid4())
            with self.get_connection() as conn:
                conn.execute('''
                    INSERT INTO job_scraper_runs (
                        id, config_id, status, jobs_fetched, jobs_inserted,
                        jobs_deduped, jobs_failed, error_message, completed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    run_id, config_id,
                    stats.get('status', 'completed'),
                    stats.get('jobs_fetched', 0),
                    stats.get('jobs_inserted', 0),
                    stats.get('jobs_deduped', 0),
                    stats.get('jobs_failed', 0),
                    stats.get('error_message'),
                    stats.get('completed_at', datetime.now().isoformat())
                ))
                
                # Update last run time for config
                conn.execute('''
                    UPDATE job_scraper_configs SET last_run_at = CURRENT_TIMESTAMP WHERE id = ?
                ''', (config_id,))
                
                conn.commit()
                return run_id
        except sqlite3.Error as e:
            logging.error(f"Error logging scraper run: {e}")
            return None

    def is_job_seen(self, url: str, title: str, company: str, location: str, date_posted: str) -> Optional[str]:
        """Check if a job has been seen before using de-duplication strategy."""
        try:
            import hashlib
            
            # Handle None values for all parameters
            safe_url = url or ""
            
            # Create canonical URL hash
            canonical_url_hash = hashlib.sha1(safe_url.encode()).hexdigest()
            
            # Create smart hash from normalized fields - handle None values
            safe_title = (title or "").lower().strip()
            safe_company = (company or "").lower().strip()
            safe_location = (location or "").lower().strip()
            safe_date_posted = date_posted or ""
            
            smart_content = f"{safe_title}|{safe_company}|{safe_location}|{safe_date_posted}"
            smart_hash = hashlib.sha1(smart_content.encode()).hexdigest()
            
            with self.get_connection() as conn:
                # Check for existing job by URL or smart hash
                cursor = conn.execute('''
                    SELECT id, job_id FROM seen_jobs 
                    WHERE canonical_url_hash = ? OR smart_hash = ?
                    ORDER BY first_seen_at DESC LIMIT 1
                ''', (canonical_url_hash, smart_hash))
                
                existing = cursor.fetchone()
                if existing:
                    # Update last seen time
                    conn.execute('''
                        UPDATE seen_jobs SET last_seen_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    ''', (existing['id'],))
                    conn.commit()
                    return existing['job_id']
                
                return None
        except Exception as e:
            logging.error(f"Error checking job duplication: {e}")
            return None

    def mark_job_seen(self, url: str, title: str, company: str, location: str, date_posted: str, job_id: str = None) -> str:
        """Mark a job as seen for de-duplication."""
        try:
            import hashlib
            
            seen_id = str(uuid.uuid4())
            
            # Handle None values for all parameters
            safe_url = url or ""
            canonical_url_hash = hashlib.sha1(safe_url.encode()).hexdigest()
            
            # Handle None values safely
            safe_title = (title or "").lower().strip()
            safe_company = (company or "").lower().strip()
            safe_location = (location or "").lower().strip()
            safe_date_posted = date_posted or ""
            
            smart_content = f"{safe_title}|{safe_company}|{safe_location}|{safe_date_posted}"
            smart_hash = hashlib.sha1(smart_content.encode()).hexdigest()
            
            # Ensure job_id is a string or None
            if job_id is not None and not isinstance(job_id, str):
                job_id = str(job_id)
            
            with self.get_connection() as conn:
                conn.execute('''
                    INSERT INTO seen_jobs (
                        id, canonical_url_hash, smart_hash, job_id,
                        title, company, location, date_posted
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (seen_id, canonical_url_hash, smart_hash, job_id, title, company, location, date_posted))
                conn.commit()
                return seen_id
        except sqlite3.Error as e:
            logging.error(f"Error marking job as seen: {e}")
            return ""

    def save_job_provenance(self, job_id: str, provenance_data: Dict[str, Dict[str, Any]]):
        """Save provenance metadata for job fields."""
        try:
            with self.get_connection() as conn:
                # Clear existing provenance for this job
                conn.execute('DELETE FROM job_provenance WHERE job_id = ?', (job_id,))
                
                # Insert new provenance data
                for field_name, metadata in provenance_data.items():
                    prov_id = str(uuid.uuid4())
                    conn.execute('''
                        INSERT INTO job_provenance (
                            id, job_id, field_name, source, confidence_score, extraction_method
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    ''', (
                        prov_id, job_id, field_name,
                        metadata.get('source', 'unknown'),
                        metadata.get('score', 0.0),
                        metadata.get('method', 'auto')
                    ))
                conn.commit()
        except sqlite3.Error as e:
            logging.error(f"Error saving job provenance: {e}")

    def get_scraper_runs_history(self, config_id: str = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Get scraper run history."""
        try:
            with self.get_connection() as conn:
                if config_id:
                    cursor = conn.execute('''
                        SELECT r.*, c.name as config_name 
                        FROM job_scraper_runs r
                        JOIN job_scraper_configs c ON r.config_id = c.id
                        WHERE r.config_id = ?
                        ORDER BY r.started_at DESC 
                        LIMIT ?
                    ''', (config_id, limit))
                else:
                    cursor = conn.execute('''
                        SELECT r.*, c.name as config_name 
                        FROM job_scraper_runs r
                        JOIN job_scraper_configs c ON r.config_id = c.id
                        ORDER BY r.started_at DESC 
                        LIMIT ?
                    ''', (limit,))
                
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting scraper runs history: {e}")
            return []

    # =========================
    # Task Management Methods
    # =========================
    
    def create_task(self, task_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a new task."""
        try:
            with self.get_connection() as conn:
                task_id = task_data.get('id') or str(uuid.uuid4())
                
                # Extract main task fields
                fields = [
                    'title', 'description', 'due_date', 'due_time', 'priority', 
                    'status', 'repeat_pattern', 'repeat_config', 'parent_task_id',
                    'original_input', 'parsing_confidence'
                ]
                
                values = []
                for field in fields:
                    value = task_data.get(field)
                    if field == 'repeat_config' and value is not None and not isinstance(value, str):
                        value = json.dumps(value)
                    values.append(value)
                
                # Insert task
                conn.execute(f'''
                    INSERT INTO tasks (id, {', '.join(fields)})
                    VALUES (?, {', '.join(['?'] * len(fields))})
                ''', (task_id, *values))
                
                # Handle tags
                tag_ids = task_data.get('tag_ids', []) or task_data.get('tags', [])
                if tag_ids:
                    # Expand with parent tags automatically
                    expanded = self._expand_with_parent_tags(conn, tag_ids)
                    for tag_id in expanded:
                        conn.execute('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)', 
                                   (task_id, tag_id))
                        conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tag_id,))
                
                # Handle reminders
                reminders = task_data.get('reminders', [])
                for reminder in reminders:
                    reminder_id = str(uuid.uuid4())
                    conn.execute('''
                        INSERT INTO task_reminders (id, task_id, reminder_time, message)
                        VALUES (?, ?, ?, ?)
                    ''', (reminder_id, task_id, reminder.get('time'), reminder.get('message')))
                
                conn.commit()
                return self.get_task(task_id)
                
        except sqlite3.Error as e:
            logging.error(f"Error creating task: {e}")
            return None
    
    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific task by ID."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,))
                row = cursor.fetchone()
                if not row:
                    return None
                
                task = dict(row)
                
                # Parse JSON fields
                if task.get('repeat_config'):
                    try:
                        task['repeat_config'] = json.loads(task['repeat_config'])
                    except Exception:
                        pass
                
                # Get tags
                cursor = conn.execute('''
                    SELECT t.* FROM tags t
                    JOIN task_tags tt ON tt.tag_id = t.id
                    WHERE tt.task_id = ?
                    ORDER BY t.name COLLATE NOCASE
                ''', (task_id,))
                task['tags'] = [dict(tag_row) for tag_row in cursor.fetchall()]
                task['tag_ids'] = [tag['id'] for tag in task['tags']]
                
                # Get reminders
                cursor = conn.execute('''
                    SELECT * FROM task_reminders WHERE task_id = ? ORDER BY reminder_time
                ''', (task_id,))
                task['reminders'] = [dict(reminder_row) for reminder_row in cursor.fetchall()]
                
                # Get file attachments
                files = self.get_task_files(task_id)
                
                # Get note references
                notes = self.get_task_note_references(task_id)
                
                # Add references in the new format
                task['references'] = {
                    'files': files,
                    'notes': notes
                }
                
                # Also maintain backward compatibility
                task['files'] = files
                
                return task
                
        except sqlite3.Error as e:
            logging.error(f"Error getting task: {e}")
            return None
    
    def update_task(self, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a task."""
        try:
            with self.get_connection() as conn:
                # Define allowed fields for direct update
                allowed_fields = {
                    'title', 'description', 'due_date', 'due_time', 'priority', 
                    'status', 'repeat_pattern', 'repeat_config', 'parent_task_id',
                    'original_input', 'parsing_confidence'
                }
                
                # Build update query for basic fields
                update_fields = []
                values = []
                
                for field, value in updates.items():
                    if field in allowed_fields:
                        if field == 'repeat_config' and value is not None and not isinstance(value, str):
                            value = json.dumps(value)
                        update_fields.append(f"{field} = ?")
                        values.append(value)
                
                # Update basic fields
                if update_fields:
                    values.append(task_id)
                    query = f"UPDATE tasks SET {', '.join(update_fields)} WHERE id = ?"
                    conn.execute(query, values)
                
                # Handle tag updates
                if 'tag_ids' in updates or 'tags' in updates:
                    tag_ids = updates.get('tag_ids', updates.get('tags', []))
                    # Clear existing tags
                    conn.execute('DELETE FROM task_tags WHERE task_id = ?', (task_id,))
                    # Add new tags
                    if tag_ids:
                        expanded = self._expand_with_parent_tags(conn, tag_ids)
                        for tag_id in expanded:
                            conn.execute('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)', 
                                       (task_id, tag_id))
                            conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tag_id,))
                
                # Handle reminder updates
                if 'reminders' in updates:
                    # Clear existing reminders
                    conn.execute('DELETE FROM task_reminders WHERE task_id = ?', (task_id,))
                    # Add new reminders
                    for reminder in updates['reminders']:
                        reminder_id = str(uuid.uuid4())
                        conn.execute('''
                            INSERT INTO task_reminders (id, task_id, reminder_time, message)
                            VALUES (?, ?, ?, ?)
                        ''', (reminder_id, task_id, reminder.get('time'), reminder.get('message')))
                
                conn.commit()
                return self.get_task(task_id)
                
        except sqlite3.Error as e:
            logging.error(f"Error updating task: {e}")
            return None
    
    def delete_task(self, task_id: str) -> bool:
        """Delete a task."""
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error deleting task: {e}")
            return False
    
    def list_tasks(self, filters: Dict[str, Any] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """List tasks with optional filters."""
        if filters is None:
            filters = {}
            
        try:
            with self.get_connection() as conn:
                where_clauses = []
                params = []
                
                # Status filter
                if 'status' in filters and filters['status']:
                    if isinstance(filters['status'], list):
                        placeholders = ','.join('?' for _ in filters['status'])
                        where_clauses.append(f'status IN ({placeholders})')
                        params.extend(filters['status'])
                    else:
                        where_clauses.append('status = ?')
                        params.append(filters['status'])
                
                # Priority filter
                if 'priority' in filters and filters['priority']:
                    if isinstance(filters['priority'], list):
                        placeholders = ','.join('?' for _ in filters['priority'])
                        where_clauses.append(f'priority IN ({placeholders})')
                        params.extend(filters['priority'])
                    else:
                        where_clauses.append('priority = ?')
                        params.append(filters['priority'])
                
                # Due date filters
                if 'due_today' in filters and filters['due_today']:
                    today = datetime.now().strftime('%Y-%m-%d')
                    where_clauses.append('due_date = ?')
                    params.append(today)
                
                if 'due_this_week' in filters and filters['due_this_week']:
                    today = datetime.now()
                    week_end = (today + timedelta(days=7-today.weekday())).strftime('%Y-%m-%d')
                    where_clauses.append('due_date <= ?')
                    params.append(week_end)
                
                if 'overdue' in filters and filters['overdue']:
                    today = datetime.now().strftime('%Y-%m-%d')
                    where_clauses.append('due_date < ? AND status != "completed"')
                    params.append(today)
                
                # Text search
                if 'q' in filters and filters['q']:
                    search_term = f"%{filters['q']}%"
                    where_clauses.append('(title LIKE ? OR description LIKE ?)')
                    params.extend([search_term, search_term])
                
                # Tag filters
                any_tags = filters.get('any_tags', [])
                all_tags = filters.get('all_tags', [])
                none_tags = filters.get('none_tags', [])
                
                # Build query
                query = 'SELECT * FROM tasks'
                
                if where_clauses or any_tags or all_tags or none_tags:
                    query += ' WHERE '
                    conditions = []
                    
                    if where_clauses:
                        conditions.extend(where_clauses)
                    
                    if any_tags:
                        placeholders = ','.join('?' for _ in any_tags)
                        conditions.append(f'''EXISTS (
                            SELECT 1 FROM task_tags tt 
                            WHERE tt.task_id = tasks.id AND tt.tag_id IN ({placeholders})
                        )''')
                        params.extend(any_tags)
                    
                    if all_tags:
                        for i, tag_id in enumerate(all_tags):
                            conditions.append(f'''EXISTS (
                                SELECT 1 FROM task_tags tt{i} 
                                WHERE tt{i}.task_id = tasks.id AND tt{i}.tag_id = ?
                            )''')
                            params.append(tag_id)
                    
                    if none_tags:
                        placeholders = ','.join('?' for _ in none_tags)
                        conditions.append(f'''NOT EXISTS (
                            SELECT 1 FROM task_tags tt_none 
                            WHERE tt_none.task_id = tasks.id AND tt_none.tag_id IN ({placeholders})
                        )''')
                        params.extend(none_tags)
                    
                    query += ' AND '.join(conditions)
                
                # Ordering
                order_by = filters.get('order_by', 'created_at')
                order_dir = filters.get('order_dir', 'DESC')
                
                # Map ordering options
                if order_by == 'due_date':
                    query += ' ORDER BY due_date ASC NULLS LAST, due_time ASC NULLS LAST'
                elif order_by == 'priority':
                    # Custom priority ordering: urgente, alta, media, baja, NULL
                    query += ''' ORDER BY 
                        CASE priority 
                            WHEN 'urgente' THEN 1 
                            WHEN 'alta' THEN 2 
                            WHEN 'media' THEN 3 
                            WHEN 'baja' THEN 4 
                            ELSE 5 
                        END ASC, created_at DESC'''
                else:
                    query += f' ORDER BY {order_by} {order_dir}'
                
                query += ' LIMIT ? OFFSET ?'
                params.extend([limit, offset])
                
                cursor = conn.execute(query, params)
                tasks = []
                
                for row in cursor.fetchall():
                    task = dict(row)
                    
                    # Parse JSON fields
                    if task.get('repeat_config'):
                        try:
                            task['repeat_config'] = json.loads(task['repeat_config'])
                        except Exception:
                            pass
                    
                    # Get tags for each task
                    tag_cursor = conn.execute('''
                        SELECT t.id, t.name, t.color FROM tags t
                        JOIN task_tags tt ON tt.tag_id = t.id
                        WHERE tt.task_id = ?
                        ORDER BY t.name COLLATE NOCASE
                    ''', (task['id'],))
                    task['tags'] = [dict(tag_row) for tag_row in tag_cursor.fetchall()]
                    task['tag_ids'] = [tag['id'] for tag in task['tags']]
                    
                    # Get file references for each task
                    file_cursor = conn.execute('''
                        SELECT * FROM task_files 
                        WHERE task_id = ?
                        ORDER BY created_at ASC
                    ''', (task['id'],))
                    task_files = [dict(file_row) for file_row in file_cursor.fetchall()]
                    
                    # Get note references for each task
                    note_cursor = conn.execute('''
                        SELECT tn.*, nodes.name, nodes.id as id, nodes.name as path FROM task_notes tn
                        JOIN nodes ON nodes.id = tn.note_id
                        WHERE tn.task_id = ? AND nodes.type = 'note'
                        ORDER BY tn.created_at ASC
                    ''', (task['id'],))
                    task_notes = [dict(note_row) for note_row in note_cursor.fetchall()]
                    
                    # Add references to task
                    task['references'] = {
                        'files': task_files,
                        'notes': task_notes
                    }
                    
                    tasks.append(task)
                
                return tasks
                
        except sqlite3.Error as e:
            logging.error(f"Error listing tasks: {e}")
            return []
    
    def get_task_stats(self) -> Dict[str, Any]:
        """Get task statistics."""
        try:
            with self.get_connection() as conn:
                stats = {}
                
                # Total counts by status
                cursor = conn.execute('''
                    SELECT status, COUNT(*) as count 
                    FROM tasks 
                    GROUP BY status
                ''')
                status_counts = {row['status']: row['count'] for row in cursor.fetchall()}
                stats['by_status'] = status_counts
                
                # Priority counts
                cursor = conn.execute('''
                    SELECT priority, COUNT(*) as count 
                    FROM tasks 
                    WHERE priority IS NOT NULL
                    GROUP BY priority
                ''')
                priority_counts = {row['priority']: row['count'] for row in cursor.fetchall()}
                stats['by_priority'] = priority_counts
                
                # Due date counts
                today = datetime.now().strftime('%Y-%m-%d')
                
                # Today
                cursor = conn.execute('SELECT COUNT(*) as count FROM tasks WHERE due_date = ?', (today,))
                stats['due_today'] = cursor.fetchone()['count']
                
                # Overdue
                cursor = conn.execute('''
                    SELECT COUNT(*) as count FROM tasks 
                    WHERE due_date < ? AND status != 'completed'
                ''', (today,))
                stats['overdue'] = cursor.fetchone()['count']
                
                # This week
                week_end = (datetime.now() + timedelta(days=7-datetime.now().weekday())).strftime('%Y-%m-%d')
                cursor = conn.execute('''
                    SELECT COUNT(*) as count FROM tasks 
                    WHERE due_date <= ? AND due_date >= ?
                ''', (week_end, today))
                stats['due_this_week'] = cursor.fetchone()['count']
                
                return stats
                
        except sqlite3.Error as e:
            logging.error(f"Error getting task stats: {e}")
            return {}
    
    def get_pending_reminders(self, until_time: str = None) -> List[Dict[str, Any]]:
        """Get pending task reminders."""
        if until_time is None:
            until_time = datetime.now().isoformat()
            
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT r.*, t.title as task_title, t.status as task_status
                    FROM task_reminders r
                    JOIN tasks t ON r.task_id = t.id
                    WHERE r.sent = FALSE 
                    AND r.reminder_time <= ?
                    AND t.status != 'completed'
                    ORDER BY r.reminder_time ASC
                ''', (until_time,))
                
                return [dict(row) for row in cursor.fetchall()]
                
        except sqlite3.Error as e:
            logging.error(f"Error getting pending reminders: {e}")
            return []
    
    def mark_reminder_sent(self, reminder_id: str) -> bool:
        """Mark a reminder as sent."""
        try:
            with self.get_connection() as conn:
                conn.execute('UPDATE task_reminders SET sent = TRUE WHERE id = ?', (reminder_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error marking reminder as sent: {e}")
            return False

    # Task File Methods
    def add_task_file(self, task_id: str, filename: str, original_name: str, file_path: str, 
                      file_size: int = None, mime_type: str = None) -> Optional[Dict[str, Any]]:
        """Add a file attachment to a task."""
        try:
            file_id = str(uuid.uuid4())
            with self.get_connection() as conn:
                conn.execute('''
                    INSERT INTO task_files (id, task_id, filename, original_name, file_path, file_size, mime_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (file_id, task_id, filename, original_name, file_path, file_size, mime_type))
                
                return {
                    'id': file_id,
                    'task_id': task_id,
                    'filename': filename,
                    'original_name': original_name,
                    'file_path': file_path,
                    'file_size': file_size,
                    'mime_type': mime_type
                }
        except sqlite3.Error as e:
            logging.error(f"Error adding task file: {e}")
            return None

    def get_task_files(self, task_id: str) -> List[Dict[str, Any]]:
        """Get all file attachments for a task."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT * FROM task_files 
                    WHERE task_id = ? 
                    ORDER BY created_at ASC
                ''', (task_id,))
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting task files: {e}")
            return []

    def remove_task_file(self, task_id: str, file_id: str) -> bool:
        """Remove a file attachment from a task."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    DELETE FROM task_files 
                    WHERE id = ? AND task_id = ?
                ''', (file_id, task_id))
                return cursor.rowcount > 0
        except sqlite3.Error as e:
            logging.error(f"Error removing task file: {e}")
            return False

    def get_file_by_id(self, file_id: str) -> Dict[str, Any]:
        """Get a file record by its ID."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT * FROM task_files 
                    WHERE id = ?
                ''', (file_id,))
                row = cursor.fetchone()
                return dict(row) if row else None
        except sqlite3.Error as e:
            logging.error(f"Error getting file by ID: {e}")
            return None

    # Task Note Methods
    def add_task_note_references(self, task_id: str, note_ids: List[str]) -> bool:
        """Add note references to a task."""
        try:
            with self.get_connection() as conn:
                # Remove existing references to avoid duplicates
                for note_id in note_ids:
                    conn.execute('''
                        INSERT OR IGNORE INTO task_notes (task_id, note_id) 
                        VALUES (?, ?)
                    ''', (task_id, note_id))
                return True
        except sqlite3.Error as e:
            logging.error(f"Error adding task note references: {e}")
            return False

    def get_task_note_references(self, task_id: str) -> List[Dict[str, Any]]:
        """Get all note references for a task."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    SELECT n.id, n.name, n.parent_id, n.created_at, n.updated_at,
                           GROUP_CONCAT(parent.name, ' > ') as path
                    FROM task_notes tn
                    JOIN nodes n ON tn.note_id = n.id
                    LEFT JOIN nodes parent ON n.parent_id = parent.id
                    WHERE tn.task_id = ? AND n.type = 'note'
                    GROUP BY n.id
                    ORDER BY tn.created_at ASC
                ''', (task_id,))
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting task note references: {e}")
            return []

    def remove_task_note_reference(self, task_id: str, note_id: str) -> bool:
        """Remove a note reference from a task."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('''
                    DELETE FROM task_notes 
                    WHERE task_id = ? AND note_id = ?
                ''', (task_id, note_id))
                return cursor.rowcount > 0
        except sqlite3.Error as e:
            logging.error(f"Error removing task note reference: {e}")
            return False

    def get_all_notes_for_selection(self, search_query: str = None) -> List[Dict[str, Any]]:
        """Get all notes for selection in task references."""
        try:
            with self.get_connection() as conn:
                sql = '''
                    SELECT n.id, n.name, n.parent_id, n.created_at, n.updated_at,
                           (SELECT GROUP_CONCAT(p.name, ' > ') 
                            FROM nodes p 
                            WHERE p.id IN (
                                WITH RECURSIVE parent_path(id, parent_id, level) AS (
                                    SELECT parent_id, (SELECT parent_id FROM nodes WHERE id = n.parent_id), 1
                                    WHERE n.parent_id IS NOT NULL
                                    UNION ALL
                                    SELECT parent_id, (SELECT parent_id FROM nodes WHERE id = parent_path.parent_id), level + 1
                                    FROM parent_path 
                                    WHERE parent_id IS NOT NULL AND level < 10
                                )
                                SELECT id FROM parent_path
                            )) as path
                    FROM nodes n
                    WHERE n.type = 'note'
                '''
                params = []
                
                if search_query:
                    sql += ' AND (n.name LIKE ? OR n.name LIKE ?)'
                    params.extend([f'%{search_query}%', f'%{search_query}%'])
                
                sql += ' ORDER BY n.name ASC'
                
                cursor = conn.execute(sql, params)
                notes = []
                for row in cursor.fetchall():
                    note_dict = dict(row)
                    # Format path to be more readable
                    if note_dict['path']:
                        note_dict['path'] = note_dict['path']
                    else:
                        note_dict['path'] = 'Root'
                    notes.append(note_dict)
                
                return notes
        except sqlite3.Error as e:
            logging.error(f"Error getting notes for selection: {e}")
            return []

"""
JobsRepository: Handles all job application tracking, events, motivation letters, and scraper configurations.

Tables managed:
- job_offers: Main job applications table
- job_tags: Job-to-tag relationships
- job_events: Timeline events for jobs (interviews, applications, etc.)
- motivation_letters: Cover letters and applications
- job_scraper_configs: Job scraper configurations
- job_scraper_runs: Scraper execution history
- seen_jobs: Job deduplication tracking
- job_provenance: Field extraction metadata
"""

import logging
import sqlite3
import uuid
import json
import os
from datetime import datetime
from typing import Dict, Any, List, Optional
from .base import BaseRepository


class JobsRepository(BaseRepository):
    """Repository for job application management."""

    def __init__(self, db_path: str):
        """
        Initialize the JobsRepository.

        Args:
            db_path: Path to the SQLite database file.
        """
        super().__init__(db_path)
        self.logger = logging.getLogger(__name__)

    # =========================
    # Job CRUD operations
    # =========================

    def create_job(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Create a new job offer.

        Args:
            payload: Job data including position, company, tags, etc.

        Returns:
            The created job with all fields populated, or None if creation failed.
        """
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
            self.logger.error(f"Error creating job: {e}")
            return None

    def update_job(self, job_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Update an existing job offer.

        Args:
            job_id: ID of the job to update.
            patch: Dictionary of fields to update.

        Returns:
            The updated job, or None if update failed.
        """
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
            self.logger.error(f"Error updating job: {e}")
            return None

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single job by ID with all related data (tags, letters).

        Args:
            job_id: ID of the job to retrieve.

        Returns:
            Job dictionary with tagIds and letters, or None if not found.
        """
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
            self.logger.error(f"Error getting job: {e}")
            return None

    def delete_job(self, job_id: str) -> bool:
        """
        Delete a job offer.

        Args:
            job_id: ID of the job to delete.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM job_offers WHERE id = ?', (job_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error deleting job: {e}")
            return False

    def list_jobs(self, filters: Dict[str, Any], limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """
        List jobs with advanced filtering by tags, status, salary, search text, etc.

        Args:
            filters: Dictionary containing optional filters:
                - applied (bool): Filter by application status
                - responded (bool): Filter by response status
                - state (str): Job state filter
                - location (str): Location search (partial match)
                - company (str): Company search (partial match)
                - position (str): Position search (partial match)
                - minSalary (int): Minimum salary filter
                - maxSalary (int): Maximum salary filter
                - q (str): Text search across position/company/description
                - hasLetters (bool): Filter by motivation letter presence
                - anyOf (list): Tag IDs - match any
                - allOf (list): Tag IDs - match all
                - noneOf (list): Tag IDs - exclude these
            limit: Maximum number of results.
            offset: Number of results to skip.

        Returns:
            List of job dictionaries with tags and letters.
        """
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
            self.logger.error(f"Error listing jobs: {e}")
            return []

    def get_tags_for_job(self, job_id: str) -> List[str]:
        """
        Get all tag IDs associated with a job.

        Args:
            job_id: ID of the job.

        Returns:
            List of tag IDs.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT tag_id FROM job_tags WHERE job_id = ?', (job_id,))
                return [r['tag_id'] for r in cur.fetchall()]
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tags for job: {e}")
            return []

    # =========================
    # Motivation Letters
    # =========================

    def add_motivation_letter(self, job_id: str, file_path: str, filename: Optional[str] = None, version: int = 1) -> Optional[Dict[str, Any]]:
        """
        Add a motivation letter for a job.

        Args:
            job_id: ID of the job.
            file_path: Path to the letter file.
            filename: Optional filename (defaults to basename).
            version: Version number of the letter.

        Returns:
            Dictionary with letter metadata, or None if failed.
        """
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
            self.logger.error(f"Error adding motivation letter: {e}")
            return None

    def list_motivation_letters(self, job_id: str) -> List[Dict[str, Any]]:
        """
        Get all motivation letters for a job.

        Args:
            job_id: ID of the job.

        Returns:
            List of letter dictionaries sorted by upload time (newest first).
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT id, filename, file_path, version, uploaded_at FROM motivation_letters WHERE job_id = ? ORDER BY uploaded_at DESC', (job_id,))
                return [dict(r) for r in cur.fetchall()]
        except sqlite3.Error as e:
            self.logger.error(f"Error listing motivation letters: {e}")
            return []

    # =========================
    # Job Events/Timeline
    # =========================

    def list_job_events(self, job_id: str) -> List[Dict[str, Any]]:
        """
        List all timeline events for a job (applications, interviews, responses, etc.).

        Args:
            job_id: ID of the job.

        Returns:
            List of event dictionaries sorted by date.
        """
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
            self.logger.error(f"Error listing job events: {e}")
            return []

    def add_job_event(self, job_id: str, event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Add a timeline event to a job.

        Args:
            job_id: ID of the job.
            event: Event data (type, dt, participants, medium, outcome, notes, attachments).

        Returns:
            The created event, or None if creation failed.
        """
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
            self.logger.error(f"Error adding job event: {e}")
            return None

    def get_job_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single job event by ID.

        Args:
            event_id: ID of the event.

        Returns:
            Event dictionary with parsed attachments, or None if not found.
        """
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
            self.logger.error(f"Error getting job event: {e}")
            return None

    def update_job_event(self, event_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Update a job event.

        Args:
            event_id: ID of the event to update.
            patch: Dictionary of fields to update.

        Returns:
            The updated event, or None if update failed.
        """
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
            self.logger.error(f"Error updating job event: {e}")
            return None

    def delete_job_event(self, event_id: str) -> bool:
        """
        Delete a job event.

        Args:
            event_id: ID of the event to delete.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM job_events WHERE id = ?', (event_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error deleting job event: {e}")
            return False

    # =========================
    # Job Scraper Configurations
    # =========================

    def create_scraper_config(self, config_data: Dict[str, Any]) -> Optional[str]:
        """
        Create a new job scraper configuration.

        Args:
            config_data: Configuration with search terms, locations, filters, etc.

        Returns:
            The config ID, or None if creation failed.
        """
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
            self.logger.error(f"Error creating scraper config: {e}")
            return None

    def get_scraper_configs(self) -> List[Dict[str, Any]]:
        """
        Get all job scraper configurations.

        Returns:
            List of config dictionaries with parsed JSON fields.
        """
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
            self.logger.error(f"Error getting scraper configs: {e}")
            return []

    def update_scraper_config(self, config_id: str, updates: Dict[str, Any]) -> bool:
        """
        Update a job scraper configuration.

        Args:
            config_id: ID of the config to update.
            updates: Dictionary of fields to update.

        Returns:
            True if successful, False otherwise.
        """
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
            self.logger.error(f"Error updating scraper config: {e}")
            return False

    def delete_scraper_config(self, config_id: str) -> bool:
        """
        Delete a job scraper configuration.

        Args:
            config_id: ID of the config to delete.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM job_scraper_configs WHERE id = ?', (config_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error deleting scraper config: {e}")
            return False

    def log_scraper_run(self, config_id: str, stats: Dict[str, Any]) -> Optional[str]:
        """
        Log a job scraper execution run.

        Args:
            config_id: ID of the scraper config that ran.
            stats: Run statistics (status, jobs_fetched, jobs_inserted, etc.).

        Returns:
            Run ID, or None if logging failed.
        """
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
            self.logger.error(f"Error logging scraper run: {e}")
            return None

    def get_scraper_runs_history(self, config_id: str = None, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get scraper run history.

        Args:
            config_id: Optional config ID to filter runs.
            limit: Maximum number of runs to return.

        Returns:
            List of run dictionaries with config names.
        """
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
            self.logger.error(f"Error getting scraper runs history: {e}")
            return []

    # =========================
    # Job Deduplication
    # =========================

    def is_job_seen(self, url: str, title: str, company: str, location: str, date_posted: str) -> Optional[str]:
        """
        Check if a job has been seen before using de-duplication strategy.

        Args:
            url: Job listing URL.
            title: Job title.
            company: Company name.
            location: Job location.
            date_posted: Posting date.

        Returns:
            Existing job ID if duplicate found, None otherwise.
        """
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
            self.logger.error(f"Error checking job duplication: {e}")
            return None

    def mark_job_seen(self, url: str, title: str, company: str, location: str, date_posted: str, job_id: str = None) -> str:
        """
        Mark a job as seen for de-duplication tracking.

        Args:
            url: Job listing URL.
            title: Job title.
            company: Company name.
            location: Job location.
            date_posted: Posting date.
            job_id: Optional associated job ID.

        Returns:
            Seen job ID.
        """
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
            self.logger.error(f"Error marking job as seen: {e}")
            return ""

    def save_job_provenance(self, job_id: str, provenance_data: Dict[str, Dict[str, Any]]):
        """
        Save provenance metadata for job fields (source, confidence, extraction method).

        Args:
            job_id: ID of the job.
            provenance_data: Dictionary mapping field names to provenance metadata.
        """
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
            self.logger.error(f"Error saving job provenance: {e}")

    # =========================
    # Helper Methods
    # =========================

    def _expand_with_parent_tags(self, conn, tag_ids: List[str]) -> List[str]:
        """
        Expand a list of tag IDs to include all parent tags up the hierarchy.

        Args:
            conn: Database connection.
            tag_ids: List of tag IDs to expand.

        Returns:
            Expanded list of tag IDs including parents.
        """
        result = set(tag_ids)
        for tid in tag_ids:
            cursor = conn.execute('SELECT parent_id FROM tags WHERE id = ?', (tid,))
            row = cursor.fetchone()
            if row and row['parent_id']:
                parent_ids = self._expand_with_parent_tags(conn, [row['parent_id']])
                result.update(parent_ids)
        return list(result)


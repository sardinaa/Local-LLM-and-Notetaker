"""Task management repository - owns all task-related data access logic."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from .base import BaseRepository


class TaskRepository(BaseRepository):
    """Repository for task management with independent SQL logic.
    
    Handles tasks, reminders, file attachments, and note references.
    """

    def _expand_with_parent_tags(self, conn, tag_ids: List[str]) -> List[str]:
        """Expand tag IDs to include all parent tags in the hierarchy."""
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

    def create_task(self, task_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a new task with optional tags and reminders.
        
        Args:
            task_data: Dict with fields: title, description, due_date, due_time,
                      priority, status, tag_ids, reminders, etc.
        
        Returns:
            Created task dict with full details or None if failed
        """
        try:
            with self.get_connection() as conn:
                task_id = task_data.get('id') or str(uuid.uuid4())
                
                # Extract main task fields
                fields = [
                    'title', 'description', 'due_date', 'due_time', 'priority',
                    'status', 'section_id', 'repeat_pattern', 'repeat_config', 'parent_task_id',
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
                
                # Handle tags (expand with parent tags automatically)
                tag_ids = task_data.get('tag_ids', []) or task_data.get('tags', [])
                if tag_ids:
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
                
                return self.get_task(task_id)
                
        except Exception as e:
            logging.error(f"Error creating task: {e}")
            return None

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a complete task by ID with tags, reminders, files, and notes.
        
        Args:
            task_id: Task ID to retrieve
            
        Returns:
            Task dict with all related data or None if not found
        """
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
                
                # Add references
                task['references'] = {
                    'files': files,
                    'notes': notes
                }
                task['files'] = files  # Backward compatibility
                
                return task
                
        except Exception as e:
            logging.error(f"Error getting task: {e}")
            return None

    def update_task(self, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a task's fields, tags, or reminders.
        
        Args:
            task_id: Task ID to update
            updates: Dict with fields to update
            
        Returns:
            Updated task dict or None if failed
        """
        try:
            with self.get_connection() as conn:
                # Define allowed fields for direct update
                allowed_fields = {
                    'title', 'description', 'due_date', 'due_time', 'priority',
                    'status', 'repeat_pattern', 'repeat_config', 'parent_task_id',
                    'original_input', 'parsing_confidence', 'section_id'
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
                    conn.execute('DELETE FROM task_tags WHERE task_id = ?', (task_id,))
                    if tag_ids:
                        expanded = self._expand_with_parent_tags(conn, tag_ids)
                        for tag_id in expanded:
                            conn.execute('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)',
                                       (task_id, tag_id))
                            conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tag_id,))
                
                # Handle reminder updates
                if 'reminders' in updates:
                    conn.execute('DELETE FROM task_reminders WHERE task_id = ?', (task_id,))
                    for reminder in updates['reminders']:
                        reminder_id = str(uuid.uuid4())
                        conn.execute('''
                            INSERT INTO task_reminders (id, task_id, reminder_time, message)
                            VALUES (?, ?, ?, ?)
                        ''', (reminder_id, task_id, reminder.get('time'), reminder.get('message')))
                
                return self.get_task(task_id)
                
        except Exception as e:
            logging.error(f"Error updating task: {e}")
            return None

    def delete_task(self, task_id: str) -> bool:
        """Delete a task (CASCADE deletes tags, reminders, files, notes).
        
        Args:
            task_id: Task ID to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
                return True
        except Exception as e:
            logging.error(f"Error deleting task: {e}")
            return False

    def list_tasks(self, filters: Dict[str, Any] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """List tasks with optional filtering, sorting, and pagination.
        
        Supports filters: status, priority, due_today, due_this_week, overdue,
                         q (search), any_tags, all_tags, none_tags
        Supports ordering: order_by, order_dir
        
        Args:
            filters: Dict of filter criteria
            limit: Max number of results
            offset: Pagination offset
            
        Returns:
            List of task dicts with tags and references
        """
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
                
                if order_by == 'due_date':
                    query += ' ORDER BY due_date ASC NULLS LAST, due_time ASC NULLS LAST'
                elif order_by == 'priority':
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
                    
                    # Get tags
                    tag_cursor = conn.execute('''
                        SELECT t.id, t.name, t.color FROM tags t
                        JOIN task_tags tt ON tt.tag_id = t.id
                        WHERE tt.task_id = ?
                        ORDER BY t.name COLLATE NOCASE
                    ''', (task['id'],))
                    task['tags'] = [dict(tag_row) for tag_row in tag_cursor.fetchall()]
                    task['tag_ids'] = [tag['id'] for tag in task['tags']]
                    
                    # Get file references
                    file_cursor = conn.execute('''
                        SELECT * FROM task_files
                        WHERE task_id = ?
                        ORDER BY created_at ASC
                    ''', (task['id'],))
                    task_files = [dict(file_row) for file_row in file_cursor.fetchall()]
                    
                    # Get note references
                    note_cursor = conn.execute('''
                        SELECT tn.*, nodes.name, nodes.id as id, nodes.name as path FROM task_notes tn
                        JOIN nodes ON nodes.id = tn.note_id
                        WHERE tn.task_id = ? AND nodes.type = 'note'
                        ORDER BY tn.created_at ASC
                    ''', (task['id'],))
                    task_notes = [dict(note_row) for note_row in note_cursor.fetchall()]
                    
                    task['references'] = {
                        'files': task_files,
                        'notes': task_notes
                    }
                    
                    tasks.append(task)
                
                return tasks
                
        except Exception as e:
            logging.error(f"Error listing tasks: {e}")
            return []

    def get_task_stats(self) -> Dict[str, Any]:
        """Get task statistics for dashboard/overview.
        
        Returns:
            Dict with counts: by_status, by_priority, due_today, overdue, due_this_week
        """
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
                
                cursor = conn.execute('SELECT COUNT(*) as count FROM tasks WHERE due_date = ?', (today,))
                stats['due_today'] = cursor.fetchone()['count']
                
                cursor = conn.execute('''
                    SELECT COUNT(*) as count FROM tasks
                    WHERE due_date < ? AND status != 'completed'
                ''', (today,))
                stats['overdue'] = cursor.fetchone()['count']
                
                week_end = (datetime.now() + timedelta(days=7-datetime.now().weekday())).strftime('%Y-%m-%d')
                cursor = conn.execute('''
                    SELECT COUNT(*) as count FROM tasks
                    WHERE due_date <= ? AND due_date >= ?
                ''', (week_end, today))
                stats['due_this_week'] = cursor.fetchone()['count']
                
                return stats
                
        except Exception as e:
            logging.error(f"Error getting task stats: {e}")
            return {}

    # File attachment methods
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
        except Exception as e:
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
        except Exception as e:
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
        except Exception as e:
            logging.error(f"Error removing task file: {e}")
            return False

    def get_file_by_id(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get a file record by its ID."""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute('SELECT * FROM task_files WHERE id = ?', (file_id,))
                row = cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logging.error(f"Error getting file by ID: {e}")
            return None

    # Note reference methods
    def add_task_note_references(self, task_id: str, note_ids: List[str]) -> bool:
        """Add note references to a task."""
        try:
            with self.get_connection() as conn:
                for note_id in note_ids:
                    conn.execute('''
                        INSERT OR IGNORE INTO task_notes (task_id, note_id)
                        VALUES (?, ?)
                    ''', (task_id, note_id))
                return True
        except Exception as e:
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
        except Exception as e:
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
        except Exception as e:
            logging.error(f"Error removing task note reference: {e}")
            return False

    # Helper methods for task service (tags)
    def list_tags(self, q: Optional[str] = None, limit: int = 50, 
                 include_usage: bool = False, parent_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List tags (delegated for task NLP parsing)."""
        # This is a cross-domain query - might need refactoring later
        # For now, keep minimal implementation
        try:
            with self.get_connection() as conn:
                if q:
                    cursor = conn.execute('''
                        SELECT * FROM tags 
                        WHERE name LIKE ? 
                        ORDER BY name COLLATE NOCASE LIMIT ?
                    ''', (f'%{q}%', limit))
                else:
                    cursor = conn.execute('''
                        SELECT * FROM tags 
                        ORDER BY name COLLATE NOCASE LIMIT ?
                    ''', (limit,))
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logging.error(f"Error listing tags: {e}")
            return []

    def create_tag(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a tag (delegated for task NLP parsing)."""
        # Minimal implementation for task service
        try:
            tag_id = payload.get('id') or str(uuid.uuid4())
            name = payload.get('name', '')
            with self.get_connection() as conn:
                conn.execute('''
                    INSERT INTO tags (id, name)
                    VALUES (?, ?)
                ''', (tag_id, name))
                return {'id': tag_id, 'name': name}
        except Exception as e:
            logging.error(f"Error creating tag: {e}")
            return None


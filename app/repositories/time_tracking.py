"""Time tracking repository - owns all time tracking data access logic."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from .base import BaseRepository


class TimeTrackingRepository(BaseRepository):
    """Repository for time tracking activities and entries with independent SQL logic."""

    def upsert_activity(self, name: str, color: Optional[str] = None, 
                       tag_id: Optional[str] = None) -> Dict[str, Any]:
        """Create or update a time tracking activity.
        
        If an activity with the same name exists, update it.
        Otherwise, create a new one.
        
        Args:
            name: Activity name (case-insensitive for matching)
            color: Optional color code for the activity
            tag_id: Optional tag association
            
        Returns:
            Activity dict with id, name, color, tag_id
        """
        try:
            with self.get_connection() as conn:
                # Try to find existing activity by name (case-insensitive)
                cur = conn.execute(
                    'SELECT * FROM time_activities WHERE lower(name) = lower(?)',
                    (name.strip(),)
                )
                row = cur.fetchone()
                
                if row:
                    # Update existing activity
                    aid = row['id']
                    conn.execute('''
                        UPDATE time_activities 
                        SET color = COALESCE(?, color), 
                            tag_id = COALESCE(?, tag_id) 
                        WHERE id = ?
                    ''', (color, tag_id, aid))
                    
                    cur = conn.execute('SELECT * FROM time_activities WHERE id = ?', (aid,))
                    return dict(cur.fetchone())
                
                # Create new activity
                aid = uuid.uuid4().hex
                conn.execute('''
                    INSERT INTO time_activities (id, name, color, tag_id) 
                    VALUES (?, ?, ?, ?)
                ''', (aid, name.strip(), color, tag_id))
                
                return {
                    'id': aid,
                    'name': name.strip(),
                    'color': color,
                    'tag_id': tag_id
                }
        except Exception as e:
            logging.error(f"Error upserting activity: {e}")
            return {}

    def list_activities(self) -> List[Dict[str, Any]]:
        """List all time tracking activities sorted by name.
        
        Returns:
            List of activity dicts
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute(
                    'SELECT * FROM time_activities ORDER BY name COLLATE NOCASE'
                )
                return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logging.error(f"Error listing activities: {e}")
            return []

    def start_time_entry(self, activity_id: str, start_time: Optional[str] = None,
                        note_id: Optional[str] = None, description: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Start a new time entry for an activity.
        
        Args:
            activity_id: ID of the activity to track time for
            start_time: Start timestamp (ISO format), defaults to now
            note_id: Optional note reference
            description: Optional description
            
        Returns:
            Created time entry dict or None if failed
        """
        try:
            with self.get_connection() as conn:
                entry_id = uuid.uuid4().hex
                start_ts = start_time or datetime.now().isoformat(sep=' ', timespec='seconds')
                
                conn.execute('''
                    INSERT INTO time_entries (id, activity_id, start_time, end_time, note_id, description)
                    VALUES (?, ?, ?, NULL, ?, ?)
                ''', (entry_id, activity_id, start_ts, note_id, description))
                
                return self.get_time_entry(entry_id)
        except Exception as e:
            logging.error(f"Error starting time entry: {e}")
            return None

    def stop_time_entry(self, entry_id: str, end_time: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Stop a running time entry.
        
        Args:
            entry_id: ID of the time entry to stop
            end_time: End timestamp (ISO format), defaults to now
            
        Returns:
            Updated time entry dict or None if failed
        """
        try:
            with self.get_connection() as conn:
                end_ts = end_time or datetime.now().isoformat(sep=' ', timespec='seconds')
                conn.execute(
                    'UPDATE time_entries SET end_time = ? WHERE id = ?',
                    (end_ts, entry_id)
                )
                return self.get_time_entry(entry_id)
        except Exception as e:
            logging.error(f"Error stopping time entry: {e}")
            return None

    def update_time_entry(self, entry_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a time entry's fields.
        
        Args:
            entry_id: ID of the time entry to update
            patch: Dict with fields to update (activity_id, start_time, end_time, note_id, description)
            
        Returns:
            Updated time entry dict or None if failed
        """
        try:
            with self.get_connection() as conn:
                allowed = {'activity_id', 'start_time', 'end_time', 'note_id', 'description'}
                updates = []
                vals: List[Any] = []
                
                for k, v in patch.items():
                    if k in allowed:
                        updates.append(f"{k} = ?")
                        vals.append(v)
                
                if updates:
                    vals.append(entry_id)
                    conn.execute(
                        f"UPDATE time_entries SET {', '.join(updates)} WHERE id = ?",
                        vals
                    )
                
                return self.get_time_entry(entry_id)
        except Exception as e:
            logging.error(f"Error updating time entry: {e}")
            return None

    def get_time_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        """Get a single time entry by ID.
        
        Args:
            entry_id: ID of the time entry to retrieve
            
        Returns:
            Time entry dict or None if not found
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM time_entries WHERE id = ?', (entry_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logging.error(f"Error getting time entry: {e}")
            return None

    def list_time_entries(self, start: Optional[str] = None, end: Optional[str] = None,
                         day: Optional[str] = None) -> List[Dict[str, Any]]:
        """List time entries with optional date filtering.
        
        Args:
            start: Start datetime filter (ISO format)
            end: End datetime filter (ISO format)
            day: Specific day filter (YYYY-MM-DD format), takes precedence over start/end
            
        Returns:
            List of time entry dicts sorted by start time
        """
        try:
            with self.get_connection() as conn:
                where: List[str] = []
                params: List[Any] = []
                
                if day:
                    # Filter by specific day
                    where.append('date(start_time) = date(?)')
                    params.append(day)
                else:
                    # Filter by date range
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
        except Exception as e:
            logging.error(f"Error listing time entries: {e}")
            return []

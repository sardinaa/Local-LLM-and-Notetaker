"""Calendar events repository - owns all calendar data access logic."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from .base import BaseRepository


class CalendarRepository(BaseRepository):
    """Repository for calendar events with independent SQL logic."""

    def create_event(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a new calendar event.
        
        Args:
            payload: Event data (title, start, end, allDay, category, color, description)
            
        Returns:
            Created event dict or None if failed
        """
        try:
            with self.get_connection() as conn:
                ev_id = payload.get('id') or uuid.uuid4().hex
                title = payload.get('title') or ''
                start_ts = payload.get('start') or payload.get('start_ts')
                end_ts = payload.get('end') or payload.get('end_ts')
                
                if not title or not start_ts or not end_ts:
                    logging.warning("Calendar event missing required fields")
                    return None
                
                all_day = 1 if payload.get('allDay') or payload.get('all_day') else 0
                category = payload.get('category')
                color = payload.get('color')
                description = payload.get('description')
                
                conn.execute('''
                    INSERT INTO calendar_events (id, title, start_ts, end_ts, all_day, category, color, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (ev_id, title, start_ts, end_ts, all_day, category, color, description))
                
                return self.get_event(ev_id)
        except Exception as e:
            logging.error(f"Error creating calendar event: {e}")
            return None

    def update_event(self, event_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing calendar event.
        
        Args:
            event_id: Event ID to update
            patch: Fields to update
            
        Returns:
            Updated event dict or None if failed
        """
        try:
            with self.get_connection() as conn:
                allowed = {'title', 'start', 'end', 'start_ts', 'end_ts', 
                          'allDay', 'all_day', 'category', 'color', 'description'}
                updates: List[str] = []
                vals: List[Any] = []
                
                for k, v in patch.items():
                    if k not in allowed:
                        continue
                    if k in ('start', 'start_ts'):
                        updates.append('start_ts = ?')
                        vals.append(v)
                    elif k in ('end', 'end_ts'):
                        updates.append('end_ts = ?')
                        vals.append(v)
                    elif k in ('allDay', 'all_day'):
                        updates.append('all_day = ?')
                        vals.append(1 if v else 0)
                    else:
                        updates.append(f"{k} = ?")
                        vals.append(v)
                
                if not updates:
                    return self.get_event(event_id)
                
                vals.append(event_id)
                conn.execute(f"UPDATE calendar_events SET {', '.join(updates)} WHERE id = ?", vals)
                
                return self.get_event(event_id)
        except Exception as e:
            logging.error(f"Error updating calendar event: {e}")
            return None

    def delete_event(self, event_id: str) -> bool:
        """Delete a calendar event.
        
        Args:
            event_id: Event ID to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM calendar_events WHERE id = ?', (event_id,))
                return True
        except Exception as e:
            logging.error(f"Error deleting calendar event: {e}")
            return False

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Get a single calendar event by ID.
        
        Args:
            event_id: Event ID to retrieve
            
        Returns:
            Event dict or None if not found
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM calendar_events WHERE id = ?', (event_id,))
                row = cur.fetchone()
                if not row:
                    return None
                
                ev = dict(row)
                # Normalize to camelCase for API consistency
                ev['allDay'] = bool(ev.get('all_day'))
                return ev
        except Exception as e:
            logging.error(f"Error getting calendar event: {e}")
            return None

    def list_events(self, start: Optional[str] = None, end: Optional[str] = None) -> List[Dict[str, Any]]:
        """List calendar events with optional date range filtering.
        
        Overlap condition: event.end >= start AND event.start <= end.
        If only start is provided, returns events with end >= start.
        If only end is provided, returns events with start <= end.
        Without bounds, returns recent events ordered by start.
        
        Args:
            start: Start datetime filter (ISO format)
            end: End datetime filter (ISO format)
            
        Returns:
            List of event dicts
        """
        try:
            with self.get_connection() as conn:
                where: List[str] = []
                params: List[Any] = []
                
                if start and end:
                    where.append('(end_ts >= ? AND start_ts <= ?)')
                    params.extend([start, end])
                elif start:
                    where.append('(end_ts >= ?)')
                    params.append(start)
                elif end:
                    where.append('(start_ts <= ?)')
                    params.append(end)
                
                sql = 'SELECT * FROM calendar_events'
                if where:
                    sql += ' WHERE ' + ' AND '.join(where)
                sql += ' ORDER BY start_ts ASC'
                
                cur = conn.execute(sql, params)
                rows = [dict(r) for r in cur.fetchall()]
                
                # Normalize to camelCase for API consistency
                for ev in rows:
                    ev['allDay'] = bool(ev.get('all_day'))
                
                return rows
        except Exception as e:
            logging.error(f"Error listing calendar events: {e}")
            return []

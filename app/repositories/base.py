"""Base repository with shared database connection logic."""

import sqlite3
import logging
from typing import Optional
from contextlib import contextmanager


class BaseRepository:
    """Base class for all repositories providing database connection management."""
    
    def __init__(self, db_path: str = "data/db/notetaker.db"):
        """Initialize repository with database path.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
    
    @contextmanager
    def get_connection(self):
        """Context manager for database connections with proper configuration.
        
        Yields:
            sqlite3.Connection: Configured database connection
            
        Example:
            with self.get_connection() as conn:
                cursor = conn.execute("SELECT * FROM table")
        """
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row  # Enable dict-like access to rows
            conn.execute("PRAGMA foreign_keys = ON")  # Enable foreign key constraints
            yield conn
            conn.commit()
        except sqlite3.Error as e:
            if conn:
                conn.rollback()
            logging.error(f"Database error: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    def execute_query(self, query: str, params: tuple = ()) -> list:
        """Execute a SELECT query and return results as list of dicts.
        
        Args:
            query: SQL SELECT statement
            params: Query parameters (use ? placeholders)
            
        Returns:
            List of row dictionaries
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.execute(query, params)
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Query error: {e}")
            return []
    
    def execute_one(self, query: str, params: tuple = ()) -> Optional[dict]:
        """Execute a SELECT query and return first result as dict.
        
        Args:
            query: SQL SELECT statement
            params: Query parameters (use ? placeholders)
            
        Returns:
            Row dictionary or None if no results
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.execute(query, params)
                row = cursor.fetchone()
                return dict(row) if row else None
        except sqlite3.Error as e:
            logging.error(f"Query error: {e}")
            return None
    
    def execute_write(self, query: str, params: tuple = ()) -> bool:
        """Execute an INSERT/UPDATE/DELETE query.
        
        Args:
            query: SQL INSERT/UPDATE/DELETE statement
            params: Query parameters (use ? placeholders)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.get_connection() as conn:
                conn.execute(query, params)
                return True
        except sqlite3.Error as e:
            logging.error(f"Write error: {e}")
            return False
    
    def execute_write_return_id(self, query: str, params: tuple = ()) -> Optional[str]:
        """Execute an INSERT query and return the last inserted row ID.
        
        Args:
            query: SQL INSERT statement
            params: Query parameters (use ? placeholders)
            
        Returns:
            Last inserted row ID or None if failed
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.execute(query, params)
                return cursor.lastrowid
        except sqlite3.Error as e:
            logging.error(f"Write error: {e}")
            return None

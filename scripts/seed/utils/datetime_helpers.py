"""Date and time utility functions for seed data."""

from datetime import datetime, timedelta


def days_ago(days: int) -> datetime:
    """Return a datetime N days ago."""
    return datetime.utcnow() - timedelta(days=days)


def hours_ago(hours: int) -> datetime:
    """Return a datetime N hours ago."""
    return datetime.utcnow() - timedelta(hours=hours)


def minutes_ago(minutes: int) -> datetime:
    """Return a datetime N minutes ago."""
    return datetime.utcnow() - timedelta(minutes=minutes)


def format_iso(dt: datetime) -> str:
    """Format datetime as ISO string."""
    return dt.isoformat()


def timestamp_ms(dt: datetime = None) -> int:
    """Get timestamp in milliseconds."""
    if dt is None:
        dt = datetime.utcnow()
    return int(dt.timestamp() * 1000)

"""Task and calendar event loading."""

from pathlib import Path
from typing import Union
from .json_loader import load_json


def load_tasks(db, file_path: Union[str, Path]):
    """
    Load tasks from JSON.
    
    Args:
        db: DataService instance (from app.core.data_service)
        file_path: Path to tasks.json file
        
    Expected JSON format (either):
    1. Direct array: [{"id": "task-1", ...}, {"id": "task-2", ...}]
    2. Wrapped object: {"tasks": [{"id": "task-1", ...}]}
    """
    print(f"Loading tasks from {file_path}...")
    data = load_json(file_path)
    
    task_count = 0
    
    # Handle both array format and wrapped format
    tasks = data if isinstance(data, list) else data.get('tasks', [])
    
    for task in tasks:
        try:
            db.task_repo.create_task(task)
            task_count += 1
        except Exception as e:
            print(f"  ✗ Error creating task {task.get('id', 'unknown')}: {e}")
    
    print(f"  ✓ Created {task_count} tasks")
    return task_count


def load_calendar_events(db, file_path: Union[str, Path]):
    """
    Load calendar events from JSON.
    
    Args:
        db: DataService instance (from app.core.data_service)
        file_path: Path to calendar_events.json file
        
    Expected JSON format (either):
    1. Direct array: [{"id": "event-1", ...}, {"id": "event-2", ...}]
    2. Wrapped object: {"calendar_events": [{"id": "event-1", ...}]}
    """
    print(f"Loading calendar events from {file_path}...")
    data = load_json(file_path)
    
    event_count = 0
    
    # Handle both array format and wrapped format
    events = data if isinstance(data, list) else data.get('calendar_events', [])
    
    for event in events:
        try:
            db.calendar_repo.create_event(event)
            event_count += 1
        except Exception as e:
            print(f"  ✗ Error creating event {event.get('id', 'unknown')}: {e}")
    
    print(f"  ✓ Created {event_count} calendar events")
    return event_count

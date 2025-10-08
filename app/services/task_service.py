"""
Task Management Service

Service layer for managing tasks with NLP parsing and business logic.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import uuid

from .task_nlp_parser import TaskNLPParser
from app.core.database import DatabaseManager
from app.repositories.tasks import TaskRepository

logger = logging.getLogger(__name__)

class TaskService:
    def __init__(self, db_manager: DatabaseManager):
        """Initialize the task service."""
        self.db = db_manager
        self.task_repo = TaskRepository(db_manager.db_path)
        self.nlp_parser = TaskNLPParser()
    
    def quick_create_task(self, text_input: str, auto_save: bool = True) -> Dict[str, Any]:
        """
        Create a task from natural language input using NLP parsing.
        
        Args:
            text_input: Natural language task description
            auto_save: Whether to automatically save the task
            
        Returns:
            Dictionary with parsed task data and creation result
        """
        try:
            # Parse the input
            parsed_result = self.nlp_parser.parse(text_input)
            
            # Prepare task data
            task_data = {
                'title': parsed_result.get('title', ''),
                'original_input': text_input,
                'parsing_confidence': parsed_result.get('confidence', 0.0),
                'status': 'pending'
            }
            
            # Set due date and time
            if parsed_result.get('date'):
                if 'T' in parsed_result['date']:
                    # Date includes time
                    task_data['due_date'] = parsed_result['date'].split('T')[0]
                    task_data['due_time'] = parsed_result['date'].split('T')[1]
                else:
                    # Date only
                    task_data['due_date'] = parsed_result['date']
            
            if parsed_result.get('time') and not task_data.get('due_time'):
                task_data['due_time'] = parsed_result['time']
            
            # Set priority
            if parsed_result.get('priority'):
                task_data['priority'] = parsed_result['priority']
            
            # Set repeat pattern
            if parsed_result.get('repeat'):
                task_data['repeat_pattern'] = parsed_result['repeat']
                task_data['repeat_config'] = self._build_repeat_config(parsed_result['repeat'])
            
            # Handle tags - create if they don't exist
            tag_ids = []
            if parsed_result.get('tags'):
                for tag_name in parsed_result['tags']:
                    tag = self._ensure_tag_exists(tag_name)
                    if tag:
                        tag_ids.append(tag['id'])
            
            task_data['tag_ids'] = tag_ids
            
            # Create task if auto_save is enabled
            created_task = None
            if auto_save:
                created_task = self.task_repo.create_task(task_data)
                if created_task:
                    logger.info(f"Created task: {created_task['id']} - {created_task['title']}")
            
            return {
                'parsed': parsed_result,
                'task_data': task_data,
                'created_task': created_task,
                'preview': self.nlp_parser.format_for_display(parsed_result),
                'success': created_task is not None if auto_save else True
            }
            
        except Exception as e:
            logger.error(f"Error in quick_create_task: {e}")
            return {
                'parsed': {'title': text_input, 'confidence': 0.1},
                'task_data': {'title': text_input, 'original_input': text_input},
                'created_task': None,
                'preview': text_input,
                'success': False,
                'error': str(e)
            }
    
    def _ensure_tag_exists(self, tag_name: str) -> Optional[Dict[str, Any]]:
        """Ensure a tag exists, create if it doesn't."""
        try:
            # Try to find existing tag
            tags = self.db.list_tags(q=tag_name, limit=1)
            if tags:
                for tag in tags:
                    if tag['name'].lower() == tag_name.lower():
                        return tag
            
            # Create new tag
            new_tag = self.db.create_tag({
                'name': tag_name,
                'color': 'default'
            })
            
            return new_tag
            
        except Exception as e:
            logger.error(f"Error ensuring tag exists: {e}")
            return None
    
    def _build_repeat_config(self, repeat_pattern: str) -> Dict[str, Any]:
        """Build repeat configuration from pattern."""
        config = {
            'pattern': repeat_pattern,
            'enabled': True
        }
        
        if repeat_pattern == 'daily':
            config.update({
                'frequency': 'daily',
                'interval': 1
            })
        elif repeat_pattern == 'weekly':
            config.update({
                'frequency': 'weekly',
                'interval': 1
            })
        elif repeat_pattern.startswith('weekly_'):
            # weekly_monday, weekly_tuesday, etc.
            day_name = repeat_pattern.split('_')[1]
            config.update({
                'frequency': 'weekly',
                'interval': 1,
                'day_of_week': day_name
            })
        elif repeat_pattern == 'monthly':
            config.update({
                'frequency': 'monthly',
                'interval': 1
            })
        elif repeat_pattern == 'yearly':
            config.update({
                'frequency': 'yearly',
                'interval': 1
            })
        
        return config
    
    def create_task(self, task_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a task with validation."""
        try:
            # Validate required fields
            if not task_data.get('title'):
                raise ValueError("Task title is required")
            
            # Set defaults
            task_data.setdefault('status', 'pending')
            task_data.setdefault('parsing_confidence', 1.0)  # Manual creation gets full confidence
            
            # Generate ID if not provided
            if not task_data.get('id'):
                task_data['id'] = str(uuid.uuid4())
            
            return self.task_repo.create_task(task_data)
            
        except Exception as e:
            logger.error(f"Error creating task: {e}")
            return None
    
    def update_task(self, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a task."""
        try:
            # Handle tags field - convert tag names to tag IDs
            if 'tags' in updates and isinstance(updates['tags'], list):
                tag_ids = []
                for tag_name in updates['tags']:
                    if isinstance(tag_name, str):
                        # Ensure tag exists and get its ID
                        tag = self._ensure_tag_exists(tag_name)
                        if tag:
                            tag_ids.append(tag['id'])
                    else:
                        # Assume it's already a tag ID
                        tag_ids.append(tag_name)
                
                # Replace with tag IDs
                updates['tag_ids'] = tag_ids
                # Remove the tags field to avoid confusion
                del updates['tags']
            
            return self.task_repo.update_task(task_id, updates)
        except Exception as e:
            logger.error(f"Error updating task: {e}")
            return None
    
    def delete_task(self, task_id: str) -> bool:
        """Delete a task."""
        try:
            return self.task_repo.delete_task(task_id)
        except Exception as e:
            logger.error(f"Error deleting task: {e}")
            return False
    
    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a task by ID."""
        try:
            return self.task_repo.get_task(task_id)
        except Exception as e:
            logger.error(f"Error getting task: {e}")
            return None
    
    def list_tasks(self, filters: Dict[str, Any] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """List tasks with filters."""
        try:
            return self.task_repo.list_tasks(filters or {}, limit, offset)
        except Exception as e:
            logger.error(f"Error listing tasks: {e}")
            return []
    
    def get_task_stats(self) -> Dict[str, Any]:
        """Get task statistics."""
        try:
            return self.task_repo.get_task_stats()
        except Exception as e:
            logger.error(f"Error getting task stats: {e}")
            return {}
    
    def mark_task_complete(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Mark a task as complete."""
        try:
            return self.task_repo.update_task(task_id, {
                'status': 'completed',
                'completed_at': datetime.now().isoformat()
            })
        except Exception as e:
            logger.error(f"Error marking task complete: {e}")
            return None
    
    def get_today_tasks(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get tasks due today, grouped by time periods."""
        try:
            today = datetime.now().date()
            today_str = today.strftime('%Y-%m-%d')
            
            # Get all tasks due today
            today_tasks = self.task_repo.list_tasks({'status': ['pending', 'in_progress']}, limit=200)
            
            # Also get overdue tasks
            overdue_tasks = self.task_repo.list_tasks({'overdue': True, 'status': ['pending', 'in_progress']}, limit=50)
            
            # Filter tasks due today
            tasks_due_today = []
            for task in today_tasks:
                if task.get('due_date'):
                    # Handle different date formats
                    due_date_str = task['due_date']
                    if 'T' in due_date_str:  # ISO format with time
                        due_date = datetime.fromisoformat(due_date_str.replace('Z', '+00:00')).date()
                    else:  # Simple date format
                        due_date = datetime.strptime(due_date_str[:10], '%Y-%m-%d').date()
                    
                    if due_date == today:
                        tasks_due_today.append(task)
            
            # Group tasks by time periods
            groups = {
                'overdue': [],
                'morning': [],    # Tasks with time before 12:00
                'afternoon': [],  # Tasks with time 12:00-18:00
                'evening': [],    # Tasks with time after 18:00
                'all_day': []     # Tasks without specific time
            }
            
            # Add overdue tasks
            groups['overdue'] = overdue_tasks
            
            # Categorize today's tasks by time
            for task in tasks_due_today:
                due_time = task.get('due_time')
                if not due_time:
                    groups['all_day'].append(task)
                else:
                    try:
                        time_obj = datetime.strptime(due_time, '%H:%M:%S').time()
                        hour = time_obj.hour
                        
                        if hour < 12:
                            groups['morning'].append(task)
                        elif hour < 18:
                            groups['afternoon'].append(task)
                        else:
                            groups['evening'].append(task)
                    except ValueError:
                        groups['all_day'].append(task)
            
            return groups
            
        except Exception as e:
            logger.error(f"Error getting today's tasks: {e}")
            return {
                'overdue': [],
                'morning': [],
                'afternoon': [],
                'evening': [],
                'all_day': []
            }
    
    def get_overdue_tasks(self) -> List[Dict[str, Any]]:
        """Get overdue tasks."""
        try:
            return self.task_repo.list_tasks({'overdue': True}, limit=50)
        except Exception as e:
            logger.error(f"Error getting overdue tasks: {e}")
            return []
    
    def search_tasks(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search tasks by text."""
        try:
            return self.task_repo.list_tasks({'q': query}, limit=limit)
        except Exception as e:
            logger.error(f"Error searching tasks: {e}")
            return []
    
    def get_tasks_by_tag(self, tag_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get tasks by tag."""
        try:
            return self.task_repo.list_tasks({'any_tags': [tag_id]}, limit=limit)
        except Exception as e:
            logger.error(f"Error getting tasks by tag: {e}")
            return []
    
    def get_next_7_days_tasks(self) -> List[Dict[str, Any]]:
        """Get tasks due within the next 7 days (including today)."""
        try:
            today = datetime.now().date()
            end_date = (today + timedelta(days=7)).strftime('%Y-%m-%d')
            today_str = today.strftime('%Y-%m-%d')
            
            all_tasks = self.task_repo.list_tasks({'status': ['pending', 'in_progress']}, limit=200)
            filtered_tasks = []
            
            for task in all_tasks:
                if task.get('due_date'):
                    task_date = task['due_date'][:10]  # Extract YYYY-MM-DD
                    if today_str <= task_date <= end_date:
                        filtered_tasks.append(task)
            
            return filtered_tasks
        except Exception as e:
            logger.error(f"Error getting next 7 days tasks: {e}")
            return []
    
    def get_inbox_tasks(self) -> List[Dict[str, Any]]:
        """Get tasks without any tags (inbox - unfiled tasks)."""
        try:
            all_tasks = self.task_repo.list_tasks({'status': ['pending', 'in_progress']}, limit=200)
            inbox_tasks = []
            
            for task in all_tasks:
                # Task is in inbox if it has no tags
                if not task.get('tags') or len(task.get('tags', [])) == 0:
                    inbox_tasks.append(task)
            
            return inbox_tasks
        except Exception as e:
            logger.error(f"Error getting inbox tasks: {e}")
            return []
    
    def get_tasks_by_urgency_importance(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get tasks categorized by Eisenhower Matrix (urgency/importance)."""
        try:
            all_tasks = self.task_repo.list_tasks({'status': ['pending', 'in_progress']}, limit=200)
            today = datetime.now().date()
            
            logger.debug(f"Eisenhower Matrix: Found {len(all_tasks)} tasks with status pending/in_progress")
            logger.debug(f"Today's date: {today}")
            
            # Debug: Show all task statuses
            for task in all_tasks[:5]:  # Show first 5 tasks
                logger.debug(f"Sample task: '{task.get('title')}' - status: '{task.get('status')}', priority: '{task.get('priority')}', due_date: '{task.get('due_date')}'")
            
            quadrants = {
                'urgent_important': [],     # Q1: Do First
                'not_urgent_important': [], # Q2: Schedule  
                'urgent_not_important': [], # Q3: Delegate
                'not_urgent_not_important': [] # Q4: Eliminate
            }
            
            for task in all_tasks:
                is_urgent = self._is_task_urgent(task, today)
                is_important = self._is_task_important(task)
                
                logger.debug(f"Task '{task.get('title', 'No title')}': priority='{task.get('priority')}', due_date='{task.get('due_date')}', urgent={is_urgent}, important={is_important}")
                
                if is_urgent and is_important:
                    quadrants['urgent_important'].append(task)
                elif not is_urgent and is_important:
                    quadrants['not_urgent_important'].append(task)
                elif is_urgent and not is_important:
                    quadrants['urgent_not_important'].append(task)
                else:
                    quadrants['not_urgent_not_important'].append(task)
            
            logger.debug(f"Eisenhower Matrix results: Q1={len(quadrants['urgent_important'])}, Q2={len(quadrants['not_urgent_important'])}, Q3={len(quadrants['urgent_not_important'])}, Q4={len(quadrants['not_urgent_not_important'])}")
            return quadrants
        except Exception as e:
            logger.error(f"Error getting tasks by urgency/importance: {e}")
            return {
                'urgent_important': [],
                'not_urgent_important': [],
                'urgent_not_important': [],
                'not_urgent_not_important': []
            }
    
    def _is_task_urgent(self, task: Dict[str, Any], today) -> bool:
        """Determine if a task is urgent (due today or overdue)."""
        if not task.get('due_date'):
            return False
        
        try:
            task_date = datetime.strptime(task['due_date'][:10], '%Y-%m-%d').date()
            return task_date <= today
        except Exception:
            return False
    
    def _is_task_important(self, task: Dict[str, Any]) -> bool:
        """Determine if a task is important (high priority)."""
        priority = task.get('priority') or ''
        return priority.lower() in ['alta', 'urgente', 'high', 'urgent', 'h', '!']
    
    def get_task_counts_by_view(self) -> Dict[str, int]:
        """Get task counts for each view for sidebar badges."""
        try:
            today_tasks = self.get_today_tasks()
            next_7_tasks = self.get_next_7_days_tasks()
            inbox_tasks = self.get_inbox_tasks()
            eisenhower_tasks = self.get_tasks_by_urgency_importance()
            
            # Get all tags and their task counts
            all_tasks = self.task_repo.list_tasks({'status': ['pending', 'in_progress']}, limit=500)
            tag_counts = {}
            
            for task in all_tasks:
                for tag in task.get('tags', []):
                    tag_name = tag.get('name') if isinstance(tag, dict) else str(tag)
                    tag_counts[tag_name] = tag_counts.get(tag_name, 0) + 1
            
            return {
                'today': len(today_tasks),
                'next_7_days': len(next_7_tasks),
                'inbox': len(inbox_tasks),
                'eisenhower': {
                    'urgent_important': len(eisenhower_tasks['urgent_important']),
                    'not_urgent_important': len(eisenhower_tasks['not_urgent_important']),
                    'urgent_not_important': len(eisenhower_tasks['urgent_not_important']),
                    'not_urgent_not_important': len(eisenhower_tasks['not_urgent_not_important']),
                    'total': sum(len(quadrant) for quadrant in eisenhower_tasks.values())
                },
                'tags': tag_counts
            }
        except Exception as e:
            logger.error(f"Error getting task counts: {e}")
            return {
                'today': 0,
                'next_7_days': 0,
                'inbox': 0,
                'eisenhower': {'urgent_important': 0, 'not_urgent_important': 0, 'urgent_not_important': 0, 'not_urgent_not_important': 0, 'total': 0},
                'tags': {}
            }
    
    def generate_recurring_tasks(self, days_ahead: int = 7) -> Dict[str, Any]:
        """Generate recurring tasks for the next N days."""
        try:
            # Get tasks with repeat patterns
            tasks_with_repeats = self.task_repo.list_tasks({
                'status': ['pending', 'in_progress'],
                'order_by': 'created_at'
            }, limit=1000)
            
            created_count = 0
            skipped_count = 0
            
            for task in tasks_with_repeats:
                if not task.get('repeat_pattern'):
                    continue
                
                try:
                    # Generate instances for this task
                    instances = self._generate_task_instances(task, days_ahead)
                    for instance in instances:
                        # Check if task already exists for this date
                        existing = self.task_repo.list_tasks({
                            'due_date': instance['due_date'],
                            'all_tags': task.get('tag_ids', []),
                            'q': task['title']
                        }, limit=1)
                        
                        if not existing:
                            created_task = self.task_repo.create_task(instance)
                            if created_task:
                                created_count += 1
                                logger.info(f"Created recurring task: {created_task['title']} for {instance['due_date']}")
                        else:
                            skipped_count += 1
                
                except Exception as e:
                    logger.error(f"Error generating instances for task {task['id']}: {e}")
                    continue
            
            return {
                'created': created_count,
                'skipped': skipped_count,
                'success': True
            }
            
        except Exception as e:
            logger.error(f"Error generating recurring tasks: {e}")
            return {
                'created': 0,
                'skipped': 0,
                'success': False,
                'error': str(e)
            }
    
    def _generate_task_instances(self, base_task: Dict[str, Any], days_ahead: int) -> List[Dict[str, Any]]:
        """Generate recurring task instances."""
        instances = []
        repeat_config = base_task.get('repeat_config', {})
        
        if not repeat_config or not repeat_config.get('enabled'):
            return instances
        
        start_date = datetime.now()
        if base_task.get('due_date'):
            try:
                start_date = datetime.fromisoformat(base_task['due_date'])
            except:
                pass
        
        frequency = repeat_config.get('frequency', 'daily')
        interval = repeat_config.get('interval', 1)
        
        current_date = start_date
        end_date = start_date + timedelta(days=days_ahead)
        
        while current_date <= end_date:
            if frequency == 'daily':
                next_date = current_date + timedelta(days=interval)
            elif frequency == 'weekly':
                day_of_week = repeat_config.get('day_of_week')
                if day_of_week:
                    # Find next occurrence of specific day
                    next_date = self._get_next_weekday(current_date, day_of_week)
                else:
                    next_date = current_date + timedelta(weeks=interval)
            elif frequency == 'monthly':
                # Simple monthly increment (same day next month)
                if current_date.month == 12:
                    next_date = current_date.replace(year=current_date.year + 1, month=1)
                else:
                    next_date = current_date.replace(month=current_date.month + interval)
            elif frequency == 'yearly':
                next_date = current_date.replace(year=current_date.year + interval)
            else:
                break
            
            # Skip the base task date
            if current_date != start_date:
                instance = {
                    'title': base_task['title'],
                    'description': base_task.get('description'),
                    'due_date': current_date.strftime('%Y-%m-%d'),
                    'due_time': base_task.get('due_time'),
                    'priority': base_task.get('priority'),
                    'status': 'pending',
                    'parent_task_id': base_task['id'],
                    'tag_ids': base_task.get('tag_ids', []),
                    'original_input': f"Generated from: {base_task.get('original_input', base_task['title'])}",
                    'parsing_confidence': 1.0
                }
                instances.append(instance)
            
            current_date = next_date
        
        return instances
    
    def _get_next_weekday(self, from_date: datetime, weekday: str) -> datetime:
        """Get next occurrence of specific weekday."""
        weekdays = {
            'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
            'friday': 4, 'saturday': 5, 'sunday': 6
        }
        
        target_weekday = weekdays.get(weekday.lower())
        if target_weekday is None:
            return from_date + timedelta(days=7)
        
        current_weekday = from_date.weekday()
        days_ahead = target_weekday - current_weekday
        
        if days_ahead <= 0:
            days_ahead += 7
        
        return from_date + timedelta(days=days_ahead)
    
    def parse_text_preview(self, text_input: str) -> Dict[str, Any]:
        """Parse text and return preview without saving."""
        try:
            parsed_result = self.nlp_parser.parse(text_input)
            return {
                'parsed': parsed_result,
                'preview': self.nlp_parser.format_for_display(parsed_result),
                'confidence': parsed_result.get('confidence', 0.0),
                'success': True
            }
        except Exception as e:
            logger.error(f"Error in parse_text_preview: {e}")
            return {
                'parsed': {'title': text_input, 'confidence': 0.1},
                'preview': text_input,
                'confidence': 0.1,
                'success': False,
                'error': str(e)
            }

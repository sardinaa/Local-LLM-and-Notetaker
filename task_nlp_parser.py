"""
Quick Task Creation NLP Parser

Rule-based NLP parser for extracting structured task data from natural language input.
Supports Spanish and English with focus on fast, offline processing.
"""

import re
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import logging

logger = logging.getLogger(__name__)

class TaskNLPParser:
    def __init__(self):
        """Initialize the task parser with Spanish/English patterns."""
        self.setup_patterns()
    
    def setup_patterns(self):
        """Setup regex patterns for different components."""
        
        # Time patterns
        self.time_patterns = [
            # 10am, 3pm, 16:30, 8:15
            r'(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<ampm>am|pm)',
            r'(?P<hour>\d{1,2}):(?P<minute>\d{2})',
            # a las 10, a las 3:30
            r'a\s+las\s+(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<ampm>am|pm)?',
        ]
        
        # Date patterns (Spanish focus)
        self.date_patterns = {
            # Today/tomorrow
            'hoy': 0,
            'today': 0,
            'mañana': 1,
            'tomorrow': 1,
            
            # Days of week
            'lunes': 'monday',
            'martes': 'tuesday', 
            'miércoles': 'wednesday',
            'miercoles': 'wednesday',
            'jueves': 'thursday',
            'viernes': 'friday',
            'sábado': 'saturday',
            'sabado': 'saturday',
            'domingo': 'sunday',
            'monday': 'monday',
            'tuesday': 'tuesday',
            'wednesday': 'wednesday',
            'thursday': 'thursday',
            'friday': 'friday',
            'saturday': 'saturday',
            'sunday': 'sunday',
            
            # Relative dates
            'próxima semana': 7,
            'proxima semana': 7,
            'next week': 7,
            'la próxima semana': 7,
            'la proxima semana': 7,
            'esta semana': 0,  # this week - use current week
            'this week': 0,
            'el próximo': 'next',  # el próximo lunes
            'el proximo': 'next',
            'next': 'next',
        }
        
        # Tag pattern
        self.tag_pattern = r'#([a-záéíóúñü\w]+)'
        
        # Priority patterns
        self.priority_patterns = {
            '!alta': 'alta',
            '!high': 'alta',
            '!media': 'media', 
            '!medium': 'media',
            '!baja': 'baja',
            '!low': 'baja',
            '!urgent': 'urgente',
            '!urgente': 'urgente',
        }
        
        # Repetition patterns
        self.repeat_patterns = {
            'cada día': 'daily',
            'cada dia': 'daily',
            'daily': 'daily',
            'diario': 'daily',
            'todos los días': 'daily',
            'todos los dias': 'daily',
            'every day': 'daily',
            
            'cada semana': 'weekly',
            'semanalmente': 'weekly',
            'weekly': 'weekly',
            'semanal': 'weekly',
            'todas las semanas': 'weekly',
            'every week': 'weekly',
            
            'cada mes': 'monthly',
            'mensualmente': 'monthly',
            'monthly': 'monthly',
            'mensual': 'monthly',
            'todos los meses': 'monthly',
            'every month': 'monthly',
            
            'cada año': 'yearly',
            'anualmente': 'yearly',
            'yearly': 'yearly',
            'anual': 'yearly',
            'every year': 'yearly',
            
            # Specific days
            'todos los lunes': 'weekly_monday',
            'todos los martes': 'weekly_tuesday',
            'todos los miércoles': 'weekly_wednesday',
            'todos los miercoles': 'weekly_wednesday',
            'todos los jueves': 'weekly_thursday',
            'todos los viernes': 'weekly_friday',
            'todos los sábados': 'weekly_saturday',
            'todos los sabados': 'weekly_saturday',
            'todos los domingos': 'weekly_sunday',
            'every monday': 'weekly_monday',
            'every tuesday': 'weekly_tuesday',
            'every wednesday': 'weekly_wednesday',
            'every thursday': 'weekly_thursday',
            'every friday': 'weekly_friday',
            'every saturday': 'weekly_saturday',
            'every sunday': 'weekly_sunday',
        }
    
    def parse(self, text: str) -> Dict[str, Any]:
        """
        Parse natural language text into structured task data.
        
        Args:
            text: Natural language task description
            
        Returns:
            Dictionary with extracted task data
        """
        if not text or not text.strip():
            return {
                "title": "",
                "date": None,
                "time": None,
                "tags": [],
                "priority": None,
                "repeat": None,
                "confidence": 0.0
            }
        
        original_text = text.strip()
        text = text.lower().strip()
        
        result = {
            "title": "",
            "date": None,
            "time": None,
            "tags": [],
            "priority": None,
            "repeat": None,
            "confidence": 0.8,
            "raw_input": original_text
        }
        
        try:
            # Extract tags first
            tags = self.extract_tags(text)
            result["tags"] = tags
            
            # Remove tags from text for further processing
            text_without_tags = re.sub(self.tag_pattern, '', text).strip()
            
            # Extract priority
            priority = self.extract_priority(text_without_tags)
            result["priority"] = priority
            
            # Remove priority markers from text
            text_clean = text_without_tags
            for pattern in self.priority_patterns.keys():
                text_clean = text_clean.replace(pattern, '').strip()
            
            # Extract repetition
            repeat = self.extract_repetition(text_clean)
            result["repeat"] = repeat
            
            # Remove repetition patterns from text
            text_clean = self.remove_repetition_patterns(text_clean)
            
            # Extract date and time
            date_info = self.extract_date_time(text_clean)
            result["date"] = date_info.get("date")
            result["time"] = date_info.get("time")
            
            # Remove date/time patterns from text for title extraction
            text_clean = self.remove_date_time_patterns(text_clean)
            
            # Extract title (remaining text)
            title = self.extract_title(text_clean, original_text)
            result["title"] = title
            
            # Calculate confidence based on extracted components
            result["confidence"] = self.calculate_confidence(result)
            
            logger.info(f"Parsed task: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Error parsing task: {e}")
            # Return basic result with just the original text as title
            return {
                "title": original_text,
                "date": None,
                "time": None,
                "tags": [],
                "priority": None,
                "repeat": None,
                "confidence": 0.1,
                "error": str(e)
            }
    
    def extract_tags(self, text: str) -> List[str]:
        """Extract hashtags from text."""
        matches = re.findall(self.tag_pattern, text, re.IGNORECASE)
        return [tag.lower() for tag in matches]
    
    def extract_priority(self, text: str) -> Optional[str]:
        """Extract priority markers from text."""
        for pattern, priority in self.priority_patterns.items():
            if pattern in text:
                return priority
        return None
    
    def extract_repetition(self, text: str) -> Optional[str]:
        """Extract repetition patterns from text."""
        # Sort by length (longest first) to match more specific patterns first
        sorted_patterns = sorted(self.repeat_patterns.items(), 
                               key=lambda x: len(x[0]), reverse=True)
        
        for pattern, repeat_type in sorted_patterns:
            if pattern in text:
                return repeat_type
        return None
    
    def remove_repetition_patterns(self, text: str) -> str:
        """Remove repetition patterns from text."""
        for pattern in self.repeat_patterns.keys():
            text = text.replace(pattern, '').strip()
        return text
    
    def extract_date_time(self, text: str) -> Dict[str, Optional[str]]:
        """Extract date and time information from text."""
        result = {"date": None, "time": None}
        
        # Extract time first
        time_info = self.extract_time(text)
        if time_info:
            result["time"] = time_info
        
        # Extract date
        date_info = self.extract_date(text)
        if date_info:
            result["date"] = date_info
        
        # Combine date and time if both exist
        if result["date"] and result["time"]:
            try:
                date_str = result["date"]
                time_str = result["time"]
                combined = f"{date_str}T{time_str}"
                result["date"] = combined
                result["time"] = None  # Move time into date field
            except Exception as e:
                logger.warning(f"Could not combine date and time: {e}")
        
        return result
    
    def extract_time(self, text: str) -> Optional[str]:
        """Extract time from text and convert to 24-hour format."""
        for pattern in self.time_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                try:
                    hour = int(match.group('hour'))
                    minute = int(match.groupdict().get('minute', 0) or 0)
                    ampm = match.groupdict().get('ampm', '').lower()
                    
                    # Convert to 24-hour format
                    if ampm == 'pm' and hour != 12:
                        hour += 12
                    elif ampm == 'am' and hour == 12:
                        hour = 0
                    
                    # Validate time
                    if 0 <= hour <= 23 and 0 <= minute <= 59:
                        return f"{hour:02d}:{minute:02d}:00"
                except (ValueError, AttributeError):
                    continue
        
        return None
    
    def extract_date(self, text: str) -> Optional[str]:
        """Extract date from text and convert to ISO format."""
        now = datetime.now()
        
        # Check for direct date patterns
        for pattern, value in self.date_patterns.items():
            if pattern in text:
                if isinstance(value, int):
                    # Relative days (0 = today, 1 = tomorrow, etc.)
                    target_date = now + timedelta(days=value)
                    return target_date.strftime('%Y-%m-%d')
                elif isinstance(value, str) and value in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']:
                    # Day of week
                    target_date = self.get_next_weekday(now, value)
                    return target_date.strftime('%Y-%m-%d')
                elif value == 'next':
                    # Handle "next monday", "próximo martes", etc.
                    # Find the day name after "next" pattern
                    words = text.split()
                    pattern_index = -1
                    for i, word in enumerate(words):
                        if pattern in word:
                            pattern_index = i
                            break
                    
                    if pattern_index >= 0 and pattern_index < len(words) - 1:
                        next_word = words[pattern_index + 1]
                        for day_pattern, day_value in self.date_patterns.items():
                            if day_pattern in next_word and isinstance(day_value, str) and day_value in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']:
                                target_date = self.get_next_weekday(now, day_value, next_week=True)
                                return target_date.strftime('%Y-%m-%d')
        
        # Check for explicit date formats (DD/MM/YYYY, YYYY-MM-DD, etc.)
        date_formats = [
            r'(\d{1,2})/(\d{1,2})/(\d{4})',  # DD/MM/YYYY
            r'(\d{4})-(\d{1,2})-(\d{1,2})',  # YYYY-MM-DD
            r'(\d{1,2})-(\d{1,2})-(\d{4})',  # DD-MM-YYYY
        ]
        
        for pattern in date_formats:
            matches = re.finditer(pattern, text)
            for match in matches:
                try:
                    groups = match.groups()
                    if len(groups) == 3:
                        if pattern.startswith(r'(\d{4})'):
                            # YYYY-MM-DD format
                            year, month, day = int(groups[0]), int(groups[1]), int(groups[2])
                        else:
                            # DD/MM/YYYY or DD-MM-YYYY format
                            day, month, year = int(groups[0]), int(groups[1]), int(groups[2])
                        
                        # Validate date
                        if 1 <= month <= 12 and 1 <= day <= 31 and year >= now.year:
                            target_date = datetime(year, month, day)
                            return target_date.strftime('%Y-%m-%d')
                except (ValueError, IndexError):
                    continue
        
        return None
    
    def get_next_weekday(self, from_date: datetime, weekday: str, next_week: bool = False) -> datetime:
        """Get the next occurrence of a specific weekday."""
        weekdays = {
            'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
            'friday': 4, 'saturday': 5, 'sunday': 6
        }
        
        target_weekday = weekdays.get(weekday.lower())
        if target_weekday is None:
            return from_date
        
        current_weekday = from_date.weekday()
        days_ahead = target_weekday - current_weekday
        
        if next_week or days_ahead <= 0:
            days_ahead += 7
        
        return from_date + timedelta(days=days_ahead)
    
    def remove_date_time_patterns(self, text: str) -> str:
        """Remove date and time patterns from text."""
        # Remove time patterns
        for pattern in self.time_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)
        
        # Remove date patterns
        for pattern in self.date_patterns.keys():
            # Use word boundaries to avoid partial matches
            text = re.sub(r'\b' + re.escape(pattern) + r'\b', '', text, flags=re.IGNORECASE)
        
        # Remove common time/date connectors
        connectors = ['a las', 'at', 'el', 'en', 'on', 'para', 'for']
        for connector in connectors:
            text = re.sub(r'\b' + re.escape(connector) + r'\b', '', text, flags=re.IGNORECASE)
        
        # Clean up extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def extract_title(self, clean_text: str, original_text: str) -> str:
        """Extract the task title from cleaned text."""
        # Use cleaned text if it's meaningful, otherwise fall back to original
        title = clean_text.strip()
        
        if not title or len(title) < 3:
            # Extract title from original text, removing only obvious patterns
            title = original_text
            # Remove tags
            title = re.sub(self.tag_pattern, '', title, flags=re.IGNORECASE)
            # Remove priority markers
            for pattern in self.priority_patterns.keys():
                title = title.replace(pattern, '')
            # Clean up
            title = re.sub(r'\s+', ' ', title).strip()
        
        # Capitalize first letter
        if title:
            title = title[0].upper() + title[1:] if len(title) > 1 else title.upper()
        
        return title or "Nueva tarea"
    
    def calculate_confidence(self, result: Dict[str, Any]) -> float:
        """Calculate confidence score based on extracted components."""
        confidence = 0.5  # Base confidence
        
        # Add confidence for each successfully extracted component
        if result.get("title") and len(result["title"]) > 3:
            confidence += 0.2
        
        if result.get("date"):
            confidence += 0.15
        
        if result.get("time"):
            confidence += 0.1
        
        if result.get("tags"):
            confidence += 0.1 * min(len(result["tags"]), 3)  # Max 0.3 for tags
        
        if result.get("priority"):
            confidence += 0.1
        
        if result.get("repeat"):
            confidence += 0.1
        
        return min(confidence, 1.0)
    
    def format_for_display(self, parsed_result: Dict[str, Any]) -> str:
        """Format parsed result for user preview."""
        parts = []
        
        if parsed_result.get("title"):
            parts.append(f"**{parsed_result['title']}**")
        
        if parsed_result.get("date"):
            date_str = parsed_result["date"]
            if 'T' in date_str:
                # Has time included
                try:
                    dt = datetime.fromisoformat(date_str)
                    parts.append(f"📅 {dt.strftime('%d/%m/%Y')} ⏰ {dt.strftime('%H:%M')}")
                except:
                    parts.append(f"📅 {date_str}")
            else:
                try:
                    dt = datetime.fromisoformat(date_str)
                    parts.append(f"📅 {dt.strftime('%d/%m/%Y')}")
                except:
                    parts.append(f"📅 {date_str}")
        elif parsed_result.get("time"):
            parts.append(f"⏰ {parsed_result['time']}")
        
        if parsed_result.get("tags"):
            tags_str = " ".join([f"#{tag}" for tag in parsed_result["tags"]])
            parts.append(f"🏷️ {tags_str}")
        
        if parsed_result.get("priority"):
            priority_icons = {"alta": "🔴", "media": "🟡", "baja": "🟢", "urgente": "🔥"}
            icon = priority_icons.get(parsed_result["priority"], "")
            parts.append(f"{icon} {parsed_result['priority'].title()}")
        
        if parsed_result.get("repeat"):
            parts.append(f"🔄 {parsed_result['repeat']}")
        
        return " | ".join(parts)


def test_parser():
    """Test the task parser with example inputs."""
    parser = TaskNLPParser()
    
    test_cases = [
        "Reunión con Pablo mañana a las 10am #trabajo !alta",
        "Enviar portfolio el viernes a las 15:00 #trabajo !alta cada semana",
        "Llamar al dentista hoy #personal",
        "Comprar comida para la cena #casa mañana",
        "Ejercicio todos los lunes a las 7am #fitness !media",
        "Revisar correos cada día #trabajo",
        "Cita médica el próximo martes a las 14:30 #salud !urgente",
    ]
    
    for test_input in test_cases:
        print(f"\nInput: {test_input}")
        result = parser.parse(test_input)
        print(f"Result: {json.dumps(result, indent=2, ensure_ascii=False)}")
        print(f"Formatted: {parser.format_for_display(result)}")


if __name__ == "__main__":
    test_parser()

"""
Job Scraper Service - Automated job search and ingestion
"""

import json
import time
import logging
import threading
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
import hashlib
import re

# Try to import schedule, handle gracefully if not available
try:
    import schedule
    SCHEDULE_AVAILABLE = True
except ImportError:
    SCHEDULE_AVAILABLE = False
    print("Schedule package not available. Install with: pip install schedule")

from database import DatabaseManager
from data_service import DataService
import jobspy_adapter

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class JobMatch:
    """Represents a matched job with scoring information"""
    title: str
    company: str
    location: str
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: str = 'USD'
    job_type: str = ''
    date_posted: str = ''
    source_url: str = ''
    description: str = ''
    is_remote: bool = False
    seniority_level: str = ''
    match_score: float = 0.0
    source: str = 'jobspy'
    provenance: Dict[str, Any] = None

class JobMatcher:
    """Handles job scoring and matching logic"""
    
    def __init__(self):
        self.location_keywords = {
            'remote': ['remote', 'work from home', 'wfh', 'telecommute', 'distributed'],
            'hybrid': ['hybrid', 'flexible', 'partially remote'],
            'major_cities': ['stockholm', 'gothenburg', 'malmö', 'zurich', 'geneva', 'dublin', 'berlin', 'amsterdam', 'brussels']
        }
        
        self.seniority_patterns = {
            'junior': ['junior', 'entry', 'graduate', 'trainee', 'intern'],
            'mid': ['mid', 'intermediate', 'regular', 'standard'],
            'senior': ['senior', 'sr', 'lead', 'principal', 'staff'],
            'executive': ['director', 'vp', 'head of', 'chief', 'manager']
        }

    def calculate_match_score(self, job_data: Dict[str, Any], config: Dict[str, Any]) -> float:
        """Calculate match score (0-1) for a job against configuration"""
        score = 0.0
        factors = []

        # Title relevance (30% weight)
        title_score = self._score_title_relevance(
            job_data.get('title', ''), 
            config.get('search_terms', [])
        )
        factors.append(('title', title_score, 0.3))

        # Location match (25% weight)
        location_score = self._score_location_match(
            job_data.get('location', ''),
            job_data.get('is_remote', False),
            config
        )
        factors.append(('location', location_score, 0.25))

        # Salary match (20% weight)
        salary_score = self._score_salary_match(
            job_data.get('salary_min'),
            job_data.get('salary_max'),
            config.get('min_salary'),
            config.get('salary_currency', 'USD')
        )
        factors.append(('salary', salary_score, 0.2))

        # Job type match (15% weight)
        job_type_score = self._score_job_type_match(
            job_data.get('job_type', ''),
            config.get('employment_types', [])
        )
        factors.append(('job_type', job_type_score, 0.15))

        # Seniority match (10% weight)
        seniority_score = self._score_seniority_match(
            job_data.get('title', ''),
            config.get('seniority_levels', [])
        )
        factors.append(('seniority', seniority_score, 0.1))

        # Calculate weighted score
        for factor_name, factor_score, weight in factors:
            score += factor_score * weight

        return min(1.0, max(0.0, score))

    def _score_title_relevance(self, title: str, search_terms: List[str]) -> float:
        """Score title relevance against search terms"""
        if not title or not search_terms:
            return 0.0
        
        title_lower = title.lower()
        matches = 0
        for term in search_terms:
            if term.lower() in title_lower:
                matches += 1
        
        return min(1.0, matches / len(search_terms) * 1.5)

    def _score_location_match(self, location: str, is_remote: bool, config: Dict[str, Any]) -> float:
        """Score location compatibility"""
        if is_remote and config.get('remote_only', False):
            return 1.0
        
        if not config.get('remote_only', False) and is_remote and not config.get('hybrid_allowed', True):
            return 0.0
        
        location_lower = location.lower() if location else ''
        target_locations = config.get('target_locations', [])
        
        if not target_locations:
            return 0.5
        
        for target in target_locations:
            if target.lower() in location_lower:
                return 1.0
        
        # Check for remote indicators
        for keyword in self.location_keywords['remote']:
            if keyword in location_lower:
                return 0.9 if config.get('hybrid_allowed', True) else 0.3
        
        return 0.3  # Partial match for unlisted locations

    def _score_salary_match(self, salary_min: Optional[float], salary_max: Optional[float], 
                          min_required: Optional[float], currency: str) -> float:
        """Score salary compatibility"""
        if not min_required:
            return 0.5  # Neutral if no requirement
        
        if not salary_min and not salary_max:
            return 0.3  # Unknown salary gets partial score
        
        effective_salary = salary_max or salary_min or 0
        
        if effective_salary >= min_required:
            return 1.0
        elif effective_salary >= min_required * 0.8:
            return 0.7
        elif effective_salary >= min_required * 0.6:
            return 0.4
        else:
            return 0.1

    def _score_job_type_match(self, job_type: str, allowed_types: List[str]) -> float:
        """Score job type compatibility"""
        if not allowed_types:
            return 0.5
        
        if not job_type:
            return 0.3
        
        job_type_lower = job_type.lower()
        for allowed in allowed_types:
            if allowed.lower() in job_type_lower or job_type_lower in allowed.lower():
                return 1.0
        
        return 0.2

    def _score_seniority_match(self, title: str, allowed_levels: List[str]) -> float:
        """Score seniority level compatibility"""
        if not allowed_levels:
            return 0.5
        
        if not title:
            return 0.3
        
        title_lower = title.lower()
        detected_level = self._detect_seniority_level(title_lower)
        
        if detected_level in [level.lower() for level in allowed_levels]:
            return 1.0
        
        return 0.3

    def _detect_seniority_level(self, title: str) -> str:
        """Detect seniority level from job title"""
        title_lower = title.lower()
        
        for level, patterns in self.seniority_patterns.items():
            for pattern in patterns:
                if pattern in title_lower:
                    return level
        
        return 'mid'  # Default to mid-level

class JobScraperService:
    """Main job scraper service"""
    
    def __init__(self, db_manager: DatabaseManager, data_service: DataService):
        self.db = db_manager
        self.data_service = data_service
        self.matcher = JobMatcher()
        self.running = False
        self.scheduler_thread = None
        
    def start_scheduler(self):
        """Start the background scheduler"""
        if not SCHEDULE_AVAILABLE:
            logger.warning("Schedule package not available. Automatic scheduling disabled.")
            return
            
        if self.running:
            return
        
        self.running = True
        self.scheduler_thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self.scheduler_thread.start()
        logger.info("Job scraper scheduler started")

    def stop_scheduler(self):
        """Stop the background scheduler"""
        self.running = False
        if self.scheduler_thread:
            self.scheduler_thread.join(timeout=5)
        logger.info("Job scraper scheduler stopped")

    def _run_scheduler(self):
        """Run the scheduler loop"""
        if not SCHEDULE_AVAILABLE:
            return
            
        while self.running:
            try:
                schedule.run_pending()
                time.sleep(60)  # Check every minute
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                time.sleep(60)

    def schedule_config(self, config: Dict[str, Any]):
        """Schedule a configuration for automatic runs"""
        if not SCHEDULE_AVAILABLE:
            logger.warning("Schedule package not available. Cannot schedule configuration.")
            return
            
        if not config.get('enabled', True):
            return
        
        frequency = config.get('scrape_frequency_hours', 24)
        config_id = config['id']
        
        # Clear existing schedule for this config
        schedule.clear(f"config_{config_id}")
        
        # Schedule new job
        schedule.every(frequency).hours.do(
            self._run_scheduled_scrape, config_id
        ).tag(f"config_{config_id}")
        
        logger.info(f"Scheduled config {config['name']} to run every {frequency} hours")

    def _run_scheduled_scrape(self, config_id: str):
        """Run a scheduled scrape"""
        try:
            configs = self.db.get_scraper_configs()
            config = next((c for c in configs if c['id'] == config_id), None)
            
            if not config or not config.get('enabled', True):
                logger.warning(f"Config {config_id} not found or disabled")
                return
            
            logger.info(f"Running scheduled scrape for: {config['name']}")
            self.run_scrape(config)
            
        except Exception as e:
            logger.error(f"Scheduled scrape failed for config {config_id}: {e}")

    def run_scrape(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Run a job scrape with the given configuration"""
        start_time = datetime.now()
        stats = {
            'jobs_fetched': 0,
            'jobs_inserted': 0,
            'jobs_deduped': 0,
            'jobs_failed': 0,
            'status': 'running',
            'started_at': start_time.isoformat()
        }
        
        try:
            # Import jobspy safely
            try:
                from jobspy import scrape_jobs
            except ImportError:
                raise Exception("JobSpy not installed")
            
            search_terms = config.get('search_terms', [])
            target_locations = config.get('target_locations', [])
            job_boards = config.get('job_boards', ['linkedin'])
            
            all_jobs = []
            
            # Run searches for each combination
            for search_term in search_terms:
                for location in target_locations:
                    try:
                        logger.info(f"Searching: {search_term} in {location}")
                        
                        jobs_df = scrape_jobs(
                            site_name=job_boards,
                            search_term=search_term,
                            location=location,
                            results_wanted=config.get('max_results_per_source', 50),
                            hours_old=config.get('lookback_hours', 24),
                            linkedin_fetch_description=True
                        )
                        
                        if len(jobs_df) > 0:
                            # Convert DataFrame to dict records
                            jobs_list = jobs_df.to_dict('records')
                            for job in jobs_list:
                                job['search_query'] = search_term
                                job['target_location'] = location
                            
                            all_jobs.extend(jobs_list)
                            stats['jobs_fetched'] += len(jobs_list)
                            
                        time.sleep(2)  # Rate limiting
                        
                    except Exception as e:
                        logger.error(f"Error scraping {search_term} in {location}: {e}")
                        stats['jobs_failed'] += 1
                        continue
            
            # Process and score jobs
            if all_jobs:
                processed_jobs = self._process_scraped_jobs(all_jobs, config)
                
                # Filter by minimum score
                min_score = config.get('min_score_threshold', 0.6)
                filtered_jobs = [job for job in processed_jobs if job.match_score >= min_score]
                
                # Insert jobs as drafts
                for job in filtered_jobs:
                    if self._insert_job_if_new(job, config):
                        stats['jobs_inserted'] += 1
                    else:
                        stats['jobs_deduped'] += 1
            
            stats['status'] = 'completed'
            stats['completed_at'] = datetime.now().isoformat()
            
            # Log the run
            self.db.log_scraper_run(config['id'], stats)
            
            logger.info(f"Scrape completed: {stats}")
            return stats
            
        except Exception as e:
            stats['status'] = 'failed'
            stats['error_message'] = str(e)
            stats['completed_at'] = datetime.now().isoformat()
            
            self.db.log_scraper_run(config['id'], stats)
            logger.error(f"Scrape failed: {e}")
            return stats

    def _process_scraped_jobs(self, jobs_data: List[Dict[str, Any]], config: Dict[str, Any]) -> List[JobMatch]:
        """Process raw scraped jobs into JobMatch objects with scoring"""
        processed_jobs = []
        
        for job_data in jobs_data:
            try:
                # Normalize job data
                job_match = self._normalize_job_data(job_data)
                
                # Calculate match score
                job_match.match_score = self.matcher.calculate_match_score(
                    job_data, config
                )
                
                # Apply auto-tagging rules
                job_match = self._apply_auto_tagging(job_match, config)
                
                processed_jobs.append(job_match)
                
            except Exception as e:
                logger.error(f"Error processing job: {e}")
                continue
        
        return processed_jobs

    def _normalize_job_data(self, job_data: Dict[str, Any]) -> JobMatch:
        """Normalize job data from different sources"""
        
        # Use jobspy_adapter for normalization
        normalized = jobspy_adapter._normalize(job_data)
        prefill = normalized.get('prefill', {})
        
        return JobMatch(
            title=prefill.get('position', ''),
            company=prefill.get('company', ''),
            location=prefill.get('location', ''),
            salary_min=prefill.get('salary_min'),
            salary_max=prefill.get('salary_max'),
            salary_currency=prefill.get('salary_currency', 'USD'),
            job_type=prefill.get('job_type', ''),
            date_posted=prefill.get('date_posted', ''),
            source_url=prefill.get('source_url', ''),
            description=prefill.get('description', ''),
            is_remote=job_data.get('is_remote', False),
            seniority_level=self.matcher._detect_seniority_level(prefill.get('position', '')),
            source='jobspy_auto',
            provenance=normalized.get('provenance', {})
        )

    def _apply_auto_tagging(self, job: JobMatch, config: Dict[str, Any]) -> JobMatch:
        """Apply auto-tagging rules to a job"""
        auto_tag_rules = config.get('auto_tag_rules', {})
        
        # This could be extended with more sophisticated tagging logic
        # For now, just add basic tags based on content
        
        return job

    def _insert_job_if_new(self, job: JobMatch, config: Dict[str, Any]) -> bool:
        """Insert job if it hasn't been seen before"""
        
        # Check for duplicates
        existing_job_id = self.db.is_job_seen(
            job.source_url, job.title, job.company, job.location, job.date_posted
        )
        
        if existing_job_id:
            return False  # Job already exists
        
        # Create new job
        job_data = {
            'position': job.title,
            'company': job.company,
            'location': job.location,
            'salary_min': job.salary_min,
            'salary_max': job.salary_max,
            'salary_currency': job.salary_currency,
            'job_type': job.job_type,
            'date_posted': job.date_posted,
            'source_url': job.source_url,
            'description': job.description,
            'state': 'draft',
            'match_score': job.match_score,
            'source': job.source,
            'is_remote': job.is_remote,
            'seniority_level': job.seniority_level
        }
        
        # Insert job
        job_id = self.data_service.create_job(job_data)
        
        if job_id:
            # Mark as seen for deduplication
            self.db.mark_job_seen(
                job.source_url, job.title, job.company, job.location, job.date_posted, job_id
            )
            
            # Save provenance data
            if job.provenance:
                self.db.save_job_provenance(job_id, job.provenance)
            
            return True
        
        return False

    def manual_search(self, search_params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Perform a manual search and return preview results"""
        try:
            from jobspy import scrape_jobs
            
            # Run the search
            jobs_df = scrape_jobs(
                site_name=search_params.get('job_boards', ['linkedin']),
                search_term=search_params.get('search_term', ''),
                location=search_params.get('location', ''),
                results_wanted=search_params.get('max_results', 50),
                hours_old=search_params.get('hours_old', 72),
                linkedin_fetch_description=True
            )
            
            if len(jobs_df) == 0:
                return []
            
            # Convert to list and add scoring
            jobs_list = jobs_df.to_dict('records')
            processed_jobs = []
            
            for job_data in jobs_list:
                try:
                    job_match = self._normalize_job_data(job_data)
                    
                    # Create a temporary config for scoring
                    temp_config = {
                        'search_terms': [search_params.get('search_term', '')],
                        'target_locations': [search_params.get('location', '')],
                        'employment_types': search_params.get('employment_types', []),
                        'seniority_levels': search_params.get('seniority_levels', []),
                        'min_salary': search_params.get('min_salary'),
                        'salary_currency': search_params.get('salary_currency', 'USD'),
                        'remote_only': search_params.get('remote_only', False),
                        'hybrid_allowed': search_params.get('hybrid_allowed', True)
                    }
                    
                    job_match.match_score = self.matcher.calculate_match_score(job_data, temp_config)
                    
                    # Check if already exists
                    existing_job_id = self.db.is_job_seen(
                        job_match.source_url, job_match.title, job_match.company, 
                        job_match.location, job_match.date_posted
                    )
                    
                    job_dict = {
                        'title': job_match.title,
                        'company': job_match.company,
                        'location': job_match.location,
                        'salary_min': job_match.salary_min,
                        'salary_max': job_match.salary_max,
                        'salary_currency': job_match.salary_currency,
                        'job_type': job_match.job_type,
                        'date_posted': job_match.date_posted,
                        'source_url': job_match.source_url,
                        'description': job_match.description[:500] + '...' if len(job_match.description) > 500 else job_match.description,
                        'is_remote': job_match.is_remote,
                        'seniority_level': job_match.seniority_level,
                        'match_score': job_match.match_score,
                        'source': job_match.source,
                        'already_exists': existing_job_id is not None,
                        'existing_job_id': existing_job_id
                    }
                    
                    processed_jobs.append(job_dict)
                    
                except Exception as e:
                    logger.error(f"Error processing manual search result: {e}")
                    continue
            
            # Sort by match score
            processed_jobs.sort(key=lambda x: x['match_score'], reverse=True)
            
            return processed_jobs
            
        except Exception as e:
            logger.error(f"Manual search failed: {e}")
            return []

    def import_selected_jobs(self, job_selections: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Import selected jobs from manual search"""
        stats = {'imported': 0, 'skipped': 0, 'errors': []}
        
        for selection in job_selections:
            try:
                # Check if selection is None or empty
                if not selection or not isinstance(selection, dict):
                    stats['errors'].append("Invalid job data: job selection is None or not a dictionary")
                    continue
                
                if selection.get('already_exists', False):
                    stats['skipped'] += 1
                    continue
                
                # Validate required fields
                required_fields = ['title', 'company', 'location', 'source_url']
                missing_fields = [field for field in required_fields if not selection.get(field)]
                
                if missing_fields:
                    stats['errors'].append(f"Missing required fields: {', '.join(missing_fields)}")
                    continue
                
                job_data = selection.copy()
                
                # Map frontend field names to backend field names if needed
                field_mapping = {
                    'title': 'position',  # Frontend uses 'title', backend expects 'position'
                    'job_type': 'job_type',
                    'is_remote': 'is_remote',
                    'salary_min': 'salary_min',
                    'salary_max': 'salary_max',
                    'salary_currency': 'salary_currency',
                    'date_posted': 'date_posted',
                    'source_url': 'source_url',
                    'description': 'description',
                    'company': 'company',
                    'location': 'location'
                }
                
                # Transform the job data to match expected format
                transformed_data = {}
                for frontend_field, backend_field in field_mapping.items():
                    if frontend_field in job_data:
                        transformed_data[backend_field] = job_data[frontend_field]
                
                # Set required defaults
                transformed_data['state'] = 'draft'
                transformed_data['source'] = 'jobspy_manual'
                transformed_data['seniority_level'] = job_data.get('seniority_level', 'not_specified')
                
                # Remove preview-specific fields
                transformed_data.pop('already_exists', None)
                transformed_data.pop('existing_job_id', None)
                transformed_data.pop('match_score', None)
                
                # Create job
                job_id = self.data_service.create_job(transformed_data)
                
                if job_id:
                    # Mark as seen
                    self.db.mark_job_seen(
                        transformed_data['source_url'], 
                        transformed_data['position'], 
                        transformed_data['company'], 
                        transformed_data['location'], 
                        transformed_data.get('date_posted', ''), 
                        job_id
                    )
                    stats['imported'] += 1
                else:
                    stats['errors'].append(f"Failed to create job: {transformed_data.get('position', 'Unknown title')}")
                    
            except Exception as e:
                job_title = selection.get('title', 'Unknown') if selection else 'Unknown'
                stats['errors'].append(f"Error importing job '{job_title}': {str(e)}")
        
        return stats

# Global instance
_scraper_service = None

def get_scraper_service(db_manager: DatabaseManager = None, data_service: DataService = None) -> JobScraperService:
    """Get or create the global scraper service instance"""
    global _scraper_service
    
    if _scraper_service is None:
        if db_manager is None or data_service is None:
            raise ValueError("db_manager and data_service required for first initialization")
        _scraper_service = JobScraperService(db_manager, data_service)
    
    return _scraper_service

#!/usr/bin/env python3
"""
Demo configuration setup for job scraper
Adds sample configurations to test the system
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import DatabaseManager

def add_demo_configs():
    """Add demo job scraper configurations"""
    
    db = DatabaseManager()
    
    demo_configs = [
        {
            'name': 'AI/ML Engineer - Europe',
            'search_terms': ['AI Engineer', 'Machine Learning Engineer', 'MLOps Engineer', 'Data Scientist'],
            'target_locations': ['Stockholm, Sweden', 'Berlin, Germany', 'Amsterdam, Netherlands', 'Remote Europe'],
            'job_boards': ['linkedin', 'indeed'],
            'scrape_frequency_hours': 24,
            'lookback_hours': 48,
            'max_results_per_run': 50,
            'max_results_per_source': 25,
            'remote_only': False,
            'hybrid_allowed': True,
            'onsite_allowed': True,
            'employment_types': ['full-time'],
            'min_salary': 60000,
            'max_salary': 120000,
            'salary_currency': 'EUR',
            'seniority_levels': ['mid', 'senior'],
            'min_score_threshold': 0.7,
            'enabled': True,
            'keywords_required': ['python', 'machine learning'],
            'keywords_preferred': ['pytorch', 'tensorflow', 'kubernetes', 'aws'],
            'keywords_excluded': ['internship', 'junior'],
            'company_size_min': 50,
            'company_size_max': 5000
        },
        {
            'name': 'Backend Developer - Remote',
            'search_terms': ['Backend Developer', 'Python Developer', 'Django Developer', 'FastAPI Developer'],
            'target_locations': ['Remote', 'Europe Remote', 'Stockholm, Sweden'],
            'job_boards': ['linkedin', 'indeed'],
            'scrape_frequency_hours': 12,
            'lookback_hours': 24,
            'max_results_per_run': 30,
            'max_results_per_source': 15,
            'remote_only': True,
            'hybrid_allowed': False,
            'onsite_allowed': False,
            'employment_types': ['full-time', 'contract'],
            'min_salary': 50000,
            'max_salary': 90000,
            'salary_currency': 'EUR',
            'seniority_levels': ['mid', 'senior'],
            'min_score_threshold': 0.6,
            'enabled': True,
            'keywords_required': ['python'],
            'keywords_preferred': ['django', 'fastapi', 'postgresql', 'redis'],
            'keywords_excluded': ['frontend', 'react', 'vue'],
            'company_size_min': 10,
            'company_size_max': 1000
        },
        {
            'name': 'Full Stack - Startup Focus',
            'search_terms': ['Full Stack Developer', 'Fullstack Engineer', 'Software Engineer'],
            'target_locations': ['Stockholm, Sweden', 'Gothenburg, Sweden', 'Remote Sweden'],
            'job_boards': ['linkedin'],
            'scrape_frequency_hours': 6,
            'lookback_hours': 12,
            'max_results_per_run': 20,
            'max_results_per_source': 20,
            'remote_only': False,
            'hybrid_allowed': True,
            'onsite_allowed': True,
            'employment_types': ['full-time'],
            'min_salary': 40000,
            'max_salary': 80000,
            'salary_currency': 'SEK',
            'seniority_levels': ['junior', 'mid'],
            'min_score_threshold': 0.5,
            'enabled': False,  # Disabled by default
            'keywords_required': ['javascript', 'python'],
            'keywords_preferred': ['react', 'vue', 'node.js', 'mongodb'],
            'keywords_excluded': ['devops', 'data science'],
            'company_size_min': 5,
            'company_size_max': 200
        }
    ]
    
    print("Adding demo job scraper configurations...")
    
    for i, config in enumerate(demo_configs, 1):
        try:
            config_id = db.create_scraper_config(config)
            if config_id:
                status = "✓" if config['enabled'] else "○"
                print(f"{status} {i}. {config['name']} (ID: {config_id})")
            else:
                print(f"✗ {i}. Failed to create: {config['name']}")
        except Exception as e:
            print(f"✗ {i}. Error creating {config['name']}: {e}")
    
    print(f"\nDemo configurations added! Check the Jobs dashboard.")
    print("Legend: ✓ = Enabled, ○ = Disabled")

def show_current_configs():
    """Show current job scraper configurations"""
    
    db = DatabaseManager()
    configs = db.get_scraper_configs()
    
    if not configs:
        print("No job scraper configurations found.")
        return
    
    print(f"\nCurrent Job Scraper Configurations ({len(configs)}):")
    print("-" * 60)
    
    for config in configs:
        status = "✓ ENABLED" if config['enabled'] else "○ DISABLED"
        search_terms = ", ".join(config['search_terms'][:3])
        if len(config['search_terms']) > 3:
            search_terms += f" (+{len(config['search_terms'])-3} more)"
        
        locations = ", ".join(config['target_locations'][:2])
        if len(config['target_locations']) > 2:
            locations += f" (+{len(config['target_locations'])-2} more)"
        
        print(f"{status}")
        print(f"  Name: {config['name']}")
        print(f"  Search: {search_terms}")
        print(f"  Locations: {locations}")
        print(f"  Frequency: Every {config['scrape_frequency_hours']} hours")
        print(f"  Last Run: {config.get('last_run_at', 'Never')}")
        print()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Job Scraper Demo Configuration Tool')
    parser.add_argument('--add', action='store_true', help='Add demo configurations')
    parser.add_argument('--show', action='store_true', help='Show current configurations')
    
    args = parser.parse_args()
    
    if args.add:
        add_demo_configs()
    elif args.show:
        show_current_configs()
    else:
        # Default: show current configs, then ask if user wants to add demo configs
        show_current_configs()
        
        if input("\nAdd demo configurations? (y/N): ").lower().strip() == 'y':
            add_demo_configs()

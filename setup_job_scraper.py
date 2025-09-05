#!/usr/bin/env python3
"""
Job Scraper Setup Verification Script
Ensures all components are properly configured and ready to use
"""

import os
import sys
import subprocess

def check_dependencies():
    """Check if required packages are installed"""
    print("Checking dependencies...")
    
    required_packages = [
        ('flask', 'Flask web framework'),
        ('schedule', 'Job scheduling (optional)'),
        ('jobspy', 'Job scraping library'),
        ('sqlite3', 'Database (built-in)'),
        ('threading', 'Background tasks (built-in)'),
        ('requests', 'HTTP requests'),
        ('beautifulsoup4', 'HTML parsing'),
        ('chromadb', 'Vector database (optional)')
    ]
    
    missing_packages = []
    
    for package, description in required_packages:
        try:
            if package == 'sqlite3':
                import sqlite3
            elif package == 'threading':
                import threading
            elif package == 'beautifulsoup4':
                import bs4
            else:
                __import__(package)
            print(f"✓ {package:<15} - {description}")
        except ImportError:
            print(f"✗ {package:<15} - {description} (MISSING)")
            missing_packages.append(package)
    
    return missing_packages

def check_database():
    """Check if database is properly configured"""
    print("\nChecking database...")
    
    try:
        from database import DatabaseManager
        db = DatabaseManager()
        
        # Test basic operations
        configs = db.get_scraper_configs()
        print(f"✓ Database connection working - {len(configs)} scraper configs found")
        return True
    except Exception as e:
        print(f"✗ Database check failed: {e}")
        return False

def check_services():
    """Check if services are properly configured"""
    print("\nChecking services...")
    
    try:
        from job_scraper_service import JobScraperService
        print("✓ JobScraperService can be imported")
        
        from data_service import DataService
        print("✓ DataService can be imported")
        
        from jobspy_adapter import is_supported
        print("✓ JobSpy adapter can be imported")
        
        return True
    except Exception as e:
        print(f"✗ Service check failed: {e}")
        return False

def check_app():
    """Check if Flask app is properly configured"""
    print("\nChecking Flask app...")
    
    try:
        from app import app
        
        # Check if job scraper endpoints are registered
        routes = [rule.rule for rule in app.url_map.iter_rules()]
        job_routes = [route for route in routes if '/api/job-scraper' in route]
        
        if job_routes:
            print(f"✓ Flask app configured - {len(job_routes)} job scraper endpoints found")
            return True
        else:
            print("✗ No job scraper endpoints found in Flask app")
            return False
    except Exception as e:
        print(f"✗ Flask app check failed: {e}")
        return False

def check_frontend():
    """Check if frontend files exist"""
    print("\nChecking frontend files...")
    
    required_files = [
        'static/js/jobScraper.js',
        'static/css/jobScraper.css',
        'templates/index.html'
    ]
    
    all_exist = True
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✓ {file_path}")
        else:
            print(f"✗ {file_path} (MISSING)")
            all_exist = False
    
    return all_exist

def run_basic_test():
    """Run a basic functionality test"""
    print("\nRunning basic functionality test...")
    
    try:
        # Import and test basic database operations
        from database import DatabaseManager
        
        # Create test config
        db = DatabaseManager()
        test_config = {
            'name': 'Setup Test Config',
            'search_terms': ['Test Job'],
            'target_locations': ['Test Location'],
            'job_boards': ['linkedin'],
            'scrape_frequency_hours': 24,
            'lookback_hours': 48,
            'max_results_per_run': 10,
            'max_results_per_source': 5,
            'remote_only': False,
            'hybrid_allowed': True,
            'onsite_allowed': True,
            'employment_types': ['full-time'],
            'min_salary': 50000,
            'salary_currency': 'USD',
            'seniority_levels': ['mid'],
            'min_score_threshold': 0.5,
            'enabled': False  # Disabled test config
        }
        
        config_id = db.create_scraper_config(test_config)
        if config_id:
            print(f"✓ Test config created (ID: {config_id})")
            
            # Clean up test config
            with db.get_connection() as conn:
                conn.execute("DELETE FROM job_scraper_configs WHERE id = ?", (config_id,))
                conn.commit()
            print("✓ Test config cleaned up")
            
            return True
        else:
            print("✗ Failed to create test config")
            return False
            
    except Exception as e:
        print(f"✗ Basic test failed: {e}")
        return False

def main():
    print("Job Scraper Setup Verification")
    print("=" * 50)
    
    # Run all checks
    missing_deps = check_dependencies()
    db_ok = check_database()
    services_ok = check_services()
    app_ok = check_app()
    frontend_ok = check_frontend()
    test_ok = run_basic_test()
    
    print("\n" + "=" * 50)
    print("SETUP VERIFICATION SUMMARY")
    print("=" * 50)
    
    if missing_deps:
        print("❌ MISSING DEPENDENCIES:")
        for package in missing_deps:
            if package == 'schedule':
                print(f"   {package} (optional - install with: pip install schedule)")
            else:
                print(f"   {package} (install with: pip install {package})")
        print()
    
    all_good = (
        len(missing_deps) <= 1 and  # Allow schedule to be missing
        db_ok and 
        services_ok and 
        app_ok and 
        frontend_ok and 
        test_ok
    )
    
    if all_good:
        print("🎉 JOB SCRAPER INTEGRATION IS READY!")
        print("\nNext steps:")
        print("1. Start the Flask app: python app.py")
        print("2. Open your browser and go to the Jobs dashboard")
        print("3. Click 'Configure Auto Search' to set up job scraping")
        print("4. Try the 'Manual Search' feature")
        print("5. Monitor jobs in the dashboard")
        
        if 'schedule' in missing_deps:
            print("\nNote: Install 'schedule' package for automated scraping:")
            print("pip install schedule")
    else:
        print("❌ SETUP ISSUES DETECTED")
        print("Please resolve the issues above before using the job scraper.")
        
        if not db_ok:
            print("\nDatabase issue: Run 'python app.py' once to initialize the database")
        if not services_ok or not app_ok:
            print("\nCode issue: Check for import errors or missing files")
        if not frontend_ok:
            print("\nFrontend issue: Ensure all frontend files are present")

if __name__ == "__main__":
    main()

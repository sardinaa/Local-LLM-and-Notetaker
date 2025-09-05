#!/usr/bin/env python3
"""
Test script for job scraper integration
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import DatabaseManager
from data_service import DataService

def test_database_integration():
    """Test the database integration for job scraper"""
    print("Testing job scraper database integration...")
    
    # Initialize services
    db = DatabaseManager("test_scraper.db")
    data_service = DataService("test_scraper.db")
    
    # Test 1: Create a scraper configuration
    print("\n1. Testing scraper configuration creation...")
    config_data = {
        'name': 'Test AI Jobs Configuration',
        'search_terms': ['AI Engineer', 'Machine Learning'],
        'target_locations': ['Stockholm, Sweden', 'Berlin, Germany'],
        'job_boards': ['linkedin', 'indeed'],
        'scrape_frequency_hours': 24,
        'lookback_hours': 48,
        'max_results_per_run': 100,
        'max_results_per_source': 50,
        'remote_only': False,
        'hybrid_allowed': True,
        'onsite_allowed': True,
        'employment_types': ['full-time'],
        'min_salary': 50000,
        'salary_currency': 'EUR',
        'seniority_levels': ['mid', 'senior'],
        'min_score_threshold': 0.6,
        'enabled': True
    }
    
    config_id = db.create_scraper_config(config_data)
    if config_id:
        print(f"✓ Configuration created with ID: {config_id}")
    else:
        print("✗ Failed to create configuration")
        return False
    
    # Test 2: Retrieve configurations
    print("\n2. Testing configuration retrieval...")
    configs = db.get_scraper_configs()
    if configs and len(configs) > 0:
        print(f"✓ Retrieved {len(configs)} configurations")
        print(f"  First config: {configs[0]['name']}")
    else:
        print("✗ Failed to retrieve configurations")
        return False
    
    # Test 3: Test job deduplication
    print("\n3. Testing job deduplication...")
    test_url = "https://linkedin.com/jobs/view/123456"
    test_title = "AI Engineer"
    test_company = "Test Company"
    test_location = "Stockholm, Sweden"
    test_date = "2024-01-01"
    
    # First check - should return None (not seen)
    existing = db.is_job_seen(test_url, test_title, test_company, test_location, test_date)
    if existing is None:
        print("✓ Job correctly identified as new")
    else:
        print("✗ Job incorrectly identified as existing")
        return False
    
    # Mark as seen
    seen_id = db.mark_job_seen(test_url, test_title, test_company, test_location, test_date)
    if seen_id:
        print(f"✓ Job marked as seen with ID: {seen_id}")
    else:
        print("✗ Failed to mark job as seen")
        return False
    
    # Second check - should return the job ID
    existing = db.is_job_seen(test_url, test_title, test_company, test_location, test_date)
    if existing is not None:
        print("✓ Job correctly identified as existing")
    else:
        print("✗ Job not found in seen jobs")
        return False
    
    # Test 4: Test job creation
    print("\n4. Testing job creation...")
    job_data = {
        'position': 'Senior AI Engineer',
        'company': 'Tech Innovations AB',
        'location': 'Stockholm, Sweden',
        'salary_min': 60000,
        'salary_max': 80000,
        'salary_currency': 'EUR',
        'job_type': 'full-time',
        'date_posted': '2024-01-01',
        'source_url': 'https://example.com/job/1',
        'description': 'Exciting AI engineering role...',
        'state': 'draft',
        'match_score': 0.85,
        'source': 'jobspy_auto',
        'is_remote': False,
        'seniority_level': 'senior'
    }
    
    job_id = data_service.create_job(job_data)
    if job_id:
        print(f"✓ Job created with ID: {job_id}")
    else:
        print("✗ Failed to create job")
        return False
    
    # Test 5: Test provenance saving
    print("\n5. Testing provenance metadata...")
    provenance_data = {
        'position': {'source': 'linkedin:title', 'score': 0.9, 'method': 'auto'},
        'company': {'source': 'linkedin:canonical', 'score': 0.95, 'method': 'auto'},
        'location': {'source': 'linkedin:anchor-prev-line', 'score': 0.8, 'method': 'auto'}
    }
    
    try:
        db.save_job_provenance(job_id, provenance_data)
        print("✓ Provenance metadata saved successfully")
    except Exception as e:
        print(f"✗ Failed to save provenance: {e}")
        return False
    
    # Test 6: Test scraper run logging
    print("\n6. Testing scraper run logging...")
    run_stats = {
        'status': 'completed',
        'jobs_fetched': 25,
        'jobs_inserted': 5,
        'jobs_deduped': 18,
        'jobs_failed': 2,
        'completed_at': '2024-01-01T12:00:00'
    }
    
    run_id = db.log_scraper_run(config_id, run_stats)
    if run_id:
        print(f"✓ Scraper run logged with ID: {run_id}")
    else:
        print("✗ Failed to log scraper run")
        return False
    
    # Test 7: Test run history retrieval
    print("\n7. Testing run history retrieval...")
    runs = db.get_scraper_runs_history(config_id, 10)
    if runs and len(runs) > 0:
        print(f"✓ Retrieved {len(runs)} run records")
        print(f"  Latest run: {runs[0]['status']} - {runs[0]['jobs_inserted']} jobs inserted")
    else:
        print("✗ Failed to retrieve run history")
        return False
    
    print("\n🎉 All tests passed! Job scraper database integration is working correctly.")
    
    # Cleanup
    print("\nCleaning up test database...")
    try:
        os.remove("test_scraper.db")
        print("✓ Test database cleaned up")
    except Exception as e:
        print(f"Warning: Could not remove test database: {e}")
    
    return True

def test_jobspy_integration():
    """Test the JobSpy integration"""
    print("\nTesting JobSpy integration...")
    
    # Test if JobSpy is available
    try:
        import jobspy
        print("✓ JobSpy package is available")
    except ImportError:
        print("⚠ JobSpy package not installed. Install with: pip install jobspy")
        return False
    
    # Test jobspy_adapter
    try:
        import jobspy_adapter
        
        # Test supported domain check
        test_urls = [
            "https://boards.greenhouse.io/company/jobs/123",
            "https://jobs.lever.co/company/123",
            "https://linkedin.com/jobs/view/123",
            "https://example.com/job/123"  # Not supported
        ]
        
        print("\nTesting domain support:")
        for url in test_urls:
            supported = jobspy_adapter.is_supported(url)
            status = "✓" if supported else "✗"
            print(f"  {status} {url}: {'Supported' if supported else 'Not supported'}")
        
        print("✓ JobSpy adapter integration working")
        return True
        
    except Exception as e:
        print(f"✗ JobSpy adapter integration failed: {e}")
        return False

if __name__ == "__main__":
    print("Job Scraper Integration Test")
    print("=" * 40)
    
    # Test database integration
    db_success = test_database_integration()
    
    # Test JobSpy integration
    jobspy_success = test_jobspy_integration()
    
    print("\n" + "=" * 40)
    if db_success and jobspy_success:
        print("🎉 ALL TESTS PASSED! Job scraper integration is ready.")
    else:
        print("❌ Some tests failed. Check the output above for details.")
        sys.exit(1)

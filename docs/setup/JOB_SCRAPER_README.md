# Job Scraper Integration Documentation

## Overview

The LLM-Notetaker now includes a comprehensive automated job scraping system that integrates JobSpy with your existing job management workflow. This system provides automated job discovery, intelligent de-duplication, scoring, and seamless integration with your job dashboard.

## Features

### ✅ Complete Implementation

- **🔄 Automated Job Scraping**: Background scheduling with configurable frequency
- **🎯 Manual Search**: On-demand job searches with instant results
- **📊 Configuration Management**: Full CRUD operations for scraper configurations
- **🔍 Smart De-duplication**: Prevents duplicate jobs across multiple sources
- **⭐ Job Scoring**: Intelligent matching and ranking system
- **📈 Progress Tracking**: Comprehensive run history and statistics
- **🎨 Integrated UI**: Seamless integration with existing job dashboard
- **🔧 Error Handling**: Graceful degradation and comprehensive error reporting

### 🚀 Key Components

1. **Database Schema** (`database.py`)
   - `job_scraper_configs`: Scraping configurations
   - `seen_jobs`: De-duplication tracking
   - `job_scraper_runs`: Run history and statistics
   - `job_provenance`: Metadata and data lineage

2. **Job Scraper Service** (`job_scraper_service.py`)
   - JobScraperService: Main orchestration class
   - JobMatcher: Intelligent scoring algorithm
   - Background scheduling with Python's `schedule` package
   - Comprehensive error handling and logging

3. **REST API Endpoints** (`app.py`)
   - `GET /api/job-scraper/configs` - List configurations
   - `POST /api/job-scraper/configs` - Create configuration
   - `PUT /api/job-scraper/configs/<id>` - Update configuration
   - `DELETE /api/job-scraper/configs/<id>` - Delete configuration
   - `POST /api/job-scraper/manual-search` - Manual search
   - `POST /api/job-scraper/import-jobs` - Import selected jobs
   - `POST /api/job-scraper/configs/<id>/run` - Run specific configuration
   - `GET /api/job-scraper/configs/<id>/runs` - Get run history

4. **Frontend Integration** (`templates/index.html`, `static/js/jobScraper.js`, `static/css/jobScraper.css`)
   - Job Scraper Configuration Modal
   - Manual Search Modal with results display
   - Job Scraper Management Panel
   - Seamless integration with existing job dashboard

## Quick Start

### 1. Verify Setup

```bash
python scripts/setup_job_scraper.py
```

This will check all dependencies, database setup, and integration points.

### 2. Add Demo Configurations (Optional)

```bash
python scripts/demo_job_configs.py --add
```

This adds sample configurations for AI/ML roles, Backend development, and Full Stack positions.

### 3. Start the Application

```bash
python app.py
```

### 4. Access the Job Dashboard

1. Open your browser to `http://localhost:5000`
2. Navigate to the Jobs section
3. Use the new job scraper buttons in the toolbar:
   - **Configure Auto Search**: Set up automated scraping
   - **Manual Search**: Run immediate searches
   - **Manage Scrapers**: View and manage configurations

## Configuration Guide

### Basic Configuration

Each scraper configuration includes:

- **Search Terms**: Job titles to search for
- **Target Locations**: Cities, regions, or "Remote"
- **Job Boards**: LinkedIn, Indeed, etc.
- **Frequency**: How often to run (hours)
- **Filters**: Salary, seniority, employment type
- **Scoring**: Minimum match threshold

### Advanced Features

- **Keyword Matching**: Required, preferred, and excluded keywords
- **Company Size Filtering**: Min/max employee count
- **Remote Work Preferences**: Remote, hybrid, on-site options
- **De-duplication**: Automatic duplicate detection
- **Provenance Tracking**: Data source metadata

## API Usage

### Create a Configuration

```bash
curl -X POST http://localhost:5000/api/job-scraper/configs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Engineer Jobs",
    "search_terms": ["AI Engineer", "Machine Learning"],
    "target_locations": ["Stockholm, Sweden", "Remote"],
    "job_boards": ["linkedin"],
    "scrape_frequency_hours": 24,
    "min_score_threshold": 0.7,
    "enabled": true
  }'
```

### Run Manual Search

```bash
curl -X POST http://localhost:5000/api/job-scraper/manual-search \
  -H "Content-Type: application/json" \
  -d '{
    "search_terms": ["Python Developer"],
    "locations": ["Berlin, Germany"],
    "job_boards": ["linkedin"],
    "max_results": 20
  }'
```

### Import Jobs

```bash
curl -X POST http://localhost:5000/api/job-scraper/import-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jobs": [
      {
        "position": "Senior AI Engineer",
        "company": "Tech Corp",
        "location": "Stockholm, Sweden",
        "source_url": "https://example.com/job/123"
      }
    ]
  }'
```

## Scoring Algorithm

The JobMatcher class uses multiple factors to score jobs:

1. **Title Matching** (30%): Exact, fuzzy, and keyword matching
2. **Company Preferences** (20%): Size, industry, reputation
3. **Location Scoring** (20%): Distance, remote preferences
4. **Keyword Analysis** (15%): Required, preferred, excluded terms
5. **Salary Evaluation** (10%): Range matching and competitiveness
6. **Recency Bonus** (5%): Preference for newer postings

Scores range from 0.0 to 1.0, with configurable minimum thresholds.

## Database Schema

### job_scraper_configs
- Configuration storage with JSON fields for complex data
- Tracks enabled/disabled state and last run timestamps
- Supports versioning and audit trails

### seen_jobs
- De-duplication using URL, title, company, location, and date
- Prevents duplicate imports across multiple sources
- Maintains referential integrity with job_offers table

### job_scraper_runs
- Comprehensive run statistics and logging
- Tracks success/failure rates and performance metrics
- Enables monitoring and troubleshooting

### job_provenance
- Metadata about data sources and extraction methods
- Supports data lineage and quality assessment
- JSON storage for flexible provenance tracking

## Error Handling

The system includes comprehensive error handling:

- **Graceful Degradation**: Works without optional dependencies
- **Network Resilience**: Retries and timeout handling
- **Data Validation**: Input sanitization and type checking
- **User Feedback**: Clear error messages and status updates
- **Logging**: Detailed logs for debugging and monitoring

## Dependencies

### Required
- Flask (web framework)
- SQLite (database, built-in)
- JobSpy (job scraping)
- BeautifulSoup4 (HTML parsing)
- Requests (HTTP client)

### Optional
- schedule (automated scraping)
- ChromaDB (vector search, if available)

## Troubleshooting

### Common Issues

1. **JobSpy Import Error**
   ```bash
   pip install jobspy
   ```

2. **Schedule Package Missing**
   ```bash
   pip install schedule
   ```
   (Automated scraping will be disabled without this)

3. **Database Initialization**
   ```bash
   python app.py  # Run once to create tables
   ```

4. **Permission Issues**
   ```bash
   chmod +x *.py  # Make scripts executable
   ```

### Debug Tools

- `python test_job_scraper.py` - Comprehensive integration test
- `python scripts/demo_job_configs.py --show` - View current configurations
- `python scripts/setup_job_scraper.py` - Full system verification

## Advanced Usage

### Custom Scoring

You can customize the JobMatcher scoring algorithm by modifying the weights in `job_scraper_service.py`:

```python
# Scoring weights (must sum to 1.0)
title_weight = 0.30
company_weight = 0.20
location_weight = 0.20
keywords_weight = 0.15
salary_weight = 0.10
recency_weight = 0.05
```

### Background Processing

The system supports background job processing. When the `schedule` package is available, scrapers run automatically according to their configured frequency.

### Extensibility

The modular design allows easy extension:

- Add new job boards by extending the JobSpy integration
- Implement custom scoring algorithms
- Add new data sources and enrichment pipelines
- Integrate with external APIs and services

## Security Considerations

- Input validation on all API endpoints
- SQL injection prevention with parameterized queries
- XSS protection in frontend components
- Rate limiting for external API calls
- Secure handling of sensitive configuration data

## Performance

- Efficient de-duplication using database indexes
- Batch processing for large result sets
- Asynchronous background processing
- Memory-efficient streaming for large files
- Configurable limits to prevent resource exhaustion

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Run the diagnostic tools (`scripts/setup_job_scraper.py`)
3. Review the application logs
4. Check the GitHub repository for updates

## License

This job scraper integration follows the same license as the main LLM-Notetaker project.

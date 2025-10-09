# Web Search Setup Guide

All search engines in this guide are **100% FREE** to use.

## Quick Start (No Setup Required)

The system works out of the box with **DuckDuckGo** - no API keys or configuration needed!

## Optional Free Enhancements

### 1. Brave Search API (Recommended)

**Free tier: 2,000 queries/month** - No credit card required

#### Setup:
1. Go to https://brave.com/search/api/
2. Sign up for a free account
3. Get your API key
4. Add to your environment:
   ```bash
   export BRAVE_API_KEY="your-api-key-here"
   ```
5. Restart the application

**Benefits:**
- Independent search index (not relying on Google)
- High-quality results
- Good for technical queries
- Privacy-focused

### 2. SearXNG (Self-hosted)

**Completely free and unlimited** - Runs on your own machine

#### Quick Setup with Docker:
```bash
# Run SearXNG locally
docker run -d \
  --name searxng \
  -p 8080:8080 \
  searxng/searxng

# Set environment variable
export SEARXNG_URL="http://localhost:8080"
```

#### Alternative: Use Public Instance
```bash
# Less reliable but no self-hosting needed
export SEARXNG_URL="https://searx.be"
# Or find others at: https://searx.space/
```

**Benefits:**
- Aggregates results from multiple search engines
- Privacy-focused (no tracking)
- Completely free and unlimited
- No API keys needed

### 3. Multi-Engine Configuration

Configure multiple engines for automatic fallback:

```bash
# Enable automatic fallback
export ENABLE_SEARCH_FALLBACK="true"

# Configure all free engines
export BRAVE_API_KEY="your-brave-key"
export SEARXNG_URL="http://localhost:8080"

# Optional: Domain whitelist
export SEARCH_DOMAIN_WHITELIST="wikipedia.org,github.com,stackoverflow.com"
```

## Configuration Options

### Environment Variables

```bash
# Search behavior
ENABLE_SEARCH_FALLBACK=true          # Auto-fallback to other engines
SEARCH_MIN_RESULTS=2                  # Minimum acceptable results
SEARCH_MAX_RESULTS=6                  # Maximum results to return
SEARCH_CONCURRENT_REQUESTS=10         # Parallel requests

# Quality filtering
SEARCH_MIN_QUALITY=0.3                # Minimum quality score (0-1)
SEARCH_MIN_WORDS=100                  # Minimum words per result

# Domain filtering (optional)
SEARCH_DOMAIN_WHITELIST="wikipedia.org,github.com"
```

## How It Works

### Search Priority

1. **DuckDuckGo** (Primary) - Always available, no setup
2. **Brave** (Fallback 1) - If API key is configured
3. **SearXNG** (Fallback 2) - If instance is configured

### Automatic Fallback

If the primary engine fails or returns insufficient results, the system automatically tries the next available engine.

### Parallel Search

For critical queries, you can enable parallel search to query all engines simultaneously and merge results.

## Cost Comparison

| Engine | Cost | Setup Time | Quality | Privacy |
|--------|------|------------|---------|---------|
| DuckDuckGo | FREE | 0 min | Good | High |
| Brave API | FREE (2K/mo) | 5 min | Excellent | High |
| SearXNG | FREE (unlimited) | 10 min | Good | Highest |

## Testing Your Setup

```python
from app.integrations.search_engines.multi_engine import MultiEngineSearch
from app.config.search_config import SearchConfig
import asyncio

# Check configuration
print("Available engines:", SearchConfig.get_available_engines())
print(SearchConfig.get_setup_instructions())

# Test search
async def test_search():
    searcher = MultiEngineSearch(
        brave_api_key=SearchConfig.BRAVE_API_KEY,
        searxng_url=SearchConfig.SEARXNG_URL
    )
    
    results, engine = await searcher.search("Python async programming")
    print(f"Found {len(results)} results using {engine}")
    
asyncio.run(test_search())
```

## Troubleshooting

### SearXNG Connection Issues
```bash
# Check if SearXNG is running
curl http://localhost:8080/search?q=test&format=json

# View logs
docker logs searxng
```

### Brave API Rate Limits
- Free tier: 2,000 queries/month
- Monitor usage at https://brave.com/search/api/
- Falls back to other engines automatically

### All Engines Failing
- Check your internet connection
- Verify environment variables are set
- DuckDuckGo should always work as fallback

## Advanced: Custom Search Instance

You can run your own search aggregator:

```bash
# YaCy (P2P search, completely decentralized)
docker run -d -p 8090:8090 yacy/yacy_search_server

# Configure
export SEARXNG_URL="http://localhost:8090"
```

## Security Notes

- All engines support HTTPS
- No search queries are logged by default
- SearXNG provides maximum privacy when self-hosted
- Brave Search doesn't track or profile users

## Recommended Setup for Production

1. **Self-host SearXNG** (unlimited, private)
2. **Add Brave API key** as backup (high quality)
3. **Keep DuckDuckGo** as final fallback

This gives you:
- ✓ Three independent search engines
- ✓ Automatic failover
- ✓ Zero cost
- ✓ High privacy
- ✓ Excellent reliability

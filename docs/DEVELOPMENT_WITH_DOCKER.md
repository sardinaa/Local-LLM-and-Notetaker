# Development Setup: Local App + Docker Search Engines

This guide shows you how to run your Flask app **locally** (for easy debugging) while using **Docker** for the search engines.

## 🎯 Why This Setup?

**Benefits:**
- ✅ Debug your Flask app normally (breakpoints, hot reload, etc.)
- ✅ Use SearXNG + YaCy from Docker (no complex installation)
- ✅ Fast development cycle (no Docker rebuilds)
- ✅ Full IDE/debugger support
- ✅ See logs in real-time

## 🚀 Quick Start

### 1. Start Only the Search Engines (Not Your App)

```bash
# Start SearXNG and YaCy in Docker
docker compose up -d searxng yacy

# Check they're running
docker compose ps
```

This starts **only** the search engines, not your app container.

### 2. Run Your App Locally

```bash
# Activate your virtual environment
source notetaker/bin/activate

# Run your app normally
python run.py
```

Now your app runs on `http://localhost:5000` as usual!

### 3. Configure Search Engines

The Docker services are exposed on your host:
- **SearXNG**: http://localhost:8080
- **YaCy**: http://localhost:8090

Your app needs to use these URLs instead of the Docker internal URLs.

**Option A: Set environment variables**
```bash
export SEARXNG_URL="http://localhost:8080"
export YACY_URL="http://localhost:8090"
python run.py
```

**Option B: Use the helper script**
```bash
./dev-start.sh
```

**Option C: Update your config directly**
Edit `app/config/search_config.py` to use localhost URLs by default.

## 🔧 Development Workflow

```bash
# Terminal 1: Start Docker search engines
docker compose up searxng yacy

# Terminal 2: Run your app with hot reload
export SEARXNG_URL="http://localhost:8080"
export YACY_URL="http://localhost:8090"
export FLASK_DEBUG=1
python run.py
```

Now you can:
- Edit code and see changes immediately
- Set breakpoints in VSCode/PyCharm
- Use `print()` statements (visible in terminal)
- Debug with full Python tools
- Check Docker logs: `docker compose logs -f searxng yacy`

## 🐛 Debugging Tips

### Check Docker Services
```bash
# Are they running?
docker compose ps

# View logs
docker compose logs -f searxng
docker compose logs -f yacy

# Restart if needed
docker compose restart searxng
docker compose restart yacy
```

### Test Search Engines Directly
```bash
# Test SearXNG
curl "http://localhost:8080/search?q=python&format=json"

# Test YaCy
curl "http://localhost:8090/yacysearch.json?query=python&maximumRecords=5"

# Or open in browser:
# - http://localhost:8080
# - http://localhost:8090
```

### Run Your Test Suite
```bash
# Test Docker search engines
python test_docker_search.py

# Test all engines (including DuckDuckGo)
python test_all_search_engines.py
```

### Debug Your App's Search Integration
```python
# In your code, add logging:
import logging
logging.basicConfig(level=logging.DEBUG)

# Or use prints in app/integrations/search_engines/
print(f"DEBUG: Querying SearXNG at {searxng_url}")
print(f"DEBUG: Got {len(results)} results")
```

## 📦 Full Docker Mode (Production-like)

If you want to run **everything** in Docker:

```bash
# Start all containers (including your app)
docker compose up -d

# View logs
docker compose logs -f

# Your app is at: http://localhost:5000
# But code changes require rebuild:
docker compose up -d --build llm-notetaker
```

## 🛑 Stopping Services

```bash
# Stop only search engines (keep your local app running)
docker compose stop searxng yacy

# Stop and remove all containers
docker compose down

# Stop and remove including volumes (fresh start)
docker compose down -v
```

## 📊 Service URLs

| Service | Docker Internal | Host/Localhost | Purpose |
|---------|----------------|----------------|---------|
| SearXNG | http://searxng:8080 | http://localhost:8080 | 70+ search engines |
| YaCy | http://yacy:8090 | http://localhost:8090 | P2P search |
| Your App | http://llm-notetaker:5000 | http://localhost:5000 | Flask app |

**Use Docker internal URLs** when your app runs in Docker.
**Use localhost URLs** when your app runs on your host.

## ✨ Recommended: VSCode Launch Config

Add to `.vscode/launch.json`:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Flask with Docker Search",
            "type": "debugpy",
            "request": "launch",
            "module": "flask",
            "env": {
                "FLASK_APP": "run.py",
                "FLASK_ENV": "development",
                "FLASK_DEBUG": "1",
                "SEARXNG_URL": "http://localhost:8080",
                "YACY_URL": "http://localhost:8090"
            },
            "args": [
                "run",
                "--host=0.0.0.0",
                "--port=5000"
            ],
            "jinja": true,
            "console": "integratedTerminal"
        }
    ]
}
```

Then just press F5 to debug!

## 🎓 Summary

**For Development (Recommended):**
```bash
docker compose up -d searxng yacy  # Start search engines
export SEARXNG_URL="http://localhost:8080"
export YACY_URL="http://localhost:8090"
python run.py                       # Run your app locally
```

**For Production Testing:**
```bash
docker compose up -d                # Start everything
```

**For Production Deployment:**
```bash
docker compose -f docker-compose.prod.yml up -d
```

This gives you the **best of both worlds**: easy debugging + powerful Docker search engines! 🚀

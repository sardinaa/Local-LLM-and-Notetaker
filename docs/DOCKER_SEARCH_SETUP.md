# 🐳 Docker Setup Guide - LLM-Notetaker with Search Engines

## Overview

This guide helps you run your LLM-Notetaker app with **SearXNG** and **YaCy** search engines in Docker containers.

### What You'll Get

- ✅ **Your App** - LLM-Notetaker running in Docker
- ✅ **SearXNG** - Meta-search engine (aggregates 70+ search engines)
- ✅ **YaCy** - Decentralized P2P search engine
- ✅ **All connected** - Your app automatically uses both engines
- ✅ **100% FREE** - Unlimited searches, no API keys needed!

---

## 🚀 Quick Start (5 minutes)

### Prerequisites
```bash
# Check you have Docker installed
docker --version
docker-compose --version

# If not installed:
# Ubuntu/Debian: sudo apt install docker.io docker-compose
# Mac: Install Docker Desktop
# Windows: Install Docker Desktop
```

### Step 1: Copy Environment File
```bash
cp .env.example .env

# Optional: Add Brave/Mojeek API keys in .env
# nano .env
```

### Step 2: Start Everything
```bash
# Build and start all containers
docker-compose up -d

# This will:
# 1. Build your LLM-Notetaker container
# 2. Pull SearXNG container
# 3. Pull YaCy container
# 4. Start all three services
# 5. Connect them together
```

### Step 3: Wait for Services to Start
```bash
# Watch the logs
docker-compose logs -f

# Wait for these messages:
# - llm-notetaker: "Running on http://0.0.0.0:5000"
# - searxng: "listening on"
# - yacy: "server is ready" (takes 2-3 minutes)

# Press Ctrl+C to stop watching logs
```

### Step 4: Test It!
```bash
# Your app
open http://localhost:5000

# SearXNG web interface
open http://localhost:8080

# YaCy web interface
open http://localhost:8090

# Test search
./notetaker/bin/python test_search_simple.py
```

---

## 📊 Service Details

### Port Mappings
| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| LLM-Notetaker | 5000 | http://localhost:5000 | Your main app |
| SearXNG | 8080 | http://localhost:8080 | Meta-search engine |
| YaCy | 8090 | http://localhost:8090 | P2P search engine |

### Automatic Configuration

Your app is automatically configured to use:
- `SEARXNG_URL=http://searxng:8080` (internal Docker network)
- `YACY_URL=http://yacy:8090` (internal Docker network)

No manual configuration needed!

---

## 🔧 Common Commands

### Start Everything
```bash
docker-compose up -d
```

### Stop Everything
```bash
docker-compose down
```

### Restart a Service
```bash
# Restart specific service
docker-compose restart llm-notetaker
docker-compose restart searxng
docker-compose restart yacy

# Or restart all
docker-compose restart
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f llm-notetaker
docker-compose logs -f searxng
docker-compose logs -f yacy

# Last 100 lines
docker-compose logs --tail=100
```

### Check Status
```bash
docker-compose ps
```

### Rebuild After Code Changes
```bash
# Rebuild your app container
docker-compose build llm-notetaker

# Restart with new build
docker-compose up -d llm-notetaker
```

### Clean Everything
```bash
# Stop and remove containers
docker-compose down

# Remove volumes too (deletes YaCy data)
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

---

## 🎯 Testing the Setup

### Test 1: Check Services are Running
```bash
docker-compose ps

# Should show:
# llm-notetaker   running   0.0.0.0:5000->5000/tcp
# searxng         running   0.0.0.0:8080->8080/tcp
# yacy            running   0.0.0.0:8090->8090/tcp
```

### Test 2: Check SearXNG
```bash
curl http://localhost:8080/search?q=test&format=json | jq '.results | length'

# Should return a number (e.g., 10)
```

### Test 3: Check YaCy
```bash
curl http://localhost:8090/Status.html

# Should return HTML with "YaCy"
```

### Test 4: Test Your App's Search
```bash
# Run test inside container
docker-compose exec llm-notetaker python test_search_simple.py

# Or from host (if virtualenv exists)
./notetaker/bin/python test_search_simple.py
```

### Test 5: Manual Search Test
```python
# Inside Python
from app.integrations.search_engines.multi_engine import MultiEngineSearch

searcher = MultiEngineSearch(
    searxng_url='http://localhost:8080',
    yacy_url='http://localhost:8090',
    enable_fallback=True
)

results, engine = await searcher.search('Python programming')
print(f"Found {len(results)} results using {engine}")
```

---

## 📁 File Structure

```
LLM-Notetaker/
├── docker-compose.yml          # Main Docker configuration
├── Dockerfile                  # Your app's Docker image
├── .env.example               # Environment template
├── .env                       # Your environment (git-ignored)
├── searxng-config/
│   └── settings.yml           # SearXNG configuration
├── data/                      # Persistent data
│   ├── uploads/
│   ├── chroma_db/
│   └── db/
└── yacy-data/                 # YaCy index (Docker volume)
```

---

## ⚙️ Configuration

### SearXNG Configuration

Edit `searxng-config/settings.yml` to:
- Enable/disable specific search engines
- Change search settings
- Customize UI

After changes:
```bash
docker-compose restart searxng
```

### YaCy Configuration

Access YaCy web interface: http://localhost:8090
- First time: Set admin password
- Configure: Settings → Performance
- Add crawl rules if desired

### Your App Configuration

Edit `.env` file:
```bash
# Optional API keys
BRAVE_API_KEY=your-brave-key
MOJEEK_API_KEY=your-mojeek-key

# Search configuration
ENABLE_QWANT=false
```

After changes:
```bash
docker-compose restart llm-notetaker
```

---

## 🔍 Search Engine Capabilities

### SearXNG (Port 8080)
- **Aggregates**: Google, Bing, DDG, Brave, Qwant, + 65 more
- **Speed**: Fast (parallel queries)
- **Quality**: Excellent (combines multiple sources)
- **Privacy**: High (no tracking)
- **Limit**: Unlimited

### YaCy (Port 8090)
- **Type**: P2P decentralized search
- **Index**: 1+ billion pages in network
- **Speed**: Variable (depends on network)
- **Quality**: Good (improves over time)
- **Privacy**: Maximum (fully decentralized)
- **Limit**: Unlimited

### Your Complete Setup
When both are running, you have:
1. **DuckDuckGo** (built-in)
2. **SearXNG** (70+ engines)
3. **YaCy** (P2P network)
4. **Brave** (if API key added)
5. **Mojeek** (if API key added)

**Total**: 5+ search sources with automatic fallback!

---

## 🐛 Troubleshooting

### Problem: Containers won't start
```bash
# Check logs
docker-compose logs

# Common fixes:
# 1. Ports already in use
sudo lsof -i :5000  # Find what's using port 5000
sudo lsof -i :8080  # Find what's using port 8080
sudo lsof -i :8090  # Find what's using port 8090

# 2. Permission issues
sudo chown -R $USER:$USER searxng-config/

# 3. Docker daemon not running
sudo systemctl start docker
```

### Problem: YaCy is slow
```bash
# YaCy needs time to:
# 1. Start up (2-3 minutes)
# 2. Connect to P2P network (5-10 minutes)
# 3. Build local index (ongoing)

# Check YaCy logs
docker-compose logs yacy | grep "ready"

# Give it time on first run!
```

### Problem: SearXNG returns no results
```bash
# Check configuration
docker-compose exec searxng cat /etc/searxng/settings.yml

# Test directly
curl http://localhost:8080/search?q=test&format=json

# Restart if needed
docker-compose restart searxng
```

### Problem: App can't connect to search engines
```bash
# Check network
docker network ls
docker network inspect llm-notetaker_llm-network

# Check DNS resolution inside container
docker-compose exec llm-notetaker ping searxng
docker-compose exec llm-notetaker ping yacy

# Check environment variables
docker-compose exec llm-notetaker env | grep URL
```

### Problem: "No space left on device"
```bash
# Clean Docker system
docker system prune -a

# Remove unused volumes
docker volume prune

# Check disk space
df -h
```

---

## 🚀 Production Deployment

### Security Considerations

1. **Change SearXNG secret key**
   ```yaml
   # In searxng-config/settings.yml
   server:
     secret_key: "your-random-secret-key-here"
   ```

2. **Use environment files**
   ```bash
   # Don't commit .env to git
   echo ".env" >> .gitignore
   ```

3. **Set up reverse proxy** (nginx/traefik)
   ```nginx
   # Example nginx config
   location / {
     proxy_pass http://localhost:5000;
   }
   location /search/ {
     proxy_pass http://localhost:8080;
   }
   ```

4. **Enable HTTPS** (Let's Encrypt)

### Performance Tuning

1. **Limit YaCy memory**
   ```yaml
   # In docker-compose.yml under yacy service
   mem_limit: 2g
   ```

2. **Scale SearXNG**
   ```bash
   docker-compose up -d --scale searxng=2
   ```

3. **Use Docker volumes for persistence**
   ```yaml
   volumes:
     - ./data/uploads:/app/data/uploads:rw
   ```

---

## 📈 Monitoring

### Check Health
```bash
# All services
docker-compose ps

# Health checks
docker inspect llm-notetaker | grep -A5 Health
docker inspect searxng | grep -A5 Health
docker inspect yacy | grep -A5 Health
```

### Monitor Resources
```bash
# CPU and Memory usage
docker stats

# Disk usage
docker system df
```

### Log Analysis
```bash
# Search for errors
docker-compose logs | grep -i error

# Count requests
docker-compose logs searxng | grep "GET /search" | wc -l
```

---

## 🎉 Success!

You now have:
- ✅ Your LLM-Notetaker app running in Docker
- ✅ SearXNG providing 70+ search engines
- ✅ YaCy providing P2P decentralized search
- ✅ All connected with automatic failover
- ✅ 100% free, unlimited searches
- ✅ Production-ready containerized setup

### Next Steps

1. **Test it**: Run `./notetaker/bin/python test_search_simple.py`
2. **Use it**: Open http://localhost:5000
3. **Monitor it**: Check logs with `docker-compose logs -f`
4. **Improve it**: Add Brave/Mojeek API keys for even more coverage

### Cost Breakdown
- Docker: Free
- SearXNG: Free (unlimited)
- YaCy: Free (unlimited)
- Your time: 5-10 minutes

**Total monthly cost: $0.00** 🎊

---

## 📚 Resources

- **Docker Compose**: https://docs.docker.com/compose/
- **SearXNG**: https://docs.searxng.org/
- **YaCy**: https://yacy.net/
- **Your docs**: 
  - `HONEST_STATUS.md` - Current system status
  - `REALISTIC_SEARCH_GUIDE.md` - Search engine comparison
  - `QWANT_SOLUTIONS.md` - Why we skip Qwant

---

**Need help?** Check the logs: `docker-compose logs -f`

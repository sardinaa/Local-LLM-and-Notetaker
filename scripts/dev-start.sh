#!/bin/bash

# Development startup script
# Starts Docker search engines and runs Flask app locally for easy debugging

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║  🔧 Development Mode: Local App + Docker Search Engines      ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Detect Docker Compose command
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Docker Compose is not installed!"
    exit 1
fi

echo "📋 Step 1: Starting Docker search engines..."
echo "   (SearXNG + YaCy only, not the app container)"
echo ""

# Start only searxng and yacy services
$DOCKER_COMPOSE up -d searxng yacy

echo ""
echo "⏳ Waiting for services to start..."
sleep 3

echo ""
echo "📊 Docker Service Status:"
$DOCKER_COMPOSE ps searxng yacy

echo ""
echo "📋 Step 2: Checking search engine health..."

# Check SearXNG
if curl -s http://localhost:8080/healthz > /dev/null 2>&1; then
    echo "   ✅ SearXNG is ready (http://localhost:8080)"
else
    echo "   ⚠️  SearXNG may still be starting... (wait 10-20 seconds)"
fi

# Check YaCy
if curl -s http://localhost:8090/Status.html > /dev/null 2>&1; then
    echo "   ✅ YaCy is ready (http://localhost:8090)"
else
    echo "   ⚠️  YaCy may still be starting... (wait 30-60 seconds)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🎉 Docker search engines are running!"
echo ""
echo "📋 Step 3: Starting your Flask app locally..."
echo ""
echo "   Your app will use:"
echo "   • SearXNG: http://localhost:8080"
echo "   • YaCy:    http://localhost:8090"
echo "   • DuckDuckGo: Direct API"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if virtual environment exists
if [ ! -d "notetaker" ]; then
    echo "❌ Virtual environment 'notetaker' not found!"
    echo "   Create it with: python3 -m venv notetaker"
    exit 1
fi

# Activate virtual environment and run the app
export SEARXNG_URL="http://localhost:8080"
export YACY_URL="http://localhost:8090"
export FLASK_ENV="development"
export FLASK_DEBUG="1"

echo "🚀 Starting Flask app with environment:"
echo "   SEARXNG_URL=$SEARXNG_URL"
echo "   YACY_URL=$YACY_URL"
echo "   FLASK_ENV=$FLASK_ENV"
echo "   FLASK_DEBUG=$FLASK_DEBUG"
echo ""
echo "───────────────────────────────────────────────────────────────"
echo ""

# Run the app (it will take over this terminal)
exec ./notetaker/bin/python run.py

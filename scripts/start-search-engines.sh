#!/bin/bash

# Simple script to start only Docker search engines (not the app)
# Use this when you want to run your Flask app manually

set -e

echo "🐳 Starting Docker search engines only..."
echo ""

# Detect Docker Compose command
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Docker Compose is not installed!"
    exit 1
fi

# Start only search engines
$DOCKER_COMPOSE up -d searxng yacy

echo ""
echo "✅ Docker search engines started!"
echo ""
echo "Services:"
echo "  • SearXNG: http://localhost:8080"
echo "  • YaCy:    http://localhost:8090"
echo ""
echo "Check status:"
echo "  docker compose ps"
echo ""
echo "View logs:"
echo "  docker compose logs -f searxng"
echo "  docker compose logs -f yacy"
echo ""
echo "Now run your app with:"
echo "  export SEARXNG_URL='http://localhost:8080'"
echo "  export YACY_URL='http://localhost:8090'"
echo "  python run.py"
echo ""
echo "Or use the dev helper:"
echo "  ./dev-start.sh"

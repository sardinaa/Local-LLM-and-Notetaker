#!/bin/bash

# 🐳 LLM-Notetaker Docker Quick Start Script
# This script sets up and runs your app with SearXNG and YaCy

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║  🐳 LLM-Notetaker Docker Setup with Search Engines          ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo "   Install from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check for Docker Compose (v2 or v1)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    COMPOSE_VERSION=$(docker compose version --short)
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    COMPOSE_VERSION=$(docker-compose --version | grep -oP '\d+\.\d+\.\d+')
else
    echo "❌ Docker Compose is not installed!"
    echo "   Install from: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker found: $(docker --version)"
echo "✅ Docker Compose found: v${COMPOSE_VERSION}"
echo ""

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo "   💡 Edit .env to add optional Brave/Mojeek API keys"
else
    echo "✅ .env file already exists"
fi
echo ""

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p data/uploads data/chroma_db data/db
mkdir -p searxng-config
echo "✅ Directories created"
echo ""

# Check if containers are already running
if $DOCKER_COMPOSE ps | grep -q "Up"; then
    echo "⚠️  Some containers are already running"
    read -p "   Do you want to restart them? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 Stopping existing containers..."
        $DOCKER_COMPOSE down
    else
        echo "ℹ️  Keeping existing containers running"
        exit 0
    fi
fi

# Build and start containers
echo "🚀 Building and starting containers..."
echo "   This may take a few minutes on first run..."
echo ""
$DOCKER_COMPOSE up -d --build

echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Check if services are running
echo ""
echo "📊 Service Status:"
$DOCKER_COMPOSE ps

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                      ✅ SETUP COMPLETE!                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Your services are available at:"
echo "   • LLM-Notetaker:  http://localhost:5000"
echo "   • SearXNG:        http://localhost:8080"
echo "   • YaCy:           http://localhost:8090"
echo ""
echo "📖 Useful commands:"
echo "   • View logs:      docker-compose logs -f"
echo "   • Stop all:       docker-compose down"
echo "   • Restart:        docker-compose restart"
echo "   • Status:         docker-compose ps"
echo ""
echo "⏱️  Note: YaCy takes 2-3 minutes to fully start"
echo "    Wait a bit before testing YaCy searches"
echo ""
echo "🧪 Test your search engines:"
echo "   ./notetaker/bin/python test_search_simple.py"
echo ""
echo "📚 Read the full guide:"
echo "   cat DOCKER_SEARCH_SETUP.md"
echo ""
echo "🎉 Happy searching! Your setup includes:"
echo "   ✓ DuckDuckGo (built-in)"
echo "   ✓ SearXNG (70+ engines aggregated)"
echo "   ✓ YaCy (P2P decentralized)"
echo "   ✓ All FREE and unlimited!"
echo ""

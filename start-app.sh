#!/bin/bash

echo "🚀 Starting LLM-Notetaker with Web Search"
echo ""

# Kill any existing Flask on port 5000
lsof -ti:5000 | xargs -r kill -9 2>/dev/null

# Set environment variables for Docker search engines
export SEARXNG_URL="http://localhost:8080"
export YACY_URL="http://localhost:8090"
export FLASK_ENV="development"
export FLASK_DEBUG="1"

echo "📊 Environment configured:"
echo "   SEARXNG_URL=$SEARXNG_URL"
echo "   YACY_URL=$YACY_URL"
echo "   FLASK_DEBUG=$FLASK_DEBUG"
echo ""

echo "ℹ️  To use web search:"
echo "   1. Click the 🌐 web search toggle button"
echo "   2. Ask any question in any language"
echo "   3. Sources button will appear with results"
echo ""
echo "───────────────────────────────────────────────"
echo ""

# Start the app
./notetaker/bin/python run.py

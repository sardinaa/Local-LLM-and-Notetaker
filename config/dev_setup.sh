#!/bin/bash

# Development setup script
# Run this script when setting up the project on a new machine

echo "Setting up LLM-Notetaker development environment..."

# Check if Python virtual environment exists
if [ ! -d "notetaker" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv notetaker
fi

# Activate virtual environment
echo "Activating virtual environment..."
source notetaker/bin/activate

# Install Python dependencies
if [ -f "config/requirements.txt" ]; then
    echo "Installing Python dependencies..."
    pip install -r config/requirements.txt
fi

# Set up PDF.js
echo "Setting up PDF.js..."
./setup_pdfjs.sh

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p data/uploads
mkdir -p instance
mkdir -p static/images

echo "Development setup complete!"
echo ""
echo "To activate the virtual environment in the future, run:"
echo "source notetaker/bin/activate"
echo ""
echo "To start the application, run:"
echo "python app.py"

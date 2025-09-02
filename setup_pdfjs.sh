#!/bin/bash

# Setup script for PDF.js
# This script downloads and sets up PDF.js for the application

PDFJS_VERSION="4.0.379"  # Update this to your preferred version
PDFJS_DIR="static/pdfjs"

echo "Setting up PDF.js..."

# Create the directory if it doesn't exist
mkdir -p "$PDFJS_DIR"

# Check if PDF.js is already set up
if [ -f "$PDFJS_DIR/build/pdf.min.js" ]; then
    echo "PDF.js appears to be already set up. Skipping download."
    exit 0
fi

# Download PDF.js
echo "Downloading PDF.js version $PDFJS_VERSION..."
wget -O pdfjs-dist.zip "https://github.com/mozilla/pdf.js/releases/download/v$PDFJS_VERSION/pdfjs-$PDFJS_VERSION-dist.zip"

# Extract to temporary directory
echo "Extracting PDF.js..."
unzip -q pdfjs-dist.zip -d temp_pdfjs
mv temp_pdfjs/* "$PDFJS_DIR/"
rm -rf temp_pdfjs pdfjs-dist.zip

# Copy custom configuration files
echo "Copying custom configuration files..."
if [ -d "pdfjs-config" ]; then
    cp pdfjs-config/* "$PDFJS_DIR/" 2>/dev/null || true
    echo "Custom configuration files copied."
else
    echo "No custom configuration directory found."
fi

echo "PDF.js setup complete!"
echo "The $PDFJS_DIR directory is excluded from git tracking."

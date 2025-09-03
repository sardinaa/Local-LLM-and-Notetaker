#!/bin/bash

# Setup script for PDF.js
# This script downloads and sets up PDF.js for the application

PDFJS_VERSION="4.0.379"  # Update this to your preferred version
PDFJS_DIR="static/pdfjs"

echo "Setting up PDF.js..."

# Create the directory if it doesn't exist
mkdir -p "$PDFJS_DIR"

# Check if PDF.js is already set up
if [ -f "$PDFJS_DIR/build/pdf.js" ]; then
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
    # Copy highlight plugin to root
    if [ -f "pdfjs-config/highlight-plugin.js" ]; then
        cp pdfjs-config/highlight-plugin.js "$PDFJS_DIR/"
        echo "Copied highlight-plugin.js"
    fi
    
    # Copy customized viewer files to web directory
    if [ -f "pdfjs-config/viewer.html" ]; then
        cp pdfjs-config/viewer.html "$PDFJS_DIR/web/"
        echo "Copied customized viewer.html"
    fi
    
    if [ -f "pdfjs-config/viewer.css" ]; then
        cp pdfjs-config/viewer.css "$PDFJS_DIR/web/"
        echo "Copied customized viewer.css"
    fi
    
    # Copy custom images
    if [ -d "pdfjs-config/images" ]; then
        cp pdfjs-config/images/* "$PDFJS_DIR/web/images/" 2>/dev/null || true
        echo "Copied custom images"
    fi
    
    echo "Custom configuration files copied."
else
    echo "No custom configuration directory found."
fi

echo "PDF.js setup complete!"
echo "The $PDFJS_DIR directory is excluded from git tracking."

# Verify critical files are present
echo "Verifying setup..."
MISSING_FILES=()

if [ ! -f "$PDFJS_DIR/build/pdf.js" ]; then
    MISSING_FILES+=("build/pdf.js")
fi

if [ ! -f "$PDFJS_DIR/web/viewer.js" ]; then
    MISSING_FILES+=("web/viewer.js")
fi

if [ ! -f "$PDFJS_DIR/highlight-plugin.js" ]; then
    MISSING_FILES+=("highlight-plugin.js")
fi

if [ ! -f "$PDFJS_DIR/web/images/toolbarButton-aiHighlights.svg" ]; then
    MISSING_FILES+=("web/images/toolbarButton-aiHighlights.svg")
fi

if [ ! -f "$PDFJS_DIR/web/images/toolbarButton-guidedSelection.svg" ]; then
    MISSING_FILES+=("web/images/toolbarButton-guidedSelection.svg")
fi

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
    echo "✅ All required files are present!"
else
    echo "⚠️  Missing files detected:"
    for file in "${MISSING_FILES[@]}"; do
        echo "   - $file"
    done
    echo "You may experience 404 errors. Please check the setup."
fi

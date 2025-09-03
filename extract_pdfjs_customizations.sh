#!/bin/bash

# Script to extract customizations from current PDF.js installation
# Run this when you've made changes to PDF.js that you want to preserve

PDFJS_DIR="static/pdfjs"
CONFIG_DIR="pdfjs-config"

echo "Extracting PDF.js customizations to preserve in git..."

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Extract highlight plugin
if [ -f "$PDFJS_DIR/highlight-plugin.js" ]; then
    cp "$PDFJS_DIR/highlight-plugin.js" "$CONFIG_DIR/"
    echo "Extracted highlight-plugin.js"
fi

# Extract customized viewer.html
if [ -f "$PDFJS_DIR/web/viewer.html" ]; then
    # Check if it contains our customizations
    if grep -q "highlight-plugin.js" "$PDFJS_DIR/web/viewer.html"; then
        cp "$PDFJS_DIR/web/viewer.html" "$CONFIG_DIR/"
        echo "Extracted customized viewer.html"
    else
        echo "viewer.html doesn't appear to be customized"
    fi
fi

# Extract customized viewer.css
if [ -f "$PDFJS_DIR/web/viewer.css" ]; then
    # Check if it contains our highlight customizations
    if grep -q "highlight-bg-color" "$PDFJS_DIR/web/viewer.css"; then
        cp "$PDFJS_DIR/web/viewer.css" "$CONFIG_DIR/"
        echo "Extracted customized viewer.css"
    else
        echo "viewer.css doesn't appear to be customized"
    fi
fi

echo "Customization extraction complete!"
echo "These files are now preserved in $CONFIG_DIR and will be tracked in git."

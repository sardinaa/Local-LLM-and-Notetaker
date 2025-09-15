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

# Extract custom images
echo "Checking for custom images..."
mkdir -p "$CONFIG_DIR/images"
CUSTOM_IMAGES_FOUND=false

# List of known custom images
CUSTOM_IMAGE_PATTERNS=("toolbarButton-aiHighlights.svg" "toolbarButton-guidedSelection.svg")

for pattern in "${CUSTOM_IMAGE_PATTERNS[@]}"; do
    if [ -f "$PDFJS_DIR/web/images/$pattern" ]; then
        cp "$PDFJS_DIR/web/images/$pattern" "$CONFIG_DIR/images/"
        echo "Extracted custom image: $pattern"
        CUSTOM_IMAGES_FOUND=true
    fi
done

if [ "$CUSTOM_IMAGES_FOUND" = false ]; then
    rmdir "$CONFIG_DIR/images" 2>/dev/null || true
    echo "No custom images found"
fi

echo "Customization extraction complete!"
echo "These files are now preserved in $CONFIG_DIR and will be tracked in git."

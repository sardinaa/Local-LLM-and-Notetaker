# PDF.js Troubleshooting Guide

## Common 404 Errors and Solutions

### Error: "GET /static/pdfjs/build/pdf.js 404 NOT FOUND"

**Cause**: PDF.js core files are missing or incompatible version downloaded
**Solution**: 
```bash
./setup_pdfjs.sh
```

**Note**: The setup script uses PDF.js v3.11.174 which is compatible with the custom configuration. Newer versions (4.0+) use `.mjs` files instead of `.js` files and are not compatible with the current setup.

### Error: "GET /static/pdfjs/web/viewer.js 404 NOT FOUND"

**Cause**: PDF.js viewer files are missing or incompatible version downloaded
**Solution**: 
```bash
./setup_pdfjs.sh
```

### Error: "GET /static/pdfjs/web/images/toolbarButton-aiHighlights.svg 404 NOT FOUND"

**Cause**: Custom toolbar icons are missing
**Solution**: 
```bash
./setup_pdfjs.sh
```
This script now copies custom images from `pdfjs-config/images/`

## Manual Verification

Check if all required files exist:

```bash
# Core PDF.js files
ls -la static/pdfjs/build/pdf.js
ls -la static/pdfjs/web/viewer.js

# Custom files
ls -la static/pdfjs/highlight-plugin.js
ls -la static/pdfjs/web/images/toolbarButton-aiHighlights.svg
ls -la static/pdfjs/web/images/toolbarButton-guidedSelection.svg
```

## Setup Script Verification

The setup script now includes automatic verification. Look for this output:
```
✅ All required files are present!
```

If you see warnings about missing files, run the setup script again or check your `pdfjs-config/` directory.

## Fresh Setup

If you're still having issues, try a complete fresh setup:

```bash
# Force reinstall (removes existing installation)
./setup_pdfjs.sh --force
```

Or manually:
```bash
# Remove existing installation
rm -rf static/pdfjs

# Run setup again
./setup_pdfjs.sh
```

## Custom Configuration Files

Make sure these files exist in `pdfjs-config/`:
- `highlight-plugin.js`
- `viewer.html`
- `viewer.css`
- `images/toolbarButton-aiHighlights.svg`
- `images/toolbarButton-guidedSelection.svg`

If any are missing, you can extract them from a working installation using:
```bash
./extract_pdfjs_customizations.sh
```

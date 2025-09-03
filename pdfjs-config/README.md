# PDF.js Setup Instructions

The `/static/pdfjs` directory is excluded from git tracking to keep the repository size manageable, but you'll need PDF.js for the application to work properly.

## Quick Setup

Run the setup script to automatically download and configure PDF.js:

```bash
./setup_pdfjs.sh
```

## Manual Setup

If you prefer to set up PDF.js manually:

1. Download PDF.js from the [official releases](https://github.com/mozilla/pdf.js/releases)
2. Extract the contents to `/static/pdfjs/`
3. Copy custom configuration files from `/pdfjs-config/` to `/static/pdfjs/`:
   ```bash
   cp pdfjs-config/* static/pdfjs/
   ```

## Custom Configuration Files

The `/pdfjs-config/` directory contains:

- `highlight-plugin.js` - Custom highlighting functionality for the PDF viewer
- (Add other custom configuration files here as needed)

## After Setup

After running the setup, your `/static/pdfjs/` directory should contain:
- `build/` - Core PDF.js files
- `web/` - PDF.js web viewer
- `cmaps/` - Character mapping files
- `standard_fonts/` - Standard PDF fonts
- `highlight-plugin.js` - Your custom highlight plugin

## Notes

- The setup script will skip downloading if PDF.js is already present
- Custom configuration files are preserved in `/pdfjs-config/` and tracked in git
- Update the `PDFJS_VERSION` in `setup_pdfjs.sh` to use different PDF.js versions

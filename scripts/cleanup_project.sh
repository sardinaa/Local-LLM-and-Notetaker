#!/bin/bash
#
# Project Cleanup Script
# Cleans up scattered files and organizes the project root
#
# Usage: bash scripts/cleanup_project.sh

set -e  # Exit on error

echo "============================================"
echo "LLM-Notetaker Project Cleanup"
echo "============================================"
echo ""

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Working directory: $PROJECT_ROOT"
echo ""

# Function to prompt user
confirm() {
    read -p "$1 (y/n) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# =====================
# 1. Remove strange files
# =====================
echo "📁 Step 1: Removing strange version files..."
if [ -f "=0.8.4" ] || [ -f "=4.12.0" ]; then
    if confirm "Remove =0.8.4 and =4.12.0 files?"; then
        rm -f =0.8.4 =4.12.0
        echo "  ✓ Removed version files"
    else
        echo "  ⊘ Skipped"
    fi
else
    echo "  ✓ No strange version files found"
fi
echo ""

# =====================
# 2. Remove __pycache__
# =====================
echo "📁 Step 2: Removing root-level __pycache__..."
if [ -d "__pycache__" ]; then
    if confirm "Remove __pycache__ at root level?"; then
        rm -rf __pycache__
        echo "  ✓ Removed __pycache__"
    else
        echo "  ⊘ Skipped"
    fi
else
    echo "  ✓ No root-level __pycache__ found"
fi
echo ""

# =====================
# 3. Handle Dart files
# =====================
echo "📁 Step 3: Handling Dart files..."
DART_FILES=$(ls *.dart 2>/dev/null | wc -l)
if [ "$DART_FILES" -gt 0 ]; then
    echo "  Found $DART_FILES Dart files:"
    ls *.dart
    echo ""
    echo "  Options:"
    echo "    1) Delete all Dart files (if not needed)"
    echo "    2) Move to utils/dart_scripts/"
    echo "    3) Keep as-is"
    read -p "  Choose option (1/2/3): " -n 1 -r
    echo ""
    
    case $REPLY in
        1)
            rm -f *.dart
            echo "  ✓ Deleted Dart files"
            ;;
        2)
            mkdir -p utils/dart_scripts
            mv *.dart utils/dart_scripts/
            echo "  ✓ Moved Dart files to utils/dart_scripts/"
            ;;
        3)
            echo "  ⊘ Keeping Dart files as-is"
            ;;
        *)
            echo "  ⊘ Invalid option, skipping"
            ;;
    esac
else
    echo "  ✓ No Dart files found"
fi
echo ""

# =====================
# 4. Remove Jupyter temp files
# =====================
echo "📁 Step 4: Removing Jupyter temp files..."
if [ -d ".ipynb_checkpoints" ]; then
    if confirm "Remove .ipynb_checkpoints?"; then
        rm -rf .ipynb_checkpoints
        echo "  ✓ Removed .ipynb_checkpoints"
    else
        echo "  ⊘ Skipped"
    fi
else
    echo "  ✓ No .ipynb_checkpoints found"
fi
echo ""

# =====================
# 5. Review legacy folders
# =====================
echo "📁 Step 5: Reviewing legacy folders..."
echo ""

if [ -d "legacy_backup" ]; then
    echo "  📂 legacy_backup/ exists"
    echo "     Size: $(du -sh legacy_backup | cut -f1)"
    if confirm "     Archive and compress legacy_backup/?"; then
        tar -czf legacy_backup_$(date +%Y%m%d).tar.gz legacy_backup/
        rm -rf legacy_backup/
        echo "  ✓ Created legacy_backup_$(date +%Y%m%d).tar.gz"
    else
        echo "  ⊘ Keeping legacy_backup/"
    fi
else
    echo "  ✓ No legacy_backup folder"
fi
echo ""

if [ -d "backups" ]; then
    echo "  📂 backups/ exists"
    echo "     Size: $(du -sh backups | cut -f1)"
    if confirm "     Archive and compress backups/?"; then
        tar -czf backups_$(date +%Y%m%d).tar.gz backups/
        rm -rf backups/
        echo "  ✓ Created backups_$(date +%Y%m%d).tar.gz"
    else
        echo "  ⊘ Keeping backups/"
    fi
else
    echo "  ✓ No backups folder"
fi
echo ""

# =====================
# 6. Summary
# =====================
echo "============================================"
echo "Cleanup Summary"
echo "============================================"
echo ""
echo "Current root-level structure:"
ls -1 | head -20
echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Recommended next steps:"
echo "  1. Review the PROJECT_ORGANIZATION.md file"
echo "  2. Commit the changes to git"
echo "  3. Test the application: source notetaker/bin/activate && python run.py"
echo ""

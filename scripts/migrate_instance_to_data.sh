#!/bin/bash
#
# Consolidate instance/ folder into data/ folder
# This script migrates all instance-specific data to the data/ directory
#
# Usage: bash scripts/migrate_instance_to_data.sh

set -e  # Exit on error

echo "============================================"
echo "Instance → Data Folder Consolidation"
echo "============================================"
echo ""

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Working directory: $PROJECT_ROOT"
echo ""

# Check if instance folder exists
if [ ! -d "instance" ]; then
    echo "❌ Error: instance/ folder not found"
    echo "   Nothing to migrate!"
    exit 1
fi

echo "📊 Current structure:"
echo ""
echo "instance/"
ls -lh instance/ | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}'
echo ""
echo "data/"
ls -lh data/ | tail -n +2 | awk '{print "  " $9}'
echo ""

# Confirm migration
read -p "🔄 Proceed with migration? This will move files from instance/ to data/ (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Migration cancelled"
    exit 0
fi

echo ""
echo "Starting migration..."
echo ""

# Step 1: Create new structure
echo "📁 Step 1: Creating new directory structure..."
mkdir -p data/db
mkdir -p data/config/agents
echo "  ✓ Created data/db/"
echo "  ✓ Created data/config/agents/"
echo ""

# Step 2: Move database files
echo "📁 Step 2: Moving database files..."
if [ -f "instance/notetaker.db" ]; then
    mv instance/notetaker.db data/db/
    echo "  ✓ Moved notetaker.db"
fi
if [ -f "instance/demo_notetaker.db" ]; then
    mv instance/demo_notetaker.db data/db/
    echo "  ✓ Moved demo_notetaker.db"
fi
echo ""

# Step 3: Move configuration files
echo "📁 Step 3: Moving configuration files..."
if [ -f "instance/agents.json" ]; then
    mv instance/agents.json data/config/
    echo "  ✓ Moved agents.json"
fi
if [ -f "instance/agent_knowledge_meta.json" ]; then
    mv instance/agent_knowledge_meta.json data/config/
    echo "  ✓ Moved agent_knowledge_meta.json"
fi
if [ -f "instance/dashboard_config.json" ]; then
    mv instance/dashboard_config.json data/config/
    echo "  ✓ Moved dashboard_config.json"
fi
echo ""

# Step 4: Move agent storage folder
echo "📁 Step 4: Moving agent storage..."
if [ -d "instance/agents" ] && [ "$(ls -A instance/agents)" ]; then
    mv instance/agents/* data/config/agents/
    rmdir instance/agents
    echo "  ✓ Moved agents/ folder"
elif [ -d "instance/agents" ]; then
    rmdir instance/agents
    echo "  ✓ Removed empty agents/ folder"
fi
echo ""

# Step 5: Move uploads if they exist in instance
echo "📁 Step 5: Checking for uploads in instance/..."
if [ -d "instance/uploads" ] && [ "$(ls -A instance/uploads)" ]; then
    echo "  ⚠️  Found uploads in instance/uploads"
    echo "     Merging with data/uploads..."
    rsync -av instance/uploads/ data/uploads/
    rm -rf instance/uploads
    echo "  ✓ Merged uploads"
elif [ -d "instance/uploads" ]; then
    rmdir instance/uploads
    echo "  ✓ Removed empty uploads/ folder"
else
    echo "  ✓ No uploads in instance/"
fi
echo ""

# Step 6: Remove instance folder if empty
echo "📁 Step 6: Cleaning up..."
if [ -d "instance" ]; then
    if [ "$(ls -A instance)" ]; then
        echo "  ⚠️  instance/ folder is not empty:"
        ls -la instance/
        read -p "     Remove remaining files? (y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf instance
            echo "  ✓ Removed instance/ folder"
        else
            echo "  ⊘ Kept instance/ folder with remaining files"
        fi
    else
        rmdir instance
        echo "  ✓ Removed empty instance/ folder"
    fi
fi
echo ""

# Step 7: Show new structure
echo "============================================"
echo "✅ Migration Complete!"
echo "============================================"
echo ""
echo "📊 New data/ structure:"
tree -L 2 data/ 2>/dev/null || ls -R data/
echo ""

echo "📝 Next steps:"
echo "   1. Run: bash scripts/update_paths_after_migration.sh"
echo "   2. Update your .env file if needed"
echo "   3. Test the application: python run.py"
echo ""
echo "   The paths in your code will be automatically updated by the next script."
echo ""

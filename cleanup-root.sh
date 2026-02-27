#!/bin/bash

# Root Directory Cleanup Script
# This script safely reorganizes the Bible app root directory

set -e  # Exit on error

echo "========================================="
echo "Bible Repository Root Cleanup Script"
echo "========================================="
echo ""

# Verify we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "master" ]; then
    echo "⚠️  Warning: Not on master branch"
    echo "Current branch: $CURRENT_BRANCH"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "Step 1: Creating new directory structure..."
mkdir -p demos
mkdir -p database
echo "✓ Directories created: demos/, database/"
echo ""

echo "Step 2: Moving demo and test files..."
echo "  Moving demo files to demos/..."
git mv DEMO_VISUAL.html demos/ 2>/dev/null || echo "    - DEMO_VISUAL.html already moved or not found"
git mv test-chinese-refs.html demos/ 2>/dev/null || echo "    - test-chinese-refs.html already moved or not found"
git mv test-search-refs.js demos/ 2>/dev/null || echo "    - test-search-refs.js already moved or not found"
echo "✓ Demo files moved"
echo ""

echo "Step 3: Moving database files..."
echo "  Moving SQL schema to database/..."
git mv supabase-schema.sql database/ 2>/dev/null || echo "    - supabase-schema.sql already moved or not found"
echo "✓ Database files moved"
echo ""

echo "Step 4: Deleting obsolete files..."
echo "  Deleting completed setup/reorganization files..."
git rm setup-enforcement.sh 2>/dev/null || echo "    - setup-enforcement.sh already deleted or not found"
git rm metadata.json 2>/dev/null || echo "    - metadata.json already deleted or not found"
git rm REORGANIZATION_GUIDE.md 2>/dev/null || echo "    - REORGANIZATION_GUIDE.md already deleted or not found"
git rm reorganize.sh 2>/dev/null || echo "    - reorganize.sh already deleted or not found"
echo "✓ Obsolete files deleted"
echo ""

echo "Step 5: Updating documentation references..."

# Update docs that reference test-chinese-refs.html
if [ -f "docs/design/chinese-refs-implementation.md" ]; then
    sed -i.bak 's|test-chinese-refs.html|demos/test-chinese-refs.html|g' docs/design/chinese-refs-implementation.md
    rm -f docs/design/chinese-refs-implementation.md.bak
    git add docs/design/chinese-refs-implementation.md
    echo "  ✓ Updated docs/design/chinese-refs-implementation.md"
fi

if [ -f "docs/reports/task-complete.md" ]; then
    sed -i.bak 's|test-chinese-refs.html|demos/test-chinese-refs.html|g' docs/reports/task-complete.md
    rm -f docs/reports/task-complete.md.bak
    git add docs/reports/task-complete.md
    echo "  ✓ Updated docs/reports/task-complete.md"
fi

if [ -f "docs/testing/testing.md" ]; then
    sed -i.bak 's|test-search-refs.js|demos/test-search-refs.js|g' docs/testing/testing.md
    sed -i.bak 's|test-chinese-refs.html|demos/test-chinese-refs.html|g' docs/testing/testing.md
    rm -f docs/testing/testing.md.bak
    git add docs/testing/testing.md
    echo "  ✓ Updated docs/testing/testing.md"
fi

if [ -f "docs/guides/claude-code-setup-guide.md" ]; then
    # Remove setup-enforcement.sh reference
    sed -i.bak '/setup-enforcement.sh/d' docs/guides/claude-code-setup-guide.md
    rm -f docs/guides/claude-code-setup-guide.md.bak
    git add docs/guides/claude-code-setup-guide.md
    echo "  ✓ Updated docs/guides/claude-code-setup-guide.md"
fi

echo "✓ Documentation updated"
echo ""

echo "========================================="
echo "Cleanup Complete!"
echo "========================================="
echo ""
echo "Summary:"
echo "  • Created: demos/, database/"
echo "  • Moved: 3 demo/test files → demos/"
echo "  • Moved: 1 SQL file → database/"
echo "  • Deleted: 4 obsolete files"
echo "  • Updated: Documentation references"
echo ""
echo "Next steps:"
echo "  1. Review changes: git status"
echo "  2. Verify build: npm run build"
echo "  3. Run tests: npm run test"
echo "  4. If all good, commit: git commit -m 'refactor: Clean up root directory'"
echo ""
echo "To revert if needed:"
echo "  git checkout v0.1.0-pre-cleanup"
echo ""

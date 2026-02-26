#!/bin/bash

# Bible Repository Reorganization Script
# This script safely reorganizes the repository structure without breaking tests

set -e  # Exit on error

echo "========================================="
echo "Bible Repository Reorganization Script"
echo "========================================="
echo ""

# Verify we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "refactor/reorganize-structure" ]; then
    echo "⚠️  Warning: Not on refactor/reorganize-structure branch"
    echo "Current branch: $CURRENT_BRANCH"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "Step 1: Creating new directory structure..."
mkdir -p docs/design
mkdir -p docs/testing
mkdir -p docs/guides
mkdir -p docs/reports
mkdir -p docs/research
mkdir -p tests/e2e
mkdir -p tests/unit
mkdir -p tests/utils
echo "✓ Directories created"
echo ""

echo "Step 2: Moving documentation files..."

# Design documents
echo "  Moving design documents..."
git mv AUTO_SAVE_FEATURE.md docs/design/auto-save-feature.md 2>/dev/null || echo "    - AUTO_SAVE_FEATURE.md not found or already moved"
git mv BACKUP_RESTORE_DESIGN.md docs/design/backup-restore-design.md 2>/dev/null || echo "    - BACKUP_RESTORE_DESIGN.md not found or already moved"
git mv BACKUP_RESTORE_ICLOUD_DESIGN.md docs/design/backup-restore-icloud-design.md 2>/dev/null || echo "    - BACKUP_RESTORE_ICLOUD_DESIGN.md not found or already moved"
git mv CHINESE_REFS_IMPLEMENTATION.md docs/design/chinese-refs-implementation.md 2>/dev/null || echo "    - CHINESE_REFS_IMPLEMENTATION.md not found or already moved"
git mv SUPABASE_IMPLEMENTATION_COMPLETE.md docs/design/supabase-implementation-complete.md 2>/dev/null || echo "    - SUPABASE_IMPLEMENTATION_COMPLETE.md not found or already moved"

# Testing documentation
echo "  Moving testing documents..."
git mv BACKUP_RESTORE_TEST_PLAN.md docs/testing/backup-restore-test-plan.md 2>/dev/null || echo "    - BACKUP_RESTORE_TEST_PLAN.md not found or already moved"
git mv BACKUP_RESTORE_TEST_PLAN_ICLOUD_ADDENDUM.md docs/testing/backup-restore-test-plan-icloud-addendum.md 2>/dev/null || echo "    - BACKUP_RESTORE_TEST_PLAN_ICLOUD_ADDENDUM.md not found or already moved"
git mv SYNC_TEST_PLAN.md docs/testing/sync-test-plan.md 2>/dev/null || echo "    - SYNC_TEST_PLAN.md not found or already moved"
git mv TESTING.md docs/testing/testing.md 2>/dev/null || echo "    - TESTING.md not found or already moved"
git mv TESTING_GUIDE.md docs/testing/testing-guide.md 2>/dev/null || echo "    - TESTING_GUIDE.md not found or already moved"
git mv MANUAL_TESTING_CHECKLIST.md docs/testing/manual-testing-checklist.md 2>/dev/null || echo "    - MANUAL_TESTING_CHECKLIST.md not found or already moved"
git mv QUICK_TEST.md docs/testing/quick-test.md 2>/dev/null || echo "    - QUICK_TEST.md not found or already moved"
git mv TEST_BILINGUAL_REFS.md docs/testing/test-bilingual-refs.md 2>/dev/null || echo "    - TEST_BILINGUAL_REFS.md not found or already moved"
git mv TEST_CHINESE_REFS.md docs/testing/test-chinese-refs.md 2>/dev/null || echo "    - TEST_CHINESE_REFS.md not found or already moved"

# Guides
echo "  Moving guide documents..."
git mv CLAUDE_CODE_SETUP_GUIDE.md docs/guides/claude-code-setup-guide.md 2>/dev/null || echo "    - CLAUDE_CODE_SETUP_GUIDE.md not found or already moved"
git mv DEPLOYMENT.md docs/guides/deployment.md 2>/dev/null || echo "    - DEPLOYMENT.md not found or already moved"
git mv SUPABASE_SETUP.md docs/guides/supabase-setup.md 2>/dev/null || echo "    - SUPABASE_SETUP.md not found or already moved"

# Reports
echo "  Moving report documents..."
git mv CODE_AUDIT_REPORT.md docs/reports/code-audit-report.md 2>/dev/null || echo "    - CODE_AUDIT_REPORT.md not found or already moved"
git mv MASTER_BRANCH_AUDIT_2026-02-24.md docs/reports/master-branch-audit-2026-02-24.md 2>/dev/null || echo "    - MASTER_BRANCH_AUDIT_2026-02-24.md not found or already moved"
git mv OPTIMIZATION_SUMMARY.md docs/reports/optimization-summary.md 2>/dev/null || echo "    - OPTIMIZATION_SUMMARY.md not found or already moved"
git mv FEATURE_BACKUP_RESTORE_SUMMARY.md docs/reports/feature-backup-restore-summary.md 2>/dev/null || echo "    - FEATURE_BACKUP_RESTORE_SUMMARY.md not found or already moved"
git mv FEATURE_COMPLETE_SUMMARY.md docs/reports/feature-complete-summary.md 2>/dev/null || echo "    - FEATURE_COMPLETE_SUMMARY.md not found or already moved"
git mv HANDWRITING_FIXES_SUMMARY.md docs/reports/handwriting-fixes-summary.md 2>/dev/null || echo "    - HANDWRITING_FIXES_SUMMARY.md not found or already moved"
git mv LAZY_LOADING_COMPLETE.md docs/reports/lazy-loading-complete.md 2>/dev/null || echo "    - LAZY_LOADING_COMPLETE.md not found or already moved"
git mv LAZY_MARKDOWN_RESULTS.md docs/reports/lazy-markdown-results.md 2>/dev/null || echo "    - LAZY_MARKDOWN_RESULTS.md not found or already moved"
git mv PHASE_1_COMPLETE_STATUS.md docs/reports/phase-1-complete-status.md 2>/dev/null || echo "    - PHASE_1_COMPLETE_STATUS.md not found or already moved"
git mv TASK_COMPLETE.md docs/reports/task-complete.md 2>/dev/null || echo "    - TASK_COMPLETE.md not found or already moved"

# Research
echo "  Moving research documents..."
git mv BACKUP_RESTORE_RESEARCH.md docs/research/backup-restore-research.md 2>/dev/null || echo "    - BACKUP_RESTORE_RESEARCH.md not found or already moved"
git mv PROJECT_PLAN.md docs/research/project-plan.md 2>/dev/null || echo "    - PROJECT_PLAN.md not found or already moved"
git mv PAIR_PROGRAMMING_LOG.md docs/research/pair-programming-log.md 2>/dev/null || echo "    - PAIR_PROGRAMMING_LOG.md not found or already moved"
git mv .ai-instructions.md docs/research/ai-instructions.md 2>/dev/null || echo "    - .ai-instructions.md not found or already moved"

echo "✓ Documentation files moved"
echo ""

echo "Step 3: Moving test directories..."

# Move e2e tests if directory exists and has content
if [ -d "e2e" ] && [ "$(ls -A e2e)" ]; then
    echo "  Moving e2e tests..."
    git mv e2e/* tests/e2e/ 2>/dev/null || echo "    - e2e files not found or already moved"
    rmdir e2e 2>/dev/null || echo "    - e2e directory not empty or already removed"
else
    echo "  - e2e directory empty or doesn't exist"
fi

# Move test utilities if directory exists and has content
if [ -d "test" ] && [ "$(ls -A test)" ]; then
    echo "  Moving test utilities..."
    git mv test/* tests/utils/ 2>/dev/null || echo "    - test files not found or already moved"
    rmdir test 2>/dev/null || echo "    - test directory not empty or already removed"
else
    echo "  - test directory empty or doesn't exist"
fi

echo "✓ Test directories moved"
echo ""

echo "Step 4: Updating configuration files..."

# Update playwright.config.ts
if [ -f "playwright.config.ts" ]; then
    echo "  Updating playwright.config.ts..."
    sed -i.bak "s|testDir: './e2e'|testDir: './tests/e2e'|g" playwright.config.ts
    rm playwright.config.ts.bak 2>/dev/null || true
    git add playwright.config.ts
    echo "    ✓ Updated testDir path"
else
    echo "    - playwright.config.ts not found"
fi

# Update vitest.config.ts
if [ -f "vitest.config.ts" ]; then
    echo "  Updating vitest.config.ts..."
    sed -i.bak "s|setupFiles: './test/setup.ts'|setupFiles: './tests/utils/setup.ts'|g" vitest.config.ts
    sed -i.bak "s|exclude: \['node_modules', 'dist', 'ios', 'e2e'\]|exclude: ['node_modules', 'dist', 'ios', 'tests']|g" vitest.config.ts
    sed -i.bak "s|'test/',|'tests/',|g" vitest.config.ts
    sed -i.bak "s|'e2e/',||g" vitest.config.ts
    rm vitest.config.ts.bak 2>/dev/null || true
    git add vitest.config.ts
    echo "    ✓ Updated setupFiles and exclude paths"
else
    echo "    - vitest.config.ts not found"
fi

echo "✓ Configuration files updated"
echo ""

echo "========================================="
echo "Reorganization Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Review changes: git status"
echo "2. Check config updates: git diff playwright.config.ts vitest.config.ts"
echo "3. Install dependencies: npm ci"
echo "4. Run tests: npm run test:all"
echo "5. If tests pass, commit: git commit -m 'Refactor: Reorganize repository structure'"
echo ""

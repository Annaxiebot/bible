# Repository Reorganization Guide

This guide documents the repository structure reorganization to improve maintainability and navigation.

## Problem

The repository had:
- 33+ markdown files cluttering the root directory
- Multiple test directories (e2e/, test/, tests/unit/) not well organized
- Poor discoverability for documentation
- Difficult navigation for contributors

## Solution

Reorganize into a clean, logical structure:
- All documentation in `docs/` with subdirectories by type
- All tests consolidated under `tests/`
- Clean root directory with only essential files

## Automated Reorganization

### Quick Start

```bash
# Make script executable
chmod +x reorganize.sh

# Run the reorganization
./reorganize.sh

# Verify the changes
git status

# Install dependencies
npm ci

# Run all tests to verify nothing broke
npm run test:all
```

### What the Script Does

1. Creates new directory structure
2. Moves all markdown files to appropriate subdirectories
3. Consolidates test directories
4. Updates configuration files:
   - `playwright.config.ts` → testDir path
   - `vitest.config.ts` → setupFiles and exclude paths
5. Stages changes with git

## New Structure

```
bible/
├── README.md                    # Project overview (stays in root)
├── CONTRIBUTING.md              # Contribution guide (stays in root)
├── REORGANIZATION_GUIDE.md      # This file
├── reorganize.sh                # Reorganization script
│
├── docs/                        # All documentation
│   ├── design/                  # Feature design documents
│   │   ├── auto-save-feature.md
│   │   ├── backup-restore-design.md
│   │   ├── backup-restore-icloud-design.md
│   │   ├── chinese-refs-implementation.md
│   │   └── supabase-implementation-complete.md
│   │
│   ├── testing/                 # Test plans and guides
│   │   ├── backup-restore-test-plan.md
│   │   ├── backup-restore-test-plan-icloud-addendum.md
│   │   ├── manual-testing-checklist.md
│   │   ├── quick-test.md
│   │   ├── sync-test-plan.md
│   │   ├── test-bilingual-refs.md
│   │   ├── test-chinese-refs.md
│   │   ├── testing-guide.md
│   │   └── testing.md
│   │
│   ├── guides/                  # Setup and deployment guides
│   │   ├── claude-code-setup-guide.md
│   │   ├── deployment.md
│   │   └── supabase-setup.md
│   │
│   ├── reports/                 # Status reports and audits
│   │   ├── code-audit-report.md
│   │   ├── feature-backup-restore-summary.md
│   │   ├── feature-complete-summary.md
│   │   ├── handwriting-fixes-summary.md
│   │   ├── lazy-loading-complete.md
│   │   ├── lazy-markdown-results.md
│   │   ├── master-branch-audit-2026-02-24.md
│   │   ├── optimization-summary.md
│   │   ├── phase-1-complete-status.md
│   │   └── task-complete.md
│   │
│   └── research/                # Research and planning documents
│       ├── ai-instructions.md
│       ├── backup-restore-research.md
│       ├── pair-programming-log.md
│       └── project-plan.md
│
├── tests/                       # All test code
│   ├── e2e/                     # End-to-end tests (Playwright)
│   ├── unit/                    # Unit tests (Vitest)
│   └── utils/                   # Test utilities and setup
│       └── setup.ts
│
├── src/                         # Application source code
├── components/                  # React components
├── services/                    # API and data services
└── ... (other source directories)
```

## Configuration Changes

### playwright.config.ts

```typescript
// Before:
testDir: './e2e',

// After:
testDir: './tests/e2e',
```

### vitest.config.ts

```typescript
// Before:
setupFiles: './test/setup.ts',
exclude: ['node_modules', 'dist', 'ios', 'e2e'],
coverage: {
  exclude: [
    // ...
    'test/',
    'e2e/',
    // ...
  ]
}

// After:
setupFiles: './tests/utils/setup.ts',
exclude: ['node_modules', 'dist', 'ios', 'tests'],
coverage: {
  exclude: [
    // ...
    'tests/',
    // ...
  ]
}
```

## Verification Steps

After running the reorganization script:

### 1. Check Git Status
```bash
git status
```
Should show files moved (not deleted + added).

### 2. Review Configuration Changes
```bash
git diff playwright.config.ts
git diff vitest.config.ts
```

### 3. Install Dependencies
```bash
npm ci
```

### 4. Run All Tests
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# All tests
npm run test:all

# With coverage
npm run test:coverage
```

### 5. Build the Project
```bash
npm run build
```

### 6. TypeScript Check
```bash
npx tsc --noEmit
```

All of these should pass without errors.

## Committing Changes

If all tests pass:

```bash
git add -A
git commit -m "Refactor: Reorganize repository structure

- Move all documentation to docs/ directory with logical subdirectories
- Consolidate test directories under tests/
- Update playwright.config.ts to reference tests/e2e/
- Update vitest.config.ts to reference tests/utils/setup.ts
- No functional changes, all tests pass

Improves maintainability and navigation for contributors."

git push origin refactor/reorganize-structure
```

## Benefits

✅ **Clean root directory** - Only essential files visible at top level
✅ **Logical grouping** - Related documentation together
✅ **Easy navigation** - Clear folder structure
✅ **Scalable** - Easy to add new docs in appropriate places
✅ **Standard practice** - Follows open-source conventions
✅ **No breaking changes** - All tests and builds work identically

## Rollback Plan

If something goes wrong:

```bash
# Switch to backup branch
git checkout backup-before-reorganization

# Or reset feature branch
git checkout refactor/reorganize-structure
git reset --hard origin/master
```

## Manual Steps (If Needed)

### Update Documentation Links

If documentation files link to each other, update relative paths:

```bash
# Search for markdown links
grep -r "\[.*\](.*.md)" docs/
```

Update paths as needed:
```markdown
<!-- Before: -->
[Testing Guide](TESTING_GUIDE.md)

<!-- After: -->
[Testing Guide](../testing/testing-guide.md)
```

### Update README.md Links

If README links to documentation:

```markdown
<!-- Before: -->
See [Testing Guide](TESTING_GUIDE.md)

<!-- After: -->
See [Testing Guide](docs/testing/testing-guide.md)
```

## Troubleshooting

### "Cannot find module './test/setup.ts'"
**Solution:** Verify vitest.config.ts uses `setupFiles: './tests/utils/setup.ts'`

### "No tests found in ./e2e"
**Solution:** Verify playwright.config.ts uses `testDir: './tests/e2e'`

### Script fails with permission error
**Solution:** Run `chmod +x reorganize.sh` first

### Files show as deleted + added instead of moved
**Solution:** Using `git mv` ensures files are tracked as moved. If already moved with regular `mv`, use `git add -A` to let Git detect renames.

## GitHub Actions

No changes needed! The workflows use npm scripts which reference the config files. Since we updated the config files, the workflows will automatically use the new paths.

## Questions or Issues?

If you encounter problems:
1. Check this guide's troubleshooting section
2. Verify all verification steps pass
3. Check git status shows moves, not deletions
4. Review the backup branch if needed

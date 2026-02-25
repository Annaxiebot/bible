# Claude Code Setup Guide
**Enforcing Professional Engineering Standards Across All AI Assistants**

This guide shows how to configure Claude Code (on your Mac host) to follow the same rigorous engineering standards as the OpenClaw instance.

---

## 🎯 Goal

Ensure **every AI instance** (OpenClaw VM, Claude Code on Mac, GitHub Copilot, etc.) enforces:
- ✅ Tests required for all code
- ✅ Coverage >70%
- ✅ Zero build warnings
- ✅ No regressions
- ✅ Security audit passing

---

## 📦 Quick Setup (3 Steps)

### 1. Run the Setup Script

From the `bible` repo root:

```bash
cd ~/bible
./setup-enforcement.sh
```

This installs:
- Pre-commit hook (blocks bad commits)
- Test directory structure
- Sample test file
- GitHub Actions CI workflow

### 2. Install Test Framework

Choose **Vitest** (recommended for Vite projects):

```bash
npm install -D vitest @vitest/ui @vitest/coverage-v8
```

Or **Jest** (if you prefer):

```bash
npm install -D jest @types/jest ts-jest
```

### 3. Add Test Scripts to `package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Done!** Pre-commit hooks will now enforce quality standards.

---

## 🔧 Configuring Claude Code Specifically

### Method 1: Workspace-Level Instructions (Preferred)

Claude Code reads project files automatically. The repo now includes:

- **`CONTRIBUTING.md`** — Clear contribution standards
- **`.ai-instructions.md`** — Explicit AI behavior rules
- **Pre-commit hooks** — Automated enforcement
- **CI workflow** — GitHub Actions validation

**Claude Code will see these files** when working in the `~/bible` directory.

---

### Method 2: Custom Instructions (If Supported)

Check if Claude Code has a custom instructions or system prompt feature:

1. Open Claude Code settings/preferences
2. Look for "Custom Instructions" or "System Prompt"
3. Add this:

```
You are working with a 25+ year veteran software engineer. Professional standards apply.

MANDATORY RULES:
1. ALL code must include comprehensive tests (unit + integration + E2E)
2. Coverage must be >70% overall, >90% for business logic
3. NO "done" without proof: test results, coverage reports, CI passing
4. Regressions are unacceptable - test existing features before adding new ones
5. Build warnings = build failures - fix all TypeScript errors

Before saying "done", provide:
- Test results showing all pass
- Coverage report
- Build output with zero warnings
- CI link (if applicable)

Red flags:
- "Feature complete" without tests → NOT COMPLETE
- "This should work" without proof → PROVE IT
- Skipping tests "to save time" → UNACCEPTABLE

Follow CONTRIBUTING.md and .ai-instructions.md in the project root.
```

---

### Method 3: Project-Specific `.clauderc` (If Supported)

Some AI tools support project config files. Try creating:

**`~/bible/.clauderc`:**
```json
{
  "rules": {
    "testing": {
      "required": true,
      "coverage_threshold": 70,
      "fail_on_no_tests": true
    },
    "build": {
      "fail_on_warnings": true,
      "fail_on_errors": true
    },
    "security": {
      "audit_level": "high"
    }
  },
  "instructions": "Follow CONTRIBUTING.md and .ai-instructions.md. Professional software engineering standards apply."
}
```

---

### Method 4: `.vscode/settings.json` (If Using VS Code)

If Claude Code integrates with VS Code:

**`~/bible/.vscode/settings.json`:**
```json
{
  "editor.formatOnSave": true,
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  
  "ai.instructions": "Follow CONTRIBUTING.md. All code requires tests. Coverage >70%. Zero warnings.",
  
  "git.enableCommitSigning": true,
  "git.alwaysSignOff": true,
  
  "testing.automaticallyOpenPeekView": "failureInVisibleDocument",
  "coverage-gutters.showLineCoverage": true,
  "coverage-gutters.showRulerCoverage": true
}
```

---

## 🔒 Enforcement Layers

Your setup now has **multiple layers** ensuring quality:

### Layer 1: AI Instructions (Passive)
- `CONTRIBUTING.md` — Human/AI-readable standards
- `.ai-instructions.md` — Explicit AI rules
- These guide behavior but don't block bad code

### Layer 2: Pre-Commit Hook (Active)
- Runs automatically before every commit
- Blocks commits with:
  - Build errors
  - Build warnings (duplicate keys, etc.)
  - Security vulnerabilities
  - Failing tests (when configured)

### Layer 3: GitHub Actions CI (Automated)
- Runs on every push/PR
- Fails builds that don't meet standards
- Prevents merging bad code
- Provides visibility to team

### Layer 4: Git Branch Protection (Optional)
If you enable GitHub branch protection:
- Require CI to pass before merging
- Require code review
- Enforce linear history

---

## 🧪 Verifying It Works

### Test the Pre-Commit Hook

Try committing code with a deliberate error:

```bash
# Create a file with duplicate keys
cat > test-duplicate.ts << 'EOF'
const obj = {
  foo: 1,
  bar: 2,
  foo: 3  // Duplicate!
};
EOF

git add test-duplicate.ts
git commit -m "test: deliberate error"
```

**Expected:** Pre-commit hook should BLOCK the commit with an error message.

### Test the CI Workflow

Push to GitHub and check Actions tab:
```bash
git push origin master
```

Visit: `https://github.com/Annaxiebot/bible/actions`

**Expected:** CI job should run and report results.

---

## 📋 Using the Standards

### For Every New Feature

1. **Read the guidelines:**
   ```bash
   cat CONTRIBUTING.md
   ```

2. **Create a branch:**
   ```bash
   git checkout -b feature/my-new-feature
   ```

3. **Write tests FIRST:**
   ```bash
   # Create test file
   touch tests/unit/my-feature.test.ts
   
   # Write tests
   # npm run test:watch (live reload)
   ```

4. **Implement the feature:**
   ```bash
   # Write code
   # Run tests continuously
   ```

5. **Verify before committing:**
   ```bash
   npm run test              # All tests pass
   npm run test:coverage     # Coverage >70%
   npm run build             # Zero warnings
   npm audit                 # No vulnerabilities
   ```

6. **Commit (pre-commit hook runs automatically):**
   ```bash
   git add .
   git commit -m "feat(scope): description
   
   - Bullet points
   - Tests written, coverage 85%"
   ```

7. **Push and verify CI:**
   ```bash
   git push origin feature/my-new-feature
   # Check GitHub Actions
   ```

---

## 🎓 Training AI Assistants

### First Interaction

When starting a new session with Claude Code:

```
Hi! I'm working on the Bible app (~/bible).

Before we start:
1. Read CONTRIBUTING.md
2. Read .ai-instructions.md
3. Understand the testing requirements

This project follows professional software engineering standards:
- All code requires tests
- Coverage >70%
- Zero build warnings
- No regressions

Please confirm you've read the guidelines.
```

### During Development

If the AI suggests code without tests:

```
Stop. Before implementing, write the tests first.

Required:
1. Unit test file in tests/unit/
2. Test cases covering happy path, edge cases, errors
3. Run: npm run test
4. Provide coverage report

Do not proceed to implementation without tests.
```

### Before Marking Complete

```
Before marking this done, provide proof:
1. Screenshot of npm run test output (all passing)
2. Screenshot of npm run test:coverage (>70%)
3. Screenshot of npm run build (zero warnings)
4. Manual testing results

Not done until all proof is provided.
```

---

## 🚨 Red Flag Responses

If AI says any of these, **stop and correct:**

| AI Says | Your Response |
|---------|---------------|
| "Feature is complete" | "Show me the tests and coverage report." |
| "This should work" | "Prove it. Run the tests." |
| "I'll add tests later" | "No. Tests come first. TDD." |
| "Build warnings are minor" | "Fix them. Zero warnings policy." |
| "Testing would take too long" | "Testing is non-negotiable. Read CONTRIBUTING.md." |

---

## 📊 Monitoring Compliance

### Daily

```bash
# Check current coverage
npm run test:coverage

# Check build status
npm run build

# Check security
npm audit
```

### Weekly

```bash
# Review test execution time
npm run test -- --reporter=verbose

# Check for outdated dependencies
npm outdated

# Review CI/CD logs on GitHub
```

### Monthly

```bash
# Full security audit
npm audit --audit-level=moderate

# Dependency updates
npm update
npm run test  # Verify nothing broke
```

---

## 🛠️ Troubleshooting

### "Pre-commit hook isn't running"

```bash
# Verify hook exists and is executable
ls -l .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Test manually
.git/hooks/pre-commit
```

### "Tests aren't running"

```bash
# Check test script exists
grep "test" package.json

# Install test framework
npm install -D vitest @vitest/ui @vitest/coverage-v8

# Verify test files exist
find tests -name "*.test.ts"
```

### "CI workflow not triggering"

```bash
# Verify workflow file exists
cat .github/workflows/ci.yml

# Check GitHub Actions settings
# Repo → Settings → Actions → Allow all actions
```

### "Build warnings still passing"

```bash
# Check pre-commit hook logic
cat .git/hooks/pre-commit | grep -A5 "Duplicate"

# Manually test
npm run build 2>&1 | grep -iE "Duplicate|error"
```

---

## 🎯 Success Criteria

You'll know this is working when:

- ✅ Cannot commit code with build errors
- ✅ Cannot commit code with duplicate keys
- ✅ Cannot commit code with security vulnerabilities
- ✅ CI fails on PRs with warnings/errors
- ✅ Coverage reports are generated automatically
- ✅ AI assistants provide test code alongside features
- ✅ No regressions in production

---

## 📚 Additional Resources

### Internal Docs
- `CONTRIBUTING.md` — Contribution guidelines
- `.ai-instructions.md` — AI behavior rules
- `TESTING_GUIDE.md` — Testing best practices (if exists)
- `MASTER_BRANCH_AUDIT_2026-02-24.md` — Recent audit findings

### External Resources
- [Vitest Documentation](https://vitest.dev/)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Testing Best Practices](https://testingjavascript.com/)

---

## 💡 Tips for Success

1. **Be consistent:** Don't skip steps, even for "small" changes
2. **Automate everything:** Hooks and CI catch mistakes humans miss
3. **Trust but verify:** Always check AI-generated test quality
4. **Refactor with confidence:** Good tests enable safe refactoring
5. **Share the standards:** Anyone working on the code follows the same rules

---

**Remember:** Professional software engineering isn't about perfection on the first try. It's about having systems in place that catch mistakes before they reach users.

**These standards protect your code, your users, and your sanity.** 🦊

---

**Setup complete! You now have industrial-strength code quality enforcement across all AI assistants.**

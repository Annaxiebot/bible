# AI Assistant Instructions

**You are working with a 25+ year veteran software engineer. Professional standards apply.**

---

## 🚨 Mandatory Code Quality Standards

### 1. Write Tests FIRST
- **TDD or tests alongside code** — never after
- No "I'll add tests later" — tests come first
- Coverage must be >70% overall, >90% for services

### 2. Prove It Works
- No "it should work" or "this will work" without evidence
- Provide test results, coverage reports, build logs
- Manual testing results with screenshots/descriptions

### 3. No Build Warnings
- Build warnings = build failures
- Fix ALL TypeScript errors before committing
- Zero tolerance for duplicate keys, unused variables, type errors

### 4. No Regressions
- Test existing features before adding new ones
- If new code breaks old features → UNACCEPTABLE
- Write regression tests for bugs fixed

### 5. Security Matters
- Run `npm audit` before and after dependency changes
- Fix high/critical vulnerabilities immediately
- No secrets in code — use environment variables

---

## 🛑 Red Flags (Stop and Fix)

If you catch yourself thinking or saying:

- ❌ "This should work" → **Write a test to prove it**
- ❌ "I'll add tests later" → **NO. Tests come first.**
- ❌ "Just one more feature" → **Stop. Test what exists first.**
- ❌ "Feature complete" (without tests) → **NOT COMPLETE**
- ❌ "Build warnings are fine" → **NO. Fix them.**
- ❌ "Testing takes too much time" → **UNACCEPTABLE**

---

## ✅ Definition of "Done"

A task is NOT done until:

- [ ] Feature implemented
- [ ] Tests written (unit + integration + E2E if needed)
- [ ] All tests pass (`npm run test`)
- [ ] Build succeeds with zero warnings (`npm run build`)
- [ ] Coverage >70% verified (`npm run test:coverage`)
- [ ] Manual smoke test completed
- [ ] Proof provided (test results, coverage report, CI link)
- [ ] No regressions in existing features
- [ ] Documentation updated (if needed)

**Do not say "done" or "complete" until ALL of these are verified.**

---

## 🧪 Testing Requirements

### When to Write Tests

**ALWAYS.** Every feature, every bug fix, every refactor.

### What to Test

- **Unit tests:** Individual functions, methods, utilities
- **Integration tests:** Services working together, API calls, storage
- **E2E tests:** User flows, critical paths, UI interactions

### Coverage Thresholds

- **Overall:** >70%
- **Services (business logic):** >90%
- **Components (UI):** >60%
- **Utilities:** >80%

If coverage drops below these thresholds → **FIX IT before moving on.**

---

## 🏗️ Code Structure Standards

### Modular Architecture
- Reusable components and services
- Clear separation of concerns
- No God objects or massive files

### Naming Conventions
- Descriptive variable names (no `data`, `temp`, `x`)
- Functions named as verbs (`getUserData`, `calculateTotal`)
- Classes/interfaces named as nouns (`BibleService`, `VerseData`)

### No Spaghetti Code
- Max function length: ~50 lines (guideline, not absolute)
- Max file length: ~300 lines (split if larger)
- Avoid deeply nested conditionals (>3 levels)

---

## 🔍 Before Submitting Work

### Self-Review Checklist

1. **Run all checks:**
   ```bash
   npm run build      # Must succeed with zero warnings
   npm run test       # All tests pass
   npm run test:coverage  # Coverage >70%
   npm audit          # No high/critical vulnerabilities
   ```

2. **Provide proof:**
   - Screenshot of test results
   - Coverage report output
   - Build log showing success
   - CI link (when available)

3. **Manual verification:**
   - Smoke test the feature yourself
   - Test on target devices (iPad for Bible app)
   - Verify no regressions in existing features

---

## 📋 Task Completion Template

When finishing a task, provide this summary:

```markdown
## Task: [Brief description]

### Implementation
- [What was built/changed]
- [Key technical decisions]

### Tests Written
- [ ] Unit tests: X files, Y test cases
- [ ] Integration tests: X files, Y test cases
- [ ] E2E tests: X files, Y test cases

### Verification
- [ ] All tests pass (screenshot attached)
- [ ] Build succeeds with zero warnings (log attached)
- [ ] Coverage: XX% overall, YY% services (report attached)
- [ ] Manual testing completed on: [devices/browsers]
- [ ] No regressions in existing features

### Proof
[Attach screenshots, logs, CI links, coverage reports]

**Status: COMPLETE** ✅
```

**Do not mark "COMPLETE" without proof.**

---

## 🚫 Common Anti-Patterns to Avoid

### Code Smells
- ❌ Duplicate code (DRY principle)
- ❌ Magic numbers (use named constants)
- ❌ Commented-out code (delete it, use git history)
- ❌ Console.logs left in production code
- ❌ TODO comments without tickets/issues

### TypeScript Smells
- ❌ `any` types (use proper types or `unknown`)
- ❌ Type assertions (`as`) without justification
- ❌ Ignoring TypeScript errors (`@ts-ignore`)
- ❌ Duplicate keys in object literals (causes silent bugs)

### Testing Smells
- ❌ Tests that don't actually test anything
- ❌ Tests that pass even when code is broken
- ❌ Tests dependent on external state
- ❌ Tests that take >5 seconds to run (unit tests)

---

## 🎯 Workflow Summary

For every task:

1. **Understand** the requirement fully
2. **Plan** the implementation and test strategy
3. **Write tests** first (or alongside code)
4. **Implement** the feature
5. **Verify** tests pass and coverage is adequate
6. **Build** and fix all warnings
7. **Manual test** on target devices
8. **Provide proof** (screenshots, logs, coverage)
9. **Mark complete** only when ALL criteria met

---

## 🧠 Remember

> "Move fast and break things" is NOT the philosophy here.
> 
> Build reliable, tested, maintainable software that works correctly.
> 
> The human has 25+ years of experience and expects professional-grade work.

**When in doubt:** Write more tests, not less. Over-communicate progress. Provide proof. Ask for clarification.

**The goal:** Not just working code, but *proven* working code that won't break in production.

---

**These instructions are mandatory. Following them is not optional.**

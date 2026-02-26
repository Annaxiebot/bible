# Contributing Guidelines

## ⚠️ NON-NEGOTIABLE: All Code Must Have Tests

**NO CODE IS MERGED WITHOUT TESTS. Period.**

This is professional software engineering practice. Past failures where new features broke existing functionality are unacceptable and MUST NOT happen again.

---

## Before ANY Commit

- [ ] Tests written and passing (`npm run test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Coverage didn't decrease (`npm run test:coverage`)
- [ ] Manual smoke test of affected features
- [ ] CI must be green (when configured)

---

## When Creating New Features

1. **Write tests FIRST** (or alongside code) — Test-Driven Development
2. Run `npm run test` before every commit
3. Run `npm run test:coverage` to verify coverage >70%
4. Document what you tested in commit message

---

## Test Locations

- **Unit tests:** `tests/unit/**/*.test.ts`
- **Integration tests:** `tests/integration/**/*.test.ts`
- **E2E tests:** `tests/e2e/**/*.spec.ts`
- **Test guide:** `TESTING_GUIDE.md` (if exists)

---

## Coverage Requirements

- **Overall:** >70%
- **Services:** >90% (business logic is critical)
- **Components:** >60% (UI is harder to test)

Run coverage report:
```bash
npm run test:coverage
```

---

## Red Flags (STOP and FIX)

- ❌ "Feature complete" but no tests written
- ❌ Breaking existing features (regression)
- ❌ Large PRs without test coverage
- ❌ Skipping tests "to save time"
- ❌ Build warnings ignored
- ❌ Duplicate keys in object literals

**If an AI says "feature complete" without tests → IT'S NOT COMPLETE.**

---

## Task Completion Checklist

Use this for EVERY feature:

```markdown
- [ ] Feature implemented
- [ ] Unit tests written
- [ ] Integration tests written (if needed)
- [ ] E2E tests written (if user-facing)
- [ ] `npm run test` passes locally
- [ ] `npm run build` succeeds with zero warnings
- [ ] Coverage >70% overall
- [ ] Manual smoke test completed
- [ ] CI passing (when available)
- [ ] Proof provided (test results, coverage report, screenshots)
```

**Not done until ALL boxes checked.**

---

## Why This Matters

- **Proof:** Tests prove code works as intended
- **Protection:** Tests prevent regressions
- **Documentation:** Tests show expected behavior
- **Trust:** Code with tests can be trusted

**There are no shortcuts. There are no exceptions.**

---

## Code Quality Standards

### TypeScript
- Fix ALL build warnings before committing
- No `any` types without explicit justification
- Use strict mode (`"strict": true` in tsconfig.json)

### Object Literals
- No duplicate keys (will cause silent bugs)
- Validate with linter or pre-commit hooks

### Bundle Size
- Keep main bundle <500KB minified
- Use code splitting for large features
- Lazy-load heavy dependencies

### Security
- Run `npm audit` regularly
- Fix high/critical vulnerabilities immediately
- Keep dependencies up to date

---

## Commit Message Format

```
type(scope): brief description

- Detailed bullet points
- What changed and why
- Tests written and passing
- Coverage: XX%
```

**Types:** `feat`, `fix`, `test`, `refactor`, `docs`, `chore`

**Example:**
```
feat(bible-viewer): add offline chapter caching

- Implement IndexedDB storage for downloaded chapters
- Add background download with progress indicator
- Tests written for storage service (95% coverage)
- Manual testing on iPad with airplane mode
- Coverage: 92% (services), 78% (overall)
```

---

## Getting Help

If you're stuck:
1. Read existing tests for examples
2. Check `TESTING_GUIDE.md` (if exists)
3. Ask for clarification before proceeding
4. Pair with another developer/AI if needed

---

**Remember:** Professional software engineering isn't about moving fast and breaking things. It's about building reliable software that works correctly and can be maintained over time.

**The maintainer is a 25+ year software engineering veteran. Professional standards apply.**

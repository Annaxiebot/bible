# Testing Guide

## Philosophy

**Every feature MUST have tests.** No exceptions.

Tests serve three purposes:
1. **Proof** that code works as intended
2. **Protection** against regressions
3. **Documentation** of expected behavior

---

## Quick Start

```bash
# Run all unit tests
npm run test

# Run tests in watch mode (during development)
npm run test:watch

# Run tests with interactive UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with interactive UI
npm run test:e2e:ui

# Run everything
npm run test:all
```

---

## Test Structure

```
bible-app/
├── services/
│   └── __tests__/           # Service unit tests
│       ├── bibleStorage.test.ts
│       ├── bibleBookData.test.ts
│       ├── bookmarkStorage.test.ts
│       ├── chineseConverter.test.ts
│       └── notesStorage.test.ts
├── components/
│   └── __tests__/           # Component tests
│       └── (coming soon)
├── e2e/                     # End-to-end tests
│   └── bible-reading.spec.ts
├── test/                    # Test setup
│   └── setup.ts
├── vitest.config.ts         # Unit test config
└── playwright.config.ts     # E2E test config
```

---

## Writing Tests

### Unit Tests (Services)

```typescript
// services/__tests__/myService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { myService } from '../myService';

describe('myService', () => {
  it('should do what it says', () => {
    const result = myService.doThing();
    expect(result).toBe(expectedValue);
  });

  it('should handle errors gracefully', () => {
    expect(() => myService.doInvalidThing()).toThrow();
  });
});
```

### Component Tests

```typescript
// components/__tests__/MyComponent.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    render(<MyComponent />);
    const button = screen.getByRole('button');
    await fireEvent.click(button);
    expect(screen.getByText('Clicked!')).toBeInTheDocument();
  });
});
```

### E2E Tests

```typescript
// e2e/feature.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Feature', () => {
  test('user can complete workflow', async ({ page }) => {
    await page.goto('/');
    await page.click('button');
    await expect(page.locator('result')).toBeVisible();
  });
});
```

---

## Mocking

### Mocking IndexedDB

IndexedDB is mocked in `test/setup.ts`. For services using `idb` library:

```typescript
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    put: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  }),
}));
```

### Mocking Fetch

```typescript
import { vi } from 'vitest';

vi.mocked(fetch).mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ data: 'test' }),
} as Response);
```

---

## Coverage Requirements

Current targets (will increase over time):
- **Minimum:** 50% overall coverage
- **Services:** 70%+ (business logic is critical)
- **Components:** 40%+ (UI is harder to test)

View coverage report:
```bash
npm run test:coverage
open coverage/index.html
```

---

## CI Requirements

All branches must pass:
1. ✅ Unit tests
2. ✅ Build succeeds
3. ✅ Bundle size < 600 KB
4. ✅ E2E tests (for PRs to main)

**No merge without green CI.**

See `.github/workflows/test.yml` for details.

---

## Pre-Commit Checklist

Before pushing ANY code:

- [ ] All tests pass locally (`npm run test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Manual smoke test of affected features
- [ ] New tests added for new features
- [ ] Coverage didn't decrease

---

## Testing Pyramid

```
       E2E (10%)
    Integration (30%)
   Unit Tests (60%)
```

Write mostly unit tests, fewer integration tests, minimal E2E.

---

## Best Practices

### DO
- ✅ Test behavior, not implementation
- ✅ Use descriptive test names
- ✅ Test edge cases and error handling
- ✅ Keep tests isolated and independent
- ✅ Mock external dependencies

### DON'T
- ❌ Test internal implementation details
- ❌ Write tests that depend on other tests
- ❌ Test third-party library functionality
- ❌ Skip error handling tests
- ❌ Write tests without assertions

---

## Debugging Tests

### Vitest
```bash
# Run single test file
npm run test -- services/__tests__/bibleBookData.test.ts

# Run tests matching pattern
npm run test -- -t "should parse"

# Debug mode
npm run test -- --inspect-brk
```

### Playwright
```bash
# Run with visible browser
npm run test:e2e -- --headed

# Run specific test
npm run test:e2e -- bible-reading.spec.ts

# Debug mode
npm run test:e2e -- --debug
```

---

## Adding Tests for New Features

1. **Create test file** alongside source:
   - `services/newFeature.ts` → `services/__tests__/newFeature.test.ts`
   - `components/NewComponent.tsx` → `components/__tests__/NewComponent.test.tsx`

2. **Write tests first** (TDD) or alongside code

3. **Verify coverage** didn't decrease:
   ```bash
   npm run test:coverage
   ```

4. **Run full test suite** before committing:
   ```bash
   npm run test:all
   ```

---

## Questions?

Ask before skipping tests. There are no exceptions.

**Tests are not optional — they ARE the spec.**

/**
 * LazyMarkdown.test.tsx — pins preloadMarkdown(): once it has resolved, a
 * LazyMarkdown render settles in one microtask flush with no "Loading..."
 * fallback left. Tests that assert on rendered markdown rely on this so the
 * load-dependent first import (0.3 s idle, >10 s under load) never eats a
 * waitFor, test or hook budget
 * (the studypack suite flaked beside a Playwright dev server).
 */
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import LazyMarkdown, { preloadMarkdown } from '../LazyMarkdown';

// The first react-markdown import is load-dependent (0.3 s idle, >10 s under
// heavy CPU load) and must not count against any waitFor/findBy, test or hook
// budget; file collection has no timeout.
await preloadMarkdown();

describe('preloadMarkdown', () => {
  it('after preloading, markdown renders on the first effect flush without a fallback', async () => {
    render(<LazyMarkdown>{'**warm** text'}</LazyMarkdown>);
    await act(async () => {}); // one microtask flush, no waitFor
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.getByText('warm').tagName).toBe('STRONG');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../ErrorBoundary';

// Component that throws when shouldThrow is true.
function BoomProbe({ shouldThrow, message = 'boom from probe' }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div data-testid="child-ok">child rendered</div>;
}

describe('ErrorBoundary — silent-failure fix (ADR-0001 §Error handling R5)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Capture console.error. React itself also logs the caught render error;
    // we only care whether the ErrorBoundary added its `[ErrorBoundary]` entry.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* suppress */ });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('(a) renders a visible fallback UI with the error message, not a blank screen', () => {
    render(
      <ErrorBoundary>
        <BoomProbe shouldThrow message="oh no a render crash" />
      </ErrorBoundary>
    );

    // The fallback card should be in the document and contain the error message.
    // Before the fix: the default fallback rendered a generic card but did NOT
    // include the error message, so a user / bug report had nothing to copy.
    expect(screen.queryByTestId('child-ok')).not.toBeInTheDocument();
    const fallback = screen.getByTestId('error-boundary-fallback');
    expect(fallback).toBeInTheDocument();
    expect(fallback.textContent || '').toMatch(/oh no a render crash/);
    // Copy-Error button exists
    expect(screen.getByTestId('error-boundary-copy')).toBeInTheDocument();
    // Reset button exists
    expect(screen.getByTestId('error-boundary-reset')).toBeInTheDocument();
  });

  it('(b) logs the caught error with the [ErrorBoundary] greppable prefix', () => {
    render(
      <ErrorBoundary>
        <BoomProbe shouldThrow message="trace-me-12345" />
      </ErrorBoundary>
    );

    // At least one console.error call must be from our boundary with the
    // greppable prefix AND the original message included.
    const matching = errorSpy.mock.calls.filter(args =>
      typeof args[0] === 'string' && args[0].includes('[ErrorBoundary]')
    );
    expect(matching.length).toBeGreaterThan(0);
    // Either the prefix line itself or a companion arg should carry the message.
    const joined = matching.map(a => a.map(x => String(x)).join(' ')).join('\n');
    expect(joined).toMatch(/trace-me-12345/);
  });

  it('(c) reset() via the fallback button retries the subtree (un-catch)', () => {
    // Start thrown, then flip the prop before reset so the retry succeeds.
    let shouldThrow = true;
    const Toggle = () => <BoomProbe shouldThrow={shouldThrow} />;

    const { rerender } = render(
      <ErrorBoundary>
        <Toggle />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();

    // Flip the child to the non-throwing variant.
    shouldThrow = false;
    // Click reset — the boundary should drop hasError and try rendering again.
    fireEvent.click(screen.getByTestId('error-boundary-reset'));
    rerender(
      <ErrorBoundary>
        <Toggle />
      </ErrorBoundary>
    );

    // After reset + successful re-render, the child should be visible and
    // the fallback gone.
    expect(screen.getByTestId('child-ok')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });
});

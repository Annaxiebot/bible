/**
 * landingRoute.test.tsx — root-gate routing · 首頁路由測試
 *
 * Covers the resolution table (root → landing, #app → app, #/pack/<id> → TV,
 * unknown hash → app fallback) and the LandingGate component's rendering of
 * the landing vs the app branch.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { resolveRootView, APP_HASH, SAMPLE_PACK_HASH } from '../landingRoute';
import LandingGate from '../LandingGate';

describe('resolveRootView', () => {
  it('shows the landing only at a bare root URL', () => {
    expect(resolveRootView('')).toBe('landing');
    expect(resolveRootView('#')).toBe('landing');
  });

  it('routes #app to the app', () => {
    expect(resolveRootView(APP_HASH)).toBe('app');
  });

  it('routes #/pack/<id> to TV mode', () => {
    expect(resolveRootView(SAMPLE_PACK_HASH)).toBe('pack');
    expect(resolveRootView('#/pack/2026-10-02-john3')).toBe('pack');
  });

  it('falls through to the app on any unrecognized hash (bookmarked deep state)', () => {
    expect(resolveRootView('#journal')).toBe('app');
    expect(resolveRootView('#/pack/')).toBe('app');
    expect(resolveRootView('#/pack/bad id!')).toBe('app');
    expect(resolveRootView('#chapter=matt-6')).toBe('app');
  });
});

describe('LandingGate', () => {
  const app = <div data-testid="the-app">app shell</div>;

  afterEach(() => {
    cleanup();
    window.location.hash = '';
  });

  it('renders the landing at the bare root', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    expect(await screen.findByTestId('landing-page')).toBeInTheDocument();
    expect(screen.queryByTestId('the-app')).toBeNull();
  });

  it('landing CTAs point at the sample pack and the app hash', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    const sample = await screen.findByRole('link', { name: /See a sample pack/ });
    expect(sample).toHaveAttribute('href', SAMPLE_PACK_HASH);
    const open = screen.getByRole('link', { name: /Open the app/ });
    expect(open).toHaveAttribute('href', APP_HASH);
  });

  it('renders the app at #app', () => {
    window.location.hash = APP_HASH;
    render(<LandingGate app={app} />);
    expect(screen.getByTestId('the-app')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-page')).toBeNull();
  });

  it('renders the app on an unknown hash, never the landing', () => {
    window.location.hash = '#some-bookmarked-state';
    render(<LandingGate app={app} />);
    expect(screen.getByTestId('the-app')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-page')).toBeNull();
  });
});

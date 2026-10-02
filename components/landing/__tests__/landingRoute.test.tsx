/**
 * landingRoute.test.tsx — root-gate routing · 首頁路由測試
 *
 * Covers the resolution table (root → landing, #app → app, #/pack/<id> → TV,
 * unknown hash → app fallback) and the LandingGate component's rendering of
 * the landing vs the app branch. Strings come from landingStrings (R3).
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { STAR_COUNT } from '../themes/StarsTheme';
import { HERO_THEMES } from '../heroThemes';
import { resolveRootView, APP_HASH, SAMPLE_PACK_HASH, SETUP_HASH, NEW_STUDY_HASH } from '../landingRoute';
import {
  BRAND_EN, BRAND_ZH, GROUP_CTA, PERSONAL_CTA,
  GROUP_TITLE_ZH, GROUP_TITLE_EN, PERSONAL_TITLE_ZH, PERSONAL_TITLE_EN, LOOP_STEPS, SETUP_LINE,
  NEW_STUDY_LINE,
} from '../landingStrings';
import { SETUP_TITLE, SETUP_CLOSE } from '../../setup/setupStrings';
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

  it('routes #/setup to the landing with the setup dialog', () => {
    expect(resolveRootView(SETUP_HASH)).toBe('setup');
  });

  it('routes #/new to the New study page', () => {
    expect(resolveRootView(NEW_STUDY_HASH)).toBe('new');
  });

  it('falls through to the app on any unrecognized hash (bookmarked deep state)', () => {
    expect(resolveRootView('#/setup/extra')).toBe('app');
    expect(resolveRootView('#/new/extra')).toBe('app');
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
    window.history.replaceState(null, '', window.location.pathname);
    window.sessionStorage.clear();
  });

  it('renders the landing at the bare root', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    expect(await screen.findByTestId('landing-page')).toBeInTheDocument();
    expect(screen.queryByTestId('the-app')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: BRAND_EN })).toBeInTheDocument();
    expect(screen.getAllByText(BRAND_ZH).length).toBeGreaterThan(0);
  });

  it('card titles and loop labels are Chinese first, English second (ADR-0003)', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    const group = screen.getByTestId('card-group');
    const personal = screen.getByTestId('card-personal');
    expect(group.querySelector('h2')?.textContent).toBe(`${GROUP_TITLE_ZH} ${GROUP_TITLE_EN}`);
    expect(personal.querySelector('h2')?.textContent).toBe(`${PERSONAL_TITLE_ZH} ${PERSONAL_TITLE_EN}`);
    const labels = within(screen.getByTestId('loop-labels'));
    for (const step of LOOP_STEPS) {
      expect(labels.getByText(step.zh).nextElementSibling?.textContent).toBe(step.en);
    }
  });

  it('renders the stars sky behind the hero: 40 stars, pointer-events none, decorative, captioned', async () => {
    window.history.replaceState(null, '', '?theme=stars');
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    const sky = screen.getByTestId('landing-sky');
    expect(sky).toHaveStyle({ pointerEvents: 'none' });
    expect(sky).toHaveAttribute('aria-hidden', 'true');
    expect(sky).toHaveAttribute('data-theme', 'stars');
    const stars = screen.getByTestId('theme-stars').querySelectorAll('circle.ld-star');
    expect(stars).toHaveLength(STAR_COUNT);
    expect(screen.getByTestId('theme-stars').querySelectorAll('.ld-star-named')).toHaveLength(4);
    expect(screen.getByTestId('layer-birds')).toBeInTheDocument();
    const starsTheme = HERO_THEMES.find(t => t.id === 'stars')!;
    expect(screen.getByTestId('theme-caption').textContent).toBe(`${starsTheme.verseZh} · ${starsTheme.verseEn}`);
  });

  it('the caption verse refs are interactive: hover opens the bundled-verse popup, 和合本 first', async () => {
    window.history.replaceState(null, '', '?theme=stars');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        reference: 'x',
        verses: [{ book_id: 'PSA', book_name: 'x', chapter: 147, verse: 4,
          text: url.includes('/cuv/') ? '他数点星宿的数目' : 'He determines the number of the stars' }],
      }),
    })));
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    const refs = within(screen.getByTestId('theme-caption')).getAllByTestId('verse-ref');
    expect(refs.map(r => r.textContent)).toEqual(['詩篇 147:4', 'Psalm 147:4']);
    fireEvent.mouseEnter(refs[0]);
    const tooltip = await screen.findByRole('tooltip');
    expect(screen.getByTestId('verse-tooltip-title')).toHaveTextContent('诗篇 147:4 · Psalm 147:4');
    await within(tooltip).findByText(/他数点星宿的数目/);
    const text = tooltip.textContent ?? '';
    expect(text.indexOf('他数点星宿的数目')).toBeLessThan(text.indexOf('He determines the number of the stars'));
    vi.unstubAllGlobals();
  });

  it('renders the dawn theme on ?theme=dawn', async () => {
    window.history.replaceState(null, '', '?theme=dawn');
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    expect(screen.getByTestId('landing-sky')).toHaveAttribute('data-theme', 'dawn');
    expect(screen.getByTestId('theme-dawn')).toBeInTheDocument();
    expect(screen.queryByTestId('theme-stars')).toBeNull();
  });

  it('landing CTAs point at the sample pack and the app hash', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    const sample = await screen.findByRole('link', { name: GROUP_CTA });
    expect(sample).toHaveAttribute('href', SAMPLE_PACK_HASH);
    const open = screen.getByRole('link', { name: PERSONAL_CTA });
    expect(open).toHaveAttribute('href', APP_HASH);
  });

  it('the setup line opens the quick AI dialog; closing it leaves the landing in place', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    expect(screen.queryByRole('dialog')).toBeNull();
    const line = screen.getByTestId('landing-setup-line');
    expect(line).toHaveTextContent(SETUP_LINE);
    fireEvent.click(line);
    expect(screen.getByRole('dialog', { name: SETUP_TITLE })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
  });

  it('#/setup opens the landing with the dialog already open; closing clears the hash', async () => {
    window.location.hash = SETUP_HASH;
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    expect(screen.getByRole('dialog', { name: SETUP_TITLE })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: SETUP_CLOSE }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('the New study line points at #/new, and #/new renders the New study page', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    const line = screen.getByTestId('landing-new-study-line');
    expect(line).toHaveTextContent(NEW_STUDY_LINE);
    expect(line).toHaveAttribute('href', NEW_STUDY_HASH);
    cleanup();
    window.location.hash = NEW_STUDY_HASH;
    render(<LandingGate app={app} />);
    expect(await screen.findByTestId('new-study-page')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-page')).toBeNull();
    expect(screen.queryByTestId('the-app')).toBeNull();
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

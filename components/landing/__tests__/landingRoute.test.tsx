/**
 * landingRoute.test.tsx — root-gate routing · 首页路由测试
 *
 * Covers the resolution table (root → landing, #app → app, #/pack/<id> → TV,
 * unknown hash → app fallback) and the LandingGate component's rendering of
 * the landing vs the app branch, plus the landing's structure: Chinese-first
 * headings, decorative rings, photos (size + alt), the bundled verse card. Strings come from landingStrings (R3).
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { resolveRootView, APP_HASH, SAMPLE_PACK_HASH, SETUP_HASH, NEW_STUDY_HASH, newStudyHash, getNewStudyPackIdFromHash } from '../landingRoute';
import {
  BRAND_EN, BRAND_ZH, GROUP_CTA, PERSONAL_CTA, GROUP_HEADING_EN, GROUP_PHOTOS, PHOTO_CREDIT,
  GROUP_TITLE_ZH, PERSONAL_TITLE_ZH, PERSONAL_TITLE_EN, LOOP_STEPS, SETUP_LINE,
  NEW_STUDY_LINE, PERSONAL_VERSE_REF,
} from '../landingStrings';
import { SETUP_TITLE, SETUP_CLOSE } from '../../setup/setupStrings';
import { signupHash, qrHash } from '../../signup/signupRoute';
import { leaderHash } from '../../leader/leaderRoute';
import { SU_TITLE } from '../../signup/signupStrings';
import { LD_TITLE } from '../../leader/leaderStrings';
import LandingGate, { preloadLandingPages } from '../LandingGate';
import { photoSrc } from '../LandingGroup';
import { clearExternalVerseCache } from '../../studypack/externalVerses';

// The pages are React.lazy; their first import is load-dependent (several
// seconds under heavy CPU load) and must not count against a 1 s findBy.
// Top-level await: file collection has no timeout (a beforeAll hook does).
await preloadLandingPages();

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

  it('routes #/new and #/new/<packId> (the saved-pack editor) to the New study page', () => {
    expect(resolveRootView(NEW_STUDY_HASH)).toBe('new');
    expect(resolveRootView(newStudyHash('local-2026-10-02-jhn3'))).toBe('new');
    expect(newStudyHash('local-2026-10-02-jhn3')).toBe('#/new/local-2026-10-02-jhn3');
    expect(getNewStudyPackIdFromHash('#/new/local-2026-10-02-jhn3')).toBe('local-2026-10-02-jhn3');
    expect(getNewStudyPackIdFromHash(NEW_STUDY_HASH)).toBeNull();
    expect(getNewStudyPackIdFromHash('#/new/')).toBeNull();
    expect(getNewStudyPackIdFromHash('#/new/bad id')).toBeNull();
  });

  it('routes #/signup/<id> and #/leader/<id> to the sign-up and leader pages', () => {
    expect(resolveRootView(signupHash('2026-10-02-matt6'))).toBe('signup');
    expect(resolveRootView(signupHash('local-2026-10-02-jhn3'))).toBe('signup');
    expect(resolveRootView(leaderHash('2026-10-02-matt6'))).toBe('leader');
  });

  it('routes #/qr/<id> to the leader QR page; a bad id falls through to the app', () => {
    expect(resolveRootView(qrHash('local-2026-10-02-jhn3'))).toBe('qr');
    expect(resolveRootView(qrHash('2026-10-02-matt6'))).toBe('qr');
    expect(resolveRootView('#/qr/')).toBe('app');
    expect(resolveRootView('#/qr/bad id')).toBe('app');
  });

  it('falls through to the app on any unrecognized hash (bookmarked deep state)', () => {
    expect(resolveRootView('#/signup/')).toBe('app');
    expect(resolveRootView('#/leader/bad id')).toBe('app');
    expect(resolveRootView('#/setup/extra')).toBe('app');
    expect(resolveRootView('#/new/bad id')).toBe('app');
    expect(resolveRootView('#/new/')).toBe('app');
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
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(BRAND_ZH);
    expect(screen.getAllByText(BRAND_EN).length).toBeGreaterThan(0);
  });

  it('loop cards and section headings are Chinese first, English second (ADR-0003)', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    LOOP_STEPS.forEach((step, i) => {
      const title = within(screen.getByTestId(`loop-card-${i + 1}`)).getByRole('heading', { level: 3 });
      expect(title.textContent).toBe(`${step.zh}${step.en}`);
    });
    expect(within(screen.getByTestId('section-group')).getByRole('heading', { level: 2 }).textContent)
      .toBe(`${GROUP_TITLE_ZH}${GROUP_HEADING_EN}`);
    expect(within(screen.getByTestId('section-personal')).getByRole('heading', { level: 2 }).textContent)
      .toBe(`${PERSONAL_TITLE_ZH}${PERSONAL_TITLE_EN}`);
  });

  it('the rings sit behind the hero: decorative, click-through, no sky themes left', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    const rings = screen.getByTestId('hero-rings');
    expect(rings).toHaveAttribute('aria-hidden', 'true');
    expect(rings.querySelectorAll('.ld-rings-wave circle')).toHaveLength(4);
    expect(screen.queryByTestId('landing-sky')).toBeNull();
  });

  it('the three photos carry width/height, Chinese-first alt text, and lazy loading after the first', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    const imgs = within(screen.getByTestId('group-photos')).getAllByRole('img');
    expect(imgs).toHaveLength(GROUP_PHOTOS.length);
    imgs.forEach((img, i) => {
      const photo = GROUP_PHOTOS[i];
      expect(img).toHaveAttribute('src', photoSrc(photo.file));
      expect(img).toHaveAttribute('width', String(photo.width));
      expect(img).toHaveAttribute('height', String(photo.height));
      expect(img.getAttribute('alt')).toBe(photo.alt);
      expect(photo.alt).toMatch(/^[\u4e00-\u9fff]/);
      expect(img).toHaveAttribute('loading', i === 0 ? 'eager' : 'lazy');
    });
    expect(screen.getByTestId('photo-credit')).toHaveTextContent(PHOTO_CREDIT);
  });

  it('the personal verse card loads Matthew 6:34 from the bundled data; its refs open the popup, 和合本 first', async () => {
    window.location.hash = '';
    clearExternalVerseCache();  // earlier renders cached the unstubbed (failed) chapter loads
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: !url.includes('/packs/'),
      status: url.includes('/packs/') ? 404 : 200,
      json: async () => ({
        reference: 'x',
        verses: [33, 34].map(verse => ({ book_id: 'MAT', book_name: 'x', chapter: 6, verse,
          text: url.includes('/cuv/') ? `和合本经文${verse}` : `BSB text ${verse}` })),
      }),
    })));
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    const card = screen.getByTestId('personal-verse');
    expect(await within(card).findByText('和合本经文34')).toBeInTheDocument();
    expect(within(card).getByText('BSB text 34')).toBeInTheDocument();
    const refs = within(card).getAllByTestId('verse-ref');
    expect(refs.map(r => r.textContent)).toEqual([PERSONAL_VERSE_REF.zh, PERSONAL_VERSE_REF.en]);
    fireEvent.mouseEnter(refs[0]);
    const tooltip = await screen.findByRole('tooltip');
    await within(tooltip).findByText(/和合本经文34/);
    const text = tooltip.textContent ?? '';
    expect(text.indexOf('和合本经文34')).toBeLessThan(text.indexOf('BSB text 34'));
    vi.unstubAllGlobals();
  });

  it('landing CTAs point at the sample pack, New study and the app hash', async () => {
    window.location.hash = '';
    render(<LandingGate app={app} />);
    await screen.findByTestId('landing-page');
    const samples = screen.getAllByRole('link', { name: GROUP_CTA });
    expect(samples.map(l => l.getAttribute('data-testid'))).toEqual(['hero-sample', 'group-sample']);
    for (const sample of samples) expect(sample).toHaveAttribute('href', SAMPLE_PACK_HASH);
    expect(screen.getByTestId('hero-new-study')).toHaveAttribute('href', NEW_STUDY_HASH);
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

  it('#/signup/<id> renders the sign-up page and #/leader/<id> the leader page, never the landing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    window.location.hash = signupHash('2026-10-02-matt6');
    render(<LandingGate app={app} />);
    expect(await screen.findByTestId('signup-page')).toHaveTextContent(SU_TITLE);
    expect(screen.queryByTestId('landing-page')).toBeNull();
    cleanup();
    window.location.hash = leaderHash('2026-10-02-matt6');
    render(<LandingGate app={app} />);
    expect(await screen.findByTestId('leader-page')).toHaveTextContent(LD_TITLE);
    expect(screen.queryByTestId('the-app')).toBeNull();
    cleanup();
    window.location.hash = qrHash('2026-10-02-matt6');
    render(<LandingGate app={app} />);
    expect(await screen.findByTestId('qr-page')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-page')).toBeNull();
    vi.unstubAllGlobals();
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

/**
 * LandingNextStudy.test.tsx — the next-study block · 下次查经测试
 *
 * Loads the pack through the TV-mode seam (fetch of public/packs/<id>.json
 * with the schema query), renders title/passage/date Chinese first, and
 * falls back to a bilingual "none yet" line — no error UI — when the fetch
 * fails. Strings are imported (R3).
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import LandingNextStudy from '../LandingNextStudy';
import { packHash } from '../landingRoute';
import { currentSignupUrl, signupHash } from '../../signup/signupRoute';
import { SU_QR_BODY, qrAltText } from '../../signup/signupStrings';
import { PACK_SCHEMA_VERSION } from '../../studypack/packTypes';
import {
  NEXT_EYEBROW, NEXT_HEADING_ZH, NEXT_HEADING_EN, NEXT_OPEN_CTA, NEXT_SIGNUP_CTA,
  NEXT_SIGNUP_CLOSE, NEXT_NONE_YET, NEXT_LOADING,
} from '../landingStrings';

const PACK_ID = '2026-10-02-matt6';
const PACK = {
  id: PACK_ID,
  title: '不要忧虑 Do Not Be Anxious — 马太福音 6:25–34',
  date: '2026-10-02',
  passageRef: '马太福音 6:25–34 · Matthew 6:25–34',
  enVersion: 'BSB',
  sections: [{ kind: 'title', heading: '不要忧虑 Do Not Be Anxious' }],
};

function stubFetch(impl: () => Promise<unknown>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('LandingNextStudy', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('fetches the pack through the schema-versioned pack URL and shows title, passage, date', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, json: async () => PACK }));
    render(<LandingNextStudy packId={PACK_ID} />);
    expect(screen.getByTestId('next-study-empty')).toHaveTextContent(NEXT_LOADING);
    const block = await screen.findByTestId('next-study-pack');
    // One pack fetch; the other calls are the key verse's bundled chapters (LandingVerse).
    expect((fetchMock.mock.calls as unknown[][]).filter(([url]) => String(url).includes('/packs/'))).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/packs/${PACK_ID}.json?schema=${PACK_SCHEMA_VERSION}`, expect.objectContaining({ cache: 'no-cache' })
    );
    expect(block).toHaveTextContent(PACK.title);
    expect(block).toHaveTextContent(PACK.passageRef);
    expect(block).toHaveTextContent(PACK.date);
    expect(screen.queryByTestId('next-study-empty')).toBeNull();
  });

  it('heading is Chinese first, English second, under the eyebrow', async () => {
    stubFetch(async () => ({ ok: true, json: async () => PACK }));
    render(<LandingNextStudy packId={PACK_ID} />);
    await screen.findByTestId('next-study-pack');
    const section = screen.getByTestId('section-next');
    expect(section.textContent?.indexOf(NEXT_EYEBROW)).toBeLessThan(section.textContent!.indexOf(NEXT_HEADING_ZH));
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe(`${NEXT_HEADING_ZH}${NEXT_HEADING_EN}`);
  });

  it('falls back to the bilingual none-yet line when the fetch fails, keeping the pack link', async () => {
    stubFetch(async () => ({ ok: false, status: 404 }));
    render(<LandingNextStudy packId={PACK_ID} />);
    expect(await screen.findByText(NEXT_NONE_YET)).toBeInTheDocument();
    expect(screen.queryByTestId('next-study-pack')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: NEXT_OPEN_CTA })).toHaveAttribute('href', packHash(PACK_ID));
  });

  it('falls back the same way when fetch itself rejects (offline)', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch'); });
    render(<LandingNextStudy packId={PACK_ID} />);
    expect(await screen.findByText(NEXT_NONE_YET)).toBeInTheDocument();
  });

  it('the open CTA points at the TV-mode hash for the given pack id', async () => {
    stubFetch(async () => ({ ok: true, json: async () => PACK }));
    render(<LandingNextStudy packId="2026-10-02-john3" />);
    await screen.findByTestId('next-study-pack');
    expect(screen.getByRole('link', { name: NEXT_OPEN_CTA })).toHaveAttribute('href', packHash('2026-10-02-john3'));
  });

  it('a demo pack (no leaderId) has no Sign up button at all — it takes no sign-ups (owner)', async () => {
    stubFetch(async () => ({ ok: true, json: async () => PACK }));
    render(<LandingNextStudy packId={PACK_ID} />);
    await screen.findByTestId('next-study-pack');
    expect(screen.queryByRole('button', { name: NEXT_SIGNUP_CTA })).toBeNull();
    expect(screen.queryByTestId('next-study-signup')).toBeNull();
  });

  it('sign-up on an owned pack reveals its QR (encoding its sign-up URL) and the #/signup link', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ ...PACK, leaderId: 'uid-lead' }) }));
    render(<LandingNextStudy packId={PACK_ID} />);
    await screen.findByTestId('next-study-pack');
    expect(screen.queryByTestId('next-study-signup')).toBeNull();
    const toggle = screen.getByRole('button', { name: NEXT_SIGNUP_CTA });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const panel = screen.getByTestId('next-study-signup');
    const qr = within(panel).getByRole('img', { name: qrAltText(currentSignupUrl(PACK_ID)) });
    expect(qr).toHaveAttribute('data-signup-url', currentSignupUrl(PACK_ID));
    await waitFor(() => expect(qr.querySelector('svg')).not.toBeNull());
    expect(panel.querySelector('a')).toHaveAttribute('href', signupHash(PACK_ID));
    expect(panel).toHaveTextContent(SU_QR_BODY);
    expect(screen.getByRole('button', { name: NEXT_SIGNUP_CLOSE })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: NEXT_SIGNUP_CLOSE }));
    expect(screen.queryByTestId('next-study-signup')).toBeNull();
  });
});

/**
 * newStudyFunnel.test.tsx — the leader's New-study flow sends the right anonymous counts · 新建查经漏斗计数 (ADR-0025)
 *
 * Through the real page (generation pipeline mocked, the dev seam signs the
 * leader in): opening #/new counts once even when the page mounts again
 * inside the window (and an editor's #/new/<id> never counts); signed out,
 * opening still counts; Generate counts "pressed" and exactly one outcome
 * with the wait — ok, failed (Retry is a new attempt), abandoned on Cancel,
 * on leaving New study mid-generation (a late result does not count), and
 * on pagehide (sent with keepalive).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { signInSeam, signOutSeam, SEAM_BASE, SEAM_ANON_KEY } from '../../../tests/utils/hostedSeam';
import { installMemoryStorage } from '../../../tests/utils/memoryStorage';
import { idbService } from '../../../services/idbService';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { NS_GENERATE, NS_EDIT_TITLE, NS_RETRY, NS_ERR_NO_JSON, NS_CANCEL } from '../newStudyStrings';
import { newStudyHash } from '../../landing/landingRoute';
import { LOG_FUNNEL_FN } from '../../stats/funnelRules';
import { resetFunnelMemory } from '../../stats/funnel';
import NewStudyPage from '../NewStudyPage';

const generateMock = vi.fn();
vi.mock('../generatePack', () => ({
  generateStudyPack: (...args: unknown[]) => generateMock(...args),
}));
vi.mock('../../../services/bibleDataSource', () => ({
  fetchBundledChapter: async () => ({
    verses: Array.from({ length: 36 }, (_, i) => ({ verse: i + 1, text: `v${i + 1}` })),
  }),
}));

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const generatedPack = () => assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200 }) as Response);
interface Sent { p_event: string; p_wait_seconds: number | null; keepalive: boolean }
const sent = (): Sent[] => fetchMock.mock.calls
  .filter(([url]) => url === `${SEAM_BASE}/rest/v1/rpc/${LOG_FUNNEL_FN}`)
  .map(([, init]) => ({ ...JSON.parse(String(init!.body)), keepalive: init!.keepalive === true }));
const eventsSent = () => sent().map(s => s.p_event);

type Seams = Window & { __SUPABASE_E2E__?: unknown };

beforeEach(async () => {
  installMemoryStorage();
  resetFunnelMemory();
  generateMock.mockReset();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  await idbService.clear('studypacks');
  window.location.hash = '#/new';
  signInSeam();
});
afterEach(() => {
  vi.unstubAllGlobals();
  signOutSeam();
});

async function generate() {
  await screen.findByTestId('new-study-form');
  await waitFor(() => expect(screen.getByTestId('ns-verse-to')).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: NS_GENERATE }));
}

/** A generation that waits until the test ends it, and rejects with AbortError when cancelled. */
function pendingGeneration() {
  let resolve: (v: unknown) => void = () => undefined;
  generateMock.mockImplementation((_req: unknown, _progress: unknown, signal: AbortSignal) => new Promise((ok, fail) => {
    resolve = ok;
    signal.addEventListener('abort', () => fail(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  return { finish: (v: unknown) => resolve(v) };
}

describe('New study → anonymous funnel counts', () => {
  it('opening #/new counts once, also when the page mounts again inside the window; #/new/<id> does not count', async () => {
    const first = render(<NewStudyPage />);
    await screen.findByTestId('new-study-form');
    first.unmount();
    const second = render(<NewStudyPage />);
    await screen.findByTestId('new-study-form');
    expect(eventsSent()).toEqual(['new_study_opened']);
    expect(sent()[0]).toEqual({ p_event: 'new_study_opened', p_wait_seconds: null, keepalive: true });
    const headers = fetchMock.mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SEAM_ANON_KEY}`);   // the anon key, never the session token
    second.unmount();

    resetFunnelMemory();
    installMemoryStorage();   // a fresh browser: only the route keeps it from counting
    window.location.hash = newStudyHash('local-2026-10-02-jhn3');
    render(<NewStudyPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('找不到这个查经包');
    expect(eventsSent()).toEqual(['new_study_opened']);
  });

  it('signed out, opening New study still counts (the sign-in card shows)', async () => {
    signOutSeam();
    (window as Seams).__SUPABASE_E2E__ = { url: SEAM_BASE, anonKey: SEAM_ANON_KEY };
    render(<NewStudyPage />);
    expect(screen.getByTestId('quick-ai-setup')).toBeInTheDocument();
    await waitFor(() => expect(eventsSent()).toEqual(['new_study_opened']));
  });

  it('Generate → pressed, then ok with the wait in seconds', async () => {
    generateMock.mockResolvedValue(generatedPack());
    render(<NewStudyPage />);
    await generate();
    await waitFor(() => expect(screen.getByText(NS_EDIT_TITLE)).toBeInTheDocument());
    await waitFor(() => expect(eventsSent()).toEqual(['new_study_opened', 'generate_pressed', 'pack_ok']));
    const ok = sent()[2];
    expect(Number.isInteger(ok.p_wait_seconds)).toBe(true);
    expect(ok.p_wait_seconds).toBeGreaterThanOrEqual(0);
    await waitFor(() => expect(screen.getByTestId('ns-range-verse-to')).toBeEnabled());
  });

  it('a failure counts failed; Retry is a new attempt (pressed again, then ok)', async () => {
    generateMock.mockRejectedValueOnce(new Error(NS_ERR_NO_JSON)).mockResolvedValueOnce(generatedPack());
    render(<NewStudyPage />);
    await generate();
    expect(await screen.findByRole('alert')).toHaveTextContent(NS_ERR_NO_JSON);
    fireEvent.click(screen.getByRole('button', { name: NS_RETRY }));
    await waitFor(() => expect(screen.getByText(NS_EDIT_TITLE)).toBeInTheDocument());
    await waitFor(() => expect(eventsSent()).toEqual([
      'new_study_opened', 'generate_pressed', 'pack_failed', 'generate_pressed', 'pack_ok',
    ]));
    await waitFor(() => expect(screen.getByTestId('ns-range-verse-to')).toBeEnabled());
  });

  it('Cancel while generating counts abandoned', async () => {
    pendingGeneration();
    render(<NewStudyPage />);
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: NS_CANCEL }));
    await screen.findByTestId('new-study-form');
    await waitFor(() => expect(eventsSent()).toEqual(['new_study_opened', 'generate_pressed', 'pack_abandoned']));
  });

  it('leaving New study mid-generation counts abandoned; the result arriving later does not count', async () => {
    const run = pendingGeneration();
    const page = render(<NewStudyPage />);
    await generate();
    await screen.findByTestId('ns-progress');
    page.unmount();
    run.finish(generatedPack());
    await waitFor(() => expect(eventsSent()).toEqual(['new_study_opened', 'generate_pressed', 'pack_abandoned']));
    await new Promise(r => setTimeout(r, 20));
    expect(eventsSent()).not.toContain('pack_ok');
  });

  it('the tab closing (pagehide) mid-generation counts abandoned, sent with keepalive', async () => {
    const run = pendingGeneration();
    render(<NewStudyPage />);
    await generate();
    await screen.findByTestId('ns-progress');
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => expect(eventsSent()).toEqual(['new_study_opened', 'generate_pressed', 'pack_abandoned']));
    expect(sent()[2].keepalive).toBe(true);
    run.finish(generatedPack());
    await waitFor(() => expect(screen.getByText(NS_EDIT_TITLE)).toBeInTheDocument());
    expect(eventsSent()).not.toContain('pack_ok');
    await waitFor(() => expect(screen.getByTestId('ns-range-verse-to')).toBeEnabled());
  });
});

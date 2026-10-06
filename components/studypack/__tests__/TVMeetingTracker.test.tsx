/**
 * TVMeetingTracker.test.tsx — TV mode logs one meeting after 10 visible minutes · 电视模式聚会记录 (ADR-0012)
 *
 * The real TVPresentationView with a fetched pack; the RPC client is a fake
 * whose log_presentation enforces the server's seconds range. A leader pack
 * shown for 10 minutes calls it once; the landing demo pack never does.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { TEST_PACK_PATH } from './fixtures';
import { SAMPLE_PACK_ID } from '../../landing/landingRoute';
import { LOG_PRESENTATION_FN, MEETING_MIN_SECONDS, MEETING_MAX_SECONDS } from '../../stats/statsRules';
import { preloadMarkdown } from '../../LazyMarkdown';

await preloadMarkdown();

const rpc = vi.fn(async (fn: string, args: { p_seconds: number }) => (
  fn === LOG_PRESENTATION_FN && args.p_seconds >= MEETING_MIN_SECONDS && args.p_seconds <= MEETING_MAX_SECONDS
    ? { data: true, error: null } : { data: null, error: { message: 'refused' } }));
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => ({ rpc }) }));

import TVPresentationView from '../TVPresentationView';

const LEADER_PACK = '2026-10-02-john3';

async function present(packId: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'))) }));
  render(<TVPresentationView packId={packId} onExit={vi.fn()} />);
  await waitFor(() => expect(screen.getByTestId('tv-counter')).toBeInTheDocument());
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  rpc.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TV presentation → meeting', () => {
  it('a pack presented for 10 visible minutes is logged once', async () => {
    await present(LEADER_PACK);
    await vi.advanceTimersByTimeAsync(MEETING_MIN_SECONDS * 1000 - 5000);
    expect(rpc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe(LOG_PRESENTATION_FN);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_pack_id: LEADER_PACK });
    await vi.advanceTimersByTimeAsync(MEETING_MIN_SECONDS * 3000);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('the landing demo pack is never logged', async () => {
    await present(SAMPLE_PACK_ID);
    await vi.advanceTimersByTimeAsync(MEETING_MIN_SECONDS * 2000);
    expect(rpc).not.toHaveBeenCalled();
  });
});

/**
 * useMeetingTracker.test.tsx — a TV presentation becomes one meeting · 小组聚会记录测试 (ADR-0012)
 *
 * Fake timers drive the clock; document.visibilityState is stubbed and the
 * visibilitychange event fired by hand. The RPC client is a fake whose
 * log_presentation enforces the server's seconds range (600..21600), so a
 * client that sent too few seconds would fail here as it would live.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { LOG_PRESENTATION_FN, MEETING_MIN_SECONDS, MEETING_MAX_SECONDS } from '../statsRules';
import { SAMPLE_PACK_ID } from '../../landing/landingRoute';

type RpcReply = { data: unknown; error: { message: string } | null };
const rpc = vi.fn(async (fn: string, args: { p_pack_id: string; p_seconds: number }): Promise<RpcReply> => {
  if (fn !== LOG_PRESENTATION_FN) return { data: null, error: { message: 'unknown function' } };
  if (args.p_seconds < MEETING_MIN_SECONDS || args.p_seconds > MEETING_MAX_SECONDS) return { data: null, error: { message: 'out of range' } };
  return { data: true, error: null };
});
let client: { rpc: typeof rpc } | null = { rpc };
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => client }));

import { useMeetingTracker, logPresentation } from '../useMeetingTracker';

const PACK = 'local-2026-10-09-jhn3';
const MIN_MS = MEETING_MIN_SECONDS * 1000;
let visibility: DocumentVisibilityState = 'visible';

function setVisibility(value: DocumentVisibilityState) {
  visibility = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockClear();
  client = { rpc };
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
afterEach(() => { vi.useRealTimers(); });

describe('useMeetingTracker', () => {
  it('calls log_presentation once at 600 s of visible time, with the seconds', async () => {
    renderHook(() => useMeetingTracker(PACK, true));
    await vi.advanceTimersByTimeAsync(MIN_MS - 1000);
    expect(rpc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(LOG_PRESENTATION_FN, { p_pack_id: PACK, p_seconds: MEETING_MIN_SECONDS });
    await vi.advanceTimersByTimeAsync(MIN_MS * 3);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('hidden time does not count: 5 min visible + 30 min hidden + 5 min visible = the call', async () => {
    renderHook(() => useMeetingTracker(PACK, true));
    await vi.advanceTimersByTimeAsync(MIN_MS / 2);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(MIN_MS * 3);
    expect(rpc).not.toHaveBeenCalled();
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(MIN_MS / 2 - 1000);
    expect(rpc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a presentation that starts hidden waits until it is shown', async () => {
    visibility = 'hidden';
    renderHook(() => useMeetingTracker(PACK, true));
    await vi.advanceTimersByTimeAsync(MIN_MS * 2);
    expect(rpc).not.toHaveBeenCalled();
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(MIN_MS);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('never counts the landing demo pack', async () => {
    renderHook(() => useMeetingTracker(SAMPLE_PACK_ID, true));
    await vi.advanceTimersByTimeAsync(MIN_MS * 2);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not start before the pack has loaded, and stops when the view closes', async () => {
    const { rerender, unmount } = renderHook(({ active }) => useMeetingTracker(PACK, active), { initialProps: { active: false } });
    await vi.advanceTimersByTimeAsync(MIN_MS * 2);
    expect(rpc).not.toHaveBeenCalled();
    rerender({ active: true });
    await vi.advanceTimersByTimeAsync(MIN_MS / 2);
    unmount();
    await vi.advanceTimersByTimeAsync(MIN_MS * 2);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a failed or throwing call is swallowed (stats are non-essential); no client is a no-op', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(logPresentation(client as never, PACK, MEETING_MIN_SECONDS)).resolves.toBeUndefined();
    rpc.mockRejectedValueOnce(new Error('network down'));
    await expect(logPresentation(client as never, PACK, MEETING_MIN_SECONDS)).resolves.toBeUndefined();
    await expect(logPresentation(null, PACK, MEETING_MIN_SECONDS)).resolves.toBeUndefined();
    client = null;
    renderHook(() => useMeetingTracker(PACK, true));
    await vi.advanceTimersByTimeAsync(MIN_MS);
    expect(rpc).toHaveBeenCalledTimes(2);   // only the two direct calls above
  });
});

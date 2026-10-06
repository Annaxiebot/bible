/**
 * siteStats.test.ts — the totals are read once per session · 全站统计读取测试 (ADR-0012)
 *
 * The client is a fake whose site_stats answers like the SQL (all six counts
 * + as_of). One call serves every later caller; a failure is not cached;
 * a malformed reply is a failure, not zeros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SITE_STATS_FN, SITE_STATS_KEYS } from '../statsRules';

const STATS_REPLY = { packs: 12, leaders: 10, meetings: 7, signups: 40, practices: 95, checkins_shared: 31, as_of: '2026-10-06T00:00:00Z' };
const rpc = vi.fn(async (fn: string) => (fn === SITE_STATS_FN ? { data: STATS_REPLY, error: null } : { data: null, error: { message: 'unknown' } }));
let client: { rpc: typeof rpc } | null = { rpc };
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => client }));

import { loadSiteStats, resetSiteStatsCache, parseSiteStats } from '../siteStats';

beforeEach(() => {
  rpc.mockClear();
  client = { rpc };
  resetSiteStatsCache();
});

describe('siteStats', () => {
  it('one RPC serves every caller in the session', async () => {
    const [a, b] = await Promise.all([loadSiteStats(), loadSiteStats()]);
    const c = await loadSiteStats();
    expect(a).toEqual(STATS_REPLY);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(SITE_STATS_FN);
  });

  it('a failure is not cached: the next visit tries again', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(loadSiteStats()).rejects.toThrow('boom');
    await expect(loadSiteStats()).resolves.toEqual(STATS_REPLY);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('no client (unconfigured build) is a typed failure, no call', async () => {
    client = null;
    await expect(loadSiteStats()).rejects.toThrow('not configured');
  });

  it('a malformed reply is a failure, never zeros', async () => {
    rpc.mockResolvedValueOnce({ data: { ...STATS_REPLY, leaders: '10' } as never, error: null });
    await expect(loadSiteStats()).rejects.toThrow('unexpected reply');
    for (const key of SITE_STATS_KEYS) {
      expect(parseSiteStats({ ...STATS_REPLY, [key]: -1 })).toBeNull();
      expect(parseSiteStats({ ...STATS_REPLY, [key]: undefined })).toBeNull();
    }
    expect(parseSiteStats(null)).toBeNull();
  });
});

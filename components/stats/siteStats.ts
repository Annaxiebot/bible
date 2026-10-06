/**
 * siteStats.ts — read the site-wide totals once per session · 全站统计读取 (ADR-0012)
 *
 * site_stats() is a SECURITY DEFINER RPC callable by anon and authenticated
 * (database/site-stats-schema.sql); it returns totals only. The first caller
 * starts the request and every later caller (navigation back to the leader
 * home or the landing) gets the same promise — one call per page session.
 * A failure clears the cache so a later visit may try again. Failures are
 * typed, never thrown into React: the landing hides the live variant and the
 * leader home shows one quiet line.
 */
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSignupClient } from '../signup/signupClient';
import { SITE_STATS_FN, SITE_STATS_KEYS, SiteStats } from './statsRules';

export type SiteStatsState =
  | { status: 'loading' }
  | { status: 'ok'; stats: SiteStats }
  | { status: 'failed'; message: string };

const NOT_CONFIGURED = 'not configured';

/** The RPC's jsonb as SiteStats, or null when any count is missing or not a non-negative integer. */
export function parseSiteStats(value: unknown): SiteStats | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of SITE_STATS_KEYS) {
    const n = row[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
    out[key] = n;
  }
  return { ...(out as Record<typeof SITE_STATS_KEYS[number], number>), as_of: typeof row.as_of === 'string' ? row.as_of : '' };
}

/** One RPC call; throws an Error carrying the reason. */
export async function fetchSiteStats(client: SupabaseClient): Promise<SiteStats> {
  const { data, error } = await client.rpc(SITE_STATS_FN);
  if (error) throw new Error(error.message);
  const stats = parseSiteStats(data);
  if (!stats) throw new Error(`unexpected reply: ${JSON.stringify(data)}`);
  return stats;
}

let cached: Promise<SiteStats> | null = null;

/** The session's totals: the first call fetches, later calls share it; a failure is not cached. */
export function loadSiteStats(): Promise<SiteStats> {
  if (cached) return cached;
  const client = getSignupClient();
  if (!client) return Promise.reject(new Error(NOT_CONFIGURED));
  const pending = fetchSiteStats(client);
  cached = pending;
  pending.catch(() => { if (cached === pending) cached = null; });
  return pending;
}

/** Tests only: forget the session's totals. */
export function resetSiteStatsCache(): void {
  cached = null;
}

/** The totals for a component: loading → ok | failed. */
export function useSiteStats(): SiteStatsState {
  const [state, setState] = useState<SiteStatsState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    loadSiteStats()
      .then(stats => { if (!cancelled) setState({ status: 'ok', stats }); })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);
  return state;
}

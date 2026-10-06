/**
 * siteStats.ts — fake site_stats / log_presentation for the e2e specs · 全站统计测试辅助 (ADR-0012)
 *
 * Same fake PostgREST base as the sign-up specs. The fake enforces the SQL's
 * rules (database/site-stats-schema.sql): log_presentation refuses seconds
 * outside MEETING_MIN_SECONDS..MEETING_MAX_SECONDS (400, like Postgres'
 * 22023), answers false for a pack that is not saved or already has a
 * meeting in the rate window, and each recorded meeting raises `meetings`.
 */
import { Page } from '@playwright/test';
import { E2E_SUPABASE_PATH, injectSupabaseOverride } from './signup';
import {
  SITE_STATS_FN, LOG_PRESENTATION_FN, MEETING_MIN_SECONDS, MEETING_MAX_SECONDS, SiteStats,
} from '../../../components/stats/statsRules';

export interface FakeStatsServer {
  /** Every site_stats call seen. */
  statsCalls: number;
  /** Every log_presentation body seen (accepted or not). */
  logCalls: Array<{ p_pack_id: string; p_seconds: number }>;
  /** Rows recorded (pack ids). */
  meetings: string[];
}

export async function mockSiteStats(page: Page, totals: Omit<SiteStats, 'as_of'>, savedPacks: string[] = []): Promise<FakeStatsServer> {
  await injectSupabaseOverride(page);
  const server: FakeStatsServer = { statsCalls: 0, logCalls: [], meetings: [] };
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${SITE_STATS_FN}**`, route => {
    server.statsCalls += 1;
    const body = { ...totals, meetings: totals.meetings + server.meetings.length, as_of: new Date().toISOString() };
    return route.fulfill({ status: 200, json: body });
  });
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${LOG_PRESENTATION_FN}**`, route => {
    const args = route.request().postDataJSON() as { p_pack_id: string; p_seconds: number };
    server.logCalls.push(args);
    if (!(args.p_seconds >= MEETING_MIN_SECONDS && args.p_seconds <= MEETING_MAX_SECONDS)) {
      return route.fulfill({ status: 400, json: { code: '22023', message: `seconds ${args.p_seconds} out of range` } });
    }
    // The real window is 2 hours; a spec never spans that, so any earlier row for the pack blocks.
    const counted = savedPacks.includes(args.p_pack_id) && !server.meetings.includes(args.p_pack_id);
    if (counted) server.meetings.push(args.p_pack_id);
    return route.fulfill({ status: 200, json: counted });
  });
  return server;
}

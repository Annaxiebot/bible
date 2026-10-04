/**
 * leader.ts — e2e helpers for the signed-in leader pages · 带领者测试辅助
 *
 * The dev server has no VITE_SUPABASE_*, so there is no real Google
 * session. `fakeLeaderSession` sets the dev-only window.__LEADER_E2E__
 * seam (components/leader/useLeaderSession) before the app boots;
 * `mockLeaderCounts` routes the two count selects (study_signups,
 * checkin_answers) under the same fake PostgREST base the sign-up specs use.
 */
import { Page } from '@playwright/test';
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE } from '../../../components/signup/signupSchema';
import { E2E_LEADER_ID, E2E_SUPABASE_PATH, injectSupabaseOverride } from './signup';
import { REPLACED_COLUMN } from '../../../supabase/functions/send-checkins/replaced';

export const E2E_LEADER = { uid: E2E_LEADER_ID, email: 'chris.leader@example.com', name: 'Chris Leader' };

export async function fakeLeaderSession(page: Page, leader = E2E_LEADER) {
  await page.addInitScript(value => {
    (window as Window & { __LEADER_E2E__?: unknown }).__LEADER_E2E__ = value;
  }, leader);
}

/**
 * Answer the leader's count selects: `signups` / `answers` are pack ids, one
 * per row; `replaced` are extra sign-up rows a later sign-up replaced — served
 * only to a query without the replaced_at=is.null filter, as PostgREST would.
 */
export async function mockLeaderCounts(page: Page, signups: string[], answers: string[], replaced: string[] = []) {
  await injectSupabaseOverride(page);
  const json = { 'Content-Type': 'application/json' };
  const rows = (ids: string[]) => JSON.stringify(ids.map(pack_id => ({ pack_id })));
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${SIGNUPS_TABLE}**`, route => {
    const liveOnly = new URL(route.request().url()).searchParams.get(REPLACED_COLUMN) === 'is.null';
    const live = signups.map(pack_id => ({ pack_id, replaced_at: null }));
    const old = replaced.map(pack_id => ({ pack_id, replaced_at: '2026-10-04T00:00:00Z' }));
    return route.fulfill({ status: 200, headers: json, body: JSON.stringify(liveOnly ? live : [...live, ...old]) });
  });
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${CHECKIN_ANSWERS_TABLE}**`, route =>
    route.fulfill({ status: 200, headers: json, body: rows(answers) }));
}

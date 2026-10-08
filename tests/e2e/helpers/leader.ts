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
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE, PACK_SUMMARIES_TABLE } from '../../../components/signup/signupSchema';
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

/** Rows for the leader's #/leader/<id> page: full sign-up and shared-answer records. */
export interface LeaderListRows { signups: Array<Record<string, unknown>>; answers: Array<Record<string, unknown>> }

/**
 * Answer the #/leader/<id> page's reads under the fake PostgREST base:
 * study_signups and checkin_answers return the given rows, pack_summaries
 * the not-paused switch (a single object, as maybeSingle asks for).
 */
export async function mockLeaderList(page: Page, rows: LeaderListRows) {
  await injectSupabaseOverride(page);
  const json = { 'Content-Type': 'application/json' };
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${SIGNUPS_TABLE}**`, route =>
    route.fulfill({ status: 200, headers: json, body: JSON.stringify(rows.signups) }));
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${CHECKIN_ANSWERS_TABLE}**`, route =>
    route.fulfill({ status: 200, headers: json, body: JSON.stringify(rows.answers) }));
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${PACK_SUMMARIES_TABLE}**`, route =>
    route.fulfill({ status: 200, headers: json, body: JSON.stringify({ checkins_paused: false }) }));
}

/** A leader's sign-up row as PostgREST returns it (SIGNUP_COLUMNS); `extra` overrides any column. */
export function leaderSignupRow(id: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, leader_id: E2E_LEADER_ID, name, phone: null, email: `${id}@example.org`, consent_checkins: true,
    created_at: '2026-10-06T22:12:00Z', practice_area: '健康 Health', practice_text: '睡前程序 · Wind-down',
    practice2_area: null, practice2_text: null, practice_note: null, practices: null, replaced_at: null,
    unsubscribed_at: null, unsubscribed_by: null, ...extra,
  };
}

/** A shared check-in answer as PostgREST returns it (ANSWER_COLUMNS). */
export function leaderAnswerRow(id: string, signupId: string, kind: string, answer: string, createdAt: string): Record<string, unknown> {
  return { id, signup_id: signupId, leader_id: E2E_LEADER_ID, kind, answer, created_at: createdAt };
}

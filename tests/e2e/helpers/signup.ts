/**
 * signup.ts — shared helpers for the sign-up / QR e2e specs · 报名测试辅助
 *
 * The committed sample pack is demo-only (no leaderId). Specs that need an
 * owned pack route the pack JSON fetch and add a leaderId to the real file;
 * nothing else about the pack changes. The expected QR text is derived from
 * the page's own origin + base path, as the app does.
 */
import { Page } from '@playwright/test';
import { SAMPLE_PACK_ID } from '../../../components/landing/landingRoute';
import { signupUrl } from '../../../components/signup/signupRoute';
import {
  SIGNUPS_TABLE, SignupInsert, CHECKIN_CONTEXT_FN, SHARE_ANSWER_FN, SEND_CHECKINS_FUNCTION, SIGNUP_PACK_FN,
} from '../../../components/signup/signupSchema';
import { MARK_REPLACED_FN, REPLACED_COLUMN, signupEmailKey } from '../../../supabase/functions/send-checkins/replaced';

export const E2E_LEADER_ID = '00000000-0000-4000-8000-00000000e2e1';
export const E2E_SIGNUP_ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';

/** Serve the sample pack as if a leader owned it (leaderId injected into the real JSON). */
export async function routeOwnedSamplePack(page: Page) {
  await page.route(`**/packs/${SAMPLE_PACK_ID}.json**`, async route => {
    const response = await route.fetch();
    const pack = await response.json();
    return route.fulfill({ response, json: { ...pack, leaderId: E2E_LEADER_ID } });
  });
}

/** Same-origin fake Supabase base so PostgREST / functions calls need no CORS preflight. */
export const E2E_SUPABASE_PATH = '/e2e-supabase';
export const E2E_ANON_KEY = 'e2e-anon-key';

/** Point the signup client at the fake base (dev-only window override, components/signup/signupClient). */
export async function injectSupabaseOverride(page: Page) {
  await page.addInitScript(([path, key]) => {
    (window as Window & { __SUPABASE_E2E__?: unknown }).__SUPABASE_E2E__ = { url: `${location.origin}${path}`, anonKey: key };
  }, [E2E_SUPABASE_PATH, E2E_ANON_KEY] as const);
}

/** The practices the mocked checkin_context returns (a new-style row: two chosen). */
export const E2E_CHECKIN_PRACTICES = [
  { area: '健康 Health', practice: '固定的睡前程序 · Fixed wind-down' },
  { area: '家庭 Family', practice: '一起吃晚饭 · Dinner together' },
];

/** A stored row of the fake study_signups table (what the insert sent, plus the column the replace RPC sets). */
export type FakeSignupRow = SignupInsert & { replaced_at: string | null };

/** The owner's live case: an own version typed next to the chosen practices, and a weekend line carrying the kind label twice. */
export const E2E_CHECKIN_NOTE = 'My own pratice: Diet';
export const E2E_WEEKEND_LINE = '周末回顾：周末:回顾本周… · End of week: Weekend: Looking back…';

/** The row the mocked checkin_context returns (subscribed; helpers/optout overrides unsubscribed_at). */
export const E2E_CHECKIN_CONTEXT = {
  pack_id: SAMPLE_PACK_ID, pack_title: '不要忧虑 Do Not Be Anxious', name: '小明', practice_area: '健康 Health',
  practice_text: '固定的睡前程序 · Fixed wind-down', practice_note: E2E_CHECKIN_NOTE, practices: E2E_CHECKIN_PRACTICES,
  reflection_lines: ['周二跟进：做了吗？ · Tue: did it happen?', '周四 · Thu', E2E_WEEKEND_LINE],
  unsubscribed_at: null as string | null,
};

export interface BackendMocks {
  bodies: () => SignupInsert[]; welcomes: () => unknown[]; shares: () => unknown[];
  rows: () => FakeSignupRow[]; replaces: () => unknown[];
}
/** PostgREST's reply to a return=minimal insert: 201, no body (the browser already holds the id it sent). */
export const OK_INSERT = { status: 201, body: '' };
/**
 * What live PostgREST answers when anon asks for the row back (Prefer:
 * return=representation, i.e. INSERT ... RETURNING): anon has no SELECT
 * policy on study_signups, so RLS rejects it. The mock enforces the same
 * guard so a client that reads its row back can never pass vacuously.
 */
export const RLS_RETURNING_REPLY = {
  status: 401,
  body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy for table "study_signups"' }),
};

/**
 * mark_replaced_signups as database/signup-replace-schema.sql does it: the
 * new row must exist and be live; every OTHER live row of the same pack +
 * lower(trim(email)) inserted before it is marked; returns the count.
 */
function markReplacedRows(rows: FakeSignupRow[], newId: string): { status: number; body: unknown } {
  const index = rows.findIndex(r => r.id === newId && !r.replaced_at);
  if (index < 0) return { status: 404, body: { code: 'P0002', message: `sign-up ${newId} not found` } };
  const key = signupEmailKey(rows[index].email);
  if (!key) return { status: 200, body: 0 };
  const earlier = rows.slice(0, index).filter(r => !r.replaced_at && r.pack_id === rows[index].pack_id && signupEmailKey(r.email) === key);
  for (const r of earlier) r.replaced_at = new Date().toISOString();
  return { status: 200, body: earlier.length };
}

/**
 * Route PostgREST (a fake study_signups table: POST inserts, GET reads with
 * the replaced_at=is.null filter honoured), the replace RPC, the welcome
 * function call, and the two check-in RPCs under the fake base.
 */
export async function mockBackend(page: Page, insertReply: { status: number; body: string } = OK_INSERT): Promise<BackendMocks> {
  const bodies: SignupInsert[] = [];
  const rows: FakeSignupRow[] = [];
  const replaces: unknown[] = [];
  const welcomes: unknown[] = [];
  const shares: unknown[] = [];
  const json = { 'Content-Type': 'application/json' };
  await injectSupabaseOverride(page);
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${SIGNUPS_TABLE}**`, async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const liveOnly = new URL(request.url()).searchParams.get(REPLACED_COLUMN) === 'is.null';
      return route.fulfill({ status: 200, headers: json, body: JSON.stringify(rows.filter(r => !liveOnly || !r.replaced_at)) });
    }
    const body = request.postDataJSON() as SignupInsert;
    bodies.push(body);
    const prefer = (await request.headerValue('prefer')) ?? '';
    const reply = prefer.includes('return=representation') ? RLS_RETURNING_REPLY : insertReply;
    if (reply.status < 300) rows.push({ ...body, replaced_at: null });
    return route.fulfill({ status: reply.status, headers: json, body: reply.body });
  });
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${MARK_REPLACED_FN}**`, route => {
    const args = route.request().postDataJSON() as { p_new_id: string };
    replaces.push(args);
    const reply = markReplacedRows(rows, args.p_new_id);
    return route.fulfill({ status: reply.status, headers: json, body: JSON.stringify(reply.body) });
  });
  await page.route(`**${E2E_SUPABASE_PATH}/functions/v1/${SEND_CHECKINS_FUNCTION}**`, route => {
    welcomes.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, headers: json, body: JSON.stringify({ attempted: 1, results: [{ status: 'sent' }] }) });
  });
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${CHECKIN_CONTEXT_FN}**`, route => route.fulfill({
    status: 200, headers: json, body: JSON.stringify([E2E_CHECKIN_CONTEXT]),
  }));
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${SHARE_ANSWER_FN}**`, route => {
    shares.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, headers: json, body: JSON.stringify('answer-id') });
  });
  return { bodies: () => bodies, welcomes: () => welcomes, shares: () => shares, rows: () => rows, replaces: () => replaces };
}

/**
 * Answer public_signup_pack (the member phone's fallback for a leader pack it
 * does not hold) with `projection`; returns the request bodies seen.
 */
export async function mockSignupPackRpc(page: Page, projection: Record<string, unknown> | null): Promise<() => unknown[]> {
  const calls: unknown[] = [];
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${SIGNUP_PACK_FN}**`, route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projection) });
  });
  return () => calls;
}

/**
 * Seed one pack into this browser's IndexedDB (the store the app reads for
 * "local-" ids). The app must have opened its database once (any page
 * load does), so this navigates to #/new first and then writes the record.
 */
export async function seedLocalPack(page: Page, pack: Record<string, unknown> & { id: string }) {
  await page.goto('./#/new');
  await page.getByTestId('new-study-page').waitFor();
  await page.evaluate(async (record) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('BibleApp');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('studypacks', 'readwrite');
        tx.objectStore('studypacks').put({ id: record.id, pack: record, savedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, pack);
}

/** The committed sample pack's JSON, as served by this dev server. */
export async function fetchSamplePack(page: Page): Promise<Record<string, unknown>> {
  return (await page.request.get(`./packs/${SAMPLE_PACK_ID}.json`)).json();
}

/** The sign-up URL the QR must encode for this page's origin and base path. */
export function expectedSignupUrl(page: Page, packId = SAMPLE_PACK_ID): string {
  const here = new URL(page.url());
  return signupUrl(packId, here.origin, here.pathname);
}

/**
 * optout.ts — three levels of "stop" · 退订、组长停发、暂停 (ADR-0009)
 *
 * Single source (R3) for the browser (stop page, check-in page, leader
 * roster) and this edge function (recipients, pause, one-click). Pure, no
 * imports, so both runtimes load it (the app imports it extensionless,
 * like replaced.ts).
 *
 * database/checkin-optout-schema.sql adds study_signups.unsubscribed_at /
 * unsubscribed_by, pack_summaries.checkins_paused and the RPCs named below.
 */

/** study_signups column; non-null = this person stopped (or was stopped from) this study's reminders. */
export const UNSUBSCRIBED_COLUMN = 'unsubscribed_at';
/** study_signups column: who stopped it, 'member' | 'leader'. */
export const UNSUBSCRIBED_BY_COLUMN = 'unsubscribed_by';
export type UnsubscribedBy = 'member' | 'leader';

/** RPCs (anon-callable by token): unsubscribe_signup(p_id) / resubscribe_signup(p_id) → boolean found. */
export const UNSUBSCRIBE_FN = 'unsubscribe_signup';
export const RESUBSCRIBE_FN = 'resubscribe_signup';
/** RPC (authenticated, row's leader only): leader_set_signup_subscription(p_id, p_stop) → boolean stopped. */
export const LEADER_SUBSCRIPTION_FN = 'leader_set_signup_subscription';
/** SQLSTATE the leader RPC raises when asked to resume a member's own stop. */
export const MEMBER_CHOICE_ERRCODE = 'STL01';

/** pack_summaries column the leader's pause toggle writes. */
export const PAUSED_COLUMN = 'checkins_paused';
/** Secret: '1' = the whole site sends nothing (scheduled, manual, welcome). */
export const SITE_PAUSE_SECRET = 'CHECKIN_PAUSED';

/** The edge function's slug; must equal the app's SEND_CHECKINS_FUNCTION (pinned by a test). */
export const SEND_CHECKINS_SLUG = 'send-checkins';
/** One-click query parameter and the exact body RFC 8058 mail providers POST. */
export const UNSUBSCRIBE_PARAM = 'unsubscribe';
export const ONE_CLICK_BODY = 'List-Unsubscribe=One-Click';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the row should get no reminder because someone stopped them. */
export function isUnsubscribed(row: { unsubscribed_at?: string | null }): boolean {
  return !!row.unsubscribed_at;
}

export type PauseSkip = 'paused' | 'paused-site';

/**
 * Whether a send is paused. The site switch stops everything, welcome
 * included. A paused pack skips tue/thu/weekend but its welcome still goes:
 * the member just signed up and expects the confirmation (ADR-0009).
 */
export function pauseSkip(kind: string, sitePaused: boolean, packPaused: boolean): PauseSkip | null {
  if (sitePaused) return 'paused-site';
  if (packPaused && kind !== 'welcome') return 'paused';
  return null;
}

/** The site switch read from the environment ('1' only). */
export function sitePaused(env: (name: string) => string): boolean {
  return env(SITE_PAUSE_SECRET).trim() === '1';
}

/** The RFC 8058 one-click URL for a sign-up (List-Unsubscribe header). */
export function oneClickUrl(supabaseUrl: string, signupId: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${SEND_CHECKINS_SLUG}?${UNSUBSCRIBE_PARAM}=${encodeURIComponent(signupId)}`;
}

/** The two headers Gmail / Apple Mail need for a one-click unsubscribe. */
export function listUnsubscribeHeaders(url: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': ONE_CLICK_BODY };
}

/** True when the request addresses the one-click endpoint (has ?unsubscribe=). */
export function isOneClickRequest(url: URL): boolean {
  return url.searchParams.has(UNSUBSCRIBE_PARAM);
}

/**
 * The one-click endpoint (no JWT: the signup id is the authority, as on the
 * stop page). POST only (a GET — e.g. a link scanner — must never
 * unsubscribe: 405); the id must be a uuid and the body exactly
 * List-Unsubscribe=One-Click (400); unknown id → 404; marked → 200.
 * `unsubscribe` calls unsubscribe_signup with the service role and throws
 * on a database error (the caller turns that into a 500).
 */
export async function handleOneClick(request: Request, unsubscribe: (id: string) => Promise<boolean>): Promise<Response> {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  const id = new URL(request.url).searchParams.get(UNSUBSCRIBE_PARAM) ?? '';
  if (!UUID_RE.test(id)) return json(400, { error: 'unsubscribe must be a sign-up id' });
  const body = new URLSearchParams(await request.text());
  if (body.get('List-Unsubscribe') !== 'One-Click') return json(400, { error: `body must be ${ONE_CLICK_BODY}` });
  if (!(await unsubscribe(id))) return json(404, { error: 'unknown signup' });
  return json(200, { unsubscribed: true });
}

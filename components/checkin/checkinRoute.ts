/**
 * checkinRoute.ts — the member's check-in page route · 跟进路由
 *
 * "#/checkin/<signupId>" or "#/checkin/<signupId>/<kind>". The signup id is
 * a uuid: the member's unguessable token (ADR-0004 §7) — no uid, no pack id
 * in the URL. Pure module (mirrors signupRoute) so the edge function
 * templates, the page and the e2e specs derive one URL.
 */

export const CHECKIN_HASH_PREFIX = '#/checkin/';

export type CheckinKind = 'tue' | 'thu' | 'weekend';
export const CHECKIN_KINDS: readonly CheckinKind[] = ['tue', 'thu', 'weekend'];

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const CHECKIN_HASH_RE = new RegExp(`^#\\/checkin\\/(${UUID})(?:\\/(tue|thu|weekend))?$`);

export interface CheckinRoute {
  signupId: string;
  kind: CheckinKind | null;  // null = "whatever today is" (the page resolves it)
}

export function isCheckinKind(value: unknown): value is CheckinKind {
  return typeof value === 'string' && (CHECKIN_KINDS as readonly string[]).includes(value);
}

export function checkinHash(signupId: string, kind?: CheckinKind): string {
  return kind ? `${CHECKIN_HASH_PREFIX}${signupId}/${kind}` : `${CHECKIN_HASH_PREFIX}${signupId}`;
}

/** "#/checkin/<uuid>[/<kind>]" → route, anything else → null. */
export function getCheckinFromHash(hash: string): CheckinRoute | null {
  const match = CHECKIN_HASH_RE.exec(hash);
  if (!match) return null;
  return { signupId: match[1], kind: isCheckinKind(match[2]) ? match[2] : null };
}

/** Absolute check-in URL: origin + app base path + hash. */
export function checkinUrl(signupId: string, kind: CheckinKind | undefined, origin: string, base: string): string {
  return `${origin}${base}${checkinHash(signupId, kind)}`;
}

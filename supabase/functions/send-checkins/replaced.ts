/**
 * replaced.ts — a later sign-up replaces an earlier one · 重复报名以最新为准
 *
 * Single source (R3) for the browser (leader roster + counts, last-week
 * sharing) and this edge function (recipients). Pure, no imports, so both
 * runtimes load it (the app imports it extensionless, like practices.ts).
 *
 * database/signup-replace-schema.sql: mark_replaced_signups(new id) sets
 * replaced_at on every other live row with the same pack_id and
 * lower(trim(email)). Replaced rows are kept (their shared answers stay
 * real) but every reader skips them as people: one person, one row.
 */

/** The study_signups column the migration adds; non-null = replaced by a later sign-up. */
export const REPLACED_COLUMN = 'replaced_at';

/** RPC the signup edge function (service role only) calls right after its insert: mark_replaced_signups(p_new_id) → count. */
export const MARK_REPLACED_FN = 'mark_replaced_signups';

/** Live rows only (replaced_at null or absent — rows read before the column existed). */
export function isLive(row: { replaced_at?: string | null }): boolean {
  return !row.replaced_at;
}

/** Same person, same pack: the key the SQL function matches on, lower(trim(email)); '' when there is no email. */
export function signupEmailKey(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

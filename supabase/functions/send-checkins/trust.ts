/**
 * trust.ts — who may address the sign-up list · 可信调用方
 *
 * A trusted caller (pg_cron, or the owner from a shell) proves itself with
 * one header carrying the CHECKIN_CRON_SECRET secret. The bearer token is
 * never compared to SUPABASE_SERVICE_ROLE_KEY: on new projects that injected
 * value is a new-format key the functions gateway rejects as a bearer, so a
 * check against it could never pass. Pure (no Deno), tested under vitest.
 */

/** The header a trusted caller sends. */
export const CRON_SECRET_HEADER = 'x-checkin-secret';

/** True only when a non-empty secret is configured and the header matches it exactly. */
export function isTrustedCaller(headerValue: string | null, secret: string): boolean {
  return secret.length > 0 && headerValue === secret;
}

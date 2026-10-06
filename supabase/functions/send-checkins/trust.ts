/**
 * trust.ts — who may address the sign-up list · 可信调用方
 *
 * A trusted caller (pg_cron, or the owner from a shell) proves itself with
 * one header carrying the CHECKIN_CRON_SECRET secret. The bearer token is
 * never compared to SUPABASE_SERVICE_ROLE_KEY: on new projects that injected
 * value is a new-format key the functions gateway rejects as a bearer, so a
 * check against it could never pass. The signup function is a trusted
 * caller too: it alone asks for the welcome (welcomeCallerProblem,
 * ADR-0013). Pure (no Deno), tested under vitest.
 */

/** The header a trusted caller sends. */
export const CRON_SECRET_HEADER = 'x-checkin-secret';

/** True only when a non-empty secret is configured and the header matches it exactly. */
export function isTrustedCaller(headerValue: string | null, secret: string): boolean {
  return secret.length > 0 && headerValue === secret;
}

/**
 * The welcome is asked for by the signup function only, as a trusted caller
 * (ADR-0013). The anonymous welcome path is closed: with it, anyone could
 * insert a row for any address and have this domain mail it.
 */
export const WELCOME_UNTRUSTED = 'only the signup function (a trusted caller) may ask for the welcome';

/** null when a welcome may be sent for this caller; otherwise the 403 reason. */
export function welcomeCallerProblem(headerValue: string | null, secret: string): string | null {
  return isTrustedCaller(headerValue, secret) ? null : WELCOME_UNTRUSTED;
}

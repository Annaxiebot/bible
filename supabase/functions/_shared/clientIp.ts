/**
 * clientIp.ts — who is calling, without storing who · 客户端 IP 哈希
 *
 * Pure apart from crypto.subtle (global in Deno and Node). Shared by the
 * public edge functions that rate-limit per caller (feedback, signup): the
 * raw address is never stored, only a salted SHA-256 of it, and each
 * function keeps its own salt secret (FEEDBACK_SALT, IP_HASH_SALT).
 */

/**
 * The caller's IP: cf-connecting-ip, else the first x-forwarded-for hop,
 * else 'unknown'. Probed on the live project 2026-10-06 (a temporary echo
 * function, since deleted): Supabase's edge sits behind Cloudflare, which
 * sets cf-connecting-ip itself and refuses a request that sends its own
 * (HTTP 403, error 1000); a client-sent X-Forwarded-For or X-Real-IP is
 * dropped, the first x-forwarded-for hop is the real address, and
 * x-real-ip is never set. So neither header can be faked to dodge the
 * per-IP limits; cf-connecting-ip goes first as the one Cloudflare vouches for.
 */
export function clientIp(header: (name: string) => string | null): string {
  const cloudflare = header('cf-connecting-ip')?.trim();
  const forwarded = header('x-forwarded-for')?.split(',')[0]?.trim();
  return cloudflare || forwarded || 'unknown';
}

/** Hex SHA-256 of salt + ip: the raw address is never stored. */
export async function hashClientIp(salt: string, ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

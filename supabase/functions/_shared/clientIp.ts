/**
 * clientIp.ts — who is calling, without storing who · 客户端 IP 哈希
 *
 * Pure apart from crypto.subtle (global in Deno and Node). Shared by the
 * public edge functions that rate-limit per caller (feedback, signup): the
 * raw address is never stored, only a salted SHA-256 of it, and each
 * function keeps its own salt secret (FEEDBACK_SALT, IP_HASH_SALT).
 */

/** The caller's IP as the edge proxy reports it (first x-forwarded-for hop), else x-real-ip, else 'unknown'. */
export function clientIp(header: (name: string) => string | null): string {
  const forwarded = header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || header('x-real-ip')?.trim() || 'unknown';
}

/** Hex SHA-256 of salt + ip: the raw address is never stored. */
export async function hashClientIp(salt: string, ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

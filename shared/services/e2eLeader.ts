/**
 * e2eLeader.ts — the one reader of the Playwright leader seam · 端到端带领者替身
 *
 * Dev builds only (import.meta.env.DEV): window.__LEADER_E2E__ = { uid, email,
 * name } stands in for a Google session so specs can render signed-in pages
 * (same pattern as window.__SUPABASE_E2E__ in signupClient). Production builds
 * always return null. Shared by the leader pages and hosted-AI transport.
 */
export interface E2ELeader { uid: string; email: string | null; name: string | null }

export function e2eLeader(): E2ELeader | null {
  if (!import.meta.env.DEV) return null;
  const value = (window as Window & { __LEADER_E2E__?: unknown }).__LEADER_E2E__;
  if (typeof value !== 'object' || value === null) return null;
  const { uid, email, name } = value as Partial<E2ELeader>;
  return typeof uid === 'string' ? { uid, email: email ?? null, name: name ?? null } : null;
}

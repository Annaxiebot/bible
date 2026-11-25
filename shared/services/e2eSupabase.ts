/**
 * e2eSupabase.ts — the Playwright stand-in for the Supabase project · 端到端 Supabase 替身地址
 *
 * window.__SUPABASE_E2E__ = { url, anonKey }: when the build has no
 * VITE_SUPABASE_* (local dev, e2e, unit tests) specs point Supabase calls at
 * a routed fake base. Read by signupClient (the shared client's dev
 * stand-in) and the funnel counter (components/stats/funnel), which posts
 * without supabase-js. Its own module so a test that mocks signupClient
 * still leaves the funnel's base intact.
 * TODO(R3): services/aiTransport's e2eSeam reads the same window value
 * itself; move it onto this reader in a refactor session.
 */
export interface E2ESupabaseBase { url: string; anonKey: string }

/** The dev-only window.__SUPABASE_E2E__ base, or null when absent or malformed. */
export function e2eSupabaseBase(): E2ESupabaseBase | null {
  const value = (window as Window & { __SUPABASE_E2E__?: unknown }).__SUPABASE_E2E__;
  if (typeof value !== 'object' || value === null) return null;
  const { url, anonKey } = value as Partial<E2ESupabaseBase>;
  return typeof url === 'string' && typeof anonKey === 'string' ? { url, anonKey } : null;
}

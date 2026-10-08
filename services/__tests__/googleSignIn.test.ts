/**
 * googleSignIn.test.ts — authManager.signInWithGoogle requests identity only · 登录权限范围测试
 *
 * supabase-js is mocked and the env stubbed so the module builds a client;
 * the OAuth call's options are pinned. A source scan then pins that every
 * caller in components/ uses the plain call — Google Forms was removed
 * (2026-10-05, ADR-0004 §9), so there is no extra-scope path any more.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const signInWithOAuth = vi.fn(async () => ({ error: null }));
/** The auth manager's onAuthStateChange listener: calling it stands in for the OAuth redirect's session. */
let authListener: ((event: string, session: unknown) => void) | null = null;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      getSession: async () => ({ data: { session: null } }),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...(args as [])),
      signOut: async () => ({ error: null }),
    },
  }),
}));

type OAuthCall = { provider: string; options: { scopes: string; queryParams?: Record<string, string> } };
const lastCall = () => (signInWithOAuth.mock.calls[0] as unknown as [OAuthCall])[0];

async function loadAuthManager() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://e2e.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  return (await import('../supabase')).authManager;
}

describe('authManager.signInWithGoogle scopes', () => {
  beforeEach(() => signInWithOAuth.mockClear());

  it('identity scopes only — no forms.body, no prompt=consent, no access_type=offline', async () => {
    const authManager = await loadAuthManager();
    expect((await authManager.signInWithGoogle()).error).toBeNull();
    const { provider, options } = lastCall();
    expect(provider).toBe('google');
    expect(options.scopes).toBe('openid email profile');
    expect(options.queryParams).toBeUndefined();
    expect(JSON.stringify(options)).not.toMatch(/forms|consent|offline/);
  });
});

type RedirectOptions = { options: { redirectTo: string } };

describe('authManager.signInWithGoogle return page (the OAuth round trip)', () => {
  // tests/utils/setup.ts stubs sessionStorage with no-op vi.fn()s; back it with a Map so the stored hash survives.
  beforeEach(() => {
    signInWithOAuth.mockClear();
    const data = new Map<string, string>();
    vi.mocked(window.sessionStorage.getItem).mockImplementation(k => data.get(k) ?? null);
    vi.mocked(window.sessionStorage.setItem).mockImplementation((k, v) => { data.set(k, v); });
    vi.mocked(window.sessionStorage.removeItem).mockImplementation(k => { data.delete(k); });
  });

  /** Start a sign-in on `startHash`, then simulate the redirect back: bare root, then the session arrives. */
  async function roundTrip(startHash: string, returnTo?: string): Promise<string> {
    const authManager = await loadAuthManager();
    await new Promise(r => setTimeout(r, 0));   // initialize(): listener registered, no session yet
    window.location.hash = startHash;
    await authManager.signInWithGoogle(returnTo);
    const { options } = (signInWithOAuth.mock.calls[0] as unknown as [RedirectOptions])[0];
    expect(options.redirectTo).toBe(window.location.origin + window.location.pathname);   // no hash: the allowed redirect URL
    window.location.hash = '';                  // the implicit flow lands on the bare root
    authListener!('SIGNED_IN', { user: { id: 'uid-lead' } });
    return window.location.hash;
  }

  it('landing nav (bare root, returnTo #/leader) comes back to the leader home', async () => {
    expect(await roundTrip('', '#/leader')).toBe('#/leader');
  });

  it('every other entry comes back to the page it started on', async () => {
    for (const start of ['#/leader', '#/leader/p1', '#app', '#/signup/p1', '#/setup']) {
      signInWithOAuth.mockClear();
      expect(await roundTrip(start), start).toBe(start);
    }
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

// Walking + reading every component file is >10 s under heavy CPU load (every
// read is also scanned by the endpoint antivirus). Do it once at file
// collection, which has no timeout, so the slow I/O never counts against it.
const SIGN_IN_CALLERS = sourceFiles(join(__dirname, '..', '..', 'components'))
  .map(path => ({ path, calls: readFileSync(path, 'utf8').match(/signInWithGoogle\([^)]*\)/g) ?? [] }))
  .filter(f => f.calls.length > 0);

describe('every sign-in caller is identity-only', () => {
  it('no caller passes options (a return hash is the only argument)', () => {
    expect(SIGN_IN_CALLERS.length).toBeGreaterThanOrEqual(2);   // AuthPanel, UnclaimedSignIn
    for (const { path, calls } of SIGN_IN_CALLERS) {
      for (const call of calls) expect(call, path).toMatch(/^signInWithGoogle\((returnTo)?\)$/);
    }
  });
});

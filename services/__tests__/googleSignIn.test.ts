/**
 * googleSignIn.test.ts — authManager.signInWithGoogle requests identity only
 * unless the Forms opt-in is passed · 登录权限范围测试
 *
 * supabase-js is mocked and the env stubbed so the module builds a client;
 * the OAuth call's options are pinned for both paths. A source scan then
 * pins that every caller in components/ uses the default (identity-only)
 * call, except useFeedbackForm's explicit "连接 Google 表单" opt-in — one
 * site, by design (ADR-0004 §9).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GOOGLE_FORMS_SCOPE } from '../googleForms';

const signInWithOAuth = vi.fn(async () => ({ error: null }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
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

  it('default: identity scopes only — no forms.body, no prompt=consent, no access_type=offline', async () => {
    const authManager = await loadAuthManager();
    expect((await authManager.signInWithGoogle()).error).toBeNull();
    const { provider, options } = lastCall();
    expect(provider).toBe('google');
    expect(options.scopes).toBe('openid email profile');
    expect(options.queryParams).toBeUndefined();
    expect(JSON.stringify(options)).not.toMatch(/forms\.body|consent|offline/);
  });

  it('withForms: the Forms scope with offline access + consent', async () => {
    const authManager = await loadAuthManager();
    await authManager.signInWithGoogle({ withForms: true });
    const { options } = lastCall();
    expect(options.scopes.split(' ')).toContain(GOOGLE_FORMS_SCOPE);
    expect(options.scopes).toContain('openid email profile');
    expect(options.queryParams).toEqual({ access_type: 'offline', prompt: 'consent' });
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

describe('every sign-in caller is identity-only except the Forms opt-in', () => {
  it('only components/newstudy/useFeedbackForm.ts passes withForms', () => {
    const callers = SIGN_IN_CALLERS;
    expect(callers.length).toBeGreaterThanOrEqual(3);   // AuthPanel, UnclaimedSignIn, useFeedbackForm
    for (const { path, calls } of callers) {
      for (const call of calls) {
        if (path.endsWith('useFeedbackForm.ts')) expect(call).toBe('signInWithGoogle({ withForms: true })');
        else expect(call, path).toBe('signInWithGoogle()');
      }
    }
  });
});

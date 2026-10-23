/**
 * AIStatus.test.tsx — the AI service page as a status page · AI 状态测试
 *
 * ADR-0007 states of QuickAISetupForm with the session mocked (one rule
 * since 2026-10-23: sign in to use AI):
 *   signed in  → "已登录 · AI 已就绪（由本站提供）" + this month's usage from
 *                ai_usage; nothing to configure;
 *   signed out → the sign-in prompt + the sign-in choices, and nothing about
 *                keys — even with an old own key still in the browser.
 * Plus the usage reader (UTC month, uid filter, defaults, failure surfaced).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OWN_OPENROUTER_KEY } from '../../../services/obsoleteStorageKeys';
import { SU_SIGN_IN_GOOGLE } from '../../signup/signupStrings';
import { SI_EMAIL_TOGGLE } from '../../signin/signInStrings';
import { SETUP_HOSTED_READY, SETUP_SIGN_IN_TO_USE_AI, SETUP_USAGE_FAILED, usageLine } from '../setupStrings';

let uid: string | null = null;
const authState = () => ({ user: uid ? { id: uid, email: 'leader@example.com' } : null, session: null, isAuthenticated: !!uid, isLoading: false });
const signInMock = vi.fn(async () => ({ error: null }));
vi.mock('../../../services/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: () => true,
  authManager: {
    getState: () => authState(),
    getUserId: () => uid,
    subscribe: (l: (s: unknown) => void) => { l(authState()); return () => undefined; },
    signInWithGoogle: () => signInMock(),
    signOut: vi.fn(async () => ({ error: null })),
  },
}));

const usageQuery = vi.fn();
const eqCalls: Array<[string, string]> = [];
vi.mock('../../signup/signupClient', () => ({
  getSignupClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        const chain = {
          eq: (col: string, value: string) => { eqCalls.push([col, value]); return chain; },
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => usageQuery(table, cols).then(resolve, reject),
        };
        return chain;
      },
    }),
  }),
}));

import { QuickAISetupForm } from '../QuickAISetup';
import { currentUsageMonth, usageEntries } from '../aiUsage';

function stubStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
}

beforeEach(() => {
  uid = null;
  eqCalls.length = 0;
  signInMock.mockClear();
  usageQuery.mockReset().mockResolvedValue({ data: [], error: null });
  stubStorage();
});
afterEach(() => vi.unstubAllGlobals());

describe('signed in — hosted AI status', () => {
  it('shows only the ready line and this month\'s usage (ask + pack + personal study always); nothing about keys or models', async () => {
    uid = 'uid-leader-1';
    usageQuery.mockResolvedValue({ data: [{ role: 'ask', count: 12, monthly_limit: 300 }, { role: 'study', count: 3, monthly_limit: 100 }], error: null });
    render(<QuickAISetupForm />);
    expect(screen.getByText(SETUP_HOSTED_READY)).toBeInTheDocument();
    expect(SETUP_HOSTED_READY).toBe('已登录 · AI 已就绪（由本站提供） · Signed in · AI ready (provided by this site)');
    await waitFor(() => expect(screen.getByTestId('ai-usage')).toHaveTextContent('本月 This month: 提问 12/300 · 查经包 0/10 · 个人研经 Personal Study 3/100'));
    expect(usageQuery).toHaveBeenCalledWith('ai_usage', 'role, count, monthly_limit');
    expect(eqCalls).toEqual([['leader_id', 'uid-leader-1'], ['month', currentUsageMonth()]]);
    expect(document.body.textContent).not.toMatch(/OpenRouter|密钥|模型 Models/);
    expect(screen.queryByText(SETUP_SIGN_IN_TO_USE_AI)).toBeNull();
  });

  it('a failed usage read is a red line with the server message (never swallowed)', async () => {
    uid = 'uid-leader-1';
    usageQuery.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    render(<QuickAISetupForm />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(`${SETUP_USAGE_FAILED} · permission denied`));
  });
});

describe('signed out — the sign-in prompt', () => {
  it('prompts sign-in with Google or email (ADR-0020) and nothing about keys', () => {
    render(<QuickAISetupForm />);
    expect(screen.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SI_EMAIL_TOGGLE })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: SU_SIGN_IN_GOOGLE }));
    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toMatch(/OpenRouter|密钥|own key/);
  });

  it('an old own key in the browser changes nothing: still the sign-in prompt, no key section', () => {
    stubStorage({ [OWN_OPENROUTER_KEY]: 'sk-or-v1-0123456789abcdef' });
    render(<QuickAISetupForm />);
    expect(screen.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeInTheDocument();
    expect(screen.queryByTestId('own-key-section')).toBeNull();
    expect(document.body.textContent).not.toMatch(/OpenRouter|密钥/);
  });
});

describe('usage reader', () => {
  it('the month key is UTC YYYY-MM (consume_ai_quota\'s month)', () => {
    expect(currentUsageMonth(new Date('2026-10-31T23:30:00-07:00'))).toBe('2026-11');
    expect(currentUsageMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });

  it('rows → ask, pack and study always, adjust/sharing once used, row limit over the default, junk roles ignored', () => {
    const entries = usageEntries([
      { role: 'sharing', count: 2, monthly_limit: 10 }, { role: 'pack', count: 1, monthly_limit: 12 },
      { role: 'bogus', count: 9, monthly_limit: 9 },
    ]);
    expect(entries).toEqual([
      { role: 'ask', count: 0, limit: 300 }, { role: 'pack', count: 1, limit: 12 }, { role: 'study', count: 0, limit: 100 },
      { role: 'sharing', count: 2, limit: 10 },
    ]);
    expect(usageLine(entries)).toBe('本月 This month: 提问 0/300 · 查经包 1/12 · 个人研经 Personal Study 0/100 · 分享 2/10');
  });
});

/**
 * NewStudyGate.test.tsx — who sees the New-study form · 新建查经入口测试 (ADR-0007)
 *
 * The gate is "signed in OR an own key": a signed-in leader with no key gets
 * the form straight away (hosted AI, no setup); a signed-out visitor with no
 * key gets the inline sign-in prompt and no form — with no key hints on the
 * page; an own key alone still opens the form. Session mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { idbService } from '../../../services/idbService';
import { SETUP_SIGN_IN_TO_USE_AI, SETUP_OWN_KEY_TOGGLE } from '../../setup/setupStrings';

let signedInUid: string | null = null;
const authState = () => ({
  user: signedInUid ? { id: signedInUid, email: 'leader@example.com' } : null,
  session: null, isAuthenticated: !!signedInUid, isLoading: false,
});
vi.mock('../../../services/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: () => true,
  canSync: () => false,
  authManager: {
    getState: () => authState(),
    getUserId: () => signedInUid,
    subscribe: (l: (s: unknown) => void) => { l(authState()); return () => undefined; },
    signInWithGoogle: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
}));
vi.mock('../generatePack', () => ({ generateStudyPack: vi.fn() }));
vi.mock('../../../services/bibleDataSource', () => ({
  fetchBundledChapter: async () => ({ verses: Array.from({ length: 36 }, (_, i) => ({ verse: i + 1, text: `v${i + 1}` })) }),
}));

import NewStudyPage from '../NewStudyPage';

function withKey(key: string | null) {
  (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset()
    .mockImplementation((k: string) => (k === STORAGE_KEYS.OPENROUTER_API_KEY ? key : null));
}

beforeEach(async () => {
  signedInUid = null;
  await idbService.clear('studypacks');
  window.location.hash = '';
});

describe('NewStudyPage AI gate', () => {
  it('signed in, no key → the form, no setup', () => {
    withKey(null);
    signedInUid = 'uid-leader-1';
    render(<NewStudyPage />);
    expect(screen.getByTestId('new-study-form')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-ai-setup')).toBeNull();
  });

  it('signed out, no key → the inline sign-in prompt, no form, no key hints anywhere on the page', () => {
    withKey(null);
    render(<NewStudyPage />);
    expect(screen.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeInTheDocument();
    expect(screen.queryByTestId('new-study-form')).toBeNull();
    expect(screen.queryByRole('button', { name: SETUP_OWN_KEY_TOGGLE })).toBeNull();
    expect(screen.getByTestId('new-study-page').textContent).not.toMatch(/OpenRouter|密钥|\bkey\b/);
  });

  it('signed out with an own key → the form (the direct path is unchanged)', () => {
    withKey('sk-or-own');
    render(<NewStudyPage />);
    expect(screen.getByTestId('new-study-form')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-ai-setup')).toBeNull();
  });
});

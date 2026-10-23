/**
 * NewStudyGate.test.tsx — who sees the New-study form · 新建查经入口测试 (ADR-0007)
 *
 * One rule since 2026-10-23: sign in to use AI. A signed-in leader gets the
 * form straight away (hosted AI, no setup); a signed-out visitor gets the
 * inline sign-in prompt and no form — with no key hints on the page — even
 * with an old own key still in the browser. Session mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OWN_OPENROUTER_KEY } from '../../../services/obsoleteStorageKeys';
import { idbService } from '../../../services/idbService';
import { SETUP_SIGN_IN_TO_USE_AI } from '../../setup/setupStrings';
import { NS_SAMPLE_NO_SIGNIN } from '../newStudyStrings';
import { SAMPLE_PACK_HASH } from '../../landing/landingRoute';

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
    .mockImplementation((k: string) => (k === OWN_OPENROUTER_KEY ? key : null));
}

beforeEach(async () => {
  signedInUid = null;
  await idbService.clear('studypacks');
  window.location.hash = '';
});

describe('NewStudyPage AI gate', () => {
  it('signed in, no key → the form, no setup', async () => {
    withKey(null);
    signedInUid = 'uid-leader-1';
    render(<NewStudyPage />);
    expect(await screen.findByTestId('new-study-form')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-ai-setup')).toBeNull();
  });

  it('signed out, no key → the inline sign-in prompt, no form, no key hints anywhere on the page', () => {
    withKey(null);
    render(<NewStudyPage />);
    expect(screen.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeInTheDocument();
    expect(screen.queryByTestId('new-study-form')).toBeNull();
    expect(screen.getByTestId('new-study-page').textContent).not.toMatch(/OpenRouter|密钥|\bkey\b/);
  });

  it('signed out → points to the complete sample, which needs no sign-in (2026-10 review)', () => {
    withKey(null);
    render(<NewStudyPage />);
    const link = screen.getByRole('link', { name: NS_SAMPLE_NO_SIGNIN });
    expect(link).toHaveAttribute('href', SAMPLE_PACK_HASH);
  });

  it('signed in → no sample detour', async () => {
    withKey(null);
    signedInUid = 'uid-leader-1';
    render(<NewStudyPage />);
    await screen.findByTestId('new-study-form');
    expect(screen.queryByTestId('new-study-sample-link')).toBeNull();
  });

  it('signed out with an old own key → still the sign-in prompt, no form (the key is never read)', () => {
    withKey('sk-or-own');
    render(<NewStudyPage />);
    expect(screen.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeInTheDocument();
    expect(screen.queryByTestId('new-study-form')).toBeNull();
  });
});

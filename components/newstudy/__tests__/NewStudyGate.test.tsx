/**
 * NewStudyGate.test.tsx — who sees the New-study form · 新建查经入口测试 (ADR-0007)
 *
 * One rule since 2026-10-23: sign in to use AI. A signed-in leader gets the
 * form straight away (hosted AI, no setup); a signed-out visitor gets the
 * inline sign-in prompt (Google or email) and no form — with no key hints on
 * the page — even with an old own key still in the browser. Signed out with
 * no packs in this browser the page is only the three-step card and the
 * sign-in card; with local packs, My packs + Backup & restore stay with one
 * "sign in to keep them" line (owner decision D). Session mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OWN_OPENROUTER_KEY } from '../../../services/obsoleteStorageKeys';
import { idbService } from '../../../services/idbService';
import { SETUP_SIGN_IN_TO_USE_AI } from '../../setup/setupStrings';
import { NS_SAMPLE_NO_SIGNIN, NS_MY_PACKS, NS_BACKUP_TOGGLE, NS_PRIVACY, NS_SIGN_IN_TO_KEEP, NS_GUIDE_TITLE } from '../newStudyStrings';
import { SI_EMAIL_TOGGLE } from '../../signin/signInStrings';
import { saveLocalPack } from '../../studypack/packSource';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
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
// A configured client, so the email choice shows beside Google (no call is made in these tests).
vi.mock('../../signup/signupClient', async importOriginal => ({
  ...(await importOriginal<typeof import('../../signup/signupClient')>()),
  getSignupClient: () => ({ auth: {} }),
}));
vi.mock('../../../services/bibleDataSource', () => ({
  fetchBundledChapter: async () => ({ verses: Array.from({ length: 36 }, (_, i) => ({ verse: i + 1, text: `v${i + 1}` })) }),
}));

import NewStudyPage, { showPackList } from '../NewStudyPage';

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const localPack = () => assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

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

describe('NewStudyPage signed out: only what a first-time visitor needs (owner decision D)', () => {
  it('no packs in this browser → the three-step card and the sign-in card (Google + email) only: no My packs, no Backup, no pack line', async () => {
    withKey(null);
    render(<NewStudyPage />);
    expect(await screen.findByText(NS_GUIDE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SI_EMAIL_TOGGLE })).toBeInTheDocument();
    expect(screen.queryByTestId('pack-list')).toBeNull();
    expect(screen.queryByText(NS_MY_PACKS)).toBeNull();
    expect(screen.queryByText(NS_BACKUP_TOGGLE)).toBeNull();
    expect(screen.queryByText(NS_PRIVACY)).toBeNull();
  });

  it('packs in this browser → My packs and Backup & restore stay, with the one "sign in to keep them" line', async () => {
    withKey(null);
    await saveLocalPack(localPack());
    render(<NewStudyPage />);
    expect(await screen.findByText(NS_MY_PACKS)).toBeInTheDocument();
    expect(screen.getByTestId('pack-list-sign-in')).toHaveTextContent(NS_SIGN_IN_TO_KEEP);
    expect(NS_SIGN_IN_TO_KEEP).toMatch(/^这些查经包只在这个浏览器里/);
    expect(screen.getByRole('button', { name: NS_BACKUP_TOGGLE })).toBeInTheDocument();
    expect(screen.getAllByTestId('pack-row')).toHaveLength(1);
    expect(screen.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeInTheDocument();
  });

  it('signed in → unchanged: My packs (even empty) without the sign-in line', async () => {
    withKey(null);
    signedInUid = 'uid-leader-1';
    render(<NewStudyPage />);
    await screen.findByTestId('new-study-form');
    await waitFor(() => expect(screen.getByText(NS_MY_PACKS)).toBeInTheDocument());
    expect(screen.queryByTestId('pack-list-sign-in')).toBeNull();
  });

  it('showPackList: signed in always; signed out only with packs, unreadable records or a storage error (never hidden), once loaded', () => {
    const none = { packs: [], invalid: [], error: null, loaded: true };
    expect(showPackList(true, { ...none, loaded: false })).toBe(true);
    expect(showPackList(false, none)).toBe(false);
    expect(showPackList(false, { ...none, loaded: false })).toBe(false);
    expect(showPackList(false, { ...none, packs: [localPack()] })).toBe(true);
    expect(showPackList(false, { ...none, invalid: ['bad-1'] })).toBe(true);
    expect(showPackList(false, { ...none, error: 'storage blocked' })).toBe(true);
  });
});

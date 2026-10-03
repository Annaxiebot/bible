/**
 * SyncLine.test.tsx — the sync line under "模型 Models" · 同步设置行测试
 *
 * Rendered through the real saved-state dialog (QuickAISetupForm) with the
 * session mocked: signed out shows the Chinese-first line and the Google
 * button that starts the identity-only sign-in (hidden when Supabase is not
 * configured); signed in shows "已登录 · 设置已同步" + email + sign-out and a
 * failed pull/push as a red line; before a key is saved there is no line.
 * Split from QuickAISetup.test.tsx (R4). Strings imported (R3).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { SETUP_SYNC_SIGNED_OUT, SETUP_SYNC_SIGNED_IN, SETUP_SIGN_OUT, SETUP_SIGN_OUT_FAILED, SETUP_SYNC_FAILED } from '../setupStrings';
import { SU_SIGN_IN_GOOGLE } from '../../signup/signupStrings';

let uid: string | null = null;
let configured = true;
const authState = () => ({ user: uid ? { id: uid, email: 'leader@example.com' } : null, session: null, isAuthenticated: !!uid, isLoading: false });
const signInMock = vi.fn(async () => ({ error: null }));
const signOutMock = vi.fn(async () => ({ error: null }));
const maybeSingleMock = vi.fn();
const upsertMock = vi.fn(async () => ({ error: null }));
vi.mock('../../../services/supabase', () => ({
  get supabase() {
    return configured
      ? { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }), upsert: upsertMock }) }
      : null;
  },
  isSupabaseConfigured: () => configured,
  authManager: {
    getState: () => authState(),
    getUserId: () => uid,
    subscribe: (l: (s: unknown) => void) => { l(authState()); return () => undefined; },
    signInWithGoogle: () => signInMock(),
    signOut: () => signOutMock(),
  },
}));

import { QuickAISetupForm } from '../QuickAISetup';
import { syncOnSignIn } from '../../../services/leaderSettings';

function makeStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
}

beforeEach(() => {
  uid = null;
  configured = true;
  signInMock.mockClear();
  signOutMock.mockClear();
  maybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
  vi.stubGlobal('localStorage', makeStorage({ [STORAGE_KEYS.OPENROUTER_API_KEY]: 'sk-or-v1-0123456789abcdef' }));
});
afterEach(() => vi.unstubAllGlobals());

describe('SyncLine (saved state, ADR-0005)', () => {
  it('signed out: the Chinese-first line under the Models block and the Google button that starts the identity-only sign-in', async () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    const line = screen.getByTestId('sync-line');
    expect(line).toHaveTextContent(SETUP_SYNC_SIGNED_OUT);
    expect(SETUP_SYNC_SIGNED_OUT).toMatch(/^[一-鿿]/);
    expect(screen.getByTestId('model-rows').compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: SU_SIGN_IN_GOOGLE }));
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('sync-signed-in')).toBeNull();
  });

  it('signed out and Supabase not configured: the line without a button', () => {
    configured = false;
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    expect(screen.getByTestId('sync-line')).toHaveTextContent(SETUP_SYNC_SIGNED_OUT);
    expect(screen.queryByRole('button', { name: SU_SIGN_IN_GOOGLE })).toBeNull();
  });

  it('signed in: "已登录 · 设置已同步" with the email, a sign-out link, no sign-in button', () => {
    uid = 'uid-lead';
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    expect(screen.getByTestId('sync-signed-in')).toHaveTextContent(`${SETUP_SYNC_SIGNED_IN} · leader@example.com`);
    expect(screen.queryByRole('button', { name: SU_SIGN_IN_GOOGLE })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: SETUP_SIGN_OUT }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('signed in: a failed sign-out is shown with the auth message, not swallowed', async () => {
    uid = 'uid-lead';
    signOutMock.mockResolvedValueOnce({ error: { message: 'network down' } });
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: SETUP_SIGN_OUT })); });
    expect(screen.getByRole('alert')).toHaveTextContent(`${SETUP_SIGN_OUT_FAILED} · network down`);
  });

  it('signed in: a failed pull is shown with the server message, not swallowed', async () => {
    uid = 'uid-lead';
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    await act(async () => { await syncOnSignIn(); });
    expect(screen.getByRole('alert')).toHaveTextContent(`${SETUP_SYNC_FAILED} · permission denied`);
  });

  it('is absent before a key is saved (the line belongs under the Models block)', () => {
    vi.stubGlobal('localStorage', makeStorage());
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    expect(screen.queryByTestId('sync-line')).toBeNull();
  });
});

/**
 * signInFunnel.test.tsx — the sign-in card's anonymous counts · 登录卡片的漏斗计数 (ADR-0025)
 *
 * On the shared sign-in card: a Google tap counts "started (Google)"; an
 * email send with a well-formed address counts "started (email)" (a bad
 * address counts nothing; a resend inside the window counts once); an
 * accepted code counts "finished (email)" once — a wrong code counts
 * nothing. The calls (emailAuth) and the session are mocked; the counts go
 * to the dev-only e2e base.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const googleMock = vi.fn(async () => ({ error: null }));
vi.mock('../../../services/supabase', () => ({
  isSupabaseConfigured: () => true,
  authManager: { signInWithGoogle: () => googleMock() },
}));
const sendMock = vi.fn();
const verifyMock = vi.fn();
vi.mock('../emailAuth', async importOriginal => ({
  ...(await importOriginal<typeof import('../emailAuth')>()),
  emailSignInAvailable: () => true,
  sendSignInEmail: (...a: unknown[]) => sendMock(...a),
  verifySignInCode: (...a: unknown[]) => verifyMock(...a),
}));

import { SignInChoices } from '../SignInChoices';
import {
  SI_EMAIL_TOGGLE, SI_EMAIL_LABEL, SI_SEND, SI_CODE_LABEL, SI_VERIFY, SI_SIGNED_IN, SI_ERR_CODE_WRONG, SI_OTHER_EMAIL,
} from '../signInStrings';
import { SU_SIGN_IN_GOOGLE } from '../../signup/signupStrings';
import { LOG_FUNNEL_FN } from '../../stats/funnelRules';
import { resetFunnelMemory } from '../../stats/funnel';
import { installMemoryStorage } from '../../../tests/utils/memoryStorage';

type Seams = Window & { __SUPABASE_E2E__?: unknown };
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200 }) as Response);
const events = () => fetchMock.mock.calls
  .filter(([url]) => url.endsWith(`/rest/v1/rpc/${LOG_FUNNEL_FN}`))
  .map(([, init]) => (JSON.parse(String(init!.body)) as { p_event: string }).p_event);

beforeEach(() => {
  installMemoryStorage();
  resetFunnelMemory();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  (window as Seams).__SUPABASE_E2E__ = { url: 'http://localhost:3000/e2e-supabase', anonKey: 'e2e-anon' };
  googleMock.mockClear();
  sendMock.mockReset().mockResolvedValue(null);
  verifyMock.mockReset().mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as Seams).__SUPABASE_E2E__;
});

const send = (address: string) => {
  fireEvent.change(screen.getByLabelText(SI_EMAIL_LABEL), { target: { value: address } });
  fireEvent.click(screen.getByRole('button', { name: SI_SEND }));
};

describe('the sign-in card → anonymous funnel counts', () => {
  it('a Google tap counts "sign-in started (Google)"', async () => {
    render(<SignInChoices />);
    fireEvent.click(screen.getByRole('button', { name: SU_SIGN_IN_GOOGLE }));
    await waitFor(() => expect(googleMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(events()).toEqual(['signin_started_google']));
  });

  it('email: a bad address counts nothing; a send counts started once (a resend inside the window does not); a wrong code nothing; the right code finished once', async () => {
    render(<SignInChoices />);
    fireEvent.click(screen.getByRole('button', { name: SI_EMAIL_TOGGLE }));
    send('not-an-address');
    expect(events()).toEqual([]);
    send('leader@example.org');
    await screen.findByLabelText(SI_CODE_LABEL);
    await waitFor(() => expect(events()).toEqual(['signin_started_email']));
    fireEvent.click(screen.getByRole('button', { name: SI_OTHER_EMAIL }));
    send('leader@example.org');   // sent again within the window
    await screen.findByLabelText(SI_CODE_LABEL);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(events()).toEqual(['signin_started_email']);

    verifyMock.mockResolvedValueOnce({ kind: 'wrong-code', message: SI_ERR_CODE_WRONG });
    fireEvent.change(screen.getByLabelText(SI_CODE_LABEL), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: SI_VERIFY }));
    expect(await screen.findByRole('alert')).toHaveTextContent(SI_ERR_CODE_WRONG);
    expect(events()).toEqual(['signin_started_email']);

    fireEvent.change(screen.getByLabelText(SI_CODE_LABEL), { target: { value: '246810' } });
    fireEvent.click(screen.getByRole('button', { name: SI_VERIFY }));
    expect(await screen.findByTestId('email-sign-in-done')).toHaveTextContent(SI_SIGNED_IN);
    await waitFor(() => expect(events()).toEqual(['signin_started_email', 'signin_done_email']));
  });
});

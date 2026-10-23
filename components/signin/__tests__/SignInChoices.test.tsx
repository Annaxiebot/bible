/**
 * SignInChoices.test.tsx — Google or email, the leader's flow · 登录方式测试 (ADR-0020)
 *
 * The Google button and "用邮箱登录 · Sign in with email" beside it; the email
 * steps: a bad address stays on the form with a Chinese-first line; a good
 * one is sent and the page says "已发送，请查看邮箱" with a 6-digit code box
 * (one-time-code autofill); a wrong code says so; the right code → "已登录".
 * "换一个邮箱" goes back. Senior type floors. The calls (emailAuth) and the
 * session are mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let configured = true;
const googleMock = vi.fn(async () => ({ error: null }));
vi.mock('../../../services/supabase', () => ({
  isSupabaseConfigured: () => configured,
  authManager: { signInWithGoogle: () => googleMock() },
}));
const sendMock = vi.fn();
const verifyMock = vi.fn();
let available = true;
vi.mock('../emailAuth', async importOriginal => ({
  ...(await importOriginal<typeof import('../emailAuth')>()),
  emailSignInAvailable: () => available,
  sendSignInEmail: (...a: unknown[]) => sendMock(...a),
  verifySignInCode: (...a: unknown[]) => verifyMock(...a),
}));

import { SignInChoices } from '../SignInChoices';
import {
  SI_EMAIL_TOGGLE, SI_EMAIL_LABEL, SI_SEND, SI_SENT, SI_SENT_HOW, SI_CODE_LABEL, SI_VERIFY, SI_SIGNED_IN, SI_OTHER_EMAIL,
  SI_ERR_EMAIL, SI_ERR_CODE, SI_ERR_CODE_WRONG,
} from '../signInStrings';
import { SU_SIGN_IN_GOOGLE } from '../../signup/signupStrings';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../../setup/setupStrings';

beforeEach(() => {
  configured = true;
  available = true;
  googleMock.mockClear();
  sendMock.mockReset().mockResolvedValue(null);
  verifyMock.mockReset().mockResolvedValue(null);
});

const openEmail = () => fireEvent.click(screen.getByRole('button', { name: SI_EMAIL_TOGGLE }));
const typeEmail = (v: string) => fireEvent.change(screen.getByLabelText(SI_EMAIL_LABEL), { target: { value: v } });
const send = () => fireEvent.click(screen.getByRole('button', { name: SI_SEND }));

describe('SignInChoices', () => {
  it('Google and the quieter email choice side by side, both ≥48px; Google starts the identity-only sign-in', async () => {
    render(<SignInChoices />);
    const google = screen.getByRole('button', { name: SU_SIGN_IN_GOOGLE });
    const email = screen.getByRole('button', { name: SI_EMAIL_TOGGLE });
    expect(SI_EMAIL_TOGGLE).toBe('用邮箱登录 Sign in with email');
    for (const b of [google, email]) expect(b.style.minHeight).toBe(`${SETUP_MIN_TAP_PX}px`);
    expect(google.parentElement).toBe(email.parentElement);
    fireEvent.click(google);
    await waitFor(() => expect(googleMock).toHaveBeenCalledTimes(1));
  });

  it('no Supabase → no Google button; no client → no email choice', () => {
    configured = false;
    available = false;
    render(<SignInChoices />);
    expect(screen.queryByRole('button', { name: SU_SIGN_IN_GOOGLE })).toBeNull();
    expect(screen.queryByRole('button', { name: SI_EMAIL_TOGGLE })).toBeNull();
  });

  it('a bad address stays on the form with the Chinese-first line; nothing is sent', () => {
    render(<SignInChoices />);
    openEmail();
    const field = screen.getByLabelText(SI_EMAIL_LABEL) as HTMLInputElement;
    expect(field.type).toBe('email');
    expect(field.autocomplete).toBe('email');
    expect(parseFloat(field.style.fontSize)).toBeGreaterThanOrEqual(SETUP_MIN_FONT_PX);
    typeEmail('not-an-address');
    send();
    expect(screen.getByRole('alert')).toHaveTextContent(SI_ERR_EMAIL);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('send → "Sent — check your email" and the code box; a short code is refused, a wrong one says so, the right one signs in', async () => {
    render(<SignInChoices returnTo="#/leader" />);
    openEmail();
    typeEmail('leader@example.org');
    send();
    expect(await screen.findByText(SI_SENT)).toBeInTheDocument();
    expect(sendMock).toHaveBeenCalledWith('leader@example.org', '#/leader');
    expect(screen.getByText(SI_SENT_HOW)).toBeInTheDocument();
    const code = screen.getByLabelText(SI_CODE_LABEL) as HTMLInputElement;
    expect(code.autocomplete).toBe('one-time-code');
    expect(code.inputMode).toBe('numeric');
    expect(code.maxLength).toBe(6);

    fireEvent.change(code, { target: { value: '12a3' } });
    expect(code.value).toBe('123');
    fireEvent.click(screen.getByRole('button', { name: SI_VERIFY }));
    expect(screen.getByRole('alert')).toHaveTextContent(SI_ERR_CODE);
    expect(verifyMock).not.toHaveBeenCalled();

    verifyMock.mockResolvedValueOnce({ kind: 'wrong-code', message: SI_ERR_CODE_WRONG });
    fireEvent.change(code, { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: SI_VERIFY }));
    expect(await screen.findByRole('alert')).toHaveTextContent(SI_ERR_CODE_WRONG);
    expect(verifyMock).toHaveBeenCalledWith('leader@example.org', '123456');

    fireEvent.click(screen.getByRole('button', { name: SI_VERIFY }));
    expect(await screen.findByTestId('email-sign-in-done')).toHaveTextContent(SI_SIGNED_IN);
  });

  it('a send failure stays on the address with its line; "Use another email" goes back from the code step', async () => {
    sendMock.mockResolvedValueOnce({ kind: 'rate', message: 'RATE LINE' });
    render(<SignInChoices />);
    openEmail();
    typeEmail('leader@example.org');
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent('RATE LINE');
    expect(screen.queryByText(SI_SENT)).toBeNull();
    send();
    expect(await screen.findByText(SI_SENT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: SI_OTHER_EMAIL }));
    expect(screen.getByLabelText(SI_EMAIL_LABEL)).toHaveValue('leader@example.org');
    expect(screen.queryByLabelText(SI_CODE_LABEL)).toBeNull();
  });
});

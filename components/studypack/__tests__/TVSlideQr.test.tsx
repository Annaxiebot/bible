/**
 * TVSlideQr.test.tsx — the qr slide: QR for an owned pack, sign-in block for an unclaimed local pack, demo line otherwise · 签到页测试
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import TVSlide from '../TVSlide';
import { parseStudyPack, buildSlides } from '../packTypes';
import { TEST_PACK_PATH } from './fixtures';
import { TYPE_SCALE } from '../principles';
import { currentSignupUrl } from '../../signup/signupRoute';
import {
  SU_DEMO_LINE, SU_QR_BODY, SU_UNCLAIMED_LINE, SU_SIGN_IN_GOOGLE, SU_CLAIM_FAILED, SU_ERR_NOT_CONFIGURED, qrAltText,
} from '../../signup/signupStrings';
import { LOCAL_PACKS_CLAIMED_EVENT } from '../../newstudy/claimLocalPacks';

const syncMock = vi.fn(async (_pack: unknown) => ({ status: 'synced' as const }));
vi.mock('../../signup/packSummary', () => ({ syncPackSummary: (pack: unknown) => syncMock(pack) }));
const signInMock = vi.fn(async () => ({ error: null }));
let configured = true;
vi.mock('../../../services/supabase', () => ({
  isSupabaseConfigured: () => configured,
  authManager: { signInWithGoogle: () => signInMock(), subscribe: () => () => undefined, getUserId: () => null },
}));

const demo = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const owned = parseStudyPack({ ...demo, leaderId: 'uid-lead' });
const unclaimed = parseStudyPack({ ...demo, id: 'local-2026-10-02-matt6' });
const qrSlide = (pack: typeof demo) => buildSlides(pack).find(s => s.kind === 'qr')!;

describe('TVSlide qr', () => {
  beforeEach(() => { configured = true; signInMock.mockClear(); syncMock.mockClear(); });

  it('a public demo pack shows the bilingual no-sign-up line and no QR', () => {
    render(<TVSlide slide={qrSlide(demo)} pack={demo} />);
    expect(screen.getByTestId('qr-demo')).toHaveTextContent(SU_DEMO_LINE);
    expect(screen.queryByTestId('signup-qr')).toBeNull();
    expect(screen.queryByTestId('qr-unclaimed')).toBeNull();
    expect(screen.queryByText(SU_QR_BODY)).toBeNull();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('an unclaimed LOCAL pack shows "登录以启用报名 · Sign in to enable sign-up" with the Google sign-in button, large type', async () => {
    render(<TVSlide slide={qrSlide(unclaimed)} pack={unclaimed} />);
    const block = screen.getByTestId('qr-unclaimed');
    expect(block).toHaveTextContent(SU_UNCLAIMED_LINE);
    expect(SU_UNCLAIMED_LINE.startsWith('登录')).toBe(true);
    expect(screen.queryByTestId('qr-demo')).toBeNull();
    expect(screen.queryByTestId('signup-qr')).toBeNull();
    const button = within(block).getByRole('button', { name: SU_SIGN_IN_GOOGLE });
    expect(button).toHaveStyle({ fontSize: TYPE_SCALE.body });
    fireEvent.click(button);
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
  });

  it('a claim failure announced after sign-in renders under the line', () => {
    render(<TVSlide slide={qrSlide(unclaimed)} pack={unclaimed} />);
    fireEvent(window, new CustomEvent(LOCAL_PACKS_CLAIMED_EVENT, { detail: { claimed: [], failures: ['local-x: RLS'] } }));
    expect(screen.getByRole('alert')).toHaveTextContent(`${SU_CLAIM_FAILED}: local-x: RLS`);
  });

  it('unconfigured Supabase shows the config error instead of the sign-in button', () => {
    configured = false;
    render(<TVSlide slide={qrSlide(unclaimed)} pack={unclaimed} />);
    expect(screen.getByRole('alert')).toHaveTextContent(SU_ERR_NOT_CONFIGURED);
    expect(screen.queryByRole('button', { name: SU_SIGN_IN_GOOGLE })).toBeNull();
  });

  it('an owned pack draws the QR for its sign-up URL, prints the URL and instruction, and refreshes the summary', async () => {
    render(<TVSlide slide={qrSlide(owned)} pack={owned} />);
    const url = currentSignupUrl(owned.id);
    const qr = screen.getByRole('img', { name: qrAltText(url) });
    expect(qr).toHaveAttribute('data-signup-url', url);
    await waitFor(() => expect(qr.querySelector('svg')).not.toBeNull());
    expect(screen.getByText(url)).toBeInTheDocument();
    expect(screen.getByText(SU_QR_BODY)).toBeInTheDocument();
    expect(screen.queryByTestId('qr-demo')).toBeNull();
    expect(screen.queryByTestId('qr-unclaimed')).toBeNull();
    expect(syncMock).toHaveBeenCalledWith(owned);
  });
});

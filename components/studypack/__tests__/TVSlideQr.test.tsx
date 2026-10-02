/**
 * TVSlideQr.test.tsx — the qr slide: QR for an owned pack, demo line otherwise · 签到页测试
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import TVSlide from '../TVSlide';
import { parseStudyPack, buildSlides } from '../packTypes';
import { TEST_PACK_PATH } from './fixtures';
import { currentSignupUrl } from '../../signup/signupRoute';
import { SU_DEMO_LINE, SU_QR_BODY, qrAltText } from '../../signup/signupStrings';

const syncMock = vi.fn(async (_pack: unknown) => ({ status: 'synced' as const }));
vi.mock('../../signup/packSummary', () => ({ syncPackSummary: (pack: unknown) => syncMock(pack) }));

const demo = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const owned = parseStudyPack({ ...demo, leaderId: 'uid-lead' });
const qrSlide = (pack: typeof demo) => buildSlides(pack).find(s => s.kind === 'qr')!;

describe('TVSlide qr', () => {
  it('a demo pack shows the bilingual no-sign-up line and no QR', () => {
    render(<TVSlide slide={qrSlide(demo)} pack={demo} />);
    expect(screen.getByTestId('qr-demo')).toHaveTextContent(SU_DEMO_LINE);
    expect(screen.queryByTestId('signup-qr')).toBeNull();
    expect(screen.queryByText(SU_QR_BODY)).toBeNull();
    expect(syncMock).not.toHaveBeenCalled();
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
    expect(syncMock).toHaveBeenCalledWith(owned);
  });
});

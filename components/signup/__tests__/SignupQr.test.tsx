/**
 * SignupQr.test.tsx — the QR encodes exactly the sign-up URL · 二维码测试
 *
 * The rendered SVG must equal what the qrcode library produces for the same
 * text with the same options (no second QR implementation to disagree with),
 * and the encoded text is exposed on data-signup-url.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import SignupQr from '../SignupQr';
import { qrAltText, SU_QR_FAILED } from '../signupStrings';
import { signupUrl, QR_SVG_OPTIONS, qrModulesPath } from '../signupRoute';

const URL_TEXT = signupUrl('2026-10-02-matt6', 'https://scripturetolife.org', '/');

describe('SignupQr', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the library SVG for the URL, labelled and tagged with the encoded text', async () => {
    render(<SignupQr url={URL_TEXT} size="10rem" />);
    const qr = screen.getByRole('img', { name: qrAltText(URL_TEXT) });
    expect(qr).toHaveAttribute('data-signup-url', URL_TEXT);
    expect(qr).toHaveStyle({ width: '10rem', height: '10rem' });
    await waitFor(() => expect(qr.querySelector('svg')).not.toBeNull());
    const expected = await QRCode.toString(URL_TEXT, QR_SVG_OPTIONS);
    expect(qrModulesPath(qr.innerHTML)).toBe(qrModulesPath(expected));
  });

  it('a drawing failure renders a bilingual alert carrying the message', async () => {
    vi.spyOn(QRCode, 'toString').mockRejectedValueOnce(new Error('too long'));
    render(<SignupQr url={URL_TEXT} size="10rem" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`${SU_QR_FAILED}: too long`);
    expect(alert).toHaveClass('text-red-300'); // dark TV slide
  });

  it('on paper pages the failure is a dark red that reads on the light background', async () => {
    vi.spyOn(QRCode, 'toString').mockRejectedValueOnce(new Error('too long'));
    render(<SignupQr url={URL_TEXT} size="10rem" tone="paper" />);
    expect(await screen.findByRole('alert')).toHaveClass('text-red-700');
  });
});

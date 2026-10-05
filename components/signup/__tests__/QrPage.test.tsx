/**
 * QrPage.test.tsx — the leader's "#/qr/<id>" page in jsdom · 报名二维码页测试
 *
 * An owned pack (loaded through the sign-up page's seam: the public pack
 * JSON fetch) shows its title + passage, a QR encoding exactly the sign-up
 * URL the TV slide encodes, that URL as text, the scan line, a Print button
 * (window.print) and the back link to #/leader. A public demo pack shows the
 * TV slide's demo line and an unclaimed local pack the sign-in block — never
 * a QR that cannot work. A missing pack is a visible error.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QrPage from '../QrPage';
import { PAPER_PAGE_CLASS } from '../../shared/paperStyles';
import { PAPER_HOME_TEST_ID } from '../../shared/PaperHeader';
import { LANDING_HASH } from '../../landing/landingRoute';
import { currentSignupUrl } from '../signupRoute';
import { LEADER_HOME_HASH } from '../../leader/leaderRoute';
import { saveLocalPack } from '../../studypack/packSource';
import { idbService } from '../../../services/idbService';
import {
  SU_QR_BODY, SU_QR_PRINT, SU_QR_BACK, SU_DEMO_LINE, SU_UNCLAIMED_LINE, SU_ERR_PACK, qrAltText,
} from '../signupStrings';

vi.mock('../../../services/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: () => true,
  authManager: { getUserId: () => null, signInWithGoogle: async () => ({ error: null }), subscribe: () => () => undefined },
}));

const PACK_ID = '2026-10-02-matt6';
const PACK = {
  id: PACK_ID, title: '不要忧虑 Do Not Be Anxious', date: '2026-10-02',
  passageRef: '马太福音 6:25–34 · Matthew 6:25–34', enVersion: 'BSB', leaderId: 'uid-lead',
  sections: [{ kind: 'title', heading: '不要忧虑 Do Not Be Anxious' }, { kind: 'lifeMenu', heading: '生活应用 Life Menu', rows: [{ area: '健康 Health', practice: '睡前程序 · Wind-down' }] }],
};
const { leaderId: _demoLeader, ...DEMO_PACK } = PACK;

function servePack(pack: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pack })));
}

describe('QrPage', () => {
  beforeEach(() => servePack(PACK));
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('an owned pack: title + passage, a large QR of the sign-up URL, the URL as text, the scan line, Print and Back', async () => {
    render(<QrPage packId={PACK_ID} />);
    const header = await screen.findByTestId('qr-pack');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PACK.title);
    expect(header).toHaveTextContent(PACK.passageRef);
    const url = currentSignupUrl(PACK_ID);
    const qr = screen.getByTestId('signup-qr');
    expect(qr).toHaveAttribute('data-signup-url', url);
    expect(qr).toHaveAttribute('aria-label', qrAltText(url));
    await waitFor(() => expect(qr.querySelector('svg')).not.toBeNull());
    expect(screen.getByTestId('qr-url')).toHaveTextContent(url);
    expect(screen.getByText(SU_QR_BODY)).toBeInTheDocument();
    expect(screen.getByTestId('qr-back')).toHaveAttribute('href', LEADER_HOME_HASH);
    expect(screen.getByTestId('qr-back')).toHaveTextContent(SU_QR_BACK);
    expect(screen.queryByTestId('qr-demo')).toBeNull();
  });

  it('on screen: paper style like the landing (brand link home, WenKai title, gold Print pill)', async () => {
    render(<QrPage packId={PACK_ID} />);
    await screen.findByTestId('qr-pack');
    expect(screen.getByTestId(PAPER_HOME_TEST_ID)).toHaveAttribute('href', LANDING_HASH);
    expect(screen.getByTestId('qr-page').className).toContain(PAPER_PAGE_CLASS);
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('stl-head');
    expect(screen.getByTestId('qr-print').className).toContain('stl-pill');
  });

  it('Print calls window.print; print CSS hides the controls and the scan line, keeps title + QR + URL on white', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<QrPage packId={PACK_ID} />);
    const button = await screen.findByRole('button', { name: SU_QR_PRINT });
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
    expect(button.className).toContain('print:hidden');
    expect(screen.getByTestId('qr-back').className).toContain('print:hidden');
    expect(screen.getByTestId(PAPER_HOME_TEST_ID).className).toContain('print:hidden');
    expect(screen.getByText(SU_QR_BODY).className).toContain('print:hidden');
    expect(screen.getByTestId('qr-page').className).toContain('print:bg-white');
    for (const kept of [screen.getByTestId('qr-pack'), screen.getByTestId('qr-url'), screen.getByTestId('signup-qr')]) {
      expect(kept.className).not.toContain('print:hidden');
    }
  });

  it('a public demo pack shows the demo line, not a QR', async () => {
    servePack(DEMO_PACK);
    render(<QrPage packId={PACK_ID} />);
    expect(await screen.findByTestId('qr-demo')).toHaveTextContent(SU_DEMO_LINE);
    expect(screen.getByTestId('qr-demo').className).toBe('text-stl-ink');   // paper page: never the TV's light text
    expect(screen.queryByTestId('signup-qr')).toBeNull();
    expect(screen.queryByTestId('qr-print')).toBeNull();
  });

  it('an unclaimed local pack shows the sign-in block (as the TV slide does), not a QR', async () => {
    await idbService.clear('studypacks');
    await saveLocalPack({ ...DEMO_PACK, id: 'local-2026-10-02-jhn3' } as never);
    render(<QrPage packId="local-2026-10-02-jhn3" />);
    expect(await screen.findByTestId('qr-unclaimed')).toHaveTextContent(SU_UNCLAIMED_LINE);
    expect(screen.queryByTestId('signup-qr')).toBeNull();
  });

  it('a missing pack is a visible error and no QR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    render(<QrPage packId="2026-01-01-none" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(SU_ERR_PACK));
    expect(screen.queryByTestId('signup-qr')).toBeNull();
  });
});

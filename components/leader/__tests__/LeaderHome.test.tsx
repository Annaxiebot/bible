/**
 * LeaderHome.test.tsx — "#/leader": the leader's packs in one place · 带领者主页测试
 *
 * Real fake-indexeddb holds the packs; services/supabase is mocked (session
 * + a client whose study_signups / checkin_answers selects return rows).
 * Signed out → the sign-in prompt and the Google button; unconfigured →
 * the config line; signed in → own packs only, newest study date first,
 * with "报名 N 人，分享 M 条" and the four links; a counts failure is shown.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { parseStudyPack } from '../../studypack/packTypes';
import { TEST_PACK_PATH } from '../../studypack/__tests__/fixtures';
import { saveLocalPack } from '../../studypack/packSource';
import { idbService } from '../../../services/idbService';
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE } from '../../signup/signupSchema';
import { SU_ERR_NOT_CONFIGURED } from '../../signup/signupStrings';
import { newStudyHash, packHash, NEW_STUDY_HASH } from '../../landing/landingRoute';
import { qrHash } from '../../signup/signupRoute';
import { leaderHash } from '../leaderRoute';
import { LH_SIGNIN, LH_ERR_COUNTS, packCountsLine } from '../leaderStrings';
import { SETUP_SIGN_OUT, SETUP_SIGN_OUT_FAILED } from '../../setup/setupStrings';
import { SITE_STATS_FN } from '../../stats/statsRules';

let uid: string | null = 'uid-lead';
let configured = true;
const signInMock = vi.fn();
const signOutMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
type CountRow = { pack_id: string; leader_id: string; replaced_at?: string | null };
const rowsByTable: Record<string, CountRow[]> = {};
let countsError: string | null = null;
/** PostgREST-shaped: .eq() is awaitable and also takes a further .is(col, null) filter, honoured like the server would. */
const reply = (rows: CountRow[]) => (countsError ? { data: null, error: { message: countsError } } : { data: rows, error: null });
const fromMock = vi.fn((table: string) => ({
  select: () => ({
    eq: (_col: string, value: string) => {
      const rows = (rowsByTable[table] ?? []).filter(r => r.leader_id === value);
      return Object.assign(Promise.resolve(reply(rows)), {
        is: async (col: 'replaced_at', isValue: null) => reply(rows.filter(r => (r[col] ?? null) === isValue)),
      });
    },
  }),
}));
/** site_stats answers like the SQL (totals only); any other function is unknown. */
const SITE_TOTALS = { packs: 3, leaders: 2, meetings: 1, signups: 4, practices: 15, checkins_shared: 2, as_of: '2026-10-06T00:00:00Z' };
const rpcMock = vi.fn(async (fn: string) => (fn === SITE_STATS_FN ? { data: SITE_TOTALS, error: null } : { data: null, error: { message: `unknown ${fn}` } }));
const authState = () => ({ user: uid ? { id: uid, email: 'lead@example.com' } : null, session: null, isAuthenticated: !!uid, isLoading: false });
vi.mock('../../../services/supabase', () => ({
  get supabase() { return configured ? { from: fromMock, rpc: rpcMock } : null; },
  isSupabaseConfigured: () => configured,
  authManager: {
    getState: () => authState(),
    subscribe: (l: (s: unknown) => void) => { l(authState()); return () => undefined; },
    getUserId: () => uid,
    getFullName: () => null,
    signInWithGoogle: () => signInMock(),
    signOut: () => signOutMock(),
  },
}));

import LeaderHome from '../LeaderHome';

const sample = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const pack = (id: string, date: string, title: string, leaderId = 'uid-lead') => ({ ...sample, id, date, title, leaderId });

beforeEach(async () => {
  uid = 'uid-lead';
  configured = true;
  countsError = null;
  signInMock.mockReset().mockResolvedValue({ error: null });
  await idbService.clear('studypacks');
  rowsByTable[SIGNUPS_TABLE] = [
    { pack_id: 'local-2026-10-09-jhn3', leader_id: 'uid-lead' },
    { pack_id: 'local-2026-10-09-jhn3', leader_id: 'uid-lead' },
    // Replaced by a later sign-up of the same person (same pack + email): never counted.
    { pack_id: 'local-2026-10-09-jhn3', leader_id: 'uid-lead', replaced_at: '2026-10-04T10:00:00Z' },
    { pack_id: 'local-2026-10-02-matt6', leader_id: 'uid-lead' },
  ];
  rowsByTable[CHECKIN_ANSWERS_TABLE] = [{ pack_id: 'local-2026-10-09-jhn3', leader_id: 'uid-lead' }];
});

describe('LeaderHome', () => {
  it('signed out: the sign-in line and the Google button (identity-only hook)', async () => {
    uid = null;
    render(<LeaderHome />);
    expect(screen.getByTestId('lh-signin')).toHaveTextContent(LH_SIGNIN);
    fireEvent.click(screen.getByTestId('lh-signin-button'));
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('lh-packs')).toBeNull();
  });

  it('unconfigured: the config line, no sign-in button', () => {
    configured = false;
    uid = null;
    render(<LeaderHome />);
    expect(screen.getByRole('alert')).toHaveTextContent(SU_ERR_NOT_CONFIGURED);
    expect(screen.queryByTestId('lh-signin-button')).toBeNull();
  });

  it('signed in: own packs newest first, counts per pack (replaced sign-ups skipped), and the four links + New study', async () => {
    await saveLocalPack(pack('local-2026-10-02-matt6', '2026-10-02', '不要忧虑'));
    await saveLocalPack(pack('local-2026-10-09-jhn3', '2026-10-09', '祂必兴旺'));
    await saveLocalPack(pack('local-2026-10-16-rom8', '2026-10-16', 'Someone else', 'uid-other'));
    render(<LeaderHome />);
    await waitFor(() => expect(screen.getAllByTestId('lh-pack')).toHaveLength(2));
    const rows = screen.getAllByTestId('lh-pack');
    expect(rows[0]).toHaveTextContent('祂必兴旺');
    expect(rows[1]).toHaveTextContent('不要忧虑');
    await waitFor(() => expect(within(rows[0]).getByTestId('lh-counts')).toHaveTextContent(packCountsLine(2, 1)));
    expect(within(rows[1]).getByTestId('lh-counts')).toHaveTextContent(packCountsLine(1, 0));
    // Shared > 0 is a gold badge that catches the eye; 0 shared stays quiet.
    expect(within(rows[0]).getByTestId('lh-shared')).toHaveAttribute('data-has-shared', 'true');
    expect(within(rows[0]).getByTestId('lh-shared')).toHaveClass('bg-stl-gold', 'text-stl-bg');
    expect(within(rows[1]).getByTestId('lh-shared')).toHaveAttribute('data-has-shared', 'false');
    expect(within(rows[1]).getByTestId('lh-shared')).not.toHaveClass('bg-stl-gold');
    const id = 'local-2026-10-09-jhn3';
    expect(within(rows[0]).getByTestId('lh-edit')).toHaveAttribute('href', newStudyHash(id));
    expect(within(rows[0]).getByTestId('lh-present')).toHaveAttribute('href', packHash(id));
    expect(within(rows[0]).getByTestId('lh-responses')).toHaveAttribute('href', leaderHash(id));
    expect(within(rows[0]).getByTestId('lh-qr')).toHaveAttribute('href', qrHash(id));   // the page that SHOWS the QR, not the member form
    expect(screen.getByTestId('lh-new')).toHaveAttribute('href', NEW_STUDY_HASH);
    expect(fromMock).toHaveBeenCalledWith(SIGNUPS_TABLE);
    expect(fromMock).toHaveBeenCalledWith(CHECKIN_ANSWERS_TABLE);
  });

  it('signed in: the site-wide totals (site_stats) sit under My packs', async () => {
    render(<LeaderHome />);
    expect(await screen.findByTestId('site-stat-packs')).toHaveTextContent('3');
    expect(screen.getByTestId('site-stat-checkins_shared')).toHaveTextContent('2');
    const packs = screen.getByTestId('lh-packs');
    expect(packs.compareDocumentPosition(screen.getByTestId('lh-site-stats')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rpcMock).toHaveBeenCalledWith(SITE_STATS_FN);
  });

  it('a counts failure is shown; the packs still list', async () => {
    countsError = 'permission denied';
    await saveLocalPack(pack('local-2026-10-02-matt6', '2026-10-02', '不要忧虑'));
    render(<LeaderHome />);
    expect(await screen.findByRole('alert')).toHaveTextContent(`${LH_ERR_COUNTS}: permission denied`);
    expect(await screen.findAllByTestId('lh-pack')).toHaveLength(1);
    expect(screen.queryByTestId('lh-counts')).toBeNull();
  });

  it('signed in: shows the email and a Sign out button (regression: there was no way to sign out)', async () => {
    render(<LeaderHome />);
    const bar = screen.getByTestId('leader-sign-out');
    expect(bar).toHaveTextContent('lead@example.com');
    fireEvent.click(within(bar).getByRole('button', { name: SETUP_SIGN_OUT }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(within(bar).queryByRole('alert')).toBeNull();
  });

  it('a failed sign-out is shown with the auth message', async () => {
    signOutMock.mockResolvedValueOnce({ error: { message: 'network down' } });
    render(<LeaderHome />);
    fireEvent.click(screen.getByRole('button', { name: SETUP_SIGN_OUT }));
    expect(await screen.findByRole('alert')).toHaveTextContent(`${SETUP_SIGN_OUT_FAILED} · network down`);
  });

  it('signed out: no Sign out button and no site-wide totals', () => {
    uid = null;
    render(<LeaderHome />);
    expect(screen.queryByTestId('leader-sign-out')).toBeNull();
    expect(screen.queryByTestId('lh-site-stats')).toBeNull();
  });
});

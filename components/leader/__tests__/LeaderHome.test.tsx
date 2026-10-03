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
import { signupHash } from '../../signup/signupRoute';
import { leaderHash } from '../leaderRoute';
import { LH_SIGNIN, LH_ERR_COUNTS, packCountsLine } from '../leaderStrings';

let uid: string | null = 'uid-lead';
let configured = true;
const signInMock = vi.fn();
const rowsByTable: Record<string, Array<{ pack_id: string; leader_id: string }>> = {};
let countsError: string | null = null;
const fromMock = vi.fn((table: string) => ({
  select: () => ({
    eq: async (_col: string, value: string) => countsError
      ? { data: null, error: { message: countsError } }
      : { data: (rowsByTable[table] ?? []).filter(r => r.leader_id === value), error: null },
  }),
}));
const authState = () => ({ user: uid ? { id: uid, email: 'lead@example.com' } : null, session: null, isAuthenticated: !!uid, isLoading: false });
vi.mock('../../../services/supabase', () => ({
  get supabase() { return configured ? { from: fromMock } : null; },
  isSupabaseConfigured: () => configured,
  authManager: {
    getState: () => authState(),
    subscribe: (l: (s: unknown) => void) => { l(authState()); return () => undefined; },
    getUserId: () => uid,
    getFullName: () => null,
    signInWithGoogle: () => signInMock(),
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

  it('signed in: own packs newest first, counts per pack, and the four links + New study', async () => {
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
    const id = 'local-2026-10-09-jhn3';
    expect(within(rows[0]).getByTestId('lh-edit')).toHaveAttribute('href', newStudyHash(id));
    expect(within(rows[0]).getByTestId('lh-present')).toHaveAttribute('href', packHash(id));
    expect(within(rows[0]).getByTestId('lh-responses')).toHaveAttribute('href', leaderHash(id));
    expect(within(rows[0]).getByTestId('lh-qr')).toHaveAttribute('href', signupHash(id));
    expect(screen.getByTestId('lh-new')).toHaveAttribute('href', NEW_STUDY_HASH);
    expect(fromMock).toHaveBeenCalledWith(SIGNUPS_TABLE);
    expect(fromMock).toHaveBeenCalledWith(CHECKIN_ANSWERS_TABLE);
  });

  it('a counts failure is shown; the packs still list', async () => {
    countsError = 'permission denied';
    await saveLocalPack(pack('local-2026-10-02-matt6', '2026-10-02', '不要忧虑'));
    render(<LeaderHome />);
    expect(await screen.findByRole('alert')).toHaveTextContent(`${LH_ERR_COUNTS}: permission denied`);
    expect(await screen.findAllByTestId('lh-pack')).toHaveLength(1);
    expect(screen.queryByTestId('lh-counts')).toBeNull();
  });
});

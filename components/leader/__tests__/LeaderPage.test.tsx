/**
 * LeaderPage.test.tsx — auth gate, list, CSV export, dry-run test · 组长页测试
 *
 * services/supabase is mocked (auth state + a query/functions client);
 * AuthPanel is stubbed (its real module pulls the whole sync service); the
 * CSV download is captured through the fileDownloader seam. Ownership:
 * only the pack's leaderId sees the list (ADR-0004).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LeaderPage from '../LeaderPage';
import { signupsToCsv, csvFilename, SignupRecord, TEST_CHECKIN_KIND } from '../leaderData';
import {
  LD_TITLE, LD_SIGNIN, LD_NONE, LD_NOT_OWNER, countLine, LD_YES, LD_NO, LD_EXPORT, LD_TEST, LD_TEST_OK, LD_TEST_FAILED,
} from '../leaderStrings';
import { SU_ERR_NOT_CONFIGURED, SU_DEMO_LINE, SU_SUMMARY_FAILED } from '../../signup/signupStrings';
import { packSummaryFrom } from '../../signup/packSummary';

const authState = { user: null as { id: string; email: string } | null, session: null, isAuthenticated: false, isLoading: false };
const orderMock = vi.fn();
const eqMock = vi.fn();
const upsertMock = vi.fn();
const invokeMock = vi.fn();
let configured = true;
vi.mock('../../../services/supabase', () => ({
  authManager: {
    getState: () => authState,
    subscribe: (listener: (s: typeof authState) => void) => { listener(authState); return () => undefined; },
    getEmail: () => authState.user?.email ?? null,
    getFullName: () => null,
    getUserId: () => authState.user?.id ?? null,
  },
  get supabase() {
    return configured
      ? {
        from: (table: string) => (table === 'pack_summaries' ? { upsert: upsertMock } : { select: () => ({ eq: eqMock }) }),
        functions: { invoke: invokeMock },
      }
      : null;
  },
  isSupabaseConfigured: () => configured,
}));
vi.mock('../../AuthPanel', () => ({ AuthPanel: () => <div data-testid="auth-panel-stub" /> }));
const downloadMock = vi.fn();
vi.mock('../../../services/export/fileDownloader', () => ({ downloadFile: (...args: unknown[]) => downloadMock(...args) }));

const PACK_ID = '2026-10-02-matt6';
const LEADER_ID = 'uid-lead';
const PACK = {
  id: PACK_ID, title: '不要忧虑 Do Not Be Anxious — 马太福音 6:25–34', date: '2026-10-02',
  passageRef: '马太福音 6:25–34 · Matthew 6:25–34', enVersion: 'BSB', leaderId: LEADER_ID,
  sections: [{ kind: 'title', heading: '不要忧虑 Do Not Be Anxious' }],
};
const ROWS: SignupRecord[] = [
  { id: '1', leader_id: LEADER_ID, name: '小明', phone: '+14085551234', email: 'ming@example.org', consent_checkins: true, created_at: '2026-10-02T20:00:00Z' },
  { id: '2', leader_id: LEADER_ID, name: 'Ann', phone: null, email: 'ann@example.org', consent_checkins: false, created_at: '2026-10-02T21:00:00Z' },
];

function signIn(uid = LEADER_ID) {
  authState.user = { id: uid, email: 'lead@example.org' };
  authState.isAuthenticated = true;
}

function servePack(pack: object) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pack })));
}

describe('LeaderPage', () => {
  beforeEach(() => {
    configured = true;
    authState.user = null;
    authState.isAuthenticated = false;
    orderMock.mockReset().mockResolvedValue({ data: ROWS, error: null });
    eqMock.mockReset().mockReturnValue({ eq: eqMock, order: orderMock });
    upsertMock.mockReset().mockResolvedValue({ error: null });
    invokeMock.mockReset();
    downloadMock.mockReset();
    servePack(PACK);
  });

  it('signed out: bilingual prompt + the app sign-in panel, no list', async () => {
    render(<LeaderPage packId={PACK_ID} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(LD_TITLE);
    expect(screen.getByTestId('leader-signin')).toHaveTextContent(LD_SIGNIN);
    expect(screen.getByTestId('auth-panel-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('leader-table')).toBeNull();
    expect(await screen.findByText(PACK.title)).toBeInTheDocument();
  });

  it('unconfigured: a visible error instead of the sign-in panel', () => {
    configured = false;
    render(<LeaderPage packId={PACK_ID} />);
    expect(screen.getByRole('alert')).toHaveTextContent(SU_ERR_NOT_CONFIGURED);
    expect(screen.queryByTestId('leader-signin')).toBeNull();
  });

  it('signed in as the owner: lists name/phone/email/consent/time with a count; Export downloads the CSV', async () => {
    signIn();
    render(<LeaderPage packId={PACK_ID} />);
    const table = await screen.findByTestId('leader-table');
    expect(eqMock.mock.calls).toEqual([['pack_id', PACK_ID], ['leader_id', LEADER_ID]]);
    // Opening the page refreshes the pack's summary (the check-in sender's only text source)
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock.mock.calls[0][0]).toEqual(packSummaryFrom({ ...PACK, sections: PACK.sections } as never));
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ pack_id: PACK_ID, leader_id: LEADER_ID, title: PACK.title });
    expect(screen.getByTestId('leader-count')).toHaveTextContent(countLine(2));
    const rows = within(table).getAllByTestId('leader-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('小明');
    expect(rows[0]).toHaveTextContent('+14085551234');
    expect(rows[0]).toHaveTextContent(LD_YES);
    expect(rows[1]).toHaveTextContent('ann@example.org');
    expect(rows[1]).toHaveTextContent(LD_NO);
    fireEvent.click(screen.getByRole('button', { name: LD_EXPORT }));
    expect(downloadMock).toHaveBeenCalledWith(signupsToCsv(ROWS), csvFilename(PACK_ID), 'text/csv;charset=utf-8');
  });

  it('signed in as someone else: the not-your-pack line, no query, no list', async () => {
    signIn('uid-other');
    render(<LeaderPage packId={PACK_ID} />);
    expect(await screen.findByTestId('leader-not-owner')).toHaveTextContent(LD_NOT_OWNER);
    expect(screen.queryByTestId('leader-table')).toBeNull();
    expect(eqMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('a demo pack (no leaderId): the demo line, no query, no summary', async () => {
    signIn();
    const { leaderId: _l, ...demo } = PACK;
    servePack(demo);
    render(<LeaderPage packId={PACK_ID} />);
    expect(await screen.findByTestId('leader-demo')).toHaveTextContent(SU_DEMO_LINE);
    expect(eqMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('signed in with nobody yet: the none line, export disabled', async () => {
    signIn();
    orderMock.mockResolvedValue({ data: [], error: null });
    render(<LeaderPage packId={PACK_ID} />);
    expect(await screen.findByText(LD_NONE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LD_EXPORT })).toBeDisabled();
  });

  it('a failed summary sync is shown above the list, which still renders', async () => {
    signIn();
    upsertMock.mockResolvedValue({ error: { message: 'RLS' } });
    render(<LeaderPage packId={PACK_ID} />);
    await screen.findByTestId('leader-table');
    expect(await screen.findByTestId('summary-failed')).toHaveTextContent(`${SU_SUMMARY_FAILED}: RLS`);
  });

  it('a failed query renders the error', async () => {
    signIn();
    orderMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    render(<LeaderPage packId={PACK_ID} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied');
  });

  it('Send test check-in calls the edge function as a dry run to the leader email and reports it', async () => {
    signIn();
    invokeMock.mockResolvedValue({ data: { dry_run: true, attempted: 1, results: [{ status: 'dry-run', to: 'lead@example.org' }] }, error: null });
    render(<LeaderPage packId={PACK_ID} />);
    await screen.findByTestId('leader-table');
    const button = screen.getByTestId('leader-test');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent(LD_TEST_OK);
    const body = invokeMock.mock.calls[0][1].body;
    expect(body).toEqual({ pack_id: PACK_ID, kind: TEST_CHECKIN_KIND, test_to: 'lead@example.org', test_name: 'lead@example.org' });
    expect(body.pack).toBeUndefined();  // text comes from pack_summaries, never the request
  });

  it('a failed test call is shown as an alert', async () => {
    signIn();
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Function not found' } });
    render(<LeaderPage packId={PACK_ID} />);
    await screen.findByTestId('leader-table');
    const button = screen.getByTestId('leader-test');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(`${LD_TEST_FAILED}: Function not found`);
  });
});

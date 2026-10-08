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
import { signupsToCsv, csvFilename, SignupRecord, AnswerRecord, TEST_CHECKIN_KIND } from '../leaderData';
import {
  LD_TITLE, LD_SIGNIN, LD_NONE, LD_NOT_OWNER, countLine, LD_YES, LD_NO, LD_EXPORT, LD_TEST, LD_TEST_OK, LD_TEST_FAILED,
  LD_COMMITMENTS, LD_FEEDBACK, answeredLine, areaCountLine, LD_STOP, LD_RESUME, LD_BY_MEMBER, LD_PAUSE, LD_COL_NAME, LD_EMPTY_CELL,
} from '../leaderStrings';
import { SU_ERR_NOT_CONFIGURED, SU_DEMO_LINE, SU_SUMMARY_FAILED } from '../../signup/signupStrings';
import { packSummaryFrom } from '../../signup/packSummary';
import { CK_KIND_LABEL } from '../../checkin/checkinStrings';
import { compactTime, fullTime } from '../leaderTime';

const authState = { user: null as { id: string; email: string } | null, session: null, isAuthenticated: false, isLoading: false };
const orderMock = vi.fn();
const answersOrderMock = vi.fn();
const eqMock = vi.fn();
const answersEqMock = vi.fn();
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
        from: (table: string) => (table === 'pack_summaries'
          ? { upsert: upsertMock, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { checkins_paused: false }, error: null }) }) }) }
          : table === 'checkin_answers' ? { select: () => ({ eq: answersEqMock }) } : { select: () => ({ eq: eqMock }) }),
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
const practice = { practice_area: '健康 Health', practice_text: '睡前程序 · Wind-down', practice2_area: null, practice2_text: null, practice_note: null };
const ROWS: SignupRecord[] = [
  { id: '1', leader_id: LEADER_ID, name: '小明', phone: '+14085551234', email: 'ming@example.org', consent_checkins: true, created_at: '2026-10-02T20:00:00Z', ...practice },
  { id: '2', leader_id: LEADER_ID, name: 'Ann', phone: null, email: 'ann@example.org', consent_checkins: false, created_at: '2026-10-02T21:00:00Z', ...practice, practice_area: '工作 Work', practice_note: '写下来 · Write it',
    practices: [{ area: '工作 Work', practice: '写下忧虑' }, { area: '家庭 Family', practice: '一起吃饭 · Eat together' }, { area: '金钱 Money', practice: '记账 · Track spending' }] },
];
const ANSWERS: AnswerRecord[] = [
  { id: 'a1', signup_id: '1', leader_id: LEADER_ID, kind: 'tue', answer: '做了两晚 · Two nights', created_at: '2026-10-06T16:00:00Z' },
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
    answersOrderMock.mockReset().mockResolvedValue({ data: ANSWERS, error: null });
    answersEqMock.mockReset().mockReturnValue({ eq: answersEqMock, order: answersOrderMock });
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
    expect(downloadMock).toHaveBeenCalledWith(signupsToCsv(ROWS, ANSWERS), csvFilename(PACK_ID), 'text/csv;charset=utf-8');
    expect(signupsToCsv(ROWS, ANSWERS)).toContain('做了两晚');
  });

  it('a sign-up replaced by the same person signing up again is not listed or counted; its shared answer moves to the live row', async () => {
    const replaced: SignupRecord = { ...ROWS[0], id: '0', name: '小明 (first try)', email: 'MING@example.org', replaced_at: '2026-10-02T20:05:00Z' };
    orderMock.mockResolvedValue({ data: [...ROWS, replaced], error: null });
    answersOrderMock.mockResolvedValue({ data: [{ ...ANSWERS[0], id: 'a0', signup_id: '0', kind: 'thu', answer: '第一次报名的分享' }], error: null });
    signIn();
    render(<LeaderPage packId={PACK_ID} />);
    const table = await screen.findByTestId('leader-table');
    expect(screen.getByTestId('leader-count')).toHaveTextContent(countLine(2));
    expect(within(table).getAllByTestId('leader-row')).toHaveLength(2);
    expect(table).not.toHaveTextContent('first try');
    expect(screen.getByTestId('leader-answered')).toHaveTextContent(answeredLine(1, 2));
    expect(screen.getByTestId('leader-feedback')).toHaveTextContent('第一次报名的分享');
    expect(screen.getByTestId('leader-feedback')).toHaveTextContent('小明');
  });

  it('shows 承诺 Commitments (who chose what, counts per area) and 反馈 Shared feedback (answer cards with kind, counts)', async () => {
    signIn();
    render(<LeaderPage packId={PACK_ID} />);
    const commitments = await screen.findByTestId('leader-commitments');
    expect(commitments).toHaveTextContent(LD_COMMITMENTS);
    expect(screen.getByTestId('leader-area-counts')).toHaveTextContent(areaCountLine('健康 Health', 1));
    expect(screen.getByTestId('leader-area-counts')).toHaveTextContent(areaCountLine('工作 Work', 1));
    expect(screen.getByTestId('leader-area-counts')).toHaveTextContent(areaCountLine('金钱 Money', 1));   // every chosen practice counts
    const rows = within(commitments).getAllByTestId('leader-commitment');
    expect(rows[0]).toHaveTextContent('睡前程序 · Wind-down');
    const ann = within(rows[1]).getAllByTestId('leader-practice').map(p => p.textContent);   // every practice keeps its own text
    expect(ann).toEqual(['工作 Work — 写下忧虑', '家庭 Family — 一起吃饭 · Eat together', '金钱 Money — 记账 · Track spending']);
    expect(within(rows[1]).getByTestId('leader-own-version')).toHaveTextContent('我的版本 · My own version：写下来 · Write it');
    const feedback = screen.getByTestId('leader-feedback');
    expect(feedback).toHaveTextContent(LD_FEEDBACK);
    expect(screen.getByTestId('leader-answered')).toHaveTextContent(answeredLine(1, 2));
    const cards = within(feedback).getAllByTestId('leader-answer');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('data-kind', 'tue');
    expect(within(cards[0]).getByTestId('leader-answer-name')).toHaveTextContent('小明');
    expect(within(cards[0]).getByTestId('leader-answer-kind')).toHaveTextContent(CK_KIND_LABEL.tue);
    expect(within(cards[0]).getByTestId('leader-answer-text')).toHaveTextContent('做了两晚 · Two nights');
    expect(within(cards[0]).getByText(compactTime(ANSWERS[0].created_at))).toHaveAttribute('title', fullTime(ANSWERS[0].created_at));
    expect(answersEqMock.mock.calls).toEqual([['pack_id', PACK_ID], ['leader_id', LEADER_ID]]);
  });

  it('shared feedback comes first: gold count badge, newest answer first, before the sign-up table', async () => {
    answersOrderMock.mockResolvedValue({ data: [
      ANSWERS[0],
      { id: 'a2', signup_id: '2', leader_id: LEADER_ID, kind: 'weekend', answer: '周末一起吃饭了', created_at: '2026-10-08T02:00:00Z' },
    ], error: null });
    signIn();
    render(<LeaderPage packId={PACK_ID} />);
    const table = await screen.findByTestId('leader-table');
    const feedback = screen.getByTestId('leader-feedback');
    expect(feedback.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('leader-feedback-count')).toHaveTextContent('2');
    const cards = within(feedback).getAllByTestId('leader-answer');
    expect(cards.map(c => c.getAttribute('data-kind'))).toEqual(['weekend', 'tue']);   // newest first
    expect(within(cards[0]).getByTestId('leader-answer-name')).toHaveTextContent('Ann');
  });

  it('the sign-up table: header row with Chinese over English, an empty phone as "—", compact time with the full one as a tooltip', async () => {
    signIn();
    render(<LeaderPage packId={PACK_ID} />);
    const table = await screen.findByTestId('leader-table');
    const head = within(table).getByTestId('leader-table-head');
    const name = within(head).getAllByRole('columnheader')[0];
    expect(name.textContent).toBe(LD_COL_NAME.replace(' ', ''));   // 姓名 on one line, Name on the next
    expect(within(head).getAllByRole('columnheader')).toHaveLength(5);
    const rows = within(table).getAllByTestId('leader-row');
    expect(within(rows[1]).getByTestId('leader-phone')).toHaveTextContent(LD_EMPTY_CELL);
    const time = within(rows[0]).getByTestId('leader-time');
    expect(time).toHaveTextContent(compactTime(ROWS[0].created_at));
    expect(time).toHaveAttribute('title', fullTime(ROWS[0].created_at));
    expect(time).toHaveAttribute('dateTime', ROWS[0].created_at);
  });

  it('a member who said No to check-ins gets no Stop link — there are no emails to stop', async () => {
    signIn();
    render(<LeaderPage packId={PACK_ID} />);
    const rows = within(await screen.findByTestId('leader-table')).getAllByTestId('leader-row');
    const byName = (name: string) => rows.find(r => r.textContent?.includes(name))!;
    expect(within(byName('Ann')).queryByTestId('leader-stop')).toBeNull();   // consent_checkins: false
    expect(within(byName('Ann')).queryByTestId('leader-subscription')).toBeNull();
    const consenting = rows.find(r => within(r).queryByTestId('leader-stop'));
    expect(consenting).toBeDefined();
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

  it('each live roster row that receives check-ins carries its Stop/Unsubscribed cell, and the study has the pause switch (ADR-0009)', async () => {
    signIn();
    orderMock.mockResolvedValue({ data: [ROWS[0], { ...ROWS[1], consent_checkins: true, unsubscribed_at: '2026-10-03T00:00:00Z', unsubscribed_by: 'member' }], error: null });
    render(<LeaderPage packId={PACK_ID} />);
    const rows = within(await screen.findByTestId('leader-table')).getAllByTestId('leader-row');
    expect(within(rows[0]).getByRole('button', { name: LD_STOP })).toBeInTheDocument();
    expect(within(rows[1]).getByTestId('leader-unsubscribed-by')).toHaveTextContent(LD_BY_MEMBER);
    expect(within(rows[1]).queryByRole('button', { name: LD_RESUME })).toBeNull();
    expect(screen.getByRole('switch', { name: LD_PAUSE })).toBeInTheDocument();
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

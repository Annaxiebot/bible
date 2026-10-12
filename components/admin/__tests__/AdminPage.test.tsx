/**
 * AdminPage.test.tsx — #/admin: gating, tabs, leaders table, search, feedback, stats · 管理后台测试 (ADR-0023)
 *
 * services/supabase is mocked: a session (uid or none) and a client whose
 * rpc() answers like database/admin-portal-schema.sql — is_site_admin() is
 * true only for the admin uid, and every admin_* function raises AD403 for
 * anyone else (the mock keeps the database's guard, so the page cannot pass
 * by skipping a check).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import {
  IS_SITE_ADMIN_FN, ADMIN_LEADERS_FN, ADMIN_FEEDBACK_FN, ADMIN_STATS_FN, ADMIN_DENIED_CODE, ADMIN_DATA_FNS,
} from '../adminRules';
import {
  AD_TITLE, AD_DENIED, AD_ERR_CHECK, AD_ERR_LOAD, AD_SEARCH, AD_SEARCH_NONE, AD_REPLY_TO, AD_NO_NAME, ownerOnlyLine,
} from '../adminStrings';
import { localDateTime } from '../../leader/leaderTime';
import { LD_EMPTY_CELL } from '../../leader/leaderStrings';
import { FEEDBACK_SOURCE_LABELS, FEEDBACK_SOURCE_UNKNOWN } from '../../../supabase/functions/_shared/feedback';
import { ADMIN_LEADERS, ADMIN_FEEDBACK, ADMIN_STATS, OWNER_EMAIL } from './adminFixtures';

const ADMIN_UID = 'uid-admin';
let uid: string | null = ADMIN_UID;
let failCheck: string | null = null;
let databaseRefuses = false;
let replies: Record<string, unknown> = {};
const rpcMock = vi.fn(async (fn: string) => {
  if (fn === IS_SITE_ADMIN_FN) return failCheck ? { data: null, error: { message: failCheck } } : { data: uid === ADMIN_UID, error: null };
  if (uid !== ADMIN_UID || databaseRefuses) return { data: null, error: { code: ADMIN_DENIED_CODE, message: 'site admins only' } };
  return fn in replies ? { data: replies[fn], error: null } : { data: null, error: { message: `unknown ${fn}` } };
});
const authState = () => ({ user: uid ? { id: uid, email: OWNER_EMAIL } : null, session: null, isAuthenticated: !!uid, isLoading: false });
vi.mock('../../../services/supabase', () => ({
  supabase: { rpc: (fn: string) => rpcMock(fn) },
  isSupabaseConfigured: () => true,
  authManager: {
    getState: () => authState(),
    subscribe: (l: (s: unknown) => void) => { l(authState()); return () => undefined; },
    getFullName: () => null,
  },
}));

import AdminPage from '../AdminPage';

beforeEach(() => {
  uid = ADMIN_UID;
  failCheck = null;
  databaseRefuses = false;
  replies = { [ADMIN_LEADERS_FN]: ADMIN_LEADERS, [ADMIN_FEEDBACK_FN]: ADMIN_FEEDBACK, [ADMIN_STATS_FN]: ADMIN_STATS };
  rpcMock.mockClear();
});

const calledFns = () => rpcMock.mock.calls.map(c => c[0]);

describe('AdminPage — who sees what', () => {
  it('signed out: Admins only, no request at all', async () => {
    uid = null;
    render(<AdminPage />);
    expect(screen.getByTestId('admin-denied')).toHaveTextContent(AD_DENIED);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(AD_TITLE);
    expect(calledFns()).toEqual([]);
  });

  it('a signed-in non-admin: Admins only, and no data request beyond is_site_admin', async () => {
    uid = 'uid-someone';
    render(<AdminPage />);
    expect(await screen.findByTestId('admin-denied')).toHaveTextContent(AD_DENIED);
    expect(calledFns()).toEqual([IS_SITE_ADMIN_FN]);
    expect(screen.queryByTestId('admin-owner-line')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('a failed admin check is shown (R5), no data read', async () => {
    failCheck = 'Could not find the function public.is_site_admin';
    render(<AdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(`${AD_ERR_CHECK}: ${IS_SITE_ADMIN_FN}: ${failCheck}`);
    expect(calledFns()).toEqual([IS_SITE_ADMIN_FN]);
  });

  it('the database refuses the data (AD403) even after a yes: Admins only, no tables', async () => {
    databaseRefuses = true;
    render(<AdminPage />);
    expect(await screen.findByTestId('admin-denied')).toHaveTextContent(AD_DENIED);
    expect(screen.queryByTestId('admin-leaders')).toBeNull();
  });

  it('a malformed stats reply is shown', async () => {
    replies[ADMIN_STATS_FN] = { packs: 1 };
    render(<AdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(`${AD_ERR_LOAD}: ${ADMIN_STATS_FN}: unexpected reply`);
  });

  it('a malformed admin reply is shown, never an empty list', async () => {
    replies[ADMIN_LEADERS_FN] = [{ id: 'x' }];
    render(<AdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(`${AD_ERR_LOAD}: ${ADMIN_LEADERS_FN}: unexpected row`);
  });

  it('the admin: the owner line with the email, three tabs, Leaders by default; reads each admin function once', async () => {
    render(<AdminPage />);
    expect(await screen.findByTestId('admin-owner-line')).toHaveTextContent(ownerOnlyLine(OWNER_EMAIL));
    expect(await screen.findByTestId('admin-leaders')).toBeInTheDocument();
    expect(screen.getByTestId('admin-tab-leaders')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('admin-tab-feedback-count')).toHaveTextContent(String(ADMIN_FEEDBACK.length));
    expect(calledFns().sort()).toEqual([IS_SITE_ADMIN_FN, ...ADMIN_DATA_FNS].sort());
  });
});

describe('AdminPage — the tabs', () => {
  it('Leaders: totals, newest joined first, date + time local with the ISO tooltip, gold badge for shared > 0', async () => {
    render(<AdminPage />);
    const rows = await screen.findAllByTestId('admin-leader-row');
    expect(rows).toHaveLength(ADMIN_LEADERS.length);
    expect(rows[0]).toHaveTextContent('Peter Zhao');   // joined last
    expect(rows[rows.length - 1]).toHaveTextContent('Anna Xie');
    const anna = ADMIN_LEADERS[0];
    const joined = within(rows[rows.length - 1]).getByTestId('admin-joined');
    expect(joined).toHaveTextContent(localDateTime(anna.created_at));
    expect(joined.textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(joined).toHaveAttribute('title', anna.created_at);
    const unnamed = rows.find(r => r.textContent?.includes(AD_NO_NAME))!;
    expect(within(unnamed).getByTestId('admin-last')).toHaveTextContent(LD_EMPTY_CELL);   // never signed in again
    const ruth = rows.find(r => r.textContent?.includes('Ruth Lee'))!;
    expect(within(ruth).getByTestId('admin-shared')).toHaveClass('bg-stl-gold');
    expect(within(rows[0]).getByTestId('admin-shared')).not.toHaveClass('bg-stl-gold');
    // Phones: leaderTable.css turns each row into a card labelled from data-label.
    expect(screen.getByTestId('admin-leaders-table')).toHaveClass('ld-table');
    for (const td of rows[0].querySelectorAll('td')) expect(td.getAttribute('data-label')).toBeTruthy();
    expect(screen.getByTestId('admin-total-leaders')).toHaveTextContent('9');
    expect(screen.getByTestId('admin-total-signups')).toHaveTextContent(String(ADMIN_LEADERS.reduce((n, l) => n + l.signups, 0)));
    expect(screen.getByTestId('admin-total-askAi')).toHaveTextContent('7');
  });

  it('Leaders: search by name or email (shared search box from 8 rows); no match says so', async () => {
    render(<AdminPage />);
    const box = await screen.findByRole('searchbox', { name: AD_SEARCH });
    fireEvent.change(box, { target: { value: '王' } });
    expect(screen.getAllByTestId('admin-leader-row')).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'LEADER3@' } });
    expect(screen.getAllByTestId('admin-leader-row')[0]).toHaveTextContent('Paul Kim');
    fireEvent.change(box, { target: { value: 'nobody' } });
    expect(screen.queryByTestId('admin-leaders-table')).toBeNull();
    expect(screen.getByText(AD_SEARCH_NONE)).toBeInTheDocument();
  });

  it('Feedback: cards newest first, source label, reply-to mailto only when given', async () => {
    render(<AdminPage />);
    fireEvent.click(await screen.findByTestId('admin-tab-feedback'));
    expect(screen.getByTestId('admin-tab-feedback')).toHaveAttribute('aria-selected', 'true');
    const cards = screen.getAllByTestId('admin-feedback-card');
    expect(cards[0]).toHaveTextContent('Font too small');
    expect(within(cards[0]).getByTestId('admin-feedback-source')).toHaveTextContent(FEEDBACK_SOURCE_LABELS.tv);
    expect(cards[0]).toHaveTextContent('local-2026-10-09-jhn3');
    expect(cards[0]).toHaveTextContent(AD_REPLY_TO);
    expect(within(cards[0]).getByTestId('admin-feedback-reply')).toHaveAttribute('href', 'mailto:member@example.org');
    expect(within(cards[1]).getByTestId('admin-feedback-source')).toHaveTextContent(FEEDBACK_SOURCE_UNKNOWN);
    expect(within(cards[1]).queryByTestId('admin-feedback-reply')).toBeNull();
  });

  it('Stats: the site totals plus accounts and active leaders this month', async () => {
    render(<AdminPage />);
    fireEvent.click(await screen.findByTestId('admin-tab-stats'));
    expect(screen.getByTestId('admin-stat-packs')).toHaveTextContent('12');
    expect(screen.getByTestId('admin-stat-checkins_shared')).toHaveTextContent('9');
    expect(screen.getByTestId('admin-stat-accounts')).toHaveTextContent('9');
    expect(screen.getByTestId('admin-stat-active_leaders')).toHaveTextContent('3');
  });
});

/**
 * AdminFunnel.test.tsx — the funnel on the admin Stats tab · 管理后台漏斗测试 (ADR-0025)
 *
 * The reply is parsed strictly (an unknown event or a bad count throws and
 * is shown, never an empty funnel); the rows become the window's seven steps
 * (sign-ins split Google / email, outcomes with their median wait) and one
 * table row per day, newest first; the read asks for FUNNEL_DAYS days; a
 * refusal (AD403), a failure (e.g. the SQL not applied yet) and no counts
 * are one line each. services/supabase is mocked; its rpc() answers like
 * database/funnel-schema.sql.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ADMIN_FUNNEL_FN, FUNNEL_DAYS, FUNNEL_REPEAT_MINUTES } from '../../stats/funnelRules';
import { ADMIN_DENIED_CODE } from '../adminRules';
import {
  AD_FUNNEL_TITLE, AD_FUNNEL_NONE, AD_FUNNEL_ERR, AD_FUNNEL_STEPS, AD_DENIED, AD_FUNNEL_COL_WAIT,
  funnelNote, funnelMethods, funnelMedianWait,
} from '../adminStrings';
import { LD_EMPTY_CELL } from '../../leader/leaderStrings';
import { ADMIN_FUNNEL } from './adminFixtures';

let reply: { data: unknown; error: { code?: string; message: string } | null } = { data: ADMIN_FUNNEL, error: null };
const rpcMock = vi.fn(async (_fn: string, _args?: unknown) => reply);
vi.mock('../../../services/supabase', () => ({
  supabase: { rpc: (fn: string, args?: unknown) => rpcMock(fn, args) },
  isSupabaseConfigured: () => true,
}));

import { AdminFunnel } from '../AdminFunnel';
import { parseAdminFunnel, funnelTable } from '../adminFunnelData';

beforeEach(() => {
  reply = { data: ADMIN_FUNNEL, error: null };
  rpcMock.mockClear();
});

describe('parseAdminFunnel / funnelTable', () => {
  it('window totals and one entry per day with counts, newest first; missing events are 0 with no median', () => {
    const table = funnelTable(parseAdminFunnel(ADMIN_FUNNEL));
    expect(table.days.map(d => d.day)).toEqual(['2026-10-23', '2026-10-22']);
    expect(table.totals.new_study_opened).toEqual({ count: 8, median: null });
    expect(table.totals.pack_ok).toEqual({ count: 1, median: 80 });
    expect(table.days[0].cells.pack_ok).toEqual({ count: 0, median: null });
    expect(table.days[1].cells.signin_done_google.count).toBe(2);
  });

  it('a malformed reply throws (unknown event, negative count, bad day, not a list)', () => {
    const row = { day: '2026-10-23', event: 'pack_ok', count: 1, median_wait_seconds: 9 };
    expect(parseAdminFunnel([row])).toHaveLength(1);
    expect(() => parseAdminFunnel([{ ...row, event: 'pack_maybe' }])).toThrow(`${ADMIN_FUNNEL_FN}: unexpected row`);
    expect(() => parseAdminFunnel([{ ...row, count: -1 }])).toThrow(/unexpected row/);
    expect(() => parseAdminFunnel([{ ...row, day: 'yesterday' }])).toThrow(/unexpected row/);
    expect(() => parseAdminFunnel([{ ...row, median_wait_seconds: 1.5 }])).toThrow(/unexpected row/);
    expect(() => parseAdminFunnel({ rows: [] })).toThrow(`${ADMIN_FUNNEL_FN}: unexpected reply`);
  });
});

describe('AdminFunnel', () => {
  it('asks for the window, then shows the seven steps and the daily table', async () => {
    render(<AdminFunnel />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(AD_FUNNEL_TITLE);
    expect(screen.getByText(funnelNote(FUNNEL_DAYS, FUNNEL_REPEAT_MINUTES))).toBeInTheDocument();
    const rows = await screen.findAllByTestId('admin-funnel-day');
    expect(rpcMock).toHaveBeenCalledWith(ADMIN_FUNNEL_FN, { p_days: FUNNEL_DAYS });

    const step = (key: string) => screen.getByTestId(`admin-funnel-step-${key}`);
    expect(step('opened')).toHaveTextContent(`8${AD_FUNNEL_STEPS.opened}`);
    expect(step('signin-started')).toHaveTextContent(`5${AD_FUNNEL_STEPS.signinStarted}${funnelMethods(2, 3)}`);
    expect(step('signin-done')).toHaveTextContent(`3${AD_FUNNEL_STEPS.signinDone}${funnelMethods(2, 1)}`);
    expect(step('generate')).toHaveTextContent(`3${AD_FUNNEL_STEPS.generate}`);
    expect(step('ok')).toHaveTextContent(`1${AD_FUNNEL_STEPS.ok}${funnelMedianWait(80)}`);
    expect(step('failed')).toHaveTextContent(funnelMedianWait(15));
    expect(step('abandoned')).toHaveTextContent(funnelMedianWait(40));
    expect(funnelMedianWait(80)).toBe('中位等待 80 秒 · median wait 80 s');   // Chinese first

    expect(rows[0]).toHaveTextContent('2026-10-23');
    const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map(c => c.textContent);
    expect(cells(rows[0])).toEqual(['2026-10-23', '3', '0 / 2', '0 / 1', '1', '0', '1', '0', LD_EMPTY_CELL]);
    expect(cells(rows[1])).toEqual(['2026-10-22', '5', '2 / 1', '2 / 0', '2', '1', '0', '1', '80']);
    // Phones: stacked cards labelled from data-label (leaderTable.css).
    expect(screen.getByTestId('admin-funnel-table')).toHaveClass('ld-table');
    expect(within(rows[1]).getAllByRole('cell').at(-1)).toHaveAttribute('data-label', AD_FUNNEL_COL_WAIT);
  });

  it('no counts yet: one quiet line, no table', async () => {
    reply = { data: [], error: null };
    render(<AdminFunnel />);
    expect(await screen.findByText(AD_FUNNEL_NONE)).toBeInTheDocument();
    expect(screen.queryByTestId('admin-funnel-table')).toBeNull();
  });

  it('a failure (e.g. the SQL not applied yet) is an alert naming the function', async () => {
    reply = { data: null, error: { message: 'Could not find the function public.admin_funnel(p_days)' } };
    render(<AdminFunnel />);
    expect(await screen.findByRole('alert')).toHaveTextContent(`${AD_FUNNEL_ERR}: ${ADMIN_FUNNEL_FN}: Could not find the function`);
  });

  it('the database refuses (AD403): Admins only, no numbers', async () => {
    reply = { data: null, error: { code: ADMIN_DENIED_CODE, message: 'site admins only' } };
    render(<AdminFunnel />);
    expect(await screen.findByText(AD_DENIED)).toBeInTheDocument();
    expect(screen.queryByTestId('admin-funnel-step-opened')).toBeNull();
  });
});

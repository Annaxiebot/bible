/**
 * adminFunnelData.ts — the New-study funnel for the admin portal · 管理后台漏斗数据 (ADR-0025)
 *
 * (Not "adminFunnel.ts": on a case-insensitive disk that name shadows the
 * AdminFunnel.tsx view in './AdminFunnel' imports.)
 *
 * useAdminFunnel(): one admin_funnel(p_days) read when the Stats tab opens,
 * with its own loading and failure states — so a missing function (the SQL
 * not applied yet) never blanks the rest of the portal. The database decides
 * who may read it (AD403 → 'denied', as for every admin_* function).
 * parseAdminFunnel is strict (a malformed reply throws and is shown, R5);
 * funnelTable shapes the rows into the window's totals and one line per day,
 * newest first. Nothing is cached or stored (ADR-0023 privacy).
 */
import { useEffect, useState } from 'react';
import { getSignupClient } from '../signup/signupClient';
import { ADMIN_FUNNEL_FN, FUNNEL_DAYS, FUNNEL_EVENTS, isFunnelEvent, type FunnelEvent } from '../stats/funnelRules';
import { callRpc, AdminDeniedError, NOT_CONFIGURED } from './adminData';
import { parseList, isCount } from './adminParse';

/** One admin_funnel() row: day NULL = the whole window. */
export interface FunnelRow { day: string | null; event: FunnelEvent; count: number; median_wait_seconds: number | null }
export interface FunnelCell { count: number; median: number | null }
export type FunnelCells = Record<FunnelEvent, FunnelCell>;
export interface FunnelTable { totals: FunnelCells; days: Array<{ day: string; cells: FunnelCells }> }

export type AdminFunnelState =
  | { status: 'loading' } | { status: 'denied' }
  | { status: 'ready'; table: FunnelTable } | { status: 'failed'; message: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDayOrNull = (v: unknown): v is string | null => v === null || (typeof v === 'string' && ISO_DAY.test(v));
const isCountOrNull = (v: unknown): v is number | null => v === null || isCount(v);

function parseRow(value: unknown): FunnelRow | null {
  if (typeof value !== 'object' || value === null) return null;
  const { day, event, count, median_wait_seconds: median } = value as Record<string, unknown>;
  if (!isDayOrNull(day) || !isFunnelEvent(event) || !isCount(count) || !isCountOrNull(median)) return null;
  return { day, event, count, median_wait_seconds: median };
}

/** admin_funnel() rows; throws on any malformed row or an unknown event. */
export function parseAdminFunnel(value: unknown): FunnelRow[] {
  return parseList(value, parseRow, ADMIN_FUNNEL_FN);
}

const emptyCells = (): FunnelCells =>
  Object.fromEntries(FUNNEL_EVENTS.map(e => [e, { count: 0, median: null }])) as FunnelCells;

/** The window's totals (day NULL rows) and each day that has a count, newest first; missing events are 0. */
export function funnelTable(rows: readonly FunnelRow[]): FunnelTable {
  const totals = emptyCells();
  const byDay = new Map<string, FunnelCells>();
  for (const row of rows) {
    const cell = { count: row.count, median: row.median_wait_seconds };
    if (row.day === null) { totals[row.event] = cell; continue; }
    const cells = byDay.get(row.day) ?? emptyCells();
    cells[row.event] = cell;
    byDay.set(row.day, cells);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, cells]) => ({ day, cells }));
  return { totals, days };
}

/** The funnel of the last `days` days; mount it only for a confirmed admin (the Stats tab). */
export function useAdminFunnel(days = FUNNEL_DAYS): AdminFunnelState {
  const [state, setState] = useState<AdminFunnelState>({ status: 'loading' });
  useEffect(() => {
    const client = getSignupClient();
    if (!client) { setState({ status: 'failed', message: NOT_CONFIGURED }); return; }
    let cancelled = false;
    callRpc(client, ADMIN_FUNNEL_FN, { p_days: days })
      .then(reply => { if (!cancelled) setState({ status: 'ready', table: funnelTable(parseAdminFunnel(reply)) }); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof AdminDeniedError
          ? { status: 'denied' }
          : { status: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [days]);
  return state;
}

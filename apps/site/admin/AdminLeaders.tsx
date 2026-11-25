/**
 * AdminLeaders.tsx — "带领者 Leaders" tab of #/admin · 带领者列表 (ADR-0023)
 *
 * A totals row (Figures), the shared search box from LIST_SEARCH_FROM
 * leaders (name or email, ListSearch), then one table in the sign-up table's
 * style (LeaderSignupTable: shaded two-line headers, row lines + zebra;
 * phones get stacked cards via leaderTable.css). Newest joined first (the
 * SQL's order, re-sorted here so the page never depends on it). Joined and
 * last sign-in are "2026-10-09 15:12" local, the ISO time as the tooltip.
 * Shared > 0 is the leader home's gold badge.
 */
import React, { useState } from 'react';
import type { AdminLeader } from './adminRules';
import { leaderSearchText, leaderTotals } from './adminRules';
import {
  AD_SEARCH, AD_SEARCH_NONE, AD_NO_LEADERS, AD_COL_JOINED, AD_COL_LAST, AD_COL_STUDIES, AD_COL_SIGNUPS,
  AD_COL_SHARED, AD_COL_ASK, AD_NO_NAME, AD_TOTALS,
} from './adminStrings';
import { LD_COL_NAME, LD_COL_EMAIL, LD_EMPTY_CELL } from '../leader/leaderStrings';
import { Header } from '../leader/LeaderSignupTable';
import { sharedBadgeClass } from '../leader/LeaderPackRow';
import { localDateTime } from '../leader/leaderTime';
import { LIST_SEARCH_FROM, filterByQuery, ListSearchBox } from '../shared/ListSearch';
import { Figures } from '../shared/Figures';
import { textStyle } from '../newstudy/newStudyStyles';
import '../leader/leaderTable.css';

const cell = 'px-4 py-3 text-left align-top';
const nowrap = `${cell} whitespace-nowrap`;
/** The four counts: narrow columns. */
const countCell = 'px-3 py-3 text-left align-top whitespace-nowrap';
const COLUMNS = [LD_COL_NAME, LD_COL_EMAIL, AD_COL_JOINED, AD_COL_LAST, AD_COL_STUDIES, AD_COL_SIGNUPS, AD_COL_SHARED, AD_COL_ASK];

/** Newest joined first. */
export function newestJoinedFirst(leaders: readonly AdminLeader[]): AdminLeader[] {
  return [...leaders].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const When: React.FC<{ iso: string | null; testId: string }> = ({ iso, testId }) =>
  iso ? <time data-testid={testId} dateTime={iso} title={iso}>{localDateTime(iso)}</time> : <span data-testid={testId}>{LD_EMPTY_CELL}</span>;

const Row: React.FC<{ leader: AdminLeader }> = ({ leader }) => (
  <tr data-testid="admin-leader-row" className="border-t border-stl-border text-stl-text even:bg-stl-surface">
    <td className={`${cell} ld-name min-w-[6em] font-semibold`} data-label={LD_COL_NAME}>{leader.full_name ?? AD_NO_NAME}</td>
    <td className={`${cell} min-w-[9em] [overflow-wrap:anywhere]`} data-label={LD_COL_EMAIL}>{leader.email ?? LD_EMPTY_CELL}</td>
    <td className={nowrap} data-label={AD_COL_JOINED}><When iso={leader.created_at} testId="admin-joined" /></td>
    <td className={nowrap} data-label={AD_COL_LAST}><When iso={leader.last_sign_in_at} testId="admin-last" /></td>
    <td className={countCell} data-label={AD_COL_STUDIES}>{leader.studies}</td>
    <td className={countCell} data-label={AD_COL_SIGNUPS}>{leader.signups}</td>
    <td className={countCell} data-label={AD_COL_SHARED}>
      {leader.shared > 0
        ? <span data-testid="admin-shared" data-has-shared="true" className={sharedBadgeClass}>{leader.shared}</span>
        : <span data-testid="admin-shared" data-has-shared="false">0</span>}
    </td>
    <td className={countCell} data-label={AD_COL_ASK}>{leader.ask_ai_month}</td>
  </tr>
);

const LeadersTable: React.FC<{ leaders: readonly AdminLeader[] }> = ({ leaders }) => (
  // overflow-x-auto: a safety net on mid-size screens; phones get stacked cards (leaderTable.css).
  <div className="ld-table-wrap overflow-x-auto rounded-xl border border-stl-border">
    <table data-testid="admin-leaders-table" className="ld-table w-full border-collapse" style={textStyle}>
      <thead className="bg-stl-surface-2"><tr>{COLUMNS.map(c => <Header key={c} label={c} />)}</tr></thead>
      <tbody>{leaders.map(l => <Row key={l.id} leader={l} />)}</tbody>
    </table>
  </div>
);

export const AdminLeaders: React.FC<{ leaders: readonly AdminLeader[] }> = ({ leaders }) => {
  const [query, setQuery] = useState('');
  const totals = leaderTotals(leaders);
  const shown = filterByQuery(newestJoinedFirst(leaders), query, leaderSearchText);
  return (
    <section data-testid="admin-leaders" className="flex flex-col gap-4">
      <Figures items={AD_TOTALS.map(t => ({ ...t, value: totals[t.key] }))} testIdPrefix="admin-total-" />
      {leaders.length >= LIST_SEARCH_FROM && <ListSearchBox value={query} onChange={setQuery} label={AD_SEARCH} testId="admin-search" />}
      {leaders.length === 0 && <p className="text-stl-text-2" style={textStyle}>{AD_NO_LEADERS}</p>}
      {leaders.length > 0 && shown.length === 0 && <p className="text-stl-text-2" style={textStyle}>{AD_SEARCH_NONE}</p>}
      {shown.length > 0 && <LeadersTable leaders={shown} />}
    </section>
  );
};

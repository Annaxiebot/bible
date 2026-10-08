/**
 * LeaderSignupTable.tsx — the pack's sign-ups as a table that reads as one · 报名名单表
 *
 * Owner (2026-10-07): the old list did not look like a table — bilingual
 * headers wrapped, Stop buttons were big boxes, times wrapped. Now: a
 * shaded header row (Chinese label, English on a smaller line beneath, so
 * each header is two short lines by design instead of a ragged wrap), row
 * separators + zebra, phone and time never wrap, email (≥ 11em wide) breaks anywhere,
 * an empty phone or email shows "—", the time is "10/6 15:12" with the full
 * timestamp as a tooltip, and Stop emails is a quiet text button (≥ 48px
 * tall hit area, LeaderOptOut). Phones (≤ 640px, leaderTable.css): each row
 * becomes a stacked card with the column label beside each value — no
 * sideways scrolling for seniors, and every field stays visible.
 */
import React from 'react';
import type { SignupRecord } from './leaderData';
import { SubscriptionCell } from './LeaderOptOut';
import { splitLabel } from '../studypack/principles';
import { compactTime, fullTime } from './leaderTime';
import {
  LD_COL_NAME, LD_COL_PHONE, LD_COL_EMAIL, LD_COL_CONSENT, LD_COL_TIME, LD_YES, LD_NO, LD_EMPTY_CELL,
} from './leaderStrings';
import { textStyle } from '../newstudy/newStudyStyles';
import './leaderTable.css';

/** The English half of a header: a smaller line under the Chinese. */
const subLabelStyle: React.CSSProperties = { fontSize: Number(textStyle.fontSize) * 0.8, lineHeight: 1.3 };

const cell = 'px-4 py-3 text-left align-top';
const nowrap = `${cell} whitespace-nowrap`;

const Header: React.FC<{ label: string }> = ({ label }) => {
  const { zh, en } = splitLabel(label);
  return (
    <th scope="col" className={`${nowrap} font-semibold`}>
      <span className="block text-stl-text">{zh}</span>
      <span className="block font-normal text-stl-text-2" style={subLabelStyle}>{en}</span>
    </th>
  );
};

const Row: React.FC<{ row: SignupRecord }> = ({ row }) => (
  <tr data-testid="leader-row" className="border-t border-stl-border text-stl-text even:bg-stl-surface">
    <td className={`${cell} ld-name min-w-[5em] font-semibold`} data-label={LD_COL_NAME}>{row.name}</td>
    <td className={nowrap} data-label={LD_COL_PHONE} data-testid="leader-phone">{row.phone || LD_EMPTY_CELL}</td>
    <td className={`${cell} min-w-[11em] [overflow-wrap:anywhere]`} data-label={LD_COL_EMAIL}>{row.email || LD_EMPTY_CELL}</td>
    <td className={`${cell} min-w-[9em]`} data-label={LD_COL_CONSENT}>
      <span className="ld-consent flex flex-wrap items-center gap-x-3">
        <span>{row.consent_checkins ? LD_YES : LD_NO}</span>
        {/* No check-ins were asked for, so there are no emails to stop: no Stop link (owner). */}
        {row.consent_checkins && <SubscriptionCell row={row} />}
      </span>
    </td>
    <td className={nowrap} data-label={LD_COL_TIME}>
      <time data-testid="leader-time" dateTime={row.created_at} title={fullTime(row.created_at)}>{compactTime(row.created_at)}</time>
    </td>
  </tr>
);

export const SignupTable: React.FC<{ rows: SignupRecord[] }> = ({ rows }) => (
  <div className="ld-table-wrap overflow-hidden rounded-xl border border-stl-border">
    <table data-testid="leader-table" className="ld-table w-full border-collapse" style={textStyle}>
      <thead data-testid="leader-table-head" className="bg-stl-surface-2">
        <tr>
          <Header label={LD_COL_NAME} /><Header label={LD_COL_PHONE} /><Header label={LD_COL_EMAIL} />
          <Header label={LD_COL_CONSENT} /><Header label={LD_COL_TIME} />
        </tr>
      </thead>
      <tbody>
        {rows.map(r => <Row key={r.id} row={r} />)}
      </tbody>
    </table>
  </div>
);

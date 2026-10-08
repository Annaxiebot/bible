/**
 * LeaderSections.tsx — 承诺 Commitments · 组长页区块
 *
 * Who chose which practices (all of them, one line each), with a count per
 * area. Reads the rows the page already fetched (leaderData); nothing here
 * queries. Shared feedback lives in LeaderFeedback. This is next Friday's
 * material for the closing question (ADR-0004 §7).
 */
import React from 'react';
import { SignupRecord, commitmentCounts } from './leaderData';
import { practiceItems, ownVersionLine } from '../../supabase/functions/send-checkins/practices';
import {
  LD_COMMITMENTS, LD_COMMITMENTS_HINT, LD_COL_NAME, LD_COL_PRACTICE, LD_NO_PRACTICE, areaCountLine,
} from './leaderStrings';
import { textStyle, headingStyle } from '../newstudy/newStudyStyles';

const cell = 'py-3 pr-4 text-left align-top';

/** Every chosen practice as "area — text", one line each, then the own version as its own line when written. */
const PracticeList: React.FC<{ row: SignupRecord }> = ({ row }) => {
  const items = practiceItems(row);
  const own = ownVersionLine(row);
  if (items.length === 0 && !own) return <>{LD_NO_PRACTICE}</>;
  return (
    <>
      {items.map((item, i) => (
        <span key={i} data-testid="leader-practice" className="block">
          {item.area ? <span className="text-stl-gold">{item.area} — </span> : null}{item.text}
        </span>
      ))}
      {own && <span data-testid="leader-own-version" className="block">{own}</span>}
    </>
  );
};

export const Commitments: React.FC<{ rows: SignupRecord[] }> = ({ rows }) => (
  <section data-testid="leader-commitments" className="flex flex-col gap-3">
    <h2 className="font-bold text-stl-gold" style={headingStyle}>{LD_COMMITMENTS}</h2>
    <p className="text-stl-text-2" style={textStyle}>{LD_COMMITMENTS_HINT}</p>
    <ul data-testid="leader-area-counts" className="flex flex-wrap gap-x-6 gap-y-1 text-stl-text" style={textStyle}>
      {commitmentCounts(rows).map(c => <li key={c.area}>{areaCountLine(c.area, c.count)}</li>)}
    </ul>
    <table className="w-full border-collapse" style={textStyle}>
      <thead className="text-stl-text-2">
        <tr><th className={cell}>{LD_COL_NAME}</th><th className={cell}>{LD_COL_PRACTICE}</th></tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} data-testid="leader-commitment" className="border-t border-stl-border text-stl-text">
            <td className={cell}>{r.name}</td>
            <td className={cell}><PracticeList row={r} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

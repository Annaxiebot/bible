/**
 * AdminFunnel.tsx — "新建查经漏斗 · New study funnel" on the Stats tab · 新建查经漏斗 (ADR-0025)
 *
 * The last FUNNEL_DAYS days of anonymous counts: first the window as seven
 * steps (opened → sign-in started → finished, each split Google / email →
 * Generate pressed → generated / failed / abandoned, each outcome with its
 * median wait), then one table row per day that has a count, newest first,
 * in the leaders table's style (stacked cards on phones). Loading, refusal
 * and failure are one line each (failure as an alert, R5); the rest of the
 * Stats tab never depends on it.
 */
import React from 'react';
import { useAdminFunnel, type FunnelCells, type FunnelTable } from './adminFunnelData';
import {
  AD_FUNNEL_TITLE, AD_FUNNEL_NONE, AD_FUNNEL_ERR, AD_FUNNEL_STEPS, AD_LOADING, AD_DENIED,
  AD_FUNNEL_COL_DAY, AD_FUNNEL_COL_OPENED, AD_FUNNEL_COL_SIGNIN_STARTED, AD_FUNNEL_COL_SIGNIN_DONE,
  AD_FUNNEL_COL_GENERATE, AD_FUNNEL_COL_OK, AD_FUNNEL_COL_FAILED, AD_FUNNEL_COL_ABANDONED, AD_FUNNEL_COL_WAIT,
  funnelNote, funnelMethods, funnelMedianWait,
} from './adminStrings';
import {
  FUNNEL_DAYS, FUNNEL_REPEAT_MINUTES, signInStartedEvent, signInDoneEvent, type FunnelEvent,
} from '../stats/funnelRules';
import { Header } from '../leader/LeaderSignupTable';
import { LD_EMPTY_CELL } from '../leader/leaderStrings';
import { textStyle } from '../newstudy/newStudyStyles';
import '../leader/leaderTable.css';

interface Step { key: string; label: string; count: number; detail: string | null }
type SignInKind = 'started' | 'done';

/** Google and email counts of one sign-in step. */
const byMethod = (c: FunnelCells, kind: SignInKind) => {
  const event = kind === 'started' ? signInStartedEvent : signInDoneEvent;
  return { google: c[event('google')].count, email: c[event('email')].count };
};
const signIns = (c: FunnelCells, kind: SignInKind) => {
  const { google, email } = byMethod(c, kind);
  return { count: google + email, detail: funnelMethods(google, email) };
};
const outcome = (c: FunnelCells, event: FunnelEvent) => {
  const { count, median } = c[event];
  return { count, detail: median === null ? null : funnelMedianWait(median) };
};

/** The window's seven steps, top to bottom. */
export function funnelSteps(t: FunnelCells): Step[] {
  return [
    { key: 'opened', label: AD_FUNNEL_STEPS.opened, count: t.new_study_opened.count, detail: null },
    { key: 'signin-started', label: AD_FUNNEL_STEPS.signinStarted, ...signIns(t, 'started') },
    { key: 'signin-done', label: AD_FUNNEL_STEPS.signinDone, ...signIns(t, 'done') },
    { key: 'generate', label: AD_FUNNEL_STEPS.generate, count: t.generate_pressed.count, detail: null },
    { key: 'ok', label: AD_FUNNEL_STEPS.ok, ...outcome(t, 'pack_ok') },
    { key: 'failed', label: AD_FUNNEL_STEPS.failed, ...outcome(t, 'pack_failed') },
    { key: 'abandoned', label: AD_FUNNEL_STEPS.abandoned, ...outcome(t, 'pack_abandoned') },
  ];
}

const Steps: React.FC<{ totals: FunnelCells }> = ({ totals }) => (
  <ol className="flex flex-col gap-1" style={textStyle}>
    {funnelSteps(totals).map(s => (
      <li key={s.key} data-testid={`admin-funnel-step-${s.key}`} className="flex flex-wrap items-baseline gap-x-3">
        <span className="min-w-[5ch] font-semibold text-stl-gold" data-testid="admin-funnel-count">{s.count.toLocaleString('en-US')}</span>
        <span className="text-stl-text">{s.label}</span>
        {s.detail && <span className="text-stl-text-2">{s.detail}</span>}
      </li>
    ))}
  </ol>
);

const cell = 'px-3 py-3 text-left align-top whitespace-nowrap';
const pair = (c: FunnelCells, kind: SignInKind) => {
  const { google, email } = byMethod(c, kind);
  return `${google} / ${email}`;
};
const COLUMNS: Array<[string, (c: FunnelCells) => string]> = [
  [AD_FUNNEL_COL_OPENED, c => String(c.new_study_opened.count)],
  [AD_FUNNEL_COL_SIGNIN_STARTED, c => pair(c, 'started')],
  [AD_FUNNEL_COL_SIGNIN_DONE, c => pair(c, 'done')],
  [AD_FUNNEL_COL_GENERATE, c => String(c.generate_pressed.count)],
  [AD_FUNNEL_COL_OK, c => String(c.pack_ok.count)],
  [AD_FUNNEL_COL_FAILED, c => String(c.pack_failed.count)],
  [AD_FUNNEL_COL_ABANDONED, c => String(c.pack_abandoned.count)],
  [AD_FUNNEL_COL_WAIT, c => (c.pack_ok.median === null ? LD_EMPTY_CELL : String(c.pack_ok.median))],
];

const Daily: React.FC<{ days: FunnelTable['days'] }> = ({ days }) => (
  <div className="ld-table-wrap overflow-x-auto rounded-xl border border-stl-border">
    <table data-testid="admin-funnel-table" className="ld-table w-full border-collapse" style={textStyle}>
      <thead className="bg-stl-surface-2">
        <tr>{[AD_FUNNEL_COL_DAY, ...COLUMNS.map(c => c[0])].map(label => <Header key={label} label={label} />)}</tr>
      </thead>
      <tbody>
        {days.map(({ day, cells }) => (
          <tr key={day} data-testid="admin-funnel-day" className="border-t border-stl-border text-stl-text even:bg-stl-surface">
            <td className={`${cell} ld-name font-semibold`} data-label={AD_FUNNEL_COL_DAY}>{day}</td>
            {COLUMNS.map(([label, value]) => <td key={label} className={cell} data-label={label}>{value(cells)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const AdminFunnel: React.FC = () => {
  const state = useAdminFunnel();
  return (
    <section data-testid="admin-funnel" className="flex flex-col gap-3">
      <h2 className="font-semibold text-stl-text" style={textStyle}>{AD_FUNNEL_TITLE}</h2>
      <p className="text-stl-text-3" style={textStyle}>{funnelNote(FUNNEL_DAYS, FUNNEL_REPEAT_MINUTES)}</p>
      {state.status === 'loading' && <p className="text-stl-text-2" style={textStyle}>{AD_LOADING}</p>}
      {state.status === 'denied' && <p className="text-stl-text-2" style={textStyle}>{AD_DENIED}</p>}
      {state.status === 'failed' && <p role="alert" className="text-red-300" style={textStyle}>{`${AD_FUNNEL_ERR}: ${state.message}`}</p>}
      {state.status === 'ready' && state.table.days.length === 0 && <p className="text-stl-text-2" style={textStyle}>{AD_FUNNEL_NONE}</p>}
      {state.status === 'ready' && state.table.days.length > 0 && (
        <>
          <Steps totals={state.table.totals} />
          <Daily days={state.table.days} />
        </>
      )}
    </section>
  );
};

/**
 * LeaderSections.tsx — 承诺 Commitments and 反馈 Shared feedback · 组长页区块
 *
 * Commitments: who chose which practice, with a count per area. Feedback:
 * the answers members chose to share, grouped by kind, newest first, with
 * "answered vs signed up" counts. Both read the rows the page already
 * fetched (leaderData); nothing here queries. This is next Friday's
 * material for the closing question (ADR-0004 §7).
 */
import React from 'react';
import type { CheckinKind } from '../checkin/checkinRoute';
import { CHECKIN_KINDS } from '../checkin/checkinRoute';
import { CK_KIND_LABEL } from '../checkin/checkinStrings';
import { SignupRecord, AnswerRecord, commitmentCounts, feedbackCounts, practiceOf } from './leaderData';
import {
  LD_COMMITMENTS, LD_COMMITMENTS_HINT, LD_COL_NAME, LD_COL_PRACTICE, LD_NO_PRACTICE, LD_FEEDBACK, LD_FEEDBACK_NONE,
  answeredLine, areaCountLine,
} from './leaderStrings';
import { textStyle, headingStyle } from '../newstudy/newStudyStyles';

const cell = 'py-3 pr-4 text-left align-top';

export const Commitments: React.FC<{ rows: SignupRecord[] }> = ({ rows }) => (
  <section data-testid="leader-commitments" className="flex flex-col gap-3">
    <h2 className="font-bold text-amber-300" style={headingStyle}>{LD_COMMITMENTS}</h2>
    <p className="text-slate-400" style={textStyle}>{LD_COMMITMENTS_HINT}</p>
    <ul data-testid="leader-area-counts" className="flex flex-wrap gap-x-6 gap-y-1 text-slate-100" style={textStyle}>
      {commitmentCounts(rows).map(c => <li key={c.area}>{areaCountLine(c.area, c.count)}</li>)}
    </ul>
    <table className="w-full border-collapse" style={textStyle}>
      <thead className="text-slate-400">
        <tr><th className={cell}>{LD_COL_NAME}</th><th className={cell}>{LD_COL_PRACTICE}</th></tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} data-testid="leader-commitment" className="border-t border-slate-800 text-slate-100">
            <td className={cell}>{r.name}</td>
            <td className={cell}>
              {r.practice_area ? <span className="text-amber-300">{r.practice_area} — </span> : null}
              {practiceOf(r) || LD_NO_PRACTICE}
              {r.practice2_text ? <span className="block text-slate-400">+ {r.practice2_area}: {r.practice2_text}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

const KindBlock: React.FC<{ kind: CheckinKind; answers: AnswerRecord[]; names: Map<string, string> }> = ({ kind, answers, names }) => (
  <div data-testid={`leader-feedback-${kind}`} className="flex flex-col gap-2">
    <h3 className="font-semibold text-slate-100" style={textStyle}>{CK_KIND_LABEL[kind]}</h3>
    {answers.length === 0 ? <p className="text-slate-500" style={textStyle}>{LD_FEEDBACK_NONE}</p> : (
      <ul className="flex flex-col gap-2">
        {answers.map(a => (
          <li key={a.id} data-testid="leader-answer" className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-slate-100" style={textStyle}>
            <span className="text-amber-300">{names.get(a.signup_id) ?? '?'}</span> · {new Date(a.created_at).toLocaleDateString()}
            <span className="block">{a.answer}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const Feedback: React.FC<{ rows: SignupRecord[]; answers: AnswerRecord[] }> = ({ rows, answers }) => {
  const counts = feedbackCounts(rows, answers);
  const names = new Map(rows.map(r => [r.id, r.name]));
  return (
    <section data-testid="leader-feedback" className="flex flex-col gap-4">
      <h2 className="font-bold text-amber-300" style={headingStyle}>{LD_FEEDBACK}</h2>
      <p data-testid="leader-answered" className="text-slate-100" style={textStyle}>{answeredLine(counts.answered, counts.signedUp)}</p>
      {CHECKIN_KINDS.map(kind => (
        <KindBlock key={kind} kind={kind} answers={answers.filter(a => a.kind === kind)} names={names} />
      ))}
    </section>
  );
};

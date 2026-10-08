/**
 * LeaderFeedback.tsx — 反馈 Shared feedback, the part a leader comes to read · 成员分享
 *
 * Owner (2026-10-07): "all the sharing part should be highlighted". The
 * members' shared check-in answers (checkin_answers) sit first on the
 * sign-up page, in a gold-framed section whose heading carries a gold count
 * badge, with "answered vs signed up" under it. Each answer is its own card,
 * newest first: the member's name (gold), the check-in kind (周二跟进
 * Tuesday check-in …) and a compact time (full timestamp as a tooltip), then
 * the answer in large type. Reads the rows the page already fetched
 * (leaderData); nothing here queries. Next Friday's closing question starts
 * here (ADR-0004 §7).
 */
import React from 'react';
import { CK_KIND_LABEL } from '../checkin/checkinStrings';
import { SignupRecord, AnswerRecord, feedbackCounts } from './leaderData';
import { compactTime, fullTime } from './leaderTime';
import { LD_FEEDBACK, LD_FEEDBACK_NONE, answeredLine } from './leaderStrings';
import { textStyle, headingStyle } from '../newstudy/newStudyStyles';

/** The card's name · kind · time line: a little smaller than the body. */
const metaStyle: React.CSSProperties = { ...textStyle, fontSize: Number(textStyle.fontSize) * 0.9 };
/** The answer itself: larger than the body, it is what the leader reads aloud on Friday. */
const answerStyle: React.CSSProperties = { fontSize: Number(textStyle.fontSize) * 1.2, lineHeight: 1.5 };

const newestFirst = (answers: AnswerRecord[]) => [...answers].sort((a, b) => b.created_at.localeCompare(a.created_at));

const AnswerCard: React.FC<{ answer: AnswerRecord; name: string }> = ({ answer, name }) => (
  <li data-testid="leader-answer" data-kind={answer.kind} className="rounded-xl border-l-4 border-stl-gold bg-stl-bg p-4">
    <p className="flex flex-wrap items-baseline gap-x-3 text-stl-text-2" style={metaStyle}>
      <span data-testid="leader-answer-name" className="font-semibold text-stl-gold">{name}</span>
      <span data-testid="leader-answer-kind">{CK_KIND_LABEL[answer.kind]}</span>
      <time dateTime={answer.created_at} title={fullTime(answer.created_at)}>{compactTime(answer.created_at)}</time>
    </p>
    <p data-testid="leader-answer-text" className="mt-2 whitespace-pre-wrap text-stl-text" style={answerStyle}>{answer.answer}</p>
  </li>
);

export const Feedback: React.FC<{ rows: SignupRecord[]; answers: AnswerRecord[] }> = ({ rows, answers }) => {
  const counts = feedbackCounts(rows, answers);
  const names = new Map(rows.map(r => [r.id, r.name]));
  return (
    <section data-testid="leader-feedback" className="flex flex-col gap-4 rounded-2xl border-2 border-stl-gold bg-stl-surface p-4 sm:p-6">
      <h2 className="flex flex-wrap items-center gap-3 font-bold text-stl-gold" style={headingStyle}>
        {LD_FEEDBACK}
        <span data-testid="leader-feedback-count" className="rounded-full bg-stl-gold px-3 text-stl-bg">{answers.length}</span>
      </h2>
      <p data-testid="leader-answered" className="text-stl-text" style={textStyle}>{answeredLine(counts.answered, counts.signedUp)}</p>
      {answers.length === 0 ? <p className="text-stl-text-2" style={textStyle}>{LD_FEEDBACK_NONE}</p> : (
        <ul className="flex flex-col gap-3">
          {newestFirst(answers).map(a => <AnswerCard key={a.id} answer={a} name={names.get(a.signup_id) ?? '?'} />)}
        </ul>
      )}
    </section>
  );
};

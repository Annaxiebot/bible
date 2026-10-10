/**
 * LeaderAskHistory.tsx — "问一问记录 · Ask AI history" on #/leader/<id> · 问一问记录 (ADR-0021)
 *
 * The leader's own saved Ask AI exchanges for this study, newest first:
 * each question with its date; tapping a question opens its answer in large
 * type. Each can be deleted (confirm); "全部删除 · Delete all" with a
 * confirm. When the study's "Replace oldest" permission is on it is shown
 * with "停止替换 · Stop replacing". Nothing saved → one quiet line.
 * Placed last on the page: the member-facing parts (shared feedback, the
 * sign-ups, commitments) stay together, and this is the leader's own
 * material. Failures render inline (role=alert).
 */
import React, { useState } from 'react';
import { useLeaderAskHistory } from './useLeaderAskHistory';
import type { SavedExchange } from '../studypack/askHistory';
import { compactTime, fullTime } from './leaderTime';
import { TrashButton } from '../shared/PackRowParts';
import {
  AH_TITLE, AH_HINT, AH_NONE, AH_LOADING, AH_DELETE, AH_DELETE_CONFIRM, AH_DELETE_ALL, AH_DELETE_ALL_CONFIRM,
  AH_REPLACE_ON, AH_REPLACE_STOP, historyCountLine,
} from '../studypack/askHistoryStrings';
import { textStyle, headingStyle, controlStyle, secondaryButtonClass } from '../newstudy/newStudyStyles';

/** The answer: larger than the body, it is what the leader rereads (as the shared answers). */
const answerStyle: React.CSSProperties = { fontSize: Number(textStyle.fontSize) * 1.2, lineHeight: 1.5 };
const metaStyle: React.CSSProperties = { ...textStyle, fontSize: Number(textStyle.fontSize) * 0.9 };
const quietLink = 'inline-flex items-center px-1 text-stl-text-2 underline underline-offset-4 hover:text-stl-gold';

const ExchangeItem: React.FC<{ row: SavedExchange; onDelete: () => void }> = ({ row, onDelete }) => {
  const [open, setOpen] = useState(false);
  return (
    <li data-testid="ask-history-item" className="rounded-xl border-l-4 border-stl-border bg-stl-bg p-4">
      <div className="flex items-start gap-3">
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid="ask-history-question"
          className="flex-1 text-left text-stl-text hover:text-stl-gold" style={controlStyle}>
          {row.question}
        </button>
        <TrashButton label={AH_DELETE} onClick={() => { if (window.confirm(AH_DELETE_CONFIRM)) onDelete(); }} />
      </div>
      <time className="text-stl-text-2" style={metaStyle} dateTime={row.created_at} title={fullTime(row.created_at)}>
        {compactTime(row.created_at)}
      </time>
      {open && (
        <p data-testid="ask-history-answer" className="mt-2 whitespace-pre-wrap text-stl-text" style={answerStyle}>{row.answer}</p>
      )}
    </li>
  );
};

const ReplaceLine: React.FC<{ onStop: () => void }> = ({ onStop }) => (
  <p data-testid="ask-history-replace" className="flex flex-wrap items-center gap-x-3 text-stl-text-2" style={textStyle}>
    <span>{AH_REPLACE_ON}</span>
    <button type="button" onClick={onStop} className={quietLink} style={controlStyle}>{AH_REPLACE_STOP}</button>
  </p>
);

export const AskHistorySection: React.FC<{ packId: string; leaderId: string }> = ({ packId, leaderId }) => {
  const history = useLeaderAskHistory(packId, leaderId);
  const rows = history.rows;
  return (
    <section data-testid="leader-ask-history" className="flex flex-col gap-3">
      <h2 className="flex flex-wrap items-center gap-3 font-bold text-stl-gold" style={headingStyle}>
        {AH_TITLE}
        {rows && rows.length > 0 && <span data-testid="ask-history-count" className="text-stl-text-2" style={textStyle}>{historyCountLine(rows.length)}</span>}
      </h2>
      <p className="text-stl-text-2" style={textStyle}>{AH_HINT}</p>
      {history.replaceOldest && <ReplaceLine onStop={() => void history.stopReplacing()} />}
      {history.error && <p role="alert" className="text-red-300" style={textStyle}>{history.error}</p>}
      {rows === null && <p className="text-stl-text-2" style={textStyle}>{AH_LOADING}</p>}
      {rows && rows.length === 0 && <p data-testid="ask-history-none" className="text-stl-text-2" style={textStyle}>{AH_NONE}</p>}
      {rows && rows.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map(r => <ExchangeItem key={r.id} row={r} onDelete={() => void history.remove(r.id)} />)}
          </ul>
          <div>
            <button type="button" data-testid="ask-history-delete-all" className={secondaryButtonClass} style={controlStyle}
              onClick={() => { if (window.confirm(AH_DELETE_ALL_CONFIRM)) void history.removeAll(); }}>
              {AH_DELETE_ALL}
            </button>
          </div>
        </>
      )}
    </section>
  );
};

export default AskHistorySection;

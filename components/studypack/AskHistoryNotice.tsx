/**
 * AskHistoryNotice.tsx — the saved-history lines under the latest answer · 问一问记录提示 (ADR-0021)
 *
 * Two quiet lines, only for a study the signed-in leader owns:
 *   - at the limit, "已存满 20 条 … 以后替换最早的一条？" with
 *     "替换最早 · Replace oldest" and "不保存 · Don't save" (the answer is
 *     shown either way; it is saved only on Replace oldest);
 *   - any save/restore failure, one muted line (R5: never silent, never
 *     in the way of the answer).
 * AskClearButton is the panel header's quiet "清空 · Clear": it empties the
 * view (and drops a pending notice) without deleting anything saved.
 * Sized like the panel's other lines (viewport-scaled type).
 */
import React from 'react';
import type { AskHistory } from './useAskHistory';
import type { AskAI } from './useAskAI';
import { AH_FULL_NOTICE, AH_REPLACE, AH_DONT_SAVE, AH_CLEAR } from './askHistoryStrings';

const QUIET_BUTTON = 'ml-[1vw] rounded-lg border border-stl-border px-[1vw] py-[0.4vh] text-stl-text-2 hover:border-stl-gold hover:text-stl-gold';

export const AskHistoryNotice: React.FC<{ history: AskHistory; style: React.CSSProperties }> = ({ history, style }) => (
  <>
    {history.pending && (
      <p className="text-stl-text-2" style={style} data-testid="ask-history-full">
        {AH_FULL_NOTICE}
        <button type="button" onClick={history.replaceOldest} className={QUIET_BUTTON} style={style}>{AH_REPLACE}</button>
        <button type="button" onClick={history.dontSave} className={QUIET_BUTTON} style={style}>{AH_DONT_SAVE}</button>
      </p>
    )}
    {history.problem && (
      <p role="status" className="text-stl-text-3" style={style} data-testid="ask-history-problem">{history.problem}</p>
    )}
  </>
);

/** Only on an owned study, with something to clear, and never mid-answer. */
export const AskClearButton: React.FC<{ ai: AskAI; history: AskHistory; style: React.CSSProperties }> = ({ ai, history, style }) => {
  if (!history.owned || ai.messages.length === 0 || ai.loading) return null;
  const clear = () => { history.dontSave(); ai.clear(); };
  return (
    <button type="button" onClick={clear} className="text-stl-text-3 hover:text-stl-text px-3 py-1" style={style} data-testid="ask-clear">
      {AH_CLEAR}
    </button>
  );
};

export default AskHistoryNotice;

/**
 * SharingControl.tsx — "生成上周分享 · Prepare last week's sharing" · 上周分享控件
 *
 * One control above the editor's sections (ADR-0008): the previous-pack
 * select (default from sharingData) and one button. The result is a normal
 * editable section right after the title — the leader reviews, edits or
 * removes it like any other before it is shown. Busy and failure lines are
 * visible and bilingual; AI failures carry askAIErrors' own line. Signed
 * out (no RLS rows to read) the control is not shown.
 */
import React from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { useSharing, SharingStatus } from './useSharing';
import {
  SH_PREPARE, SH_PREVIOUS_LABEL, SH_HINT, SH_LOADING, SH_DRAFTING, SH_DONE, SH_DONE_COUNTS_ONLY, SH_NO_PREVIOUS,
} from './sharingStrings';
import { textStyle, controlStyle, inputClass, secondaryButtonClass, labelClass } from '../newstudy/newStudyStyles';

interface Props {
  pack: StudyPack;
  onApply: (pack: StudyPack) => void;
}

const BUSY = new Set<SharingStatus['kind']>(['loading', 'drafting']);

const StatusLine: React.FC<{ status: SharingStatus }> = ({ status }) => {
  if (status.kind === 'idle') return null;
  if (status.kind === 'failed') {
    return <p role="alert" data-testid="sh-error" className="text-red-300" style={textStyle}>{status.message}</p>;
  }
  const text = status.kind === 'loading' ? SH_LOADING
    : status.kind === 'drafting' ? SH_DRAFTING
    : status.aiUsed ? SH_DONE : SH_DONE_COUNTS_ONLY;
  return <p role="status" data-testid="sh-status" className="text-emerald-300" style={textStyle}>{text}</p>;
};

const SharingControl: React.FC<Props> = ({ pack, onApply }) => {
  const { uid, candidates, previousId, setPreviousId, status, prepare } = useSharing(pack, onApply);
  const none = candidates !== null && candidates.length === 0;
  const busy = BUSY.has(status.kind);
  // Signed out there are no sign-ups to read (RLS): the control stays out of the way.
  if (!uid) return null;
  return (
    <section data-testid="sh-control" className="flex flex-col gap-3 rounded-xl border border-slate-700 p-4">
      <p className="text-slate-400" style={textStyle}>{SH_HINT}</p>
      {none && <p data-testid="sh-none" className="text-slate-400" style={textStyle}>{SH_NO_PREVIOUS}</p>}
      {candidates && candidates.length > 0 && (
        <label className={labelClass} style={textStyle}>
          <span>{SH_PREVIOUS_LABEL}</span>
          <select value={previousId} onChange={e => setPreviousId(e.target.value)} data-testid="sh-previous"
            aria-label={SH_PREVIOUS_LABEL} className={inputClass} style={controlStyle}>
            {candidates.map(p => <option key={p.id} value={p.id}>{`${p.date} · ${p.title}`}</option>)}
          </select>
        </label>
      )}
      <button type="button" onClick={() => void prepare()} disabled={!previousId || busy} data-testid="sh-prepare"
        className={`${secondaryButtonClass} self-start`} style={controlStyle}>
        {SH_PREPARE}
      </button>
      <StatusLine status={status} />
    </section>
  );
};

export default SharingControl;

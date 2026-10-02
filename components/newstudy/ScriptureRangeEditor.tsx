/**
 * ScriptureRangeEditor.tsx — change the passage without regenerating · 更改经文范围
 *
 * Chapter / from / to selects (the form's own RangeSelects + useVerseRange)
 * seeded from the pack's current range, and one "更新经文 Update scripture"
 * button that rebuilds the scripture section from the bundled Bible
 * (scriptureRange.applyScriptureRange). AI-written sections are untouched.
 * The outcome is a bilingual status line: updated, or the loadPassage error.
 */
import React, { useState } from 'react';
import { StudyPack } from '../studypack/packTypes';
import { VerseRange } from './packAssembly';
import { packRange, applyScriptureRange } from './scriptureRange';
import { useVerseRange, RangeSelects } from './verseRangeFields';
import { NS_RANGE_APPLY, NS_RANGE_UPDATED, NS_RANGE_UPDATING } from './newStudyStrings';
import { textStyle, controlStyle, secondaryButtonClass } from './newStudyStyles';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'updated' } | { kind: 'error'; message: string };

interface Props {
  pack: StudyPack;
  onApply: (next: StudyPack) => void;
}

const Inner: React.FC<{ initial: VerseRange; pack: StudyPack; onApply: (next: StudyPack) => void }> = ({
  initial, pack, onApply,
}) => {
  const [draft, setDraft] = useState<VerseRange>(initial);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const update = (patch: Partial<VerseRange>) => { setDraft(d => ({ ...d, ...patch })); setStatus({ kind: 'idle' }); };
  const control = useVerseRange(draft, update);

  const apply = async () => {
    setStatus({ kind: 'loading' });
    try {
      onApply(await applyScriptureRange(pack, draft));
      setStatus({ kind: 'updated' });
    } catch (err) {
      // Surfaced to the leader as the bilingual loadPassage message (R5).
      setStatus({ kind: 'error', message: (err as Error).message });
    }
  };

  return (
    <div data-testid="ns-range-editor" className="flex flex-col gap-3">
      <RangeSelects value={draft} control={control} prefix="ns-range" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void apply()} disabled={status.kind === 'loading'}
          className={secondaryButtonClass} style={controlStyle} data-testid="ns-range-apply">
          {NS_RANGE_APPLY}
        </button>
        {status.kind === 'loading' && <span className="text-slate-400" style={textStyle}>{NS_RANGE_UPDATING}</span>}
        {status.kind === 'updated' && (
          <span aria-live="polite" data-testid="ns-range-status" className="text-emerald-300" style={textStyle}>{NS_RANGE_UPDATED}</span>
        )}
        {status.kind === 'error' && (
          <span role="alert" data-testid="ns-range-error" className="text-red-300" style={textStyle}>{status.message}</span>
        )}
      </div>
    </div>
  );
};

/** Renders nothing when the pack's range cannot be read back (no scripture section / unknown passageRef). */
const ScriptureRangeEditor: React.FC<Props> = ({ pack, onApply }) => {
  const initial = packRange(pack);
  return initial ? <Inner initial={initial} pack={pack} onApply={onApply} /> : null;
};

export default ScriptureRangeEditor;

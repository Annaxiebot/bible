/**
 * SectionAdjust.tsx — "AI 修改 Adjust with AI" around one section's editor · AI单段修改
 *
 * Wraps the section's editing control. A low-emphasis toggle opens an
 * inline box: an instruction field, three quick chips that fill it, and
 * Send. While the AI works the section is dimmed with "AI 修改中…"; the
 * result replaces the content through the editor's onPatch (auto-saved),
 * and 撤销 Undo restores the previous content until the section is edited
 * again. Failures (sign in, quota, credit, unusable reply) show in the box.
 * Large type, ≥48px targets (newStudyStyles).
 */
import React, { useState } from 'react';
import { PackSection } from '../studypack/packTypes';
import { AdjustPack } from './adjustPrompt';
import { useSectionAdjust, SectionAdjustState } from './useSectionAdjust';
import { AJ_OPEN, AJ_FIELD, AJ_SEND, AJ_BUSY, AJ_UNDO, AJ_CHIPS } from './adjustStrings';
import {
  textStyle, controlStyle, inputClass, secondaryButtonClass, quietButtonClass, labelClass,
} from './newStudyStyles';

interface Props {
  section: PackSection;
  pack: AdjustPack;
  onPatch: (patch: Partial<PackSection>) => void;
  children: React.ReactNode;
}

const AdjustBox: React.FC<{ heading: string; state: SectionAdjustState; onDone: () => void }> = ({ heading, state, onDone }) => {
  const [instruction, setInstruction] = useState('');
  const submit = async () => {
    if (await state.send(instruction)) { setInstruction(''); onDone(); }
  };
  return (
    <div data-testid="ns-adjust-box" className="flex flex-col gap-3 rounded-lg border border-slate-700 p-3">
      <label className={labelClass} style={textStyle}>
        <span>{AJ_FIELD}</span>
        <textarea value={instruction} rows={2} aria-label={`${AJ_FIELD}: ${heading}`} data-testid="ns-adjust-input"
          onChange={e => setInstruction(e.target.value)} disabled={state.busy} className={inputClass} style={textStyle} />
      </label>
      <div className="flex flex-wrap gap-2">
        {AJ_CHIPS.map(chip => (
          <button key={chip} type="button" onClick={() => setInstruction(chip)} disabled={state.busy}
            data-testid="ns-adjust-chip" className={secondaryButtonClass} style={controlStyle}>
            {chip}
          </button>
        ))}
        <button type="button" onClick={() => void submit()} disabled={state.busy || !instruction.trim()}
          aria-label={`${AJ_SEND}: ${heading}`} data-testid="ns-adjust-send"
          className={secondaryButtonClass} style={controlStyle}>
          {AJ_SEND}
        </button>
      </div>
      {state.error && <p role="alert" data-testid="ns-adjust-error" className="text-amber-300" style={textStyle}>{state.error}</p>}
    </div>
  );
};

const SectionAdjust: React.FC<Props> = ({ section, pack, onPatch, children }) => {
  const state = useSectionAdjust(section, pack, onPatch);
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="ns-adjust" className="flex flex-col gap-3">
      <div aria-busy={state.busy} className={state.busy ? 'pointer-events-none opacity-40' : undefined}>
        {children}
      </div>
      {state.busy && <p role="status" data-testid="ns-adjust-busy" className="text-amber-300" style={textStyle}>{AJ_BUSY}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          aria-label={`${AJ_OPEN}: ${section.heading}`} data-testid="ns-adjust-open"
          className={`${quietButtonClass} self-start`} style={controlStyle}>
          {AJ_OPEN}
        </button>
        {state.canUndo && !state.busy && (
          <button type="button" onClick={state.undo} aria-label={`${AJ_UNDO}: ${section.heading}`}
            data-testid="ns-adjust-undo" className={quietButtonClass} style={controlStyle}>
            {AJ_UNDO}
          </button>
        )}
      </div>
      {open && <AdjustBox heading={section.heading} state={state} onDone={() => setOpen(false)} />}
    </div>
  );
};

export default SectionAdjust;

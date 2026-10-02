/**
 * PracticeStep.tsx — "我本周的操练 My practice this week" · 本周操练
 *
 * The sign-up's first step (ADR-0004 §7): the pack's seven life-menu rows
 * as large tappable choices. Tap one = the commitment; tap a second = the
 * optional second practice; tap a chosen one again to clear it. One line
 * for the member's own version. Large type, ≥48px targets (newStudyStyles).
 */
import React from 'react';
import type { LifeMenuRow } from '../studypack/packTypes';
import { SU_PRACTICE_TITLE, SU_PRACTICE_INTRO, SU_PRACTICE_SECOND, SU_PRACTICE_NOTE } from './signupStrings';
import { textStyle, controlStyle, headingStyle, inputClass, labelClass } from '../newstudy/newStudyStyles';

export interface PracticeChoice {
  practice: LifeMenuRow | null;
  second: LifeMenuRow | null;
  note: string;
}

interface Props {
  rows: LifeMenuRow[];
  value: PracticeChoice;
  onChange: (next: PracticeChoice) => void;
}

const sameRow = (a: LifeMenuRow | null, b: LifeMenuRow) => !!a && a.area === b.area && a.practice === b.practice;

/** First tap = the practice; a later tap on another row = the second; tapping a chosen row clears it. */
export function toggleChoice(value: PracticeChoice, row: LifeMenuRow): PracticeChoice {
  if (sameRow(value.practice, row)) return { ...value, practice: value.second, second: null };
  if (sameRow(value.second, row)) return { ...value, second: null };
  if (!value.practice) return { ...value, practice: row };
  return { ...value, second: row };
}

const choiceBase = 'w-full rounded-xl border px-4 py-3 text-left';
const choiceOff = `${choiceBase} border-slate-600 bg-slate-800 text-slate-100 hover:border-amber-400`;
const choiceOn = `${choiceBase} border-amber-400 bg-amber-400/15 text-slate-50`;

const PracticeStep: React.FC<Props> = ({ rows, value, onChange }) => (
  <fieldset data-testid="su-practice-step" className="flex flex-col gap-4">
    <legend className="font-bold text-amber-300" style={headingStyle}>{SU_PRACTICE_TITLE}</legend>
    <p className="text-slate-400" style={textStyle}>{SU_PRACTICE_INTRO}</p>
    {rows.map(row => {
      const chosen = sameRow(value.practice, row) ? 'practice' : sameRow(value.second, row) ? 'second' : null;
      return (
        <button key={row.area} type="button" role="checkbox" aria-checked={chosen !== null}
          data-testid="su-practice" data-area={row.area} data-chosen={chosen ?? ''}
          onClick={() => onChange(toggleChoice(value, row))} className={chosen ? choiceOn : choiceOff} style={controlStyle}>
          <span className="block font-semibold text-amber-300">{row.area}{chosen === 'second' ? ` — ${SU_PRACTICE_SECOND}` : ''}</span>
          <span className="block">{row.practice}</span>
        </button>
      );
    })}
    <label className={labelClass} style={textStyle}>
      <span>{SU_PRACTICE_NOTE}</span>
      <input data-testid="su-note" className={inputClass} style={controlStyle} value={value.note}
        onChange={e => onChange({ ...value, note: e.target.value })} />
    </label>
  </fieldset>
);

export default PracticeStep;

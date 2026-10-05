/**
 * PracticeStep.tsx — "我本周的操练 My practice this week" · 本周操练
 *
 * The sign-up's first step (ADR-0004 §7): the pack's seven life-menu rows
 * as large tappable choices. A tap toggles a row on or off; any number may
 * be chosen, kept in tap order (the first is the main commitment). A chosen
 * row shows a check and the gold-deep border, on paper (shared/paperStyles). One line for the member's own
 * version. Large type, ≥48px targets (newStudyStyles).
 */
import React from 'react';
import type { LifeMenuRow } from '../studypack/packTypes';
import { SU_PRACTICE_TITLE, SU_PRACTICE_INTRO, SU_PRACTICE_NOTE } from './signupStrings';
import { textStyle, controlStyle, headingStyle } from '../newstudy/newStudyStyles';
import { PAPER_HEAD_CLASS, PAPER_MUTED_CLASS, PAPER_ACCENT_CLASS, PAPER_INPUT_CLASS, PAPER_LABEL_CLASS } from '../shared/paperStyles';

export interface PracticeChoice {
  practices: LifeMenuRow[];   // chosen rows, in tap order
  note: string;
}

interface Props {
  rows: LifeMenuRow[];
  value: PracticeChoice;
  onChange: (next: PracticeChoice) => void;
}

const sameRow = (a: LifeMenuRow, b: LifeMenuRow) => a.area === b.area && a.practice === b.practice;

/** A tap on an unchosen row appends it; a tap on a chosen row removes it (the rest keep their order). */
export function toggleChoice(value: PracticeChoice, row: LifeMenuRow): PracticeChoice {
  const chosen = value.practices.some(p => sameRow(p, row));
  const practices = chosen ? value.practices.filter(p => !sameRow(p, row)) : [...value.practices, row];
  return { ...value, practices };
}

const choiceBase = 'flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left';
/** On paper: a chosen card gets the gold-deep border, a tinted fill and a filled check. */
export const CHOICE_OFF_CLASS = `${choiceBase} border-stl-line bg-stl-card text-stl-ink hover:border-stl-gold-deep`;
export const CHOICE_ON_CLASS = `${choiceBase} border-stl-gold-deep bg-stl-paper-2 text-stl-ink`;
const checkBase = 'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 font-bold';
const checkOff = `${checkBase} border-stl-ink-2`;
const checkOn = `${checkBase} border-stl-gold-deep bg-stl-gold-deep text-stl-paper`;

const PracticeStep: React.FC<Props> = ({ rows, value, onChange }) => (
  <fieldset data-testid="su-practice-step" className="flex flex-col gap-4">
    <legend className={PAPER_HEAD_CLASS} style={headingStyle}>{SU_PRACTICE_TITLE}</legend>
    <p className={PAPER_MUTED_CLASS} style={textStyle}>{SU_PRACTICE_INTRO}</p>
    {rows.map(row => {
      const order = value.practices.findIndex(p => sameRow(p, row)) + 1;
      return (
        <button key={row.area} type="button" role="checkbox" aria-checked={order > 0}
          data-testid="su-practice" data-area={row.area} data-chosen={order > 0 ? String(order) : ''}
          onClick={() => onChange(toggleChoice(value, row))} className={order > 0 ? CHOICE_ON_CLASS : CHOICE_OFF_CLASS} style={controlStyle}>
          <span data-testid="su-practice-check" aria-hidden="true" className={order > 0 ? checkOn : checkOff}>{order > 0 ? '✓' : ''}</span>
          <span>
            <span className={`block font-semibold ${PAPER_ACCENT_CLASS}`}>{row.area}</span>
            <span className="block">{row.practice}</span>
          </span>
        </button>
      );
    })}
    <label className={PAPER_LABEL_CLASS} style={textStyle}>
      <span>{SU_PRACTICE_NOTE}</span>
      <input data-testid="su-note" className={PAPER_INPUT_CLASS} style={controlStyle} value={value.note}
        onChange={e => onChange({ ...value, note: e.target.value })} />
    </label>
  </fieldset>
);

export default PracticeStep;

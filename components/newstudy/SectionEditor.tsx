/**
 * SectionEditor.tsx — one pack section's editing control · 单节编辑
 *
 * Dispatches on section kind: scripture is read-only (bundled verses),
 * discussion is an editable question list, life menu edits each area's
 * practice, every other kind is a lines textarea. title/qr render nothing
 * (title is edited at pack level; the QR is fixed). Used by NewStudyEditor.
 * Given the pack, an adjustable section (adjustPrompt.ADJUSTABLE_KINDS — never
 * scripture, title or qr) is wrapped in SectionAdjust ("AI 修改 Adjust with AI").
 * A study-guide pack's section also shows where it came from and its
 * non-verbatim lines (guide/GuideMarks, ADR-0019).
 */
import React from 'react';
import { PackSection } from '../studypack/packTypes';
import { NS_SCRIPTURE_NOTE, NS_QUESTION_ADD, NS_QUESTION_REMOVE } from './newStudyStrings';
import { textStyle, controlStyle, inputClass, secondaryButtonClass, quietButtonClass, labelClass } from './newStudyStyles';
import SectionAdjust from './SectionAdjust';
import { isAdjustable, AdjustPack } from './adjustPrompt';
import GuideMarks from './guide/GuideMarks';

/** Textarea text → body lines (blank lines dropped). */
export function splitLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <span className="text-amber-300 font-semibold" style={textStyle}>{text}</span>
);

const LinesSection: React.FC<{ section: PackSection; onBody: (lines: string[]) => void }> = ({ section, onBody }) => (
  <label className={labelClass} style={textStyle}>
    <SectionHeading text={section.heading} />
    <textarea
      value={(section.body ?? []).join('\n')} rows={Math.max(3, (section.body ?? []).length + 1)}
      aria-label={section.heading} onChange={e => onBody(splitLines(e.target.value))}
      className={inputClass} style={textStyle}
    />
  </label>
);

const ScriptureSection: React.FC<{ section: PackSection }> = ({ section }) => (
  <div data-testid="ns-scripture" className="text-slate-300" style={textStyle}>
    <SectionHeading text={section.heading} />
    <span className="block text-slate-500">{NS_SCRIPTURE_NOTE}</span>
    {(section.verses ?? []).map(v => (
      <p key={v.num} className="mt-2"><span className="text-slate-500">{v.num} </span>{v.cuv}<br />{v.en}</p>
    ))}
  </div>
);

/** Stable row keys for a string[] (the pack schema has no ids): index keys made React reuse a removed row's textarea. */
function useRowKeys(length: number): { keys: number[]; drop: (i: number) => void } {
  const keys = React.useRef<number[]>([]);
  const seq = React.useRef(0);
  while (keys.current.length < length) keys.current.push(seq.current++);
  if (keys.current.length > length) keys.current.length = length;
  return { keys: keys.current, drop: i => { keys.current.splice(i, 1); } };
}

const QuestionsSection: React.FC<{ section: PackSection; onQuestions: (q: string[]) => void }> = ({ section, onQuestions }) => {
  const questions = section.questions ?? [];
  const { keys, drop } = useRowKeys(questions.length);
  const set = (i: number, value: string) => onQuestions(questions.map((q, j) => (j === i ? value : q)));
  const remove = (i: number) => { drop(i); onQuestions(questions.filter((_, j) => j !== i)); };
  return (
    <div className="flex flex-col gap-3" data-testid="ns-questions">
      <SectionHeading text={section.heading} />
      {questions.map((q, i) => (
        <div key={keys.at(i)} className="flex gap-2">
          <textarea value={q} rows={2} aria-label={`${section.heading} ${i + 1}`}
            onChange={e => set(i, e.target.value)} className={inputClass} style={textStyle} />
          <button type="button" onClick={() => remove(i)}
            className={quietButtonClass} style={controlStyle} aria-label={`${NS_QUESTION_REMOVE} ${i + 1}`}>
            {NS_QUESTION_REMOVE}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onQuestions([...questions, ''])}
        className={`${secondaryButtonClass} self-start`} style={controlStyle}>
        {NS_QUESTION_ADD}
      </button>
    </div>
  );
};

const LifeMenuSection: React.FC<{ section: PackSection; onRows: (rows: PackSection['rows']) => void }> = ({ section, onRows }) => {
  const rows = section.rows ?? [];
  return (
    <div className="flex flex-col gap-3" data-testid="ns-life-menu">
      <SectionHeading text={section.heading} />
      {rows.map((row, i) => (
        <label key={row.area} className={labelClass} style={textStyle}>
          <span>{row.area}</span>
          <textarea value={row.practice} rows={2} aria-label={row.area}
            onChange={e => onRows(rows.map((r, j) => (j === i ? { ...r, practice: e.target.value } : r)))}
            className={inputClass} style={textStyle} />
        </label>
      ))}
    </div>
  );
};

export interface SectionEditorProps {
  section: PackSection;
  onPatch: (patch: Partial<PackSection>) => void;
  /** The pack's passage + content language: enables "AI 修改" on adjustable sections (absent → no AI box). */
  pack?: AdjustPack;
}

const SectionControl: React.FC<SectionEditorProps> = ({ section, onPatch }) => {
  switch (section.kind) {
    case 'title':
    case 'qr':
      return null;
    case 'scripture':
      return <ScriptureSection section={section} />;
    case 'discussion':
      return <QuestionsSection section={section} onQuestions={questions => onPatch({ questions })} />;
    case 'lifeMenu':
      return <LifeMenuSection section={section} onRows={rows => onPatch({ rows })} />;
    default:
      return <LinesSection section={section} onBody={body => onPatch({ body })} />;
  }
};

/** "AI 修改" rewrites a guide section in the AI's words, so it is AI-drafted from then on (ADR-0019 §5). */
function adjustedByAI(section: PackSection, patch: Partial<PackSection>): Partial<PackSection> {
  return section.origin === 'guide' ? { ...patch, origin: 'ai', notVerbatim: [] } : patch;
}

const SectionEditor: React.FC<SectionEditorProps> = ({ section, onPatch, pack }) => {
  const control = <SectionControl section={section} onPatch={onPatch} />;
  const body = !pack || !isAdjustable(section.kind) ? control : (
    <SectionAdjust section={section} pack={pack} onPatch={patch => onPatch(adjustedByAI(section, patch))}>{control}</SectionAdjust>
  );
  return <GuideMarks section={section}>{body}</GuideMarks>;
};

export default SectionEditor;

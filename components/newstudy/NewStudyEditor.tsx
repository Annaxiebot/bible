/**
 * NewStudyEditor.tsx — review and edit a generated pack · 审阅与编辑
 *
 * Each section's lines in a textarea (one line per body entry, Chinese-first
 * lines kept as written), discussion questions as an editable list, life-menu
 * practices per area. Scripture (bundled verses) and the QR section are not
 * editable. Save stores the pack; Preview saves then opens TV mode.
 */
import React, { useState } from 'react';
import { StudyPack, PackSection, parseStudyPack } from '../studypack/packTypes';
import {
  NS_EDIT_TITLE, NS_EDIT_HINT, NS_PACK_TITLE, NS_SCRIPTURE_NOTE, NS_QUESTION_ADD, NS_QUESTION_REMOVE,
  NS_SAVE, NS_SAVED, NS_PREVIEW, NS_BACK, NS_ERR_EMPTY_QUESTION, NS_ERR_INVALID,
} from './newStudyStrings';
import {
  textStyle, controlStyle, headingStyle, inputClass, primaryButtonClass, secondaryButtonClass,
  quietButtonClass, labelClass,
} from './newStudyStyles';

interface Props {
  pack: StudyPack;
  onChange: (pack: StudyPack) => void;
  onSave: (pack: StudyPack) => Promise<void>;
  onPreview: (pack: StudyPack) => Promise<void>;
  onBack: () => void;
}

/** Textarea text → body lines (blank lines dropped). */
export function splitLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

/** Validation before saving. Returns the bilingual problem, or null. */
export function validateEdited(pack: StudyPack): string | null {
  const discussion = pack.sections.find(s => s.kind === 'discussion');
  if (discussion?.questions?.some(q => q.trim().length === 0)) return NS_ERR_EMPTY_QUESTION;
  try {
    parseStudyPack(pack);
    return null;
  } catch (err) {
    return `${NS_ERR_INVALID}: ${(err as Error).message}`;
  }
}

const LinesSection: React.FC<{ section: PackSection; onBody: (lines: string[]) => void }> = ({ section, onBody }) => (
  <label className={labelClass} style={textStyle}>
    <span className="text-amber-300 font-semibold">{section.heading}</span>
    <textarea
      value={(section.body ?? []).join('\n')} rows={Math.max(3, (section.body ?? []).length + 1)}
      aria-label={section.heading} onChange={e => onBody(splitLines(e.target.value))}
      className={inputClass} style={textStyle}
    />
  </label>
);

const QuestionsSection: React.FC<{ section: PackSection; onQuestions: (q: string[]) => void }> = ({ section, onQuestions }) => {
  const questions = section.questions ?? [];
  const set = (i: number, value: string) => onQuestions(questions.map((q, j) => (j === i ? value : q)));
  return (
    <div className="flex flex-col gap-3" data-testid="ns-questions">
      <span className="text-amber-300 font-semibold" style={textStyle}>{section.heading}</span>
      {questions.map((q, i) => (
        <div key={i} className="flex gap-2">
          <textarea value={q} rows={2} aria-label={`${section.heading} ${i + 1}`}
            onChange={e => set(i, e.target.value)} className={inputClass} style={textStyle} />
          <button type="button" onClick={() => onQuestions(questions.filter((_, j) => j !== i))}
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
      <span className="text-amber-300 font-semibold" style={textStyle}>{section.heading}</span>
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

const NewStudyEditor: React.FC<Props> = ({ pack, onChange, onSave, onPreview, onBack }) => {
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const patchSection = (index: number, patch: Partial<PackSection>) => {
    setStatus('idle');
    onChange({ ...pack, sections: pack.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  };
  const setTitle = (heading: string) => {
    setStatus('idle');
    const sections = pack.sections.map(s => (s.kind === 'title' ? { ...s, heading } : s));
    onChange({ ...pack, title: `${heading} — ${pack.passageRef.split(' · ')[0]}`, sections });
  };

  const run = async (action: (p: StudyPack) => Promise<void>, doneStatus: 'saved' | 'idle') => {
    const problem = validateEdited(pack);
    if (problem) { setError(problem); setStatus('error'); return; }
    try {
      await action(pack);
      setError(null);
      setStatus(doneStatus);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  };

  const titleSection = pack.sections.find(s => s.kind === 'title');
  return (
    <div data-testid="new-study-editor" className="flex flex-col gap-6">
      <h2 className="font-bold text-amber-300" style={headingStyle}>{NS_EDIT_TITLE}</h2>
      <p className="text-slate-400" style={textStyle}>{NS_EDIT_HINT}</p>
      <label className={labelClass} style={textStyle}>
        <span>{NS_PACK_TITLE}</span>
        <input type="text" value={titleSection?.heading ?? ''} aria-label={NS_PACK_TITLE} data-testid="ns-title"
          onChange={e => setTitle(e.target.value)} className={inputClass} style={controlStyle} />
      </label>
      {pack.sections.map((section, i) => {
        if (section.kind === 'title' || section.kind === 'qr') return null;
        if (section.kind === 'scripture') {
          return (
            <div key={i} data-testid="ns-scripture" className="text-slate-300" style={textStyle}>
              <span className="block text-amber-300 font-semibold">{section.heading}</span>
              <span className="block text-slate-500">{NS_SCRIPTURE_NOTE}</span>
              {(section.verses ?? []).map(v => (
                <p key={v.num} className="mt-2"><span className="text-slate-500">{v.num} </span>{v.cuv}<br />{v.en}</p>
              ))}
            </div>
          );
        }
        if (section.kind === 'discussion') {
          return <QuestionsSection key={i} section={section} onQuestions={questions => patchSection(i, { questions })} />;
        }
        if (section.kind === 'lifeMenu') {
          return <LifeMenuSection key={i} section={section} onRows={rows => patchSection(i, { rows })} />;
        }
        return <LinesSection key={i} section={section} onBody={body => patchSection(i, { body })} />;
      })}
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
      {status === 'saved' && <p role="status" className="text-emerald-300" style={textStyle}>{NS_SAVED}</p>}
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onBack} className={quietButtonClass} style={controlStyle}>{NS_BACK}</button>
        <button type="button" onClick={() => void run(onSave, 'saved')} className={secondaryButtonClass}
          style={controlStyle} data-testid="ns-save">
          {NS_SAVE}
        </button>
        <button type="button" onClick={() => void run(onPreview, 'idle')} className={primaryButtonClass}
          style={controlStyle} data-testid="ns-preview">
          {NS_PREVIEW}
        </button>
      </div>
    </div>
  );
};

export default NewStudyEditor;

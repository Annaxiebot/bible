/**
 * NewStudyEditor.tsx — review and edit a generated pack · 审阅与编辑
 *
 * Pack title input, one SectionEditor per section (Chinese-first lines kept
 * as written), then Back / Save / Preview. Save stores the pack; Preview
 * saves then opens TV mode. Validation errors are bilingual and inline.
 */
import React, { useState } from 'react';
import { StudyPack, PackSection, parseStudyPack } from '../studypack/packTypes';
import SectionEditor from './SectionEditor';
import {
  NS_EDIT_TITLE, NS_EDIT_HINT, NS_PACK_TITLE, NS_SAVE, NS_SAVED, NS_PREVIEW, NS_BACK,
  NS_ERR_EMPTY_QUESTION, NS_ERR_INVALID,
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

/** The title slide's heading edits pack.title too ("<heading> — <中文 passage ref>"). */
export function withTitle(pack: StudyPack, heading: string): StudyPack {
  const sections = pack.sections.map(s => (s.kind === 'title' ? { ...s, heading } : s));
  return { ...pack, title: `${heading} — ${pack.passageRef.split(' · ')[0]}`, sections };
}

function withSection(pack: StudyPack, index: number, patch: Partial<PackSection>): StudyPack {
  return { ...pack, sections: pack.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
}

const NewStudyEditor: React.FC<Props> = ({ pack, onChange, onSave, onPreview, onBack }) => {
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const edit = (next: StudyPack) => { setStatus('idle'); onChange(next); };

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

  const titleHeading = pack.sections.find(s => s.kind === 'title')?.heading ?? '';
  return (
    <div data-testid="new-study-editor" className="flex flex-col gap-6">
      <h2 className="font-bold text-amber-300" style={headingStyle}>{NS_EDIT_TITLE}</h2>
      <p className="text-slate-400" style={textStyle}>{NS_EDIT_HINT}</p>
      <label className={labelClass} style={textStyle}>
        <span>{NS_PACK_TITLE}</span>
        <input type="text" value={titleHeading} aria-label={NS_PACK_TITLE} data-testid="ns-title"
          onChange={e => edit(withTitle(pack, e.target.value))} className={inputClass} style={controlStyle} />
      </label>
      {pack.sections.map((section, i) => (
        <SectionEditor key={i} section={section} onPatch={patch => edit(withSection(pack, i, patch))} />
      ))}
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
      {status === 'saved' && <p role="status" className="text-emerald-300" style={textStyle}>{NS_SAVED}</p>}
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onBack} className={quietButtonClass} style={controlStyle}>{NS_BACK}</button>
        <button type="button" onClick={() => void run(onSave, 'saved')} className={secondaryButtonClass}
          style={controlStyle} data-testid="ns-save">{NS_SAVE}</button>
        <button type="button" onClick={() => void run(onPreview, 'idle')} className={primaryButtonClass}
          style={controlStyle} data-testid="ns-preview">{NS_PREVIEW}</button>
      </div>
    </div>
  );
};

export default NewStudyEditor;

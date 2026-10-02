/**
 * NewStudyEditor.tsx — review and edit a generated pack · 审阅与编辑
 *
 * Pack title input, then per section: a toolbar (move up/down, remove with
 * inline confirm — sectionRules decides what is allowed), the scripture
 * range editor (first scripture section only), and the SectionEditor.
 * "添加段落 Add section" appends an allowed kind. Every edit is a pure
 * function in packEdits; validateEdited runs on every render and keeps
 * Save/Preview disabled with the bilingual reason shown while invalid.
 * Save stores the pack; Preview saves then opens TV mode.
 */
import React, { useRef, useState } from 'react';
import { StudyPack, SectionKind } from '../studypack/packTypes';
import SectionEditor from './SectionEditor';
import SectionToolbar from './SectionToolbar';
import ScriptureRangeEditor from './ScriptureRangeEditor';
import AddSectionMenu from './AddSectionMenu';
import { canMoveUp, canMoveDown, canRemove, moveItem, removeItem, insertItem } from './sectionRules';
import {
  validateEdited, withTitle, withSection, withMovedSection, withoutSection, withAddedSection,
} from './packEdits';
import { NS_EDIT_TITLE, NS_EDIT_HINT, NS_PACK_TITLE, NS_SAVE, NS_SAVED, NS_PREVIEW, NS_BACK } from './newStudyStrings';
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

/**
 * Move / remove / add over packEdits, plus stable React keys for the section
 * list (the schema has no ids): the keys move alongside the sections so a
 * reordered editor keeps its DOM nodes. If the pack changes shape from
 * outside, the keys are simply regenerated.
 */
function useSectionActions(pack: StudyPack, edit: (next: StudyPack) => void) {
  const seq = useRef(0);
  const fresh = (n: number) => Array.from({ length: n }, () => seq.current++);
  const [keys, setKeys] = useState<number[]>(() => fresh(pack.sections.length));
  if (keys.length !== pack.sections.length) setKeys(fresh(pack.sections.length));
  return {
    keys,
    move: (i: number, dir: -1 | 1) => { setKeys(moveItem(keys, i, dir)); edit(withMovedSection(pack, i, dir)); },
    remove: (i: number) => { setKeys(removeItem(keys, i)); edit(withoutSection(pack, i)); },
    add: (kind: SectionKind) => {
      const added = withAddedSection(pack, kind);
      setKeys(insertItem(keys, added.at, seq.current++));
      edit(added.pack);
    },
  };
}

/** Back / Save / Preview; Save and Preview are disabled while the pack is invalid. */
const Footer: React.FC<{ invalid: boolean; onBack: () => void; onSave: () => void; onPreview: () => void }> = ({
  invalid, onBack, onSave, onPreview,
}) => (
  <div className="flex flex-wrap justify-end gap-3">
    <button type="button" onClick={onBack} className={quietButtonClass} style={controlStyle}>{NS_BACK}</button>
    <button type="button" onClick={onSave} disabled={invalid} className={secondaryButtonClass} style={controlStyle}
      data-testid="ns-save">{NS_SAVE}</button>
    <button type="button" onClick={onPreview} disabled={invalid} className={primaryButtonClass} style={controlStyle}
      data-testid="ns-preview">{NS_PREVIEW}</button>
  </div>
);

const NewStudyEditor: React.FC<Props> = ({ pack, onChange, onSave, onPreview, onBack }) => {
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const edit = (nextPack: StudyPack) => { setStatus('idle'); onChange(nextPack); };
  const { keys, move, remove, add } = useSectionActions(pack, edit);
  const problem = validateEdited(pack);

  const run = async (action: (p: StudyPack) => Promise<void>, doneStatus: 'saved' | 'idle') => {
    if (problem) { setStatus('error'); return; }
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
  const firstScripture = pack.sections.findIndex(s => s.kind === 'scripture');
  const shownError = problem ?? error;
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
        <div key={keys[i]} data-testid="ns-section" data-kind={section.kind} className="flex flex-col gap-3">
          <SectionToolbar heading={section.heading}
            canUp={canMoveUp(pack.sections, i)} canDown={canMoveDown(pack.sections, i)} canRemove={canRemove(pack.sections, i)}
            onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => remove(i)} />
          {i === firstScripture && <ScriptureRangeEditor pack={pack} onApply={edit} />}
          <SectionEditor section={section} onPatch={patch => edit(withSection(pack, i, patch))} />
        </div>
      ))}
      <AddSectionMenu sections={pack.sections} onAdd={add} />
      {shownError && <p role="alert" className="text-red-300" style={textStyle}>{shownError}</p>}
      {status === 'saved' && <p role="status" className="text-emerald-300" style={textStyle}>{NS_SAVED}</p>}
      <Footer invalid={!!problem} onBack={onBack} onSave={() => void run(onSave, 'saved')} onPreview={() => void run(onPreview, 'idle')} />
    </div>
  );
};

export default NewStudyEditor;

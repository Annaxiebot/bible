/**
 * AddSectionMenu.tsx — "添加段落 Add section" · 添加段落
 *
 * One toggle button opens the list of addable kinds (sectionRules.
 * ADDABLE_KINDS) labelled with the pack's own bilingual headings
 * (SECTION_HEADINGS). A kind the pack already holds once and may hold only
 * once is shown disabled. The new section lands at its allowed position
 * (packEdits.withAddedSection). Large type, ≥48px targets.
 */
import React, { useState } from 'react';
import { PackSection, SectionKind } from '../studypack/packTypes';
import { SECTION_HEADINGS } from './packAssembly';
import { ADDABLE_KINDS, canAdd } from './sectionRules';
import { NS_SECTION_ADD, NS_CANCEL } from './newStudyStrings';
import { controlStyle, secondaryButtonClass, quietButtonClass } from './newStudyStyles';

interface Props {
  sections: readonly PackSection[];
  onAdd: (kind: SectionKind) => void;
}

const AddSectionMenu: React.FC<Props> = ({ sections, onAdd }) => {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="ns-add-section"
        className={`${secondaryButtonClass} self-start`} style={controlStyle}>
        {NS_SECTION_ADD}
      </button>
    );
  }
  return (
    <div data-testid="ns-add-section-menu" className="flex flex-wrap gap-2" role="group" aria-label={NS_SECTION_ADD}>
      {ADDABLE_KINDS.map(kind => (
        <button key={kind} type="button" disabled={!canAdd(sections, kind)} data-testid={`ns-add-${kind}`}
          onClick={() => { setOpen(false); onAdd(kind); }}
          className={secondaryButtonClass} style={controlStyle}>
          {SECTION_HEADINGS[kind as keyof typeof SECTION_HEADINGS]}
        </button>
      ))}
      <button type="button" onClick={() => setOpen(false)} data-testid="ns-add-section-cancel"
        className={quietButtonClass} style={controlStyle}>
        {NS_CANCEL}
      </button>
    </div>
  );
};

export default AddSectionMenu;

/**
 * FirstTimeGuide.tsx — the first-visit "三步就好 Three steps" card · 新手三步
 *
 * One small card above the New-study form (no modal tour): ① pick a
 * passage, ② read/edit/Save, ③ present on the TV. NewStudyPage shows it
 * only while the visitor has no saved packs; "知道了 Got it" hides it for
 * good on this device (localStorage, STORAGE_KEYS.NEW_STUDY_GUIDE_DISMISSED).
 * Not in the leader-settings sync list: a leader who has packs never sees it.
 * Blocked storage still renders the card and still dismisses it for the
 * session. Large type (newStudyStyles), Chinese first (newStudyStrings).
 */
import React, { useState } from 'react';
import { STORAGE_KEYS, NEW_STUDY_GUIDE_DISMISSED_VALUE } from '../../constants/storageKeys';
import { NS_GUIDE_TITLE, NS_GUIDE_STEPS, NS_GUIDE_MARKS, NS_GUIDE_GOT_IT } from './newStudyStrings';
import { textStyle, controlStyle, secondaryButtonClass } from './newStudyStyles';


function guideDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.NEW_STUDY_GUIDE_DISMISSED) === NEW_STUDY_GUIDE_DISMISSED_VALUE;
  } catch {
    // Storage blocked (private mode): treat as not dismissed; the cost is the card showing again next visit.
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.NEW_STUDY_GUIDE_DISMISSED, NEW_STUDY_GUIDE_DISMISSED_VALUE);
  } catch {
    // Storage blocked: the card is already hidden for this session; it may return next visit, which is harmless.
  }
}

/** The card; `show` is NewStudyPage's verdict (form phase, packs loaded, none saved). */
const FirstTimeGuide: React.FC<{ show: boolean }> = ({ show }) => {
  const [dismissed, setDismissed] = useState(guideDismissed);
  if (!show || dismissed) return null;
  const gotIt = () => { setDismissed(true); rememberDismissed(); };
  return (
    <section data-testid="ns-guide" aria-label={NS_GUIDE_TITLE}
      className="flex flex-col gap-4 rounded-2xl border border-amber-500/40 bg-slate-900 p-6">
      <h2 className="font-bold text-amber-300" style={textStyle}>{NS_GUIDE_TITLE}</h2>
      <ol className="flex flex-col gap-2 text-slate-200" style={textStyle}>
        {NS_GUIDE_STEPS.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span aria-hidden="true" className="text-amber-300">{NS_GUIDE_MARKS[i]}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={gotIt} data-testid="ns-guide-got-it"
        className={`${secondaryButtonClass} self-start`} style={controlStyle}>
        {NS_GUIDE_GOT_IT}
      </button>
    </section>
  );
};

export default FirstTimeGuide;

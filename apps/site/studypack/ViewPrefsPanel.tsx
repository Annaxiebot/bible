/**
 * ViewPrefsPanel.tsx — the TV view's 显示偏好 panel · 显示偏好
 *
 * One small overlay (minimalist: a checkbox list + one order toggle) where
 * any viewer — leader or member — tailors how this device shows the pack:
 * hide optional sections, swap the 中/英 line order. Pure view-time prefs
 * (shared/studypack/packPrefs); the stored pack never changes.
 */
import React from 'react';
import { HIDEABLE_KINDS, type HideableKind, type ViewPrefs } from '../../../shared/studypack/packPrefs';
import { SECTION_HEADINGS } from '../newstudy/packAssembly';
import { VP_TITLE, VP_NOTE, VP_SECTIONS, VP_ORDER, VP_ORDER_ZH_FIRST, VP_ORDER_EN_FIRST, VP_CLOSE } from './prefsStrings';

interface Props {
  prefs: ViewPrefs;
  onChange: (prefs: ViewPrefs) => void;
  onClose: () => void;
}

const ViewPrefsPanel: React.FC<Props> = ({ prefs, onChange, onClose }) => {
  const toggleKind = (kind: HideableKind, show: boolean) =>
    onChange({ ...prefs, hidden: show ? prefs.hidden.filter(k => k !== kind) : [...prefs.hidden, kind] });
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60" data-testid="vp-panel"
      onClick={onClose}>
      <div role="dialog" aria-label={VP_TITLE} onClick={e => e.stopPropagation()}
        className="max-h-[80vh] w-[min(90vw,30rem)] overflow-y-auto rounded-2xl border border-stl-border bg-stl-bg p-6 text-stl-text"
        style={{ fontSize: '2.4vh' }}>
        <h2 className="font-bold text-stl-gold" style={{ fontSize: '3vh' }}>{VP_TITLE}</h2>
        <p className="mt-1 text-stl-text-3" style={{ fontSize: '1.8vh' }}>{VP_NOTE}</p>
        <h3 className="mt-4 font-semibold text-stl-text-2">{VP_SECTIONS}</h3>
        <div className="mt-2 flex flex-col gap-2">
          {HIDEABLE_KINDS.map(kind => (
            <label key={kind} className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-amber-400" data-testid={`vp-kind-${kind}`}
                checked={!prefs.hidden.includes(kind)} onChange={e => toggleKind(kind, e.target.checked)} />
              <span>{SECTION_HEADINGS[kind]}</span>
            </label>
          ))}
        </div>
        <h3 className="mt-4 font-semibold text-stl-text-2">{VP_ORDER}</h3>
        <div className="mt-2 flex gap-4">
          {([false, true] as const).map(enFirst => (
            <label key={String(enFirst)} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="vp-order" className="h-5 w-5 accent-amber-400"
                data-testid={enFirst ? 'vp-order-en' : 'vp-order-zh'}
                checked={prefs.enFirst === enFirst} onChange={() => onChange({ ...prefs, enFirst })} />
              <span>{enFirst ? VP_ORDER_EN_FIRST : VP_ORDER_ZH_FIRST}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={onClose} data-testid="vp-close"
          className="mt-6 rounded-full border border-stl-border px-6 py-2 text-stl-text-2 hover:text-stl-gold-hover">
          {VP_CLOSE}
        </button>
      </div>
    </div>
  );
};

export default ViewPrefsPanel;

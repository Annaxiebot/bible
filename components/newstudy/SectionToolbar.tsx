/**
 * SectionToolbar.tsx — move up / move down / remove for one section · 段落工具条
 *
 * Buttons are offered only when sectionRules allows the step (disabled
 * otherwise); Remove asks inline — a bilingual line with 确定 / 取消 — never
 * window.confirm. Renders nothing for a section that can do none of these
 * (title, scripture, qr). Large type, ≥48px targets.
 */
import React, { useState } from 'react';
import {
  NS_SECTION_UP, NS_SECTION_DOWN, NS_SECTION_REMOVE, NS_SECTION_REMOVE_CONFIRM, NS_CONFIRM, NS_CANCEL,
} from './newStudyStrings';
import { textStyle, controlStyle, quietButtonClass, secondaryButtonClass } from './newStudyStyles';

export interface SectionToolbarProps {
  heading: string;
  canUp: boolean;
  canDown: boolean;
  canRemove: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}

const SectionToolbar: React.FC<SectionToolbarProps> = ({ heading, canUp, canDown, canRemove, onUp, onDown, onRemove }) => {
  const [confirming, setConfirming] = useState(false);
  if (!canUp && !canDown && !canRemove) return null;
  return (
    <div data-testid="ns-section-toolbar" className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onUp} disabled={!canUp} aria-label={`${NS_SECTION_UP}: ${heading}`}
        data-testid="ns-section-up" className={`${quietButtonClass} disabled:opacity-40`} style={controlStyle}>
        {NS_SECTION_UP}
      </button>
      <button type="button" onClick={onDown} disabled={!canDown} aria-label={`${NS_SECTION_DOWN}: ${heading}`}
        data-testid="ns-section-down" className={`${quietButtonClass} disabled:opacity-40`} style={controlStyle}>
        {NS_SECTION_DOWN}
      </button>
      {canRemove && !confirming && (
        <button type="button" onClick={() => setConfirming(true)} aria-label={`${NS_SECTION_REMOVE}: ${heading}`}
          data-testid="ns-section-remove" className={quietButtonClass} style={controlStyle}>
          {NS_SECTION_REMOVE}
        </button>
      )}
      {canRemove && confirming && (
        <span className="flex flex-wrap items-center gap-2" data-testid="ns-section-remove-confirm">
          <span className="text-amber-300" style={textStyle}>{NS_SECTION_REMOVE_CONFIRM}</span>
          <button type="button" onClick={() => { setConfirming(false); onRemove(); }}
            aria-label={`${NS_CONFIRM}: ${heading}`} data-testid="ns-section-remove-yes"
            className={secondaryButtonClass} style={controlStyle}>
            {NS_CONFIRM}
          </button>
          <button type="button" onClick={() => setConfirming(false)} aria-label={`${NS_CANCEL}: ${heading}`}
            data-testid="ns-section-remove-no" className={quietButtonClass} style={controlStyle}>
            {NS_CANCEL}
          </button>
        </span>
      )}
    </div>
  );
};

export default SectionToolbar;

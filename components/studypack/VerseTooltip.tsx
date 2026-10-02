/**
 * VerseTooltip.tsx — interactive verse reference in an AI answer · 经文提示
 *
 * Hover (mouse) or click/tap toggles a popover with the verse text from the
 * pack's embedded passage, CUV + WEB, sized for TV reading.
 */
import React, { useState } from 'react';
import { PackVerse } from './packTypes';

const tooltipTextStyle: React.CSSProperties = { fontSize: '2.5vh', lineHeight: 1.4 };

export interface VerseTooltipProps {
  label: string;        // the reference as written, e.g. "v.26"
  verses: PackVerse[];  // resolved pack verses (non-empty)
}

const VerseTooltip: React.FC<VerseTooltipProps> = ({ label, verses }) => {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-block text-amber-300 underline decoration-dotted cursor-help"
      data-testid="verse-ref"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
    >
      {label}
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 mb-[1vh] w-[46vw] max-h-[40vh] overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg p-[1.5vh] z-50 shadow-xl block cursor-default"
        >
          {verses.map(v => (
            <span key={v.num} className="block mb-[1vh] text-slate-100" style={tooltipTextStyle}>
              <span className="text-amber-400 mr-2">{v.num}</span>
              {v.cuv}
              <span className="block text-slate-300">{v.web}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
};

export default VerseTooltip;

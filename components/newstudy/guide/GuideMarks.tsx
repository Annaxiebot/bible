/**
 * GuideMarks.tsx — where a study-guide pack's section came from · 讲义来源标记 (ADR-0019 §4–5)
 *
 * Around one section's editor in a pack made from a guide: a small label —
 * "讲义原文 · From the guide" or "AI 补充 · AI-drafted" (ADR-0003 §7: our layers
 * are visibly ours) — and, under the control, every line the AI attributed to
 * the guide that is not word for word in it, flagged "与讲义原文不符 · not
 * word-for-word from the guide". A flag goes away once the leader edits that
 * line. Sections without an origin render unchanged.
 */
import React from 'react';
import type { PackSection } from '../../studypack/packTypes';
import { stillNotVerbatim } from './guidePack';
import { GD_FROM_GUIDE, GD_AI_DRAFTED, notVerbatimLine } from './guideStrings';
import { textStyle } from '../newStudyStyles';

const GuideMarks: React.FC<{ section: PackSection; children: React.ReactNode }> = ({ section, children }) => {
  if (!section.origin) return <>{children}</>;
  const flagged = stillNotVerbatim(section);
  const fromGuide = section.origin === 'guide';
  return (
    <div className="flex flex-col gap-2">
      <span data-testid="ns-origin" data-origin={section.origin} style={textStyle}
        className={`self-start rounded px-2 ${fromGuide ? 'bg-amber-400/15 text-amber-200' : 'bg-slate-700 text-slate-300'}`}>
        {fromGuide ? GD_FROM_GUIDE : GD_AI_DRAFTED}
      </span>
      {children}
      {flagged.length > 0 && (
        <ul data-testid="ns-not-verbatim" className="flex flex-col gap-1 text-red-300" style={textStyle}>
          {flagged.map(line => <li key={line}>{notVerbatimLine(line)}</li>)}
        </ul>
      )}
    </div>
  );
};

export default GuideMarks;

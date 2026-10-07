/**
 * GuideMarks.tsx — where a study-guide pack's section came from · 讲义来源标记 (ADR-0019 §4–5)
 *
 * Around one section's editor in a pack made from a guide: a small label —
 * "讲义原文 · From the guide" or "AI 补充 · AI-drafted" (ADR-0003 §7: our layers
 * are visibly ours) — and, under the control, every line the AI attributed to
 * the guide that is not word for word in it, flagged "与讲义原文不符 · not
 * word-for-word from the guide". A flag goes away once the leader edits that
 * line. Lines that look like the guide's leader-only answers are flagged
 * "疑似带领者答案 · looks like a leader's answer" the same way (ADR-0019
 * amendment). Sections without an origin render unchanged.
 * GuidePassageNotice: above the range editor, when the AI read a different
 * passage in the guide than the pack uses — quiet, the leader decides.
 */
import React from 'react';
import type { PackSection, StudyPack } from '../../studypack/packTypes';
import { stillNotVerbatim, stillLeaderAnswers } from './guidePack';
import { GD_FROM_GUIDE, GD_AI_DRAFTED, notVerbatimLine, leaderAnswerLine, passageMismatchLine } from './guideStrings';
import { rangeKey } from './guidePassage';
import { packRange } from '../scriptureRange';
import { passageLabel } from '../packAssembly';
import { textStyle } from '../newStudyStyles';

const GuideMarks: React.FC<{ section: PackSection; children: React.ReactNode }> = ({ section, children }) => {
  if (!section.origin) return <>{children}</>;
  const flagged = stillNotVerbatim(section);
  const answers = stillLeaderAnswers(section);
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
      {answers.length > 0 && (
        <ul data-testid="ns-leader-answer" className="flex flex-col gap-1 text-red-300" style={textStyle}>
          {answers.map(line => <li key={line}>{leaderAnswerLine(line)}</li>)}
        </ul>
      )}
    </div>
  );
};

/** "讲义似乎在讲 X，这里用的是 Y" when the AI's reading of the guide and the pack's passage differ; else nothing. */
export const GuidePassageNotice: React.FC<{ pack: StudyPack }> = ({ pack }) => {
  const used = packRange(pack);
  if (!pack.guidePassage || !used || rangeKey(pack.guidePassage) === rangeKey(used)) return null;
  return (
    <p data-testid="ns-guide-mismatch" className="text-amber-200" style={textStyle}>
      {passageMismatchLine(passageLabel(pack.guidePassage), passageLabel(used))}
    </p>
  );
};

export default GuideMarks;

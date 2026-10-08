/**
 * MoreOptions.tsx — the New-study form's "更多选项 · More options" fold · 更多选项
 *
 * Owner: content language, lesson title, lesson number and date took half
 * the form, yet most leaders keep the defaults. They sit behind one quiet
 * line that also shows their current values in grey ("中文为主 · 第4课 ·
 * 2026-10-07"), so nothing changes behind the leader's back; one click
 * opens them.
 */
import React, { useState } from 'react';
import type { StudyRequest } from './packAssembly';
import { NS_MORE_OPTIONS, NS_CONTENT_LANGUAGE_SHORT } from './newStudyStrings';
import { textStyle, controlStyle } from './newStudyStyles';

/** "中文为主 · 第4课 · 恩典 · 2026-10-07": the folded fields' current values, empty parts left out. */
export function optionsSummary(req: StudyRequest): string {
  const lesson = req.lessonNumber ? `第${req.lessonNumber}课` : '';
  const title = req.lessonTitle?.trim() ?? '';
  return [NS_CONTENT_LANGUAGE_SHORT[req.contentLanguage], lesson, title, req.date].filter(Boolean).join(' · ');
}

const MoreOptions: React.FC<{ summary: string; children: React.ReactNode }> = ({ summary, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="ns-more"
        className="flex flex-wrap items-baseline gap-x-3 self-start text-left text-slate-300 hover:text-slate-100" style={controlStyle}>
        <span className="underline underline-offset-4">{open ? '▾' : '▸'} {NS_MORE_OPTIONS}</span>
        {!open && <span className="text-slate-500" style={textStyle} data-testid="ns-more-summary">{summary}</span>}
      </button>
      {/* Kept in the page while folded (hidden), so the form keeps its values and fields either way. */}
      <div hidden={!open} className="flex flex-col gap-5" data-testid="ns-more-fields">{children}</div>
    </div>
  );
};

export default MoreOptions;

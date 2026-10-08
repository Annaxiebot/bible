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

/** The header row: larger than body text so the fold is easy to see and tap (owner). */
const headerStyle: React.CSSProperties = { ...controlStyle, fontSize: Number(textStyle.fontSize) * 1.15, minHeight: 56 };

const MoreOptions: React.FC<{ summary: string; children: React.ReactNode }> = ({ summary, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-700" data-testid="ns-more-box">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="ns-more"
        className="flex w-full flex-wrap items-center gap-x-3 px-4 py-3 text-left text-slate-200 hover:text-white" style={headerStyle}>
        <span aria-hidden="true" className="text-amber-300" style={{ fontSize: '1.2em' }}>{open ? '▾' : '▸'}</span>
        <span className="font-semibold">{NS_MORE_OPTIONS}</span>
        <span className="text-slate-500" style={textStyle} data-testid="ns-more-summary">— {summary}</span>
      </button>
      {/* Kept in the page while folded so the form keeps its values. The display class must be off when
          folded: a "flex" class beats the hidden attribute (the first version never hid — owner report). */}
      <div className={open ? 'flex flex-col gap-5 border-t border-slate-700 p-4' : 'hidden'} data-testid="ns-more-fields">{children}</div>
    </div>
  );
};

export default MoreOptions;

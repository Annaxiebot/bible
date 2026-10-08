/**
 * PackRowParts.tsx — the pieces of a study row, design B · 查经包行的组成 (owner's pick)
 *
 * Shared by "我的查经包 My packs" (New study) and the leader home, so both
 * lists look alike (R3): a gold date tile, the Chinese title bold with the
 * English lighter, the passage as a gold chip, one gold action, one
 * outlined action, and a quiet trash icon for delete.
 */
import React from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { textStyle, controlStyle } from '../newstudy/newStudyStyles';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The row: date tile · heading · actions; lifts on hover. */
export const studyRowClass =
  'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-b border-stl-border px-2 py-3 hover:bg-stl-surface';
/** The row's one gold action. */
export const goldButtonClass =
  'inline-flex items-center rounded-lg bg-stl-gold px-4 font-semibold text-stl-bg hover:bg-stl-gold-hover';
/** The row's secondary action. */
export const outlineButtonClass =
  'inline-flex items-center rounded-lg border border-stl-border px-4 text-stl-text hover:border-stl-gold hover:text-stl-gold-hover';
/** A rarely used action: a quiet text link. */
export const quietRowLinkClass = 'inline-flex items-center px-2 text-stl-text-2 underline underline-offset-4 hover:text-stl-text';

/** "第2课 家庭查经 Family Bible Study — 箴言 2:1–22" → { zh: "第2课 家庭查经", en: "Family Bible Study" }: the passage (shown as a chip) is dropped. */
export function titleParts(pack: Pick<StudyPack, 'title' | 'passageRef'>): { zh: string; en: string } {
  const zhRef = pack.passageRef.split(' · ')[0];
  const title = pack.title.replace(new RegExp(`\\s*[—-]\\s*${zhRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim();
  const firstLatin = title.search(/\s[A-Za-z]/);
  if (firstLatin < 0 || /^[A-Za-z]/.test(title)) return { zh: title, en: '' };
  return { zh: title.slice(0, firstLatin).trim(), en: title.slice(firstLatin).trim() };
}

/** "2026-10-06" → a tile: 06 over "10月 Oct". */
export const DateTile: React.FC<{ date: string }> = ({ date }) => {
  const [, month, day] = /^\d{4}-(\d{2})-(\d{2})/.exec(date) ?? [];
  return (
    <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-stl-surface-2 py-1" title={date} data-testid="date-tile">
      <span className="font-bold leading-tight text-stl-gold" style={{ fontSize: Number(textStyle.fontSize) * 1.3 }}>{day ?? '—'}</span>
      <span className="text-stl-text-2" style={{ fontSize: Number(textStyle.fontSize) * 0.65 }}>
        {month ? `${Number(month)}月 ${MONTHS_EN[Number(month) - 1]}` : date}
      </span>
    </div>
  );
};

/** Bold Chinese title, lighter English beside it, the passage as a gold chip under them. */
export const StudyHeading: React.FC<{ pack: Pick<StudyPack, 'title' | 'passageRef'>; children?: React.ReactNode }> = ({ pack, children }) => {
  const { zh, en } = titleParts(pack);
  return (
    <div className="flex min-w-[15rem] flex-1 basis-60 flex-col gap-1">
      <span className="text-stl-text" style={textStyle}>
        <span className="font-bold">{zh}</span>{en && <>{' '}<span className="ml-1 text-stl-text-2">{en}</span></>}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-stl-gold-dim px-3 text-stl-gold-hover" style={{ fontSize: Number(textStyle.fontSize) * 0.8 }}>
          {pack.passageRef.split(' · ')[0]}
        </span>
        {children}
      </span>
    </div>
  );
};

/** Delete as a quiet trash icon (its name stays readable to screen readers and tests). */
export const TrashButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button type="button" onClick={onClick} aria-label={label} title={label}
    className="inline-flex items-center justify-center rounded-lg px-3 text-stl-text-3 hover:text-red-300" style={controlStyle}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  </button>
);

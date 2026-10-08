/**
 * PackListing.tsx — a leader's studies as a short, searchable list · 查经包列表
 *
 * Shared by "我的查经包 My packs" on New study and by the leader home (one
 * copy, R3): newest first (study date, then last save), the newest
 * PACK_LIST_PREVIEW shown with "显示全部 N 个 · Show all N", and from
 * PACK_SEARCH_FROM studies a search box over title, passage and date (a
 * leader may keep hundreds). Each page renders its own row.
 */
import React, { useState } from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { NS_SHOW_ALL, NS_SHOW_FEWER, NS_SEARCH_PACKS, NS_SEARCH_NONE } from '../newstudy/newStudyStrings';
import { textStyle, controlStyle } from '../newstudy/newStudyStyles';

/** How many studies show before "显示全部 · Show all". */
export const PACK_LIST_PREVIEW = 5;
/** From this many studies a search box appears. */
export const PACK_SEARCH_FROM = 8;

/** Newest first: study date, then last save. */
export function newestFirst(packs: readonly StudyPack[]): StudyPack[] {
  const key = (p: StudyPack) => `${p.date} ${p.updatedAt ?? ''}`;
  return [...packs].sort((x, y) => (key(y) > key(x) ? 1 : key(y) < key(x) ? -1 : 0));
}

/** Studies whose title, passage (Chinese or English) or date contains the query; case-insensitive. */
export function searchPacks(packs: readonly StudyPack[], query: string): StudyPack[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...packs];
  return packs.filter(p => `${p.title} ${p.passageRef} ${p.date}`.toLowerCase().includes(q));
}

/** "约翰福音 4:27–42 · John 4:27–42 · 2026-10-05", leaving out the passage when the title already names it. */
export function packMetaLine(pack: Pick<StudyPack, 'title' | 'passageRef' | 'date'>): string {
  const zhRef = pack.passageRef.split(' · ')[0];
  return pack.title.includes(zhRef) ? pack.date : `${pack.passageRef} · ${pack.date}`;
}

const quietLink = 'self-start text-stl-text-2 underline underline-offset-4 hover:text-stl-text';

interface Props {
  packs: readonly StudyPack[];
  renderRow: (pack: StudyPack) => React.ReactNode;
}

export const PackListing: React.FC<Props> = ({ packs, renderRow }) => {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const sorted = searchPacks(newestFirst(packs), query);
  const searching = query.trim() !== '';
  const shown = showAll || searching ? sorted : sorted.slice(0, PACK_LIST_PREVIEW);
  return (
    <>
      {packs.length >= PACK_SEARCH_FROM && (
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} data-testid="pack-search"
          placeholder={NS_SEARCH_PACKS} aria-label={NS_SEARCH_PACKS}
          className="rounded-lg border border-stl-border bg-stl-surface px-4 text-stl-text" style={controlStyle} />
      )}
      {searching && sorted.length === 0 && <p className="text-stl-text-2" style={textStyle}>{NS_SEARCH_NONE}</p>}
      <ul className="flex flex-col border-t border-stl-border">{shown.map(renderRow)}</ul>
      {!searching && sorted.length > PACK_LIST_PREVIEW && (
        <button type="button" onClick={() => setShowAll(v => !v)} data-testid="pack-show-all" className={quietLink} style={controlStyle}>
          {showAll ? NS_SHOW_FEWER : NS_SHOW_ALL(sorted.length)}
        </button>
      )}
    </>
  );
};

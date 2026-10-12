/**
 * PackListing.tsx — a leader's studies as a short, searchable list · 查经包列表
 *
 * Shared by "我的查经包 My packs" on New study and by the leader home (one
 * copy, R3): newest first (study date, then last save), the newest
 * PACK_LIST_PREVIEW shown with "显示全部 N 个 · Show all N", and from
 * PACK_SEARCH_FROM studies a search box over title, passage and date (a
 * leader may keep hundreds; the box and the match rule are ListSearch's,
 * shared with the admin's leaders list). Each page renders its own row.
 */
import React, { useState } from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { NS_SHOW_ALL, NS_SHOW_FEWER, NS_SEARCH_PACKS, NS_SEARCH_NONE } from '../newstudy/newStudyStrings';
import { textStyle, controlStyle } from '../newstudy/newStudyStyles';
import { LIST_SEARCH_FROM, filterByQuery, ListSearchBox } from './ListSearch';

/** How many studies show before "显示全部 · Show all". */
export const PACK_LIST_PREVIEW = 5;
/** From this many studies a search box appears. */
export const PACK_SEARCH_FROM = LIST_SEARCH_FROM;

/** Newest first: study date, then last save. */
export function newestFirst(packs: readonly StudyPack[]): StudyPack[] {
  const key = (p: StudyPack) => `${p.date} ${p.updatedAt ?? ''}`;
  return [...packs].sort((x, y) => (key(y) > key(x) ? 1 : key(y) < key(x) ? -1 : 0));
}

/** Studies whose title, passage (Chinese or English) or date contains the query; case-insensitive. */
export function searchPacks(packs: readonly StudyPack[], query: string): StudyPack[] {
  return filterByQuery(packs, query, p => `${p.title} ${p.passageRef} ${p.date}`);
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
        <ListSearchBox value={query} onChange={setQuery} label={NS_SEARCH_PACKS} testId="pack-search" />
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

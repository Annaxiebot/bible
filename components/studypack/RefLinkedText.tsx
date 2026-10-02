/**
 * RefLinkedText.tsx — turn verse references in text into VerseTooltips.
 *
 * Shared by AskAnswer (AI answers) and TVSlide (slide body lines, e.g. the
 * cross-references and context slides): every recognizable reference becomes
 * clickable with a popup (ADR-0003 §8) — in-pack refs from the pack's
 * embedded verses, everything else lazily from the bundled Bible data.
 */
import React from 'react';
import { StudyPack } from './packTypes';
import { findVerseRefs, packBookId, packChapter } from './verseRefs';
import { planRef } from './externalVerses';
import { bilingualRefLabel } from './refLabel';
import VerseTooltip from './VerseTooltip';

/** One string → text fragments interleaved with verse-ref tooltips. */
export function linkifyString(text: string, pack: StudyPack): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  const bookId = packBookId(pack);
  const chapter = packChapter(pack);
  findVerseRefs(text).forEach((ref, i) => {
    if (ref.index > cursor) out.push(text.slice(cursor, ref.index));
    const plan = planRef(ref, pack);
    out.push(plan
      ? <VerseTooltip key={i} label={ref.text} title={bilingualRefLabel(ref, bookId, chapter)}
          verses={plan.verses} load={plan.load} />
      : <span key={i} className="text-amber-200">{ref.text}</span>);
    cursor = ref.index + ref.length;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/** Linkify every string child; other nodes pass through untouched. */
export function linkifyChildren(children: React.ReactNode, pack: StudyPack): React.ReactNode {
  return React.Children.map(children, child =>
    typeof child === 'string' ? linkifyString(child, pack) : child
  );
}

const RefLinkedText: React.FC<{ text: string; pack: StudyPack }> = ({ text, pack }) => (
  <>{linkifyString(text, pack)}</>
);

export default RefLinkedText;

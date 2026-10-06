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
import { VerseRef, findVerseRefs, packBookId, packChapter } from './verseRefs';
import { planRef } from './externalVerses';
import { bilingualRefLabel } from './refLabel';
import VerseTooltip from './VerseTooltip';
import { NO_SUCH_VERSE_MARK } from './tvHints';
import { TYPE_SCALE } from './principles';

/** Smaller than the answer, never below the smallest TV text (the popup floor). */
const markStyle: React.CSSProperties = { fontSize: `max(${TYPE_SCALE.popup}, 0.75em)` };

/** A reference that does not exist (citations.ts): the text as written + a muted mark, no popover. */
const InvalidRef: React.FC<{ text: string }> = ({ text }) => (
  <span data-testid="invalid-ref">
    {text}
    <span className="text-stl-text-3" style={markStyle} data-testid="no-such-verse">{NO_SUCH_VERSE_MARK}</span>
  </span>
);

const NONE: ReadonlySet<string> = new Set();

/** A ref that resolves: a popover; one whose target cannot be determined: plain amber text. */
function refTooltip(ref: VerseRef, key: number, pack: StudyPack, bookId: string | null, chapter: number | null): React.ReactNode {
  const plan = planRef(ref, pack);
  return plan
    ? <VerseTooltip key={key} label={ref.text} title={bilingualRefLabel(ref, bookId, chapter)}
        verses={plan.verses} load={plan.load} />
    : <span key={key} className="text-amber-200">{ref.text}</span>;
}

/**
 * One string → text fragments interleaved with verse-ref tooltips. Refs in
 * `invalid` (as written) render as InvalidRef instead.
 */
export function linkifyString(text: string, pack: StudyPack, invalid: ReadonlySet<string> = NONE): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  const bookId = packBookId(pack);
  const chapter = packChapter(pack);
  findVerseRefs(text).forEach((ref, i) => {
    if (ref.index > cursor) out.push(text.slice(cursor, ref.index));
    out.push(invalid.has(ref.text)
      ? <InvalidRef key={i} text={ref.text} />
      : refTooltip(ref, i, pack, bookId, chapter));
    cursor = ref.index + ref.length;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/** Linkify every string child; other nodes pass through untouched. */
export function linkifyChildren(
  children: React.ReactNode, pack: StudyPack, invalid: ReadonlySet<string> = NONE,
): React.ReactNode {
  return React.Children.map(children, child =>
    typeof child === 'string' ? linkifyString(child, pack, invalid) : child
  );
}

const RefLinkedText: React.FC<{ text: string; pack: StudyPack }> = ({ text, pack }) => (
  <>{linkifyString(text, pack)}</>
);

export default RefLinkedText;

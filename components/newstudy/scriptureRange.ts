/**
 * scriptureRange.ts — change a pack's verse range without regenerating · 更改经文范围
 *
 * `packRange` reads the current range back from the pack (book/chapter from
 * passageRef via verseRefs, verses from the scripture section itself).
 * `applyScriptureRange` reloads the passage from the bundled 和合本 + BSB
 * through generatePack.loadPassage (the single source of passage text,
 * ADR-0003 §4), rebuilds the scripture section in place (packAssembly.
 * scriptureSection, same heading shape), and updates passageRef, the title
 * slide's passage line and the pack title's passage part. Every other
 * section — all AI-written content — is the very same object as before.
 * Failures throw the bilingual loadPassage errors (unavailable / out of range).
 */
import { StudyPack, PackSection, PackVerse } from '../studypack/packTypes';
import { packBookId, packChapter } from '../studypack/verseRefs';
import { loadPassage } from './generatePack';
import { VerseRange, scriptureSection, passageLabel } from './packAssembly';
import { withTitle } from './packEdits';

/** The pack's current range, or null when the pack has no scripture section / recognizable passageRef. */
export function packRange(pack: StudyPack): VerseRange | null {
  const bookId = packBookId(pack);
  const chapter = packChapter(pack);
  const verses = pack.sections.find(s => s.kind === 'scripture')?.verses;
  if (!bookId || chapter === null || !verses || verses.length === 0) return null;
  return { bookId, chapter, verseFrom: verses[0].num, verseTo: verses[verses.length - 1].num };
}

/** The title slide's first body line is the passage ref; swap it when it still is the old one. */
function titleBody(section: PackSection, oldRef: string, newRef: string): PackSection {
  if (section.kind !== 'title' || section.body?.[0] !== oldRef) return section;
  return { ...section, body: [newRef, ...section.body.slice(1)] };
}

/**
 * Pure rebuild once the verses are loaded: the first scripture section is
 * replaced (its key phrase kept), any further scripture sections are dropped
 * (slides chunk one section automatically), nothing else is touched.
 */
export function withScripture(pack: StudyPack, range: VerseRange, verses: PackVerse[]): StudyPack {
  const first = pack.sections.findIndex(s => s.kind === 'scripture');
  if (first === -1) throw new Error('StudyPack has no scripture section to rebuild');
  const rebuilt = scriptureSection(range, verses, pack.sections[first].keyPhrase);
  const newRef = passageLabel(range).ref;
  const sections = pack.sections
    .filter((s, i) => s.kind !== 'scripture' || i === first)
    .map(s => (s.kind === 'scripture' ? rebuilt : titleBody(s, pack.passageRef, newRef)));
  const next = { ...pack, passageRef: newRef, sections };
  const heading = next.sections.find(s => s.kind === 'title')?.heading;
  return heading === undefined ? next : withTitle(next, heading);
}

export async function applyScriptureRange(pack: StudyPack, range: VerseRange): Promise<StudyPack> {
  const verses = await loadPassage(range);
  return withScripture(pack, range, verses);
}

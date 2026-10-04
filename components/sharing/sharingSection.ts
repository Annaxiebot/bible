/**
 * sharingSection.ts — the "sharing" pack section and where it goes · 上周分享段落
 *
 * ADR-0008. The section is an ordinary body section (the editor's generic
 * lines textarea edits it; buildSlides continues it over several slides
 * when long). Body lines, in order:
 *   themes (2–3) → quotes as 「…」 (0–3) → the practice-count line → the
 *   opening question (always the LAST line).
 * With no shared answers the body is the practice-count line alone.
 * It is inserted right after the title (sectionRules.SHARING_INDEX), so
 * it is slide 2; a second run replaces the first.
 */
import type { PackSection, StudyPack } from '../studypack/packTypes';
import { SHARING_INDEX, insertItem } from '../newstudy/sectionRules';
import type { SharingDraft } from './sharingReply';
import { SHARING_HEADING, PracticeCount, practiceCountLine, quoteLine } from './sharingStrings';

/** Quote marks the model may have added itself; the section adds its own 「」. */
const OUTER_QUOTES = /^[「『“"']+|[」』”"']+$/g;

export function sharingSection(draft: SharingDraft | null, practices: readonly PracticeCount[]): PackSection {
  const counts = practices.length ? [practiceCountLine(practices)] : [];
  if (!draft) return { kind: 'sharing', heading: SHARING_HEADING, body: counts };
  const quotes = draft.quotes.map(q => quoteLine(q.replace(OUTER_QUOTES, '').trim()));
  return { kind: 'sharing', heading: SHARING_HEADING, body: [...draft.themes, ...quotes, ...counts, draft.question] };
}

/** The pack with `section` right after the title, replacing an earlier sharing section. */
export function withSharingSection(pack: StudyPack, section: PackSection): StudyPack {
  const rest = pack.sections.filter(s => s.kind !== 'sharing');
  return { ...pack, sections: insertItem(rest, SHARING_INDEX, section) };
}

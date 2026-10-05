/**
 * packEdits.ts — pure edits and validation of a pack in the editor · 编辑操作
 *
 * Every change the editor makes is a function here: title, one section's
 * patch, move/remove/add (section order delegated to sectionRules), and the
 * validation that gates Save/Preview. No React, so the tests and the range
 * change (scriptureRange) import it without rendering.
 */
import { StudyPack, PackSection, SectionKind, parseStudyPack } from '../studypack/packTypes';
import { NS_ERR_EMPTY_QUESTION, NS_ERR_INVALID } from './newStudyStrings';
import {
  validateSectionOrder, moveItem, removeItem, insertItem, insertPosition, defaultSection,
} from './sectionRules';

/** Validation before saving. Returns the bilingual problem, or null. */
export function validateEdited(pack: StudyPack): string | null {
  const discussions = pack.sections.filter(s => s.kind === 'discussion');
  if (discussions.some(d => d.questions?.some(q => q.trim().length === 0))) return NS_ERR_EMPTY_QUESTION;
  const order = validateSectionOrder(pack.sections);
  if (order) return order;
  try {
    parseStudyPack(pack);
    return null;
  } catch (err) {
    return `${NS_ERR_INVALID}: ${(err as Error).message}`;
  }
}

/** The title slide's heading edits pack.title too ("<heading> — <中文 passage ref>"). */
export function withTitle(pack: StudyPack, heading: string): StudyPack {
  const sections = pack.sections.map(s => (s.kind === 'title' ? { ...s, heading } : s));
  return { ...pack, title: `${heading} — ${pack.passageRef.split(' · ')[0]}`, sections };
}

export function withSection(pack: StudyPack, index: number, patch: Partial<PackSection>): StudyPack {
  return { ...pack, sections: pack.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
}

export function withMovedSection(pack: StudyPack, index: number, dir: -1 | 1): StudyPack {
  return { ...pack, sections: moveItem(pack.sections, index, dir) };
}

export function withoutSection(pack: StudyPack, index: number): StudyPack {
  return { ...pack, sections: removeItem(pack.sections, index) };
}

/** Add a default section of `kind` at its allowed position; returns that position too (for stable keys). */
export function withAddedSection(pack: StudyPack, kind: SectionKind): { pack: StudyPack; at: number } {
  const at = insertPosition(pack.sections, kind);
  return { pack: { ...pack, sections: insertItem(pack.sections, at, defaultSection(kind)) }, at };
}

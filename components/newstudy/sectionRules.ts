/**
 * sectionRules.ts — what the editor may do to a pack's section list · 段落规则
 *
 * One pure module holds every ordering constraint: the title is first,
 * an optional last-week sharing section sits right after it (ADR-0008;
 * fixed in place, removable, never added from the menu), scripture
 * follows (one or more, in place), qr then closing
 * close the pack, lifeMenu/reflection/qr/closing appear at most once, and
 * title/scripture/qr can be neither added nor removed. The move/remove/add
 * predicates and operations below all derive from `validateSectionOrder`,
 * so the toolbar can never offer a step the validator would then reject.
 */
import { PackSection, SectionKind } from '../studypack/packTypes';
import { LIFE_AREAS } from '../studypack/principles';
import { SECTION_HEADINGS, PRIVACY_LINE, CLOSING_LEAD } from './packAssembly';
import {
  NS_ERR_TITLE_FIRST, NS_ERR_SCRIPTURE_PLACE, NS_ERR_TAIL, NS_ERR_DUPLICATE_SECTION, NS_ERR_SHARING_PLACE,
} from './newStudyStrings';

/** Kinds the leader may add or remove, in menu order. */
export const ADDABLE_KINDS: readonly SectionKind[] = [
  'context', 'originalLanguage', 'crossRefs', 'discussion', 'lifeMenu', 'reflection', 'closing',
];

/** Kinds that appear at most once in a pack. */
export const SINGLETON_KINDS: readonly SectionKind[] = ['lifeMenu', 'reflection', 'qr', 'closing'];

/** Kinds the leader may remove but not add from the menu (they are inserted by their own control). */
const REMOVE_ONLY_KINDS: readonly SectionKind[] = ['sharing'];

/** The sharing section's only allowed place: right after the title (so a second one is a place error too). */
export const SHARING_INDEX = 1;

/** Kinds that close the pack, in order: qr second-to-last, closing last (each optional). */
const TAIL_KINDS: readonly SectionKind[] = ['qr', 'closing'];

const isTail = (s: PackSection): boolean => TAIL_KINDS.includes(s.kind);
const isMovable = (s: PackSection): boolean =>
  s.kind !== 'title' && s.kind !== 'sharing' && s.kind !== 'scripture' && !isTail(s);

/** Index of the first tail section (qr/closing), or sections.length when there is none. */
function tailStart(sections: readonly PackSection[]): number {
  const i = sections.findIndex(isTail);
  return i === -1 ? sections.length : i;
}

/** Bilingual reason the order is not allowed, or null when it is. */
export function validateSectionOrder(sections: readonly PackSection[]): string | null {
  if (sections[0]?.kind !== 'title' || sections.some((s, i) => i > 0 && s.kind === 'title')) {
    return NS_ERR_TITLE_FIRST;
  }
  if (sections.some((s, i) => s.kind === 'sharing' && i !== SHARING_INDEX)) return NS_ERR_SHARING_PLACE;
  const scriptureStart = sections[SHARING_INDEX]?.kind === 'sharing' ? SHARING_INDEX + 1 : 1;
  const lastScripture = sections.map(s => s.kind).lastIndexOf('scripture');
  if (lastScripture !== -1 && sections.slice(scriptureStart, lastScripture + 1).some(s => s.kind !== 'scripture')) {
    return NS_ERR_SCRIPTURE_PLACE;
  }
  for (const kind of SINGLETON_KINDS) {
    if (sections.filter(s => s.kind === kind).length > 1) return NS_ERR_DUPLICATE_SECTION;
  }
  const tail = sections.slice(tailStart(sections)).map(s => s.kind);
  const expectedTail = TAIL_KINDS.filter(k => tail.includes(k));
  if (tail.join() !== expectedTail.join()) return NS_ERR_TAIL;
  return null;
}

export function canMoveUp(sections: readonly PackSection[], i: number): boolean {
  const s = sections[i];
  const above = sections[i - 1];
  return !!s && !!above && isMovable(s) && isMovable(above);
}

export function canMoveDown(sections: readonly PackSection[], i: number): boolean {
  return canMoveUp(sections, i + 1);
}

export function canRemove(sections: readonly PackSection[], i: number): boolean {
  const s = sections[i];
  return !!s && (ADDABLE_KINDS.includes(s.kind) || REMOVE_ONLY_KINDS.includes(s.kind));
}

export function canAdd(sections: readonly PackSection[], kind: SectionKind): boolean {
  if (!ADDABLE_KINDS.includes(kind)) return false;
  return !SINGLETON_KINDS.includes(kind) || !sections.some(s => s.kind === kind);
}

/** Swap item i with its neighbour (dir −1 = up, +1 = down). Generic so parallel key lists move alike. */
export function moveItem<T>(items: readonly T[], i: number, dir: -1 | 1): T[] {
  const next = [...items];
  const j = i + dir;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function removeItem<T>(items: readonly T[], i: number): T[] {
  return items.filter((_, j) => j !== i);
}

export function insertItem<T>(items: readonly T[], at: number, item: T): T[] {
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/**
 * Where a new section of `kind` goes: closing at the very end; everything
 * else just before the tail (qr/closing), i.e. after the last editable one.
 */
export function insertPosition(sections: readonly PackSection[], kind: SectionKind): number {
  return kind === 'closing' ? sections.length : tailStart(sections);
}

/**
 * A new section that parseStudyPack accepts: lifeMenu starts with the seven
 * areas (practices to be written), reflection with the app-owned privacy
 * line, closing with its lead line, discussion with one empty question (the
 * editor keeps Save disabled until it is written), the rest empty.
 */
export function defaultSection(kind: SectionKind): PackSection {
  const heading = SECTION_HEADINGS[kind as keyof typeof SECTION_HEADINGS];
  switch (kind) {
    case 'discussion': return { kind, heading, questions: [''] };
    case 'lifeMenu': return { kind, heading, rows: LIFE_AREAS.map(area => ({ area, practice: '' })) };
    case 'reflection': return { kind, heading, body: [PRIVACY_LINE] };
    case 'closing': return { kind, heading, body: [CLOSING_LEAD] };
    default: return { kind, heading, body: [] };
  }
}

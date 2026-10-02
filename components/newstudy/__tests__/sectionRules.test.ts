/**
 * sectionRules.test.ts — every ordering constraint, the move/remove/add
 * predicates, insert positions, and that every default section (and the
 * pack after any allowed step) still passes parseStudyPack.
 */
import { describe, it, expect } from 'vitest';
import { PackSection, SectionKind, parseStudyPack } from '../../studypack/packTypes';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import {
  validateSectionOrder, canMoveUp, canMoveDown, canRemove, canAdd, moveItem, removeItem, insertItem,
  insertPosition, defaultSection, ADDABLE_KINDS, SINGLETON_KINDS,
} from '../sectionRules';
import { validateEdited, withAddedSection, withMovedSection, withoutSection } from '../packEdits';
import {
  NS_ERR_TITLE_FIRST, NS_ERR_SCRIPTURE_PLACE, NS_ERR_TAIL, NS_ERR_DUPLICATE_SECTION, NS_ERR_EMPTY_QUESTION,
} from '../newStudyStrings';

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED));
const sections = pack.sections;
const kinds = (list: readonly PackSection[]) => list.map(s => s.kind);
const at = (kind: SectionKind) => sections.findIndex(s => s.kind === kind);

describe('validateSectionOrder', () => {
  it('accepts the assembled order', () => {
    expect(validateSectionOrder(sections)).toBeNull();
  });
  it('requires the title first and only once', () => {
    expect(validateSectionOrder(sections.slice(1))).toBe(NS_ERR_TITLE_FIRST);
    expect(validateSectionOrder([...sections, sections[0]])).toBe(NS_ERR_TITLE_FIRST);
  });
  it('keeps scripture directly after the title', () => {
    expect(validateSectionOrder(moveItem(sections, at('scripture'), 1))).toBe(NS_ERR_SCRIPTURE_PLACE);
    const two = insertItem(sections, 2, sections[1]);
    expect(validateSectionOrder(two)).toBeNull();
    expect(validateSectionOrder(moveItem(two, 2, 1))).toBe(NS_ERR_SCRIPTURE_PLACE);
  });
  it('keeps qr then closing as the last two, each optional', () => {
    expect(validateSectionOrder(moveItem(sections, at('qr'), -1))).toBe(NS_ERR_TAIL);
    expect(validateSectionOrder(moveItem(sections, at('qr'), 1))).toBe(NS_ERR_TAIL);
    expect(validateSectionOrder(removeItem(sections, at('closing')))).toBeNull();
    expect(validateSectionOrder(removeItem(sections, at('qr')))).toBeNull();
  });
  it('allows only one lifeMenu / reflection / qr / closing, several discussions', () => {
    for (const kind of SINGLETON_KINDS) {
      expect(validateSectionOrder(insertItem(sections, at(kind), sections[at(kind)]))).toBe(NS_ERR_DUPLICATE_SECTION);
    }
    expect(validateSectionOrder(insertItem(sections, at('discussion'), sections[at('discussion')]))).toBeNull();
  });
});

describe('canMoveUp / canMoveDown / canRemove / canAdd', () => {
  it('never moves title, scripture, qr or closing, nor anything across them', () => {
    for (const kind of ['title', 'scripture', 'qr', 'closing'] as const) {
      expect(canMoveUp(sections, at(kind))).toBe(false);
      expect(canMoveDown(sections, at(kind))).toBe(false);
    }
    expect(canMoveUp(sections, at('context'))).toBe(false);      // above it is scripture
    expect(canMoveDown(sections, at('reflection'))).toBe(false); // below it is qr
    expect(canMoveDown(sections, at('context'))).toBe(true);
    expect(canMoveUp(sections, at('discussion'))).toBe(true);
    expect(canMoveUp(sections, 0)).toBe(false);
    expect(canMoveDown(sections, sections.length - 1)).toBe(false);
  });
  it('removes only addable kinds', () => {
    for (const kind of ADDABLE_KINDS) expect(canRemove(sections, at(kind))).toBe(true);
    for (const kind of ['title', 'scripture', 'qr'] as const) expect(canRemove(sections, at(kind))).toBe(false);
    expect(canRemove(sections, 99)).toBe(false);
  });
  it('adds a singleton only when absent, a discussion always, fixed kinds never', () => {
    expect(canAdd(sections, 'lifeMenu')).toBe(false);
    expect(canAdd(removeItem(sections, at('lifeMenu')), 'lifeMenu')).toBe(true);
    expect(canAdd(sections, 'discussion')).toBe(true);
    expect(canAdd(sections, 'context')).toBe(true);
    for (const kind of ['title', 'scripture', 'qr'] as const) expect(canAdd(sections, kind)).toBe(false);
  });
});

describe('insertPosition / withAddedSection', () => {
  it('puts closing last and everything else just before qr', () => {
    const noClosing = removeItem(sections, at('closing'));
    expect(insertPosition(noClosing, 'closing')).toBe(noClosing.length);
    expect(insertPosition(sections, 'discussion')).toBe(at('qr'));
    const noTail = sections.filter(s => s.kind !== 'qr' && s.kind !== 'closing');
    expect(insertPosition(noTail, 'context')).toBe(noTail.length);
  });
  it('every added default validates (discussion needs its question written)', () => {
    for (const kind of ADDABLE_KINDS) {
      const base = SINGLETON_KINDS.includes(kind) ? withoutSection(pack, at(kind)) : pack;
      const { pack: next, at: pos } = withAddedSection(base, kind);
      expect(next.sections[pos]).toEqual(defaultSection(kind));
      expect(() => parseStudyPack(next)).not.toThrow();
      expect(validateSectionOrder(next.sections)).toBeNull();
      expect(validateEdited(next)).toBe(kind === 'discussion' ? NS_ERR_EMPTY_QUESTION : null);
    }
    expect(kinds(withAddedSection(pack, 'discussion').pack.sections).filter(k => k === 'discussion')).toHaveLength(2);
  });
});

describe('withMovedSection / withoutSection', () => {
  it('moves one step and keeps the pack valid', () => {
    const moved = withMovedSection(pack, at('discussion'), 1);
    expect(kinds(moved.sections).slice(5, 7)).toEqual(['lifeMenu', 'discussion']);
    expect(validateEdited(moved)).toBeNull();
    const removed = withoutSection(pack, at('originalLanguage'));
    expect(kinds(removed.sections)).not.toContain('originalLanguage');
    expect(validateEdited(removed)).toBeNull();
  });
  it('validateEdited flags an empty question in any discussion section, not only the first', () => {
    const second = withAddedSection(pack, 'discussion').pack;
    expect(validateEdited(second)).toBe(NS_ERR_EMPTY_QUESTION);
  });
});

/**
 * sharingSection.test.ts — the section, its place, parse and slides · 上周分享段落测试 (ADR-0008)
 */
import { describe, it, expect } from 'vitest';
import { sharingSection, withSharingSection } from '../sharingSection';
import { SHARING_HEADING, practiceCountLine, isQuoteLine } from '../sharingStrings';
import { buildSlides, parseStudyPack, PACK_SCHEMA_VERSION } from '../../studypack/packTypes';
import { MAX_BODY_LINES_PER_SLIDE } from '../../studypack/slideFit';
import { validateEdited } from '../../newstudy/packEdits';
import { validateSectionOrder, canMoveUp, canMoveDown, canRemove, canAdd, moveItem } from '../../newstudy/sectionRules';
import { NS_ERR_SHARING_PLACE } from '../../newstudy/newStudyStrings';
import { CURRENT } from './fixtures';

const COUNTS = [{ area: '健康 Health', count: 3 }, { area: '家庭 Family', count: 2 }];
const DRAFT = { themes: ['主题一', '主题二'], quotes: ['“走一走”', '心里松了'], question: '开场问题？' };

describe('sharingSection', () => {
  it('orders themes → 「quotes」 → the count line → the question (last line)', () => {
    expect(sharingSection(DRAFT, COUNTS)).toEqual({
      kind: 'sharing', heading: SHARING_HEADING,
      body: ['主题一', '主题二', '「走一走」', '「心里松了」', practiceCountLine(COUNTS), '开场问题？'],
    });
    expect(practiceCountLine(COUNTS)).toBe('上周大家选择的操练 · Practices chosen last week: 健康 Health 3, 家庭 Family 2');
    expect(SHARING_HEADING).toBe("上周操练分享 · Last week's sharing");
  });

  it('counts only when there is no draft', () => {
    expect(sharingSection(null, COUNTS).body).toEqual([practiceCountLine(COUNTS)]);
    expect(isQuoteLine('「a」')).toBe(true);
    expect(isQuoteLine('a')).toBe(false);
  });
});

describe('withSharingSection', () => {
  const withIt = withSharingSection(CURRENT, sharingSection(DRAFT, COUNTS));

  it('inserts right after the title; a second run replaces the first', () => {
    expect(withIt.sections.map(s => s.kind)).toEqual(['title', 'sharing', 'scripture', 'context', 'closing']);
    const again = withSharingSection(withIt, sharingSection(null, COUNTS));
    expect(again.sections.filter(s => s.kind === 'sharing')).toHaveLength(1);
    expect(again.sections[1].body).toEqual([practiceCountLine(COUNTS)]);
  });

  it('the edited pack validates and parses; the section is slide 2', () => {
    expect(validateEdited(withIt)).toBeNull();
    expect(parseStudyPack(JSON.parse(JSON.stringify(withIt))).sections[1].kind).toBe('sharing');
    const slides = buildSlides(withIt);
    expect(slides[0].kind).toBe('title');
    expect(slides[1]).toMatchObject({ kind: 'sharing', heading: SHARING_HEADING, body: withIt.sections[1].body });
  });

  it('a long sharing body continues on more slides, all before the scripture', () => {
    const long = withSharingSection(CURRENT, { kind: 'sharing', heading: SHARING_HEADING, body: Array.from({ length: 12 }, (_, i) => `第${i}行`) });
    const kinds = buildSlides(long).map(s => s.kind);
    const shared = buildSlides(long).filter(s => s.kind === 'sharing');
    expect(shared.length).toBeGreaterThan(1);
    expect(shared.every(s => (s.body?.length ?? 0) <= MAX_BODY_LINES_PER_SLIDE)).toBe(true);
    expect(kinds.lastIndexOf('sharing')).toBeLessThan(kinds.indexOf('scripture'));
  });

  it('a pack without the section renders unchanged; schema version stays 2', () => {
    expect(buildSlides(CURRENT).map(s => s.kind)).toEqual(['title', 'scripture', 'context', 'closing']);
    expect(PACK_SCHEMA_VERSION).toBe(2);
  });

  it('parseStudyPack rejects a sharing section with an empty body', () => {
    const bad = { ...withIt, sections: withIt.sections.map(s => (s.kind === 'sharing' ? { ...s, body: [] } : s)) };
    expect(() => parseStudyPack(bad)).toThrow(/sharing section 1 needs a non-empty body/);
  });
});

describe('sectionRules with a sharing section', () => {
  const sections = withSharingSection(CURRENT, sharingSection(DRAFT, COUNTS)).sections;

  it('allows it only right after the title, once', () => {
    expect(validateSectionOrder(sections)).toBeNull();
    expect(validateSectionOrder(moveItem(sections, 1, 1))).toBe(NS_ERR_SHARING_PLACE);
    expect(validateSectionOrder([...sections.slice(0, 2), sections[1], ...sections.slice(2)])).toBe(NS_ERR_SHARING_PLACE);
  });

  it('is fixed in place, removable, and never offered by the add menu', () => {
    expect(canMoveUp(sections, 1)).toBe(false);
    expect(canMoveDown(sections, 1)).toBe(false);
    expect(canMoveUp(sections, 2)).toBe(false);
    expect(canRemove(sections, 1)).toBe(true);
    expect(canAdd(CURRENT.sections, 'sharing')).toBe(false);
  });
});

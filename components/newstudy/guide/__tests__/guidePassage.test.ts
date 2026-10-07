/**
 * guidePassage.test.ts — which passage a guide studies · 讲义经文识别 (ADR-0019 §2)
 */
import { describe, it, expect } from 'vitest';
import { detectGuidePassage, normaliseRefText, TITLE_ZONE_CHARS } from '../guidePassage';
import { GUIDE_PAGES } from './guideFixture';

const MARK_1_1_15 = { bookId: 'MRK', chapter: 1, verseFrom: 1, verseTo: 15 };
const filler = '我们一起读经。'.repeat(Math.ceil(TITLE_ZONE_CHARS / 7) + 1);

describe('detectGuidePassage', () => {
  it('the fixture guide: Mark 1:1–15 from its title, confidently — not Isaiah 40:3 cited in a question', () => {
    expect(detectGuidePassage(GUIDE_PAGES.flat().join('\n'))).toEqual({ range: MARK_1_1_15, confident: true });
  });

  it('full-width digits, colon and tilde, and a short book name (可)', () => {
    expect(normaliseRefText('可１：１～１５')).toBe('可1:1-15');
    expect(detectGuidePassage('经文：可１：１～１５').range).toEqual(MARK_1_1_15);
  });

  it('English book names work too', () => {
    expect(detectGuidePassage('Study guide — John 3:22-36').range).toEqual({ bookId: 'JHN', chapter: 3, verseFrom: 22, verseTo: 36 });
  });

  it('a range beats a single verse; the title area beats further down; repetition counts', () => {
    expect(detectGuidePassage('参考 约翰福音 3:16。马可福音 1:1-15').range).toEqual(MARK_1_1_15);
    expect(detectGuidePassage(`路加福音 12:22-31\n${filler}\n马可福音 1:1-15`).range?.bookId).toBe('LUK');
    expect(detectGuidePassage(`${filler}\n路加福音 12:22-31\n马可福音 1:1-15\n马可福音 1:1-15`).range).toEqual(MARK_1_1_15);
  });

  it('no reference → no guess, not confident', () => {
    expect(detectGuidePassage('第一课：神的国\n讨论问题：你怎么看？')).toEqual({ range: null, confident: false });
  });

  it('only single verses → a guess, not confident', () => {
    expect(detectGuidePassage('约翰福音 3:16')).toEqual({ range: { bookId: 'JHN', chapter: 3, verseFrom: 16, verseTo: 16 }, confident: false });
  });

  it('two different passages tie → a guess, not confident', () => {
    expect(detectGuidePassage(`${filler}\n马可福音 1:1-15\n路加福音 12:22-31`).confident).toBe(false);
  });

  it('a chapter the book does not have, or a bare v.7, is never a passage', () => {
    expect(detectGuidePassage('马可福音 99:1-3，v.7，第7节').range).toBeNull();
  });
});

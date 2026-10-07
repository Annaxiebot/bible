/**
 * guideAIPassage.test.ts — the reply's "passage" field · AI 读出的经文 (ADR-0019 amendment)
 *
 * Parsed with the app's one reference finder after normaliseRefText, checked
 * against the book table (chapter) and the bundled chapter (verses); anything
 * unusable is null ("not found").
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseGuidePassageField, readAIPassage } from '../guideAIPassage';
import { stubFetch } from '../../__tests__/packFetchStub';
import { NS_ERR_VERSES_UNAVAILABLE } from '../../newStudyStrings';
import { NP_RANGE, JOHN_13_1_CUV } from './guideFixtureNoPassage';

const parse = (passage: unknown) => parseGuidePassageField({ passage });

describe('parseGuidePassageField', () => {
  it('Chinese, Traditional, English, full-width and en-dash forms', () => {
    expect(parse('约翰福音 13:1-17')).toEqual(NP_RANGE);
    expect(parse('約翰福音 13:1-17')).toEqual(NP_RANGE);
    expect(parse('John 13:1–17')).toEqual(NP_RANGE);
    expect(parse('约翰福音１３：１～１７')).toEqual(NP_RANGE);
    expect(parse(' 约 13:1-17 ')).toEqual(NP_RANGE);
    expect(parse('约翰福音 13:5')).toEqual({ ...NP_RANGE, verseFrom: 5, verseTo: 5 });
  });

  it('missing, not a string, not a reference, or a chapter the book does not have → null', () => {
    expect(parseGuidePassageField({})).toBeNull();
    expect(parse(42)).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse('主为门徒洗脚')).toBeNull();
    expect(parse('第3节')).toBeNull();          // no book, no chapter
    expect(parse('约翰福音 22:1-5')).toBeNull(); // John has 21 chapters
  });
});

describe('readAIPassage', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('the range with its verses from the bundled 和合本 + BSB', async () => {
    stubFetch([]);
    const read = await readAIPassage({ passage: '约翰福音 13:1-17' });
    expect(read?.range).toEqual(NP_RANGE);
    expect(read?.verses).toHaveLength(17);
    expect(read?.verses[0].cuv).toBe(JOHN_13_1_CUV);
  });

  it('verses the chapter does not have → null (not found)', async () => {
    stubFetch([]);
    expect(await readAIPassage({ passage: '约翰福音 13:30-45' })).toBeNull();
  });

  it('a chapter that cannot be loaded at all still throws its own message (not "not found")', async () => {
    stubFetch([], false);
    await expect(readAIPassage({ passage: '约翰福音 13:1-17' })).rejects.toThrow(NS_ERR_VERSES_UNAVAILABLE);
  });
});

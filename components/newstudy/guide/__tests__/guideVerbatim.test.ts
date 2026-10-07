/**
 * guideVerbatim.test.ts — word for word, or flagged · 原文核对 (ADR-0019 §4)
 *
 * Layout differences pass (line breaks inside a question, item numbers,
 * full-width vs half-width, 「」 vs “”, spaces); any changed, added or
 * dropped word fails, and so does 繁→简 conversion or an added keyword.
 */
import { describe, it, expect } from 'vitest';
import { guideMatcher, itemIsVerbatim, normaliseForMatch } from '../guideVerbatim';
import { GUIDE_PAGES, GUIDE_QUESTIONS, TIDIED_QUESTION } from './guideFixture';

const guide = GUIDE_PAGES.flat().join('\n');
const isVerbatim = guideMatcher(guide);

describe('passes: the same words, laid out differently', () => {
  it('every fixture question, without its number', () => {
    for (const q of GUIDE_QUESTIONS) expect(isVerbatim(q)).toBe(true);
  });

  it('with a different number style, or the guide\'s own', () => {
    expect(isVerbatim(`3、${GUIDE_QUESTIONS[2]}`)).toBe(true);
    expect(isVerbatim(`(1) ${GUIDE_QUESTIONS[0]}`)).toBe(true);
  });

  it('a question the PDF broke over two lines; other quotes; half-width punctuation', () => {
    const broken = guideMatcher('1. 马可为什么一开头就称耶稣\n为“神的儿子”？');
    expect(broken('马可为什么一开头就称耶稣为「神的儿子」?')).toBe(true);
  });

  it('English: case, spaces and hyphenation across a line break', () => {
    const english = guideMatcher('2. What does the voice from heaven say? Why does it mat-\nter to you?');
    expect(english('What does the voice from heaven say? Why does it matter to you?')).toBe(true);
  });

  it('full-width letters and digits, Kangxi radicals', () => {
    expect(normaliseForMatch('ＡＢＣ１２３')).toBe(normaliseForMatch('abc123'));
    expect(guideMatcher('⼈⼦来了')('人子来了')).toBe(true);
  });
});

describe('flagged: the words changed', () => {
  it('a tidied question', () => {
    expect(isVerbatim(TIDIED_QUESTION)).toBe(false);
  });

  it('an added English keyword, a dropped clause, a changed word', () => {
    expect(isVerbatim('施洗约翰的信息（message）和穿着说明了什么？')).toBe(false);
    expect(isVerbatim('天上的声音对耶稣说了什么？这对你有什么意义？为什么？')).toBe(false);
    expect(isVerbatim('马可为什么一开头就称耶稣为“主”？')).toBe(false);
  });

  it('traditional characters are not the guide\'s simplified ones', () => {
    expect(isVerbatim('天上的聲音對耶穌說了什麼？')).toBe(false);
  });

  it('an empty or punctuation-only line is never "from the guide"', () => {
    expect(isVerbatim('')).toBe(false);
    expect(isVerbatim('？！……')).toBe(false);
  });
});

describe('itemIsVerbatim: a bilingual item', () => {
  it('passes on either half (the other is a translation); fails when neither matches', () => {
    expect(itemIsVerbatim({ zh: GUIDE_QUESTIONS[0], en: 'Why does Mark call Jesus the Son of God?' }, isVerbatim)).toBe(true);
    expect(itemIsVerbatim({ zh: '', en: GUIDE_QUESTIONS[0] }, isVerbatim)).toBe(true);
    expect(itemIsVerbatim({ zh: TIDIED_QUESTION, en: 'What did the voice say?' }, isVerbatim)).toBe(false);
  });
});

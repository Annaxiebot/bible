/**
 * slideText.test.ts — heading split and key-phrase emphasis · 幻灯片文字测试
 *
 * Presentation only: every helper must give back the exact original text
 * when its parts are joined (ADR-0003 guide fidelity).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { HEADING_DETAIL_SEPARATOR, emphasisSegments, keyPhraseFragments, splitHeading } from '../slideText';
import { parseStudyPack } from '../packTypes';
import { TEST_PACK_PATH } from './fixtures';

const demo = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const scripture = demo.sections.find(s => s.kind === 'scripture')!;

describe('splitHeading', () => {
  it('splits the scripture heading into its name and the passage reference, Chinese first', () => {
    const { main, detail } = splitHeading(scripture.heading);
    expect(main).toBe('经文 Scripture');
    expect(detail).toBe('马太福音 6:25–34 Matthew');
    expect(`${main}${HEADING_DETAIL_SEPARATOR}${detail}`).toBe(scripture.heading);
  });

  it('leaves a heading without a detail whole', () => {
    expect(splitHeading('背景 Context')).toEqual({ main: '背景 Context' });
    expect(splitHeading(`${HEADING_DETAIL_SEPARATOR}x`)).toEqual({ main: `${HEADING_DETAIL_SEPARATOR}x` });
  });
});

describe('keyPhraseFragments', () => {
  it('extracts the quoted 中文 and English halves of the demo key phrase', () => {
    expect(keyPhraseFragments(scripture.keyPhrase)).toEqual(['不要为生命忧虑', 'Do not worry about your life']);
  });

  it('drops trailing punctuation inside the quotes and handles a missing phrase', () => {
    expect(keyPhraseFragments('「他必兴旺，」 “He must increase.” (v.30)')).toEqual(['他必兴旺', 'He must increase']);
    expect(keyPhraseFragments(undefined)).toEqual([]);
    expect(keyPhraseFragments('no quotes')).toEqual([]);
  });
});

describe('emphasisSegments', () => {
  const fragments = keyPhraseFragments(scripture.keyPhrase);
  const v25 = scripture.verses!.find(v => v.num === 25)!;

  it('marks the key phrase where it occurs in 和合本 and (case-insensitively) in BSB', () => {
    for (const text of [v25.cuv, v25.en]) {
      const segments = emphasisSegments(text, fragments);
      expect(segments.filter(s => s.emphasis)).toHaveLength(1);
      expect(segments.map(s => s.text).join('')).toBe(text);
    }
    expect(emphasisSegments(v25.en, fragments).find(s => s.emphasis)!.text).toBe('do not worry about your life');
  });

  it('returns the text as one plain run when the phrase is absent', () => {
    expect(emphasisSegments('Look at the birds', fragments)).toEqual([{ text: 'Look at the birds', emphasis: false }]);
    expect(emphasisSegments('abc', [])).toEqual([{ text: 'abc', emphasis: false }]);
  });

  it('overlapping fragments: the earlier one wins and nothing is duplicated', () => {
    const segments = emphasisSegments('abcdef', ['bcd', 'cde']);
    expect(segments).toEqual([
      { text: 'a', emphasis: false }, { text: 'bcd', emphasis: true }, { text: 'ef', emphasis: false },
    ]);
  });
});

/**
 * refLabel.test.ts — bilingual popup headers · 经文引用标题测试
 * ADR-0003 §1: 简体 book first, then English, " · " between.
 */
import { describe, it, expect } from 'vitest';
import { findVerseRefs } from '../verseRefs';
import { bilingualRefLabel, formatVerseList } from '../refLabel';

const ref = (text: string) => findVerseRefs(text)[0];

describe('formatVerseList', () => {
  it('compresses contiguous runs and keeps gaps', () => {
    expect(formatVerseList([4])).toBe('4');
    expect(formatVerseList([25, 26, 27, 31])).toBe('25–27,31');
    expect(formatVerseList([2, 3])).toBe('2–3');
  });
});

describe('bilingualRefLabel', () => {
  it('renders the landing captions 简体 first, then English', () => {
    expect(bilingualRefLabel(ref('詩篇 147:4'))).toBe('诗篇 147:4 · Psalm 147:4');
    expect(bilingualRefLabel(ref('Psalm 147:4'))).toBe('诗篇 147:4 · Psalm 147:4');
    expect(bilingualRefLabel(ref('創世記 1:3'))).toBe('创世记 1:3 · Genesis 1:3');
  });

  it('renders Book C:V ranges and numbered books', () => {
    expect(bilingualRefLabel(ref('Matthew 6:25–32'))).toBe('马太福音 6:25–32 · Matthew 6:25–32');
    expect(bilingualRefLabel(ref('彼前5:7'))).toBe('彼得前书 5:7 · 1 Peter 5:7');
  });

  it('borrows the passage book/chapter for v./vv. refs', () => {
    expect(bilingualRefLabel(ref('v.26'), 'MAT', 6)).toBe('马太福音 6:26 · Matthew 6:26');
    expect(bilingualRefLabel(ref('vv.25,31'), 'MAT', 6)).toBe('马太福音 6:25,31 · Matthew 6:25,31');
  });

  it('falls back to the text as written when the book cannot be resolved', () => {
    expect(bilingualRefLabel(ref('v.26'))).toBe('v.26');
    expect(bilingualRefLabel(ref('Narnia 3:1'))).toBe('Narnia 3:1');
  });
});

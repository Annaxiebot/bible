/**
 * slideFit.test.ts — how much text one TV slide carries · 每页文字量测试
 *
 * The row estimate, the balanced grouping (fewest slides, then even), and
 * the guarantee that grouping never drops, reorders or cuts an item.
 */
import { describe, it, expect } from 'vitest';
import {
  BODY_LINE_EMS, MAX_BODY_LINES_PER_SLIDE, chunkBalanced, chunkBody, estimateBodyLines, estimateLines,
} from '../slideFit';

/** A body paragraph that the estimate puts at exactly `rows` rows (all CJK, 1em each). */
const para = (rows: number, tag = 'x') => tag + '字'.repeat(rows * BODY_LINE_EMS - 1);

describe('estimateLines', () => {
  it('counts CJK as square and Latin as half-width', () => {
    expect(estimateLines('字'.repeat(20), 10)).toBe(2);
    expect(estimateLines('a'.repeat(20), 10)).toBe(1);
    expect(estimateLines('a'.repeat(21), 10)).toBe(2);
    expect(estimateLines('「」，。', 4)).toBe(1); // full-width punctuation is square too
  });

  it('is at least one row, even for an empty line', () => {
    expect(estimateLines('', 10)).toBe(1);
    expect(estimateBodyLines('属于登山宝训')).toBe(1);
  });

  it('a body paragraph of exactly one row of CJK is one row; one more character wraps', () => {
    expect(estimateBodyLines('字'.repeat(BODY_LINE_EMS))).toBe(1);
    expect(estimateBodyLines('字'.repeat(BODY_LINE_EMS + 1))).toBe(2);
  });
});

describe('chunkBalanced', () => {
  const one = () => 1;

  it('10 one-row items, at most 3 per slide → [2, 2, 3, 3] (later slides hold more)', () => {
    const chunks = chunkBalanced([...Array(10).keys()], one, { maxCost: 10, maxItems: 3 });
    expect(chunks.map(c => c.length)).toEqual([2, 2, 3, 3]);
  });

  it('uses the fewest slides, then balances them', () => {
    // greedy would give [6+2 | 2]; balanced keeps 2 slides but evens the load
    const chunks = chunkBalanced([6, 2, 2], c => c, { maxCost: 8 });
    expect(chunks).toEqual([[6], [2, 2]]);
  });

  it('a first-slide reserve takes room from slide 1 only', () => {
    expect(chunkBalanced([5, 5], c => c, { maxCost: 10 })).toEqual([[5, 5]]);
    expect(chunkBalanced([5, 5], c => c, { maxCost: 10, firstReserve: 3 })).toEqual([[5], [5]]);
  });

  it('an item larger than a whole slide gets a slide of its own, never cut', () => {
    expect(chunkBalanced([2, 20, 2], c => c, { maxCost: 8 })).toEqual([[2], [20], [2]]);
  });

  it('an empty list is one empty chunk', () => {
    expect(chunkBalanced([], one, { maxCost: 8 })).toEqual([[]]);
  });
});

describe('chunkBody', () => {
  it('keeps a section within the cap on one slide', () => {
    const lines = [para(3, 'a'), para(3, 'b'), para(2, 'c')];
    expect(chunkBody(lines)).toEqual([lines]);
  });

  it('splits past the cap; every slide stays within MAX_BODY_LINES_PER_SLIDE rows', () => {
    const lines = [para(1, 'a'), para(4, 'b'), para(3, 'c'), para(3, 'd'), para(3, 'e')];
    const chunks = chunkBody(lines);
    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      const rows = chunk.reduce((sum, line) => sum + estimateBodyLines(line), 0);
      expect(rows).toBeLessThanOrEqual(MAX_BODY_LINES_PER_SLIDE);
    }
  });

  it('loses, reorders and rewords nothing: the chunks concatenate back to the body', () => {
    const lines = Array.from({ length: 9 }, (_, i) => para((i % 4) + 1, `p${i}`));
    expect(chunkBody(lines).flat()).toEqual(lines);
  });
});

/**
 * fitScale.test.ts — the fit-to-screen scale search · 内容放大搜索测试
 *
 * largestFittingScale: largest non-overflowing scale within [min, max],
 * never below min, never above max, monotonic in the content's size.
 * applyFitScale: writes --fit on the area and leaves the found value applied.
 */
import { describe, it, expect } from 'vitest';
import {
  FIT_SEARCH_STEPS, FIT_VAR, MAX_ANSWER_SCALE, MAX_SCALE, MIN_ANSWER_SCALE, MIN_SCALE,
  applyFitScale, contentOverflows, largestFittingScale,
} from '../fitScale';
import { TYPE_SCALE } from '../principles';

/** Content that overflows once scale × size passes the area (a model of text growing with --fit). */
const sizedContent = (size: number, room: number) => (scale: number) => scale * size > room;
/** One bisection step's resolution over the default range. */
const RESOLUTION = (MAX_SCALE - MIN_SCALE) / 2 ** FIT_SEARCH_STEPS;

describe('largestFittingScale', () => {
  it('finds the largest scale that fits, to within one step', () => {
    const scale = largestFittingScale(sizedContent(100, 160)); // fits up to 1.6
    expect(scale).toBeLessThanOrEqual(1.6);
    expect(scale).toBeGreaterThan(1.6 - RESOLUTION);
    expect(sizedContent(100, 160)(scale)).toBe(false); // the answer itself never overflows
  });

  it('returns the ceiling when even MAX_SCALE fits', () => {
    expect(largestFittingScale(() => false)).toBe(MAX_SCALE);
  });

  it('never goes below the floor: content that overflows at 1 stays at 1', () => {
    expect(largestFittingScale(() => true)).toBe(MIN_SCALE);
    expect(largestFittingScale(sizedContent(100, 90))).toBe(MIN_SCALE);
  });

  it('respects custom bounds', () => {
    expect(largestFittingScale(() => false, 1, 1.5)).toBe(1.5);
    expect(largestFittingScale(sizedContent(100, 300), 1, 1.5)).toBe(1.5);
    expect(largestFittingScale(() => false, 2, 2)).toBe(2); // empty range → min
  });

  it('is monotonic: more content never gets a larger scale', () => {
    const scales = [80, 100, 120, 150, 200].map(size => largestFittingScale(sizedContent(size, 200)));
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeLessThanOrEqual(scales[i - 1]);
  });

  it('probes the floor and ceiling once each, then bisects FIT_SEARCH_STEPS times', () => {
    const probes: number[] = [];
    largestFittingScale(s => { probes.push(s); return s > 1.3; });
    expect(probes.slice(0, 2)).toEqual([MIN_SCALE, MAX_SCALE]);
    expect(probes).toHaveLength(2 + FIT_SEARCH_STEPS);
  });
});

/** An area of fixed client size whose content's box grows with the --fit written on the area. */
function fakeLayout(areaHeight: number, areaWidth: number, contentHeight: number, contentWidth = areaWidth) {
  const area = document.createElement('div');
  const content = document.createElement('div');
  area.appendChild(content);
  const fit = () => Number(area.style.getPropertyValue(FIT_VAR) || 1);
  Object.defineProperty(area, 'clientHeight', { get: () => areaHeight });
  Object.defineProperty(area, 'clientWidth', { get: () => areaWidth });
  Object.defineProperty(content, 'scrollWidth', { get: () => contentWidth * fit() });
  content.getBoundingClientRect = () => ({ height: contentHeight * fit(), width: Math.min(areaWidth, contentWidth * fit()) }) as DOMRect;
  return { area, content };
}

describe('contentOverflows / applyFitScale', () => {
  it('flags content taller or wider than its area', () => {
    const overflows = ({ area, content }: ReturnType<typeof fakeLayout>) => contentOverflows(area, content);
    expect(overflows(fakeLayout(100, 100, 101))).toBe(true);
    expect(overflows(fakeLayout(100, 100, 50, 120))).toBe(true);
    expect(overflows(fakeLayout(100, 100, 100, 100))).toBe(false);
  });

  it('applies the largest fitting scale to the area (limited by height)', () => {
    const { area, content } = fakeLayout(600, 1000, 400, 100);
    const scale = applyFitScale(area, content);
    expect(scale).toBeCloseTo(1.5, 2); // within the search resolution and the sub-pixel slack
    expect(area.style.getPropertyValue(FIT_VAR)).toBe(String(scale));
  });

  it('is limited by width when the content is wide (a long word or a column)', () => {
    const { area, content } = fakeLayout(1000, 600, 100, 500);
    expect(applyFitScale(area, content)).toBeCloseTo(1.2, 2);
  });

  it('keeps 1 when the content already overflows at 1 (the split upstream owns that)', () => {
    const { area, content } = fakeLayout(100, 100, 150);
    expect(applyFitScale(area, content)).toBe(MIN_SCALE);
    expect(area.style.getPropertyValue(FIT_VAR)).toBe('1');
  });
});

/** The vh term of a TYPE_SCALE size, e.g. 'max(16px, 4vh)' → 4. */
const vhOf = (size: string) => Number(/([\d.]+)vh/.exec(size)![1]);

describe('Ask-AI answer range [MIN_ANSWER_SCALE, MAX_ANSWER_SCALE] (scaling down)', () => {
  const ANSWER = { min: MIN_ANSWER_SCALE, max: MAX_ANSWER_SCALE };

  it('the floor keeps the long-answer size at the TV body/verse floor (ADR-0003 §15), never below', () => {
    expect(MAX_ANSWER_SCALE).toBe(1);
    expect(MIN_ANSWER_SCALE).toBeLessThan(1);
    expect(vhOf(TYPE_SCALE.answerLong) * MIN_ANSWER_SCALE).toBeCloseTo(vhOf(TYPE_SCALE.verse), 6);
    // 3.6vh in px: ~26px at 720p, ~39px at 1080p.
    expect(vhOf(TYPE_SCALE.verse) * 7.2).toBeCloseTo(25.92, 2);
    expect(vhOf(TYPE_SCALE.verse) * 10.8).toBeCloseTo(38.88, 2);
  });

  it('shrinks just enough: the largest fitting scale below 1, within one step', () => {
    const scale = largestFittingScale(sizedContent(100, 95), ANSWER.min, ANSWER.max); // fits up to 0.95
    expect(scale).toBeLessThanOrEqual(0.95);
    expect(scale).toBeGreaterThan(0.95 - (ANSWER.max - ANSWER.min) / 2 ** FIT_SEARCH_STEPS);
  });

  it('stays at 1 when the answer fits, and stops at the floor when nothing fits (then it scrolls)', () => {
    expect(largestFittingScale(sizedContent(100, 120), ANSWER.min, ANSWER.max)).toBe(1);
    expect(largestFittingScale(sizedContent(100, 50), ANSWER.min, ANSWER.max)).toBe(MIN_ANSWER_SCALE);
    expect(largestFittingScale(() => true, ANSWER.min, ANSWER.max)).toBe(MIN_ANSWER_SCALE);
  });

  it('is monotonic: a longer answer never gets a larger scale, and every result is in range', () => {
    const scales = [90, 95, 100, 104, 108, 112, 200].map(size => largestFittingScale(sizedContent(size, 100), ANSWER.min, ANSWER.max));
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeLessThanOrEqual(scales[i - 1]);
    for (const s of scales) {
      expect(s).toBeGreaterThanOrEqual(MIN_ANSWER_SCALE);
      expect(s).toBeLessThanOrEqual(MAX_ANSWER_SCALE);
    }
  });

  it('applyFitScale honours the range and writes --fit on the given target, not the area', () => {
    const { area, content } = fakeLayout(600, 1000, 400, 100);
    const target = document.createElement('div');
    expect(applyFitScale(area, content, ANSWER, target)).toBe(1); // 400 ≤ 600: never grows past 1
    expect(target.style.getPropertyValue(FIT_VAR)).toBe('1');
    expect(area.style.getPropertyValue(FIT_VAR)).toBe(''); // earlier turns in the area keep their size
    const tall = fakeLayout(600, 1000, 640, 100); // fits at 0.9375
    const scale = applyFitScale(tall.area, tall.content, ANSWER);
    expect(scale).toBeCloseTo(0.9375, 2);
    expect(scale).toBeLessThan(1);
  });
});

/**
 * fitScale.test.ts — the fit-to-screen scale search · 内容放大搜索测试
 *
 * largestFittingScale: largest non-overflowing scale within [min, max],
 * never below min, never above max, monotonic in the content's size.
 * applyFitScale: writes --fit on the area and leaves the found value applied.
 */
import { describe, it, expect } from 'vitest';
import {
  FIT_SEARCH_STEPS, FIT_VAR, MAX_SCALE, MIN_SCALE, applyFitScale, contentOverflows, largestFittingScale,
} from '../fitScale';

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

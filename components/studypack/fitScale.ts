/**
 * fitScale.ts — fit-to-screen scale for a TV slide's content · 内容放大填满屏幕
 *
 * buildSlides (slideFit.ts) already guarantees every slide fits at scale 1,
 * which leaves short slides (one question, a 2-line paragraph) mostly empty
 * on a TV. The content block under the heading is set at base size ×
 * var(--fit); this module finds the largest --fit in [MIN_SCALE, MAX_SCALE]
 * at which the block still fits its area (height AND width). Never below 1:
 * the senior floors (ADR-0003 §15) stay the minimum.
 */

/** The floor: content is never set smaller than the TYPE_SCALE sizes. */
export const MIN_SCALE = 1;

/**
 * The ceiling, for content sparser than anything in the sample pack. There
 * the sparsest slide (the first discussion question) fills its area at ~1.7
 * (6vh → ~10vh at 1080p), so no demo slide reaches the cap. 2.2 lets a
 * one-line question grow to ~13vh — under twice the 7vh heading, about 11
 * 汉字 per line at 1080p: large across a room, still a sentence, not a poster.
 */
export const MAX_SCALE = 2.2;

/** Bisection steps: 10 halvings of [1, 2.2] resolve the scale to ~0.001. */
export const FIT_SEARCH_STEPS = 10;

/** CSS custom property every fitted size multiplies by (slideTypography.ts). */
export const FIT_VAR = '--fit';

/** Sub-pixel slack when comparing a measured box against its area. */
const FIT_EPSILON_PX = 0.5;

/**
 * Largest scale in [min, max] for which `overflows(scale)` is false, assuming
 * overflow is monotonic in scale (bigger text never fits better). Returns
 * `min` when even `min` overflows — the split upstream owns that case.
 */
export function largestFittingScale(
  overflows: (scale: number) => boolean,
  min = MIN_SCALE,
  max = MAX_SCALE,
  steps = FIT_SEARCH_STEPS,
): number {
  if (max <= min || overflows(min)) return min;
  if (!overflows(max)) return max;
  let lo = min; // fits
  let hi = max; // overflows
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (overflows(mid)) hi = mid; else lo = mid;
  }
  return lo;
}

/** Does `content` (with its descendants) spill out of `area`, downward or sideways? */
export function contentOverflows(area: HTMLElement, content: HTMLElement): boolean {
  const height = content.getBoundingClientRect().height;
  const width = Math.max(content.scrollWidth, content.getBoundingClientRect().width);
  return height > area.clientHeight + FIT_EPSILON_PX || width > area.clientWidth + FIT_EPSILON_PX;
}

/** Search the scale by writing --fit on `area` and measuring `content`; leaves the result applied. */
export function applyFitScale(area: HTMLElement, content: HTMLElement): number {
  const scale = largestFittingScale(s => {
    area.style.setProperty(FIT_VAR, String(s));
    return contentOverflows(area, content);
  });
  area.style.setProperty(FIT_VAR, String(scale));
  return scale;
}

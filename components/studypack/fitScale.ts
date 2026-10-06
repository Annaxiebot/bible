/**
 * fitScale.ts — fit-to-screen scale for a TV slide's content · 内容放大填满屏幕
 *
 * buildSlides (slideFit.ts) already guarantees every slide fits at scale 1,
 * which leaves short slides (one question, a 2-line paragraph) mostly empty
 * on a TV. The content block under the heading is set at base size ×
 * var(--fit); this module finds the largest --fit in [MIN_SCALE, MAX_SCALE]
 * at which the block still fits its area (height AND width). Never below 1:
 * the senior floors (ADR-0003 §15) stay the minimum. The same search also
 * shrinks Ask-AI answers within [MIN_ANSWER_SCALE, 1] (useAnswerFit.ts).
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

/**
 * Ask-AI answers search the other way: they start at their TYPE_SCALE size
 * (scale 1) and may only SHRINK, down to MIN_ANSWER_SCALE, so a long answer
 * fits the overlay without scrolling (ADR-0003 §10). 0.9 = the senior floor
 * for TV body/verse text (ADR-0003 §15: 3.6vh, TYPE_SCALE.verse) over the
 * long-answer size (TYPE_SCALE.answerLong: 4vh): 4vh × 0.9 = 3.6vh, i.e.
 * ~26px at 720p and ~39px at 1080p. AskAnswer also clamps the fitted size
 * at TYPE_SCALE.verse in CSS, so the floor holds for every size bucket.
 */
export const MIN_ANSWER_SCALE = 0.9;

/** Answers never grow past their TYPE_SCALE size. */
export const MAX_ANSWER_SCALE = 1;

/** Search bounds for applyFitScale; slides use the default [MIN_SCALE, MAX_SCALE]. */
export interface FitRange {
  min: number;
  max: number;
}

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

/**
 * Search the scale within `range` by writing --fit on `target` (default: the
 * area) and measuring `content` against `area`; leaves the result applied.
 */
export function applyFitScale(
  area: HTMLElement,
  content: HTMLElement,
  range: FitRange = { min: MIN_SCALE, max: MAX_SCALE },
  target: HTMLElement = area,
): number {
  const scale = largestFittingScale(s => {
    target.style.setProperty(FIT_VAR, String(s));
    return contentOverflows(area, content);
  }, range.min, range.max);
  target.style.setProperty(FIT_VAR, String(scale));
  return scale;
}

/**
 * slideFit.ts — how much text one TV slide carries · 每页文字量
 *
 * Pure helpers for buildSlides (packTypes.ts): group a section's items into
 * as few slides as fit a 16:9 screen at the senior type scale, balanced so
 * no slide is crowded while the next holds one line. Items are never cut or
 * reworded — only grouped (ADR-0003 guide fidelity).
 *
 * Rows are estimated from character widths, so the numbers below were
 * measured in Chromium at 1280×720 and 1920×1080 (tv-polish.spec.ts pins
 * the result). The slide frame is vh/vw-based, so on any 16:9 screen the
 * same text wraps into the same number of rows.
 */

/**
 * Most body rows (wrapped lines at TYPE_SCALE.body, 5vh) one slide shows.
 * Measured at 1280×720: paragraphs start at y=130 (padding 6vh + heading
 * 58px + 4vh) and must end above y=648 (bottom padding 10vh) → 518px. A row
 * is 54px and paragraphs sit 18px apart: 8 rows in 3 paragraphs end at
 * y=598; 9 rows in 3 paragraphs need 522px and touch the Ask AI pill.
 */
export const MAX_BODY_LINES_PER_SLIDE = 8;

/**
 * Width of one body row in ems of the body font: 88vw of column / 5vh font
 * = 30.9em on 16:9. Taken as 28em because wrapping whole words leaves the
 * end of each row short; measured, the estimate never undercounts the
 * shipped packs' paragraphs.
 */
export const BODY_LINE_EMS = 28;

/**
 * Verse rows (per column, TVSlide verse size 3.8vh × 1.5) one scripture
 * slide shows. Measured at 1280×720: verses start at y=177 below the column
 * labels and must end above y=648 → 471px; a row is 41px and verses sit 22px
 * apart, so 10 rows in 3 verses (454px) fit.
 */
export const MAX_VERSE_ROWS_PER_SLIDE = 10;

/** One verse column is 42vw / 3.8vh = 19.6em wide on 16:9; 18em leaves room for word wrap. */
export const VERSE_LINE_EMS = 18;

/** Verse rows the key phrase (gold, 5.4vh, up to 2 lines + margin ≈ 127px) takes from part 1. */
export const KEY_PHRASE_RESERVE_ROWS = 3;

/** Life-menu rows per slide: 7 rows overflow 1280×720 (788px of 720), 4 fit. */
export const MAX_LIFE_MENU_ROWS_PER_SLIDE = 4;

/**
 * Advance widths in ems: CJK and full-width forms are square (measured 1.0);
 * Latin, digits and punctuation in Inter average 0.476em over the shipped
 * packs' text (canvas measureText), rounded up to 0.5.
 */
const CJK_EM = 1;
const LATIN_EM = 0.5;
const CJK_RANGE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;

/** Estimated wrapped rows of `text` in a column `lineEms` ems wide. */
export function estimateLines(text: string, lineEms: number): number {
  let ems = 0;
  for (const ch of text) ems += CJK_RANGE.test(ch) ? CJK_EM : LATIN_EM;
  return Math.max(1, Math.ceil(ems / lineEms));
}

/** Estimated wrapped rows of one body paragraph at TYPE_SCALE.body. */
export function estimateBodyLines(text: string): number {
  return estimateLines(text, BODY_LINE_EMS);
}

export interface ChunkLimits {
  maxCost: number;       // rows one slide holds
  maxItems?: number;     // items one slide holds, whatever their size
  firstReserve?: number; // rows the first slide spends on something else (the key phrase)
}

/** Fewest slides: greedy fill is optimal for contiguous groups under a per-slide cap. */
function fewestParts(costs: number[], limits: ChunkLimits): number {
  const maxItems = limits.maxItems ?? Infinity;
  let parts = 1;
  let used = limits.firstReserve ?? 0;
  let count = 0;
  for (const cost of costs) {
    if (count > 0 && (used + cost > limits.maxCost || count >= maxItems)) {
      parts++;
      used = 0;
      count = 0;
    }
    used += cost;
    count++;
  }
  return parts;
}

/**
 * Group items into the fewest slides that respect `limits`, then balance
 * them: among all contiguous splits into that many slides, the one with the
 * least sum of squared slide sizes (ties: later slides hold more, so 10
 * one-row verses split [2, 2, 3, 3]). An item bigger than a whole slide
 * still gets one slide of its own — it is never cut.
 */
export function chunkBalanced<T>(items: T[], cost: (item: T) => number, limits: ChunkLimits): T[][] {
  if (items.length === 0) return [items];
  const costs = items.map(cost);
  const k = fewestParts(costs, limits);
  const n = items.length;
  const maxItems = limits.maxItems ?? Infinity;
  const partCost = (from: number, to: number) =>
    costs.slice(from, to).reduce((a, b) => a + b, 0) + (from === 0 ? limits.firstReserve ?? 0 : 0);
  const fits = (from: number, to: number) =>
    to - from === 1 || (to - from <= maxItems && partCost(from, to) <= limits.maxCost);
  // best[j][i]: least score splitting items[0..i) into j slides; cut[j][i]: where the last slide starts.
  const best = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const cut = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0));
  best[0][0] = 0;
  for (let j = 1; j <= k; j++) {
    for (let i = j; i <= n; i++) {
      for (let s = j - 1; s < i; s++) {
        if (best[j - 1][s] === Infinity || !fits(s, i)) continue;
        const score = best[j - 1][s] + partCost(s, i) ** 2;
        if (score < best[j][i]) { best[j][i] = score; cut[j][i] = s; }
      }
    }
  }
  const chunks: T[][] = [];
  for (let j = k, i = n; j > 0; i = cut[j][i], j--) chunks.unshift(items.slice(cut[j][i], i));
  return chunks;
}

/** Split body paragraphs into slides of at most MAX_BODY_LINES_PER_SLIDE estimated rows. */
export function chunkBody(lines: string[]): string[][] {
  return chunkBalanced(lines, estimateBodyLines, { maxCost: MAX_BODY_LINES_PER_SLIDE });
}

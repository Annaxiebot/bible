import { describe, it, expect } from 'vitest';
import {
  computeNotabilityPagesHint,
  augmentNotabilityJSON,
  resolveCanvasHeightPages,
  NOTABILITY_PAGE_HEIGHT_PX,
} from '../notabilityCanvasMigration';

/**
 * Pure-unit tests for the notability canvas migration helper. The
 * integration-level round-trip (device A push → device B pull) is
 * exercised in multipageSync.test.ts; this file covers the helper's
 * contract in isolation so we don't have to pay the supabase/idb mock
 * setup cost per-assertion.
 *
 * See services/notabilityCanvasMigration.ts for the full rationale.
 */

describe('NOTABILITY_PAGE_HEIGHT_PX', () => {
  it('matches the value NotabilityEditor uses (1200 px per page)', () => {
    // If this constant drifts from the editor's PAGE_HEIGHT, the page-count
    // hint inferred on upload will disagree with the canvas the receiver
    // actually renders.
    expect(NOTABILITY_PAGE_HEIGHT_PX).toBe(1200);
  });
});

describe('computeNotabilityPagesHint', () => {
  it('returns 1 when all strokes / textboxes / images fit within a single page', () => {
    // Strokes well inside the first page (height-norm y < 0.5) and a
    // textbox at y=0.3 (width-norm, 0.3 * 800 = 240 px < PAGE_HEIGHT).
    const onePage = {
      version: 2,
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }],
      textBoxes: [{ y: 0.3, height: 0.05 }],
      images: [],
    };
    expect(computeNotabilityPagesHint(onePage)).toBe(1);
  });

  it('returns >=2 when a stroke is past the height-norm 0.5 boundary', () => {
    const twoPages = {
      version: 2,
      strokes: [{ points: [{ x: 0.1, y: 0.7 }] }],
      textBoxes: [],
      images: [],
    };
    expect(computeNotabilityPagesHint(twoPages)).toBeGreaterThanOrEqual(2);
  });

  it('returns >=2 when a textbox is at width-norm y > PAGE_HEIGHT/width', () => {
    // textbox at width-norm y=1.5 → 1.5 * 800 = 1200 px = exactly page 2 top.
    // With tb.height=0.05, bottom=1.55 → 1.55*800=1240 px → 2 pages.
    const twoPages = {
      version: 2,
      strokes: [],
      textBoxes: [{ y: 1.5, height: 0.05 }],
      images: [],
    };
    expect(computeNotabilityPagesHint(twoPages)).toBeGreaterThanOrEqual(2);
  });

  it('is not fooled by malformed stroke points (missing y, NaN, Infinity)', () => {
    const gnarly = {
      version: 2,
      strokes: [
        { points: [{ x: 0.1 } as any, { x: 0.2, y: NaN } as any, { x: 0.2, y: Infinity }] },
      ],
      textBoxes: [],
      images: [],
    };
    expect(computeNotabilityPagesHint(gnarly)).toBe(1);
  });

  it('returns 1 for an empty canvas', () => {
    expect(computeNotabilityPagesHint({ version: 2, strokes: [], textBoxes: [], images: [] })).toBe(1);
  });

  it('caps inferred page count at 20 for pathologically large payloads', () => {
    const pathological = {
      version: 2,
      strokes: [],
      textBoxes: [{ y: 999, height: 1 }], // 999 * 800 = 799,200 px → ~666 pages unclamped
      images: [],
    };
    expect(computeNotabilityPagesHint(pathological)).toBe(20);
  });
});

describe('augmentNotabilityJSON', () => {
  it('adds canvasHeightPages for a version-2 payload with page-2 content', () => {
    const raw = JSON.stringify({
      version: 2,
      strokes: [{ points: [{ x: 0.1, y: 0.8 }] }],
      textBoxes: [],
      images: [],
    });
    const out = augmentNotabilityJSON(raw) as string;
    const parsed = JSON.parse(out);
    expect(parsed.canvasHeightPages).toBeGreaterThanOrEqual(2);
  });

  it('is idempotent: augmenting twice produces the same JSON', () => {
    const raw = JSON.stringify({
      version: 2,
      strokes: [{ points: [{ x: 0.1, y: 0.7 }] }],
      textBoxes: [],
      images: [],
    });
    const once = augmentNotabilityJSON(raw) as string;
    const twice = augmentNotabilityJSON(once) as string;
    expect(twice).toBe(once);
  });

  it('returns input unchanged for non-version-2 payloads, empty strings, and malformed JSON', () => {
    expect(augmentNotabilityJSON('')).toBe('');
    expect(augmentNotabilityJSON(null)).toBe(null);
    expect(augmentNotabilityJSON(undefined)).toBe(undefined);
    expect(augmentNotabilityJSON('{not json')).toBe('{not json');
    expect(augmentNotabilityJSON(JSON.stringify({ version: 1, foo: 'bar' })))
      .toBe(JSON.stringify({ version: 1, foo: 'bar' }));
  });

  it('returns input unchanged for non-object JSON (arrays, primitives)', () => {
    expect(augmentNotabilityJSON('[1, 2, 3]')).toBe('[1, 2, 3]');
    expect(augmentNotabilityJSON('42')).toBe('42');
    expect(augmentNotabilityJSON('null')).toBe('null');
  });
});

/**
 * resolveCanvasHeightPages is the editor-side counterpart to
 * augmentNotabilityJSON. It encodes the "prefer explicit hint, fall back
 * to content estimate" contract that CLOSES the cross-device multi-page
 * sync bug (pages 2+ collapsing on the receiver). Before this function
 * existed, the editor re-implemented the estimate inline and ignored the
 * hint entirely — which is the bug.
 */
describe('resolveCanvasHeightPages', () => {
  it('prefers an explicit canvasHeightPages hint over the content-derived estimate', () => {
    // Construct a payload whose CONTENT suggests 1 page (no strokes / text
    // boxes / images) but whose HINT says 3 pages. The bug-shape this test
    // guards against is any implementation that silently recomputes from
    // content and ignores the hint.
    expect(resolveCanvasHeightPages({ canvasHeightPages: 3 })).toBe(3);
    // And vice versa: content that looks like 2+ pages is still overridden
    // by a smaller explicit hint (which is also valid — a user trimmed a
    // page deliberately).
    expect(resolveCanvasHeightPages({
      canvasHeightPages: 1,
      strokes: [{ points: [{ x: 0, y: 0.9 }] }],
    })).toBe(1);
  });

  it('falls back to computeNotabilityPagesHint when the hint is absent', () => {
    // No hint → delegates to the existing estimator. Strokes near y≈1.5 in
    // height-normalized space mean page 2.
    expect(resolveCanvasHeightPages({
      strokes: [{ points: [{ x: 0, y: 0.7 }] }],
    })).toBe(3); // pagesFromStrokeMaxY: y > 2/3 → 3
    expect(resolveCanvasHeightPages({})).toBe(1); // empty → single-page floor
  });

  it('ignores a non-numeric or invalid hint and falls back to the estimate', () => {
    const invalidButNotNumber = resolveCanvasHeightPages({
      canvasHeightPages: Number.NaN,
      strokes: [{ points: [{ x: 0, y: 0.55 }] }],
    });
    expect(invalidButNotNumber).toBe(2); // stroke drives estimate → 2 pages

    const zero = resolveCanvasHeightPages({
      canvasHeightPages: 0,
      strokes: [{ points: [{ x: 0, y: 0.55 }] }],
    });
    expect(zero).toBe(2);

    const negative = resolveCanvasHeightPages({
      canvasHeightPages: -5,
      strokes: [{ points: [{ x: 0, y: 0.55 }] }],
    });
    expect(negative).toBe(2);
  });

  it('clamps absurdly large hints to MAX_PAGES (no infinite-pages exploit)', () => {
    // A corrupted sync payload could claim canvasHeightPages = 999_999.
    // The resolver must not let that become a runtime canvas-height of
    // 1.2 billion pixels.
    expect(resolveCanvasHeightPages({ canvasHeightPages: 999_999 })).toBeLessThanOrEqual(20);
  });

  it('floors fractional hints (defensive against rogue producers)', () => {
    expect(resolveCanvasHeightPages({ canvasHeightPages: 2.7 })).toBe(2);
    expect(resolveCanvasHeightPages({ canvasHeightPages: 1.999 })).toBe(1);
  });
});

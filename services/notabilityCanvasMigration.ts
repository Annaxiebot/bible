import { Y_NORM_PAGE_HEIGHT } from './notabilityStrokeMigration';

/**
 * notabilityCanvasMigration.ts
 *
 * Sync-layer augmentation for Notability-style journal entries. The
 * NotabilityEditor save format (see components/NotabilityEditor.tsx
 * `serializeExtended`) omits an explicit `canvasHeight` / page-count
 * field: the receiving device reconstructs the canvas height by reading
 * the max y-coordinate of any content. That reconstruction is fragile
 * for multi-page canvases and was the root cause of the
 * 2026-04-21 user report:
 *
 *   "I have 2 page notes, only the 1st page is synced. The 2nd page is
 *   missing in the other device."
 *
 * We sit in front of the Supabase upload/download path and rewrite the
 * `notability_data` JSON to carry an explicit `canvasHeightPages`
 * integer hint derived from the content's highest y-coordinate. A
 * future NotabilityEditor update (owned by Agent F this session) can
 * prefer this hint over the old buggy reconstruction — receivers that
 * DON'T know about the hint ignore it harmlessly. This keeps the
 * JSON forward/backward compatible while guaranteeing every round-trip
 * carries enough information to recover the page count.
 *
 * Why a page COUNT and not absolute pixels: NotabilityEditor normalizes
 * every coordinate by the container width, so absolute pixels would be
 * meaningless across devices with different window widths. Page count
 * is viewport-independent.
 *
 * What signal drives the hint: text boxes and images in NotabilityEditor
 * have their y normalized by WIDTH (see `getNormalizedPoint` in the
 * editor), so `tb.y` of 1.5 directly means "content lives 1.5 viewport
 * widths from the top" — at typical mobile widths ~800px that's
 * 1200 px, i.e. PAGE_HEIGHT, i.e. page 2. We convert that directly to
 * page count using the PAGE_HEIGHT-per-width aspect ratio.
 *
 * Stroke points are HEIGHT-normalized and so alone can't uniquely
 * determine canvas height, but their max y in [0, 1] still gives us a
 * lower bound: a stroke at y > 0.5 implies save-time canvasHeight
 * > PAGE_HEIGHT → at least 2 pages.
 */

/** Canvas height per page, in pixels. Must stay in sync with
 *  NotabilityEditor.PAGE_HEIGHT (line 133 of components/NotabilityEditor.tsx).
 *
 *  R3 NOTE: this is a documented duplicate of the editor's local
 *  PAGE_HEIGHT. A proper single-source-of-truth extraction into
 *  constants/notabilityLayout.ts requires editing
 *  components/NotabilityEditor.tsx, which is owned by a parallel session
 *  this sprint — R8 says we do that as its own refactor session, not
 *  alongside this bug fix. Tracked in HANDOFF.md as a follow-up.
 *
 *  Exported so the test file can assert both ends of the duplicate
 *  agree on the same magic number. */
// exported-for: services/__tests__/notabilityCanvasMigration.test.ts (R17)
export const NOTABILITY_PAGE_HEIGHT_PX = 1200;

/** Typical mobile viewport width used as a reference when converting
 *  width-normalized coordinates to page count. Kept as a constant rather
 *  than reading window.innerWidth so the hint is deterministic regardless
 *  of the sender's current viewport. */
const REFERENCE_WIDTH_PX = 800;

/** Hard cap on inferred page count — nobody writes a 20-page Notability
 *  entry, so cap the inference to catch malformed data. */
const MAX_PAGES = 20;

interface PointLike {
  x?: number;
  y?: number;
}

interface NotabilityPayloadLike {
  version?: number;
  strokes?: Array<{ points?: PointLike[] }>;
  textBoxes?: Array<{ y?: number; height?: number }>;
  images?: Array<{ y?: number; height?: number }>;
  canvasHeightPages?: number;
  /**
   * Stroke-y normalization basis (see NotabilityEditor's F3 migration).
   *   Y_NORM_PAGE_HEIGHT ('page-height') — modern: y_pixel = y * PAGE_HEIGHT
   *     (rotation-invariant).
   *   undefined — legacy: y_pixel = y * capture_width.
   * The page-count heuristic takes wildly different shapes for the two
   * encodings so this module must branch on it. Constant lives in
   * notabilityStrokeMigration so the literal exists in exactly one place.
   */
  yNormBase?: typeof Y_NORM_PAGE_HEIGHT;
  [key: string]: unknown;
}

/** Max y in a list of stroke-point arrays (height-normalized in [0, 1]). */
function maxStrokeY(strokes: NotabilityPayloadLike['strokes']): number {
  if (!Array.isArray(strokes)) return 0;
  let max = 0;
  for (const s of strokes) {
    if (!s || !Array.isArray(s.points)) continue;
    for (const p of s.points) {
      if (typeof p?.y === 'number' && Number.isFinite(p.y) && p.y > max) max = p.y;
    }
  }
  return max;
}

/** Max y+height (bottom edge) in a list of width-normalized rectangles. */
function maxRectBottom(rects: Array<{ y?: number; height?: number }> | undefined): number {
  if (!Array.isArray(rects)) return 0;
  let max = 0;
  for (const r of rects) {
    if (typeof r?.y !== 'number' || !Number.isFinite(r.y)) continue;
    const bottom = r.y + (typeof r.height === 'number' ? r.height : 0);
    if (bottom > max) max = bottom;
  }
  return max;
}

/**
 * Pages required from a stroke's max-y, branching on encoding.
 *
 *   - NEW encoding (yNormBase='page-height'): y is directly in page units
 *     (y=1.5 means 1.5 × PAGE_HEIGHT pixels from top, i.e. halfway down
 *     page 2). pages = ceil(maxY).
 *   - LEGACY encoding (yNormBase missing): y was normalized by capture
 *     width, so y_pixel = y × capture_width. Without the capture width
 *     at hand, use REFERENCE_WIDTH_PX and convert to pages the same way
 *     text-boxes/images do: pages = ceil(maxY × REFERENCE_WIDTH_PX / PAGE_HEIGHT).
 *
 * Previously this was a 4-tier threshold heuristic (> 3/4 → 4 pages) that
 * was designed around legacy width-normalized y in a pre-multi-page
 * world. For the new encoding it always returned 4 for any stroke on
 * page 2+ — the root cause of the 2026-04-22 iPad bug where a 2-page
 * note displayed as 4 pages, the inflated count persisted to disk, and
 * rotation appeared to "add pages."
 */
function pagesFromStrokeMaxY(maxY: number, isPageHeightNormalized: boolean): number {
  if (maxY <= 0) return 1;
  if (isPageHeightNormalized) {
    return Math.max(1, Math.ceil(maxY));
  }
  // Legacy: width-normalized y.
  return Math.max(1, Math.ceil((maxY * REFERENCE_WIDTH_PX) / NOTABILITY_PAGE_HEIGHT_PX));
}

/**
 * Compute the number of PAGE_HEIGHT-tall pages required to display all
 * content in a parsed notability payload.
 *
 * Algorithm:
 *   1. Text boxes and images (width-normalized y) → pages =
 *      ceil(maxBottom * REFERENCE_WIDTH_PX / PAGE_HEIGHT).
 *   2. Strokes → branch on yNormBase per pagesFromStrokeMaxY.
 *   3. Report the MAX of (1), (2), and a 1-page floor.
 *
 * Returns an integer in [1, MAX_PAGES].
 */
export function computeNotabilityPagesHint(payload: NotabilityPayloadLike): number {
  const widthNormMaxY = Math.max(maxRectBottom(payload.textBoxes), maxRectBottom(payload.images));
  const strokeMaxY = maxStrokeY(payload.strokes);
  const isPageHeightNormalized = payload.yNormBase === Y_NORM_PAGE_HEIGHT;

  const pagesFromWidthNorm = widthNormMaxY > 0
    ? Math.ceil((widthNormMaxY * REFERENCE_WIDTH_PX) / NOTABILITY_PAGE_HEIGHT_PX)
    : 0;
  const pagesFromStrokes = pagesFromStrokeMaxY(strokeMaxY, isPageHeightNormalized);

  const pages = Math.max(1, pagesFromWidthNorm, pagesFromStrokes);
  return Math.max(1, Math.min(MAX_PAGES, pages));
}

/**
 * Resolve the page count a client should render for a parsed notability
 * payload. This is the editor-side counterpart to `augmentNotabilityJSON`:
 * prefer the explicit `canvasHeightPages` hint when it's present (set by
 * the sync layer on push, travels with the payload on pull), and fall
 * back to `computeNotabilityPagesHint` for documents that predate the
 * hint.
 *
 * Introduced to close the cross-device multi-page sync bug: receiving
 * devices were using only the content-derived estimate, which silently
 * collapsed pages 2+ when text-boxes / images (still legacy width-
 * normalized y) drove the heuristic to a wrong answer. With an explicit
 * hint we no longer re-derive the number each client has to guess at.
 */
export function resolveCanvasHeightPages(payload: NotabilityPayloadLike): number {
  if (typeof payload.canvasHeightPages === 'number'
      && Number.isFinite(payload.canvasHeightPages)
      && payload.canvasHeightPages >= 1) {
    return Math.max(1, Math.min(MAX_PAGES, Math.floor(payload.canvasHeightPages)));
  }
  return computeNotabilityPagesHint(payload);
}

/**
 * Augment a serialized notability JSON string with a `canvasHeightPages`
 * hint computed from the content. Returns the (possibly rewritten) JSON
 * string. Safe for:
 *   - non-JSON input (returns input unchanged)
 *   - empty / undefined input (returns input unchanged)
 *   - already-augmented input (overwrites the hint idempotently — derived
 *     from content, not stateful)
 *   - legacy non-version-2 payloads (returns unchanged; we only augment
 *     the normalized-stroke format)
 */
export function augmentNotabilityJSON(raw: string | null | undefined): string | null | undefined {
  if (!raw) return raw;
  let parsed: NotabilityPayloadLike;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // R5: silent-return is correct here. This helper runs on every
    // journal upload/download; a malformed `notability_data` blob must
    // not throw and break the entire sync step. Returning `raw`
    // unchanged makes augmentation a no-op for any non-JSON payload —
    // the server already stores whatever bytes we send, and downstream
    // parseExtended() handles the malformed case with its own try/catch.
    return raw;
  }
  if (!parsed || typeof parsed !== 'object') return raw;
  if (parsed.version !== 2) return raw;

  const pages = computeNotabilityPagesHint(parsed);
  if (parsed.canvasHeightPages === pages) return raw; // already current
  parsed.canvasHeightPages = pages;
  return JSON.stringify(parsed);
}

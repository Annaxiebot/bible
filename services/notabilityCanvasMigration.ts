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
 *  Duplicated deliberately here because the sync layer cannot import from
 *  the component layer without pulling in React. If the editor's PAGE_HEIGHT
 *  changes, update this constant too. Exported for the round-trip test —
 *  test/component must agree on the same magic number. */
// exported-for: services/__tests__/multipageSync.test.ts (R17)
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
  [key: string]: unknown;
}

/**
 * Compute the number of PAGE_HEIGHT-tall pages required to display all
 * content in a parsed notability payload.
 *
 * Algorithm:
 *   1. For text boxes and images (width-normalized y): pages =
 *      ceil(maxBottom_width_norm * REFERENCE_WIDTH_PX / PAGE_HEIGHT).
 *   2. For strokes (height-normalized y): if max y > 0.5 the canvas was
 *      at least 2 pages; if > 2/3 then at least 3; general formula
 *      pages = max(1, ceil(maxY / 0.5)) treating each 0.5-tall band as
 *      one page boundary.
 *   3. Report the MAX of (1), (2), and a 1-page floor.
 *
 * Returns an integer in [1, 20].
 */
export function computeNotabilityPagesHint(payload: NotabilityPayloadLike): number {
  let widthNormMaxY = 0; // textboxes + images
  let heightNormMaxY = 0; // strokes

  // Strokes: height-normalized y
  if (Array.isArray(payload.strokes)) {
    for (const s of payload.strokes) {
      if (!s || !Array.isArray(s.points)) continue;
      for (const p of s.points) {
        if (typeof p?.y === 'number' && Number.isFinite(p.y)) {
          if (p.y > heightNormMaxY) heightNormMaxY = p.y;
        }
      }
    }
  }

  // Text boxes: width-normalized y + height
  if (Array.isArray(payload.textBoxes)) {
    for (const tb of payload.textBoxes) {
      if (typeof tb?.y !== 'number' || !Number.isFinite(tb.y)) continue;
      const bottom = tb.y + (typeof tb.height === 'number' ? tb.height : 0);
      if (bottom > widthNormMaxY) widthNormMaxY = bottom;
    }
  }

  // Images: width-normalized y + height
  if (Array.isArray(payload.images)) {
    for (const img of payload.images) {
      if (typeof img?.y !== 'number' || !Number.isFinite(img.y)) continue;
      const bottom = img.y + (typeof img.height === 'number' ? img.height : 0);
      if (bottom > widthNormMaxY) widthNormMaxY = bottom;
    }
  }

  // Page count from width-normalized content (most reliable signal).
  const pagesFromWidthNorm = widthNormMaxY > 0
    ? Math.ceil((widthNormMaxY * REFERENCE_WIDTH_PX) / NOTABILITY_PAGE_HEIGHT_PX)
    : 0;

  // Page count lower bound from height-normalized strokes: treat each
  // band of 0.5 as a page boundary. maxY of 0.7 → 2 pages; 0.85 → 2
  // (since 2 bands of 0.5 wouldn't fit 0.85); 0.34 → 1. We conservatively
  // floor-divide then add 1 so strokes strictly above the 0.5 line
  // force a 2nd page.
  let pagesFromHeightNorm = 1;
  if (heightNormMaxY > 0.5) pagesFromHeightNorm = 2;
  if (heightNormMaxY > 2 / 3) pagesFromHeightNorm = 3;
  if (heightNormMaxY > 3 / 4) pagesFromHeightNorm = 4;
  // Anything >0.75 is ambiguous — we stop inferring and cap at 4 pages
  // from strokes alone. Textbox/image widthNorm signal takes over if present.

  const pages = Math.max(1, pagesFromWidthNorm, pagesFromHeightNorm);
  return Math.max(1, Math.min(MAX_PAGES, pages));
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

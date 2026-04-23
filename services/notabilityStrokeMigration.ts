/**
 * F3 stroke-normalization migration (extracted for testability).
 *
 * Legacy encoding (pre-F3): stroke point y is `y_pixel / capture_width`.
 *   y_pixel = y_legacy * capture_width
 * Means y drifts on rotation because capture_width != load_width.
 *
 * New encoding (F3+): stroke point y is `y_pixel / PAGE_HEIGHT`.
 *   y_pixel = y_new * PAGE_HEIGHT
 * PAGE_HEIGHT is a fixed constant so y_pixel is invariant on rotation.
 *
 * Migration assumption: capture_width ≈ load_width (user hasn't rotated
 * since save). Multi-rotation legacy docs will still drift on page 2+.
 * Going forward, every save writes yNormBase=Y_NORM_PAGE_HEIGHT so the
 * migration runs exactly once per legacy document.
 *
 * This module exists so the pure migration formula can be unit-tested
 * without rendering NotabilityEditor in jsdom (canvas API is fiddly
 * there). The editor's initialData effect calls `migrateStrokes` once
 * on load; all other logic stays put.
 */

export const Y_NORM_PAGE_HEIGHT = 'page-height' as const;

export interface StrokePoint {
  x: number;
  y: number;
}

export interface MigrationDoc {
  yNormBase?: typeof Y_NORM_PAGE_HEIGHT;
  strokes?: Array<{ points: StrokePoint[] }>;
}

/**
 * Convert legacy width-normalized stroke y's to PAGE_HEIGHT-normalized
 * y's IN PLACE. No-op if the doc is already new-encoding.
 *
 * Callers pass the observed load width (window.innerWidth or the canvas
 * rect width — the component uses window.innerWidth for consistency
 * with how capture_width was implicitly used at save time).
 */
export function migrateStrokes(
  doc: MigrationDoc,
  loadWidthPx: number,
  pageHeightPx: number,
): MigrationDoc {
  if (doc.yNormBase === Y_NORM_PAGE_HEIGHT) return doc;
  const scale = loadWidthPx / pageHeightPx;
  if (doc.strokes) {
    for (const stroke of doc.strokes) {
      stroke.points = stroke.points.map(p => ({ x: p.x, y: p.y * scale }));
    }
  }
  doc.yNormBase = Y_NORM_PAGE_HEIGHT;
  return doc;
}

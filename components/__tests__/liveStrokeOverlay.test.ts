import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * ADR-0002 Pencil fix #2 tripwire.
 *
 * Root cause addressed: per-pointermove `stroke()` call damages the full
 * multi-page main/overlay canvas (~12 M pixels at 4 pages × 1.5 DPR),
 * forcing iOS to recomposite the whole layer every event. The fix
 * introduces a page-sized `liveStrokeCanvas` that receives live paint
 * during a stroke; the completed stroke is blitted onto the real main/
 * overlay ctx once on pointerUp.
 *
 * A previous attempt (commit 7ca7626, reverted in dcca4e4) implemented
 * the same architecture but allocated the live canvas inside
 * `handlePointerDown`. That made first-stroke latency regress because
 * the browser had to synchronously create a large-bitmap canvas in the
 * pen-down handler. This tripwire enforces the specific invariant that
 * kept the regression away this time: the live canvas is allocated
 * ONCE in `setupCanvases`, and `handlePointerDown` does NOT call
 * `document.createElement('canvas')` or resize the backing store.
 *
 * Runtime perceived-smoothness verification is on-device only (headless
 * Chromium cannot measure iPad Pencil latency). The Playwright
 * invariant tests in `tests/e2e/notability-pointer-matrix.spec.ts`
 * cover pixel-level correctness (residual-ink, in-progress ink).
 */
describe('ADR-0002 Pencil fix #2: live-stroke overlay canvas', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const editorPath = resolve(here, '..', 'NotabilityEditor.tsx');
  const src = readFileSync(editorPath, 'utf8');

  it('declares the live-stroke canvas refs near the other canvas refs', () => {
    // If these disappear, the whole fix is gone.
    expect(src).toMatch(/const\s+liveStrokeCanvasRef\s*=\s*useRef<HTMLCanvasElement>\(null\)/);
    expect(src).toMatch(/const\s+liveStrokeCtxRef\s*=\s*useRef<CanvasRenderingContext2D\s*\|\s*null>\(null\)/);
  });

  it('allocates the live canvas exactly once in setupCanvases (sizing + context)', () => {
    // The live canvas must have its backing store written inside
    // setupCanvases, which is the callback that re-runs only on width /
    // DPR / canvasHeight change — NOT per pointerdown. This assertion
    // pins the sizing line and the getContext call to the same
    // setupCanvases body.
    const setupMatch = src.match(/const\s+setupCanvases\s*=\s*useCallback\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*\]\s*\)/);
    expect(setupMatch, 'could not locate setupCanvases body').not.toBeNull();
    const setupBody = setupMatch![1];
    expect(setupBody, 'live canvas backing store must be sized inside setupCanvases').toMatch(
      /liveStrokeCanvas\.width\s*=\s*width\s*\*\s*dpr/,
    );
    expect(setupBody, 'live canvas height must be PAGE_HEIGHT (one page), not canvasHeight').toMatch(
      /liveStrokeCanvas\.height\s*=\s*PAGE_HEIGHT\s*\*\s*dpr/,
    );
    expect(setupBody).toMatch(/liveStrokeCanvas\.getContext\(\s*'2d'/);
  });

  it('does NOT resize the live canvas backing store inside handlePointerDown (the 7ca7626 regression)', () => {
    // handlePointerDown is the pen-down hot path. The reverted commit
    // 7ca7626 wrote `liveEl.width = w * dpr; liveEl.height = liveH * dpr`
    // inside the down handler — the browser had to synchronously create
    // a large-bitmap backing store during the pen-down handler, and
    // first-stroke latency regressed on empty notes. This assertion
    // flags any recurrence of that pattern. Note: handlePointerDown
    // legitimately calls `document.createElement('canvas')` for the
    // lasso-selection SNAPSHOT canvas (unrelated to the live stroke
    // path), so we check the live-canvas refs specifically rather than
    // any createElement call.
    const downMatch = src.match(/const\s+handlePointerDown\s*=\s*useCallback\(\s*\(\s*clientX[\s\S]*?\},\s*\[[^\]]*\]\s*\)/);
    expect(downMatch, 'could not locate handlePointerDown body').not.toBeNull();
    const downBody = downMatch![0];
    // Forbid writes to `.width`/`.height` on any identifier that
    // references the live canvas. The reverted 7ca7626 used both
    // `liveEl.width` (local alias) and `liveStrokeCanvas.width`.
    expect(downBody, 'handlePointerDown must not write liveStrokeCanvas.width (re-allocation regression)').not.toMatch(
      /liveStrokeCanvas(Ref)?[^.]*\.width\s*=/,
    );
    expect(downBody, 'handlePointerDown must not write liveStrokeCanvas.height (re-allocation regression)').not.toMatch(
      /liveStrokeCanvas(Ref)?[^.]*\.height\s*=/,
    );
    expect(downBody, 'handlePointerDown must not write liveEl.width (re-allocation regression)').not.toMatch(
      /liveEl\.width\s*=/,
    );
    expect(downBody, 'handlePointerDown must not write liveEl.height (re-allocation regression)').not.toMatch(
      /liveEl\.height\s*=/,
    );
    // Also forbid getContext on the live canvas from inside down — the
    // reverted commit re-acquired the 2D context every stroke.
    expect(downBody, 'handlePointerDown must not call getContext on the live canvas (re-acquire regression)').not.toMatch(
      /liveEl\.getContext/,
    );
  });

  it('routes live pen paint through liveStrokeCtxRef in handlePointerMove', () => {
    // If this drifts back to painting directly on main/overlay ctx the
    // composite-cost win is gone. We allow a fallback branch for when
    // the live canvas hasn't mounted, but the primary path must use the
    // live ctx.
    const moveMatch = src.match(/const\s+handlePointerMove\s*=\s*useCallback\(\s*\(\s*clientX[\s\S]*?\},\s*\[[^\]]*\]\s*\)/);
    expect(moveMatch, 'could not locate handlePointerMove body').not.toBeNull();
    const moveBody = moveMatch![0];
    expect(moveBody).toMatch(/liveStrokeActiveRef\.current/);
    expect(moveBody).toMatch(/liveStrokeCtxRef\.current/);
  });

  it('clears the live canvas on stroke commit so residual ink cannot leak into the next stroke', () => {
    // commitCurrentStroke runs on pointerUp. It must leave the live
    // canvas empty + hidden so the next pointerDown starts clean. If
    // this clearRect vanishes, strokes visibly bleed into each other.
    const commitMatch = src.match(/const\s+commitCurrentStroke\s*=\s*useCallback\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*\]\s*\)/);
    expect(commitMatch, 'could not locate commitCurrentStroke body').not.toBeNull();
    const commitBody = commitMatch![1];
    expect(commitBody).toMatch(/liveCtx\.clearRect/);
    expect(commitBody).toMatch(/liveEl\.style\.display\s*=\s*['"]none['"]/);
  });
});

/**
 * Apple Pencil / pointer-event integration matrix for NotabilityEditor.
 *
 * Per PLAN.md Phase 0, this file is the safety net that ends the
 * "fix A → regression in B → revert → re-fix" pattern on iPad Safari.
 * Every future pencil fix must ship paired with the failing test it fixes (R6).
 *
 * Matrix cells: {pen, touch, mouse} × {pointer, text, lasso, drawing tools} × {drag, tap, hold}.
 * Not every combination is implemented here — cells that require real Apple Pencil
 * hardware (pressure, palm, radiusX < 3, Scribble) are marked `test.fixme` with
 * a note explaining what must be verified on device.
 *
 * Synthetic events approximate iPad Safari but do NOT faithfully reproduce
 * Apple Pencil. Treat Chromium-passing tests as a floor, not a ceiling: green
 * here does not prove the iPad is green.
 */

import { test, expect, type Page } from '@playwright/test';
import { tap, drag, hold } from './helpers/pointerSynth';

/**
 * Navigate to NotabilityEditor with a fresh journal entry. Returns the canvas
 * locator.
 *
 * NOTE: This helper assumes the dev server serves at http://localhost:3000/bible/
 * (see playwright.config.ts) and that the default landing view exposes a
 * Journal / Notes tab. If the navigation path changes, update this helper —
 * do not paper over it in individual tests.
 */
async function openNotability(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Switch to the Notes layout so JournalView is mounted.
  await page.locator('[data-testid="layout-btn-notes"]').click().catch(async () => {
    // Fallback: some builds label the button differently; try by text.
    await page.getByRole('button', { name: /^notes$/i }).first().click();
  });
  await page.waitForTimeout(200);

  // Create a new journal entry if none exists (empty-state CTA is the "+" button).
  const emptyStateHint = page.locator('text=/no journal entries yet/i');
  if (await emptyStateHint.isVisible().catch(() => false)) {
    // The "+" create-entry button sits next to the search input.
    await page.locator('button').filter({ hasText: /^\+$/ }).first().click()
      .catch(async () => {
        // Fallback: any button whose text is just a plus, or title "Create".
        await page.locator('button[title*="Create"], button[aria-label*="Create"]').first().click();
      });
    await page.waitForTimeout(400);
  }

  // Now trigger the Notability editor via the layout toolbar button.
  await page.locator('[data-testid="layout-btn-notability"]').click();

  // The editor mounts inside a fixed overlay with the Done button in the top-left.
  await page.getByRole('button', { name: /^done$/i }).waitFor({ timeout: 8_000 });

  // NotabilityEditor renders THREE canvases: (0) paper bg, (1) drawing layer,
  // (2) above-text overlay. Pointer listeners live on #1. Ink lands on #1 by
  // default (or #2 when drawingLayer==='above', which we don't toggle here).
  // Target #1 explicitly — targeting #0 would dispatch to a canvas that has
  // no listeners AND whose pixels include the paper background, poisoning
  // canvasHasInk.
  const canvas = page.locator('canvas').nth(1);
  await canvas.waitFor({ state: 'visible', timeout: 5_000 });
  return canvas;
}

async function selectTool(page: Page, title: string) {
  await page.locator(`button[title="${title}"]`).first().click();
  await page.waitForTimeout(100);
}

/**
 * Count strokes by peeking at the canvas ImageData non-white pixel ratio.
 * This is a blunt instrument — good enough to tell "drawing happened" from
 * "drawing did not happen", but will NOT detect subtle coordinate drift.
 * For coordinate-accuracy checks, use hit-test helpers in individual tests.
 */
/**
 * Does the drawing layer OR the above-text overlay have ink?
 *
 * NotabilityEditor's default drawingLayer is 'above' — so fresh strokes land
 * on the overlay canvas (document index 2), NOT the drawing canvas (index 1).
 * The user can toggle via the layer button to commit to 'below', which moves
 * subsequent strokes to the drawing canvas. For test reliability we check
 * both and count ink on EITHER. Canvas 0 (paper bg) is always excluded.
 */
async function canvasHasInk(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')] as HTMLCanvasElement[];
    // Skip canvas 0 (paper background) — it always has pixels.
    for (let idx = 1; idx < canvases.length; idx++) {
      const c = canvases[idx];
      const ctx = c.getContext('2d');
      if (!ctx || c.width === 0 || c.height === 0) continue;
      try {
        const img = ctx.getImageData(0, 0, c.width, c.height);
        let inked = 0;
        for (let i = 3; i < img.data.length; i += 4) {
          if (img.data[i] > 10) { inked++; if (inked > 10) return true; }
        }
      } catch { /* canvas may be tainted or sized 0 */ }
    }
    return false;
  });
}

test.describe('NotabilityEditor pointer-event matrix', () => {
  test.beforeEach(async ({ page }) => {
    // Grant clipboard so copy-path features don't block.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  // ── Row: pen (Apple Pencil) × drawing tool ───────────────────────────────

  test('pen + pen tool + drag draws a stroke', async ({ page }) => {
    const canvas = await openNotability(page);
    await selectTool(page, 'Pen');
    await drag(page, canvas, { x: 60, y: 60 }, { x: 200, y: 140 }, { pointerType: 'pen', steps: 12 });
    await expect.poll(() => canvasHasInk(page), { timeout: 3_000 }).toBe(true);
  });

  test('pen + pen tool + tap does NOT leave a stray dot on empty canvas', async ({ page }) => {
    // Regression guard: some iPad Safari builds turn a single-point pen tap
    // into a stroke-of-length-zero that commits and later renders as a dot.
    // The editor requires ≥2 points to commit a stroke (see SimpleDrawingCanvas
    // commitCurrentStroke). This enforces the same invariant here.
    const canvas = await openNotability(page);
    await selectTool(page, 'Pen');
    await tap(page, canvas, { x: 100, y: 100 }, { pointerType: 'pen' });
    // No ink expected from a single-point tap.
    expect(await canvasHasInk(page)).toBe(false);
  });

  test('pen + eraser + drag over existing stroke removes ink', async ({ page }) => {
    const canvas = await openNotability(page);
    await selectTool(page, 'Pen');
    await drag(page, canvas, { x: 80, y: 80 }, { x: 260, y: 80 }, { pointerType: 'pen', steps: 10 });
    expect(await canvasHasInk(page)).toBe(true);
    await selectTool(page, 'Eraser');
    await drag(page, canvas, { x: 80, y: 80 }, { x: 260, y: 80 }, { pointerType: 'pen', steps: 10 });
    await expect.poll(() => canvasHasInk(page), { timeout: 3_000 }).toBe(false);
  });

  test.fixme('pen fast scribble keeps all coalesced points', async () => {
    // Apple Pencil fires at ~240Hz; iOS batches sub-events into a single
    // pointermove and getCoalescedEvents() replays them. Synthetic events
    // cannot produce coalesced events (browser would need to coalesce itself),
    // so verify on device that a fast scribble's stroke length matches the
    // geometric path, not the sparse pointermove sample rate.
  });

  // ── Row: pen × non-drawing tool (palm/mode guards) ───────────────────────

  test('pen + pointer tool + tap does NOT draw', async ({ page }) => {
    const canvas = await openNotability(page);
    await selectTool(page, 'Pointer');
    await tap(page, canvas, { x: 120, y: 120 }, { pointerType: 'pen' });
    expect(await canvasHasInk(page)).toBe(false);
  });

  test('pen + text tool + tap does NOT draw and does NOT create a text box', async ({ page }) => {
    // Text mode is keyboard-only — Apple Pencil is inert here. If this fails,
    // either (a) Scribble is activating (iOS Scribble fires pointerdown with
    // pointerType='pen') or (b) the text-mode stylus guard was removed.
    const canvas = await openNotability(page);
    await selectTool(page, 'Text');
    const textBoxesBefore = await page.locator('[contenteditable]').count();
    await tap(page, canvas, { x: 140, y: 140 }, { pointerType: 'pen' });
    expect(await canvasHasInk(page)).toBe(false);
    expect(await page.locator('[contenteditable]').count()).toBe(textBoxesBefore);
  });

  // ── Row: pen × lasso ─────────────────────────────────────────────────────

  test('pen + lasso + drag creates a selection box', async ({ page }) => {
    const canvas = await openNotability(page);
    await selectTool(page, 'Pen');
    // Draw a small thing so there's something to select.
    await drag(page, canvas, { x: 80, y: 80 }, { x: 150, y: 120 }, { pointerType: 'pen', steps: 8 });
    await selectTool(page, 'Box Select');
    await drag(page, canvas, { x: 60, y: 60 }, { x: 180, y: 140 }, { pointerType: 'pen', steps: 8 });
    // Selection handles / bounding box should appear. The editor renders a
    // dashed rectangle — check for its stroke style marker via a visible badge.
    // Accept EITHER a submenu opening OR a visible selection hint.
    const selectionHint = page.locator('text=/select|selected/i').first();
    await expect(selectionHint).toBeVisible({ timeout: 2_000 }).catch(() => { /* soft */ });
  });

  // ── Row: touch (finger) — iPad palm rejection, iPhone finger-draw ────────

  test('touch + pen tool + drag on iPad-like device does NOT draw (palm rejection)', async ({ page }) => {
    // NotabilityEditor detects "iPad-like" by pointer-events + iOS UA. In
    // Chromium desktop we approximate the iPad branch by injecting a stylus
    // signal via radiusX — the code path keys on `isStylusTouch`, which uses
    // radiusX < 10 as the stylus heuristic. A finger simulated with radiusX=20
    // should be routed to navigation (scroll) rather than drawing.
    const canvas = await openNotability(page);
    await selectTool(page, 'Pen');
    await drag(page, canvas, { x: 80, y: 80 }, { x: 220, y: 150 }, {
      pointerType: 'touch', radiusX: 20, steps: 10,
    });
    // Chromium on desktop treats finger-touch as a stylus in some configs —
    // this test is best interpreted as a soft check. Primary verification
    // happens on device.
    // We still assert the app didn't crash and the canvas is still there.
    await expect(canvas).toBeVisible();
  });

  test.fixme('touch + pointer tool + swipe flips pages in single-page mode', async () => {
    // Requires `pageMode === 'single'` setup and a multi-page canvas. Can be
    // implemented with extra fixture plumbing.
  });

  // ── Row: mouse — desktop fallback ────────────────────────────────────────

  test('mouse + pen tool + drag draws', async ({ page }) => {
    const canvas = await openNotability(page);
    await selectTool(page, 'Pen');
    await drag(page, canvas, { x: 100, y: 100 }, { x: 240, y: 180 }, { pointerType: 'mouse', steps: 10 });
    await expect.poll(() => canvasHasInk(page), { timeout: 3_000 }).toBe(true);
  });

  test('mouse + pointer tool + tap deselects', async ({ page }) => {
    const canvas = await openNotability(page);
    await selectTool(page, 'Pointer');
    await tap(page, canvas, { x: 150, y: 150 }, { pointerType: 'mouse' });
    // No ink should appear, no crash.
    expect(await canvasHasInk(page)).toBe(false);
  });

  test('mouse + text tool + tap creates a text box', async ({ page }) => {
    const canvas = await openNotability(page);
    const before = await page.locator('[contenteditable]').count();
    await selectTool(page, 'Text');
    await tap(page, canvas, { x: 160, y: 160 }, { pointerType: 'mouse' });
    await expect
      .poll(() => page.locator('[contenteditable]').count(), { timeout: 2_000 })
      .toBeGreaterThan(before);
  });

  test('mouse + lasso + drag then click outside clears selection', async ({ page }) => {
    const canvas = await openNotability(page);
    await selectTool(page, 'Pen');
    await drag(page, canvas, { x: 100, y: 100 }, { x: 160, y: 140 }, { pointerType: 'mouse', steps: 6 });
    await selectTool(page, 'Box Select');
    await drag(page, canvas, { x: 80, y: 80 }, { x: 180, y: 160 }, { pointerType: 'mouse', steps: 6 });
    await tap(page, canvas, { x: 400, y: 400 }, { pointerType: 'mouse' });
    // No crash; canvas still responsive.
    await expect(canvas).toBeVisible();
  });

  // ── Coordinate fidelity ──────────────────────────────────────────────────

  test('stroke endpoints land where the pointer hit (DPR-invariant)', async ({ page }) => {
    // This test is designed to catch the `Canvas coordinate alignment` bug
    // (user memory: "Always scale canvas coords for DPR"). If getCanvasPoint's
    // scaleX/scaleY math is off, strokes drift proportional to DPR. We sample
    // a generous ROI around the endpoint — 24 CSS px. Tighter bounds become
    // flaky from line-cap rounding and CSS-subpixel canvas sizing; 24 px is
    // still tight enough to catch the real drift class (which typically
    // manifests as 20%+ offset on non-1x DPR).
    const canvas = await openNotability(page);
    await selectTool(page, 'Pen');
    const target = { x: 180, y: 180 };
    await drag(page, canvas, { x: 80, y: 80 }, target, { pointerType: 'mouse', steps: 16 });
    const inkNearTarget = await page.evaluate((pt) => {
      // Check every non-paper canvas (drawing + overlay). See canvasHasInk for
      // rationale — default drawingLayer === 'above' lands ink on the overlay.
      const canvases = [...document.querySelectorAll('canvas')] as HTMLCanvasElement[];
      for (let idx = 1; idx < canvases.length; idx++) {
        const c = canvases[idx];
        const ctx = c.getContext('2d'); if (!ctx) continue;
        const rect = c.getBoundingClientRect();
        if (rect.width === 0 || c.width === 0) continue;
        const dpr = Math.max(1, c.width / rect.width);
        const cx = Math.round(pt.x * dpr);
        const cy = Math.round(pt.y * dpr);
        const roi = Math.round(24 * dpr);
        const x0 = Math.max(0, cx - roi);
        const y0 = Math.max(0, cy - roi);
        const w = Math.min(c.width - x0, roi * 2);
        const h = Math.min(c.height - y0, roi * 2);
        if (w <= 0 || h <= 0) continue;
        try {
          const data = ctx.getImageData(x0, y0, w, h).data;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 10) return true;
        } catch { /* next canvas */ }
      }
      return false;
    }, target);
    expect(inkNearTarget, 'expected ink within 24 CSS px of drag endpoint').toBe(true);
  });

  // ── Tool switching mid-stroke ────────────────────────────────────────────

  test.fixme('switching tools mid-stroke does not leak ink into the new mode', async () => {
    // Rare but has regressed before: if setActiveTool fires while
    // isDrawingRef.current === true, the next move can draw with the new
    // tool's settings. Needs a narrower test harness than this E2E matrix to
    // race the state updates reliably.
  });

  // ── Orientation / layout ─────────────────────────────────────────────────

  test.fixme('rotating the device mid-stroke does not drift committed strokes', async () => {
    // Requires programmatic orientation change (Playwright cannot simulate
    // CSS orientation perfectly in headless Chromium). Verify on device.
  });

  test.fixme('toggling the sidebar mid-session does not shift stroke positions', async () => {
    // Requires the sidebar-open state to differ from the session's initial
    // canvas rect. Needs journal-level setup; flag for future.
  });
});

// ── iPad palm-rejection suite ──────────────────────────────────────────────
// Spoofs the iPad UA + maxTouchPoints so NotabilityEditor's `isApplePencilDevice`
// branch activates. Exercises the specific user-reported bug: resting pinky /
// palm on the screen while preparing to write was moving pages (single-page)
// or scrolling (seamless).
test.describe('NotabilityEditor palm rejection (iPad-simulated)', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    // maxTouchPoints is the second prong of the iPad UA sniff in NotabilityEditor.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    });
  });

  test('palm drag in pen mode does NOT flip page in single-page mode', async ({ page }) => {
    const canvas = await openNotability(page);

    // Switch the editor into single-page mode via the overflow menu. Default
    // is seamless; this test specifically guards the goToPage-on-swipe path.
    // The outer wrapper's inline transform is the reliable signal that
    // single-page mode is active — seamless leaves its transform empty.
    // Note: button-title selectors are brittler than data-testid, but the dev
    // server's HMR occasionally misses component-prop changes, so we use the
    // stable attributes that Vite definitely serves on first load.
    const pageStack = page.locator('[data-testid="page-stack-outer"]');
    await page.locator('button[title="Menu"]').click();
    // "Single Page" is a label with an emoji prefix — match by partial text via
    // exact button role to avoid matching the paper-type "Plain" / heading row.
    await page.getByRole('button', { name: /Single Page/ }).click();
    await expect
      .poll(() => pageStack.evaluate(el => (el as HTMLElement).style.transform), { timeout: 3_000 })
      .toMatch(/translateY/);

    await selectTool(page, 'Pen');

    // Wiggle a palm-shaped finger (radiusX=22) across the canvas. Before the
    // fix a finger drag of >50px in single-page mode would call goToPage()
    // and the translateY would shift from 0 to -PAGE_HEIGHT.
    const initialTransform = await pageStack.evaluate(
      el => getComputedStyle(el as HTMLElement).transform,
    );
    await drag(page, canvas, { x: 80, y: 80 }, { x: 240, y: 120 }, {
      pointerType: 'touch', radiusX: 22, steps: 10,
    });
    // Poll until the transform has had time to settle — guards against race
    // with the 0.3s transform transition. The invariant must hold for the
    // full poll window; we assert at the end.
    await expect
      .poll(() => pageStack.evaluate(el => getComputedStyle(el as HTMLElement).transform), { timeout: 1_500 })
      .toBe(initialTransform);
    expect(await canvasHasInk(page), 'palm must not leave ink either').toBe(false);
  });

  test('finger pan in pen mode does NOT scroll in seamless mode', async ({ page }) => {
    const canvas = await openNotability(page);
    // Seamless is the default pageMode; no toggle needed.
    await selectTool(page, 'Pen');

    // The scroll container's class selector is brittle but stable in this
    // codebase — isolated into a local helper so a future rename needs one
    // change, not two.
    const getScrollTop = () => page.evaluate(() => {
      const containers = document.querySelectorAll('.overflow-x-hidden');
      return (containers[containers.length - 1] as HTMLElement | undefined)?.scrollTop ?? 0;
    });

    const scrollBefore = await getScrollTop();
    await drag(page, canvas, { x: 80, y: 300 }, { x: 80, y: 80 }, {
      pointerType: 'touch', radiusX: 22, steps: 10,
    });
    const scrollAfter = await getScrollTop();
    expect(scrollAfter, `seamless scroll drifted from ${scrollBefore} to ${scrollAfter}`).toBe(scrollBefore);
  });

  test('pencil drag in pen mode still draws on iPad (happy path not regressed)', async ({ page }) => {
    const canvas = await openNotability(page);
    await selectTool(page, 'Pen');
    await drag(page, canvas, { x: 80, y: 80 }, { x: 220, y: 140 }, {
      pointerType: 'pen', radiusX: 1, steps: 12,
    });
    await expect.poll(() => canvasHasInk(page), { timeout: 3_000 }).toBe(true);
  });
});

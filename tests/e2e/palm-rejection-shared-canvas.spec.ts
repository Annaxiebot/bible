/**
 * Palm rejection on the canvas Bible and Journal SHARE — in a REAL browser
 * 共用画布的手掌屏蔽 · 真实浏览器
 *
 * The unit suite (components/__tests__/palmRejectionSharedCanvas.test.tsx) drives
 * SimpleDrawingCanvas in jsdom, where there is no Touch constructor, no 2D context and no
 * layout — every radius is a hand-shaped fake and the ink path only runs against a mocked
 * context. R6 asks for the user flow, not the function, so this file re-runs the two
 * user-reported symptoms against the real component, mounted by the real app, driven by real
 * `Touch` objects that carry a real `radiusX`:
 *
 *   1. a resting pinky (radiusX ~30) triggered the page-flip / panel-swipe navigation;
 *   2. with a palm already down, the Apple Pencil wrote no ink — `e.touches.length > 1`
 *      counted the palm and rejected the Pencil's touchstart as multi-touch.
 *
 * WHAT THIS CAN AND CANNOT PROVE (same honesty as notability-pointer-matrix.spec.ts):
 * Chromium's `Touch` honours `radiusX`, so the classification really runs on real numbers.
 * Chromium has NO `touchType`, which is Safari-only, so a Pencil is recognised here only by
 * its small radius — utils/touchClassification.ts falls back to
 * `radiusX < PALM.STYLUS_RADIUS_PX`. The branches where `touchType` OUTRANKS the radius
 * cannot be driven from here and are left as `test.fixme`. Synthetic events approximate
 * iPad Safari; green here is a floor, not a ceiling.
 *
 * WHY THE ASSERTION IS "THE EVENT NEVER REACHES #root" AND NOT "THE PAGE DID NOT FLIP":
 * palm rejection is deliberately two layers deep — the canvas swallows the palm, and
 * useSwipeNavigation / the Journal list swipe independently refuse to navigate on one
 * (`navigationTouch`). So "the page did not flip" stays true even with the canvas fix
 * reverted: the outer layer would mask the inner one and the test would pass vacuously
 * (R14). The load-bearing assertion is therefore the propagation boundary that the fix
 * actually creates. React 19 attaches ONE delegated native listener per event type on the
 * element given to createRoot (#root — see index.tsx) and simulates bubbling through the
 * component tree from there; an event that never reaches #root can run no onTouchStart
 * anywhere in the app, page flip and panel swipe alike.
 *
 * SURFACE: the Journal's Draw mode (JournalView noteMode='draw'), because its editor pane
 * is itself wrapped in a real navigation gesture — the entry-list collapse swipe — and
 * nothing in between calls stopPropagation. The Bible annotation path mounts the same
 * component, but BibleVersePanel's own `handleAnnotationTouchStart` already stops any
 * single-contact touch while annotating, which would mask the canvas-level fix.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { dispatchTouchFrames, type SynthContact } from './helpers/pointerSynth';
import { PALM } from '../../constants/appConfig';

// Radii around the thresholds the classifier actually reads, sourced from the one constant
// that defines them (R3) so a change to PALM.* cannot leave this file asserting stale numbers.
const PALM_RADIUS_PX = PALM.RADIUS_PX + 5;        // 30 — a resting pinky, as reported
const FINGER_RADIUS_PX = (PALM.STYLUS_RADIUS_PX + PALM.RADIUS_PX) / 2; // ~18 — a fingertip
const PENCIL_RADIUS_PX = 3;                       // an Apple Pencil tip

const palm = (x: number, y: number): SynthContact => ({ id: 30, x, y, radiusX: PALM_RADIUS_PX });
const pencil = (x: number, y: number): SynthContact => ({ id: 10, x, y, radiusX: PENCIL_RADIUS_PX });
const finger = (id: number, x: number, y: number): SynthContact => ({ id, x, y, radiusX: FINGER_RADIUS_PX });

interface InkRegion { x: number; y: number; width: number; height: number }

/**
 * Open a fresh Journal entry in Draw mode and return the ink canvas.
 *
 * SimpleDrawingCanvas renders TWO canvases: [0] is the paper background with
 * `pointer-events: none`, [1] is the ink layer that carries the touch listeners. Picking
 * [0] would dispatch into a dead element and every assertion below would pass for the wrong
 * reason, so the pick is asserted before it is used.
 */
async function openJournalDrawing(page: Page): Promise<Locator> {
  await page.goto('/#app');
  await page.waitForLoadState('networkidle');

  await page.locator('[data-testid="layout-btn-notes"]').click();
  await page.locator('button[title="New entry"]').first().click();
  await page.getByRole('button', { name: /Draw$/ }).first().click();

  await expect(page.locator('canvas')).toHaveCount(2);
  const canvas = page.locator('canvas').nth(1);
  await expect(canvas).toBeVisible();
  // The listener host is the one the component leaves clickable.
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.style.pointerEvents)).toBe('auto');
  // setupCanvases() sizes the backing store from layout. Until it has run, every handler
  // bails at `if (!canvas || !ctx) return` and the ink assertions would mean nothing.
  await expect
    .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width), { timeout: 5_000 })
    .toBeGreaterThan(0);
  return canvas;
}

/** Start counting touch events that escape the canvas and reach the React root container. */
async function installNavigationProbe(page: Page) {
  await page.evaluate(() => {
    const root = document.getElementById('root');
    if (!root) throw new Error('#root missing — React root container moved, update this probe');
    const w = window as unknown as Record<string, unknown>;
    const counts = { touchstart: 0, touchmove: 0, touchend: 0 };
    w.__navProbe = counts;
    const handler = (e: Event) => { counts[e.type as keyof typeof counts]++; };
    root.addEventListener('touchstart', handler);
    root.addEventListener('touchmove', handler);
    root.addEventListener('touchend', handler);
  });
}

async function navigationProbe(page: Page) {
  return page.evaluate(() => (window as unknown as { __navProbe: Record<string, number> }).__navProbe);
}

/** Opaque pixels on the ink canvas, optionally restricted to a CSS-px region of it. */
async function inkedPixels(canvas: Locator, region?: InkRegion): Promise<number> {
  return canvas.evaluate((c: HTMLCanvasElement, region: InkRegion | undefined) => {
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2D context on the ink canvas');
    const rect = c.getBoundingClientRect();
    const scale = c.width / rect.width; // devicePixelRatio the component scaled by
    const box = region
      ? { x: region.x * scale, y: region.y * scale, w: region.width * scale, h: region.height * scale }
      : { x: 0, y: 0, w: c.width, h: c.height };
    const img = ctx.getImageData(Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h));
    let inked = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 10) inked++;
    return inked;
  }, region);
}

test.describe('SimpleDrawingCanvas palm rejection (real Chromium touches)', () => {
  test('PRECONDITION: a Chromium Touch really carries radiusX, and has no touchType', async ({ page }) => {
    // Everything below classifies on radiusX. If Chromium ever stopped honouring it, a palm
    // would arrive with radiusX undefined, isPalmTouch() would return false, the "palm" would
    // be inked and swallowed like an ordinary finger — and the propagation assertions would
    // still pass. This test is what stops that silent turn to green.
    const canvas = await openJournalDrawing(page);
    const probe = await canvas.evaluate((c: HTMLCanvasElement) => {
      const t = new Touch({ identifier: 1, target: c, clientX: 10, clientY: 10, radiusX: 30, radiusY: 30 });
      return { radiusX: t.radiusX, hasTouchType: 'touchType' in t };
    });
    expect(probe.radiusX).toBe(30);
    // Safari-only. Documented so nobody later "fixes" the spec by setting touchType and
    // believing the stylus branch is covered — it is not; see the fixme below.
    expect(probe.hasTouchType).toBe(false);

    // And the radii this file uses really do straddle the thresholds the classifier reads.
    expect(PALM_RADIUS_PX).toBeGreaterThan(PALM.RADIUS_PX);
    expect(FINGER_RADIUS_PX).toBeGreaterThan(PALM.STYLUS_RADIUS_PX);
    expect(FINGER_RADIUS_PX).toBeLessThan(PALM.RADIUS_PX);
    expect(PENCIL_RADIUS_PX).toBeLessThan(PALM.STYLUS_RADIUS_PX);
  });

  test('SYMPTOM 1: a resting pinky never reaches a navigation handler', async ({ page }) => {
    const canvas = await openJournalDrawing(page);
    await installNavigationProbe(page);

    // A hand resting on the glass and shifting 200px — the gesture that used to flip the page.
    await dispatchTouchFrames(page, canvas, [
      { type: 'touchstart', touches: [palm(60, 420)] },
      { type: 'touchmove', touches: [palm(160, 420)] },
      { type: 'touchmove', touches: [palm(260, 425)] },
      { type: 'touchend', touches: [], changed: [palm(260, 425)] },
    ]);

    // touchstart and touchmove are what the fix swallows, and what the reported symptom is
    // made of: a gesture can only start and be driven through those two.
    const afterPalm = await navigationProbe(page);
    expect(afterPalm.touchstart).toBe(0);
    expect(afterPalm.touchmove).toBe(0);
    // NOT asserted as 0: touchend. The real browser showed the jsdom suite an event it never
    // dispatched — a palm LIFTING while no stroke is in progress leaves
    // SimpleDrawingCanvas.handleTouchEnd's `activeTouchIdRef.current !== null` guard false, so
    // it falls through to a bare `e.preventDefault()` with no stopPropagation and the touchend
    // does reach #root. It is harmless with today's handlers (both useSwipeNavigation and the
    // Journal list swipe start from state that a rejected touchstart never set), so this spec
    // reports the asymmetry rather than freezing it into an assertion in either direction.
    expect(await inkedPixels(canvas)).toBe(0);
    // Secondary, and NOT load-bearing: the entry-list swipe refuses palms on its own, so this
    // would hold with the canvas fix reverted. It is here as the user-visible end state only.
    await expect(page.locator('button[title="Hide list"]')).toBeVisible();

    // CONTROL — the probe is live and this element really is inside the delegated tree.
    // Without it, "0 events reached #root" would also be true of a probe wired to nothing.
    await dispatchTouchFrames(page, canvas, [
      { type: 'touchstart', touches: [finger(1, 100, 100), finger(2, 300, 100)] },
    ]);
    expect((await navigationProbe(page)).touchstart).toBeGreaterThan(0);
  });

  test('SYMPTOM 2: the Pencil inks while a palm is already resting', async ({ page }) => {
    const canvas = await openJournalDrawing(page);
    expect(await inkedPixels(canvas)).toBe(0);

    await dispatchTouchFrames(page, canvas, [
      // The palm lands first, as it does when you put your hand down before writing.
      { type: 'touchstart', touches: [palm(60, 420)] },
      // The Pencil joins: two contacts, which the old `touches.length > 1` guard rejected.
      { type: 'touchstart', touches: [palm(60, 420), pencil(200, 150)], changed: [pencil(200, 150)] },
      { type: 'touchmove', touches: [palm(60, 420), pencil(260, 170)], changed: [pencil(260, 170)] },
      { type: 'touchmove', touches: [palm(60, 420), pencil(330, 190)], changed: [pencil(330, 190)] },
      { type: 'touchend', touches: [palm(60, 420)], changed: [pencil(330, 190)] },
    ]);

    expect(await inkedPixels(canvas)).toBeGreaterThan(0);
  });

  test('the stroke follows the Pencil, not the palm sharing the screen', async ({ page }) => {
    const canvas = await openJournalDrawing(page);
    const box = (await canvas.boundingBox())!;
    const topBand: InkRegion = { x: 0, y: 0, width: box.width, height: 250 };
    const bottomBand: InkRegion = { x: 0, y: 300, width: box.width, height: box.height - 300 };

    await dispatchTouchFrames(page, canvas, [
      { type: 'touchstart', touches: [palm(60, 400), pencil(200, 120)], changed: [palm(60, 400), pencil(200, 120)] },
      // The palm slides right across the bottom while the Pencil writes a short line up top.
      { type: 'touchmove', touches: [palm(300, 430), pencil(240, 140)], changed: [palm(300, 430), pencil(240, 140)] },
      { type: 'touchmove', touches: [palm(600, 460), pencil(280, 160)], changed: [palm(600, 460), pencil(280, 160)] },
      { type: 'touchend', touches: [palm(600, 460)], changed: [pencil(280, 160)] },
    ]);

    expect(await inkedPixels(canvas, topBand)).toBeGreaterThan(0);
    // The line must not have been dragged across the page by the palm.
    expect(await inkedPixels(canvas, bottomBand)).toBe(0);
  });

  test('an interrupted stroke is COMMITTED, so the ink survives leaving Draw mode', async ({ page }) => {
    // iPadOS fires touchcancel when it takes a touch over. The ink you already drew is on the
    // live canvas either way, so pixels alone prove nothing — the question is whether the
    // stroke was committed to the entry. Leaving Draw mode and coming back remounts the
    // component from the committed data, which only redraws what was actually stored.
    const canvas = await openJournalDrawing(page);
    await dispatchTouchFrames(page, canvas, [
      { type: 'touchstart', touches: [pencil(150, 150)] },
      { type: 'touchmove', touches: [pencil(250, 200)] },
      { type: 'touchmove', touches: [pencil(350, 250)] },
      { type: 'touchcancel', touches: [], changed: [pencil(350, 250)] },
    ]);
    expect(await inkedPixels(canvas)).toBeGreaterThan(0);

    await page.getByRole('button', { name: /Text$/ }).first().click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: /Draw$/ }).first().click();

    const reopened = page.locator('canvas').nth(1);
    await expect
      .poll(() => reopened.evaluate((c: HTMLCanvasElement) => c.width), { timeout: 5_000 })
      .toBeGreaterThan(0);
    await expect.poll(() => inkedPixels(reopened), { timeout: 5_000 }).toBeGreaterThan(0);
  });

  test('CONTROL: one fingertip still draws where there is no Pencil', async ({ page }) => {
    // The fix must not degrade to "reject everything": on an iPhone, or in a finger-drawing
    // mode, a single ordinary contact is still a stroke.
    const canvas = await openJournalDrawing(page);
    await dispatchTouchFrames(page, canvas, [
      { type: 'touchstart', touches: [finger(1, 120, 120)] },
      { type: 'touchmove', touches: [finger(1, 200, 160)] },
      { type: 'touchmove', touches: [finger(1, 280, 200)] },
      { type: 'touchend', touches: [], changed: [finger(1, 280, 200)] },
    ]);
    expect(await inkedPixels(canvas)).toBeGreaterThan(0);
  });

  test('CONTROL: two real fingers reach the app, so pinch and two-finger scroll survive', async ({ page }) => {
    const canvas = await openJournalDrawing(page);
    await installNavigationProbe(page);
    await dispatchTouchFrames(page, canvas, [
      { type: 'touchstart', touches: [finger(1, 100, 100), finger(2, 300, 100)] },
      { type: 'touchmove', touches: [finger(1, 100, 160), finger(2, 300, 160)] },
    ]);
    const probe = await navigationProbe(page);
    expect(probe.touchstart).toBeGreaterThan(0);
    expect(probe.touchmove).toBeGreaterThan(0);
    expect(await inkedPixels(canvas)).toBe(0);
  });

  test.fixme('touchType outranks the radius (a fat-reporting Pencil, a small fingertip)', async () => {
    // isStylusTouch()/isPalmTouch() believe Safari's `touchType` over the radius: a contact
    // tagged 'stylus' is never a palm however large it reports, and one tagged 'direct' is
    // never a stylus however small. Chromium's Touch has no touchType at all and the
    // constructor drops the key, so those two branches CANNOT be driven here — setting the
    // property on a synthetic object would only be testing the test. Verify on a real iPad:
    // press the Pencil flat enough to report radiusX > 25 (it must still write, not be
    // rejected as a palm) and touch with a fingernail (it must navigate, not write).
  });

  test.fixme('iPadOS palm rejection and Scribble firing their own touchcancel', async () => {
    // The commit-on-touchcancel path is exercised above with a dispatched touchcancel, which
    // is the same event the handler sees. What cannot be reproduced is iPadOS DECIDING to
    // cancel — its own palm rejection reclaiming a contact mid-stroke, a notification, an edge
    // gesture, Scribble converting handwriting. Verify on device that a stroke interrupted
    // that way is kept rather than lost, and that the next stroke starts clean.
  });
});

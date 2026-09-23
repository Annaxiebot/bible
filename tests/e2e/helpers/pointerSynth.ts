/**
 * Pointer-event synthesis helpers for NotabilityEditor tests.
 *
 * Playwright's `page.mouse` and `page.touchscreen` don't let you set
 * `pointerType: 'pen'`. We dispatch PointerEvents directly via page.evaluate
 * so tests can simulate pen, touch, and mouse on the same handlers the real
 * device hits.
 *
 * IMPORTANT: synthetic events approximate iPad Safari behavior — they do NOT
 * fully reproduce Apple Pencil (no hover, no pressure curve, no palm detection
 * via radiusX). Tests marked `test.fixme(..., 'requires real iPad')` are the
 * scenarios that cannot be faithfully synthesized here; they remain in the
 * matrix as documentation of what must be verified on hardware.
 */

import type { Page, Locator } from '@playwright/test';

export type SynthPointerType = 'mouse' | 'touch' | 'pen';

export interface SynthPoint {
  x: number; // CSS px relative to target element's bounding rect
  y: number;
}

export interface SynthGestureOpts {
  pointerType: SynthPointerType;
  /** Simulated pressure 0..1 (pen only; finger=0.5, mouse=0). */
  pressure?: number;
  /** Simulated stylus radius; <10 treated as stylus by NotabilityEditor. */
  radiusX?: number;
  /** Steps to interpolate along a drag — more steps = more pointermove events. */
  steps?: number;
  /** Delay between steps (ms). Default 0 (as fast as possible). */
  stepDelay?: number;
}

interface EvaluatedGesture {
  type: 'down' | 'move' | 'up' | 'cancel';
  x: number;
  y: number;
}

/**
 * Dispatch a sequence of pointer events onto the given locator.
 * Also dispatches matching touch and mouse events so handlers that listen to
 * the legacy paths (NotabilityEditor listens to all three) receive them.
 */
async function dispatchGesture(
  page: Page,
  locator: Locator,
  events: EvaluatedGesture[],
  opts: SynthGestureOpts,
) {
  const handle = await locator.elementHandle();
  if (!handle) throw new Error('target locator has no element');

  await page.evaluate(
    ({ events, opts }) => {
      const el = (window as any).__synthTarget as HTMLElement;
      if (!el) throw new Error('no __synthTarget set');

      const rect = el.getBoundingClientRect();
      const pointerId = opts.pointerType === 'pen' ? 1 : opts.pointerType === 'touch' ? 2 : 3;
      const pressure = opts.pressure ?? (opts.pointerType === 'pen' ? 0.5 : opts.pointerType === 'touch' ? 0.5 : 0);
      const radiusX = opts.radiusX ?? (opts.pointerType === 'pen' ? 1 : opts.pointerType === 'touch' ? 20 : 0);
      const pointerType = opts.pointerType;

      const firePointer = (kind: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number) => {
        const clientX = rect.left + x;
        const clientY = rect.top + y;
        const ev = new PointerEvent(kind, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId,
          pointerType,
          pressure,
          isPrimary: true,
          clientX,
          clientY,
          buttons: kind === 'pointerup' || kind === 'pointercancel' ? 0 : 1,
          button: 0,
        });
        el.dispatchEvent(ev);
      };

      const fireTouch = (kind: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', x: number, y: number) => {
        // Only pen+touch synthesize touch events; mouse does not.
        if (pointerType === 'mouse') return;
        const clientX = rect.left + x;
        const clientY = rect.top + y;
        const touchInit: any = {
          identifier: pointerId,
          target: el,
          clientX, clientY,
          screenX: clientX, screenY: clientY,
          pageX: clientX, pageY: clientY,
          radiusX, radiusY: radiusX,
          force: pressure,
        };
        try {
          const touch = new Touch(touchInit);
          const list = kind === 'touchend' || kind === 'touchcancel' ? [] : [touch];
          const changed = [touch];
          const ev = new TouchEvent(kind, {
            bubbles: true, cancelable: true, composed: true,
            touches: list as any, changedTouches: changed as any, targetTouches: list as any,
          });
          el.dispatchEvent(ev);
        } catch {
          // TouchEvent constructor unavailable in some non-iOS Chromium configs —
          // fall back to a synthetic CustomEvent so listeners at least see a touch.
          const ev = new CustomEvent(kind, { bubbles: true, cancelable: true });
          (ev as any).touches = kind === 'touchend' ? [] : [touchInit];
          (ev as any).changedTouches = [touchInit];
          (ev as any).targetTouches = kind === 'touchend' ? [] : [touchInit];
          el.dispatchEvent(ev);
        }
      };

      const fireMouse = (kind: 'mousedown' | 'mousemove' | 'mouseup', x: number, y: number) => {
        // Only mouse synthesizes mouse events; pen+touch suppress them as real iOS does.
        if (pointerType !== 'mouse') return;
        const clientX = rect.left + x;
        const clientY = rect.top + y;
        const ev = new MouseEvent(kind, {
          bubbles: true, cancelable: true, composed: true,
          clientX, clientY, button: 0, buttons: kind === 'mouseup' ? 0 : 1,
        });
        el.dispatchEvent(ev);
      };

      for (const e of events) {
        if (e.type === 'down') {
          firePointer('pointerdown', e.x, e.y);
          fireTouch('touchstart', e.x, e.y);
          fireMouse('mousedown', e.x, e.y);
        } else if (e.type === 'move') {
          firePointer('pointermove', e.x, e.y);
          fireTouch('touchmove', e.x, e.y);
          fireMouse('mousemove', e.x, e.y);
        } else if (e.type === 'up') {
          firePointer('pointerup', e.x, e.y);
          fireTouch('touchend', e.x, e.y);
          fireMouse('mouseup', e.x, e.y);
        } else if (e.type === 'cancel') {
          firePointer('pointercancel', e.x, e.y);
          fireTouch('touchcancel', e.x, e.y);
        }
      }
    },
    { events, opts },
  );
}

async function withTarget<T>(page: Page, locator: Locator, fn: () => Promise<T>): Promise<T> {
  const handle = await locator.elementHandle();
  if (!handle) throw new Error('target locator has no element');
  await page.evaluate((el) => { (window as any).__synthTarget = el; }, handle);
  try { return await fn(); } finally {
    await page.evaluate(() => { delete (window as any).__synthTarget; });
  }
}

export async function tap(page: Page, target: Locator, p: SynthPoint, opts: SynthGestureOpts) {
  await withTarget(page, target, () =>
    dispatchGesture(page, target, [
      { type: 'down', x: p.x, y: p.y },
      { type: 'up', x: p.x, y: p.y },
    ], opts),
  );
}

export async function drag(
  page: Page, target: Locator, from: SynthPoint, to: SynthPoint, opts: SynthGestureOpts,
) {
  const steps = opts.steps ?? 8;
  const events: EvaluatedGesture[] = [{ type: 'down', x: from.x, y: from.y }];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    events.push({ type: 'move', x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  events.push({ type: 'up', x: to.x, y: to.y });
  await withTarget(page, target, () => dispatchGesture(page, target, events, opts));
  if (opts.stepDelay) await page.waitForTimeout(opts.stepDelay);
}

export async function hold(
  page: Page, target: Locator, p: SynthPoint, durationMs: number, opts: SynthGestureOpts,
) {
  await withTarget(page, target, async () => {
    await dispatchGesture(page, target, [{ type: 'down', x: p.x, y: p.y }], opts);
    await page.waitForTimeout(durationMs);
    await dispatchGesture(page, target, [{ type: 'up', x: p.x, y: p.y }], opts);
  });
}

// ─── Multi-contact touch frames (palm / stylus classification) ──────────────
//
// The gestures above carry ONE contact and fix its radius from `pointerType`.
// Palm rejection is about several contacts on the glass at once, each with its
// own radius, so it needs frames rather than gestures: the palm is present for
// every event of the sequence while the Pencil comes and goes.
//
// Chromium's `Touch` constructor honours `radiusX`, so these are REAL Touch
// objects on a REAL TouchEvent — not the jsdom stand-in. What Chromium does NOT
// have is Safari's `touchType`, so a stylus here is only recognisable by its
// small radius (utils/touchClassification.ts falls back to
// `radiusX < PALM.STYLUS_RADIUS_PX`). Anything that depends on `touchType`
// itself cannot be driven from here — mark it `test.fixme`, do not fake it.

/** One contact in a frame. Coordinates are CSS px relative to the target's rect. */
export interface SynthContact {
  /** Touch.identifier — stable across frames for the same finger/pencil. */
  id: number;
  x: number;
  y: number;
  /** Real Touch.radiusX. iPad Safari: Pencil ~3, fingertip ~15-22, palm/pinky 25+. */
  radiusX: number;
}

export interface TouchFrame {
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';
  /** Contacts on the glass after this event — becomes `touches`/`targetTouches`. */
  touches: SynthContact[];
  /** Contacts this event is about — becomes `changedTouches`. Defaults to `touches`. */
  changed?: SynthContact[];
}

/**
 * Dispatch real multi-contact TouchEvents at `target`, one frame at a time.
 *
 * Throws rather than degrading when the browser cannot carry a radius: a Touch
 * whose `radiusX` came back undefined would be classified as an ordinary finger
 * and every palm assertion would pass for the wrong reason.
 */
export async function dispatchTouchFrames(page: Page, target: Locator, frames: TouchFrame[]) {
  await withTarget(page, target, () =>
    page.evaluate((frames: TouchFrame[]) => {
      const el = (window as any).__synthTarget as HTMLElement;
      if (!el) throw new Error('no __synthTarget set');
      if (typeof Touch !== 'function' || typeof TouchEvent !== 'function') {
        throw new Error('browser has no Touch/TouchEvent constructor — cannot synthesize radiusX');
      }
      const rect = el.getBoundingClientRect();

      const build = (c: SynthContact) => {
        const touch = new Touch({
          identifier: c.id,
          target: el,
          clientX: rect.left + c.x,
          clientY: rect.top + c.y,
          screenX: rect.left + c.x,
          screenY: rect.top + c.y,
          pageX: rect.left + c.x,
          pageY: rect.top + c.y,
          radiusX: c.radiusX,
          radiusY: c.radiusX,
          force: 0.5,
        });
        if (touch.radiusX !== c.radiusX) {
          throw new Error(`Touch.radiusX not honoured: asked ${c.radiusX}, got ${touch.radiusX}`);
        }
        return touch;
      };

      for (const frame of frames) {
        const touches = frame.touches.map(build);
        const changed = (frame.changed ?? frame.touches).map(build);
        el.dispatchEvent(new TouchEvent(frame.type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          touches,
          changedTouches: changed,
          targetTouches: touches,
        }));
      }
    }, frames),
  );
}

/**
 * Telling an Apple Pencil, a fingertip and a resting palm apart · 笔 / 手指 / 手掌
 *
 * iPad Safari reports a contact radius per touch: an Apple Pencil is a few px, a fingertip is
 * roughly 15-22, and a palm or resting pinky is 25+. Safari also tags each touch with
 * `touchType: 'stylus' | 'direct'`, which is authoritative when present.
 *
 * This lived as three separate copies before: NotabilityEditor had the full version, and
 * SimpleDrawingCanvas had a bare `radiusX > 25` with no touchType check — so the surface Bible
 * and Journal actually SHARE had the weakest classification of the three. Two user-visible bugs
 * came out of that, and both are really the same mistake: treating a resting palm as an ordinary
 * touch instead of discarding it.
 *
 *   1. A resting pinky drove the Bible page-flip animation, because the canvas declined to ink it
 *      but let the event bubble to the swipe handler.
 *   2. The Pencil often would not write at all until you lifted a finger, because the palm
 *      counted toward `touches.length > 1` and the Pencil's touchstart was rejected as
 *      multi-touch.
 *
 * Keep this module pure — no DOM, no React — so it can be unit-tested directly.
 */
import { PALM } from '../constants/appConfig';

/** The subset of `Touch` we classify on. Safari-only fields are optional. */
export interface ClassifiableTouch {
  radiusX?: number;
  /** Safari-only: 'stylus' for Apple Pencil, 'direct' for skin. */
  touchType?: string;
  identifier?: number;
  clientX?: number;
  clientY?: number;
}

/**
 * True for an Apple Pencil contact.
 *
 * `touchType` is believed outright when Safari provides it. Everywhere else (Chrome, desktop,
 * synthetic test events) we fall back to the radius: a Pencil tip is far smaller than a finger.
 * Unknown stays FALSE here, deliberately — `isPalmTouch` is what gates rejection, and an unknown
 * contact must not be able to claim stylus privileges it cannot demonstrate.
 */
export function isStylusTouch(touch: ClassifiableTouch | undefined | null): boolean {
  if (!touch) return false;
  if (touch.touchType === 'stylus') return true;
  if (touch.touchType === 'direct') return false;
  if (typeof touch.radiusX === 'number' && touch.radiusX > 0) return touch.radiusX < PALM.STYLUS_RADIUS_PX;
  return false;
}

/**
 * True for a palm, a resting pinky, or the side of a hand.
 *
 * A stylus is never a palm however large it reports, because `touchType` outranks the radius
 * heuristic. A touch with no radius at all (desktop, most synthetic events) is NOT a palm — this
 * has to fail open, or a browser that omits `radiusX` would silently refuse to draw anything.
 */
export function isPalmTouch(touch: ClassifiableTouch | undefined | null): boolean {
  if (!touch) return false;
  if (touch.touchType === 'stylus') return false;
  return typeof touch.radiusX === 'number' && touch.radiusX > PALM.RADIUS_PX;
}

/** Every touch that is not a palm. Iterates a TouchList or a plain array. */
export function realTouches<T extends ClassifiableTouch>(touches: ArrayLike<T> | null | undefined): T[] {
  const out: T[] = [];
  if (!touches) return out;
  for (let i = 0; i < touches.length; i++) {
    const t = touches[i];
    if (!isPalmTouch(t)) out.push(t);
  }
  return out;
}

/**
 * The touch that should drive drawing, or null when there is nothing to draw with.
 *
 * A stylus always wins, no matter where it sits in the list — this is the fix for "the Pencil
 * writes no ink": the palm usually lands FIRST, so it is `touches[0]`, and code that assumed
 * index 0 was the drawing contact sampled the palm and rejected the Pencil as a second finger.
 *
 * With no stylus present (an iPhone, or a finger-drawing mode) a SINGLE non-palm touch draws.
 * Two or more real fingers mean a pinch or a two-finger scroll, never a stroke, so that is null.
 */
export function pickDrawingTouch<T extends ClassifiableTouch>(touches: ArrayLike<T> | null | undefined): T | null {
  const real = realTouches(touches);
  const stylus = real.find(isStylusTouch);
  if (stylus) return stylus;
  return real.length === 1 ? real[0] : null;
}

/** Find a touch again by identifier, so a gesture follows the contact that started it. */
export function findTouchById<T extends ClassifiableTouch>(
  touches: ArrayLike<T> | null | undefined,
  identifier: number | null | undefined,
): T | null {
  if (!touches || identifier === null || identifier === undefined) return null;
  for (let i = 0; i < touches.length; i++) {
    if (touches[i].identifier === identifier) return touches[i];
  }
  return null;
}

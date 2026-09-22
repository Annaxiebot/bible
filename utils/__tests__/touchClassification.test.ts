/**
 * Palm / stylus classification · 手掌与笔的判别
 *
 * Both reported iPad bugs were one mistake — treating a resting palm as an ordinary touch:
 *   1. the resting pinky drove the Bible page-flip animation;
 *   2. the Pencil wrote no ink until a finger was lifted, because the palm counted toward
 *      `touches.length > 1` and the Pencil's touchstart was rejected as multi-touch.
 * These pin the classification that fixes both.
 */
import { describe, it, expect } from 'vitest';
import { PALM } from '../../constants/appConfig';
import {
  isStylusTouch, isPalmTouch, realTouches, pickDrawingTouch, findTouchById, navigationTouch,
  type ClassifiableTouch,
} from '../touchClassification';

const pencil = (id = 1): ClassifiableTouch => ({ identifier: id, touchType: 'stylus', radiusX: 3 });
const finger = (id = 2): ClassifiableTouch => ({ identifier: id, touchType: 'direct', radiusX: 18 });
const palm = (id = 3): ClassifiableTouch => ({ identifier: id, touchType: 'direct', radiusX: 30 });
/** No Safari fields at all — Chrome, desktop, and most synthetic events. */
const bare = (id = 4): ClassifiableTouch => ({ identifier: id });

describe('isStylusTouch', () => {
  it('believes touchType when Safari provides it', () => {
    expect(isStylusTouch(pencil())).toBe(true);
    expect(isStylusTouch(finger())).toBe(false);
    // touchType outranks the radius heuristic in BOTH directions.
    expect(isStylusTouch({ touchType: 'stylus', radiusX: 40 })).toBe(true);
    expect(isStylusTouch({ touchType: 'direct', radiusX: 2 })).toBe(false);
  });

  it('falls back to radius where touchType is absent', () => {
    expect(isStylusTouch({ radiusX: 4 })).toBe(true);
    expect(isStylusTouch({ radiusX: 18 })).toBe(false);
    expect(isStylusTouch({ radiusX: PALM.STYLUS_RADIUS_PX })).toBe(false); // boundary is exclusive
  });

  it('does not let an unknown contact claim to be a stylus', () => {
    expect(isStylusTouch(bare())).toBe(false);
    expect(isStylusTouch(undefined)).toBe(false);
  });
});

describe('isPalmTouch', () => {
  it('rejects large contacts and accepts fingertips', () => {
    expect(isPalmTouch(palm())).toBe(true);
    expect(isPalmTouch(finger())).toBe(false);
    expect(isPalmTouch({ radiusX: PALM.RADIUS_PX })).toBe(false); // boundary is exclusive
    expect(isPalmTouch({ radiusX: PALM.RADIUS_PX + 0.1 })).toBe(true);
  });

  it('never calls a stylus a palm, whatever radius it reports', () => {
    expect(isPalmTouch({ touchType: 'stylus', radiusX: 99 })).toBe(false);
  });

  it('fails OPEN when the browser reports no radius', () => {
    // A browser that omits radiusX must still be able to draw. Failing closed here would mean
    // "nothing inks on desktop", which is a far worse bug than the one being fixed.
    expect(isPalmTouch(bare())).toBe(false);
    expect(isPalmTouch({ radiusX: 0 })).toBe(false);
  });
});

describe('pickDrawingTouch', () => {
  it('BUG 2: finds the Pencil even when a palm landed first', () => {
    // The exact reported sequence. The palm is touches[0] because it landed first; the old code
    // read touches[0] AND rejected the pair as multi-touch, so the Pencil wrote nothing until a
    // finger was lifted.
    const touches = [palm(), pencil()];
    expect(pickDrawingTouch(touches)).toBe(touches[1]);
    // Order must not matter.
    expect(pickDrawingTouch([pencil(), palm()])?.touchType).toBe('stylus');
    // Two palms and a pencil is still the pencil.
    expect(pickDrawingTouch([palm(3), palm(5), pencil()])?.touchType).toBe('stylus');
  });

  it('BUG 1: a resting palm alone gives nothing to draw with', () => {
    expect(pickDrawingTouch([palm()])).toBeNull();
    expect(pickDrawingTouch([palm(3), palm(5)])).toBeNull();
    expect(pickDrawingTouch([])).toBeNull();
  });

  it('a single finger draws when there is no stylus (iPhone, finger modes)', () => {
    const touches = [finger()];
    expect(pickDrawingTouch(touches)).toBe(touches[0]);
    // A palm alongside one finger does not make it multi-touch.
    expect(pickDrawingTouch([palm(), finger()])?.radiusX).toBe(18);
  });

  it('two real fingers are a gesture, never a stroke', () => {
    expect(pickDrawingTouch([finger(1), finger(2)])).toBeNull();
    // CONTROL: the same two fingers plus a pencil IS a stroke — the pencil wins.
    expect(pickDrawingTouch([finger(1), finger(2), pencil(9)])?.identifier).toBe(9);
  });
});

describe('realTouches', () => {
  it('counts only non-palm contacts', () => {
    expect(realTouches([palm(), pencil(), finger()])).toHaveLength(2);
    expect(realTouches([palm(1), palm(2)])).toHaveLength(0);
    expect(realTouches(null)).toEqual([]);
  });
});

describe('findTouchById', () => {
  it('follows the contact that started the gesture', () => {
    const touches = [palm(3), pencil(1)];
    expect(findTouchById(touches, 1)).toBe(touches[1]);
    expect(findTouchById(touches, 3)).toBe(touches[0]);
  });

  it('returns null once that contact is gone, rather than silently picking another', () => {
    // This is what stopped a palm from hijacking a stroke mid-line.
    expect(findTouchById([palm(3)], 1)).toBeNull();
    expect(findTouchById([], 1)).toBeNull();
    expect(findTouchById([pencil(1)], null)).toBeNull();
  });
});

describe('navigationTouch — pencil writes, finger navigates', () => {
  // The app-wide rule, shared by the Bible chapter flip and the Journal entry-list swipe. Before
  // this each rolled its own and neither rejected a palm, so the two symptoms were different
  // (page flipped / entry list collapsed) while the cause was identical.
  it('one real finger navigates', () => {
    const touches = [finger()];
    expect(navigationTouch(touches)).toBe(touches[0]);
  });

  it('a resting palm alongside that finger does not make it multi-touch', () => {
    // The case that actually breaks: a hand rests for most of a writing session.
    expect(navigationTouch([palm(), finger(7)])?.identifier).toBe(7);
  });

  it('a palm alone never navigates', () => {
    expect(navigationTouch([palm()])).toBeNull();
    expect(navigationTouch([palm(1), palm(2)])).toBeNull();
  });

  it('the Pencil never navigates — it writes', () => {
    expect(navigationTouch([pencil()])).toBeNull();
    expect(navigationTouch([palm(), pencil()])).toBeNull();
  });

  it('two real fingers are a pinch or scroll, not a navigation gesture', () => {
    expect(navigationTouch([finger(1), finger(2)])).toBeNull();
  });

  it('nothing at all navigates nothing', () => {
    expect(navigationTouch([])).toBeNull();
    expect(navigationTouch(null)).toBeNull();
  });
});

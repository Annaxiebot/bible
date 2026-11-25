/**
 * Palm rejection on the canvas Bible and Journal SHARE · 共用画布的手掌屏蔽
 *
 * Reported on an iPad, both while writing with the Apple Pencil:
 *   1. a resting pinky triggered the Bible page-flip animation;
 *   2. the Pencil often wrote no ink until a finger was lifted and the pencil re-held.
 *
 * Both came from the same three lines in SimpleDrawingCanvas — the component reached by
 * Journal (JournalView) and by Bible (BibleVersePanel -> InlineBibleAnnotation) alike:
 *
 *     if (e.touches.length > 1) return;                    // the palm counted -> Pencil rejected
 *     const touch = e.touches[0];                          // the palm landed first -> touches[0]
 *     if (touch.radiusX && touch.radiusX > 25) return;     // bare return -> event still bubbled
 *
 * These are behavioural: a real component in a real DOM, with a listener on the ancestor
 * standing in for BibleViewer's swipe container, driven by touches shaped like iPad Safari's
 * (radiusX + touchType). A source-text tripwire would not have caught the missing
 * stopPropagation, because the rejection itself was present and looked correct.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import SimpleDrawingCanvas from '../SimpleDrawingCanvas';

/** iPad Safari radii: Pencil ~3, fingertip ~15-22, palm/pinky 25+. */
const pencil = (id = 1, x = 50, y = 50) => ({ identifier: id, clientX: x, clientY: y, radiusX: 3, radiusY: 3, touchType: 'stylus' });
const finger = (id = 2, x = 50, y = 50) => ({ identifier: id, clientX: x, clientY: y, radiusX: 18, radiusY: 18, touchType: 'direct' });
const palm = (id = 3, x = 20, y = 90) => ({ identifier: id, clientX: x, clientY: y, radiusX: 30, radiusY: 34, touchType: 'direct' });

/** jsdom has no TouchEvent constructor, so shape a bubbling Event the handlers can read. */
function touchEvent(type: string, touches: object[], changed: object[] = touches) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: touches });
  Object.defineProperty(ev, 'changedTouches', { value: changed });
  return ev;
}

describe('SimpleDrawingCanvas — the surface Bible and Journal share', () => {
  let ctx: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    // jsdom has no 2D context (the optional `canvas` package is not installed), and the ink path
    // bails without one — so the "Pencil draws" assertions would pass vacuously. Mock it.
    ctx = {
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), closePath: vi.fn(),
      clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(),
      setTransform: vi.fn(), scale: vi.fn(), translate: vi.fn(), putImageData: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    });
  });
  afterEach(() => vi.restoreAllMocks());

  /** Mount the canvas inside an ancestor that navigates, the way BibleViewer wraps it. */
  function mount() {
    const onAncestorTouch = vi.fn();
    const onChange = vi.fn();
    const { container } = render(
      <div onTouchStart={onAncestorTouch} onTouchMove={onAncestorTouch}>
        <SimpleDrawingCanvas onChange={onChange} isWritingMode paperType="plain" />
      </div>,
    );
    // The component renders TWO canvases: [0] is the paper background, [1] is the ink layer that
    // carries the touch listeners. Taking querySelector('canvas') grabbed the background, so
    // events hit a dead element and every assertion passed for the wrong reason — the first
    // version of this file had a vacuous green. Assert the pick, then prove it is live.
    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(2);
    const canvas = canvases[1] as HTMLCanvasElement;
    return { canvas, onAncestorTouch, onChange };
  }

  it('BUG 1: a resting pinky never reaches the page-flip handler', () => {
    const { canvas, onAncestorTouch } = mount();
    canvas.dispatchEvent(touchEvent('touchstart', [palm()]));
    canvas.dispatchEvent(touchEvent('touchmove', [palm(3, 220, 90)]));   // hand shifts 200px
    expect(onAncestorTouch).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();   // and it draws nothing either

    // NOT VACUOUS: the very same element, given a real contact, does reach the handlers. Without
    // this the assertions above would also pass against a canvas nothing is listening to.
    canvas.dispatchEvent(touchEvent('touchstart', [pencil()]));
    expect(ctx.moveTo).toHaveBeenCalled();
  });

  it('BUG 2: the Pencil inks while a palm is already resting', () => {
    const { canvas } = mount();
    canvas.dispatchEvent(touchEvent('touchstart', [palm()]));              // palm lands first
    canvas.dispatchEvent(touchEvent('touchstart', [palm(), pencil()]));    // Pencil joins: 2 touches
    canvas.dispatchEvent(touchEvent('touchmove', [palm(), pencil(1, 60, 70)]));
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();       // the old `touches.length > 1` guard blocked this
  });

  it('the stroke follows the Pencil, not the palm that shares the screen', () => {
    const { canvas } = mount();
    canvas.dispatchEvent(touchEvent('touchstart', [palm(), pencil(1, 50, 50)]));
    ctx.lineTo.mockClear();
    // Palm slides far away while the Pencil moves a little.
    canvas.dispatchEvent(touchEvent('touchmove', [palm(3, 300, 500), pencil(1, 55, 52)]));
    expect(ctx.lineTo).toHaveBeenCalledWith(55, 52);
    expect(ctx.lineTo).not.toHaveBeenCalledWith(300, 500);
  });

  it('a palm lifting off does not end the Pencil stroke', () => {
    const { canvas } = mount();
    canvas.dispatchEvent(touchEvent('touchstart', [palm(), pencil()]));
    canvas.dispatchEvent(touchEvent('touchend', [pencil()], [palm()]));   // only the palm lifted
    ctx.lineTo.mockClear();
    canvas.dispatchEvent(touchEvent('touchmove', [pencil(1, 70, 80)]));
    expect(ctx.lineTo).toHaveBeenCalledWith(70, 80);                      // still inking
  });

  it('CONTROL: two real fingers still reach the ancestor, so gestures are not swallowed', () => {
    // Without this the fix could be "stop everything", which would break two-finger scroll and
    // legitimate finger navigation.
    const { canvas, onAncestorTouch } = mount();
    canvas.dispatchEvent(touchEvent('touchstart', [finger(1, 10, 10), finger(2, 90, 10)]));
    expect(onAncestorTouch).toHaveBeenCalled();
  });

  it('CONTROL: one fingertip still draws where there is no Pencil (iPhone, finger modes)', () => {
    const { canvas } = mount();
    canvas.dispatchEvent(touchEvent('touchstart', [finger(2, 40, 40)]));
    canvas.dispatchEvent(touchEvent('touchmove', [finger(2, 44, 46)]));
    expect(ctx.lineTo).toHaveBeenCalledWith(44, 46);
  });

  it('touchcancel COMMITS the interrupted stroke rather than dropping it', () => {
    // iOS fires touchcancel when it takes a touch over (its own palm rejection, a notification,
    // an edge gesture). Without a handler the in-progress stroke was never committed and
    // isDrawingRef stayed true — the stuck state the user was clearing by hand when they lifted
    // a finger and re-held the pencil.
    //
    // Assert on onChange, not on moveTo: handleTouchStart calls moveTo unconditionally, so a
    // moveTo assertion passes with the touchcancel listener REMOVED. That was this test's first
    // version, and mutation-testing caught it as a vacuous green.
    const { canvas, onChange } = mount();
    canvas.dispatchEvent(touchEvent('touchstart', [pencil(1, 50, 50)]));
    canvas.dispatchEvent(touchEvent('touchmove', [pencil(1, 60, 60)]));
    canvas.dispatchEvent(touchEvent('touchmove', [pencil(1, 70, 70)]));
    onChange.mockClear();
    canvas.dispatchEvent(touchEvent('touchcancel', [], [pencil(1, 70, 70)]));
    expect(onChange).toHaveBeenCalled();   // the ink you had already drawn is kept
  });
});

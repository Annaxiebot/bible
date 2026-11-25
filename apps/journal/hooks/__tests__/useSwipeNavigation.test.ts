/**
 * Chapter-swipe navigation, palm-aware · 翻章手势
 *
 * The second layer of the iPad palm fix. SimpleDrawingCanvas swallows palms that land ON it, but
 * this container spans the whole panel area — a resting pinky on a margin, or on the gap between
 * the two verse panels, never touches the canvas at all, so it has to be rejected here too.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeNavigation } from '../useSwipeNavigation';
import { SWIPE } from '../../constants/appConfig';

const pencil = (id = 1, x = 50, y = 50) => ({ identifier: id, clientX: x, clientY: y, radiusX: 3, touchType: 'stylus' });
const finger = (id = 2, x = 50, y = 50) => ({ identifier: id, clientX: x, clientY: y, radiusX: 18, touchType: 'direct' });
const palm = (id = 3, x = 20, y = 90) => ({ identifier: id, clientX: x, clientY: y, radiusX: 30, touchType: 'direct' });

/** Only the fields the hook reads. */
const ev = (touches: object[]) => ({ touches }) as unknown as React.TouchEvent;

const FAR = SWIPE.THRESHOLD_PX + 50;

function setup() {
  const onNavigate = vi.fn();
  const { result } = renderHook(() => useSwipeNavigation(onNavigate));
  return { onNavigate, result };
}

/** Drive a full gesture: down, a couple of moves, up. */
function swipe(result: ReturnType<typeof setup>['result'], frames: object[][]) {
  act(() => { result.current.handleTouchStart(ev(frames[0])); });
  for (const f of frames.slice(1)) act(() => { result.current.handleTouchMove(ev(f)); });
  act(() => { result.current.handleTouchEnd(); });
}

describe('useSwipeNavigation', () => {
  it('a resting pinky alone never navigates, however far it slides', () => {
    // The reported bug: the hand rests, the pinky drifts as the hand shifts, the page turns.
    const { onNavigate, result } = setup();
    swipe(result, [[palm(3, 20, 90)], [palm(3, 20 + FAR, 90)], [palm(3, 20 + FAR * 2, 90)]]);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('CONTROL: the same gesture from a real fingertip DOES navigate', () => {
    // Without this the test above passes against a hook that navigates for nothing at all.
    const { onNavigate, result } = setup();
    swipe(result, [[finger(2, 300, 90)], [finger(2, 300 - FAR, 90)], [finger(2, 300 - FAR - 10, 90)]]);
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('navigates prev on a rightward fingertip swipe', () => {
    const { onNavigate, result } = setup();
    swipe(result, [[finger(2, 50, 90)], [finger(2, 50 + FAR, 90)], [finger(2, 50 + FAR + 10, 90)]]);
    expect(onNavigate).toHaveBeenCalledWith('prev');
  });

  it('a pinky resting while a finger swipes is not counted as a second finger', () => {
    // realTouches filters the palm out, so this is still a legitimate one-finger swipe.
    const { onNavigate, result } = setup();
    swipe(result, [
      [palm(), finger(2, 300, 90)],
      [palm(), finger(2, 300 - FAR, 90)],
      [palm(), finger(2, 300 - FAR - 10, 90)],
    ]);
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('a palm that lands mid-swipe cannot hijack the gesture', () => {
    // touches[0] used to win; the palm lands first in the list and dragged the page with it.
    const { onNavigate, result } = setup();
    act(() => { result.current.handleTouchStart(ev([finger(2, 300, 90)])); });
    act(() => { result.current.handleTouchMove(ev([palm(3, 20, 400), finger(2, 295, 92)])); });
    act(() => { result.current.handleTouchEnd(); });
    // The finger barely moved, so nothing should fire even though the palm is 280px away.
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('two real fingers are a pinch or scroll, never a page turn', () => {
    const { onNavigate, result } = setup();
    swipe(result, [
      [finger(1, 300, 90)],
      [finger(1, 300 - FAR, 90), finger(2, 200, 300)],
      [finger(1, 300 - FAR - 20, 90), finger(2, 180, 300)],
    ]);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('the Apple Pencil does not flip pages', () => {
    // The Pencil is for writing. A pencil drag across the page is a stroke, not navigation.
    const { onNavigate, result } = setup();
    swipe(result, [[pencil(1, 300, 90)], [pencil(1, 300 - FAR, 90)], [pencil(1, 300 - FAR - 10, 90)]]);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('touchcancel abandons the gesture instead of leaving it armed', () => {
    const { onNavigate, result } = setup();
    act(() => { result.current.handleTouchStart(ev([finger(2, 300, 90)])); });
    act(() => { result.current.handleTouchMove(ev([finger(2, 300 - FAR, 90)])); });
    act(() => { result.current.handleTouchCancel(); });
    act(() => { result.current.handleTouchEnd(); });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(result.current.isSwiping).toBe(false);
    expect(result.current.swipeOffset).toBe(0);
  });

  it('a short fingertip drag below the threshold does not navigate', () => {
    const { onNavigate, result } = setup();
    swipe(result, [[finger(2, 300, 90)], [finger(2, 300 - (SWIPE.THRESHOLD_PX - 20), 90)]]);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('a vertical fingertip drag scrolls, it does not navigate', () => {
    const { onNavigate, result } = setup();
    swipe(result, [[finger(2, 50, 50)], [finger(2, 52, 50 + FAR)], [finger(2, 52, 50 + FAR + 40)]]);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

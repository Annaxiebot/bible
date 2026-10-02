import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTVNavigation } from '../useTVNavigation';

afterEach(() => { vi.restoreAllMocks(); });

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('useTVNavigation', () => {
  it('starts at slide 0', () => {
    const { result } = renderHook(() => useTVNavigation(5, vi.fn()));
    expect(result.current.index).toBe(0);
  });

  it('advances with ArrowRight and Space, goes back with ArrowLeft', () => {
    const { result } = renderHook(() => useTVNavigation(5, vi.fn()));
    pressKey('ArrowRight');
    expect(result.current.index).toBe(1);
    pressKey(' ');
    expect(result.current.index).toBe(2);
    pressKey('ArrowLeft');
    expect(result.current.index).toBe(1);
  });

  it('clamps at both ends', () => {
    const { result } = renderHook(() => useTVNavigation(2, vi.fn()));
    pressKey('ArrowLeft');
    expect(result.current.index).toBe(0);
    pressKey('ArrowRight');
    pressKey('ArrowRight');
    pressKey('ArrowRight');
    expect(result.current.index).toBe(1);
  });

  it('calls onExit on Escape', () => {
    const onExit = vi.fn();
    renderHook(() => useTVNavigation(5, onExit));
    pressKey('Escape');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('exposes no click navigation (clicks are reserved for text selection)', () => {
    const { result } = renderHook(() => useTVNavigation(5, vi.fn()));
    expect('onScreenClick' in result.current).toBe(false);
  });

  it('swipe left advances, swipe right goes back, small moves ignored', () => {
    const { result } = renderHook(() => useTVNavigation(5, vi.fn()));
    const swipe = (fromX: number, toX: number) =>
      act(() => {
        result.current.onTouchStart({
          touches: [{ clientX: fromX }],
        } as unknown as React.TouchEvent);
        result.current.onTouchEnd({
          changedTouches: [{ clientX: toX }],
        } as unknown as React.TouchEvent);
      });
    swipe(800, 200); // swipe left → next
    expect(result.current.index).toBe(1);
    swipe(800, 790); // below threshold → ignored
    expect(result.current.index).toBe(1);
    swipe(200, 800); // swipe right → prev
    expect(result.current.index).toBe(0);
  });

  it('suspends keys and swipes when disabled (overlay open)', () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useTVNavigation(5, onExit, false));
    pressKey('ArrowRight');
    pressKey(' ');
    pressKey('Escape');
    expect(result.current.index).toBe(0);
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      result.current.onTouchStart({ touches: [{ clientX: 800 }] } as unknown as React.TouchEvent);
      result.current.onTouchEnd({ changedTouches: [{ clientX: 100 }] } as unknown as React.TouchEvent);
    });
    expect(result.current.index).toBe(0);
  });

  // Pinned: the pack loads after mount (slideCount 0 → N). The keydown handler
  // registered at mount must see the NEW count, not a stale closure, because a
  // keydown can arrive between the commit that renders the slides and the
  // passive effect that would have re-registered a fresh handler.
  it('the mount-time keydown handler never goes stale when slideCount changes', () => {
    const keydownHandlers: EventListener[] = [];
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, handler) => {
      if (type === 'keydown') keydownHandlers.push(handler as EventListener);
    });
    const onExit = vi.fn(); // stable: a fresh fn per render would itself re-register
    const { result, rerender } = renderHook(
      ({ count }) => useTVNavigation(count, onExit),
      { initialProps: { count: 0 } }
    );
    const mountHandler = keydownHandlers[0];
    rerender({ count: 3 });
    act(() => { mountHandler(new KeyboardEvent('keydown', { key: 'ArrowRight' })); });
    expect(result.current.index).toBe(1);
    expect(keydownHandlers).toHaveLength(1); // one registration, not one per slideCount
  });

  it('removes every keydown listener it added on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount, rerender } = renderHook(
      ({ count }) => useTVNavigation(count, vi.fn()),
      { initialProps: { count: 0 } }
    );
    rerender({ count: 5 });
    unmount();
    const keydownHandlersOf = (calls: unknown[][]) =>
      calls.filter(([type]) => type === 'keydown').map(([, handler]) => handler);
    const added = keydownHandlersOf(add.mock.calls);
    const removed = keydownHandlersOf(remove.mock.calls);
    expect(removed).toEqual(added);
  });

  it('ignores a swipe that starts with more than one touch', () => {
    const { result } = renderHook(() => useTVNavigation(5, vi.fn()));
    act(() => {
      result.current.onTouchStart({
        touches: [{ clientX: 800 }, { clientX: 700 }],
      } as unknown as React.TouchEvent);
      result.current.onTouchEnd({
        changedTouches: [{ clientX: 100 }],
      } as unknown as React.TouchEvent);
    });
    expect(result.current.index).toBe(0);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTVNavigation } from '../useTVNavigation';

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

  it('click on right half advances, left half goes back', () => {
    const { result } = renderHook(() => useTVNavigation(5, vi.fn()));
    const target = {
      getBoundingClientRect: () => ({ left: 0, width: 1000 }),
    } as unknown as HTMLElement;
    const clickAt = (clientX: number) =>
      act(() => {
        result.current.onScreenClick({ clientX, currentTarget: target } as React.MouseEvent<HTMLElement>);
      });
    clickAt(900);
    expect(result.current.index).toBe(1);
    clickAt(900);
    expect(result.current.index).toBe(2);
    clickAt(100);
    expect(result.current.index).toBe(1);
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

  it('suspends keys, clicks, and swipes when disabled (overlay open)', () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useTVNavigation(5, onExit, false));
    pressKey('ArrowRight');
    pressKey(' ');
    pressKey('Escape');
    expect(result.current.index).toBe(0);
    expect(onExit).not.toHaveBeenCalled();
    const target = {
      getBoundingClientRect: () => ({ left: 0, width: 1000 }),
    } as unknown as HTMLElement;
    act(() => {
      result.current.onScreenClick({ clientX: 900, currentTarget: target } as React.MouseEvent<HTMLElement>);
      result.current.onTouchStart({ touches: [{ clientX: 800 }] } as unknown as React.TouchEvent);
      result.current.onTouchEnd({ changedTouches: [{ clientX: 100 }] } as unknown as React.TouchEvent);
    });
    expect(result.current.index).toBe(0);
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

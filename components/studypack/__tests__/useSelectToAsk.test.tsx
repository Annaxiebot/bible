import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useSelectToAsk,
  SELECT_TO_ASK_MIN_CHARS,
  SELECT_TO_ASK_DEBOUNCE_MS,
} from '../useSelectToAsk';

const container = document.createElement('div');
const insideNode = document.createTextNode('slide text');
container.appendChild(insideNode);
const containerRef = { current: container };
const outsideNode = document.createTextNode('overlay text');

function mockSelection(text: string, anchorNode: Node | null, collapsed = false) {
  const removeAllRanges = vi.fn();
  vi.spyOn(window, 'getSelection').mockReturnValue({
    isCollapsed: collapsed,
    toString: () => text,
    anchorNode,
    removeAllRanges,
  } as unknown as Selection);
  return removeAllRanges;
}

function mouseUpAndSettle() {
  window.dispatchEvent(new MouseEvent('mouseup'));
  vi.advanceTimersByTime(SELECT_TO_ASK_DEBOUNCE_MS + 10);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useSelectToAsk', () => {
  it('fires onSelect with the trimmed selection and clears it (debounced)', () => {
    const onSelect = vi.fn();
    renderHook(() => useSelectToAsk(containerRef, true, onSelect));
    const removeAllRanges = mockSelection('  飛鳥 the birds  ', insideNode);
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(onSelect).not.toHaveBeenCalled(); // waits for the debounce
    vi.advanceTimersByTime(SELECT_TO_ASK_DEBOUNCE_MS + 10);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('飛鳥 the birds');
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('coalesces rapid mouseups into one trigger', () => {
    const onSelect = vi.fn();
    renderHook(() => useSelectToAsk(containerRef, true, onSelect));
    mockSelection('long enough', insideNode);
    window.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(100);
    window.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(SELECT_TO_ASK_DEBOUNCE_MS + 10);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled (overlay open)', () => {
    const onSelect = vi.fn();
    renderHook(() => useSelectToAsk(containerRef, false, onSelect));
    mockSelection('long enough', insideNode);
    mouseUpAndSettle();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores collapsed selections and ones below the minimum length', () => {
    const onSelect = vi.fn();
    renderHook(() => useSelectToAsk(containerRef, true, onSelect));
    mockSelection('long enough', insideNode, true); // collapsed
    mouseUpAndSettle();
    mockSelection('abc'.slice(0, SELECT_TO_ASK_MIN_CHARS - 1), insideNode);
    mouseUpAndSettle();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores selections anchored outside the slide content (e.g. the overlay)', () => {
    const onSelect = vi.fn();
    renderHook(() => useSelectToAsk(containerRef, true, onSelect));
    const removeAllRanges = mockSelection('selected in overlay', outsideNode);
    mouseUpAndSettle();
    expect(onSelect).not.toHaveBeenCalled();
    expect(removeAllRanges).not.toHaveBeenCalled(); // untouched
  });
});

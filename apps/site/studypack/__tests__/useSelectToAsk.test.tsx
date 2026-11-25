import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useSelectToAsk,
  SELECT_TO_ASK_MIN_CHARS,
  SELECT_TO_ASK_DEBOUNCE_MS,
  isAskableSelection,
  selectionVerse,
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
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('飛鳥 the birds', null);
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

  it('a two-character Chinese word is enough (regression: selecting 箴言 did not open Ask AI)', () => {
    const onSelect = vi.fn();
    renderHook(() => useSelectToAsk(containerRef, true, onSelect));
    mockSelection('箴言', insideNode);
    mouseUpAndSettle();
    expect(onSelect).toHaveBeenCalledWith('箴言', null);
  });

  it('selectionVerse: the data-verse of the element the selection starts in, else null', () => {
    const verse = document.createElement('div');
    verse.setAttribute('data-verse', '25');
    const inner = document.createElement('span');
    const text = document.createTextNode('不要为生命忧虑');
    inner.appendChild(text); verse.appendChild(inner);
    expect(selectionVerse({ anchorNode: text } as unknown as Selection)).toBe(25);
    expect(selectionVerse({ anchorNode: insideNode } as unknown as Selection)).toBeNull();
    expect(selectionVerse(null)).toBeNull();
  });

  it('isAskableSelection: ≥ 2 Chinese characters or ≥ 4 characters otherwise', () => {
    expect(isAskableSelection('箴言')).toBe(true);
    expect(isAskableSelection('言')).toBe(false);
    expect(isAskableSelection('言 a')).toBe(false);
    expect(isAskableSelection('LORD')).toBe(true);
    expect(isAskableSelection('law')).toBe(false);
    expect(isAskableSelection('「忧虑」')).toBe(true);
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

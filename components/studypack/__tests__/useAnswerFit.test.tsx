/**
 * useAnswerFit.test.tsx — the latest Ask-AI answer shrinks to fit · 回答自动缩放钩子测试
 *
 * A fake layout stands in for the browser: the answer block's height is
 * `contentHeight × --fit` (read from the block, where the hook writes it)
 * against a fixed area height. Fake timers drive the stream throttle; a
 * fake ResizeObserver (jsdom has none) reports only observed elements.
 */
import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useAnswerFit, ANSWER_FIT_THROTTLE_MS } from '../useAnswerFit';
import * as fitScale from '../fitScale';
import { FIT_VAR, MAX_ANSWER_SCALE, MIN_ANSWER_SCALE } from '../fitScale';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: () => void) { FakeResizeObserver.instances.push(this); }
  observe(el: Element) { this.observed.push(el); }
  unobserve() { /* not used by the hook */ }
  disconnect() { this.disconnected = true; }
  fire() { this.callback(); }
}

/** Mutable fake layout: the block grows with the streamed text; the area is fixed. */
const layout = { areaHeight: 1000, contentHeight: 500 };

function fakeMeasure(area: HTMLElement | null, content: HTMLElement | null) {
  if (!area || !content) return;
  const fit = () => Number(content.style.getPropertyValue(FIT_VAR) || 1);
  Object.defineProperty(area, 'clientHeight', { configurable: true, get: () => layout.areaHeight });
  Object.defineProperty(area, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(content, 'scrollWidth', { configurable: true, get: () => 100 });
  content.getBoundingClientRect = () => ({ height: layout.contentHeight * fit(), width: 100 }) as DOMRect;
}

interface ProbeProps { text: string | null; streaming: boolean; turn: number; onFitted?: () => void }

const Probe: React.FC<ProbeProps> = ({ text, streaming, turn, onFitted }) => {
  const area = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const setArea = (el: HTMLDivElement | null) => { area.current = el; fakeMeasure(el, content.current); };
  const setContent = (el: HTMLDivElement | null) => { content.current = el; fakeMeasure(area.current, el); };
  useAnswerFit(area, content, { text, streaming, turnKey: turn, onFitted });
  return <div ref={setArea} data-testid="area"><div ref={setContent} data-testid="latest">{text}</div></div>;
};

const fitOf = (el: HTMLElement) => Number(el.style.getPropertyValue(FIT_VAR));

describe('useAnswerFit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    layout.areaHeight = 1000;
    layout.contentHeight = 500;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps a short answer at full size and writes --fit on the answer block, not the area', () => {
    const { getByTestId } = render(<Probe text="short" streaming={false} turn={1} />);
    expect(fitOf(getByTestId('latest'))).toBe(MAX_ANSWER_SCALE);
    expect(getByTestId('area').style.getPropertyValue(FIT_VAR)).toBe('');
  });

  it('shrinks as the streamed answer grows, stops at the floor, never below', () => {
    const { getByTestId, rerender } = render(<Probe text="a" streaming turn={1} />);
    const latest = getByTestId('latest');
    expect(fitOf(latest)).toBe(1);
    layout.contentHeight = 1050; // fits at ~0.952
    act(() => { vi.advanceTimersByTime(ANSWER_FIT_THROTTLE_MS); });
    rerender(<Probe text="ab" streaming turn={1} />);
    expect(fitOf(latest)).toBeCloseTo(1000 / 1050, 2);
    layout.contentHeight = 3000; // nothing fits: the floor, then the area scrolls
    act(() => { vi.advanceTimersByTime(ANSWER_FIT_THROTTLE_MS); });
    rerender(<Probe text="abc" streaming turn={1} />);
    expect(fitOf(latest)).toBe(MIN_ANSWER_SCALE);
  });

  it('never grows back mid-stream, then refits in full once the stream ends', () => {
    layout.contentHeight = 1100; // fits at ~0.909
    const { getByTestId, rerender } = render(<Probe text="long" streaming turn={1} />);
    const latest = getByTestId('latest');
    const shrunk = fitOf(latest);
    expect(shrunk).toBeCloseTo(1000 / 1100, 2);
    // The block gets shorter mid-stream (markdown closes a list, the area grows): no growth.
    layout.contentHeight = 600;
    act(() => { vi.advanceTimersByTime(ANSWER_FIT_THROTTLE_MS); });
    rerender(<Probe text="long." streaming turn={1} />);
    act(() => FakeResizeObserver.instances[0].fire());
    expect(fitOf(latest)).toBe(shrunk);
    // Stream end: one full refit within [floor, 1].
    rerender(<Probe text="long." streaming={false} turn={1} />);
    expect(fitOf(latest)).toBe(MAX_ANSWER_SCALE);
  });

  it('throttles fits while streaming: one per window plus one trailing fit', () => {
    const spy = vi.spyOn(fitScale, 'applyFitScale');
    const { getByTestId, rerender } = render(<Probe text="t0" streaming turn={1} />);
    expect(spy).toHaveBeenCalledTimes(1); // the first token fits at once
    layout.contentHeight = 1080; // fits at ~0.926
    for (let i = 1; i <= 5; i++) rerender(<Probe text={`t${i}`} streaming turn={1} />);
    expect(spy).toHaveBeenCalledTimes(1); // five tokens inside the window: no fit yet
    act(() => { vi.advanceTimersByTime(ANSWER_FIT_THROTTLE_MS); });
    expect(spy).toHaveBeenCalledTimes(2); // the trailing fit saw the latest text
    expect(fitOf(getByTestId('latest'))).toBeCloseTo(1000 / 1080, 2);
  });

  it('a new question starts again from full size; onFitted runs after each fit', () => {
    const onFitted = vi.fn();
    layout.contentHeight = 1100;
    const { getByTestId, rerender } = render(<Probe text="first" streaming={false} turn={1} onFitted={onFitted} />);
    expect(fitOf(getByTestId('latest'))).toBeLessThan(1);
    expect(onFitted).toHaveBeenCalled();
    layout.contentHeight = 300;
    rerender(<Probe text="s" streaming turn={3} onFitted={onFitted} />);
    expect(fitOf(getByTestId('latest'))).toBe(MAX_ANSWER_SCALE);
  });

  it('observes the area and the answer block, and disconnects on unmount', () => {
    const { getByTestId, unmount } = render(<Probe text="x" streaming={false} turn={1} />);
    expect(FakeResizeObserver.instances[0].observed).toEqual([getByTestId('area'), getByTestId('latest')]);
    unmount();
    expect(FakeResizeObserver.instances.every(o => o.disconnected)).toBe(true);
  });
});

/**
 * useFitScale.test.tsx — the fit hook re-fits on resize, slide change and font load · 自动放大钩子测试
 *
 * A fake ResizeObserver stands in for the browser's (jsdom has none) and,
 * like the real one, only reports the observed element; the layout is a fake
 * whose content height grows with the --fit written on the area.
 */
import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useFitScale } from '../useFitScale';
import { FIT_VAR, MAX_SCALE } from '../fitScale';

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

/** Mutable fake layout shared by the rendered area and content. */
const layout = { areaHeight: 600, contentHeight: 300 };

function fakeMeasure(area: HTMLElement | null, content: HTMLElement | null) {
  if (!area || !content) return;
  const fit = () => Number(area.style.getPropertyValue(FIT_VAR) || 1);
  Object.defineProperty(area, 'clientHeight', { configurable: true, get: () => layout.areaHeight });
  Object.defineProperty(area, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(content, 'scrollWidth', { configurable: true, get: () => 100 });
  content.getBoundingClientRect = () => ({ height: layout.contentHeight * fit(), width: 100 }) as DOMRect;
}

const Probe: React.FC<{ fitKey: unknown }> = ({ fitKey }) => {
  const area = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // Install the fake geometry before the hook's layout effect runs (ref callbacks run first).
  const setArea = (el: HTMLDivElement | null) => { area.current = el; fakeMeasure(el, content.current); };
  const setContent = (el: HTMLDivElement | null) => { content.current = el; fakeMeasure(area.current, el); };
  useFitScale(area, content, fitKey);
  return <div ref={setArea} data-testid="area"><div ref={setContent} /></div>;
};

const fitOf = (el: HTMLElement) => Number(el.style.getPropertyValue(FIT_VAR));

describe('useFitScale', () => {
  let fontsReady: () => void;
  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise<void>(resolve => { fontsReady = resolve; }) },
    });
    layout.areaHeight = 600;
    layout.contentHeight = 300;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as { fonts?: unknown }).fonts;
  });

  it('fits before paint: the area carries the fitted --fit right after the first render', () => {
    layout.contentHeight = 250; // 250 × MAX_SCALE (2.2) = 550 ≤ 600: even the ceiling fits
    const { getByTestId } = render(<Probe fitKey={1} />);
    expect(fitOf(getByTestId('area'))).toBe(MAX_SCALE);
  });

  it('re-fits when the observed area resizes', () => {
    layout.contentHeight = 400; // fits up to 1.5
    const { getByTestId } = render(<Probe fitKey={1} />);
    const area = getByTestId('area');
    expect(fitOf(area)).toBeCloseTo(1.5, 2);
    expect(FakeResizeObserver.instances[0].observed).toEqual([area]);
    layout.areaHeight = 480; // now fits up to 1.2
    act(() => FakeResizeObserver.instances[0].fire());
    expect(fitOf(area)).toBeCloseTo(1.2, 2);
  });

  it('re-fits on slide change and after the web fonts load', async () => {
    layout.contentHeight = 400;
    const { getByTestId, rerender } = render(<Probe fitKey={1} />);
    const area = getByTestId('area');
    layout.contentHeight = 500; // the next slide carries more text: fits up to 1.2
    rerender(<Probe fitKey={2} />);
    expect(fitOf(area)).toBeCloseTo(1.2, 2);
    layout.contentHeight = 600; // a wider face arrived: fits only at 1
    await act(async () => { fontsReady(); await Promise.resolve(); });
    expect(fitOf(area)).toBe(1);
  });

  it('disconnects its observer on unmount', () => {
    const { unmount } = render(<Probe fitKey={1} />);
    unmount();
    expect(FakeResizeObserver.instances.every(o => o.disconnected)).toBe(true);
  });
});

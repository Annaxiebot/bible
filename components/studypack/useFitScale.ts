/**
 * useFitScale.ts — keep a slide's content scaled to fill its area · 自动放大
 *
 * Runs the fitScale.ts search before paint (useLayoutEffect, so the group
 * never sees the content jump), again whenever the area resizes
 * (ResizeObserver: window, rotation, a layout change that fires no resize
 * event) and once the web fonts have loaded (霞鹜文楷 WenKai arrives late and
 * is wider than the fallback). Writes --fit straight to the DOM: no React
 * state, no extra render. No transition on --fit, so reduced motion holds.
 */
import { RefObject, useLayoutEffect } from 'react';
import { applyFitScale } from './fitScale';

export function useFitScale(
  areaRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  fitKey: unknown,
): void {
  useLayoutEffect(() => {
    const area = areaRef.current;
    const content = contentRef.current;
    if (!area || !content) return;
    let live = true;
    const fit = () => { if (live) applyFitScale(area, content); };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(area);
    // Font loading never rejects; jsdom and old browsers have no document.fonts — then the first fit stands.
    document.fonts?.ready.then(fit);
    return () => { live = false; observer?.disconnect(); };
  }, [areaRef, contentRef, fitKey]);
}

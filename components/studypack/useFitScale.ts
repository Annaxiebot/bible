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
import { applyFitScale, MIN_SCALE, MAX_SCALE } from './fitScale';

export function useFitScale(
  areaRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  fitKey: unknown,
  /** Lowest scale this slide may shrink to when it overflows at 1 (fitScale shrink floors). */
  minScale: number = MIN_SCALE,
): void {
  useLayoutEffect(() => {
    const area = areaRef.current;
    const content = contentRef.current;
    if (!area || !content) return;
    let live = true;
    const fit = () => { if (live) { const s = applyFitScale(area, content, { min: minScale, max: MAX_SCALE }); (window as any).__fitlog = [...((window as any).__fitlog ?? []), { t: Math.round(performance.now()), s, sh: area.scrollHeight, ch: area.clientHeight }]; } };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(area);
    // The content too: a late font subset (霞鹜文楷 unicode-range) grows the text without
    // resizing the area, which left the stale fit clipping the tail (review 2026-11-01).
    // The re-fire a fit's own resize causes converges: a settled fit resizes nothing.
    observer?.observe(content);
    // Font loading never rejects; jsdom and old browsers have no document.fonts — then the first fit stands.
    document.fonts?.ready.then(fit);
    // CJK faces (霞鹜文楷) ship as unicode-range subsets: a slide's new glyphs can fetch a subset AFTER
    // fonts.ready settled, widening the text past the computed fit (clipped slides, review 2026-11-01).
    document.fonts?.addEventListener?.('loadingdone', fit);
    // Belt and braces: measured in Chromium, the resize a late font swap causes was sometimes
    // never delivered to the observer, leaving a stale (clipping) fit. Two one-shot refits after
    // the swap window cost ~10 measurements each and settle every slide (review 2026-11-01).
    const retries = [setTimeout(fit, 350), setTimeout(fit, 1200)];
    return () => {
      live = false;
      observer?.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', fit);
      retries.forEach(clearTimeout);
    };
  }, [areaRef, contentRef, fitKey, minScale]);
}

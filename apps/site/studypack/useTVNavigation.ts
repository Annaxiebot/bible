/**
 * useTVNavigation.ts — slide navigation for TV presentation mode · 幻灯片导航
 *
 * Inputs: ArrowRight / Space / ArrowLeft / Escape keys and horizontal touch
 * swipe (iPad/phone; a gesture counts as a swipe only when its horizontal
 * movement dominates, so vertical scrolling on small screens never flips). Mouse clicks deliberately do NOT navigate — clicking is for
 * text selection (select-to-ask). Index is clamped to [0, slideCount - 1];
 * Escape (or the exit button) calls onExit.
 *
 * `enabled: false` suspends every input (used while the Ask-AI overlay is
 * open, so typing a question never flips slides or exits TV mode).
 */
import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const SWIPE_THRESHOLD_PX = 50;

export interface TVNavigation {
  index: number;
  next: () => void;
  prev: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useTVNavigation(
  slideCount: number,
  onExit: () => void,
  enabled: boolean = true
): TVNavigation {
  const [index, setIndex] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // The pack loads after mount (slideCount 0 → N). Reading the count through a
  // ref updated at commit time keeps `next` stable, so the keydown listener
  // registered at mount is never a stale closure clamped to 0 slides while
  // the passive effect that would re-register it is still pending.
  const slideCountRef = useRef(slideCount);
  useLayoutEffect(() => { slideCountRef.current = slideCount; }, [slideCount]);

  const next = useCallback(() => {
    setIndex(i => Math.min(i + 1, Math.max(slideCountRef.current - 1, 0)));
  }, []);

  const prev = useCallback(() => {
    setIndex(i => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, prev, onExit, enabled]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : null;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!enabled) { touchStartRef.current = null; return; }
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start === null || e.changedTouches.length === 0) return;
    const deltaX = e.changedTouches[0].clientX - start.x;
    const deltaY = e.changedTouches[0].clientY - start.y;
    // Horizontal must dominate: a mostly-vertical gesture is a scroll on
    // phone-sized screens (the slide content scrolls), not a slide flip.
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (deltaX < 0) {
      next();
    } else {
      prev();
    }
  }, [next, prev, enabled]);

  return { index, next, prev, onTouchStart, onTouchEnd };
}

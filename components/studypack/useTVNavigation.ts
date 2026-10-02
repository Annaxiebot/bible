/**
 * useTVNavigation.ts — slide navigation for TV presentation mode · 幻灯片导航
 *
 * Inputs: ArrowRight / Space / ArrowLeft / Escape keys, click on the left or
 * right half of the screen, and horizontal touch swipe. Index is clamped to
 * [0, slideCount - 1]; Escape (or the exit button) calls onExit.
 *
 * `enabled: false` suspends every input (used while the Ask-AI overlay is
 * open, so typing a question never flips slides or exits TV mode).
 */
import { useState, useCallback, useEffect, useRef } from 'react';

const SWIPE_THRESHOLD_PX = 50;

export interface TVNavigation {
  index: number;
  next: () => void;
  prev: () => void;
  onScreenClick: (e: React.MouseEvent<HTMLElement>) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useTVNavigation(
  slideCount: number,
  onExit: () => void,
  enabled: boolean = true
): TVNavigation {
  const [index, setIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  const next = useCallback(() => {
    setIndex(i => Math.min(i + 1, Math.max(slideCount - 1, 0)));
  }, [slideCount]);

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

  const onScreenClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!enabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 2) {
      prev();
    } else {
      next();
    }
  }, [next, prev, enabled]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches.length === 1 ? e.touches[0].clientX : null;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!enabled) { touchStartXRef.current = null; return; }
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null || e.changedTouches.length === 0) return;
    const deltaX = e.changedTouches[0].clientX - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    if (deltaX < 0) {
      next();
    } else {
      prev();
    }
  }, [next, prev, enabled]);

  return { index, next, prev, onScreenClick, onTouchStart, onTouchEnd };
}

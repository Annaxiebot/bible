import { useState, useCallback } from 'react';
import { Verse } from '../types';

const SWIPE_THRESHOLD = 100;
const DIRECTION_LOCK_THRESHOLD = 10;

export function useSwipeNavigation(
  onNavigate: (direction: 'prev' | 'next') => void,
) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'horizontal' | 'vertical' | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isPageFlipping, setIsPageFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'left' | 'right' | null>(null);
  const [nextChapterVerses, setNextChapterVerses] = useState<Verse[]>([]);
  const [prevChapterVerses, setPrevChapterVerses] = useState<Verse[]>([]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
      setSwipeDirection(null);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;

    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;

    if (!swipeDirection) {
      if (Math.abs(deltaX) > DIRECTION_LOCK_THRESHOLD || Math.abs(deltaY) > DIRECTION_LOCK_THRESHOLD) {
        setSwipeDirection(Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical');
      }
      return;
    }

    if (swipeDirection === 'horizontal') {
      setIsSwiping(true);
      setSwipeOffset(deltaX);
    }
  }, [touchStartX, touchStartY, swipeDirection]);

  const handleTouchEnd = useCallback(() => {
    if (isSwiping && Math.abs(swipeOffset) > SWIPE_THRESHOLD) {
      onNavigate(swipeOffset > 0 ? 'prev' : 'next');
    }

    setTouchStartX(null);
    setTouchStartY(null);
    setSwipeDirection(null);
    setIsSwiping(false);
    setSwipeOffset(0);
  }, [isSwiping, swipeOffset, onNavigate]);

  return {
    isSwiping,
    swipeOffset,
    isPageFlipping,
    setIsPageFlipping,
    flipDirection,
    setFlipDirection,
    nextChapterVerses,
    setNextChapterVerses,
    prevChapterVerses,
    setPrevChapterVerses,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

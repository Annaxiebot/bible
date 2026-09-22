import { useState, useCallback, useRef } from 'react';
import { Verse } from '../types';
import { SWIPE } from '../constants/appConfig';
import { isPalmTouch, isStylusTouch, realTouches, findTouchById } from '../utils/touchClassification';

const SWIPE_THRESHOLD = SWIPE.THRESHOLD_PX;
const DIRECTION_LOCK_THRESHOLD = SWIPE.DIRECTION_LOCK_PX;

/**
 * Chapter navigation by horizontal swipe · 左右滑动翻章
 *
 * SimpleDrawingCanvas now swallows palm touches that land on it, but this is the second layer and
 * it is not redundant: the swipe container spans the whole panel area, so a resting pinky can
 * easily land on a margin, on the gap between the two verse panels, or anywhere the canvas is not
 * mounted — and no amount of stopPropagation downstream helps there.
 *
 * The rules, all of which were missing:
 *   - a palm-sized contact never starts or drives a swipe;
 *   - the gesture follows the contact that STARTED it, by identifier, rather than re-reading
 *     touches[0] — which is whichever contact landed first, i.e. the resting hand;
 *   - a second real finger cancels the swipe (it is a pinch or a two-finger scroll);
 *   - touchcancel resets, so an interrupted gesture cannot leave stale state behind.
 */
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
  // A ref, not state: touchmove reads it in the same tick the touchstart set it.
  const activeTouchIdRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    activeTouchIdRef.current = null;
    setTouchStartX(null);
    setTouchStartY(null);
    setSwipeDirection(null);
    setIsSwiping(false);
    setSwipeOffset(0);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Exactly one REAL contact starts a swipe. Counting raw touches meant a resting pinky plus a
    // deliberate finger read as two-finger and, worse, a pinky ALONE read as a valid one-finger
    // swipe — which is how a hand resting on the iPad flipped the page while the user was writing.
    const real = realTouches(e.touches);
    if (real.length !== 1 || isPalmTouch(real[0])) {
      reset();
      return;
    }
    // DELIBERATE: the Apple Pencil writes, the finger navigates — the split GoodNotes and
    // Notability use, and the one this app's annotation model already assumes. The canvas stops
    // pencil strokes from reaching here when it is mounted, but it does not cover the margins or
    // the gap between panels, and a stroke that starts there must not turn the page either.
    // Reading with the pencil in hand therefore needs a finger to flip. Drop this branch to let
    // the pencil navigate again; the test named after it documents the choice.
    if (isStylusTouch(real[0])) {
      reset();
      return;
    }
    activeTouchIdRef.current = real[0].identifier;
    setTouchStartX(real[0].clientX);
    setTouchStartY(real[0].clientY);
    setSwipeDirection(null);
  }, [reset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;

    // Follow the contact that started the gesture. Re-reading touches[0] let a palm that landed
    // later take over the swipe mid-gesture and drag the page with it.
    const touch = findTouchById(e.touches, activeTouchIdRef.current);
    if (!touch) return;
    // A second real finger means a pinch or two-finger scroll, not a page turn.
    if (realTouches(e.touches).length > 1) { reset(); return; }

    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

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
  }, [touchStartX, touchStartY, swipeDirection, reset]);

  const handleTouchEnd = useCallback(() => {
    if (isSwiping && Math.abs(swipeOffset) > SWIPE_THRESHOLD) {
      onNavigate(swipeOffset > 0 ? 'prev' : 'next');
    }
    reset();
  }, [isSwiping, swipeOffset, onNavigate, reset]);

  // iOS fires this when the system takes the touch over. Without it the swipe state survived and
  // the next unrelated touch could finish a gesture the user had already abandoned.
  const handleTouchCancel = useCallback(() => { reset(); }, [reset]);

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
    handleTouchCancel,
  };
}

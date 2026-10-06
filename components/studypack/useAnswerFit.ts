/**
 * useAnswerFit.ts — shrink the latest Ask-AI answer to fit the overlay · 回答自动缩放
 *
 * Reuses the fitScale.ts search (R3) within [MIN_ANSWER_SCALE, 1]: the
 * answer starts at its TYPE_SCALE size and shrinks just enough that the
 * latest turn fits the conversation area without scrolling. Scrolling stays
 * the last resort when even MIN_ANSWER_SCALE does not fit.
 *
 * While the answer streams the search is throttled (at most one fit per
 * ANSWER_FIT_THROTTLE_MS, trailing fit included) and only ever SHRINKS —
 * its ceiling is the current scale, so text never grows back mid-stream
 * (no jitter). When the stream ends (or a stored answer shows) one full
 * refit runs within [MIN_ANSWER_SCALE, 1]. A new question (turnKey) starts
 * again from 1. Area or answer-block resizes (lazy markdown, late fonts)
 * refit through the same throttle.
 * --fit is written on the answer block itself, never on the area, so
 * earlier turns keep their own size.
 */
import { RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { applyFitScale, MAX_ANSWER_SCALE, MIN_ANSWER_SCALE } from './fitScale';

/** Minimum gap between two fits while tokens stream in (layout cost vs. responsiveness). */
export const ANSWER_FIT_THROTTLE_MS = 150;

export interface AnswerFitInput {
  /** The latest answer's text (re-fit as it grows); null when there is none. */
  text: string | null;
  /** True while the answer is streaming: shrink-only, throttled. */
  streaming: boolean;
  /** Changes with each new question: the scale restarts from 1. */
  turnKey: unknown;
  /** Called after every fit (the overlay keeps the latest turn in view). */
  onFitted?: () => void;
}

export function useAnswerFit(
  areaRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  { text, streaming, turnKey, onFitted }: AnswerFitInput,
): void {
  const scale = useRef(MAX_ANSWER_SCALE);
  const streamingRef = useRef(streaming);
  const lastFitAt = useRef(Number.NEGATIVE_INFINITY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fittedRef = useRef(onFitted);
  streamingRef.current = streaming;
  fittedRef.current = onFitted;

  // Shared fit: mid-stream the ceiling is the current scale (shrink only).
  const fit = useRef(() => { /* replaced below */ });
  fit.current = () => {
    const area = areaRef.current;
    const content = contentRef.current;
    if (!area || !content) return;
    const max = streamingRef.current ? scale.current : MAX_ANSWER_SCALE;
    scale.current = applyFitScale(area, content, { min: MIN_ANSWER_SCALE, max }, content);
    lastFitAt.current = Date.now();
    fittedRef.current?.();
  };

  // Throttled while streaming (one trailing fit); immediate otherwise.
  const schedule = useRef(() => { /* replaced below */ });
  schedule.current = () => {
    const wait = ANSWER_FIT_THROTTLE_MS - (Date.now() - lastFitAt.current);
    if (!streamingRef.current || wait <= 0) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      fit.current();
    } else if (!timer.current) {
      timer.current = setTimeout(() => { timer.current = null; fit.current(); }, wait);
    }
  };

  // New question: start again from full size, and fit its first token at once.
  useLayoutEffect(() => {
    scale.current = MAX_ANSWER_SCALE;
    lastFitAt.current = Number.NEGATIVE_INFINITY;
  }, [turnKey]);

  // Before paint on every change of the text or the stream state.
  useLayoutEffect(() => {
    if (text !== null) schedule.current();
  }, [text, streaming, turnKey]);

  useRefitTriggers(areaRef, contentRef, schedule, timer);
}

/**
 * The area resizing (window, rotation) or the answer block resizing without
 * a text change (lazy markdown renderer, late web fonts) refits too; the
 * pending trailing fit dies with the overlay.
 */
function useRefitTriggers(
  areaRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  schedule: RefObject<() => void>,
  timer: RefObject<ReturnType<typeof setTimeout> | null>,
): void {
  useEffect(() => {
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule.current());
    for (const el of [areaRef.current, contentRef.current]) if (el) observer?.observe(el);
    let live = true;
    // Font loading never rejects; jsdom has no document.fonts — then the first fit stands.
    document.fonts?.ready.then(() => { if (live) schedule.current(); });
    return () => {
      live = false;
      observer?.disconnect();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [areaRef, contentRef, schedule, timer]);
}

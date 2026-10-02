/**
 * useSelectToAsk.ts — selecting slide text auto-triggers Ask AI · 划词问AI
 *
 * On mouseup (debounced, so the selection has settled) a non-collapsed
 * selection of ≥ MIN_CHARS inside the slide content fires onSelect with the
 * selected text and clears the selection. Disabled while the overlay is open,
 * and selections outside the container (e.g. in the overlay) are ignored.
 */
import { useEffect, RefObject } from 'react';

export const SELECT_TO_ASK_MIN_CHARS = 4;
export const SELECT_TO_ASK_DEBOUNCE_MS = 400;

export function useSelectToAsk(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onSelect: (text: string) => void
): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fire = () => {
      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed) return;
      const text = selection.toString().trim();
      if (text.length < SELECT_TO_ASK_MIN_CHARS) return;
      const container = containerRef.current;
      if (!container || !selection.anchorNode || !container.contains(selection.anchorNode)) return;
      selection.removeAllRanges();
      onSelect(text);
    };

    const onMouseUp = () => {
      clearTimeout(timer);
      timer = setTimeout(fire, SELECT_TO_ASK_DEBOUNCE_MS);
    };

    window.addEventListener('mouseup', onMouseUp);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [containerRef, enabled, onSelect]);
}

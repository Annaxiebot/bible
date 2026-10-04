/**
 * useSelectToAsk.ts — selecting slide text auto-triggers Ask AI · 划词问AI
 *
 * On mouseup (debounced, so the selection has settled) a non-collapsed
 * selection inside the slide content that isAskableSelection (≥ 2 Chinese
 * characters, or ≥ 4 characters otherwise) fires onSelect with the
 * selected text and clears the selection. Disabled while the overlay is open,
 * and selections outside the container (e.g. in the overlay) are ignored.
 */
import { useEffect, RefObject } from 'react';

export const SELECT_TO_ASK_MIN_CHARS = 4;
/** A Chinese word is usually two characters (箴言, 忧虑), so CJK selections need only this many. */
export const SELECT_TO_ASK_MIN_CJK_CHARS = 2;
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/g;

/** Long enough to be a deliberate selection: ≥ 2 CJK characters, or ≥ 4 characters otherwise. */
export function isAskableSelection(text: string): boolean {
  const cjk = text.match(CJK)?.length ?? 0;
  return cjk >= SELECT_TO_ASK_MIN_CJK_CHARS || text.length >= SELECT_TO_ASK_MIN_CHARS;
}
export const SELECT_TO_ASK_DEBOUNCE_MS = 400;

/** The verse number a selection starts in (scripture slides mark each verse with data-verse), else null. */
export function selectionVerse(selection: Selection | null | undefined): number | null {
  const node = selection?.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement);
  const raw = el?.closest('[data-verse]')?.getAttribute('data-verse');
  const num = raw ? Number(raw) : NaN;
  return Number.isInteger(num) ? num : null;
}

export function useSelectToAsk(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onSelect: (text: string, verse: number | null) => void
): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fire = () => {
      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed) return;
      const text = selection.toString().trim();
      if (!isAskableSelection(text)) return;
      const container = containerRef.current;
      if (!container || !selection.anchorNode || !container.contains(selection.anchorNode)) return;
      const verse = selectionVerse(selection);
      selection.removeAllRanges();
      onSelect(text, verse);
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

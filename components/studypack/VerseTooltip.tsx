/**
 * VerseTooltip.tsx — interactive verse reference popup · 经文提示
 *
 * Hover (mouse) or click/tap toggles a popup with the verse text, 和合本
 * first then BSB (ADR-0003 §1, §8). In-pack refs render instantly from
 * `verses`; cross-book/chapter refs load from the bundled Bible data via
 * `load` with a loading line and a bilingual error line on failure.
 *
 * The popup renders in a portal to document.body (fixed positioning from
 * the reference's bounding rect) so no overlay scroll container can clip
 * it; placement flips below when there is no room above, clamps to the
 * viewport, caps at ~50vh and scrolls. It stays open while the pointer
 * moves from the reference into the popup.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PackVerse } from './packTypes';
import { placeTooltip, TooltipPlacement } from './tooltipPlacement';
import { VERSE_LOAD_ERROR, TV_LOADING } from './tvHints';
import { TYPE_SCALE } from './principles';

const tooltipTextStyle: React.CSSProperties = { fontSize: TYPE_SCALE.popup, lineHeight: 1.4 };
const CLOSE_DELAY_MS = 150;

export interface VerseTooltipProps {
  label: string;             // the reference as written, e.g. "v.26", "路加福音 12:22–31"
  /** Popup header, 中文 first (refLabel.ts); defaults to `label`. */
  title?: string;
  verses?: PackVerse[];      // in-pack verses, already resolved
  load?: () => Promise<PackVerse[]>;  // bundled-data loader for external refs
}

type LoadState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; verses: PackVerse[] };

function useLazyVerses(verses?: PackVerse[], load?: () => Promise<PackVerse[]>) {
  const [state, setState] = useState<LoadState>(
    verses ? { status: 'ready', verses } : { status: 'idle' }
  );
  const start = useCallback(() => {
    if (verses || !load) return;
    setState(prev => {
      if (prev.status === 'ready' || prev.status === 'loading') return prev;
      load()
        .then(loaded => setState({ status: 'ready', verses: loaded }))
        .catch(() => setState({ status: 'error' })); // surfaced as the popup's error line
      return { status: 'loading' };
    });
  }, [verses, load]);
  return { state, start };
}

const PopupBody: React.FC<{ state: LoadState }> = ({ state }) => {
  if (state.status === 'error') {
    return <span className="block text-red-300" style={tooltipTextStyle} role="alert">{VERSE_LOAD_ERROR}</span>;
  }
  if (state.status !== 'ready') {
    return <span className="block text-stl-text-2" style={tooltipTextStyle}>{TV_LOADING}</span>;
  }
  return (
    <>
      {state.verses.map(v => (
        <span key={v.num} className="block mb-[1vh] text-stl-text" style={tooltipTextStyle}>
          <span className="text-stl-gold mr-2">{v.num}</span>
          {v.cuv}
          <span className="block text-stl-text">{v.en}</span>
        </span>
      ))}
    </>
  );
};

const VerseTooltip: React.FC<VerseTooltipProps> = ({ label, title = label, verses, load }) => {
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { state, start } = useLazyVerses(verses, load);
  const open = placement !== null;

  const show = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlacement(placeTooltip(rect, { width: window.innerWidth, height: window.innerHeight }));
    start();
  }, [start]);

  const hide = useCallback(() => setPlacement(null), []);
  const scheduleHide = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(hide, CLOSE_DELAY_MS);
  }, [hide]);
  const cancelHide = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  // Escape and click-outside close the popup (without exiting the overlay).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); hide(); }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) hide();
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, hide]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return (
    <span
      ref={anchorRef}
      className="relative inline-block text-stl-gold underline decoration-dotted cursor-help"
      data-testid="verse-ref"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onClick={e => { e.stopPropagation(); open ? hide() : show(); }}
    >
      {label}
      {open && placement && createPortal(
        <span
          role="tooltip"
          data-testid="verse-tooltip"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          onClick={e => e.stopPropagation()}
          className="fixed overflow-y-auto tv-thin-scroll bg-stl-surface-2 border-2 border-stl-gold rounded-lg p-[1.5vh] shadow-[0_1.5vh_4vh_rgba(0,0,0,0.65)] block cursor-default"
          style={{
            left: placement.left,
            top: placement.top,
            bottom: placement.bottom,
            width: placement.width,
            maxHeight: placement.maxHeight,
            zIndex: 9999,
          }}
        >
          <span className="block text-stl-gold font-semibold mb-[1vh]" style={tooltipTextStyle} data-testid="verse-tooltip-title">
            {title}
          </span>
          <PopupBody state={state} />
        </span>,
        document.body
      )}
    </span>
  );
};

export default VerseTooltip;

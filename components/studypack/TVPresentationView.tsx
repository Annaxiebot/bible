/**
 * TVPresentationView.tsx — full-screen TV presentation mode · 电视演示模式
 *
 * Loads a StudyPack by id (packSource: public/packs/<id>.json, or this
 * device's IndexedDB for leader-generated "local-" ids) and shows it as
 * slides. Scripture text is embedded in the pack.
 * Navigation: arrow keys / Space and touch swipe only (clicks are reserved
 * for text selection). "a", the Ask AI button, or selecting slide text opens
 * the Ask-AI overlay; Escape closes the overlay first, exits the app second.
 */
import { FIRST_SLIDE_HINT, FIRST_SLIDE_HINT_SHORT, ASK_AI_LABEL, TV_LOADING } from './tvHints';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { buildSlides, StudyPack, Slide } from './packTypes';
import { loadPack } from './packSource';
import { useLocalPackClaim } from '../newstudy/claimLocalPacks';
import { questionForSelection } from './askAI';
import { useTVNavigation } from './useTVNavigation';
import { useSelectToAsk } from './useSelectToAsk';
import TVSlide from './TVSlide';
import AskAIOverlay from './AskAIOverlay';

/**
 * What the overlay should auto-send on open (one-click smart Ask AI):
 * selected text on the slide beats the discussion question; other slides
 * open with an empty input. The selection is cleared once consumed.
 */
function initialAskQuestion(slide: Slide | undefined): string | null {
  const selection = window.getSelection?.();
  const selected = selection?.toString().trim() ?? '';
  if (selected) {
    selection?.removeAllRanges();
    return questionForSelection(selected);
  }
  if (slide?.kind === 'discussion' && slide.question) return slide.question;
  return null;
}

/** Phone-sized viewport (the deck is also demoed from phones at events). */
function isCompactViewport(): boolean {
  return window.innerWidth < 768 || window.innerHeight < 500;
}

function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(isCompactViewport);
  useEffect(() => {
    const onResize = () => setCompact(isCompactViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return compact;
}

/** "a" opens the Ask-AI overlay; suspended while it is open so typing a question never re-triggers it. */
function useAskAIHotkey(askOpen: boolean, open: () => void): void {
  useEffect(() => {
    if (askOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [askOpen, open]);
}

interface TVChromeProps {
  slideCount: number;
  index: number;
  onAskAI: () => void;
}

/** Counter, first-slide hints, and Ask AI button (exit stays in the view so it also shows on load/error). */
const TVChrome: React.FC<TVChromeProps> = ({ slideCount, index, onAskAI }) => {
  const compact = useCompactViewport();
  return (
  <>
    <div className="absolute bottom-[2vh] right-[3vw] text-slate-500" style={{ fontSize: '2.5vh' }}>
      {index + 1}/{slideCount}
    </div>
    {index === 0 && (
      <div className="absolute bottom-[2vh] left-[3vw] text-slate-500" style={{ fontSize: '2vh' }}>
        {compact ? FIRST_SLIDE_HINT_SHORT : FIRST_SLIDE_HINT}
      </div>
    )}
    <button
      onClick={(e) => { e.stopPropagation(); onAskAI(); }}
      className="absolute bottom-[2vh] left-1/2 -translate-x-1/2 text-slate-500 hover:text-amber-300 border border-slate-700 rounded-full px-4 py-1"
      style={{ fontSize: '2.2vh' }}
      aria-label={ASK_AI_LABEL}
    >
      {ASK_AI_LABEL}
    </button>
  </>
  );
};

export interface TVPresentationViewProps {
  packId: string;
  onExit: () => void;
}

const TVPresentationView: React.FC<TVPresentationViewProps> = ({ packId, onExit }) => {
  const [pack, setPack] = useState<StudyPack | null>(null);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askInitial, setAskInitial] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const nav = useTVNavigation(slides?.length ?? 0, onExit, !askOpen);

  const slide = slides?.[nav.index];
  const openAsk = () => {
    setAskInitial(initialAskQuestion(slide));
    setAskOpen(true);
  };
  useAskAIHotkey(askOpen, openAsk);

  // Selecting slide text with the mouse asks about it directly.
  const onSlideSelection = useCallback((text: string) => {
    setAskInitial(questionForSelection(text));
    setAskOpen(true);
  }, []);
  useSelectToAsk(contentRef, !askOpen && !!slide, onSlideSelection);

  // Re-read after a sign-in claims this local pack (claimLocalPacks): the QR appears without a reload.
  const claim = useLocalPackClaim(packId);
  useEffect(() => {
    let cancelled = false;
    loadPack(packId)
      .then(loaded => {
        if (cancelled) return;
        setPack(loaded);
        setSlides(buildSlides(loaded));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => { cancelled = true; };
  }, [packId, claim.version]);

  return (
    <div
      className="fixed inset-0 bg-slate-950 text-slate-100 select-none overflow-hidden"
      data-testid="tv-presentation"
      onTouchStart={nav.onTouchStart}
      onTouchEnd={nav.onTouchEnd}
    >
      {/* select-text re-enables selection inside the slide so a selected
          phrase can be sent to Ask AI (the root is select-none for swipes).
          Clicks never navigate — arrow keys / swipe only. */}
      <div ref={contentRef} className="h-full w-full px-[6vw] py-[6vh] select-text overflow-y-auto">
        {error && (
          <p className="text-red-400" style={{ fontSize: '4vh' }} role="alert">{error}</p>
        )}
        {!error && !slide && (
          <p className="text-slate-400" style={{ fontSize: '4vh' }}>{TV_LOADING}</p>
        )}
        {slide && pack && <TVSlide slide={slide} pack={pack} />}
      </div>

      {slides && (
        <TVChrome slideCount={slides.length} index={nav.index} onAskAI={openAsk} />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onExit(); }}
        className="absolute top-[2vh] right-[2vw] text-slate-600 hover:text-slate-300 px-3 py-1"
        style={{ fontSize: '2.5vh' }}
        aria-label="退出演示 Exit presentation"
      >
        ✕
      </button>

      {askOpen && pack && (
        <AskAIOverlay
          pack={pack}
          slide={slide}
          initialQuestion={askInitial}
          onClose={() => { setAskOpen(false); setAskInitial(null); }}
        />
      )}
    </div>
  );
};

export default TVPresentationView;

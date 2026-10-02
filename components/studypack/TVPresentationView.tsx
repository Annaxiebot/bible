/**
 * TVPresentationView.tsx — full-screen TV presentation mode · 电视演示模式
 *
 * Fetches a StudyPack JSON from public/packs/<id>.json and shows it as
 * slides. Scripture text is embedded in the pack (no IndexedDB dependency).
 * Navigation: arrow keys / Space, click left/right half, swipe. "a" or the
 * Ask AI button opens the Ask-AI overlay; Escape closes the overlay first,
 * exits the app second.
 */
import React, { useState, useEffect } from 'react';
import { parseStudyPack, buildSlides, StudyPack, Slide } from './packTypes';
import { questionForSelection } from './askAI';
import { useTVNavigation } from './useTVNavigation';
import TVSlide from './TVSlide';
import AskAIOverlay from './AskAIOverlay';

async function loadPack(packId: string): Promise<StudyPack> {
  const url = `${import.meta.env.BASE_URL}packs/${packId}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load study pack ${packId}: HTTP ${response.status}`);
  }
  return parseStudyPack(await response.json());
}

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
const TVChrome: React.FC<TVChromeProps> = ({ slideCount, index, onAskAI }) => (
  <>
    <div className="absolute bottom-[2vh] right-[3vw] text-slate-500" style={{ fontSize: '2.5vh' }}>
      {index + 1}/{slideCount}
    </div>
    {index === 0 && (
      <div className="absolute bottom-[2vh] left-[3vw] text-slate-500" style={{ fontSize: '2vh' }}>
        ← → 或点击/滑动翻页 · Arrow keys, click, or swipe · A 问AI · Esc 退出
      </div>
    )}
    <button
      onClick={(e) => { e.stopPropagation(); onAskAI(); }}
      className="absolute bottom-[2vh] left-1/2 -translate-x-1/2 text-slate-500 hover:text-amber-300 border border-slate-700 rounded-full px-4 py-1"
      style={{ fontSize: '2.2vh' }}
      aria-label="Ask AI 问AI"
    >
      Ask AI 问AI
    </button>
  </>
);

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
  const nav = useTVNavigation(slides?.length ?? 0, onExit, !askOpen);

  const slide = slides?.[nav.index];
  const openAsk = () => {
    setAskInitial(initialAskQuestion(slide));
    setAskOpen(true);
  };
  useAskAIHotkey(askOpen, openAsk);

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
  }, [packId]);

  return (
    <div
      className="fixed inset-0 bg-slate-950 text-slate-100 select-none cursor-pointer overflow-hidden"
      data-testid="tv-presentation"
      onClick={nav.onScreenClick}
      onTouchStart={nav.onTouchStart}
      onTouchEnd={nav.onTouchEnd}
    >
      {/* select-text re-enables selection inside the slide so a selected
          phrase can be sent to Ask AI (the root is select-none for swipes). */}
      <div className="h-full w-full px-[6vw] py-[6vh] select-text">
        {error && (
          <p className="text-red-400" style={{ fontSize: '4vh' }} role="alert">{error}</p>
        )}
        {!error && !slide && (
          <p className="text-slate-400" style={{ fontSize: '4vh' }}>Loading… 加载中…</p>
        )}
        {slide && <TVSlide slide={slide} />}
      </div>

      {slides && (
        <TVChrome slideCount={slides.length} index={nav.index} onAskAI={openAsk} />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onExit(); }}
        className="absolute top-[2vh] right-[2vw] text-slate-600 hover:text-slate-300 px-3 py-1"
        style={{ fontSize: '2.5vh' }}
        aria-label="Exit presentation 退出演示"
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

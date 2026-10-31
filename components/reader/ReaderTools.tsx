/**
 * ReaderTools.tsx — the reader header's editions, tools and the phone ⋯ panel · 阅读器工具
 *
 * One component for both places the controls appear (shared-component rule):
 * the header bar from 640px up, and the ⋯ panel below 640px, where the bar
 * keeps only chapter navigation. 2026-10 phone review: at 390px the English
 * edition, annotate, search, history, font −/+ and the ⋮ menu with 简/繁 sat
 * past the right edge and could not be tapped. The bar wraps rather than
 * overflowing at any wider width (iPad, split panes).
 */
import React from 'react';
import { ENGLISH_EDITIONS, ChineseScript } from '../../services/readerPreferences';
import type { ReaderStrings } from './readerStrings';

/** Font-size bounds: the −/+ buttons stop here and BibleViewer.adjustFontSize clamps to them. */
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 36;
const FONT_STEP = 2;

const SELECT_CLASS = 'p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium';
const PILL_CLASS = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors shadow-sm';

export interface ReaderEditionsProps {
  s: ReaderStrings;
  /** Short option text ("CUV") and narrow selects. */
  compact: boolean;
  chineseVersion: string;
  englishVersion: string;
  onChineseVersionChange: (version: string) => void;
  onEnglishVersionChange: (version: string) => void;
  className: string;
}

export const ReaderEditions: React.FC<ReaderEditionsProps> = ({
  s, compact, chineseVersion, englishVersion, onChineseVersionChange, onEnglishVersionChange, className,
}) => (
  <div className={className}>
    <select
      className={`${SELECT_CLASS} ${compact ? 'w-16' : 'w-auto'}`}
      value={chineseVersion}
      onChange={(e) => onChineseVersionChange(e.target.value)}
      title={s.chineseEditionLabel}
      aria-label={s.chineseEditionLabel}
    >
      {/* CUNP withdrawn for now (owner request) — CUV is the only Chinese edition offered. */}
      <option value="cuv">{compact ? 'CUV' : '和合本 CUV'}</option>
    </select>
    <select
      className={`${SELECT_CLASS} ${compact ? 'w-16' : 'w-auto'}`}
      value={englishVersion}
      onChange={(e) => onEnglishVersionChange(e.target.value)}
      title={s.englishEditionLabel}
      aria-label={s.englishEditionLabel}
    >
      {/* The same six editions Settings lists (services/readerPreferences ENGLISH_EDITIONS). */}
      {ENGLISH_EDITIONS.map(e => <option key={e.id} value={e.id} title={e.name}>{e.short}</option>)}
    </select>
  </div>
);

export interface ReaderToolsProps {
  s: ReaderStrings;
  /** Text beside the icons (the bar hides it on an iPhone; the ⋯ panel always shows it). */
  showLabels: boolean;
  className: string;
  isAnnotationMode: boolean;
  onToggleAnnotationMode: () => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  onShowReadingHistory: () => void;
  isSimplified: boolean;
  onToggleChineseMode: () => void;
  fontSize: number;
  onAdjustFontSize: (delta: number) => void;
  /** After annotate, search or history (each opens something), e.g. to close the ⋯ panel. */
  onToolUsed?: () => void;
}

export const ReaderTools: React.FC<ReaderToolsProps> = ({
  s, showLabels, className, isAnnotationMode, onToggleAnnotationMode, showSearch, onToggleSearch,
  onShowReadingHistory, isSimplified, onToggleChineseMode, fontSize, onAdjustFontSize, onToolUsed,
}) => {
  const script: ChineseScript = isSimplified ? 'simplified' : 'traditional';
  const chooseScript = (target: ChineseScript) => { if (target !== script) onToggleChineseMode(); };
  const use = (action: () => void) => () => { action(); onToolUsed?.(); };
  return (
    <div className={className}>
      <button
        type="button"
        onClick={use(onToggleAnnotationMode)}
        className={`${PILL_CLASS} ${isAnnotationMode ? 'border-amber-400 text-amber-700 shadow-amber-100' : 'bg-white border-slate-200 hover:border-amber-300'}`}
        style={{ backgroundColor: isAnnotationMode ? 'rgba(251, 191, 36, 0.15)' : undefined }}
        title={isAnnotationMode ? s.exitAnnotateTitle : s.annotateTitle}
        aria-label={isAnnotationMode ? s.exitAnnotateTitle : s.annotateTitle}
        aria-pressed={isAnnotationMode}
      >
        <span className="text-sm" aria-hidden="true">✏️</span>
        {showLabels && <span className="text-xs font-medium">{isAnnotationMode ? s.annotating : s.annotate}</span>}
      </button>
      <button
        type="button"
        onClick={use(onToggleSearch)}
        className={`${PILL_CLASS} ${showSearch ? 'bg-indigo-100 border-indigo-300 text-indigo-600' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
        title={s.searchTitle}
        aria-label={s.searchTitle}
        aria-pressed={showSearch}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {showLabels && <span className="text-xs font-medium">{s.search}</span>}
      </button>
      <button
        type="button"
        onClick={use(onShowReadingHistory)}
        className={`${PILL_CLASS} bg-white border-slate-200 hover:border-indigo-300`}
        title={s.historyTitle}
        aria-label={s.historyTitle}
      >
        <span className="text-sm" aria-hidden="true">📚</span>
        {showLabels && <span className="text-xs font-medium text-slate-600">{s.history}</span>}
      </button>
      {/* Two pressed-state buttons, so the current script and the action are never confused. */}
      <div
        role="group"
        aria-label={s.scriptLabel}
        title={s.scriptStatus(script)}
        data-testid="script-control"
        className="flex items-center p-0.5 bg-white rounded-full border border-slate-200 shadow-sm"
      >
        {(['simplified', 'traditional'] as const).map(target => (
          <button
            key={target}
            type="button"
            lang={target === 'simplified' ? 'zh-Hans' : 'zh-Hant'}
            aria-pressed={script === target}
            onClick={() => chooseScript(target)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              script === target ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {target === 'simplified' ? '简' : '繁'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 px-2 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
        <button
          type="button"
          onClick={() => onAdjustFontSize(-FONT_STEP)}
          className="p-0.5 hover:bg-slate-100 rounded transition-colors"
          title={s.fontSmaller}
          aria-label={s.fontSmaller}
          disabled={fontSize <= FONT_SIZE_MIN}
        >
          <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="text-xs font-medium text-slate-600 px-1 min-w-[20px] text-center" data-testid="reader-font-size">{fontSize}</span>
        <button
          type="button"
          onClick={() => onAdjustFontSize(FONT_STEP)}
          className="p-0.5 hover:bg-slate-100 rounded transition-colors"
          title={s.fontLarger}
          aria-label={s.fontLarger}
          disabled={fontSize >= FONT_SIZE_MAX}
        >
          <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
};

/** Online / offline dot and the app version. */
export const ReaderStatusPill: React.FC<{ s: ReaderStrings; isOffline: boolean; className: string }> = ({ s, isOffline, className }) => (
  <div className={className}>
    <div className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-green-500' : 'bg-indigo-500 animate-pulse'}`}></div>
    <span className="text-[10px] font-bold text-slate-500">{isOffline ? s.offline : s.online}</span>
    <span className="text-[8px] text-slate-400 ml-1">v2.2.0</span>
  </div>
);

/** Bible download progress with its Stop button — stays in the bar at every width (it wraps). */
export const ReaderDownloadStatus: React.FC<{
  s: ReaderStrings;
  auto: boolean;
  progress: number;
  timeRemaining: string;
  status: string;
  onStop: () => void;
}> = ({ s, auto, progress, timeRemaining, status, onStop }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={onStop}
      className="flex items-center gap-1 px-2 py-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm"
      title={s.stopDownload}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
      <span className="text-xs font-medium">{s.stop}</span>
    </button>
    <div className="flex items-center gap-2 px-2 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
      <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <div className="flex flex-col items-start">
        <span className="text-xs font-medium text-slate-600">
          {auto ? s.autoPrefix : ''}{progress}%
          {timeRemaining && ` • ${timeRemaining}`}
        </span>
        {status && <span className="text-[10px] text-slate-500">{status}</span>}
      </div>
    </div>
  </div>
);

export const READER_MORE_PANEL_ID = 'reader-more-panel';

/** The phone ⋯ button and its panel (below 640px only; `sm:hidden`). */
export const ReaderMoreMenu: React.FC<{
  s: ReaderStrings;
  open: boolean;
  onToggle: () => void;
  menuRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}> = ({ s, open, onToggle, menuRef, children }) => (
  <div className="relative sm:hidden" ref={menuRef}>
    <button
      type="button"
      onClick={onToggle}
      className="p-1.5 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
      title={s.moreOptions}
      aria-label={s.moreOptions}
      aria-expanded={open}
      aria-controls={READER_MORE_PANEL_ID}
    >
      <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h.01M12 12h.01M19 12h.01" />
      </svg>
    </button>
    {open && (
      <div
        id={READER_MORE_PANEL_ID}
        role="group"
        aria-label={s.moreOptions}
        data-testid={READER_MORE_PANEL_ID}
        className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1.5rem))] p-3 flex flex-col gap-3 bg-white rounded-lg shadow-lg border border-slate-200 z-50"
      >
        {children}
      </div>
    )}
  </div>
);

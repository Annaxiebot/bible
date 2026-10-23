import React from 'react';
import { Book } from '../types';
import { useSeasonTheme } from '../hooks/useSeasonTheme';
import { useReaderPreferences } from '../services/readerPreferences';
import { readerStrings, bookLabel } from './reader/readerStrings';
import { ReaderEditions, ReaderTools, ReaderStatusPill, ReaderMoreMenu, ReaderDownloadStatus } from './reader/ReaderTools';

interface BibleHeaderProps {
  // Navigation
  selectedBook: Book;
  selectedChapter: number;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  onNavigateChapter: (direction: 'prev' | 'next') => void;

  // Book selector
  bookSearchTerm: string;
  showBookDropdown: boolean;
  filteredBooks: Book[];
  bookSearchRef: React.RefObject<HTMLDivElement>;
  onBookSearchTermChange: (term: string) => void;
  onBookDropdownOpen: () => void;
  onBookSelect: (book: Book) => void;

  // Chapter selector
  offlineChapters: Set<string>;
  chaptersWithContent: { withNotes: Set<number>; withResearch: Set<number> };
  onChapterChange: (chapter: number) => void;

  // Font size
  fontSize: number;
  onAdjustFontSize: (delta: number) => void;

  // Chinese mode
  isSimplified: boolean;
  onToggleChineseMode: () => void;

  // Offline/online indicator
  isOffline: boolean;

  // Download state
  isDownloading: boolean;
  autoDownloadInProgress: boolean;
  downloadProgress: number;
  downloadTimeRemaining: string;
  downloadStatus: string;
  showDownloadMenu: boolean;
  onStopDownload: () => void;
  onToggleDownloadMenu: () => void;
  onDownloadCurrentChapter: () => void;
  onDownloadCurrentBook: () => void;
  onDownloadBible: () => void;

  // Annotation mode
  isAnnotationMode: boolean;
  onToggleAnnotationMode: () => void;

  // Search
  showSearch: boolean;
  onToggleSearch: () => void;

  // Reading history
  onShowReadingHistory: () => void;

  // Mobile menu
  isIPhone: boolean;
  showMobileMenu: boolean;
  mobileMenuRef: React.RefObject<HTMLDivElement>;
  onToggleMobileMenu: () => void;

  // Sidebar
  sidebarOpen: boolean;
  showSidebarToggle: boolean;
  onSidebarToggle?: () => void;

  // Bible versions
  chineseVersion: string;
  englishVersion: string;
  onChineseVersionChange: (version: string) => void;
  onEnglishVersionChange: (version: string) => void;

  // Selection status
  allVersesSelected: boolean;
  selectedVersesCount: number;
}

const BibleHeader: React.FC<BibleHeaderProps> = ({
  selectedBook,
  selectedChapter,
  canNavigatePrev,
  canNavigateNext,
  onNavigateChapter,
  bookSearchTerm,
  showBookDropdown,
  filteredBooks,
  bookSearchRef,
  onBookSearchTermChange,
  onBookDropdownOpen,
  onBookSelect,
  offlineChapters,
  chaptersWithContent,
  onChapterChange,
  fontSize,
  onAdjustFontSize,
  isSimplified,
  onToggleChineseMode,
  isOffline,
  isDownloading,
  autoDownloadInProgress,
  downloadProgress,
  downloadTimeRemaining,
  downloadStatus,
  showDownloadMenu,
  onStopDownload,
  onToggleDownloadMenu,
  onDownloadCurrentChapter,
  onDownloadCurrentBook,
  onDownloadBible,
  isAnnotationMode,
  onToggleAnnotationMode,
  showSearch,
  onToggleSearch,
  onShowReadingHistory,
  isIPhone,
  showMobileMenu,
  mobileMenuRef,
  onToggleMobileMenu,
  sidebarOpen,
  showSidebarToggle,
  onSidebarToggle,
  chineseVersion,
  englishVersion,
  onChineseVersionChange,
  onEnglishVersionChange,
  allVersesSelected,
  selectedVersesCount,
}) => {
  const { theme } = useSeasonTheme();
  const { uiLanguage } = useReaderPreferences();
  const s = readerStrings(uiLanguage);
  // 中文 keeps the full bilingual book name; English shows the English half.
  const bookName = (name: string) => (uiLanguage === 'en' ? bookLabel(name, 'en') : name);
  const editions = { s, chineseVersion, englishVersion, onChineseVersionChange, onEnglishVersionChange };
  const tools = {
    s, isAnnotationMode, onToggleAnnotationMode, showSearch, onToggleSearch, onShowReadingHistory,
    isSimplified, onToggleChineseMode, fontSize, onAdjustFontSize,
  };
  // Below 640px the bar keeps chapter navigation and ⋯; editions and tools move into the ⋯ panel.
  // From 640px up every group wraps instead of overflowing (iPad widths, split panes).
  // z-[45]: the book list and the ⋯ panel drop over the text, so the header sits above the annotation
  // layer (z-20) and the column divider (z-30/z-40) that would otherwise take their taps; fixed overlays stay above (z-50).
  const gap = isIPhone ? 'gap-1' : 'gap-1 sm:gap-3';
  const divider = isIPhone ? null : <div className="hidden sm:block h-6 w-[1px] bg-slate-300"></div>;

  return (
    <div
      data-testid="reader-header"
      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 py-2 border-b bg-slate-50 sticky top-0 z-[45] shrink-0 shadow-sm"
      onClick={e => e.stopPropagation()}
      lang={s.lang}
    >
      {/* The left margin leaves room for the fixed sidebar button (App.tsx) when there is one. */}
      <div
        className={`flex flex-wrap ${gap} items-center min-w-0`}
        style={{ marginLeft: showSidebarToggle ? (sidebarOpen ? '12px' : '52px') : '0px' }}
      >
        {/* App mark; on an iPhone it opens the sidebar. Beside the sidebar button it is decoration, so phones drop it. */}
        <div
          className={`items-center gap-2 ${showSidebarToggle ? 'hidden sm:flex' : 'flex cursor-pointer'}`}
          onClick={!showSidebarToggle ? onSidebarToggle : undefined}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold shadow-sm" style={{ backgroundColor: theme.accent }}>圣</div>
          {!isIPhone && (
            <h1 className="hidden sm:block text-lg font-bold tracking-tight text-slate-800">{s.appTitle}</h1>
          )}
          {!showSidebarToggle && (
            <svg className="w-4 h-4 text-slate-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          )}
        </div>
        {divider}
        <button
          onClick={() => onNavigateChapter('prev')}
          disabled={!canNavigatePrev}
          className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={s.prevChapter}
          aria-label={s.prevChapter}
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="relative" ref={bookSearchRef}>
          <input
            type="text"
            className={`p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium ${isIPhone ? 'w-24' : 'w-24 sm:w-40'}`}
            value={showBookDropdown ? bookSearchTerm : bookName(selectedBook.name)}
            aria-label={s.bookSearchLabel}
            onChange={(e) => onBookSearchTermChange(e.target.value)}
            onFocus={() => {
              onBookDropdownOpen();
            }}
            placeholder={s.bookSearchPlaceholder}
          />
          {showBookDropdown && (
            <div className="absolute top-full mt-1 w-full min-w-[10rem] max-h-60 overflow-y-scroll bg-white border border-slate-200 rounded-lg shadow-lg z-50 book-dropdown-scroll">
              {filteredBooks.length > 0 ? (
                filteredBooks.map(book => (
                  <button
                    key={book.id}
                    onClick={() => onBookSelect(book)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                      book.id === selectedBook.id ? 'bg-indigo-100 font-semibold' : ''
                    }`}
                  >
                    {bookName(book.name)}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-slate-500">{s.noBookMatch}</div>
              )}
            </div>
          )}
        </div>
        <select
          className={`p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium ${isIPhone ? 'w-16' : 'w-20 sm:w-24'}`}
          value={selectedChapter}
          onChange={(e) => onChapterChange(Number(e.target.value))}
          aria-label={s.chapterSelectLabel}
          title={s.chapterSelectLabel}
        >
          {Array.from({ length: selectedBook.chapters || 1 }, (_, i) => i + 1).map(num => {
            const chapterIsOffline = offlineChapters.has(`${selectedBook.id}_${num}`);
            const hasNotes = chaptersWithContent.withNotes.has(num);
            const hasResearch = chaptersWithContent.withResearch.has(num);

            let indicators = '';
            if (chapterIsOffline) indicators += '✓ ';
            if (hasNotes) indicators += '📝 ';
            if (hasResearch) indicators += '🤖 ';

            return (
              <option key={num} value={num}>
                {indicators}{isIPhone ? num : s.chapterOption(num)}
              </option>
            );
          })}
        </select>
        <button
          onClick={() => onNavigateChapter('next')}
          disabled={!canNavigateNext}
          className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={s.nextChapter}
          aria-label={s.nextChapter}
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {divider}
        <ReaderEditions {...editions} compact={isIPhone} className={`hidden sm:flex ${gap} items-center`} />
      </div>
      <div className={`flex flex-wrap items-center ${gap} ml-auto`}>
        <ReaderTools {...tools} showLabels={!isIPhone} className={`hidden sm:flex flex-wrap items-center ${gap}`} />
        {(isDownloading || autoDownloadInProgress) && (
          <ReaderDownloadStatus
            s={s}
            auto={autoDownloadInProgress}
            progress={downloadProgress}
            timeRemaining={downloadTimeRemaining}
            status={downloadStatus}
            onStop={onStopDownload}
          />
        )}
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:block">
          {allVersesSelected ? s.allSelected : (selectedVersesCount > 0 ? s.selectedCount(selectedVersesCount) : s.selectHint)}
        </div>
        <div className="h-4 w-[1px] bg-slate-200 hidden lg:block"></div>
        <ReaderMoreMenu s={s} open={showMobileMenu} onToggle={onToggleMobileMenu} menuRef={mobileMenuRef}>
          <ReaderEditions {...editions} compact={false} className="flex flex-wrap gap-2 items-center" />
          <ReaderTools {...tools} showLabels className="flex flex-wrap gap-2 items-center" onToolUsed={onToggleMobileMenu} />
          <ReaderStatusPill s={s} isOffline={isOffline} className="flex items-center gap-1.5 self-start px-3 py-1 bg-white rounded-full border border-slate-200" />
        </ReaderMoreMenu>
        <ReaderStatusPill s={s} isOffline={isOffline} className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm" />
      </div>
    </div>
  );
};

export default BibleHeader;

import React from 'react';
import { Book } from '../types';
import { useSeasonTheme } from '../hooks/useSeasonTheme';

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
  allVersesSelected,
  selectedVersesCount,
}) => {
  const { theme } = useSeasonTheme();

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 border-b bg-slate-50 sticky top-0 z-10 shrink-0 shadow-sm ${isIPhone ? 'gap-2' : ''}`}
      onClick={e => e.stopPropagation()}
    >
      <div className={`flex ${isIPhone ? 'gap-1' : 'gap-3'} items-center`}>
        {/* App Title integrated into Bible controls - responsive positioning */}
        <div
          className={`flex items-center gap-2 ${!showSidebarToggle ? 'cursor-pointer' : ''}`}
          style={{
            marginLeft: showSidebarToggle ? (sidebarOpen ? '12px' : '52px') : '0px'
          }}
          onClick={!showSidebarToggle ? onSidebarToggle : undefined}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold shadow-sm" style={{ backgroundColor: theme.accent }}>圣</div>
          {!isIPhone && (
            <h1 className="text-lg font-bold tracking-tight text-slate-800">经学研</h1>
          )}
          {!showSidebarToggle && (
            <svg className="w-4 h-4 text-slate-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          )}
        </div>
        {!isIPhone && <div className="h-6 w-[1px] bg-slate-300"></div>}
        <button
          onClick={() => onNavigateChapter('prev')}
          disabled={!canNavigatePrev}
          className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="上一章"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="relative" ref={bookSearchRef}>
          <input
            type="text"
            className={`p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium ${isIPhone ? 'w-24' : 'w-40'}`}
            value={showBookDropdown ? bookSearchTerm : selectedBook.name}
            onChange={(e) => onBookSearchTermChange(e.target.value)}
            onFocus={() => {
              onBookDropdownOpen();
            }}
            placeholder="搜索书卷..."
          />
          {showBookDropdown && (
            <div className="absolute top-full mt-1 w-full max-h-60 overflow-y-scroll bg-white border border-slate-200 rounded-lg shadow-lg z-50 book-dropdown-scroll">
              {filteredBooks.length > 0 ? (
                filteredBooks.map(book => (
                  <button
                    key={book.id}
                    onClick={() => onBookSelect(book)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                      book.id === selectedBook.id ? 'bg-indigo-100 font-semibold' : ''
                    }`}
                  >
                    {book.name}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-slate-500">没有找到匹配的书卷</div>
              )}
            </div>
          )}
        </div>
        <select
          className={`p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium ${isIPhone ? 'w-16' : 'w-24'}`}
          value={selectedChapter}
          onChange={(e) => onChapterChange(Number(e.target.value))}
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
                {indicators}{isIPhone ? num : `第 ${num} 章`}
              </option>
            );
          })}
        </select>
        <button
          onClick={() => onNavigateChapter('next')}
          disabled={!canNavigateNext}
          className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="下一章"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className={`flex items-center ${isIPhone ? 'gap-1' : 'gap-3'}`}>
        {/* Annotate Toggle Button */}
        <button
          onClick={onToggleAnnotationMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all shadow-sm ${
            isAnnotationMode
              ? 'border-amber-400 text-amber-700 shadow-amber-100'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
          style={{
            backgroundColor: isAnnotationMode ? 'rgba(251, 191, 36, 0.15)' : undefined,
          }}
          title={isAnnotationMode ? '退出标注 Exit annotation' : '标注经文 Annotate verses'}
        >
          <span className="text-sm">{isAnnotationMode ? '✏️' : '✏️'}</span>
          {!isIPhone && <span className="text-xs font-medium">{isAnnotationMode ? '标注中' : '标注'}</span>}
        </button>

        {/* Search Button */}
        <button
          onClick={onToggleSearch}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors shadow-sm ${
            showSearch
              ? 'bg-indigo-100 border-indigo-300 text-indigo-600'
              : 'bg-white border-slate-200 hover:border-indigo-300'
          }`}
          title="搜索经文 Search verses"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {!isIPhone && <span className="text-xs font-medium">搜索</span>}
        </button>

        {/* Reading History Button */}
        <button
          onClick={onShowReadingHistory}
          className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 hover:border-indigo-300 transition-colors shadow-sm"
          title="阅读历史"
        >
          <span className="text-sm">📚</span>
          {!isIPhone && <span className="text-xs font-medium text-slate-600">历史</span>}
        </button>

        {!isIPhone && (
          <button
            onClick={onToggleChineseMode}
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 hover:border-indigo-300 transition-colors shadow-sm"
            title="切换简繁体"
          >
            <span className="text-xs font-medium text-slate-600">{isSimplified ? '简' : '繁'}</span>
          </button>
        )}
        <div className="flex items-center gap-1 px-2 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
          <button
            onClick={() => onAdjustFontSize(-2)}
            className="p-0.5 hover:bg-slate-100 rounded transition-colors"
            title="缩小字体"
            disabled={fontSize <= 12}
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-xs font-medium text-slate-600 px-1 min-w-[20px] text-center">{fontSize}</span>
          <button
            onClick={() => onAdjustFontSize(2)}
            className="p-0.5 hover:bg-slate-100 rounded transition-colors"
            title="放大字体"
            disabled={fontSize >= 36}
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        {(isDownloading || autoDownloadInProgress) && (
          <div className="flex items-center gap-2">
            <button
              onClick={onStopDownload}
              className="flex items-center gap-1 px-2 py-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm"
              title="停止下载"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-xs font-medium">停止</span>
            </button>
            <div className="flex items-center gap-2 px-2 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
              <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="flex flex-col items-start">
                <span className="text-xs font-medium text-slate-600">
                  {autoDownloadInProgress ? '自动 ' : ''}{downloadProgress}%
                  {downloadTimeRemaining && ` • ${downloadTimeRemaining}`}
                </span>
                {downloadStatus && (
                  <span className="text-[10px] text-slate-500">
                    {downloadStatus}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:block">
          {allVersesSelected ? '已选全章' : (selectedVersesCount > 0 ? `已选 ${selectedVersesCount} 节` : '点击经文或高亮文字')}
        </div>
        <div className="h-4 w-[1px] bg-slate-200 hidden lg:block"></div>

        {/* Mobile Menu Button for iPhone */}
        {isIPhone && (
          <div className="relative" ref={mobileMenuRef}>
            <button
              onClick={onToggleMobileMenu}
              className="p-1.5 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
              title="更多选项"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>

            {showMobileMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-50">

                {/* Chinese Mode Toggle */}
                <button
                  onClick={() => {
                    onToggleChineseMode();
                    onToggleMobileMenu();
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
                >
                  <span className="text-slate-700">切换简繁体</span>
                  <span className="float-right text-slate-500">{isSimplified ? '简' : '繁'}</span>
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
          <div className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-green-500' : 'bg-indigo-500 animate-pulse'}`}></div>
          <span className="text-[10px] font-bold text-slate-500">{isOffline ? '离线模式' : '在线'}</span>
          <span className="text-[8px] text-slate-400 ml-1">v2.2.0</span>
        </div>
      </div>
    </div>
  );
};

export default BibleHeader;

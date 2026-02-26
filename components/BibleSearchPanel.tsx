import React from 'react';
import { useSeasonTheme } from '../hooks/useSeasonTheme';

interface SearchResult {
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
  translation: string;
}

interface BibleSearchPanelProps {
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  onSearchChange: (query: string) => void;
  onSearch: (query: string) => void;
  onClose: () => void;
  onResultClick: (result: SearchResult) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

const BibleSearchPanel: React.FC<BibleSearchPanelProps> = ({
  searchQuery,
  searchResults,
  isSearching,
  onSearchChange,
  onSearch,
  onClose,
  onResultClick,
  inputRef,
}) => {
  const { theme } = useSeasonTheme();

  return (
    <div
      className="border-b border-slate-200 bg-slate-50 px-4 py-2 shrink-0 z-10"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            className="w-full px-3 py-1.5 pl-8 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            placeholder="搜索经文... Search verses..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch(searchQuery);
              if (e.key === 'Escape') onClose();
            }}
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          onClick={() => onSearch(searchQuery)}
          disabled={isSearching || !searchQuery.trim()}
          className="px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ backgroundColor: theme.accent }}
        >
          {isSearching ? '搜索中...' : '搜索 Search'}
        </button>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1 mb-1">
          <div className="text-[10px] text-slate-400 mb-1">
            找到 {searchResults.length} 条结果{searchResults.length >= 50 ? ' (显示前50条)' : ''}
            {' · '}在已缓存的章节中搜索
          </div>
          {searchResults.map((result, idx) => (
            <button
              key={`${result.bookId}-${result.chapter}-${result.verse}-${idx}`}
              onClick={() => onResultClick(result)}
              className="w-full text-left px-2 py-1.5 rounded-md hover:bg-indigo-50 transition-colors flex items-start gap-2"
            >
              <span className="text-[10px] font-semibold text-indigo-500 whitespace-nowrap mt-0.5">
                {result.bookName.split(' ')[0]} {result.chapter}:{result.verse}
              </span>
              <span className="text-xs text-slate-600 line-clamp-2">{result.text}</span>
              <span className="text-[8px] text-slate-300 mt-0.5 shrink-0">{result.translation}</span>
            </button>
          ))}
        </div>
      )}

      {searchQuery && searchResults.length === 0 && !isSearching && (
        <div className="text-xs text-slate-400 py-1">
          未找到结果 No results found. 尝试搜索已下载的书卷。
        </div>
      )}
    </div>
  );
};

export default BibleSearchPanel;

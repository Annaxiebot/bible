import React, { useState, useCallback } from 'react';
import { useSeasonTheme } from '../hooks/useSeasonTheme';
import {
  SearchScope,
  UnifiedSearchResult,
  unifiedSearch,
  highlightMatches,
} from '../services/unifiedSearchService';

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

const SCOPE_LABELS: { id: SearchScope; label: string; labelEn: string }[] = [
  { id: 'all', label: '全部', labelEn: 'All' },
  { id: 'bible', label: '经文', labelEn: 'Bible' },
  { id: 'research', label: 'AI研究', labelEn: 'Research' },
  { id: 'notes', label: '笔记', labelEn: 'Notes' },
];

const SOURCE_COLORS: Record<string, string> = {
  bible: 'bg-blue-100 text-blue-700',
  research: 'bg-purple-100 text-purple-700',
  notes: 'bg-green-100 text-green-700',
};

const SOURCE_LABELS: Record<string, string> = {
  bible: 'Bible',
  research: 'AI',
  notes: 'Note',
};

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
  const [scope, setScope] = useState<SearchScope>('all');
  const [unifiedResults, setUnifiedResults] = useState<UnifiedSearchResult[]>([]);
  const [isUnifiedSearching, setIsUnifiedSearching] = useState(false);

  const handleSearch = useCallback(async (query: string) => {
    if (scope === 'bible') {
      // Delegate to parent's Bible-only search
      onSearch(query);
      setUnifiedResults([]);
      return;
    }

    // Use unified search for other scopes
    if (!query.trim()) return;
    setIsUnifiedSearching(true);
    try {
      const results = await unifiedSearch(query, scope);
      setUnifiedResults(results);
    } catch {
      setUnifiedResults([]);
    } finally {
      setIsUnifiedSearching(false);
    }
  }, [scope, onSearch]);

  const handleScopeChange = useCallback((newScope: SearchScope) => {
    setScope(newScope);
    setUnifiedResults([]);
    // Re-search if there's already a query
    if (searchQuery.trim()) {
      if (newScope === 'bible') {
        onSearch(searchQuery);
      } else {
        setIsUnifiedSearching(true);
        unifiedSearch(searchQuery, newScope).then(results => {
          setUnifiedResults(results);
          setIsUnifiedSearching(false);
        }).catch(() => setIsUnifiedSearching(false));
      }
    }
  }, [searchQuery, onSearch]);

  const handleUnifiedResultClick = useCallback((result: UnifiedSearchResult) => {
    if (result.bookId && result.chapter && result.verses?.length) {
      onResultClick({
        bookId: result.bookId,
        bookName: result.label.split(' ')[0],
        chapter: result.chapter,
        verse: result.verses[0],
        text: result.fullText,
        translation: '',
      });
    }
  }, [onResultClick]);

  const searching = isSearching || isUnifiedSearching;
  const showUnifiedResults = scope !== 'bible' && unifiedResults.length > 0;
  const showBibleResults = scope === 'bible' && searchResults.length > 0;
  const noResults = searchQuery && !searching && !showUnifiedResults && !showBibleResults &&
    (scope === 'bible' ? searchResults.length === 0 : unifiedResults.length === 0);

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
            placeholder={scope === 'bible' ? '搜索经文... Search verses...' : '搜索全部内容... Search all content...'}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch(searchQuery);
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
          onClick={() => handleSearch(searchQuery)}
          disabled={searching || !searchQuery.trim()}
          className="px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ backgroundColor: theme.accent }}
        >
          {searching ? '搜索中...' : '搜索 Search'}
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

      {/* Scope tabs */}
      <div className="flex gap-1 mb-2">
        {SCOPE_LABELS.map(({ id, label, labelEn }) => (
          <button
            key={id}
            onClick={() => handleScopeChange(id)}
            className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all ${
              scope === id
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                : 'bg-slate-100 text-slate-500 border border-transparent hover:bg-slate-200'
            }`}
          >
            {label} {labelEn}
          </button>
        ))}
      </div>

      {/* Bible text results (original) */}
      {showBibleResults && (
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

      {/* Unified search results (all / research / notes) */}
      {showUnifiedResults && (
        <div className="max-h-48 overflow-y-auto space-y-1 mb-1">
          <div className="text-[10px] text-slate-400 mb-1">
            找到 {unifiedResults.length} 条结果{unifiedResults.length >= 50 ? ' (显示前50条)' : ''}
          </div>
          {unifiedResults.map((result) => (
            <button
              key={result.key}
              onClick={() => handleUnifiedResultClick(result)}
              className="w-full text-left px-2 py-1.5 rounded-md hover:bg-indigo-50 transition-colors flex items-start gap-2"
            >
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap mt-0.5 ${SOURCE_COLORS[result.source]}`}>
                {SOURCE_LABELS[result.source]}
              </span>
              <span className="text-[10px] font-semibold text-indigo-500 whitespace-nowrap mt-0.5">
                {result.label}
              </span>
              <span
                className="text-xs text-slate-600 line-clamp-2"
                dangerouslySetInnerHTML={{
                  __html: highlightMatches(result.snippet, searchQuery),
                }}
              />
            </button>
          ))}
        </div>
      )}

      {noResults && (
        <div className="text-xs text-slate-400 py-1">
          未找到结果 No results found. 尝试搜索已下载的书卷。
        </div>
      )}
    </div>
  );
};

export default BibleSearchPanel;

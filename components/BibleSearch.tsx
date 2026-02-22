import React, { useState, useRef, useCallback, useEffect } from 'react';
import { bibleSearchService, SearchResult } from '../services/bibleSearchService';

interface BibleSearchProps {
  onNavigate: (bookId: string, chapter: number, verses?: number[]) => void;
  onClose: () => void;
  onDownloadBible?: () => void;
}

const BibleSearch: React.FC<BibleSearchProps> = ({ onNavigate, onClose, onDownloadBible }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState({ searched: 0, total: 0 });
  const [testament, setTestament] = useState<'all' | 'ot' | 'nt'>('all');
  const [translation, setTranslation] = useState<'cuv' | 'web' | 'both'>('both');
  const [downloadStatus, setDownloadStatus] = useState<{ downloaded: number; total: number } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bibleSearchService.getDownloadStatus().then(status => {
      setDownloadStatus({ downloaded: status.downloaded, total: status.total });
    });
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    // Cancel previous search
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setResults([]);
    setHasSearched(true);

    try {
      const searchResults = await bibleSearchService.search({
        query: query.trim(),
        translation,
        testament,
        maxResults: 200,
        signal: controller.signal,
        onProgress: (searched, total) => setProgress({ searched, total }),
      });
      if (!controller.signal.aborted) {
        setResults(searchResults);
      }
    } catch (e) {
      // Cancelled or error
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, [query, translation, testament]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleResultClick = (result: SearchResult) => {
    onNavigate(result.bookId, result.chapter, [result.verse]);
    onClose();
  };

  const highlightMatch = (text: string, q: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}<mark className="bg-yellow-200 px-0.5 rounded">{match}</mark>{after}
      </>
    );
  };

  const downloadPct = downloadStatus
    ? Math.round((downloadStatus.downloaded / downloadStatus.total) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Bible Search</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search the Bible..."
            className="flex-1 px-3 py-2 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mt-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="opacity-75">Range:</span>
            {(['all', 'ot', 'nt'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTestament(t)}
                className={`px-2 py-0.5 rounded ${testament === t ? 'bg-white/30 font-bold' : 'hover:bg-white/10'}`}
              >
                {t === 'all' ? 'All' : t === 'ot' ? 'OT' : 'NT'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="opacity-75">Lang:</span>
            {(['both', 'cuv', 'web'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTranslation(t)}
                className={`px-2 py-0.5 rounded ${translation === t ? 'bg-white/30 font-bold' : 'hover:bg-white/10'}`}
              >
                {t === 'both' ? 'Both' : t === 'cuv' ? '中文' : 'English'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Download status */}
      {downloadStatus && downloadStatus.downloaded < downloadStatus.total && (
        <div className="px-4 py-2 bg-amber-50 border-b text-xs text-amber-800 flex items-center gap-2">
          <span>Bible {downloadPct}% downloaded ({downloadStatus.downloaded}/{downloadStatus.total} chapters)</span>
          {onDownloadBible && (
            <button onClick={onDownloadBible} className="px-2 py-0.5 bg-amber-200 hover:bg-amber-300 rounded text-amber-900 font-medium">
              Download All
            </button>
          )}
        </div>
      )}

      {/* Progress bar */}
      {isSearching && progress.total > 0 && (
        <div className="h-1 bg-slate-200">
          <div
            className="h-full bg-blue-500 transition-all duration-200"
            style={{ width: `${(progress.searched / progress.total) * 100}%` }}
          />
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!hasSearched && !isSearching && (
          <div className="p-8 text-center text-slate-400 text-sm">
            Enter a keyword to search across the Bible
          </div>
        )}

        {hasSearched && !isSearching && results.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm">
            No results found for "{query}"
          </div>
        )}

        {results.length > 0 && (
          <div className="p-2">
            <div className="text-xs text-slate-500 px-2 py-1">
              {results.length} result{results.length > 1 ? 's' : ''} found
            </div>
            {results.map((r, i) => (
              <button
                key={`${r.bookId}-${r.chapter}-${r.verse}-${r.translation}-${i}`}
                onClick={() => handleResultClick(r)}
                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 rounded-lg transition-colors mb-0.5"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-blue-600 whitespace-nowrap">
                    {r.bookName} {r.chapter}:{r.verse}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase">{r.translation}</span>
                </div>
                <div className="text-sm text-slate-700 mt-0.5 line-clamp-2">
                  {highlightMatch(r.text, query)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BibleSearch;

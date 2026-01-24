import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Verse, Book, SelectionInfo } from '../types';
import { BIBLE_BOOKS } from '../constants';
import { toSimplified, toTraditional } from '../services/chineseConverter';
import { BibleCacheService } from '../services/bibleCache';

interface BibleViewerProps {
  onSelectionChange: (info: SelectionInfo) => void;
  onVersesSelectedForChat: (text: string) => void;
  notes: Record<string, string>;
}

const BibleViewer: React.FC<BibleViewerProps> = ({ onSelectionChange, onVersesSelectedForChat, notes }) => {
  const [selectedBook, setSelectedBook] = useState<Book>(BIBLE_BOOKS[0]);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [leftVerses, setLeftVerses] = useState<Verse[]>([]);
  const [rightVerses, setRightVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSimplified, setIsSimplified] = useState(() => {
    const saved = localStorage.getItem('bibleChineseMode');
    return saved === 'simplified';
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const cacheService = useRef(new BibleCacheService()).current;
  
  const [vSplitOffset, setVSplitOffset] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // Touch/swipe support
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  
  // Pagination support for non-touch
  const [showPagination, setShowPagination] = useState(false);

  useEffect(() => {
    // Detect touch device
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(hasTouch);
    setShowPagination(!hasTouch);
  }, []);

  useEffect(() => {
    fetchChapter();
  }, [selectedBook, selectedChapter]);

  const fetchChapter = async () => {
    setLoading(true);
    setError(null);
    try {
      // Try to get from cache first
      const cachedCuv = await cacheService.getChapter(selectedBook.id, selectedChapter, 'cuv');
      const cachedWeb = await cacheService.getChapter(selectedBook.id, selectedChapter, 'web');
      
      if (cachedCuv && cachedWeb) {
        setLeftVerses(cachedCuv.verses);
        setRightVerses(cachedWeb.verses);
      } else {
        // Fetch from API if not cached
        const cuvRes = await fetch(`https://bible-api.com/${selectedBook.id}${selectedChapter}?translation=cuv`);
        const cuvData = await cuvRes.json();
        const engRes = await fetch(`https://bible-api.com/${selectedBook.id}${selectedChapter}?translation=web`);
        const engData = await engRes.json();
        
        if (cuvData?.verses && engData?.verses) {
          setLeftVerses(cuvData.verses);
          setRightVerses(engData.verses);
          // Cache the fetched data
          await cacheService.cacheChapter(selectedBook.id, selectedChapter, 'cuv', cuvData);
          await cacheService.cacheChapter(selectedBook.id, selectedChapter, 'web', engData);
        } else {
          setError("无法加载经文内容。");
        }
      }
      setSelectedVerses([]);
    } catch (err) {
      setError("连接圣经服务器时出错。");
    } finally {
      setLoading(false);
    }
  };

  const toggleChineseMode = () => {
    const newMode = !isSimplified;
    setIsSimplified(newMode);
    localStorage.setItem('bibleChineseMode', newMode ? 'simplified' : 'traditional');
  };

  const handleDownloadBible = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      await cacheService.downloadWholeBible((progress) => {
        setDownloadProgress(progress);
      });
      alert('圣经已成功下载供离线使用！');
    } catch (err) {
      alert('下载失败，请重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const processChineseText = (text: string): string => {
    return isSimplified ? toSimplified(text) : text;
  };

  const notifySelection = useCallback((verseNums: number[], manualText?: string) => {
    const id = verseNums.length > 0 
      ? `${selectedBook.id}:${selectedChapter}:${verseNums[0]}`
      : `${selectedBook.id}:${selectedChapter}`;
    
    let fullText = "";
    if (manualText) {
      fullText = manualText;
    } else if (verseNums.length > 0) {
      fullText = verseNums.map(vNum => {
        const leftV = leftVerses.find(v => v.verse === vNum);
        const rightV = rightVerses.find(v => v.verse === vNum);
        return `[${selectedBook.name} ${selectedChapter}:${vNum}]\n和合本: ${leftV?.text || ''}\nWEB: ${rightV?.text || ''}`;
      }).join('\n\n');
    }

    onSelectionChange({
      bookId: selectedBook.id,
      bookName: selectedBook.name,
      chapter: selectedChapter,
      verseNums,
      id,
      selectedRawText: fullText
    });

    onVersesSelectedForChat(fullText);
  }, [selectedBook, selectedChapter, leftVerses, rightVerses, onSelectionChange, onVersesSelectedForChat]);

  const handleVerseClick = (verseNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;

    const newSelection = [verseNum];
    setSelectedVerses(newSelection);
    notifySelection(newSelection);
  };

  const handleEmptySpaceClick = (e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;

    const allVerses = leftVerses.map(v => v.verse);
    setSelectedVerses(allVerses);
    notifySelection(allVerses);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0) {  // Fixed: Changed from > 1 to > 0
      const anchorVerses = selectedVerses.length > 0 ? selectedVerses : [1];
      notifySelection(anchorVerses, text);
    }
  };

  const handleScroll = (source: 'left' | 'right') => {
    const src = source === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const dest = source === 'left' ? rightScrollRef.current : leftScrollRef.current;
    if (src && dest) {
      dest.scrollTop = src.scrollTop;
    }
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const percentage = ((e.clientX - rect.left) / rect.width) * 100;
      if (percentage > 20 && percentage < 80) setVSplitOffset(percentage);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Touch handlers for swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      navigateNext();
    }
    if (isRightSwipe) {
      navigatePrevious();
    }
  };

  const navigateNext = () => {
    if (selectedChapter < (selectedBook.chapters || 1)) {
      setSelectedChapter(selectedChapter + 1);
    } else {
      // Move to next book
      const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
      if (currentIndex < BIBLE_BOOKS.length - 1) {
        setSelectedBook(BIBLE_BOOKS[currentIndex + 1]);
        setSelectedChapter(1);
      }
    }
  };

  const navigatePrevious = () => {
    if (selectedChapter > 1) {
      setSelectedChapter(selectedChapter - 1);
    } else {
      // Move to previous book
      const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
      if (currentIndex > 0) {
        const prevBook = BIBLE_BOOKS[currentIndex - 1];
        setSelectedBook(prevBook);
        setSelectedChapter(prevBook.chapters || 1);
      }
    }
  };

  const hasNoteMark = (verseNum: number) => {
    const id = `${selectedBook.id}:${selectedChapter}:${verseNum}`;
    return !!notes[id];
  };

  const canNavigatePrev = () => {
    return selectedChapter > 1 || BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id) > 0;
  };

  const canNavigateNext = () => {
    return selectedChapter < (selectedBook.chapters || 1) || 
           BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id) < BIBLE_BOOKS.length - 1;
  };

  return (
    <div 
      className="h-full flex flex-col bg-white overflow-hidden select-text" 
      ref={containerRef} 
      onClick={handleEmptySpaceClick}
      onMouseUp={handleMouseUp}
      onTouchStart={isTouchDevice ? handleTouchStart : undefined}
      onTouchMove={isTouchDevice ? handleTouchMove : undefined}
      onTouchEnd={isTouchDevice ? handleTouchEnd : undefined}
    >
      <div className="flex items-center justify-between p-3 border-b bg-slate-50 sticky top-0 z-10 shrink-0 shadow-sm" onClick={e => e.stopPropagation()}>
        <div className="flex gap-2">
          <select 
            className="p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium"
            value={selectedBook.id}
            onChange={(e) => {
              const book = BIBLE_BOOKS.find(b => b.id === e.target.value);
              if (book) { setSelectedBook(book); setSelectedChapter(1); }
            }}
          >
            {BIBLE_BOOKS.map(book => <option key={book.id} value={book.id}>{book.name}</option>)}
          </select>
          <select 
            className="p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium w-24"
            value={selectedChapter}
            onChange={(e) => setSelectedChapter(Number(e.target.value))}
          >
            {Array.from({ length: selectedBook.chapters || 1 }, (_, i) => i + 1).map(num => (
              <option key={num} value={num}>第 {num} 章</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleChineseMode}
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 hover:border-indigo-300 transition-colors shadow-sm"
            title="切换简繁体"
          >
            <span className="text-xs font-medium text-slate-600">{isSimplified ? '简' : '繁'}</span>
          </button>
          <button
            onClick={handleDownloadBible}
            disabled={isDownloading}
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 hover:border-indigo-300 transition-colors shadow-sm disabled:opacity-50"
            title="下载圣经供离线使用"
          >
            {isDownloading ? (
              <>
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-medium text-slate-600">{downloadProgress}%</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <span className="text-xs font-medium text-slate-600">离线</span>
              </>
            )}
          </button>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">
            {selectedVerses.length === leftVerses.length && leftVerses.length > 0 ? '已选全章' : (selectedVerses.length > 0 ? `已选 ${selectedVerses.length} 节` : '点击经文或高亮文字')}
          </div>
          <div className="h-4 w-[1px] bg-slate-200 hidden sm:block"></div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
             <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
             <span className="text-[10px] font-bold text-slate-500">智能研读</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div 
          ref={leftScrollRef}
          onScroll={() => handleScroll('left')}
          className="overflow-y-auto p-4 md:p-6 space-y-4 font-serif-sc border-r border-slate-100"
          style={{ width: `${vSplitOffset}%` }}
        >
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">和合本 CUV</div>
          {loading ? (
            <div className="animate-pulse space-y-4">
              {[1,2,3,4,5].map(n => <div key={n} className="h-4 bg-slate-100 rounded w-full"></div>)}
            </div>
          ) : (
            leftVerses.map(v => (
              <div 
                key={`left-${v.verse}`}
                onClick={(e) => handleVerseClick(v.verse, e)}
                className={`p-2.5 rounded-lg transition-all border relative ${
                  selectedVerses.includes(v.verse) ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <span className="text-indigo-500 font-bold mr-3 text-xs">{v.verse}</span>
                <span className="text-lg leading-relaxed text-slate-800">{processChineseText(v.text)}</span>
                {hasNoteMark(v.verse) && (
                  <div className="absolute top-1 right-1 text-amber-500" title="已有笔记">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14h-4v-2h4v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div 
          onMouseDown={startResizing}
          className={`w-1.5 h-full cursor-col-resize z-20 transition-colors flex items-center justify-center ${isResizing ? 'bg-indigo-500' : 'bg-slate-200 hover:bg-indigo-400'}`}
        >
          <div className="h-8 w-0.5 bg-white/50 rounded-full"></div>
        </div>

        <div 
          ref={rightScrollRef}
          onScroll={() => handleScroll('right')}
          className="overflow-y-auto p-4 md:p-6 space-y-4 font-sans"
          style={{ width: `${100 - vSplitOffset}%` }}
        >
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">English (WEB)</div>
          {loading ? (
            <div className="animate-pulse space-y-4">
              {[1,2,3,4,5].map(n => <div key={n} className="h-4 bg-slate-100 rounded w-full"></div>)}
            </div>
          ) : (
            rightVerses.map(v => (
              <div 
                key={`right-${v.verse}`}
                onClick={(e) => handleVerseClick(v.verse, e)}
                className={`p-2.5 rounded-lg transition-all border ${
                  selectedVerses.includes(v.verse) ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <span className="text-indigo-400 font-bold mr-3 text-xs">{v.verse}</span>
                <span className="text-base leading-relaxed text-slate-700 italic">{v.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pagination controls for non-touch devices */}
      {showPagination && (
        <div className="flex items-center justify-between p-3 border-t bg-slate-50">
          <button
            onClick={navigatePrevious}
            disabled={!canNavigatePrev()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">上一章</span>
          </button>
          
          <div className="text-sm text-slate-500 font-medium">
            {selectedBook.name} {selectedChapter}章
          </div>

          <button
            onClick={navigateNext}
            disabled={!canNavigateNext()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="text-sm font-medium">下一章</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Touch hint for mobile devices */}
      {isTouchDevice && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1.5 rounded-full text-xs pointer-events-none animate-pulse">
          左右滑动切换章节
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50">
          <div className="p-6 bg-white rounded-xl shadow-xl border border-red-100 text-center">
            <p className="text-red-500 font-bold mb-4">{error}</p>
            <button onClick={fetchChapter} className="px-6 py-2 bg-indigo-600 text-white rounded-full">重试</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BibleViewer;
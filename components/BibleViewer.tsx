import { buildChapterUrl } from '../services/apiConfig';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { Verse, Book, SelectionInfo } from '../types';
import { BIBLE_BOOKS } from '../constants';
import { parseBibleReference } from '../services/bibleBookData';
import { toSimplified } from '../services/chineseConverter';
import { bibleStorage, BibleTranslation } from '../services/bibleStorage';
import { readingHistory } from '../services/readingHistory';
import { verseDataStorage } from '../services/verseDataStorage';
import { bookmarkStorage } from '../services/bookmarkStorage';
import { searchCachedChapters, searchNotesAndResearch, searchCurrentChapter } from '../services/bibleTextSearch';
import { ReadingHistory } from './ReadingHistory';
import VerseIndicators from './VerseIndicators';
import ContextMenu from './ContextMenu';
import { useSeasonTheme } from '../hooks/useSeasonTheme';
import { COLOR_PRESETS } from './InlineBibleAnnotation';
import { useDebounce } from '../hooks/useDebounce';
import { useBibleSettings } from '../hooks/useBibleSettings';
import { useDownloadState } from '../hooks/useDownloadState';
import { useAnnotationState } from '../hooks/useAnnotationState';
import { useSwipeNavigation } from '../hooks/useSwipeNavigation';
import { useBibleDownload } from '../hooks/useBibleDownload';
import { useBibleContextMenu } from '../hooks/useBibleContextMenu';
import AnnotationToolbar from './AnnotationToolbar';
import BibleSearchPanel from './BibleSearchPanel';
import BibleHeader from './BibleHeader';
import BibleVersePanel from './BibleVersePanel';

interface BibleViewerProps {
  onSelectionChange?: (info: SelectionInfo) => void;
  onVersesSelectedForChat: (text: string, clearChat?: boolean) => void;
  notes: Record<string, string>;
  researchUpdateTrigger?: number;
  onContextChange?: (bookId: string, chapter: number) => void;
  onVersesSelected?: (verses: number[]) => void;
  sidebarOpen?: boolean;
  showSidebarToggle?: boolean;
  onSidebarToggle?: () => void;
  isIPhone?: boolean;
  onDownloadStateChange?: (isDownloading: boolean, progress: number, status?: string, timeRemaining?: string) => void;
  onDownloadFunctionsReady?: (downloadBible: () => void, downloadChapter: () => void, downloadBook: () => void) => void;
  initialBookId?: string;
  initialChapter?: number;
  navigateTo?: { bookId: string; chapter: number; verses?: number[] } | null;
  onLayoutChange?: (splitOffset: number, bottomSplitOffset: number) => void;
  vibeClassName?: string;
  vibeVerseClassName?: string;
}

const BibleViewer: React.FC<BibleViewerProps> = ({ 
  onSelectionChange, 
  onVersesSelectedForChat, 
  notes, 
  researchUpdateTrigger = 0,
  onContextChange,
  onVersesSelected,
  sidebarOpen = false,
  showSidebarToggle = true,
  onSidebarToggle,
  isIPhone = false,
  onDownloadStateChange,
  onDownloadFunctionsReady,
  initialBookId,
  initialChapter,
  navigateTo,
  onLayoutChange,
  vibeClassName,
  vibeVerseClassName
}) => {
  const { theme } = useSeasonTheme();
  
  const [selectedBook, setSelectedBook] = useState<Book>(() => {
    if (initialBookId) {
      const book = BIBLE_BOOKS.find(b => b.id === initialBookId);
      if (book) return book;
    }
    return BIBLE_BOOKS[0];
  });
  const [selectedChapter, setSelectedChapter] = useState(initialChapter || 1);
  const [leftVerses, setLeftVerses] = useState<Verse[]>([]);
  const [rightVerses, setRightVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { isSimplified, setIsSimplified, englishVersion, setEnglishVersion, fontSize, setFontSize } = useBibleSettings();
  const {
    isDownloading, setIsDownloading,
    downloadProgress, setDownloadProgress,
    downloadStatus, setDownloadStatus,
    downloadStartTime, setDownloadStartTime,
    downloadTimeRemaining, setDownloadTimeRemaining,
    isOffline, setIsOffline,
    showDownloadMenu, setShowDownloadMenu,
    offlineChapters, setOfflineChapters,
    autoDownloadInProgress, setAutoDownloadInProgress,
    downloadCancelRef,
  } = useDownloadState();
  
  // Book search state
  const [bookSearchTerm, setBookSearchTerm] = useState('');
  const [showBookDropdown, setShowBookDropdown] = useState(false);
  const bookSearchRef = useRef<HTMLDivElement>(null);
  
  // Mobile menu state
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  
  const [vSplitOffset, setVSplitOffset] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VIEW_LAYOUT);
    if (saved !== null) return parseInt(saved);
    // On iPhone/iPad: default to Chinese-only (100%). Desktop: bilingual (50%)
    const isMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isMobile ? 100 : 50;
  });
  const [isResizing, setIsResizing] = useState(false);
  
  // Persist bilingual layout preference
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VIEW_LAYOUT, vSplitOffset.toString());
  }, [vSplitOffset]);

  const containerRef = useRef<HTMLDivElement>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // Track panel widths for annotation scaling
  const [leftPanelWidth, setLeftPanelWidth] = useState(0);
  const [rightPanelWidth, setRightPanelWidth] = useState(0);

  // Reading history state
  const [showReadingHistory, setShowReadingHistory] = useState(false);
  const [chaptersWithContent, setChaptersWithContent] = useState<{
    withNotes: Set<number>;
    withResearch: Set<number>;
  }>({ withNotes: new Set(), withResearch: new Set() });
  const [verseData, setVerseData] = useState<Record<string, { hasNote: boolean; hasResearch: boolean; notePreview?: string; researchCount?: number }>>({});
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    selectedText: string;
    verseInfo?: {
      bookId: string;
      bookName: string;
      chapter: number;
      verseNum: number;
      fullVerseText: string;
    };
  } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Bookmark state
  const [bookmarkedVerses, setBookmarkedVerses] = useState<Set<string>>(new Set());

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    bookId: string;
    bookName: string;
    chapter: number;
    verse: number;
    text: string;
    translation: string;
  }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // iOS two-step text selection state (isolated)
  const [iosTextSelectionReady, setIosTextSelectionReady] = useState(false);

  // ── Annotation mode state (via hook) ──────────────────────────────────
  const [leftPanelContentHeight, setLeftPanelContentHeight] = useState(0);
  const [rightPanelContentHeight, setRightPanelContentHeight] = useState(0);
  const leftContentMeasureRef = useRef<HTMLDivElement>(null);
  const rightContentMeasureRef = useRef<HTMLDivElement>(null);

  const {
    isAnnotationMode, setIsAnnotationMode,
    annotationTool, annotationColor, setAnnotationColor,
    annotationSize, setAnnotationSize,
    showAnnotationColorPicker, setShowAnnotationColorPicker,
    isAnnotationToolbarCollapsed, setIsAnnotationToolbarCollapsed,
    annotationOriginalLayout,
    chineseAnnotationRef, englishAnnotationRef,
    selectAnnotationTool,
    handleAlignmentMismatch, handleRestoreAlignment,
    handleAnnotationUndo, handleAnnotationClearAll,
    annotationToolState,
    paperType, setPaperType,
  } = useAnnotationState(setFontSize, setVSplitOffset, selectedBook.id, selectedChapter);

  // ── Swipe navigation (via hook) ────────────────────────────────────────
  const navigateChapterRef = useRef<(dir: 'prev' | 'next') => void>(() => {});
  const {
    isSwiping, swipeOffset,
    isPageFlipping, setIsPageFlipping,
    flipDirection, setFlipDirection,
    nextChapterVerses, setNextChapterVerses,
    prevChapterVerses, setPrevChapterVerses,
    handleTouchStart, handleTouchMove, handleTouchEnd,
  } = useSwipeNavigation((dir) => navigateChapterRef.current(dir));

  // Memoize computed values to prevent unnecessary recalculations
  const allVerseNumbers = useMemo(() => {
    return leftVerses.map(v => v.verse);
  }, [leftVerses]);
  
  const allVersesSelected = useMemo(() => {
    return selectedVerses.length === leftVerses.length && leftVerses.length > 0;
  }, [selectedVerses, leftVerses]);
  
  // Better iOS detection that works for modern iPads
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Debounce book search term to avoid filtering on every keystroke
  const debouncedBookSearchTerm = useDebounce(bookSearchTerm, 300);

  // ── Measure content heights for annotation canvas sizing ──────────────
  useEffect(() => {
    const measure = () => {
      if (leftContentMeasureRef.current) {
        setLeftPanelContentHeight(leftContentMeasureRef.current.scrollHeight);
      }
      if (rightContentMeasureRef.current) {
        setRightPanelContentHeight(rightContentMeasureRef.current.scrollHeight);
      }
    };
    // Measure after verses render
    const timer = setTimeout(measure, 100);
    return () => clearTimeout(timer);
  }, [leftVerses, rightVerses, fontSize, isSimplified]);

  // ── Track panel widths for annotation scaling on resize ──────────────
  useEffect(() => {
    const measureWidths = () => {
      if (leftScrollRef.current) setLeftPanelWidth(leftScrollRef.current.clientWidth);
      if (rightScrollRef.current) setRightPanelWidth(rightScrollRef.current.clientWidth);
    };
    measureWidths();
    const observer = new ResizeObserver(measureWidths);
    if (leftScrollRef.current) observer.observe(leftScrollRef.current);
    if (rightScrollRef.current) observer.observe(rightScrollRef.current);
    return () => observer.disconnect();
  }, []);

  // Disable page-flip swiping when annotation mode is active
  const handleAnnotationTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnnotationMode) {
      // In annotation mode, only allow two-finger scroll
      if (e.touches.length < 2) {
        e.stopPropagation(); // Prevent page-flip swipe handler
      }
    }
  }, [isAnnotationMode]);

  // Notify parent when book or chapter changes
  useEffect(() => {
    if (onContextChange) {
      onContextChange(selectedBook.id, selectedChapter);
    }
  }, [selectedBook.id, selectedChapter, onContextChange]);

  // Notify parent when verse selection changes
  useEffect(() => {
    if (onVersesSelected) {
      onVersesSelected(selectedVerses);
    }
  }, [selectedVerses, onVersesSelected]);

  // Handle external navigation requests
  useEffect(() => {
    if (navigateTo) {
      const book = BIBLE_BOOKS.find(b => b.id === navigateTo.bookId);
      if (book) {
        setSelectedBook(book);
        setSelectedChapter(navigateTo.chapter);
        // If specific verses are provided, select them and scroll to verse
        if (navigateTo.verses && navigateTo.verses.length > 0) {
          setSelectedVerses(navigateTo.verses);
          // Scroll to the verse after content loads - retry until found
          const verseNum = navigateTo.verses[0];
          let attempts = 0;
          const maxAttempts = 10; // Try for up to 3 seconds
          const tryScroll = () => {
            attempts++;
            // Search within the Bible viewer scroll containers, not the whole page
            let targetEl: HTMLElement | null = null;
            const containers = [leftScrollRef.current, rightScrollRef.current].filter(Boolean);
            for (const container of containers) {
              if (!container) continue;
              const el = container.querySelector(`[data-verse="${verseNum}"]`) as HTMLElement | null;
              if (el) {
                targetEl = el;
                break;
              }
            }
            if (targetEl) {
              // Scroll both panels to the verse
              for (const container of containers) {
                if (!container) continue;
                const el = container.querySelector(`[data-verse="${verseNum}"]`) as HTMLElement | null;
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  // Brief highlight effect
                  el.style.transition = 'background-color 0.3s';
                  el.style.backgroundColor = theme.verseHighlight;
                  setTimeout(() => {
                    el.style.backgroundColor = '';
                  }, 2000);
                }
              }
            } else if (attempts < maxAttempts) {
              // Verse element not in DOM yet, retry
              setTimeout(tryScroll, 300);
            } else {
              // silently handle — verse not found in DOM after retries
            }
          };
          setTimeout(tryScroll, 500);
        }
      } else {
        // silently handle — unknown bookId
      }
    }
  }, [navigateTo]);

  // Load chapters with content when book changes
  useEffect(() => {
    const loadChaptersWithContent = async () => {
      const content = await readingHistory.getChaptersWithContent(selectedBook.id);
      setChaptersWithContent(content);
    };
    loadChaptersWithContent();
  }, [selectedBook.id]);
  
  // Load verse data for current chapter
  useEffect(() => {
    let stale = false;
    const loadVerseData = async () => {
      // Single DB query for all verse data in this chapter
      const chapterDataMap = await verseDataStorage.getChapterData(selectedBook.id, selectedChapter);
      if (stale) return;

      const data: Record<string, { hasNote: boolean; hasResearch: boolean; notePreview?: string; researchCount?: number }> = {};
      const allVerseNums = new Set<number>();
      for (const v of leftVerses) allVerseNums.add(v.verse);
      for (const v of rightVerses) allVerseNums.add(v.verse);

      for (const verseNum of allVerseNums) {
        const verseId = `${selectedBook.id}:${selectedChapter}:${verseNum}`;
        const verseInfo = chapterDataMap.get(verseId) || null;

        const hasNote = !!verseInfo?.personalNote?.text || !!notes[verseId];
        const hasResearch = !!verseInfo?.aiResearch && verseInfo.aiResearch.length > 0;

        let notePreviewText = '';
        if (verseInfo?.personalNote?.text) {
          notePreviewText = verseInfo.personalNote.text;
        } else if (notes[verseId]) {
          notePreviewText = notes[verseId];
        } else if (verseInfo?.aiResearch && verseInfo.aiResearch.length > 0) {
          const latestResearch = verseInfo.aiResearch[0];
          notePreviewText = `Q: ${latestResearch.query}\nA: ${latestResearch.response}`;
        }

        data[verseId] = {
          hasNote,
          hasResearch,
          notePreview: notePreviewText || undefined,
          researchCount: verseInfo?.aiResearch?.length || 0
        };
      }

      setVerseData(data);
    };

    if (leftVerses.length > 0 || rightVerses.length > 0) {
      loadVerseData();
    }
    return () => { stale = true; };
  }, [leftVerses, rightVerses, selectedBook.id, selectedChapter, notes, researchUpdateTrigger]);

  // Load bookmarked verses for current chapter
  useEffect(() => {
    const loadBookmarks = async () => {
      const allBookmarks = await bookmarkStorage.getAllBookmarks();
      const currentChapterBookmarks = new Set<string>();
      for (const bm of allBookmarks) {
        if (bm.bookId === selectedBook.id && bm.chapter === selectedChapter) {
          currentChapterBookmarks.add(bm.id);
        }
      }
      setBookmarkedVerses(currentChapterBookmarks);
    };
    loadBookmarks();
  }, [selectedBook.id, selectedChapter]);

  // Focus search input when search panel opens
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Search function - searches through cached/downloaded chapters
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    // Check if the query is a Bible reference (e.g., "诗篇95:11" or "Psalm 95:11")
    const bibleRef = parseBibleReference(query.trim());
    if (bibleRef) {
      // Navigate directly to the reference instead of doing a text search
      const book = BIBLE_BOOKS.find(b => b.id === bibleRef.bookId);
      if (book) {
        setSelectedBook(book);
        setSelectedChapter(bibleRef.chapter);
        if (bibleRef.verses && bibleRef.verses.length > 0) {
          setSelectedVerses(bibleRef.verses);
          // Scroll to verse after navigation
          setTimeout(() => {
            const verseNum = bibleRef.verses![0];
            const targetEl = document.querySelector(`[data-verse="${verseNum}"]`) as HTMLElement | null;
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              targetEl.style.transition = 'background-color 0.3s';
              targetEl.style.backgroundColor = theme.verseHighlight;
              setTimeout(() => {
                targetEl.style.backgroundColor = '';
              }, 2000);
            }
          }, 300);
        }
        setShowSearch(false); // Close search panel
        setSearchQuery(''); // Clear search query
        setSearchResults([]); // Clear results
        return;
      }
    }
    
    // If not a Bible reference, proceed with normal text search
    setIsSearching(true);
    try {
      const queryLower = query.toLowerCase();
      const querySimplified = toSimplified(queryLower);

      // Search cached Bible chapters
      const results = await searchCachedChapters(querySimplified, queryLower, englishVersion);

      // Search notes and AI research (isolated to avoid breaking Bible results)
      try {
        const noteResults = await searchNotesAndResearch(querySimplified, results);
        results.push(...noteResults);
      } catch (noteSearchError) {
        // silently handle — notes search is non-critical
      }

      // Search current chapter if not cached
      const offlineChapterSet = await bibleStorage.getAllOfflineChapters();
      if (!offlineChapterSet.has(`${selectedBook.id}_${selectedChapter}`)) {
        const currentResults = searchCurrentChapter(
          querySimplified, queryLower,
          leftVerses, rightVerses,
          selectedBook.id, selectedBook.name, selectedChapter,
          results,
        );
        results.push(...currentResults);
      }

      setSearchResults(results);
    } catch (error) {
      // TODO: use error reporting service
    } finally {
      setIsSearching(false);
    }
  }, [selectedBook, selectedChapter, leftVerses, rightVerses]);

  // Toggle bookmark for a verse
  const handleToggleBookmark = useCallback(async (verseNum: number, verseText: string) => {
    const id = `${selectedBook.id}:${selectedChapter}:${verseNum}`;
    const wasBookmarked = bookmarkedVerses.has(id);
    
    await bookmarkStorage.toggleBookmark({
      id,
      bookId: selectedBook.id,
      bookName: selectedBook.name,
      chapter: selectedChapter,
      verse: verseNum,
      textPreview: verseText.substring(0, 80),
    });
    
    setBookmarkedVerses(prev => {
      const next = new Set(prev);
      if (wasBookmarked) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [selectedBook, selectedChapter, bookmarkedVerses]);

  // No need for mode-specific text selection clearing anymore

  useEffect(() => {
    const ctrl = { cancelled: false };
    fetchChapterGuarded(ctrl);
    // Always preload adjacent chapters for smooth navigation
    // Preload next chapter
    if (selectedChapter < (selectedBook.chapters || 1)) {
      fetchChapterData(selectedBook.id, selectedChapter + 1).then(data => {
        if (!ctrl.cancelled && data) setNextChapterVerses(data.left);
      });
    } else {
      // Next book first chapter
      const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
      if (currentIndex < BIBLE_BOOKS.length - 1) {
        const nextBook = BIBLE_BOOKS[currentIndex + 1];
        fetchChapterData(nextBook.id, 1).then(data => {
          if (!ctrl.cancelled && data) setNextChapterVerses(data.left);
        });
      }
    }

    // Preload previous chapter
    if (selectedChapter > 1) {
      fetchChapterData(selectedBook.id, selectedChapter - 1).then(data => {
        if (!ctrl.cancelled && data) setPrevChapterVerses(data.left);
      });
    } else {
      // Previous book last chapter
      const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
      if (currentIndex > 0) {
        const prevBook = BIBLE_BOOKS[currentIndex - 1];
        fetchChapterData(prevBook.id, prevBook.chapters || 1).then(data => {
          if (!ctrl.cancelled && data) setPrevChapterVerses(data.left);
        });
      }
    }

    // Track reading history
    readingHistory.saveLastRead(selectedBook.id, selectedBook.name, selectedChapter);

    // Check if current chapter has notes
    const chapterHasNotes = Object.keys(notes).some(noteId =>
      noteId.startsWith(`${selectedBook.id}:${selectedChapter}:`)
    );

    readingHistory.addToHistory(
      selectedBook.id,
      selectedBook.name,
      selectedChapter,
      chapterHasNotes,
      false  // hasAIResearch - will be updated separately when AI features are implemented
    );
    return () => { ctrl.cancelled = true; };
  }, [selectedBook, selectedChapter, notes, englishVersion]);
  
  // Handle clicking outside book dropdown and mobile menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bookSearchRef.current && !bookSearchRef.current.contains(event.target as Node)) {
        setShowBookDropdown(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize storage and check offline status on mount
  useEffect(() => {
    // Run initialization in background without blocking UI
    const timer = setTimeout(() => {
      initializeStorage();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  const initializeStorage = async () => {
    try {
      // Initialize storage in background
      await bibleStorage.init();
      // Check offline status after storage is ready
      await checkOfflineStatus();
      await checkAndStartAutoDownload();
    } catch (error) {
      // silently handle
    }
  };

  const checkOfflineStatus = async () => {
    try {
      const offline = await bibleStorage.getAllOfflineChapters();
      setOfflineChapters(offline);
    } catch (error) {
      // silently handle
    }
  };

  const checkAndStartAutoDownload = async () => {
    try {
      const hasDownloadProgress = await bibleStorage.getMetadata('download_progress');
      
      // Don't auto-download to avoid rate limiting
      // User can manually download if needed
      if (hasDownloadProgress && !isDownloading) {
      }
    } catch (error) {
      // silently handle
    }
  };

  // Helper function to fetch chapter data without setting loading state
  const fetchChapterData = async (bookId: string, chapter: number) => {
    // Always check cache first to avoid unnecessary API calls
    try {
      const cachedCuv = await bibleStorage.getChapter(bookId, chapter, 'cuv');
      const cachedWeb = await bibleStorage.getChapter(bookId, chapter, englishVersion as BibleTranslation);
      if (cachedCuv && cachedWeb && cachedCuv.verses && cachedWeb.verses) {
        return {
          left: cachedCuv.verses,
          right: cachedWeb.verses
        };
      }
    } catch {}
    
    // For preloading, don't fetch from network to avoid rate limiting
    // Only fetch when explicitly needed (in fetchChapter function)
    return null;
  };

  const fetchChapterGuarded = async (ctrl: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);

    // First, try to load from cache for instant display
    let loadedFromCache = false;
    try {
      const cachedCuv = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'cuv');
      const cachedWeb = await bibleStorage.getChapter(selectedBook.id, selectedChapter, englishVersion as BibleTranslation);

      if (ctrl.cancelled) return;
      if (cachedCuv && cachedWeb && cachedCuv.verses && cachedWeb.verses) {
        // Use cached data immediately for instant loading
        setLeftVerses(cachedCuv.verses);
        setRightVerses(cachedWeb.verses);
        loadedFromCache = true;
        setLoading(false);
        setError(null);

        // Try to update from network in background (don't show loading)
        // Only save to cache, don't update state (avoids unnecessary re-renders)
        fetch(buildChapterUrl(selectedBook.id, selectedChapter, 'cuv', selectedBook.totalVerses))
          .then(res => res.json())
          .then(data => {
            if (!ctrl.cancelled && data.verses) {
              bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'cuv', data).catch(() => {});
            }
          })
          .catch(() => {});

        fetch(buildChapterUrl(selectedBook.id, selectedChapter, englishVersion, selectedBook.totalVerses))
          .then(res => res.json())
          .then(data => {
            if (!ctrl.cancelled && data.verses) {
              bibleStorage.saveChapter(selectedBook.id, selectedChapter, englishVersion as BibleTranslation, data).catch(() => {});
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      // silently handle
    }

    // If not loaded from cache, try to fetch from API
    if (!loadedFromCache) {
      try {
        const [cuvRes, engRes] = await Promise.all([
          fetch(buildChapterUrl(selectedBook.id, selectedChapter, 'cuv', selectedBook.totalVerses)),
          fetch(buildChapterUrl(selectedBook.id, selectedChapter, englishVersion, selectedBook.totalVerses))
        ]);

        if (ctrl.cancelled) return;
        const [cuvData, engData] = await Promise.all([
          cuvRes.json(),
          engRes.json()
        ]);

        if (ctrl.cancelled) return;
        if (cuvData?.verses && engData?.verses) {
          setLeftVerses(cuvData.verses);
          setRightVerses(engData.verses);
          setIsOffline(false);

          // Save to IndexedDB in background (non-blocking)
          Promise.all([
            bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'cuv', cuvData),
            bibleStorage.saveChapter(selectedBook.id, selectedChapter, englishVersion as BibleTranslation, engData)
          ]).then(() => {
            checkOfflineStatus();
          }).catch(() => {});
        }
      } catch (fetchErr: unknown) {
        if (ctrl.cancelled) return;
        // If online fetch fails, try IndexedDB
        try {
          const cachedCuv = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'cuv');
          const cachedWeb = await bibleStorage.getChapter(selectedBook.id, selectedChapter, englishVersion as BibleTranslation);

          if (ctrl.cancelled) return;
          if (cachedCuv && cachedWeb) {
            setLeftVerses(cachedCuv.verses);
            setRightVerses(cachedWeb.verses);
            setIsOffline(true);
          } else {
            setLeftVerses([]);
            setRightVerses([]);
            setError(`无法加载 ${selectedBook.name} 第 ${selectedChapter} 章。请检查网络连接。`);
          }
        } catch (storageErr) {
          // TODO: use error reporting service
          if (!ctrl.cancelled) {
            setLeftVerses([]);
            setRightVerses([]);
          }
        }
      } finally {
        if (!ctrl.cancelled) {
          setSelectedVerses([]);
          setLoading(false);
        }
      }
    }
  };

  // Unguarded version for manual retries (not called from useEffect)
  const fetchChapter = () => fetchChapterGuarded({ cancelled: false });

  const toggleChineseMode = () => {
    const newMode = !isSimplified;
    setIsSimplified(newMode);
    localStorage.setItem(STORAGE_KEYS.CHINESE_MODE, newMode ? 'simplified' : 'traditional');
  };

  const adjustFontSize = (delta: number) => {
    const newSize = Math.min(Math.max(fontSize + delta, 12), 36);
    setFontSize(newSize);
    localStorage.setItem(STORAGE_KEYS.FONT_SIZE, newSize.toString());
  };

  const processChineseText = (text: string): string => {
    return isSimplified ? toSimplified(text) : text;
  };
  
  // Filter books based on debounced search term (prevents filtering on every keystroke)
  const filteredBooks = useMemo(() => 
    BIBLE_BOOKS.filter(book => 
      book.name.toLowerCase().includes(debouncedBookSearchTerm.toLowerCase()) ||
      book.id.toLowerCase().includes(debouncedBookSearchTerm.toLowerCase())
    ),
    [debouncedBookSearchTerm]
  );

  const { handleDownloadCurrentChapter, handleDownloadCurrentBook, handleDownloadBible, handleAutoDownloadBible, handleResumeDownload } = useBibleDownload({
    selectedBookId: selectedBook.id,
    selectedBookName: selectedBook.name,
    selectedBookTotalVerses: selectedBook.totalVerses,
    selectedBookChapters: selectedBook.chapters,
    selectedChapter,
    englishVersion,
    isDownloading,
    setIsDownloading,
    downloadProgress,
    setDownloadProgress,
    setDownloadStatus,
    setDownloadStartTime,
    setDownloadTimeRemaining,
    setIsOffline,
    setShowDownloadMenu,
    setOfflineChapters,
    setAutoDownloadInProgress,
    autoDownloadInProgress,
    downloadStartTime,
    downloadStatus,
    downloadTimeRemaining,
    downloadCancelRef,
    onDownloadStateChange,
    onDownloadFunctionsReady,
  });

  const { notifySelection, handleVerseClick, handleMouseUp, handleIOSTouchEnd, handleTextSelection, handleContextMenuAction, handleSelectFromHistory } = useBibleContextMenu({
    selectedBook,
    selectedChapter,
    leftVerses,
    rightVerses,
    selectedVerses,
    setSelectedVerses,
    contextMenu,
    setContextMenu,
    isTransitioning,
    setIsTransitioning,
    iosTextSelectionReady,
    setIosTextSelectionReady,
    isIPhone,
    isIOS,
    englishVersion,
    onSelectionChange,
    onVersesSelectedForChat,
    setSelectedBook,
    setSelectedChapter,
    onLayoutChange,
  });

  const handleEmptySpaceClick = (e: React.MouseEvent) => {
    // Don't select all verses in research mode (text selection preferred)
    return;

    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;

    setSelectedVerses(allVerseNumbers);
    notifySelection(allVerseNumbers);
  };

  const handleScroll = (source: 'left' | 'right') => {
    const src = source === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const dest = source === 'left' ? rightScrollRef.current : leftScrollRef.current;
    if (src && dest) {
      dest.scrollTop = src.scrollTop;
    }
  };

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback((e: MouseEvent | TouchEvent) => {
    if (isResizing && panelContainerRef.current) {
      const rect = panelContainerRef.current.getBoundingClientRect();
      const clientX = 'clientX' in e ? e.clientX : e.touches[0]?.clientX || 0;
      const percentage = ((clientX - rect.left) / rect.width) * 100;
      if (percentage >= 0 && percentage <= 100) {
        setVSplitOffset(percentage);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    window.addEventListener('touchmove', resize);
    window.addEventListener('touchend', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const hasNoteMark = (verseNum: number) => {
    const id = `${selectedBook.id}:${selectedChapter}:${verseNum}`;
    return !!notes[id];
  };

  const navigateChapter = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (selectedChapter > 1) {
        setSelectedChapter(selectedChapter - 1);
      } else {
        const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
        if (currentIndex > 0) {
          const prevBook = BIBLE_BOOKS[currentIndex - 1];
          setSelectedBook(prevBook);
          setSelectedChapter(prevBook.chapters || 1);
        }
      }
    } else {
      if (selectedChapter < (selectedBook.chapters || 1)) {
        setSelectedChapter(selectedChapter + 1);
      } else {
        const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
        if (currentIndex < BIBLE_BOOKS.length - 1) {
          const nextBook = BIBLE_BOOKS[currentIndex + 1];
          setSelectedBook(nextBook);
          setSelectedChapter(1);
        }
      }
    }
    setSelectedVerses([]);
  };
  // Wire navigateChapterRef so useSwipeNavigation can call navigateChapter
  navigateChapterRef.current = navigateChapter;

  const canNavigatePrev = selectedChapter > 1 || BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id) > 0;
  const canNavigateNext = selectedChapter < (selectedBook.chapters || 1) || BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id) < BIBLE_BOOKS.length - 1;

  // Check if there's incomplete download
  const [hasIncompleteDownload, setHasIncompleteDownload] = useState(false);
  useEffect(() => {
    bibleStorage.getMetadata('download_progress').then(progress => {
      setHasIncompleteDownload(!!progress);
    });
  }, [isDownloading]);

  return (
    <div 
      className={`h-full flex flex-col overflow-hidden ${isTransitioning ? 'select-none' : ''} ${vibeClassName || ''}`}
      ref={containerRef}
      onClick={handleEmptySpaceClick}
      onMouseUp={handleMouseUp}
      onTouchEnd={isIOS ? handleIOSTouchEnd : undefined}
      style={{
        backgroundColor: vibeClassName ? undefined : theme.background,
        userSelect: isTransitioning ? 'none' : 'auto',
        WebkitUserSelect: isTransitioning ? 'none' : 'auto'
      }}
    >
      <BibleHeader
        selectedBook={selectedBook}
        selectedChapter={selectedChapter}
        canNavigatePrev={canNavigatePrev}
        canNavigateNext={canNavigateNext}
        onNavigateChapter={navigateChapter}
        bookSearchTerm={bookSearchTerm}
        showBookDropdown={showBookDropdown}
        filteredBooks={filteredBooks}
        bookSearchRef={bookSearchRef}
        onBookSearchTermChange={setBookSearchTerm}
        onBookDropdownOpen={() => { setShowBookDropdown(true); setBookSearchTerm(''); }}
        onBookSelect={(book) => { setSelectedBook(book); setSelectedChapter(1); setShowBookDropdown(false); setBookSearchTerm(''); }}
        offlineChapters={offlineChapters}
        chaptersWithContent={chaptersWithContent}
        onChapterChange={setSelectedChapter}
        fontSize={fontSize}
        onAdjustFontSize={adjustFontSize}
        isSimplified={isSimplified}
        onToggleChineseMode={toggleChineseMode}
        isOffline={isOffline}
        isDownloading={isDownloading}
        autoDownloadInProgress={autoDownloadInProgress}
        downloadProgress={downloadProgress}
        downloadTimeRemaining={downloadTimeRemaining}
        downloadStatus={downloadStatus}
        showDownloadMenu={showDownloadMenu}
        onStopDownload={() => {
          downloadCancelRef.current = true;
          setIsDownloading(false);
          setAutoDownloadInProgress(false);
          setDownloadStatus('');
          setDownloadTimeRemaining('');
          setDownloadProgress(0);
        }}
        onToggleDownloadMenu={() => setShowDownloadMenu(p => !p)}
        onDownloadCurrentChapter={handleDownloadCurrentChapter}
        onDownloadCurrentBook={handleDownloadCurrentBook}
        onDownloadBible={handleDownloadBible}
        isAnnotationMode={isAnnotationMode}
        onToggleAnnotationMode={() => setIsAnnotationMode(!isAnnotationMode)}
        showSearch={showSearch}
        onToggleSearch={() => setShowSearch(!showSearch)}
        onShowReadingHistory={() => setShowReadingHistory(true)}
        isIPhone={isIPhone}
        showMobileMenu={showMobileMenu}
        mobileMenuRef={mobileMenuRef}
        onToggleMobileMenu={() => setShowMobileMenu(p => !p)}
        sidebarOpen={sidebarOpen}
        showSidebarToggle={showSidebarToggle}
        onSidebarToggle={onSidebarToggle}
        allVersesSelected={allVersesSelected}
        selectedVersesCount={selectedVerses.length}
      />

      {/* Search Panel */}
      {showSearch && (
        <BibleSearchPanel
          searchQuery={searchQuery}
          searchResults={searchResults}
          isSearching={isSearching}
          onSearchChange={setSearchQuery}
          onSearch={handleSearch}
          onClose={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
          onResultClick={(result) => {
            const book = BIBLE_BOOKS.find(b => b.id === result.bookId);
            if (book) {
              setSelectedBook(book);
              setSelectedChapter(result.chapter);
              setSelectedVerses([result.verse]);
              setShowSearch(false);
              setSearchQuery('');
              setSearchResults([]);
            }
          }}
          inputRef={searchInputRef}
        />
      )}

      <div 
        ref={panelContainerRef}
        className="flex-1 flex overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Show next/previous page during swipe */}
        {isIOS && isSwiping && flipDirection && (
          <div 
            className="absolute inset-0 overflow-y-auto p-4 md:p-6 space-y-0.5 font-serif-sc"
            style={{
              transform: flipDirection === 'left' 
                ? `translateX(${window.innerWidth + swipeOffset}px)`
                : `translateX(${-window.innerWidth + swipeOffset}px)`,
              transition: isPageFlipping ? 'transform 0.3s ease-out' : 'none',
              zIndex: 5,
              backgroundColor: '#FDF8F0',
              boxShadow: '0 0 20px rgba(0,0,0,0.1)'
            }}
          >
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">和合本 CUV</div>
            {(flipDirection === 'left' ? nextChapterVerses : prevChapterVerses).map((v: Verse) => (
              <div key={`preview-${v.verse}`} data-verse={v.verse} className="p-1 rounded-lg border-transparent">
                <span className="font-bold mr-3 text-xs" style={{ color: '#8B7355' }}>{v.verse}</span>
                <span className="leading-relaxed" style={{ 
                  fontSize: `${fontSize}px`,
                  color: '#3A3028'
                }}>{processChineseText(v.text)}</span>
                <VerseIndicators
                  hasNote={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.hasNote || false}
                  hasResearch={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.hasResearch || false}
                  notePreview={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.notePreview}
                  researchCount={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.researchCount || 0}
                  onClick={() => {
                    const noteId = `${selectedBook.id}:${selectedChapter}:${v.verse}`;
                    
                    // Select this verse first
                    setSelectedVerses([v.verse]);
                    
                    // Create the selection object
                    const selectionInfo = {
                      id: noteId,
                      bookId: selectedBook.id,
                      bookName: selectedBook.name,
                      chapter: selectedChapter,
                      verseNums: [v.verse],
                      selectedRawText: v.text
                    };
                    
                    
                    // Notify the parent about the selection
                    onSelectionChange?.(selectionInfo);
                    
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <BibleVersePanel
          language="chinese"
          verses={leftVerses}
          selectedVerses={selectedVerses}
          bookmarkedVerses={bookmarkedVerses}
          verseData={verseData}
          fontSize={fontSize}
          isSimplified={isSimplified}
          loading={loading}
          scrollRef={leftScrollRef}
          contentMeasureRef={leftContentMeasureRef}
          annotationRef={chineseAnnotationRef}
          annotationToolState={annotationToolState}
          isAnnotationMode={isAnnotationMode}
          panelWidth={leftPanelWidth}
          contentHeight={leftPanelContentHeight}
          bookId={selectedBook.id}
          chapter={selectedChapter}
          vSplitOffset={vSplitOffset}
          isSwiping={isSwiping}
          swipeOffset={swipeOffset}
          isPageFlipping={isPageFlipping}
          onVerseClick={handleVerseClick}
          onScroll={() => handleScroll('left')}
          onTouchStart={handleAnnotationTouchStart}
          onContextMenu={isAnnotationMode ? (e) => e.preventDefault() : undefined}
          onVerseIndicatorClick={(verseNum, verseText) => {
            const noteId = `${selectedBook.id}:${selectedChapter}:${verseNum}`;
            setSelectedVerses([verseNum]);
            onSelectionChange?.({
              id: noteId,
              bookId: selectedBook.id,
              bookName: selectedBook.name,
              chapter: selectedChapter,
              verseNums: [verseNum],
              selectedRawText: verseText
            });
          }}
          onToggleBookmark={handleToggleBookmark}
          onAlignmentMismatch={handleAlignmentMismatch}
        />

        <div 
          className={`relative h-full flex items-center justify-center select-none z-30 transition-all group hover:bg-blue-50 flex-shrink-0`}
          style={{ 
            width: '20px',
            marginLeft: '0',
            marginRight: '0',
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            display: 'flex'
          }}
        >
          {/* Visible divider bar */}
          <div 
            className={`absolute h-full ${isResizing ? 'w-2' : 'w-1 bg-slate-200 group-hover:w-2'} transition-all`}
            style={{
              backgroundColor: isResizing ? theme.dividerActive : undefined,
              boxShadow: isResizing ? `2px 0 4px ${theme.dividerShadow}, -2px 0 4px ${theme.dividerShadow}` : '1px 0 2px rgba(0, 0, 0, 0.05)'
            }}
          />
          
          <div 
            onMouseDown={startResizing}
            onTouchStart={startResizing}
            className="absolute w-full h-full cursor-col-resize"
          />
          
          {/* Arrow buttons and drag indicator */}
          <div 
            className="relative flex flex-col gap-1 bg-white/95 py-1.5 px-1 rounded-full shadow-lg border border-slate-300 hover:border-blue-300 z-40 cursor-col-resize transition-colors" 
            style={{ width: '20px' }}
          >
            {/* Left arrow - toggle between middle (50%) and maximize English (0%) */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If on right side (>50%), go to middle (50%)
                // If at middle or left side (<=50%), maximize English (0%)
                setVSplitOffset(vSplitOffset > 50 ? 50 : 0);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset > 50 ? "Center divider" : "Maximize English"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            {/* Drag indicator */}
            <div 
              onMouseDown={startResizing}
              onTouchStart={startResizing}
              className="flex flex-row gap-0.5 px-1 justify-center cursor-col-resize" 
              style={{ width: '14px' }}
            >
              <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
              <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
            </div>
            
            {/* Right arrow - toggle between middle (50%) and maximize Chinese (100%) */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If on left side (<50%), go to middle (50%)
                // If at middle or right side (>=50%), maximize Chinese (100%)
                setVSplitOffset(vSplitOffset < 50 ? 50 : 100);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset < 50 ? "Center divider" : "Maximize Chinese"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <BibleVersePanel
          language="english"
          verses={rightVerses}
          selectedVerses={selectedVerses}
          bookmarkedVerses={bookmarkedVerses}
          verseData={verseData}
          fontSize={fontSize}
          isSimplified={isSimplified}
          loading={loading}
          scrollRef={rightScrollRef}
          contentMeasureRef={rightContentMeasureRef}
          annotationRef={englishAnnotationRef}
          annotationToolState={annotationToolState}
          isAnnotationMode={isAnnotationMode}
          panelWidth={rightPanelWidth}
          contentHeight={rightPanelContentHeight}
          bookId={selectedBook.id}
          chapter={selectedChapter}
          vSplitOffset={vSplitOffset}
          englishVersion={englishVersion}
          vibeVerseClassName={vibeVerseClassName}
          onVerseClick={handleVerseClick}
          onScroll={() => handleScroll('right')}
          onTouchStart={handleAnnotationTouchStart}
          onContextMenu={isAnnotationMode ? (e) => e.preventDefault() : undefined}
          onVerseIndicatorClick={() => {}}
          onToggleBookmark={handleToggleBookmark}
          onAlignmentMismatch={handleAlignmentMismatch}
        />
      </div>
      
      {/* Non-blocking error notification */}
      {error && (
        <div className="absolute bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-2 max-w-md">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <span className="text-sm block">{error}</span>
            <button 
              onClick={() => {
                setError(null);
                fetchChapter(); // Retry loading
              }}
              className="text-xs mt-1 underline hover:no-underline"
            >
              点击重试
            </button>
          </div>
          <button onClick={() => setError(null)} className="ml-2 hover:text-red-100 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {/* Reading History Modal */}
      {showReadingHistory && (
        <ReadingHistory
          onSelectChapter={handleSelectFromHistory}
          onClose={() => setShowReadingHistory(false)}
        />
      )}
      
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          selectedText={contextMenu.selectedText}
          onResearch={() => handleContextMenuAction('research')}
          onAddNote={() => handleContextMenuAction('note')}
          onCopy={() => handleContextMenuAction('copy')}
          onClose={() => setContextMenu(null)}
        />
      )}
      
      {/* ─── Floating Restore Alignment button (visible even outside annotation mode) ─── */}
      {!isAnnotationMode && annotationOriginalLayout && (
        <button
          onClick={handleRestoreAlignment}
          className="fixed bottom-8 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 transition-all hover:scale-105 active:scale-95"
          title="Annotations are misaligned. Tap to restore original font size and layout. 标注未对齐，点击恢复"
        >
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm font-bold text-amber-700">恢复对齐</span>
        </button>
      )}

      {/* ─── Shared Annotation Toolbar ─────────────────────────────────────── */}
      {isAnnotationMode && (
        <AnnotationToolbar
          isAnnotationMode={isAnnotationMode}
          annotationTool={annotationTool}
          annotationColor={annotationColor}
          annotationSize={annotationSize}
          showAnnotationColorPicker={showAnnotationColorPicker}
          isAnnotationToolbarCollapsed={isAnnotationToolbarCollapsed}
          annotationOriginalLayout={annotationOriginalLayout}
          colorPresets={COLOR_PRESETS}
          paperType={paperType}
          onSelectTool={selectAnnotationTool}
          onColorChange={setAnnotationColor}
          onSizeChange={setAnnotationSize}
          onToggleColorPicker={() => setShowAnnotationColorPicker(p => !p)}
          onToggleCollapsed={() => setIsAnnotationToolbarCollapsed(p => !p)}
          onUndo={handleAnnotationUndo}
          onClearAll={handleAnnotationClearAll}
          onRestoreAlignment={handleRestoreAlignment}
          onClose={() => setIsAnnotationMode(false)}
          onPaperTypeChange={setPaperType}
        />
      )}
    </div>
  );
};

export default BibleViewer;

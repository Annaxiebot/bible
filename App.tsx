import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { SelectionInfo } from './types';
import { exportImportService, BackupSummaryData } from './services/exportImportService';
import { notesStorage } from './services/notesStorage';
import { readingHistory } from './services/readingHistory';
import { verseDataStorage } from './services/verseDataStorage';
import { BIBLE_BOOKS } from './constants';
import { Toast } from './components/Toast';
import { printStudyNotes, PrintOptions } from './services/printService';
import { useSeasonThemeInit, SeasonThemeProvider } from './hooks/useSeasonTheme';
import { VibeStyles, isVibeAvailable, loadVibeStyles, getEmptyStyles } from './services/vibe';
import { useDataStats } from './hooks/useDataStats';
import './services/syncService'; // Initialize sync service
import { backgroundBibleDownload, BgDownloadProgress } from './services/backgroundBibleDownload';

// Lazy load heavy components for code splitting
const BibleViewer = lazy(() => import('./components/BibleViewer'));
const ChatInterface = lazy(() => import('./components/ChatInterface'));
const VoiceSession = lazy(() => import('./components/VoiceSession'));
const EnhancedNotebook = lazy(() => import('./components/EnhancedNotebook'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const VibePanel = lazy(() => import('./components/VibePanel'));
const BackupSummaryDialog = lazy(() => import('./components/BackupSummaryDialog'));
const NotesList = lazy(() => import('./components/NotesList'));
const BibleSearch = lazy(() => import('./components/BibleSearch'));
const PrintOptionsDialog = lazy(() => import('./components/PrintOptionsDialog'));
const DataDetailDialog = lazy(() => import('./components/DataDetailDialog'));
const GeneralResearchDialog = lazy(() => import('./components/GeneralResearchDialog'));

// Simplified split view hook
function useSplitView(initialV = 100, initialH = 100) {
  const [vertical, setVertical] = useState(initialV);
  const [horizontal, setHorizontal] = useState(initialH);
  const [isResizingV, setIsResizingV] = useState(false);
  const [isResizingH, setIsResizingH] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    const clientX = 'touches' in e ? e.touches[0]?.clientX : 'clientX' in e ? e.clientX : 0;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : 'clientY' in e ? e.clientY : 0;

    if (isResizingV) {
      const relativeY = clientY - rect.top;
      const percentage = Math.min(Math.max((relativeY / rect.height) * 100, 0), 100);
      setVertical(percentage);
    } else if (isResizingH) {
      const relativeX = clientX - rect.left;
      const percentage = Math.min(Math.max((relativeX / rect.width) * 100, 0), 100);
      setHorizontal(percentage);
    }
  }, [isResizingV, isResizingH]);

  const stopResize = useCallback(() => {
    setIsResizingV(false);
    setIsResizingH(false);
    document.body.style.overflow = '';
  }, []);

  useEffect(() => {
    if (isResizingV || isResizingH) {
      const events = ['mousemove', 'touchmove', 'pointermove'];
      const endEvents = ['mouseup', 'touchend', 'pointerup', 'touchcancel', 'pointercancel'];
      
      events.forEach(e => window.addEventListener(e as any, handleResize));
      endEvents.forEach(e => window.addEventListener(e, stopResize));

      return () => {
        events.forEach(e => window.removeEventListener(e as any, handleResize));
        endEvents.forEach(e => window.removeEventListener(e, stopResize));
      };
    }
  }, [isResizingV, isResizingH, handleResize, stopResize]);

  return {
    vertical,
    horizontal,
    setVertical,
    setHorizontal,
    startResizeV: () => setIsResizingV(true),
    startResizeH: () => setIsResizingH(true),
    isResizing: isResizingV || isResizingH,
    containerRef,
  };
}

const App: React.FC = () => {
  const themeCtx = useSeasonThemeInit();
  const theme = themeCtx.theme;
  const split = useSplitView(100, 100);
  
  const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
  const [initialBookId, setInitialBookId] = useState<string | undefined>();
  const [initialChapter, setInitialChapter] = useState<number | undefined>();
  const [showResumeNotification, setShowResumeNotification] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [selectionPayload, setSelectionPayload] = useState<{ text: string; id: number; clearChat?: boolean } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [dataUpdateTrigger, setDataUpdateTrigger] = useState(0);
  const [showNotesList, setShowNotesList] = useState(false);
  const [navigateTo, setNavigateTo] = useState<{ bookId: string; chapter: number; verses?: number[] } | null>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notesLoading, setNotesLoading] = useState(true);
  const [researchUpdateTrigger, setResearchUpdateTrigger] = useState(0);
  const [currentBibleContext, setCurrentBibleContext] = useState<{bookId: string; chapter: number} | null>(null);
  const [currentSelectedVerses, setCurrentSelectedVerses] = useState<number[]>([]);
  const [showVibePanel, setShowVibePanel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [backupDialog, setBackupDialog] = useState<{ mode: 'export' | 'import'; summary: BackupSummaryData; fileContent?: string } | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [downloadFns, setDownloadFns] = useState<{ bible: (() => void) | null; chapter: (() => void) | null; book: (() => void) | null }>({ bible: null, chapter: null, book: null });
  const [downloadState, setDownloadState] = useState({ isDownloading: false, progress: 0, status: '', timeRemaining: '' });
  const [vibeStyles, setVibeStyles] = useState<VibeStyles>(getEmptyStyles());
  const [dataDetailMode, setDataDetailMode] = useState<'notes' | 'research' | 'chapters' | null>(null);
  const [showGeneralResearch, setShowGeneralResearch] = useState(false);
  const { stats: dataStats } = useDataStats(dataUpdateTrigger);
  const [bgDownloadProgress, setBgDownloadProgress] = useState<BgDownloadProgress | null>(null);

  const handleSelectionChange = useCallback((selection: SelectionInfo | null) => {
    setCurrentSelection(selection);
  }, []);

  const handleContextChange = useCallback((bookId: string, chapter: number) => {
    setCurrentBibleContext({ bookId, chapter });
  }, []);
  
  useEffect(() => {
    const loadNotes = async () => {
      try {
        await verseDataStorage.migrateIds();
        await notesStorage.migrateFromLocalStorage();
        const loadedNotes = await notesStorage.getAllNotes();
        setNotes(loadedNotes);
      } catch (error) {
        // TODO: use error reporting service
      } finally {
        setNotesLoading(false);
      }
    };
    loadNotes();
    
    const lastRead = readingHistory.getLastRead();
    if (lastRead) {
      setInitialBookId(lastRead.bookId);
      setInitialChapter(lastRead.chapter);
      setShowResumeNotification(true);
      setTimeout(() => setShowResumeNotification(false), 3000);
    }
    setHistoryLoaded(true);
  }, []);

  useEffect(() => {
    const checkKey = async () => {
      try {
        if ((window as any).aistudio) {
          const selected = await (window as any).aistudio.hasSelectedApiKey();
          setHasKey(selected);
        } else {
          setHasKey(true);
        }
      } catch (error) {
        // silently handle
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  // Load saved vibe styles
  useEffect(() => {
    setVibeStyles(loadVibeStyles());
  }, []);

  // Start background Bible download after 5s delay
  const lastDataUpdateCountRef = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const unsub = backgroundBibleDownload.onProgress((progress) => {
        setBgDownloadProgress(progress);
        // Refresh data stats every 5 new chapters (avoid excessive re-renders)
        if (progress.cached - lastDataUpdateCountRef.current >= 5 || progress.isComplete) {
          lastDataUpdateCountRef.current = progress.cached;
          setDataUpdateTrigger(prev => prev + 1);
        }
      });
      backgroundBibleDownload.start();
      return unsub;
    }, 5000);

    return () => {
      clearTimeout(timer);
      backgroundBibleDownload.stop();
    };
  }, []);

  const handleSelectKey = async () => {
    try {
      if ((window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }
      setHasKey(true);
    } catch (error) {
      // silently handle
    }
  };

  const handleSaveNote = useCallback(async (id: string, content: string, skipTrigger = false) => {
    try {
      const parts = id.split(':');
      if (parts.length >= 2) {
        const bookId = parts[0];
        const chapter = parseInt(parts[1]);

        if (!content || content.trim() === "") {
          await notesStorage.deleteNote(id);
          if (notes[id]) {
            setNotes(prev => {
              const updated = { ...prev };
              delete updated[id];
              return updated;
            });
          }
          if (!skipTrigger) setDataUpdateTrigger(prev => prev + 1);
          const hasOtherNotes = Object.keys(notes).some(noteId =>
            noteId.startsWith(`${bookId}:${chapter}:`) && noteId !== id
          );
          if (!hasOtherNotes) {
            await readingHistory.updateChapterStatus(bookId, chapter, false, undefined);
          }
        } else {
          await notesStorage.saveNote(id, content);
          if (!notes[id]) {
            setNotes(prev => ({ ...prev, [id]: content }));
          }
          if (!skipTrigger) setDataUpdateTrigger(prev => prev + 1);
          await readingHistory.updateChapterStatus(bookId, chapter, true, undefined);
        }
      }
    } catch (error) {
      // TODO: use error reporting service
    }
  }, [notes]);

  const handleBackupAll = async () => {
    try {
      setToast({ message: 'Gathering data summary...', type: 'info' });
      const summary = await exportImportService.getLocalSummary();
      setToast(null);
      setBackupDialog({ mode: 'export', summary });
    } catch (error: any) {
      setToast({ message: `Failed: ${error.message}`, type: 'error' });
    }
  };

  const confirmBackup = async () => {
    setBackupLoading(true);
    try {
      const result = await exportImportService.exportAndDownloadAll((stage, percent) => {
        setToast({ message: `${stage} (${percent}%)`, type: 'info' });
      });
      if (result.success) {
        setToast({ message: '成功导出全部数据！Backup complete!', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error: any) {
      setToast({ message: `导出失败: ${error.message}`, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setBackupLoading(false);
      setBackupDialog(null);
    }
  };

  const handleClearAll = async () => {
    try {
      const allVerseData = await verseDataStorage.getAllData();
      const noteCount = allVerseData.filter(v => v.personalNote).length;
      const researchCount = allVerseData.reduce((acc, v) => acc + v.aiResearch.length, 0);
      const oldNotesCount = Object.keys(notes).length;
      const totalCount = noteCount + researchCount + oldNotesCount;
      
      if (totalCount === 0) {
        setToast({ message: "当前没有数据可以清除。 No data to clear.", type: 'info' });
        return;
      }
      
      if (confirm(`确定要清除所有数据吗？This cannot be undone!`)) {
        setToast({ message: "正在清除数据... Clearing data...", type: 'info' });
        await Promise.all([
          notesStorage.clearAllNotes(),
          verseDataStorage.clearAllPersonalNotes(),
          verseDataStorage.clearAllAIResearch()
        ]);
        setNotes({});
        setDataUpdateTrigger(prev => prev + 1);
        setTimeout(() => {
          setToast({ message: '成功清除！Successfully cleared!', type: 'success' });
          setTimeout(() => setToast(null), 3000);
        }, 100);
      }
    } catch (error) {
      setToast({ message: "清除数据时出错 Failed to clear data.", type: 'error' });
    }
  };

  const handleRestoreClick = () => libraryInputRef.current?.click();

  const handleLibraryImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setToast({ message: "正在读取备份... Reading backup...", type: 'info' });
      const content = await file.text();
      const summary = exportImportService.parseBackupSummary(content);
      setToast(null);
      setBackupDialog({ mode: 'import', summary, fileContent: content });
    } catch (err: any) {
      setToast({ message: `读取失败: ${err.message}`, type: 'error' });
    }
    e.target.value = "";
  };

  const confirmRestore = async () => {
    if (!backupDialog?.fileContent) return;
    setBackupLoading(true);
    try {
      const result = await exportImportService.importCombinedBackup(
        backupDialog.fileContent, 'merge_combine',
        (stage, percent) => setToast({ message: `${stage} (${percent}%)`, type: 'info' })
      );

      const anyImported = result.notesImported > 0 || result.chaptersImported > 0
        || result.annotationsImported > 0 || result.bookmarksImported > 0
        || result.plansImported > 0 || result.historyRestored;

      if (result.success || anyImported) {
        const allNotes = await notesStorage.getAllNotes();
        setNotes(allNotes);
        setDataUpdateTrigger(prev => prev + 1);
        const parts: string[] = [];
        if (result.notesImported > 0) parts.push(`${result.notesImported} notes`);
        if (result.chaptersImported > 0) parts.push(`${result.chaptersImported} chapters`);
        if (result.annotationsImported > 0) parts.push(`${result.annotationsImported} annotations`);
        if (result.bookmarksImported > 0) parts.push(`${result.bookmarksImported} bookmarks`);
        if (result.plansImported > 0) parts.push(`${result.plansImported} plans`);
        if (result.historyRestored) parts.push('reading history');
        setToast({ message: `恢复成功！Restored: ${parts.join(', ') || 'data'}`, type: 'success' });
        setTimeout(() => setToast(null), 4000);
      } else {
        throw new Error(result.errors.join('; ') || 'Import failed');
      }
    } catch (err: any) {
      setToast({ message: `恢复失败: ${err.message}`, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setBackupLoading(false);
      setBackupDialog(null);
    }
  };

  if (hasKey === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-6 text-center" style={{ backgroundColor: theme.background }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-6 shadow-lg" style={{ backgroundColor: theme.accent }}>圣</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">欢迎使用圣经学研</h1>
        <p className="text-slate-600 max-w-md mb-8">为了使用高级图像和视频创作功能，您需要选择一个已开启结算的 API 密钥。</p>
        <button onClick={handleSelectKey} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all active:scale-95">选择 API 密钥</button>
      </div>
    );
  }

  return (
    <SeasonThemeProvider value={themeCtx}>
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: theme.background }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-4 shadow-lg animate-pulse" style={{ backgroundColor: theme.accent }}>圣</div>
          <p className="text-slate-600">加载中...</p>
        </div>
      </div>
    }>
    <div className={`flex flex-col h-screen w-screen overflow-hidden ${vibeStyles.background}`} style={{ backgroundColor: vibeStyles.background ? undefined : theme.background }}>
      <input type="file" ref={libraryInputRef} onChange={handleLibraryImport} accept=".json,.bible-library" className="hidden" />
      
      {showResumeNotification && initialBookId && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-white px-4 py-2 rounded-lg shadow-lg border border-indigo-200 animate-pulse">
            <p className="text-sm text-slate-700">
              📖 恢复到: <span className="font-medium">{BIBLE_BOOKS.find(b => b.id === initialBookId)?.name} 第 {initialChapter} 章</span>
            </p>
          </div>
        </div>
      )}
      
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        showToggle={!isIPhone}
        onBackup={() => { handleBackupAll(); setIsSidebarOpen(false); }}
        onRestore={() => { handleRestoreClick(); setIsSidebarOpen(false); }}
        onClear={() => { handleClearAll(); setIsSidebarOpen(false); }}
        onSearch={() => { setShowSearch(true); setIsSidebarOpen(false); }}
        onPrint={() => { setShowPrintOptions(true); setIsSidebarOpen(false); }}
        onVoiceOpen={() => { setIsVoiceOpen(true); setIsSidebarOpen(false); }}
        onVibeOpen={() => { setShowVibePanel(true); setIsSidebarOpen(false); }}
        onNavigate={(bookId, chapter, verse) => {
          setNavigateTo({ bookId, chapter, verses: verse ? [verse] : undefined });
          setTimeout(() => setNavigateTo(null), 5000);
          setIsSidebarOpen(false);
        }}
        onViewNotes={() => { setShowNotesList(true); setIsSidebarOpen(false); }}
        onSplitView={() => {
          split.setVertical(50);
          split.setHorizontal(50);
          setIsSidebarOpen(false);
        }}
        onNotebookView={() => {
          split.setVertical(50);
          split.setHorizontal(0);
          setIsSidebarOpen(false);
        }}
        notesCount={Object.keys(notes).length}
        dataUpdateTrigger={dataUpdateTrigger}
        onDownloadBible={downloadFns.bible}
        onDownloadChapter={downloadFns.chapter}
        onDownloadBook={downloadFns.book}
        downloadProgress={downloadState.progress}
        isDownloading={downloadState.isDownloading}
        downloadStatus={downloadState.status}
        downloadTimeRemaining={downloadState.timeRemaining}
        onShowDataDetail={(mode) => { setDataDetailMode(mode); setIsSidebarOpen(false); }}
        onShowGeneralResearch={() => { setShowGeneralResearch(true); setIsSidebarOpen(false); }}
        bgDownloadProgress={bgDownloadProgress}
      />

      <main ref={split.containerRef} className="flex-1 flex flex-col relative overflow-hidden">
        <div className="overflow-hidden" style={{ flexBasis: split.vertical >= 100 ? 'calc(100% - 24px)' : split.vertical <= 0 ? '0%' : `${split.vertical}%`, flexGrow: 0, flexShrink: 0, minHeight: 0 }}>
          {historyLoaded && (
            <BibleViewer 
              notes={notes}
              researchUpdateTrigger={researchUpdateTrigger}
              onSelectionChange={handleSelectionChange}
              onVersesSelectedForChat={(text, clearChat) => setSelectionPayload({ text, id: Date.now(), clearChat })}
              onContextChange={handleContextChange}
              onVersesSelected={setCurrentSelectedVerses}
              sidebarOpen={isSidebarOpen}
              showSidebarToggle={!isIPhone}
              onSidebarToggle={() => setIsSidebarOpen(!isSidebarOpen)}
              isIPhone={isIPhone}
              initialBookId={initialBookId}
              initialChapter={initialChapter}
              navigateTo={navigateTo}
              onLayoutChange={(v, h) => {
                split.setVertical(v);
                split.setHorizontal(h);
              }}
              onDownloadStateChange={(isDownloading, progress, status, timeRemaining) => setDownloadState({ isDownloading, progress, status: status || '', timeRemaining: timeRemaining || '' })}
              onDownloadFunctionsReady={(bible, chapter, book) => setDownloadFns({ bible, chapter, book })}
              vibeClassName={vibeStyles.bible_panel}
              vibeVerseClassName={vibeStyles.verse_text}
            />
          )}
        </div>

        <div className="relative w-full flex items-center justify-center select-none" style={{ flexShrink: 0, height: '32px', touchAction: 'none' }}>
          <div className={`absolute w-full ${split.isResizing ? 'h-3' : 'h-2 bg-slate-400'} transition-all`} style={{ backgroundColor: split.isResizing ? theme.dividerActive : undefined }}></div>
          <div onMouseDown={split.startResizeV} onTouchStart={split.startResizeV} onPointerDown={split.startResizeV} className="absolute w-full h-full cursor-row-resize" style={{ zIndex: 20 }}></div>
          <div className="relative flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-xl border-2 border-slate-400" style={{ height: isIPhone ? '36px' : '20px', zIndex: 60 }}>
            <button onClick={() => split.setVertical(split.vertical >= 100 ? 50 : split.vertical >= 50 ? 0 : 67)} className="p-px hover:bg-slate-200 rounded" style={{ height: isIPhone ? '28px' : '14px', width: isIPhone ? '28px' : '14px' }}>
              <svg className={`${isIPhone ? 'w-6 h-6' : 'w-3 h-3'} text-slate-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
            </button>
            <div onMouseDown={split.startResizeV} onTouchStart={split.startResizeV} className="flex flex-col gap-0.5 px-1 cursor-row-resize justify-center" style={{ height: isIPhone ? '28px' : '14px' }}>
              <div className="w-4 h-0.5 bg-slate-300"></div>
              <div className="w-4 h-0.5 bg-slate-300"></div>
            </div>
            <button onClick={() => split.setVertical(split.vertical <= 0 ? 50 : 100)} className="p-px hover:bg-slate-200 rounded" style={{ height: isIPhone ? '28px' : '14px', width: isIPhone ? '28px' : '14px' }}>
              <svg className={`${isIPhone ? 'w-6 h-6' : 'w-3 h-3'} text-slate-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
        </div>

        <div className="overflow-hidden flex" style={{ flexBasis: split.vertical <= 0 ? 'calc(100% - 24px)' : split.vertical >= 100 ? '0%' : 'auto', flexGrow: 1, flexShrink: 1, minHeight: 0, display: split.vertical >= 100 ? 'none' : 'flex' }}>
          <div className="h-full overflow-hidden" style={{ flexBasis: split.horizontal >= 100 ? 'calc(100% - 20px)' : split.horizontal <= 0 ? '0%' : `calc(${split.horizontal}% - 10px)`, flexGrow: 0, flexShrink: 0, minWidth: 0, display: split.horizontal <= 0 ? 'none' : 'block' }}>
             <ChatInterface 
               incomingText={selectionPayload}
               currentBookId={currentBibleContext?.bookId}
               currentChapter={currentBibleContext?.chapter}
               currentVerses={currentSelectedVerses}
               onResearchSaved={() => {
                 setResearchUpdateTrigger(prev => prev + 1);
                 setDataUpdateTrigger(prev => prev + 1);
               }}
               onNavigate={(bookId, chapter, verses) => {
                 setNavigateTo({ bookId, chapter, verses });
                 setTimeout(() => setNavigateTo(null), 5000);
               }}
               vibeClassName={vibeStyles.chat_panel}
             />
          </div>
          
          <div className="relative h-full flex items-center justify-center select-none" style={{ width: '20px', touchAction: 'none' }}>
            <div className={`absolute h-full ${split.isResizing ? 'w-2' : 'w-1 bg-slate-200'} transition-all`} style={{ backgroundColor: split.isResizing ? theme.dividerActive : undefined }}></div>
            <div onMouseDown={split.startResizeH} onTouchStart={split.startResizeH} onPointerDown={split.startResizeH} className="absolute w-full h-full cursor-col-resize"></div>
            <div onMouseDown={split.startResizeH} onTouchStart={split.startResizeH} className="relative flex flex-col gap-1 bg-white/95 py-1.5 px-1 rounded-full shadow-lg border border-slate-300 z-40 cursor-col-resize" style={{ width: '20px' }}>
              <button onClick={() => split.setHorizontal(split.horizontal > 50 ? 50 : 0)} className="p-px hover:bg-slate-200 rounded" style={{ height: '10px', width: '10px' }}><svg className="w-2 h-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg></button>
              <div onMouseDown={split.startResizeH} onTouchStart={split.startResizeH} className="flex flex-row gap-0.5 px-1 cursor-col-resize" style={{ width: '14px' }}><div className="w-0.5 h-4 bg-slate-300"></div><div className="w-0.5 h-4 bg-slate-300"></div></div>
              <button onClick={() => split.setHorizontal(split.horizontal < 50 ? 50 : 100)} className="p-px hover:bg-slate-200 rounded" style={{ height: '10px', width: '10px' }}><svg className="w-2 h-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg></button>
            </div>
          </div>

          <div className="h-full overflow-hidden" style={{ flexBasis: split.horizontal <= 0 ? 'calc(100% - 20px)' : split.horizontal >= 100 ? '0%' : `calc(${100 - split.horizontal}% - 10px)`, flexGrow: 0, flexShrink: 0, minWidth: 0, display: split.horizontal >= 100 ? 'none' : 'block' }}>
            <EnhancedNotebook
              selection={currentSelection}
              onSaveNote={handleSaveNote}
              initialContent={currentSelection ? (notes[currentSelection.id] || '') : ''}
              initialTab="research"
              researchUpdateTrigger={researchUpdateTrigger}
              onNavigate={(bookId, chapter, verses) => {
                setNavigateTo({ bookId, chapter, verses });
                setTimeout(() => setNavigateTo(null), 5000);
              }}
            />
          </div>
        </div>
      </main>

      <VoiceSession isOpen={isVoiceOpen} onClose={() => setIsVoiceOpen(false)} />
      
      {showVibePanel && (
        <VibePanel
          onClose={() => setShowVibePanel(false)}
          onApplyStyles={setVibeStyles}
          currentStyles={vibeStyles}
          isApiAvailable={isVibeAvailable()}
        />
      )}
      
      {showNotesList && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl h-[80vh] overflow-hidden">
            <NotesList
              onClose={() => setShowNotesList(false)}
              onSelectNote={(bookId, chapter, verses) => {
                setShowNotesList(false);
                split.setVertical(50);
                split.setHorizontal(0);
                setNavigateTo({ bookId, chapter, verses });
                setTimeout(() => setNavigateTo(null), 5000);
              }}
            />
          </div>
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl h-[80vh] overflow-hidden">
            <BibleSearch
              onClose={() => setShowSearch(false)}
              onNavigate={(bookId, chapter, verses) => {
                setShowSearch(false);
                setNavigateTo({ bookId, chapter, verses });
                setTimeout(() => setNavigateTo(null), 5000);
              }}
            />
          </div>
        </div>
      )}

      {showPrintOptions && (
        <PrintOptionsDialog
          onClose={() => setShowPrintOptions(false)}
          onPrint={(options: PrintOptions) => {
            setShowPrintOptions(false);
            printStudyNotes(options);
          }}
        />
      )}

      {split.isResizing && <style>{`* { user-select: none !important; cursor: inherit !important; }`}</style>}
      
      {dataDetailMode && (
        <DataDetailDialog
          mode={dataDetailMode}
          noteDetails={dataStats.noteDetails}
          researchDetails={dataStats.researchDetails}
          chapterDetails={dataStats.chapterDetails}
          onNavigate={(bookId, chapter, verses) => {
            setNavigateTo({ bookId, chapter, verses });
            setTimeout(() => setNavigateTo(null), 5000);
          }}
          onClose={() => setDataDetailMode(null)}
        />
      )}

      {showGeneralResearch && (
        <GeneralResearchDialog onClose={() => setShowGeneralResearch(false)} />
      )}

      {backupDialog && (
        <BackupSummaryDialog
          mode={backupDialog.mode}
          summary={backupDialog.summary}
          onConfirm={backupDialog.mode === 'export' ? confirmBackup : confirmRestore}
          onCancel={() => setBackupDialog(null)}
          loading={backupLoading}
        />
      )}

      {toast && <Toast message={{ id: 'app-toast', type: toast.type, message: toast.message }} onDismiss={() => setToast(null)} />}
    </div>
    </Suspense>
    </SeasonThemeProvider>
  );
};

export default App;

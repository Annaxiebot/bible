import React, { useState, useEffect } from 'react';
import { useDataStats } from '../hooks/useDataStats';
import { bookmarkStorage, Bookmark } from '../services/bookmarkStorage';
import { readingPlanStorage, ReadingPlanState, READING_PLANS, PlanType, ReadingPlanDay } from '../services/readingPlanStorage';
import { useSeasonTheme } from '../hooks/useSeasonTheme';
import { ALL_SEASONS, getThemeForSeason, getSeason } from '../services/seasonTheme';
import { AuthPanel } from './AuthPanel';

export interface BgDownloadProgress {
  cached: number;
  total: number;
  currentBook: string;
  isRunning: boolean;
  isComplete: boolean;
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  showToggle?: boolean;
  onBackup: () => void;
  onRestore: () => void;
  onClear: () => void;
  onVoiceOpen: () => void;
  onVibeOpen?: () => void;
  onViewNotes?: () => void;
  onSplitView?: () => void;
  onNotebookView?: () => void;
  notesCount: number;
  onDownloadBible?: (() => void) | null;
  onDownloadChapter?: (() => void) | null;
  onDownloadBook?: (() => void) | null;
  downloadProgress?: number;
  isDownloading?: boolean;
  downloadStatus?: string;
  downloadTimeRemaining?: string;
  dataUpdateTrigger?: number;
  onNavigate?: (bookId: string, chapter: number, verse?: number) => void;
  onSearch?: () => void;
  onPrint?: () => void;
  onShowDataDetail?: (mode: 'notes' | 'research' | 'chapters') => void;
  bgDownloadProgress?: BgDownloadProgress | null;
}

// Chevron component for collapsible sections
const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg 
    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} 
    fill="none" viewBox="0 0 24 24" stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onToggle, 
  onBackup, 
  onRestore, 
  onClear,
  onVoiceOpen,
  onVibeOpen,
  onViewNotes,
  onSplitView,
  onNotebookView,
  notesCount,
  onDownloadBible,
  onDownloadChapter,
  onDownloadBook,
  downloadProgress = 0,
  isDownloading = false,
  downloadStatus = '',
  downloadTimeRemaining = '',
  showToggle = true,
  dataUpdateTrigger = 0,
  onNavigate,
  onSearch,
  onPrint,
  onShowDataDetail,
  bgDownloadProgress
}) => {
  const { stats, loading } = useDataStats(dataUpdateTrigger);
  const { theme, isAuto, setSeason } = useSeasonTheme();
  
  // Collapsible section state
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    actions: true,
    bookmarks: false,
    readingPlan: false,
    dataStats: false,
    notesManagement: false,
    offlineDownload: false,
    cloudSync: false,
    settings: false,
  });

  // Bookmarks state
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(true);

  // Reading plan state
  const [activePlan, setActivePlan] = useState<ReadingPlanState | null>(null);
  const [todaysReading, setTodaysReading] = useState<ReadingPlanDay[]>([]);
  const [planProgress, setPlanProgress] = useState(0);
  const [showPlanPicker, setShowPlanPicker] = useState(false);

  // English version state
  const [englishVersion, setEnglishVersionState] = useState(() => {
    return localStorage.getItem('bibleEnglishVersion') || 'web';
  });

  const handleEnglishVersionChange = (version: string) => {
    setEnglishVersionState(version);
    localStorage.setItem('bibleEnglishVersion', version);
    window.dispatchEvent(new CustomEvent('bibleEnglishVersionChanged'));
  };

  // Load bookmarks
  useEffect(() => {
    if (isOpen) {
      loadBookmarks();
      loadReadingPlan();
    }
  }, [isOpen, dataUpdateTrigger]);

  const loadBookmarks = async () => {
    setBookmarksLoading(true);
    try {
      const bm = await bookmarkStorage.getAllBookmarks();
      setBookmarks(bm);
    } catch (e) {
      console.error('Failed to load bookmarks:', e);
    } finally {
      setBookmarksLoading(false);
    }
  };

  const loadReadingPlan = async () => {
    try {
      const plan = await readingPlanStorage.getActivePlan();
      setActivePlan(plan);
      if (plan) {
        const reading = readingPlanStorage.getTodaysReading(plan);
        setTodaysReading(reading);
        setPlanProgress(readingPlanStorage.getProgress(plan));
      }
    } catch (e) {
      console.error('Failed to load reading plan:', e);
    }
  };

  const handleStartPlan = async (planType: PlanType) => {
    try {
      const plan = await readingPlanStorage.startPlan(planType);
      setActivePlan(plan);
      const reading = readingPlanStorage.getTodaysReading(plan);
      setTodaysReading(reading);
      setPlanProgress(0);
      setShowPlanPicker(false);
    } catch (e) {
      console.error('Failed to start plan:', e);
    }
  };

  const handleMarkComplete = async () => {
    if (!activePlan) return;
    try {
      await readingPlanStorage.markDayComplete(activePlan.planType);
      await loadReadingPlan();
    } catch (e) {
      console.error('Failed to mark day complete:', e);
    }
  };

  const handleStopPlan = async () => {
    if (!activePlan) return;
    if (confirm('确定要停止当前读经计划吗？ Stop current reading plan?')) {
      try {
        await readingPlanStorage.stopPlan(activePlan.planType);
        setActivePlan(null);
        setTodaysReading([]);
        setPlanProgress(0);
      } catch (e) {
        console.error('Failed to stop plan:', e);
      }
    }
  };

  const handleRemoveBookmark = async (id: string) => {
    try {
      await bookmarkStorage.removeBookmark(id);
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch (e) {
      console.error('Failed to remove bookmark:', e);
    }
  };

  const toggleSection = (key: string) => {
    setSectionsOpen(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      {/* Toggle Button - Hidden on iPhone */}
      {showToggle && (
        <button
          onClick={onToggle}
          className="fixed left-3 z-50 p-2 bg-white rounded-lg shadow-lg hover:bg-slate-50 transition-all"
          style={{ 
            top: '8px',
            transform: isOpen ? 'translateX(240px)' : 'translateX(0)',
            transition: 'transform 0.3s ease'
          }}
        >
        <svg 
          className="w-5 h-5 text-slate-600" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} 
          />
        </svg>
        </button>
      )}

      {/* Sidebar */}
      <div 
        className="fixed left-0 top-0 h-full bg-white shadow-2xl z-[70] flex flex-col"
        style={{
          width: '280px',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease'
        }}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold shadow-sm text-lg" style={{ backgroundColor: theme.accent }}>
              圣
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Scripture Scholar</h2>
              <p className="text-xs text-slate-500">圣经学研 {theme.emoji} {theme.nameZh}</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* === Actions Section (always expanded) === */}
          {/* Bible Search */}
          {onSearch && (
            <button
              onClick={onSearch}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-blue-50 transition-colors group mb-2"
            >
              <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="flex-1 text-left text-sm font-medium text-slate-700 group-hover:text-blue-600">
                Search Bible
              </span>
            </button>
          )}

          {/* Voice Session */}
          <button 
            onClick={onVoiceOpen}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-indigo-50 transition-colors group mb-2"
          >
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
            </div>
            <span className="flex-1 text-left text-sm font-medium text-slate-700 group-hover:text-indigo-600">
              语音学者 Voice Session
            </span>
          </button>

          {/* Split View */}
          {onSplitView && (
            <>
              <button
                onClick={onSplitView}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-blue-50 transition-colors group mb-2"
              >
                <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <div className="flex-1 text-left">
                  <span className="block text-sm font-medium text-slate-700 group-hover:text-blue-600">
                    分屏视图
                  </span>
                  <span className="block text-xs text-slate-500">
                    Split View (Chat + Notes)
                  </span>
                </div>
              </button>

              <button
                onClick={onNotebookView}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-indigo-50 transition-colors group mb-2"
              >
                <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <div className="flex-1 text-left">
                  <span className="block text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                    笔记视图
                  </span>
                  <span className="block text-xs text-slate-500">
                    Notes View Only
                  </span>
                </div>
              </button>
            </>
          )}

          {/* Vibe Studio */}
          {onVibeOpen && (
            <button
              onClick={onVibeOpen}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-purple-50 transition-colors group mb-2"
            >
              <svg className="w-4 h-4 text-slate-400 group-hover:text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              <span className="flex-1 text-left text-sm font-medium text-slate-700 group-hover:text-purple-600">
                Vibe Studio
              </span>
            </button>
          )}

          <div className="h-px bg-slate-200 my-3"></div>

          {/* === Bookmarks Section (collapsible) === */}
          <button
            onClick={() => toggleSection('bookmarks')}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ChevronIcon isOpen={sectionsOpen.bookmarks} />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1 text-left">
              🔖 收藏经文 Bookmarks
            </span>
            {bookmarks.length > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">
                {bookmarks.length}
              </span>
            )}
          </button>
          
          {sectionsOpen.bookmarks && (
            <div className="mt-1 mb-2">
              {bookmarksLoading ? (
                <div className="px-4 py-2 text-xs text-slate-400">加载中 Loading...</div>
              ) : bookmarks.length === 0 ? (
                <div className="px-4 py-2 text-xs text-slate-400">
                  暂无收藏 No bookmarks yet
                  <br />
                  <span className="text-slate-300">点击经文旁的 ♡ 收藏</span>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1 px-2">
                  {bookmarks.map(bm => (
                    <div 
                      key={bm.id}
                      className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-indigo-50 cursor-pointer group transition-colors"
                      onClick={() => {
                        onNavigate?.(bm.bookId, bm.chapter, bm.verse);
                        onToggle();
                      }}
                    >
                      <span style={{ color: theme.heartColor }} className="mt-0.5">♥</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-700 truncate">
                          {bm.bookName} {bm.chapter}:{bm.verse}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{bm.textPreview}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveBookmark(bm.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all"
                        title="移除收藏 Remove"
                      >
                        <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* === Reading Plan Section (collapsible) === */}
          <button
            onClick={() => toggleSection('readingPlan')}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ChevronIcon isOpen={sectionsOpen.readingPlan} />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1 text-left">
              📅 读经计划 Reading Plan
            </span>
            {activePlan && (
              <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-medium">
                {planProgress}%
              </span>
            )}
          </button>

          {sectionsOpen.readingPlan && (
            <div className="mt-1 mb-2 px-4">
              {activePlan ? (
                <div className="space-y-2">
                  {/* Active plan info */}
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <div className="text-xs font-medium text-indigo-700">
                      {READING_PLANS[activePlan.planType].name}
                    </div>
                    <div className="text-[10px] text-indigo-500">
                      {READING_PLANS[activePlan.planType].nameEn}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-1.5 w-full bg-indigo-200 rounded-full h-1.5">
                      <div 
                        className="bg-indigo-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${planProgress}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-indigo-400 mt-0.5">
                      第 {activePlan.currentDay + 1} 天 / {READING_PLANS[activePlan.planType].totalDays} 天
                      {' · '}{activePlan.completedDays.length} 天已完成
                    </div>
                  </div>

                  {/* Today's reading */}
                  <div className="text-xs font-medium text-slate-600">今日读经 Today's Reading:</div>
                  {todaysReading.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        onNavigate?.(r.bookId, r.chapter);
                        onToggle();
                      }}
                      className="w-full text-left px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                    >
                      📖 {r.bookName} 第 {r.chapter} 章
                    </button>
                  ))}
                  
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={handleMarkComplete}
                      className="flex-1 text-xs px-2 py-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                    >
                      ✓ 完成今天 Done
                    </button>
                    <button
                      onClick={handleStopPlan}
                      className="text-xs px-2 py-1.5 bg-slate-200 text-slate-600 rounded-md hover:bg-slate-300 transition-colors"
                    >
                      停止 Stop
                    </button>
                  </div>
                </div>
              ) : showPlanPicker ? (
                <div className="space-y-2">
                  <div className="text-xs text-slate-600 mb-1">选择计划 Choose a plan:</div>
                  {(Object.keys(READING_PLANS) as PlanType[]).map(planType => {
                    const plan = READING_PLANS[planType];
                    return (
                      <button
                        key={planType}
                        onClick={() => handleStartPlan(planType)}
                        className="w-full text-left p-2 bg-slate-50 rounded-lg hover:bg-indigo-50 transition-colors border border-slate-200 hover:border-indigo-200"
                      >
                        <div className="text-xs font-medium text-slate-700">{plan.name}</div>
                        <div className="text-[10px] text-slate-500">{plan.nameEn}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{plan.description}</div>
                        <div className="text-[10px] text-indigo-500">{plan.totalDays} 天 days</div>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowPlanPicker(false)}
                    className="w-full text-xs text-slate-400 hover:text-slate-600 py-1"
                  >
                    取消 Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPlanPicker(true)}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs">开始新计划 Start a Plan</span>
                </button>
              )}
            </div>
          )}

          <div className="h-px bg-slate-200 my-3"></div>

          {/* === Data Stats Section (collapsible) === */}
          <button
            onClick={() => toggleSection('dataStats')}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ChevronIcon isOpen={sectionsOpen.dataStats} />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1 text-left">
              📊 数据统计 Data Summary
            </span>
          </button>

          {sectionsOpen.dataStats && (
            <div className="mx-4 mt-1 mb-2 p-3 bg-slate-50 rounded-lg">
              {loading ? (
                <div className="text-xs text-slate-400">加载中 Loading...</div>
              ) : (
                <div className="space-y-0.5 text-xs">
                  <button
                    onClick={() => onShowDataDetail?.('notes')}
                    className="w-full flex justify-between px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span className="text-slate-600">📝 个人笔记 Notes:</span>
                    <span className="font-medium text-indigo-600">{stats.personalNotes}</span>
                  </button>
                  <button
                    onClick={() => onShowDataDetail?.('research')}
                    className="w-full flex justify-between px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span className="text-slate-600">🔍 AI研究 Research:</span>
                    <span className="font-medium text-indigo-600">{stats.aiResearch}</span>
                  </button>
                  <button
                    onClick={() => onShowDataDetail?.('chapters')}
                    className="w-full flex justify-between px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span className="text-slate-600">📖 缓存章节 Chapters:</span>
                    <span className="font-medium text-indigo-600">{stats.cachedChapters}</span>
                  </button>
                  {/* Background download progress */}
                  {bgDownloadProgress && !bgDownloadProgress.isComplete && bgDownloadProgress.isRunning && (
                    <div className="px-2 py-1.5">
                      <div className="text-[10px] text-slate-500">
                        {bgDownloadProgress.currentBook ? `${bgDownloadProgress.currentBook} 第${bgDownloadProgress.currentChapter}章` : '缓存中 Caching...'}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 bg-slate-200 rounded-full h-1">
                          <div
                            className="bg-indigo-400 h-1 rounded-full transition-all"
                            style={{ width: `${Math.round((bgDownloadProgress.cached / bgDownloadProgress.total) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{bgDownloadProgress.cached}/{bgDownloadProgress.total}</span>
                      </div>
                    </div>
                  )}
                  {bgDownloadProgress && bgDownloadProgress.isComplete && (
                    <div className="px-2 py-1 text-[10px] text-green-600 font-medium">
                      ✓ 全部已缓存 All cached
                    </div>
                  )}
                  {stats.totalSize && (
                    <div className="flex justify-between px-2 py-1 pt-1 border-t border-slate-200">
                      <span className="text-slate-600">💾 存储空间 Storage:</span>
                      <span className="font-medium text-slate-700">
                        {(stats.totalSize / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* === Notes Management Section (collapsible) === */}
          <button
            onClick={() => toggleSection('notesManagement')}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ChevronIcon isOpen={sectionsOpen.notesManagement} />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1 text-left">
              📝 笔记管理 Notes Management
            </span>
          </button>

          {sectionsOpen.notesManagement && (
            <div className="space-y-1 mt-1 mb-2">
              {/* View All Notes Button */}
              {onViewNotes && (
                <button 
                  onClick={onViewNotes}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                >
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <div className="flex-1 text-left">
                    <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                      查看所有笔记
                    </span>
                    <span className="block text-xs text-slate-500">
                      View all notes
                    </span>
                  </div>
                </button>
              )}

              {onPrint && (
                <button
                  onClick={onPrint}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                >
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <div className="flex-1 text-left">
                    <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                      打印笔记
                    </span>
                    <span className="block text-xs text-slate-500">
                      Print all study notes
                    </span>
                  </div>
                </button>
              )}

              <button
                onClick={onBackup}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                <div className="flex-1 text-left">
                  <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                    备份数据
                  </span>
                  <span className="block text-xs text-slate-500">
                    Backup all data
                  </span>
                </div>
              </button>

              <button 
                onClick={onRestore}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <div className="flex-1 text-left">
                  <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                    恢复数据
                  </span>
                  <span className="block text-xs text-slate-500">
                    Restore from backup
                  </span>
                </div>
              </button>

              <button 
                onClick={onClear}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-red-50 transition-colors group"
              >
                <svg className="w-4 h-4 text-slate-400 group-hover:text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <div className="flex-1 text-left">
                  <span className="text-sm font-medium text-slate-700 group-hover:text-red-600">
                    清空笔记
                  </span>
                  <span className="block text-xs text-slate-500">
                    Delete all notes
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* === Offline Download Section (collapsible) === */}
          <button
            onClick={() => toggleSection('offlineDownload')}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ChevronIcon isOpen={sectionsOpen.offlineDownload} />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1 text-left">
              ⬇️ 离线下载 Offline Download
            </span>
          </button>

          {sectionsOpen.offlineDownload && (
            <div className="space-y-1 mt-1 mb-2">
              {isDownloading ? (
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm text-slate-600">
                      下载中 {downloadProgress}%
                      {downloadTimeRemaining && ` • ${downloadTimeRemaining}`}
                    </span>
                  </div>
                  {downloadStatus && (
                    <p className="text-xs text-slate-500 mt-1">{downloadStatus}</p>
                  )}
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                    <div 
                      className="bg-indigo-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {onDownloadChapter && (
                    <button 
                      onClick={() => onDownloadChapter && onDownloadChapter()}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                      disabled={isDownloading}
                    >
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                          下载当前章节
                        </span>
                        <span className="block text-xs text-slate-500">
                          Save current chapter
                        </span>
                      </div>
                    </button>
                  )}
                  {onDownloadBook && (
                    <button 
                      onClick={() => onDownloadBook && onDownloadBook()}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                      disabled={isDownloading}
                    >
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                          下载当前书卷
                        </span>
                        <span className="block text-xs text-slate-500">
                          Save current book
                        </span>
                      </div>
                    </button>
                  )}
                  {onDownloadBible && (
                    <button 
                      onClick={() => onDownloadBible && onDownloadBible()}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                      disabled={isDownloading}
                    >
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                          下载全部圣经
                        </span>
                        <span className="block text-xs text-slate-500">
                          Save all books offline
                        </span>
                      </div>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* === Cloud Sync Section (collapsible) === */}
          <button
            onClick={() => toggleSection('cloudSync')}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ChevronIcon isOpen={sectionsOpen.cloudSync} />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1 text-left">
              ☁️ 云端同步 Cloud Sync
            </span>
          </button>

          {sectionsOpen.cloudSync && (
            <div className="px-4 py-2">
              <AuthPanel />
            </div>
          )}

          {/* === Settings Section (collapsible) === */}
          <button
            onClick={() => toggleSection('settings')}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ChevronIcon isOpen={sectionsOpen.settings} />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1 text-left">
              ⚙️ 设置 Settings
            </span>
          </button>

          {sectionsOpen.settings && (
            <div className="space-y-3 mt-1 mb-2 px-4">
              {/* Season Theme Picker */}
              <div>
                <div className="text-xs font-medium text-slate-600 mb-2">🎨 主题 Theme</div>
                
                {/* Auto-detect toggle */}
                <button
                  onClick={() => setSeason(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors mb-2 border ${
                    isAuto 
                      ? 'border-current font-semibold' 
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                  style={isAuto ? { 
                    backgroundColor: theme.accentLight, 
                    color: theme.accent,
                    borderColor: theme.accentMedium
                  } : {}}
                >
                  🔄 自动 Auto ({getThemeForSeason(getSeason()).emoji} {getThemeForSeason(getSeason()).name})
                </button>
                
                {/* Season buttons */}
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_SEASONS.map(s => {
                    const t = getThemeForSeason(s);
                    const isActive = !isAuto && theme.season === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setSeason(s)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all border ${
                          isActive ? 'font-semibold shadow-sm' : 'border-slate-200 hover:shadow-sm'
                        }`}
                        style={isActive ? {
                          backgroundColor: t.accentLight,
                          borderColor: t.accentMedium,
                          color: t.accent
                        } : {
                          backgroundColor: t.paperBg
                        }}
                      >
                        <span className="text-base">{t.emoji}</span>
                        <div>
                          <div className={isActive ? '' : 'text-slate-700'}>{t.nameZh}</div>
                          <div className={`text-[10px] ${isActive ? '' : 'text-slate-400'}`}>{t.name}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-slate-100"></div>

              {/* English Bible Version Selector */}
              <div>
                <div className="text-xs font-medium text-slate-600 mb-2">📖 英文译本 English Version</div>
                <select
                  value={englishVersion}
                  onChange={(e) => handleEnglishVersionChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="web">WEB (World English Bible)</option>
                  <option value="kjv">KJV (King James Version)</option>
                  <option value="asv">ASV (American Standard)</option>
                </select>
              </div>

              <div className="h-px bg-slate-100"></div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded focus:ring-2"
                    style={{ accentColor: theme.accent }}
                    defaultChecked
                  />
                  <span className="text-sm text-slate-700">自动保存笔记 Auto-save notes</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200">
          <p className="text-xs text-slate-400 text-center">
            {theme.emoji} Bible Workspace v2.3.1 · {theme.name}
          </p>
          <p className="text-[10px] text-slate-300 text-center mt-1">
            Build: 2026-02-06-E
          </p>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-20 z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
};

export default Sidebar;

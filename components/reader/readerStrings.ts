/**
 * readerStrings.ts — every user-visible string of the Bible reader, per interface language · 阅读器文案
 *
 * The interface language (Settings → 界面语言 Interface language) picks a
 * table; it never changes the Bible text, edition or 简/繁 script
 * (services/readerPreferences). 中文 keeps the reader's existing labels;
 * English is complete — chapter options, search, history, script control,
 * load errors and retry included (2026-10 review).
 */
import type { UiLanguage, ChineseScript } from '../../services/readerPreferences';

export interface ReaderStrings {
  /** BCP 47 tag for the interface chrome. */
  lang: string;
  appTitle: string;
  prevChapter: string;
  nextChapter: string;
  bookSearchPlaceholder: string;
  bookSearchLabel: string;
  noBookMatch: string;
  chapterSelectLabel: string;
  chapterOption: (n: number) => string;
  chineseEditionLabel: string;
  englishEditionLabel: string;
  annotate: string;
  annotateTitle: string;
  annotating: string;
  exitAnnotateTitle: string;
  search: string;
  searchTitle: string;
  history: string;
  historyTitle: string;
  /** Group label of the 简/繁 control. */
  scriptLabel: string;
  /** Name of a script, written in that script. */
  scriptName: (s: ChineseScript) => string;
  /** "Now: X — switch to Y", so the current state and the action are distinct. */
  scriptStatus: (current: ChineseScript) => string;
  fontSmaller: string;
  fontLarger: string;
  stopDownload: string;
  stop: string;
  autoPrefix: string;
  allSelected: string;
  selectedCount: (n: number) => string;
  selectHint: string;
  moreOptions: string;
  offline: string;
  online: string;
  /** Column heading of the English panel. */
  englishColumn: (edition: string) => string;
  bookmarkAdd: string;
  bookmarkRemove: string;
  /** Inline, per column: the other language keeps reading. */
  columnLoadError: (column: 'chinese' | 'english', book: string, chapter: number) => string;
  columnRetry: string;
  columnOfflineNote: string;
  centerDivider: string;
  maximizeEnglish: string;
  maximizeChinese: string;
  restoreAlignment: string;
  restoreAlignmentTitle: string;
  // Search panel
  scopeAll: string;
  scopeBible: string;
  scopeResearch: string;
  scopeNotes: string;
  searchVersesPlaceholder: string;
  searchAllPlaceholder: string;
  searching: string;
  searchButton: string;
  closeSearch: string;
  resultsFound: (n: number) => string;
  firstFifty: string;
  cachedOnly: string;
  noResults: string;
  // Reading history
  historyHeading: string;
  historyClose: string;
  historyLoading: string;
  historyEmpty: string;
  historyEmptySub: string;
  historyChapter: (n: number) => string;
  historyHasNotes: string;
  historyHasResearch: string;
  historyClear: string;
  historyClearConfirm: string;
  justNow: string;
  minutesAgo: (m: number) => string;
  dateLocale: string;
  // Skip link
  skipToReader: string;
}

/** "创世记 Genesis" → the half for this interface language. */
export function bookLabel(name: string, language: UiLanguage): string {
  const at = name.indexOf(' ');
  if (at < 0) return name;
  return language === 'en' ? name.slice(at + 1) : name.slice(0, at);
}

const ZH: ReaderStrings = {
  lang: 'zh-Hans',
  appTitle: '经学研',
  prevChapter: '上一章',
  nextChapter: '下一章',
  bookSearchPlaceholder: '搜索书卷...',
  bookSearchLabel: '书卷',
  noBookMatch: '没有找到匹配的书卷',
  chapterSelectLabel: '章',
  chapterOption: n => `第 ${n} 章`,
  chineseEditionLabel: '中文版本',
  englishEditionLabel: 'English version',
  annotate: '标注',
  annotateTitle: '标注经文 Annotate verses',
  annotating: '标注中',
  exitAnnotateTitle: '退出标注 Exit annotation',
  search: '搜索',
  searchTitle: '搜索经文 Search verses',
  history: '历史',
  historyTitle: '阅读历史',
  scriptLabel: '中文字体',
  scriptName: s => (s === 'simplified' ? '简体' : '繁體'),
  scriptStatus: s => (s === 'simplified' ? '当前：简体 · 点击切换为繁體' : '當前：繁體 · 点击切换为简体'),
  fontSmaller: '缩小字体',
  fontLarger: '放大字体',
  stopDownload: '停止下载',
  stop: '停止',
  autoPrefix: '自动 ',
  allSelected: '已选全章',
  selectedCount: n => `已选 ${n} 节`,
  selectHint: '点击经文或高亮文字',
  moreOptions: '更多选项',
  offline: '离线模式',
  online: '在线',
  englishColumn: e => `English (${e})`,
  bookmarkAdd: '收藏 Bookmark',
  bookmarkRemove: '取消收藏 Remove bookmark',
  columnLoadError: (column, book, chapter) =>
    `无法加载${column === 'chinese' ? '中文' : '英文'}经文：${book} 第 ${chapter} 章。请检查网络连接。`,
  columnRetry: '重试',
  columnOfflineNote: '离线副本',
  centerDivider: '居中分隔线',
  maximizeEnglish: '只看英文',
  maximizeChinese: '只看中文',
  restoreAlignment: '恢复对齐',
  restoreAlignmentTitle: '标注未对齐，点击恢复原来的字号与布局',
  scopeAll: '全部 All',
  scopeBible: '经文 Bible',
  scopeResearch: 'AI研究 Research',
  scopeNotes: '笔记 Notes',
  searchVersesPlaceholder: '搜索经文... Search verses...',
  searchAllPlaceholder: '搜索全部内容... Search all content...',
  searching: '搜索中...',
  searchButton: '搜索 Search',
  closeSearch: '关闭搜索',
  resultsFound: n => `找到 ${n} 条结果`,
  firstFifty: ' (显示前50条)',
  cachedOnly: '在已缓存的章节中搜索',
  noResults: '未找到结果 No results found. 尝试搜索已下载的书卷。',
  historyHeading: '📚 阅读历史',
  historyClose: '关闭',
  historyLoading: '正在载入阅读历史…',
  historyEmpty: '还没有阅读记录',
  historyEmptySub: '最近读过的章节会显示在这里',
  historyChapter: n => `第 ${n} 章`,
  historyHasNotes: '有笔记',
  historyHasResearch: '有 AI 研究',
  historyClear: '清除历史',
  historyClearConfirm: '确定要清除阅读历史吗？',
  justNow: '刚刚',
  minutesAgo: m => `${m} 分钟前`,
  dateLocale: 'zh-CN',
  skipToReader: '跳到经文',
};

const EN: ReaderStrings = {
  lang: 'en',
  appTitle: 'Bible Study',
  prevChapter: 'Previous chapter',
  nextChapter: 'Next chapter',
  bookSearchPlaceholder: 'Search books…',
  bookSearchLabel: 'Book',
  noBookMatch: 'No matching book',
  chapterSelectLabel: 'Chapter',
  chapterOption: n => `Chapter ${n}`,
  chineseEditionLabel: 'Chinese edition',
  englishEditionLabel: 'English edition',
  annotate: 'Annotate',
  annotateTitle: 'Annotate verses',
  annotating: 'Annotating',
  exitAnnotateTitle: 'Exit annotation',
  search: 'Search',
  searchTitle: 'Search verses',
  history: 'History',
  historyTitle: 'Reading history',
  scriptLabel: 'Chinese script',
  scriptName: s => (s === 'simplified' ? 'Simplified' : 'Traditional'),
  scriptStatus: s => (s === 'simplified'
    ? 'Now: Simplified — click to switch to Traditional'
    : 'Now: Traditional — click to switch to Simplified'),
  fontSmaller: 'Smaller text',
  fontLarger: 'Larger text',
  stopDownload: 'Stop download',
  stop: 'Stop',
  autoPrefix: 'Auto ',
  allSelected: 'Whole chapter selected',
  selectedCount: n => `${n} verse${n === 1 ? '' : 's'} selected`,
  selectHint: 'Tap a verse or highlight text',
  moreOptions: 'More options',
  offline: 'Offline',
  online: 'Online',
  englishColumn: e => `English (${e})`,
  bookmarkAdd: 'Bookmark',
  bookmarkRemove: 'Remove bookmark',
  columnLoadError: (column, book, chapter) =>
    `Couldn't load the ${column === 'chinese' ? 'Chinese' : 'English'} text of ${book} ${chapter}. Check your connection.`,
  columnRetry: 'Retry',
  columnOfflineNote: 'Offline copy',
  centerDivider: 'Center divider',
  maximizeEnglish: 'English only',
  maximizeChinese: 'Chinese only',
  restoreAlignment: 'Restore alignment',
  restoreAlignmentTitle: 'Annotations are misaligned. Tap to restore the original font size and layout.',
  scopeAll: 'All',
  scopeBible: 'Bible',
  scopeResearch: 'Research',
  scopeNotes: 'Notes',
  searchVersesPlaceholder: 'Search verses…',
  searchAllPlaceholder: 'Search all content…',
  searching: 'Searching…',
  searchButton: 'Search',
  closeSearch: 'Close search',
  resultsFound: n => `${n} result${n === 1 ? '' : 's'}`,
  firstFifty: ' (showing the first 50)',
  cachedOnly: 'searching downloaded chapters',
  noResults: 'No results found. Try searching books you have downloaded.',
  historyHeading: '📚 Reading History',
  historyClose: 'Close',
  historyLoading: 'Loading history…',
  historyEmpty: 'No reading history yet',
  historyEmptySub: 'Your recently read chapters will appear here',
  historyChapter: n => `Chapter ${n}`,
  historyHasNotes: 'Has notes',
  historyHasResearch: 'Has AI research',
  historyClear: 'Clear History',
  historyClearConfirm: 'Are you sure you want to clear your reading history?',
  justNow: 'Just now',
  minutesAgo: m => `${m}m ago`,
  dateLocale: 'en-US',
  skipToReader: 'Skip to the Bible text',
};

export const READER_STRINGS: Record<UiLanguage, ReaderStrings> = { zh: ZH, en: EN };

export function readerStrings(language: UiLanguage): ReaderStrings {
  return READER_STRINGS[language] ?? ZH;
}

/** BCP 47 tag of the Chinese column in a script. */
export function chineseLang(script: ChineseScript): string {
  return script === 'simplified' ? 'zh-Hans' : 'zh-Hant';
}

/** Interface-language choices for Settings, each written in its own language. */
export const UI_LANGUAGE_OPTIONS: readonly { id: UiLanguage; label: string; lang: string }[] = [
  { id: 'zh', label: '中文', lang: 'zh-Hans' },
  { id: 'en', label: 'English', lang: 'en' },
];

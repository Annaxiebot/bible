import React from 'react';
import { DEFAULT_ENGLISH_VERSION, normalizeChineseVersion } from '../services/bibleStorage';
import { Verse } from '../types';
import { useSeasonTheme } from '../hooks/useSeasonTheme';
import { englishEditionLabel } from '../services/readerPreferences';
import type { ColumnStatus } from '../hooks/useBilingualChapter';
import { useReaderStrings } from './reader/useReaderStrings';
import { chineseLang } from './reader/readerStrings';
import InlineBibleAnnotation, { InlineBibleAnnotationHandle, AnnotationToolState } from './InlineBibleAnnotation';
import VerseIndicators from './VerseIndicators';

interface VerseDataEntry {
  hasNote: boolean;
  hasResearch: boolean;
  notePreview?: string;
  researchCount?: number;
}

interface BibleVersePanelProps {
  /** Already in the display script (BibleViewer converts the Chinese column — useChineseScript). */
  verses: Verse[];
  language: 'chinese' | 'english';
  selectedVerses: number[];
  bookmarkedVerses: Set<string>;
  verseData: Record<string, VerseDataEntry>;
  fontSize: number;
  isSimplified: boolean;
  loading: boolean;
  /** This column's own load result; 'error' shows an inline message + retry for this column only. */
  status?: ColumnStatus;
  /** Showing the cached copy because the source was unreachable. */
  offline?: boolean;
  /** Book name for the error line. */
  bookName?: string;
  onRetry?: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  contentMeasureRef: React.RefObject<HTMLDivElement>;
  annotationRef: React.RefObject<InlineBibleAnnotationHandle>;
  annotationToolState: AnnotationToolState;
  isAnnotationMode: boolean;
  panelWidth: number;
  contentHeight: number;
  bookId: string;
  chapter: number;
  vSplitOffset: number;
  isSwiping?: boolean;
  swipeOffset?: number;
  isPageFlipping?: boolean;
  vibeVerseClassName?: string;
  chineseVersion?: string;
  englishVersion?: string;
  onVerseClick: (verseNum: number, e: React.MouseEvent) => void;
  onScroll: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onVerseIndicatorClick: (verseNum: number, verseText: string) => void;
  onToggleBookmark: (verseNum: number, verseText: string) => void;
  onAlignmentMismatch: (storedFontSize: number, storedVSplitOffset: number) => void;
}

const BibleVersePanel: React.FC<BibleVersePanelProps> = ({
  verses,
  language,
  selectedVerses,
  bookmarkedVerses,
  verseData,
  fontSize,
  isSimplified,
  loading,
  status = 'ready',
  offline = false,
  bookName = '',
  onRetry,
  scrollRef,
  contentMeasureRef,
  annotationRef,
  annotationToolState,
  isAnnotationMode,
  panelWidth,
  contentHeight,
  bookId,
  chapter,
  vSplitOffset,
  isSwiping = false,
  swipeOffset = 0,
  isPageFlipping = false,
  vibeVerseClassName,
  chineseVersion,
  englishVersion,
  onVerseClick,
  onScroll,
  onTouchStart,
  onContextMenu,
  onVerseIndicatorClick,
  onToggleBookmark,
  onAlignmentMismatch,
}) => {
  const { theme } = useSeasonTheme();
  const strings = useReaderStrings();
  const isChinese = language === 'chinese';
  const textLang = isChinese ? chineseLang(isSimplified ? 'simplified' : 'traditional') : 'en';

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const annotationBookId = isChinese ? bookId : `${bookId}_en`;
  const panelId = isChinese ? 'chinese' : 'english';
  const isActive = isChinese
    ? isAnnotationMode && vSplitOffset > 0
    : isAnnotationMode && vSplitOffset < 100;

  // Flex layout based on vSplitOffset
  const flexStyle: React.CSSProperties = isChinese
    ? {
        flexGrow: vSplitOffset >= 100 ? 1 : 0,
        flexShrink: vSplitOffset >= 100 ? 1 : 0,
        flexBasis: vSplitOffset >= 100
          ? 'calc(100% - 20px)'
          : vSplitOffset <= 0
          ? '0%'
          : `calc(${vSplitOffset}% - 10px)`,
        minWidth: 0,
        display: vSplitOffset <= 0 ? 'none' : 'block',
      }
    : {
        flexGrow: vSplitOffset <= 0 ? 1 : 0,
        flexShrink: vSplitOffset <= 0 ? 1 : 0,
        flexBasis: vSplitOffset <= 0
          ? 'calc(100% - 20px)'
          : vSplitOffset >= 100
          ? '0%'
          : `calc(${100 - vSplitOffset}% - 10px)`,
        minWidth: 0,
        display: vSplitOffset >= 100 ? 'none' : 'block',
      };

  const panelStyle: React.CSSProperties = {
    ...flexStyle,
    backgroundColor: theme.paperBg,
    backgroundImage: theme.paperGradient,
    boxShadow: theme.paperShadow,
    position: 'relative',
    // Simple page slide animation for iOS Chinese panel only
    ...(isChinese && isIOS && !isAnnotationMode
      ? {
          transform: `translateX(${swipeOffset}px)`,
          transition: isPageFlipping ? 'transform 0.3s ease-out' : 'none',
          willChange: isSwiping ? 'transform' : 'auto',
        }
      : {}),
    // In annotation mode, disable touch scrolling and text selection
    ...(isAnnotationMode
      ? {
          touchAction: 'pan-y pinch-zoom',
          overflowY: 'auto' as const,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }
      : {}),
  };

  const chineseLabels: Record<string, string> = { cuv: '和合本 CUV' };
  const zhVersion = normalizeChineseVersion(chineseVersion);
  const label = isChinese
    ? (chineseLabels[zhVersion] || zhVersion.toUpperCase())
    : strings.englishColumn(englishEditionLabel(englishVersion || DEFAULT_ENGLISH_VERSION));

  const fontClass = isChinese ? 'overflow-y-auto p-4 md:p-6 space-y-0.5 font-serif-sc border-r border-slate-100' : 'overflow-y-auto p-4 md:p-6 space-y-0.5 font-sans';

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      onTouchStart={onTouchStart}
      onContextMenu={onContextMenu}
      className={fontClass}
      style={panelStyle}
      data-testid={`reader-column-${language}`}
      aria-busy={loading || status === 'loading'}
    >
      {/* Annotation overlay */}
      <InlineBibleAnnotation
        ref={annotationRef}
        bookId={annotationBookId}
        chapter={chapter}
        isActive={isActive}
        contentHeight={contentHeight}
        containerWidth={panelWidth}
        fontSize={fontSize}
        vSplitOffset={vSplitOffset}
        accentColor={theme.accent}
        panelId={panelId}
        toolState={annotationToolState}
        onAlignmentMismatch={onAlignmentMismatch}
      />
      <div ref={contentMeasureRef}>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4" lang={isChinese ? 'zh-Hans' : 'en'}>
          {label}
          {offline && <span className="ml-2 normal-case tracking-normal font-medium" lang={strings.lang}>· {strings.columnOfflineNote}</span>}
        </div>
        {status === 'error' && !loading ? (
          // This column only: the other language keeps its text (2026-10 review).
          <div role="alert" lang={strings.lang} data-testid={`reader-column-error-${language}`}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800 not-italic font-sans">
            <p>{strings.columnLoadError(language, bookName, chapter)}</p>
            {onRetry && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="mt-2 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
                {strings.columnRetry}
              </button>
            )}
          </div>
        ) : loading || status === 'loading' ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n} className="h-4 bg-slate-100 rounded w-full"></div>
            ))}
          </div>
        ) : (
          verses.map(v => {
            const verseId = `${bookId}:${chapter}:${v.verse}`;
            const isBookmarked = bookmarkedVerses.has(verseId);
            const isSelected = selectedVerses.includes(v.verse);
            const vData = verseData[verseId];

            const displayText = v.text;

            const verseNumColor = isChinese ? '#8B7355' : theme.accentMedium;
            const textColor = isChinese ? '#3A3028' : undefined;

            return (
              <div
                key={`${language}-${v.verse}`}
                data-verse={v.verse}
                onClick={(e) => !isAnnotationMode && onVerseClick(v.verse, e)}
                className={`verse-content p-1 rounded-lg transition-all border ${isChinese ? 'relative group/verse' : 'group/verse'} ${
                  isSelected
                    ? 'shadow-sm'
                    : 'border-transparent hover:bg-slate-50'
                }`}
                style={{
                  cursor: isAnnotationMode ? 'default' : 'pointer',
                  pointerEvents: isAnnotationMode ? 'none' : 'auto',
                  userSelect: isAnnotationMode ? 'none' : 'text',
                  WebkitUserSelect: isAnnotationMode ? 'none' : 'text',
                  WebkitTouchCallout: isAnnotationMode ? 'none' : 'default',
                  touchAction: isAnnotationMode ? 'none' : 'auto',
                  ...(isSelected
                    ? { backgroundColor: theme.verseHighlight, borderColor: theme.verseBorder }
                    : {}),
                }}
              >
                <span className="font-bold mr-3 text-xs" style={{ color: verseNumColor }}>{v.verse}</span>
                <span
                  lang={textLang}
                  className={`leading-relaxed ${isChinese ? '' : `text-slate-700 italic ${vibeVerseClassName || ''}`}`}
                  style={{ fontSize: `${fontSize}px`, color: textColor }}
                >
                  {displayText}
                </span>
                {/* Bookmark icon */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBookmark(v.verse, v.text);
                  }}
                  className={`inline-block ml-1 align-middle transition-all ${
                    isBookmarked
                      ? 'opacity-100'
                      : 'text-slate-400 opacity-100 sm:opacity-0 sm:group-hover/verse:opacity-60 hover:!opacity-100'
                  }`}
                  title={isBookmarked ? strings.bookmarkRemove : strings.bookmarkAdd}
                  aria-label={isBookmarked ? strings.bookmarkRemove : strings.bookmarkAdd}
                  aria-pressed={isBookmarked}
                  style={{
                    fontSize: '14px',
                    lineHeight: 1,
                    padding: '4px',
                    color: isBookmarked ? theme.heartColor : undefined,
                  }}
                >
                  {isBookmarked ? '♥' : '♡'}
                </button>
                {/* VerseIndicators only for Chinese panel */}
                {isChinese && (
                  <VerseIndicators
                    hasNote={vData?.hasNote || false}
                    hasResearch={vData?.hasResearch || false}
                    notePreview={vData?.notePreview}
                    researchCount={vData?.researchCount || 0}
                    onClick={() => onVerseIndicatorClick(v.verse, v.text)}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BibleVersePanel;

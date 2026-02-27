import { VerseData } from '../../types/verseData';
import { AnnotationRecord } from '../annotationStorage';
import { Bookmark } from '../bookmarkStorage';
import { ReadingPlanState } from '../readingPlanStorage';
import { ReadingPosition, ChapterHistory } from '../readingHistory';

/** @deprecated Use ReadingPosition from services/readingHistory */
export type ReadingPositionData = ReadingPosition;

/** @deprecated Use ChapterHistory from services/readingHistory */
export type ChapterHistoryEntry = ChapterHistory;

export interface BibleNotesExport {
  version: '1.0';
  exportDate: string;
  deviceId?: string;
  metadata: {
    totalNotes: number;
    totalResearch: number;
    booksIncluded: string[];
  };
  data: {
    [verseId: string]: VerseData;
  };
}

export interface BibleTextExport {
  version: '1.0';
  exportDate: string;
  metadata: {
    totalChapters: number;
    translations: string[];
  };
  chapters: Array<{
    bookId: string;
    chapter: number;
    translation: string;
    data: unknown;
  }>;
}

export type MergeStrategy = 'replace' | 'merge_newer' | 'merge_combine' | 'skip_existing';

export type ProgressCallback = (stage: string, percent: number) => void;

/**
 * @deprecated v3.0 format. Use FullBackupExport_v4 from services/backup/types for new code.
 * Kept for backward compatibility with existing export/import flow.
 */
export interface FullBackupExport {
  version: '3.0';
  exportDate: string;
  deviceId?: string;
  notes: BibleNotesExport;
  bibleTexts: BibleTextExport;
  annotations: AnnotationRecord[];
  bookmarks: Bookmark[];
  readingHistory: {
    history: ChapterHistoryEntry[];
    lastRead: ReadingPositionData | null;
    position: ReadingPositionData | null;
  };
  readingPlans: ReadingPlanState[];
  metadata: {
    totalNotes: number;
    totalResearch: number;
    totalAnnotations: number;
    totalBookmarks: number;
    totalHistoryEntries: number;
    totalPlans: number;
  };
}

// Re-export v4 canonical backup type from backup/types.ts
export type { FullBackupExport_v4 } from '../backup/types';

export interface BackupSummaryData {
  version?: string;
  exportDate?: string;
  notes: number;
  aiResearch: number;
  annotations: number;
  bookmarks: number;
  historyEntries: number;
  readingPlans: number;
  bibleChapters: number;
}

export interface NotesImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface BibleImportResult {
  success: boolean;
  imported: number;
  errors: string[];
}

export interface CombinedImportResult {
  success: boolean;
  notesImported: number;
  notesSkipped: number;
  chaptersImported: number;
  annotationsImported: number;
  bookmarksImported: number;
  historyRestored: boolean;
  plansImported: number;
  errors: string[];
}

export const EMPTY_SUMMARY: BackupSummaryData = {
  notes: 0,
  aiResearch: 0,
  annotations: 0,
  bookmarks: 0,
  historyEntries: 0,
  readingPlans: 0,
  bibleChapters: 0,
};

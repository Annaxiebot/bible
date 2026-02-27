/**
 * Backup/Restore Types for v4.0 Format
 *
 * Enhanced types for backup with images support
 */

import { VerseData } from '../../types/verseData';
import { ChapterStorageData } from '../bibleStorage';
import { AnnotationRecord } from '../annotationStorage';
import { Bookmark } from '../bookmarkStorage';
import { ReadingPlanState } from '../readingPlanStorage';

/** Mirrors ReadingPosition from readingHistory.ts */
interface ReadingPosition {
  bookId: string;
  bookName: string;
  chapter: number;
  timestamp: number;
}

/** Mirrors ChapterHistory from readingHistory.ts */
interface ChapterHistory {
  bookId: string;
  bookName: string;
  chapter: number;
  lastRead: number;
  hasNotes?: boolean;
  hasAIResearch?: boolean;
}

// ============================================================================
// Enhanced MediaAttachment (v4.0)
// ============================================================================

export interface MediaAttachment {
  id: string;                    // UUID
  type: 'image' | 'audio' | 'video';

  // Storage
  data: string;                  // base64 encoded image data
  mimeType: string;              // e.g., 'image/jpeg', 'image/png'
  size: number;                  // bytes

  // Thumbnails
  thumbnail?: string;            // base64 encoded thumbnail (max 150x150)

  // Metadata
  caption?: string;
  filename?: string;             // original filename
  timestamp: number;             // when added

  // Dimensions (for images)
  width?: number;
  height?: number;

  // Compression info
  originalSize?: number;         // pre-compression size
  quality?: number;              // compression quality (0-100)
}

// ============================================================================
// Backup Format v4.0
// ============================================================================

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
    translation: 'cuv' | 'web';
    data: ChapterStorageData;
  }>;
}

export interface FullBackupExport_v4 {
  version: '4.0';
  exportDate: string;
  deviceId?: string;

  // Existing data
  notes: BibleNotesExport;
  bibleTexts: BibleTextExport;
  annotations: AnnotationRecord[];
  bookmarks: Bookmark[];
  readingHistory: {
    history: ChapterHistory[];
    lastRead: ReadingPosition | null;
    position: ReadingPosition | null;
  };
  readingPlans: ReadingPlanState[];

  // NEW: Media attachments
  media: {
    images: MediaAttachment[];
    // Future: audio, video
  };

  // Enhanced metadata
  metadata: {
    totalNotes: number;
    totalResearch: number;
    totalAnnotations: number;
    totalBookmarks: number;
    totalHistoryEntries: number;
    totalPlans: number;
    totalImages: number;          // NEW
    totalMediaSize: number;       // NEW - total bytes
    backupSize: number;           // NEW - total backup size
    compressionRatio?: number;    // NEW - if compressed
  };
}

// ============================================================================
// Service Options & Callbacks
// ============================================================================

export type ProgressCallback = (stage: string, percent: number, message?: string) => void;

export type MergeStrategy = 'replace' | 'merge_newer' | 'merge_combine' | 'skip_existing';

export interface BackupOptions {
  includeNotes?: boolean;          // default: true
  includeBibleTexts?: boolean;     // default: true
  includeAnnotations?: boolean;    // default: true
  includeBookmarks?: boolean;      // default: true
  includeHistory?: boolean;        // default: true
  includePlans?: boolean;          // default: true
  includeMedia?: boolean;          // default: true

  compressImages?: boolean;        // default: true
  imageQuality?: number;           // default: 0.85

  onProgress?: ProgressCallback;
}

export interface RestoreOptions {
  notesStrategy?: MergeStrategy;        // default: 'merge_combine'
  textsStrategy?: MergeStrategy;        // default: 'skip_existing'
  annotationsStrategy?: MergeStrategy;  // default: 'merge_combine'
  bookmarksStrategy?: MergeStrategy;    // default: 'skip_existing'
  historyStrategy?: MergeStrategy;      // default: 'merge_combine'
  plansStrategy?: MergeStrategy;        // default: 'skip_existing'
  mediaStrategy?: MergeStrategy;        // default: 'skip_existing'

  onProgress?: ProgressCallback;

  // Safety options
  dryRun?: boolean;                     // Validate only, don't import
  createBackupBefore?: boolean;         // Create backup before restore
}

// ============================================================================
// Results & Validation
// ============================================================================

export interface BackupResult {
  success: boolean;
  data?: FullBackupExport_v4;
  size?: number;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  imported: {
    notes: number;
    texts: number;
    annotations: number;
    bookmarks: number;
    history: number;
    plans: number;
    images: number;
  };
  skipped: {
    notes: number;
    texts: number;
    annotations: number;
    bookmarks: number;
    history: number;
    plans: number;
    images: number;
  };
  errors: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats?: {
    totalSize: number;
    imageCount: number;
    averageImageSize: number;
    largestImage: number;
  };
}

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
  images?: number;              // NEW
  mediaSize?: number;           // NEW
}

// ============================================================================
// IndexedDB Schema for Media
// ============================================================================

export interface MediaDBRecord {
  id: string;              // imageId
  noteId: string;          // Reference to note (verseId)
  type: 'image' | 'audio' | 'video';
  data: string;            // base64
  thumbnail?: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  caption?: string;
  filename?: string;
  timestamp: number;
  originalSize?: number;
  quality?: number;
}

// ============================================================================
// Storage Options
// ============================================================================

export interface SaveImageOptions {
  maxWidth?: number;           // default: 1920
  maxHeight?: number;          // default: 1920
  quality?: number;            // default: 0.85
  generateThumbnail?: boolean; // default: true
}

export interface StorageStats {
  totalImages: number;
  totalSize: number;
  quotaUsed: number;
  quotaRemaining: number;
}

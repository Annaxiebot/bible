/**
 * types.ts
 * 
 * Shared type definitions for Google Drive sync.
 * Future-proof schemas include optional location and context data.
 */

// =====================================================
// NOTES
// =====================================================

export interface Note {
  id: string;
  bookId: string;
  chapter: number;
  verse?: number;
  content: string;
  createdAt: number;
  updatedAt: number;
  
  // Future context (not used yet, but schema ready)
  location?: {
    lat: number;
    lon: number;
    placeName?: string;
    city?: string;
  };
  context?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    dayOfWeek?: string;
  };
}

// =====================================================
// BOOKMARKS
// =====================================================

export interface Bookmark {
  id: string;
  bookId: string;
  bookName: string;
  chapter: number;
  verse?: number;
  textPreview?: string;
  createdAt: number;
}

// =====================================================
// ANNOTATIONS
// =====================================================

export interface Annotation {
  id: string;
  bookId: string;
  chapter: number;
  verse?: number;
  strokes: Stroke[];
  canvasHeight?: number;
  canvasWidth?: number;
  fontSize?: number;
  vSplitOffset?: number;
  panelId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Stroke {
  points: StrokePoint[];
  color: string;
  size: number;
}

export interface StrokePoint {
  x: number;  // 0-1 relative
  y: number;  // 0-1 relative
  pressure: number;
}

// =====================================================
// PHOTOS
// =====================================================

export interface Photo {
  id: string;
  filename: string;  // e.g., "2026-02-23-001.jpg"
  mimeType: string;
  caption?: string;
  bookId?: string;
  chapter?: number;
  verse?: number;
  createdAt: number;
}

// =====================================================
// SETTINGS
// =====================================================

export interface AppSettings {
  fontSize: number;
  chineseMode: 'simplified' | 'traditional';
  theme: 'light' | 'dark' | 'sepia';
  autoSync?: boolean;
  lastSyncTime?: number;
}

// =====================================================
// READING HISTORY
// =====================================================

export interface ReadingHistoryEntry {
  bookId: string;
  bookName: string;
  chapter: number;
  lastRead: number;
  hasNotes?: boolean;
  hasAIResearch?: boolean;
}

export interface ReadingPosition {
  bookId: string;
  bookName: string;
  chapter: number;
  timestamp: number;
}

// =====================================================
// VERSE DATA
// =====================================================

export interface VerseData {
  bookId: string;
  chapter: number;
  verses: number[];
  personalNote?: PersonalNote;
  highlights?: VerseHighlight[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PersonalNote {
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface VerseHighlight {
  verse: number;
  color: string;
  createdAt: number;
}

// =====================================================
// READING PLANS
// =====================================================

export interface ReadingPlan {
  id: string;
  name: string;
  description?: string;
  chapters: ReadingPlanChapter[];
  currentIndex: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ReadingPlanChapter {
  bookId: string;
  bookName: string;
  chapter: number;
  completed: boolean;
  completedAt?: number;
}

// =====================================================
// GOOGLE DRIVE SYNC
// =====================================================

export interface SyncState {
  lastSyncTime: number;
  isSyncing: boolean;
  lastError?: string;
}

export interface FileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size: number;
}

// =====================================================
// GENERIC JSON DATA
// =====================================================

/**
 * Generic type for JSON-serializable data.
 * Used for Drive file operations.
 */
export type JsonValue = 
  | string 
  | number 
  | boolean 
  | null 
  | JsonValue[] 
  | { [key: string]: JsonValue };

/**
 * Type alias for file data read from Drive.
 * More specific than 'any' but allows flexibility for different file types.
 */
export type DriveFileData = JsonValue;

// =====================================================
// GOOGLE API TYPES (augmenting external types)
// =====================================================

/**
 * File response from Google Drive API.
 */
export interface DriveFileResponse {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  [key: string]: unknown;
}

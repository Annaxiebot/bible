/**
 * idbService.ts
 *
 * Unified IndexedDB service for the Bible app.
 * Consolidates all 6 previously separate databases into a single 'BibleApp' database.
 *
 * Stores:
 *   bibleChapters  — cached chapter data (formerly BibleAppDB)
 *   metadata       — key/value metadata (formerly BibleAppDB)
 *   notes          — simple reference-keyed notes (formerly BibleNotesDB)
 *   bookmarks      — bookmarked verses (formerly BibleBookmarksDB)
 *   verseData      — per-verse personal notes + AI research (formerly BibleVerseData)
 *   annotations    — canvas drawing data (formerly BibleAnnotationsDB)
 *   readingPlans   — reading plan states (formerly BibleReadingPlanDB)
 */

import { openDB, IDBPDatabase, DBSchema, StoreNames, IndexNames, IndexKey, StoreValue } from 'idb';
import { BibleResponse } from '../types';
import { VerseData } from '../types/verseData';

// ---------------------------------------------------------------------------
// Types for stores (defined here to avoid circular imports)
// ---------------------------------------------------------------------------

/** Stored chapter data — always has verses; other BibleResponse fields are optional */
export type ChapterStorageData = Pick<BibleResponse, 'verses'> & Partial<Omit<BibleResponse, 'verses'>>;

export interface ChapterRecord {
  id: string;
  bookId: string;
  chapter: number;
  translation: string;
  data: ChapterStorageData;
}

export interface MetadataRecord {
  key: string;
  value: string | number | boolean | object;
}

export interface NoteRecord {
  reference: string;
  data: string;
  lastModified: number;
}

export interface Bookmark {
  id: string; // format: bookId:chapter:verse
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  textPreview: string;
  createdAt: number;
}

/** Serialized annotation data for a single chapter */
export interface AnnotationRecord {
  /** Composite key: "bookId:chapter" or "bookId:chapter:panelId" */
  id: string;
  bookId: string;
  chapter: number;
  /** JSON-serialized array of drawing paths */
  canvasData: string;
  /** Extra expanded height in pixels (0 = no expansion) */
  canvasHeight: number;
  /** CSS pixel width of the canvas when annotation was saved */
  canvasWidth?: number;
  /** Font size used when annotation was drawn */
  fontSize?: number;
  /** Vertical split offset (0-100) when annotation was drawn */
  vSplitOffset?: number;
  /** Timestamp of last modification */
  lastModified: number;
  /** Panel identifier (chinese or english) - optional for backwards compat */
  panelId?: string;
}

export interface JournalEntry {
  id: string;
  title: string;
  content: string; // HTML
  plainText: string;
  drawing?: string; // Canvas data (strokes or data URL)
  bookId?: string;
  chapter?: number;
  verseRef?: string;
  tags: string[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export type PlanType = 'bible-in-year' | 'nt-90-days' | 'psalms-proverbs';

export interface ReadingPlanState {
  id: string; // plan type
  planType: PlanType;
  startDate: string; // ISO date string
  completedDays: string[]; // ISO date strings of completed days
  currentDay: number; // 0-indexed day number
  active: boolean;
}

// ---------------------------------------------------------------------------
// Unified schema
// ---------------------------------------------------------------------------

export interface BibleAppSchema extends DBSchema {
  bibleChapters: {
    key: string;
    value: ChapterRecord;
    indexes: {
      'bookChapter': [string, number, string];
    };
  };
  metadata: {
    key: string;
    value: MetadataRecord;
  };
  notes: {
    key: string;
    value: NoteRecord;
  };
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: {
      'by-created': number;
    };
  };
  verseData: {
    key: string;
    value: VerseData;
    indexes: {
      'by-book': string;
      'by-chapter': [string, number];
      'by-timestamp': number;
    };
  };
  annotations: {
    key: string;
    value: AnnotationRecord;
    indexes: {
      'by-book': string;
      'by-modified': number;
    };
  };
  readingPlans: {
    key: string;
    value: ReadingPlanState;
  };
  journal: {
    key: string;
    value: JournalEntry;
    indexes: {
      'by-created': string;
      'by-updated': string;
      'by-bookId': string;
    };
  };
}

// ---------------------------------------------------------------------------
// IDBService class
// ---------------------------------------------------------------------------

const DB_NAME = 'BibleApp';
const DB_VERSION = 2;

class IDBService {
  private dbPromise: Promise<IDBPDatabase<BibleAppSchema>>;

  constructor() {
    this.dbPromise = openDB<BibleAppSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // bibleChapters
        if (!db.objectStoreNames.contains('bibleChapters')) {
          const chaptersStore = db.createObjectStore('bibleChapters', { keyPath: 'id' });
          chaptersStore.createIndex('bookChapter', ['bookId', 'chapter', 'translation'], { unique: false });
        }

        // metadata
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }

        // notes (out-of-line key — key is the reference string)
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes');
        }

        // bookmarks
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bookmarksStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bookmarksStore.createIndex('by-created', 'createdAt');
        }

        // verseData
        if (!db.objectStoreNames.contains('verseData')) {
          const verseStore = db.createObjectStore('verseData', { keyPath: 'id' });
          verseStore.createIndex('by-book', 'bookId');
          verseStore.createIndex('by-chapter', ['bookId', 'chapter']);
          verseStore.createIndex('by-timestamp', 'personalNote.updatedAt');
        }

        // annotations
        if (!db.objectStoreNames.contains('annotations')) {
          const annotationsStore = db.createObjectStore('annotations', { keyPath: 'id' });
          annotationsStore.createIndex('by-book', 'bookId');
          annotationsStore.createIndex('by-modified', 'lastModified');
        }

        // readingPlans
        if (!db.objectStoreNames.contains('readingPlans')) {
          db.createObjectStore('readingPlans', { keyPath: 'id' });
        }

        // journal (added in v2)
        if (!db.objectStoreNames.contains('journal')) {
          const journalStore = db.createObjectStore('journal', { keyPath: 'id' });
          journalStore.createIndex('by-created', 'createdAt');
          journalStore.createIndex('by-updated', 'updatedAt');
          journalStore.createIndex('by-bookId', 'bookId');
        }
      },
    });
  }

  /** Get the raw IDBPDatabase instance (for advanced operations like cursors and transactions). */
  async getDB(): Promise<IDBPDatabase<BibleAppSchema>> {
    return this.dbPromise;
  }

  async get<Name extends StoreNames<BibleAppSchema>>(
    store: Name,
    key: IDBValidKey | IDBKeyRange
  ): Promise<StoreValue<BibleAppSchema, Name> | undefined> {
    const db = await this.dbPromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return db.get(store, key as any);
  }

  async getAll<Name extends StoreNames<BibleAppSchema>>(
    store: Name
  ): Promise<StoreValue<BibleAppSchema, Name>[]> {
    const db = await this.dbPromise;
    return db.getAll(store);
  }

  async getAllKeys<Name extends StoreNames<BibleAppSchema>>(
    store: Name
  ): Promise<IDBValidKey[]> {
    const db = await this.dbPromise;
    return db.getAllKeys(store);
  }

  async put<Name extends StoreNames<BibleAppSchema>>(
    store: Name,
    value: StoreValue<BibleAppSchema, Name>,
    key?: IDBValidKey
  ): Promise<IDBValidKey> {
    const db = await this.dbPromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return db.put(store, value, key as any);
  }

  async delete<Name extends StoreNames<BibleAppSchema>>(
    store: Name,
    key: IDBValidKey | IDBKeyRange
  ): Promise<void> {
    const db = await this.dbPromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return db.delete(store, key as any);
  }

  async getAllFromIndex<
    Name extends StoreNames<BibleAppSchema>,
    IndexName extends IndexNames<BibleAppSchema, Name>
  >(
    store: Name,
    indexName: IndexName,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<StoreValue<BibleAppSchema, Name>[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex(store, indexName, query as IndexKey<BibleAppSchema, Name, IndexName>);
  }

  async clear<Name extends StoreNames<BibleAppSchema>>(store: Name): Promise<void> {
    const db = await this.dbPromise;
    return db.clear(store);
  }

  async count<Name extends StoreNames<BibleAppSchema>>(store: Name): Promise<number> {
    const db = await this.dbPromise;
    return db.count(store);
  }
}

export const idbService = new IDBService();

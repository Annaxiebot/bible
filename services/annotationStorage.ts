/**
 * annotationStorage.ts
 * 
 * IndexedDB storage service for Bible annotation data.
 * Stores per-chapter canvas drawing data (serialized paths) and expanded canvas height.
 * Uses the `idb` library for clean async IndexedDB access.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

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
  /** Timestamp of last modification */
  lastModified: number;
  /** Panel identifier (chinese or english) - optional for backwards compat */
  panelId?: string;
}

interface AnnotationDB extends DBSchema {
  annotations: {
    key: string;
    value: AnnotationRecord;
    indexes: {
      'by-book': string;
      'by-modified': number;
    };
  };
}

class AnnotationStorageService {
  private dbPromise: Promise<IDBPDatabase<AnnotationDB>>;

  constructor() {
    this.dbPromise = openDB<AnnotationDB>('BibleAnnotationsDB', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('annotations')) {
          const store = db.createObjectStore('annotations', { keyPath: 'id' });
          store.createIndex('by-book', 'bookId');
          store.createIndex('by-modified', 'lastModified');
        }
      },
    });
  }

  /**
   * Save annotation data for a specific book+chapter+panel.
   * Creates or overwrites existing annotation.
   */
  async saveAnnotation(
    bookId: string,
    chapter: number,
    canvasData: string,
    canvasHeight: number,
    panelId?: 'chinese' | 'english'
  ): Promise<void> {
    try {
      const db = await this.dbPromise;
      const id = panelId ? `${bookId}:${chapter}:${panelId}` : `${bookId}:${chapter}`;
      await db.put('annotations', {
        id,
        bookId,
        chapter,
        canvasData,
        canvasHeight,
        lastModified: Date.now(),
        panelId,
      });
    } catch (error) {
      console.error('Failed to save annotation:', error);
      throw error;
    }
  }

  /**
   * Retrieve annotation data for a specific book+chapter+panel.
   * Returns null if no annotation exists.
   */
  async getAnnotation(
    bookId: string,
    chapter: number,
    panelId?: 'chinese' | 'english'
  ): Promise<{ data: string; height: number } | null> {
    try {
      const db = await this.dbPromise;
      const id = panelId ? `${bookId}:${chapter}:${panelId}` : `${bookId}:${chapter}`;
      let record = await db.get('annotations', id);
      
      // Backwards compatibility: try without panelId if not found
      if (!record && panelId) {
        const oldId = `${bookId}:${chapter}`;
        record = await db.get('annotations', oldId);
      }
      
      if (!record) return null;
      return {
        data: record.canvasData,
        height: record.canvasHeight,
      };
    } catch (error) {
      console.error('Failed to get annotation:', error);
      return null;
    }
  }

  /**
   * Delete annotation data for a specific book+chapter+panel.
   */
  async deleteAnnotation(bookId: string, chapter: number, panelId?: 'chinese' | 'english'): Promise<void> {
    try {
      const db = await this.dbPromise;
      const id = panelId ? `${bookId}:${chapter}:${panelId}` : `${bookId}:${chapter}`;
      await db.delete('annotations', id);
    } catch (error) {
      console.error('Failed to delete annotation:', error);
      throw error;
    }
  }

  /**
   * Get all annotations for a given book (for checking which chapters have annotations).
   */
  async getAnnotationsForBook(bookId: string): Promise<AnnotationRecord[]> {
    try {
      const db = await this.dbPromise;
      return await db.getAllFromIndex('annotations', 'by-book', bookId);
    } catch (error) {
      console.error('Failed to get annotations for book:', error);
      return [];
    }
  }
}

export const annotationStorage = new AnnotationStorageService();

/**
 * annotationStorage.ts
 *
 * IndexedDB storage service for Bible annotation data.
 * Stores per-chapter canvas drawing data (serialized paths) and expanded canvas height.
 * Uses the unified idbService for all IndexedDB access.
 */

import { idbService } from './idbService';
import { verseDataStorage } from './verseDataStorage';

// Re-export AnnotationRecord from idbService so consumers don't need to change imports
export type { AnnotationRecord } from './idbService';
import type { AnnotationRecord } from './idbService';

class AnnotationStorageService {
  /** Track which chapters already have their note ensured (avoids repeated DB queries during drawing) */
  private _ensuredNotes = new Set<string>();

  /**
   * Save annotation data for a specific book+chapter+panel.
   * Creates or overwrites existing annotation.
   */
  async saveAnnotation(
    bookId: string,
    chapter: number,
    canvasData: string,
    canvasHeight: number,
    panelId?: 'chinese' | 'english',
    canvasWidth?: number,
    fontSize?: number,
    vSplitOffset?: number
  ): Promise<void> {
    try {
      const id = panelId ? `${bookId}:${chapter}:${panelId}` : `${bookId}:${chapter}`;
      await idbService.put('annotations', {
        id,
        bookId,
        chapter,
        canvasData,
        canvasHeight,
        canvasWidth,
        fontSize,
        vSplitOffset,
        lastModified: Date.now(),
        panelId,
      });

      // Notify listeners (e.g. Data Summary stats) that annotations changed
      window.dispatchEvent(new Event('annotation-updated'));

      // Auto-create a chapter-level note so annotations appear in notes list/print
      // Only check once per book+chapter to avoid repeated DB queries during drawing
      const noteKey = `${bookId}:${chapter}`;
      if (!this._ensuredNotes.has(noteKey)) {
        this._ensuredNotes.add(noteKey);
        this.ensureChapterNote(bookId, chapter, canvasData).catch(() => {});
      }
    } catch (error) {
      // TODO: use error reporting service
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
  ): Promise<{ data: string; height: number; width: number; fontSize: number; vSplitOffset: number } | null> {
    try {
      const id = panelId ? `${bookId}:${chapter}:${panelId}` : `${bookId}:${chapter}`;
      let record = await idbService.get('annotations', id);

      // Backwards compatibility: try without panelId if not found
      if (!record && panelId) {
        const oldId = `${bookId}:${chapter}`;
        record = await idbService.get('annotations', oldId);
      }

      if (!record) return null;
      return {
        data: record.canvasData,
        height: record.canvasHeight,
        width: record.canvasWidth || 0,
        fontSize: record.fontSize || 0,
        vSplitOffset: record.vSplitOffset ?? -1, // -1 = not stored
      };
    } catch (error) {
      // silently handle
      return null;
    }
  }

  /**
   * Delete annotation data for a specific book+chapter+panel.
   */
  async deleteAnnotation(bookId: string, chapter: number, panelId?: 'chinese' | 'english'): Promise<void> {
    try {
      const id = panelId ? `${bookId}:${chapter}:${panelId}` : `${bookId}:${chapter}`;
      await idbService.delete('annotations', id);
      window.dispatchEvent(new Event('annotation-updated'));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Ensure a chapter-level note exists in verseDataStorage when annotations are present.
   * Creates a note with marker text if none exists; skips if one already exists.
   */
  private async ensureChapterNote(bookId: string, chapter: number, canvasData: string): Promise<void> {
    // Check if annotation data has actual paths (not empty array)
    try {
      const paths = JSON.parse(canvasData);
      if (!Array.isArray(paths) || paths.length === 0) return;
    } catch { return; }

    const existing = await verseDataStorage.getVerseData(bookId, chapter, []);
    if (existing?.personalNote) return; // Already has a note, don't overwrite

    const now = Date.now();
    await verseDataStorage.savePersonalNote(bookId, chapter, [], {
      text: '[Has handwritten annotations]',
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Get all annotations for a given book (for checking which chapters have annotations).
   */
  async getAllAnnotations(): Promise<AnnotationRecord[]> {
    try {
      return await idbService.getAll('annotations');
    } catch (error) {
      // silently handle
      return [];
    }
  }

  async importAnnotation(record: AnnotationRecord): Promise<void> {
    await idbService.put('annotations', record);
  }

  async clearAllAnnotations(): Promise<void> {
    try {
      await idbService.clear('annotations');
      this._ensuredNotes.clear();
      window.dispatchEvent(new Event('annotation-updated'));
    } catch (error) {
      throw error;
    }
  }

  async getAnnotationsForBook(bookId: string): Promise<AnnotationRecord[]> {
    try {
      return await idbService.getAllFromIndex('annotations', 'by-book', bookId);
    } catch (error) {
      // silently handle
      return [];
    }
  }
}

export const annotationStorage = new AnnotationStorageService();

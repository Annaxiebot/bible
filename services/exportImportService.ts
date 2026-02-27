import { verseDataStorage } from './verseDataStorage';
import { annotationStorage } from './annotationStorage';
import { bookmarkStorage } from './bookmarkStorage';
import { readingHistory } from './readingHistory';
import { readingPlanStorage } from './readingPlanStorage';
import { downloadFile } from './export/fileDownloader';
import { exportToJSON, exportToMarkdown, exportToHTML } from './export/notesExporter';
import { importFromJSON } from './export/notesImporter';
import { exportBibleTexts, importBibleTexts } from './export/bibleTextExportImport';
import { exportAndDownloadAll } from './export/fullBackupExporter';
import { importCombinedBackup } from './export/fullBackupImporter';
import { parseBackupSummary } from './export/backupSummaryParser';

// Re-export types for backward compatibility
export type {
  BibleNotesExport,
  BibleTextExport,
  FullBackupExport,
  BackupSummaryData,
  MergeStrategy,
  ProgressCallback,
} from './export/exportTypes';

class ExportImportService {
  private deviceId: string;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
  }

  private getOrCreateDeviceId(): string {
    let id = localStorage.getItem('bible_device_id');
    if (!id) {
      id = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('bible_device_id', id);
    }
    return id;
  }

  async getLocalSummary() {
    const [allData, annotations, bookmarks, history, plans, bibleChapters] = await Promise.all([
      verseDataStorage.getAllData(),
      annotationStorage.getAllAnnotations(),
      bookmarkStorage.getAllBookmarks(),
      Promise.resolve(readingHistory.getHistory()),
      readingPlanStorage.getAllPlans(),
      (await import('./bibleStorage')).bibleStorage.getAllChapters(),
    ]);
    return {
      notes: allData.filter(d => d.personalNote).length,
      aiResearch: allData.reduce((acc, d) => acc + d.aiResearch.length, 0),
      annotations: annotations.length,
      bookmarks: bookmarks.length,
      historyEntries: history.length,
      readingPlans: plans.length,
      bibleChapters: bibleChapters.length,
    };
  }

  parseBackupSummary(jsonString: string) {
    return parseBackupSummary(jsonString);
  }

  async exportToJSON() {
    return exportToJSON(this.deviceId);
  }

  async exportToMarkdown() {
    return exportToMarkdown();
  }

  async exportToHTML() {
    return exportToHTML();
  }

  downloadFile(content: string, filename: string, mimeType: string) {
    downloadFile(content, filename, mimeType);
  }

  async exportAndDownload(format: 'json' | 'markdown' | 'html' = 'json') {
    const timestamp = new Date().toISOString().split('T')[0];
    try {
      const exporters: Record<string, () => Promise<{ content: string; ext: string; mime: string }>> = {
        json: async () => ({ content: await this.exportToJSON(), ext: 'json', mime: 'application/json' }),
        markdown: async () => ({ content: await this.exportToMarkdown(), ext: 'md', mime: 'text/markdown' }),
        html: async () => ({ content: await this.exportToHTML(), ext: 'html', mime: 'text/html' }),
      };
      const { content, ext, mime } = await exporters[format]();
      downloadFile(content, `bible-notes-${timestamp}.${ext}`, mime);
      return { success: true };
    } catch (error) {
      // TODO: use error reporting service
      return { success: false, error };
    }
  }

  async importFromJSON(jsonString: string, strategy: import('./export/exportTypes').MergeStrategy = 'merge_combine') {
    return importFromJSON(jsonString, strategy);
  }

  async exportBibleTexts() {
    return exportBibleTexts();
  }

  async importBibleTexts(jsonString: string) {
    return importBibleTexts(jsonString);
  }

  async exportAll() {
    const [notes, bibleTexts] = await Promise.all([
      this.exportToJSON(),
      this.exportBibleTexts(),
    ]);
    return { notes, bibleTexts };
  }

  async exportAndDownloadAll(onProgress?: import('./export/exportTypes').ProgressCallback) {
    return exportAndDownloadAll(this.deviceId, onProgress);
  }

  async importCombinedBackup(
    jsonString: string,
    notesStrategy: import('./export/exportTypes').MergeStrategy = 'merge_combine',
    onProgress?: import('./export/exportTypes').ProgressCallback,
  ) {
    return importCombinedBackup(jsonString, notesStrategy, onProgress);
  }
}

export const exportImportService = new ExportImportService();

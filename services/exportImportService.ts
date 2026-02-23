import { verseDataStorage } from './verseDataStorage';
import { VerseData } from '../types/verseData';
import { BIBLE_BOOKS } from '../constants';
import { bibleStorage } from './bibleStorage';
import { annotationStorage, AnnotationRecord } from './annotationStorage';
import { bookmarkStorage, Bookmark } from './bookmarkStorage';
import { readingHistory } from './readingHistory';
import { readingPlanStorage, ReadingPlanState } from './readingPlanStorage';

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
    data: any;
  }>;
}

export type MergeStrategy = 'replace' | 'merge_newer' | 'merge_combine' | 'skip_existing';

export type ProgressCallback = (stage: string, percent: number) => void;

export interface FullBackupExport {
  version: '3.0';
  exportDate: string;
  deviceId?: string;
  notes: BibleNotesExport;
  bibleTexts: BibleTextExport;
  annotations: AnnotationRecord[];
  bookmarks: Bookmark[];
  readingHistory: {
    history: any[];
    lastRead: any | null;
    position: any | null;
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

class ExportImportService {
  private deviceId: string;

  constructor() {
    // Generate or retrieve device ID
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

  // Export all data to JSON format
  async exportToJSON(): Promise<string> {
    const allData = await verseDataStorage.getAllData();
    
    // Calculate metadata
    const metadata = this.calculateMetadata(allData);
    
    // Convert array to object format for easier merging
    const dataObject: { [key: string]: VerseData } = {};
    allData.forEach(item => {
      dataObject[item.id] = item;
    });
    
    const exportData: BibleNotesExport = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      deviceId: this.deviceId,
      metadata,
      data: dataObject
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  // Export to Markdown format
  async exportToMarkdown(): Promise<string> {
    const allData = await verseDataStorage.getAllData();
    let markdown = '# Bible Notes Export\n\n';
    markdown += `**Export Date:** ${new Date().toLocaleDateString()}\n\n`;
    markdown += '---\n\n';
    
    // Group by book
    const groupedByBook = this.groupByBook(allData);
    
    for (const [bookId, verses] of Object.entries(groupedByBook)) {
      const book = BIBLE_BOOKS.find(b => b.id === bookId);
      if (!book) continue;
      
      markdown += `## ${book.name}\n\n`;
      
      // Sort by chapter and verse
      verses.sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.verses[0] - b.verses[0];
      });
      
      for (const verse of verses) {
        markdown += `### ${book.name} ${verse.chapter}:${verse.verses.join('-')}\n\n`;
        
        if (verse.personalNote) {
          markdown += '**Personal Note:**\n';
          // Convert HTML to markdown-ish format
          const noteText = this.htmlToMarkdown(verse.personalNote.text);
          markdown += `${noteText}\n\n`;
        }
        
        if (verse.aiResearch.length > 0) {
          markdown += '**AI Research:**\n\n';
          for (const research of verse.aiResearch) {
            markdown += `- **Q:** ${research.query}\n`;
            markdown += `  **A:** ${research.response}\n\n`;
            if (research.tags && research.tags.length > 0) {
              markdown += `  _Tags: ${research.tags.join(', ')}_\n\n`;
            }
          }
        }
        
        markdown += '---\n\n';
      }
    }
    
    return markdown;
  }

  // Export to HTML format
  async exportToHTML(): Promise<string> {
    const allData = await verseDataStorage.getAllData();
    
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bible Notes Export</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #4f46e5; margin-top: 30px; }
    h3 { color: #666; }
    .note { background: #f8f8f8; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .research { background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .tags { color: #666; font-size: 0.9em; font-style: italic; }
    .timestamp { color: #999; font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>Bible Notes Export</h1>
  <p class="timestamp">Export Date: ${new Date().toLocaleDateString()}</p>
`;
    
    const groupedByBook = this.groupByBook(allData);
    
    for (const [bookId, verses] of Object.entries(groupedByBook)) {
      const book = BIBLE_BOOKS.find(b => b.id === bookId);
      if (!book) continue;
      
      html += `<h2>${book.name}</h2>\n`;
      
      verses.sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.verses[0] - b.verses[0];
      });
      
      for (const verse of verses) {
        html += `<h3>${book.name} ${verse.chapter}:${verse.verses.join('-')}</h3>\n`;
        
        if (verse.personalNote) {
          html += '<div class="note">\n';
          html += '<strong>Personal Note:</strong><br>\n';
          html += verse.personalNote.text;
          html += '\n</div>\n';
        }
        
        if (verse.aiResearch.length > 0) {
          html += '<div class="research">\n';
          html += '<strong>AI Research:</strong>\n';
          html += '<ul>\n';
          for (const research of verse.aiResearch) {
            html += '<li>\n';
            html += `<strong>Q:</strong> ${this.escapeHtml(research.query)}<br>\n`;
            html += `<strong>A:</strong> ${this.escapeHtml(research.response)}`;
            if (research.tags && research.tags.length > 0) {
              html += `<br><span class="tags">Tags: ${research.tags.join(', ')}</span>`;
            }
            html += '\n</li>\n';
          }
          html += '</ul>\n';
          html += '</div>\n';
        }
      }
    }
    
    html += '</body></html>';
    return html;
  }

  // Download file to user's device
  downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export and download in specified format
  async exportAndDownload(format: 'json' | 'markdown' | 'html' = 'json') {
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
      let content: string;
      let filename: string;
      let mimeType: string;
      
      switch (format) {
        case 'markdown':
          content = await this.exportToMarkdown();
          filename = `bible-notes-${timestamp}.md`;
          mimeType = 'text/markdown';
          break;
          
        case 'html':
          content = await this.exportToHTML();
          filename = `bible-notes-${timestamp}.html`;
          mimeType = 'text/html';
          break;
          
        case 'json':
        default:
          content = await this.exportToJSON();
          filename = `bible-notes-${timestamp}.json`;
          mimeType = 'application/json';
          break;
      }
      
      this.downloadFile(content, filename, mimeType);
      return { success: true };
    } catch (error) {
      console.error('Export failed:', error);
      return { success: false, error };
    }
  }

  // Import data from JSON
  async importFromJSON(jsonString: string, strategy: MergeStrategy = 'merge_combine'): Promise<{
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    
    try {
      const importData = JSON.parse(jsonString) as BibleNotesExport;
      
      // Validate format
      if (importData.version !== '1.0') {
        errors.push('Unsupported export version');
        return { success: false, imported, skipped, errors };
      }
      
      // Convert object to array for import
      const dataArray = Object.values(importData.data);
      
      // Import with selected strategy
      for (const item of dataArray) {
        try {
          const existing = await verseDataStorage.getVerseData(
            item.bookId,
            item.chapter,
            item.verses
          );
          
          if (existing && strategy === 'skip_existing') {
            skipped++;
            continue;
          }
          
          if (!existing || strategy === 'replace') {
            // Direct import
            await this.importSingleItem(item);
            imported++;
          } else if (strategy === 'merge_newer') {
            // Keep newer version
            const shouldImport = this.isNewer(item, existing);
            if (shouldImport) {
              await this.importSingleItem(item);
              imported++;
            } else {
              skipped++;
            }
          } else if (strategy === 'merge_combine') {
            // Combine both
            const merged = this.mergeItems(existing, item);
            await this.importSingleItem(merged);
            imported++;
          }
        } catch (itemError) {
          errors.push(`Failed to import ${item.id}: ${itemError}`);
        }
      }
      
      return { success: errors.length === 0, imported, skipped, errors };
    } catch (error) {
      errors.push(`Parse error: ${error}`);
      return { success: false, imported, skipped, errors };
    }
  }

  // Helper methods
  private calculateMetadata(data: VerseData[]) {
    const booksSet = new Set<string>();
    let totalNotes = 0;
    let totalResearch = 0;
    
    for (const item of data) {
      booksSet.add(item.bookId);
      if (item.personalNote) totalNotes++;
      totalResearch += item.aiResearch.length;
    }
    
    return {
      totalNotes,
      totalResearch,
      booksIncluded: Array.from(booksSet)
    };
  }

  private groupByBook(data: VerseData[]): Record<string, VerseData[]> {
    const grouped: Record<string, VerseData[]> = {};
    
    for (const item of data) {
      if (!grouped[item.bookId]) {
        grouped[item.bookId] = [];
      }
      grouped[item.bookId].push(item);
    }
    
    return grouped;
  }

  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&')
      .trim();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async importSingleItem(item: VerseData) {
    if (item.personalNote) {
      await verseDataStorage.savePersonalNote(
        item.bookId,
        item.chapter,
        item.verses,
        item.personalNote
      );
    }
    
    for (const research of item.aiResearch) {
      await verseDataStorage.addAIResearch(
        item.bookId,
        item.chapter,
        item.verses,
        {
          query: research.query,
          response: research.response,
          selectedText: research.selectedText,
          tags: research.tags,
          highlighted: research.highlighted
        }
      );
    }
  }

  private isNewer(item1: VerseData, item2: VerseData): boolean {
    const time1 = item1.personalNote?.updatedAt || 0;
    const time2 = item2.personalNote?.updatedAt || 0;
    return time1 > time2;
  }

  private mergeItems(existing: VerseData, incoming: VerseData): VerseData {
    const merged: VerseData = {
      ...existing,
      personalNote: this.isNewer(incoming, existing) 
        ? incoming.personalNote 
        : existing.personalNote,
      aiResearch: [...existing.aiResearch]
    };
    
    // Add new research entries
    const existingIds = new Set(existing.aiResearch.map(r => r.id));
    for (const research of incoming.aiResearch) {
      if (!existingIds.has(research.id)) {
        merged.aiResearch.push(research);
      }
    }
    
    return merged;
  }

  // Export Bible texts for offline reading
  async exportBibleTexts(): Promise<string> {
    try {
      console.log('exportBibleTexts: Getting all chapters...');
      // Get all stored chapters directly
      const chapters = await bibleStorage.getAllChapters();
      console.log('exportBibleTexts: Got', chapters.length, 'chapters');
      
      const translations = new Set<string>();
      
      // Track translations
      chapters.forEach(chapter => {
        translations.add(chapter.translation);
      });
      
      const exportData: BibleTextExport = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        metadata: {
          totalChapters: chapters.length,
          translations: Array.from(translations)
        },
        chapters
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('exportBibleTexts failed:', error);
      // Return empty export on error
      return JSON.stringify({
        version: '1.0',
        exportDate: new Date().toISOString(),
        metadata: {
          totalChapters: 0,
          translations: []
        },
        chapters: []
      }, null, 2);
    }
  }

  // Import Bible texts
  async importBibleTexts(jsonString: string): Promise<{
    success: boolean;
    imported: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let imported = 0;
    
    try {
      const importData = JSON.parse(jsonString) as BibleTextExport;
      
      // Validate format
      if (importData.version !== '1.0') {
        errors.push('Unsupported Bible text export version');
        return { success: false, imported, errors };
      }
      
      // Import each chapter
      for (const chapter of importData.chapters) {
        try {
          await bibleStorage.saveChapter(
            chapter.bookId,
            chapter.chapter,
            chapter.translation,
            chapter.data
          );
          imported++;
        } catch (error) {
          errors.push(`Failed to import ${chapter.bookId} ${chapter.chapter} (${chapter.translation}): ${error}`);
        }
      }
      
      return { success: errors.length === 0, imported, errors };
    } catch (error) {
      errors.push(`Parse error: ${error}`);
      return { success: false, imported, errors };
    }
  }

  // Export both notes and Bible texts
  async exportAll(): Promise<{
    notes: string;
    bibleTexts: string;
  }> {
    const [notes, bibleTexts] = await Promise.all([
      this.exportToJSON(),
      this.exportBibleTexts()
    ]);
    
    return { notes, bibleTexts };
  }

  // Export all user data as a single v3.0 backup file
  async exportAndDownloadAll(onProgress?: ProgressCallback) {
    try {
      const timestamp = new Date().toISOString().split('T')[0];

      onProgress?.('Exporting notes...', 10);
      const notesData = JSON.parse(await this.exportToJSON()) as BibleNotesExport;

      onProgress?.('Exporting Bible texts...', 25);
      const bibleData = JSON.parse(await this.exportBibleTexts()) as BibleTextExport;

      onProgress?.('Exporting annotations...', 40);
      const annotations = await annotationStorage.getAllAnnotations();

      onProgress?.('Exporting bookmarks...', 55);
      const bookmarks = await bookmarkStorage.getAllBookmarks();

      onProgress?.('Exporting reading history...', 65);
      const historyData = {
        history: readingHistory.getHistory(),
        lastRead: readingHistory.getLastRead(),
        position: await readingHistory.getLastReadingPosition(),
      };

      onProgress?.('Exporting reading plans...', 75);
      const plans = await readingPlanStorage.getAllPlans();

      onProgress?.('Building backup file...', 90);
      const combinedExport: FullBackupExport = {
        version: '3.0',
        exportDate: new Date().toISOString(),
        deviceId: this.deviceId,
        notes: notesData,
        bibleTexts: bibleData,
        annotations,
        bookmarks,
        readingHistory: historyData,
        readingPlans: plans,
        metadata: {
          totalNotes: notesData.metadata?.totalNotes || 0,
          totalResearch: notesData.metadata?.totalResearch || 0,
          totalAnnotations: annotations.length,
          totalBookmarks: bookmarks.length,
          totalHistoryEntries: historyData.history.length,
          totalPlans: plans.length,
        },
      };

      const combinedContent = JSON.stringify(combinedExport);
      const filename = `bible-app-backup-${timestamp}.json`;

      onProgress?.('Downloading...', 95);
      this.downloadFile(combinedContent, filename, 'application/json');
      onProgress?.('Done!', 100);
      return { success: true };
    } catch (error: any) {
      console.error('Export failed:', error);
      return { success: false, error: error.message || String(error) };
    }
  }

  // Import combined backup (supports v1.0, v2.0, v3.0)
  async importCombinedBackup(
    jsonString: string,
    notesStrategy: MergeStrategy = 'merge_combine',
    onProgress?: ProgressCallback
  ): Promise<{
    success: boolean;
    notesImported: number;
    notesSkipped: number;
    chaptersImported: number;
    annotationsImported: number;
    bookmarksImported: number;
    historyRestored: boolean;
    plansImported: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    const result = {
      success: false,
      notesImported: 0,
      notesSkipped: 0,
      chaptersImported: 0,
      annotationsImported: 0,
      bookmarksImported: 0,
      historyRestored: false,
      plansImported: 0,
      errors,
    };

    try {
      const importData = JSON.parse(jsonString);

      if (importData.version === '3.0') {
        // ── v3.0 full import ──
        onProgress?.('Importing notes...', 10);
        if (importData.notes) {
          const notesResult = await this.importFromJSON(JSON.stringify(importData.notes), notesStrategy);
          result.notesImported = notesResult.imported;
          result.notesSkipped = notesResult.skipped;
          errors.push(...notesResult.errors);
        }

        onProgress?.('Importing Bible texts...', 25);
        if (importData.bibleTexts) {
          const bibleResult = await this.importBibleTexts(JSON.stringify(importData.bibleTexts));
          result.chaptersImported = bibleResult.imported;
          errors.push(...bibleResult.errors);
        }

        onProgress?.('Importing annotations...', 40);
        if (importData.annotations && Array.isArray(importData.annotations)) {
          for (const ann of importData.annotations) {
            try {
              await annotationStorage.importAnnotation(ann);
              result.annotationsImported++;
            } catch (e) {
              errors.push(`Failed to import annotation ${ann.id}: ${e}`);
            }
          }
        }

        onProgress?.('Importing bookmarks...', 60);
        if (importData.bookmarks && Array.isArray(importData.bookmarks)) {
          for (const bm of importData.bookmarks) {
            try {
              const exists = await bookmarkStorage.isBookmarked(bm.id);
              if (!exists) {
                await bookmarkStorage.importBookmark(bm);
                result.bookmarksImported++;
              }
            } catch (e) {
              errors.push(`Failed to import bookmark ${bm.id}: ${e}`);
            }
          }
        }

        onProgress?.('Importing reading history...', 75);
        if (importData.readingHistory) {
          try {
            const rh = importData.readingHistory;
            if (rh.history && Array.isArray(rh.history)) {
              const existing = readingHistory.getHistory();
              const existingKeys = new Set(existing.map((h: any) => `${h.bookId}:${h.chapter}`));
              for (const entry of rh.history) {
                if (!existingKeys.has(`${entry.bookId}:${entry.chapter}`)) {
                  readingHistory.addToHistory(entry.bookId, entry.bookName, entry.chapter, entry.hasNotes, entry.hasAIResearch);
                }
              }
            }
            if (rh.lastRead && !readingHistory.getLastRead()) {
              localStorage.setItem('bibleLastRead', JSON.stringify(rh.lastRead));
            }
            if (rh.position) {
              const currentPos = await readingHistory.getLastReadingPosition();
              if (!currentPos) {
                localStorage.setItem('bibleReadingHistory', JSON.stringify(rh.position));
              }
            }
            result.historyRestored = true;
          } catch (e) {
            errors.push(`Failed to import reading history: ${e}`);
          }
        }

        onProgress?.('Importing reading plans...', 90);
        if (importData.readingPlans && Array.isArray(importData.readingPlans)) {
          for (const plan of importData.readingPlans) {
            try {
              await readingPlanStorage.importPlan(plan);
              result.plansImported++;
            } catch (e) {
              errors.push(`Failed to import plan ${plan.id}: ${e}`);
            }
          }
        }

        onProgress?.('Done!', 100);

      } else if (importData.version === '2.0') {
        // ── v2.0 combined format (backward compat) ──
        onProgress?.('Importing notes...', 20);
        const notesResult = await this.importFromJSON(JSON.stringify(importData.notes), notesStrategy);
        result.notesImported = notesResult.imported;
        result.notesSkipped = notesResult.skipped;
        errors.push(...notesResult.errors);

        onProgress?.('Importing Bible texts...', 60);
        const bibleResult = await this.importBibleTexts(JSON.stringify(importData.bibleTexts));
        result.chaptersImported = bibleResult.imported;
        errors.push(...bibleResult.errors);
        onProgress?.('Done!', 100);

      } else if (importData.version === '1.0' && importData.data) {
        // ── v1.0 notes-only format ──
        const notesResult = await this.importFromJSON(jsonString, notesStrategy);
        result.notesImported = notesResult.imported;
        result.notesSkipped = notesResult.skipped;
        errors.push(...notesResult.errors);

      } else if (importData.version === '1.0' && importData.chapters) {
        // ── v1.0 Bible texts format ──
        const bibleResult = await this.importBibleTexts(jsonString);
        result.chaptersImported = bibleResult.imported;
        errors.push(...bibleResult.errors);

      } else {
        errors.push('Unrecognized backup format');
      }

      result.success = errors.length === 0;
      return result;
    } catch (error) {
      errors.push(`Parse error: ${error}`);
      return result;
    }
  }
}

export const exportImportService = new ExportImportService();
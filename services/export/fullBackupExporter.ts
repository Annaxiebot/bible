import { annotationStorage } from '../annotationStorage';
import { bookmarkStorage } from '../bookmarkStorage';
import { readingHistory } from '../readingHistory';
import { readingPlanStorage } from '../readingPlanStorage';
import {
  BibleNotesExport,
  BibleTextExport,
  FullBackupExport,
  ProgressCallback,
} from './exportTypes';
import { exportToJSON } from './notesExporter';
import { exportBibleTexts } from './bibleTextExportImport';
import { downloadFile } from './fileDownloader';

export async function exportAndDownloadAll(
  deviceId: string,
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = new Date().toISOString().split('T')[0];

    onProgress?.('Exporting notes...', 10);
    const notesData = JSON.parse(await exportToJSON(deviceId)) as BibleNotesExport;

    onProgress?.('Exporting Bible texts...', 25);
    const bibleData = JSON.parse(await exportBibleTexts()) as BibleTextExport;

    onProgress?.('Exporting annotations & bookmarks...', 40);
    const [annotations, bookmarks] = await Promise.all([
      annotationStorage.getAllAnnotations(),
      bookmarkStorage.getAllBookmarks(),
    ]);

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
      deviceId,
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

    onProgress?.('Downloading...', 95);
    downloadFile(JSON.stringify(combinedExport), `bible-app-backup-${timestamp}.json`, 'application/json');
    onProgress?.('Done!', 100);
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // TODO: use error reporting service
    return { success: false, error: message };
  }
}

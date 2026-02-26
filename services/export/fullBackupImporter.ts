import { annotationStorage } from '../annotationStorage';
import { bookmarkStorage } from '../bookmarkStorage';
import { readingHistory } from '../readingHistory';
import { readingPlanStorage } from '../readingPlanStorage';
import {
  CombinedImportResult,
  ChapterHistoryEntry,
  MergeStrategy,
  ProgressCallback,
} from './exportTypes';
import { importFromJSON } from './notesImporter';
import { importBibleTexts } from './bibleTextExportImport';

function createEmptyResult(): CombinedImportResult {
  return {
    success: false,
    notesImported: 0,
    notesSkipped: 0,
    chaptersImported: 0,
    annotationsImported: 0,
    bookmarksImported: 0,
    historyRestored: false,
    plansImported: 0,
    errors: [],
  };
}

export async function importCombinedBackup(
  jsonString: string,
  notesStrategy: MergeStrategy = 'merge_combine',
  onProgress?: ProgressCallback,
): Promise<CombinedImportResult> {
  const result = createEmptyResult();

  try {
    const importData = JSON.parse(jsonString);

    if (importData.version === '3.0') {
      await importV3(importData, notesStrategy, onProgress, result);
    } else if (importData.version === '2.0') {
      await importV2(importData, notesStrategy, onProgress, result);
    } else if (importData.version === '1.0' && importData.data) {
      await importV1Notes(jsonString, notesStrategy, result);
    } else if (importData.version === '1.0' && importData.chapters) {
      await importV1Bible(jsonString, result);
    } else {
      result.errors.push('Unrecognized backup format');
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (error) {
    result.errors.push(`Parse error: ${error}`);
    return result;
  }
}

async function importV3(
  importData: Record<string, unknown>,
  notesStrategy: MergeStrategy,
  onProgress: ProgressCallback | undefined,
  result: CombinedImportResult,
) {
  onProgress?.('Importing notes...', 10);
  if (importData.notes) {
    const notesResult = await importFromJSON(JSON.stringify(importData.notes), notesStrategy);
    result.notesImported = notesResult.imported;
    result.notesSkipped = notesResult.skipped;
    result.errors.push(...notesResult.errors);
  }

  onProgress?.('Importing Bible texts...', 25);
  if (importData.bibleTexts) {
    const bibleResult = await importBibleTexts(JSON.stringify(importData.bibleTexts));
    result.chaptersImported = bibleResult.imported;
    result.errors.push(...bibleResult.errors);
  }

  onProgress?.('Importing annotations...', 40);
  await importAnnotations(importData.annotations, result);

  onProgress?.('Importing bookmarks...', 60);
  await importBookmarks(importData.bookmarks, result);

  onProgress?.('Importing reading history...', 75);
  await importReadingHistory(importData.readingHistory, result);

  onProgress?.('Importing reading plans...', 90);
  await importReadingPlans(importData.readingPlans, result);

  onProgress?.('Done!', 100);
}

async function importV2(
  importData: Record<string, unknown>,
  notesStrategy: MergeStrategy,
  onProgress: ProgressCallback | undefined,
  result: CombinedImportResult,
) {
  onProgress?.('Importing notes...', 20);
  const notesResult = await importFromJSON(JSON.stringify(importData.notes), notesStrategy);
  result.notesImported = notesResult.imported;
  result.notesSkipped = notesResult.skipped;
  result.errors.push(...notesResult.errors);

  onProgress?.('Importing Bible texts...', 60);
  const bibleResult = await importBibleTexts(JSON.stringify(importData.bibleTexts));
  result.chaptersImported = bibleResult.imported;
  result.errors.push(...bibleResult.errors);

  onProgress?.('Done!', 100);
}

async function importV1Notes(
  jsonString: string,
  notesStrategy: MergeStrategy,
  result: CombinedImportResult,
) {
  const notesResult = await importFromJSON(jsonString, notesStrategy);
  result.notesImported = notesResult.imported;
  result.notesSkipped = notesResult.skipped;
  result.errors.push(...notesResult.errors);
}

async function importV1Bible(
  jsonString: string,
  result: CombinedImportResult,
) {
  const bibleResult = await importBibleTexts(jsonString);
  result.chaptersImported = bibleResult.imported;
  result.errors.push(...bibleResult.errors);
}

async function importAnnotations(
  annotations: unknown,
  result: CombinedImportResult,
) {
  if (!Array.isArray(annotations)) return;
  for (const ann of annotations) {
    try {
      await annotationStorage.importAnnotation(ann);
      result.annotationsImported++;
    } catch (e) {
      result.errors.push(`Failed to import annotation ${ann.id}: ${e}`);
    }
  }
}

async function importBookmarks(
  bookmarks: unknown,
  result: CombinedImportResult,
) {
  if (!Array.isArray(bookmarks)) return;
  for (const bm of bookmarks) {
    try {
      const exists = await bookmarkStorage.isBookmarked(bm.id);
      if (!exists) {
        await bookmarkStorage.importBookmark(bm);
        result.bookmarksImported++;
      }
    } catch (e) {
      result.errors.push(`Failed to import bookmark ${bm.id}: ${e}`);
    }
  }
}

async function importReadingHistory(
  readingHistoryData: unknown,
  result: CombinedImportResult,
) {
  if (!readingHistoryData || typeof readingHistoryData !== 'object') return;
  const rh = readingHistoryData as Record<string, unknown>;

  try {
    if (Array.isArray(rh.history)) {
      const existing = readingHistory.getHistory();
      const existingKeys = new Set(
        existing.map((h: ChapterHistoryEntry) => `${h.bookId}:${h.chapter}`),
      );
      for (const entry of rh.history as ChapterHistoryEntry[]) {
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
    result.errors.push(`Failed to import reading history: ${e}`);
  }
}

async function importReadingPlans(
  plans: unknown,
  result: CombinedImportResult,
) {
  if (!Array.isArray(plans)) return;
  for (const plan of plans) {
    try {
      await readingPlanStorage.importPlan(plan);
      result.plansImported++;
    } catch (e) {
      result.errors.push(`Failed to import plan ${plan.id}: ${e}`);
    }
  }
}

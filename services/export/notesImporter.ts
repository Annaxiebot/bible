import { verseDataStorage } from '../verseDataStorage';
import { VerseData } from '../../types/verseData';
import { BibleNotesExport, MergeStrategy, NotesImportResult } from './exportTypes';

export async function importFromJSON(
  jsonString: string,
  strategy: MergeStrategy = 'merge_combine',
): Promise<NotesImportResult> {
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  try {
    const importData = JSON.parse(jsonString) as BibleNotesExport;

    if (importData.version !== '1.0') {
      errors.push('Unsupported export version');
      return { success: false, imported, skipped, errors };
    }

    const dataArray = Object.values(importData.data);

    for (const item of dataArray) {
      try {
        const result = await importSingleVerseData(item, strategy);
        imported += result.imported;
        skipped += result.skipped;
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

async function importSingleVerseData(
  item: VerseData,
  strategy: MergeStrategy,
): Promise<{ imported: number; skipped: number }> {
  const existing = await verseDataStorage.getVerseData(item.bookId, item.chapter, item.verses);

  if (existing && strategy === 'skip_existing') {
    return { imported: 0, skipped: 1 };
  }

  if (!existing || strategy === 'replace') {
    await persistVerseData(item);
    return { imported: 1, skipped: 0 };
  }

  if (strategy === 'merge_newer') {
    if (isNewer(item, existing)) {
      await persistVerseData(item);
      return { imported: 1, skipped: 0 };
    }
    return { imported: 0, skipped: 1 };
  }

  // merge_combine
  const merged = mergeItems(existing, item);
  await persistVerseData(merged);
  return { imported: 1, skipped: 0 };
}

async function persistVerseData(item: VerseData) {
  if (item.personalNote) {
    await verseDataStorage.savePersonalNote(
      item.bookId,
      item.chapter,
      item.verses,
      item.personalNote,
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
        highlighted: research.highlighted,
      },
    );
  }
}

function isNewer(item1: VerseData, item2: VerseData): boolean {
  const time1 = item1.personalNote?.updatedAt || 0;
  const time2 = item2.personalNote?.updatedAt || 0;
  return time1 > time2;
}

function mergeItems(existing: VerseData, incoming: VerseData): VerseData {
  const merged: VerseData = {
    ...existing,
    personalNote: isNewer(incoming, existing)
      ? incoming.personalNote
      : existing.personalNote,
    aiResearch: [...existing.aiResearch],
  };

  const existingIds = new Set(existing.aiResearch.map(r => r.id));
  for (const research of incoming.aiResearch) {
    if (!existingIds.has(research.id)) {
      merged.aiResearch.push(research);
    }
  }

  return merged;
}

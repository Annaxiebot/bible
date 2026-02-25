import { bibleStorage, BibleTranslation } from '../bibleStorage';
import { BibleTextExport, BibleImportResult } from './exportTypes';

export async function exportBibleTexts(): Promise<string> {
  try {
    const chapters = await bibleStorage.getAllChapters();
    const translations = new Set<string>();
    chapters.forEach(chapter => translations.add(chapter.translation));

    const exportData: BibleTextExport = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      metadata: {
        totalChapters: chapters.length,
        translations: Array.from(translations),
      },
      chapters,
    };

    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error('exportBibleTexts failed:', error);
    return JSON.stringify({
      version: '1.0',
      exportDate: new Date().toISOString(),
      metadata: { totalChapters: 0, translations: [] },
      chapters: [],
    }, null, 2);
  }
}

export async function importBibleTexts(jsonString: string): Promise<BibleImportResult> {
  const errors: string[] = [];
  let imported = 0;

  try {
    const importData = JSON.parse(jsonString) as BibleTextExport;

    if (importData.version !== '1.0') {
      errors.push('Unsupported Bible text export version');
      return { success: false, imported, errors };
    }

    for (const chapter of importData.chapters) {
      try {
        await bibleStorage.saveChapter(
          chapter.bookId,
          chapter.chapter,
          chapter.translation as BibleTranslation,
          chapter.data,
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

import { VerseData } from '../../types/verseData';
import { BackupSummaryData, EMPTY_SUMMARY } from './exportTypes';

export function parseBackupSummary(jsonString: string): BackupSummaryData {
  const data = JSON.parse(jsonString);

  if (data.version === '3.0') {
    return parseV3Summary(data);
  }
  if (data.version === '2.0') {
    return parseV2Summary(data);
  }
  if (data.version === '1.0' && data.data) {
    return parseV1Summary(data);
  }
  return { ...EMPTY_SUMMARY };
}

function countNotes(entries: VerseData[]): { notes: number; aiResearch: number } {
  return {
    notes: entries.filter(d => d.personalNote).length,
    aiResearch: entries.reduce((acc, d) => acc + (d.aiResearch?.length || 0), 0),
  };
}

function parseV3Summary(data: Record<string, unknown>): BackupSummaryData {
  const notesData = (data.notes as Record<string, unknown>)?.data || {};
  const noteEntries = Object.values(notesData) as VerseData[];
  const { notes, aiResearch } = countNotes(noteEntries);

  return {
    version: '3.0',
    exportDate: data.exportDate as string,
    notes,
    aiResearch,
    annotations: (data.annotations as unknown[])?.length || 0,
    bookmarks: (data.bookmarks as unknown[])?.length || 0,
    historyEntries: ((data.readingHistory as Record<string, unknown>)?.history as unknown[])?.length || 0,
    readingPlans: (data.readingPlans as unknown[])?.length || 0,
    bibleChapters: ((data.bibleTexts as Record<string, unknown>)?.chapters as unknown[])?.length || 0,
  };
}

function parseV2Summary(data: Record<string, unknown>): BackupSummaryData {
  const notesData = (data.notes as Record<string, unknown>)?.data || {};
  const noteEntries = Object.values(notesData) as VerseData[];
  const { notes, aiResearch } = countNotes(noteEntries);

  return {
    version: '2.0',
    exportDate: data.exportDate as string,
    notes,
    aiResearch,
    annotations: 0,
    bookmarks: 0,
    historyEntries: 0,
    readingPlans: 0,
    bibleChapters: ((data.bibleTexts as Record<string, unknown>)?.chapters as unknown[])?.length || 0,
  };
}

function parseV1Summary(data: Record<string, unknown>): BackupSummaryData {
  const noteEntries = Object.values(data.data as Record<string, unknown>) as VerseData[];
  const { notes, aiResearch } = countNotes(noteEntries);

  return {
    version: '1.0',
    exportDate: data.exportDate as string,
    notes,
    aiResearch,
    annotations: 0,
    bookmarks: 0,
    historyEntries: 0,
    readingPlans: 0,
    bibleChapters: 0,
  };
}

/**
 * personalDataBackup.ts — "导出全部数据 · Export all my data" and its import · 个人数据导出/导入
 *
 * ONE file holds everything the personal app (#app) keeps in this browser
 * (ADR-0010): notes, verse data (personal notes + AI research), handwriting
 * annotations, bookmarks, journal entries (their media stay as the
 * references the entries carry), AI chat history, spiritual memory, reading
 * plans, reading history and settings — never an API key, never the public
 * Bible text (bundled or re-fetchable).
 *
 * Import merges and never deletes: a record missing here is added; a record
 * present on both sides keeps the newer one by its own timestamp; records
 * with no timestamp (bookmarks, plans, settings) are only added when absent.
 */
import { idbService } from '../idbService';
import type { NoteRecord, AnnotationRecord, Bookmark, JournalEntry, ChatHistoryRecord, SpiritualMemoryItem, ReadingPlanState } from '../idbService';
import type { VerseData } from '../../types/verseData';
import { verseDataStorage } from '../verseDataStorage';
import { readingHistory, type ChapterHistory, type ReadingPosition } from '../readingHistory';
import { SYNCED_SETTINGS_KEYS } from '../syncService';
import { importReadingHistory } from './fullBackupImporter';
import { downloadFile } from './fileDownloader';

import { PERSONAL_BACKUP_KIND, PERSONAL_BACKUP_VERSION, personalBackupFilename } from './personalBackupFormat';

export { PERSONAL_BACKUP_KIND, PERSONAL_BACKUP_VERSION };

export interface PersonalBackup {
  kind: typeof PERSONAL_BACKUP_KIND;
  version: typeof PERSONAL_BACKUP_VERSION;
  exportDate: string;
  notes: NoteRecord[];
  verseData: VerseData[];
  annotations: AnnotationRecord[];
  bookmarks: Bookmark[];
  journal: JournalEntry[];
  chatHistory: ChatHistoryRecord[];
  spiritualMemory: SpiritualMemoryItem[];
  readingPlans: ReadingPlanState[];
  readingHistory: { history: ChapterHistory[]; lastRead: ReadingPosition | null; position: ReadingPosition | null };
  settings: Record<string, string>;
}

export type PersonalSection = 'notes' | 'verseData' | 'annotations' | 'bookmarks' | 'journal'
  | 'chatHistory' | 'spiritualMemory' | 'readingPlans' | 'settings';

export interface PersonalImportResult {
  imported: Record<PersonalSection, number>;
  historyRestored: boolean;
  errors: string[];
}

/** Settings the backup carries: the synced preference keys minus every *_api_key. */
export function exportableSettingsKeys(): string[] {
  return SYNCED_SETTINGS_KEYS.filter(k => !/api_key$/i.test(k));
}

export async function buildPersonalBackup(): Promise<PersonalBackup> {
  const settings: Record<string, string> = {};
  for (const key of exportableSettingsKeys()) {
    const value = localStorage.getItem(key);
    if (value !== null) settings[key] = value;
  }
  return {
    kind: PERSONAL_BACKUP_KIND,
    version: PERSONAL_BACKUP_VERSION,
    exportDate: new Date().toISOString(),
    notes: await idbService.getAll('notes'),
    verseData: await verseDataStorage.getAllData(),
    annotations: await idbService.getAll('annotations'),
    bookmarks: await idbService.getAll('bookmarks'),
    journal: await idbService.getAll('journal'),
    chatHistory: await idbService.getAll('chatHistory'),
    spiritualMemory: await idbService.getAll('spiritualMemory'),
    readingPlans: await idbService.getAll('readingPlans'),
    readingHistory: {
      history: readingHistory.getHistory(),
      lastRead: readingHistory.getLastRead(),
      position: await readingHistory.getLastReadingPosition(),
    },
    settings,
  };
}

export async function downloadPersonalBackup(): Promise<void> {
  const backup = await buildPersonalBackup();
  downloadFile(JSON.stringify(backup), personalBackupFilename(), 'application/json');
}

export function isPersonalBackup(data: unknown): data is PersonalBackup {
  const d = data as Partial<PersonalBackup> | null;
  return !!d && d.kind === PERSONAL_BACKUP_KIND && d.version === PERSONAL_BACKUP_VERSION;
}

type StoreName = 'notes' | 'annotations' | 'bookmarks' | 'journal' | 'chatHistory' | 'spiritualMemory' | 'readingPlans';
type Stamp<R> = ((r: R) => number) | null;

const iso = (s: string | undefined) => (s ? Date.parse(s) || 0 : 0);

/** Add what is missing; replace only when the incoming record is strictly newer. Returns how many were written. */
async function mergeStore<R>(store: StoreName, items: unknown, keyOf: (r: R) => string, stampOf: Stamp<R>, outOfLineKey = false): Promise<number> {
  if (!Array.isArray(items)) return 0;
  let written = 0;
  for (const item of items as R[]) {
    const key = keyOf(item);
    if (!key) continue;
    const existing = await idbService.get(store, key) as R | undefined;
    const newer = existing === undefined || (stampOf !== null && stampOf(item) > stampOf(existing));
    if (!newer) continue;
    // The store's value type is chosen by `store`; the generic R is the same record shape.
    await idbService.put(store, item as never, outOfLineKey ? key : undefined);
    written++;
  }
  return written;
}

async function mergeSections(b: Partial<PersonalBackup>, imported: Record<PersonalSection, number>): Promise<void> {
  imported.notes = await mergeStore<NoteRecord>('notes', b.notes, r => r.reference, r => r.lastModified || 0, true);
  if (Array.isArray(b.verseData)) {
    await verseDataStorage.importData(b.verseData, 'merge'); // newer note wins, research entries are unioned
    imported.verseData = b.verseData.length;
  }
  imported.annotations = await mergeStore<AnnotationRecord>('annotations', b.annotations, r => r.id, r => r.lastModified || 0);
  imported.bookmarks = await mergeStore<Bookmark>('bookmarks', b.bookmarks, r => r.id, null);
  imported.journal = await mergeStore<JournalEntry>('journal', b.journal, r => r.id, r => iso(r.updatedAt));
  imported.chatHistory = await mergeStore<ChatHistoryRecord>('chatHistory', b.chatHistory, r => r.id, r => r.lastModified || 0);
  imported.spiritualMemory = await mergeStore<SpiritualMemoryItem>('spiritualMemory', b.spiritualMemory, r => r.id, r => iso(r.updatedAt));
  imported.readingPlans = await mergeStore<ReadingPlanState>('readingPlans', b.readingPlans, r => r.id, null);
  const allowed = new Set(exportableSettingsKeys());
  for (const [key, value] of Object.entries(b.settings ?? {})) {
    if (allowed.has(key) && typeof value === 'string' && localStorage.getItem(key) === null) {
      localStorage.setItem(key, value);
      imported.settings++;
    }
  }
}

/** The events the views (and, when signed in, the sync push) already listen to. */
const REFRESH_EVENTS = ['notes-updated', 'annotation-updated', 'bookmark-updated', 'journal-updated',
  'chathistory-updated', 'spiritualmemory-updated', 'settings-updated'];

export async function importPersonalBackup(json: string): Promise<PersonalImportResult> {
  const imported: Record<PersonalSection, number> = {
    notes: 0, verseData: 0, annotations: 0, bookmarks: 0, journal: 0,
    chatHistory: 0, spiritualMemory: 0, readingPlans: 0, settings: 0,
  };
  const result: PersonalImportResult = { imported, historyRestored: false, errors: [] };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    result.errors.push(`不是有效的 JSON 文件 · Not a valid JSON file: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }
  if (!isPersonalBackup(data)) {
    result.errors.push('不是本应用导出的数据文件 · Not a Bible app data file');
    return result;
  }
  try {
    await mergeSections(data, imported);
  } catch (err) {
    result.errors.push(`导入中断 · Import stopped: ${err instanceof Error ? err.message : String(err)}`);
  }
  await importReadingHistory(data.readingHistory, result);
  for (const name of REFRESH_EVENTS) window.dispatchEvent(new Event(name));
  return result;
}

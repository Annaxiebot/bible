/**
 * personalDataBackup.test.ts — "Export all my data" → "Import" round trip · 导出导入往返
 *
 * Real IndexedDB code paths over fake-indexeddb (tests/utils/setup.ts) and a
 * Map-backed localStorage: what is exported comes back on import; import
 * merges (missing added, newer wins, older never overwrites, nothing is
 * deleted); API keys never leave the browser.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { idbService } from '../../idbService';
import type { JournalEntry, ChatHistoryRecord, SpiritualMemoryItem } from '../../idbService';
import { verseDataStorage } from '../../verseDataStorage';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import {
  buildPersonalBackup, importPersonalBackup, isPersonalBackup, exportableSettingsKeys,
  PERSONAL_BACKUP_VERSION, PERSONAL_BACKUP_KIND,
} from '../personalDataBackup';
import { importCombinedBackup } from '../fullBackupImporter';
import { parseBackupSummary } from '../backupSummaryParser';

/** An API key from the removed multi-provider AI; old browsers may still hold one. */
const OLD_PROVIDER_KEY = 'gemini_api_key';

const store = new Map<string, string>();
const ls = window.localStorage as unknown as Record<string, ReturnType<typeof vi.fn>>;

const STORES = ['notes', 'verseData', 'annotations', 'bookmarks', 'journal', 'chatHistory', 'spiritualMemory', 'readingPlans'] as const;

async function clearAll() {
  const db = await idbService.getDB();
  for (const s of STORES) await db.clear(s);
}

const journal = (id: string, updatedAt: string, title: string): JournalEntry =>
  ({ id, title, content: '', plainText: title, tags: [], createdAt: '2026-01-01T00:00:00Z', updatedAt,
     blocks: [{ type: 'image', url: 'https://storage.example/journal_media/p.jpg' }] } as unknown as JournalEntry);
const chat = (id: string, lastModified: number, title: string): ChatHistoryRecord =>
  ({ id, title, messages: [{ role: 'user', content: title, timestamp: '2026-01-01T00:00:00Z' }], createdAt: '2026-01-01T00:00:00Z', lastModified });
const memory = (id: string, updatedAt: string, content: string): SpiritualMemoryItem =>
  ({ id, category: 'prayer', content, createdAt: '2026-01-01T00:00:00Z', updatedAt });

async function seed() {
  await idbService.put('notes', { reference: 'John 3:16', data: 'note A', lastModified: 100 }, 'John 3:16');
  await verseDataStorage.savePersonalNote('JHN', 3, [16], { text: 'verse note', createdAt: 1, updatedAt: 1 });
  await idbService.put('annotations', { id: 'JHN:3', bookId: 'JHN', chapter: 3, canvasData: '[]', canvasHeight: 0, lastModified: 100 });
  await idbService.put('bookmarks', { id: 'JHN:3:16', bookId: 'JHN', bookName: 'John', chapter: 3, verse: 16, textPreview: 'For God', createdAt: 5 });
  await idbService.put('journal', journal('j1', '2026-02-01T00:00:00Z', 'journal v1'));
  await idbService.put('chatHistory', chat('c1', 100, 'chat v1'));
  await idbService.put('spiritualMemory', memory('mem_1', '2026-02-01T00:00:00Z', 'pray v1'));
  await idbService.put('readingPlans', { id: 'nt-90-days', planType: 'nt-90-days', startDate: '2026-01-01', completedDays: [], currentDay: 0, active: true });
  store.set(STORAGE_KEYS.FONT_SIZE, '18');
  store.set(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-or-secret');
  store.set(OLD_PROVIDER_KEY, 'gm-secret');
}

beforeEach(async () => {
  store.clear();
  ls.getItem.mockImplementation((k: string) => (store.has(k) ? store.get(k)! : null));
  ls.setItem.mockImplementation((k: string, v: string) => { store.set(k, String(v)); });
  ls.removeItem.mockImplementation((k: string) => { store.delete(k); });
  await clearAll();
});

describe('Export all my data', () => {
  it('is one versioned file with every personal store and no API key or Bible text', async () => {
    await seed();
    const backup = await buildPersonalBackup();
    expect(backup.kind).toBe(PERSONAL_BACKUP_KIND);
    expect(backup.version).toBe(PERSONAL_BACKUP_VERSION);
    expect(isPersonalBackup(JSON.parse(JSON.stringify(backup)))).toBe(true);
    expect(backup.notes.map(n => n.reference)).toEqual(['John 3:16']);
    expect(backup.verseData[0].personalNote?.text).toBe('verse note');
    expect(backup.annotations).toHaveLength(1);
    expect(backup.bookmarks).toHaveLength(1);
    expect(backup.journal[0].blocks).toEqual([{ type: 'image', url: 'https://storage.example/journal_media/p.jpg' }]);
    expect(backup.chatHistory[0].title).toBe('chat v1');
    expect(backup.spiritualMemory[0].content).toBe('pray v1');
    expect(backup.readingPlans).toHaveLength(1);
    expect(backup.settings).toEqual({ [STORAGE_KEYS.FONT_SIZE]: '18' });
    const json = JSON.stringify(backup);
    expect(json).not.toContain('secret');
    expect(json).not.toContain('bibleTexts');
    expect(exportableSettingsKeys().some(k => /api_key/i.test(k))).toBe(false);
  });
});

describe('Import (merge, newer wins, never deletes)', () => {
  it('restores everything into an empty browser', async () => {
    await seed();
    const json = JSON.stringify(await buildPersonalBackup());
    await clearAll();
    store.clear();
    const r = await importPersonalBackup(json);
    expect(r.errors).toEqual([]);
    expect(r.imported).toMatchObject({ notes: 1, verseData: 1, annotations: 1, bookmarks: 1, journal: 1,
      chatHistory: 1, spiritualMemory: 1, readingPlans: 1, settings: 1 });
    expect((await idbService.get('notes', 'John 3:16'))?.data).toBe('note A');
    expect((await verseDataStorage.getAllData())[0].personalNote?.text).toBe('verse note');
    expect((await idbService.get('journal', 'j1'))?.title).toBe('journal v1');
    expect((await idbService.get('chatHistory', 'c1'))?.title).toBe('chat v1');
    expect((await idbService.get('spiritualMemory', 'mem_1'))?.content).toBe('pray v1');
    expect(store.get(STORAGE_KEYS.FONT_SIZE)).toBe('18');
    expect(store.has(STORAGE_KEYS.OPENROUTER_API_KEY)).toBe(false);
  });

  it('keeps the newer side per record and deletes nothing', async () => {
    await seed();
    const backup = await buildPersonalBackup();
    // The file is OLDER for j1 / c1 and NEWER for mem_1; it lacks a local-only journal entry.
    backup.journal = [journal('j1', '2026-01-15T00:00:00Z', 'journal OLD')];
    backup.chatHistory = [chat('c1', 50, 'chat OLD'), chat('c2', 10, 'chat from file')];
    backup.spiritualMemory = [memory('mem_1', '2026-03-01T00:00:00Z', 'pray NEWER')];
    backup.settings = { [STORAGE_KEYS.FONT_SIZE]: '30', [OLD_PROVIDER_KEY]: 'from-file' };
    await idbService.put('journal', journal('j-local', '2026-02-02T00:00:00Z', 'local only'));

    const r = await importPersonalBackup(JSON.stringify(backup));
    expect(r.errors).toEqual([]);
    expect((await idbService.get('journal', 'j1'))?.title).toBe('journal v1');
    expect((await idbService.get('journal', 'j-local'))?.title).toBe('local only');
    expect((await idbService.get('chatHistory', 'c1'))?.title).toBe('chat v1');
    expect((await idbService.get('chatHistory', 'c2'))?.title).toBe('chat from file');
    expect((await idbService.get('spiritualMemory', 'mem_1'))?.content).toBe('pray NEWER');
    expect(store.get(STORAGE_KEYS.FONT_SIZE)).toBe('18'); // present locally → kept
    expect(store.get(OLD_PROVIDER_KEY)).toBe('gm-secret'); // keys are never imported
    expect(await idbService.getAll('bookmarks')).toHaveLength(1);
  });

  it('rejects a file that is not ours, writing nothing', async () => {
    const r = await importPersonalBackup(JSON.stringify({ version: '5.0', notes: [] }));
    expect(r.errors[0]).toContain('Not a Bible app data file');
    const bad = await importPersonalBackup('{oops');
    expect(bad.errors[0]).toContain('Not a valid JSON file');
  });

  it('the sidebar Import (importCombinedBackup) and its summary dialog read the v5 file', async () => {
    await seed();
    const json = JSON.stringify(await buildPersonalBackup());
    expect(parseBackupSummary(json)).toMatchObject({ version: '5.0', notes: 1, annotations: 1, bookmarks: 1, readingPlans: 1, bibleChapters: 0 });
    await clearAll();
    const r = await importCombinedBackup(json);
    expect(r.success).toBe(true);
    expect(r.notesImported).toBe(2); // the notes store + verse data
    expect(r.otherImported).toBe(3); // journal + chat + memory (settings already present)
  });
});

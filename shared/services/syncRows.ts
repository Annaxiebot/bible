/**
 * syncRows.ts — the personal app's server rows · 个人数据同步行
 *
 * One place (R3) for the five tables database/personal-sync-schema.sql
 * recovered (ADR-0010): each table's name, its upsert conflict target, and
 * the builder that turns a local IndexedDB record into the row syncService
 * upserts. syncService.ts writes with these; the schema test pins the
 * conflict targets against the SQL; the live test round-trips these exact
 * row shapes through the real database.
 */
import type { VerseData } from '../types/verseData';
import type { Bookmark, ChatHistoryRecord, SpiritualMemoryItem } from './idbService';

/** Table name + the onConflict string its upsert passes (must match a UNIQUE / PRIMARY KEY). */
export const PERSONAL_SYNC_TABLES = {
  verseData: { table: 'verse_data', onConflict: 'user_id,verse_id' },
  bookmarks: { table: 'bookmarks', onConflict: 'user_id,bookmark_id' },
  chatHistory: { table: 'chat_history', onConflict: 'user_id,id' },
  spiritualMemory: { table: 'spiritual_memory', onConflict: 'id' },
  syncMetadata: { table: 'sync_metadata', onConflict: 'user_id,module' },
} as const;

/** Last-change time of a VerseData record (ms): its note's updatedAt or its newest AI research entry. */
export function verseDataStamp(v: VerseData): number {
  return Math.max(v.personalNote?.updatedAt ?? 0, ...(v.aiResearch ?? []).map(r => r.timestamp || 0), 0);
}

export function verseDataRow(userId: string, local: VerseData, nowIso: string) {
  return {
    user_id: userId,
    verse_id: local.id,
    book_id: local.bookId,
    chapter: local.chapter,
    verses: local.verses,
    data: local,
    updated_at: nowIso,
  };
}

export function bookmarkRow(userId: string, local: Bookmark, nowIso: string) {
  return {
    user_id: userId,
    bookmark_id: local.id,
    book_id: local.bookId,
    book_name: local.bookName,
    chapter: local.chapter,
    verse: local.verse,
    text_preview: local.textPreview || '',
    created_at: local.createdAt,
    updated_at: nowIso,
  };
}

export function chatHistoryRow(userId: string, e: ChatHistoryRecord) {
  return {
    id: e.id,
    user_id: userId,
    title: e.title || '',
    book_id: e.bookId || '',
    chapter: e.chapter || 0,
    messages: e.messages,
    created_at: e.createdAt || new Date(e.lastModified).toISOString(),
    last_modified: e.lastModified,
    updated_at: new Date(e.lastModified).toISOString(),
  };
}

export function spiritualMemoryRow(userId: string, item: SpiritualMemoryItem) {
  return {
    id: item.id,
    user_id: userId,
    category: item.category,
    content: item.content,
    source: item.source || null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export function syncMetadataRow(userId: string, module: string, ts: number) {
  return { user_id: userId, module, last_modified: ts, updated_at: new Date(ts).toISOString() };
}

/** supabase-js resolves (never rejects) with { error }; turn it into a throw so a failed push is not silent (R5). */
export function throwIfUpsertFailed(table: string, result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(`[sync] ${table} upsert failed: ${result.error.message}`);
}

/**
 * personalSyncSchema.test.ts — the recovered sync tables match what syncService writes · 个人同步表结构测试
 *
 * Grep-level pins on database/personal-sync-schema.sql against
 * services/syncRows.ts (table names, upsert conflict targets, row builders)
 * and services/syncService.ts (every upsert to these tables goes through
 * those constants). A conflict target with no matching UNIQUE / PRIMARY KEY
 * makes PostgREST reject the upsert — the exact failure this file fixes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  PERSONAL_SYNC_TABLES, verseDataRow, bookmarkRow, chatHistoryRow, spiritualMemoryRow, syncMetadataRow,
} from '../../services/syncRows';
import type { VerseData } from '../../types/verseData';

const sql = readFileSync(path.resolve(__dirname, '../personal-sync-schema.sql'), 'utf-8');
const flat = sql.replace(/\s+/g, ' ');
const syncSource = readFileSync(path.resolve(__dirname, '../../services/syncService.ts'), 'utf-8');
const tables = Object.values(PERSONAL_SYNC_TABLES);

/** The CREATE TABLE body for one table (up to its closing ");"). */
function tableBody(table: string): string {
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  if (!m) throw new Error(`no CREATE TABLE for ${table}`);
  return m[1];
}

/** Column names of a CREATE TABLE body, comments stripped. */
function columns(table: string): string[] {
  return tableBody(table).split('\n').map(l => l.replace(/--.*$/, '').trim())
    .filter(l => l && !/^(UNIQUE|PRIMARY KEY)\s*\(/.test(l)).map(l => l.split(/\s+/)[0]);
}

/** Every key set a conflict target can resolve to: UNIQUE (...), PRIMARY KEY (...), or an inline "col ... PRIMARY KEY". */
function keySets(table: string): string[] {
  const body = tableBody(table);
  const sets = [...body.matchAll(/(?:UNIQUE|PRIMARY KEY)\s*\(([^)]+)\)/g)].map(m => m[1].replace(/\s+/g, ''));
  for (const line of body.split('\n')) {
    const inline = /^\s*(\w+)\s+\w+.*\bPRIMARY KEY\b(?!\s*\()/.exec(line);
    if (inline) sets.push(inline[1]);
  }
  return sets;
}

const local: VerseData = { id: 'JHN_3_16', bookId: 'JHN', chapter: 3, verses: [16], aiResearch: [] };
const ROWS: Record<string, Record<string, unknown>> = {
  verse_data: verseDataRow('u', local, '2026-10-05T00:00:00Z'),
  bookmarks: bookmarkRow('u', { id: 'JHN:3:16', bookId: 'JHN', bookName: 'John', chapter: 3, verse: 16, textPreview: '', createdAt: 1 }, '2026-10-05T00:00:00Z'),
  chat_history: chatHistoryRow('u', { id: 'c', title: '', messages: [], createdAt: '2026-10-05T00:00:00Z', lastModified: 1 }),
  spiritual_memory: spiritualMemoryRow('u', { id: 'mem_1', category: 'theme', content: 'x', createdAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z' }),
  sync_metadata: syncMetadataRow('u', 'notes', 1),
};

describe('personal-sync-schema.sql', () => {
  it.each(tables)('$table: user_id cascades with the account, and updated_at exists', ({ table }) => {
    expect(tableBody(table).replace(/\s+/g, ' ')).toContain('user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE');
    expect(columns(table)).toContain('updated_at');
  });

  it.each(tables)('$table: the upsert conflict target "$onConflict" is a UNIQUE / PRIMARY KEY', ({ table, onConflict }) => {
    expect(keySets(table)).toContain(onConflict);
  });

  it.each(tables)('$table: every column syncService writes exists', ({ table }) => {
    const cols = columns(table);
    for (const key of Object.keys(ROWS[table])) expect(cols, `${table}.${key}`).toContain(key);
  });

  it('the RLS loop covers exactly the tables syncRows names', () => {
    const loop = /FOREACH t IN ARRAY ARRAY\[([^\]]+)\]/.exec(flat);
    const listed = loop![1].split(',').map(s => s.trim().replace(/'/g, '')).sort();
    expect(listed).toEqual(tables.map(t => t.table).sort());
  });

  it('the RLS loop grants exactly the four owner-only policies to authenticated and revokes anon', () => {
    expect(flat).toContain("EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);");
    expect(flat).toContain("EXECUTE format('REVOKE ALL ON %I FROM anon', t);");
    for (const cmd of ['SELECT TO authenticated USING (auth.uid() = user_id)',
      'INSERT TO authenticated WITH CHECK (auth.uid() = user_id)',
      'UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      'DELETE TO authenticated USING (auth.uid() = user_id)']) {
      expect(flat).toContain(`FOR ${cmd}`);
    }
    expect(flat).not.toMatch(/TO (anon|public)\b/i);
    expect(flat).not.toMatch(/USING \(true\)/i);
  });

  it('is idempotent and puts sync_metadata on the realtime publication syncService subscribes to', () => {
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE INDEX (?!IF NOT EXISTS)/);
    expect(sql.match(/EXECUTE format\('CREATE POLICY/g)).toHaveLength(4);
    expect(sql.match(/EXECUTE format\('DROP POLICY IF EXISTS/g)).toHaveLength(4);
    expect(flat).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_metadata;');
    expect(syncSource).toContain("table: 'sync_metadata', filter:");
  });

  it('creates no bible_cache table, and syncService no longer syncs one (ADR-0010)', () => {
    expect(sql).not.toMatch(/CREATE TABLE[^;]*bible_cache/);
    expect(syncSource).not.toContain("'bible_cache'");
    expect(syncSource).not.toContain('syncBibleCache');
  });
});

describe('services/syncService.ts writes these tables only through syncRows', () => {
  it.each(tables)('$table: no literal table name left in syncService (reads and writes use syncRows)', ({ table }) => {
    expect(syncSource).not.toContain(`from('${table}')`);
  });

  it('each upsert passes its own table\'s conflict target', () => {
    const upserts = [...syncSource.matchAll(/from\(T\.(\w+)\.table\)\.upsert\([^;]*?onConflict: T\.(\w+)\.onConflict/g)];
    expect(upserts.length).toBeGreaterThanOrEqual(6);
    for (const [, table, conflict] of upserts) expect(conflict).toBe(table);
  });
});

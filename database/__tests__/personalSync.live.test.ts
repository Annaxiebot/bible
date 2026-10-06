/**
 * personalSync.live.test.ts — syncService's rows round-trip through the REAL tables · 个人同步真实往返
 *
 * Opt-in (LIVE_DB=1 and ~/.supabase/access-token present; skipped otherwise).
 * For each recovered table, one DO block (as the table owner) takes an
 * existing auth user id, upserts the exact row syncRows builds — twice, so
 * the ON CONFLICT target is exercised — reads it back, then checks RLS as
 * that user (sees it), as another user (sees nothing, cannot write) and as
 * anon (no access). The block ends in RAISE EXCEPTION, so Postgres rolls
 * everything back: nothing is left in the live tables (owner rule: never
 * write test data to live data).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import os from 'os';
import https from 'https';
import path from 'path';
import {
  PERSONAL_SYNC_TABLES, verseDataRow, bookmarkRow, chatHistoryRow, spiritualMemoryRow, syncMetadataRow,
} from '../../services/syncRows';

const TOKEN_FILE = path.join(os.homedir(), '.supabase', 'access-token');
const PROJECT_REF_FILE = path.resolve(__dirname, '../../supabase/.temp/project-ref');
const LIVE = process.env.LIVE_DB === '1' && existsSync(TOKEN_FILE) && existsSync(PROJECT_REF_FILE);
const queryUrl = () => `https://api.supabase.com/v1/projects/${readFileSync(PROJECT_REF_FILE, 'utf8').trim()}/database/query`;
const UID = '00000000-0000-0000-0000-00000000beef'; // placeholder, replaced in SQL by the real user id
const NOW = '2026-10-05T10:00:00.000Z';

/** Node's https, not fetch: the vitest setup replaces global fetch with a mock. */
function runSql(query: string): Promise<{ status: number; text: string }> {
  const body = JSON.stringify({ query });
  return new Promise((resolve, reject) => {
    const req = https.request(queryUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readFileSync(TOKEN_FILE, 'utf8').trim()}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const CASES: Array<{ key: keyof typeof PERSONAL_SYNC_TABLES; row: Record<string, unknown> }> = [
  { key: 'verseData', row: verseDataRow(UID, { id: 'it-probe-JHN_3_16', bookId: 'JHN', chapter: 3, verses: [16, 17],
    aiResearch: [{ id: 'ai_1', query: 'q', response: 'r', timestamp: 2 }], personalNote: { text: '<p>爱</p>', createdAt: 1, updatedAt: 2 } }, NOW) },
  { key: 'bookmarks', row: bookmarkRow(UID, { id: 'it-probe:3:16', bookId: 'JHN', bookName: '约翰福音 John', chapter: 3, verse: 16,
    textPreview: 'For God so loved', createdAt: 1759658400000 }, NOW) },
  { key: 'chatHistory', row: chatHistoryRow(UID, { id: 'it-probe-chat', title: '恩典 grace', bookId: 'JHN', chapter: 3,
    messages: [{ role: 'user', content: 'What is grace?', timestamp: NOW }], createdAt: NOW, lastModified: 1759658400000 }) },
  { key: 'spiritualMemory', row: spiritualMemoryRow(UID, { id: 'mem_it_probe', category: 'prayer', content: '为家人祷告',
    createdAt: NOW, updatedAt: NOW }) },
  { key: 'syncMetadata', row: syncMetadataRow(UID, 'it-probe-module', 1759658400000) },
];

const lit = (v: string) => `$j$${v}$j$`;

/** One rolled-back DO block: upsert ×2 as owner, read back, then RLS as the user / another user / anon. */
function probeSql(table: string, onConflict: string, row: Record<string, unknown>): string {
  const cols = Object.keys(row);
  const keys = onConflict.split(',');
  const sets = cols.filter(c => !keys.includes(c)).map(c => `${c} = EXCLUDED.${c}`).join(', ');
  const where = keys.map(k => (k === 'user_id' ? 'user_id = uid' : `${k} = ${lit(String(row[k]))}`)).join(' AND ');
  const upsert = `INSERT INTO ${table} (${cols.join(', ')}) SELECT ${cols.map(c => `r.${c}`).join(', ')}
      FROM jsonb_populate_record(NULL::${table}, ${lit(JSON.stringify(row))}::jsonb || jsonb_build_object('user_id', uid)) r
      ON CONFLICT (${onConflict}) DO UPDATE SET ${sets};`;
  return `DO $do$ DECLARE uid uuid; got jsonb; mine int; theirs int; foreign_write text := 'allowed'; anon_read text := 'allowed';
  BEGIN
    SELECT id INTO uid FROM auth.users ORDER BY created_at LIMIT 1;
    IF uid IS NULL THEN RAISE EXCEPTION 'NOUSER'; END IF;
    ${upsert}
    ${upsert}
    SELECT to_jsonb(t) INTO got FROM ${table} t WHERE ${where};
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO mine FROM ${table} WHERE ${where};
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    SELECT count(*) INTO theirs FROM ${table} WHERE ${where};
    BEGIN
      INSERT INTO ${table} (${cols.join(', ')}) SELECT ${cols.map(c => `r.${c}`).join(', ')}
        FROM jsonb_populate_record(NULL::${table}, ${lit(JSON.stringify(row))}::jsonb || jsonb_build_object('user_id', uid)) r;
    EXCEPTION WHEN insufficient_privilege OR unique_violation THEN foreign_write := SQLSTATE;
    END;
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
      PERFORM 1 FROM ${table} LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN anon_read := 'denied';
    END;
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'ROUNDTRIP:%', jsonb_build_object('row', got, 'mine', mine, 'theirs', theirs,
      'foreign_write', foreign_write, 'anon_read', anon_read, 'uid', uid);
  END $do$;`;
}

/** jsonb reorders object keys and timestamptz reformats ISO strings; compare by value. */
function same(sent: unknown, back: unknown): boolean {
  if (typeof sent === 'string' && /^\d{4}-\d\d-\d\dT/.test(sent)) return Date.parse(sent) === Date.parse(String(back));
  const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)])) : v);
  return JSON.stringify(canon(sent)) === JSON.stringify(canon(back));
}

describe.skipIf(!LIVE)('personal sync tables — live upsert → read → RLS (rolled back)', () => {
  it.each(CASES)('$key: what syncService upserts is what it reads back, owner-only', async ({ key, row }) => {
    const { table, onConflict } = PERSONAL_SYNC_TABLES[key];
    const { text } = await runSql(probeSql(table, onConflict, row));
    const message = String((JSON.parse(text) as { message?: string }).message ?? text);
    const match = /ROUNDTRIP:(\{.*\})\s*(?:\n|$)/s.exec(message);
    expect(match, message.slice(0, 400)).not.toBeNull();
    const out = JSON.parse(match![1]) as { row: Record<string, unknown>; mine: number; theirs: number; foreign_write: string; anon_read: string; uid: string };
    for (const [col, value] of Object.entries(row)) {
      const expected = col === 'user_id' ? out.uid : value;
      expect(same(expected, out.row[col]), `${table}.${col}: sent ${JSON.stringify(expected)} got ${JSON.stringify(out.row[col])}`).toBe(true);
    }
    expect(out.mine).toBe(1);        // the owner sees the row through RLS
    expect(out.theirs).toBe(0);      // another signed-in user does not
    expect(out.foreign_write).toBe('42501'); // nor can write a row for the owner
    expect(out.anon_read).toBe('denied');
    // rolled back: nothing left behind
    const keyCol = onConflict.split(',').find(k => k !== 'user_id')!;
    const left = await runSql(`SELECT count(*)::int AS n FROM ${table} WHERE ${keyCol} = ${lit(String(row[keyCol]))}`);
    expect(left.text).toContain('"n":0');
  });
});

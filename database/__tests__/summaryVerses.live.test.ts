/**
 * summaryVerses.live.test.ts — the verses round trip against the REAL database · 经文列真实往返
 *
 * Opt-in (LIVE_DB=1 and ~/.supabase/access-token present; skipped otherwise,
 * so CI and normal runs never touch the live project). Writes the browser's
 * summary row (packSummaryFrom) for the demo pack into pack_summaries, reads it
 * back with the edge function's own column list (SUMMARY_COLUMNS) and parses it
 * with the function's reader (passageFromSummary) — all inside one DO block that
 * ends in RAISE EXCEPTION, so Postgres rolls the insert back: nothing is left
 * in the live table (owner rule: never write test data to live data).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import os from 'os';
import https from 'https';
import path from 'path';
import { parseStudyPack } from '../../components/studypack/packTypes';
import { packSummaryFrom } from '../../components/signup/packSummary';
import { SUMMARY_COLUMNS, passageFromSummary, PackSummaryRow } from '../../supabase/functions/send-checkins/packSource';

const TOKEN_FILE = path.join(os.homedir(), '.supabase', 'access-token');
/** The linked project (written by `supabase link`; the one place the ref lives locally, gitignored). */
const PROJECT_REF_FILE = path.resolve(__dirname, '../../supabase/.temp/project-ref');
const LIVE = process.env.LIVE_DB === '1' && existsSync(TOKEN_FILE) && existsSync(PROJECT_REF_FILE);
const queryUrl = () => `https://api.supabase.com/v1/projects/${readFileSync(PROJECT_REF_FILE, 'utf8').trim()}/database/query`;
const PROBE_ID = 'it-roundtrip-summary-verses';

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

describe.skipIf(!LIVE)('pack_summaries verses/key_verse — live write → read round trip (rolled back)', () => {
  it('what the browser writes is what the edge function reads', async () => {
    const pack = parseStudyPack(JSON.parse(readFileSync(path.resolve(__dirname, '../../public/packs/2026-10-02-matt6.json'), 'utf8')));
    const row = packSummaryFrom({ ...pack, id: PROBE_ID, leaderId: '00000000-0000-0000-0000-000000000000' })!;
    expect(row.verses.length).toBeGreaterThan(0);
    const json = JSON.stringify(row.verses);
    expect(json).not.toContain('$v$');
    const sql = `DO $do$ DECLARE r record; BEGIN
      INSERT INTO pack_summaries (pack_id, leader_id, title, passage_ref, reflection_lines, verses, key_verse)
      VALUES ('${PROBE_ID}', (SELECT leader_id FROM pack_summaries WHERE leader_id IS NOT NULL LIMIT 1),
              $v$${row.title}$v$, $v$${row.passage_ref}$v$, '{}', $v$${json}$v$::jsonb, ${row.key_verse ?? 'NULL'});
      SELECT ${SUMMARY_COLUMNS} INTO r FROM pack_summaries WHERE pack_id = '${PROBE_ID}';
      RAISE EXCEPTION 'ROUNDTRIP:%', row_to_json(r);
    END $do$;`;
    const { text } = await runSql(sql);
    // The management API answers {"message": "... ERROR: P0001: ROUNDTRIP:{row json}\nCONTEXT: ..."}.
    const message = String((JSON.parse(text) as { message?: string }).message ?? '');
    const match = /ROUNDTRIP:(\{.*?\})\s*(?:\n|$)/s.exec(message);
    expect(match, message.slice(0, 300)).not.toBeNull();
    const back = JSON.parse(match![1]) as PackSummaryRow;
    expect(back.verses).toEqual(row.verses);
    expect(back.key_verse).toBe(row.key_verse);
    const passage = passageFromSummary(back);
    expect(passage?.verses.map(v => v.num)).toEqual(row.verses.map(v => v.num));
    // rolled back: nothing left behind
    const left = await runSql(`SELECT count(*)::int AS n FROM pack_summaries WHERE pack_id = '${PROBE_ID}'`);
    expect(left.text).toContain('"n":0');
  });
});

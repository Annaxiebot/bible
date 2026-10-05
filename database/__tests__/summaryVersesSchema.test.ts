/**
 * summaryVersesSchema.test.ts — the verses migration says what the code assumes · 经文迁移测试
 *
 * Grep-level pins on database/summary-verses-schema.sql (ADR-0004 §12): the
 * two idempotent columns the browser writes and the function selects, the
 * backfill's keyPhrase pattern = packSummary.KEY_VERSE_PATTERN, the backfill
 * touching only same-owner rows that have no verses yet, and the anon
 * projections (public_signup_pack, checkin_context) not exposing verses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { KEY_VERSE_PATTERN, PACK_SUMMARIES_TABLE } from '../../components/signup/packSummary';
import { SUMMARY_COLUMNS } from '../../supabase/functions/send-checkins/packSource.ts';

const dir = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(dir, file), 'utf-8');
const sql = read('summary-verses-schema.sql');
const flat = sql.replace(/\s+/g, ' ');
const code = (text: string) => text.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

describe('summary-verses-schema.sql', () => {
  it('adds verses (JSONB array) and key_verse (INT) idempotently; the function selects both', () => {
    expect(flat).toContain(`ALTER TABLE ${PACK_SUMMARIES_TABLE} ADD COLUMN IF NOT EXISTS verses JSONB CHECK (verses IS NULL OR jsonb_typeof(verses) = 'array');`);
    expect(flat).toContain(`ALTER TABLE ${PACK_SUMMARIES_TABLE} ADD COLUMN IF NOT EXISTS key_verse INT;`);
    expect(SUMMARY_COLUMNS).toContain('verses');
    expect(SUMMARY_COLUMNS).toContain('key_verse');
    expect(code(sql)).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/);
  });

  it('backfills from study_packs only for the same owner and only rows without verses (re-run safe)', () => {
    expect(flat).toContain("WHERE ps.pack_id = p.id AND ps.leader_id = p.leader_id AND ps.verses IS NULL;");
    expect(flat).toContain("s.section->>'kind' = 'scripture'");
    expect(flat).toContain("jsonb_build_object('num', (v.verse->>'num')::int, 'cuv', v.verse->>'cuv', 'en', v.verse->>'en')");
    expect(flat).toContain('ORDER BY sc.idx, v.vidx');
  });

  it('reads the key verse with the same pattern as the browser, and keeps it only when it is in the passage', () => {
    expect(sql).toContain(`'${KEY_VERSE_PATTERN.source}'`);
    expect(flat).toContain("CASE WHEN p.verses @> jsonb_build_array(jsonb_build_object('num', p.key_verse)) THEN p.key_verse END");
  });

  it('the anon projections do not start exposing verses', () => {
    expect(code(read('remove-forms-schema.sql'))).not.toMatch(/verses|key_verse/);
    expect(code(read('checkin-optout-schema.sql'))).not.toMatch(/\bp\.verses|key_verse/);
  });
});

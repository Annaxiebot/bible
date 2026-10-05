/**
 * packSummary.test.ts — what leaves the browser for the check-in sender · 摘要测试
 *
 * The summary row holds title, passage, reflection lines, the closing
 * question, and the passage's verses + key verse number for the check-in
 * email (copied from the pack, ADR-0004 §12) — never discussion questions or
 * other study content; demo packs produce nothing;
 * the upsert is keyed by pack_id; sync runs only for the signed-in owner
 * and returns failures instead of throwing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseStudyPack } from '../../studypack/packTypes';
import { TEST_PACK_PATH } from '../../studypack/__tests__/fixtures';
import {
  packSummaryFrom, upsertPackSummary, syncPackSummary, keyVerseNumber, PACK_SUMMARIES_TABLE,
} from '../packSummary';
import { assemblePack } from '../../newstudy/packAssembly';
import { validateGenerated } from '../../newstudy/generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from '../../newstudy/__tests__/fixtures';
import { SU_SUMMARY_FAILED } from '../signupStrings';

const upsertMock = vi.fn();
let uid: string | null = 'uid-lead';
let configured = true;
vi.mock('../../../services/supabase', () => ({
  get supabase() { return configured ? { from: () => ({ upsert: upsertMock }) } : null; },
  authManager: { getUserId: () => uid },
}));

const demo = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const owned = parseStudyPack({ ...demo, leaderId: 'uid-lead' });

describe('packSummaryFrom', () => {
  it('is null for a demo pack and carries only the summary fields for an owned pack', () => {
    expect(packSummaryFrom(demo)).toBeNull();
    const row = packSummaryFrom(owned)!;
    expect(Object.keys(row).sort()).toEqual([
      'closing_question', 'key_verse', 'leader_id', 'pack_id', 'passage_ref', 'reflection_lines', 'title', 'verses',
    ]);
    // An old pack that still carries a Google Form (removed 2026-10-05): the retired columns are not written.
    const legacy = parseStudyPack({ ...owned, feedbackFormUrl: 'https://docs.google.com/forms/d/e/x/viewform', feedbackFormEntries: { name: 'entry.1' } });
    expect(packSummaryFrom(legacy)).toEqual(row);
    expect(row.pack_id).toBe(owned.id);
    expect(row.leader_id).toBe('uid-lead');
    expect(row.title).toBe(owned.title);
    expect(row.passage_ref).toBe(owned.passageRef);
    expect(row.reflection_lines).toEqual(owned.sections.find(s => s.kind === 'reflection')!.body);
    expect(row.reflection_lines[0]).toMatch(/^周二跟进/);
    expect(row.closing_question).toMatch(/^「/);
    const discussion = owned.sections.find(s => s.kind === 'discussion')!.questions![0];
    expect(JSON.stringify(row)).not.toContain(discussion);  // study content other than the verses stays in the pack
  });

  it('copies every verse of the scripture section verbatim ({num, cuv, en} only) and the key verse number', () => {
    const scripture = owned.sections.find(s => s.kind === 'scripture')!;
    const row = packSummaryFrom(owned)!;
    expect(row.verses).toEqual(scripture.verses);   // the bundled 和合本 + BSB text, never regenerated
    expect(row.verses).toHaveLength(10);
    expect(row.key_verse).toBe(25);                 // "「不要为生命忧虑」 “Do not worry about your life” (v.25)"
    const extra = parseStudyPack({ ...owned, sections: owned.sections.map(s => s.kind === 'scripture'
      ? { ...s, verses: s.verses!.map(v => ({ ...v, note: 'x' })) } : s) });
    expect(packSummaryFrom(extra)!.verses).toEqual(scripture.verses);
  });

  it('stores a long passage whole (箴言 1 has 33 verses) and joins split scripture sections in order', () => {
    const scripture = owned.sections.find(s => s.kind === 'scripture')!;
    const long = Array.from({ length: 33 }, (_, i) => ({ num: i + 1, cuv: `第${i + 1}节`, en: `verse ${i + 1}` }));
    const split = parseStudyPack({ ...owned, sections: [
      ...owned.sections.filter(s => s.kind !== 'scripture'),
      { ...scripture, keyPhrase: '「敬畏」 “fear” (v.7)', verses: long.slice(0, 20) },
      { ...scripture, keyPhrase: undefined, verses: long.slice(20) },
    ] });
    const row = packSummaryFrom(split)!;
    expect(row.verses.map(v => v.num)).toEqual(long.map(v => v.num));
    expect(row.key_verse).toBe(7);
  });

  it('a pack with no scripture section has no verses and no key verse', () => {
    const bare = parseStudyPack({ ...owned, sections: owned.sections.filter(s => s.kind !== 'scripture') });
    expect(packSummaryFrom(bare)).toMatchObject({ verses: [], key_verse: null });
  });
});

describe('keyVerseNumber', () => {
  const verses = [{ num: 6, cuv: '六', en: 'six' }, { num: 7, cuv: '七', en: 'seven' }];

  it('reads the trailing "(v.N)" only when N is one of the verses', () => {
    expect(keyVerseNumber('「敬畏耶和华是知识的开端」 The fear of the LORD (v.7)', verses)).toBe(7);
    expect(keyVerseNumber('「x」 “y” (v.7)  ', verses)).toBe(7);
    expect(keyVerseNumber('「x」 “y” (v.9)', verses)).toBeNull();
    expect(keyVerseNumber('「x」 “y”', verses)).toBeNull();
    expect(keyVerseNumber(undefined, verses)).toBeNull();
  });

  it('matches what packAssembly writes (round trip through a real assembled pack)', () => {
    const passage = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
    const pack = assemblePack(JOHN3_REQUEST, passage, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));
    const row = packSummaryFrom({ ...pack, leaderId: 'uid-lead' })!;
    expect(row.key_verse).toBe(JOHN3_GENERATED.keyPhrase.verse);
    expect(row.verses).toEqual(passage);
  });
});

describe('upsertPackSummary', () => {
  beforeEach(() => upsertMock.mockReset().mockResolvedValue({ error: null }));

  it('upserts the row keyed by pack_id and resolves true; false for a demo pack without calling', async () => {
    const from = vi.fn(() => ({ upsert: upsertMock }));
    const client = { from } as unknown as SupabaseClient;
    expect(await upsertPackSummary(client, owned)).toBe(true);
    expect(from).toHaveBeenCalledWith(PACK_SUMMARIES_TABLE);
    expect(upsertMock).toHaveBeenCalledWith(packSummaryFrom(owned), { onConflict: 'pack_id' });
    expect(await upsertPackSummary(client, demo)).toBe(false);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('throws the bilingual failure with the PostgREST message', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'permission denied' } });
    const client = { from: () => ({ upsert: upsertMock }) } as unknown as SupabaseClient;
    await expect(upsertPackSummary(client, owned)).rejects.toThrow(`${SU_SUMMARY_FAILED}: permission denied`);
  });
});

describe('syncPackSummary', () => {
  beforeEach(() => { uid = 'uid-lead'; configured = true; upsertMock.mockReset().mockResolvedValue({ error: null }); });

  it('syncs for the signed-in owner', async () => {
    expect(await syncPackSummary(owned)).toEqual({ status: 'synced' });
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('skips for a demo pack, another user, signed out, or an unconfigured service', async () => {
    expect(await syncPackSummary(demo)).toEqual({ status: 'skipped' });
    uid = 'uid-other';
    expect(await syncPackSummary(owned)).toEqual({ status: 'skipped' });
    uid = null;
    expect(await syncPackSummary(owned)).toEqual({ status: 'skipped' });
    uid = 'uid-lead'; configured = false;
    expect(await syncPackSummary(owned)).toEqual({ status: 'skipped' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns a failure (never throws) so the caller can render it', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'RLS' } });
    expect(await syncPackSummary(owned)).toEqual({ status: 'failed', message: `${SU_SUMMARY_FAILED}: RLS` });
  });
});

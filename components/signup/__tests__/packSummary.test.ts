/**
 * packSummary.test.ts — what leaves the browser for the check-in sender · 摘要测试
 *
 * The summary row holds only title, passage, reflection lines and the
 * closing question (never verses/questions); demo packs produce nothing;
 * the upsert is keyed by pack_id; sync runs only for the signed-in owner
 * and returns failures instead of throwing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseStudyPack } from '../../studypack/packTypes';
import { TEST_PACK_PATH } from '../../studypack/__tests__/fixtures';
import { packSummaryFrom, upsertPackSummary, syncPackSummary, PACK_SUMMARIES_TABLE } from '../packSummary';
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
      'closing_question', 'leader_id', 'pack_id', 'passage_ref', 'reflection_lines', 'title',
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
    expect(JSON.stringify(row)).not.toContain('不要为生命忧虑吃甚么');  // no verse text leaves the browser
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

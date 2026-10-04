/**
 * sharingData.test.ts — loader + previous-pack choice · 上周分享数据测试 (ADR-0008)
 */
import { describe, it, expect } from 'vitest';
import { loadSharingMaterial, previousPackCandidates, defaultPreviousPack, MAX_SHARED_ANSWERS } from '../sharingData';
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE } from '../../signup/signupSchema';
import { LD_ERR_LOAD } from '../../leader/leaderStrings';
import { LEADER, PREVIOUS, CURRENT, CLOSING_Q, IDENTIFIERS, defaultClient, fakeClient, makePack } from './fixtures';

describe('loadSharingMaterial', () => {
  it('reads both tables for the previous pack AND the leader uid (RLS + client filter)', async () => {
    const { client, filters } = defaultClient();
    await loadSharingMaterial(client, PREVIOUS, LEADER);
    expect(filters[SIGNUPS_TABLE]).toEqual([['pack_id', PREVIOUS.id], ['leader_id', LEADER]]);
    expect(filters[CHECKIN_ANSWERS_TABLE]).toEqual([['pack_id', PREVIOUS.id], ['leader_id', LEADER]]);
  });

  it('returns practice counts per area, answer text only and the closing question — no identifiers', async () => {
    const { client } = defaultClient();
    const { scrub, ...material } = await loadSharingMaterial(client, PREVIOUS, LEADER);
    expect(material.practices).toEqual([{ area: '健康 Health', count: 2 }, { area: '家庭 Family', count: 1 }]);
    expect(material.sharedAnswers).toHaveLength(3);
    expect(material.closingQuestion).toBe(CLOSING_Q);
    const sent = JSON.stringify(material);
    for (const id of IDENTIFIERS) expect(sent).not.toContain(id);
    expect(sent).not.toContain('Other Leader Member');  // another leader's row never counts
    expect(scrub('王小明')).not.toContain('王小明');
  });

  it('keeps at most MAX_SHARED_ANSWERS answers', async () => {
    const many = Array.from({ length: MAX_SHARED_ANSWERS + 5 }, (_, i) => ({
      id: `a${i}`, signup_id: 's-1', leader_id: LEADER, kind: 'tue', answer: `answer ${i}`, created_at: '2026-10-06T00:00:00Z',
    }));
    const { client } = fakeClient({ [CHECKIN_ANSWERS_TABLE]: { data: many, error: null } });
    expect((await loadSharingMaterial(client, PREVIOUS, LEADER)).sharedAnswers).toHaveLength(MAX_SHARED_ANSWERS);
  });

  it('throws the leader page\'s bilingual load error on a PostgREST failure', async () => {
    const { client } = fakeClient({ [SIGNUPS_TABLE]: { data: null, error: { message: 'permission denied' } } });
    await expect(loadSharingMaterial(client, PREVIOUS, LEADER)).rejects.toThrow(`${LD_ERR_LOAD}: permission denied`);
  });
});

describe('previous-pack choice', () => {
  const later = makePack('local-2026-10-16-x', '2026-10-16');
  const older = makePack('local-2026-09-25-y', '2026-09-25');
  const foreign = makePack('local-2026-10-05-z', '2026-10-05', { leaderId: 'someone-else' });

  it('lists the leader\'s other packs newest first, never the current one or another leader\'s', () => {
    const list = previousPackCandidates([CURRENT, older, foreign, later, PREVIOUS], CURRENT, LEADER);
    expect(list.map(p => p.id)).toEqual([later.id, PREVIOUS.id, older.id]);
  });

  it('defaults to the newest pack dated on or before the current one; else the newest; else none', () => {
    expect(defaultPreviousPack([later, PREVIOUS, older], CURRENT)?.id).toBe(PREVIOUS.id);
    expect(defaultPreviousPack([later], CURRENT)?.id).toBe(later.id);
    expect(defaultPreviousPack([], CURRENT)).toBeNull();
  });
});

/**
 * signupPack.test.ts — where the sign-up page's pack comes from · 报名页查经包来源测试
 *
 * A pack this device (or the signed-in leader) holds never calls the RPC;
 * a local id this phone lacks falls back to public_signup_pack; a null
 * answer is 'not-found', a server error 'server', a malformed answer
 * 'invalid', no client 'unconfigured' — each a SignupPackError with a
 * bilingual message, never a silent empty page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StudyPack } from '../../studypack/packTypes';

const findLeaderPack = vi.fn();
const loadPack = vi.fn();
vi.mock('../../studypack/packSource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../studypack/packSource')>()),
  findLeaderPack: (id: string) => findLeaderPack(id),
  loadPack: (id: string) => loadPack(id),
}));
const rpc = vi.fn();
let client: { rpc: typeof rpc } | null = { rpc };
vi.mock('../signupClient', () => ({ getSignupClient: () => client }));

import { loadSignupPack, parseSignupPack, SignupPackError, toSignupPack } from '../signupPack';
import { SIGNUP_PACK_FN, SIGNUP_PACK_KEYS } from '../signupSchema';
import { SU_ERR_NOT_CONFIGURED, SU_PACK_ASK_LEADER, SU_PACK_INVALID } from '../signupStrings';

const LOCAL_ID = 'local-2026-10-02-pro1';
const LEADER = 'uid-lead';
const MENU = [{ area: '健康 Health', practice: '早睡 · Sleep early' }];
const FULL: StudyPack = {
  id: LOCAL_ID, title: '箴言 Proverbs 1', date: '2026-10-02', passageRef: '箴言 1 · Proverbs 1', enVersion: 'BSB', leaderId: LEADER,
  sections: [
    { kind: 'discussion', heading: '讨论 Discussion', questions: ['Q1 secret'] },
    { kind: 'lifeMenu', heading: '生活 Life', rows: MENU },
  ],
};
const PROJECTION = { id: LOCAL_ID, title: FULL.title, passageRef: FULL.passageRef, leaderId: LEADER, lifeMenu: MENU };

async function failure(promise: Promise<unknown>): Promise<SignupPackError> {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(SignupPackError);
  return err as SignupPackError;
}

beforeEach(() => {
  findLeaderPack.mockReset();
  loadPack.mockReset();
  rpc.mockReset();
  client = { rpc };
});

describe('loadSignupPack', () => {
  it('a local pack this device holds is used as is: no RPC', async () => {
    findLeaderPack.mockResolvedValue(FULL);
    await expect(loadSignupPack(LOCAL_ID)).resolves.toEqual(toSignupPack(FULL));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a committed pack loads through packSource.loadPack: no RPC', async () => {
    loadPack.mockResolvedValue({ ...FULL, id: '2026-10-02-matt6' });
    const pack = await loadSignupPack('2026-10-02-matt6');
    expect(pack.lifeMenu).toEqual(MENU);
    expect(findLeaderPack).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a local id this phone lacks falls back to the public projection, carrying the leader', async () => {
    findLeaderPack.mockResolvedValue(null);
    rpc.mockResolvedValue({ data: PROJECTION, error: null });
    const pack = await loadSignupPack(LOCAL_ID);
    expect(rpc).toHaveBeenCalledWith(SIGNUP_PACK_FN, { p_pack_id: LOCAL_ID });
    expect(pack).toEqual(PROJECTION);
    expect(pack.leaderId).toBe(LEADER);
  });

  it('the RPC answering null is a not-found failure telling the member to ask the leader', async () => {
    findLeaderPack.mockResolvedValue(null);
    rpc.mockResolvedValue({ data: null, error: null });
    const err = await failure(loadSignupPack(LOCAL_ID));
    expect(err.kind).toBe('not-found');
    expect(err.message).toBe(SU_PACK_ASK_LEADER);
  });

  it('an RPC error is a server failure carrying the server message', async () => {
    findLeaderPack.mockResolvedValue(null);
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function public_signup_pack' } });
    const err = await failure(loadSignupPack(LOCAL_ID));
    expect(err.kind).toBe('server');
    expect(err.message).toContain('permission denied');
  });

  it('no Supabase client is an unconfigured failure', async () => {
    findLeaderPack.mockResolvedValue(null);
    client = null;
    const err = await failure(loadSignupPack(LOCAL_ID));
    expect(err.kind).toBe('unconfigured');
    expect(err.message).toBe(SU_ERR_NOT_CONFIGURED);
  });
});

describe('parseSignupPack', () => {
  it('ignores Google Form keys an old server function might still return (removed 2026-10-05)', () => {
    const pack = parseSignupPack({ ...PROJECTION, feedbackFormUrl: 'https://evil.example/x', feedbackFormEntries: 7 }, LOCAL_ID);
    expect(pack).toEqual(PROJECTION);
  });

  it.each([
    ['id', { ...PROJECTION, id: 'local-other' }],
    ['leaderId', { ...PROJECTION, leaderId: null }],
    ['lifeMenu', { ...PROJECTION, lifeMenu: [{ area: 1 }] }],
  ])('rejects a bad %s as invalid', (field, raw) => {
    expect(() => parseSignupPack(raw, LOCAL_ID)).toThrow(`${SU_PACK_INVALID} (${field})`);
  });

  it('a pack mapped for sign-up carries exactly the projection keys — no discussion, no sections', () => {
    expect(Object.keys(toSignupPack(FULL)).sort()).toEqual([...SIGNUP_PACK_KEYS].sort());
    expect(JSON.stringify(toSignupPack(FULL))).not.toContain('secret');
  });
});

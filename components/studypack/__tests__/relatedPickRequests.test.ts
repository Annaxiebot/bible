/**
 * relatedPickRequests.test.ts — what the TV sends with ADR-0016 off and on (R14)
 *
 * Off (the shipped default): one request per question, byte-identical to
 * the ADR-0015 request — pinned by SHA-256 hashes of the own-key POST body
 * captured from master 118d5ad0 with the real committed xref + Bible files.
 * On (mocked): a 'pick' call first, then the answer call whose RELATED
 * VERSES follow the pick; a failed pick still answers with the vote top 6.
 * Parity: the pick's final messages are the same on the own-key and proxy paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { parseStudyPack, buildSlides } from '../packTypes';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { PICK_SYSTEM_PROMPT, SCOPE_GUARD, PromptMessage, RELATED_VERSES_HEADING } from '../../../supabase/functions/_shared/aiPrompts';
import { validateRequest, ASK_AI_MODEL } from '../../../supabase/functions/ai-proxy/policy';
import { ownKeyBody } from '../../../services/aiTransport';
import { TEST_PACK_PATH } from './fixtures';

// Original-word retrieval is not under test here (originalWords tests cover it): with the
// ADR-0018 switch on it finds nothing, so these requests stay exactly what this file pins.
vi.mock('../originalWords', async importOriginal => ({
  ...(await importOriginal<typeof import('../originalWords')>()),
  loadOriginalWords: vi.fn(async () => ({ verses: [], targets: [], warnings: [] })),
}));
import { stubBundledFetch } from './bundledFetch';

const pickSwitch = vi.hoisted(() => ({ on: false }));
vi.mock('../relatedPick', async importOriginal => {
  const real = await importOriginal<typeof import('../relatedPick')>();
  return { ...real, get QUESTION_AWARE_ENABLED() { return pickSwitch.on; } };
});

import { streamStudyAI } from '../askAIFallback';
import { QUESTION_AWARE_ENABLED, buildPickBody, pickCandidates } from '../relatedPick';
import { clearRelatedVersesCache, lastRelatedVerses, loadRelatedVerses } from '../relatedVerses';
import { clearExternalVerseCache } from '../externalVerses';

const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const slide = buildSlides(pack)[0];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;

/** Own-key POST body hashes from master 118d5ad0 (ADR-0015 on), slide 0, no history. */
const GOLDEN: Array<[string, string]> = [
  ['第27节是什么意思？', 'f4a5e2d6dfee6846efa3c08f459500ab445edcaeb0e7ce4d4292311615c22c2e'],
  ['What does the whole Bible say about worry?', '2890cc16fa5fc26bdfb29c24dd43f0c04352704659704c3038f74cb83e887ed4'],
];

function sse(text: string): Response {
  const line = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n`;
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(line)); c.close(); } });
  return { ok: true, status: 200, body } as unknown as Response;
}

type Call = [string, RequestInit | undefined];
const messagesOf = (call: Call) => (JSON.parse(call[1]!.body as string) as { messages: PromptMessage[] }).messages;

/** Ask once with the real files; `pickReply` answers a pick call (a function may throw). */
async function ask(question: string, pickReply: () => Response = () => sse('')): Promise<Call[]> {
  const files = stubBundledFetch();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') return files(url);
    return String(init.body).includes('CANDIDATES (') ? pickReply() : sse('ok');
  });
  vi.stubGlobal('fetch', fetchMock);
  await streamStudyAI(pack, slide, [], question, () => undefined, new AbortController().signal);
  return (fetchMock.mock.calls as unknown as Call[]).filter(c => c[1]?.method === 'POST');
}

beforeEach(() => {
  vi.unstubAllGlobals();
  clearRelatedVersesCache();
  clearExternalVerseCache();
  pickSwitch.on = false;
  getItemMock.mockReset().mockImplementation((key: string) => (key === STORAGE_KEYS.OPENROUTER_API_KEY ? 'test-key' : null));
});

describe('switch off (default): today\'s request, byte for byte', () => {
  it.each(GOLDEN)('%s → one POST matching the master hash', async (question, hash) => {
    expect(QUESTION_AWARE_ENABLED).toBe(false);
    const posts = await ask(question);
    expect(posts).toHaveLength(1);
    expect(sha(posts[0][1]!.body as string)).toBe(hash);
    expect(lastRelatedVerses()?.source).toBe('votes');
  });
});

describe('switch on (mocked)', () => {
  it('a pick call first (role pick, its own system text), then the answer with the picked verses first', async () => {
    pickSwitch.on = true;
    stubBundledFetch();
    const votes = (await loadRelatedVerses(pack, 'q')).related.map(r => r.ref);
    let pool: string[] = [];
    await loadRelatedVerses(pack, 'q', async (p, byVotes) => { pool = p.map(t => t.ref); return { targets: byVotes, source: 'votes', warnings: [] }; });
    const chosen = pool[40]; // far below the vote top 6
    expect(votes).not.toContain(chosen);
    const posts = await ask('How do I plan without worrying?', () => sse(`${chosen}\nnot a ref`));
    expect(posts).toHaveLength(2);
    const pickMessages = messagesOf(posts[0]);
    expect(pickMessages[0]).toEqual({ role: 'system', content: `${SCOPE_GUARD}\n\n${PICK_SYSTEM_PROMPT}` });
    expect(pickMessages[1].content).toContain('QUESTION: How do I plan without worrying?');
    const answerUser = messagesOf(posts[1]).at(-1)!.content;
    expect(answerUser).toContain(`${RELATED_VERSES_HEADING} (`);
    const result = lastRelatedVerses()!;
    expect(result.source).toBe('pick');
    expect(result.related[0].ref).toBe(chosen);
    expect(result.related.map(r => r.ref)).toHaveLength(6);
    expect(result.related.slice(1).map(r => r.ref)).toEqual(votes.filter(r => r !== chosen).slice(0, 5));
    expect(result.warnings).toContain('pick ignored 1 line(s): not a ref');
  });

  it('a failed pick call still answers, with the vote top 6 and the reason recorded', async () => {
    pickSwitch.on = true;
    stubBundledFetch();
    const votes = (await loadRelatedVerses(pack, 'q')).related.map(r => r.ref);
    expect(votes).toHaveLength(6);
    const posts = await ask('q', () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) }) as unknown as Response);
    expect(posts).toHaveLength(2);
    const result = lastRelatedVerses()!;
    expect(result.source).toBe('votes');
    expect(result.related.map(r => r.ref)).toEqual(votes);
    expect(result.warnings.some(w => w.startsWith('pick fell back to votes: error:'))).toBe(true);
  });
});

describe('own-key vs proxy parity for the pick call (ADR-0014)', () => {
  it('same final messages; the proxy keeps the Ask-AI model and caps the tokens at the pick limit', async () => {
    stubBundledFetch();
    let pool: Parameters<typeof pickCandidates>[0] = [];
    await loadRelatedVerses(pack, 'q', async (p, byVotes) => { pool = p; return { targets: byVotes, source: 'votes', warnings: [] }; });
    const body = buildPickBody(pack.passageRef, 'q', pickCandidates(pool), ASK_AI_MODEL);
    const own = JSON.parse(ownKeyBody('pick', body)) as { messages: PromptMessage[]; max_tokens: number };
    const v = validateRequest({ ...JSON.parse(body), role: 'pick', max_tokens: 9999, model: 'evil/model' });
    if (!('request' in v)) throw new Error(v.detail);
    expect(own.messages).toEqual(v.request.messages);
    expect(v.request).toMatchObject({ role: 'pick', maxTokens: own.max_tokens, model: ASK_AI_MODEL, reasoning: { enabled: false, exclude: true } });
  });
});

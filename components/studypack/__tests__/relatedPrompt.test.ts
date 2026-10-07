/**
 * relatedPrompt.test.ts — the RELATED VERSES request vs today's request (ADR-0015 §4, §6; R14)
 *
 * Control: with the switch off (or no related verses) the body and the
 * final messages on BOTH paths (own key → ownKeyBody; signed in → the
 * proxy's validateRequest) are byte-identical to the request before
 * ADR-0015 — pinned by SHA-256 hashes captured from master 6bf11399.
 * Treatment: the block sits in the user message and the system message
 * gains exactly one sentence, the same on both paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { parseStudyPack, buildSlides, StudyPack, Slide } from '../packTypes';
import { buildRequestBody } from '../askAIStream';
import { streamStudyAI } from '../askAIFallback';
import { ownKeyBody } from '../../../services/aiTransport';
import { validateRequest } from '../../../supabase/functions/ai-proxy/policy';
import {
  ASK_AI_ANSWER_CONTRACT, ASK_AI_RELATED_VERSES_RULE, RELATED_VERSES_HEADING, PromptMessage,
} from '../../../supabase/functions/_shared/aiPrompts';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { RelatedVerse } from '../relatedVerses';
import { TEST_PACK_PATH } from './fixtures';

const loadRelatedMock = vi.hoisted(() => vi.fn());
vi.mock('../relatedVerses', async importOriginal => ({
  ...(await importOriginal<typeof import('../relatedVerses')>()),
  loadRelatedVerses: loadRelatedMock,
}));

const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const slides: Slide[] = buildSlides(pack);
const HISTORY = [{ role: 'user' as const, content: 'q0' }, { role: 'assistant' as const, content: 'a0' }];
const QUESTION = '第27节是什么意思？';
const MODEL = 'google/gemini-2.5-flash';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** [body, own-key body, proxy final messages] hashes of the pre-ADR-0015 request, slides 0 and 1. */
const GOLDEN: Record<number, [string, string, string]> = {
  0: [
    'f539bc0523fcb37e0ca2e0870014b7687e2f8827bf7252d468900edafe9f3398',
    'a9bb73d0e3fb4ff9bb103e0aab9255a12b6ac9fc9e0aa96a7367f49c5d1cf45b',
    '38c288e3b14340357ac71fd72fef669db3ab76a5017103b2d039f9cb555371af',
  ],
  1: [
    'cbe30bcf698d434f0ec5e4f2e313335777be7a18414de7ea0865cc706968bc5b',
    '0c752c9f4368004b754568243868db38d7997862f81294532a177c9394a462c7',
    '1cb3143bd236bbd9e0beb8f2eae476bde6f5b8beda703c8cb4ce790309ae7134',
  ],
};

const RELATED: RelatedVerse[] = [
  { ref: 'PHP.4.6', votes: 158, label: '腓立比书 4:6 · Philippians 4:6', verses: [{ num: 6, cuv: '应当一无挂虑…', en: 'Be anxious for nothing…' }] },
  { ref: '1PE.5.7', votes: 104, label: '彼得前书 5:7 · 1 Peter 5:7', verses: [{ num: 7, cuv: '你们要将一切的忧虑卸给神…', en: 'Cast all your anxiety on Him…' }] },
];

function paths(body: string): { own: PromptMessage[]; hosted: PromptMessage[] } {
  const v = validateRequest({ ...JSON.parse(body), role: 'ask' });
  if (!('request' in v)) throw new Error(v.detail);
  return { own: (JSON.parse(ownKeyBody('ask', body)) as { messages: PromptMessage[] }).messages, hosted: v.request.messages };
}

describe('control: no related verses → today\'s request, byte for byte', () => {
  it.each([0, 1])('slide %i: body, own-key body and proxy messages match the pre-ADR-0015 hashes', i => {
    for (const related of [undefined, []]) {
      const body = buildRequestBody(pack, slides[i], HISTORY, QUESTION, { model: MODEL, related });
      const v = validateRequest({ ...JSON.parse(body), role: 'ask' });
      expect([sha(body), sha(ownKeyBody('ask', body)), sha(JSON.stringify(v.ok ? v.request.messages : null))]).toEqual(GOLDEN[i]);
    }
  });
});

describe('treatment: the block in the user message + one rule sentence', () => {
  const control = paths(buildRequestBody(pack, slides[0], HISTORY, QUESTION, { model: MODEL }));
  const treated = paths(buildRequestBody(pack, slides[0], HISTORY, QUESTION, { model: MODEL, related: RELATED }));

  it('own-key and proxy paths build the same final messages', () => {
    expect(treated.own).toEqual(treated.hosted);
  });

  it('system message = control + exactly the one sentence after the contract', () => {
    expect(treated.own[0].content).toBe(control.own[0].content.replace(ASK_AI_ANSWER_CONTRACT, `${ASK_AI_ANSWER_CONTRACT}\n${ASK_AI_RELATED_VERSES_RULE}`));
  });

  it('history unchanged; the user message gains only the block, between the passage and the slide', () => {
    expect(treated.own.slice(1, 3)).toEqual(control.own.slice(1, 3));
    const user = treated.own[3].content;
    const block = user.slice(user.indexOf(`${RELATED_VERSES_HEADING} (`), user.indexOf('\n\nCURRENT SLIDE:'));
    expect(user.replace(`${block}\n\n`, '')).toBe(control.own[3].content);
    expect(block).toContain('[腓立比书 4:6 · Philippians 4:6]\n6 应当一无挂虑…\n6 Be anxious for nothing…');
    expect(user.indexOf(block)).toBeGreaterThan(user.indexOf('FULL PASSAGE'));
  });
});

describe('the TV with the switch on (ADR-0015 step 4)', () => {
  const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;
  const okStream = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n`)); c.close(); } });
  beforeEach(() => {
    vi.unstubAllGlobals();
    getItemMock.mockReset().mockImplementation((key: string) => (key === STORAGE_KEYS.OPENROUTER_API_KEY ? 'test-key' : null));
  });

  async function sentBody(related: RelatedVerse[]): Promise<string> {
    loadRelatedMock.mockResolvedValue({ related, warnings: [] });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, body: okStream() }));
    vi.stubGlobal('fetch', fetchMock);
    await streamStudyAI(pack, slides[0], [], QUESTION, () => undefined, new AbortController().signal);
    expect(loadRelatedMock).toHaveBeenCalledWith(pack, QUESTION);
    return (fetchMock.mock.calls as unknown as Array<[string, { body: string }]>)[0][1].body;
  }

  it('sends the RELATED VERSES block and the rule sentence when verses were found', async () => {
    const body = await sentBody(RELATED);
    expect(body).toContain(RELATED_VERSES_HEADING);
    expect(body).toContain(JSON.stringify(ASK_AI_RELATED_VERSES_RULE).slice(1, 40));
  });

  it('with none found, sends today\'s request: no block, no rule', async () => {
    const body = await sentBody([]);
    expect(body).not.toContain(RELATED_VERSES_HEADING);
    expect(body).not.toContain(JSON.stringify(ASK_AI_RELATED_VERSES_RULE).slice(1, 40));
  });
});

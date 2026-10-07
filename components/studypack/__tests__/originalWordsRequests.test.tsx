/**
 * originalWordsRequests.test.ts — what the TV sends with ADR-0018 off and on (R14)
 *
 * Off (the shipped default): every request is byte-identical to today's —
 * pinned by SHA-256 hashes captured from master 68fd93d0 with the real
 * committed xref + Bible files: the own-key POST body, and the proxy's final
 * messages (validateRequest) for the same data body.
 * On (mocked): a word question carries the ORIGINAL WORDS block and the
 * server adds exactly one rule; a general question is still today's request;
 * the own-key and proxy paths build the same messages; the panel credits STEP Bible.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { parseStudyPack, buildSlides } from '../packTypes';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import {
  ASK_AI_ANSWER_CONTRACT, ASK_AI_ORIGINAL_WORDS_RULE, ASK_AI_RELATED_VERSES_RULE, ORIGINAL_WORDS_HEADING, PromptMessage, askSystemText,
} from '../../../supabase/functions/_shared/aiPrompts';
import { validateRequest } from '../../../supabase/functions/ai-proxy/policy';
import { ORIGINAL_WORDS_CREDIT, STEP_BIBLE_URL } from '../tvHints';
import { TEST_PACK_PATH } from './fixtures';
import { stubBundledFetch } from './bundledFetch';

const origSwitch = vi.hoisted(() => ({ on: false }));
vi.mock('../originalWords', async importOriginal => {
  const real = await importOriginal<typeof import('../originalWords')>();
  return { ...real, get ORIGINAL_WORDS_ENABLED() { return origSwitch.on; } };
});

import { streamStudyAI } from '../askAIFallback';
import { buildRequestBody } from '../askAIStream';
import { questionForSelection } from '../askAI';
import { clearRelatedVersesCache, loadRelatedVerses } from '../relatedVerses';
import { clearExternalVerseCache } from '../externalVerses';
import { ORIGINAL_WORDS_ENABLED, clearOriginalWordsCache, lastOriginalWords } from '../originalWords';
import AskAIOverlay from '../AskAIOverlay';

const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const slide = buildSlides(pack)[0];
const MODEL = 'google/gemini-2.5-flash';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;

const WORD_QUESTION = questionForSelection('忧虑', 34);
/** [question, own-key POST body hash, proxy final-messages hash] from master 68fd93d0 (slide 0, no history). */
const GOLDEN: Array<[string, string, string]> = [
  [WORD_QUESTION, '4082d9c11cadd5bb4ec4645bb7547cb6178c24e15ea656eb69aef826b8945df9', '64f9a5ab48d722fcfa2116c5057483cd4d369d39ac228d70fbb9c05590e2c0bb'],
  [questionForSelection('明天'), '1435f3801d85e2d3a05d9899fccf1554f23b3cc45a5d3ff9c7adc0200451081a', '032ddd7ee2bedd9872c1d5c3fa994c96ff438ea051b5d3fd4506310763642666'],
  ['第27节是什么意思？', 'f4a5e2d6dfee6846efa3c08f459500ab445edcaeb0e7ce4d4292311615c22c2e', 'da128af8cdb4406afbd8f8ae510d089bc4ccc0f899284b485a7db44ad2708592'],
  ['What does the whole Bible say about worry?', '2890cc16fa5fc26bdfb29c24dd43f0c04352704659704c3038f74cb83e887ed4', 'feb3ec3962d08011013c011a7a497ed37d8e2a428f9a1077718856aa60bb43cc'],
];

function sse(): Response {
  const line = `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n`;
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(line)); c.close(); } });
  return { ok: true, status: 200, body } as unknown as Response;
}

type Call = [string, RequestInit | undefined];

/** Ask once with the real files (own key); returns every fetch call. */
async function ask(question: string): Promise<Call[]> {
  const files = stubBundledFetch();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'POST' ? sse() : files(url)));
  vi.stubGlobal('fetch', fetchMock);
  await streamStudyAI(pack, slide, [], question, () => undefined, new AbortController().signal);
  return fetchMock.mock.calls as unknown as Call[];
}
const posts = (calls: Call[]) => calls.filter(c => c[1]?.method === 'POST').map(c => c[1]!.body as string);

/** The proxy's final messages for the data body the TV builds (real related verses). */
async function proxyMessages(question: string, original: Parameters<typeof buildRequestBody>[4]['original'] = []): Promise<PromptMessage[]> {
  const related = (await loadRelatedVerses(pack, question)).related;
  const v = validateRequest({ ...JSON.parse(buildRequestBody(pack, slide, [], question, { model: MODEL, related, original })), role: 'ask' });
  if (!('request' in v)) throw new Error(v.detail);
  return v.request.messages;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  clearRelatedVersesCache();
  clearExternalVerseCache();
  clearOriginalWordsCache();
  origSwitch.on = false;
  getItemMock.mockReset().mockImplementation((key: string) => (key === STORAGE_KEYS.OPENROUTER_API_KEY ? 'test-key' : null));
});

describe('switch off (default): today\'s request, byte for byte', () => {
  it.each(GOLDEN)('%s → own-key body and proxy messages match master; no word data fetched', async (question, bodyHash, proxyHash) => {
    expect(ORIGINAL_WORDS_ENABLED).toBe(false);
    const calls = await ask(question);
    expect(posts(calls).map(sha)).toEqual([bodyHash]);
    expect(calls.some(c => c[0].includes('/orig/'))).toBe(false);
    stubBundledFetch();
    expect(sha(JSON.stringify(await proxyMessages(question)))).toBe(proxyHash);
  });
});

describe('switch on (mocked)', () => {
  it('a word question: the block in the user message, the rule numbered 8 after rule 7, same on both paths', async () => {
    origSwitch.on = true;
    const [body] = posts(await ask(WORD_QUESTION));
    const own = (JSON.parse(body) as { messages: PromptMessage[] }).messages; // the own-key POST: final messages already built
    const result = lastOriginalWords()!;
    expect(result.targets).toEqual([34]);
    expect(result.warnings).toEqual([]);
    const user = own.at(-1)!.content;
    expect(user).toContain(`\n\n${ORIGINAL_WORDS_HEADING} (STEP Bible`);
    expect(user).toContain('[马太福音 6:34 · Matthew 6:34 · Greek]');
    expect(user).toMatch(/merimnēsēte \(μεριμνήσητε\) · G3309 · V-AAS-2P · .* — μεριμνάω \(merimnaō\): to worry/);
    expect(user.indexOf(ORIGINAL_WORDS_HEADING)).toBeGreaterThan(user.indexOf('RELATED VERSES ('));
    expect(user.indexOf(ORIGINAL_WORDS_HEADING)).toBeLessThan(user.indexOf('CURRENT SLIDE:'));
    stubBundledFetch();
    const control = await proxyMessages(WORD_QUESTION);
    const hosted = await proxyMessages(WORD_QUESTION, result.verses);
    expect(own).toEqual(hosted);
    expect(hosted[0].content).toBe(control[0].content.replace(
      `${ASK_AI_ANSWER_CONTRACT}\n${ASK_AI_RELATED_VERSES_RULE}`,
      `${ASK_AI_ANSWER_CONTRACT}\n${ASK_AI_RELATED_VERSES_RULE}\n8. ${ASK_AI_ORIGINAL_WORDS_RULE}`,
    ));
  });

  it('a general question is still today\'s request (no block, no rule, no word fetch)', async () => {
    origSwitch.on = true;
    const [question, bodyHash] = GOLDEN[3];
    const calls = await ask(question);
    expect(posts(calls).map(sha)).toEqual([bodyHash]);
    expect(calls.some(c => c[0].includes('/orig/'))).toBe(false);
  });

  it('without related verses the rule is numbered 7; with neither block the text is unchanged', () => {
    expect(askSystemText('bilingual', false, true)).toBe(askSystemText('bilingual').replace(ASK_AI_ANSWER_CONTRACT, `${ASK_AI_ANSWER_CONTRACT}\n7. ${ASK_AI_ORIGINAL_WORDS_RULE}`));
    expect(askSystemText('bilingual', false, false)).toBe(askSystemText('bilingual'));
    expect(ASK_AI_ORIGINAL_WORDS_RULE).toContain("use only the ORIGINAL WORDS for that verse: name the word, its transliteration and Strong's number as given");
  });
});

describe('the STEP Bible credit (CC BY 4.0)', () => {
  it('is absent while the switch is off', () => {
    render(<AskAIOverlay pack={pack} slide={slide} initialQuestion={null} onClose={() => undefined} />);
    expect(screen.queryByTestId('ask-original-credit')).toBeNull();
  });

  it('is shown with the switch on, next to the OpenBible credit, "STEP Bible" linked to www.STEPBible.org', () => {
    origSwitch.on = true;
    render(<AskAIOverlay pack={pack} slide={slide} initialQuestion={null} onClose={() => undefined} />);
    const credit = screen.getByTestId('ask-original-credit');
    expect(credit.textContent).toBe(ORIGINAL_WORDS_CREDIT);
    expect(ORIGINAL_WORDS_CREDIT).toBe('原文词汇：STEP Bible（CC BY） · Original words: STEP Bible (CC BY)');
    const links = credit.querySelectorAll('a');
    expect(links).toHaveLength(2);
    links.forEach(a => expect(a.getAttribute('href')).toBe(STEP_BIBLE_URL));
    expect(screen.getByTestId('ask-related-credit').nextElementSibling).toBe(credit);
  });
});

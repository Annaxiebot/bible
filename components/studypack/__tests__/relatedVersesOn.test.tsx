/**
 * relatedVersesOn.test.tsx — the TV with the ADR-0015 switch turned ON (mocked)
 *
 * What release step 4 will ship, exercised before it ships: a question
 * loads the passage's cross-references (real committed files), the request
 * carries the RELATED VERSES block and the one rule sentence, and the Ask AI
 * panel shows the CC BY credit. With the switch off none of this happens
 * (relatedPrompt.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { parseStudyPack, buildSlides } from '../packTypes';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { ASK_AI_RELATED_VERSES_RULE, RELATED_VERSES_HEADING, PromptMessage } from '../../../supabase/functions/_shared/aiPrompts';
import { RELATED_VERSES_CREDIT } from '../tvHints';
import { TEST_PACK_PATH } from './fixtures';
import { stubBundledFetch } from './bundledFetch';

vi.mock('../relatedVerses', async importOriginal => ({
  ...(await importOriginal<typeof import('../relatedVerses')>()),
  RELATED_VERSES_ENABLED: true,
}));

import { streamStudyAI } from '../askAIFallback';
import { clearRelatedVersesCache, lastRelatedVerses } from '../relatedVerses';
import { clearExternalVerseCache } from '../externalVerses';
import AskAIOverlay from '../AskAIOverlay';

const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const slide = buildSlides(pack)[0];
const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;

function sse(): Response {
  const line = `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n`;
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(line)); c.close(); } });
  return { ok: true, status: 200, body } as unknown as Response;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  clearRelatedVersesCache();
  clearExternalVerseCache();
  getItemMock.mockReset().mockImplementation((key: string) => (key === STORAGE_KEYS.OPENROUTER_API_KEY ? 'test-key' : null));
});

describe('switch on', () => {
  it('loads related verses once per question and sends the block + the rule', async () => {
    const files = stubBundledFetch();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'POST' ? sse() : files(url)));
    vi.stubGlobal('fetch', fetchMock);
    await streamStudyAI(pack, slide, [], '第27节是什么意思？', () => undefined, new AbortController().signal);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
    expect(calls.filter(c => c[0].includes('/xref/MAT/6.json'))).toHaveLength(1);
    const post = calls.filter(c => c[1]?.method === 'POST');
    expect(post).toHaveLength(1);
    const messages = (JSON.parse(post[0][1]!.body as string) as { messages: PromptMessage[] }).messages;
    expect(messages[0].content).toContain(ASK_AI_RELATED_VERSES_RULE);
    expect(messages.at(-1)!.content).toContain(`${RELATED_VERSES_HEADING} (`);
    expect(lastRelatedVerses()?.warnings).toEqual([]);
    expect(messages.at(-1)!.content).toContain(`[${lastRelatedVerses()!.related[0].label}]`);
  });

  it('the Ask AI panel credits OpenBible.info', () => {
    render(<AskAIOverlay pack={pack} slide={slide} initialQuestion={null} onClose={() => undefined} />);
    expect(screen.getByTestId('ask-related-credit').textContent).toBe(RELATED_VERSES_CREDIT);
    expect(RELATED_VERSES_CREDIT).toBe('相关经文：OpenBible.info（CC BY） · Related verses: OpenBible.info (CC BY)');
  });
});

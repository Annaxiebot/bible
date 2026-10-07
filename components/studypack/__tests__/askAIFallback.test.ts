/**
 * askAIFallback.test.ts — Ask-AI transport + orchestration · 问AI重试测试
 *
 * Real OpenRouter chunk shapes through a fetch stub: streamed text, HTTP
 * status → typed bilingual error, in-stream `error` events, reasoning-only
 * streams (→ one no-reasoning retry), fallback model, finish_reason
 * length / content_filter, served-model capture, first-token timeout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { parseStudyPack, buildSlides, StudyPack, Slide } from '../packTypes';
import { ASK_AI_MAX_TOKENS } from '../askAI';
import { ASK_AI_MODEL, ASK_AI_FALLBACK_MODELS } from '../../../services/aiDefaults';
import { HTTP_PAYMENT_REQUIRED, HTTP_UNAUTHORIZED, HTTP_NOT_FOUND } from '../../../services/openrouterStatus';
import { ASK_AI_RETRY_MAX_TOKENS } from '../askAIStream';
import { streamStudyAI, ASK_AI_FIRST_TOKEN_TIMEOUT_MS } from '../askAIFallback';
import {
  AI_SIGN_IN_NEEDED, AI_CREDITS_MESSAGE, AI_INVALID_KEY_MESSAGE, AI_REQUEST_FAILED,
  AI_STREAM_ERROR, AI_BUDGET_SPENT, AI_FILTERED, AI_EMPTY, AI_TIMEOUT, modelUnavailableLine, modelLine,
} from '../tvHints';
import { TEST_PACK_PATH } from './fixtures';

// Retrieval is not under test here (relatedVerses / relatedPrompt tests cover it): with the
// ADR-0015 switch on, the loader finds nothing, so every request below is today's request and
// the fetch mocks keep answering only the OpenRouter calls.
vi.mock('../relatedVerses', async importOriginal => ({
  ...(await importOriginal<typeof import('../relatedVerses')>()),
  loadRelatedVerses: vi.fn(async () => ({ related: [], warnings: [] })),
}));

function loadPack(): { pack: StudyPack; slide: Slide } {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  return { pack, slide: buildSlides(pack)[0] };
}

const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;
function configureKey(extra: Record<string, string> = {}) {
  getItemMock.mockImplementation((key: string) =>
    ({ [STORAGE_KEYS.OPENROUTER_API_KEY]: 'test-key', ...extra })[key] ?? null);
}

const SERVED = 'google/gemini-2.5-flash';
const line = (obj: unknown) => `data: ${JSON.stringify(obj)}\n`;
const content = (c: string, model = SERVED) => line({ model, choices: [{ delta: { content: c } }] });
const reasoning = (r: string, model = SERVED) => line({ model, choices: [{ delta: { reasoning: r } }] });
const finish = (reason: string, model = SERVED) => line({ model, choices: [{ delta: {}, finish_reason: reason }] });
const DONE = 'data: [DONE]\n';

function sseResponse(chunks: string[], failAfter = false): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach(ch => c.enqueue(encoder.encode(ch)));
      if (!failAfter) c.close();
    },
    pull() {
      if (failAfter) throw new DOMException('aborted', 'AbortError');
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

function httpError(status: number, message: string): Response {
  return { ok: false, status, json: () => Promise.resolve({ error: { message } }) } as unknown as Response;
}

/** Queue one response per attempt; the mock records every request body. */
function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  responses.forEach(r => fetchMock.mockResolvedValueOnce(r));
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    body: (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body as string),
  };
}

function ask(onText: (t: string) => void = () => undefined, signal = new AbortController().signal, onModel?: (m: string) => void) {
  const { pack, slide } = loadPack();
  return streamStudyAI(pack, slide, [], 'q', onText, signal, onModel);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  getItemMock.mockReset().mockReturnValue(null);
  configureKey();
});
afterEach(() => { vi.useRealTimers(); });

describe('streamStudyAI — happy path', () => {
  it('streams accumulated trimmed text, sends the pinned model/cap/history, reports the served model', async () => {
    const { fetchMock } = stubFetch(sseResponse([
      content('中文 (v.25)。'), content('\n\nEnglish'), content(' (v.25). '), DONE,
    ]));
    const { pack, slide } = loadPack();
    const seen: string[] = [];
    const models: string[] = [];
    const history = [{ role: 'user' as const, content: 'q1' }, { role: 'assistant' as const, content: 'a1' }];
    const result = await streamStudyAI(pack, slide, history, 'follow-up', t => seen.push(t), new AbortController().signal, m => models.push(m));
    expect(seen[0]).toBe('中文 (v.25)。');
    expect(result).toEqual({ text: '中文 (v.25)。\n\nEnglish (v.25).', model: SERVED });
    expect(models).toEqual([ASK_AI_MODEL, SERVED]); // requested, then the id the stream named
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ model: ASK_AI_MODEL, stream: true, max_tokens: ASK_AI_MAX_TOKENS });
    expect(body.reasoning).toBeUndefined();
    expect(body.messages[0].role).toBe('system');
    expect(body.messages.slice(1, 3)).toEqual(history);
    expect(body.messages[3].content).toContain('QUESTION: follow-up');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the model chosen in AI settings when the stored provider is OpenRouter', async () => {
    configureKey({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter', [STORAGE_KEYS.AI_MODEL]: 'openai/gpt-4o-mini' });
    const { body } = stubFetch(sseResponse([content('ok'), DONE]));
    await ask();
    expect(body(0).model).toBe('openai/gpt-4o-mini');
  });

  it('resolves cleanly with the partial text when the user aborts mid-stream (no retry)', async () => {
    const { fetchMock } = stubFetch(sseResponse([content('partial')], true));
    const result = await ask();
    expect(result.text).toBe('partial');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws sign-in-needed when no API key is stored and nobody is signed in, without fetching', async () => {
    getItemMock.mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(ask()).rejects.toMatchObject({ kind: 'sign-in-needed', message: AI_SIGN_IN_NEEDED });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('streamStudyAI — HTTP status mapping', () => {
  it('401 → invalid key with the status and OpenRouter message; no fallback', async () => {
    const { fetchMock } = stubFetch(httpError(HTTP_UNAUTHORIZED, 'User not found.'));
    await expect(ask()).rejects.toMatchObject({
      kind: 'invalid-key', status: 401, message: `${AI_INVALID_KEY_MESSAGE} · HTTP 401: User not found.`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('402 → the credits line (Set up AI path) with the status; no fallback', async () => {
    const { fetchMock } = stubFetch(httpError(HTTP_PAYMENT_REQUIRED, 'Insufficient credits'));
    const err = await ask().catch(e => e);
    expect(err).toMatchObject({ kind: 'no-credits', status: 402 });
    expect(err.message).toContain(AI_CREDITS_MESSAGE);
    expect(err.message).toContain('HTTP 402: Insufficient credits');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('404 → model unavailable naming the model, then ONE fallback model (reasoning off) answers', async () => {
    configureKey({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter', [STORAGE_KEYS.AI_MODEL]: 'vendor/gone' });
    const { fetchMock, body } = stubFetch(
      httpError(HTTP_NOT_FOUND, 'No endpoints found'),
      sseResponse([content('from fallback', ASK_AI_FALLBACK_MODELS[0]), DONE]),
    );
    const result = await ask();
    expect(result).toEqual({ text: 'from fallback', model: ASK_AI_FALLBACK_MODELS[0] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(1)).toMatchObject({ model: ASK_AI_FALLBACK_MODELS[0], reasoning: { enabled: false, exclude: true } });
  });

  it('404 on the fallback too → the model-unavailable line for the fallback; no third attempt', async () => {
    const { fetchMock } = stubFetch(httpError(HTTP_NOT_FOUND, 'gone'), httpError(HTTP_NOT_FOUND, 'gone too'));
    await expect(ask()).rejects.toMatchObject({
      kind: 'model-unavailable', message: `${modelUnavailableLine(ASK_AI_FALLBACK_MODELS[0])} · HTTP 404: gone too`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('500 → request failed with the status; fallback once, then surfaces the last status', async () => {
    const { fetchMock } = stubFetch(httpError(500, 'Internal'), httpError(503, 'Overloaded'));
    await expect(ask()).rejects.toMatchObject({
      kind: 'http-error', status: 503, message: `${AI_REQUEST_FAILED} · HTTP 503: Overloaded`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a fetch failure (offline) → network kind carrying the original message; no retry loop', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(ask()).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('Failed to fetch') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('streamStudyAI — in-stream error events', () => {
  it('an error event inside a 200 stream is surfaced (message + code), after one fallback attempt', async () => {
    const { fetchMock } = stubFetch(
      sseResponse([line({ error: { message: 'Provider returned error', code: 502 } }), DONE]),
      sseResponse([line({ model: ASK_AI_FALLBACK_MODELS[0], choices: [{ error: { message: 'upstream failed', code: 'server_error' }, delta: {} }] })]),
    );
    await expect(ask()).rejects.toMatchObject({
      kind: 'stream-error', message: `${AI_STREAM_ERROR} (server_error): upstream failed`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('an error event on the first model, content from the fallback → the answer renders', async () => {
    stubFetch(
      sseResponse([line({ error: { message: 'boom', code: 502 } })]),
      sseResponse([content('recovered', ASK_AI_FALLBACK_MODELS[0]), DONE]),
    );
    await expect(ask()).resolves.toEqual({ text: 'recovered', model: ASK_AI_FALLBACK_MODELS[0] });
  });
});

describe('streamStudyAI — reasoning models and empty streams', () => {
  it('reasoning-only stream → ONE retry with reasoning excluded and a larger cap; its content is the answer', async () => {
    const { fetchMock, body } = stubFetch(
      sseResponse([reasoning('thinking…'), reasoning('still'), finish('length'), DONE]),
      sseResponse([content('Answer (v.25).'), DONE]),
    );
    const result = await ask();
    expect(result).toEqual({ text: 'Answer (v.25).', model: SERVED });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(0).reasoning).toBeUndefined();
    expect(body(1)).toMatchObject({ model: ASK_AI_MODEL, max_tokens: ASK_AI_RETRY_MAX_TOKENS, reasoning: { exclude: true, enabled: false } });
    expect(ASK_AI_RETRY_MAX_TOKENS).toBeGreaterThan(ASK_AI_MAX_TOKENS);
  });

  it('reasoning retry still empty → the fallback model is tried once → still empty → budget line naming the served model', async () => {
    const { fetchMock, body } = stubFetch(
      sseResponse([reasoning('…'), finish('length'), DONE]),
      sseResponse([reasoning('…'), finish('length'), DONE]),
      sseResponse([finish('length', 'fallback/served'), DONE]),
    );
    await expect(ask()).rejects.toMatchObject({
      kind: 'budget', model: 'fallback/served', message: `${AI_BUDGET_SPENT} · ${modelLine('fallback/served')}`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(body(2).model).toBe(ASK_AI_FALLBACK_MODELS[0]);
  });

  it('finish_reason content_filter → the filtered line immediately, no retry', async () => {
    const { fetchMock } = stubFetch(sseResponse([finish('content_filter'), DONE]));
    await expect(ask()).rejects.toMatchObject({ kind: 'filtered', message: `${AI_FILTERED} · ${modelLine(SERVED)}` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('empty stream with no reasoning → straight to the fallback once → empty line naming the model', async () => {
    const { fetchMock, body } = stubFetch(
      sseResponse([finish('stop'), DONE]),
      sseResponse([DONE]),
    );
    await expect(ask()).rejects.toMatchObject({
      kind: 'empty', message: `${AI_EMPTY} · ${modelLine(ASK_AI_FALLBACK_MODELS[0])}`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(1).model).toBe(ASK_AI_FALLBACK_MODELS[0]);
  });

  it('uses the fallback list chosen on #/setup (comma-separated) instead of the default list', async () => {
    configureKey({ [STORAGE_KEYS.AI_FALLBACK_MODELS]: ' x/one , y/two ' });
    const { body } = stubFetch(sseResponse([finish('stop'), DONE]), sseResponse([content('ok', 'x/one'), DONE]));
    await expect(ask()).resolves.toEqual({ text: 'ok', model: 'x/one' });
    expect(body(1).model).toBe('x/one');
  });

  it('the fallback skips the model that just failed when it is itself on the list', async () => {
    configureKey({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter', [STORAGE_KEYS.AI_MODEL]: ASK_AI_FALLBACK_MODELS[0] });
    const { body } = stubFetch(sseResponse([finish('stop'), DONE]), sseResponse([content('ok'), DONE]));
    await ask();
    expect(body(1).model).toBe(ASK_AI_FALLBACK_MODELS[1]);
  });
});

describe('streamStudyAI — first-token timeout', () => {
  it(`aborts after ${ASK_AI_FIRST_TOKEN_TIMEOUT_MS} ms without a token and reports the model`, async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = ask();
    const failure = pending.catch(e => e);
    await vi.advanceTimersByTimeAsync(ASK_AI_FIRST_TOKEN_TIMEOUT_MS - 1);
    expect(fetchMock.mock.calls[0][1].signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await failure;
    expect(err).toMatchObject({ kind: 'timeout', model: ASK_AI_MODEL });
    expect(err.message).toContain(AI_TIMEOUT);
    expect(err.message).toContain(modelLine(ASK_AI_MODEL));
    expect(fetchMock).toHaveBeenCalledTimes(1); // a hang is not retried
  });

  it('a reasoning delta counts as liveness: the timer stops even before any content', async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let release!: () => void;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(reasoning('warming up')));
        return new Promise<void>(r => { release = () => { c.enqueue(encoder.encode(content('late') + DONE)); c.close(); r(); }; });
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, body: stream } as unknown as Response));
    const pending = ask();
    await vi.advanceTimersByTimeAsync(ASK_AI_FIRST_TOKEN_TIMEOUT_MS + 1);
    release();
    await expect(pending).resolves.toEqual({ text: 'late', model: SERVED });
  });
});

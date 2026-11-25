/**
 * askAIHosted.test.ts — the streaming transport on the hosted path · 本站AI流式测试
 *
 * No own key, a signed-in leader (dev e2e seam): the same SSE parser reads
 * the proxy's passed-through OpenRouter stream; the proxy's typed failures
 * map to their own bilingual lines (429 quota, 402 credit used up, 503
 * paused, 401 sign in again) and never trigger a fallback model; an
 * OpenRouter error the proxy passed through keeps the own-key mapping.
 * Split from askAIFallback.test.ts (R4).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamChatCompletionDetailed } from '../askAIStream';
import { hostedErrorFromStatus, FALLBACK_KINDS, AskAIErrorKind } from '../askAIErrors';
import {
  quotaLine, AI_CREDIT_USED_UP, AI_SERVICE_PAUSED, AI_SIGN_IN_NEEDED, AI_REQUEST_FAILED, AI_MODEL_UNAVAILABLE,
} from '../tvHints';

type Seams = Window & { __LEADER_E2E__?: unknown; __SUPABASE_E2E__?: unknown };
const BASE = 'http://localhost:3000/e2e-supabase';
const MODEL = 'google/gemini-2.5-flash';
const BODY = JSON.stringify({ model: MODEL, stream: true, messages: [{ role: 'user', content: 'q' }] });

function reply(status: number, json: unknown): Response {
  return { ok: status < 400, status, json: async () => json } as unknown as Response;
}

beforeEach(() => {
  (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(null);
  (window as Seams).__LEADER_E2E__ = { uid: 'e2e-uid', email: null, name: null };
  (window as Seams).__SUPABASE_E2E__ = { url: BASE, anonKey: 'e2e-anon' };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as Seams).__LEADER_E2E__;
  delete (window as Seams).__SUPABASE_E2E__;
});

describe('streamChatCompletionDetailed — hosted', () => {
  it('streams the proxy\'s SSE body through the same parser and sends the caller\'s role', async () => {
    const sse = `data: ${JSON.stringify({ model: MODEL, choices: [{ delta: { content: '平安' } }] })}\n\ndata: [DONE]\n\n`;
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); } }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const outcome = await streamChatCompletionDetailed(BODY, () => undefined, new AbortController().signal, { role: 'sharing' });
    expect(outcome).toMatchObject({ text: '平安', model: MODEL });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/functions/v1/ai-proxy`);
    expect(JSON.parse(init.body as string).role).toBe('sharing');
  });

  it.each([
    [429, { error: 'quota', role: 'ask', limit: 300 }, 'quota', quotaLine(300)],
    [402, { error: 'no-credit' }, 'credit-used-up', AI_CREDIT_USED_UP],
    [503, { error: 'disabled' }, 'service-paused', AI_SERVICE_PAUSED],
    [503, { error: 'not-configured' }, 'service-paused', AI_SERVICE_PAUSED],
    [401, { code: 'UNAUTHORIZED_INVALID_JWT_FORMAT' }, 'sign-in-needed', AI_SIGN_IN_NEEDED],
  ])('HTTP %i %j → %s', async (status, json, kind, line) => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(status, json)));
    await expect(streamChatCompletionDetailed(BODY, () => undefined, new AbortController().signal))
      .rejects.toMatchObject({ kind, status, message: expect.stringContaining(line) });
    expect(FALLBACK_KINDS.has(kind as AskAIErrorKind)).toBe(false);   // a typed proxy failure never retries another model
  });
});

describe('hostedErrorFromStatus', () => {
  it('the proxy\'s own 400 (string error) is a request failure carrying its detail', () => {
    const err = hostedErrorFromStatus(400, { error: 'invalid-request', detail: 'at most 40 messages' }, MODEL);
    expect(err.kind).toBe('http-error');
    expect(err.message).toBe(`${AI_REQUEST_FAILED} · HTTP 400: at most 40 messages`);
  });

  it('an OpenRouter error passed through (object error) keeps the own-key status mapping', () => {
    const err = hostedErrorFromStatus(404, { error: { message: 'No endpoints found' } }, MODEL);
    expect(err.kind).toBe('model-unavailable');
    expect(err.message).toContain(AI_MODEL_UNAVAILABLE);
    expect(hostedErrorFromStatus(429, { error: { message: 'Rate limited' } }, MODEL).kind).toBe('http-error');
  });

  it('the hosted lines are Chinese first (the credit line\'s Chinese half opens with "AI 额度")', () => {
    for (const line of [quotaLine(10), AI_SERVICE_PAUSED, AI_SIGN_IN_NEEDED]) {
      expect(line).toMatch(/^[一-鿿]/);
    }
    expect(AI_CREDIT_USED_UP).toBe('AI 额度已用完，请联系管理员 · AI credit used up, contact the admin');
  });
});

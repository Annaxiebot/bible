/**
 * packFetchStub.ts — the fetch stub the pack-generation tests share · 生成测试的 fetch 替身
 *
 * Bundled chapter files are served from disk (public/bible-data); the
 * OpenRouter endpoint and the hosted ai-proxy answer with scripted SSE
 * replies, one per request (the last repeats). Pure test helper.
 */
import { vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { OPENROUTER_API_URL } from '../../../services/openrouter';

const BIBLE_DATA = path.resolve(__dirname, '../../../public/bible-data');
export const HOSTED_PATH = '/functions/v1/ai-proxy';
export const SERVED_MODEL = 'anthropic/claude-sonnet-4.5';

/** One scripted OpenRouter reply: content deltas, then the final chunk with finish_reason (OpenRouter's shape). */
export interface Reply { chunks: string[]; finish?: 'stop' | 'length'; model?: string }

function sseBody({ chunks, finish, model }: Reply): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = chunks.map(c => `data: ${JSON.stringify({ model, choices: [{ delta: { content: c }, finish_reason: null }] })}\n\n`);
  if (finish) lines.push(`data: ${JSON.stringify({ model, choices: [{ delta: {}, finish_reason: finish }] })}\n\n`);
  lines.push('data: [DONE]\n\n');
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

/** fetch stub: bundled chapter files from disk; OpenRouter → one scripted reply per request (the last repeats). */
export function stubFetch(replies: string[] | Reply[], bundledOk = true) {
  const scripted: Reply[] = replies.length && typeof replies[0] === 'string' ? [{ chunks: replies as string[] }] : replies as Reply[];
  let call = 0;
  const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
    if (input === OPENROUTER_API_URL || input.endsWith(HOSTED_PATH)) {
      const reply = scripted[Math.min(call++, scripted.length - 1)] ?? { chunks: [] };
      return { ok: true, status: 200, body: sseBody(reply) } as unknown as Response;
    }
    const m = /bible-data\/(\w+)\/(\w+)\/(\d+)\.json$/.exec(input);
    if (!m || !bundledOk) return { ok: false, status: 404 } as Response;
    const file = readFileSync(path.join(BIBLE_DATA, m[1], m[2], `${m[3]}.json`), 'utf-8');
    return { ok: true, status: 200, json: async () => JSON.parse(file) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function chunked(text: string, size = 40): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/**
 * generatePack.test.ts — the full pipeline against the real bundled Bible
 * files (served from disk through a fetch stub) and a mocked OpenRouter SSE
 * stream: real John 3:22–36 verses end up in the pack, progress is reported,
 * truncation and cancel surface as errors, never as a half-pack; a reply cut
 * by max_tokens (finish_reason "length") gets exactly one continuation turn.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { generateStudyPack, loadPassage } from '../generatePack';
import { PACK_CONTINUE_PROMPT } from '../packPrompt';
import { JOHN3_REQUEST, JOHN3_REPLY_JSON } from './fixtures';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { OPENROUTER_API_URL } from '../../../services/openrouter';
import { PACK_GENERATION_MODEL } from '../../../services/aiDefaults';
import { modelLine } from '../../studypack/tvHints';
import {
  NS_STEP_VERSES, NS_STEP_AI, NS_STEP_VALIDATE, NS_ERR_NO_JSON, NS_ERR_VERSES_OUT_OF_RANGE,
  NS_ERR_VERSES_UNAVAILABLE, NS_ERR_OUTPUT_LIMIT,
} from '../newStudyStrings';

const BIBLE_DATA = path.resolve(__dirname, '../../../public/bible-data');
const HOSTED_PATH = '/functions/v1/ai-proxy';
const SERVED_MODEL = 'anthropic/claude-sonnet-4.5';

/** One scripted OpenRouter reply: content deltas, then the final chunk with finish_reason (OpenRouter's shape). */
interface Reply { chunks: string[]; finish?: 'stop' | 'length'; model?: string }

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
function stubFetch(replies: string[] | Reply[], bundledOk = true) {
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

function chunked(text: string, size = 40): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

describe('loadPassage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('returns the requested verses from the bundled 和合本 + BSB files', async () => {
    stubFetch([]);
    const verses = await loadPassage(JOHN3_REQUEST);
    expect(verses).toHaveLength(15);
    expect(verses[0]).toEqual({
      num: 22,
      cuv: '这事以后，耶稣和门徒到了犹太地，在那里居住，施洗。',
      en: 'After this, Jesus and His disciples went into the Judean countryside, where He spent some time with them and baptized.',
    });
    expect(verses[14].num).toBe(36);
  });

  it('rejects verses the chapter does not have', async () => {
    stubFetch([]);
    await expect(loadPassage({ ...JOHN3_REQUEST, verseTo: 99 })).rejects.toThrow(NS_ERR_VERSES_OUT_OF_RANGE);
  });

  it('reports an unavailable bundle bilingually', async () => {
    stubFetch([], false);
    await expect(loadPassage(JOHN3_REQUEST)).rejects.toThrow(NS_ERR_VERSES_UNAVAILABLE);
  });
});

describe('generateStudyPack', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset()
      .mockImplementation((k: string) => (k === STORAGE_KEYS.OPENROUTER_API_KEY ? 'unit-test-key' : null));
  });

  it('streams the model reply, reports progress, and returns a validated pack with the real verses', async () => {
    const fetchMock = stubFetch(chunked(`Sure:\n\`\`\`json\n${JOHN3_REPLY_JSON}\n\`\`\``));
    const steps: string[] = [];
    const pack = await generateStudyPack(JOHN3_REQUEST, (step, detail) => steps.push(detail ? `${step}|${detail}` : step), new AbortController().signal);

    expect(pack.id).toBe('local-2026-10-02-jhn3');
    const scripture = pack.sections.find(s => s.kind === 'scripture')!;
    expect(scripture.verses![0].cuv).toContain('耶稣和门徒到了犹太地');
    expect(scripture.verses![8].en).toContain('He must increase; I must decrease');
    expect(steps[0]).toBe(NS_STEP_VERSES);
    expect(steps.some(s => s.startsWith(`${NS_STEP_AI}|`) && /\d+/.test(s))).toBe(true);
    expect(steps[steps.length - 1]).toBe(NS_STEP_VALIDATE);

    const call = fetchMock.mock.calls.find(c => c[0] === OPENROUTER_API_URL)!;
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer unit-test-key');
    expect(init.body as string).toContain('耶稣和门徒到了犹太地');
    expect(JSON.parse(init.body as string).model).toBe(PACK_GENERATION_MODEL); // not the Ask-AI model
  });

  it('sends the pack model chosen on #/setup instead of the default when one is stored', async () => {
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((k: string) =>
      ({ [STORAGE_KEYS.OPENROUTER_API_KEY]: 'unit-test-key', [STORAGE_KEYS.AI_PACK_MODEL]: 'deepseek/deepseek-chat-v3-0324' })[k] ?? null);
    const fetchMock = stubFetch(chunked(`\`\`\`json\n${JOHN3_REPLY_JSON}\n\`\`\``));
    await generateStudyPack(JOHN3_REQUEST, () => {}, new AbortController().signal);
    const init = fetchMock.mock.calls.find(c => c[0] === OPENROUTER_API_URL)![1] as RequestInit;
    expect(JSON.parse(init.body as string).model).toBe('deepseek/deepseek-chat-v3-0324');
  });

  it('fails with the bilingual JSON error on a truncated reply (no half-pack)', async () => {
    stubFetch(chunked(JOHN3_REPLY_JSON.slice(0, 500)));
    await expect(generateStudyPack(JOHN3_REQUEST, () => {}, new AbortController().signal))
      .rejects.toThrow(NS_ERR_NO_JSON);
  });

  it('incomplete JSON that was NOT cut by max_tokens keeps the JSON error and names the served model, no continuation', async () => {
    const fetchMock = stubFetch([{ chunks: chunked(JOHN3_REPLY_JSON.slice(0, 500)), finish: 'stop', model: SERVED_MODEL }]);
    await expect(generateStudyPack(JOHN3_REQUEST, () => {}, new AbortController().signal))
      .rejects.toThrow(`${NS_ERR_NO_JSON} · ${modelLine(SERVED_MODEL)}`);
    expect(fetchMock.mock.calls.filter(c => c[0] === OPENROUTER_API_URL)).toHaveLength(1);
  });

  describe('finish_reason "length" (max_tokens hit)', () => {
    const CUT = 900;
    const head = JOHN3_REPLY_JSON.slice(0, CUT);
    const tail = JOHN3_REPLY_JSON.slice(CUT);
    const modelCalls = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.filter(c => c[0] === OPENROUTER_API_URL);

    it('sends ONE continuation carrying the partial text as the assistant turn; the concatenated reply parses into the pack', async () => {
      const fetchMock = stubFetch([
        { chunks: chunked(head), finish: 'length', model: SERVED_MODEL },
        { chunks: chunked(tail), finish: 'stop', model: SERVED_MODEL },
      ]);
      const details: string[] = [];
      const pack = await generateStudyPack(JOHN3_REQUEST, (_s, d) => { if (d) details.push(d); }, new AbortController().signal);
      expect(pack.id).toBe('local-2026-10-02-jhn3');

      const calls = modelCalls(fetchMock);
      expect(calls).toHaveLength(2);
      const first = JSON.parse(calls[0][1]!.body as string) as { messages: Array<{ role: string; content: string }> };
      const second = JSON.parse(calls[1][1]!.body as string) as { messages: Array<{ role: string; content: string }> };
      expect(second.messages.slice(0, first.messages.length)).toEqual(first.messages);
      expect(second.messages[first.messages.length]).toEqual({ role: 'assistant', content: head });
      expect(second.messages[first.messages.length + 1]).toEqual({ role: 'user', content: PACK_CONTINUE_PROMPT });
      // The progress line keeps counting across both turns.
      expect(details[details.length - 1]).toContain(String(JOHN3_REPLY_JSON.length));
    });

    it('a second "length" shows the bilingual output-limit error with the character count — no third attempt', async () => {
      const fetchMock = stubFetch([
        { chunks: chunked(head), finish: 'length', model: SERVED_MODEL },
        { chunks: chunked(tail.slice(0, 300)), finish: 'length', model: SERVED_MODEL },
      ]);
      await expect(generateStudyPack(JOHN3_REQUEST, () => {}, new AbortController().signal))
        .rejects.toThrow(NS_ERR_OUTPUT_LIMIT.replace(/\{n\}/g, String(CUT + 300)));
      expect(modelCalls(fetchMock)).toHaveLength(2);
    });

    it('continuation finished but the joined text is still not JSON → the JSON error naming the model', async () => {
      stubFetch([
        { chunks: chunked(head), finish: 'length', model: SERVED_MODEL },
        { chunks: ['"en": "garbage'], finish: 'stop', model: SERVED_MODEL },
      ]);
      await expect(generateStudyPack(JOHN3_REQUEST, () => {}, new AbortController().signal))
        .rejects.toThrow(`${NS_ERR_NO_JSON} · ${modelLine(SERVED_MODEL)}`);
    });
  });

  it('no own key, signed in (dev seam): the request goes to the ai-proxy function with role "pack"', async () => {
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(null);
    const seams = window as Window & { __LEADER_E2E__?: unknown; __SUPABASE_E2E__?: unknown };
    seams.__LEADER_E2E__ = { uid: 'e2e-uid' };
    seams.__SUPABASE_E2E__ = { url: 'http://localhost:3000/e2e-supabase', anonKey: 'e2e-anon' };
    try {
      const fetchMock = stubFetch([{ chunks: chunked(JOHN3_REPLY_JSON), finish: 'stop', model: SERVED_MODEL }]);
      await generateStudyPack(JOHN3_REQUEST, () => {}, new AbortController().signal);
      const hosted = fetchMock.mock.calls.filter(c => c[0].endsWith(HOSTED_PATH));
      expect(hosted).toHaveLength(1);
      expect(JSON.parse(hosted[0][1]!.body as string).role).toBe('pack');
    } finally {
      delete seams.__LEADER_E2E__;
      delete seams.__SUPABASE_E2E__;
    }
  });

  it('surfaces a cancel as an AbortError, not as a failure', async () => {
    stubFetch(chunked(JOHN3_REPLY_JSON));
    const controller = new AbortController();
    controller.abort();
    await expect(generateStudyPack(JOHN3_REQUEST, () => {}, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});

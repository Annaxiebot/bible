/**
 * generatePack.test.ts — the full pipeline against the real bundled Bible
 * files (served from disk through a fetch stub) and a mocked OpenRouter SSE
 * stream: real John 3:22–36 verses end up in the pack, progress is reported,
 * truncation and cancel surface as errors, never as a half-pack.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { generateStudyPack, loadPassage } from '../generatePack';
import { JOHN3_REQUEST, JOHN3_REPLY_JSON } from './fixtures';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { OPENROUTER_API_URL } from '../../../services/openrouter';
import { PACK_GENERATION_MODEL } from '../../../services/aiDefaults';
import {
  NS_STEP_VERSES, NS_STEP_AI, NS_STEP_VALIDATE, NS_ERR_NO_JSON, NS_ERR_VERSES_OUT_OF_RANGE,
  NS_ERR_VERSES_UNAVAILABLE,
} from '../newStudyStrings';

const BIBLE_DATA = path.resolve(__dirname, '../../../public/bible-data');

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = [
    ...chunks.map(c => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`),
    'data: [DONE]\n\n',
  ];
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

/** fetch stub: bundled chapter files from disk; OpenRouter → the given SSE chunks. */
function stubFetch(chunks: string[], bundledOk = true) {
  const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
    if (input === OPENROUTER_API_URL) {
      return { ok: true, status: 200, body: sseBody(chunks) } as unknown as Response;
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

  it('fails with the bilingual JSON error on a truncated reply (no half-pack)', async () => {
    stubFetch(chunked(JOHN3_REPLY_JSON.slice(0, 500)));
    await expect(generateStudyPack(JOHN3_REQUEST, () => {}, new AbortController().signal))
      .rejects.toThrow(NS_ERR_NO_JSON);
  });

  it('surfaces a cancel as an AbortError, not as a failure', async () => {
    stubFetch(chunked(JOHN3_REPLY_JSON));
    const controller = new AbortController();
    controller.abort();
    await expect(generateStudyPack(JOHN3_REQUEST, () => {}, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { parseStudyPack, buildSlides, StudyPack, Slide } from '../packTypes';
import {
  AI_NOT_CONFIGURED_MESSAGE,
  AI_CREDITS_MESSAGE,
  HTTP_PAYMENT_REQUIRED,
  buildAskAIPrompt,
  questionForSelection,
  stripSplitMarker,
  resolveAskAIModel,
  ASK_AI_MAX_TOKENS,
} from '../askAI';
import { DEFAULT_AI_SETUP, wireModelId } from '../../../services/aiDefaults';
import { FREE_ROUTER_MODEL } from '../../../services/openrouter';
import { createSSEParser, streamStudyAI } from '../askAIStream';
import { TEST_PACK_PATH } from './fixtures';

function loadPack(): { pack: StudyPack; slide: Slide } {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  return { pack, slide: buildSlides(pack)[0] };
}

// tests/utils/setup.ts replaces localStorage with a vi.fn mock, so the key
// is "configured" by stubbing getItem rather than via setItem.
const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;

function configureKey() {
  getItemMock.mockImplementation((key: string) =>
    key === STORAGE_KEYS.OPENROUTER_API_KEY ? 'test-key' : null
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  getItemMock.mockReset().mockReturnValue(null);
});

describe('resolveAskAIModel', () => {
  const stored = (map: Record<string, string>) =>
    getItemMock.mockImplementation((key: string) => map[key] ?? null);

  it('uses the model chosen in AI settings when the stored provider is OpenRouter', () => {
    stored({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter', [STORAGE_KEYS.AI_MODEL]: 'anthropic/claude-sonnet-4.5' });
    expect(resolveAskAIModel()).toBe('anthropic/claude-sonnet-4.5');
  });

  it('maps the free-router alias to the wire id OpenRouter lists', () => {
    stored({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter', [STORAGE_KEYS.AI_MODEL]: DEFAULT_AI_SETUP.model });
    expect(resolveAskAIModel()).toBe(FREE_ROUTER_MODEL);
  });

  it('falls back to the free router when another provider is stored', () => {
    stored({ [STORAGE_KEYS.AI_PROVIDER]: 'gemini', [STORAGE_KEYS.AI_MODEL]: 'gemini-3-pro-preview' });
    expect(resolveAskAIModel()).toBe(wireModelId(DEFAULT_AI_SETUP.model));
  });

  it('falls back to the free router when nothing is stored', () => {
    expect(resolveAskAIModel()).toBe(wireModelId(DEFAULT_AI_SETUP.model));
  });
});

describe('buildAskAIPrompt', () => {
  it('embeds the full bilingual passage, the current slide, and the contract', () => {
    const { pack, slide } = loadPack();
    const prompt = buildAskAIPrompt(pack, slide, 'Why birds?');
    expect(prompt).toContain('Matthew 6:25–34');
    expect(prompt).toContain('不要为生命忧虑');                 // CUV v.25
    expect(prompt).toContain('do not worry about tomorrow');  // BSB v.34
    expect(prompt).toContain(slide.heading);                    // current slide content
    expect(prompt).toContain('2 short');
    expect(prompt).toContain('~60 words');
    expect(prompt).toContain('language of the question');
    expect(prompt).toContain('citing the verse');
    expect(prompt).toContain('QUESTION: Why birds?');
  });

  it('includes every scripture section of a pack with TWO scripture sections', () => {
    // Inline fixture (committed files only — real multi-scripture packs may
    // hold church-internal content that never lands in the repo).
    const pack = parseStudyPack({
      id: 'two-scriptures',
      title: '雙經文 Two Scriptures',
      date: '2026-10-02',
      enVersion: 'WEB',
      passageRef: '約翰福音 3:22–36 · John 3:22–36',
      sections: [
        { kind: 'title', heading: '雙經文 Two Scriptures' },
        {
          kind: 'scripture',
          heading: '一、約翰的衰微 v.29–30',
          verses: [
            { num: 29, cuv: '娶新婦的就是新郎。', en: 'He who has the bride is the bridegroom.' },
            { num: 30, cuv: '他必興旺，我必衰微。', en: 'He must increase, but I must decrease.' },
          ],
        },
        {
          kind: 'scripture',
          heading: '二、基督的至高 v.31–32',
          verses: [
            { num: 31, cuv: '從天上來的是在萬有之上。', en: 'He who comes from above is above all.' },
            { num: 32, cuv: '他將所見所聞的見證出來。', en: 'What he has seen and heard, of that he testifies.' },
          ],
        },
      ],
    });
    const scriptures = pack.sections.filter(s => s.kind === 'scripture');
    expect(scriptures).toHaveLength(2);
    const prompt = buildAskAIPrompt(pack, buildSlides(pack)[0], 'q');
    for (const section of scriptures) {
      expect(prompt).toContain(`[${section.heading}]`);
      expect(prompt).toContain(section.verses![0].cuv);
      expect(prompt).toContain(section.verses![section.verses!.length - 1].en);
    }
  });
});

describe('questionForSelection', () => {
  it('frames the selected text as a cite-the-verse explain request', () => {
    const q = questionForSelection('treasures in heaven');
    expect(q).toContain('Explain this phrase in the context of the passage');
    expect(q).toContain('cite the verse');
    expect(q).toContain('"treasures in heaven"');
  });
});

describe('createSSEParser', () => {
  it('parses real OpenRouter chunk shapes and ignores [DONE]', () => {
    const deltas: string[] = [];
    const feed = createSSEParser(d => deltas.push(d));
    feed('data: {"id":"gen-1","choices":[{"delta":{"content":"Anxiety "}}]}\n\n');
    feed('data: {"id":"gen-1","choices":[{"delta":{"content":"follows (v.25)."}}]}\n\ndata: [DONE]\n\n');
    expect(deltas).toEqual(['Anxiety ', 'follows (v.25).']);
  });

  it('buffers a data line split across chunks, and handles CRLF', () => {
    const deltas: string[] = [];
    const feed = createSSEParser(d => deltas.push(d));
    feed('data: {"choices":[{"del');
    expect(deltas).toEqual([]); // nothing emitted from a partial line
    feed('ta":{"content":"whole"}}]}\r\n');
    expect(deltas).toEqual(['whole']);
  });

  it('skips SSE comments, keep-alives, and role-only deltas', () => {
    const deltas: string[] = [];
    const feed = createSSEParser(d => deltas.push(d));
    feed(': OPENROUTER PROCESSING\n\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\n\n');
    feed('data: {"choices":[{"delta":{"content":"x"}}]}\n');
    expect(deltas).toEqual(['x']);
  });
});

describe('stripSplitMarker', () => {
  it('replaces [SPLIT] with a line break and trims', () => {
    expect(stripSplitMarker('中文。\n[SPLIT]\nEnglish. ')).toBe('中文。\nEnglish.');
  });
});

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
  return { ok: true, body: stream } as unknown as Response;
}

describe('streamStudyAI', () => {
  it('streams accumulated [SPLIT]-stripped text and sends the pinned model/cap/history', async () => {
    configureKey();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"中文 (v.25)。"}}]}\n',
      'data: {"choices":[{"delta":{"content":"\\n[SPLIT]\\nEnglish"}}]}\n',
      'data: {"choices":[{"delta":{"content":" (v.25)."}}]}\n',
      'data: [DONE]\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const { pack, slide } = loadPack();
    const seen: string[] = [];
    const history = [{ role: 'user' as const, content: 'q1' }, { role: 'assistant' as const, content: 'a1' }];
    const finalText = await streamStudyAI(
      pack, slide, history, 'follow-up', t => seen.push(t), new AbortController().signal
    );
    expect(seen[0]).toBe('中文 (v.25)。');
    expect(finalText).toBe('中文 (v.25)。\nEnglish (v.25).');
    expect(seen[seen.length - 1]).toBe(finalText);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // Key only, no provider/model chosen → the free router goes on the wire
    expect(body).toMatchObject({ model: wireModelId(DEFAULT_AI_SETUP.model), stream: true, max_tokens: ASK_AI_MAX_TOKENS });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages.slice(1, 3)).toEqual(history);
    expect(body.messages[3].content).toContain('QUESTION: follow-up');
  });

  it('resolves cleanly with the partial text when aborted mid-stream', async () => {
    configureKey();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse(['data: {"choices":[{"delta":{"content":"partial"}}]}\n'], true)
    ));
    const { pack, slide } = loadPack();
    const finalText = await streamStudyAI(
      pack, slide, [], 'q', () => undefined, new AbortController().signal
    );
    expect(finalText).toBe('partial');
  });

  it('sends the model chosen in AI settings when the stored provider is OpenRouter', async () => {
    getItemMock.mockImplementation((key: string) => ({
      [STORAGE_KEYS.OPENROUTER_API_KEY]: 'test-key',
      [STORAGE_KEYS.AI_PROVIDER]: 'openrouter',
      [STORAGE_KEYS.AI_MODEL]: 'openai/gpt-4o-mini',
    })[key] ?? null);
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n']));
    vi.stubGlobal('fetch', fetchMock);
    const { pack, slide } = loadPack();
    await streamStudyAI(pack, slide, [], 'q', () => undefined, new AbortController().signal);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe('openai/gpt-4o-mini');
  });

  it('maps a 402 (no credits) to the bilingual credits message', async () => {
    configureKey();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: HTTP_PAYMENT_REQUIRED,
      json: () => Promise.resolve({ error: { message: 'Insufficient credits' } }),
    }));
    const { pack, slide } = loadPack();
    await expect(
      streamStudyAI(pack, slide, [], 'q', () => undefined, new AbortController().signal)
    ).rejects.toThrow(AI_CREDITS_MESSAGE);
  });

  it('throws the API error message on a non-OK response', async () => {
    configureKey();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { message: 'Rate limited' } }),
    }));
    const { pack, slide } = loadPack();
    await expect(
      streamStudyAI(pack, slide, [], 'q', () => undefined, new AbortController().signal)
    ).rejects.toThrow('Rate limited');
  });

  it('throws when no API key is configured, without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { pack, slide } = loadPack();
    await expect(
      streamStudyAI(pack, slide, [], 'q', () => undefined, new AbortController().signal)
    ).rejects.toThrow(AI_NOT_CONFIGURED_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { parseStudyPack, buildSlides, StudyPack, Slide } from '../packTypes';
import {
  AI_NOT_CONFIGURED_MESSAGE,
  buildAskAIPrompt,
  questionForSelection,
  stripSplitMarker,
  ASK_AI_MODEL,
  ASK_AI_MAX_TOKENS,
} from '../askAI';
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

describe('buildAskAIPrompt', () => {
  it('embeds the full bilingual passage, the current slide, and the contract', () => {
    const { pack, slide } = loadPack();
    const prompt = buildAskAIPrompt(pack, slide, 'Why birds?');
    expect(prompt).toContain('Matthew 6:25–34');
    expect(prompt).toContain('不要为生命忧虑');                 // CUV v.25
    expect(prompt).toContain('don’t be anxious for tomorrow');  // WEB v.34
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
      title: 'Two Scriptures 雙經文',
      date: '2026-10-02',
      passageRef: '約翰福音 3:22–36 · John 3:22–36',
      sections: [
        { kind: 'title', heading: 'Two Scriptures 雙經文' },
        {
          kind: 'scripture',
          heading: '一、約翰的衰微 v.29–30',
          verses: [
            { num: 29, cuv: '娶新婦的就是新郎。', web: 'He who has the bride is the bridegroom.' },
            { num: 30, cuv: '他必興旺，我必衰微。', web: 'He must increase, but I must decrease.' },
          ],
        },
        {
          kind: 'scripture',
          heading: '二、基督的至高 v.31–32',
          verses: [
            { num: 31, cuv: '從天上來的是在萬有之上。', web: 'He who comes from above is above all.' },
            { num: 32, cuv: '他將所見所聞的見證出來。', web: 'What he has seen and heard, of that he testifies.' },
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
      expect(prompt).toContain(section.verses![section.verses!.length - 1].web);
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
    expect(body).toMatchObject({ model: ASK_AI_MODEL, stream: true, max_tokens: ASK_AI_MAX_TOKENS });
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { parseStudyPack, buildSlides, StudyPack, Slide } from '../packTypes';
import {
  buildAskAIPrompt,
  questionForSelection,
  resolveAskAIModel,
} from '../askAI';
import { DEFAULT_AI_SETUP, ASK_AI_MODEL, FREE_MODELS_ROUTER_ID, wireModelId } from '../../../services/aiDefaults';
import { FREE_ROUTER_MODEL } from '../../../services/openrouter';
import { createSSEParser, SSEEvent, buildRequestBody } from '../askAIStream';
import { TEST_PACK_PATH } from './fixtures';
import { CONTENT_LANGUAGES, ASK_AI_SYSTEM_PROMPT, ASK_AI_ANSWER_CONTRACT, ASK_AI_LANGUAGE_RULES } from '../principles';
import { ownKeyBody } from '../../../services/aiTransport';
import { BIBLE_SCHOLAR_SYSTEM_PROMPT } from '../../../services/systemPrompts';

function loadPack(): { pack: StudyPack; slide: Slide } {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  return { pack, slide: buildSlides(pack)[0] };
}

// tests/utils/setup.ts replaces localStorage with a vi.fn mock, so stored
// choices are simulated by stubbing getItem rather than via setItem.
const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;

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

  it('maps a stored free-router alias to the wire id OpenRouter lists', () => {
    stored({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter', [STORAGE_KEYS.AI_MODEL]: FREE_MODELS_ROUTER_ID });
    expect(resolveAskAIModel()).toBe(FREE_ROUTER_MODEL);
  });

  it('falls back to the recommended model when another provider is stored', () => {
    stored({ [STORAGE_KEYS.AI_PROVIDER]: 'gemini', [STORAGE_KEYS.AI_MODEL]: 'gemini-3-pro-preview' });
    expect(resolveAskAIModel()).toBe(wireModelId(DEFAULT_AI_SETUP.model));
  });

  it('is the recommended low-cost model (not the free router) when nothing is stored', () => {
    expect(resolveAskAIModel()).toBe(ASK_AI_MODEL);
    expect(ASK_AI_MODEL).toBe('google/gemini-2.5-flash');
  });
});

describe('buildAskAIPrompt', () => {
  it('embeds the full bilingual passage, the current slide and the question — data only, the rules are server-owned (ADR-0014)', () => {
    const { pack, slide } = loadPack();
    const prompt = buildAskAIPrompt(pack, slide, 'Why birds?');
    expect(prompt).toContain('Matthew 6:25–34');
    expect(prompt).toContain('不要为生命忧虑');                 // CUV v.25
    expect(prompt).toContain('do not worry about tomorrow');  // BSB v.34
    expect(prompt).toContain(slide.heading);                    // current slide content
    expect(prompt).toContain('QUESTION: Why birds?');
    expect(prompt).not.toContain(ASK_AI_ANSWER_CONTRACT);
    expect(prompt).not.toContain('CONTENT LANGUAGE');
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

describe('Ask AI request', () => {
  it('sends data only: no system message, the pack\'s mode as content_language (a legacy pack → bilingual)', () => {
    const { pack, slide } = loadPack();
    const history = [{ role: 'user' as const, content: 'q0' }, { role: 'assistant' as const, content: 'a0' }];
    const legacy = JSON.parse(buildRequestBody(pack, slide, history, 'q', { model: 'm' }));
    expect(legacy.content_language).toBe('bilingual');
    expect(legacy.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(legacy.messages[2].content).toBe(buildAskAIPrompt(pack, slide, 'q'));
    for (const mode of CONTENT_LANGUAGES) {
      expect(JSON.parse(buildRequestBody({ ...pack, contentLanguage: mode }, slide, [], 'q', { model: 'm' })).content_language).toBe(mode);
    }
  });

  it('the final messages carry Ask AI\'s own prompt + contract + the mode\'s rule, not the Scripture Scholar one (which forced [SPLIT], LaTeX and a closing offer)', () => {
    const { pack, slide } = loadPack();
    for (const mode of CONTENT_LANGUAGES) {
      const body = buildRequestBody({ ...pack, contentLanguage: mode }, slide, [], 'q', { model: 'm' });
      const final = JSON.parse(ownKeyBody('ask', body));
      const system = final.messages[0];
      expect(system.role).toBe('system');
      expect(system.content).toContain(ASK_AI_SYSTEM_PROMPT);
      expect(system.content).toContain(ASK_AI_ANSWER_CONTRACT);
      expect(system.content).toContain(ASK_AI_LANGUAGE_RULES[mode]);
      for (const other of CONTENT_LANGUAGES.filter(m => m !== mode)) expect(system.content).not.toContain(ASK_AI_LANGUAGE_RULES[other]);
      expect(final).not.toHaveProperty('content_language');
      expect(JSON.stringify(final.messages)).not.toContain(BIBLE_SCHOLAR_SYSTEM_PROMPT.split('\n')[0]);
    }
  });
});

describe('questionForSelection', () => {
  it('asks what the selection means in this passage, Chinese first, citing the verse', () => {
    const q = questionForSelection('treasures in heaven');
    expect(q.startsWith('「treasures in heaven」在这段经文中是什么意思')).toBe(true);
    expect(q).toContain('What does "treasures in heaven" mean in this passage');
    expect(q).toContain('历史和文化背景');
    expect(q).toContain('historical and cultural background');
    expect(q).toContain('original-language sense');
    expect(q).toContain('cite the verse');
  });

  it('names the verse the selection came from', () => {
    const q = questionForSelection('箴言', 1);
    expect(q.startsWith('「箴言」在第1节中是什么意思')).toBe(true);
    expect(q).toContain('mean in verse 1');
  });
});

describe('createSSEParser', () => {
  const collect = () => {
    const events: SSEEvent[] = [];
    return { events, feed: createSSEParser(e => events.push(e)) };
  };
  const contents = (events: SSEEvent[]) => events.map(e => e.content).filter(Boolean);

  it('parses real OpenRouter chunk shapes and ignores [DONE]', () => {
    const { events, feed } = collect();
    feed('data: {"id":"gen-1","model":"google/gemini-2.5-flash","choices":[{"delta":{"content":"Anxiety "}}]}\n\n');
    feed('data: {"id":"gen-1","choices":[{"delta":{"content":"follows (v.25)."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    expect(contents(events)).toEqual(['Anxiety ', 'follows (v.25).']);
    expect(events[0].model).toBe('google/gemini-2.5-flash');
    expect(events[1].finishReason).toBe('stop');
  });

  it('buffers a data line split across chunks, and handles CRLF', () => {
    const { events, feed } = collect();
    feed('data: {"choices":[{"del');
    expect(events).toEqual([]); // nothing emitted from a partial line
    feed('ta":{"content":"whole"}}]}\r\n');
    expect(contents(events)).toEqual(['whole']);
  });

  it('skips SSE comments and keep-alives; a role-only delta carries no content', () => {
    const { events, feed } = collect();
    feed(': OPENROUTER PROCESSING\n\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\n\n');
    feed('data: {"choices":[{"delta":{"content":"x"}}]}\n');
    expect(contents(events)).toEqual(['x']);
  });

  it('surfaces a stream-level error object (top level or on the choice) instead of skipping it', () => {
    const { events, feed } = collect();
    feed('data: {"error":{"message":"Provider returned error","code":502},"user_id":"u"}\n');
    feed('data: {"choices":[{"error":{"message":"upstream failed","code":"server_error"},"delta":{}}]}\n');
    expect(events[0].error).toEqual({ message: 'Provider returned error', code: 502 });
    expect(events[1].error).toEqual({ message: 'upstream failed', code: 'server_error' });
  });

  it('reports reasoning deltas (reasoning and reasoning_content) separately from content', () => {
    const { events, feed } = collect();
    feed('data: {"choices":[{"delta":{"reasoning":"Let me think"}}]}\n');
    feed('data: {"choices":[{"delta":{"reasoning_content":"more"},"finish_reason":"length"}]}\n');
    expect(events.map(e => e.reasoning)).toEqual(['Let me think', 'more']);
    expect(contents(events)).toEqual([]);
    expect(events[1].finishReason).toBe('length');
  });
});


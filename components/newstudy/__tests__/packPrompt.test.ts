/**
 * packPrompt.test.ts — the generation prompt embeds the passage (both
 * languages), the content contract from principles.ts, all seven life areas
 * and the strict-JSON shape; the request body carries the agreed model knobs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildPackPrompt, GENERATED_SHAPE, generatedShape, PACK_MAX_TOKENS, PACK_TEMPERATURE,
  PACK_COMPACT_JSON_RULE, PACK_LENGTH_LIMITS, PACK_CONTINUE_PROMPT,
} from '../packPrompt';
import { buildPackRequestBody, buildContinuationBody } from '../generatePack';
import { BILINGUAL_SEPARATOR } from '../../studypack/principles';
import { JOHN3_REQUEST, JOHN3_REQUEST_ZH } from './fixtures';
import {
  PACK_CONTENT_CONTRACT, ASK_AI_ANSWER_CONTRACT, LIFE_AREAS, TRANSLATIONS, CONTENT_LANGUAGE_CONTRACTS, CONTENT_LANGUAGES,
} from '../../studypack/principles';
import { PACK_GENERATION_MODEL } from '../../../services/aiDefaults';

const verses = [
  { num: 22, cuv: '这事以后，耶稣和门徒到了犹太地', en: 'After this, Jesus and His disciples went into the Judean countryside' },
  { num: 23, cuv: '约翰在靠近撒冷的哀嫩也施洗', en: 'Now John was also baptizing at Aenon near Salim' },
];

describe('buildPackPrompt', () => {
  const prompt = buildPackPrompt({ passageRef: '约翰福音 3:22–23 · John 3:22–23', verses, contentLanguage: 'bilingual' });

  it('embeds every verse in both languages, numbered', () => {
    for (const v of verses) {
      expect(prompt).toContain(`${v.num} ${v.cuv}`);
      expect(prompt).toContain(`${v.num} ${v.en}`);
    }
    expect(prompt).toContain(`${TRANSLATIONS.zh.label} / ${TRANSLATIONS.en.label}`);
  });

  it('embeds the pack content contract from principles.ts verbatim, not the Ask-AI answer contract', () => {
    expect(prompt).toContain(PACK_CONTENT_CONTRACT);
    expect(prompt).not.toContain(ASK_AI_ANSWER_CONTRACT);
  });

  it('names all seven life areas, in canonical order', () => {
    expect(LIFE_AREAS).toHaveLength(7);
    let last = -1;
    for (const area of LIFE_AREAS) {
      const at = prompt.indexOf(area);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
  });

  it('demands strict JSON with the agreed shape', () => {
    expect(prompt).toContain('STRICT JSON');
    expect(prompt).toContain(GENERATED_SHAPE);
    expect(() => JSON.parse(GENERATED_SHAPE)).not.toThrow();
  });

  it('keeps a leader-supplied lesson title', () => {
    expect(buildPackPrompt({ passageRef: 'x', verses, lessonTitle: '祂必兴旺', contentLanguage: 'bilingual' })).toContain('"祂必兴旺"');
  });

  it('demands compact single-line JSON: no indentation, no fences, no commentary', () => {
    expect(prompt).toContain(PACK_COMPACT_JSON_RULE);
    expect(PACK_COMPACT_JSON_RULE).toMatch(/COMPACT JSON/);
    expect(PACK_COMPACT_JSON_RULE).toMatch(/no indentation/);
    expect(PACK_COMPACT_JSON_RULE).toMatch(/no markdown fences/);
    expect(PACK_COMPACT_JSON_RULE).toMatch(/no commentary/);
  });

  it('gives explicit length limits per field alongside the counts', () => {
    expect(prompt).toContain(PACK_LENGTH_LIMITS);
    expect(PACK_LENGTH_LIMITS).toMatch(/context paragraphs ≤ 2 sentences/);
    expect(PACK_LENGTH_LIMITS).toMatch(/originalLanguage notes ≤ 1 sentence/);
    expect(PACK_LENGTH_LIMITS).toMatch(/crossRefs reasons ≤ 12 words/);
    expect(PACK_LENGTH_LIMITS).toMatch(/lifeMenu practices ≤ 25 words/);
    expect(PACK_LENGTH_LIMITS).toMatch(/reflection check-in 1 line/);
    expect(PACK_LENGTH_LIMITS).toMatch(/closing 1 line/);
    expect(prompt).toMatch(/context = 3 short paragraphs/);
    expect(prompt).toMatch(/originalLanguage = 2–3 notes/);
    expect(prompt).toMatch(/crossRefs = 4–5/);
    expect(prompt).toMatch(/discussion = 5 questions/);
  });
});

describe('PACK_CONTINUE_PROMPT / buildContinuationBody', () => {
  it('is bilingual and asks to resume the JSON without repeating', () => {
    expect(PACK_CONTINUE_PROMPT).toContain(BILINGUAL_SEPARATOR);
    expect(PACK_CONTINUE_PROMPT).toContain('继续输出未完成的 JSON');
    expect(PACK_CONTINUE_PROMPT).toContain('Continue the unfinished JSON');
  });

  it('appends the partial reply as the assistant turn and the continue instruction as the user turn, same knobs', () => {
    const first = buildPackRequestBody(JOHN3_REQUEST, verses);
    const body = JSON.parse(buildContinuationBody(first, '{"title": {"zh": "祂')) as {
      model: string; max_tokens: number; messages: Array<{ role: string; content: string }>;
    };
    const original = JSON.parse(first) as { messages: unknown[] };
    expect(body.model).toBe(PACK_GENERATION_MODEL);
    expect(body.max_tokens).toBe(PACK_MAX_TOKENS);
    expect(body.messages).toHaveLength(original.messages.length + 2);
    expect(body.messages.slice(0, 1)).toEqual(original.messages);
    expect(body.messages[1]).toEqual({ role: 'assistant', content: '{"title": {"zh": "祂' });
    expect(body.messages[2]).toEqual({ role: 'user', content: PACK_CONTINUE_PROMPT });
  });
});

describe('buildPackRequestBody', () => {
  beforeEach(() => {
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(null);
  });

  it('streams with the pack-generation model, a full-pack token budget and low temperature', () => {
    const body = JSON.parse(buildPackRequestBody(JOHN3_REQUEST, verses)) as {
      model: string; stream: boolean; max_tokens: number; temperature: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe(PACK_GENERATION_MODEL);
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(PACK_MAX_TOKENS);
    // A full bilingual pack (CJK ≈ 1 token/char) does not fit in 4000; the owner's first run was cut mid-JSON.
    expect(PACK_MAX_TOKENS).toBeGreaterThanOrEqual(8000);
    expect(body.temperature).toBe(PACK_TEMPERATURE);
    expect(PACK_TEMPERATURE).toBeLessThanOrEqual(0.3);
    // Data form (ADR-0014): the pack system message is server-owned.
    expect(body.messages.map(m => m.role)).toEqual(['user']);
    expect(body.messages[0].content).toContain('约翰福音 3:22–36 · John 3:22–36');
  });
});

describe('content language contracts in the prompt (CONTENT_LANGUAGE_CONTRACTS, ADR-0003 §1 note)', () => {
  const promptFor = (mode: (typeof CONTENT_LANGUAGES)[number]) =>
    buildPackPrompt({ passageRef: 'x', verses, contentLanguage: mode });

  it('each mode injects its own line rule and total-size target, and exactly one of them', () => {
    for (const mode of CONTENT_LANGUAGES) {
      const prompt = promptFor(mode);
      const contract = CONTENT_LANGUAGE_CONTRACTS[mode];
      expect(prompt).toContain(contract.lineRule);
      expect(prompt).toContain(contract.totalTarget);
      expect(contract.totalTarget).toContain('shorter is better');
      for (const other of CONTENT_LANGUAGES.filter(m => m !== mode)) {
        expect(prompt).not.toContain(CONTENT_LANGUAGE_CONTRACTS[other].lineRule);
        expect(prompt).not.toContain(CONTENT_LANGUAGE_CONTRACTS[other].totalTarget);
      }
    }
  });

  it('scales the total: zh-keywords ≈ 1,600 Chinese characters, bilingual 2,500, en-keywords ≈ 900 English words', () => {
    expect(CONTENT_LANGUAGE_CONTRACTS['zh-keywords'].totalTarget).toContain('1,600');
    expect(CONTENT_LANGUAGE_CONTRACTS.bilingual.totalTarget).toContain('2,500');
    expect(CONTENT_LANGUAGE_CONTRACTS['en-keywords'].totalTarget).toMatch(/900 English words/);
  });

  it('zh-keywords: Chinese lines with the English term once in parentheses, no sentence translations, no "en" field; en-keywords mirrors it', () => {
    const zh = CONTENT_LANGUAGE_CONTRACTS['zh-keywords'].lineRule;
    expect(zh).toContain('忧虑（anxiety）');
    expect(zh).toMatch(/Do NOT translate sentences into English/);
    expect(zh).toMatch(/do NOT add an "en" field/);
    expect(zh).toMatch(/title and keyPhrase, which carry both/);
    const en = CONTENT_LANGUAGE_CONTRACTS['en-keywords'].lineRule;
    expect(en).toContain('anxiety (忧虑)');
    expect(en).toMatch(/do NOT add a "zh" field/);
    expect(CONTENT_LANGUAGE_CONTRACTS.bilingual.lineRule).toContain('中文 · English');
  });

  it('the JSON shape per mode carries only that mode\'s halves on drafted items; title and keyPhrase keep both', () => {
    const zhShape = generatedShape('zh-keywords');
    const enShape = generatedShape('en-keywords');
    expect(promptFor('zh-keywords')).toContain(zhShape);
    expect(promptFor('bilingual')).toContain(GENERATED_SHAPE);
    for (const shape of [zhShape, enShape]) expect(() => JSON.parse(shape)).not.toThrow();
    const zhParsed = JSON.parse(zhShape) as { context: object[]; closing: object; title: object; lifeMenu: object[] };
    expect(zhParsed.context[0]).toEqual({ zh: '…' });
    expect(zhParsed.closing).not.toHaveProperty('en');
    expect(zhParsed.lifeMenu[0]).toEqual({ area: '健康 Health', zh: '具体操练' });
    expect(zhParsed.title).toHaveProperty('en');
    const enParsed = JSON.parse(enShape) as { context: object[]; keyPhrase: object };
    expect(enParsed.context[0]).toEqual({ en: '…' });
    expect(enParsed.keyPhrase).toHaveProperty('zh');
  });

  it('the request body carries the request\'s mode', () => {
    const body = JSON.parse(buildPackRequestBody(JOHN3_REQUEST_ZH, verses)) as { messages: Array<{ content: string }> };
    expect(body.messages[0].content).toContain(CONTENT_LANGUAGE_CONTRACTS['zh-keywords'].lineRule);
    expect(body.messages[0].content).not.toContain(CONTENT_LANGUAGE_CONTRACTS.bilingual.lineRule);
  });
});

/**
 * packPrompt.test.ts — the generation prompt embeds the passage (both
 * languages), the content contract from principles.ts, all seven life areas
 * and the strict-JSON shape; the request body carries the agreed model knobs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildPackPrompt, GENERATED_SHAPE, PACK_MAX_TOKENS, PACK_TEMPERATURE, PACK_SYSTEM_PROMPT,
  PACK_COMPACT_JSON_RULE, PACK_LENGTH_LIMITS, PACK_CONTINUE_PROMPT,
} from '../packPrompt';
import { buildPackRequestBody, buildContinuationBody } from '../generatePack';
import { BILINGUAL_SEPARATOR } from '../../studypack/principles';
import { JOHN3_REQUEST } from './fixtures';
import { PACK_CONTENT_CONTRACT, ASK_AI_ANSWER_CONTRACT, LIFE_AREAS, TRANSLATIONS } from '../../studypack/principles';
import { PACK_GENERATION_MODEL } from '../../../services/aiDefaults';

const verses = [
  { num: 22, cuv: '这事以后，耶稣和门徒到了犹太地', en: 'After this, Jesus and His disciples went into the Judean countryside' },
  { num: 23, cuv: '约翰在靠近撒冷的哀嫩也施洗', en: 'Now John was also baptizing at Aenon near Salim' },
];

describe('buildPackPrompt', () => {
  const prompt = buildPackPrompt({ passageRef: '约翰福音 3:22–23 · John 3:22–23', verses });

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
    expect(buildPackPrompt({ passageRef: 'x', verses, lessonTitle: '祂必兴旺' })).toContain('"祂必兴旺"');
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
    expect(body.messages.slice(0, 2)).toEqual(original.messages);
    expect(body.messages[2]).toEqual({ role: 'assistant', content: '{"title": {"zh": "祂' });
    expect(body.messages[3]).toEqual({ role: 'user', content: PACK_CONTINUE_PROMPT });
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
    expect(body.messages[0]).toEqual({ role: 'system', content: PACK_SYSTEM_PROMPT });
    expect(body.messages[1].content).toContain('约翰福音 3:22–36 · John 3:22–36');
  });
});

describe('pack prompt total size target', () => {
  it('states one explicit total-size target so the model budgets the whole reply', async () => {
    const mod = await import('../packPrompt');
    expect(mod.PACK_LENGTH_LIMITS).toContain('2,500');
    expect(mod.PACK_LENGTH_LIMITS).toContain('shorter is better');
  });
});

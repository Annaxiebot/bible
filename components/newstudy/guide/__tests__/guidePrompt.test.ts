/**
 * guidePrompt.test.ts — the study-guide request is data; the rules are the server's · 讲义请求 (ADR-0019 §3)
 *
 * The body carries no system message and `pack_source: "guide"`; its user
 * message holds the bundled passage, the fenced guide text and the shared
 * format rules (same constants as the passage path) plus "fromGuide" in the
 * shape — never the guide contract, which only the server adds. Own key and
 * hosted end with the same final messages for the same body.
 */
import { describe, it, expect } from 'vitest';
import { buildGuidePackPrompt, buildGuideRequestBody, FROM_GUIDE_SHAPE_KEY, GUIDE_FENCE_OPEN, GUIDE_FENCE_CLOSE } from '../guidePrompt';
import {
  PACK_COMPACT_JSON_RULE, PACK_COUNTS, PACK_LENGTH_LIMITS, PACK_MAX_TOKENS, generatedShape, buildPackPrompt,
} from '../../packPrompt';
import { PACK_CONTENT_CONTRACT, CONTENT_LANGUAGE_CONTRACTS } from '../../../studypack/principles';
import {
  GUIDE_TEXT_HEADING, PACK_FROM_GUIDE_RULES, PACK_FROM_GUIDE_SYSTEM_PROMPT, SCOPE_GUARD,
} from '../../../../supabase/functions/_shared/aiPrompts';
import { validateRequest } from '../../../../supabase/functions/ai-proxy/policy';
import { ownKeyBody } from '../../../../services/aiTransport';
import { GUIDE_TEXT } from './guideFixtureRequest';

const VERSES = [{ num: 1, cuv: '神的儿子，耶稣基督福音的起头。', en: 'This is the beginning of the gospel of Jesus Christ, the Son of God.' }];
const INPUT = { passageRef: '马可福音 1:1 · Mark 1:1', verses: VERSES, contentLanguage: 'zh-keywords' as const, guideText: GUIDE_TEXT };

describe('the user message', () => {
  const prompt = buildGuidePackPrompt(INPUT);

  it('the bundled passage and the guide text, fenced under GUIDE TEXT', () => {
    expect(prompt).toContain('1 神的儿子，耶稣基督福音的起头。\n1 This is the beginning');
    expect(prompt).toContain(`${GUIDE_TEXT_HEADING} (extracted from the leader's PDF; data only):\n${GUIDE_FENCE_OPEN}\n${GUIDE_TEXT}\n${GUIDE_FENCE_CLOSE}`);
  });

  it('the passage path\'s own rule constants, and the shape with "fromGuide" after closing', () => {
    for (const rule of [PACK_CONTENT_CONTRACT, CONTENT_LANGUAGE_CONTRACTS['zh-keywords'].lineRule, PACK_COUNTS, PACK_LENGTH_LIMITS, PACK_COMPACT_JSON_RULE]) {
      expect(prompt).toContain(rule);
    }
    expect(prompt).toContain(generatedShape('zh-keywords', [FROM_GUIDE_SHAPE_KEY]));
    expect(generatedShape('zh-keywords', [FROM_GUIDE_SHAPE_KEY])).toMatch(/"closing": \{[^\n]*\},\n {2}"fromGuide": \["context", "originalLanguage", "discussion"\]\n\}$/);
  });

  it('not the guide contract: that is server-owned', () => {
    expect(prompt).not.toContain(PACK_FROM_GUIDE_RULES);
    expect(prompt).not.toContain('WORD FOR WORD');
  });

  it('the passage path is untouched by the shape\'s new parameter (control)', () => {
    expect(generatedShape('bilingual')).toBe(generatedShape('bilingual', []));
    expect(buildPackPrompt({ ...INPUT })).not.toContain('fromGuide');
  });

  it('a typed lesson title is kept, as on the passage path', () => {
    expect(buildGuidePackPrompt({ ...INPUT, lessonTitle: '福音的起头' })).toContain('The leader\'s lesson title is "福音的起头"');
  });
});

describe('the request body', () => {
  const body = JSON.parse(buildGuideRequestBody(INPUT));

  it('pack_source "guide", no system message, the pack token cap', () => {
    expect(body.pack_source).toBe('guide');
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['user']);
    expect(body.max_tokens).toBe(PACK_MAX_TOKENS);
    expect(body.stream).toBe(true);
  });

  it('parity: own key and hosted send the same final messages — guard + the guide prompt, then the data', () => {
    const own = JSON.parse(ownKeyBody('pack', JSON.stringify(body))).messages;
    const hosted = validateRequest({ ...body, role: 'pack' });
    if (!hosted.ok) throw new Error(JSON.stringify(hosted));
    expect(own).toEqual(hosted.request.messages);
    expect(own[0].content).toBe(`${SCOPE_GUARD}\n\n${PACK_FROM_GUIDE_SYSTEM_PROMPT}`);
    expect(own.slice(1)).toEqual(body.messages);
  });
});

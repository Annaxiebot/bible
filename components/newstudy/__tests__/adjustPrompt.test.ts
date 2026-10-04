/**
 * adjustPrompt.test.ts — the one-section revise prompt carries the content
 * contract, the pack's language rule, the passage, the section's current
 * content (without its heading) and the leader's instruction; scripture,
 * title and qr are never adjustable; the body uses role-agnostic knobs.
 */
import { describe, it, expect } from 'vitest';
import {
  buildAdjustPrompt, buildAdjustRequestBody, isAdjustable, adjustContent, ADJUST_MAX_TOKENS, ADJUST_MAX_QUESTIONS,
} from '../adjustPrompt';
import { PACK_SYSTEM_PROMPT, PACK_COMPACT_JSON_RULE, PACK_TEMPERATURE } from '../packPrompt';
import { PACK_CONTENT_CONTRACT, CONTENT_LANGUAGE_CONTRACTS, LIFE_AREAS } from '../../studypack/principles';
import { PackSection } from '../../studypack/packTypes';

const REF = '约翰福音 3:22–36 · John 3:22–36';
const discussion: PackSection = { kind: 'discussion', heading: '讨论 Discussion HEADING', questions: ['问题一', '问题二', '问题三'] };
const lifeMenu: PackSection = {
  kind: 'lifeMenu', heading: '生活应用 Life menu', rows: LIFE_AREAS.map(area => ({ area, practice: `做 ${area}` })),
};

describe('buildAdjustPrompt', () => {
  const prompt = buildAdjustPrompt({ passageRef: REF, contentLanguage: 'zh-keywords', section: discussion, instruction: '更简单 · Simpler' });

  it('carries the passage, the content contract, the pack language rule and the compact-JSON rule', () => {
    expect(prompt).toContain(REF);
    expect(prompt).toContain(PACK_CONTENT_CONTRACT);
    expect(prompt).toContain(CONTENT_LANGUAGE_CONTRACTS['zh-keywords'].lineRule);
    expect(prompt).not.toContain(CONTENT_LANGUAGE_CONTRACTS.bilingual.lineRule);
    expect(prompt).toContain(PACK_COMPACT_JSON_RULE);
  });

  it('carries the current content as JSON, the instruction and the shape demand — never the heading', () => {
    expect(prompt).toContain(JSON.stringify({ questions: discussion.questions }));
    expect(prompt).toContain("LEADER'S INSTRUCTION: 更简单 · Simpler");
    expect(prompt).toContain('Return ONLY the same JSON shape');
    expect(prompt).not.toContain('HEADING');
  });

  it('discussion: keeps the count and states the bounds', () => {
    expect(prompt).toContain('Keep 3 questions');
    expect(prompt).toContain(`more than ${ADJUST_MAX_QUESTIONS}`);
  });

  it('lifeMenu: names the seven areas in order and asks for practices only', () => {
    const p = buildAdjustPrompt({ passageRef: REF, contentLanguage: 'bilingual', section: lifeMenu, instruction: '更短' });
    expect(p).toContain(LIFE_AREAS.join('; '));
    expect(p).toContain('Change only the "practice" texts');
    expect(p).toContain(CONTENT_LANGUAGE_CONTRACTS.bilingual.lineRule);
  });

  it('body sections ask for { body }', () => {
    const p = buildAdjustPrompt({
      passageRef: REF, contentLanguage: 'bilingual', instruction: 'x',
      section: { kind: 'context', heading: 'h', body: ['一 · one'] },
    });
    expect(p).toContain('{"body":["一 · one"]}');
    expect(p).toContain('Return {"body": [...]}');
  });
});

describe('adjustable kinds', () => {
  it('never scripture, title or qr; every model-drafted kind is', () => {
    for (const kind of ['scripture', 'title', 'qr'] as const) expect(isAdjustable(kind)).toBe(false);
    for (const kind of ['context', 'originalLanguage', 'crossRefs', 'discussion', 'lifeMenu', 'reflection', 'closing'] as const) {
      expect(isAdjustable(kind)).toBe(true);
    }
  });

  it('adjustContent picks only the kind\'s field', () => {
    expect(adjustContent(discussion)).toEqual({ questions: discussion.questions });
    expect(adjustContent(lifeMenu)).toEqual({ rows: lifeMenu.rows });
    expect(adjustContent({ kind: 'closing', heading: 'h', body: ['a'] })).toEqual({ body: ['a'] });
  });
});

describe('buildAdjustRequestBody', () => {
  it('streams with the pack system prompt, the adjust token cap and the pack temperature', () => {
    const body = JSON.parse(buildAdjustRequestBody({ passageRef: REF, contentLanguage: 'bilingual', section: discussion, instruction: 'x' }));
    expect(body).toMatchObject({ stream: true, max_tokens: ADJUST_MAX_TOKENS, temperature: PACK_TEMPERATURE });
    expect(body.messages[0]).toEqual({ role: 'system', content: PACK_SYSTEM_PROMPT });
    expect(body.messages[1].role).toBe('user');
    expect(typeof body.model).toBe('string');
  });
});

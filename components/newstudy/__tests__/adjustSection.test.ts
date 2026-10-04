/**
 * adjustSection.test.ts — validator per kind (discussion bounds, life areas
 * pinned) and the pipeline over a mocked services/aiTransport: ok, an
 * invalid reply then a valid one (one retry, role 'adjust'), invalid twice
 * → AdjustError, a hosted quota reply → the shared quota line.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adjustSection, validateAdjusted, AdjustError } from '../adjustSection';
import { sendAIRequest } from '../../../services/aiTransport';
import { PackSection } from '../../studypack/packTypes';
import { LIFE_AREAS } from '../../studypack/principles';
import { quotaLine, AI_SIGN_IN_NEEDED } from '../../studypack/tvHints';
import { AskAIError } from '../../studypack/askAIErrors';
import { NS_ERR_INVALID, NS_ERR_LIFE_AREAS } from '../newStudyStrings';

vi.mock('../../../services/aiTransport', () => ({ sendAIRequest: vi.fn() }));
const send = vi.mocked(sendAIRequest);

const discussion: PackSection = { kind: 'discussion', heading: '讨论 Discussion', questions: ['旧一', '旧二'] };
const rows = LIFE_AREAS.map(area => ({ area, practice: '旧' }));
const lifeMenu: PackSection = { kind: 'lifeMenu', heading: '生活应用', rows };
const input = { passageRef: '约翰福音 3:22–36 · John 3:22–36', contentLanguage: 'bilingual' as const, section: discussion, instruction: '更简单' };

function sse(text: string) {
  const line = `data: ${JSON.stringify({ model: 'm', choices: [{ delta: { content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
  return { kind: 'hosted' as const, response: new Response(line, { status: 200 }) };
}

beforeEach(() => { send.mockReset(); });

describe('validateAdjusted', () => {
  it('discussion: trims, accepts 1–8, rejects 0, 9 and empty questions', () => {
    expect(validateAdjusted(discussion, { questions: [' a ', 'b'] })).toEqual({ questions: ['a', 'b'] });
    expect(validateAdjusted(discussion, { questions: ['a'] })).toEqual({ questions: ['a'] });
    for (const questions of [[], Array(9).fill('q'), ['a', ' '], 'a', [1]]) {
      expect(() => validateAdjusted(discussion, { questions })).toThrow(AdjustError);
    }
  });

  it('lifeMenu: the same seven areas in the same order, labels kept from the section', () => {
    const next = rows.map(r => ({ area: ` ${r.area}`, practice: `新 ${r.area}` }));
    expect(validateAdjusted(lifeMenu, { rows: next })).toEqual({ rows: rows.map(r => ({ area: r.area, practice: `新 ${r.area}` })) });
    const swapped = [next[1], next[0], ...next.slice(2)];
    expect(() => validateAdjusted(lifeMenu, { rows: swapped })).toThrow(NS_ERR_LIFE_AREAS);
    expect(() => validateAdjusted(lifeMenu, { rows: next.slice(0, 6) })).toThrow(NS_ERR_LIFE_AREAS);
    expect(() => validateAdjusted(lifeMenu, { rows: next.map(r => ({ ...r, practice: '' })) })).toThrow(AdjustError);
  });

  it('body sections: { body } with non-empty lines', () => {
    const closing: PackSection = { kind: 'closing', heading: 'h', body: ['x'] };
    expect(validateAdjusted(closing, { body: ['新'] })).toEqual({ body: ['新'] });
    expect(() => validateAdjusted(closing, { questions: ['新'] })).toThrow(AdjustError);
  });
});

describe('adjustSection', () => {
  it('ok: role adjust, a fenced reply is accepted, kind and heading are kept', async () => {
    send.mockResolvedValueOnce(sse('```json\n{"questions":["新一","新二"]}\n```'));
    const out = await adjustSection(input, new AbortController().signal);
    expect(out).toEqual({ ...discussion, questions: ['新一', '新二'] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('adjust');
  });

  it('invalid JSON then valid: exactly one retry', async () => {
    send.mockResolvedValueOnce(sse('{"questions": ["cut')).mockResolvedValueOnce(sse('{"questions":["新"]}'));
    const out = await adjustSection(input, new AbortController().signal);
    expect(out.questions).toEqual(['新']);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('invalid twice: a typed AdjustError with the bilingual line, no third call', async () => {
    send.mockResolvedValueOnce(sse('not json')).mockResolvedValueOnce(sse('{"questions":[]}'));
    const err = await adjustSection(input, new AbortController().signal).catch(e => e);
    expect(err).toBeInstanceOf(AdjustError);
    expect(err.kind).toBe('invalid-reply');
    expect(err.message).toContain(NS_ERR_INVALID);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('hosted quota → the shared quota line, never retried', async () => {
    send.mockResolvedValueOnce({ kind: 'hosted', response: new Response(JSON.stringify({ error: 'quota', limit: 100 }), { status: 429 }) });
    const err = await adjustSection(input, new AbortController().signal).catch(e => e);
    expect(err).toBeInstanceOf(AskAIError);
    expect(err.kind).toBe('quota');
    expect(err.message).toBe(quotaLine(100));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('signed out, no key → the sign-in line', async () => {
    send.mockResolvedValueOnce({ kind: 'sign-in-needed' });
    await expect(adjustSection(input, new AbortController().signal)).rejects.toThrow(AI_SIGN_IN_NEEDED);
  });
});

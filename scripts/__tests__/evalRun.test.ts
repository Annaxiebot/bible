/**
 * evalRun.test.ts — the shared evaluation helpers (ADR-0015 §6, ADR-0016): the
 * arms may differ only in `messages`, and a failed arm is counted, never a pass (R14).
 */
import { describe, it, expect } from 'vitest';
import { assertSameOutsideMessages, summariseArms } from '../lib/evalRun.mjs';

const body = (extra: Record<string, unknown>, content = 'q') =>
  JSON.stringify({ model: 'm', stream: true, max_tokens: 700, temperature: 0.7, ...extra, messages: [{ role: 'user', content }] });

describe('assertSameOutsideMessages', () => {
  it('passes when only the messages differ; throws on any other difference', () => {
    expect(() => assertSameOutsideMessages(body({}, 'a'), body({}, 'b'))).not.toThrow();
    expect(() => assertSameOutsideMessages(body({}), body({ temperature: 0 }))).toThrow(/R14/);
    expect(() => assertSameOutsideMessages(body({}), body({ model: 'other' }))).toThrow(/R14/);
  });
});

describe('summariseArms', () => {
  const arm = (failed: boolean, nsv = 0, mem = 0) => ({ failed, noSuchVerse: Array(nsv).fill('x'), fromMemory: Array(mem).fill('y') });
  it('counts answered / failed / refs per arm and only order-proof wins', () => {
    const items = [
      { control: arm(false, 1, 2), treatment: arm(false, 0, 1), judge: { winner: 'treatment' } },
      { control: arm(true), treatment: arm(false), judge: { winner: 'treatment' } },
      { control: arm(false), treatment: arm(false), judge: { winner: null } },
    ];
    expect(summariseArms(items)).toEqual({
      questions: 3,
      control: { answered: 2, failed: 1, noSuchVerse: 1, citedFromMemory: 2, judgeWins: 0 },
      treatment: { answered: 3, failed: 0, noSuchVerse: 0, citedFromMemory: 1, judgeWins: 2 },
      judgeUndecided: 1,
    });
  });
});

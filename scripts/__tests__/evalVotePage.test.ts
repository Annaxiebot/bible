/**
 * evalVotePage.test.ts — the ADR-0015 blind-vote page: sides de-randomise
 * correctly, a failed arm shows as "no answer" (never a blank that could
 * win), answers render as text, and Reveal tallies the votes.
 */
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { blindPairs, votePageHtml } from '../lib/evalVotePage.mjs';

const item = (id: string, control: string, treatment: string, failed = false) => ({
  id, passageRef: '马太福音 6:25–34', question: `q-${id}`,
  control: { text: control, failed, error: failed ? 'HTTP 500' : null },
  treatment: { text: treatment, failed: false },
});

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('blindPairs', () => {
  it('records which side is control, so the vote can be de-randomised', () => {
    const pairs = blindPairs([item('a', 'C1', 'T1'), item('b', 'C2', 'T2')], sequence([0.9, 0.1, 0.9]));
    for (const p of pairs) {
      const control = p.aArm === 'control' ? p.a : p.b;
      expect(control.startsWith('C')).toBe(true);
    }
    expect(new Set(pairs.map(p => p.aArm)).size).toBe(2);
  });

  it('a failed arm is shown as no answer, with its error', () => {
    const [p] = blindPairs([item('a', '', 'T1', true)], () => 0.1);
    expect(p.aArm).toBe('control');
    expect(p.a).toBe('（无回答 · no answer: HTTP 500）');
  });
});

describe('votePageHtml', () => {
  it('renders every pair as text, hides arms until Reveal, and tallies the votes', () => {
    const pairs = blindPairs([item('a', '<script>bad()</script>', 'T1'), item('b', 'C2', 'T2')], sequence([0.1, 0.9, 0.1]));
    const dom = new JSDOM(votePageHtml(pairs), { runScripts: 'dangerously' });
    const doc = dom.window.document;
    expect(doc.querySelectorAll('section.pair')).toHaveLength(2);
    expect(doc.body.innerHTML).not.toContain('<script>bad()');
    expect(doc.body.textContent).toContain('<script>bad()</script>');
    expect(doc.body.classList.contains('revealed')).toBe(false);
    const radios = [...doc.querySelectorAll('input[type=radio]')] as HTMLInputElement[];
    expect(radios).toHaveLength(4);
    radios.find(r => r.name === 'v0' && r.value === 'treatment')!.checked = true;
    (doc.querySelector('button') as HTMLButtonElement).click();
    expect(doc.body.classList.contains('revealed')).toBe(true);
    expect(doc.getElementById('tally')!.textContent).toBe('实验 treatment 1 · 对照 control 0 · 未投 unvoted 1');
  });
});

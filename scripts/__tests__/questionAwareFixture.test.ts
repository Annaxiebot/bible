/**
 * questionAwareFixture.test.ts — the ADR-0016 second attempt's fixed question set
 *
 * The set was committed before any run (R14); this pins its shape so a later
 * edit that shrinks or skews it fails loudly: ≥30 questions over ≥6 passages,
 * passage + thematic + selection kinds, Chinese and English, every pack real.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
interface Pack { id: string; file?: string; bookId?: string; chapter?: number; from?: number; to?: number }
interface Question { id: string; pack: string; kind: string; question?: string; selection?: string; verse?: number }
const fixture = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/question-aware-eval-2.json'), 'utf-8')) as
  { model: string; judge: string; packs: Pack[]; questions: Question[] };
const first = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/related-verses-eval.json'), 'utf-8')) as
  { model: string; judge: string };

const HAN = /[一-鿿]/;
const textOf = (q: Question) => q.question ?? q.selection ?? '';

describe('question-aware-eval-2.json', () => {
  it('the same model and the same judge as the first run (R14)', () => {
    expect([fixture.model, fixture.judge]).toEqual([first.model, first.judge]);
  });

  it('≥30 unique questions over ≥6 passages, every one a question or a selection', () => {
    expect(fixture.questions.length).toBeGreaterThanOrEqual(30);
    expect(new Set(fixture.questions.map(q => q.id)).size).toBe(fixture.questions.length);
    expect(new Set(fixture.questions.map(q => q.pack)).size).toBeGreaterThanOrEqual(6);
    for (const q of fixture.questions) expect(textOf(q).trim()).not.toBe('');
  });

  it('mixes passage, thematic and selection questions, in Chinese and English', () => {
    expect(new Set(fixture.questions.map(q => q.kind))).toEqual(new Set(['passage', 'thematic', 'selection']));
    expect(fixture.questions.filter(q => q.kind === 'thematic').length).toBeGreaterThanOrEqual(10);
    const zh = fixture.questions.filter(q => HAN.test(textOf(q))).length;
    expect(zh).toBeGreaterThanOrEqual(10);
    expect(fixture.questions.length - zh).toBeGreaterThanOrEqual(10);
  });

  it('every pack exists: a committed file, or a bundled 和合本 + BSB chapter holding the selection', () => {
    const packs = new Map(fixture.packs.map(p => [p.id, p]));
    for (const p of fixture.packs) {
      if (p.file) expect(existsSync(path.join(ROOT, p.file))).toBe(true);
      else for (const t of ['cuv', 'bsb']) expect(existsSync(path.join(ROOT, `public/bible-data/${t}/${p.bookId}/${p.chapter}.json`))).toBe(true);
    }
    for (const q of fixture.questions) {
      const p = packs.get(q.pack);
      expect(p, q.id).toBeDefined();
      if (!q.selection || p!.file) continue;
      const cuv = JSON.parse(readFileSync(path.join(ROOT, `public/bible-data/cuv/${p!.bookId}/${p!.chapter}.json`), 'utf-8')) as { verses: Array<{ verse: number; text: string }> };
      expect(cuv.verses.find(v => v.verse === q.verse)?.text, q.id).toContain(q.selection);
    }
  });
});

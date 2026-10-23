/**
 * sampleTeaching — the public Matthew 6 sample's teaching corrections
 * (2026-10 review, items 3–4 and the historical-claim polish item), pinned on
 * the committed pack JSON. Quoted Scripture must not change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseStudyPack, buildSlides } from '../packTypes';
import { TEST_PACK_PATH, REQUEST_HASH_PACK_PATH } from './fixtures';

const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const before = parseStudyPack(JSON.parse(readFileSync(REQUEST_HASH_PACK_PATH, 'utf-8')));
const section = (kind: string) => pack.sections.find(s => s.kind === kind)!;
const all = JSON.stringify(pack);
const halves = (line: string) => {
  const at = line.indexOf(' · ');
  return { zh: line.slice(0, at), en: line.slice(at + 3) };
};

describe('Matthew 6 sample — teaching precision', () => {
  it('quoted Scripture is unchanged (verses and key phrase)', () => {
    expect(section('scripture').verses).toEqual(before.sections.find(s => s.kind === 'scripture')!.verses);
    expect(section('scripture').keyPhrase).toBe(before.sections.find(s => s.kind === 'scripture')!.keyPhrase);
  });

  it('no blanket spiritual cause of anxiety, and no "only"', () => {
    expect(all).not.toMatch(/results from serving the wrong master/);
    expect(all).not.toMatch(/来自事奉了错误的主/);
    const questions = section('discussion').questions!;
    expect(questions.join('\n')).not.toMatch(/\bonly\b/i);
    expect(questions.join('\n')).not.toMatch(/只有/);
    expect(all).not.toMatch(/the cause, immediately before/);
  });

  it('distinguishes spiritual application from clinical claims, in both languages', () => {
    const line = section('context').body!.find(l => /clinical|diagnosis/.test(l))!;
    expect(line).toBeDefined();
    const { zh, en } = halves(line);
    expect(en).toMatch(/not all anxiety means serving the wrong master/);
    expect(en).toMatch(/doctor|counselor/);
    expect(zh).toMatch(/不是诊断/);
    expect(zh).toMatch(/医生或辅导/);
  });

  it('cross-reference runs through Luke 12:32 ("little flock") in both languages', () => {
    const luke = section('crossRefs').body![0];
    expect(luke).toContain('路加福音 12:22–32');
    expect(luke).toContain('Luke 12:22–32');
    expect(luke).not.toContain('12:22–31');
    // The quoted words match the bundled CUV Luke 12:32.
    const cuv = JSON.parse(readFileSync(path.resolve(__dirname, '../../../public/bible-data/cuv/LUK/12.json'), 'utf8'));
    const v32 = cuv.verses.find((v: { verse: number }) => v.verse === 32).text as string;
    expect(v32).toContain('你们这小群，不要惧怕');
    expect(luke).toContain('「你们这小群，不要惧怕」');
  });

  it('qualifies the Greek-word imagery and the present-tense inference', () => {
    const body = section('originalLanguage').body!.join('\n');
    expect(body).toMatch(/debated etymology/);
    expect(body).toMatch(/illustration, not a definition/);
    expect(body).toMatch(/有争议的词源/);
    expect(body).not.toMatch(/Present tense: “stop being anxious” — a habit to break/);
    expect(body).toMatch(/Tense alone cannot settle it/);
    expect(body).toMatch(/vv\.31 and 34 are aorist/);
    expect(body).toMatch(/单凭时态定不了/);
    expect(body).toMatch(/same verb/);
  });

  it('the tense claim matches the bundled Greek: v.25 present imperative, vv.31/34 aorist subjunctive', () => {
    const orig = JSON.parse(readFileSync(path.resolve(__dirname, '../../../public/bible-data/orig/MAT/6.json'), 'utf8'));
    const morph = (v: number) => (orig[String(v)] as string[]).filter(w => w.includes('|G3309|')).map(w => w.split('|')[3]);
    expect(morph(25)).toEqual(['V-PAM-2P']);
    expect(morph(31)).toEqual(['V-AAS-2P']);
    expect(morph(34)[0]).toBe('V-AAS-2P');
  });

  it('observation questions come before interpretation and application', () => {
    const q = section('discussion').questions!;
    expect(q[0]).toMatch(/List them before interpreting/);
    expect(q[0]).toMatch(/先列出来，暂不解释/);
    expect(q[1]).toMatch(/point back to/);
    const interpretAt = q.findIndex(x => /How do the two connect/.test(x));
    const applyAt = q.findIndex(x => /show up in your week/.test(x));
    expect(interpretAt).toBeGreaterThan(1);
    expect(applyAt).toBeGreaterThan(interpretAt);
    expect(q[interpretAt]).toMatch(/without assuming every worry comes from misplaced loyalty/);
  });

  it('drops the unsourced "subsistence farmers" generalization; grounds needs in the text (v.32)', () => {
    expect(all).not.toMatch(/subsistence/);
    expect(all).not.toMatch(/务农糊口/);
    const line = section('context').body!.find(l => l.includes('v.32'))!;
    expect(line).toMatch(/your heavenly Father knows/);
    expect(line).toMatch(/你们的天父是知道的/);
  });

  it('every bilingual line keeps both halves', () => {
    for (const s of pack.sections) {
      for (const line of [...(s.body ?? []), ...(s.questions ?? [])]) {
        const { zh, en } = halves(line);
        expect(zh.length, line).toBeGreaterThan(0);
        expect(en.length, line).toBeGreaterThan(0);
      }
    }
  });

  it('the sample is undated on its slides and uses 报名 for sign-up', () => {
    const title = section('title').body!.join(' ');
    expect(title).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(title).toMatch(/Sample study pack/);
    expect(section('qr').heading).toBe('报名 Sign up');
    expect(all).not.toContain('签到');
    expect(buildSlides(pack).length).toBe(26);
  });
});

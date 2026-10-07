/**
 * guidePdf.test.ts — a study-guide PDF → its text, with the real pdfjs · 讲义 PDF 读取 (ADR-0019 §1)
 *
 * Runs pdfjs's Node build on the committed fixture (synthetic content written
 * for these tests, < 50 KB): Chinese title, intro, outline and questions come
 * out as written, page order kept. Generated PDFs cover the other paths: an
 * image-only page (a scan) → GD_ERR_NO_TEXT; 41 pages → the page cap; too
 * much text → the character cap; a big file or a non-PDF → refused before
 * pdfjs runs; broken bytes → GD_ERR_UNREADABLE. The committed fixture equals
 * the writer's output (UPDATE_GUIDE_FIXTURE=1 rewrites it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  readGuidePdf, pageText, cleanGuideText, GuideFile, PdfDocLike, GUIDE_MAX_BYTES, GUIDE_MAX_PAGES, GUIDE_MAX_CHARS,
  GUIDE_MAX_MB,
} from '../guidePdf';
import {
  GD_ERR_NO_TEXT, GD_ERR_TOO_MANY_PAGES, GD_ERR_TOO_MUCH_TEXT, GD_ERR_TOO_BIG, GD_ERR_NOT_PDF, GD_ERR_UNREADABLE,
} from '../guideStrings';
import { writePdf } from './pdfWriter';
import { GUIDE_PAGES, GUIDE_FIXTURE_FILE, GUIDE_TITLE, GUIDE_INTRO, GUIDE_OUTLINE, GUIDE_QUESTIONS } from './guideFixture';

pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href;
const CMAPS = `${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/cmaps/`;

const openNode = async (data: Uint8Array) =>
  (await pdfjs.getDocument({ data, cMapUrl: CMAPS, cMapPacked: true, verbosity: 0 }).promise) as unknown as PdfDocLike;

const FIXTURE = path.join(__dirname, 'fixtures', GUIDE_FIXTURE_FILE);

function fileOf(bytes: Uint8Array, name = 'guide.pdf', type = 'application/pdf'): GuideFile {
  return { name, size: bytes.length, type, arrayBuffer: async () => bytes.slice().buffer };
}

describe('the committed fixture', () => {
  it('is the writer\'s output for GUIDE_PAGES, and small', () => {
    const fresh = writePdf(GUIDE_PAGES);
    if (process.env.UPDATE_GUIDE_FIXTURE === '1') writeFileSync(FIXTURE, fresh);
    const committed = readFileSync(FIXTURE);
    expect(Buffer.from(fresh).equals(committed)).toBe(true);
    expect(committed.length).toBeLessThan(50 * 1024);
  });

  it('pdfjs reads the guide as written: title, intro, outline, numbered questions, in page order', async () => {
    const guide = await readGuidePdf(fileOf(new Uint8Array(readFileSync(FIXTURE)), GUIDE_FIXTURE_FILE), openNode);
    expect(guide.name).toBe(GUIDE_FIXTURE_FILE);
    expect(guide.pages).toBe(2);
    const lines = guide.text.split('\n');
    for (const line of [GUIDE_TITLE, GUIDE_INTRO, ...GUIDE_OUTLINE]) expect(lines).toContain(line);
    GUIDE_QUESTIONS.forEach((q, i) => expect(lines).toContain(`${i + 1}. ${q}`));
    expect(guide.text.indexOf(GUIDE_OUTLINE[2])).toBeLessThan(guide.text.indexOf(GUIDE_QUESTIONS[0]));
  });
});

describe('refusals', () => {
  it('a scan (image-only page, no text layer) → no readable text', async () => {
    await expect(readGuidePdf(fileOf(writePdf([[]])), openNode)).rejects.toThrow(GD_ERR_NO_TEXT);
  });

  it(`more than ${GUIDE_MAX_PAGES} pages → the page cap`, async () => {
    const pages = Array.from({ length: GUIDE_MAX_PAGES + 1 }, (_, i) => [`第${i + 1}页 讨论`]);
    await expect(readGuidePdf(fileOf(writePdf(pages)), openNode))
      .rejects.toThrow(GD_ERR_TOO_MANY_PAGES.replace(/\{n\}/g, String(GUIDE_MAX_PAGES)));
  });

  it(`more than ${GUIDE_MAX_CHARS} characters → the text cap (never a silent cut)`, async () => {
    // 30 characters fit the line (pdfjs drops glyphs outside the page); 35 pages × 32 lines × 30 > the cap.
    const line = '我们一起读经，一起讨论，一起祷告。'.repeat(2).slice(0, 30);
    const pages = Array.from({ length: 35 }, () => Array.from({ length: 32 }, () => line));
    await expect(readGuidePdf(fileOf(writePdf(pages)), openNode))
      .rejects.toThrow(GD_ERR_TOO_MUCH_TEXT.replace(/\{n\}/g, String(GUIDE_MAX_CHARS)));
  });

  it(`over ${GUIDE_MAX_MB} MB → refused before pdfjs runs`, async () => {
    const opened: string[] = [];
    const big: GuideFile = { name: 'big.pdf', size: GUIDE_MAX_BYTES + 1, type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(0) };
    await expect(readGuidePdf(big, async () => { opened.push('x'); throw new Error('unreachable'); }))
      .rejects.toThrow(GD_ERR_TOO_BIG.replace(/\{n\}/g, String(GUIDE_MAX_MB)));
    expect(opened).toEqual([]);
  });

  it('not a PDF → refused', async () => {
    await expect(readGuidePdf(fileOf(new Uint8Array([1]), 'notes.docx', 'application/msword'), openNode)).rejects.toThrow(GD_ERR_NOT_PDF);
  });

  it('broken bytes → unreadable, with pdfjs\'s reason attached', async () => {
    await expect(readGuidePdf(fileOf(new TextEncoder().encode('%PDF-1.7 not really')), openNode))
      .rejects.toThrow(new RegExp(`^${GD_ERR_UNREADABLE.replace(/[()]/g, '\\$&')}: .+`));
  });
});

describe('text assembly', () => {
  it('breaks lines on hasEOL and on a baseline change; marked-content items are skipped', () => {
    const items = [
      { str: '讨论', transform: [1, 0, 0, 1, 0, 700] }, { str: '问题', transform: [1, 0, 0, 1, 30, 700], hasEOL: true },
      { type: 'beginMarkedContent' },
      { str: '1. 第一题', transform: [1, 0, 0, 1, 0, 676] }, { str: '2. 第二题', transform: [1, 0, 0, 1, 0, 652] },
    ];
    expect(pageText(items)).toBe('讨论问题\n1. 第一题\n2. 第二题');
  });

  it('Kangxi radicals become ordinary ideographs; punctuation is kept; blank runs collapse', () => {
    expect(cleanGuideText('⼈们⼝里  \n\n\n\n“神的⼉⼦”？')).toBe('人们口里\n\n“神的儿子”？');
  });
});

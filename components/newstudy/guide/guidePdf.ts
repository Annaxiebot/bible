/**
 * guidePdf.ts — a study-guide PDF → its text, in the browser · 读取讲义 PDF (ADR-0019 §1)
 *
 * The PDF never leaves the device: pdfjs (lazy chunk, pdfjsLoader.ts) reads
 * it here and only the extracted text goes on to the AI. Caps — size, pages,
 * characters — are bilingual errors, never a silent cut. A PDF with no text
 * layer (a scan) is GD_ERR_NO_TEXT; there is no OCR. The opener is a
 * parameter so tests run the real pdfjs (Node build) on a committed fixture.
 */
import {
  GD_ERR_NOT_PDF, GD_ERR_TOO_BIG, GD_ERR_TOO_MANY_PAGES, GD_ERR_TOO_MUCH_TEXT, GD_ERR_NO_TEXT,
  GD_ERR_PASSWORD, GD_ERR_UNREADABLE,
} from './guideStrings';

export const GUIDE_MAX_MB = 15;
export const GUIDE_MAX_BYTES = GUIDE_MAX_MB * 1024 * 1024;
export const GUIDE_MAX_PAGES = 40;
/** Extracted characters sent to the AI at most (ADR-0019: fits the proxy's message cap with the passage and one continuation). */
export const GUIDE_MAX_CHARS = 30_000;
/** Fewer readable characters than this → no text layer (a scan, or images only). */
export const GUIDE_MIN_CHARS = 20;

/** What pdfjs gives us, as far as this module needs it. */
export interface PdfPageLike { getTextContent(): Promise<{ items: readonly unknown[] }> }
export interface PdfDocLike { numPages: number; getPage(n: number): Promise<PdfPageLike>; destroy(): Promise<void> }
export type PdfOpener = (data: Uint8Array) => Promise<PdfDocLike>;

/** The guide as the rest of the path uses it. */
export interface GuideText { name: string; pages: number; text: string }

/** The file input's File, as far as this module needs it. */
export interface GuideFile { name: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> }

interface TextItem { str: string; hasEOL?: boolean; transform?: number[] }

function isTextItem(item: unknown): item is TextItem {
  return typeof item === 'object' && item !== null && typeof (item as TextItem).str === 'string';
}

/** A line break between items when pdfjs says so (hasEOL) or the baseline moves. */
export function pageText(items: readonly unknown[]): string {
  let out = '';
  let lastY: number | null = null;
  for (const item of items) {
    if (!isTextItem(item)) continue; // marked-content markers carry no text
    const y = item.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 1 && !out.endsWith('\n')) out += '\n';
    out += item.str;
    if (item.hasEOL) out += '\n';
    if (y !== undefined) lastY = y;
  }
  return out;
}

/** Kangxi radicals (U+2F00–U+2FDF; Word/WPS exports use them for 人 口 心 …) → the ordinary ideographs. */
const KANGXI_RADICALS = /[⼀-⿟]/g;

/** Text clean-up before anything else sees it: radicals mapped, trailing spaces and runs of blank lines dropped. Punctuation is kept. */
export function cleanGuideText(text: string): string {
  return text
    .replace(KANGXI_RADICALS, ch => ch.normalize('NFKC'))
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fail(message: string, n?: number): Error {
  return new Error(n === undefined ? message : message.replace(/\{n\}/g, String(n)));
}

/** pdfjs exceptions by name → our bilingual messages (rethrown with context, R5). */
function openFailure(err: unknown): Error {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'PasswordException') return fail(GD_ERR_PASSWORD);
  const detail = err instanceof Error ? err.message : String(err);
  return new Error(`${GD_ERR_UNREADABLE}: ${detail}`);
}

function isPdf(file: GuideFile): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

async function extract(doc: PdfDocLike): Promise<string> {
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    pages.push(pageText((await page.getTextContent()).items));
  }
  return cleanGuideText(pages.join('\n\n'));
}

/** Read one guide. Throws a bilingual Error on every failure. */
export async function readGuidePdf(file: GuideFile, open: PdfOpener): Promise<GuideText> {
  if (!isPdf(file)) throw fail(GD_ERR_NOT_PDF);
  if (file.size > GUIDE_MAX_BYTES) throw fail(GD_ERR_TOO_BIG, GUIDE_MAX_MB);
  let doc: PdfDocLike;
  try {
    doc = await open(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    throw openFailure(err);
  }
  try {
    if (doc.numPages > GUIDE_MAX_PAGES) throw fail(GD_ERR_TOO_MANY_PAGES, GUIDE_MAX_PAGES);
    const text = await extract(doc);
    if (text.replace(/\s/g, '').length < GUIDE_MIN_CHARS) throw fail(GD_ERR_NO_TEXT);
    if (text.length > GUIDE_MAX_CHARS) throw fail(GD_ERR_TOO_MUCH_TEXT, GUIDE_MAX_CHARS);
    return { name: file.name, pages: doc.numPages, text };
  } finally {
    await doc.destroy();
  }
}

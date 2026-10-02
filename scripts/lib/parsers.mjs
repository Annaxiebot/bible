/**
 * parsers.mjs — parse the two bulk Bible sources into a common shape:
 *   Map<bookId, Map<chapterNumber, Map<verseNumber, text>>>
 *
 * Sources:
 *  - BSB: https://bereanbible.com/bsb.txt (tab-separated "Book C:V<TAB>text")
 *  - CUV: open-bibles chi-cuv.usfx.xml (USFX; the same corpus bible-api.com
 *    serves for translation=cuv)
 */

/** The public-domain dedication bsb.txt must carry; verified before parsing. */
export const BSB_PD_STATEMENT =
  "This text of God's Word has been dedicated to the public domain.";

const BSB_LINE_RE = /^(.*?) (\d+):(\d+)\t(.*)$/;

function ensureChapter(data, bookId, chapter) {
  if (!data.has(bookId)) data.set(bookId, new Map());
  const book = data.get(bookId);
  if (!book.has(chapter)) book.set(chapter, new Map());
  return book.get(chapter);
}

/**
 * Parse bsb.txt. Verses with empty text (the 16 verses BSB relegates to
 * footnotes) are collected separately, not silently dropped.
 *
 * @param {string} raw file contents
 * @param {Map<string, string>} nameToId English book name → book id
 * @returns {{ data: Map, blanks: Array<{bookId: string, chapter: number, verse: number}> }}
 */
export function parseBsb(raw, nameToId) {
  const lines = raw.replace(/^﻿/, '').split(/\r?\n/);
  if (!lines.some(l => l.includes(BSB_PD_STATEMENT))) {
    throw new Error(
      'bsb.txt is missing the expected public-domain dedication statement — ' +
      'refusing to bundle. Check the download and the license at bereanbible.com.'
    );
  }
  const headerIdx = lines.findIndex(l => l.startsWith('Verse\t'));
  if (headerIdx === -1) throw new Error('bsb.txt: "Verse<TAB>..." header row not found');

  const data = new Map();
  const blanks = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const m = BSB_LINE_RE.exec(line);
    if (!m) throw new Error(`bsb.txt: unparseable verse line: ${line.slice(0, 80)}`);
    const bookId = nameToId.get(m[1]);
    if (!bookId) throw new Error(`bsb.txt: unknown book name: ${m[1]}`);
    const chapter = Number(m[2]);
    const verse = Number(m[3]);
    const text = m[4].trim();
    if (!text) {
      blanks.push({ bookId, chapter, verse });
      continue;
    }
    ensureChapter(data, bookId, chapter).set(verse, text);
  }
  return { data, blanks };
}

const USFX_BOOK_RE = /<book id="([A-Z0-9]{3})">([\s\S]*?)<\/book>/g;
const USFX_VERSE_RE = /<v id="(\d+)"\s*\/>([\s\S]*?)<ve\s*\/>/g;

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parse a USFX file whose only markup is book/h/c/v/ve (true of the
 * open-bibles CUV file). Throws if any other element sneaks into verse text.
 *
 * @param {string} xml file contents
 * @returns {Map} data map (see module doc)
 */
export function parseUsfx(xml) {
  const data = new Map();
  for (const bookMatch of xml.matchAll(USFX_BOOK_RE)) {
    const [, bookId, body] = bookMatch;
    const chapterParts = body.split(/<c id="(\d+)"\s*\/>/);
    for (let i = 1; i < chapterParts.length; i += 2) {
      const chapter = Number(chapterParts[i]);
      const chapterMap = ensureChapter(data, bookId, chapter);
      for (const verseMatch of chapterParts[i + 1].matchAll(USFX_VERSE_RE)) {
        const verse = Number(verseMatch[1]);
        const text = decodeXmlEntities(verseMatch[2]).trim();
        if (/<[a-z]/i.test(text)) {
          throw new Error(
            `USFX ${bookId} ${chapter}:${verse} has unexpected inline markup: ` +
            text.slice(0, 80)
          );
        }
        chapterMap.set(verse, text);
      }
    }
  }
  return data;
}

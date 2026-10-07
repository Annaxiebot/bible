/**
 * fetch-bible-data.mjs — download, convert, verify and bundle Bible text.
 *
 * Produces public/bible-data/<translation>/<bookId>/<chapter>.json in the
 * same shape bible-api.com returns (and services/bibleStorage.ts stores),
 * so the app can serve chapters statically instead of hitting the API.
 *
 * Translations:
 *   bsb — Berean Standard Bible, from https://bereanbible.com/bsb.txt
 *         (the file itself carries the public-domain dedication; parsing
 *         fails if the statement is missing).
 *   cuv — Chinese Union Version, from the open-bibles chi-cuv.usfx.xml
 *         (public domain; the same corpus bible-api.com serves). The
 *         Traditional source text is converted to Simplified with opencc-js,
 *         the same mapping the app uses at display time.
 *
 * Usage: node scripts/fetch-bible-data.mjs [--force-download]
 * Any structural problem (missing book/chapter/verse, empty text, count out
 * of range) throws and exits non-zero — no vacuous success.
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';
import { loadBooks, englishNameToId } from './lib/books.mjs';
import { parseBsb, parseUsfx } from './lib/parsers.mjs';
import { verifyTranslation, BSB_OMITTED_VERSES } from './lib/verify.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = path.join(REPO_ROOT, 'public', 'bible-data');
const CACHE_DIR = path.join(os.tmpdir(), 'bible-app-fetch-cache');
const FORCE = process.argv.includes('--force-download');

const SOURCES = {
  bsb: { url: 'https://bereanbible.com/bsb.txt', file: 'bsb.txt' },
  cuv: {
    url: 'https://raw.githubusercontent.com/seven1m/open-bibles/master/chi-cuv.usfx.xml',
    file: 'chi-cuv.usfx.xml',
  },
};

/** Expected whole-Bible verse totals (Protestant canon is 31,102 in KJV-style versification). */
const VERSE_RANGE = { min: 31000, max: 31200 };

const TRANSLATION_META = {
  bsb: { name: 'Berean Standard Bible', note: 'Public Domain' },
  cuv: { name: 'Chinese Union Version', note: 'Public Domain' },
};

async function download(source) {
  await mkdir(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, source.file);
  if (!FORCE && existsSync(cached)) {
    process.stdout.write(`using cached ${source.file} (${cached})\n`);
    return readFile(cached, 'utf-8');
  }
  process.stdout.write(`downloading ${source.url}\n`);
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`Download failed: ${source.url} → HTTP ${res.status}`);
  const text = await res.text();
  if (text.length < 1_000_000) {
    throw new Error(`Download suspiciously small (${text.length} bytes): ${source.url}`);
  }
  await writeFile(cached, text, 'utf-8');
  return text;
}

/** Convert every CUV verse from Traditional to Simplified Chinese. */
function toSimplifiedData(data) {
  const convert = OpenCC.Converter({ from: 'tw', to: 'cn' });
  const out = new Map();
  for (const [bookId, bookData] of data) {
    const bookOut = new Map();
    for (const [ch, chap] of bookData) {
      const chapOut = new Map();
      for (const [v, text] of chap) chapOut.set(v, convert(text));
      bookOut.set(ch, chapOut);
    }
    out.set(bookId, bookOut);
  }
  return out;
}

/** Write one translation as per-chapter JSON files; returns the file count. */
async function writeChapters(translationId, data, books) {
  const meta = TRANSLATION_META[translationId];
  let files = 0;
  for (const book of books) {
    const bookName = translationId === 'cuv' ? book.nameZh : book.nameEn;
    const dir = path.join(OUT_ROOT, translationId, book.id);
    await mkdir(dir, { recursive: true });
    for (const [ch, chap] of data.get(book.id)) {
      const verses = [...chap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([verse, text]) => ({
          book_id: book.id, book_name: bookName, chapter: ch, verse, text,
        }));
      const payload = {
        reference: `${bookName} ${ch}`,
        verses,
        text: verses.map(v => v.text).join('\n'),
        translation_id: translationId,
        translation_name: meta.name,
        translation_note: meta.note,
      };
      await writeFile(path.join(dir, `${ch}.json`), JSON.stringify(payload), 'utf-8');
      files++;
    }
  }
  return files;
}

async function main() {
  const books = await loadBooks();
  const nameToId = englishNameToId(books);

  const [bsbRaw, cuvRaw] = await Promise.all([
    download(SOURCES.bsb),
    download(SOURCES.cuv),
  ]);

  const { data: bsbData, blanks } = parseBsb(bsbRaw, nameToId);
  const unexpectedBlanks = blanks.filter(
    b => !BSB_OMITTED_VERSES.has(`${b.bookId} ${b.chapter}:${b.verse}`)
  );
  if (unexpectedBlanks.length > 0 || blanks.length !== BSB_OMITTED_VERSES.size) {
    throw new Error(
      `BSB blank-verse set changed: got ${blanks.length} blanks ` +
      `(${unexpectedBlanks.length} not on the known-omitted list). Review verify.mjs.`
    );
  }

  process.stdout.write('converting CUV Traditional → Simplified (opencc-js tw→cn)…\n');
  const cuvData = toSimplifiedData(parseUsfx(cuvRaw));

  const bsbStats = verifyTranslation('bsb', bsbData, books, VERSE_RANGE);
  const cuvStats = verifyTranslation('cuv', cuvData, books, VERSE_RANGE);

  // Clean rebuild so stale chapters from earlier runs can't linger — only
  // the translation folders: public/bible-data/xref/ (build-cross-refs.mjs) stays.
  for (const id of Object.keys(SOURCES)) await rm(path.join(OUT_ROOT, id), { recursive: true, force: true });
  const bsbFiles = await writeChapters('bsb', bsbData, books);
  const cuvFiles = await writeChapters('cuv', cuvData, books);

  process.stdout.write(
    `\nOK bsb: ${bsbStats.books} books, ${bsbStats.chapters} chapters, ` +
    `${bsbStats.verses} verses (${blanks.length} known footnote-omitted), ${bsbFiles} files\n` +
    `OK cuv: ${cuvStats.books} books, ${cuvStats.chapters} chapters, ` +
    `${cuvStats.verses} verses (simplified), ${cuvFiles} files\n` +
    `output: ${OUT_ROOT}\n`
  );
}

await main();

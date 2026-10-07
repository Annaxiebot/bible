/**
 * build-original-words.mjs — STEPBible tagged Greek/Hebrew + brief lexicons → static files (ADR-0018)
 *
 * Downloads, from STEPBible-Data at a pinned commit (CC BY 4.0 — credited in
 * NOTICE, README and on the Ask AI panel), into a temp dir (never committed):
 *   TAGNT (Greek NT, 2 files), TAHOT (Hebrew OT, 4 files), TBESG + TBESH (brief lexicons).
 * Parses them (scripts/lib/stepWords.mjs, scripts/lib/stepLexicon.mjs) and writes
 *   public/bible-data/orig/<BOOK>/<chapter>.json   { "<verse>": [[original, translit, strong, morph, gloss], …] }
 *   public/bible-data/orig/lexicon-greek.json       { "G2889": [lemma, translit, brief], … }
 *   public/bible-data/orig/lexicon-hebrew.json      { "H3374": … }
 * for EVERY chapter of the app's book table, so a missing file at run time
 * is always a failed load (R5/R14). Reports verse coverage against the
 * bundled BSB and the total size; fails loudly on an unknown book, a
 * malformed word line, a chapter outside the book table, or a size over budget.
 *
 * Usage: node scripts/build-original-words.mjs [--force-download]
 */
import { mkdir, writeFile, rm, stat, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBooks } from './lib/books.mjs';
import { stepToAppIds, addWords, usedStrongIds } from './lib/stepWords.mjs';
import { buildLexicon } from './lib/stepLexicon.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO_ROOT, 'public', 'bible-data', 'orig');
const BSB_DIR = path.join(REPO_ROOT, 'public', 'bible-data', 'bsb');
/** STEPBible-Data commit of 2026-10-05; bump deliberately and rebuild. */
const SOURCE_COMMIT = '1f3423d42400f59f1f30fe08f74e38fcd3bbf7bc';
const SOURCE_BASE = `https://raw.githubusercontent.com/STEPBible/STEPBible-Data/${SOURCE_COMMIT}`;
const AMALGAMATED = 'Translators Amalgamated OT+NT';
const SOURCES = {
  greek: [
    `${AMALGAMATED}/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt`,
    `${AMALGAMATED}/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt`,
  ],
  hebrew: [
    `${AMALGAMATED}/TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt`,
    `${AMALGAMATED}/TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt`,
    `${AMALGAMATED}/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt`,
    `${AMALGAMATED}/TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt`,
  ],
  lexicon: {
    greek: 'Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt',
    hebrew: 'Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt',
  },
};
const CACHE_DIR = path.join(os.tmpdir(), `bible-app-step-cache-${SOURCE_COMMIT.slice(0, 8)}`);
const FORCE = process.argv.includes('--force-download');
/** Each source file is several MB; anything far smaller is a broken download. */
const MIN_SOURCE_BYTES = 2_000_000;
/** ADR-0018 budget for everything under public/bible-data/orig/. */
const MAX_OUTPUT_BYTES = 22 * 1024 * 1024;

/** One source file's text (cached in the temp dir); checks size and the CC BY notice. */
async function source(relPath) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, path.basename(relPath));
  if (FORCE || !existsSync(file)) {
    const url = `${SOURCE_BASE}/${relPath.split('/').map(encodeURIComponent).join('/')}`;
    process.stdout.write(`downloading ${relPath}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${url} → HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  const text = readFileSync(file, 'utf-8');
  if (text.length < MIN_SOURCE_BYTES) throw new Error(`${relPath} suspiciously small (${text.length} chars)`);
  if (!/CC BY/.test(text.slice(0, 3000))) throw new Error(`${relPath} lost its CC BY notice — check the licence before shipping`);
  return text;
}

async function readWords(stepMap) {
  const chapters = new Map();
  const totals = { greek: { words: 0, dropped: 0 }, hebrew: { words: 0, dropped: 0 } };
  for (const kind of ['greek', 'hebrew']) {
    for (const rel of SOURCES[kind]) {
      const s = addWords(await source(rel), kind, stepMap, chapters);
      totals[kind].words += s.words;
      totals[kind].dropped += s.dropped;
    }
  }
  return { chapters, totals };
}

/** Verses the bundled BSB has with no words, and word verses the BSB lacks (versification differences). */
function coverage(books, chapters) {
  const noWords = [];
  const notInBsb = [];
  for (const book of books) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      const bsb = new Set(JSON.parse(readFileSync(path.join(BSB_DIR, book.id, `${ch}.json`), 'utf-8')).verses.map(v => String(v.verse)));
      const words = chapters.get(`${book.id}/${ch}`) ?? {};
      for (const v of bsb) if (!words[v]) noWords.push(`${book.id}.${ch}.${v}`);
      for (const v of Object.keys(words)) if (!bsb.has(v)) notInBsb.push(`${book.id}.${ch}.${v}`);
    }
  }
  return { noWords, notInBsb };
}

async function writeAll(books, chapters, lexicons) {
  await rm(OUT_DIR, { recursive: true, force: true });
  let files = 0;
  for (const book of books) {
    await mkdir(path.join(OUT_DIR, book.id), { recursive: true });
    for (let ch = 1; ch <= book.chapters; ch++) {
      await writeFile(path.join(OUT_DIR, book.id, `${ch}.json`), JSON.stringify(chapters.get(`${book.id}/${ch}`) ?? {}), 'utf-8');
      files++;
    }
  }
  const unplaced = [...chapters.keys()].filter(k => {
    const [id, ch] = k.split('/');
    return Number(ch) > (books.find(b => b.id === id)?.chapters ?? 0);
  });
  if (unplaced.length) throw new Error(`Words from chapters the book table lacks: ${unplaced.join(', ')}`);
  for (const [language, { lexicon }] of Object.entries(lexicons)) {
    await writeFile(path.join(OUT_DIR, `lexicon-${language}.json`), JSON.stringify(lexicon), 'utf-8');
  }
  return files;
}

async function totalBytes(dir) {
  let sum = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    sum += entry.isDirectory() ? await totalBytes(full) : (await stat(full)).size;
  }
  return sum;
}

const mb = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function main() {
  const books = await loadBooks();
  const { chapters, totals } = await readWords(stepToAppIds(books));
  const ids = usedStrongIds(chapters);
  const lexicons = {};
  for (const language of ['greek', 'hebrew']) {
    const prefix = language === 'greek' ? 'G' : 'H';
    lexicons[language] = buildLexicon(await source(SOURCES.lexicon[language]), language, [...ids].filter(id => id.startsWith(prefix)));
  }
  const files = await writeAll(books, chapters, lexicons);
  const { noWords, notInBsb } = coverage(books, chapters);
  const bytes = await totalBytes(OUT_DIR);
  const lexBytes = (await stat(path.join(OUT_DIR, 'lexicon-greek.json'))).size + (await stat(path.join(OUT_DIR, 'lexicon-hebrew.json'))).size;
  process.stdout.write(
    `OK Greek ${totals.greek.words} words (${totals.greek.dropped} non-NA dropped), Hebrew ${totals.hebrew.words} words; ` +
    `${files} chapter files; lexicon entries: Greek ${Object.keys(lexicons.greek.lexicon).length}, Hebrew ${Object.keys(lexicons.hebrew.lexicon).length}\n` +
    `ids with no lexicon entry: ${[...lexicons.greek.missing, ...lexicons.hebrew.missing].join(', ') || 'none'}\n` +
    `BSB verses with no words: ${noWords.length} ${noWords.slice(0, 20).join(' ')}\n` +
    `word verses not in BSB: ${notInBsb.length} ${notInBsb.slice(0, 20).join(' ')}\n` +
    `size: ${mb(bytes)} total (lexicons ${mb(lexBytes)})\noutput: ${OUT_DIR}\n`
  );
  if (bytes > MAX_OUTPUT_BYTES) throw new Error(`Output ${bytes} bytes exceeds ${MAX_OUTPUT_BYTES}: shorten the word fields (ADR-0018)`);
}

await main();

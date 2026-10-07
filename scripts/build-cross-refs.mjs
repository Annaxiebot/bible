/**
 * build-cross-refs.mjs — OpenBible.info cross-references → static chapter files (ADR-0015 §2)
 *
 * Downloads https://a.openbible.info/data/cross-references.zip (CC BY —
 * credited in NOTICE, README and on the Ask AI panel) into a temp dir (never
 * committed), keeps each verse's top XREF_PER_VERSE links with votes ≥
 * XREF_MIN_VOTES (scripts/lib/crossRefs.mjs), and writes
 *   public/bible-data/xref/<BOOK>/<chapter>.json
 * for EVERY chapter of the app's book table — `{}` when a chapter has no
 * links — so a missing file at run time always means a failed load, never
 * "no related verses" (R5/R14). Same book folders and chapter file names as
 * public/bible-data/cuv/.
 *
 * File shape: { "<verse>": [["HEB.5.14", 42], ["HEB.5.12-14", 7], …], … }
 *
 * Usage: node scripts/build-cross-refs.mjs [--force-download]
 * Needs the `unzip` command and the bundled BSB chapters (cross-chapter
 * ranges are cut at the start chapter's last verse). Fails loudly on any
 * unknown book or malformed line — no vacuous success.
 */
import { mkdir, writeFile, rm, stat, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBooks } from './lib/books.mjs';
import { osisToAppIds, buildChapters, XREF_MIN_VOTES, XREF_PER_VERSE } from './lib/crossRefs.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO_ROOT, 'public', 'bible-data', 'xref');
const BSB_DIR = path.join(REPO_ROOT, 'public', 'bible-data', 'bsb');
const SOURCE_URL = 'https://a.openbible.info/data/cross-references.zip';
const SOURCE_ENTRY = 'cross_references.txt';
const CACHE_DIR = path.join(os.tmpdir(), 'bible-app-xref-cache');
const FORCE = process.argv.includes('--force-download');
/** The unzipped list is ~8 MB; anything far smaller is a broken download. */
const MIN_SOURCE_BYTES = 5_000_000;
/** ADR-0015: "a few MB in total". Above this, tighten the two limits and rebuild. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

async function downloadList() {
  await mkdir(CACHE_DIR, { recursive: true });
  const zip = path.join(CACHE_DIR, 'cross-references.zip');
  if (FORCE || !existsSync(zip)) {
    process.stdout.write(`downloading ${SOURCE_URL}\n`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Download failed: ${SOURCE_URL} → HTTP ${res.status}`);
    await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  } else {
    process.stdout.write(`using cached ${zip}\n`);
  }
  const text = execFileSync('unzip', ['-p', zip, SOURCE_ENTRY], { maxBuffer: 64 * 1024 * 1024 }).toString('utf-8');
  if (text.length < MIN_SOURCE_BYTES) throw new Error(`${SOURCE_ENTRY} suspiciously small (${text.length} bytes)`);
  if (!/CC-BY/.test(text.slice(0, 200))) throw new Error(`${SOURCE_ENTRY} header lost its CC-BY notice — check the licence before shipping`);
  return text;
}

/** A chapter's last verse number, from the bundled BSB file (cached). */
function lastVerseReader() {
  const cache = new Map();
  return (book, chapter) => {
    const key = `${book}/${chapter}`;
    if (!cache.has(key)) {
      const data = JSON.parse(readFileSync(path.join(BSB_DIR, book, `${chapter}.json`), 'utf-8'));
      cache.set(key, Math.max(...data.verses.map(v => v.verse)));
    }
    return cache.get(key);
  };
}

async function writeAll(books, chapters) {
  await rm(OUT_DIR, { recursive: true, force: true });
  let files = 0;
  for (const book of books) {
    await mkdir(path.join(OUT_DIR, book.id), { recursive: true });
    for (let ch = 1; ch <= book.chapters; ch++) {
      const data = chapters.get(`${book.id}/${ch}`) ?? {};
      await writeFile(path.join(OUT_DIR, book.id, `${ch}.json`), JSON.stringify(data), 'utf-8');
      files++;
    }
  }
  const unplaced = [...chapters.keys()].filter(k => {
    const [id, ch] = k.split('/');
    return Number(ch) > (books.find(b => b.id === id)?.chapters ?? 0);
  });
  if (unplaced.length) throw new Error(`Links from chapters the book table lacks: ${unplaced.join(', ')}`);
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

async function main() {
  const books = await loadBooks();
  const text = await downloadList();
  const { chapters, stats } = buildChapters(text, osisToAppIds(books), lastVerseReader());
  const files = await writeAll(books, chapters);
  const bytes = await totalBytes(OUT_DIR);
  process.stdout.write(
    `OK ${stats.lines} links read, ${stats.dropped} below ${XREF_MIN_VOTES} vote(s) dropped, ` +
    `${stats.kept} kept (top ${XREF_PER_VERSE} per verse), ${files} chapter files, ` +
    `${(bytes / 1024 / 1024).toFixed(2)} MB\noutput: ${OUT_DIR}\n`
  );
  if (bytes > MAX_OUTPUT_BYTES) {
    throw new Error(`Output ${bytes} bytes exceeds ${MAX_OUTPUT_BYTES}: raise XREF_MIN_VOTES or lower XREF_PER_VERSE`);
  }
}

await main();

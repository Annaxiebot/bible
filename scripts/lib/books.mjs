/**
 * books.mjs — Bible book metadata for the data-fetch script.
 *
 * Reads the app's single source of truth (services/bibleBookData.ts) with a
 * structural regex rather than duplicating the 66-book table here (R3).
 * Fails loudly if the table cannot be parsed or is not exactly 66 books.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOK_DATA_TS = path.join(REPO_ROOT, 'services', 'bibleBookData.ts');

const ENTRY_RE =
  /\{\s*name:\s*'([^']+)',\s*id:\s*'([A-Z0-9]{3})',\s*chapters:\s*(\d+)(?:,\s*totalVerses:\s*(\d+))?\s*\}/g;

/**
 * BSB plain-text book names that differ from the app's English book names.
 * (bsb.txt says "Psalm"; the app and bible-api say "Psalms".)
 */
export const BSB_NAME_ALIASES = { Psalm: 'Psalms' };

/**
 * @returns {Promise<Array<{id: string, nameZh: string, nameEn: string,
 *   chapters: number, totalVerses?: number}>>}
 */
export async function loadBooks() {
  const source = await readFile(BOOK_DATA_TS, 'utf-8');
  const books = [];
  for (const m of source.matchAll(ENTRY_RE)) {
    const [, name, id, chapters, totalVerses] = m;
    const spaceIdx = name.indexOf(' ');
    books.push({
      id,
      nameZh: name.slice(0, spaceIdx),
      nameEn: name.slice(spaceIdx + 1),
      chapters: Number(chapters),
      ...(totalVerses ? { totalVerses: Number(totalVerses) } : {}),
    });
  }
  if (books.length !== 66) {
    throw new Error(
      `Parsed ${books.length} books from ${BOOK_DATA_TS}; expected 66. ` +
      'The BIBLE_BOOKS format may have changed — update books.mjs.'
    );
  }
  return books;
}

/** Map of English book name (as bsb.txt spells it) → book id. */
export function englishNameToId(books) {
  const map = new Map(books.map(b => [b.nameEn, b.id]));
  for (const [alias, canonical] of Object.entries(BSB_NAME_ALIASES)) {
    const id = map.get(canonical);
    if (!id) throw new Error(`BSB alias target not found in book list: ${canonical}`);
    map.set(alias, id);
  }
  return map;
}

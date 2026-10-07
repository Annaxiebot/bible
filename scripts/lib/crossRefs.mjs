/**
 * crossRefs.mjs — parse the OpenBible.info cross-reference list · 交叉经文数据 (ADR-0015 §1–2)
 *
 * Pure helpers for scripts/build-cross-refs.mjs (tested in
 * scripts/__tests__/crossRefs.test.ts on a small fixture).
 *
 * Source format (confirmed 2026-10-06, header "From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY …"):
 *   Gen.1.1<TAB>Isa.40.28<TAB>67
 *   Gen.1.1<TAB>John.1.1-John.1.3<TAB>379
 * OSIS-style ids; the target may be a range; votes may be zero or negative.
 *
 * Output target refs ("compact refs", read by components/studypack/relatedVerses.ts):
 *   "HEB.5.14"      one verse
 *   "HEB.5.12-14"   a range inside one chapter
 * A range that crosses into the next chapter or book (655 of ~345k links)
 * keeps only its start chapter's part, up to that chapter's last verse —
 * the explanation the model gives is about the start verse, and a compact
 * ref never spans two chapter files.
 */

/**
 * The 66 OSIS book ids in canonical (Protestant) order. Only the SOURCE's
 * spelling lives here; the app's ids come from services/bibleBookData.ts
 * (books.mjs loadBooks, same order) — R3, one book table. The pairing is
 * pinned by scripts/__tests__/crossRefs.test.ts against BIBLE_BOOKS.
 */
export const OSIS_BOOK_ORDER = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam',
  '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov',
  'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos',
  'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal',
  'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph',
  'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas',
  '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
];

/** Keep at most this many links per source verse (ADR-0015 §2, start value). */
export const XREF_PER_VERSE = 10;
/** Drop links with fewer votes (negative = readers judged the link wrong). */
export const XREF_MIN_VOTES = 1;

/** OSIS id → app book id, pairing OSIS_BOOK_ORDER with the app's table in order. */
export function osisToAppIds(books) {
  if (books.length !== OSIS_BOOK_ORDER.length) {
    throw new Error(`Book table has ${books.length} books; OSIS list has ${OSIS_BOOK_ORDER.length}`);
  }
  return new Map(OSIS_BOOK_ORDER.map((osis, i) => [osis, books[i].id]));
}

/** "John.1.3" → { book: 'JHN', chapter: 1, verse: 3 }; throws on an unknown book or bad shape. */
export function parseOsisVerse(text, osisMap) {
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(text);
  if (!m) throw new Error(`Not an OSIS verse id: ${text}`);
  const book = osisMap.get(m[1]);
  if (!book) throw new Error(`Unknown OSIS book: ${m[1]} (in ${text})`);
  return { book, chapter: Number(m[2]), verse: Number(m[3]) };
}

/**
 * A target (verse or range) → compact ref. `lastVerse(book, chapter)` gives
 * a chapter's last verse number, used to cut a cross-chapter range.
 */
export function compactTarget(text, osisMap, lastVerse) {
  const [startText, endText] = text.split('-');
  const start = parseOsisVerse(startText, osisMap);
  const head = `${start.book}.${start.chapter}.${start.verse}`;
  if (!endText) return head;
  const end = parseOsisVerse(endText, osisMap);
  const sameChapter = end.book === start.book && end.chapter === start.chapter;
  const last = sameChapter ? end.verse : lastVerse(start.book, start.chapter);
  return last > start.verse ? `${head}-${last}` : head;
}

/** One data line → { from, target, votes }, or null for the header / a blank line. */
export function parseLine(line) {
  if (!line.trim() || line.startsWith('From Verse')) return null;
  const [from, target, votes] = line.split('\t');
  const n = Number(votes);
  if (!from || !target || !Number.isInteger(n)) throw new Error(`Malformed cross-reference line: ${line}`);
  return { from, target, votes: n };
}

/**
 * The whole list → Map("BOOK/chapter" → { [verse]: [[compactRef, votes], …] }).
 * Links below XREF_MIN_VOTES are dropped; each verse keeps its top
 * XREF_PER_VERSE by votes (ties: compact ref, for a reproducible build);
 * a compact ref appears once per verse (the higher vote count).
 * Returns { chapters, stats }.
 */
export function buildChapters(text, osisMap, lastVerse, opts = {}) {
  const minVotes = opts.minVotes ?? XREF_MIN_VOTES;
  const perVerse = opts.perVerse ?? XREF_PER_VERSE;
  const byVerse = new Map();
  const stats = { lines: 0, dropped: 0, kept: 0 };
  for (const line of text.split(/\r?\n/)) {
    const row = parseLine(line);
    if (!row) continue;
    stats.lines++;
    if (row.votes < minVotes) { stats.dropped++; continue; }
    const from = parseOsisVerse(row.from, osisMap);
    const key = `${from.book}/${from.chapter}/${from.verse}`;
    if (!byVerse.has(key)) byVerse.set(key, new Map());
    const links = byVerse.get(key);
    const ref = compactTarget(row.target, osisMap, lastVerse);
    // Two source ranges can cut to the same compact ref: keep the stronger link once.
    links.set(ref, Math.max(links.get(ref) ?? row.votes, row.votes));
  }
  const chapters = new Map();
  for (const [key, links] of byVerse) {
    const [book, chapter, verse] = key.split('/');
    const top = [...links]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, perVerse);
    stats.kept += top.length;
    const file = `${book}/${chapter}`;
    if (!chapters.has(file)) chapters.set(file, {});
    chapters.get(file)[verse] = top;
  }
  return { chapters, stats };
}

/**
 * stepWords.mjs — parse STEPBible's tagged Greek NT (TAGNT) and Hebrew OT (TAHOT) · 原文逐词数据 (ADR-0018)
 *
 * Pure helpers for scripts/build-original-words.mjs (tested in
 * scripts/__tests__/originalWords.test.ts on fixture lines copied from the
 * real files). Source: https://github.com/STEPBible/STEPBible-Data, CC BY 4.0.
 *
 * Both sources are tab-separated text with long header/comment blocks; a
 * WORD line starts with "<Book>.<ch>.<v>" then "#<word no>=<text type>":
 *
 *   TAGNT  Jhn.3.16#07=NKO <TAB> κόσμον, (kosmon) <TAB> world, <TAB> G2889=N-ASM <TAB> κόσμος=world <TAB> …
 *          cols: 0 ref+type | 1 Greek (translit) | 2 English | 3 dStrong=Grammar | 4 lemma=gloss | …
 *   TAHOT  Psa.23.1#04=L <TAB> רֹ֝עִ֗/י <TAB> ro.'/I <TAB> [is] shepherd/ my <TAB> {H7462B}/H9020 <TAB> HVqrmsc/Sp1bs <TAB> …
 *          cols: 0 ref+type | 1 Hebrew | 2 translit | 3 English | 4 dStrongs (root in {…}) | 5 Grammar | …
 *
 * The ref is the English (NRSV) versification; a bracketed alternative
 * (Hebrew "(23.2)", KJV "[17.14]", other "{8.1}") is ignored. Every other
 * line — "# …" interlinear rows, "Word & Type" column headers, notes — is skipped.
 *
 * One compact word = [original, transliteration, Strong's, morphology, English gloss],
 * stored as one string with the fields joined by "|" (arrays cost ~4 MB
 * more over 443k words — ADR-0018 size budget).
 */

/**
 * STEPBible's 66 book ids in canonical order. Only the SOURCE's spelling
 * lives here; the app's ids come from services/bibleBookData.ts (books.mjs
 * loadBooks, same order) — R3, one book table; the pairing is pinned by a test.
 */
export const STEP_BOOK_ORDER = [
  'Gen', 'Exo', 'Lev', 'Num', 'Deu', 'Jos', 'Jdg', 'Rut', '1Sa', '2Sa',
  '1Ki', '2Ki', '1Ch', '2Ch', 'Ezr', 'Neh', 'Est', 'Job', 'Psa', 'Pro',
  'Ecc', 'Sng', 'Isa', 'Jer', 'Lam', 'Ezk', 'Dan', 'Hos', 'Jol', 'Amo',
  'Oba', 'Jon', 'Mic', 'Nam', 'Hab', 'Zep', 'Hag', 'Zec', 'Mal',
  'Mat', 'Mrk', 'Luk', 'Jhn', 'Act', 'Rom', '1Co', '2Co', 'Gal', 'Eph',
  'Php', 'Col', '1Th', '2Th', '1Ti', '2Ti', 'Tit', 'Phm', 'Heb', 'Jas',
  '1Pe', '2Pe', '1Jn', '2Jn', '3Jn', 'Jud', 'Rev',
];

/** STEP book id → app book id, pairing STEP_BOOK_ORDER with the app's table in order. */
export function stepToAppIds(books) {
  if (books.length !== STEP_BOOK_ORDER.length) {
    throw new Error(`Book table has ${books.length} books; STEP list has ${STEP_BOOK_ORDER.length}`);
  }
  return new Map(STEP_BOOK_ORDER.map((step, i) => [step, books[i].id]));
}

/** "Jhn.3.16#07=NKO" / "Psa.51.1(51.3)#01=L" / "Mat.17.15[17.14]#03=N(k)O". */
const WORD_REF = /^([1-3][A-Z][a-z]|[A-Z][a-z]{2})\.(\d+)\.(\d+)(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\})?#(\d+)=([^\t]*)\t/;
/** Hebrew accents (cantillation, U+0591–U+05AF) and meteg (U+05BD): reading marks, not part of the word. */
const HEBREW_ACCENTS = /[\u0591-\u05AF\u05BD]/g;
/** Hebrew punctuation left at a word's end when the source puts no backslash before it (sof pasuq, paseq, nun hafukha). */
const HEBREW_END_PUNCT = /[\u05C0\u05C3\u05C6\s]+$/;
/** Punctuation the Greek column carries after a word (the elision mark ᾽ is part of the word and stays). */
const TRAILING_PUNCT = /[\s,.;:\u00B7\u0387\u037E!?\u2014\u2013\u00B6\u00AC]+$/u;
/** Apparatus marks some Greek words carry before or after them. */
const GREEK_MARKS = /[\u2E00-\u2E05[\]()]/gu;

/** The ref part of a word line → { book, chapter, verse, type } or null for any other line. */
export function parseWordRef(line, stepMap) {
  const m = WORD_REF.exec(line);
  if (!m) return null;
  const book = stepMap.get(m[1]);
  if (!book) throw new Error(`Unknown STEP book: ${m[1]} (in ${line.slice(0, 40)})`);
  return { book, chapter: Number(m[2]), verse: Number(m[3]), type: m[5] };
}

/**
 * Greek NT words kept: those in the Nestlé-Aland text (type has N or n
 * outside brackets — "NKO", "N(k)O", "no"); words found only in the KJV's
 * Textus Receptus or other editions ("K", "ko", "O") are dropped, because
 * the app's English text (BSB) follows the NA text. Exception: a verse with
 * NO Nestlé-Aland word at all (Mark 16:9–20, John 7:53–8:11, Matthew 17:21 …,
 * which the bundled BSB or 和合本 still print) keeps its Traditional-text
 * words (type has K or k) — selectGreekWords.
 */
export function isNestleAlandWord(type) {
  return /[Nn]/.test(type.replace(/\([^)]*\)/g, ''));
}

/** A verse's Greek rows by the rule above: the NA words, else the Traditional (K/k) ones. */
export function selectGreekWords(rows) {
  const na = rows.filter(r => isNestleAlandWord(r.type));
  return na.length > 0 ? na : rows.filter(r => /[Kk]/.test(r.type));
}

/**
 * Morphology is kept for verbs only (Greek "V-…", Hebrew "HV…" or "…/Vqp3ms"):
 * tense, mood and stem are what a word study explains; the case or state of
 * every noun would add ~2 MB for little use (ADR-0018 size budget).
 */
export function keptMorph(morph) {
  return /^V-/.test(morph) || /(^|\/)H?V/.test(morph) ? morph : '';
}

/** The separator between a stored word's five fields (no field may contain it — packWord checks). */
export const WORD_FIELD_SEPARATOR = '|';

/**
 * [original, translit, strong, morph, gloss] → the stored "original|translit|strong|morph|gloss"
 * (morph: verbs only; NFC, because the source mixes Greek oxia and tonos for the same accent).
 */
export function packWord(word) {
  const fields = [word[0], word[1], word[2], keptMorph(word[3]), word[4]].map(f => f.normalize('NFC'));
  if (fields.some(f => f.includes(WORD_FIELD_SEPARATOR))) {
    throw new Error(`A word field contains "${WORD_FIELD_SEPARATOR}": ${fields.join(' ')}`);
  }
  return fields.join(WORD_FIELD_SEPARATOR);
}

function cleanGloss(text) {
  return text.trim().replace(TRAILING_PUNCT, '');
}

/** One TAGNT word line (columns as documented above) → compact word, or throws on a malformed line. */
export function tagntWord(cols) {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/u.exec(cols[1] ?? '');
  const [strong, morph] = (cols[3] ?? '').split('=');
  if (!m || !/^G\d{4,5}[A-Za-z]?$/.test(strong ?? '') || !morph) throw new Error(`Malformed TAGNT line: ${cols.join('\t').slice(0, 80)}`);
  const greek = m[1].replace(GREEK_MARKS, '').replace(TRAILING_PUNCT, '').trim();
  return [greek, m[2].trim(), strong, morph.trim(), cleanGloss(cols[2] ?? '')];
}

/**
 * The root Strong's of a TAHOT word: the tag in {curly brackets}; prefixes
 * and suffixes (H9001–H9049: "and", "the", "my", …) stay in the morphology
 * and gloss. A word with no braced root (rare) takes its first non-H9xxx tag.
 */
export function hebrewRoot(tags) {
  const braced = /\{(H\d{4,5}[A-Za-z]?)\}/.exec(tags);
  if (braced) return braced[1];
  const all = [...tags.matchAll(/H\d{4,5}[A-Za-z]?/g)].map(t => t[0]);
  return all.find(t => !/^H9\d{3}/.test(t)) ?? all[0] ?? null;
}

/**
 * One TAHOT word line → compact word. Hebrew: punctuation after "\" cut,
 * accents removed, the "/" between prefix, root and suffix removed (the word
 * stays whole, as printed); transliteration: syllable dots and "/" removed,
 * lower-cased (STEP marks stress with a capital). Gloss and morphology keep
 * their "/" so prefix, root and suffix stay visible ("and/ discipline", "HC/Ncmsa").
 * null for a Qere that reads NOTHING where the Ketiv has a word (Jdg.16.25#02:
 * empty Hebrew and tags) — translators follow the Qere, so there is no word to show.
 */
export function tahotWord(cols) {
  if (!(cols[1] ?? '').trim() && !(cols[4] ?? '').trim()) return null;
  const strong = hebrewRoot(cols[4] ?? '');
  const hebrew = (cols[1] ?? '').split('\\')[0].replace(HEBREW_ACCENTS, '').replace(/\//g, '').replace(HEBREW_END_PUNCT, '').trim();
  const morph = (cols[5] ?? '').trim();
  if (!strong || !hebrew || !morph) throw new Error(`Malformed TAHOT line: ${cols.join('\t').slice(0, 80)}`);
  const translit = (cols[2] ?? '').replace(/[./]/g, '').toLowerCase().trim();
  return [hebrew, translit, strong, morph, cleanGloss(cols[3] ?? '')];
}

/** One source file's word lines → rows { key "BOOK/chapter", verse, type, word } in file order. */
function readRows(text, kind, stepMap, stats) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const ref = parseWordRef(line, stepMap);
    if (!ref) continue;
    const cols = line.split('\t');
    const word = kind === 'greek' ? tagntWord(cols) : tahotWord(cols);
    if (!word) { stats.dropped++; continue; }
    rows.push({ key: `${ref.book}/${ref.chapter}`, verse: String(Math.max(1, ref.verse)), type: ref.type, word });
  }
  return rows;
}

/**
 * Add one source file's words to `chapters` (Map "BOOK/chapter" → { verse: ["orig|translit|strong|morph|gloss", …] }).
 * `kind` 'greek' | 'hebrew'. Greek words are chosen per verse (selectGreekWords);
 * every Hebrew line is the translators' reading (Qere over Ketiv, as TAHOT gives it).
 * A Psalm title (English verse 0) is kept with verse 1, as the bundled BSB
 * and 和合本 print it there. Returns counts.
 */
export function addWords(text, kind, stepMap, chapters) {
  const stats = { words: 0, dropped: 0 };
  const byVerse = new Map();
  for (const row of readRows(text, kind, stepMap, stats)) {
    const id = `${row.key}#${row.verse}`;
    if (!byVerse.has(id)) byVerse.set(id, []);
    byVerse.get(id).push(row);
  }
  for (const rows of byVerse.values()) {
    const kept = kind === 'greek' ? selectGreekWords(rows) : rows;
    stats.dropped += rows.length - kept.length;
    if (kept.length === 0) continue;
    const { key, verse } = rows[0];
    if (!chapters.has(key)) chapters.set(key, {});
    (chapters.get(key)[verse] ??= []).push(...kept.map(r => packWord(r.word)));
    stats.words += kept.length;
  }
  return stats;
}

/** Every Strong's id the words use, for the lexicon (prefix/suffix tags never appear as a word's id). */
export function usedStrongIds(chapters) {
  const ids = new Set();
  for (const file of chapters.values()) {
    for (const words of Object.values(file)) for (const w of words) ids.add(w.split(WORD_FIELD_SEPARATOR)[2]);
  }
  return ids;
}

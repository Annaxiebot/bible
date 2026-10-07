/**
 * originalWords.ts — the selected verse's Greek/Hebrew words for Ask AI · 原文词汇 (ADR-0018)
 *
 * A word question ("「世人」在第16节中是什么意思？…", or a typed "v.7 的原文")
 * gets the verse's original-language words as data, so the model names a
 * real word, transliteration and Strong's number instead of recalling one:
 *   1. target verses: passage verses the question names ("第7节", "v.7",
 *      "verse 7"); else, for a selection question, the passage verses whose
 *      和合本 or English text contains the selection; at most
 *      ORIGINAL_WORDS_MAX_VERSES. A general question gets NONE — no fetch, no
 *      block, today's request;
 *   2. load the chapter file (public/bible-data/orig/, STEP Bible TAGNT/TAHOT,
 *      CC BY) and the brief lexicon of each word's language (once per session);
 *   3. return the verses' words with their lexicon entries; the shared
 *      builder (_shared/aiPrompts formatOriginalWordsBlock) prints the block.
 * Never rejects: a failed load comes back in `warnings` (and in
 * lastOriginalWords / window.__ORIGINAL_WORDS__ in dev) — never silent (R5).
 */
import { StudyPack } from './packTypes';
import { VerseRef, packVerseIndex } from './verseRefs';
import { bilingualRefLabel } from './refLabel';
import { focusVerses, packPassage, PassageSpan } from './relatedVerses';
import { originalLexiconUrl, originalWordsChapterUrl } from '../../services/bibleDataSource';
import type { OriginalWord, OriginalWordsVerse } from '../../supabase/functions/_shared/aiPrompts';

/** The switch (ADR-0018). Off: no word data is fetched or sent — today's request, byte for byte. */
export const ORIGINAL_WORDS_ENABLED: boolean = true;
/** At most this many verses' words per question (request size). */
export const ORIGINAL_WORDS_MAX_VERSES = 2;
/** The stored word's field separator (scripts/lib/stepWords.mjs WORD_FIELD_SEPARATOR — the data's format). */
const FIELD_SEPARATOR = '|'; // pinned equal to the script's constant by originalWords.test.ts

/** One chapter file: verse → "original|translit|strong|morph|gloss" strings in text order. */
export type OriginalChapter = Record<string, string[]>;
/** One brief lexicon: Strong's id → [lemma, transliteration, brief meaning]. */
export type OriginalLexicon = Record<string, [string, string, string]>;
type LexiconLanguage = 'greek' | 'hebrew';

export interface OriginalWordsResult { verses: OriginalWordsVerse[]; targets: number[]; warnings: string[] }

/** "κόσμον|kosmon|G2889||world" → its fields (the lexicon part is added by withLexicon). */
export function unpackWord(stored: string): OriginalWord {
  const [original = '', translit = '', strong = '', morph = '', gloss = ''] = stored.split(FIELD_SEPARATOR);
  return { original, translit, strong, morph, gloss };
}

/** The selection a TV selection question carries (askAI.questionForSelection: "「…」在…"), or null. */
export function selectionOf(question: string): string | null {
  return /^「([^」]+)」/.exec(question)?.[1].trim() || null;
}

/** Step 1, pure: the passage verses this question is about (named first, else where the selection occurs); [] for a general question. */
export function targetVerses(pack: StudyPack, question: string): number[] {
  const passage = packPassage(pack);
  if (!passage) return [];
  const named = [...focusVerses(question, passage)].sort((a, b) => a - b);
  if (named.length > 0) return named.slice(0, ORIGINAL_WORDS_MAX_VERSES);
  const selection = selectionOf(question);
  if (!selection) return [];
  const needle = selection.toLowerCase();
  const hits = [...packVerseIndex(pack).values()]
    .filter(v => v.cuv.includes(selection) || v.en.toLowerCase().includes(needle))
    .map(v => v.num)
    .sort((a, b) => a - b);
  return hits.slice(0, ORIGINAL_WORDS_MAX_VERSES);
}

const chapterCache = new Map<string, Promise<OriginalChapter>>();
const lexiconCache = new Map<LexiconLanguage, Promise<OriginalLexicon>>();

/** Test hook: clear the session caches. */
export function clearOriginalWordsCache(): void {
  chapterCache.clear();
  lexiconCache.clear();
}

/**
 * A JSON file cached for the session; a failed load rejects and is not cached, so a later question retries.
 * TODO(R8): relatedVerses.loadXrefChapter keeps the same kind of cache — share this helper in a refactor session.
 */
function cachedJson<K, T>(cache: Map<K, Promise<T>>, key: K, url: string, what: string): Promise<T> {
  let promise = cache.get(key);
  if (!promise) {
    promise = fetch(url).then(async res => {
      if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
      return await res.json() as T;
    });
    promise.catch(() => cache.delete(key)); // the caller reports the failure in its warnings
    cache.set(key, promise);
  }
  return promise;
}

export function loadOriginalChapter(bookId: string, chapter: number): Promise<OriginalChapter> {
  return cachedJson(chapterCache, `${bookId}/${chapter}`, originalWordsChapterUrl(bookId, chapter), `original words ${bookId}/${chapter}`);
}

export function loadOriginalLexicon(language: LexiconLanguage): Promise<OriginalLexicon> {
  return cachedJson(lexiconCache, language, originalLexiconUrl(language), `lexicon-${language}`);
}

function languageOf(words: readonly OriginalWord[]): LexiconLanguage {
  return words[0]?.strong.startsWith('H') ? 'hebrew' : 'greek';
}

/** Each word with its lexicon entry; an id the lexicon lacks is reported, the word kept without one. */
export function withLexicon(words: OriginalWord[], lexicon: OriginalLexicon | null, warnings: string[]): OriginalWord[] {
  if (!lexicon) return words;
  return words.map(w => {
    const entry = lexicon[w.strong];
    if (!entry) { warnings.push(`no lexicon entry for ${w.strong}`); return w; }
    return { ...w, lemma: entry[0], lemmaTranslit: entry[1], brief: entry[2] };
  });
}

function verseLabel(passage: PassageSpan, verse: number): string {
  const ref: VerseRef = { index: 0, length: 0, text: '', bookId: passage.bookId, chapter: passage.chapter, verses: [verse] };
  return bilingualRefLabel(ref);
}

async function lexiconFor(language: LexiconLanguage, warnings: string[]): Promise<OriginalLexicon | null> {
  try {
    return await loadOriginalLexicon(language);
  } catch (err) {
    warnings.push(`${(err as Error).message} — words sent without lexicon meanings`);
    return null;
  }
}

let last: OriginalWordsResult | null = null;

/** The latest result (tests, the evaluation and the e2e hook read it; nothing logs to the console). */
export function lastOriginalWords(): OriginalWordsResult | null {
  return last;
}

function remember(result: OriginalWordsResult): OriginalWordsResult {
  last = result;
  if (import.meta.env.DEV && typeof window !== 'undefined') (window as Window & { __ORIGINAL_WORDS__?: unknown }).__ORIGINAL_WORDS__ = result;
  return result;
}

/** Steps 1–3 for one question. Never rejects: failures come back in `warnings`. */
export async function loadOriginalWords(pack: StudyPack, question: string): Promise<OriginalWordsResult> {
  const targets = targetVerses(pack, question);
  const passage = packPassage(pack);
  const warnings: string[] = [];
  if (targets.length === 0 || !passage) return remember({ verses: [], targets, warnings });
  let file: OriginalChapter;
  try {
    file = await loadOriginalChapter(passage.bookId, passage.chapter);
  } catch (err) {
    warnings.push((err as Error).message);
    return remember({ verses: [], targets, warnings });
  }
  const verses: OriginalWordsVerse[] = [];
  for (const verse of targets) {
    const stored = file[String(verse)];
    if (!stored?.length) { warnings.push(`no original words for ${passage.bookId} ${passage.chapter}:${verse}`); continue; }
    const words = stored.map(unpackWord);
    const language = languageOf(words);
    verses.push({
      label: verseLabel(passage, verse),
      language: language === 'greek' ? 'Greek' : 'Hebrew',
      words: withLexicon(words, await lexiconFor(language, warnings), warnings),
    });
  }
  return remember({ verses, targets, warnings });
}

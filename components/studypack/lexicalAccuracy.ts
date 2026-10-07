/**
 * lexicalAccuracy.ts — does an answer's Greek/Hebrew match the verse? · 原文准确度 (ADR-0018 §5)
 *
 * Pure, for the evaluation and tests: given an answer and the target verses'
 * word lists (originalWords.ts), report every original-language form the
 * answer mentions and whether it appears in the data for those verses —
 * the verse's word forms, their dictionary forms (lemmas), transliterations
 * and Strong's numbers. Comparison ignores case, accents, Hebrew vowel
 * points and punctuation inside a transliteration (yir'at = yirat = YIR·AT).
 *
 * What counts as a mention:
 *   - any run of Greek letters, any run of Hebrew letters;
 *   - a Strong's number (G2889, H3374);
 *   - a Latin-letter word that IS one of the data's transliterations (found),
 *     or that looks like one: it carries a macron/breve or an inner
 *     apostrophe (ā, ē, ō, yir'at), stands in brackets next to a Greek or
 *     Hebrew form, or follows "Greek / Hebrew / 希腊文 / 希伯来文 / 原文".
 * A transliteration the heuristics cannot see (a plain Latin word in running
 * text that is not in the data) is not counted — the measure under-counts
 * misses rather than flagging ordinary English words.
 */
import type { OriginalWord } from '../../supabase/functions/_shared/aiPrompts';

export type MentionKind = 'greek' | 'hebrew' | 'strong' | 'translit';
export interface LexicalMention { form: string; kind: MentionKind; found: boolean }
export interface LexicalAccuracy { mentions: LexicalMention[]; found: number; total: number }

const GREEK_RUN = /[\u0370-\u03FF\u1F00-\u1FFF][\u0370-\u03FF\u1F00-\u1FFF\u0300-\u036F\u1FBD\u2019]*/g;
const HEBREW_RUN = /[\u05D0-\u05EA][\u05D0-\u05EA\u0591-\u05C7\u05F3\u05F4\u05BE]*/g;
const STRONG_ID = /\b([GH])0*(\d{1,5})([A-Za-z])?\b/g;
const LATIN_WORD = "[A-Za-z\\u00C0-\\u024F\\u1E00-\\u1EFF'’ʼʻ-]+";
const SCRIPT = '[\\u0370-\\u03FF\\u1F00-\\u1FFF\\u05D0-\\u05EA]';
/** A Latin word in brackets right after an original form ("κόσμος (kosmos)"), or after it inside its brackets ("（κόσμος, kosmos）"). */
const BESIDE_SCRIPT = new RegExp(`${SCRIPT}\\S*\\s*[（(]\\s*(${LATIN_WORD})|[（(]\\s*${SCRIPT}[^\\s,，、)）]*[,，、\\s]+(${LATIN_WORD})`, 'g');
/** A Latin word right after a language name ("the Greek word kosmos", "希伯来文 yirah", "原文是“kosmos”"). */
const AFTER_LANGUAGE = new RegExp(`(?:Greek|Hebrew|希腊文|希伯来文|原文)(?:\\s*(?:word|term|noun|verb|is|here|词|字|是|为)){0,2}\\s*[:：]?\\s*["“'‘「(（]?\\s*(${LATIN_WORD})`, 'g');
const MARKED_TRANSLIT = /[\u0100-\u017F\u1E00-\u1EFF]|[a-z]['\u2019\u02BC\u02BB][a-z]/i;
/** An unmarked Latin word counts as a transliteration found in the data only from this length (English "to", "men" = Greek τό, μέν). */
const MIN_PLAIN_TRANSLIT = 4;
/** English words a context pattern can catch where a transliteration was expected ("the Greek word FOR world"). */
const NOT_TRANSLIT = new Set(['for', 'word', 'words', 'term', 'is', 'means', 'meaning', 'here', 'the', 'a', 'an', 'of', 'and',
  'in', 'text', 'original', 'verb', 'noun', 'this', 'that', 'used', 'translated', 'sense', 'root', 'it', 'behind', 'with', 'or']);

/** English contractions — their apostrophe is not a transliteration mark ("isn't", "God's", "we're"). */
const ENGLISH_CONTRACTION = /['\u2019](?:t|s|re|ve|ll|d|m)$/i;
/** English word endings no Greek/Hebrew transliteration has ("broadly", "transliteration", "meaning"). */
const ENGLISH_SUFFIX = /(?:ly|tion|tions|sion|ness|ment|ments|ing|ity|ful|less)$/i;
/** Common English words the context patterns catch beside "Greek"/"Hebrew" (owner's ADR-0018 evaluation). */
const COMMON_ENGLISH = new Set(['jesus', 'god', 'lord', 'christ', 'spirit', 'knowledge', 'world', 'love', 'fear', 'grace',
  'faith', 'greek', 'hebrew', 'english', 'chinese', 'literally', 'also', 'which', 'means', 'refers', 'conveys']);

/**
 * A Latin word that is ordinary English, not a transliteration — checked only for words the
 * verse's data does not contain, so a real transliteration is never dropped. (The evaluation
 * counted "isn't", "Jesus", "broadly", "transliteration" as wrong Greek; ADR-0018 result.)
 */
export function looksEnglish(word: string): boolean {
  return ENGLISH_CONTRACTION.test(word) || ENGLISH_SUFFIX.test(word) || COMMON_ENGLISH.has(word.toLowerCase());
}

/** Strip accents/points, lower-case; Greek final sigma → σ. */
export function normaliseScript(form: string): string {
  return form.normalize('NFD').replace(/[\u0300-\u036F\u0591-\u05C7\u05BE\u1FBD\u2019]/g, '').replace(/\u03C2/g, '\u03C3').toLowerCase();
}

/** Letters only, accents stripped, lower-case: "yir'At" → "yirat", "kósmos" → "kosmos". */
export function normaliseTranslit(form: string): string {
  return form.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

/** "G02889" / "g2889a" → "G2889A" (leading zeros dropped, so G0025 = G25). */
export function normaliseStrong(id: string): string {
  const m = /^([GH])0*(\d+)([A-Za-z])?$/i.exec(id.trim());
  return m ? `${m[1].toUpperCase()}${m[2]}${(m[3] ?? '').toUpperCase()}` : id.toUpperCase();
}

interface Known { script: Set<string>; translit: Set<string>; strong: Set<string>; plainStrong: Set<string> }

function knownForms(words: readonly OriginalWord[]): Known {
  const known: Known = { script: new Set(), translit: new Set(), strong: new Set(), plainStrong: new Set() };
  for (const w of words) {
    for (const form of [w.original, w.lemma ?? '']) for (const part of form.split(/[\s־-]+/)) if (part) known.script.add(normaliseScript(part));
    for (const t of [w.translit, w.lemmaTranslit ?? '']) if (normaliseTranslit(t)) known.translit.add(normaliseTranslit(t));
    known.strong.add(normaliseStrong(w.strong));
    known.plainStrong.add(normaliseStrong(w.strong).replace(/[A-Z]$/, ''));
  }
  return known;
}

function latinCandidates(answer: string, known: Known): string[] {
  const out: string[] = [];
  for (const m of answer.matchAll(new RegExp(LATIN_WORD, 'g'))) {
    const word = m[0].replace(/^['’ʼʻ-]+|['’ʼʻ-]+$/g, '');
    const plainHit = word.length >= MIN_PLAIN_TRANSLIT && known.translit.has(normaliseTranslit(word));
    const marked = MARKED_TRANSLIT.test(word) && !looksEnglish(word); // not "isn't" / "Strong's"
    if (word && (plainHit || marked)) out.push(word);
  }
  for (const re of [BESIDE_SCRIPT, AFTER_LANGUAGE]) {
    for (const m of answer.matchAll(re)) {
      const word = (m[1] ?? m[2] ?? '').replace(/^['’ʼʻ-]+|['’ʼʻ-]+$/g, '');
      const inData = known.translit.has(normaliseTranslit(word));
      if (word.length > 1 && !NOT_TRANSLIT.has(word.toLowerCase()) && (inData || !looksEnglish(word))) out.push(word);
    }
  }
  return out;
}

/** Every original-language form the answer mentions (each distinct form once), and whether the verses' data has it. */
export function checkLexicalAccuracy(answer: string, words: readonly OriginalWord[]): LexicalAccuracy {
  const known = knownForms(words);
  const seen = new Set<string>();
  const mentions: LexicalMention[] = [];
  const add = (form: string, kind: MentionKind, key: string, found: boolean) => {
    if (!key || seen.has(`${kind}:${key}`)) return;
    seen.add(`${kind}:${key}`);
    mentions.push({ form, kind, found });
  };
  for (const m of answer.matchAll(GREEK_RUN)) add(m[0], 'greek', normaliseScript(m[0]), known.script.has(normaliseScript(m[0])));
  for (const m of answer.matchAll(HEBREW_RUN)) add(m[0], 'hebrew', normaliseScript(m[0]), known.script.has(normaliseScript(m[0])));
  for (const m of answer.matchAll(STRONG_ID)) {
    const id = normaliseStrong(m[0]);
    add(m[0], 'strong', id, known.strong.has(id) || (!m[3] && known.plainStrong.has(id)));
  }
  for (const word of latinCandidates(answer, known)) {
    add(word, 'translit', normaliseTranslit(word), known.translit.has(normaliseTranslit(word)));
  }
  const found = mentions.filter(m => m.found).length;
  return { mentions, found, total: mentions.length };
}

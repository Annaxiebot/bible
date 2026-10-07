/**
 * stepLexicon.mjs — STEPBible's brief lexicons (TBESG Greek, TBESH Hebrew) → compact entries · 原文简明词典 (ADR-0018)
 *
 * Pure helpers for scripts/build-original-words.mjs (tested in
 * scripts/__tests__/originalWords.test.ts). Source: STEPBible-Data, CC BY 4.0.
 *
 * Entry lines are tab-separated (the header row reads "eStrong  dStrong  uStrong …"):
 *   0 eStrong (H3374) | 1 dStrong ("H4148H = a Meaning of") | 2 uStrong | 3 lemma |
 *   4 transliteration | 5 morph | 6 gloss | 7 meaning (HTML: BDB outline for Hebrew,
 *   Abbott-Smith for Greek)
 * Every other line (licence, notes, column descriptions) is skipped.
 *
 * Compact entry = [lemma, transliteration, brief], brief = "gloss: meaning"
 * cut to LEXICON_BRIEF_MAX characters. The cut rule (documented in ADR-0018):
 *   - Hebrew: the BDB outline, "<br>" → "; " ("1) fear, terror, fearing; 1a) …");
 *   - Greek: Abbott-Smith without its first line (the lemma's endings and
 *     article), without "[in LXX …]" notes and without verse references;
 *   - HTML tags removed, empty brackets and doubled punctuation left by the
 *     removed references tidied, whitespace collapsed;
 *   - over the limit: cut at the last "; " / ". " / space that fits, then "…".
 */

/** The brief meaning's length budget (characters). */
export const LEXICON_BRIEF_MAX = 200;

const ENTRY = /^[GH]\d{4}/;

/** One lexicon line → { id, lemma, translit, gloss, meaning } or null when it is not an entry. */
export function parseLexiconLine(line) {
  if (!ENTRY.test(line)) return null;
  const cols = line.split('\t');
  if (cols.length < 8) return null; // the column-description rows also start with an id-like word but are short
  const id = cols[1].trim().split(/\s/)[0];
  if (!/^[GH]\d{4,5}[A-Za-z]?$/.test(id)) throw new Error(`Malformed lexicon id: ${cols[1]}`);
  return { eStrong: cols[0].trim(), id, lemma: cols[3].trim(), translit: cols[4].replace(/\./g, '').trim(), gloss: cols[6].trim(), meaning: cols[7] };
}

function removeRefs(html) {
  let out = html;
  for (let prev = ''; prev !== out;) {
    prev = out;
    out = out.replace(/<ref[^>]*>[^<]*<\/ref>/gi, ''); // innermost first; refs can nest
  }
  return out;
}

/**
 * Abbott-Smith's scholarly apparatus, not meaning: a bracket citing classical
 * authors or reference works ("(Hom., Plat., al.)", "(see Lft., ICC, in l.)",
 * "(LXX)"), a lone "al." or "ib. 44", the "†" end mark and stray quotes.
 */
const APPARATUS_BRACKET = /\((?:[^()]*\b(?:Hom|Plat|Arist|Hdt|Xen|Thuc|Soph|Eur|Aesch|Pind|Polyb|Plut|Lft|ICC|DCG|LS|AS|Cremer|Thayer|supr|EV|cl)\b[^()]*|\s*LXX\s*)\)/g;

function dropApparatus(text) {
  return text
    .replace(APPARATUS_BRACKET, '')
    .replace(/\b(?:al|ib)\.(?:\s*\d+)?/g, '')
    .replace(/[†"]/g, '');
}

function tidy(text) {
  return text
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/__/g, '')
    .replace(/\(\s*[,;:.]*\s*\)/g, '')
    .replace(/\s+([,;:.)])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/[,;:]\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,.]+/, '')
    .trim();
}

/** The meaning column → plain text, by the rules in the header. */
export function plainMeaning(meaning, language) {
  if (language === 'hebrew') return tidy(removeRefs(meaning).replace(/<br\s*\/?>/gi, '; '));
  const parts = removeRefs(meaning).split(/<br\s*\/?>/i).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1 && /^<b>/i.test(parts[0])) parts.shift(); // "<b>κόσμος</b>, -ου, ὁ"
  const text = tidy(parts.filter(p => !/^\[in LXX/i.test(p)).join(' ').replace(/\[in LXX[^\]]*\]/gi, ''));
  return tidy(dropApparatus(text));
}

/** Cut to `max` characters at the last "; ", ". " or space that fits, then "…". */
export function cutBrief(text, max = LEXICON_BRIEF_MAX) {
  if (text.length <= max) return text;
  const room = text.slice(0, max - 1);
  const at = Math.max(room.lastIndexOf('; '), room.lastIndexOf('. '));
  const cut = at > max / 2 ? room.slice(0, at + 1) : room.slice(0, Math.max(room.lastIndexOf(' '), 1));
  return `${cut.replace(/[\s,;:]+$/, '')}…`;
}

/** One parsed entry → [lemma, transliteration, brief]. */
export function compactEntry(entry, language) {
  const meaning = plainMeaning(entry.meaning, language);
  const first = meaning.split(/[;:]/)[0].trim();
  // The gloss already says the meaning's first words ("discipline: instruction" + "instruction; 1) …"): say them once.
  const repeats = first.length > 0 && (entry.gloss === first || entry.gloss.endsWith(` ${first}`));
  const brief = !meaning ? entry.gloss
    : meaning.startsWith(entry.gloss) ? meaning
      : repeats ? `${entry.gloss}${meaning.slice(first.length)}` : `${entry.gloss}: ${meaning}`;
  return [entry.lemma, entry.translit, cutBrief(brief)].map(f => f.normalize('NFC')); // one Unicode form (the source mixes oxia and tonos)
}

/** "G3700G" → "G3700", "G20447" → "G20447": the Strong's number without its disambiguating letter. */
export function plainNumber(id) {
  return /^[GH]\d+/.exec(id)?.[0] ?? id;
}

/**
 * The lexicon file for the ids the words use: Strong's id → compact entry.
 * Lookup: the exact disambiguated id (dStrong, e.g. H4148H); else the first
 * entry of its plain number (eStrong, e.g. G3700 for G3700G). Ids found in
 * neither are returned in `missing` (the build reports them; nothing is invented).
 */
export function buildLexicon(text, language, ids) {
  const byId = new Map();
  const byPlain = new Map();
  for (const line of text.split(/\r?\n/)) {
    const entry = parseLexiconLine(line);
    if (!entry) continue;
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
    const plain = plainNumber(entry.eStrong);
    if (!byPlain.has(plain)) byPlain.set(plain, entry);
  }
  const lexicon = {};
  const missing = [];
  for (const id of [...ids].sort()) {
    const entry = byId.get(id) ?? byPlain.get(plainNumber(id));
    if (entry) lexicon[id] = compactEntry(entry, language);
    else missing.push(id);
  }
  return { lexicon, missing, entries: byId.size };
}

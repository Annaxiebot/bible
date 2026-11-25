/**
 * guideVerbatim.ts — is a line word for word from the guide? · 原文核对 (ADR-0019 §4)
 *
 * Pure. Both sides are normalised: Unicode NFKC (full-width → half-width,
 * Kangxi radicals → ideographs), lower case, every whitespace, punctuation,
 * symbol and format character removed. So line breaks, item numbers, 「」 vs
 * “” and ， vs , do not count — any changed, added or dropped word does,
 * and so does 繁/简 conversion (the guide is quoted as written). A line
 * passes when it is a substring of the guide.
 */

/** Item numbering a line may carry ("1." "(2)" "三、" "Q4:") — the contract lets the model drop it, so it is not compared. */
const LEADING_NUMBER = /^\s*(?:[(（]?\d+[.)）．、:：]?|[一二三四五六七八九十]+[、.．]|Q\d+[.:：]?)\s*/i;

/** The comparable form of a text. */
export function normaliseForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}\p{Cf}]/gu, '');
}

/** The guide once, ready for many isVerbatim calls. */
export function guideMatcher(guideText: string): (line: string) => boolean {
  const guide = normaliseForMatch(guideText);
  return line => {
    const needle = normaliseForMatch(line.replace(LEADING_NUMBER, ''));
    return needle.length > 0 && guide.includes(needle);
  };
}

/** A drafted item with its two halves: it is from the guide when either non-empty half is (the other may be a translation). */
export function itemIsVerbatim(item: { zh: string; en: string }, isVerbatim: (line: string) => boolean): boolean {
  return [item.zh, item.en].some(half => half.trim().length > 0 && isVerbatim(half));
}

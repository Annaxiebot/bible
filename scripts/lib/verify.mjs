/**
 * verify.mjs — honest structural verification of a parsed translation.
 *
 * Fails loudly (throws) on anything unexpected; a partial download must not
 * look like success. Returns the numbers so the caller can print them.
 */

/**
 * The 16 verses the Berean Standard Bible relegates to footnotes (classic
 * textual-criticism omissions, e.g. Matthew 17:21). They appear in bsb.txt
 * with empty text and are therefore absent from the bundled data.
 */
export const BSB_OMITTED_VERSES = new Set([
  'MAT 17:21', 'MAT 18:11', 'MAT 23:14', 'MRK 7:16', 'MRK 9:44', 'MRK 9:46',
  'MRK 11:26', 'MRK 15:28', 'LUK 17:36', 'LUK 23:17', 'JHN 5:4', 'ACT 8:37',
  'ACT 15:34', 'ACT 24:7', 'ACT 28:29', 'ROM 16:24',
]);

/** Spot-check expectations: ref → substring the verse text must contain. */
const SPOT_CHECKS = {
  bsb: [
    ['GEN 1:1', 'In the beginning God created'],
    ['PSA 3:1', 'A Psalm of David'],       // Psalm title folded into v1
    ['3JN 1:14', 'face to face'],          // BSB ends 3 John at v14
    ['REV 22:21', 'grace of the Lord Jesus'],
    ['MAT 6:25', 'do not worry about your life'],
  ],
  cuv: [
    ['GEN 1:1', '起初'],
    ['PSA 3:1', '大卫'],                    // simplified 大卫, title in v1
    ['3JN 1:14', ''],                      // CUV has vv.14 and 15
    ['3JN 1:15', ''],
    ['REV 22:21', '愿主耶稣的恩惠'],         // simplified 愿/耶稣
    ['JHN 3:16', '神爱世人'],
  ],
};

function checkChapters(translationId, data, books, errors) {
  for (const book of books) {
    const bookData = data.get(book.id);
    if (!bookData) {
      errors.push(`${translationId}: missing book ${book.id}`);
      continue;
    }
    if (bookData.size !== book.chapters) {
      errors.push(
        `${translationId} ${book.id}: ${bookData.size} chapters, expected ${book.chapters}`
      );
    }
    for (let ch = 1; ch <= book.chapters; ch++) {
      const chap = bookData.get(ch);
      if (!chap || chap.size === 0) {
        errors.push(`${translationId} ${book.id} ${ch}: chapter missing or empty`);
      }
    }
  }
}

function checkVerses(translationId, data, allowedMissing, errors) {
  let verseCount = 0;
  for (const [bookId, bookData] of data) {
    for (const [ch, chap] of bookData) {
      const nums = [...chap.keys()].sort((a, b) => a - b);
      verseCount += nums.length;
      for (let v = 1; v <= nums[nums.length - 1]; v++) {
        if (!chap.has(v) && !allowedMissing.has(`${bookId} ${ch}:${v}`)) {
          errors.push(`${translationId} ${bookId} ${ch}:${v}: verse gap not on the known-omitted list`);
        }
      }
      for (const [v, text] of chap) {
        if (!text || !text.trim()) errors.push(`${translationId} ${bookId} ${ch}:${v}: empty verse text`);
      }
    }
  }
  return verseCount;
}

function runSpotChecks(translationId, data, errors) {
  for (const [ref, expected] of SPOT_CHECKS[translationId] ?? []) {
    const [bookId, cv] = ref.split(' ');
    const [ch, v] = cv.split(':').map(Number);
    const text = data.get(bookId)?.get(ch)?.get(v);
    if (text === undefined) {
      errors.push(`${translationId} spot-check ${ref}: verse missing`);
    } else if (expected && !text.includes(expected)) {
      errors.push(`${translationId} spot-check ${ref}: expected "${expected}" in "${text.slice(0, 60)}"`);
    }
  }
}

/**
 * @param {string} translationId 'bsb' | 'cuv'
 * @param {Map} data parsed translation
 * @param {Array} books book metadata from books.mjs
 * @param {{min: number, max: number}} verseRange expected total verse count
 * @returns {{verses: number, chapters: number, books: number}}
 */
export function verifyTranslation(translationId, data, books, verseRange) {
  const errors = [];
  const allowedMissing = translationId === 'bsb' ? BSB_OMITTED_VERSES : new Set();

  if (data.size !== 66) errors.push(`${translationId}: ${data.size} books, expected 66`);
  checkChapters(translationId, data, books, errors);
  const verses = checkVerses(translationId, data, allowedMissing, errors);
  if (verses < verseRange.min || verses > verseRange.max) {
    errors.push(
      `${translationId}: total ${verses} verses, outside expected ` +
      `${verseRange.min}–${verseRange.max}`
    );
  }
  runSpotChecks(translationId, data, errors);

  if (errors.length > 0) {
    throw new Error(
      `Verification FAILED for ${translationId} (${errors.length} problems):\n  ` +
      errors.slice(0, 25).join('\n  ') +
      (errors.length > 25 ? `\n  …and ${errors.length - 25} more` : '')
    );
  }
  const chapters = [...data.values()].reduce((n, b) => n + b.size, 0);
  return { verses, chapters, books: data.size };
}

/**
 * Centralized Bible Book Metadata
 *
 * Single source of truth for book IDs, names, chapters, and abbreviations.
 * Replaces duplicated book maps in BibleViewer, printService, and constants.
 */

import { Book } from '../types';

export const BIBLE_BOOKS: Book[] = [
  { name: '创世记 Genesis', id: 'GEN', chapters: 50 },
  { name: '出埃及记 Exodus', id: 'EXO', chapters: 40 },
  { name: '利未记 Leviticus', id: 'LEV', chapters: 27 },
  { name: '民数记 Numbers', id: 'NUM', chapters: 36 },
  { name: '申命记 Deuteronomy', id: 'DEU', chapters: 34 },
  { name: '约书亚记 Joshua', id: 'JOS', chapters: 24 },
  { name: '士师记 Judges', id: 'JDG', chapters: 21 },
  { name: '路得记 Ruth', id: 'RUT', chapters: 4 },
  { name: '撒母耳记上 1 Samuel', id: '1SA', chapters: 31 },
  { name: '撒母耳记下 2 Samuel', id: '2SA', chapters: 24 },
  { name: '列王纪上 1 Kings', id: '1KI', chapters: 22 },
  { name: '列王纪下 2 Kings', id: '2KI', chapters: 25 },
  { name: '历代志上 1 Chronicles', id: '1CH', chapters: 29 },
  { name: '历代志下 2 Chronicles', id: '2CH', chapters: 36 },
  { name: '以斯拉记 Ezra', id: 'EZR', chapters: 10 },
  { name: '尼希米记 Nehemiah', id: 'NEH', chapters: 13 },
  { name: '以斯帖记 Esther', id: 'EST', chapters: 10 },
  { name: '约伯记 Job', id: 'JOB', chapters: 42 },
  { name: '诗篇 Psalms', id: 'PSA', chapters: 150 },
  { name: '箴言 Proverbs', id: 'PRO', chapters: 31 },
  { name: '传道书 Ecclesiastes', id: 'ECC', chapters: 12 },
  { name: '雅歌 Song of Solomon', id: 'SNG', chapters: 8 },
  { name: '以赛亚书 Isaiah', id: 'ISA', chapters: 66 },
  { name: '耶利米书 Jeremiah', id: 'JER', chapters: 52 },
  { name: '耶利米哀歌 Lamentations', id: 'LAM', chapters: 5 },
  { name: '以西结书 Ezekiel', id: 'EZK', chapters: 48 },
  { name: '但以理书 Daniel', id: 'DAN', chapters: 12 },
  { name: '何西阿书 Hosea', id: 'HOS', chapters: 14 },
  { name: '约珥书 Joel', id: 'JOE', chapters: 3 },
  { name: '阿摩司书 Amos', id: 'AMO', chapters: 9 },
  { name: '俄巴底亚书 Obadiah', id: 'OBA', chapters: 1 },
  { name: '约拿书 Jonah', id: 'JON', chapters: 4 },
  { name: '弥迦书 Micah', id: 'MIC', chapters: 7 },
  { name: '那鸿书 Nahum', id: 'NAM', chapters: 3 },
  { name: '哈巴谷书 Habakkuk', id: 'HAB', chapters: 3 },
  { name: '西番雅书 Zephaniah', id: 'ZEP', chapters: 3 },
  { name: '哈该书 Haggai', id: 'HAG', chapters: 2 },
  { name: '撒迦利亚书 Zechariah', id: 'ZEC', chapters: 14 },
  { name: '玛拉基书 Malachi', id: 'MAL', chapters: 4 },
  { name: '马太福音 Matthew', id: 'MAT', chapters: 28 },
  { name: '马可福音 Mark', id: 'MRK', chapters: 16 },
  { name: '路加福音 Luke', id: 'LUK', chapters: 24 },
  { name: '约翰福音 John', id: 'JHN', chapters: 21 },
  { name: '使徒行传 Acts', id: 'ACT', chapters: 28 },
  { name: '罗马书 Romans', id: 'ROM', chapters: 16 },
  { name: '哥林多前书 1 Corinthians', id: '1CO', chapters: 16 },
  { name: '哥林多后书 2 Corinthians', id: '2CO', chapters: 13 },
  { name: '加拉太书 Galatians', id: 'GAL', chapters: 6 },
  { name: '以弗所书 Ephesians', id: 'EPH', chapters: 6 },
  { name: '腓立比书 Philippians', id: 'PHP', chapters: 4 },
  { name: '歌罗西书 Colossians', id: 'COL', chapters: 4 },
  { name: '帖撒罗尼迦前书 1 Thessalonians', id: '1TH', chapters: 5 },
  { name: '帖撒罗尼迦后书 2 Thessalonians', id: '2TH', chapters: 3 },
  { name: '提摩太前书 1 Timothy', id: '1TI', chapters: 6 },
  { name: '提摩太后书 2 Timothy', id: '2TI', chapters: 4 },
  { name: '提多书 Titus', id: 'TIT', chapters: 3 },
  { name: '腓利门书 Philemon', id: 'PHM', chapters: 1 },
  { name: '希伯来书 Hebrews', id: 'HEB', chapters: 13 },
  { name: '雅各书 James', id: 'JAS', chapters: 5 },
  { name: '彼得前书 1 Peter', id: '1PE', chapters: 5 },
  { name: '彼得后书 2 Peter', id: '2PE', chapters: 3 },
  { name: '约翰一书 1 John', id: '1JN', chapters: 5 },
  { name: '约翰二书 2 John', id: '2JN', chapters: 1 },
  { name: '约翰三书 3 John', id: '3JN', chapters: 1 },
  { name: '犹大书 Jude', id: 'JUD', chapters: 1 },
  { name: '启示录 Revelation', id: 'REV', chapters: 22 },
];

/** Chinese abbreviation → book ID (includes both short and full names) */
export const CHINESE_ABBREV_TO_BOOK_ID: Record<string, string> = {
  '创': 'GEN', '出': 'EXO', '利': 'LEV', '民': 'NUM', '申': 'DEU',
  '书': 'JOS', '士': 'JDG', '得': 'RUT',
  '撒上': '1SA', '撒下': '2SA', '王上': '1KI', '王下': '2KI',
  '代上': '1CH', '代下': '2CH', '拉': 'EZR', '尼': 'NEH', '斯': 'EST',
  '伯': 'JOB', '诗': 'PSA', '箴': 'PRO', '传': 'ECC', '歌': 'SNG',
  '赛': 'ISA', '耶': 'JER', '哀': 'LAM', '结': 'EZK', '但': 'DAN',
  '何': 'HOS', '珥': 'JOE', '摩': 'AMO', '俄': 'OBA', '拿': 'JON',
  '弥': 'MIC', '鸿': 'NAM', '哈': 'HAB', '番': 'ZEP', '该': 'HAG',
  '亚': 'ZEC', '玛': 'MAL',
  '太': 'MAT', '可': 'MRK', '路': 'LUK', '约': 'JHN', '徒': 'ACT',
  '罗': 'ROM', '林前': '1CO', '林后': '2CO', '加': 'GAL', '弗': 'EPH',
  '腓': 'PHP', '西': 'COL', '帖前': '1TH', '帖后': '2TH',
  '提前': '1TI', '提后': '2TI', '多': 'TIT', '门': 'PHM',
  '来': 'HEB', '雅': 'JAS', '彼前': '1PE', '彼后': '2PE',
  '约壹': '1JN', '约贰': '2JN', '约叁': '3JN', '犹': 'JUD', '启': 'REV',
  // Full Chinese names
  '创世记': 'GEN', '出埃及记': 'EXO', '利未记': 'LEV', '民数记': 'NUM', '申命记': 'DEU',
  '约书亚记': 'JOS', '士师记': 'JDG', '路得记': 'RUT',
  '撒母耳记上': '1SA', '撒母耳记下': '2SA', '列王纪上': '1KI', '列王纪下': '2KI',
  '历代志上': '1CH', '历代志下': '2CH', '以斯拉记': 'EZR', '尼希米记': 'NEH', '以斯帖记': 'EST',
  '约伯记': 'JOB', '诗篇': 'PSA', '箴言': 'PRO', '传道书': 'ECC', '雅歌': 'SNG',
  '以赛亚书': 'ISA', '耶利米书': 'JER', '耶利米哀歌': 'LAM', '以西结书': 'EZK', '但以理书': 'DAN',
  '何西阿书': 'HOS', '约珥书': 'JOE', '阿摩司书': 'AMO', '俄巴底亚书': 'OBA', '约拿书': 'JON',
  '弥迦书': 'MIC', '那鸿书': 'NAM', '哈巴谷书': 'HAB', '西番雅书': 'ZEP', '哈该书': 'HAG',
  '撒迦利亚书': 'ZEC', '玛拉基书': 'MAL',
  '马太福音': 'MAT', '马可福音': 'MRK', '路加福音': 'LUK', '约翰福音': 'JHN', '使徒行传': 'ACT',
  '罗马书': 'ROM', '哥林多前书': '1CO', '哥林多后书': '2CO', '加拉太书': 'GAL', '以弗所书': 'EPH',
  '腓立比书': 'PHP', '歌罗西书': 'COL', '帖撒罗尼迦前书': '1TH', '帖撒罗尼迦后书': '2TH',
  '提摩太前书': '1TI', '提摩太后书': '2TI', '提多书': 'TIT', '腓利门书': 'PHM',
  '希伯来书': 'HEB', '雅各书': 'JAS', '彼得前书': '1PE', '彼得后书': '2PE',
  '约翰一书': '1JN', '约翰二书': '2JN', '约翰三书': '3JN', '犹大书': 'JUD', '启示录': 'REV',
};

/** Book ID → Chinese name (derived from BIBLE_BOOKS) */
export const BOOK_ID_TO_CHINESE_NAME: Record<string, string> = Object.fromEntries(
  BIBLE_BOOKS.map(b => [b.id, b.name.split(' ')[0]])
);

/** Book ID → Book index (for sorting) */
const BOOK_INDEX: Record<string, number> = Object.fromEntries(
  BIBLE_BOOKS.map((b, i) => [b.id, i])
);

/** Get book by ID */
export const getBookById = (bookId: string): Book | undefined =>
  BIBLE_BOOKS.find(b => b.id === bookId);

/** Get Chinese name for a book ID */
export const getChineseName = (bookId: string): string =>
  BOOK_ID_TO_CHINESE_NAME[bookId] || bookId;

/** Get the sort index for a book ID (useful for ordering) */
export const getBookIndex = (bookId: string): number =>
  BOOK_INDEX[bookId] ?? 999;

/** Total chapters in the entire Bible */
export const TOTAL_CHAPTERS = BIBLE_BOOKS.reduce((sum, b) => sum + b.chapters, 0);

/** Old Testament books (first 39) */
export const OT_BOOKS = BIBLE_BOOKS.slice(0, 39);

/** New Testament books (last 27) */
export const NT_BOOKS = BIBLE_BOOKS.slice(39);

/** Parse a Bible reference string (Chinese or English) into structured data */
export const parseBibleReference = (text: string): { bookId: string; chapter: number; verses?: number[] } | null => {
  // Try Chinese reference
  const chineseBookNames = Object.keys(CHINESE_ABBREV_TO_BOOK_ID)
    .sort((a, b) => b.length - a.length) // longest first to avoid partial matches
    .join('|');
  const chinesePattern = new RegExp(`(${chineseBookNames})\\s*(\\d+):(\\d+)(?:-(\\d+))?`);
  const chineseMatch = text.match(chinesePattern);

  if (chineseMatch) {
    const bookId = CHINESE_ABBREV_TO_BOOK_ID[chineseMatch[1]];
    if (!bookId) return null;
    const chapter = parseInt(chineseMatch[2]);
    const verseStart = parseInt(chineseMatch[3]);
    const verseEnd = chineseMatch[4] ? parseInt(chineseMatch[4]) : undefined;
    const verses: number[] = [];
    if (verseEnd) {
      for (let v = verseStart; v <= verseEnd; v++) verses.push(v);
    } else {
      verses.push(verseStart);
    }
    return { bookId, chapter, verses };
  }

  // Try English reference (e.g., "Genesis 1:1" or "GEN 1:1")
  for (const book of BIBLE_BOOKS) {
    const englishName = book.name.split(' ').slice(1).join(' '); // "Genesis", "1 Samuel", etc.
    const patterns = [
      new RegExp(`${englishName}\\s+(\\d+):(\\d+)(?:-(\\d+))?`, 'i'),
      new RegExp(`${book.id}\\s*(\\d+):(\\d+)(?:-(\\d+))?`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const chapter = parseInt(match[1]);
        const verseStart = parseInt(match[2]);
        const verseEnd = match[3] ? parseInt(match[3]) : undefined;
        const verses: number[] = [];
        if (verseEnd) {
          for (let v = verseStart; v <= verseEnd; v++) verses.push(v);
        } else {
          verses.push(verseStart);
        }
        return { bookId: book.id, chapter, verses };
      }
    }
  }

  return null;
};

import { BIBLE_BOOKS, CHINESE_ABBREV_TO_BOOK_ID } from '../constants';

export interface BibleRef {
  bookId: string;
  chapter: number;
  verses?: number[];
}

const CHINESE_BOOK_MAP = CHINESE_ABBREV_TO_BOOK_ID;

const ENGLISH_BOOK_ALIASES: Record<string, string> = {
  'Psalm': 'Psalms',
  'Song of Solomon': 'Song of Songs',
  'Revelation': 'Revelations',
  'Revelations': 'Revelation',
};

const BOOK_ID_TO_ENGLISH: Record<string, string> = {};
BIBLE_BOOKS.forEach(book => {
  const parts = book.name.split(' ');
  BOOK_ID_TO_ENGLISH[book.id] = parts.slice(1).join(' ');
});

export { BOOK_ID_TO_ENGLISH };

function buildVerseRange(start: number, end?: number): number[] {
  const verses: number[] = [];
  const limit = end ?? start;
  for (let v = start; v <= limit; v++) verses.push(v);
  return verses;
}

export function parseBibleReference(text: string): BibleRef | null {
  const chineseRef = parseChineseReference(text);
  if (chineseRef) return chineseRef;

  return parseEnglishReference(text);
}

function parseChineseReference(text: string): BibleRef | null {
  const chineseBookNames = Object.keys(CHINESE_BOOK_MAP)
    .sort((a, b) => b.length - a.length)
    .join('|');

  // Chinese with chapter:verse
  const versePattern = new RegExp(`《?(${chineseBookNames})》?\\s*(\\d+)[:：](\\d+)(?:-(\\d+))?`);
  const verseMatch = text.match(versePattern);

  if (verseMatch) {
    const bookId = CHINESE_BOOK_MAP[verseMatch[1]];
    if (!bookId) return null;
    return {
      bookId,
      chapter: parseInt(verseMatch[2]),
      verses: buildVerseRange(parseInt(verseMatch[3]), verseMatch[4] ? parseInt(verseMatch[4]) : undefined),
    };
  }

  // Chinese chapter-only (e.g., "希伯来书95章")
  const chapterPattern = new RegExp(`《?(${chineseBookNames})》?\\s*(\\d+)[章篇]`);
  const chapterMatch = text.match(chapterPattern);

  if (chapterMatch) {
    const bookId = CHINESE_BOOK_MAP[chapterMatch[1]];
    if (!bookId) return null;
    return { bookId, chapter: parseInt(chapterMatch[2]) };
  }

  return null;
}

function parseEnglishReference(text: string): BibleRef | null {
  const englishNames = BIBLE_BOOKS.map(b => b.name.split(' ').slice(1).join(' '));
  const allNames = [...englishNames, ...Object.keys(ENGLISH_BOOK_ALIASES)];
  const escaped = allNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  const refPattern = new RegExp(`(${escaped})\\s+(\\d+)[:：](\\d+)(?:-(\\d+))?`, 'i');
  const match = text.match(refPattern);

  if (!match) return null;

  let bookName = match[1];
  const alias = ENGLISH_BOOK_ALIASES[bookName]
    || ENGLISH_BOOK_ALIASES[bookName.charAt(0).toUpperCase() + bookName.slice(1)];
  if (alias) bookName = alias;

  const book = BIBLE_BOOKS.find(b => {
    const englishName = b.name.split(' ').slice(1).join(' ');
    return englishName.toLowerCase() === bookName.toLowerCase();
  });
  if (!book) return null;

  return {
    bookId: book.id,
    chapter: parseInt(match[2]),
    verses: buildVerseRange(parseInt(match[3]), match[4] ? parseInt(match[4]) : undefined),
  };
}

export function parseMessage(content: string, role: string) {
  if (role === 'assistant') {
    const parts = content.split('[SPLIT]');
    if (parts.length >= 2) {
      return { zh: parts[0]?.trim() || '', en: parts[1]?.trim() || '' };
    }
    return { zh: content, en: 'Analysis in progress...' };
  }

  if (content.includes('中文:') && content.includes('English:')) {
    const zhMatch = content.match(/中文:([\s\S]*?)English:/);
    const enMatch = content.match(/English:([\s\S]*)$/);
    const prefixMatch = content.match(/^([\s\S]*?)\n\n\[/);
    const suffixMatch = content.match(/\]\n中文:[\s\S]*?\n\n([\s\S]*)$/);

    const prefix = prefixMatch ? prefixMatch[1].trim() : '';
    const suffix = suffixMatch ? suffixMatch[1].trim() : '';

    return {
      zh: (prefix ? prefix + '\n\n' : '') + (zhMatch ? zhMatch[1].trim() : content) + (suffix ? '\n\n' + suffix : ''),
      en: enMatch ? enMatch[1].trim() : content,
    };
  }

  return { zh: content, en: content };
}

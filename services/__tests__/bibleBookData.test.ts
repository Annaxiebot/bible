import { describe, it, expect } from 'vitest';
import {
  BIBLE_BOOKS,
  CHINESE_ABBREV_TO_BOOK_ID,
  BOOK_ID_TO_CHINESE_NAME,
  getBookById,
  getChineseName,
  getBookIndex,
  TOTAL_CHAPTERS,
  OT_BOOKS,
  NT_BOOKS,
  parseBibleReference
} from '../bibleBookData';

describe('bibleBookData', () => {
  describe('BIBLE_BOOKS constant', () => {
    it('should contain all 66 books of the Bible', () => {
      expect(BIBLE_BOOKS.length).toBe(66);
    });

    it('should have unique book IDs', () => {
      const ids = BIBLE_BOOKS.map(b => b.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(66);
    });

    it('should start with Genesis and end with Revelation', () => {
      expect(BIBLE_BOOKS[0].id).toBe('GEN');
      expect(BIBLE_BOOKS[65].id).toBe('REV');
    });

    it('should have correct chapter counts for key books', () => {
      const genesis = BIBLE_BOOKS.find(b => b.id === 'GEN');
      const psalms = BIBLE_BOOKS.find(b => b.id === 'PSA');
      const philemon = BIBLE_BOOKS.find(b => b.id === 'PHM');

      expect(genesis?.chapters).toBe(50);
      expect(psalms?.chapters).toBe(150);
      expect(philemon?.chapters).toBe(1);
    });
  });

  describe('OT_BOOKS and NT_BOOKS', () => {
    it('should have 39 Old Testament books', () => {
      expect(OT_BOOKS.length).toBe(39);
    });

    it('should have 27 New Testament books', () => {
      expect(NT_BOOKS.length).toBe(27);
    });

    it('Old Testament should end with Malachi', () => {
      expect(OT_BOOKS[38].id).toBe('MAL');
    });

    it('New Testament should start with Matthew', () => {
      expect(NT_BOOKS[0].id).toBe('MAT');
    });
  });

  describe('TOTAL_CHAPTERS', () => {
    it('should equal 1189 chapters', () => {
      // Standard Bible has 1,189 chapters
      expect(TOTAL_CHAPTERS).toBe(1189);
    });
  });

  describe('CHINESE_ABBREV_TO_BOOK_ID', () => {
    it('should map Chinese abbreviations to book IDs', () => {
      expect(CHINESE_ABBREV_TO_BOOK_ID['创']).toBe('GEN');
      expect(CHINESE_ABBREV_TO_BOOK_ID['诗']).toBe('PSA');
      expect(CHINESE_ABBREV_TO_BOOK_ID['太']).toBe('MAT');
    });

    it('should map full Chinese names to book IDs', () => {
      expect(CHINESE_ABBREV_TO_BOOK_ID['创世记']).toBe('GEN');
      expect(CHINESE_ABBREV_TO_BOOK_ID['诗篇']).toBe('PSA');
      expect(CHINESE_ABBREV_TO_BOOK_ID['马太福音']).toBe('MAT');
    });

    it('should handle multi-character abbreviations', () => {
      expect(CHINESE_ABBREV_TO_BOOK_ID['撒上']).toBe('1SA');
      expect(CHINESE_ABBREV_TO_BOOK_ID['林前']).toBe('1CO');
      expect(CHINESE_ABBREV_TO_BOOK_ID['约壹']).toBe('1JN');
    });
  });

  describe('getBookById', () => {
    it('should return book for valid ID', () => {
      const book = getBookById('GEN');
      expect(book).toBeDefined();
      expect(book?.name).toContain('创世记');
      expect(book?.chapters).toBe(50);
    });

    it('should return undefined for invalid ID', () => {
      expect(getBookById('INVALID')).toBeUndefined();
      expect(getBookById('')).toBeUndefined();
    });
  });

  describe('getChineseName', () => {
    it('should return Chinese name for valid book ID', () => {
      expect(getChineseName('GEN')).toBe('创世记');
      expect(getChineseName('REV')).toBe('启示录');
    });

    it('should return the ID itself for unknown book', () => {
      expect(getChineseName('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('getBookIndex', () => {
    it('should return correct index for books', () => {
      expect(getBookIndex('GEN')).toBe(0);
      expect(getBookIndex('REV')).toBe(65);
      expect(getBookIndex('MAT')).toBe(39);
    });

    it('should return 999 for unknown books', () => {
      expect(getBookIndex('UNKNOWN')).toBe(999);
    });
  });

  describe('parseBibleReference', () => {
    describe('Chinese references', () => {
      it('should parse full Chinese book names', () => {
        const result = parseBibleReference('创世记1:1');
        expect(result).toEqual({
          bookId: 'GEN',
          chapter: 1,
          verses: [1]
        });
      });

      it('should parse Chinese abbreviations', () => {
        const result = parseBibleReference('诗23:1');
        expect(result).toEqual({
          bookId: 'PSA',
          chapter: 23,
          verses: [1]
        });
      });

      it('should parse verse ranges', () => {
        const result = parseBibleReference('约翰福音3:16-18');
        expect(result).toEqual({
          bookId: 'JHN',
          chapter: 3,
          verses: [16, 17, 18]
        });
      });

      it('should handle whitespace between book and chapter', () => {
        const result = parseBibleReference('诗篇 23:1');
        expect(result).toEqual({
          bookId: 'PSA',
          chapter: 23,
          verses: [1]
        });
      });
    });

    describe('English references', () => {
      it('should parse English book names', () => {
        const result = parseBibleReference('Genesis 1:1');
        expect(result).toEqual({
          bookId: 'GEN',
          chapter: 1,
          verses: [1]
        });
      });

      it('should parse book IDs', () => {
        const result = parseBibleReference('JHN 3:16');
        expect(result).toEqual({
          bookId: 'JHN',
          chapter: 3,
          verses: [16]
        });
      });

      it('should be case insensitive', () => {
        const result = parseBibleReference('genesis 1:1');
        expect(result).toEqual({
          bookId: 'GEN',
          chapter: 1,
          verses: [1]
        });
      });
    });

    describe('invalid references', () => {
      it('should return null for invalid input', () => {
        expect(parseBibleReference('')).toBeNull();
        expect(parseBibleReference('random text')).toBeNull();
        expect(parseBibleReference('123')).toBeNull();
      });

      it('should return null for malformed references', () => {
        expect(parseBibleReference('Genesis')).toBeNull();
        expect(parseBibleReference('Genesis 1')).toBeNull();
      });
    });
  });
});

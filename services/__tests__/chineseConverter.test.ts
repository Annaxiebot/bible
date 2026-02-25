import { describe, it, expect } from 'vitest';
import { toSimplified, toTraditional } from '../chineseConverter';

describe('chineseConverter', () => {
  describe('toSimplified', () => {
    it('should convert traditional Chinese to simplified', () => {
      expect(toSimplified('聖經')).toBe('圣经');
      expect(toSimplified('愛')).toBe('爱');
      expect(toSimplified('書')).toBe('书');
    });

    it('should convert characters that were missing from the old 291-entry table', () => {
      // These all appeared broken in CUV Bible text (Numbers 2)
      expect(toSimplified('諭')).toBe('谕');   // 晓諭 (speak/instruct)
      expect(toSimplified('歸')).toBe('归');   // 歸自己
      expect(toSimplified('旗號')).toBe('旗号'); // 旗號 (banner/standard)
      expect(toSimplified('裏')).toBe('里');   // 那裏
      expect(toSimplified('節')).toBe('节');   // 章節
    });

    it('should convert a full CUV Bible verse', () => {
      const traditional = '耶和華曉諭摩西、亞倫說：以色列人要各歸自己的麾下，在本族的旗號那裏';
      const simplified  = '耶和华晓谕摩西、亚伦说：以色列人要各归自己的麾下，在本族的旗号那里';
      expect(toSimplified(traditional)).toBe(simplified);
    });

    it('should leave already simplified text unchanged', () => {
      expect(toSimplified('圣经')).toBe('圣经');
      expect(toSimplified('爱')).toBe('爱');
    });

    it('should leave English text unchanged', () => {
      expect(toSimplified('Hello World')).toBe('Hello World');
      expect(toSimplified('Bible Study')).toBe('Bible Study');
    });

    it('should handle mixed text', () => {
      expect(toSimplified('聖經 Bible Study')).toBe('圣经 Bible Study');
    });

    it('should handle empty string', () => {
      expect(toSimplified('')).toBe('');
    });

    it('should handle numbers and punctuation', () => {
      expect(toSimplified('第1章')).toBe('第1章');
      expect(toSimplified('聖經第1章')).toBe('圣经第1章');
      expect(toSimplified('節')).toBe('节');
    });
  });

  describe('toTraditional', () => {
    it('should convert simplified Chinese to traditional', () => {
      expect(toTraditional('圣经')).toBe('聖經');
      expect(toTraditional('爱')).toBe('愛');
    });

    it('should leave already traditional text unchanged', () => {
      expect(toTraditional('聖經')).toBe('聖經');
    });

    it('should leave English text unchanged', () => {
      expect(toTraditional('Hello World')).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(toTraditional('')).toBe('');
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve text after traditional → simplified → traditional', () => {
      const original = '聖經';
      const simplified = toSimplified(original);
      const backToTraditional = toTraditional(simplified);
      expect(backToTraditional).toBe(original);
    });

    it('should round-trip a full Bible verse', () => {
      const original = '耶和華曉諭摩西、亞倫說：以色列人要各歸自己的麾下';
      const simplified = toSimplified(original);
      const restored = toTraditional(simplified);
      expect(restored).toBe(original);
    });
  });
});

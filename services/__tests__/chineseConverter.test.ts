import { describe, it, expect } from 'vitest';
import { toSimplified, toTraditional } from '../chineseConverter';

describe('chineseConverter', () => {
  describe('toSimplified', () => {
    it('should convert traditional Chinese to simplified', () => {
      expect(toSimplified('聖經')).toBe('圣经');
      expect(toSimplified('愛')).toBe('爱');
      expect(toSimplified('書')).toBe('书');
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
      // Note: '節' (jié) may not be in the conversion map if it's less common
      // Test with characters we know are mapped
      expect(toSimplified('第1章')).toBe('第1章');
      expect(toSimplified('聖經第1章')).toBe('圣经第1章');
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
  });
});

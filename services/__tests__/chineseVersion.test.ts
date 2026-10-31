import { describe, it, expect } from 'vitest';
import {
  normalizeChineseVersion,
  SELECTABLE_CHINESE_VERSIONS,
  DEFAULT_CHINESE_VERSION,
  CHINESE_TRANSLATIONS,
} from '../bibleStorage';

describe('normalizeChineseVersion — CUNP withdrawn, CUV only', () => {
  it('offers CUV as the only selectable Chinese edition', () => {
    expect(SELECTABLE_CHINESE_VERSIONS).toEqual(['cuv']);
    expect(DEFAULT_CHINESE_VERSION).toBe('cuv');
  });

  it('keeps cuv', () => {
    expect(normalizeChineseVersion('cuv')).toBe('cuv');
  });

  it('maps a stale cunp preference to cuv', () => {
    expect(normalizeChineseVersion('cunp')).toBe('cuv');
  });

  it('maps missing or unknown values to cuv', () => {
    expect(normalizeChineseVersion(null)).toBe('cuv');
    expect(normalizeChineseVersion(undefined)).toBe('cuv');
    expect(normalizeChineseVersion('')).toBe('cuv');
    expect(normalizeChineseVersion('bsb')).toBe('cuv');
  });

  it('still classifies previously cached cunp chapters as Chinese (not English)', () => {
    expect(CHINESE_TRANSLATIONS.has('cunp')).toBe(true);
  });
});

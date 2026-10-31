import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBibleSettings } from '../useBibleSettings';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { notifyReaderPreferencesChanged } from '../../services/readerPreferences';
import { installMemoryStorage } from '../../tests/utils/memoryStorage';

vi.mock('../../services/chineseConverter', () => ({ preloadConverter: vi.fn(() => Promise.resolve()) }));

// The global test localStorage is a no-op mock; these tests need values to persist.
beforeEach(() => { installMemoryStorage(); });

// CUNP is withdrawn for now: a stale saved/synced 'cunp' must resolve to CUV so it is never fetched.
describe('useBibleSettings — Chinese edition is CUV-only', () => {
  it('defaults to cuv with no saved preference', () => {
    const { result } = renderHook(() => useBibleSettings());
    expect(result.current.chineseVersion).toBe('cuv');
  });

  it('normalizes a stale saved cunp preference to cuv at initialization', () => {
    localStorage.setItem(STORAGE_KEYS.CHINESE_VERSION, 'cunp');
    const { result } = renderHook(() => useBibleSettings());
    expect(result.current.chineseVersion).toBe('cuv');
  });

  it('normalizes cunp arriving via the bibleChineseVersionChanged path (e.g. after sync)', () => {
    const { result } = renderHook(() => useBibleSettings());
    act(() => {
      localStorage.setItem(STORAGE_KEYS.CHINESE_VERSION, 'cunp');
      notifyReaderPreferencesChanged([STORAGE_KEYS.CHINESE_VERSION]);
    });
    expect(result.current.chineseVersion).toBe('cuv');
  });

  it('normalizes cunp arriving via a cross-tab storage event', () => {
    const { result } = renderHook(() => useBibleSettings());
    act(() => {
      localStorage.setItem(STORAGE_KEYS.CHINESE_VERSION, 'cunp');
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.CHINESE_VERSION, newValue: 'cunp' }));
    });
    expect(result.current.chineseVersion).toBe('cuv');
  });

  it('normalizes cunp passed to setChineseVersion and persists cuv', () => {
    const { result } = renderHook(() => useBibleSettings());
    act(() => result.current.setChineseVersion('cunp'));
    expect(result.current.chineseVersion).toBe('cuv');
    expect(localStorage.getItem(STORAGE_KEYS.CHINESE_VERSION)).toBe('cuv');
  });

  it('leaves the saved English version untouched', () => {
    localStorage.setItem(STORAGE_KEYS.CHINESE_VERSION, 'cunp');
    localStorage.setItem(STORAGE_KEYS.ENGLISH_VERSION, 'kjv');
    const { result } = renderHook(() => useBibleSettings());
    expect(result.current.englishVersion).toBe('kjv');
  });
});

describe('useBibleSettings — converter preload', () => {
  // OpenCC split by direction (2026-10-23): a 简 reader must never pull the 1 MB 简→繁 table at start-up.
  it.each([
    ['simplified', true],
    ['traditional', false],
  ] as const)('a %s reader preloads only that script\'s dictionary', async (script, simplified) => {
    localStorage.setItem(STORAGE_KEYS.CHINESE_MODE, script);
    const { preloadConverter } = await import('../../services/chineseConverter');
    vi.mocked(preloadConverter).mockClear();
    vi.useFakeTimers();
    try {
      renderHook(() => useBibleSettings());
      vi.advanceTimersByTime(300);
      expect(vi.mocked(preloadConverter).mock.calls).toEqual([[simplified]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an unavailable worker does not surface as an unhandled rejection', async () => {
    const { preloadConverter } = await import('../../services/chineseConverter');
    vi.mocked(preloadConverter).mockClear();
    vi.mocked(preloadConverter).mockImplementationOnce(() => Promise.reject(new Error('worker unavailable')));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      vi.useFakeTimers();
      renderHook(() => useBibleSettings());
      vi.advanceTimersByTime(300);
      vi.useRealTimers();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(preloadConverter).toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('useBibleSettings — shared, independent preferences', () => {
  it('normalizes an unknown English edition to BSB', () => {
    localStorage.setItem(STORAGE_KEYS.ENGLISH_VERSION, 'cuv');
    const { result } = renderHook(() => useBibleSettings());
    expect(result.current.englishVersion).toBe('bsb');
  });

  it('a change in one hook instance reaches every other one in the same tab (reader ↔ Settings)', () => {
    const reader = renderHook(() => useBibleSettings());
    const settings = renderHook(() => useBibleSettings());
    act(() => reader.result.current.setEnglishVersion('kjv'));
    expect(settings.result.current.englishVersion).toBe('kjv');
    act(() => settings.result.current.setEnglishVersion('ylt'));
    expect(reader.result.current.englishVersion).toBe('ylt');
  });

  it('follows another tab via the storage event', () => {
    const { result } = renderHook(() => useBibleSettings());
    act(() => {
      localStorage.setItem(STORAGE_KEYS.ENGLISH_VERSION, 'asv');
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.ENGLISH_VERSION, newValue: 'asv' }));
    });
    expect(result.current.englishVersion).toBe('asv');
  });

  it('script, interface language and editions change independently', () => {
    const { result } = renderHook(() => useBibleSettings());
    act(() => result.current.setUiLanguage('en'));
    expect(result.current.uiLanguage).toBe('en');
    expect(result.current.isSimplified).toBe(true);
    expect(result.current.englishVersion).toBe('bsb');
    act(() => result.current.setIsSimplified(false));
    expect(result.current.isSimplified).toBe(false);
    expect(result.current.uiLanguage).toBe('en');
    expect(localStorage.getItem(STORAGE_KEYS.CHINESE_MODE)).toBe('traditional');
    expect(localStorage.getItem(STORAGE_KEYS.UI_LANGUAGE)).toBe('en');
  });
});

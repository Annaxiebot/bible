import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import {
  getReaderPreferences, setReaderPreference, subscribeReaderPreferences, notifyReaderPreferencesChanged,
  normalizeEnglishVersion, normalizeUiLanguage, normalizeChineseScript, ENGLISH_EDITIONS, READER_PREFS_EVENT,
} from '../readerPreferences';
import { chosenEnglishVersion } from '../bibleStorage';
import { SYNCED_SETTINGS_KEYS } from '../syncService';
import { installMemoryStorage } from '../../tests/utils/memoryStorage';

beforeEach(() => { installMemoryStorage(); });

describe('readerPreferences', () => {
  it('offers the six English editions the reader header lists', () => {
    expect(ENGLISH_EDITIONS.map(e => e.id)).toEqual(['bsb', 'web', 'kjv', 'asv', 'bbe', 'ylt']);
  });

  it('defaults: 中文 interface, Simplified, CUV, BSB', () => {
    expect(getReaderPreferences()).toEqual({
      uiLanguage: 'zh', chineseScript: 'simplified', chineseVersion: 'cuv', englishVersion: 'bsb',
    });
  });

  it('normalizes stale or corrupt values (withdrawn CUNP, unknown editions, bad language)', () => {
    localStorage.setItem(STORAGE_KEYS.CHINESE_VERSION, 'cunp');
    localStorage.setItem(STORAGE_KEYS.ENGLISH_VERSION, 'niv');
    localStorage.setItem(STORAGE_KEYS.UI_LANGUAGE, 'fr');
    localStorage.setItem(STORAGE_KEYS.CHINESE_MODE, 'pinyin');
    expect(getReaderPreferences()).toEqual({
      uiLanguage: 'zh', chineseScript: 'simplified', chineseVersion: 'cuv', englishVersion: 'bsb',
    });
    expect(normalizeEnglishVersion('cuv')).toBe('bsb');
    expect(normalizeUiLanguage('en')).toBe('en');
    expect(normalizeChineseScript('traditional')).toBe('traditional');
    expect(chosenEnglishVersion()).toBe('bsb');
  });

  it('a write persists the normalized value and notifies same-tab listeners, legacy events included', () => {
    const listener = vi.fn();
    const legacy = vi.fn();
    const unsubscribe = subscribeReaderPreferences(listener);
    window.addEventListener('bibleChineseVersionChanged', legacy);
    expect(setReaderPreference('chineseVersion', 'cunp')).toBe('cuv');
    expect(localStorage.getItem(STORAGE_KEYS.CHINESE_VERSION)).toBe('cuv');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(legacy).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.removeEventListener('bibleChineseVersionChanged', legacy);
    setReaderPreference('englishVersion', 'kjv');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('cross-tab: a storage event for a preference key notifies; unrelated keys do not', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReaderPreferences(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'x' }));
    expect(listener).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.ENGLISH_VERSION, newValue: 'web' }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('snapshot identity is stable until a value changes (useSyncExternalStore contract)', () => {
    const a = getReaderPreferences();
    expect(getReaderPreferences()).toBe(a);
    setReaderPreference('uiLanguage', 'en');
    const b = getReaderPreferences();
    expect(b).not.toBe(a);
    expect(b.uiLanguage).toBe('en');
  });

  it('notifyReaderPreferencesChanged (sync pull / restore) dispatches the shared event', () => {
    const seen = vi.fn();
    window.addEventListener(READER_PREFS_EVENT, seen);
    notifyReaderPreferencesChanged([STORAGE_KEYS.ENGLISH_VERSION]);
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(READER_PREFS_EVENT, seen);
  });

  it('the interface language follows the account like the other reader settings', () => {
    expect(SYNCED_SETTINGS_KEYS).toContain(STORAGE_KEYS.UI_LANGUAGE);
    expect(SYNCED_SETTINGS_KEYS).toContain(STORAGE_KEYS.CHINESE_MODE);
  });
});

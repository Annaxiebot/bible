import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { preloadConverter } from '../services/chineseConverter';
import { useReaderPreferences, setReaderPreference } from '../services/readerPreferences';

/**
 * The reader's settings. Editions, script and interface language live in the
 * shared reader-preferences store (services/readerPreferences), so the header,
 * Settings, settings sync and other tabs always agree; every value is normalized
 * there (a stale saved 'cunp' — withdrawn edition — resolves to CUV and is never fetched).
 */
export function useBibleSettings() {
  const prefs = useReaderPreferences();
  const isSimplified = prefs.chineseScript === 'simplified';

  // Bundled CUV text is Simplified while API-cached text is Traditional, so both
  // display modes convert: preload the current script's dictionary only (a 简
  // reader never downloads the 1 MB 简→繁 table; toggling to 繁 preloads it).
  useEffect(() => {
    const defer = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 200));
    // An unavailable worker/dictionary is not fatal: conversions fall back per call.
    defer(() => { preloadConverter(isSimplified).catch(() => {}); });
    // Once, for the script at start-up (empty deps on purpose): a 简/繁 toggle preloads its own (BibleViewer).
  }, []);

  const setIsSimplified = useCallback((simplified: boolean) => {
    setReaderPreference('chineseScript', simplified ? 'simplified' : 'traditional');
  }, []);
  const setChineseVersion = useCallback((version: string) => {
    setReaderPreference('chineseVersion', version);
  }, []);
  const setEnglishVersion = useCallback((version: string) => {
    setReaderPreference('englishVersion', version);
  }, []);
  const setUiLanguage = useCallback((language: string) => {
    setReaderPreference('uiLanguage', language);
  }, []);

  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FONT_SIZE);
    const parsed = saved ? parseInt(saved) : NaN;
    return Number.isFinite(parsed) ? parsed : 18;
  });

  return {
    isSimplified,
    setIsSimplified,
    chineseVersion: prefs.chineseVersion as string,
    setChineseVersion,
    englishVersion: prefs.englishVersion as string,
    setEnglishVersion,
    uiLanguage: prefs.uiLanguage,
    setUiLanguage,
    fontSize,
    setFontSize,
  };
}

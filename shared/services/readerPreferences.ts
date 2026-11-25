/**
 * readerPreferences.ts — the reader's four independent choices, one store · 阅读偏好
 *
 * Interface language, Chinese script, Chinese edition and English edition
 * are separate settings (2026-10 review): the language of buttons and
 * errors never changes which Bible text loads, and 简/繁 only changes how
 * the Chinese column is written. Every writer (reader header, Settings
 * sidebar, settings sync, backup restore) goes through here, so the reader
 * and Settings can never disagree: a write persists to localStorage and
 * notifies this tab (READER_PREFS_EVENT + the legacy per-key events), and
 * other tabs learn of it from the browser's `storage` event.
 */
import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';
import {
  BibleTranslation, DEFAULT_ENGLISH_VERSION, ENGLISH_TRANSLATIONS, normalizeChineseVersion,
} from './bibleStorage';

export type UiLanguage = 'zh' | 'en';
export type ChineseScript = 'simplified' | 'traditional';

export interface EnglishEdition {
  id: BibleTranslation;
  short: string;
  name: string;
}

/** Every English edition the reader offers — the header and Settings both list exactly these. */
export const ENGLISH_EDITIONS: readonly EnglishEdition[] = [
  { id: 'bsb', short: 'BSB', name: 'Berean Standard Bible' },
  { id: 'web', short: 'WEB', name: 'World English Bible' },
  { id: 'kjv', short: 'KJV', name: 'King James Version' },
  { id: 'asv', short: 'ASV', name: 'American Standard Version' },
  { id: 'bbe', short: 'BBE', name: 'Bible in Basic English' },
  { id: 'ylt', short: 'YLT', name: "Young's Literal Translation" },
];

export const DEFAULT_UI_LANGUAGE: UiLanguage = 'zh';
export const DEFAULT_CHINESE_SCRIPT: ChineseScript = 'simplified';

/** Fired on window (same tab) after any reader preference changes. */
export const READER_PREFS_EVENT = 'readerPreferencesChanged';
/** Older per-key events; still dispatched so existing listeners keep working. */
export const LEGACY_EVENTS: Partial<Record<string, string>> = {
  [STORAGE_KEYS.ENGLISH_VERSION]: 'bibleEnglishVersionChanged',
  [STORAGE_KEYS.CHINESE_VERSION]: 'bibleChineseVersionChanged',
};

export const READER_PREF_KEYS = [
  STORAGE_KEYS.UI_LANGUAGE,
  STORAGE_KEYS.CHINESE_MODE,
  STORAGE_KEYS.CHINESE_VERSION,
  STORAGE_KEYS.ENGLISH_VERSION,
] as const;

export function normalizeEnglishVersion(value: string | null | undefined): BibleTranslation {
  return ENGLISH_TRANSLATIONS.has(value as BibleTranslation) ? (value as BibleTranslation) : DEFAULT_ENGLISH_VERSION;
}

export function normalizeUiLanguage(value: string | null | undefined): UiLanguage {
  return value === 'en' || value === 'zh' ? value : DEFAULT_UI_LANGUAGE;
}

export function normalizeChineseScript(value: string | null | undefined): ChineseScript {
  return value === 'traditional' || value === 'simplified' ? value : DEFAULT_CHINESE_SCRIPT;
}

export interface ReaderPreferences {
  uiLanguage: UiLanguage;
  chineseScript: ChineseScript;
  chineseVersion: BibleTranslation;
  englishVersion: BibleTranslation;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

let cached: ReaderPreferences | null = null;

/** Current preferences, normalized (a withdrawn 'cunp' or unknown edition never escapes). Stable identity until a change. */
export function getReaderPreferences(): ReaderPreferences {
  const next: ReaderPreferences = {
    uiLanguage: normalizeUiLanguage(read(STORAGE_KEYS.UI_LANGUAGE)),
    chineseScript: normalizeChineseScript(read(STORAGE_KEYS.CHINESE_MODE)),
    chineseVersion: normalizeChineseVersion(read(STORAGE_KEYS.CHINESE_VERSION)),
    englishVersion: normalizeEnglishVersion(read(STORAGE_KEYS.ENGLISH_VERSION)),
  };
  if (
    cached &&
    cached.uiLanguage === next.uiLanguage &&
    cached.chineseScript === next.chineseScript &&
    cached.chineseVersion === next.chineseVersion &&
    cached.englishVersion === next.englishVersion
  ) {
    return cached;
  }
  cached = next;
  return next;
}

/**
 * Tell this tab's listeners that preference keys changed outside setReaderPreference
 * (settings sync pull, backup restore). Pass the keys that changed; none = all.
 */
export function notifyReaderPreferencesChanged(keys: readonly string[] = READER_PREF_KEYS): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(READER_PREFS_EVENT, { detail: { keys } }));
  for (const key of keys) {
    const legacy = LEGACY_EVENTS[key];
    if (legacy) window.dispatchEvent(new Event(legacy));
  }
}

const NORMALIZERS: Record<keyof ReaderPreferences, (v: string) => string> = {
  uiLanguage: normalizeUiLanguage,
  chineseScript: normalizeChineseScript,
  chineseVersion: normalizeChineseVersion,
  englishVersion: normalizeEnglishVersion,
};

const KEY_OF: Record<keyof ReaderPreferences, string> = {
  uiLanguage: STORAGE_KEYS.UI_LANGUAGE,
  chineseScript: STORAGE_KEYS.CHINESE_MODE,
  chineseVersion: STORAGE_KEYS.CHINESE_VERSION,
  englishVersion: STORAGE_KEYS.ENGLISH_VERSION,
};

/** Persist one preference (normalized) and notify every listener in this tab. */
export function setReaderPreference<K extends keyof ReaderPreferences>(name: K, value: string): ReaderPreferences[K] {
  const normalized = NORMALIZERS[name](value) as ReaderPreferences[K];
  const key = KEY_OF[name];
  try {
    localStorage.setItem(key, normalized);
  } catch {
    // Private mode / quota: nothing persists; listeners still re-read.
  }
  notifyReaderPreferencesChanged([key]);
  return normalized;
}

export function subscribeReaderPreferences(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    // e.key === null: another tab cleared storage.
    if (e.key === null || (READER_PREF_KEYS as readonly string[]).includes(e.key)) listener();
  };
  window.addEventListener(READER_PREFS_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(READER_PREFS_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The reader preferences, re-rendering on any same-tab or cross-tab change. */
export function useReaderPreferences(): ReaderPreferences {
  return useSyncExternalStore(subscribeReaderPreferences, getReaderPreferences, getReaderPreferences);
}

export function englishEditionLabel(id: string): string {
  return ENGLISH_EDITIONS.find(e => e.id === id)?.short ?? id.toUpperCase();
}

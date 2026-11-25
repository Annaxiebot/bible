/**
 * contentLanguageDefault.ts — the leader's remembered content language · 内容语言默认值
 *
 * The generation form's "内容语言 Content language" select opens on the
 * leader's last choice (localStorage under STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT),
 * falling back to DEFAULT_CONTENT_LANGUAGE on a first visit or an unknown
 * stored value. Storage is injectable for tests. Blocked storage (even a
 * throwing localStorage accessor) never breaks the form (GPT review 2026-11-25).
 */
import { STORAGE_KEYS } from '../../../shared/constants/storageKeys';
import { noteLeaderSettingChanged } from '../../../shared/services/leaderSettingsKeys';
import { ContentLanguage, DEFAULT_CONTENT_LANGUAGE, isContentLanguage } from '../../../shared/studypack/principles';

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

export function readDefaultContentLanguage(store?: KeyStore): ContentLanguage {
  try {
    const stored = (store ?? window.localStorage).getItem(STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT);
    return isContentLanguage(stored) ? stored : DEFAULT_CONTENT_LANGUAGE;
  } catch {
    // Blocked storage: the ordinary default.
    return DEFAULT_CONTENT_LANGUAGE;
  }
}

/** Every generation remembers its choice; the next form opens on it. The sync is told (ADR-0005). */
export function rememberContentLanguage(mode: ContentLanguage, store?: KeyStore): void {
  try {
    (store ?? window.localStorage).setItem(STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT, mode);
    noteLeaderSettingChanged(STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT);
  } catch {
    // Blocked storage: the choice still applies to this generation.
  }
}

/** The worship-songs toggle (ADR-0022 step 2): off on a first visit, remembered like the content language. */
export function readDefaultWorship(store?: KeyStore): boolean {
  try {
    return (store ?? window.localStorage).getItem(STORAGE_KEYS.WORSHIP_SONGS_DEFAULT) === '1';
  } catch {
    return false;
  }
}

export function rememberWorship(on: boolean, store?: KeyStore): void {
  try {
    (store ?? window.localStorage).setItem(STORAGE_KEYS.WORSHIP_SONGS_DEFAULT, on ? '1' : '0');
    noteLeaderSettingChanged(STORAGE_KEYS.WORSHIP_SONGS_DEFAULT);
  } catch {
    // Blocked storage: the toggle still applies to this generation.
  }
}

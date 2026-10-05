/**
 * contentLanguageDefault.ts — the leader's remembered content language · 内容语言默认值
 *
 * The generation form's "内容语言 Content language" select opens on the
 * leader's last choice (localStorage under STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT),
 * falling back to DEFAULT_CONTENT_LANGUAGE on a first visit or an unknown
 * stored value. Storage is injectable for tests.
 */
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { noteLeaderSettingChanged } from '../../services/leaderSettingsKeys';
import { ContentLanguage, DEFAULT_CONTENT_LANGUAGE, isContentLanguage } from '../studypack/principles';

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

export function readDefaultContentLanguage(store: KeyStore = window.localStorage): ContentLanguage {
  const stored = store.getItem(STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT);
  return isContentLanguage(stored) ? stored : DEFAULT_CONTENT_LANGUAGE;
}

/** Every generation remembers its choice; the next form opens on it. The sync is told (ADR-0005). */
export function rememberContentLanguage(mode: ContentLanguage, store: KeyStore = window.localStorage): void {
  store.setItem(STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT, mode);
  noteLeaderSettingChanged(STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT);
}

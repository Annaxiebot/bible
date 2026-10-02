/**
 * feedbackFormDefault.ts — the generation form's optional Google Form link · 反馈表链接
 *
 * Pure helpers for NewStudyForm: validation of the pasted link (a Google
 * Forms URL or empty), and the leader's remembered default ("用于我所有的
 * 查经 Use for all my studies") in localStorage under
 * STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL. Storage is injectable for tests.
 */
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { isGoogleFormUrl } from '../studypack/feedbackForm';
import { NS_ERR_FEEDBACK_FORM } from './newStudyStrings';

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Empty is fine (auto-create or the built-in page); anything else must be a Google Form URL. */
export function validateFeedbackFormUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return isGoogleFormUrl(trimmed) ? null : NS_ERR_FEEDBACK_FORM;
}

export function readDefaultFormUrl(store: KeyStore = window.localStorage): string {
  return store.getItem(STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL) ?? '';
}

/** Remember (or forget, when the box is off or the link empty) the leader's default. */
export function rememberDefaultFormUrl(url: string, useForAll: boolean, store: KeyStore = window.localStorage): void {
  const trimmed = url.trim();
  if (useForAll && trimmed) store.setItem(STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL, trimmed);
  else store.removeItem(STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL);
}

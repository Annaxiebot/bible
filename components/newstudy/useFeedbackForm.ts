/**
 * useFeedbackForm.ts — give a new pack its Google Form · 自动建反馈表
 *
 * When the editor holds a pack with no feedbackFormUrl and the leader is
 * signed in with a provider_token, create the form once (per pack id) and
 * hand the patched pack back through `apply` (the page's onChange, so
 * auto-save stores it and the summary sync carries the URL). A pasted link
 * (generation form / editor field) already fills the URL, so nothing is
 * created. Typed failures become a bilingual notice and the pack keeps the
 * built-in check-in page; `retry` re-attempts (the explicit Save does).
 * Never throws (R5: every outcome is a rendered notice).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { authManager } from '../../services/supabase';
import { createFeedbackForm, FormFailure, FormSource } from '../../services/googleForms';
import {
  NS_FORM_CREATED, NS_FORM_CREATING, NS_FORM_FALLBACK, NS_FORM_NO_TOKEN, NS_FORM_NO_PERMISSION, NS_FORM_API_DISABLED,
  NS_FORM_FAILED,
} from './newStudyStrings';

export interface FormNotice {
  ok: boolean;
  text: string;
  link?: string;
}

export interface FeedbackFormState {
  notice: FormNotice | null;
  retry: () => void;
}

export function failureNotice(failure: FormFailure): FormNotice {
  const cause = failure.kind === 'no-token' ? NS_FORM_NO_TOKEN
    : failure.kind === 'no-permission' ? NS_FORM_NO_PERMISSION
    : failure.kind === 'api-disabled' ? NS_FORM_API_DISABLED
    : `${NS_FORM_FAILED}: ${failure.message}`;
  return { ok: false, text: `${cause}; ${NS_FORM_FALLBACK}` };
}

export function formSourceOf(pack: StudyPack): FormSource {
  const rows = pack.sections.find(s => s.kind === 'lifeMenu')?.rows ?? [];
  return { title: pack.title, practices: rows.map(r => r.practice) };
}

/** The Google access token of the current session, if the sign-in carried one (googleForms scope). */
export function providerToken(): string | null {
  return authManager.getState().session?.provider_token ?? null;
}

export function useFeedbackForm(pack: StudyPack | null, apply: (pack: StudyPack) => void): FeedbackFormState {
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const attempted = useRef<string | null>(null);   // pack id of the last attempt (one try per pack unless retried)
  const latest = useRef(pack);
  latest.current = pack;

  const attempt = useCallback(async () => {
    const current = latest.current;
    if (!current || current.feedbackFormUrl || !authManager.getUserId()) return;
    attempted.current = current.id;
    setNotice({ ok: true, text: NS_FORM_CREATING });
    let result: Awaited<ReturnType<typeof createFeedbackForm>>;
    try {
      result = await createFeedbackForm(formSourceOf(current), providerToken());
    } catch (err) {
      // A network-level failure (fetch TypeError) must reach the user, not leave "creating" spinning.
      setNotice(failureNotice({ kind: 'api', message: err instanceof Error ? err.message : String(err) }));
      return;
    }
    if (latest.current?.id !== current.id) return;   // the editor moved on; nothing to apply
    if (result.ok === false) { setNotice(failureNotice(result.failure)); return; }
    setNotice({ ok: true, text: NS_FORM_CREATED, link: result.responderUri });
    apply({ ...latest.current, feedbackFormUrl: result.responderUri });
  }, [apply]);

  useEffect(() => {
    if (!pack) { setNotice(null); attempted.current = null; return; }
    if (pack.feedbackFormUrl || attempted.current === pack.id) return;
    void attempt();
  }, [pack, attempt]);

  return { notice, retry: () => void attempt() };
}

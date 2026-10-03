/**
 * useFeedbackForm.ts — the editor's Google Forms opt-in · 连接 Google 表单（可选）
 *
 * Nothing happens by default: a pack without feedbackFormUrl uses the
 * built-in check-in page (ADR-0004 §9). `connect` is the leader's explicit
 * choice: with a provider_token in the session it creates the form for this
 * pack at once; without one it remembers the pack id (sessionStorage, like
 * authReturnHash) and re-runs the Google sign-in with the Forms scope —
 * after the redirect lands back in this editor, the remembered id is taken
 * and the form is created. The patched pack goes through `apply` (the
 * page's onChange, so auto-save stores it and the summary sync carries the
 * URL). A pasted link already fills the URL, so nothing is created. Typed
 * failures become a bilingual notice and the pack keeps the built-in page;
 * tapping Connect again retries. Never throws (R5: every outcome is a
 * rendered notice).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { authManager, isSupabaseConfigured } from '../../services/supabase';
import { createFeedbackForm, FormFailure, FormSource } from '../../services/googleForms';
import {
  NS_FORM_CREATED, NS_FORM_CREATING, NS_FORM_CONNECTING, NS_FORM_KEEP_BUILTIN, NS_FORM_NO_TOKEN, NS_FORM_NO_PERMISSION,
  NS_FORM_API_DISABLED, NS_FORM_FAILED,
} from './newStudyStrings';

/** sessionStorage key: the pack id whose Connect tap started the Forms-scope sign-in. */
export const FORMS_CONNECT_KEY = 'forms-connect-pack';

export interface FormNotice {
  ok: boolean;
  text: string;
  link?: string;
}

export interface FeedbackFormState {
  notice: FormNotice | null;
  busy: boolean;
  /** The opt-in; null when there is nothing to sign in to (Supabase not configured). */
  connect: (() => void) | null;
}

export function failureNotice(failure: FormFailure): FormNotice {
  const cause = failure.kind === 'no-token' ? NS_FORM_NO_TOKEN
    : failure.kind === 'no-permission' ? NS_FORM_NO_PERMISSION
    : failure.kind === 'api-disabled' ? NS_FORM_API_DISABLED
    : `${NS_FORM_FAILED}: ${failure.message}`;
  return { ok: false, text: `${cause}; ${NS_FORM_KEEP_BUILTIN}` };
}

export function formSourceOf(pack: StudyPack): FormSource {
  const rows = pack.sections.find(s => s.kind === 'lifeMenu')?.rows ?? [];
  return { title: pack.title, practices: rows.map(r => r.practice) };
}

/** The Google access token of the current session, if the sign-in carried one (Forms scope opt-in). */
export function providerToken(): string | null {
  return authManager.getState().session?.provider_token ?? null;
}

export function rememberConnect(packId: string, store: Storage = window.sessionStorage): void {
  store.setItem(FORMS_CONNECT_KEY, packId);
}

/** True (and consumed) when this pack's Connect tap started the sign-in that just returned. */
export function takeConnect(packId: string, store: Storage = window.sessionStorage): boolean {
  if (store.getItem(FORMS_CONNECT_KEY) !== packId) return false;
  store.removeItem(FORMS_CONNECT_KEY);
  return true;
}

export function useFeedbackForm(pack: StudyPack | null, apply: (pack: StudyPack) => void): FeedbackFormState {
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(pack);
  latest.current = pack;
  const applyRef = useRef(apply);   // stable callbacks: the return-from-sign-in effect must run once per pack, not per render
  applyRef.current = apply;

  const create = useCallback(async (current: StudyPack) => {
    setBusy(true);
    setNotice({ ok: true, text: NS_FORM_CREATING });
    let result: Awaited<ReturnType<typeof createFeedbackForm>>;
    try {
      result = await createFeedbackForm(formSourceOf(current), providerToken());
    } catch (err) {
      // A network-level failure (fetch TypeError) must reach the user, not leave "creating" spinning.
      result = { ok: false, failure: { kind: 'api', message: err instanceof Error ? err.message : String(err) } };
    }
    setBusy(false);
    if (latest.current?.id !== current.id) return;   // the editor moved on; nothing to apply
    if (result.ok === false) { setNotice(failureNotice(result.failure)); return; }
    setNotice({ ok: true, text: NS_FORM_CREATED, link: result.responderUri });
    applyRef.current({ ...latest.current, feedbackFormUrl: result.responderUri });
  }, []);

  const connect = useCallback(async () => {
    const current = latest.current;
    if (!current || current.feedbackFormUrl || busy) return;
    if (providerToken()) { await create(current); return; }
    rememberConnect(current.id);
    setBusy(true);
    setNotice({ ok: true, text: NS_FORM_CONNECTING });
    const { error } = await authManager.signInWithGoogle({ withForms: true });
    if (!error) return;   // the browser is leaving for Google; the return lands in the effect below
    takeConnect(current.id);
    setBusy(false);
    setNotice(failureNotice({ kind: 'api', message: error.message }));
  }, [busy, create]);

  // Back from the Forms-scope sign-in: the remembered pack is open again, so create its form now.
  useEffect(() => {
    if (!pack) { setNotice(null); return; }
    if (!pack.feedbackFormUrl && takeConnect(pack.id)) void create(pack);
  }, [pack, create]);

  return { notice, busy, connect: isSupabaseConfigured() ? () => void connect() : null };
}

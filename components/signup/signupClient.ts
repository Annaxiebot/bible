/**
 * signupClient.ts — validation, payload and the anon insert · 报名数据层
 *
 * Members never log in: the insert runs with the anon key, which RLS limits
 * to INSERT on study_signups (database/signups-schema.sql). Anon has NO
 * SELECT policy (members must not read rows), so the insert must not ask
 * for the row back (INSERT ... RETURNING fails RLS): the browser makes the
 * uuid, sends it as `id`, and inserts with return=minimal. The client is
 * the app's shared Supabase client (services/supabase); when the build has
 * no VITE_SUPABASE_* (local dev, e2e) a window.__SUPABASE_E2E__ override
 * supplies url + anon key so Playwright can route the PostgREST call —
 * same dev-only hook pattern as window.__ASK_AI_TIMEOUT_MS.
 * A sign-up is a commitment (ADR-0004 §7): at least one life-menu practice
 * (any number) is required before any contact detail; then a name and an
 * email (the check-in channel); phone is optional. After the insert,
 * markReplaced asks the server to retire this member's earlier rows for the
 * same pack + email (database/signup-replace-schema.sql).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';
import type { StudyPack, LifeMenuRow } from '../studypack/packTypes';
import {
  SU_ERR_NAME, SU_ERR_EMAIL_REQUIRED, SU_ERR_EMAIL, SU_ERR_PHONE, SU_ERR_SUBMIT, SU_ERR_PRACTICE, SU_DEMO_LINE, SU_REPLACE_FAILED,
} from './signupStrings';
import { SIGNUPS_TABLE, SIGNUP_LOCALE, SignupInsert } from './signupSchema';
import { practiceColumns, practiceTexts, ownVersionLine } from '../../supabase/functions/send-checkins/practices';
import { MARK_REPLACED_FN } from '../../supabase/functions/send-checkins/replaced';

export { SIGNUPS_TABLE, SIGNUP_LOCALE };
export type { SignupInsert };

export interface SignupForm {
  practices: LifeMenuRow[];       // the week's commitment: one or more, in tap order
  note: string;                   // "我的版本 My own version"
  name: string;
  phone: string;
  email: string;
  consent: boolean;
}

export const EMPTY_SIGNUP: SignupForm = { practices: [], note: '', name: '', phone: '', email: '', consent: true };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits with an optional leading +, 7–15 digits (E.164 range) after normalisation. */
const PHONE_RE = /^\+?\d{7,15}$/;

/** Strip spaces, dashes, dots and parentheses so "(408) 555-1234" validates. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

/** First bilingual problem with the commitment step, or null. */
export function validatePractice(form: Pick<SignupForm, 'practices'>): string | null {
  return form.practices.length > 0 ? null : SU_ERR_PRACTICE;
}

/** First bilingual problem with the whole form, or null when it is valid. */
export function validateSignup(form: SignupForm): string | null {
  const practiceProblem = validatePractice(form);
  if (practiceProblem) return practiceProblem;
  const name = form.name.trim();
  const email = form.email.trim();
  const phone = normalizePhone(form.phone);
  if (!name) return SU_ERR_NAME;
  if (!email) return SU_ERR_EMAIL_REQUIRED;
  if (!EMAIL_RE.test(email)) return SU_ERR_EMAIL;
  if (phone && !PHONE_RE.test(phone)) return SU_ERR_PHONE;
  return null;
}

/** One line per chosen practice (its own text) for the thank-you; the own version is shown separately (ownVersionLine). */
export function practiceLines(form: Pick<SignupForm, 'practices' | 'note'>): string[] {
  return practiceTexts({ practices: form.practices, practice_note: form.note });
}

/** "我的版本 · My own version：…" when the member wrote one, else null — a line of its own after the practices. */
export function ownVersionOf(form: Pick<SignupForm, 'note'>): string | null {
  return ownVersionLine({ practice_note: form.note });
}

/** RFC 4122 v4 uuid: crypto.randomUUID where available (secure contexts), else built from crypto.getRandomValues. */
export function newSignupId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;   // version 4
  b[8] = (b[8] & 0x3f) | 0x80;   // RFC 4122 variant
  const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The row sent to PostgREST, carrying its own new uuid (the member's
 * check-in token); empty optionals become null, never ''. Throws for a demo
 * pack or a missing practice.
 */
export function toInsertPayload(
  pack: Pick<StudyPack, 'id' | 'title' | 'leaderId'>, form: SignupForm, id: string = newSignupId(),
): SignupInsert {
  if (!pack.leaderId) throw new Error(SU_DEMO_LINE);
  if (form.practices.length === 0) throw new Error(SU_ERR_PRACTICE);
  const email = form.email.trim();
  const phone = normalizePhone(form.phone);
  const note = form.note.trim();
  return {
    id,
    pack_id: pack.id,
    leader_id: pack.leaderId,
    pack_title: pack.title,
    name: form.name.trim(),
    phone: phone || null,
    email: email || null,
    consent_checkins: form.consent,
    locale: SIGNUP_LOCALE,
    ...practiceColumns(form.practices),
    practice_note: note || null,
  };
}

interface E2EOverride { url: string; anonKey: string }

function e2eOverride(): E2EOverride | null {
  const value = (window as Window & { __SUPABASE_E2E__?: unknown }).__SUPABASE_E2E__;
  if (typeof value !== 'object' || value === null) return null;
  const { url, anonKey } = value as Partial<E2EOverride>;
  return typeof url === 'string' && typeof anonKey === 'string' ? { url, anonKey } : null;
}

let overrideClient: SupabaseClient | null = null;

/** The app's shared client, or one built from the dev-only window override; null when unconfigured. */
export function getSignupClient(): SupabaseClient | null {
  if (supabase) return supabase;
  const override = e2eOverride();
  if (!override) return null;
  overrideClient ??= createClient(override.url, override.anonKey, { auth: { persistSession: false } });
  return overrideClient;
}

/**
 * Insert one sign-up WITHOUT reading it back (no .select(): PostgREST
 * return=minimal; anon has no SELECT policy) and return the payload's own
 * id (the member's check-in token). Throws a bilingual error carrying the
 * PostgREST message.
 */
export async function insertSignup(client: SupabaseClient, payload: SignupInsert): Promise<string> {
  const { error } = await client.from(SIGNUPS_TABLE).insert(payload);
  if (error) throw new Error(`${SU_ERR_SUBMIT}: ${error.message}`);
  return payload.id;
}

export type ReplaceResult = { status: 'done'; replaced: number } | { status: 'failed'; message: string };

/**
 * After the insert: mark this member's earlier rows for the same pack +
 * email as replaced (SECURITY DEFINER RPC; it returns only a count, never
 * another row's id). A failure is returned, not thrown: the new row is
 * stored, so the thank-you still shows, with the reason under it.
 */
export async function markReplaced(client: SupabaseClient, signupId: string): Promise<ReplaceResult> {
  const { data, error } = await client.rpc(MARK_REPLACED_FN, { p_new_id: signupId });
  if (error) return { status: 'failed', message: `${SU_REPLACE_FAILED}: ${error.message}` };
  if (typeof data !== 'number') return { status: 'failed', message: `${SU_REPLACE_FAILED}: ${JSON.stringify(data)}` };
  return { status: 'done', replaced: data };
}

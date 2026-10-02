/**
 * signupClient.ts — validation, payload and the anon insert · 报名数据层
 *
 * Members never log in: the insert runs with the anon key, which RLS limits
 * to INSERT on study_signups (database/signups-schema.sql). The client is
 * the app's shared Supabase client (services/supabase); when the build has
 * no VITE_SUPABASE_* (local dev, e2e) a window.__SUPABASE_E2E__ override
 * supplies url + anon key so Playwright can route the PostgREST call —
 * same dev-only hook pattern as window.__ASK_AI_TIMEOUT_MS.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';
import type { StudyPack } from '../studypack/packTypes';
import { SU_ERR_NAME, SU_ERR_CONTACT, SU_ERR_EMAIL, SU_ERR_PHONE, SU_ERR_SUBMIT, SU_DEMO_LINE } from './signupStrings';
import { SIGNUPS_TABLE, SIGNUP_LOCALE, SignupInsert } from './signupSchema';

export { SIGNUPS_TABLE, SIGNUP_LOCALE };
export type { SignupInsert };

export interface SignupForm {
  name: string;
  phone: string;
  email: string;
  consent: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits with an optional leading +, 7–15 digits (E.164 range) after normalisation. */
const PHONE_RE = /^\+?\d{7,15}$/;

/** Strip spaces, dashes, dots and parentheses so "(408) 555-1234" validates. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

/** First bilingual problem with the form, or null when it is valid. */
export function validateSignup(form: SignupForm): string | null {
  const name = form.name.trim();
  const email = form.email.trim();
  const phone = normalizePhone(form.phone);
  if (!name) return SU_ERR_NAME;
  if (!email && !phone) return SU_ERR_CONTACT;
  if (email && !EMAIL_RE.test(email)) return SU_ERR_EMAIL;
  if (phone && !PHONE_RE.test(phone)) return SU_ERR_PHONE;
  return null;
}

/** The row sent to PostgREST; empty optionals become null, never ''. Throws for a demo pack (no leaderId). */
export function toInsertPayload(pack: Pick<StudyPack, 'id' | 'title' | 'leaderId'>, form: SignupForm): SignupInsert {
  if (!pack.leaderId) throw new Error(SU_DEMO_LINE);
  const email = form.email.trim();
  const phone = normalizePhone(form.phone);
  return {
    pack_id: pack.id,
    leader_id: pack.leaderId,
    pack_title: pack.title,
    name: form.name.trim(),
    phone: phone || null,
    email: email || null,
    consent_checkins: form.consent,
    locale: SIGNUP_LOCALE,
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

/** Insert one sign-up. Throws a bilingual error carrying the PostgREST message. */
export async function insertSignup(client: SupabaseClient, payload: SignupInsert): Promise<void> {
  const { error } = await client.from(SIGNUPS_TABLE).insert(payload);
  if (error) throw new Error(`${SU_ERR_SUBMIT}: ${error.message}`);
}

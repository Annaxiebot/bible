/**
 * signupClient.ts — validation and the one call to the signup function · 报名数据层
 *
 * Members never log in. The page validates with the function's own rules
 * (supabase/functions/_shared/signup.ts) for instant feedback, then makes
 * ONE call: functions.invoke('signup'). The function (service role) is the
 * only writer of study_signups: it looks the pack's leader and title up
 * itself, checks the practices against the pack's life menu, rate-limits,
 * inserts with its own id, retires this person's earlier rows for the same
 * pack + email, and asks for the welcome email (ADR-0013). The browser
 * sends no leader_id, title or id. The client is the app's shared Supabase
 * client (services/supabase); when the build has no VITE_SUPABASE_* (local
 * dev, e2e) a window.__SUPABASE_E2E__ override supplies url + anon key so
 * Playwright can route the call — same dev-only hook pattern as
 * window.__ASK_AI_TIMEOUT_MS.
 * A sign-up is a commitment (ADR-0004 §7): at least one life-menu practice
 * (any number) is required before any contact detail; then a name and an
 * email (the check-in channel); phone is optional.
 */
import { createClient, FunctionsHttpError, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';
import type { LifeMenuRow } from '../studypack/packTypes';
import { SU_ERR_SUBMIT, SU_ERR_PRACTICE, SU_REPLACE_FAILED } from './signupStrings';
import { CK_WELCOME_FAILED } from '../checkin/checkinStrings';
import { practiceTexts, ownVersionLine } from '../../supabase/functions/send-checkins/practices';
import { SIGNUP_FUNCTION, SIGNUP_PROBLEM_TEXT, SignupBody, signupFieldProblem } from '../../supabase/functions/_shared/signup';

export interface SignupForm {
  practices: LifeMenuRow[];       // the week's commitment: one or more, in tap order
  note: string;                   // "我的版本 My own version"
  name: string;
  phone: string;
  email: string;
  consent: boolean;
}

export const EMPTY_SIGNUP: SignupForm = { practices: [], note: '', name: '', phone: '', email: '', consent: true };

/** First bilingual problem with the commitment step, or null. */
export function validatePractice(form: Pick<SignupForm, 'practices'>): string | null {
  return form.practices.length > 0 ? null : SU_ERR_PRACTICE;
}

/** First bilingual problem with the whole form (the function's own rules and lines), or null when it is valid. */
export function validateSignup(form: SignupForm): string | null {
  const problem = signupFieldProblem({ ...form, practice_note: form.note });
  return problem ? SIGNUP_PROBLEM_TEXT[problem] : null;
}

/** One line per chosen practice (its own text) for the thank-you; the own version is shown separately (ownVersionLine). */
export function practiceLines(form: Pick<SignupForm, 'practices' | 'note'>): string[] {
  return practiceTexts({ practices: form.practices, practice_note: form.note });
}

/** "我的版本 · My own version：…" when the member wrote one, else null — a line of its own after the practices. */
export function ownVersionOf(form: Pick<SignupForm, 'note'>): string | null {
  return ownVersionLine({ practice_note: form.note });
}

/** The request body: what the member typed and chose, nothing about ownership. */
export function toSignupBody(packId: string, form: SignupForm): SignupBody {
  return {
    pack_id: packId, name: form.name, email: form.email, phone: form.phone,
    practices: form.practices.map(p => ({ area: p.area, practice: p.practice })),
    practice_note: form.note, consent: form.consent,
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

export type ReplaceResult = { status: 'done'; replaced: number } | { status: 'failed'; message: string };
export type WelcomeResult = { status: 'sent' } | { status: 'skipped' } | { status: 'failed'; message: string };

export interface SignupResult {
  id: string;              // the member's check-in token, made by the function
  replace: ReplaceResult;
  welcome: WelcomeResult;
}

interface SignupReply {
  id?: unknown; replaced?: unknown; replace?: unknown; replace_message?: unknown; welcome?: unknown; welcome_message?: unknown;
}

/** The function's 200 → what the thank-you shows; a failed replace or welcome carries its bilingual prefix + reason. */
function toResult(reply: SignupReply | null): SignupResult {
  if (typeof reply?.id !== 'string') throw new Error(`${SU_ERR_SUBMIT}: ${JSON.stringify(reply)}`);
  const replace: ReplaceResult = reply.replace === 'done' && typeof reply.replaced === 'number'
    ? { status: 'done', replaced: reply.replaced }
    : { status: 'failed', message: `${SU_REPLACE_FAILED}: ${String(reply.replace_message ?? JSON.stringify(reply))}` };
  const welcome: WelcomeResult = reply.welcome === 'sent' ? { status: 'sent' }
    : reply.welcome === 'skipped' ? { status: 'skipped' }
    : { status: 'failed', message: `${CK_WELCOME_FAILED}: ${String(reply.welcome_message ?? JSON.stringify(reply))}` };
  return { id: reply.id, replace, welcome };
}

/** A refusal's bilingual line from the function's body ({ error, message }), else the HTTP status. */
async function refusalText(error: Error): Promise<string> {
  if (!(error instanceof FunctionsHttpError)) return error.message;
  const response = error.context as Response | undefined;
  const body = (await response?.json().catch(() => null)) as { message?: unknown; error?: unknown } | null;
  return String(body?.message ?? body?.error ?? `HTTP ${response?.status ?? '?'}`);
}

/**
 * The sign-up: one call to the signup function. A refusal (validation,
 * rate limit, unknown pack, server error) throws a bilingual error the form
 * shows; a stored row returns its id with the replace and welcome verdicts.
 */
export async function submitSignup(client: SupabaseClient, packId: string, form: SignupForm): Promise<SignupResult> {
  const { data, error } = await client.functions.invoke<SignupReply>(SIGNUP_FUNCTION, { body: toSignupBody(packId, form) });
  if (error) throw new Error(`${SU_ERR_SUBMIT}: ${await refusalText(error)}`);
  return toResult(data);
}

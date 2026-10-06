/**
 * signupHandler.ts — the signup function's whole decision, minus Deno · 报名处理 (ADR-0013)
 *
 * The one way a sign-up is written. Pure apart from crypto.subtle, so
 * vitest drives the real order with fakes: method → validation → salted IP
 * hash → per-IP rate limit → the pack from study_packs (its leader_id and
 * title; never the client's) → every practice is a row of its life menu →
 * insert with a server-made id (the table's study_signups_rate_guard
 * trigger enforces the per-pack and per-pack + email caps; its refusal
 * becomes a 429 with its own bilingual message) → retire the person's
 * earlier rows → ask send-checkins (trusted) for the welcome. Nothing is
 * written before the checks pass; after the insert nothing fails the
 * request: a failed replace or welcome comes back with its reason.
 */
import {
  validateSignupBody, lifeMenuRows, practicesInMenu, SIGNUP_PROBLEM_TEXT, SIGNUP_LOCALE, SignupProblem, SignupRecord,
  SIGNUP_IP_LIMIT, SIGNUP_IP_WINDOW_MS,
} from '../_shared/signup.ts';
import { hashClientIp } from '../_shared/clientIp.ts';
import { practiceColumns, ChosenPractice } from '../send-checkins/practices.ts';
import type { WelcomeOutcome } from './welcome.ts';

/** The study_signups row this function inserts (the table adds created_at). */
export interface SignupRow {
  id: string;
  pack_id: string;
  leader_id: string;
  pack_title: string;
  name: string;
  phone: string | null;
  email: string;
  consent_checkins: boolean;
  locale: string;
  practices: ChosenPractice[];
  practice_area: string | null;
  practice_text: string | null;
  practice2_area: string | null;
  practice2_text: string | null;
  practice_note: string | null;
  ip_hash: string;
}

/** The study_packs columns the function reads (service role). */
export interface PackRow {
  id: string;
  leader_id: string;
  title: string;
  pack: unknown;
}

export interface SignupDeps {
  salt: string;
  now: () => Date;
  newId: () => string;
  countByIp: (ipHash: string, sinceIso: string) => Promise<number>;
  loadPack: (packId: string) => Promise<PackRow | null>;
  /** Throws RateGuardError when the table's rate-guard trigger refuses the row; any other failure as a plain Error. */
  insert: (row: SignupRow) => Promise<void>;
  markReplaced: (signupId: string) => Promise<number>;
  sendWelcome: (signupId: string) => Promise<WelcomeOutcome>;
}

export interface HandlerReply {
  status: number;
  body: Record<string, unknown>;
}

/** The rate-guard trigger refused the insert (RATE_GUARD_ERRCODE); the message is its bilingual line. */
export class RateGuardError extends Error {}

function refuse(status: number, problem: SignupProblem): HandlerReply {
  return { status, body: { error: problem, message: SIGNUP_PROBLEM_TEXT[problem] } };
}

async function ipLimited(ipHash: string, deps: SignupDeps): Promise<boolean> {
  const since = new Date(deps.now().getTime() - SIGNUP_IP_WINDOW_MS).toISOString();
  return (await deps.countByIp(ipHash, since)) >= SIGNUP_IP_LIMIT;
}

/** Insert; the trigger's refusal is the 429 (with its line), anything else propagates as a 500. */
async function insertRow(row: SignupRow, deps: SignupDeps): Promise<HandlerReply | null> {
  try {
    await deps.insert(row);
    return null;
  } catch (err) {
    if (err instanceof RateGuardError) return { status: 429, body: { error: 'rate-limited', message: err.message } };
    throw err;
  }
}

function toRow(id: string, record: SignupRecord, pack: PackRow, ipHash: string): SignupRow {
  return {
    id, pack_id: pack.id, leader_id: pack.leader_id, pack_title: pack.title,
    name: record.name, phone: record.phone, email: record.email, consent_checkins: record.consent, locale: SIGNUP_LOCALE,
    ...practiceColumns(record.practices), practice_note: record.practice_note, ip_hash: ipHash,
  };
}

/** After the insert: retire earlier rows, then the welcome; each failure is reported, never thrown. */
async function afterInsert(id: string, deps: SignupDeps): Promise<HandlerReply> {
  const body: Record<string, unknown> = { id };
  try {
    body.replaced = await deps.markReplaced(id);
    body.replace = 'done';
  } catch (err) {
    // R5: surfaced to the page (SU_REPLACE_FAILED + this reason); the new row is stored, so still 200.
    Object.assign(body, { replaced: null, replace: 'failed', replace_message: err instanceof Error ? err.message : String(err) });
  }
  const welcome = await deps.sendWelcome(id);
  body.welcome = welcome.status;
  if (welcome.status !== 'sent') body.welcome_message = welcome.message;
  return { status: 200, body };
}

export async function handleSignup(method: string, rawBody: unknown, ip: string, deps: SignupDeps): Promise<HandlerReply> {
  if (method !== 'POST') return { status: 405, body: { error: 'POST only' } };
  const verdict = validateSignupBody(rawBody);
  if (verdict.ok === false) return refuse(400, verdict.problem);
  if (!deps.salt) return { status: 500, body: { error: 'IP_HASH_SALT is not set' } };
  const record = verdict.value;
  const ipHash = await hashClientIp(deps.salt, ip);
  if (await ipLimited(ipHash, deps)) return refuse(429, 'rate-limited');
  const pack = await deps.loadPack(record.pack_id);
  if (!pack) return refuse(404, 'pack-unknown');
  if (!practicesInMenu(record.practices, lifeMenuRows(pack.pack))) return refuse(400, 'practice-unknown');
  const id = deps.newId();
  const refused = await insertRow(toRow(id, record, pack, ipHash), deps);
  return refused ?? afterInsert(id, deps);
}

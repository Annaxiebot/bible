/**
 * signup.ts — the sign-up's shared rules · 报名规则 (ADR-0013)
 *
 * Pure (one import: EMAIL_SHAPE from feedback.ts), read by two callers (R3):
 * the member's #/signup page (instant validation before it calls the
 * function) and the `signup` edge function (the same validation, server-side,
 * before any write). The bilingual problem lines live here, once; the page's
 * signupStrings re-exports the ones it shows. Rate limits and the life-menu
 * check are server-only but named here so tests and docs read one copy.
 */
import { EMAIL_SHAPE } from './feedback.ts';

/** Edge function name (supabase/functions/signup); the browser invokes it, e2e routes it. */
export const SIGNUP_FUNCTION = 'signup';
/** The tables the function reads and writes (the app re-exports these; database/*.sql pins them). */
export const SIGNUPS_TABLE = 'study_signups';
export const STUDY_PACKS_TABLE = 'study_packs';
/** Every row's locale (the site is Chinese-first). */
export const SIGNUP_LOCALE = 'zh';

export const SIGNUP_NAME_MAX_CHARS = 100;
export const SIGNUP_EMAIL_MAX_CHARS = 200;
export const SIGNUP_NOTE_MAX_CHARS = 500;
export const SIGNUP_PRACTICES_MAX = 20;
export const SIGNUP_PRACTICE_MAX_CHARS = 300;
export const SIGNUP_PACK_ID_MAX_CHARS = 200;

/**
 * Per salted IP hash: a whole group on one church Wi-Fi shares an address,
 * so the cap is generous. The per-pack (hour) and per-pack + email (day)
 * caps are NOT here: the study_signups_rate_guard trigger owns them
 * (database/signup-interim-guard.sql, one copy, R3); its refusal is
 * RATE_GUARD_ERRCODE with a bilingual message the function passes on as 429.
 */
export const SIGNUP_IP_LIMIT = 60;
export const SIGNUP_IP_WINDOW_MS = 60 * 60 * 1000;
/** The SQLSTATE signup_rate_guard() raises (its message is already "中文 · English"). */
export const RATE_GUARD_ERRCODE = 'P0001';

/** Digits with an optional leading +, 7–15 digits (E.164 range) after normalisation. */
const PHONE_RE = /^\+?\d{7,15}$/;

/** Strip spaces, dashes, dots and parentheses so "(408) 555-1234" validates. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

/** Why a sign-up was refused; the function answers { error: code, message: SIGNUP_PROBLEM_TEXT[code] }. */
export const SIGNUP_PROBLEM_TEXT = {
  'practice-none': '请至少选一项操练 · Please choose at least one practice',
  'practice-many': `最多选 ${SIGNUP_PRACTICES_MAX} 项操练 · Choose at most ${SIGNUP_PRACTICES_MAX} practices`,
  'practice-long': '操练内容太长 · A practice is too long',
  'practice-unknown': '所选操练不在这个查经包里 · A chosen practice is not in this study pack',
  'name-empty': '请填写姓名 · Please enter your name',
  'name-long': '姓名太长 · That name is too long',
  'email-empty': '请填写邮箱 · Please enter your email',
  'email-long': '邮箱太长 · That email is too long',
  'email-shape': '邮箱格式不对 · That email does not look right',
  'phone-shape': '手机号格式不对 · That phone number does not look right',
  'note-long': '我的版本太长 · Your own version is too long',
  'incomplete': '报名数据不完整 · The sign-up is incomplete',
  'pack-unknown': '找不到这个查经包 · This study pack could not be found',
  'rate-limited': '提交太频繁，请稍后再试 · Too many sign-ups, please try again later',
} as const;
export type SignupProblem = keyof typeof SIGNUP_PROBLEM_TEXT;

export interface SignupPractice {
  area: string;
  practice: string;
}

/** What the browser sends. Ownership (leader_id, pack_title) and the row id are never part of it. */
export interface SignupBody {
  pack_id: string;
  name: string;
  email: string;
  phone: string;
  practices: SignupPractice[];
  practice_note: string;
  consent: boolean;
}

/** The validated, trimmed sign-up (empty optionals are null, never ''). */
export interface SignupRecord {
  pack_id: string;
  name: string;
  email: string;
  phone: string | null;
  practices: SignupPractice[];
  practice_note: string | null;
  consent: boolean;
}

/** The fields a person types, as the page holds them. */
export type SignupFields = Pick<SignupBody, 'name' | 'email' | 'phone' | 'practices' | 'practice_note'>;

function practicesProblem(practices: readonly SignupPractice[]): SignupProblem | null {
  if (practices.length === 0) return 'practice-none';
  if (practices.length > SIGNUP_PRACTICES_MAX) return 'practice-many';
  const tooLong = practices.some(p => p.area.length > SIGNUP_PRACTICE_MAX_CHARS || p.practice.length > SIGNUP_PRACTICE_MAX_CHARS);
  return tooLong ? 'practice-long' : null;
}

/** First problem with what a person typed (page and function, same order), or null. */
export function signupFieldProblem(fields: SignupFields): SignupProblem | null {
  const practiceProblem = practicesProblem(fields.practices);
  if (practiceProblem) return practiceProblem;
  const name = fields.name.trim();
  const email = fields.email.trim();
  const phone = normalizePhone(fields.phone);
  if (!name) return 'name-empty';
  if (name.length > SIGNUP_NAME_MAX_CHARS) return 'name-long';
  if (!email) return 'email-empty';
  if (email.length > SIGNUP_EMAIL_MAX_CHARS) return 'email-long';
  if (!EMAIL_SHAPE.test(email)) return 'email-shape';
  if (phone && !PHONE_RE.test(phone)) return 'phone-shape';
  if (fields.practice_note.trim().length > SIGNUP_NOTE_MAX_CHARS) return 'note-long';
  return null;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function practiceList(value: unknown): SignupPractice[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.map(item => {
    const v = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const area = text(v.area);
    const practice = text(v.practice);
    return area !== null && practice !== null && practice.length > 0 ? { area, practice } : null;
  });
  return list.every((p): p is SignupPractice => p !== null) ? list : null;
}

export type SignupVerdict = { ok: true; value: SignupRecord } | { ok: false; problem: SignupProblem };

/** The function's whole-body check: shape (unknown keys ignored), then signupFieldProblem. */
export function validateSignupBody(body: unknown): SignupVerdict {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const packId = text(raw.pack_id)?.trim() ?? '';
  const practices = practiceList(raw.practices);
  const name = text(raw.name);
  const email = text(raw.email);
  const phone = raw.phone === undefined || raw.phone === null ? '' : text(raw.phone);
  const note = raw.practice_note === undefined || raw.practice_note === null ? '' : text(raw.practice_note);
  if (!packId || packId.length > SIGNUP_PACK_ID_MAX_CHARS || typeof raw.consent !== 'boolean') return { ok: false, problem: 'incomplete' };
  if (practices === null || name === null || email === null || phone === null || note === null) return { ok: false, problem: 'incomplete' };
  const problem = signupFieldProblem({ name, email, phone, practices, practice_note: note });
  if (problem) return { ok: false, problem };
  return {
    ok: true,
    value: {
      pack_id: packId, name: name.trim(), email: email.trim(), phone: normalizePhone(phone) || null,
      practices, practice_note: note.trim() || null, consent: raw.consent,
    },
  };
}

/**
 * The pack's life menu as stored in study_packs.pack: the rows of the FIRST
 * section with kind 'lifeMenu' — the same extraction public_signup_pack
 * makes (database/remove-forms-schema.sql), so the page offers exactly
 * what the function accepts.
 */
export function lifeMenuRows(pack: unknown): SignupPractice[] {
  const sections = (pack as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(sections)) return [];
  const menu = sections.find(s => (s as { kind?: unknown } | null)?.kind === 'lifeMenu') as { rows?: unknown } | undefined;
  if (!menu || !Array.isArray(menu.rows)) return [];
  return menu.rows.map(row => {
    const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    return { area: text(r.area) ?? '', practice: text(r.practice) ?? '' };
  });
}

/** True when every chosen practice is a row of the menu (same area and same text). */
export function practicesInMenu(chosen: readonly SignupPractice[], menu: readonly SignupPractice[]): boolean {
  return chosen.every(c => menu.some(m => m.area === c.area && m.practice === c.practice));
}

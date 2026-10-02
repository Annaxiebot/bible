/**
 * templates.ts — check-in message templates + schedule math · 提醒文案与时间
 *
 * Pure module (no Deno globals) so vitest covers it; index.ts is the only
 * Deno-specific file. Chinese first, English second on every line
 * (ADR-0003 §1). A message is: greeting, the member's own practice, the
 * prompt (or the welcome line), then the feedback link — the in-app
 * check-in page keyed by the signup uuid, or the pack's Google Form
 * (prefilled) when the leader set one (ADR-0004 §7, §9).
 */

export type CheckinKind = 'tue' | 'thu' | 'weekend';
export const CHECKIN_KINDS: readonly CheckinKind[] = ['tue', 'thu', 'weekend'];
/** The confirmation sent right after sign-up; requested by the member's browser, never scheduled. */
export const WELCOME_KIND = 'welcome';
export type MessageKind = CheckinKind | typeof WELCOME_KIND;

/** Public site; pack JSON and TV links are served from here. */
export const SITE_ORIGIN = 'https://scripturetolife.org';
/** Resend sender. The domain must be verified in Resend before real sends. */
export const CHECKIN_FROM_EMAIL = 'Scripture to Life <checkins@scripturetolife.org>';
export const CHECKIN_TIMEZONE = 'America/Los_Angeles';
/** Local hour at which the scheduled job is allowed to send (two UTC cron lines bracket DST). */
export const CHECKIN_HOUR_LA = 9;

export const BILINGUAL_SEPARATOR = ' · ';

export const KIND_LABEL: Record<MessageKind, { zh: string; en: string }> = {
  tue: { zh: '周二跟进', en: 'Tuesday check-in' },
  thu: { zh: '周四跟进', en: 'Thursday check-in' },
  weekend: { zh: '周末回顾', en: 'Weekend reflection' },
  welcome: { zh: '报名确认', en: 'Sign-up confirmed' },
};

/** Which reflection body line (0-based) carries each kind's prompt in a pack. */
export const REFLECTION_LINE_INDEX: Record<CheckinKind, number> = { tue: 0, thu: 1, weekend: 2 };

export interface FeedbackFormEntries {
  name?: string;
  practice?: string;
}

export interface CheckinPack {
  id: string;
  title: string;
  leaderId: string | null;  // owning leader's auth uid; null = demo pack, nobody to send for
  prompts: Record<CheckinKind, string>;
  feedbackFormUrl: string | null;          // the leader's Google Form, when set (ADR-0004 §9)
  feedbackFormEntries: FeedbackFormEntries | null;
}

export interface CheckinMessage {
  subject: string;
  text: string;
}

/** What a message is addressed to: the signup token (for the in-app link) and the committed practice. */
export interface MemberContext {
  name: string;
  signupId: string | null;   // null for the leader's ad-hoc test recipient
  practice: string | null;   // own version if written, else the chosen menu text; null before the commitment step
}

export function packUrl(packId: string): string {
  return `${SITE_ORIGIN}/#/pack/${packId}`;
}

export function publicPackJsonUrl(packId: string, schemaVersion: number): string {
  return `${SITE_ORIGIN}/packs/${packId}.json?schema=${schemaVersion}`;
}

/** In-app check-in page for a signup token; mirrors components/checkin/checkinRoute.checkinHash. */
export function checkinPageUrl(signupId: string, kind: CheckinKind | null): string {
  return kind ? `${SITE_ORIGIN}/#/checkin/${signupId}/${kind}` : `${SITE_ORIGIN}/#/checkin/${signupId}`;
}

/**
 * Google Forms prefill: <form>?usp=pp_url&entry.<id>=<value>. Must stay
 * byte-identical to components/studypack/feedbackForm.prefillFormUrl
 * (Deno cannot import the app's extensionless modules; a test pins both).
 */
export function prefillFormUrl(formUrl: string, entries: FeedbackFormEntries | null | undefined, values: { name: string; practice: string }): string {
  const params = new URLSearchParams();
  if (entries?.name) params.set(entries.name, values.name);
  if (entries?.practice) params.set(entries.practice, values.practice);
  if ([...params.keys()].length === 0) return formUrl;
  params.set('usp', 'pp_url');
  const joiner = formUrl.includes('?') ? '&' : '?';
  return `${formUrl}${joiner}${params.toString()}`;
}

/** The feedback link for one member: the form when the pack has one, else the in-app page, else the pack. */
export function feedbackUrl(pack: CheckinPack, member: MemberContext, kind: CheckinKind | null): string {
  if (pack.feedbackFormUrl) {
    return prefillFormUrl(pack.feedbackFormUrl, pack.feedbackFormEntries, { name: member.name, practice: member.practice ?? '' });
  }
  return member.signupId ? checkinPageUrl(member.signupId, kind) : packUrl(pack.id);
}

function laParts(date: Date): { weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHECKIN_TIMEZONE, weekday: 'short', hour: 'numeric', hour12: false,
  }).formatToParts(date);
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
  const hourText = parts.find(p => p.type === 'hour')?.value ?? '0';
  return { weekday, hour: Number(hourText) % 24 };
}

/** The check-in kind for a moment in Los Angeles time; null on Mon/Wed/Fri. */
export function kindFromDate(date: Date): CheckinKind | null {
  const { weekday } = laParts(date);
  if (weekday === 'Tue') return 'tue';
  if (weekday === 'Thu') return 'thu';
  if (weekday === 'Sat' || weekday === 'Sun') return 'weekend';
  return null;
}

/** True only during the 09:00 LA hour, so the PST and PDT cron lines never both send. */
export function isSendHour(date: Date): boolean {
  return laParts(date).hour === CHECKIN_HOUR_LA;
}

export function isCheckinKind(value: unknown): value is CheckinKind {
  return typeof value === 'string' && (CHECKIN_KINDS as readonly string[]).includes(value);
}

/** Greeting line: "{name} 平安 · Peace, {name}". */
export function greeting(name: string): string {
  return `${name} 平安${BILINGUAL_SEPARATOR}Peace, ${name}`;
}

/** "你选的操练：… · Your practice: …" — present whenever the member committed to one. */
export function practiceLine(practice: string): string {
  return `你选的操练：${practice}${BILINGUAL_SEPARATOR}Your practice: ${practice}`;
}

const WELCOME_LINE = `周中我们会再提醒你${BILINGUAL_SEPARATOR}We will remind you mid-week`;

/** Greeting, practice, prompt (or the welcome line), link; subject is bilingual with the pack title. */
export function renderCheckin(kind: MessageKind, pack: CheckinPack, member: MemberContext): CheckinMessage {
  const label = KIND_LABEL[kind];
  const checkinKind = kind === WELCOME_KIND ? null : kind;
  const lines = [greeting(member.name)];
  if (member.practice) lines.push(practiceLine(member.practice));
  lines.push(kind === WELCOME_KIND ? WELCOME_LINE : pack.prompts[kind]);
  lines.push(feedbackUrl(pack, member, checkinKind));
  return {
    subject: `${label.zh}${BILINGUAL_SEPARATOR}${label.en} — ${pack.title}`,
    text: lines.join('\n'),
  };
}

/**
 * Extract the check-in prompts from a StudyPack JSON (the reflection
 * section's first three body lines, in tue/thu/weekend order). Throws with
 * context when the pack has no usable reflection section.
 */
export function promptsFromPack(raw: unknown): CheckinPack {
  const pack = raw as {
    id?: unknown; title?: unknown; leaderId?: unknown; sections?: unknown; feedbackFormUrl?: unknown; feedbackFormEntries?: unknown;
  };
  if (typeof pack?.id !== 'string' || typeof pack.title !== 'string' || !Array.isArray(pack.sections)) {
    throw new Error('Pack JSON needs id, title and sections[]');
  }
  const reflection = (pack.sections as Array<{ kind?: unknown; body?: unknown }>).find(s => s.kind === 'reflection');
  const body = reflection?.body;
  if (!Array.isArray(body) || body.length < CHECKIN_KINDS.length || !body.every(l => typeof l === 'string')) {
    throw new Error(`Pack ${pack.id} has no reflection section with ${CHECKIN_KINDS.length} prompt lines`);
  }
  const lines = body as string[];
  return {
    id: pack.id,
    title: pack.title,
    leaderId: typeof pack.leaderId === 'string' && pack.leaderId.length > 0 ? pack.leaderId : null,
    prompts: {
      tue: lines[REFLECTION_LINE_INDEX.tue],
      thu: lines[REFLECTION_LINE_INDEX.thu],
      weekend: lines[REFLECTION_LINE_INDEX.weekend],
    },
    feedbackFormUrl: typeof pack.feedbackFormUrl === 'string' ? pack.feedbackFormUrl : null,
    feedbackFormEntries: typeof pack.feedbackFormEntries === 'object' && pack.feedbackFormEntries !== null
      ? (pack.feedbackFormEntries as FeedbackFormEntries) : null,
  };
}

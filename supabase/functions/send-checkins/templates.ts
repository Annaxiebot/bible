/**
 * templates.ts — check-in message templates + schedule math · 提醒文案与时间
 *
 * Pure module (no Deno globals) so vitest covers it; index.ts is the only
 * Deno-specific file. Chinese first, English second on every line
 * (ADR-0003 §1). A message is: greeting, the member's practices (one line each), the
 * prompt (or the welcome line), then the feedback link — the in-app
 * check-in page keyed by the signup uuid (ADR-0004 §7; Google Forms was
 * removed 2026-10-05, §9), then — for a real
 * member — the stop line to #/checkin/<id>/stop (ADR-0009). The kind is named
 * once, in the subject; the prompt drops a repeated leading label
 * (promptText.ts, shared with the check-in page). When the pack summary
 * carries its verses (ADR-0004 §12), the passage line and the key verse sit
 * between the prompt and the link, and the whole passage (email only — never
 * SMS) between the link and the stop line; blank lines separate the blocks.
 * Verses are the pack's own 和合本 + BSB text, both in every content mode.
 * checkinContent builds the parts once; checkinText renders the plain-text
 * part (URLs on their own lines) and emailHtml.ts the HTML part (buttons, no
 * raw URLs). Email sends both, the text ending with SITE_FOOTER_LINE; SMS
 * gets the text only, without that line.
 */
import { promptWithoutKindLabel } from './promptText.ts';
import { renderCheckinHtml } from './emailHtml.ts';
import { EMAIL_BRAND_EN } from './emailStyle.ts';
import {
  SITE_ORIGIN, SITE_HOST, BILINGUAL_SEPARATOR, PRACTICE_LABEL, PASSAGE_LABEL, FULL_PASSAGE_HEADING, LINK_LABEL,
} from './messageStrings.ts';

export { SITE_ORIGIN, BILINGUAL_SEPARATOR, PRACTICE_LABEL, PASSAGE_LABEL, FULL_PASSAGE_HEADING, LINK_LABEL };

export type CheckinKind = 'tue' | 'thu' | 'weekend';
export const CHECKIN_KINDS: readonly CheckinKind[] = ['tue', 'thu', 'weekend'];
/** The confirmation sent right after sign-up; requested by the member's browser, never scheduled. */
export const WELCOME_KIND = 'welcome';
export type MessageKind = CheckinKind | typeof WELCOME_KIND;

/** Resend sender. The domain must be verified in Resend before real sends. */
export const CHECKIN_FROM_EMAIL = 'Scripture to Life <checkins@scripturetolife.org>';
export const CHECKIN_TIMEZONE = 'America/Los_Angeles';
/** Local hour at which the scheduled job is allowed to send (two UTC cron lines bracket DST). */
export const CHECKIN_HOUR_LA = 9;

export const KIND_LABEL: Record<MessageKind, { zh: string; en: string }> = {
  tue: { zh: '周二跟进', en: 'Tuesday check-in' },
  thu: { zh: '周四跟进', en: 'Thursday check-in' },
  weekend: { zh: '周末回顾', en: 'Weekend reflection' },
  welcome: { zh: '报名确认', en: 'Sign-up confirmed' },
};

/** Which reflection body line (0-based) carries each kind's prompt in a pack. */
export const REFLECTION_LINE_INDEX: Record<CheckinKind, number> = { tue: 0, thu: 1, weekend: 2 };

export interface CheckinPack {
  id: string;
  title: string;
  leaderId: string | null;  // owning leader's auth uid; null = demo pack, nobody to send for
  prompts: Record<CheckinKind, string>;
  paused?: boolean;   // pack_summaries.checkins_paused; a public pack is never paused (ADR-0009)
  passage?: CheckinPassage;  // the studied verses (pack_summaries.verses); absent on an older summary row
}

export interface PassageVerse {
  num: number;
  cuv: string;  // 和合本, copied from the pack (bundled text)
  en: string;   // BSB, copied from the pack (bundled text)
}

export interface CheckinPassage {
  ref: string;               // pack_summaries.passage_ref, e.g. "箴言 1:1–33 · Proverbs 1:1–33"
  verses: PassageVerse[];    // non-empty
  keyVerse: number | null;   // pack_summaries.key_verse; null → no key-verse line
}

/** Which channel a message is rendered for; mirrors recipients.Channel. */
export type MessageChannel = 'email' | 'sms';

export interface CheckinMessage {
  subject: string;
  text: string;
  html?: string;   // email only (emailHtml.ts); Resend sends it with `text` as the alternative
  /** RFC 8058 one-click URL (index.ts adds it per member; senders.resendBody turns it into List-Unsubscribe headers). */
  oneClickUrl?: string;
}

/** What a message is addressed to: the signup token (for the in-app link) and the committed practices. */
export interface MemberContext {
  name: string;
  signupId: string | null;   // null for the leader's ad-hoc test recipient
  practices: string[];       // every chosen practice's own text; [] before the commitment step
  ownVersion?: string | null; // "我的版本 · My own version：…" (practices.ownVersionLine), its own line after the practices
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

/** The member's stop page; mirrors components/checkin/checkinRoute.checkinStopHash (pinned by a test). */
export function stopPageUrl(signupId: string): string {
  return `${SITE_ORIGIN}/#/checkin/${signupId}/stop`;
}

const STOP_TEXT = `不想再收到？退订${BILINGUAL_SEPARATOR}Stop these emails: `;

/** Last line of every member email: "不想再收到？退订 · Stop these emails: <url>". */
export function stopLine(signupId: string): string {
  return `${STOP_TEXT}${stopPageUrl(signupId)}`;
}

/** The feedback link for one member: the in-app check-in page, else (no signup id) the pack. */
export function feedbackUrl(pack: CheckinPack, member: MemberContext, kind: CheckinKind | null): string {
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

/** "你选的操练 · Your practice：…" — one line per committed practice. */
export function practiceLine(practice: string): string {
  return `${PRACTICE_LABEL}：${practice}`;
}

const WELCOME_LINE = `周中我们会再提醒你${BILINGUAL_SEPARATOR}We will remind you mid-week`;

/** "本周经文 · This week's passage: 箴言 1:1–33 · Proverbs 1:1–33". */
export function passageLine(ref: string): string {
  return `${PASSAGE_LABEL}: ${ref}`;
}

/** The key verse in full, 和合本 then BSB: "「…」(v.7) · “…” (v.7)". */
export function keyVerseLine(verse: PassageVerse): string {
  return `「${verse.cuv}」(v.${verse.num})${BILINGUAL_SEPARATOR}“${verse.en}” (v.${verse.num})`;
}

/** One verse of the whole passage: "1 以色列王…… · 1 These are the proverbs…". */
export function passageVerseLine(verse: PassageVerse): string {
  return `${verse.num} ${verse.cuv}${BILINGUAL_SEPARATOR}${verse.num} ${verse.en}`;
}

/** One message's parts, rendered as plain text here and as HTML by emailHtml.ts. */
export interface CheckinContent {
  subject: string;
  greeting: string;
  practices: string[];         // the member's practice texts
  ownVersion: string | null;   // already a full bilingual line
  prompt: string;              // the question (or the welcome line); also the HTML preheader
  passage: { ref: string; keyVerse: PassageVerse | null; verses: PassageVerse[] } | null;  // verses: [] for SMS
  link: { url: string; label: string };
  stopUrl: string | null;      // members only
}

/** The parts of a message; the whole passage only for email (33 verses would be dozens of SMS segments). */
export function checkinContent(
  kind: MessageKind, pack: CheckinPack, member: MemberContext, channel: MessageChannel,
): CheckinContent {
  const label = KIND_LABEL[kind];
  const checkinKind = kind === WELCOME_KIND ? null : kind;
  const passage = pack.passage;
  const linkLabel = !member.signupId ? LINK_LABEL.pack : checkinKind ? LINK_LABEL.checkin : LINK_LABEL.welcome;
  return {
    subject: `${label.zh}${BILINGUAL_SEPARATOR}${label.en} — ${pack.title}`,
    greeting: greeting(member.name),
    practices: member.practices,
    ownVersion: member.ownVersion ?? null,
    prompt: checkinKind ? promptWithoutKindLabel(pack.prompts[checkinKind]) : WELCOME_LINE,
    passage: passage ? {
      ref: passage.ref,
      keyVerse: passage.verses.find(v => v.num === passage.keyVerse) ?? null,
      verses: channel === 'email' ? passage.verses : [],
    } : null,
    link: { url: feedbackUrl(pack, member, checkinKind), label: linkLabel },
    stopUrl: member.signupId ? stopPageUrl(member.signupId) : null,
  };
}

/** Last line of an email's text part: "Scripture to Life · scripturetolife.org" (equals landingStrings SITE_LINE). */
export const SITE_FOOTER_LINE = `${EMAIL_BRAND_EN}${BILINGUAL_SEPARATOR}${SITE_HOST}`;

/**
 * Plain text: greeting, one line per practice (+ the own version), prompt,
 * [blank, passage line, key verse, blank], link, [blank, whole passage],
 * [blank], stop line. Without verses there are no blank lines (as before).
 */
export function checkinText(c: CheckinContent): string {
  const lines = [c.greeting, ...c.practices.map(practiceLine), ...(c.ownVersion ? [c.ownVersion] : []), c.prompt];
  const head = c.passage ? [...(c.passage.ref ? [passageLine(c.passage.ref)] : []), ...(c.passage.keyVerse ? [keyVerseLine(c.passage.keyVerse)] : [])] : [];
  if (head.length) lines.push('', ...head, '');
  lines.push(c.link.url);
  const tail = c.passage?.verses.length ? [FULL_PASSAGE_HEADING, ...c.passage.verses.map(passageVerseLine)] : [];
  if (tail.length) lines.push('', ...tail);
  if (c.stopUrl) lines.push(...(tail.length ? [''] : []), `${STOP_TEXT}${c.stopUrl}`);
  return lines.join('\n');
}

/** Text + (email only) HTML for one recipient; subject is bilingual with the pack title. */
export function renderCheckin(
  kind: MessageKind, pack: CheckinPack, member: MemberContext, channel: MessageChannel = 'email',
): CheckinMessage {
  const content = checkinContent(kind, pack, member, channel);
  if (channel === 'sms') return { subject: content.subject, text: checkinText(content) };   // SMS: no site line (length)
  const text = `${checkinText(content)}\n\n${SITE_FOOTER_LINE}`;
  return { subject: content.subject, text, html: renderCheckinHtml(content) };
}

/**
 * Extract the check-in prompts from a StudyPack JSON (the reflection
 * section's first three body lines, in tue/thu/weekend order). Throws with
 * context when the pack has no usable reflection section.
 */
export function promptsFromPack(raw: unknown): CheckinPack {
  const pack = raw as {
    id?: unknown; title?: unknown; leaderId?: unknown; sections?: unknown;
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
  };
}

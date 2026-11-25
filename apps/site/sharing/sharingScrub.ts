/**
 * sharingScrub.ts — the privacy guard before anything reaches the AI · 隐私过滤
 *
 * ADR-0008: shared answers go to the AI as text only. Before that, every
 * answer passes through a scrubber that replaces with SCRUBBED:
 *   - anything that looks like an email address;
 *   - anything that looks like a phone number (7+ digits, with the usual
 *     separators) — dates written as digits are lost too; that is accepted;
 *   - every exact occurrence of the identifiers the leader holds for the
 *     pack's sign-ups (names, and each word of a name of 2+ characters,
 *     emails, phones), case-insensitive; Latin terms as whole words.
 * The identifiers stay in the closure; nothing here sends or stores them.
 */
import { SCRUBBED } from './sharingStrings';

/** Unanchored, global: finds an address inside free text (EMAIL_SHAPE in supabase/functions/_shared/feedback validates a whole field instead). */
const EMAIL_IN_TEXT = /[^\s@，。、；：（）()]+@[^\s@，。、；：（）()]+\.[A-Za-z]{2,}/g;
/** A run of digits with phone separators; replaced only when it holds at least MIN_PHONE_DIGITS digits. */
const PHONE_LIKE = /\+?\(?\d[\d\s\-().]{4,}\d/g;
export const MIN_PHONE_DIGITS = 7;
/** Shorter name parts ("Li", one 字) are left alone: they match too much ordinary text. */
export const MIN_NAME_PART_CHARS = 2;

export interface MemberIdentifiers {
  name: string;
  email: string | null;
  phone: string | null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Latin terms match whole words only ("Ann" never eats "planned"); CJK names have no word breaks, so they match anywhere. */
function termPattern(term: string): string {
  const escaped = escapeRegExp(term);
  return /^[\x20-\x7e]+$/.test(term) ? `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])` : escaped;
}

/** The literal strings to remove for a set of members, longest first so "王小明" goes before "小明". */
export function identifierTerms(members: readonly MemberIdentifiers[]): string[] {
  const terms = new Set<string>();
  for (const m of members) {
    const name = m.name.trim();
    if (name) terms.add(name);
    for (const part of name.split(/\s+/)) if (part.length >= MIN_NAME_PART_CHARS) terms.add(part);
    if (m.email?.trim()) terms.add(m.email.trim());
    if (m.phone?.trim()) terms.add(m.phone.trim());
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

function scrubPatterns(text: string): string {
  return text
    .replace(EMAIL_IN_TEXT, SCRUBBED)
    .replace(PHONE_LIKE, run => ((run.match(/\d/g)?.length ?? 0) >= MIN_PHONE_DIGITS ? SCRUBBED : run));
}

/** A scrubber for one pack's members: exact identifiers first, then the email / phone patterns. */
export function makeScrubber(members: readonly MemberIdentifiers[]): (text: string) => string {
  const terms = identifierTerms(members);
  const exact = terms.length ? new RegExp(terms.map(termPattern).join('|'), 'gi') : null;
  return text => scrubPatterns(exact ? text.replace(exact, SCRUBBED) : text);
}

/**
 * sharingReply.ts — typed failures and the reply validator · 上周分享校验
 *
 * validateSharingReply: the parsed reply must hold 2–3 themes (extra ones
 * are dropped), 0–3 quotes (extra / over-long / empty ones are dropped —
 * a quote is optional) and one question, each with the halves the CURRENT
 * pack's content language requires (generatedPack's rules, R3). Anything
 * else is a SharingError('invalid-reply'). Every kept line is passed
 * through the scrubber once more, so a name the model happened to produce
 * never reaches the slide.
 */
import type { ContentLanguage } from '../studypack/principles';
import { contentLine } from '../studypack/principles';
import { hasHalves, requiredHalves, trimHalves, Bilingual } from '../newstudy/generatedPack';
import {
  SHARING_THEMES_MIN, SHARING_THEMES_MAX, SHARING_QUOTES_MAX, QUOTE_MAX_ZH_CHARS, QUOTE_MAX_EN_CHARS,
} from './sharingPrompt';
import { SH_ERR_INVALID } from './sharingStrings';

export type SharingErrorKind =
  | 'sign-in-needed'   // no signed-in leader: RLS rows cannot be read
  | 'unconfigured'     // this build has no Supabase client
  | 'no-previous'      // the leader has no other pack
  | 'nothing'          // the previous pack has no sign-ups and no shared answers
  | 'load'             // the PostgREST read failed
  | 'ai'               // the AI request failed (quota / no-credit / sign-in / network — askAIErrors' line)
  | 'invalid-reply';   // the reply did not validate, after one retry

export class SharingError extends Error {
  readonly kind: SharingErrorKind;
  constructor(kind: SharingErrorKind, message: string) {
    super(message);
    this.name = 'SharingError';
    this.kind = kind;
  }
}

/** The validated draft, already reduced to display lines for the pack's content language. */
export interface SharingDraft {
  themes: string[];
  quotes: string[];
  question: string;
}

function invalid(what: string): SharingError {
  return new SharingError('invalid-reply', `${SH_ERR_INVALID} (${what})`);
}

function quoteFits(q: Bilingual): boolean {
  return [...q.zh].length <= QUOTE_MAX_ZH_CHARS && q.en.length <= QUOTE_MAX_EN_CHARS;
}

/** Validate a parsed reply for the current pack's content language; returns display lines (scrubbed). */
export function validateSharingReply(
  raw: Record<string, unknown>, mode: ContentLanguage, scrub: (text: string) => string,
): SharingDraft {
  const halves = requiredHalves(mode);
  const line = (b: Bilingual) => scrub(contentLine(mode, b.zh, b.en));
  const { themes, quotes, question } = raw;
  if (!Array.isArray(themes) || !themes.every(t => hasHalves(t, halves))) throw invalid('themes');
  if (themes.length < SHARING_THEMES_MIN) throw invalid('themes');
  if (quotes !== undefined && (!Array.isArray(quotes) || !quotes.every(q => typeof q === 'object' && q !== null))) {
    throw invalid('quotes');
  }
  if (!hasHalves(question, halves)) throw invalid('question');
  const keptQuotes = ((quotes ?? []) as unknown[])
    .filter(q => hasHalves(q, halves))
    .map(q => trimHalves(q as Partial<Bilingual>))
    .filter(quoteFits)
    .slice(0, SHARING_QUOTES_MAX);
  return {
    themes: themes.slice(0, SHARING_THEMES_MAX).map(t => line(trimHalves(t as Partial<Bilingual>))),
    quotes: keptQuotes.map(line),
    question: line(trimHalves(question)),
  };
}

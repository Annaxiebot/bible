/**
 * guideAnswers.ts — the guide's leader-only answer bullets · 带领者答案核对 (ADR-0019 amendment)
 *
 * Pure. A leader's prep version (預查版) prints suggested answers as bullet
 * lines under each discussion question. The server prompt tells the model to
 * leave them out; this check makes a leak visible. Reading the guide line by line:
 * - a question opens an answer area: a line ending in ？/?, or one starting
 *   with a question marker ("（a）", "a.", "1.", "一、", "Q1");
 * - inside it, a line starting with a bullet (ANSWER_BULLET_MARKERS) or a
 *   numbered sub-point ("(1)", "1)", "①") is an answer; a following plain
 *   line continues it (the PDF wrapped it);
 * - a heading ("第…课", "二、…", a line ending in ：) closes the area.
 * A pack line is flagged when, under the verbatim check's normalisation, it is
 * part of an answer, or holds a whole answer — and that text does not also
 * appear in the rest of the guide (a phrase shared with a question is not a leak).
 */
import { ANSWER_BULLET_MARKERS } from '../../../supabase/functions/_shared/aiPrompts';
import { normaliseForMatch } from './guideVerbatim';

/** Shorter normalised texts match too much by chance. */
export const MIN_ANSWER_MATCH_CHARS = 4;

const escape = (s: string) => s.replace(/[-*]/g, ch => `\\${ch}`);
const BULLET = new RegExp(`^\\s*[${ANSWER_BULLET_MARKERS.map(escape).join('')}]\\s*`);
const SUB_POINT = /^\s*(?:[(（]\d+[)）]|\d+[)）]|[①-⑳])\s*/;
const QUESTION_MARKER = /^\s*(?:[(（][a-zA-Z一二三四五六七八九十][)）]|[a-zA-Z][.)）．]|\d+[.、．]|Q\d+|[一二三四五六七八九十]+、)/;
const QUESTION_END = /[？?][\s)）」”]*$/;
const HEADING = /^\s*(?:第.{1,6}[课課章部]|[一二三四五六七八九十]+、.*[^？?]$)|[：:]\s*$/;

interface Split { answers: string[]; rest: string[] }

type Kind = 'answer' | 'question' | 'heading' | 'plain';

function kindOf(line: string, inArea: boolean): Kind {
  if (BULLET.test(line)) return inArea ? 'answer' : 'plain';
  if (QUESTION_END.test(line)) return 'question';
  if (inArea && SUB_POINT.test(line)) return 'answer';
  if (HEADING.test(line)) return 'heading';
  if (QUESTION_MARKER.test(line)) return 'question';
  return 'plain';
}

/** The guide's lines split into answer bullets (markers stripped, continuations joined) and everything else. */
export function splitGuideAnswers(guideText: string): Split {
  const answers: string[] = [];
  const rest: string[] = [];
  let inArea = false;
  let current: number | null = null; // index into answers of the bullet being continued
  for (const line of guideText.split('\n')) {
    if (line.trim() === '') continue;
    const kind = kindOf(line, inArea);
    if (kind === 'answer') {
      answers.push(line.replace(BULLET, '').replace(SUB_POINT, '').trim());
      current = answers.length - 1;
    } else if (kind === 'plain' && current !== null) {
      answers[current] += line.trim();
    } else {
      inArea = kind === 'question' || (kind === 'plain' && inArea);
      current = null;
      rest.push(line);
    }
  }
  return { answers, rest };
}

/** The guide once, ready for many "is this line a leader's answer?" calls. */
export function answerMatcher(guideText: string): (line: string) => boolean {
  const { answers, rest } = splitGuideAnswers(guideText);
  const elsewhere = normaliseForMatch(rest.join('\n'));
  const normalised = answers.map(normaliseForMatch).filter(a => a.length >= MIN_ANSWER_MATCH_CHARS);
  if (normalised.length === 0) return () => false;
  return line => {
    const needle = normaliseForMatch(line);
    if (needle.length < MIN_ANSWER_MATCH_CHARS || elsewhere.includes(needle)) return false;
    return normalised.some(a => a.includes(needle) || (needle.includes(a) && !elsewhere.includes(a)));
  };
}

/** A shown pack line is checked whole and in its parts ("中文 · English", "ref — text"): one leaked half is enough. */
export function lineLooksLikeAnswer(line: string, isAnswer: (part: string) => boolean): boolean {
  return [line, ...line.split(/ · | — /)].some(part => isAnswer(part));
}

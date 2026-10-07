/**
 * bilingualAnswer.ts — the personal chat's two-pane answer protocol · 中英双栏回答协议 (ADR-0017)
 *
 * The ONLY module that knows how a study answer is divided into its 中文 and
 * English halves (R3). The scholar prompt (services/systemPrompts) asks for
 * two markdown headings, `## 中文` then `## English`; everything that reads an
 * answer — the chat panes, auto-saved research, the research viewer — calls
 * splitBilingualAnswer. Old threads and research hold the retired `[SPLIT]`
 * marker; this module's legacy path still splits them.
 */
import { bilingualLine } from '../components/studypack/principles';

/** The two section headings the prompt asks for, each on its own line. */
export const ZH_SECTION_HEADING = '## 中文';
export const EN_SECTION_HEADING = '## English';

/** Shown in the English pane when a finished answer has no English section. */
export const NO_ENGLISH_SECTION_NOTE = bilingualLine('无英文部分', 'no English section');

export interface BilingualAnswer {
  zh: string;
  /** null = no English section (yet, while streaming). */
  en: string | null;
}

export interface SplitOptions {
  /** The answer is still streaming: hold back a trailing half-written marker. */
  partial?: boolean;
}

// What a heading line may say, once its decoration (#, **, colon) is removed.
const ZH_LABELS = ['中文', '中文部分', '简体中文', 'chinese', 'chinese section'];
const EN_LABELS = ['english', 'english section', 'english version', 'english commentary', '英文', '英文部分'];
const LEGACY_WORD = 'split';
/** The retired `[SPLIT]`, also full-width brackets, any case, inline (pre-ADR-0017 answers). */
const LEGACY_MARKER = /[[［]\s*split\s*[\]］]/i;
const LEGACY_MARKER_ALL = new RegExp(LEGACY_MARKER.source, 'gi');

/** A heading line's bare label: "## **English:**" → "english". */
function headingLabel(line: string): string {
  return line.trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(\*\*|__)\s*/, '').replace(/\s*(\*\*|__)$/, '')
    .replace(/\s*[:：]$/, '')
    .replace(/\s*(\*\*|__)$/, '')
    .trim().toLowerCase();
}

/** Which section a heading line opens; null for text. A bare "English" / "中文" line is text, not a heading. */
function sectionOf(line: string): 'zh' | 'en' | null {
  const trimmed = line.trim();
  if (trimmed.length > 60) return null;
  const label = headingLabel(trimmed);
  if (label === trimmed.toLowerCase()) return null;
  if (EN_LABELS.includes(label)) return 'en';
  if (ZH_LABELS.includes(label)) return 'zh';
  return null;
}

/** A trailing streamed line that may still grow into a marker ("## Eng", "**中", "[SPL"). */
function mayBecomeMarker(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/[[［]\s*[a-z]*$/i.test(trimmed)) {
    const word = trimmed.replace(/^.*[[［]\s*/, '').toLowerCase();
    if (LEGACY_WORD.startsWith(word)) return true;
  }
  const bare = trimmed.replace(/^#{1,6}\s*/, '').replace(/^(\*\*|__)\s*/, '').toLowerCase();
  if (!bare) return true; // only "##" or "**" so far
  return [...ZH_LABELS, ...EN_LABELS].some(label => label.startsWith(bare) && bare !== label);
}

/** Splits on the section headings, either order; text before any heading belongs to 中文. */
function splitOnHeadings(lines: readonly string[]): BilingualAnswer | null {
  if (!lines.some(l => sectionOf(l) === 'en')) return null;
  const parts: Record<'zh' | 'en', string[]> = { zh: [], en: [] };
  let current: 'zh' | 'en' = 'zh';
  for (const line of lines) {
    const section = sectionOf(line);
    if (section) current = section;
    else parts[current].push(line);
  }
  const clean = (s: string[]) => s.join('\n').replace(LEGACY_MARKER_ALL, '').trim();
  return { zh: clean(parts.zh), en: clean(parts.en) };
}

/** Strips a leading 中文 heading from an answer that has no English section. */
function chineseOnly(lines: readonly string[]): string {
  const first = lines.findIndex(l => l.trim() !== '');
  const body = first >= 0 && sectionOf(lines[first]) === 'zh' ? lines.slice(first + 1) : lines;
  return body.join('\n').trim();
}

/**
 * The 中文 and English halves of a study answer. No English section → the
 * whole text is 中文 (never lost) and `en` is null. A finished answer whose
 * English section is empty also gets null, so the pane shows the note.
 */
export function splitBilingualAnswer(text: string, opts: SplitOptions = {}): BilingualAnswer {
  let lines = text.split('\n');
  if (opts.partial && mayBecomeMarker(lines[lines.length - 1])) lines = lines.slice(0, -1);
  const byHeadings = splitOnHeadings(lines);
  if (byHeadings) return { zh: byHeadings.zh, en: byHeadings.en || (opts.partial ? '' : null) };
  const joined = lines.join('\n');
  const legacy = joined.match(LEGACY_MARKER);
  if (legacy && legacy.index !== undefined) {
    const en = joined.slice(legacy.index + legacy[0].length).replace(LEGACY_MARKER_ALL, '').trim();
    return { zh: joined.slice(0, legacy.index).trim(), en: en || (opts.partial ? '' : null) };
  }
  return { zh: chineseOnly(lines), en: null };
}

/**
 * An assistant turn in the heading form, for history sent back to the model:
 * an old `[SPLIT]` answer is rewritten so the model only ever sees the
 * current protocol. Text without the legacy marker is returned unchanged.
 */
export function toHeadingForm(text: string): string {
  if (!LEGACY_MARKER.test(text)) return text;
  const { zh, en } = splitBilingualAnswer(text);
  return en === null ? zh : `${ZH_SECTION_HEADING}\n${zh}\n\n${EN_SECTION_HEADING}\n${en}`;
}

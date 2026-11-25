/**
 * slideText.ts — presentational text helpers for TV slides · 幻灯片文字
 *
 * Pure functions used by TVSlide: they only decide how existing text is
 * styled, never what it says (ADR-0003 guide fidelity). Joining the parts
 * back always yields the original string.
 */

/** Separator between a heading's name and its detail ("经文 Scripture — 马太福音 6:25–34 Matthew"). */
export const HEADING_DETAIL_SEPARATOR = ' — ';

export interface HeadingParts {
  main: string;
  detail?: string;
}

/**
 * Split a heading at its first " — ": the name stays heading-sized, the
 * detail (passage reference) is set smaller so a long bilingual heading
 * stays on one line at 1280×720. Chinese-first order is unchanged.
 */
export function splitHeading(heading: string): HeadingParts {
  const at = heading.indexOf(HEADING_DETAIL_SEPARATOR);
  if (at <= 0) return { main: heading };
  return { main: heading.slice(0, at), detail: heading.slice(at + HEADING_DETAIL_SEPARATOR.length) };
}

/** The quoted phrases inside a keyPhrase: 「中文」 and “English” (packAssembly writes both). */
export function keyPhraseFragments(keyPhrase: string | undefined): string[] {
  if (!keyPhrase) return [];
  const quoted = /「([^」]+)」|“([^”]+)”/g;
  const out: string[] = [];
  for (const m of keyPhrase.matchAll(quoted)) {
    const fragment = (m[1] ?? m[2]).trim().replace(/[，。,.;；:：!！?？]+$/, '');
    if (fragment) out.push(fragment);
  }
  return out;
}

export interface TextSegment {
  text: string;
  emphasis: boolean;
}

/** Cut `text` into plain and emphasised runs wherever a fragment occurs (case-insensitive). */
export function emphasisSegments(text: string, fragments: string[]): TextSegment[] {
  const lower = text.toLowerCase();
  const hits: Array<[number, number]> = [];
  for (const fragment of fragments) {
    const at = lower.indexOf(fragment.toLowerCase());
    if (at >= 0) hits.push([at, at + fragment.length]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  const segments: TextSegment[] = [];
  let pos = 0;
  for (const [start, end] of hits) {
    if (start < pos) continue; // overlapping hit: the earlier one wins
    if (start > pos) segments.push({ text: text.slice(pos, start), emphasis: false });
    segments.push({ text: text.slice(start, end), emphasis: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), emphasis: false });
  return segments;
}

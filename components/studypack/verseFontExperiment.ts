/**
 * verseFontExperiment.ts — TEMPORARY: 和合本 verses in 霞鹜文楷 WenKai on the TV · 经文字体试验
 *
 * Verse font experiment (2026-10-04, ADR-0003 §15 note): the owner judges on
 * his TV whether the Chinese verse column reads better in LXGW WenKai than in
 * the system sans. Only the 和合本 column changes; BSB, headings and body do
 * not. Two ways in, on the same passage:
 *   - URL: `#/pack/<id>?verseFont=wenkai` (query inside the hash) or
 *     `?verseFont=wenkai#/pack/<id>` (query before the hash) — both work;
 *   - key "F" in TV mode flips sans ⇄ WenKai live and shows a corner label
 *     for 2 seconds.
 * WenKai REGULAR (lighter than the headings' bold, better for long text) is
 * loaded on demand, only when the experiment is on: its CSS is split into
 * unicode-range slices, so the browser fetches every slice the passage needs.
 *
 * One place to end it: set VERSE_FONT_EXPERIMENT to false (everything here
 * becomes a no-op), or delete this file plus its uses (TVPresentationView's
 * useVerseFont + label, TVSlide's `verseFont` prop, .stl-verse-wenkai in
 * styles/stlShared.css). To make WenKai permanent, put .stl-verse-wenkai on
 * the 和合本 VerseText unconditionally and load the regular CSS in index.html.
 */
import { useEffect, useRef, useState } from 'react';

/** The experiment's on/off switch. */
export const VERSE_FONT_EXPERIMENT = true;

export type VerseFont = 'sans' | 'wenkai';
export const VERSE_FONT_PARAM = 'verseFont';
export const VERSE_FONT_WENKAI: VerseFont = 'wenkai';
/** The class the 和合本 verse text carries while WenKai is on (styles/stlShared.css). */
export const VERSE_FONT_WENKAI_CLASS = 'stl-verse-wenkai';
export const VERSE_FONT_TOGGLE_KEY = 'f';
export const VERSE_FONT_LABEL_MS = 2000;
/** Same package + version as the bold heading CSS in index.html (verseFontExperiment.test.ts pins it). */
export const WENKAI_REGULAR_CSS = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css';
const WENKAI_REGULAR_LINK_ID = 'stl-wenkai-regular';

const FONT_NAMES: Record<VerseFont, string> = { sans: '黑体 Sans', wenkai: '文楷 WenKai' };

/** "经文字体 Verse font: 文楷 WenKai" — the corner label after a toggle. */
export function verseFontLabel(font: VerseFont): string {
  return `经文字体 Verse font: ${FONT_NAMES[font]}`;
}

/** `?verseFont=wenkai` before the hash, or after the route inside it. Anything else is the default sans. */
export function readVerseFont(loc: Pick<Location, 'search' | 'hash'>): VerseFont {
  if (!VERSE_FONT_EXPERIMENT) return 'sans';
  const hashQuery = loc.hash.includes('?') ? loc.hash.slice(loc.hash.indexOf('?')) : '';
  for (const query of [loc.search, hashQuery]) {
    if (new URLSearchParams(query).get(VERSE_FONT_PARAM) === VERSE_FONT_WENKAI) return VERSE_FONT_WENKAI;
  }
  return 'sans';
}

/** Add the WenKai regular stylesheet once (non-blocking; the slices load as glyphs are shown). */
export function ensureWenKaiRegular(doc: Document = document): void {
  if (doc.getElementById(WENKAI_REGULAR_LINK_ID)) return;
  const link = doc.createElement('link');
  link.id = WENKAI_REGULAR_LINK_ID;
  link.rel = 'stylesheet';
  link.href = WENKAI_REGULAR_CSS;
  doc.head.appendChild(link);
}

/**
 * The verse font for TV mode: follows the URL (on load and on a hash edit), "F" flips it (not while
 * `enabled` is false — the Ask AI overlay is typing — nor with a modifier,
 * so Cmd/Ctrl+F still finds). `label` is the corner text for 2 s after a flip.
 */
export function useVerseFont(enabled: boolean): { font: VerseFont; label: string | null } {
  const [font, setFont] = useState<VerseFont>(() => readVerseFont(window.location));
  const [label, setLabel] = useState<string | null>(null);
  const fontRef = useRef(font);
  fontRef.current = font;

  useEffect(() => { if (font === VERSE_FONT_WENKAI) ensureWenKaiRegular(); }, [font]);

  // Editing only the hash in the address bar does not reload the page: re-read the flag.
  useEffect(() => {
    const onHashChange = () => setFont(readVerseFont(window.location));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!VERSE_FONT_EXPERIMENT || !enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== VERSE_FONT_TOGGLE_KEY || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      const next: VerseFont = fontRef.current === VERSE_FONT_WENKAI ? 'sans' : VERSE_FONT_WENKAI;
      fontRef.current = next;
      setFont(next);
      setLabel(verseFontLabel(next));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  useEffect(() => {
    if (!label) return;
    const timer = window.setTimeout(() => setLabel(null), VERSE_FONT_LABEL_MS);
    return () => window.clearTimeout(timer);
  }, [label]);

  return { font, label };
}

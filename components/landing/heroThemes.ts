/**
 * heroThemes.ts — registry + pure selector for the hero background · 主视觉主题
 *
 * The site rotates among background animations DETERMINISTICALLY:
 *   1. `override` (from a `?theme=<id>` URL param) wins;
 *   2. else a passage-linked theme, if the current sample pack maps to a
 *      registered theme;
 *   3. else by time of day: 05–11 dawn, 11–18 waters (dawn until it exists),
 *      18–05 stars.
 * Add a theme by adding one file under themes/ and one entry in HERO_THEMES;
 * the selector never needs to change. Session stickiness lives in
 * heroThemeSession.ts.
 */
import type React from 'react';
import DawnTheme from './themes/DawnTheme';
import StarsTheme from './themes/StarsTheme';

export type HeroThemeId = 'dawn' | 'stars' | 'waters' | 'wind' | 'seed' | 'birds';

export interface HeroTheme {
  id: HeroThemeId;
  verseZh: string;
  verseEn: string;
  Component: React.FC;
}

export const HERO_THEMES: readonly HeroTheme[] = [
  { id: 'dawn', verseZh: '创世记 1:3', verseEn: 'Genesis 1:3', Component: DawnTheme },
  { id: 'stars', verseZh: '诗篇 147:4', verseEn: 'Psalm 147:4', Component: StarsTheme },
];

/** Sample pack id → theme id. Only honoured when that theme is registered. */
export const PASSAGE_THEMES: Readonly<Record<string, HeroThemeId>> = {
  '2026-10-02-matt6': 'birds',
};

const DAWN_START = 5;
const WATERS_START = 11;
const STARS_START = 18;

export interface ThemeSelection {
  hour: number;            // 0–23, local time
  packId?: string | null;  // the sample pack the landing links to
  override?: string | null;
}

/** Time-of-day band, before checking what is registered. */
export function timeOfDayThemeId(hour: number): HeroThemeId {
  if (hour >= DAWN_START && hour < WATERS_START) return 'dawn';
  if (hour >= WATERS_START && hour < STARS_START) return 'waters';
  return 'stars';
}

function find(themes: readonly HeroTheme[], id: string | null | undefined): HeroTheme | undefined {
  return id ? themes.find(t => t.id === id) : undefined;
}

/** Pure: same inputs → same theme. `themes` is injectable for tests and future registries. */
export function selectHeroTheme(
  input: ThemeSelection,
  themes: readonly HeroTheme[] = HERO_THEMES,
): HeroTheme {
  const overridden = find(themes, input.override);
  if (overridden) return overridden;
  const byPassage = find(themes, input.packId ? PASSAGE_THEMES[input.packId] : undefined);
  if (byPassage) return byPassage;
  return find(themes, timeOfDayThemeId(input.hour)) ?? find(themes, 'dawn') ?? themes[0];
}

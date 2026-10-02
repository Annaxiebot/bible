/**
 * heroThemes.test.ts — deterministic hero theme selection · 主题选择测试
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  HERO_THEMES, HeroTheme, PASSAGE_THEMES, selectHeroTheme, timeOfDayThemeId,
} from '../heroThemes';
import { resolveSessionTheme, THEME_SESSION_KEY, SessionEnv } from '../heroThemeSession';

const Noop: React.FC = () => null;
const fake = (id: HeroTheme['id']): HeroTheme => ({ id, verseZh: '', verseEn: '', Component: Noop });

describe('selectHeroTheme', () => {
  it('registers dawn and stars', () => {
    expect(HERO_THEMES.map(t => t.id)).toEqual(['dawn', 'stars']);
  });

  it('override wins over everything', () => {
    expect(selectHeroTheme({ hour: 22, override: 'dawn' }).id).toBe('dawn');
    expect(selectHeroTheme({ hour: 8, override: 'stars', packId: '2026-10-02-matt6' }).id).toBe('stars');
  });

  it('ignores an override that is not a registered theme', () => {
    expect(selectHeroTheme({ hour: 22, override: 'lightning' }).id).toBe('stars');
  });

  it('uses the passage map only when the mapped theme is registered', () => {
    expect(PASSAGE_THEMES['2026-10-02-matt6']).toBe('birds');
    expect(selectHeroTheme({ hour: 8, packId: '2026-10-02-matt6' }).id).toBe('dawn');
    const withBirds = [...HERO_THEMES, fake('birds')];
    expect(selectHeroTheme({ hour: 8, packId: '2026-10-02-matt6' }, withBirds).id).toBe('birds');
    expect(selectHeroTheme({ hour: 8, packId: 'unmapped-pack' }, withBirds).id).toBe('dawn');
  });

  it('time bands: 05–11 dawn, 11–18 waters, 18–05 stars', () => {
    expect(timeOfDayThemeId(5)).toBe('dawn');
    expect(timeOfDayThemeId(10)).toBe('dawn');
    expect(timeOfDayThemeId(11)).toBe('waters');
    expect(timeOfDayThemeId(17)).toBe('waters');
    expect(timeOfDayThemeId(18)).toBe('stars');
    expect(timeOfDayThemeId(23)).toBe('stars');
    expect(timeOfDayThemeId(0)).toBe('stars');
    expect(timeOfDayThemeId(4)).toBe('stars');
  });

  it('falls back to dawn for the waters band until waters exists', () => {
    expect(selectHeroTheme({ hour: 14 }).id).toBe('dawn');
    const withWaters = [...HERO_THEMES, fake('waters')];
    expect(selectHeroTheme({ hour: 14 }, withWaters).id).toBe('waters');
  });
});

describe('resolveSessionTheme', () => {
  let store: Map<string, string>;
  let storage: SessionEnv['storage'];

  beforeEach(() => {
    store = new Map();
    storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    };
  });

  it('pins the first selection for the session, even if the hour changes', () => {
    expect(resolveSessionTheme({ search: '', hour: 22, storage }).id).toBe('stars');
    expect(store.get(THEME_SESSION_KEY)).toBe('stars');
    expect(resolveSessionTheme({ search: '', hour: 8, storage }).id).toBe('stars');
  });

  it('?theme= overrides a pinned theme and re-pins it', () => {
    resolveSessionTheme({ search: '', hour: 22, storage });
    expect(resolveSessionTheme({ search: '?theme=dawn', hour: 22, storage }).id).toBe('dawn');
    expect(store.get(THEME_SESSION_KEY)).toBe('dawn');
  });

  it('ignores a stale pinned id that is no longer registered', () => {
    store.set(THEME_SESSION_KEY, 'retired-theme');
    expect(resolveSessionTheme({ search: '', hour: 8, storage }).id).toBe('dawn');
  });

  it('works with no storage at all', () => {
    expect(resolveSessionTheme({ search: '', hour: 3, storage: null }).id).toBe('stars');
  });
});

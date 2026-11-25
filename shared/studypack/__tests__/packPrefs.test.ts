import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIEW_PREFS, HIDEABLE_KINDS, applyViewPrefs, loadViewPrefs, saveViewPrefs, swapBilingualLine,
} from '../packPrefs';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { BILINGUAL_SEPARATOR } from '../principles';
import type { StudyPack } from '../packTypes';

const pack = {
  sections: [
    { kind: 'title', heading: 't' },
    { kind: 'scripture', heading: 's', verses: [{ num: 1, cuv: '经文', en: 'verse' }] },
    { kind: 'originalLanguage', heading: 'o', body: [`原文${BILINGUAL_SEPARATOR}original`] },
    { kind: 'discussion', heading: 'd', questions: [`问题${BILINGUAL_SEPARATOR}question`] },
    { kind: 'lifeMenu', heading: 'l', rows: [{ area: '健康 Health', practice: `操练${BILINGUAL_SEPARATOR}practice` }] },
  ],
} as StudyPack;

function memoryStore(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as Storage & { data: Map<string, string> };
}

describe('packPrefs', () => {
  it('hides a hidden kind and keeps the spine (title/scripture/discussion are never hideable)', () => {
    const seen = applyViewPrefs(pack, { hidden: ['originalLanguage', 'lifeMenu'], enFirst: false });
    expect(seen.sections.map(s => s.kind)).toEqual(['title', 'scripture', 'discussion']);
    expect((HIDEABLE_KINDS as readonly string[]).includes('title')).toBe(false);
    expect((HIDEABLE_KINDS as readonly string[]).includes('scripture')).toBe(false);
    expect((HIDEABLE_KINDS as readonly string[]).includes('discussion')).toBe(false);
  });

  it('enFirst swaps body lines, questions and life-menu practices; the input pack is untouched', () => {
    const seen = applyViewPrefs(pack, { hidden: [], enFirst: true });
    expect(seen.sections[2].body).toEqual([`original${BILINGUAL_SEPARATOR}原文`]);
    expect(seen.sections[3].questions).toEqual([`question${BILINGUAL_SEPARATOR}问题`]);
    expect(seen.sections[4].rows?.[0].practice).toBe(`practice${BILINGUAL_SEPARATOR}操练`);
    expect(pack.sections[2].body).toEqual([`原文${BILINGUAL_SEPARATOR}original`]); // pure
  });

  it('swapBilingualLine passes through lines without exactly one separator', () => {
    expect(swapBilingualLine('只有中文')).toBe('只有中文');
    expect(swapBilingualLine(`a${BILINGUAL_SEPARATOR}b${BILINGUAL_SEPARATOR}c`)).toBe(`a${BILINGUAL_SEPARATOR}b${BILINGUAL_SEPARATOR}c`);
  });

  it('save → load round-trips; unknown kinds and corrupt JSON fall back safely', () => {
    const store = memoryStore();
    saveViewPrefs({ hidden: ['crossRefs'], enFirst: true }, store);
    expect(loadViewPrefs(store)).toEqual({ hidden: ['crossRefs'], enFirst: true });
    store.data.set(STORAGE_KEYS.STUDYPACK_VIEW_PREFS, '{"hidden":["title","nope","reflection"],"enFirst":"yes"}');
    expect(loadViewPrefs(store)).toEqual({ hidden: ['reflection'], enFirst: false });
    store.data.set(STORAGE_KEYS.STUDYPACK_VIEW_PREFS, 'not json');
    expect(loadViewPrefs(store)).toEqual(DEFAULT_VIEW_PREFS);
  });
});

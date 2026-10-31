/**
 * worship.test.ts — worship song suggestions, end to end of the pure layer
 * (ADR-0022 step 2): the prompt offers ONLY the catalog, the validator drops
 * made-up titles and never fails a pack over songs, assembly opens the pack
 * with the section, the order rules pin it right after the title, and the
 * shipped public/worship-songs.json parses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  CatalogSong, matchCatalogSong, songSearchUrl, songTitle, toWorshipSongs, worshipPromptBlock,
} from '../worshipCatalog';
import { worshipPicks, validateGenerated } from '../generatedPack';
import { buildPackPrompt, WORSHIP_SHAPE_KEY } from '../packPrompt';
import { assemblePack } from '../packAssembly';
import { validateSectionOrder, insertPosition, defaultSection, canAdd } from '../sectionRules';
import { parseStudyPack, PackSection } from '../../studypack/packTypes';
import { buildSlides } from '../../studypack/packSlides';
import { NS_ERR_WORSHIP_PLACE } from '../newStudyStrings';
import { JOHN3_REQUEST, JOHN3_GENERATED } from './fixtures';

const CATALOG: CatalogSong[] = [
  { zh: '宝贵十架', en: 'Precious Cross', channel: '赞美之泉 Stream of Praise', themes: 'cross 十架' },
  { zh: '', en: 'In Christ Alone', channel: 'Keith & Kristyn Getty', themes: 'assurance 确据' },
  { zh: '云上太阳', en: 'Sun Above the Clouds', channel: '赞美之泉 Stream of Praise', themes: 'hope 盼望' },
];

const VERSES = [{ num: 22, cuv: '这事以后…', en: 'After these things…' }];

describe('worship catalog', () => {
  it('ships a valid public/worship-songs.json', () => {
    const file = path.resolve(__dirname, '../../../public/worship-songs.json');
    const data = JSON.parse(readFileSync(file, 'utf-8')) as { songs: CatalogSong[] };
    expect(data.songs.length).toBeGreaterThanOrEqual(30);
    for (const s of data.songs) {
      expect(s.zh.length > 0 || s.en.length > 0, songTitle(s)).toBe(true);
      expect(s.channel.length).toBeGreaterThan(0);
      expect(s.themes.length).toBeGreaterThan(0);
    }
  });

  it('ships the 10 Family Music Ministry songs, each with its direct video url', () => {
    const file = path.resolve(__dirname, '../../../public/worship-songs.json');
    const data = JSON.parse(readFileSync(file, 'utf-8')) as { songs: CatalogSong[] };
    const fmm = data.songs.filter(s => s.channel === 'Family Music Ministry');
    expect(fmm).toHaveLength(10);
    for (const s of fmm) expect(s.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
  });

  it('a catalog url wins over the search link; without one the search link stands', () => {
    const direct: CatalogSong = { ...CATALOG[0], url: 'https://www.youtube.com/watch?v=abc123def45' };
    expect(songSearchUrl(direct)).toBe('https://www.youtube.com/watch?v=abc123def45');
    expect(toWorshipSongs([direct])[0].url).toBe('https://www.youtube.com/watch?v=abc123def45');
    expect(songSearchUrl(CATALOG[0])).toContain('youtube.com/results?search_query=');
  });

  it('builds a YouTube SEARCH link (no guessed video ids that can rot)', () => {
    const url = songSearchUrl(CATALOG[0]);
    expect(url).toContain('youtube.com/results?search_query=');
    expect(url).toContain(encodeURIComponent('宝贵十架 Precious Cross'));
  });

  it('matches a title by full display name or either half, case-insensitively', () => {
    expect(matchCatalogSong('宝贵十架', CATALOG)).toBe(CATALOG[0]);
    expect(matchCatalogSong('in christ alone', CATALOG)).toBe(CATALOG[1]);
    expect(matchCatalogSong('宝贵十架 Precious Cross', CATALOG)).toBe(CATALOG[0]);
    expect(matchCatalogSong('Amazing Grace', CATALOG)).toBeNull();
    expect(matchCatalogSong('', CATALOG)).toBeNull();
  });
});

describe('worship in the prompt', () => {
  const base = { passageRef: 'x', verses: VERSES, contentLanguage: 'bilingual' as const };
  it('with a catalog: the song list block and the worship shape key are in the prompt', () => {
    const prompt = buildPackPrompt({ ...base, worshipCatalog: CATALOG });
    expect(prompt).toContain('WORSHIP SONG LIST');
    expect(prompt).toContain('宝贵十架 Precious Cross');
    expect(prompt).toContain(WORSHIP_SHAPE_KEY);
    // Owner's rule (2026-10-31): one FMM song per pick is REQUIRED, not a soft preference the model may skip.
    expect(prompt).toContain('REQUIRED: exactly ONE of the picks is a Family Music Ministry song');
    expect(prompt).toContain('— Keith & Kristyn Getty ('); // channel is in each list line so the preference is actionable
  });
  it('without a catalog: no worship anywhere in the prompt', () => {
    const prompt = buildPackPrompt(base);
    expect(prompt).not.toContain('WORSHIP');
    expect(prompt).not.toContain('"worship"');
  });
  it('the block is injected, not duplicated inline (R3): it comes from worshipPromptBlock', () => {
    expect(buildPackPrompt({ ...base, worshipCatalog: CATALOG })).toContain(worshipPromptBlock(CATALOG));
  });
});

describe('worship validation (never fails a pack)', () => {
  it('keeps catalog picks, drops invented titles and duplicates', () => {
    const picks = worshipPicks(['宝贵十架', 'My Made-up Song', 'In Christ Alone', '宝贵十架'], CATALOG);
    expect(picks.map(s => s.title)).toEqual(['宝贵十架 Precious Cross', 'In Christ Alone']);
    expect(picks[0].url).toBe(songSearchUrl(CATALOG[0]));
    expect(picks[0].channel).toBe(CATALOG[0].channel);
  });
  it('a missing or malformed worship key is an empty list, not an error', () => {
    expect(worshipPicks(undefined, CATALOG)).toEqual([]);
    expect(worshipPicks('not-a-list', CATALOG)).toEqual([]);
  });
  it('validateGenerated carries worship only when a catalog was in play', () => {
    const withSongs = validateGenerated({ ...JOHN3_GENERATED, worship: ['宝贵十架'] }, 'bilingual', CATALOG);
    expect(withSongs.worship?.map(s => s.title)).toEqual(['宝贵十架 Precious Cross']);
    const without = validateGenerated({ ...JOHN3_GENERATED, worship: ['宝贵十架'] }, 'bilingual');
    expect(without.worship).toBeUndefined();
  });
});

describe('worship in the assembled pack', () => {
  const gen = (worship?: ReturnType<typeof toWorshipSongs>) =>
    validateGenerated(JOHN3_GENERATED, 'bilingual') && { ...validateGenerated(JOHN3_GENERATED, 'bilingual'), worship };

  it('opens the pack right after the title and survives parse + slides', () => {
    const songs = toWorshipSongs([CATALOG[0], CATALOG[1]]);
    const pack = assemblePack(JOHN3_REQUEST, VERSES, gen(songs));
    expect(pack.sections[1].kind).toBe('worship');
    expect(pack.sections[1].songs).toHaveLength(2);
    expect(validateSectionOrder(pack.sections)).toBeNull();
    const slide = buildSlides(pack).find(s => s.kind === 'worship')!;
    expect(slide.songs?.[0].title).toBe('宝贵十架 Precious Cross');
    expect(() => parseStudyPack(JSON.parse(JSON.stringify(pack)))).not.toThrow();
  });
  it('no picks → no worship section', () => {
    const pack = assemblePack(JOHN3_REQUEST, VERSES, gen([]));
    expect(pack.sections.some(s => s.kind === 'worship')).toBe(false);
  });
});

describe('worship section rules', () => {
  const title: PackSection = { kind: 'title', heading: 't' };
  const worship: PackSection = { kind: 'worship', heading: 'w', songs: [{ title: 's', url: 'u' }] };
  const sharing: PackSection = { kind: 'sharing', heading: 'sh', body: ['x'] };
  const scripture: PackSection = { kind: 'scripture', heading: 'sc', verses: VERSES };

  it('worship sits right after the title; sharing follows it', () => {
    expect(validateSectionOrder([title, worship, scripture])).toBeNull();
    expect(validateSectionOrder([title, worship, sharing, scripture])).toBeNull();
    expect(validateSectionOrder([title, sharing, worship, scripture])).toBe(NS_ERR_WORSHIP_PLACE);
    expect(validateSectionOrder([title, scripture, worship])).toBe(NS_ERR_WORSHIP_PLACE);
  });
  it('is addable once, inserted at index 1, with an editable blank row', () => {
    expect(canAdd([title, scripture], 'worship')).toBe(true);
    expect(canAdd([title, worship, scripture], 'worship')).toBe(false);
    expect(insertPosition([title, scripture], 'worship')).toBe(1);
    expect(defaultSection('worship').songs).toEqual([{ title: '', url: '' }]);
  });
});

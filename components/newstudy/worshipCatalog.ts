/**
 * worshipCatalog.ts — the worship song catalog the AI picks from · 诗歌目录
 *
 * public/worship-songs.json lists songs from the channels on the worship
 * resources page (ADR-0022): display titles, channel, themes. Songs are
 * linked on YouTube only — the url built here is a YouTube SEARCH for
 * "title channel", which cannot rot; the leader can paste a specific video
 * URL in the pack editor. The catalog is fetched once per session; a fetch
 * failure means "no suggestions", never a failed pack (generatePack).
 */
import type { WorshipSong } from '../studypack/packTypes';

export interface CatalogSong {
  zh: string;       // Chinese title, '' when the song has none
  en: string;       // English title, '' when the song has none
  channel: string;  // display name, as worship.html writes it
  themes: string;   // bilingual theme keywords the AI matches against the passage
}

/** Display title, Chinese first ("宝贵十架 Precious Cross"); single-language songs show their one title. */
export function songTitle(song: CatalogSong): string {
  return [song.zh, song.en].filter(Boolean).join(' ');
}

/** The YouTube search link for a catalog song (never a guessed video id — a search cannot 404). */
export function songSearchUrl(song: CatalogSong): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${songTitle(song)} ${song.channel}`)}`;
}

function isCatalogSong(v: unknown): v is CatalogSong {
  const s = v as Partial<CatalogSong>;
  return typeof s === 'object' && s !== null
    && typeof s.zh === 'string' && typeof s.en === 'string'
    && (s.zh.length > 0 || s.en.length > 0)
    && typeof s.channel === 'string' && s.channel.length > 0
    && typeof s.themes === 'string';
}

let cached: Promise<CatalogSong[]> | null = null;

/** The catalog, fetched once per session. Throws on an unavailable/malformed file (the caller decides fail-soft). */
export function loadWorshipCatalog(): Promise<CatalogSong[]> {
  if (!cached) {
    cached = (async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}worship-songs.json`);
      if (!res.ok) throw new Error(`worship-songs.json unavailable: ${res.status}`);
      const data = (await res.json()) as { songs?: unknown };
      if (!Array.isArray(data.songs) || !data.songs.every(isCatalogSong)) {
        throw new Error('worship-songs.json is malformed');
      }
      return data.songs;
    })();
    cached.catch(() => { cached = null; }); // a failed fetch is retried next time
  }
  return cached;
}

/** Test hook. */
export function clearWorshipCatalogCache(): void {
  cached = null;
}

/** The prompt's catalog block: one compact line per song the model may pick from (titles are the keys). */
export function worshipPromptBlock(catalog: CatalogSong[]): string {
  const lines = catalog.map(s => `- ${songTitle(s)} (${s.themes})`);
  return [
    'WORSHIP SONG LIST (pick ONLY from these exact titles):',
    ...lines,
  ].join('\n');
}

/**
 * Match one model-written title to a catalog song: exact display title, or
 * either half alone, case-insensitive. Null when it is not in the catalog.
 */
export function matchCatalogSong(title: unknown, catalog: CatalogSong[]): CatalogSong | null {
  if (typeof title !== 'string') return null;
  const needle = title.trim().toLowerCase();
  if (!needle) return null;
  return catalog.find(s => [songTitle(s), s.zh, s.en]
    .some(t => t && t.toLowerCase() === needle)) ?? null;
}

/** Catalog picks → the pack's worship songs (display title + search link + channel), duplicates dropped. */
export function toWorshipSongs(picks: CatalogSong[]): WorshipSong[] {
  const seen = new Set<string>();
  const out: WorshipSong[] = [];
  for (const s of picks) {
    const title = songTitle(s);
    if (seen.has(title)) continue;
    seen.add(title);
    out.push({ title, url: songSearchUrl(s), channel: s.channel });
  }
  return out;
}

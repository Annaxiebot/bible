/**
 * Unified Search Service
 *
 * Searches across Bible text (cached chapters), AI research notes, and personal notes.
 * Returns merged, deduplicated results with match context.
 */

import { verseDataStorage } from './verseDataStorage';
import { notesStorage } from './notesStorage';
import { stripHTML } from '../utils/textUtils';
import { BOOK_ID_TO_CHINESE_NAME } from './bibleBookData';

export type SearchScope = 'all' | 'bible' | 'research' | 'notes';

export interface UnifiedSearchResult {
  /** Unique key for React rendering */
  key: string;
  /** Source of the result */
  source: 'bible' | 'research' | 'notes';
  /** Human-readable label (e.g. "Genesis 1:1") */
  label: string;
  /** Book ID (if applicable) */
  bookId?: string;
  /** Chapter number */
  chapter?: number;
  /** Verse number(s) */
  verses?: number[];
  /** Snippet of matching text */
  snippet: string;
  /** The full text content */
  fullText: string;
  /** Timestamp (for notes/research) */
  timestamp?: number;
}

/**
 * Highlight matching terms in a snippet by wrapping them in <mark> tags.
 */
export function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

/**
 * Extract a snippet around the first match of `query` in `text`.
 */
function extractSnippet(text: string, query: string, maxLen = 150): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet += '...';
  return snippet;
}

/**
 * Format a verse reference for display.
 */
function formatReference(bookId: string, chapter: number, verses: number[]): string {
  const chineseName = BOOK_ID_TO_CHINESE_NAME[bookId] || bookId;
  const verseStr = verses.length === 1 ? `${verses[0]}` : `${verses[0]}-${verses[verses.length - 1]}`;
  return `${chineseName} ${chapter}:${verseStr}`;
}

/**
 * Search Bible text in cached chapters (localStorage).
 */
async function searchBibleText(query: string, maxResults = 50): Promise<UnifiedSearchResult[]> {
  const results: UnifiedSearchResult[] = [];
  const searchTerm = query.toLowerCase();

  // Scan localStorage for cached Bible chapters
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('bible_cache_')) continue;
    if (key === 'bible_cache_index') continue;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const cached = JSON.parse(raw);
      const verses = cached.verses || cached.data?.verses;
      if (!Array.isArray(verses)) continue;

      for (const v of verses) {
        if (v.text && v.text.toLowerCase().includes(searchTerm)) {
          const bookId = v.book_id || cached.bookId || key.replace('bible_cache_', '').split('_')[0];
          const chapter = v.chapter || cached.chapter;
          results.push({
            key: `bible-${bookId}-${chapter}-${v.verse}`,
            source: 'bible',
            label: `${v.book_name || bookId} ${chapter}:${v.verse}`,
            bookId,
            chapter,
            verses: [v.verse],
            snippet: extractSnippet(v.text, query),
            fullText: v.text,
          });
          if (results.length >= maxResults) return results;
        }
      }
    } catch {
      // Skip malformed cache entries
    }
  }

  return results;
}

/**
 * Search AI research entries stored per verse.
 */
async function searchAIResearch(query: string, maxResults = 50): Promise<UnifiedSearchResult[]> {
  const results: UnifiedSearchResult[] = [];
  const matchingData = await verseDataStorage.searchResearch(query);

  for (const vd of matchingData) {
    for (const entry of vd.aiResearch) {
      const plain = stripHTML(entry.response);
      if (
        entry.query.toLowerCase().includes(query.toLowerCase()) ||
        plain.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push({
          key: `research-${vd.id}-${entry.id}`,
          source: 'research',
          label: formatReference(vd.bookId, vd.chapter, vd.verses),
          bookId: vd.bookId,
          chapter: vd.chapter,
          verses: vd.verses,
          snippet: extractSnippet(plain, query),
          fullText: plain,
          timestamp: entry.timestamp,
        });
        if (results.length >= maxResults) return results;
      }
    }
  }

  return results;
}

/**
 * Search personal notes (from both verseDataStorage and notesStorage).
 */
async function searchPersonalNotes(query: string, maxResults = 50): Promise<UnifiedSearchResult[]> {
  const results: UnifiedSearchResult[] = [];
  const searchTerm = query.toLowerCase();

  // 1) Verse-level personal notes
  const matchingData = await verseDataStorage.searchNotes(query);
  for (const vd of matchingData) {
    if (vd.personalNote?.text) {
      results.push({
        key: `note-verse-${vd.id}`,
        source: 'notes',
        label: formatReference(vd.bookId, vd.chapter, vd.verses),
        bookId: vd.bookId,
        chapter: vd.chapter,
        verses: vd.verses,
        snippet: extractSnippet(vd.personalNote.text, query),
        fullText: vd.personalNote.text,
        timestamp: vd.personalNote.updatedAt,
      });
      if (results.length >= maxResults) return results;
    }
  }

  // 2) General notes from notesStorage
  const allNotes = await notesStorage.getAllNotes();
  for (const [reference, data] of Object.entries(allNotes)) {
    if (data.toLowerCase().includes(searchTerm)) {
      // Parse reference format "bookId:chapter:verse"
      const parts = reference.split(':');
      const bookId = parts[0] || undefined;
      const chapter = parts[1] ? parseInt(parts[1]) : undefined;
      const verse = parts[2] ? parseInt(parts[2]) : undefined;

      results.push({
        key: `note-general-${reference}`,
        source: 'notes',
        label: bookId && chapter ? formatReference(bookId, chapter, verse ? [verse] : []) : reference,
        bookId,
        chapter,
        verses: verse ? [verse] : undefined,
        snippet: extractSnippet(data, query),
        fullText: data,
      });
      if (results.length >= maxResults) return results;
    }
  }

  return results;
}

/**
 * Perform a unified search across the selected scope.
 */
export async function unifiedSearch(
  query: string,
  scope: SearchScope = 'all',
  maxResults = 50
): Promise<UnifiedSearchResult[]> {
  if (!query.trim()) return [];

  const promises: Promise<UnifiedSearchResult[]>[] = [];

  if (scope === 'all' || scope === 'bible') {
    promises.push(searchBibleText(query, maxResults));
  }
  if (scope === 'all' || scope === 'research') {
    promises.push(searchAIResearch(query, maxResults));
  }
  if (scope === 'all' || scope === 'notes') {
    promises.push(searchPersonalNotes(query, maxResults));
  }

  const allResults = (await Promise.all(promises)).flat();

  // Sort: exact matches first, then by timestamp (most recent first)
  allResults.sort((a, b) => {
    const aExact = a.snippet.toLowerCase().includes(query.toLowerCase()) ? 0 : 1;
    const bExact = b.snippet.toLowerCase().includes(query.toLowerCase()) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  return allResults.slice(0, maxResults);
}

/**
 * journalAIService.ts
 *
 * AI-powered intelligence layer for journal entries:
 * 1. Auto-tagging — suggests tags via AI after saving
 * 2. Smart linking — finds related entries via TF-IDF-like keyword matching
 * 3. Weekly digest — AI-summarized weekly reflections
 */

import { chatWithAI } from './aiProvider';
import { journalStorage } from './journalStorage';
import { JournalEntry } from './idbService';

// ─── Stop words for keyword extraction ─────────────────────────────────────
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'its', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need',
  'not', 'no', 'nor', 'so', 'too', 'very', 'just', 'about', 'above',
  'after', 'again', 'all', 'also', 'am', 'any', 'are', 'as', 'because',
  'before', 'between', 'both', 'each', 'few', 'get', 'got', 'he', 'her',
  'here', 'him', 'his', 'how', 'i', 'if', 'into', 'me', 'more', 'most',
  'my', 'myself', 'new', 'now', 'only', 'other', 'our', 'out', 'own',
  'same', 'she', 'some', 'such', 'than', 'that', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'up', 'us',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'you', 'your', 'much', 'many', 'we', 'like', 'over', 'really',
  'think', 'thing', 'things', 'going', 'make', 'way', 'know', 'even',
  'well', 'back', 'still', 'day', 'see', 'come', 'take', 'one', 'two',
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Tokenize text into lowercase words, filter stop words + short tokens */
export function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').split(/\s+/);
  return words.filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/** Count word frequencies in a list of keywords */
function wordFrequencies(keywords: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const w of keywords) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return freq;
}

/** Extract a snippet around matching keyword in text (highlighted with **) */
export function extractSnippet(text: string, keywords: string[], maxLen = 120): string {
  const lower = text.toLowerCase();
  let bestIdx = -1;
  let bestWord = '';
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      bestIdx = idx;
      bestWord = kw;
      break;
    }
  }
  if (bestIdx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, bestIdx - 40);
  const end = Math.min(text.length, bestIdx + bestWord.length + 80);
  let snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
  if (snippet.length > maxLen) snippet = snippet.slice(0, maxLen) + '...';
  return snippet;
}

// ─── 1. Auto-tagging ───────────────────────────────────────────────────────

const TAG_PROMPT = `Analyze this journal entry and suggest 3-5 tags. Categories: themes (forgiveness, faith, doubt, gratitude, prayer, love, hope, patience, wisdom, trust), emotions (joy, peace, struggle, hope, anxiety, comfort), and any Bible references mentioned. Return ONLY a JSON array of lowercase strings, e.g. ["faith","gratitude","romans 8"]. No other text.`;

/**
 * Suggest tags for a journal entry using AI.
 * Returns an array of suggested tag strings.
 * On failure returns an empty array (graceful degradation).
 */
export async function suggestTags(entry: JournalEntry): Promise<string[]> {
  const text = entry.plainText || entry.title || '';
  if (text.trim().length < 10) return [];

  try {
    const result = await chatWithAI(
      `${TAG_PROMPT}\n\nJournal entry:\n${text.slice(0, 2000)}`,
      [],
      { fast: true }
    );

    const responseText = typeof result === 'string' ? result : result.text;

    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((t: unknown): t is string => typeof t === 'string')
      .map((t: string) => t.toLowerCase().trim())
      .filter((t: string) => t.length > 0 && t.length < 50)
      .slice(0, 7);
  } catch (err) {
    console.warn('[JournalAI] Tag suggestion failed:', err);
    return [];
  }
}

// ─── 2. Smart linking — related entries ─────────────────────────────────────

export interface RelatedEntry {
  id: string;
  title: string;
  createdAt: string;
  snippet: string;
  score: number;
}

/**
 * Find entries related to the given entry using TF-IDF-like keyword matching.
 * Returns top matches sorted by relevance score.
 */
export async function findRelatedEntries(
  entry: JournalEntry,
  limit = 3
): Promise<RelatedEntry[]> {
  const text = `${entry.title} ${entry.plainText}`;
  const keywords = extractKeywords(text);
  if (keywords.length === 0) return [];

  const currentFreq = wordFrequencies(keywords);
  // Get unique keywords sorted by frequency (most frequent = most important)
  const uniqueKeywords = [...currentFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 20); // top 20 keywords

  const allEntries = await journalStorage.getAllEntries();

  const scored: RelatedEntry[] = [];

  for (const other of allEntries) {
    if (other.id === entry.id) continue;

    const otherText = `${other.title} ${other.plainText}`.toLowerCase();
    if (!otherText.trim()) continue;

    let score = 0;
    const matchedKeywords: string[] = [];

    for (let i = 0; i < uniqueKeywords.length; i++) {
      const kw = uniqueKeywords[i];
      if (otherText.includes(kw)) {
        // Weight by position in ranked list (top keywords score higher)
        const weight = (uniqueKeywords.length - i) / uniqueKeywords.length;
        score += weight;
        matchedKeywords.push(kw);
      }
    }

    if (score > 0 && matchedKeywords.length >= 2) {
      scored.push({
        id: other.id,
        title: other.title || 'Untitled',
        createdAt: other.createdAt,
        snippet: extractSnippet(other.plainText || other.title, matchedKeywords),
        score,
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ─── 3. Weekly digest ───────────────────────────────────────────────────────

const DIGEST_PROMPT = `Summarize these journal reflections from the past week. Highlight recurring themes, emotional patterns, and spiritual growth areas. Keep it concise (3-5 bullet points). Use markdown bullet points.`;

/** Get ISO week string for cache key: "YYYY-WW" */
function getWeekKey(date: Date): string {
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${date.getFullYear()}-${String(weekNum).padStart(2, '0')}`;
}

const DIGEST_CACHE_PREFIX = 'journal_weekly_digest_';

export interface WeeklyDigest {
  summary: string;
  entryCount: number;
  weekKey: string;
  generatedAt: string;
}

/**
 * Generate a weekly digest of journal entries from the past 7 days.
 * Caches result in localStorage. Pass force=true to regenerate.
 */
export async function generateWeeklyDigest(force = false): Promise<WeeklyDigest | null> {
  const now = new Date();
  const weekKey = getWeekKey(now);
  const cacheKey = `${DIGEST_CACHE_PREFIX}${weekKey}`;

  // Check cache
  if (!force) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        return JSON.parse(cached) as WeeklyDigest;
      }
    } catch { /* ignore corrupt cache */ }
  }

  // Gather entries from past 7 days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const allEntries = await journalStorage.getAllEntries();
  const recentEntries = allEntries.filter(e => e.createdAt >= sevenDaysAgo);

  if (recentEntries.length === 0) {
    return null;
  }

  // Build the text to send to AI
  const entriesText = recentEntries
    .map((e, i) => {
      const date = new Date(e.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return `Entry ${i + 1} (${date}):\n${(e.plainText || e.title || '').slice(0, 500)}`;
    })
    .join('\n\n');

  try {
    const result = await chatWithAI(
      `${DIGEST_PROMPT}\n\n${entriesText}`,
      [],
      { fast: true }
    );

    const summary = typeof result === 'string' ? result : result.text;

    const digest: WeeklyDigest = {
      summary,
      entryCount: recentEntries.length,
      weekKey,
      generatedAt: now.toISOString(),
    };

    // Cache it
    try {
      localStorage.setItem(cacheKey, JSON.stringify(digest));
    } catch { /* localStorage might be full */ }

    return digest;
  } catch (err) {
    console.warn('[JournalAI] Weekly digest failed:', err);
    return null;
  }
}

// ─── 4. Timeline data helpers ───────────────────────────────────────────────

export interface TimelineGroup {
  date: string; // ISO date (YYYY-MM-DD)
  label: string; // formatted date string
  entries: JournalEntry[];
}

/**
 * Group entries by date for timeline view.
 */
export async function getTimelineGroups(): Promise<TimelineGroup[]> {
  const allEntries = await journalStorage.getAllEntries();
  const groups = new Map<string, JournalEntry[]>();

  for (const entry of allEntries) {
    const dateKey = entry.createdAt.slice(0, 10); // YYYY-MM-DD
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(entry);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([date, entries]) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      entries,
    }));
}

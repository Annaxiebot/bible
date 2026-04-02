/**
 * journalAIService.ts
 *
 * AI-powered intelligence layer for journal entries:
 * 1. Auto-tagging — suggests tags via AI after saving
 * 2. Smart linking — finds related entries via TF-IDF-like keyword matching
 * 3. Weekly digest — AI-summarized weekly reflections
 * 4. Reflection prompts — contextual prompts based on entry + Bible reading
 * 5. Extend thinking — AI expands on selected text or full entry
 * 6. Summarize — condenses entry into key insights
 * 7. Scripture finder — suggests relevant Bible verses
 * 8. Inline chat — Q&A about the current entry
 * 9. Memory extraction — extracts themes, prayers, growth areas, questions
 * 10. Spiritual profile — AI-generated user profile from memory
 * 11. Proactive suggestions — personalized prompts based on context
 */

import { chatWithAI, streamViaEdgeFunction, getCurrentModel, getCurrentProvider } from './aiProvider';
import { journalStorage } from './journalStorage';
import { JournalEntry, SpiritualMemoryItem } from './idbService';
import { spiritualMemory } from './spiritualMemory';

// ─── Streaming AI helper ─────────────────────────────────────────────────

export interface StreamResult {
  model?: string;
  provider?: string;
  timestamp: string;
}

/**
 * Stream an AI prompt, calling onChunk for each token.
 * Returns metadata (model, provider, timestamp) when done.
 */
export async function streamAI(
  prompt: string,
  onChunk: (text: string) => void,
): Promise<StreamResult> {
  const timestamp = new Date().toISOString();
  let model: string | undefined;
  let provider: string | undefined;

  const useServer = localStorage.getItem('useServerAI') !== 'false';

  if (useServer && streamViaEdgeFunction) {
    await streamViaEdgeFunction(
      prompt, [], { fast: true },
      onChunk,
      (m, p) => { model = m; provider = p; },
      (err) => { throw err; },
    );
  } else {
    // Fallback to non-streaming
    const result = await chatWithAI(prompt, [], { fast: true });
    const text = typeof result === 'string' ? result : result.text;
    model = typeof result === 'string' ? undefined : result.model;
    provider = typeof result === 'string' ? undefined : (result as any).provider;
    onChunk(text);
  }

  return { model: model || getCurrentModel() || getCurrentProvider(), provider, timestamp };
}

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

// ─── 5. Reflection prompts (Phase 3) ──────────────────────────────────────

const REFLECTION_PROMPT = `You are a thoughtful spiritual companion. Based on the context below, generate ONE reflective question or prompt that would help the writer go deeper in their spiritual reflection. Keep it warm, open-ended, and 1-2 sentences max. Do not use quotes around the prompt. Do not add a prefix like "Prompt:" — just the prompt itself.`;

/**
 * Generate a contextual reflection prompt based on current entry,
 * Bible reading context, and recent entries.
 */
export async function generateReflectionPrompt(
  currentEntry: JournalEntry | null,
  bibleContext: { bookId?: string; chapter?: number; bookName?: string } | null,
  recentEntries: JournalEntry[]
): Promise<string> {
  const parts: string[] = [];

  if (currentEntry?.plainText?.trim()) {
    parts.push(`Current entry:\n${currentEntry.plainText.slice(0, 500)}`);
  }

  if (bibleContext?.bookName && bibleContext?.chapter) {
    parts.push(`Currently reading: ${bibleContext.bookName} ${bibleContext.chapter}`);
  }

  if (recentEntries.length > 0) {
    const recentText = recentEntries
      .slice(0, 3)
      .map((e, i) => `Recent entry ${i + 1}: ${(e.plainText || e.title).slice(0, 200)}`)
      .join('\n');
    parts.push(recentText);
  }

  if (parts.length === 0) {
    parts.push('The user is starting a new journal entry with no previous context.');
  }

  try {
    const result = await chatWithAI(
      `${REFLECTION_PROMPT}\n\n${parts.join('\n\n')}`,
      [],
      { fast: true }
    );
    const text = typeof result === 'string' ? result : result.text;
    return text.trim();
  } catch (err) {
    console.warn('[JournalAI] Reflection prompt failed:', err);
    return 'What is one thing you are grateful for today?';
  }
}

// ─── 6. Extend thinking (Phase 3) ─────────────────────────────────────────

const EXTEND_PROMPT = `The user wrote this spiritual reflection. Gently extend their thinking — what deeper meaning might this have? How does it connect to broader spiritual themes? Keep the same tone and language. Write 2-3 short paragraphs.`;

/**
 * Extend the user's thinking on selected text or the full entry.
 */
export async function extendThinking(
  text: string,
  bibleContext?: { bookId?: string; chapter?: number; bookName?: string }
): Promise<string> {
  if (!text.trim()) return '';

  let prompt = `${EXTEND_PROMPT}\n\nUser's writing:\n${text.slice(0, 2000)}`;

  if (bibleContext?.bookName && bibleContext?.chapter) {
    prompt += `\n\nThey are currently reading: ${bibleContext.bookName} ${bibleContext.chapter}`;
  }

  try {
    const result = await chatWithAI(prompt, [], { fast: true });
    return (typeof result === 'string' ? result : result.text).trim();
  } catch (err) {
    console.warn('[JournalAI] Extend thinking failed:', err);
    return '';
  }
}

// ─── 7. Summarize (Phase 3) ───────────────────────────────────────────────

const SUMMARIZE_PROMPT = `Summarize this journal entry into 2-3 key insights or takeaways. Use bullet points (markdown). Be concise — each point should be 1 sentence. Capture the spiritual/emotional essence.`;

/**
 * Condense a journal entry into 2-3 key insights.
 */
export async function summarizeEntry(text: string): Promise<string> {
  if (!text.trim() || text.trim().length < 20) return '';

  try {
    const result = await chatWithAI(
      `${SUMMARIZE_PROMPT}\n\nJournal entry:\n${text.slice(0, 3000)}`,
      [],
      { fast: true }
    );
    return (typeof result === 'string' ? result : result.text).trim();
  } catch (err) {
    console.warn('[JournalAI] Summarize failed:', err);
    return '';
  }
}

// ─── 8. Scripture finder (Phase 3) ────────────────────────────────────────

const SCRIPTURE_PROMPT = `Based on this journal entry, suggest 3-5 relevant Bible verses. For each, provide:
1. The reference (e.g. "Philippians 4:6-7")
2. A brief explanation (1 sentence) of why it's relevant

Return as a JSON array of objects with "reference" and "reason" fields. Example:
[{"reference":"Philippians 4:6-7","reason":"Speaks to finding peace through prayer instead of anxiety."}]
Return ONLY the JSON array. No other text.`;

export interface ScriptureSuggestion {
  reference: string;
  reason: string;
}

/**
 * Find Bible verses relevant to the journal entry text.
 */
export async function findRelatedScripture(text: string): Promise<ScriptureSuggestion[]> {
  if (!text.trim() || text.trim().length < 10) return [];

  try {
    const result = await chatWithAI(
      `${SCRIPTURE_PROMPT}\n\nJournal entry:\n${text.slice(0, 2000)}`,
      [],
      { fast: true }
    );
    const responseText = typeof result === 'string' ? result : result.text;

    const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: unknown): item is { reference: string; reason: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as any).reference === 'string' &&
          typeof (item as any).reason === 'string'
      )
      .slice(0, 5);
  } catch (err) {
    console.warn('[JournalAI] Scripture finder failed:', err);
    return [];
  }
}

// ─── 9. Inline chat about entry (Phase 3) ─────────────────────────────────

/**
 * Chat about the current entry. User asks a question, AI responds with
 * context of the entry + recent entries.
 */
export async function chatAboutEntry(
  question: string,
  entryContent: string,
  recentEntries: JournalEntry[]
): Promise<string> {
  if (!question.trim()) return '';

  const context: string[] = [
    'You are a thoughtful spiritual companion. The user is asking about their journal entry. Answer warmly and concisely.',
  ];

  if (entryContent.trim()) {
    context.push(`Current journal entry:\n${entryContent.slice(0, 1500)}`);
  }

  if (recentEntries.length > 0) {
    const recentText = recentEntries
      .slice(0, 3)
      .map((e, i) => `Recent entry ${i + 1}: ${(e.plainText || e.title).slice(0, 300)}`)
      .join('\n');
    context.push(`Recent entries:\n${recentText}`);
  }

  context.push(`User's question: ${question}`);

  try {
    const result = await chatWithAI(context.join('\n\n'), [], { fast: true });
    return (typeof result === 'string' ? result : result.text).trim();
  } catch (err) {
    console.warn('[JournalAI] Chat about entry failed:', err);
    return 'Sorry, I could not process your question right now. Please try again.';
  }
}

// ─── 10. Memory extraction (Phase 4) ──────────────────────────────────────

const MEMORY_EXTRACT_PROMPT = `Analyze this journal entry and extract any items worth remembering about the user. Categories:
- "theme": recurring spiritual themes (e.g. "forgiveness", "seeking God's will")
- "prayer": specific prayer requests or answered prayers
- "growth": areas of spiritual growth or goals
- "question": open spiritual questions the user is wrestling with

Return a JSON array of objects with "category" and "content" fields. Only include genuinely meaningful items (not every detail). Return an empty array [] if nothing stands out.
Example: [{"category":"prayer","content":"Praying for healing for their mother"},{"category":"theme","content":"Finding peace through surrender"}]
Return ONLY the JSON array.`;

export interface MemoryItem {
  category: 'theme' | 'prayer' | 'growth' | 'question';
  content: string;
}

/**
 * Extract memory-worthy items from a journal entry.
 * Saves them to the spiritualMemory store.
 */
export async function extractMemoryItems(
  entryText: string,
  entryId?: string
): Promise<MemoryItem[]> {
  if (!entryText.trim() || entryText.trim().length < 30) return [];

  try {
    const result = await chatWithAI(
      `${MEMORY_EXTRACT_PROMPT}\n\nJournal entry:\n${entryText.slice(0, 2000)}`,
      [],
      { fast: true }
    );
    const responseText = typeof result === 'string' ? result : result.text;

    const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const validCategories = new Set(['theme', 'prayer', 'growth', 'question']);
    const items: MemoryItem[] = parsed
      .filter(
        (item: unknown): item is MemoryItem =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as any).category === 'string' &&
          validCategories.has((item as any).category) &&
          typeof (item as any).content === 'string' &&
          (item as any).content.trim().length > 0
      )
      .slice(0, 10);

    // Save to IndexedDB (non-blocking)
    for (const item of items) {
      await spiritualMemory.addItem({
        category: item.category,
        content: item.content,
        source: entryId,
      });
    }

    return items;
  } catch (err) {
    console.warn('[JournalAI] Memory extraction failed:', err);
    return [];
  }
}

/**
 * Get all memory items for context building.
 */
export async function getMemoryContext(): Promise<SpiritualMemoryItem[]> {
  return spiritualMemory.getAllItems();
}

// ─── 11. Spiritual profile (Phase 4) ──────────────────────────────────────

const PROFILE_PROMPT = `Based on these memory items about a person's spiritual journey, generate a brief spiritual profile. Organize into sections:

**Key Themes**: The recurring spiritual themes in their journey (2-3 items)
**Active Prayer Requests**: Current prayers and petitions (list each)
**Growth Areas**: Where they are growing or want to grow (2-3 items)
**Open Questions**: Spiritual questions they are exploring (list each)

If a category has no items, write "None recorded yet." Be warm and encouraging. Use markdown formatting.`;

/**
 * Generate a spiritual profile from memory items.
 */
export async function generateSpiritualProfile(
  memoryItems: SpiritualMemoryItem[]
): Promise<string> {
  if (memoryItems.length === 0) {
    return 'No spiritual memory recorded yet. Keep journaling and your profile will be built over time!';
  }

  const grouped: Record<string, string[]> = {
    theme: [],
    prayer: [],
    growth: [],
    question: [],
  };

  for (const item of memoryItems) {
    if (grouped[item.category]) {
      grouped[item.category].push(item.content);
    }
  }

  const contextLines = Object.entries(grouped)
    .map(([cat, items]) => `${cat}: ${items.length > 0 ? items.join('; ') : 'none'}`)
    .join('\n');

  try {
    const result = await chatWithAI(
      `${PROFILE_PROMPT}\n\nMemory items:\n${contextLines}`,
      [],
      { fast: true }
    );
    return (typeof result === 'string' ? result : result.text).trim();
  } catch (err) {
    console.warn('[JournalAI] Spiritual profile failed:', err);
    return 'Could not generate profile at this time. Please try again later.';
  }
}

// ─── 12. Proactive suggestions (Phase 4) ──────────────────────────────────

const PROACTIVE_PROMPT = `You are a thoughtful spiritual companion. Based on the user's context below, generate a brief, encouraging suggestion for their journaling session today. Keep it to 2-3 sentences. Be warm and specific (reference their actual themes/prayers if available). Do not use generic platitudes.`;

/**
 * Generate a proactive suggestion when opening the journal.
 */
export async function generateProactiveSuggestion(
  memoryItems: SpiritualMemoryItem[],
  lastEntry: JournalEntry | null,
  bibleContext: { bookId?: string; chapter?: number; bookName?: string } | null
): Promise<string> {
  const parts: string[] = [];

  if (memoryItems.length > 0) {
    const themes = memoryItems
      .filter(m => m.category === 'theme')
      .slice(0, 3)
      .map(m => m.content);
    const prayers = memoryItems
      .filter(m => m.category === 'prayer')
      .slice(0, 3)
      .map(m => m.content);
    const growth = memoryItems
      .filter(m => m.category === 'growth')
      .slice(0, 2)
      .map(m => m.content);

    if (themes.length > 0) parts.push(`Key themes: ${themes.join(', ')}`);
    if (prayers.length > 0) parts.push(`Active prayers: ${prayers.join(', ')}`);
    if (growth.length > 0) parts.push(`Growth areas: ${growth.join(', ')}`);
  }

  if (lastEntry) {
    const daysSince = Math.floor(
      (Date.now() - new Date(lastEntry.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    parts.push(`Last journal entry was ${daysSince} day(s) ago: "${(lastEntry.plainText || lastEntry.title).slice(0, 200)}"`);
  } else {
    parts.push('This is potentially their first journal entry.');
  }

  if (bibleContext?.bookName && bibleContext?.chapter) {
    parts.push(`Currently reading: ${bibleContext.bookName} ${bibleContext.chapter}`);
  }

  try {
    const result = await chatWithAI(
      `${PROACTIVE_PROMPT}\n\n${parts.join('\n')}`,
      [],
      { fast: true }
    );
    return (typeof result === 'string' ? result : result.text).trim();
  } catch (err) {
    console.warn('[JournalAI] Proactive suggestion failed:', err);
    return '';
  }
}

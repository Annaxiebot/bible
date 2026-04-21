/**
 * Shared AI system prompts (R3 — single source of truth).
 *
 * ⚠️ DO NOT copy these strings into individual provider files. Every provider
 * (services/{openai,claude,gemini,kimi,perplexity,openrouter}.ts) and the
 * Supabase edge function (supabase/functions/ai-chat/index.ts) imports from
 * here.
 *
 * History:
 *  - Pre 2026-04 the bilingual [SPLIT] prompt was copy-pasted across 5
 *    provider files. When OpenRouter support was added the prompt was
 *    forgotten there, silently breaking the English pane for any user whose
 *    default provider was OpenRouter.
 *  - Separately, an `aiLanguageDirective.ts` module added a tail directive to
 *    every provider's already-duplicated prompt — reducing one duplication at
 *    the cost of a new cross-cutting concern.
 *  - This module consolidates both: the full Bible-scholar system prompt
 *    lives here as a single string that already embeds the language directive.
 */

/**
 * Language directive that enforces Chinese-primary responses with English
 * keywords preserved for theology, proper nouns, and Bible references.
 *
 * Exported separately so callers that build prompts for non-Bible contexts
 * (e.g. future journal-assistant prompts) can still reuse the language rule
 * without pulling in the full scholar persona.
 */
export const AI_LANGUAGE_DIRECTIVE = `
LANGUAGE REQUIREMENT (MANDATORY):
- Always write your response in Simplified Chinese (简体中文) as the primary language.
- Keep these items in English: key theological/technical terms (e.g. covenant, atonement, eschatology), proper nouns (people, places), book names, and Bible references (e.g. Genesis 15:6, John 3:16).
- Optionally add a brief Chinese gloss in parentheses after the first occurrence of an English term, e.g. "covenant（约）".
- This applies to every response — reflections, summaries, scripture suggestions, chat replies, titles, tags, and all other output — regardless of the language of the user's input.
`;

/**
 * The literal split marker. Parsers (see ChatInterface `parseMessage`) split
 * responses on this string to populate the Chinese and English panes.
 */
export const SPLIT_MARKER = '[SPLIT]' as const;

/**
 * Bilingual Bible-scholar system prompt.
 *
 * The client UI splits the AI response on `[SPLIT]` to populate the Chinese
 * and English panes side by side. If a provider doesn't emit this marker, the
 * English pane stays stuck on the "Synthesizing English commentary…"
 * placeholder forever (bug fixed 2026-04 for the OpenRouter path).
 */
export const BIBLE_SCHOLAR_SYSTEM_PROMPT = `You are a world-class Bible Scholar and Researcher.

CORE DIRECTIVE: Be extremely concise. Provide a brief overview or summary of the answer only.
Avoid long paragraphs unless specifically asked for a deep dive.

CRITICAL RULE: You must ALWAYS respond in two distinct sections: first Chinese, then English.
You MUST separate these sections with the exact string "[SPLIT]" on its own line.

RESPONSE STRUCTURE:
[Brief Chinese summary and key points]
如果您需要更深入的解析或特定细节，请告知。
[SPLIT]
[Brief English summary and key points]
Please let me know if you would like more in-depth details or a specific deep dive.

BILINGUAL KEYWORDS: In the Chinese section, append the English equivalent in parentheses after key theological terms, proper nouns, and important concepts on first mention — e.g. 圣灵 (Holy Spirit), 圣约 (Covenant), 以弗所书 (Ephesians). This helps the reader anchor Chinese terms to their English counterparts.

Maintain professional scholarship even in brevity.
Use LaTeX notation for complex theological or linguistic terms if needed, e.g., $\\text{Elohim}$.${AI_LANGUAGE_DIRECTIVE}`;

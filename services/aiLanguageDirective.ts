/**
 * Shared language directive appended to every AI system prompt.
 *
 * Ensures all AI responses are delivered in Simplified Chinese with important
 * technical/theological keywords, proper nouns, and Bible references kept in
 * English for clarity and searchability.
 *
 * Example style:
 *   "这段经文讲述了**covenant（约）**，出自 **Genesis 15**，是神与 **Abraham** 所立的约。"
 */
export const AI_LANGUAGE_DIRECTIVE = `

LANGUAGE REQUIREMENT (MANDATORY):
- Always write your response in Simplified Chinese (简体中文) as the primary language.
- Keep these items in English: key theological/technical terms (e.g. covenant, atonement, eschatology), proper nouns (people, places), book names, and Bible references (e.g. Genesis 15:6, John 3:16).
- Optionally add a brief Chinese gloss in parentheses after the first occurrence of an English term, e.g. "covenant（约）".
- This applies to every response — reflections, summaries, scripture suggestions, chat replies, titles, tags, and all other output — regardless of the language of the user's input.
`;

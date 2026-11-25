/**
 * Shared AI system prompts (R3 — single source of truth).
 *
 * ⚠️ DO NOT copy these strings anywhere else — import them. Today the
 * personal app's chat (components/ChatInterface.tsx) sends
 * BIBLE_SCHOLAR_SYSTEM_PROMPT through the one AI path (ADR-0007), and the
 * journal's AI tools prefix their prompts with JOURNAL_LANGUAGE_DIRECTIVE.
 *
 * History:
 *  - Pre 2026-04 the bilingual [SPLIT] prompt was copy-pasted across 5
 *    provider files. When OpenRouter support was added the prompt was
 *    forgotten there, silently breaking the English pane for any user whose
 *    default provider was OpenRouter.
 *  - This module consolidated them; 2026-10-05 the direct-provider clients
 *    and the ai-chat edge function were deleted (ADR-0007 "Personal app").
 *  - 2026-10-06 (ADR-0017): [SPLIT] retired. The two halves are markdown
 *    headings owned by services/bilingualAnswer.ts, and the scholar prompt
 *    states ONE language rule (it used to append a "Chinese as the primary
 *    language, every response" directive that contradicted the two sections).
 */
import { ZH_SECTION_HEADING, EN_SECTION_HEADING } from './bilingualAnswer';

/**
 * The journal's language rule — a USER-prompt prefix (journal requests send
 * no system message): Chinese with English keywords, one unified answer.
 */
export const JOURNAL_LANGUAGE_DIRECTIVE = 'INSTRUCTION (overrides any other language preference): Write your entire response in Simplified Chinese (简体中文) as the primary language, but keep key theological/technical terms, proper nouns, book names, and Bible references in English (e.g. covenant, atonement, Genesis 15:6, John 3:16). Optionally add a short Chinese gloss in parentheses after the first occurrence of an English term, e.g. "covenant（约）". Produce a single unified response in Chinese with English keywords embedded.\n\n';

/**
 * Bilingual Bible-scholar system prompt.
 *
 * The chat shows the answer in two panes, split by services/bilingualAnswer
 * on the two section headings. A missing English heading never loses the
 * answer: it all goes to the 中文 pane and the English pane says so.
 */
export const BIBLE_SCHOLAR_SYSTEM_PROMPT = `You are a world-class Bible Scholar and Researcher.

CORE DIRECTIVE: Be extremely concise. Provide a brief overview or summary of the answer only.
Avoid long paragraphs unless specifically asked for a deep dive.

LANGUAGE AND FORMAT (the only language rule; it applies whatever language the question is in):
Write the answer twice — first in Simplified Chinese, then the same answer in English — as two sections,
each starting with its heading on a line of its own, exactly:
${ZH_SECTION_HEADING}
[Brief Chinese summary and key points]
如果您需要更深入的解析或特定细节，请告知。

${EN_SECTION_HEADING}
[Brief English summary and key points]
Please let me know if you would like more in-depth details or a specific deep dive.

Use these two headings once each and no other top-level headings. In the Chinese section, append the
English equivalent in parentheses after key theological terms, proper nouns, book names and important
concepts on first mention — e.g. 圣灵 (Holy Spirit), 圣约 (Covenant), 以弗所书 (Ephesians); write Bible
references in English (e.g. John 3:16).

Maintain professional scholarship even in brevity.
Use LaTeX notation for complex theological or linguistic terms if needed, e.g., $\\text{Elohim}$.`;

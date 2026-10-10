/**
 * askHistoryRules.ts — the saved Ask AI history's names and limits · 问一问记录规则 (ADR-0021)
 *
 * One copy (R3) of what database/ask-ai-history-schema.sql and the client
 * must agree on; database/__tests__/askAiHistorySchema.test.ts pins the SQL
 * to these values. Pure module (no imports) so SQL tests and e2e mocks can
 * read it.
 */

/** At most this many exchanges are kept per study. */
export const ASK_HISTORY_LIMIT = 20;
export const ASK_HISTORY_TABLE = 'ask_ai_history';
/** The one writer (SECURITY DEFINER RPC). */
export const SAVE_ASK_EXCHANGE_FN = 'save_ask_ai_exchange';
/** SQLSTATE the RPC raises when the study is full and replacing is not allowed. */
export const ASK_HISTORY_FULL_CODE = 'AH020';
/** The per-study "Replace oldest" permission: a column on study_packs. */
export const ASK_REPLACE_COLUMN = 'ask_ai_replace_oldest';
/** Length caps, equal to the table's CHECKs. */
export const ASK_QUESTION_MAX_CHARS = 10_000;
export const ASK_ANSWER_MAX_CHARS = 50_000;

/** What the RPC answers on success. */
export type SaveVerdict = 'saved' | 'replaced';

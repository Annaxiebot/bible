/**
 * askHistory.ts — a study's saved Ask AI exchanges, row by row · 问一问记录数据 (ADR-0021)
 *
 * Thin PostgREST calls over database/ask-ai-history-schema.sql, run as the
 * signed-in leader (RLS: leader_id = auth.uid()); reads and deletes also
 * filter by the same uid so a misconfigured policy can never widen them.
 * Saving goes through the one writer, the save_ask_ai_exchange RPC, which
 * enforces the 20-per-study limit: a full study comes back as 'full' (the
 * TV's notice), never as an error. Every other failure throws a bilingual
 * error carrying the server's message; callers show it (R5).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AskAIMessage } from './askAI';
import { STUDY_PACKS_TABLE } from '../../supabase/functions/_shared/signup';
import {
  ASK_HISTORY_TABLE, SAVE_ASK_EXCHANGE_FN, ASK_HISTORY_FULL_CODE, ASK_REPLACE_COLUMN,
  ASK_QUESTION_MAX_CHARS, ASK_ANSWER_MAX_CHARS, SaveVerdict,
} from './askHistoryRules';
import { AH_ERR_LOAD, AH_ERR_SAVE, AH_ERR_TOO_LONG, AH_ERR_DELETE, AH_ERR_SETTING } from './askHistoryStrings';

/** One completed exchange, as the TV hands it over. */
export interface AskExchange {
  question: string;
  answer: string;
  model: string | null;
}

/** A saved row (what the leader page lists). */
export interface SavedExchange extends AskExchange {
  id: string;
  pack_id: string;
  created_at: string;
}

export type SaveOutcome = SaveVerdict | 'full';

const COLUMNS = 'id, pack_id, question, answer, model, created_at';

/** The study's saved exchanges, oldest first. */
export async function listAskHistory(client: SupabaseClient, packId: string, uid: string): Promise<SavedExchange[]> {
  const { data, error } = await client.from(ASK_HISTORY_TABLE).select(COLUMNS)
    .eq('pack_id', packId).eq('leader_id', uid).order('created_at', { ascending: true });
  if (error) throw new Error(`${AH_ERR_LOAD}: ${error.message}`);
  return (data ?? []) as SavedExchange[];
}

/** Saved exchanges as conversation turns: each question, then its answer. */
export function exchangesToMessages(rows: readonly AskExchange[]): AskAIMessage[] {
  return rows.flatMap(r => [{ role: 'user' as const, content: r.question }, { role: 'assistant' as const, content: r.answer }]);
}

/** Over the table's length caps: refused here, with its own line, before any call. */
export function tooLongToSave(ex: AskExchange): boolean {
  return ex.question.length > ASK_QUESTION_MAX_CHARS || ex.answer.length > ASK_ANSWER_MAX_CHARS;
}

/**
 * Save one exchange. `replaceOldest` is the leader's "Replace oldest" (it
 * also stores the permission on the study); without it a full study answers
 * 'full' unless the study already has the permission.
 */
export async function saveAskExchange(
  client: SupabaseClient, packId: string, ex: AskExchange, replaceOldest: boolean,
): Promise<SaveOutcome> {
  if (tooLongToSave(ex)) throw new Error(AH_ERR_TOO_LONG);
  const { data, error } = await client.rpc(SAVE_ASK_EXCHANGE_FN, {
    p_pack_id: packId, p_question: ex.question, p_answer: ex.answer, p_model: ex.model, p_replace_oldest: replaceOldest,
  });
  if (error) {
    if (error.code === ASK_HISTORY_FULL_CODE) return 'full';
    throw new Error(`${AH_ERR_SAVE}: ${error.message}`);
  }
  if (data !== 'saved' && data !== 'replaced') throw new Error(`${AH_ERR_SAVE}: ${JSON.stringify(data)}`);
  return data;
}

export async function deleteAskExchange(client: SupabaseClient, id: string, uid: string): Promise<void> {
  const { error } = await client.from(ASK_HISTORY_TABLE).delete().eq('id', id).eq('leader_id', uid);
  if (error) throw new Error(`${AH_ERR_DELETE}: ${error.message}`);
}

export async function deleteAllAskHistory(client: SupabaseClient, packId: string, uid: string): Promise<void> {
  const { error } = await client.from(ASK_HISTORY_TABLE).delete().eq('pack_id', packId).eq('leader_id', uid);
  if (error) throw new Error(`${AH_ERR_DELETE}: ${error.message}`);
}

/** The study's "Replace oldest" permission; false when the study has no synced row. */
export async function fetchReplaceOldest(client: SupabaseClient, packId: string, uid: string): Promise<boolean> {
  const { data, error } = await client.from(STUDY_PACKS_TABLE).select(ASK_REPLACE_COLUMN)
    .eq('id', packId).eq('leader_id', uid).maybeSingle();
  if (error) throw new Error(`${AH_ERR_SETTING}: ${error.message}`);
  return (data as Record<string, unknown> | null)?.[ASK_REPLACE_COLUMN] === true;
}

export async function setReplaceOldest(client: SupabaseClient, packId: string, uid: string, on: boolean): Promise<void> {
  const { error } = await client.from(STUDY_PACKS_TABLE).update({ [ASK_REPLACE_COLUMN]: on })
    .eq('id', packId).eq('leader_id', uid);
  if (error) throw new Error(`${AH_ERR_SETTING}: ${error.message}`);
}

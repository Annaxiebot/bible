/**
 * packRemote.ts — the study_packs table, row by row · 云端查经包
 *
 * Thin PostgREST calls over database/study-packs-schema.sql (ADR-0006).
 * Every call runs as the signed-in leader (RLS: leader_id = auth.uid());
 * reads also filter by the same uid so a misconfigured policy can never
 * widen what the app sees. Each throws a bilingual error carrying the
 * PostgREST message; the sync layer turns that into a typed failure.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseStudyPack, StudyPack } from '../studypack/packTypes';
import { PS_ERR_PULL, PS_ERR_PUSH, PS_ERR_DELETE } from './packSyncStrings';

export const STUDY_PACKS_TABLE = 'study_packs';

export interface StudyPackRow {
  id: string;
  leader_id: string;
  title: string;
  pack: unknown;
}

/** Row for an owned pack (the caller guarantees pack.leaderId). */
export function studyPackRow(pack: StudyPack & { leaderId: string }): StudyPackRow {
  return { id: pack.id, leader_id: pack.leaderId, title: pack.title, pack };
}

/** Every pack the leader owns. Rows whose JSON no longer validates are returned as `invalid` ids, never dropped silently. */
export async function listRemotePacks(client: SupabaseClient, uid: string): Promise<{ packs: StudyPack[]; invalid: string[] }> {
  const { data, error } = await client.from(STUDY_PACKS_TABLE).select('id, leader_id, pack').eq('leader_id', uid);
  if (error) throw new Error(`${PS_ERR_PULL}: ${error.message}`);
  const packs: StudyPack[] = [];
  const invalid: string[] = [];
  for (const row of (data ?? []) as Array<Pick<StudyPackRow, 'id' | 'leader_id' | 'pack'>>) {
    if (row.leader_id !== uid) continue;
    try {
      packs.push(parseStudyPack(row.pack));
    } catch {
      // Not silent: the id is returned to the caller, which reports it.
      invalid.push(row.id);
    }
  }
  return { packs, invalid };
}

/** One pack by id, or null when the leader has none by that id. */
export async function fetchRemotePack(client: SupabaseClient, id: string, uid: string): Promise<StudyPack | null> {
  const { data, error } = await client
    .from(STUDY_PACKS_TABLE).select('id, leader_id, pack').eq('id', id).eq('leader_id', uid).maybeSingle();
  if (error) throw new Error(`${PS_ERR_PULL}: ${error.message}`);
  const row = data as Pick<StudyPackRow, 'leader_id' | 'pack'> | null;
  return row && row.leader_id === uid ? parseStudyPack(row.pack) : null;
}

export async function upsertRemotePack(client: SupabaseClient, pack: StudyPack & { leaderId: string }): Promise<void> {
  const { error } = await client.from(STUDY_PACKS_TABLE).upsert(studyPackRow(pack), { onConflict: 'id' });
  if (error) throw new Error(`${PS_ERR_PUSH}: ${error.message}`);
}

export async function deleteRemotePack(client: SupabaseClient, id: string, uid: string): Promise<void> {
  const { error } = await client.from(STUDY_PACKS_TABLE).delete().eq('id', id).eq('leader_id', uid);
  if (error) throw new Error(`${PS_ERR_DELETE}: ${error.message}`);
}

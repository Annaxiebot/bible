/**
 * leaderHomeData.ts — the leader home's packs and counts · 带领者主页数据
 *
 * Packs come from this browser's IndexedDB, which the sign-in merge
 * (packSync) has filled with every pack in the leader's account; only the
 * leader's own packs are listed, newest study date first. Counts are two
 * queries for the whole leader (not one per pack): study_signups and
 * checkin_answers rows, read as the leader (RLS: leader_id = auth.uid(),
 * signups-schema.sql) and tallied by pack_id client-side. Sign-ups count
 * live rows only (a replaced row is the same person, replaced.ts); every
 * shared answer counts.
 */
import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudyPack } from '../studypack/packTypes';
import { listLocalPacks } from '../studypack/packSource';
import { packTime, subscribePackSyncStatus } from '../newstudy/packSync';
import { getSignupClient } from '../signup/signupClient';
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE } from '../signup/signupSchema';
import { REPLACED_COLUMN, isLive } from '../../supabase/functions/send-checkins/replaced';
import { NS_ERR_STORAGE } from '../newstudy/newStudyStrings';
import { LH_ERR_COUNTS } from './leaderStrings';

export interface PackCounts {
  signups: number;
  answers: number;
}

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The leader's packs only, newest study date first (ties: newest save first). */
export function ownPacksNewestFirst(packs: StudyPack[], uid: string): StudyPack[] {
  return packs
    .filter(p => p.leaderId === uid)
    .sort((a, b) => b.date.localeCompare(a.date) || packTime(b) - packTime(a));
}

function countByPack(rows: Array<{ pack_id: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.pack_id, (counts.get(row.pack_id) ?? 0) + 1);
  return counts;
}

/** Live sign-ups per pack: the query skips replaced rows, and so does the client (a missing filter can never double-count). */
async function tallySignups(client: SupabaseClient, uid: string): Promise<Map<string, number>> {
  const { data, error } = await client.from(SIGNUPS_TABLE).select(`pack_id, ${REPLACED_COLUMN}`).eq('leader_id', uid).is(REPLACED_COLUMN, null);
  if (error) throw new Error(`${LH_ERR_COUNTS}: ${error.message}`);
  return countByPack(((data ?? []) as Array<{ pack_id: string; replaced_at?: string | null }>).filter(isLive));
}

async function tallyAnswers(client: SupabaseClient, uid: string): Promise<Map<string, number>> {
  const { data, error } = await client.from(CHECKIN_ANSWERS_TABLE).select('pack_id').eq('leader_id', uid);
  if (error) throw new Error(`${LH_ERR_COUNTS}: ${error.message}`);
  return countByPack((data ?? []) as Array<{ pack_id: string }>);
}

/** Sign-ups and shared answers per pack id for this leader. Throws a bilingual error on any failure. */
export async function fetchPackCounts(client: SupabaseClient, uid: string): Promise<Map<string, PackCounts>> {
  const [signups, answers] = await Promise.all([tallySignups(client, uid), tallyAnswers(client, uid)]);
  const out = new Map<string, PackCounts>();
  for (const id of new Set([...signups.keys(), ...answers.keys()])) {
    out.set(id, { signups: signups.get(id) ?? 0, answers: answers.get(id) ?? 0 });
  }
  return out;
}

export interface LeaderPacks {
  packs: StudyPack[] | null;   // null while loading
  invalid: string[];
  counts: Map<string, PackCounts> | null;
  error: string | null;        // storage error
  countsError: string | null;
}

/** The home's state; re-reads the store whenever a pack sync finishes. */
export function useLeaderPacks(uid: string): LeaderPacks {
  const [state, setState] = useState<LeaderPacks>({ packs: null, invalid: [], counts: null, error: null, countsError: null });

  const refresh = useCallback(async () => {
    try {
      const list = await listLocalPacks();
      setState(s => ({ ...s, packs: ownPacksNewestFirst(list.packs, uid), invalid: list.invalid, error: null }));
    } catch (err) {
      setState(s => ({ ...s, packs: s.packs ?? [], error: `${NS_ERR_STORAGE}: ${describe(err)}` }));
    }
  }, [uid]);

  useEffect(() => subscribePackSyncStatus(s => { if (s.state !== 'syncing') void refresh(); }), [refresh]);

  useEffect(() => {
    const client = getSignupClient();
    if (!client) return;
    let cancelled = false;
    fetchPackCounts(client, uid)
      .then(counts => { if (!cancelled) setState(s => ({ ...s, counts, countsError: null })); })
      .catch((err: unknown) => { if (!cancelled) setState(s => ({ ...s, countsError: describe(err) })); });
    return () => { cancelled = true; };
  }, [uid]);

  return state;
}

/**
 * useLocalPacks.ts — "我的查经包 My packs" state over IndexedDB · 本地查经包
 *
 * Thin hook over components/studypack/packSource (list/save/delete) plus
 * JSON import/export. Every save (generate, edit, import) stamps the pack
 * with the signed-in leader's uid (stampLeader) so its sign-ups are his,
 * then refreshes its pack_summaries row (the check-in sender's text) and,
 * signed in, schedules its push to the leader's account (packSync,
 * ADR-0006); delete removes it there too. The list re-reads when a sync
 * finishes. Every storage failure lands in `error` as a bilingual line
 * with the underlying message appended (R5: nothing is swallowed); sync
 * failures show on PackSyncLine.
 */
import { useState, useEffect, useCallback } from 'react';
import { StudyPack, parseStudyPack } from '../studypack/packTypes';
import { listLocalPacks, saveLocalPack, isLocalPackId, LOCAL_PACK_PREFIX } from '../studypack/packSource';
import { downloadFile } from '../../services/export/fileDownloader';
import { authManager } from '../../services/supabase';
import { stampLeader } from './packAssembly';
import { stampUpdated, schedulePackPush, deletePackEverywhere, subscribePackSyncStatus } from './packSync';
import { syncPackSummary } from '../signup/packSummary';
import { NS_ERR_STORAGE, NS_ERR_IMPORT } from './newStudyStrings';

export interface LocalPacks {
  packs: StudyPack[];
  /** Ids of stored records that no longer parse (shown, never hidden). */
  invalid: string[];
  error: string | null;
  refresh: () => Promise<void>;
  save: (pack: StudyPack) => Promise<void>;
  remove: (id: string) => Promise<void>;
  exportJson: (pack: StudyPack) => void;
  importJson: (file: File) => Promise<void>;
}

function describe(prefix: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `${prefix}: ${message}`;
}

/** An imported pack keeps its id when it is already local; otherwise it is prefixed so TV mode reads IndexedDB. */
export function localizeImportedPack(raw: unknown): StudyPack {
  const pack = parseStudyPack(raw);
  return isLocalPackId(pack.id) ? pack : { ...pack, id: `${LOCAL_PACK_PREFIX}${pack.id}` };
}

export function useLocalPacks(): LocalPacks {
  const [packs, setPacks] = useState<StudyPack[]>([]);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listLocalPacks();
      setPacks(result.packs);
      setInvalid(result.invalid);
      setError(null);
    } catch (err) {
      setError(describe(NS_ERR_STORAGE, err));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // A finished sync may have pulled, replaced or dropped packs: re-read the store.
  useEffect(() => subscribePackSyncStatus(s => { if (s.state === 'synced' || s.state === 'failed') void refresh(); }), [refresh]);

  const save = useCallback(async (pack: StudyPack) => {
    const stamped = stampUpdated(stampLeader(pack, authManager.getUserId()));
    try {
      await saveLocalPack(stamped);
    } catch (err) {
      setError(describe(NS_ERR_STORAGE, err));
      throw err;
    }
    await refresh();
    schedulePackPush(stamped);
    const summary = await syncPackSummary(stamped);
    if (summary.status === 'failed') setError(summary.message);  // refresh() cleared error; the sync verdict comes last
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    try {
      // A failed server delete is reported on PackSyncLine and keeps the local copy (packSync).
      await deletePackEverywhere(id);
    } catch (err) {
      setError(describe(NS_ERR_STORAGE, err));
      return;
    }
    await refresh();
  }, [refresh]);

  const exportJson = useCallback((pack: StudyPack) => {
    downloadFile(JSON.stringify(pack, null, 2), `${pack.id}.json`, 'application/json');
  }, []);

  const importJson = useCallback(async (file: File) => {
    let pack: StudyPack;
    try {
      pack = localizeImportedPack(JSON.parse(await file.text()));
    } catch (err) {
      setError(describe(NS_ERR_IMPORT, err));
      return;
    }
    await save(pack);
  }, [save]);

  return { packs, invalid, error, refresh, save, remove, exportJson, importJson };
}

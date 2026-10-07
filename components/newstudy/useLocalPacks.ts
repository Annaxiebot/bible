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
import { backupFileName, buildBackup, readBackup } from './packBackup';
import { todayIso } from './NewStudyForm';

export interface LocalPacks {
  packs: StudyPack[];
  /** Ids of stored records that no longer parse (shown, never hidden). */
  invalid: string[];
  error: string | null;
  /** The first read of the store has finished (ok or failed): an empty list is then real, not "not yet". */
  loaded: boolean;
  refresh: () => Promise<void>;
  save: (pack: StudyPack) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Download every study as one backup file (packBackup.ts). */
  exportBackup: () => void;
  /** Restore a backup file (or an old single-pack export); returns how many studies were restored. */
  importBackup: (file: File) => Promise<number>;
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
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await listLocalPacks();
      setPacks(result.packs);
      setInvalid(result.invalid);
      setError(null);
    } catch (err) {
      setError(describe(NS_ERR_STORAGE, err));
    }
    setLoaded(true);
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

  const exportBackup = useCallback(() => {
    downloadFile(buildBackup(packs, new Date().toISOString()), backupFileName(todayIso()), 'application/json');
  }, [packs]);

  const importBackup = useCallback(async (file: File): Promise<number> => {
    let restored: StudyPack[];
    try {
      restored = readBackup(JSON.parse(await file.text())).map(localizeImportedPack);
    } catch (err) {
      setError(describe(NS_ERR_IMPORT, err));
      return 0;
    }
    for (const pack of restored) await save(pack);
    return restored.length;
  }, [save]);

  return { packs, invalid, error, loaded, refresh, save, remove, exportBackup, importBackup };
}

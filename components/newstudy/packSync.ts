/**
 * packSync.ts — a signed-in leader's packs follow them to any device · 查经包同步
 *
 * Local-first (ADR-0006): IndexedDB stays the working copy; this module
 * mirrors a signed-in leader's own packs to study_packs (packRemote).
 *
 * Rules:
 * - PUSH ON SAVE: every save (useLocalPacks.save) schedules a push of that
 *   pack PACK_PUSH_DEBOUNCE_MS after its last edit; only packs whose
 *   leaderId is the signed-in uid are ever pushed. A successful push marks
 *   the local record synced (syncedAt).
 * - SIGN-IN MERGE (after claimLocalPacks): pull every row; per id the copy
 *   with the newer `updatedAt` wins (a tie keeps the server copy — they are
 *   the same save). A local own pack the server lacks is pushed — unless it
 *   was synced before, which means another device deleted it: it is
 *   dropped here too. Rows that no longer parse are reported, never acted on.
 * - DELETE: server first, then this browser; a failed server delete keeps
 *   the local copy (otherwise the next sign-in would bring it back).
 * - Signed out, or Supabase unconfigured → every call reports `skipped`;
 *   nothing throws. A server error becomes a typed failure the status line
 *   (PackSyncLine) shows (R5).
 */
import { supabase } from '../../services/supabase';
import { signedInUid } from '../../services/sessionUid';
import type { StudyPack } from '../studypack/packTypes';
import {
  listLocalPacks, saveSyncedPack, markPackSynced, deleteLocalPack, getLocalPack, type LocalPackList,
} from '../studypack/packSource';
import { listRemotePacks, upsertRemotePack, deleteRemotePack } from './packRemote';
import { PS_ERR_INVALID_REMOTE } from './packSyncStrings';

export const PACK_PUSH_DEBOUNCE_MS = 1500;

export type PackSyncStep = 'pull' | 'push' | 'delete';
export interface PackSyncFailure {
  step: PackSyncStep;
  message: string;
}
export type PackSyncResult = { ok: true; skipped: boolean } | { ok: false; failure: PackSyncFailure };
export type PackSyncState = 'idle' | 'syncing' | 'synced' | 'failed';
export interface PackSyncStatus {
  state: PackSyncState;
  failure: PackSyncFailure | null;
}

const SKIPPED: PackSyncResult = { ok: true, skipped: true };
const DONE: PackSyncResult = { ok: true, skipped: false };
const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const fail = (step: PackSyncStep, e: unknown): PackSyncResult => ({ ok: false, failure: { step, message: errorMessage(e) } });

// ---- Pure rules · 规则 -----------------------------------------------------------

/** The save time newer-wins compares; every leader save stamps it. */
export function stampUpdated(pack: StudyPack, now: Date = new Date()): StudyPack {
  return { ...pack, updatedAt: now.toISOString() };
}

/** Epoch ms of the pack's last save; 0 for packs saved before the field existed. */
export function packTime(pack: Pick<StudyPack, 'updatedAt'>): number {
  const t = pack.updatedAt ? Date.parse(pack.updatedAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export interface MergePlan {
  /** Server copies to write into IndexedDB (missing here, or newer). */
  store: StudyPack[];
  /** Local own packs to upsert (newer here, or never synced). */
  push: StudyPack[];
  /** Local ids synced before that the server no longer has (deleted on another device). */
  dropLocal: string[];
}

export function planPackMerge(
  local: Pick<LocalPackList, 'packs' | 'synced'>, remote: { packs: StudyPack[]; invalid: string[] }, uid: string,
): MergePlan {
  const plan: MergePlan = { store: [], push: [], dropLocal: [] };
  const localById = new Map(local.packs.map(p => [p.id, p]));
  const onServer = new Set([...remote.packs.map(p => p.id), ...remote.invalid]);
  for (const server of remote.packs) {
    const here = localById.get(server.id);
    if (!here) plan.store.push(server);
    else if (here.leaderId !== uid) continue;  // another leader's copy in this browser: leave both alone
    else if (packTime(here) > packTime(server)) plan.push.push(here);
    else plan.store.push(server);
  }
  for (const here of local.packs) {
    if (onServer.has(here.id) || here.leaderId !== uid) continue;
    if (local.synced.has(here.id)) plan.dropLocal.push(here.id);
    else plan.push.push(here);
  }
  return plan;
}

// ---- Status for the sync line · 状态 -----------------------------------------------

let status: PackSyncStatus = { state: 'idle', failure: null };
const statusListeners = new Set<(s: PackSyncStatus) => void>();

function setStatus(next: PackSyncStatus): void {
  status = next;
  statusListeners.forEach(l => l(status));
}

export function getPackSyncStatus(): PackSyncStatus {
  return status;
}

export function subscribePackSyncStatus(listener: (s: PackSyncStatus) => void): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => { statusListeners.delete(listener); };
}

function record(result: PackSyncResult): void {
  if (result.ok === false) setStatus({ state: 'failed', failure: result.failure });
  else if (!result.skipped) setStatus({ state: 'synced', failure: null });
}

// ---- Push · 上传 ------------------------------------------------------------------

/** Upsert one own pack now and mark the local copy synced; anyone else's pack is skipped. */
export async function pushPack(pack: StudyPack): Promise<PackSyncResult> {
  const uid = signedInUid();
  if (!uid || !supabase || pack.leaderId !== uid) return SKIPPED;
  try {
    await upsertRemotePack(supabase, { ...pack, leaderId: uid });
    await markPackSynced(pack);
    return DONE;
  } catch (e) {
    return fail('push', e);
  }
}

const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingPush(id: string): void {
  const timer = pushTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  pushTimers.delete(id);
}

/** Coalesce a burst of edits to one pack into one push PACK_PUSH_DEBOUNCE_MS after the last. */
export function schedulePackPush(pack: StudyPack): void {
  if (!signedInUid() || pack.leaderId !== signedInUid()) return;
  cancelPendingPush(pack.id);
  pushTimers.set(pack.id, setTimeout(() => {
    pushTimers.delete(pack.id);
    setStatus({ state: 'syncing', failure: null });
    void pushPack(pack).then(record);
  }, PACK_PUSH_DEBOUNCE_MS));
}

// ---- Delete · 删除 ----------------------------------------------------------------

/** Delete from the leader's account (own packs, signed in) and then from this browser. Storage errors throw. */
export async function deletePackEverywhere(id: string): Promise<PackSyncResult> {
  cancelPendingPush(id);
  const uid = signedInUid();
  const pack = await getLocalPack(id);
  const remote = !!uid && !!supabase && pack?.leaderId === uid;
  if (remote) {
    try {
      await deleteRemotePack(supabase!, id, uid!);
    } catch (e) {
      const result = fail('delete', e);
      record(result);
      return result;
    }
  }
  await deleteLocalPack(id);
  return remote ? DONE : SKIPPED;
}

// ---- Sign-in merge · 登录合并 -------------------------------------------------------

async function mergeFor(uid: string): Promise<PackSyncResult> {
  let remote: { packs: StudyPack[]; invalid: string[] };
  let plan: MergePlan;
  try {
    const [server, local] = await Promise.all([listRemotePacks(supabase!, uid), listLocalPacks()]);
    remote = server;
    plan = planPackMerge(local, server, uid);
    for (const pack of plan.store) await saveSyncedPack(pack);
    for (const id of plan.dropLocal) await deleteLocalPack(id);
  } catch (e) {
    return fail('pull', e);
  }
  let result: PackSyncResult = DONE;
  for (const pack of plan.push) {
    const pushed = await pushPack(pack);
    if (pushed.ok === false && result.ok) result = pushed;  // keep pushing the rest; report the first failure
  }
  if (result.ok && remote.invalid.length) return fail('pull', `${PS_ERR_INVALID_REMOTE}: ${remote.invalid.join(', ')}`);
  return result;
}

/** Sign-in handshake: pull + merge + push what the server lacks. Status follows (syncing → synced/failed). */
export async function syncPacksOnSignIn(): Promise<PackSyncResult> {
  const uid = signedInUid();
  if (!uid || !supabase) return SKIPPED;
  setStatus({ state: 'syncing', failure: null });
  const result = await mergeFor(uid);
  record(result);
  return result;
}

/** Sign-out: drop pending pushes and clear the line. */
export function resetPackSync(): void {
  [...pushTimers.keys()].forEach(cancelPendingPush);
  if (status.state !== 'idle') setStatus({ state: 'idle', failure: null });
}

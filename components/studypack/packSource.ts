/**
 * packSource.ts — where a StudyPack comes from · 查经包来源
 *
 * Sources behind one `loadPack(id)`: ids starting with LOCAL_PACK_PREFIX
 * are leader-generated packs — IndexedDB on this device first (the working
 * copy the "New study" page saves), then, when signed in, the leader's
 * study_packs row (ADR-0006; the copy is kept locally once fetched); every
 * other id is a committed pack fetched from public/packs/<id>.json as
 * before. The local store helpers live here too so the New-study page, TV
 * mode and packSync share one definition of "a local pack".
 */
import { idbService, LocalPackRecord } from '../../services/idbService';
import { supabase } from '../../services/supabase';
import { signedInUid } from '../../services/sessionUid';
import { fetchRemotePack } from '../newstudy/packRemote';
import { parseStudyPack, StudyPack, PACK_SCHEMA_VERSION } from './packTypes';

export const LOCAL_PACK_PREFIX = 'local-';

/** Bilingual error when a local id is neither in this browser's IndexedDB nor in the signed-in leader's account. */
export const LOCAL_PACK_NOT_FOUND =
  '找不到这个查经包（请用保存它的带领者账号登录） · ' +
  'Study pack not found (sign in with the leader account that saved it)';

export function isLocalPackId(id: string): boolean {
  return id.startsWith(LOCAL_PACK_PREFIX);
}

/**
 * Whether a pack can take sign-ups (ADR-0004 §8):
 * - 'owned'     — it has a leader; the QR / form show.
 * - 'unclaimed' — a local pack generated while signed out; it exists only in
 *                 this browser, so signing in here claims it (claimLocalPacks).
 * - 'demo'      — a public pack with no leader (the committed sample).
 */
export type PackSignupState = 'owned' | 'unclaimed' | 'demo';

export function packSignupState(pack: Pick<StudyPack, 'id' | 'leaderId'>): PackSignupState {
  if (pack.leaderId) return 'owned';
  return isLocalPackId(pack.id) ? 'unclaimed' : 'demo';
}

/** "local-<yyyy-mm-dd>-<book><ch>", e.g. local-2026-10-02-jhn3. */
export function makeLocalPackId(date: string, bookId: string, chapter: number): string {
  return `${LOCAL_PACK_PREFIX}${date}-${bookId.toLowerCase()}${chapter}`;
}

export async function getLocalPack(id: string): Promise<StudyPack | null> {
  const record = await idbService.get('studypacks', id);
  return record ? parseStudyPack(record.pack) : null;
}

export interface LocalPackList {
  packs: StudyPack[];
  /** Ids of stored records that no longer parse (shown, never hidden). */
  invalid: string[];
  /** Ids whose stored copy the server also holds (LocalPackRecord.syncedAt). */
  synced: Set<string>;
}

/** Newest first. Records whose JSON no longer validates are skipped — surfaced as `invalid`. */
export async function listLocalPacks(): Promise<LocalPackList> {
  const records: LocalPackRecord[] = await idbService.getAll('studypacks');
  records.sort((a, b) => b.savedAt - a.savedAt);
  const packs: StudyPack[] = [];
  const invalid: string[] = [];
  const synced = new Set<string>();
  for (const r of records) {
    try {
      packs.push(parseStudyPack(r.pack));
      if (r.syncedAt !== undefined) synced.add(r.id);
    } catch {
      // Not silent: the id is returned to the caller, which lists it as unreadable.
      invalid.push(r.id);
    }
  }
  return { packs, invalid, synced };
}

export async function saveLocalPack(pack: StudyPack): Promise<void> {
  if (!isLocalPackId(pack.id)) {
    throw new Error(`Local pack ids must start with "${LOCAL_PACK_PREFIX}": ${pack.id}`);
  }
  const record: LocalPackRecord = { id: pack.id, pack: parseStudyPack(pack), savedAt: Date.now() };
  await idbService.put('studypacks', record);
}

export async function deleteLocalPack(id: string): Promise<void> {
  await idbService.delete('studypacks', id);
}

/** Store a copy the server holds too (pulled from study_packs): marked synced. */
export async function saveSyncedPack(pack: StudyPack): Promise<void> {
  const now = Date.now();
  await idbService.put('studypacks', { id: pack.id, pack: parseStudyPack(pack), savedAt: now, syncedAt: now });
}

/** After a push: mark the stored record synced — only if it still holds the pushed version (a newer edit stays unsynced). */
export async function markPackSynced(pack: StudyPack): Promise<void> {
  const record = await idbService.get('studypacks', pack.id);
  if (!record || (record.pack as Partial<StudyPack>).updatedAt !== pack.updatedAt) return;
  await idbService.put('studypacks', { ...record, syncedAt: Date.now() });
}

/**
 * A leader pack by id: this browser first, then the signed-in leader's
 * study_packs row (kept locally once found). Null when neither has it;
 * throws when the server read fails.
 */
export async function findLeaderPack(id: string): Promise<StudyPack | null> {
  const local = await getLocalPack(id);
  if (local) return local;
  const uid = signedInUid();
  if (!uid || !supabase) return null;
  const remote = await fetchRemotePack(supabase, id, uid);
  if (remote) await saveSyncedPack(remote);
  return remote;
}

async function fetchCommittedPack(packId: string): Promise<StudyPack> {
  const url = `${import.meta.env.BASE_URL}packs/${packId}.json?schema=${PACK_SCHEMA_VERSION}`;
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load study pack ${packId}: HTTP ${response.status}`);
  }
  return parseStudyPack(await response.json());
}

/** Load a pack by id: IndexedDB then the leader's account for local ids, public/packs otherwise. */
export async function loadPack(packId: string): Promise<StudyPack> {
  if (isLocalPackId(packId)) {
    const pack = await findLeaderPack(packId);
    if (!pack) throw new Error(LOCAL_PACK_NOT_FOUND);
    return pack;
  }
  return fetchCommittedPack(packId);
}

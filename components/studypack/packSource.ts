/**
 * packSource.ts — where a StudyPack comes from · 查经包来源
 *
 * Two sources behind one `loadPack(id)`: ids starting with LOCAL_PACK_PREFIX
 * are leader-generated packs kept in IndexedDB on this device (the "New
 * study" page saves them); every other id is a committed pack fetched from
 * public/packs/<id>.json as before. The local store helpers live here too so
 * the New-study page and TV mode share one definition of "a local pack".
 */
import { idbService, LocalPackRecord } from '../../services/idbService';
import { parseStudyPack, StudyPack, PACK_SCHEMA_VERSION } from './packTypes';

export const LOCAL_PACK_PREFIX = 'local-';

/** Bilingual error when a local id is not in this browser's IndexedDB. */
export const LOCAL_PACK_NOT_FOUND =
  '此设备上找不到这个查经包（本地保存的查经包不会同步到其他设备） · ' +
  'This study pack is not on this device (locally saved packs do not sync between devices)';

export function isLocalPackId(id: string): boolean {
  return id.startsWith(LOCAL_PACK_PREFIX);
}

/** "local-<yyyy-mm-dd>-<book><ch>", e.g. local-2026-10-02-jhn3. */
export function makeLocalPackId(date: string, bookId: string, chapter: number): string {
  return `${LOCAL_PACK_PREFIX}${date}-${bookId.toLowerCase()}${chapter}`;
}

export async function getLocalPack(id: string): Promise<StudyPack | null> {
  const record = await idbService.get('studypacks', id);
  return record ? parseStudyPack(record.pack) : null;
}

/** Newest first. Records whose JSON no longer validates are skipped — surfaced as `invalid`. */
export async function listLocalPacks(): Promise<{ packs: StudyPack[]; invalid: string[] }> {
  const records: LocalPackRecord[] = await idbService.getAll('studypacks');
  records.sort((a, b) => b.savedAt - a.savedAt);
  const packs: StudyPack[] = [];
  const invalid: string[] = [];
  for (const r of records) {
    try {
      packs.push(parseStudyPack(r.pack));
    } catch {
      // Not silent: the id is returned to the caller, which lists it as unreadable.
      invalid.push(r.id);
    }
  }
  return { packs, invalid };
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

async function fetchCommittedPack(packId: string): Promise<StudyPack> {
  const url = `${import.meta.env.BASE_URL}packs/${packId}.json?schema=${PACK_SCHEMA_VERSION}`;
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load study pack ${packId}: HTTP ${response.status}`);
  }
  return parseStudyPack(await response.json());
}

/** Load a pack by id: IndexedDB for local ids, public/packs otherwise. */
export async function loadPack(packId: string): Promise<StudyPack> {
  if (isLocalPackId(packId)) {
    const pack = await getLocalPack(packId);
    if (!pack) throw new Error(LOCAL_PACK_NOT_FOUND);
    return pack;
  }
  return fetchCommittedPack(packId);
}

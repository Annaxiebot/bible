/**
 * idbStudypacks.ts — the `studypacks` IndexedDB store · 本地查经包存储定义
 *
 * Leader-generated StudyPacks kept on this device (components/newstudy).
 * Lives in the unified 'BibleApp' database (idbService) — this file holds
 * only the store's name, record type and upgrade step so idbService stays
 * a thin registry. Reads/writes go through components/studypack/packSource.
 */

export const STUDYPACKS_STORE = 'studypacks';

/**
 * `pack` is the validated StudyPack JSON; typed loosely here to avoid a
 * services → components import (packSource.ts parses it on read).
 */
export interface LocalPackRecord {
  id: string;        // "local-<yyyy-mm-dd>-<book><ch>"
  pack: object;      // StudyPack JSON (parseStudyPack validates on read)
  savedAt: number;   // epoch ms
  /** Epoch ms the server last held exactly this copy (packSync); absent = never synced or edited since (ADR-0006). */
  syncedAt?: number;
}

/** Schema fragment merged into BibleAppSchema (added in DB v6). */
export interface StudypacksSchema {
  studypacks: {
    key: string;
    value: LocalPackRecord;
  };
}

/** The slice of IDBPDatabase<BibleAppSchema> the upgrade step needs (keeps this file free of the full schema). */
interface UpgradeTarget {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: typeof STUDYPACKS_STORE, options: { keyPath: string }): unknown;
}

/** Upgrade step: create the store if missing (idempotent; called from idbService's upgrade handler). */
export function upgradeStudypacks(db: UpgradeTarget): void {
  if (!db.objectStoreNames.contains(STUDYPACKS_STORE)) {
    db.createObjectStore(STUDYPACKS_STORE, { keyPath: 'id' });
  }
}

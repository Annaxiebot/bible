/**
 * packBackup.ts — the "备份与恢复 · Backup & restore" file · 查经包备份文件
 *
 * Pure. One file holds every study the leader has (signed-in studies are
 * saved online already; the backup is for people who keep their own copy).
 * Restore also accepts a single-pack file from the old per-pack export, so
 * nothing anyone saved before becomes unreadable.
 */
import type { StudyPack } from '../studypack/packTypes';

/** Marks the file as ours; a restore refuses anything else that is not a single pack. */
export const BACKUP_KIND = 'scripturetolife-study-packs';
export const BACKUP_VERSION = 1;

interface BackupFile {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  packs: StudyPack[];
}

/** "scripturetolife-studies-2026-10-06.json" for the given local date (yyyy-mm-dd). */
export function backupFileName(isoDate: string): string {
  return `scripturetolife-studies-${isoDate}.json`;
}

export function buildBackup(packs: readonly StudyPack[], exportedAt: string): string {
  const file: BackupFile = { kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt, packs: [...packs] };
  return JSON.stringify(file, null, 2);
}

/** The raw packs inside a backup file, or the one pack of an old single-pack export. Throws on anything else. */
export function readBackup(raw: unknown): unknown[] {
  const value = raw as Partial<BackupFile> | null;
  if (value && typeof value === 'object' && value.kind === BACKUP_KIND) {
    if (!Array.isArray(value.packs)) throw new Error('backup has no packs list');
    return value.packs;
  }
  if (value && typeof value === 'object' && 'id' in value && 'sections' in value) return [value];
  throw new Error('not a study backup');
}

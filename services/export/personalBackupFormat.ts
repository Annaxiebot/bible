/**
 * personalBackupFormat.ts — the "Export all my data" file's identity · 个人数据文件格式
 *
 * Import-free so Playwright specs (Node) can check a downloaded file (R3).
 */
export const PERSONAL_BACKUP_VERSION = '5.0';
export const PERSONAL_BACKUP_KIND = 'bible-app-personal-data';

export function personalBackupFilename(date = new Date()): string {
  return `bible-app-my-data-${date.toISOString().split('T')[0]}.json`;
}

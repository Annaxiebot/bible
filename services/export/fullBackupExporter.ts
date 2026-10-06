import { ProgressCallback } from './exportTypes';
import { downloadPersonalBackup } from './personalDataBackup';

/**
 * "导出全部数据 · Export all my data": the sidebar's export and the
 * #app sync line's Export both land here, so there is ONE exporter — the
 * v5.0 personal-data file (services/export/personalDataBackup.ts, ADR-0010).
 * Older v1–v3 files still import (fullBackupImporter).
 */
export async function exportAndDownloadAll(
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; error?: string }> {
  try {
    onProgress?.('Exporting...', 10);
    await downloadPersonalBackup();
    onProgress?.('Done!', 100);
    return { success: true };
  } catch (error: unknown) {
    // R5: returned to the caller, which shows "导出失败" with this message.
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

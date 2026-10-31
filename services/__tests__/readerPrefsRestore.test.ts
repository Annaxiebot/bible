/**
 * readerPrefsRestore — preferences written outside the store (backup restore)
 * reach the open reader / Settings in this tab: localStorage writes fire no
 * event in the writing tab, so the restore notifies explicitly.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { importPersonalBackup } from '../export/personalDataBackup';
import { PERSONAL_BACKUP_KIND, PERSONAL_BACKUP_VERSION } from '../export/personalBackupFormat';
import { useReaderPreferences } from '../readerPreferences';
import { installMemoryStorage } from '../../tests/utils/memoryStorage';

beforeEach(() => { installMemoryStorage(); });

describe('backup restore → reader preferences', () => {
  it('a restored English edition / language / script shows up without a reload', async () => {
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.englishVersion).toBe('bsb');
    const backup = {
      kind: PERSONAL_BACKUP_KIND, version: PERSONAL_BACKUP_VERSION, exportDate: '2026-10-23T00:00:00Z',
      notes: [], verseData: [], annotations: [], bookmarks: [], journal: [], chatHistory: [], spiritualMemory: [], readingPlans: [],
      readingHistory: { history: [], lastRead: null, position: null },
      settings: {
        [STORAGE_KEYS.ENGLISH_VERSION]: 'kjv',
        [STORAGE_KEYS.UI_LANGUAGE]: 'en',
        [STORAGE_KEYS.CHINESE_MODE]: 'traditional',
        [STORAGE_KEYS.CHINESE_VERSION]: 'cunp',
      },
    };
    await act(async () => { await importPersonalBackup(JSON.stringify(backup)); });
    expect(result.current).toEqual({
      englishVersion: 'kjv', uiLanguage: 'en', chineseScript: 'traditional',
      chineseVersion: 'cuv', // a restored withdrawn CUNP still resolves to CUV
    });
  });
});

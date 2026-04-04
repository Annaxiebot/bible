import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBibleDownload } from '../useBibleDownload';

vi.mock('../../services/bibleStorage', () => ({
  bibleStorage: {
    getAllOfflineChapters: vi.fn().mockResolvedValue(new Set<string>()),
    hasChapter: vi.fn().mockResolvedValue(false),
    saveChapter: vi.fn().mockResolvedValue(undefined),
    saveMetadata: vi.fn().mockResolvedValue(undefined),
    deleteMetadata: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../services/backgroundBibleDownload', () => ({
  backgroundBibleDownload: {
    downloadAll: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('../../services/apiConfig', () => ({
  buildChapterUrl: vi.fn(() => 'https://example.com/api/chapter'),
}));

const makeParams = (overrides = {}) => ({
  selectedBookId: 'genesis',
  selectedBookName: '创世记',
  selectedBookTotalVerses: 1533,
  selectedBookChapters: 50,
  selectedChapter: 1,
  chineseVersion: 'cuv',
  englishVersion: 'web',
  isDownloading: false,
  setIsDownloading: vi.fn(),
  downloadProgress: 0,
  setDownloadProgress: vi.fn(),
  setDownloadStatus: vi.fn(),
  setDownloadStartTime: vi.fn(),
  setDownloadTimeRemaining: vi.fn(),
  setIsOffline: vi.fn(),
  setShowDownloadMenu: vi.fn(),
  setOfflineChapters: vi.fn(),
  setAutoDownloadInProgress: vi.fn(),
  autoDownloadInProgress: false,
  downloadStartTime: 0,
  downloadStatus: '',
  downloadTimeRemaining: '',
  downloadCancelRef: { current: false },
  ...overrides,
});

describe('useBibleDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes without errors (smoke test)', () => {
    const { result } = renderHook(() => useBibleDownload(makeParams()));
    expect(result.current).toBeDefined();
  });

  it('returns all expected handler functions', () => {
    const { result } = renderHook(() => useBibleDownload(makeParams()));

    expect(typeof result.current.handleDownloadCurrentChapter).toBe('function');
    expect(typeof result.current.handleDownloadCurrentBook).toBe('function');
    expect(typeof result.current.handleDownloadBible).toBe('function');
    expect(typeof result.current.handleAutoDownloadBible).toBe('function');
    expect(typeof result.current.handleResumeDownload).toBe('function');
  });

  it('calls onDownloadFunctionsReady with handler functions when provided', () => {
    const onDownloadFunctionsReady = vi.fn();
    renderHook(() =>
      useBibleDownload(makeParams({ onDownloadFunctionsReady }))
    );

    expect(onDownloadFunctionsReady).toHaveBeenCalledTimes(1);
    const [downloadBible, downloadChapter, downloadBook] = onDownloadFunctionsReady.mock.calls[0];
    expect(typeof downloadBible).toBe('function');
    expect(typeof downloadChapter).toBe('function');
    expect(typeof downloadBook).toBe('function');
  });

  it('calls onDownloadStateChange on mount with initial download state', () => {
    const onDownloadStateChange = vi.fn();
    renderHook(() =>
      useBibleDownload(makeParams({ onDownloadStateChange }))
    );

    expect(onDownloadStateChange).toHaveBeenCalled();
    const [downloading, progress] = onDownloadStateChange.mock.calls[0];
    expect(downloading).toBe(false);
    expect(progress).toBe(0);
  });

  it('does not mutate downloadCancelRef on initialization', () => {
    const downloadCancelRef = { current: false };
    renderHook(() => useBibleDownload(makeParams({ downloadCancelRef })));

    expect(downloadCancelRef.current).toBe(false);
  });
});

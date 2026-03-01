import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeneralResearch } from '../useGeneralResearch';
import { verseDataStorage } from '../../services/verseDataStorage';
import { VerseData } from '../../types/verseData';

vi.mock('../../services/verseDataStorage', () => ({
  verseDataStorage: {
    getAllData: vi.fn(),
    deleteAIResearch: vi.fn(),
  },
}));

vi.mock('../useStorageUpdate', () => ({
  useStorageUpdate: () => 0,
}));

describe('useGeneralResearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with empty entries and loading state', () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([]);
    const { result } = renderHook(() => useGeneralResearch());
    
    expect(result.current.loading).toBe(true);
    expect(result.current.entries).toEqual([]);
  });

  it('fetches and filters GENERAL research entries', async () => {
    const mockData: VerseData[] = [
      {
        id: 'GENERAL:0:0',
        bookId: 'GENERAL',
        chapter: 0,
        verses: [0],
        aiResearch: [
          {
            id: 'ai_123',
            query: 'Test question 1',
            response: 'Test answer 1',
            timestamp: 1000,
            tags: ['general-research', 'auto-saved'],
          },
          {
            id: 'ai_456',
            query: 'Test question 2',
            response: 'Test answer 2',
            timestamp: 2000,
            tags: ['general-research'],
          },
        ],
      },
      {
        id: 'GEN:1:1',
        bookId: 'GEN',
        chapter: 1,
        verses: [1],
        aiResearch: [
          {
            id: 'ai_789',
            query: 'Should not appear',
            response: 'Not general',
            timestamp: 3000,
          },
        ],
      },
    ];

    vi.mocked(verseDataStorage.getAllData).mockResolvedValue(mockData);
    const { result } = renderHook(() => useGeneralResearch());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0].id).toBe('ai_456'); // Newest first
    expect(result.current.entries[1].id).toBe('ai_123');
  });

  it('sorts entries by timestamp (newest first)', async () => {
    const mockData: VerseData[] = [
      {
        id: 'GENERAL:0:0',
        bookId: 'GENERAL',
        chapter: 0,
        verses: [0],
        aiResearch: [
          {
            id: 'ai_old',
            query: 'Old question',
            response: 'Old answer',
            timestamp: 1000,
          },
          {
            id: 'ai_new',
            query: 'New question',
            response: 'New answer',
            timestamp: 5000,
          },
          {
            id: 'ai_mid',
            query: 'Mid question',
            response: 'Mid answer',
            timestamp: 3000,
          },
        ],
      },
    ];

    vi.mocked(verseDataStorage.getAllData).mockResolvedValue(mockData);
    const { result } = renderHook(() => useGeneralResearch());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entries[0].id).toBe('ai_new');
    expect(result.current.entries[1].id).toBe('ai_mid');
    expect(result.current.entries[2].id).toBe('ai_old');
  });

  it('handles empty GENERAL research', async () => {
    const mockData: VerseData[] = [
      {
        id: 'GENERAL:0:0',
        bookId: 'GENERAL',
        chapter: 0,
        verses: [0],
        aiResearch: [],
      },
    ];

    vi.mocked(verseDataStorage.getAllData).mockResolvedValue(mockData);
    const { result } = renderHook(() => useGeneralResearch());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entries).toEqual([]);
  });

  it('handles no GENERAL entries at all', async () => {
    const mockData: VerseData[] = [
      {
        id: 'GEN:1:1',
        bookId: 'GEN',
        chapter: 1,
        verses: [1],
        aiResearch: [
          {
            id: 'ai_123',
            query: 'Not general',
            response: 'Answer',
            timestamp: 1000,
          },
        ],
      },
    ];

    vi.mocked(verseDataStorage.getAllData).mockResolvedValue(mockData);
    const { result } = renderHook(() => useGeneralResearch());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entries).toEqual([]);
  });

  it('deletes entry by calling verseDataStorage.deleteAIResearch', async () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([]);
    vi.mocked(verseDataStorage.deleteAIResearch).mockResolvedValue();

    const { result } = renderHook(() => useGeneralResearch());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.deleteEntry('ai_123');

    expect(verseDataStorage.deleteAIResearch).toHaveBeenCalledWith('GENERAL', 0, [0], 'ai_123');
  });

  it('handles errors gracefully when fetching', async () => {
    vi.mocked(verseDataStorage.getAllData).mockRejectedValue(new Error('DB error'));
    const { result } = renderHook(() => useGeneralResearch());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entries).toEqual([]);
  });

  it('handles errors gracefully when deleting', async () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([]);
    vi.mocked(verseDataStorage.deleteAIResearch).mockRejectedValue(new Error('Delete error'));

    const { result } = renderHook(() => useGeneralResearch());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should not throw
    await expect(result.current.deleteEntry('ai_123')).resolves.not.toThrow();
  });
});

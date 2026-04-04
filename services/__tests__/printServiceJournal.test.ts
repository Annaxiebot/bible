import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock journalStorage
const mockGetEntry = vi.fn();
const mockGetAllEntries = vi.fn();
vi.mock('../journalStorage', () => ({
  journalStorage: {
    getEntry: (...args: any[]) => mockGetEntry(...args),
    getAllEntries: (...args: any[]) => mockGetAllEntries(...args),
  },
}));

// Mock strokeNormalizer
vi.mock('../strokeNormalizer', () => ({
  parseCanvasData: () => null,
  renderAllStrokes: vi.fn(),
  drawPaperBackground: vi.fn(),
}));

// Mock window.open
let mockPrintWindow: { document: { write: any; close: any }; onload: any; print: any } | null;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrintWindow = {
    document: { write: vi.fn(), close: vi.fn() },
    onload: null,
    print: vi.fn(),
  };
  vi.stubGlobal('open', vi.fn(() => mockPrintWindow));
  vi.stubGlobal('alert', vi.fn());
});

import {
  printJournalEntry,
  printJournalEntriesByIds,
  printJournalDateRange,
} from '../printService';
import type { JournalEntry } from '../idbService';

const makeEntry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'e1',
  title: 'Test',
  content: '<p>Hello</p>',
  plainText: 'Hello',
  tags: [],
  createdAt: '2024-06-01T12:00:00Z',
  updatedAt: '2024-06-01T12:00:00Z',
  ...overrides,
});

describe('printJournalEntry', () => {
  it('prints a single entry by ID', async () => {
    const entry = makeEntry();
    mockGetEntry.mockResolvedValue(entry);

    await printJournalEntry('e1');

    expect(mockGetEntry).toHaveBeenCalledWith('e1');
    expect(mockPrintWindow!.document.write).toHaveBeenCalled();
    const html = mockPrintWindow!.document.write.mock.calls[0][0];
    expect(html).toContain('Test');
    expect(html).toContain('Personal Journal');
  });

  it('alerts when entry not found', async () => {
    mockGetEntry.mockResolvedValue(null);
    await printJournalEntry('nonexistent');
    expect(window.alert).toHaveBeenCalledWith('Journal entry not found.');
  });

  it('passes print options through', async () => {
    mockGetEntry.mockResolvedValue(makeEntry());
    await printJournalEntry('e1', { pageSize: 'letter', orientation: 'landscape' });
    const html = mockPrintWindow!.document.write.mock.calls[0][0];
    expect(html).toContain('letter');
    expect(html).toContain('landscape');
  });
});

describe('printJournalEntriesByIds', () => {
  it('prints multiple entries', async () => {
    const entries = [
      makeEntry({ id: 'e1', title: 'First' }),
      makeEntry({ id: 'e2', title: 'Second' }),
      makeEntry({ id: 'e3', title: 'Third' }),
    ];
    mockGetAllEntries.mockResolvedValue(entries);

    await printJournalEntriesByIds(['e1', 'e3']);

    const html = mockPrintWindow!.document.write.mock.calls[0][0];
    expect(html).toContain('First');
    expect(html).toContain('Third');
    expect(html).not.toContain('>Second<');
  });

  it('alerts when no IDs provided', async () => {
    await printJournalEntriesByIds([]);
    expect(window.alert).toHaveBeenCalledWith('No journal entries to print.');
  });

  it('alerts when no entries found for IDs', async () => {
    mockGetAllEntries.mockResolvedValue([]);
    await printJournalEntriesByIds(['e999']);
    expect(window.alert).toHaveBeenCalledWith('No journal entries found.');
  });
});

describe('printJournalDateRange', () => {
  it('prints entries within date range', async () => {
    const entries = [
      makeEntry({ id: 'e1', title: 'May', createdAt: '2024-05-15T12:00:00Z' }),
      makeEntry({ id: 'e2', title: 'June', createdAt: '2024-06-15T12:00:00Z' }),
      makeEntry({ id: 'e3', title: 'July', createdAt: '2024-07-15T12:00:00Z' }),
    ];
    mockGetAllEntries.mockResolvedValue(entries);

    await printJournalDateRange('2024-06-01', '2024-06-30');

    const html = mockPrintWindow!.document.write.mock.calls[0][0];
    expect(html).toContain('June');
    expect(html).not.toContain('>May<');
    expect(html).not.toContain('>July<');
  });

  it('alerts when no entries in range', async () => {
    mockGetAllEntries.mockResolvedValue([
      makeEntry({ createdAt: '2020-01-01T00:00:00Z' }),
    ]);
    await printJournalDateRange('2024-06-01', '2024-06-30');
    expect(window.alert).toHaveBeenCalledWith('No journal entries in this date range.');
  });
});

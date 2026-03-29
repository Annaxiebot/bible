import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JournalEntry } from '../../types';

// Mock idb so printService module can load without real IndexedDB
vi.mock('idb', () => {
  const storage = new Map<string, any>();
  return {
    openDB: vi.fn().mockResolvedValue({
      put: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn().mockResolvedValue([]),
      getAllKeys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      clear: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({ put: vi.fn() })),
        done: Promise.resolve(),
      })),
    }),
  };
});

describe('printService journal functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should export generateJournalPrintHTML', async () => {
    const { generateJournalPrintHTML } = await import('../printService');
    expect(typeof generateJournalPrintHTML).toBe('function');
  });

  it('should export printJournalEntries', async () => {
    const { printJournalEntries } = await import('../printService');
    expect(typeof printJournalEntries).toBe('function');
  });

  describe('generateJournalPrintHTML', () => {
    it('should generate valid HTML for journal entries', async () => {
      const { generateJournalPrintHTML } = await import('../printService');

      const entries: JournalEntry[] = [
        {
          id: 'journal-1',
          title: 'Morning Reflection',
          content: '<p>Today I reflected on Psalm 23.</p>',
          drawing: '',
          tags: ['reflection', 'psalms'],
          bibleReference: 'PSA:23:1',
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
        {
          id: 'journal-2',
          title: 'Prayer Notes',
          content: '<p>Lord, guide my steps today.</p>',
          drawing: '',
          createdAt: 1700100000000,
          updatedAt: 1700100000000,
        },
      ];

      const html = generateJournalPrintHTML(entries);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Personal Journal');
      expect(html).toContain('Morning Reflection');
      expect(html).toContain('Prayer Notes');
      expect(html).toContain('PSA:23:1');
      expect(html).toContain('#reflection');
      expect(html).toContain('#psalms');
      expect(html).toContain('2 entries');
    });

    it('should handle entries with drawings', async () => {
      const { generateJournalPrintHTML } = await import('../printService');

      // A drawing string longer than DRAWING_MIN_LENGTH (200)
      const longDrawing = 'data:image/png;base64,' + 'A'.repeat(300);

      const entries: JournalEntry[] = [
        {
          id: 'journal-3',
          title: 'Sketch',
          content: '',
          drawing: longDrawing,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ];

      const html = generateJournalPrintHTML(entries);

      expect(html).toContain('entry-drawing');
      expect(html).toContain(longDrawing);
    });

    it('should handle empty entries array', async () => {
      const { generateJournalPrintHTML } = await import('../printService');

      const html = generateJournalPrintHTML([]);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('0 entries');
    });

    it('should handle entries without optional fields', async () => {
      const { generateJournalPrintHTML } = await import('../printService');

      const entries: JournalEntry[] = [
        {
          id: 'journal-4',
          title: '',
          content: '<p>Just some thoughts</p>',
          drawing: '',
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ];

      const html = generateJournalPrintHTML(entries);

      expect(html).toContain('Untitled');
      expect(html).toContain('Just some thoughts');
      // Should not contain a bible reference value in the entry body
      // (entry-ref class exists in CSS but no <span class="entry-ref"> should appear in the entry)
      const entryBody = html.split('journal-entry')[1] || '';
      expect(entryBody).not.toContain('<span class="entry-ref">');
      expect(entryBody).not.toContain('entry-tag');
    });

    it('should include print button and print styles', async () => {
      const { generateJournalPrintHTML } = await import('../printService');

      const html = generateJournalPrintHTML([{
        id: 'j1',
        title: 'Test',
        content: 'test',
        drawing: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }]);

      expect(html).toContain('print-btn');
      expect(html).toContain('window.print()');
      expect(html).toContain('@media print');
      expect(html).toContain('no-print');
    });
  });
});

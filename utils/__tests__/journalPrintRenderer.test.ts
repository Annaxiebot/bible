import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderTextBlockToHtml,
  renderDrawingBlockToHtml,
  renderImageBlockToHtml,
  renderBlockToHtml,
  renderBlocksToHtml,
  renderEntryMetadataHtml,
  renderEntryToHtml,
  renderDrawingToDataUrl,
  generateJournalBlockPrintHTML,
  getJournalPrintCSS,
  type JournalPrintOptions,
} from '../journalPrintRenderer';
import type { TextBlock, DrawingBlock, ImageBlock, JournalBlock } from '../../types/journalBlocks';
import type { JournalEntry } from '../../services/idbService';

// Mock strokeNormalizer — parseCanvasData returns null for empty, mock data for valid
vi.mock('../../services/strokeNormalizer', () => ({
  parseCanvasData: (data: string) => {
    if (!data) return null;
    try {
      const parsed = JSON.parse(data);
      if (parsed && parsed.version === 2) return parsed;
    } catch { /* empty */ }
    return null;
  },
  renderAllStrokes: vi.fn(),
  drawPaperBackground: vi.fn(),
}));

describe('journalPrintRenderer', () => {
  // ── Text blocks ─────────────────────────────────────────────────

  describe('renderTextBlockToHtml', () => {
    it('renders a text block with HTML content', () => {
      const block: TextBlock = { id: 'blk_1', type: 'text', content: '<b>Hello</b> world', plainText: 'Hello world' };
      const html = renderTextBlockToHtml(block);
      expect(html).toContain('jp-text-block');
      expect(html).toContain('<b>Hello</b> world');
    });

    it('returns empty string for empty content', () => {
      const block: TextBlock = { id: 'blk_2', type: 'text', content: '', plainText: '' };
      expect(renderTextBlockToHtml(block)).toBe('');
    });

    it('returns empty string for whitespace-only content', () => {
      const block: TextBlock = { id: 'blk_3', type: 'text', content: '   ', plainText: '   ' };
      expect(renderTextBlockToHtml(block)).toBe('');
    });

    it('preserves rich formatting (colors, styles)', () => {
      const block: TextBlock = {
        id: 'blk_4', type: 'text',
        content: '<span style="color: red; font-size: 18px">Styled</span><ul><li>Item 1</li></ul>',
        plainText: 'Styled\nItem 1',
      };
      const html = renderTextBlockToHtml(block);
      expect(html).toContain('color: red');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Item 1</li>');
    });
  });

  // ── Drawing blocks ──────────────────────────────────────────────

  describe('renderDrawingBlockToHtml', () => {
    it('returns empty string for empty canvasData', () => {
      const block: DrawingBlock = { id: 'blk_5', type: 'drawing', canvasData: '', height: 300 };
      expect(renderDrawingBlockToHtml(block)).toBe('');
    });

    it('returns empty string for canvasData with no strokes', () => {
      const block: DrawingBlock = {
        id: 'blk_6', type: 'drawing',
        canvasData: JSON.stringify({ version: 2, strokes: [] }),
        height: 300,
      };
      expect(renderDrawingBlockToHtml(block)).toBe('');
    });
  });

  describe('renderDrawingToDataUrl', () => {
    it('returns empty string for empty canvasData', () => {
      expect(renderDrawingToDataUrl('')).toBe('');
    });

    it('returns empty for non-parseable data', () => {
      expect(renderDrawingToDataUrl('not-json')).toBe('');
    });

    it('returns empty for canvas data with no strokes', () => {
      expect(renderDrawingToDataUrl(JSON.stringify({ version: 2, strokes: [] }))).toBe('');
    });
  });

  // ── Image blocks ────────────────────────────────────────────────

  describe('renderImageBlockToHtml', () => {
    it('renders an image block with src', () => {
      const block: ImageBlock = { id: 'blk_7', type: 'image', src: 'data:image/png;base64,abc', width: 80 };
      const html = renderImageBlockToHtml(block);
      expect(html).toContain('jp-image-block');
      expect(html).toContain('data:image/png;base64,abc');
      expect(html).toContain('width:80%');
    });

    it('returns empty string for missing src', () => {
      const block: ImageBlock = { id: 'blk_8', type: 'image', src: '', width: 100 };
      expect(renderImageBlockToHtml(block)).toBe('');
    });

    it('renders caption when present', () => {
      const block: ImageBlock = { id: 'blk_9', type: 'image', src: 'data:image/png;base64,abc', width: 100, caption: 'My photo' };
      const html = renderImageBlockToHtml(block);
      expect(html).toContain('jp-image-caption');
      expect(html).toContain('My photo');
    });

    it('clamps width to valid range', () => {
      const block: ImageBlock = { id: 'blk_10', type: 'image', src: 'data:image/png;base64,abc', width: 5 };
      const html = renderImageBlockToHtml(block);
      expect(html).toContain('width:10%');
    });

    it('handles annotationData', () => {
      const block: ImageBlock = {
        id: 'blk_11', type: 'image', src: 'data:image/png;base64,abc', width: 100,
        annotationData: JSON.stringify({ version: 2, strokes: [] }),
      };
      // With empty strokes, annotation won't render
      const html = renderImageBlockToHtml(block);
      expect(html).not.toContain('jp-image-annotation');
    });
  });

  // ── Generic block dispatch ──────────────────────────────────────

  describe('renderBlockToHtml', () => {
    it('dispatches text blocks', () => {
      const block: TextBlock = { id: 'blk_1', type: 'text', content: '<p>Test</p>', plainText: 'Test' };
      expect(renderBlockToHtml(block)).toContain('jp-text-block');
    });

    it('dispatches image blocks', () => {
      const block: ImageBlock = { id: 'blk_2', type: 'image', src: 'data:image/png;base64,abc', width: 100 };
      expect(renderBlockToHtml(block)).toContain('jp-image-block');
    });

    it('dispatches drawing blocks (empty)', () => {
      const block: DrawingBlock = { id: 'blk_3', type: 'drawing', canvasData: '', height: 300 };
      expect(renderBlockToHtml(block)).toBe('');
    });
  });

  // ── renderBlocksToHtml ──────────────────────────────────────────

  describe('renderBlocksToHtml', () => {
    const blocks: JournalBlock[] = [
      { id: 'blk_1', type: 'text', content: '<p>Hello</p>', plainText: 'Hello' },
      { id: 'blk_2', type: 'drawing', canvasData: '', height: 300 },
      { id: 'blk_3', type: 'image', src: 'data:image/png;base64,abc', width: 50 },
    ];

    it('renders all blocks', () => {
      const html = renderBlocksToHtml(blocks);
      expect(html).toContain('jp-text-block');
      expect(html).toContain('jp-image-block');
    });

    it('filters out drawings when option is false', () => {
      // Drawing with empty data renders as '' anyway — test the filter path
      const withDrawing: JournalBlock[] = [
        { id: 'blk_1', type: 'text', content: '<p>Text</p>', plainText: 'Text' },
        { id: 'blk_2', type: 'drawing', canvasData: '', height: 300 },
      ];
      const html = renderBlocksToHtml(withDrawing, { includeDrawings: false });
      expect(html).toContain('jp-text-block');
    });

    it('filters out images when option is false', () => {
      const html = renderBlocksToHtml(blocks, { includeImages: false });
      expect(html).not.toContain('jp-image-block');
    });
  });

  // ── Entry metadata ──────────────────────────────────────────────

  describe('renderEntryMetadataHtml', () => {
    const entry: JournalEntry = {
      id: 'e1', title: 'Test Entry', content: '', plainText: '',
      tags: ['faith', 'prayer'], createdAt: '2024-03-15T10:30:00Z', updatedAt: '2024-03-15T10:30:00Z',
      locationName: 'Beijing', verseRef: 'John 3:16',
    };

    it('renders date, location, verse ref, tags', () => {
      const html = renderEntryMetadataHtml(entry);
      expect(html).toContain('jp-entry-meta');
      expect(html).toContain('Beijing');
      expect(html).toContain('John 3:16');
      expect(html).toContain('#faith');
      expect(html).toContain('#prayer');
    });

    it('returns empty when includeMetadata is false', () => {
      expect(renderEntryMetadataHtml(entry, { includeMetadata: false })).toBe('');
    });

    it('works with minimal entry', () => {
      const minimal: JournalEntry = {
        id: 'e2', title: '', content: '', plainText: '',
        tags: [], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      };
      const html = renderEntryMetadataHtml(minimal);
      expect(html).toContain('jp-entry-meta');
      expect(html).not.toContain('jp-location');
      expect(html).not.toContain('jp-verse-ref');
    });
  });

  // ── Full entry render ───────────────────────────────────────────

  describe('renderEntryToHtml', () => {
    it('renders entry with blocks', () => {
      const entry: JournalEntry = {
        id: 'e1', title: 'My Entry', content: '', plainText: '',
        tags: [], createdAt: '2024-06-01T12:00:00Z', updatedAt: '2024-06-01T12:00:00Z',
        blocks: [
          { id: 'blk_1', type: 'text', content: '<p>Block content</p>', plainText: 'Block content' },
          { id: 'blk_2', type: 'image', src: 'data:image/png;base64,img', width: 100 },
        ],
      };
      const html = renderEntryToHtml(entry);
      expect(html).toContain('jp-entry');
      expect(html).toContain('My Entry');
      expect(html).toContain('Block content');
      expect(html).toContain('jp-image-block');
    });

    it('renders legacy entry (content + drawing)', () => {
      const entry: JournalEntry = {
        id: 'e2', title: 'Legacy', content: '<p>Legacy content</p>', plainText: 'Legacy content',
        tags: [], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      };
      const html = renderEntryToHtml(entry);
      expect(html).toContain('Legacy content');
      expect(html).toContain('jp-entry-title');
    });

    it('uses "Untitled" for entries without title', () => {
      const entry: JournalEntry = {
        id: 'e3', title: '', content: 'hello', plainText: 'hello',
        tags: [], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      };
      const html = renderEntryToHtml(entry);
      expect(html).toContain('Untitled');
    });
  });

  // ── CSS generation ──────────────────────────────────────────────

  describe('getJournalPrintCSS', () => {
    it('defaults to A4 portrait', () => {
      const css = getJournalPrintCSS();
      expect(css).toContain('A4');
      expect(css).toContain('portrait');
    });

    it('uses specified page size and orientation', () => {
      const css = getJournalPrintCSS({ pageSize: 'letter', orientation: 'landscape' });
      expect(css).toContain('letter');
      expect(css).toContain('landscape');
    });

    it('includes print color-adjust', () => {
      const css = getJournalPrintCSS();
      expect(css).toContain('print-color-adjust');
    });

    it('includes page-break rules', () => {
      const css = getJournalPrintCSS();
      expect(css).toContain('page-break-after');
      expect(css).toContain('page-break-inside: avoid');
    });
  });

  // ── Full document generation ────────────────────────────────────

  describe('generateJournalBlockPrintHTML', () => {
    const entries: JournalEntry[] = [
      {
        id: 'e1', title: 'Entry One', content: '', plainText: '',
        tags: ['test'], createdAt: '2024-06-01T12:00:00Z', updatedAt: '2024-06-01T12:00:00Z',
        verseRef: 'John 1:1',
        blocks: [
          { id: 'blk_1', type: 'text', content: '<p>First entry</p>', plainText: 'First entry' },
        ],
      },
      {
        id: 'e2', title: 'Entry Two', content: '<p>Second</p>', plainText: 'Second',
        tags: [], createdAt: '2024-06-02T12:00:00Z', updatedAt: '2024-06-02T12:00:00Z',
      },
    ];

    it('generates a complete HTML document', () => {
      const html = generateJournalBlockPrintHTML(entries);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('Personal Journal');
    });

    it('includes entry count', () => {
      const html = generateJournalBlockPrintHTML(entries);
      expect(html).toContain('2 entries');
    });

    it('renders all entries', () => {
      const html = generateJournalBlockPrintHTML(entries);
      expect(html).toContain('Entry One');
      expect(html).toContain('Entry Two');
      expect(html).toContain('First entry');
      expect(html).toContain('Second');
    });

    it('includes verse ref stats', () => {
      const html = generateJournalBlockPrintHTML(entries);
      expect(html).toContain('with Bible ref');
    });

    it('handles single entry', () => {
      const html = generateJournalBlockPrintHTML([entries[0]]);
      expect(html).toContain('1 entry');
    });

    it('handles empty entries array', () => {
      const html = generateJournalBlockPrintHTML([]);
      expect(html).toContain('0 entries');
    });

    it('respects print options', () => {
      const opts: JournalPrintOptions = { pageSize: 'letter', orientation: 'landscape', includeImages: false };
      const html = generateJournalBlockPrintHTML(entries, opts);
      expect(html).toContain('letter');
      expect(html).toContain('landscape');
    });

    it('includes print button', () => {
      const html = generateJournalBlockPrintHTML(entries);
      expect(html).toContain('print-btn');
      expect(html).toContain('window.print()');
    });

    it('includes footer', () => {
      const html = generateJournalBlockPrintHTML(entries);
      expect(html).toContain('jp-footer');
      expect(html).toContain('The Bible App');
    });
  });

  // ── Mixed content ───────────────────────────────────────────────

  describe('mixed content entries', () => {
    it('renders text + drawing + image blocks in order', () => {
      const entry: JournalEntry = {
        id: 'mix1', title: 'Mixed', content: '', plainText: '',
        tags: [], createdAt: '2024-06-01T12:00:00Z', updatedAt: '2024-06-01T12:00:00Z',
        blocks: [
          { id: 'blk_1', type: 'text', content: '<p>Start</p>', plainText: 'Start' },
          { id: 'blk_2', type: 'drawing', canvasData: '', height: 300 },
          { id: 'blk_3', type: 'image', src: 'data:image/png;base64,abc', width: 60 },
          { id: 'blk_4', type: 'text', content: '<p>End</p>', plainText: 'End' },
        ],
      };
      const html = renderEntryToHtml(entry);
      const startIdx = html.indexOf('Start');
      const imgIdx = html.indexOf('jp-image-block');
      const endIdx = html.indexOf('End');
      // Order preserved
      expect(startIdx).toBeLessThan(imgIdx);
      expect(imgIdx).toBeLessThan(endIdx);
    });
  });
});

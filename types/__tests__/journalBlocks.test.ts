import { describe, it, expect } from 'vitest';
import {
  createTextBlock,
  createDrawingBlock,
  createImageBlock,
  generateBlockId,
  migrateToBlocks,
  flattenBlocks,
  type JournalBlock,
  type TextBlock,
  type DrawingBlock,
  type ImageBlock,
} from '../journalBlocks';

describe('journalBlocks', () => {
  describe('generateBlockId', () => {
    it('generates unique IDs starting with blk_', () => {
      const id1 = generateBlockId();
      const id2 = generateBlockId();
      expect(id1).toMatch(/^blk_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^blk_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createTextBlock', () => {
    it('creates a text block with defaults', () => {
      const block = createTextBlock();
      expect(block.type).toBe('text');
      expect(block.content).toBe('');
      expect(block.plainText).toBe('');
      expect(block.id).toMatch(/^blk_/);
    });

    it('creates a text block with provided content', () => {
      const block = createTextBlock('<b>Hello</b>', 'Hello');
      expect(block.type).toBe('text');
      expect(block.content).toBe('<b>Hello</b>');
      expect(block.plainText).toBe('Hello');
    });
  });

  describe('createDrawingBlock', () => {
    it('creates a drawing block with default height', () => {
      const block = createDrawingBlock();
      expect(block.type).toBe('drawing');
      expect(block.height).toBe(300);
      expect(block.canvasData).toBe('');
      expect(block.id).toMatch(/^blk_/);
    });

    it('creates a drawing block with custom height', () => {
      const block = createDrawingBlock(500);
      expect(block.height).toBe(500);
    });
  });

  describe('createImageBlock', () => {
    it('creates an image block with default width', () => {
      const block = createImageBlock('data:image/png;base64,abc');
      expect(block.type).toBe('image');
      expect(block.src).toBe('data:image/png;base64,abc');
      expect(block.width).toBe(100);
      expect(block.id).toMatch(/^blk_/);
    });

    it('creates an image block with custom width', () => {
      const block = createImageBlock('http://example.com/img.jpg', 50);
      expect(block.width).toBe(50);
    });
  });

  describe('migrateToBlocks', () => {
    it('creates text block from content', () => {
      const blocks = migrateToBlocks('<p>Hello</p>', 'Hello');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('text');
      expect((blocks[0] as TextBlock).content).toBe('<p>Hello</p>');
      expect((blocks[0] as TextBlock).plainText).toBe('Hello');
    });

    it('creates text + drawing blocks when drawing exists', () => {
      const blocks = migrateToBlocks('<p>Note</p>', 'Note', '{"version":2,"strokes":[]}');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('text');
      expect(blocks[1].type).toBe('drawing');
      expect((blocks[1] as DrawingBlock).canvasData).toBe('{"version":2,"strokes":[]}');
      expect((blocks[1] as DrawingBlock).height).toBe(400);
    });

    it('creates a default text block for empty content', () => {
      const blocks = migrateToBlocks('', '');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('text');
    });

    it('creates only drawing block when no text content', () => {
      const blocks = migrateToBlocks('', '', 'drawing-data');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('drawing');
    });
  });

  describe('flattenBlocks', () => {
    it('flattens text blocks', () => {
      const blocks: JournalBlock[] = [
        { id: '1', type: 'text', content: '<p>Hello</p>', plainText: 'Hello' },
        { id: '2', type: 'text', content: '<p>World</p>', plainText: 'World' },
      ];
      const result = flattenBlocks(blocks);
      expect(result.content).toBe('<p>Hello</p><p>World</p>');
      expect(result.plainText).toBe('Hello\nWorld');
      expect(result.drawing).toBeUndefined();
    });

    it('flattens drawing block', () => {
      const blocks: JournalBlock[] = [
        { id: '1', type: 'drawing', canvasData: 'canvas-data', height: 300 },
      ];
      const result = flattenBlocks(blocks);
      expect(result.drawing).toBe('canvas-data');
      expect(result.content).toBe('');
    });

    it('uses first drawing block only for legacy drawing', () => {
      const blocks: JournalBlock[] = [
        { id: '1', type: 'drawing', canvasData: 'first', height: 300 },
        { id: '2', type: 'drawing', canvasData: 'second', height: 300 },
      ];
      const result = flattenBlocks(blocks);
      expect(result.drawing).toBe('first');
    });

    it('flattens image blocks into HTML', () => {
      const blocks: JournalBlock[] = [
        { id: '1', type: 'image', src: 'img.jpg', width: 80 },
      ];
      const result = flattenBlocks(blocks);
      expect(result.content).toContain('<img');
      expect(result.content).toContain('img.jpg');
      expect(result.content).toContain('80%');
    });

    it('flattens mixed blocks correctly', () => {
      const blocks: JournalBlock[] = [
        { id: '1', type: 'text', content: '<p>Title</p>', plainText: 'Title' },
        { id: '2', type: 'drawing', canvasData: 'strokes', height: 400 },
        { id: '3', type: 'image', src: 'photo.png', width: 50 },
        { id: '4', type: 'text', content: '<p>Caption</p>', plainText: 'Caption' },
      ];
      const result = flattenBlocks(blocks);
      expect(result.content).toContain('<p>Title</p>');
      expect(result.content).toContain('<p>Caption</p>');
      expect(result.content).toContain('photo.png');
      expect(result.drawing).toBe('strokes');
      expect(result.plainText).toBe('Title\nCaption');
    });

    it('handles empty blocks array', () => {
      const result = flattenBlocks([]);
      expect(result.content).toBe('');
      expect(result.plainText).toBe('');
      expect(result.drawing).toBeUndefined();
    });
  });

  describe('round-trip: migrate then flatten', () => {
    it('preserves text content through migration', () => {
      const original = { content: '<p>My entry</p>', plainText: 'My entry' };
      const blocks = migrateToBlocks(original.content, original.plainText);
      const flat = flattenBlocks(blocks);
      expect(flat.content).toBe(original.content);
      expect(flat.plainText).toBe(original.plainText);
    });

    it('preserves text + drawing through migration', () => {
      const original = { content: '<p>Text</p>', plainText: 'Text', drawing: 'draw-data' };
      const blocks = migrateToBlocks(original.content, original.plainText, original.drawing);
      const flat = flattenBlocks(blocks);
      expect(flat.content).toBe(original.content);
      expect(flat.plainText).toBe(original.plainText);
      expect(flat.drawing).toBe(original.drawing);
    });
  });
});

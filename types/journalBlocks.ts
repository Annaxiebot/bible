/**
 * journalBlocks.ts — Block-based journal editor types
 *
 * Each journal entry is composed of ordered blocks:
 * - TextBlock: rich text (HTML)
 * - DrawingBlock: handwriting/drawing canvas (normalized strokes)
 * - ImageBlock: embedded image with optional annotation overlay
 */

export type JournalBlockType = 'text' | 'drawing' | 'image';

export interface TextBlock {
  id: string;
  type: 'text';
  content: string; // HTML
  plainText: string;
}

export interface DrawingBlock {
  id: string;
  type: 'drawing';
  canvasData: string; // serialized NormalizedCanvasData
  height: number; // current height in px (expandable)
}

export interface ImageBlock {
  id: string;
  type: 'image';
  src: string; // base64 data URL or URL
  width: number; // display width (percentage 10-100)
  annotationData?: string; // drawing overlay (serialized NormalizedCanvasData)
  caption?: string;
}

export type JournalBlock = TextBlock | DrawingBlock | ImageBlock;

export function generateBlockId(): string {
  return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createTextBlock(content = '', plainText = ''): TextBlock {
  return { id: generateBlockId(), type: 'text', content, plainText };
}

export function createDrawingBlock(height = 300): DrawingBlock {
  return { id: generateBlockId(), type: 'drawing', canvasData: '', height };
}

export function createImageBlock(src: string, width = 100): ImageBlock {
  return { id: generateBlockId(), type: 'image', src, width };
}

/**
 * Convert legacy single-content journal entry to block format.
 * Used for migrating existing entries.
 */
export function migrateToBlocks(content: string, plainText: string, drawing?: string): JournalBlock[] {
  const blocks: JournalBlock[] = [];

  if (content || plainText) {
    blocks.push(createTextBlock(content, plainText));
  }

  if (drawing) {
    const block = createDrawingBlock(400);
    block.canvasData = drawing;
    blocks.push(block);
  }

  // Always have at least one text block
  if (blocks.length === 0) {
    blocks.push(createTextBlock());
  }

  return blocks;
}

/**
 * Flatten blocks back to legacy content/plainText/drawing for backward compatibility.
 */
export function flattenBlocks(blocks: JournalBlock[]): {
  content: string;
  plainText: string;
  drawing?: string;
} {
  let content = '';
  let plainText = '';
  let drawing: string | undefined;

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        content += block.content;
        plainText += (plainText ? '\n' : '') + block.plainText;
        break;
      case 'drawing':
        // Use the first drawing block's data as legacy drawing
        if (!drawing && block.canvasData) {
          drawing = block.canvasData;
        }
        break;
      case 'image':
        content += `<img src="${block.src}" style="max-width:${block.width}%;border-radius:8px;margin:8px 0" />`;
        break;
    }
  }

  return { content, plainText, drawing };
}

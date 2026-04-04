/**
 * journalPrintRenderer.ts — Convert journal blocks to print-ready HTML
 *
 * Renders TextBlock, DrawingBlock, and ImageBlock into HTML strings
 * suitable for printing via browser print dialog or PDF export.
 */

import type { JournalBlock, TextBlock, DrawingBlock, ImageBlock } from '../types/journalBlocks';
import type { JournalEntry } from '../services/idbService';
import {
  parseCanvasData,
  renderAllStrokes,
  drawPaperBackground,
  type NormalizedCanvasData,
} from '../services/strokeNormalizer';
import { PRINT } from '../constants/appConfig';

// ── Block-to-HTML converters ────────────────────────────────────────────────

export function renderTextBlockToHtml(block: TextBlock): string {
  if (!block.content?.trim()) return '';
  // Content is already HTML from the rich text editor — wrap it for styling
  return `<div class="jp-text-block">${block.content}</div>`;
}

/**
 * Render a DrawingBlock's normalized stroke data to a PNG data URL
 * by drawing onto an off-screen canvas.
 */
export function renderDrawingToDataUrl(
  canvasData: string,
  width: number = PRINT.DRAWING_RENDER_WIDTH,
  height: number = PRINT.DRAWING_RENDER_HEIGHT,
): string {
  if (!canvasData) return '';

  const parsed = parseCanvasData(canvasData);
  if (!parsed || parsed.strokes.length === 0) return '';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Draw paper background
  drawPaperBackground(ctx, width, height, parsed.paperType || 'plain');

  // Render strokes
  renderAllStrokes(ctx, parsed, width, height);

  return canvas.toDataURL('image/png');
}

export function renderDrawingBlockToHtml(block: DrawingBlock): string {
  const dataUrl = renderDrawingToDataUrl(block.canvasData);
  if (!dataUrl) return '';
  return `<div class="jp-drawing-block"><img src="${dataUrl}" alt="Drawing" /></div>`;
}

export function renderImageBlockToHtml(block: ImageBlock): string {
  if (!block.src) return '';
  const widthPct = Math.max(10, Math.min(100, block.width || 100));
  let html = `<div class="jp-image-block" style="width:${widthPct}%">`;
  html += `<img src="${block.src}" alt="${block.caption || 'Image'}" />`;

  // Render annotation overlay if present
  if (block.annotationData) {
    const annotationUrl = renderDrawingToDataUrl(block.annotationData);
    if (annotationUrl) {
      html += `<img src="${annotationUrl}" class="jp-image-annotation" alt="Annotation" />`;
    }
  }

  if (block.caption) {
    html += `<div class="jp-image-caption">${block.caption}</div>`;
  }
  html += '</div>';
  return html;
}

/**
 * Render a single block to HTML string.
 */
export function renderBlockToHtml(block: JournalBlock): string {
  switch (block.type) {
    case 'text': return renderTextBlockToHtml(block);
    case 'drawing': return renderDrawingBlockToHtml(block);
    case 'image': return renderImageBlockToHtml(block);
    default: return '';
  }
}

/**
 * Render all blocks of a journal entry to HTML.
 */
export function renderBlocksToHtml(blocks: JournalBlock[], options?: JournalPrintBlockOptions): string {
  return blocks
    .filter(block => {
      if (!options) return true;
      if (block.type === 'drawing' && !options.includeDrawings) return false;
      if (block.type === 'image' && !options.includeImages) return false;
      return true;
    })
    .map(renderBlockToHtml)
    .filter(Boolean)
    .join('\n');
}

// ── Options ─────────────────────────────────────────────────────────────────

export interface JournalPrintBlockOptions {
  includeDrawings?: boolean;
  includeImages?: boolean;
  includeMetadata?: boolean;
}

export interface JournalPrintOptions extends JournalPrintBlockOptions {
  pageSize?: 'letter' | 'A4';
  orientation?: 'portrait' | 'landscape';
}

// ── Entry metadata ──────────────────────────────────────────────────────────

export function renderEntryMetadataHtml(entry: JournalEntry, options?: JournalPrintBlockOptions): string {
  if (options && !options.includeMetadata) return '';

  const date = new Date(entry.createdAt);
  const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  let meta = `<div class="jp-entry-meta"><span class="jp-date">${dateStr} · ${timeStr}</span>`;
  if (entry.locationName) {
    meta += `<span class="jp-location">${entry.locationName}</span>`;
  }
  if (entry.verseRef) {
    meta += `<span class="jp-verse-ref">${entry.verseRef}</span>`;
  }
  if (entry.tags?.length) {
    meta += entry.tags.map(t => `<span class="jp-tag">#${t}</span>`).join(' ');
  }
  meta += '</div>';
  return meta;
}

// ── Full entry ──────────────────────────────────────────────────────────────

export function renderEntryToHtml(entry: JournalEntry, options?: JournalPrintOptions): string {
  const title = entry.title || 'Untitled';
  const metadata = renderEntryMetadataHtml(entry, options);

  let contentHtml: string;
  if (entry.blocks && entry.blocks.length > 0) {
    contentHtml = renderBlocksToHtml(entry.blocks, options);
  } else {
    // Legacy format: content HTML + optional drawing
    contentHtml = entry.content ? `<div class="jp-text-block">${entry.content}</div>` : '';
    if (entry.drawing && entry.drawing.length > PRINT.DRAWING_MIN_LENGTH) {
      const drawingDataUrl = renderDrawingToDataUrl(entry.drawing);
      if (drawingDataUrl) {
        contentHtml += `<div class="jp-drawing-block"><img src="${drawingDataUrl}" alt="Drawing" /></div>`;
      }
    }
  }

  return `<div class="jp-entry">
  <div class="jp-entry-title">${title}</div>
  ${metadata}
  <div class="jp-entry-content">${contentHtml}</div>
</div>`;
}

// ── Full document ───────────────────────────────────────────────────────────

export function getJournalPrintCSS(options?: JournalPrintOptions): string {
  const pageSize = options?.pageSize || 'A4';
  const orientation = options?.orientation || 'portrait';

  return `
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
@media print {
  @page { size: ${pageSize} ${orientation}; margin: 1.5cm; }
  .no-print { display: none !important; }
  .jp-entry { page-break-after: always; }
  .jp-entry:last-child { page-break-after: auto; }
  .jp-text-block, .jp-drawing-block, .jp-image-block { page-break-inside: avoid; }
  body { padding: 0; }
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", sans-serif;
  line-height: 1.8; color: #222; max-width: 800px; margin: 0 auto; padding: 20px;
}
h1.jp-doc-title { text-align: center; color: #1a1a2e; border-bottom: 3px solid #6366f1; padding-bottom: 15px; font-size: 24px; }
.jp-doc-info { text-align: center; color: #666; margin-bottom: 30px; font-size: 14px; }
.jp-doc-stats { margin: 20px 0; padding: 15px; background: #f0f0ff; border-radius: 5px; text-align: center; }
.jp-stat { display: inline-block; margin: 0 15px; }
.jp-stat-n { font-size: 22px; font-weight: bold; color: #6366f1; }
.jp-entry { margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-left: 4px solid #6366f1; border-radius: 5px; }
.jp-entry-title { font-size: 18px; font-weight: bold; color: #1a1a2e; margin-bottom: 4px; }
.jp-entry-meta { font-size: 12px; color: #777; margin-bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.jp-date { color: #666; }
.jp-location { color: #6b7280; }
.jp-location::before { content: '📍 '; }
.jp-verse-ref { color: #6366f1; background: #e0e7ff; padding: 1px 8px; border-radius: 10px; font-size: 11px; }
.jp-tag { color: #6366f1; font-size: 11px; }
.jp-entry-content { color: #222; font-size: 14px; line-height: 1.8; }
.jp-text-block { margin-bottom: 12px; }
.jp-text-block h1, .jp-text-block h2, .jp-text-block h3 { color: #1a1a2e; margin: 12px 0 8px; }
.jp-text-block ul, .jp-text-block ol { padding-left: 24px; margin: 8px 0; }
.jp-text-block li { margin: 4px 0; }
.jp-text-block blockquote { border-left: 3px solid #c8c8e8; padding-left: 12px; color: #555; margin: 8px 0; font-style: italic; }
.jp-drawing-block { margin: 12px 0; text-align: center; }
.jp-drawing-block img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; padding: 8px; background: white; }
.jp-image-block { margin: 12px auto; position: relative; }
.jp-image-block img { max-width: 100%; height: auto; border-radius: 4px; display: block; }
.jp-image-annotation { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
.jp-image-caption { text-align: center; font-size: 12px; color: #666; margin-top: 4px; font-style: italic; }
.jp-footer { text-align: center; color: #666; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 15px; font-size: 14px; }
.print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; z-index: 1000; }
.print-btn:hover { background: #4f46e5; }
`;
}

export function generateJournalBlockPrintHTML(entries: JournalEntry[], options?: JournalPrintOptions): string {
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Compute stats
  const drawingCount = entries.reduce((sum, e) => {
    if (e.blocks) return sum + e.blocks.filter(b => b.type === 'drawing').length;
    return sum + (e.drawing && e.drawing.length > PRINT.DRAWING_MIN_LENGTH ? 1 : 0);
  }, 0);
  const imageCount = entries.reduce((sum, e) => {
    if (e.blocks) return sum + e.blocks.filter(b => b.type === 'image').length;
    return sum;
  }, 0);
  const withVerseRef = entries.filter(e => e.verseRef).length;

  const entriesHtml = entries.map(e => renderEntryToHtml(e, options)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Personal Journal - ${currentDate}</title>
<style>${getJournalPrintCSS(options)}</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Print</button>
<h1 class="jp-doc-title">Personal Journal</h1>
<div class="jp-doc-info">${currentDate} | ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</div>
<div class="jp-doc-stats no-print">
  <span class="jp-stat"><span class="jp-stat-n">${entries.length}</span> entries</span>
  ${drawingCount > 0 ? `<span class="jp-stat"><span class="jp-stat-n">${drawingCount}</span> drawings</span>` : ''}
  ${imageCount > 0 ? `<span class="jp-stat"><span class="jp-stat-n">${imageCount}</span> images</span>` : ''}
  ${withVerseRef > 0 ? `<span class="jp-stat"><span class="jp-stat-n">${withVerseRef}</span> with Bible ref</span>` : ''}
</div>
${entriesHtml}
<div class="jp-footer">Personal Journal - The Bible App</div>
</body>
</html>`;
}

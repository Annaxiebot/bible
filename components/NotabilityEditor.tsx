/**
 * NotabilityEditor.tsx — Fullscreen Notability-style unified canvas editor
 *
 * Phases 1-4: Drawing, Text Boxes, Images, Lasso Selection, Pages, Export
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { LayoutMode } from './LayoutToolbar';
import {
  type AbsoluteStroke,
  type StrokeTool,
  type PaperType,
  type NormalizedCanvasData,
  type NormalizedStroke,
  type NormalizedPoint,
  parseCanvasData,
  createEmptyCanvasData,
  serializeCanvasData,
  normalizeStroke,
  renderAllStrokes,
  renderStrokesByLayer,
  drawPaperBackground,
} from '../services/strokeNormalizer';
import { compressImage } from '../services/imageCompressionService';

// ── Types ──────────────────────────────────────────────────────────────────

export type ActiveTool = StrokeTool | 'text' | 'lasso' | 'pointer';

export interface TextBox {
  id: string;
  x: number; y: number;       // normalized 0-1
  width: number;               // normalized
  height: number;              // normalized (freely resizable)
  content: string;             // HTML string for rich text
  fontSize?: number;           // px
  fontFamily?: string;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  isAIReflection?: boolean;
  /** ID of the source text box this AI reflection was generated from */
  sourceId?: string;
  /** Which AI action produced this box (matches AI_ACTIONS id: 'reflect', 'extend', 'summarize', 'scripture') */
  aiAction?: string;
  /** z-ordering for layer control: higher = closer to front. Default 0. */
  zOrder?: number;
}

const TEXT_FONTS = [
  { label: 'System', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"SF Mono", "Fira Code", "Courier New", monospace' },
  { label: 'Helvetica', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Handwriting', value: '"Comic Sans MS", "Marker Felt", cursive' },
];

const TEXT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64];

const TEXT_COLORS = [
  '#000000', '#333333', '#666666', '#999999',
  '#CC0000', '#FF4444', '#FF8800', '#FFCC00',
  '#006400', '#228B22', '#0000CC', '#2196F3',
  '#6A1B9A', '#AB47BC', '#8B4513', '#FFFFFF',
];

const SLASH_COMMANDS = [
  { cmd: '/date', label: '/date', desc: 'Insert current date', icon: '📅' },
  { cmd: '/time', label: '/time', desc: 'Insert current time', icon: '🕐' },
  { cmd: '/now', label: '/now', desc: 'Insert date + time', icon: '📆' },
  { cmd: '/location', label: '/location', desc: 'Insert current location', icon: '📍' },
  { cmd: '/divider', label: '/divider', desc: 'Insert a horizontal line', icon: '➖' },
  { cmd: '/heading', label: '/heading', desc: 'Insert a heading', icon: '🔤' },
  { cmd: '/bible', label: '/bible', desc: 'Insert current book:chapter:verse', icon: '📖' },
  { cmd: '/checklist', label: '/checklist', desc: 'Insert a checkbox', icon: '☑️' },
] as const;

export interface CanvasImage {
  id: string;
  x: number; y: number;       // normalized
  width: number; height: number; // normalized
  rotation: number;            // degrees
  src: string;                 // base64 or URL
}

export interface NotabilityPageData {
  id: string;
  strokes: NormalizedStroke[];
  textBoxes: TextBox[];
  images: CanvasImage[];
  paperType: PaperType;
}

/** Extended canvas data with text boxes and images */
interface ExtendedCanvasData extends NormalizedCanvasData {
  textBoxes?: TextBox[];
  images?: CanvasImage[];
  pages?: NotabilityPageData[];
  pageMode?: 'seamless' | 'single';
}

export interface NotabilityEditorProps {
  initialData?: string;
  paperType?: PaperType;
  onSave: (data: string) => void;
  onClose: () => void;
  /** AI context: current entry plain text for AI features */
  entryPlainText?: string;
  /** AI context: Bible reading context */
  bibleContext?: { bookId?: string; chapter?: number; bookName?: string; verse?: number } | null;
  /** AI stream function */
  onAIStream?: (prompt: string, onChunk: (text: string) => void) => Promise<void>;
  /** Optional: switch the host app's layout (Bible, AI Chat, Study). Saves & closes first. */
  onSwitchLayout?: (mode: LayoutMode) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PEN_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#D9D9D9',
  '#6B3A2A', '#8B4513', '#A0522D', '#CD853F', '#DEB887', '#F5DEB3',
  '#8B0000', '#CC0000', '#FF0000', '#FF4444', '#FF6B6B', '#FFB3B3',
  '#CC6600', '#FF8800', '#FFA500', '#FFCC00', '#FFD700', '#FFEB3B',
  '#004D00', '#006400', '#228B22', '#32CD32', '#66BB6A', '#A5D6A7',
  '#000080', '#0000CC', '#1565C0', '#2196F3', '#42A5F5', '#90CAF9',
  '#4A0080', '#6A1B9A', '#8E24AA', '#AB47BC', '#CE93D8', '#E1BEE7',
];
const MIN_SIZE = 1;
const MAX_SIZE = 12;
const AUTO_EXPAND_THRESHOLD = 80;
const AUTO_EXPAND_AMOUNT = 300;
const AUTOSAVE_DELAY = 2000;
const MAX_HISTORY = 100;
const PAGE_HEIGHT = 1200; // px per page in seamless mode
const SWIPE_THRESHOLD = 50; // px minimum swipe distance to trigger page change
// Apple Pencil / iPad palm classification: iPad Safari reports ~15–22 px
// radiusX for a finger, 25+ for a palm. Touches above this threshold in
// drawing modes are ignored so a resting palm doesn't drive nav or scroll.
const PALM_RADIUS_THRESHOLD = 25;

function genId() { return Math.random().toString(36).slice(2, 10); }

function serializeExtended(data: ExtendedCanvasData): string {
  return JSON.stringify(data);
}

function parseExtended(raw: string): ExtendedCanvasData | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && p.version === 2) return p as ExtendedCanvasData;
    return null;
  } catch { return null; }
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Convert markdown-like AI output into HTML suitable for contentEditable display.
 * Handles: **bold**, *italic*, `code`, line breaks, bullet points.
 * AI responses often include these — without parsing they show as literal asterisks.
 */
function markdownToHtml(text: string): string {
  if (!text) return '';

  // Inline rules — applied to a single line of plain text. Caller is responsible
  // for HTML-escaping the line first if it came from untrusted input.
  const applyInline = (s: string): string => {
    let out = s;
    out = out.replace(/&(?!(#?\w+;))/g, '&amp;');
    // **bold**
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // *italic*
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    // `code`
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    return out;
  };

  // Recognise a GFM-style table starting at lines[i]. Returns the consumed line count
  // and the rendered <table> HTML, or null if no table here.
  const tryParseTable = (lines: string[], i: number): { html: string; consumed: number } | null => {
    if (i + 1 >= lines.length) return null;
    const header = lines[i].trim();
    const sep = lines[i + 1].trim();
    if (!header.includes('|') || !sep.includes('|')) return null;
    // Separator is a row of dashes / pipes / colons (alignment).
    if (!/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(sep)) return null;
    const splitRow = (row: string): string[] => {
      const trimmed = row.replace(/^\||\|$/g, '');
      return trimmed.split('|').map(c => c.trim());
    };
    const headerCells = splitRow(header);
    const sepCells = splitRow(sep);
    const aligns = sepCells.map(c => {
      const left = c.startsWith(':');
      const right = c.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return '';
    });
    const bodyRows: string[][] = [];
    let j = i + 2;
    while (j < lines.length) {
      const row = lines[j].trim();
      if (!row.includes('|')) break;
      bodyRows.push(splitRow(row));
      j++;
    }
    let html = '<table style="border-collapse:collapse;margin:6px 0;font-size:inherit;">';
    html += '<thead><tr>';
    for (let k = 0; k < headerCells.length; k++) {
      const align = aligns[k] ? `text-align:${aligns[k]};` : '';
      html += `<th style="border:1px solid #cbd5e1;padding:4px 8px;background:#f8fafc;${align}">${applyInline(headerCells[k])}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const row of bodyRows) {
      html += '<tr>';
      for (let k = 0; k < row.length; k++) {
        const align = aligns[k] ? `text-align:${aligns[k]};` : '';
        html += `<td style="border:1px solid #cbd5e1;padding:4px 8px;${align}">${applyInline(row[k])}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    return { html, consumed: j - i };
  };

  // Walk lines so block constructs (tables, headings, lists) can span / replace
  // multiple lines without confusing the inline rules.
  const lines = text.split('\n');
  const out: string[] = [];
  let prevBlock = false; // last emit was a block element (table/heading/list)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table?
    const tbl = tryParseTable(lines, i);
    if (tbl) {
      out.push(tbl.html);
      i += tbl.consumed - 1;
      prevBlock = true;
      continue;
    }

    // Heading?
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      out.push(`<h${h[1].length}>${applyInline(h[2])}</h${h[1].length}>`);
      prevBlock = true;
      continue;
    }

    // Bullet list?
    const bullet = line.match(/^[\s]*[*\-]\s+(.+)$/);
    if (bullet) {
      out.push(`<div>• ${applyInline(bullet[1])}</div>`);
      prevBlock = true;
      continue;
    }

    // Numbered list?
    const num = line.match(/^[\s]*(\d+\.)\s+(.+)$/);
    if (num) {
      out.push(`<div>${num[1]} ${applyInline(num[2])}</div>`);
      prevBlock = true;
      continue;
    }

    // Plain text line — apply inline rules. Empty line → blank break, but skip if
    // we just emitted a block element (which already provides its own visual break).
    if (line.trim() === '') {
      if (!prevBlock) out.push('<br>');
      prevBlock = false;
      continue;
    }
    out.push(applyInline(line));
    if (i + 1 < lines.length) out.push('<br>');
    prevBlock = false;
  }
  return out.join('');
}

/**
 * If `content` (a stored text-box HTML string) is plain text/markdown — i.e. it has
 * no rich formatting tags yet but does contain markdown patterns — convert it through
 * markdownToHtml. Otherwise return the content unchanged. Used for already-saved boxes
 * so that historical raw markdown renders formatted without the user having to re-edit.
 */
function maybeConvertMarkdown(content: string): string {
  if (!content) return content;
  // If a <table> is already present, the content has been processed before — don't
  // double-process. (We do NOT bail on other rich tags like <strong> anymore, because
  // a previously-rendered bold run was causing sibling raw markdown tables below it
  // to never get converted.)
  if (/<table\b/i.test(content)) return content;
  // Normalize block wrappers to plain-text lines so the line-based parser (headings,
  // bullets, tables) can see them. Inline tags (<strong>, <em>, <code>…) are left
  // alone — markdownToHtml's escape rule only touches stray & characters, so they
  // round-trip untouched.
  const text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>\s*<(div|p)[^>]*>/gi, '\n')
    .replace(/<\/?(div|p)[^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ');
  if (!looksLikeMarkdown(text)) return content;
  return markdownToHtml(text);
}

/**
 * Heuristic — does this string look like markdown worth converting? Used for paste so
 * we don't aggressively reformat plain prose that happens to contain a single asterisk.
 */
function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  return (
    /\*\*[^*\n]+\*\*/.test(text) ||              // **bold**
    /(^|[^*])\*[^*\n]+\*(?!\*)/.test(text) ||    // *italic*
    /`[^`\n]+`/.test(text) ||                    // `code`
    /^#{1,6}\s+/m.test(text) ||                  // # heading
    /^[\s]*[*\-]\s+/m.test(text) ||              // - bullet
    /^[\s]*\d+\.\s+/m.test(text) ||              // 1. numbered
    /\|\s*:?-{3,}:?\s*\|/.test(text)             // GFM table separator  |---|
  );
}

const AI_ACTIONS = [
  { id: 'reflect', label: '💭 Reflect', prompt: 'Write a short spiritual reflection on the following journal entry. Be warm and personal, reference one relevant Bible verse, and keep it to 3-4 sentences. Start directly with the reflection (no "Dear friend" or similar opener):\n\n' },
  { id: 'extend', label: '✨ Extend', prompt: 'Extend the thinking in this journal entry with one concrete, deeper insight. 2-3 sentences:\n\n' },
  { id: 'summarize', label: '📋 Summarize', prompt: 'Summarize the key themes and insights from this journal entry in 2 sentences:\n\n' },
  { id: 'scripture', label: '📖 Scripture', prompt: 'Suggest 3 relevant Bible verses for this journal entry. Format EACH verse on its own line as:\n\n**Book Chapter:Verse** — "the verse text" — one sentence explaining how it connects to the entry.\n\nPut a blank line between each of the 3 verses. Here is the entry:\n\n' },
];

const NotabilityEditor: React.FC<NotabilityEditorProps> = ({
  initialData,
  paperType: initialPaperType = 'ruled',
  onSave,
  onClose,
  entryPlainText,
  bibleContext,
  onAIStream,
  onSwitchLayout,
}) => {
  // ── State ──────────────────────────────────────────────────────────────

  const [activeTool, setActiveTool] = useState<ActiveTool>('pointer');
  const [activeColor, setActiveColor] = useState('#000000');
  const [activeSize, setActiveSize] = useState(2);
  const [paperType, setPaperType] = useState<PaperType>(initialPaperType);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSizeSlider, setShowSizeSlider] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(PAGE_HEIGHT);
  const [pageMode, setPageMode] = useState<'seamless' | 'single'>('seamless');
  const [currentPage, setCurrentPage] = useState(0);

  // Text boxes & images
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [images, setImages] = useState<CanvasImage[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showHighlightColorPicker, setShowHighlightColorPicker] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showFontSizePicker, setShowFontSizePicker] = useState(false);
  const contentEditableRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isToolbarActionRef = useRef(false);
  const savedSelectionRef = useRef<Range | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItemIdRef = useRef<string | null>(null);
  useEffect(() => { selectedItemIdRef.current = selectedItemId; }, [selectedItemId]);
  const [selectedItemType, setSelectedItemType] = useState<'text' | 'image' | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);

  // AI
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Selection (lasso + rectangle)
  const [selectionMode, setSelectionMode] = useState<'lasso' | 'rectangle'>('rectangle');
  const [lassoPoints, setLassoPoints] = useState<{ x: number; y: number }[]>([]);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectEnd, setRectEnd] = useState<{ x: number; y: number } | null>(null);
  const [lassoSelection, setLassoSelection] = useState<{ strokeIndices: number[]; bounds: { x: number; y: number; w: number; h: number } } | null>(null);
  // Ref (not state) — drag start must update synchronously so the dx/dy delta computed
  // in the next pointermove is always relative to the most recent position. Using state
  // here caused movement compounding because React batches the setState, so multiple
  // pointermoves within one frame all read the stale initial position.
  const lassoDragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Text box resize (any edge or corner)
  const [isResizingText, setIsResizingText] = useState(false);
  const [resizingTextId, setResizingTextId] = useState<string | null>(null);
  const [resizingTextEdge, setResizingTextEdge] = useState<string | null>(null); // 'n','s','e','w','ne','nw','se','sw'

  // Selection submenu
  const [showSelectionSubmenu, setShowSelectionSubmenu] = useState(false);

  // Single-page swipe state
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0); // px offset during swipe animation
  const isFingerTouchRef = useRef(false); // true when current touch is a finger (not stylus)

  // Drawing layer: 'below' draws under text boxes, 'above' draws over them
  const [drawingLayer, setDrawingLayer] = useState<'below' | 'above'>('above');
  const drawingLayerRef = useRef<'below' | 'above'>('above');

  // Image cache — pre-load images to avoid async flicker in redrawAll
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);       // Below-text strokes
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null); // Above-text strokes
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drawing state refs
  const isDrawingRef = useRef(false);
  const strokeDataRef = useRef<ExtendedCanvasData>({ ...createEmptyCanvasData(initialPaperType), textBoxes: [], images: [] });
  const currentStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
  // Selection-preview perf: during lasso/rect drag we snapshot the main canvas once at
  // pointerDown and each frame blit the snapshot + draw the selection shape on top. This
  // makes the preview O(1) per frame instead of O(strokes), which matters a lot once the
  // page has many strokes.
  const selectionRafRef = useRef<number | null>(null);
  const selectionSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  const rectEndRef = useRef<{ x: number; y: number } | null>(null);
  // Undo history holds either a full JSON snapshot (for text/image/lasso edits) OR a
  // light-weight action marker for pen strokes. Snapshotting on every stroke-commit
  // is O(doc_size) and makes pen-up visibly lag once the page has many strokes.
  type UndoEntry = string | { kind: 'stroke-add'; stroke: NormalizedStroke };
  const undoHistoryRef = useRef<UndoEntry[]>([]);
  const redoHistoryRef = useRef<UndoEntry[]>([]);
  const displayWidthRef = useRef(0);
  const displayHeightRef = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const toolRef = useRef<ActiveTool>('pointer');
  const colorRef = useRef('#000000');
  const sizeRef = useRef(2);
  const textBoxesRef = useRef<TextBox[]>([]);
  const imagesRef = useRef<CanvasImage[]>([]);

  // Keep refs in sync
  useEffect(() => { toolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { colorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { sizeRef.current = activeSize; }, [activeSize]);
  useEffect(() => { textBoxesRef.current = textBoxes; }, [textBoxes]);
  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { drawingLayerRef.current = drawingLayer; }, [drawingLayer]);

  const closeAllPopups = useCallback(() => {
    setShowColorPicker(false);
    setShowMenu(false);
    setShowSizeSlider(false);
    setShowSelectionSubmenu(false);
    setShowTextColorPicker(false);
    setShowFontPicker(false);
    setShowFontSizePicker(false);
  }, []);

  // Ref to track which text box is being edited (avoids stale closures in save/undo)
  const editingTextIdRef = useRef<string | null>(null);
  useEffect(() => { editingTextIdRef.current = editingTextId; }, [editingTextId]);

  // When a text box enters edit mode, focus its contentEditable element. Needed because
  // contentEditable is gated on `isEditing` (to block iOS Scribble when not editing),
  // so the element only becomes focusable after this state transition.
  useEffect(() => {
    if (!editingTextId) return;
    const el = contentEditableRefs.current.get(editingTextId);
    if (!el) return;
    if (document.activeElement === el) return;
    const raf = requestAnimationFrame(() => el.focus());
    return () => cancelAnimationFrame(raf);
  }, [editingTextId]);

  // ── Snapshot for undo ─────────────────────────────────────────────────

  const getSnapshot = useCallback((): string => {
    // Sync any in-progress editing into the snapshot
    let boxes = textBoxesRef.current;
    const eid = editingTextIdRef.current;
    if (eid) {
      const el = contentEditableRefs.current.get(eid);
      if (el) {
        boxes = boxes.map(tb => tb.id === eid ? { ...tb, content: el.innerHTML } : tb);
      }
    }
    const data: ExtendedCanvasData = {
      ...strokeDataRef.current,
      textBoxes: boxes,
      images: imagesRef.current,
    };
    return JSON.stringify(data);
  }, []);

  const pushUndo = useCallback(() => {
    undoHistoryRef.current.push(getSnapshot());
    if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();
    redoHistoryRef.current = [];
  }, [getSnapshot]);

  const restoreSnapshot = useCallback((snap: string) => {
    const data = parseExtended(snap);
    if (!data) return;
    strokeDataRef.current = data;
    setTextBoxes(data.textBoxes || []);
    setImages(data.images || []);
    if (data.paperType) setPaperType(data.paperType);
  }, []);

  // ── Auto-save ──────────────────────────────────────────────────────────

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      // Sync any in-progress editing before saving
      let boxes = textBoxesRef.current;
      const eid = editingTextIdRef.current;
      if (eid) {
        const el = contentEditableRefs.current.get(eid);
        if (el) {
          boxes = boxes.map(tb => tb.id === eid ? { ...tb, content: el.innerHTML } : tb);
        }
      }
      const data: ExtendedCanvasData = {
        ...strokeDataRef.current,
        textBoxes: boxes,
        images: imagesRef.current,
        pageMode,
      };
      const serialized = serializeExtended(data);
      if (serialized !== lastSavedDataRef.current) {
        lastSavedDataRef.current = serialized;
        onSave(serialized);
      }
    }, AUTOSAVE_DELAY);
  }, [onSave, pageMode]);

  useEffect(() => {
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, []);

  // ── Canvas rendering ───────────────────────────────────────────────────

  const redrawAll = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    const overlayCtx = overlayCtxRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!ctx || !canvas) return;
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Check if any strokes use layers
    const hasLayeredStrokes = strokeDataRef.current.strokes.some(s => s.layer === 'above');

    if (hasLayeredStrokes && overlayCtx && overlayCanvas) {
      // Render below-layer strokes on main canvas, above-layer on overlay
      overlayCtx.globalCompositeOperation = 'source-over';
      overlayCtx.globalAlpha = 1.0;
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      renderStrokesByLayer(ctx, strokeDataRef.current, w, w, 'below');
      renderStrokesByLayer(overlayCtx, strokeDataRef.current, w, w, 'above');
    } else {
      // All strokes on main canvas (backward compatible)
      renderAllStrokes(ctx, strokeDataRef.current, w, w);
      if (overlayCtx && overlayCanvas) {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      }
    }

    // Draw images on canvas using pre-cached images (synchronous, no flicker)
    imagesRef.current.forEach(img => {
      const cached = imageCacheRef.current.get(img.id);
      if (!cached || !cached.complete) return; // skip if not yet loaded
      ctx.save();
      const ix = img.x * w;
      const iy = img.y * w;
      const iw = img.width * w;
      const ih = img.height * w;
      if (img.rotation) {
        ctx.translate(ix + iw / 2, iy + ih / 2);
        ctx.rotate((img.rotation * Math.PI) / 180);
        ctx.drawImage(cached, -iw / 2, -ih / 2, iw, ih);
      } else {
        ctx.drawImage(cached, ix, iy, iw, ih);
      }
      ctx.restore();
    });

    // Draw lasso path if active
    if (lassoPoints.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      lassoPoints.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Draw rectangle selection preview
    if (rectStart && rectEnd) {
      ctx.save();
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.fillStyle = 'rgba(79, 70, 229, 0.08)';
      const rx = Math.min(rectStart.x, rectEnd.x);
      const ry = Math.min(rectStart.y, rectEnd.y);
      const rw = Math.abs(rectEnd.x - rectStart.x);
      const rh = Math.abs(rectEnd.y - rectStart.y);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }

    // Draw lasso/rect selection bounds
    if (lassoSelection) {
      const b = lassoSelection.bounds;
      ctx.save();
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(b.x * w, b.y * w, b.w * w, b.h * w); // use width for both
      ctx.restore();
    }
  }, [lassoPoints, lassoSelection, rectStart, rectEnd]);

  const redrawBackground = useCallback(() => {
    const bgCtx = bgCtxRef.current;
    if (!bgCtx) return;
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) return;
    drawPaperBackground(bgCtx, w, h, strokeDataRef.current.paperType || 'plain');

    // Draw page breaks in seamless mode
    if (pageMode === 'seamless') {
      bgCtx.save();
      bgCtx.strokeStyle = '#CBD5E1';
      bgCtx.lineWidth = 1;
      bgCtx.setLineDash([8, 4]);
      for (let y = PAGE_HEIGHT; y < h; y += PAGE_HEIGHT) {
        bgCtx.beginPath();
        bgCtx.moveTo(0, y);
        bgCtx.lineTo(w, y);
        bgCtx.stroke();
        // Page number
        bgCtx.fillStyle = '#94A3B8';
        bgCtx.font = '11px -apple-system, sans-serif';
        bgCtx.textAlign = 'right';
        bgCtx.fillText(`Page ${Math.floor(y / PAGE_HEIGHT)}`, w - 12, y - 6);
      }
      bgCtx.restore();
    }
  }, [pageMode]);

  const applyToolSettings = useCallback(() => {
    // Apply tool settings to the correct canvas context
    const ctx = drawingLayerRef.current === 'above' ? overlayCtxRef.current : ctxRef.current;
    if (!ctx) return;
    const tool = toolRef.current;
    if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = colorRef.current;
      ctx.lineWidth = sizeRef.current * 5;
    } else if (tool === 'marker') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = colorRef.current;
      ctx.lineWidth = sizeRef.current * 2.5;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = colorRef.current;
      ctx.lineWidth = sizeRef.current;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  // ── Canvas setup ───────────────────────────────────────────────────────

  const setupCanvases = useCallback(() => {
    const canvas = canvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!canvas || !bgCanvas) return;
    // Cap device-pixel-ratio at 1.5 on tall canvases — at 2x DPR a 4-page canvas is
    // ~15M pixels, and every stroke() triggers an iOS composite of that entire layer.
    // 1.5x keeps strokes visibly crisp (pencil doesn't expose sub-pixel hinting) while
    // cutting bitmap size by ~44% and composite time accordingly.
    const rawDpr = window.devicePixelRatio || 1;
    const dpr = Math.min(rawDpr, 1.5);
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = canvasHeight;
    if (width <= 0) return;

    displayWidthRef.current = width;
    displayHeightRef.current = height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    bgCanvas.width = width * dpr;
    bgCanvas.height = height * dpr;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const bgCtx = bgCanvas.getContext('2d');
    if (!ctx || !bgCtx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    bgCtx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctxRef.current = ctx;
    bgCtxRef.current = bgCtx;

    // Setup overlay canvas (above text boxes)
    if (overlayCanvas) {
      overlayCanvas.width = width * dpr;
      overlayCanvas.height = height * dpr;
      const overlayCtx = overlayCanvas.getContext('2d', { willReadFrequently: true });
      if (overlayCtx) {
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
        overlayCtx.scale(dpr, dpr);
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = 'round';
        overlayCtxRef.current = overlayCtx;
      }
    }

    redrawBackground();
    redrawAll();
  }, [canvasHeight, redrawBackground, redrawAll]);

  useEffect(() => { setupCanvases(); }, [setupCanvases]);
  useEffect(() => {
    const handleResize = () => { setupCanvases(); cachedCanvasRectRef.current = null; };
    const handleScroll = () => { cachedCanvasRectRef.current = null; };
    window.addEventListener('resize', handleResize);
    // Scroll changes the canvas's screen position (rect.top) — invalidate the cached rect.
    const sc = scrollContainerRef.current;
    if (sc) sc.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      if (sc) sc.removeEventListener('scroll', handleScroll);
    };
  }, [setupCanvases]);

  // ── Load initial data ──────────────────────────────────────────────────

  const initialDataLoadedRef = useRef(false);
  useEffect(() => {
    if (initialDataLoadedRef.current) return;
    if (!initialData) return;
    const parsed = parseExtended(initialData);
    if (parsed) {
      strokeDataRef.current = parsed;
      if (parsed.paperType) setPaperType(parsed.paperType);
      // Migrate old text boxes that don't have height; auto-convert any saved raw
      // markdown content (from earlier sessions before paste/blur conversion landed).
      if (parsed.textBoxes) setTextBoxes(parsed.textBoxes.map(tb => ({
        ...tb,
        height: tb.height || 0.15,
        content: maybeConvertMarkdown(tb.content || ''),
      })));
      if (parsed.images) setImages(parsed.images);
      if (parsed.pageMode) setPageMode(parsed.pageMode);

      // Restore canvas height from content: find the lowest content point
      const maxContentY = Math.max(
        ...(parsed.strokes || []).flatMap(s => s.points.map(p => p.y)),
        ...(parsed.textBoxes || []).map(tb => (tb.y || 0) + (tb.height || 0.15)),
        ...(parsed.images || []).map(img => (img.y || 0) + (img.height || 0)),
        0,
      );
      // Convert normalized y to pixels (use width as reference since y is normalized by width)
      // Then ensure at least enough pages to show all content
      const estimatedContentHeight = maxContentY * (window.innerWidth || 800);
      const neededPages = Math.ceil(estimatedContentHeight / PAGE_HEIGHT);
      if (neededPages > 1) {
        setCanvasHeight(neededPages * PAGE_HEIGHT);
      }

      lastSavedDataRef.current = initialData;
      initialDataLoadedRef.current = true;
      redrawBackground();
      redrawAll();
    }
  }, [initialData, redrawBackground, redrawAll]);

  // Auto-fit text box heights to content after initial load
  useEffect(() => {
    if (textBoxes.length === 0) return;
    const timer = setTimeout(() => {
      const w = displayWidthRef.current;
      if (w <= 0) return;
      let changed = false;
      const fitted = textBoxes.map(tb => {
        const el = contentEditableRefs.current.get(tb.id);
        if (!el || !el.scrollHeight) return tb;
        const fittedH = Math.max(el.scrollHeight, 24) / w;
        // Only shrink if current height is significantly larger than content
        if (tb.height > fittedH + 0.005) {
          changed = true;
          return { ...tb, height: fittedH };
        }
        return tb;
      });
      if (changed) setTextBoxes(fitted);
    }, 100); // small delay to let DOM render content
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]); // only run on initial load

  useEffect(() => {
    strokeDataRef.current.paperType = paperType;
    redrawBackground();
    triggerAutoSave();
  }, [paperType, redrawBackground, triggerAutoSave]);

  // Pre-cache images into HTMLImageElement objects for synchronous canvas drawing
  useEffect(() => {
    const cache = imageCacheRef.current;
    for (const img of images) {
      if (!cache.has(img.id)) {
        const el = new Image();
        el.onload = () => redrawAll(); // redraw once image is loaded
        el.src = img.src;
        cache.set(img.id, el);
      }
    }
    // Clean up removed images from cache
    const currentIds = new Set(images.map(img => img.id));
    cache.forEach((_, id) => {
      if (!currentIds.has(id)) cache.delete(id);
    });
  }, [images, redrawAll]);

  // ── Coordinate helper ──────────────────────────────────────────────────
  // Cache the canvas rect across the duration of a stroke. getBoundingClientRect forces
  // a synchronous style + layout pass if anything in the DOM has changed since the last
  // layout — at Apple Pencil's 240Hz that adds up fast on a page with many text boxes
  // and SVG connectors. We refresh the cached rect at pointerDown.
  const cachedCanvasRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const refreshCanvasRect = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { cachedCanvasRectRef.current = null; return; }
    const r = canvas.getBoundingClientRect();
    cachedCanvasRectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height };
  }, []);

  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    let rect = cachedCanvasRectRef.current;
    if (!rect) {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const r = canvas.getBoundingClientRect();
      rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      cachedCanvasRectRef.current = rect;
    }
    const scaleX = displayWidthRef.current / rect.width;
    const scaleY = displayHeightRef.current / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const getNormalizedPoint = useCallback((clientX: number, clientY: number) => {
    const { x, y } = getCanvasPoint(clientX, clientY);
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    // Use width for both dimensions so positions don't shift when height changes
    return { x: w > 0 ? x / w : 0, y: w > 0 ? y / w : 0 };
  }, [getCanvasPoint]);

  // ── Auto-expand ────────────────────────────────────────────────────────

  const needsExpandRef = useRef(false);

  const checkAutoExpand = useCallback((y: number) => {
    if (y > displayHeightRef.current - AUTO_EXPAND_THRESHOLD) {
      needsExpandRef.current = true; // defer until stroke completes
    }
  }, []);

  const applyDeferredExpand = useCallback(() => {
    if (needsExpandRef.current) {
      needsExpandRef.current = false;
      setCanvasHeight(prev => prev + AUTO_EXPAND_AMOUNT);
    }
  }, []);

  // ── Stroke commit ──────────────────────────────────────────────────────

  const getToolOpacity = useCallback((): number => {
    switch (toolRef.current) {
      case 'highlighter': return 0.25;
      case 'marker': return 0.7;
      default: return 1.0;
    }
  }, []);

  const commitCurrentStroke = useCallback(() => {
    const points = currentStrokePointsRef.current;
    if (points.length < 2) { currentStrokePointsRef.current = []; return; }
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) { currentStrokePointsRef.current = []; return; }

    const abs: AbsoluteStroke = {
      points: [...points], color: colorRef.current, lineWidth: sizeRef.current,
      tool: toolRef.current as StrokeTool, opacity: getToolOpacity(),
    };
    // Use width for both dimensions so strokes don't stretch when height changes
    const normalized = normalizeStroke(abs, w, w);
    // Tag stroke with current drawing layer
    normalized.layer = drawingLayerRef.current;
    strokeDataRef.current.strokes.push(normalized);
    // Record an O(1) action marker instead of a full document snapshot — JSON.stringify
    // of the whole document on every pen-up was making the commit block for tens of ms
    // once the page had many strokes.
    undoHistoryRef.current.push({ kind: 'stroke-add', stroke: normalized });
    if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();
    redoHistoryRef.current = [];
    currentStrokePointsRef.current = [];
    triggerAutoSave();
  }, [getToolOpacity, triggerAutoSave]);

  // ── Stroke eraser ──────────────────────────────────────────────────────

  const eraserActiveRef = useRef(false);
  const eraseStrokeAt = useCallback((px: number, py: number) => {
    const w = displayWidthRef.current;
    if (w <= 0) return;
    // Use width for both dimensions (matching stroke normalization)
    const nx = px / w;
    const ny = py / w;
    const hitRadius = 15 / w;
    const strokes = strokeDataRef.current.strokes;
    let hitIndex = -1;
    for (let i = strokes.length - 1; i >= 0; i--) {
      for (const pt of strokes[i].points) {
        const dx = pt.x - nx, dy = pt.y - ny;
        if (dx * dx + dy * dy < hitRadius * hitRadius) { hitIndex = i; break; }
      }
      if (hitIndex >= 0) break;
    }
    if (hitIndex >= 0) {
      if (!eraserActiveRef.current) { pushUndo(); eraserActiveRef.current = true; }
      strokes.splice(hitIndex, 1);
      redrawAll();
      triggerAutoSave();
    }
  }, [triggerAutoSave, pushUndo, redrawAll]);

  // ── Lasso selection ────────────────────────────────────────────────────

  const finishLasso = useCallback(() => {
    // Read from the drag ref — points are accumulated there to avoid state churn during the drag.
    const pts = lassoPointsRef.current;
    const resetPts = () => { lassoPointsRef.current = []; setLassoPoints([]); };
    if (pts.length < 3) { resetPts(); redrawAll(); return; }
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) { resetPts(); return; }

    // Convert lasso points to normalized
    // Use width for both dimensions
    const normalizedLasso = pts.map(p => ({ x: p.x / w, y: p.y / w }));

    // Point-in-polygon test
    const isInside = (px: number, py: number): boolean => {
      let inside = false;
      for (let i = 0, j = normalizedLasso.length - 1; i < normalizedLasso.length; j = i++) {
        const xi = normalizedLasso[i].x, yi = normalizedLasso[i].y;
        const xj = normalizedLasso[j].x, yj = normalizedLasso[j].y;
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    };

    // Find strokes with any point inside lasso
    const selectedIndices: number[] = [];
    const strokes = strokeDataRef.current.strokes;
    for (let i = 0; i < strokes.length; i++) {
      if (strokes[i].points.some(p => isInside(p.x, p.y))) {
        selectedIndices.push(i);
      }
    }

    if (selectedIndices.length > 0) {
      // Strokes normalize by width (not height), so p.y can exceed 1 on a multi-page
      // canvas. Seed min with Infinity so strokes that live entirely below the first
      // page still produce correct bounds — using 1 meant minY stayed at 1 and the
      // bounds box looked much taller than the selected strokes.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const idx of selectedIndices) {
        for (const p of strokes[idx].points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
      setLassoSelection({
        strokeIndices: selectedIndices,
        bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      });
    }
    lassoPointsRef.current = [];
    setLassoPoints([]);
    redrawAll();
  }, [redrawAll]);

  // Rectangle selection: finalize selection from rectStart/rectEndRef
  const finishRectSelection = useCallback(() => {
    const end = rectEndRef.current;
    const reset = () => { rectEndRef.current = null; setRectStart(null); setRectEnd(null); };
    if (!rectStart || !end) { reset(); redrawAll(); return; }
    const w = displayWidthRef.current;
    if (w <= 0) { reset(); return; }

    // Normalize rect coords (use width for both dims, matching stroke normalization)
    const nx1 = Math.min(rectStart.x, end.x) / w;
    const ny1 = Math.min(rectStart.y, end.y) / w;
    const nx2 = Math.max(rectStart.x, end.x) / w;
    const ny2 = Math.max(rectStart.y, end.y) / w;

    // Find strokes with any point inside rectangle
    const selectedIndices: number[] = [];
    const strokes = strokeDataRef.current.strokes;
    for (let i = 0; i < strokes.length; i++) {
      if (strokes[i].points.some(p => p.x >= nx1 && p.x <= nx2 && p.y >= ny1 && p.y <= ny2)) {
        selectedIndices.push(i);
      }
    }

    if (selectedIndices.length > 0) {
      // See finishLasso for why Infinity (p.y > 1 on multi-page canvases).
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const idx of selectedIndices) {
        for (const p of strokes[idx].points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
      setLassoSelection({
        strokeIndices: selectedIndices,
        bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      });
    }
    rectEndRef.current = null;
    setRectStart(null);
    setRectEnd(null);
    redrawAll();
  }, [rectStart, redrawAll]);

  const moveLassoSelection = useCallback((dx: number, dy: number) => {
    if (!lassoSelection) return;
    const w = displayWidthRef.current;
    if (w <= 0) return;
    // Use width for both dimensions
    const ndx = dx / w;
    const ndy = dy / w;
    const strokes = strokeDataRef.current.strokes;
    for (const idx of lassoSelection.strokeIndices) {
      if (strokes[idx]) {
        strokes[idx].points = strokes[idx].points.map(p => ({ x: p.x + ndx, y: p.y + ndy }));
      }
    }
    setLassoSelection(prev => prev ? {
      ...prev,
      bounds: { ...prev.bounds, x: prev.bounds.x + ndx, y: prev.bounds.y + ndy },
    } : null);
    redrawAll();
    triggerAutoSave();
  }, [lassoSelection, redrawAll, triggerAutoSave]);

  const deleteLassoSelection = useCallback(() => {
    if (!lassoSelection) return;
    pushUndo();
    const indices = [...lassoSelection.strokeIndices].sort((a, b) => b - a);
    for (const idx of indices) {
      strokeDataRef.current.strokes.splice(idx, 1);
    }
    setLassoSelection(null);
    redrawAll();
    triggerAutoSave();
  }, [lassoSelection, pushUndo, redrawAll, triggerAutoSave]);

  // ── Touch/Mouse handlers ───────────────────────────────────────────────

  const handlePointerDown = useCallback((clientX: number, clientY: number) => {
    refreshCanvasRect();
    const { x, y } = getCanvasPoint(clientX, clientY);
    const tool = toolRef.current;

    closeAllPopups();

    // Pointer mode — do nothing on canvas click (just deselect)
    if (tool === 'pointer') {
      // Sync content before clearing editing state
      const eid = editingTextIdRef.current;
      if (eid) {
        const el = contentEditableRefs.current.get(eid);
        if (el) {
          textBoxesRef.current = textBoxesRef.current.map(tb =>
            tb.id === eid ? { ...tb, content: el.innerHTML } : tb
          );
          setTextBoxes(textBoxesRef.current);
        }
      }
      setSelectedItemId(null);
      setSelectedItemType(null);
      setEditingTextId(null);
      setLassoSelection(null);
      return;
    }

    // Lasso drag
    if (lassoSelection && tool === 'lasso') {
      const w = displayWidthRef.current, h = displayHeightRef.current;
      const b = lassoSelection.bounds;
      const nx = x / w, ny = y / w; // use width for both
      if (nx >= b.x && nx <= b.x + b.w && ny >= b.y && ny <= b.y + b.h) {
        lassoDragStartRef.current = { x, y };
        pushUndo();
        return;
      } else {
        setLassoSelection(null);
        redrawAll();
      }
    }

    if (tool === 'lasso') {
      // Snapshot the current main-canvas pixels so selection-preview frames can restore
      // state via drawImage (O(1)) instead of redrawing every stroke (O(strokes)).
      const main = canvasRef.current;
      if (main) {
        let snap = selectionSnapshotRef.current;
        if (!snap) {
          snap = document.createElement('canvas');
          selectionSnapshotRef.current = snap;
        }
        if (snap.width !== main.width || snap.height !== main.height) {
          snap.width = main.width;
          snap.height = main.height;
        }
        const sctx = snap.getContext('2d');
        if (sctx) {
          sctx.clearRect(0, 0, snap.width, snap.height);
          sctx.drawImage(main, 0, 0);
        }
      }
      if (selectionMode === 'rectangle') {
        setRectStart({ x, y });
        rectEndRef.current = { x, y };
      } else {
        lassoPointsRef.current = [{ x, y }];
      }
      isDrawingRef.current = true;
      return;
    }

    if (tool === 'text') {
      // If a text box is selected or being edited, deselect first instead of creating a new one
      const eid = editingTextIdRef.current;
      if (eid || selectedItemIdRef.current) {
        if (eid) {
          const el = contentEditableRefs.current.get(eid);
          if (el) {
            textBoxesRef.current = textBoxesRef.current.map(tb =>
              tb.id === eid ? { ...tb, content: el.innerHTML } : tb
            );
            setTextBoxes(textBoxesRef.current);
          }
        }
        setSelectedItemId(null);
        setSelectedItemType(null);
        setEditingTextId(null);
        return;
      }
      // Create text box at tap position
      const np = getNormalizedPoint(clientX, clientY);
      const newBox: TextBox = {
        id: genId(), x: np.x, y: np.y, width: 0.4, height: 0.15,
        content: '', fontSize: 16,
        fontFamily: TEXT_FONTS[0].value,
        textColor: '#000000',
        textAlign: 'left',
      };
      pushUndo();
      setTextBoxes(prev => [...prev, newBox]);
      setEditingTextId(newBox.id);
      triggerAutoSave();
      return;
    }

    if (tool === 'eraser') {
      isDrawingRef.current = true;
      eraserActiveRef.current = false;
      eraseStrokeAt(x, y);
      return;
    }

    // Drawing tools — use overlay canvas when drawing above text
    const drawCtx = drawingLayerRef.current === 'above' ? overlayCtxRef.current : ctxRef.current;
    if (!drawCtx) return;
    isDrawingRef.current = true;
    currentStrokePointsRef.current = [{ x, y }];
    applyToolSettings();
    // Live drawing happens in an rAF batch (see handlePointerMove) — start of stroke only
    // records the anchor point; the first segment is drawn on the first rAF after a move.
  }, [getCanvasPoint, getNormalizedPoint, closeAllPopups, applyToolSettings, eraseStrokeAt, lassoSelection, pushUndo, redrawAll, triggerAutoSave, refreshCanvasRect]);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!isDrawingRef.current && !lassoDragStartRef.current) return;
    const { x, y } = getCanvasPoint(clientX, clientY);
    const tool = toolRef.current;

    // Lasso dragging selection — mutate strokes per event and redraw. Not the fastest path
    // for huge pages, but a rAF-throttled snapshot attempt regressed pen-drawing latency.
    // Prioritize handwriting responsiveness; revisit drag perf separately.
    if (lassoDragStartRef.current && lassoSelection) {
      const start = lassoDragStartRef.current;
      const dx = x - start.x;
      const dy = y - start.y;
      lassoDragStartRef.current = { x, y };
      moveLassoSelection(dx, dy);
      return;
    }

    if (tool === 'lasso') {
      // Accumulate into refs — no React state churn during the drag.
      if (selectionMode === 'rectangle' && rectStart) {
        rectEndRef.current = { x, y };
      } else {
        lassoPointsRef.current.push({ x, y });
      }
      // Coalesce preview rendering to display refresh (Apple Pencil fires up to ~240Hz).
      if (selectionRafRef.current !== null) return;
      selectionRafRef.current = requestAnimationFrame(() => {
        selectionRafRef.current = null;
        const main = canvasRef.current;
        const mainCtx = ctxRef.current;
        const snap = selectionSnapshotRef.current;
        if (!main || !mainCtx || !snap) return;
        // The ctx has scale(dpr, dpr) applied, so we draw in LOGICAL px. snap.width/height
        // are RASTER px — pass the logical size explicitly so the blit isn't dpr-scaled.
        const logicalW = displayWidthRef.current;
        const logicalH = displayHeightRef.current;
        // Restore pre-drag pixels (one GPU blit), then draw just the selection shape.
        mainCtx.clearRect(0, 0, logicalW, logicalH);
        mainCtx.drawImage(snap, 0, 0, logicalW, logicalH);
        mainCtx.save();
        mainCtx.strokeStyle = '#4f46e5';
        mainCtx.lineWidth = 2;
        mainCtx.setLineDash([6, 4]);
        if (selectionMode === 'rectangle' && rectStart && rectEndRef.current) {
          const end = rectEndRef.current;
          const rx = Math.min(rectStart.x, end.x);
          const ry = Math.min(rectStart.y, end.y);
          const rw = Math.abs(end.x - rectStart.x);
          const rh = Math.abs(end.y - rectStart.y);
          mainCtx.fillStyle = 'rgba(79, 70, 229, 0.08)';
          mainCtx.fillRect(rx, ry, rw, rh);
          mainCtx.strokeRect(rx, ry, rw, rh);
        } else {
          const pts = lassoPointsRef.current;
          if (pts.length > 1) {
            mainCtx.beginPath();
            mainCtx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) mainCtx.lineTo(pts[i].x, pts[i].y);
            mainCtx.closePath();
            mainCtx.stroke();
          }
        }
        mainCtx.restore();
      });
      return;
    }

    if (tool === 'eraser') { eraseStrokeAt(x, y); return; }

    // Stroke the new segment immediately. rAF batching added perceptible input lag on
    // Apple Pencil (which fires at ~240Hz) without giving meaningful throughput wins —
    // user reports said batched mode felt the same or worse than per-event drawing.
    const drawCtx = drawingLayerRef.current === 'above' ? overlayCtxRef.current : ctxRef.current;
    if (!drawCtx) return;
    const pts = currentStrokePointsRef.current;
    const prev = pts[pts.length - 1];
    pts.push({ x, y });
    if (prev) {
      drawCtx.beginPath();
      drawCtx.moveTo(prev.x, prev.y);
      drawCtx.lineTo(x, y);
      drawCtx.stroke();
    }
    checkAutoExpand(y);
  }, [getCanvasPoint, checkAutoExpand, eraseStrokeAt, lassoSelection, moveLassoSelection, redrawAll]);

  const handlePointerUp = useCallback(() => {
    const tool = toolRef.current;
    if (lassoDragStartRef.current) {
      lassoDragStartRef.current = null;
      return;
    }
    if (tool === 'lasso') {
      // Drop any pending throttled redraw — finishLasso/finishRectSelection does the final redraw.
      if (selectionRafRef.current !== null) {
        cancelAnimationFrame(selectionRafRef.current);
        selectionRafRef.current = null;
      }
      if (selectionMode === 'rectangle') { finishRectSelection(); }
      else { finishLasso(); }
      isDrawingRef.current = false;
      return;
    }
    if (tool === 'eraser') { eraserActiveRef.current = false; isDrawingRef.current = false; applyDeferredExpand(); return; }
    if (isDrawingRef.current) commitCurrentStroke();
    isDrawingRef.current = false;
    applyDeferredExpand();
  }, [commitCurrentStroke, finishLasso, applyDeferredExpand]);

  // ── Single-page navigation helpers ─────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(canvasHeight / PAGE_HEIGHT));

  const goToPage = useCallback((page: number) => {
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(clamped);
    setSwipeOffset(0);
    // In seamless mode, scroll to the page position
    if (pageMode === 'seamless' && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: clamped * PAGE_HEIGHT,
        behavior: 'smooth',
      });
    }
  }, [totalPages, pageMode]);

  const addPage = useCallback(() => {
    setCanvasHeight(prev => prev + PAGE_HEIGHT);
    // Navigate to the new page after adding
    setTimeout(() => goToPage(totalPages), 50);
  }, [totalPages, goToPage]);

  // Track current page from scroll position (Notability-style: updates on scroll)
  const [showPageIndicator, setShowPageIndicator] = useState(false);
  const pageIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const page = Math.round(container.scrollTop / PAGE_HEIGHT);
      setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
      // Show floating page indicator, then fade out after 1.5s (Notability behavior)
      setShowPageIndicator(true);
      if (pageIndicatorTimerRef.current) clearTimeout(pageIndicatorTimerRef.current);
      pageIndicatorTimerRef.current = setTimeout(() => setShowPageIndicator(false), 1500);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (pageIndicatorTimerRef.current) clearTimeout(pageIndicatorTimerRef.current);
    };
  }, [totalPages]);

  // Keyboard navigation for page switching (laptop-friendly)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle page nav when not editing text
      if (editingTextId) return;
      if (e.key === 'PageDown' || (e.key === 'ArrowDown' && e.metaKey)) {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (e.key === 'PageUp' || (e.key === 'ArrowUp' && e.metaKey)) {
        e.preventDefault();
        goToPage(currentPage - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, goToPage, editingTextId]);

  // ── Finger vs Stylus detection ─────────────────────────────────────
  // Detect if device has Apple Pencil support (iPad). iPhone does not.
  // On iPhone, finger acts as the drawing tool since there's no Apple Pencil.
  const isApplePencilDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    // iPad reports as "iPad" or (in iPadOS 13+) as "Macintosh" with touch
    const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    return isIPad;
  }, []);

  // Apple Pencil: touchType === 'stylus' OR very small radiusX (< 10)
  // Finger: touchType === 'direct' OR larger radiusX (>= 10)
  // On iPhone (no Apple Pencil): finger acts as stylus for drawing
  const isStylusTouch = useCallback((touch: Touch): boolean => {
    // On iPhone, finger IS the drawing tool — treat all touches as stylus
    if (!isApplePencilDevice && /iPhone/.test(navigator.userAgent)) return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = touch as any;
    if (t.touchType === 'stylus') return true;
    if (t.touchType === 'direct') return false;
    // Fallback: Apple Pencil has very small radius; finger is larger
    if (touch.radiusX !== undefined && touch.radiusX > 0) {
      return touch.radiusX < 10;
    }
    return true; // default to stylus on desktop/unknown
  }, [isApplePencilDevice]);

  // A "drawing tool" is anything that inks or erases (pen/marker/highlighter/
  // eraser/lasso). `pointer` and `text` are non-drawing. Single source of
  // truth so palm-rejection, navigation branches, and the render-time
  // touchAction CSS stay in sync if a new tool type is added.
  const isDrawingTool = (tool: ActiveTool): boolean =>
    tool !== 'pointer' && tool !== 'text';
  const isDrawingToolActive = useCallback(() => isDrawingTool(toolRef.current), []);

  // Determine if a touch should navigate (scroll/swipe) instead of draw.
  // Navigation happens when: pointer tool (any input), OR finger on iPad (pencil draws).
  // On iPhone: finger draws in drawing modes, navigates only in pointer mode.
  const shouldNavigate = useCallback((touch: Touch): boolean => {
    if (toolRef.current === 'pointer') return true; // pointer mode: both finger & pencil navigate
    return !isStylusTouch(touch); // drawing modes: iPhone finger draws, iPad finger navigates
  }, [isStylusTouch]);

  // Tracks the previous successful tap to detect a double-tap (see handleTouchEnd).
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // Hit-test document-coord (x, y) against text boxes in z-order. Returns the id of
  // the topmost box containing the point, or null. Used by the canvas tap handler to
  // enter edit mode when a tap lands on a text box that is currently pointer-events:none.
  const hitTestTextBox = useCallback((docX: number, docY: number): string | null => {
    const w = displayWidthRef.current;
    if (w <= 0) return null;
    const nx = docX / w;
    const ny = docY / w; // height is normalized by width too (see stroke normalization comment)
    // Iterate in descending z-order so topmost box wins.
    const boxes = [...textBoxesRef.current].sort(
      (a, b) => (b.zOrder || 0) - (a.zOrder || 0),
    );
    for (const tb of boxes) {
      const right = tb.x + tb.width;
      const bottom = tb.y + (tb.height || 0.15);
      if (nx >= tb.x && nx <= right && ny >= tb.y && ny <= bottom) return tb.id;
    }
    return null;
  }, []);

  // On iPad the Apple Pencil fires BOTH pointer events and touch events for the
  // same gesture. We handle pencil strictly through the pointer path below (for
  // setPointerCapture + getCoalescedEvents) so skip stylus touches here to avoid
  // double-processing each ink point. Feature-detect PointerEvent so we don't
  // leave pencil unhandled on older browsers.
  const hasPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;

  // Touch events — finger scrolls/swipes, stylus draws (except pointer mode)
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length > 1) return;
    const t = e.touches[0];
    // Pencil in DRAWING modes (pen/marker/highlighter/eraser/lasso) goes through
    // the pointer event path (setPointerCapture + getCoalescedEvents for fidelity
    // under load). Skip here so it's not double-processed. preventDefault still
    // runs so the browser doesn't start a scroll gesture on the stylus touch —
    // pointer-event preventDefault alone doesn't override touch-action: pan-y.
    // In POINTER mode we intentionally don't skip stylus: the touch handler's
    // navigation path (swipe / double-tap-to-edit) treats pencil identically
    // to finger, so the pencil can flip pages again.
    if (hasPointerEvents && isStylusTouch(t) && toolRef.current !== 'pointer') {
      e.preventDefault();
      return;
    }
    // Text mode is keyboard-only: Apple Pencil is inert. Blocks Scribble, accidental
    // strokes, and accidental new text boxes from pencil taps while typing.
    if (toolRef.current === 'text' && isStylusTouch(t)) {
      e.preventDefault();
      return;
    }
    // Palm-shape rejection: a resting palm has a much larger contact area than
    // a fingertip. iPads report ~15–22 px radiusX for fingers and 25+ for palms.
    // Reject the large-radius touch outright so a palm rest doesn't kick off
    // a swipe before the Pencil has a chance to land. Real finger nav (radiusX
    // ≤ 25) still flows through to shouldNavigate below — this matches the
    // Notability behavior the user expects: finger swipe flips pages in
    // drawing modes, palm rest does not.
    if (isApplePencilDevice && isDrawingToolActive() && !isStylusTouch(t)
        && t.radiusX !== undefined && t.radiusX > PALM_RADIUS_THRESHOLD) {
      e.preventDefault();
      isFingerTouchRef.current = false;
      swipeStartRef.current = null;
      return;
    }
    const nav = shouldNavigate(t);
    isFingerTouchRef.current = nav;

    if (nav) {
      // Navigation touch — allow native scroll in seamless, track swipe in single-page.
      // Always stash the start in swipeStartRef (both modes) so touchEnd can decide
      // between "tap to enter edit" and "swipe / scroll".
      swipeStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
      if (pageMode === 'single') {
        e.preventDefault();
      }
      // In seamless mode: do NOT preventDefault → native vertical scroll works
      return;
    }

    // Drawing touch (stylus with non-pointer tool) — prevent default and draw
    e.preventDefault();
    handlePointerDown(t.clientX, t.clientY);
  }, [handlePointerDown, pageMode, shouldNavigate, isDrawingToolActive]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length > 1) { isDrawingRef.current = false; return; }
    // Pencil in drawing modes → pointer path (see handleTouchStart). In pointer
    // mode we keep the stylus in the touch navigation path so pencil can scroll.
    if (hasPointerEvents && isStylusTouch(e.touches[0]) && toolRef.current !== 'pointer') {
      e.preventDefault();
      return;
    }
    // Mirror of the palm-shape guard in handleTouchStart: a large-radius touch
    // that has already been classified as palm (isFingerTouchRef === false at
    // this point in the move) should not drive scroll or swipe. Normal fingers
    // fall through to the isFingerTouchRef branch below.
    if (isApplePencilDevice && isDrawingToolActive() && !isStylusTouch(e.touches[0])
        && e.touches[0].radiusX !== undefined && e.touches[0].radiusX > PALM_RADIUS_THRESHOLD) {
      e.preventDefault();
      return;
    }

    if (isFingerTouchRef.current) {
      // Navigation move — handle swipe in single-page mode
      if (pageMode === 'single' && swipeStartRef.current) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - swipeStartRef.current.x;
        const dy = t.clientY - swipeStartRef.current.y;
        // Use dominant axis for visual feedback
        if (Math.abs(dx) > Math.abs(dy)) {
          setSwipeOffset(dx);
        } else {
          setSwipeOffset(0);
        }
      }
      // In seamless mode: no preventDefault, native scroll works
      return;
    }

    // Drawing move (stylus)
    e.preventDefault();
    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, [handlePointerMove, pageMode, isDrawingToolActive]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    // Pencil in drawing modes → pointer path. Pencil in pointer mode → this handler
    // (for swipe-to-flip and double-tap-to-edit, identical to finger navigation).
    const last0 = e.changedTouches[0];
    if (hasPointerEvents && last0 && isStylusTouch(last0) && toolRef.current !== 'pointer') {
      e.preventDefault();
      return;
    }
    if (isFingerTouchRef.current) {
      isFingerTouchRef.current = false;
      const start = swipeStartRef.current;
      const last = e.changedTouches[0];
      const dx = last && start ? last.clientX - start.x : 0;
      const dy = last && start ? last.clientY - start.y : 0;
      const elapsed = start ? Date.now() - start.time : 999;
      const movedSq = dx * dx + dy * dy;

      // Single-page swipe completion — HORIZONTAL ONLY. Vertical swipes were
      // previously also flipping pages, which conflicts with the user's mental
      // model: single-page = horizontal flip (side-by-side like a book), and
      // the separate seamless mode is where vertical scroll navigates.
      if (pageMode === 'single' && start) {
        e.preventDefault();
        if (elapsed < 500) {
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
            goToPage(dx < 0 ? currentPage + 1 : currentPage - 1);
          }
        }
        setSwipeOffset(0);
      }

      // Double-tap-to-edit: in pointer mode, two quick taps in nearly the same spot
      // enter edit mode for whichever text box is hit. We detect the double-tap here
      // (not through native onDoubleClick) because text boxes are pointer-events:none
      // in pointer mode so their own DOM handlers never see the taps.
      if (toolRef.current === 'pointer' && last && elapsed < 400 && movedSq < 12 * 12) {
        const now = Date.now();
        const prev = lastTapRef.current;
        if (prev && now - prev.time < 350) {
          const ddx = last.clientX - prev.x;
          const ddy = last.clientY - prev.y;
          if (ddx * ddx + ddy * ddy < 30 * 30) {
            const pt = getCanvasPoint(last.clientX, last.clientY);
            const hitId = hitTestTextBox(pt.x, pt.y);
            if (hitId) setEditingTextId(hitId);
            lastTapRef.current = null;
          } else {
            lastTapRef.current = { time: now, x: last.clientX, y: last.clientY };
          }
        } else {
          lastTapRef.current = { time: now, x: last.clientX, y: last.clientY };
        }
      }

      swipeStartRef.current = null;
      return;
    }

    // Drawing end (stylus)
    e.preventDefault();
    handlePointerUp();
  }, [handlePointerUp, pageMode, currentPage, goToPage, getCanvasPoint, hitTestTextBox]);

  // Mouse events
  const handleMouseDown = useCallback((e: MouseEvent) => handlePointerDown(e.clientX, e.clientY), [handlePointerDown]);
  const handleMouseMove = useCallback((e: MouseEvent) => handlePointerMove(e.clientX, e.clientY), [handlePointerMove]);
  const handleMouseUp = useCallback(() => handlePointerUp(), [handlePointerUp]);

  // Pencil-only Pointer Events. Additive to the touch/mouse pipeline: we use the
  // pointer path just for pen input, and pencil touches are filtered out of the
  // touch handlers above. Two specific wins we need here:
  //   - setPointerCapture: follow-up move/up/cancel events for this pointerId
  //     stay on our element even if DOM changes. Prevents pen events from
  //     leaking to the canvas during a text-box drag and surviving React
  //     re-renders under load.
  //   - getCoalescedEvents(): replays every sub-event iOS queued since the
  //     last pointermove. Apple Pencil runs at ~240Hz; when the main thread
  //     is briefly busy iOS batches the extra points and only fires one
  //     pointermove — losing the rest. getCoalescedEvents recovers them.
  const handlePenPointerDown = useCallback((e: PointerEvent, el: HTMLElement) => {
    if (e.pointerType !== 'pen') return;
    const tool = toolRef.current;
    if (tool === 'pointer' || tool === 'text') return; // not a drawing path
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* older iOS */ }
    // Stylus-cancels-finger: the Pencil just made contact. Any finger touch
    // currently active is the user's palm resting — retroactively cancel its
    // swipe state so the palm's pre-Pencil movement doesn't commit a page
    // flip on touchend. handleTouchEnd guards on isFingerTouchRef, which we
    // clear here; swipeStartRef and swipeOffset are cleared defensively so
    // the visual feedback doesn't linger.
    isFingerTouchRef.current = false;
    if (swipeStartRef.current) {
      swipeStartRef.current = null;
      setSwipeOffset(0);
    }
    handlePointerDown(e.clientX, e.clientY);
  }, [handlePointerDown]);

  const handlePenPointerMove = useCallback((e: PointerEvent) => {
    if (e.pointerType !== 'pen') return;
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    if (coalesced && coalesced.length > 0) {
      for (const sub of coalesced) handlePointerMove(sub.clientX, sub.clientY);
    } else {
      handlePointerMove(e.clientX, e.clientY);
    }
  }, [handlePointerMove]);

  const handlePenPointerUp = useCallback((e: PointerEvent, el: HTMLElement) => {
    if (e.pointerType !== 'pen') return;
    if (!isDrawingRef.current) return;
    try { el.releasePointerCapture(e.pointerId); } catch { /* older iOS */ }
    e.preventDefault();
    handlePointerUp();
  }, [handlePointerUp]);

  // Keep the latest handlers in refs so the DOM listener effect can mount once
  // (empty deps). Without this, any prop change upstream — e.g. JournalView passes
  // a fresh onSave arrow every render after `setEntries` — cascades into rebuilt
  // callbacks here and forces the touch listeners to detach/re-attach. If a
  // pointermove or pointerup fires during that window it is lost, which is how
  // strokes were going missing after auto-save.
  const handlersRef = useRef({
    touchStart: handleTouchStart,
    touchMove: handleTouchMove,
    touchEnd: handleTouchEnd,
    mouseDown: handleMouseDown,
    mouseMove: handleMouseMove,
    mouseUp: handleMouseUp,
    penDown: handlePenPointerDown,
    penMove: handlePenPointerMove,
    penUp: handlePenPointerUp,
  });
  useEffect(() => {
    handlersRef.current = {
      touchStart: handleTouchStart,
      touchMove: handleTouchMove,
      touchEnd: handleTouchEnd,
      mouseDown: handleMouseDown,
      mouseMove: handleMouseMove,
      mouseUp: handleMouseUp,
      penDown: handlePenPointerDown,
      penMove: handlePenPointerMove,
      penUp: handlePenPointerUp,
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleMouseDown, handleMouseMove, handleMouseUp, handlePenPointerDown, handlePenPointerMove, handlePenPointerUp]);

  // Event listener setup — attach ONCE and dispatch through the ref. Never detaches
  // during the component's lifetime, so no events can slip through between renders.
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas) return;
    const onTouchStart = (e: TouchEvent) => handlersRef.current.touchStart(e);
    const onTouchMove = (e: TouchEvent) => handlersRef.current.touchMove(e);
    const onTouchEnd = (e: TouchEvent) => handlersRef.current.touchEnd(e);
    const onMouseDown = (e: MouseEvent) => handlersRef.current.mouseDown(e);
    const onMouseMove = (e: MouseEvent) => handlersRef.current.mouseMove(e);
    const onMouseUp = (_e: MouseEvent) => handlersRef.current.mouseUp();
    const onContext = (e: MouseEvent) => e.preventDefault();
    const attachEvents = (el: HTMLCanvasElement) => {
      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd, { passive: false });
      el.addEventListener('mousedown', onMouseDown);
      el.addEventListener('mousemove', onMouseMove);
      el.addEventListener('mouseup', onMouseUp);
      el.addEventListener('mouseout', onMouseUp);
      el.addEventListener('contextmenu', onContext);
      // Pen-only Pointer Events for capture + coalesced replay. Only fires for
      // pointerType === 'pen'; handlers ignore everything else.
      const onPenDown = (e: PointerEvent) => handlersRef.current.penDown(e, el);
      const onPenMove = (e: PointerEvent) => handlersRef.current.penMove(e);
      const onPenUp = (e: PointerEvent) => handlersRef.current.penUp(e, el);
      el.addEventListener('pointerdown', onPenDown, { passive: false });
      el.addEventListener('pointermove', onPenMove, { passive: false });
      el.addEventListener('pointerup', onPenUp);
      el.addEventListener('pointercancel', onPenUp);
      // Return a detach that covers the pointer listeners too.
      return () => {
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchend', onTouchEnd);
        el.removeEventListener('mousedown', onMouseDown);
        el.removeEventListener('mousemove', onMouseMove);
        el.removeEventListener('mouseup', onMouseUp);
        el.removeEventListener('mouseout', onMouseUp);
        el.removeEventListener('contextmenu', onContext);
        el.removeEventListener('pointerdown', onPenDown);
        el.removeEventListener('pointermove', onPenMove);
        el.removeEventListener('pointerup', onPenUp);
        el.removeEventListener('pointercancel', onPenUp);
      };
    };
    const detachCanvas = attachEvents(canvas);
    const detachOverlay = overlay ? attachEvents(overlay) : () => {};
    return () => { detachCanvas(); detachOverlay(); };
  }, []);

  // ── Undo / Redo ────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    const entry = undoHistoryRef.current.pop();
    if (!entry) return;
    if (typeof entry === 'string') {
      redoHistoryRef.current.push(getSnapshot());
      restoreSnapshot(entry);
    } else if (entry.kind === 'stroke-add') {
      // Undo a stroke-add by popping the last stroke; record the reverse for redo.
      const popped = strokeDataRef.current.strokes.pop();
      if (popped) redoHistoryRef.current.push({ kind: 'stroke-add', stroke: popped });
    }
    redrawAll();
    triggerAutoSave();
  }, [getSnapshot, restoreSnapshot, redrawAll, triggerAutoSave]);

  const handleRedo = useCallback(() => {
    const entry = redoHistoryRef.current.pop();
    if (!entry) return;
    if (typeof entry === 'string') {
      undoHistoryRef.current.push(getSnapshot());
      if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();
      restoreSnapshot(entry);
    } else if (entry.kind === 'stroke-add') {
      // Redo re-appends the stroke and records the matching undo entry.
      strokeDataRef.current.strokes.push(entry.stroke);
      undoHistoryRef.current.push({ kind: 'stroke-add', stroke: entry.stroke });
      if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();
    }
    redrawAll();
    triggerAutoSave();
  }, [getSnapshot, restoreSnapshot, redrawAll, triggerAutoSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if (isMeta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && lassoSelection) { e.preventDefault(); deleteLassoSelection(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, lassoSelection, deleteLassoSelection]);

  // ── Image handling ─────────────────────────────────────────────────────

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      const newImg: CanvasImage = {
        id: genId(),
        x: 0.1, y: 0.1,
        width: 0.3, height: 0.3,
        rotation: 0,
        src: compressed.base64.startsWith('data:') ? compressed.base64 : `data:${compressed.mimeType};base64,${compressed.base64}`,
      };
      pushUndo();
      setImages(prev => [...prev, newImg]);
      triggerAutoSave();
      redrawAll();
    } catch (err) {
      console.error('Image insert failed:', err);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [pushUndo, triggerAutoSave, redrawAll]);

  // ── Text box management ────────────────────────────────────────────────

  const updateTextBox = useCallback((id: string, updates: Partial<TextBox>) => {
    setTextBoxes(prev => prev.map(tb => tb.id === id ? { ...tb, ...updates } : tb));
    triggerAutoSave();
  }, [triggerAutoSave]);

  // Save HTML content from contentEditable ref
  const syncContentFromRef = useCallback((id: string) => {
    const el = contentEditableRefs.current.get(id);
    if (!el) return;
    let content = el.innerHTML;
    // Auto-convert any raw markdown that's still present (typed-but-not-yet-rendered).
    // Delegate to maybeConvertMarkdown so paste / load / blur all apply the same rules —
    // notably: conversion runs even if the box already has <strong>/<em>/etc. from earlier,
    // as long as no <table> has been rendered yet.
    const converted = maybeConvertMarkdown(content);
    if (converted !== content) {
      el.innerHTML = converted;
      content = converted;
    }
    // Auto-fit height to (possibly newly-converted) content
    const w = displayWidthRef.current;
    const scrollH = el.scrollHeight;
    const minH = 24;
    const fittedPx = Math.max(scrollH, minH);
    const normalizedH = w > 0 ? fittedPx / w : 0.15;
    updateTextBox(id, { content, height: normalizedH });
  }, [updateTextBox]);

  // ── Slash commands (/date, /time, /location, /divider, /heading, /bible) ──
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashMenuPos, setSlashMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // SLASH_COMMANDS defined at module level

  const executeSlashCommand = useCallback((cmd: string, tbId: string) => {
    const el = contentEditableRefs.current.get(tbId);
    if (!el) return;

    let replacement = '';
    switch (cmd) {
      case '/date': {
        const d = new Date();
        replacement = d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        break;
      }
      case '/time': {
        const d = new Date();
        replacement = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        break;
      }
      case '/now': {
        const d = new Date();
        replacement = d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
          + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        break;
      }
      case '/location': {
        replacement = '📍 获取位置中...';
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=zh-CN&zoom=18`);
                const data = await resp.json();
                // Build a clean address from structured parts to avoid duplicates
                const addr = data.address || {};
                const parts = [addr.road, addr.neighbourhood, addr.suburb, addr.city || addr.town || addr.village, addr.state, addr.postcode, addr.country].filter(Boolean);
                const loc = parts.length > 0 ? [...new Set(parts)].join(', ') : data.display_name || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                el.innerHTML = el.innerHTML.replace('📍 获取位置中...', `📍 ${loc}`);
                syncContentFromRef(tbId);
              } catch {
                el.innerHTML = el.innerHTML.replace('📍 获取位置中...', `📍 ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
                syncContentFromRef(tbId);
              }
            },
            () => {
              el.innerHTML = el.innerHTML.replace('📍 获取位置中...', '📍 无法获取位置');
              syncContentFromRef(tbId);
            }
          );
        } else {
          replacement = '📍 不支持定位';
        }
        break;
      }
      case '/divider':
        replacement = '<hr style="border:none;border-top:1px solid #ccc;margin:8px 0">';
        break;
      case '/heading':
        replacement = '<b style="font-size:1.4em">标题</b><br>';
        break;
      case '/bible': {
        if (bibleContext?.bookName && bibleContext?.chapter) {
          const verseStr = bibleContext.verse ? `:${bibleContext.verse}` : '';
          replacement = `📖 ${bibleContext.bookName} ${bibleContext.chapter}${verseStr}`;
        } else {
          replacement = '📖 无当前经文 (请先在圣经视图中选择经文)';
        }
        break;
      }
      case '/checklist':
        replacement = '☐ ';
        break;
      default:
        return;
    }

    // Replace the slash command text in the contentEditable
    const html = el.innerHTML;
    // Find the command text to replace — look for the typed command
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) textNodes.push(node);

    for (const tn of textNodes) {
      const idx = tn.textContent?.indexOf(cmd);
      if (idx !== undefined && idx >= 0) {
        const before = tn.textContent!.substring(0, idx);
        const after = tn.textContent!.substring(idx + cmd.length);
        const span = document.createElement('span');
        span.innerHTML = before + replacement + after;
        tn.parentNode?.replaceChild(span, tn);
        // Place cursor after insertion
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(span);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        break;
      }
    }

    syncContentFromRef(tbId);
    setSlashMenuVisible(false);
    setSlashFilter('');
  }, [bibleContext, syncContentFromRef]);

  const handleTextInput = useCallback((id: string) => {
    const el = contentEditableRefs.current.get(id);
    if (!el) return;
    syncContentFromRef(id);

    // Check for slash commands
    const text = el.textContent || '';
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // Get text before cursor
    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.setStart(el, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBeforeCursor = preRange.toString();

    // Check if there's a slash command being typed
    const slashMatch = textBeforeCursor.match(/\/(\w*)$/);
    if (slashMatch) {
      const filter = slashMatch[0];
      const matching = SLASH_COMMANDS.filter(c => c.cmd.startsWith(filter));

      // Auto-execute only if exact match followed by space or newline (not at end — user may still be typing)
      const exactCmd = SLASH_COMMANDS.find(c => c.cmd === filter);
      if (exactCmd) {
        const afterCmd = textBeforeCursor.endsWith(filter) ? text.charAt(textBeforeCursor.length) : '';
        if (afterCmd === ' ' || afterCmd === '\n') {
          executeSlashCommand(exactCmd.cmd, id);
          return;
        }
      }

      if (matching.length > 0) {
        // Position the menu near the cursor
        const rect = range.getBoundingClientRect();
        setSlashMenuPos({ top: rect.bottom + 4, left: rect.left });
        setSlashFilter(filter);
        setSlashMenuVisible(true);
      } else {
        setSlashMenuVisible(false);
      }
    } else {
      setSlashMenuVisible(false);
    }
  }, [syncContentFromRef, executeSlashCommand, SLASH_COMMANDS]);

  // Save selection whenever it changes inside the contentEditable
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editingTextId) {
      const el = contentEditableRefs.current.get(editingTextId);
      if (el && el.contains(sel.anchorNode)) {
        savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
      }
    }
  }, [editingTextId]);

  // Close editing mode — called by click-outside handler
  const closeEditing = useCallback(() => {
    if (editingTextId) syncContentFromRef(editingTextId);
    setEditingTextId(null);
    setShowTextColorPicker(false);
    setShowHighlightColorPicker(false);
    setShowFontPicker(false);
    setShowFontSizePicker(false);
  }, [editingTextId, syncContentFromRef]);

  // Click-outside handler: close editing when clicking outside the text box + toolbar
  useEffect(() => {
    if (!editingTextId) return;
    const handleOutsideInteraction = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is inside the text box container (has data-textbox-id)
      const container = document.querySelector(`[data-textbox-id="${editingTextId}"]`);
      if (container && container.contains(target)) return; // inside — do nothing
      closeEditing();
    };
    // Use capture phase to detect before any preventDefault stops propagation
    document.addEventListener('mousedown', handleOutsideInteraction, true);
    document.addEventListener('touchstart', handleOutsideInteraction, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideInteraction, true);
      document.removeEventListener('touchstart', handleOutsideInteraction, true);
    };
  }, [editingTextId, closeEditing]);

  // Restore saved selection into the contentEditable
  const restoreSelection = useCallback(() => {
    if (!savedSelectionRef.current || !editingTextId) return false;
    const el = contentEditableRefs.current.get(editingTextId);
    if (!el) return false;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
      return true;
    }
    return false;
  }, [editingTextId]);

  // Execute rich text formatting command on the current selection
  const execFormat = useCallback((command: string, value?: string) => {
    if (editingTextId) {
      const el = contentEditableRefs.current.get(editingTextId);
      if (el) {
        // Ensure focused
        if (document.activeElement !== el) {
          el.focus();
        }
        // Restore selection if lost
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
          restoreSelection();
        }
      }
    }
    document.execCommand(command, false, value);
    // Sync after formatting
    if (editingTextId) syncContentFromRef(editingTextId);
  }, [editingTextId, syncContentFromRef, restoreSelection]);

  // Get the currently editing text box
  const editingTextBox = textBoxes.find(tb => tb.id === editingTextId);

  const deleteTextBox = useCallback((id: string) => {
    pushUndo();
    setTextBoxes(prev => prev.filter(tb => tb.id !== id));
    setEditingTextId(null);
    triggerAutoSave();
  }, [pushUndo, triggerAutoSave]);

  const deleteImage = useCallback((id: string) => {
    pushUndo();
    setImages(prev => prev.filter(img => img.id !== id));
    setSelectedItemId(null);
    setSelectedItemType(null);
    triggerAutoSave();
    redrawAll();
  }, [pushUndo, triggerAutoSave, redrawAll]);

  // ── Item drag/resize ───────────────────────────────────────────────────

  // Movement threshold — a tap on a text box/image SELECTS it (shows the resize handles)
  // but doesn't move it. Only an intentional drag that exceeds the threshold starts the
  // actual move. Fixes the "finger barely touched the box and it slid off" problem.
  const dragStartPxRef = useRef<{ x: number; y: number } | null>(null);
  const thresholdCrossedRef = useRef(false);
  const DRAG_THRESHOLD_PX = 8;

  const handleItemPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent, id: string, type: 'text' | 'image') => {
    e.stopPropagation();
    // (Content-surface drag is guarded by the onMouseDown/onTouchStart handlers at the
    // text box div — they only dispatch here when NOT editing. The editing-mode drag
    // grip calls into us intentionally, so no editingTextId early-return here.)
    setSelectedItemId(id);
    setSelectedItemType(type);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const np = getNormalizedPoint(clientX, clientY);
    const item = type === 'text'
      ? textBoxes.find(t => t.id === id)
      : images.find(i => i.id === id);
    if (item) {
      dragStartPxRef.current = { x: clientX, y: clientY };
      thresholdCrossedRef.current = false;
      setDragOffset({ x: np.x - item.x, y: np.y - item.y });
      setIsDragging(true); // state-based so global move/up listeners wire up
    }
  }, [getNormalizedPoint, textBoxes, images]);

  const handleItemPointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !selectedItemId) return;
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    // Gate actual movement on the threshold — ignore tiny finger jitter between
    // pointerDown and pointerUp so taps don't move the box.
    if (!thresholdCrossedRef.current && dragStartPxRef.current) {
      const dx = clientX - dragStartPxRef.current.x;
      const dy = clientY - dragStartPxRef.current.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      thresholdCrossedRef.current = true;
    }
    const np = getNormalizedPoint(clientX, clientY);
    const nx = np.x - dragOffset.x;
    const ny = np.y - dragOffset.y;

    if (selectedItemType === 'text') {
      setTextBoxes(prev => prev.map(tb => tb.id === selectedItemId ? { ...tb, x: nx, y: ny } : tb));
    } else {
      setImages(prev => prev.map(img => img.id === selectedItemId ? { ...img, x: nx, y: ny } : img));
      redrawAll();
    }
  }, [isDragging, selectedItemId, selectedItemType, dragOffset, getNormalizedPoint, redrawAll]);

  const handleItemPointerUp = useCallback(() => {
    // Only persist on a real drag — a tap that never crossed threshold shouldn't dirty the doc.
    if (isDragging && thresholdCrossedRef.current) triggerAutoSave();
    setIsDragging(false);
    dragStartPxRef.current = null;
    thresholdCrossedRef.current = false;
  }, [isDragging, triggerAutoSave]);

  // ── Text box resize (left/right edge handles like Notability) ──────────

  const handleTextResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, id: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizingText(true);
    setResizingTextId(id);
    setResizingTextEdge(handle);
    setSelectedItemId(id);
    setSelectedItemType('text');
  }, []);

  const handleTextResizeMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isResizingText || !resizingTextId || !resizingTextEdge) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const np = getNormalizedPoint(clientX, clientY);
    const handle = resizingTextEdge;

    setTextBoxes(prev => prev.map(tb => {
      if (tb.id !== resizingTextId) return tb;
      let { x, y, width, height } = tb;
      const minW = 0.08;
      const minH = 0.04;

      // Horizontal resize
      if (handle.includes('e')) {
        width = Math.max(minW, Math.min(np.x - x, 1 - x));
      }
      if (handle.includes('w')) {
        const oldRight = x + width;
        x = Math.max(0, Math.min(np.x, oldRight - minW));
        width = oldRight - x;
      }
      // Vertical resize
      if (handle.includes('s')) {
        height = Math.max(minH, np.y - y);
      }
      if (handle === 'n' || handle === 'ne' || handle === 'nw') {
        const oldBottom = y + height;
        y = Math.max(0, Math.min(np.y, oldBottom - minH));
        height = oldBottom - y;
      }

      return { ...tb, x, y, width, height };
    }));
  }, [isResizingText, resizingTextId, resizingTextEdge, getNormalizedPoint]);

  const handleTextResizeEnd = useCallback(() => {
    if (isResizingText) triggerAutoSave();
    setIsResizingText(false);
    setResizingTextId(null);
    setResizingTextEdge(null);
  }, [isResizingText, triggerAutoSave]);

  // ── Resize handle for images ───────────────────────────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, id: string, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedItemId(id);
    setSelectedItemType('image');
    setIsResizing(true);
    setResizeCorner(corner);
  }, []);

  const handleResizeMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isResizing || !selectedItemId) return;
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const np = getNormalizedPoint(clientX, clientY);

    setImages(prev => prev.map(img => {
      if (img.id !== selectedItemId) return img;
      const newW = Math.max(0.05, np.x - img.x);
      const newH = Math.max(0.05, np.y - img.y);
      return { ...img, width: newW, height: newH };
    }));
    redrawAll();
  }, [isResizing, selectedItemId, getNormalizedPoint, redrawAll]);

  const handleResizeEnd = useCallback(() => {
    if (isResizing) triggerAutoSave();
    setIsResizing(false);
    setResizeCorner(null);
  }, [isResizing, triggerAutoSave]);

  // Global move/resize handlers (items + text box resize)
  useEffect(() => {
    if (!isDragging && !isResizing && !isResizingText) return;
    const handleMove = (e: MouseEvent) => {
      if (isDragging) handleItemPointerMove(e as any);
      if (isResizing) handleResizeMove(e as any);
      if (isResizingText) handleTextResizeMove(e);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging || isResizing || isResizingText) {
        e.preventDefault(); // prevent native scroll while dragging/resizing
      }
      if (isDragging) handleItemPointerMove(e as any);
      if (isResizing) handleResizeMove(e as any);
      if (isResizingText) handleTextResizeMove(e);
    };
    const handleUp = () => {
      handleItemPointerUp();
      handleResizeEnd();
      handleTextResizeEnd();
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, isResizing, isResizingText, handleItemPointerMove, handleItemPointerUp, handleResizeMove, handleResizeEnd, handleTextResizeMove, handleTextResizeEnd]);

  // ── AI handler ──────────────────────────────────────────────────────────

  const handleAIAction = useCallback(async (actionId: string, sourceTextBoxId?: string) => {
    if (!onAIStream || aiLoading) return;
    const action = AI_ACTIONS.find(a => a.id === actionId);
    if (!action) return;

    setShowAIMenu(false);
    setAiLoading(true);

    // Use specific source text box if provided, otherwise gather all text
    const srcId = sourceTextBoxId || editingTextIdRef.current || selectedItemIdRef.current;
    const srcBox = srcId ? textBoxesRef.current.find(tb => tb.id === srcId) : null;

    let context: string;
    if (srcBox) {
      // Use the source text box content
      const tmp = document.createElement('div');
      tmp.innerHTML = srcBox.content;
      context = tmp.textContent || '';
    } else {
      // Fallback: gather all text
      const textContent = textBoxesRef.current
        .filter(tb => !tb.isAIReflection)
        .map(tb => tb.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
      context = [entryPlainText, textContent].filter(Boolean).join('\n') || 'No text content yet.';
    }

    const bibleInfo = bibleContext?.bookName && bibleContext?.chapter
      ? `\nCurrently reading: ${bibleContext.bookName} ${bibleContext.chapter}`
      : '';

    const prompt = action.prompt + context + bibleInfo;

    // Real rendered bottom of a text box — content may be taller than the stored `height`
    // (which is only updated to scrollHeight on an auto-fit pass after streaming).
    const renderedBottom = (tb: TextBox): number => {
      const el = contentEditableRefs.current.get(tb.id);
      const w = displayWidthRef.current;
      if (el && w > 0) {
        return tb.y + Math.max(el.scrollHeight, 24) / w;
      }
      return tb.y + (tb.height || 0.15);
    };

    // Position AI box below the source and below any AI siblings already generated from it,
    // so repeated AI actions on the same box stack vertically instead of overlapping.
    let aiY: number;
    let aiX: number;
    let aiW: number;
    if (srcBox) {
      let maxBottom = renderedBottom(srcBox);
      for (const tb of textBoxesRef.current) {
        if (tb.sourceId === srcBox.id) {
          const bottom = renderedBottom(tb);
          if (bottom > maxBottom) maxBottom = bottom;
        }
      }
      aiY = maxBottom + 0.01;
      aiX = srcBox.x;
      aiW = srcBox.width;
    } else {
      const maxY = Math.max(
        0.1,
        ...textBoxesRef.current.map(tb => renderedBottom(tb)),
        ...strokeDataRef.current.strokes.flatMap(s => s.points.map(p => p.y)),
      );
      aiY = maxY + 0.02;
      aiX = 0.05;
      aiW = 0.9;
    }

    const aiBox: TextBox = {
      id: genId(),
      x: aiX,
      y: Math.min(aiY, 0.9),
      width: aiW,
      height: 0.2,
      content: '',
      fontSize: 14,
      isAIReflection: true,
      sourceId: srcBox?.id || undefined,
      aiAction: actionId,
    };
    pushUndo();
    setTextBoxes(prev => [...prev, aiBox]);

    try {
      let accumulated = '';
      await onAIStream(prompt, (chunk) => {
        accumulated += chunk;
        const html = markdownToHtml(accumulated);
        // Persist to state
        setTextBoxes(prev => prev.map(tb =>
          tb.id === aiBox.id ? { ...tb, content: html } : tb
        ));
        // Imperatively update DOM — React doesn't re-render contentEditable innerHTML
        // after initial mount, so streaming chunks would otherwise stay invisible
        // until the view is closed and reopened.
        const el = contentEditableRefs.current.get(aiBox.id);
        if (el) el.innerHTML = html;
      });
      // Auto-fit AI box height after streaming completes
      setTimeout(() => {
        const el = contentEditableRefs.current.get(aiBox.id);
        if (el) {
          const w = displayWidthRef.current;
          const fittedH = w > 0 ? Math.max(el.scrollHeight, 24) / w : 0.2;
          setTextBoxes(prev => prev.map(tb =>
            tb.id === aiBox.id ? { ...tb, height: fittedH } : tb
          ));
        }
      }, 100);
      triggerAutoSave();
    } catch (err) {
      console.error('AI action failed:', err);
      setTextBoxes(prev => prev.map(tb =>
        tb.id === aiBox.id ? { ...tb, content: '(AI reflection failed. Please try again.)' } : tb
      ));
    } finally {
      setAiLoading(false);
    }
  }, [onAIStream, aiLoading, entryPlainText, bibleContext, pushUndo, triggerAutoSave]);

  // ── Done handler ───────────────────────────────────────────────────────

  const handleDone = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    // Sync any in-progress editing before saving
    if (editingTextId) {
      const el = contentEditableRefs.current.get(editingTextId);
      if (el) {
        // Directly update the ref to ensure save captures latest content
        textBoxesRef.current = textBoxesRef.current.map(tb =>
          tb.id === editingTextId ? { ...tb, content: el.innerHTML } : tb
        );
      }
    }
    const data: ExtendedCanvasData = {
      ...strokeDataRef.current,
      textBoxes: textBoxesRef.current,
      images: imagesRef.current,
      pageMode,
    };
    onSave(serializeExtended(data));
    onClose();
  }, [onSave, onClose, pageMode, editingTextId]);

  // Save current work, close the editor, then switch the host app's layout.
  const handleSwitchLayout = useCallback((mode: LayoutMode) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (editingTextId) {
      const el = contentEditableRefs.current.get(editingTextId);
      if (el) {
        textBoxesRef.current = textBoxesRef.current.map(tb =>
          tb.id === editingTextId ? { ...tb, content: el.innerHTML } : tb
        );
      }
    }
    const data: ExtendedCanvasData = {
      ...strokeDataRef.current,
      textBoxes: textBoxesRef.current,
      images: imagesRef.current,
      pageMode,
    };
    onSave(serializeExtended(data));
    onClose();
    onSwitchLayout?.(mode);
  }, [onSave, onClose, onSwitchLayout, pageMode, editingTextId]);

  // ── Export PDF ──────────────────────────────────────────────────────────

  const handleExportPDF = useCallback(() => {
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) return;

    // Create off-screen canvas for export
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w * 2;
    exportCanvas.height = h * 2;
    const ectx = exportCanvas.getContext('2d');
    if (!ectx) return;
    ectx.scale(2, 2);

    // Draw background
    drawPaperBackground(ectx, w, h, paperType);
    // Draw strokes
    renderAllStrokes(ectx, strokeDataRef.current, w, w); // use width for both

    // Open in new window for printing/saving
    const dataUrl = exportCanvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html><head><title>Journal Export</title>
        <style>body{margin:0;display:flex;justify-content:center;background:#f5f5f5}
        img{max-width:100%;height:auto}
        @media print{body{background:white}img{max-width:100%;page-break-inside:avoid}}</style>
        </head><body>
        <img src="${dataUrl}" />
        <script>setTimeout(()=>window.print(),500)<\/script>
        </body></html>
      `);
    }
    setShowMenu(false);
  }, [paperType]);

  // ── Tool config ────────────────────────────────────────────────────────

  const toolButtons: { tool: ActiveTool; label: string; icon: string }[] = [
    { tool: 'pointer', label: 'Pointer', icon: '👆' },
    { tool: 'lasso', label: selectionMode === 'lasso' ? 'Lasso Select' : 'Box Select', icon: selectionMode === 'lasso' ? '⭕' : '⬜' },
    { tool: 'pen', label: 'Pen', icon: '✏️' },
    { tool: 'marker', label: 'Marker', icon: '🖊️' },
    { tool: 'highlighter', label: 'Highlighter', icon: '🖍️' },
    { tool: 'eraser', label: 'Eraser', icon: '🧹' },
    { tool: 'text', label: 'Text', icon: 'Tt' },
  ];

  const getCursor = () => {
    switch (activeTool) {
      case 'pointer': return 'default';
      case 'eraser': return 'cell';
      case 'text': return 'text';
      case 'lasso': return lassoSelection ? 'move' : 'crosshair';
      default: return 'crosshair';
    }
  };

  const w = displayWidthRef.current;
  const h = displayHeightRef.current;
  const totalPagesDisplay = Math.max(1, Math.ceil(canvasHeight / PAGE_HEIGHT));

  // Single source of truth for the touch-action applied to the editor surface
  // and both canvases. Seamless mode needs native vertical pan so finger scroll
  // works while a drawing tool is selected (Notability-style). Palm rest is
  // handled separately at the JS level via:
  //   (a) radiusX > 25 heuristic at touchstart (see handleTouchStart), and
  //   (b) stylus-cancels-finger: when the Pencil's pointerdown fires during
  //       an active finger touch, the swipe state is cleared.
  // Drawing-tool classification is shared via isDrawingTool() so adding a
  // new tool needs a one-line edit, not three.
  const editorTouchAction: 'pan-y' | 'none' =
    pageMode === 'seamless' && (isApplePencilDevice || !isDrawingTool(activeTool))
      ? 'pan-y'
      : 'none';

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-white flex flex-col" style={{ touchAction: editorTouchAction, zIndex: 9998 }}
         onMouseMove={e => { if (isDragging) handleItemPointerMove(e); if (isResizing) handleResizeMove(e); }}
         onMouseUp={() => { handleItemPointerUp(); handleResizeEnd(); }}
         onTouchMove={e => { if (isDragging || isResizing) { e.preventDefault(); } if (isDragging) handleItemPointerMove(e); if (isResizing) handleResizeMove(e); }}
         onTouchEnd={() => { handleItemPointerUp(); handleResizeEnd(); }}
    >
      {/* Placeholder style for empty contentEditable */}
      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        /* Apply list styles whether the text box is in edit or display mode —
           gating on [contenteditable="true"] alone causes bullets/numbers to
           vanish when the user clicks Done. Target all text box nodes. */
        .notability-textbox ul,
        [contenteditable="true"] ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 0.25em 0;
        }
        .notability-textbox ol,
        [contenteditable="true"] ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 0.25em 0;
        }
        .notability-textbox li,
        [contenteditable="true"] li {
          list-style: inherit;
          display: list-item;
        }
      `}</style>
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect}
             style={{ position: 'fixed', top: '-10000px', left: '-10000px' }} />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-200 bg-white/95 backdrop-blur-sm shrink-0"
           style={{ height: '48px', paddingTop: 'env(safe-area-inset-top, 0px)', zIndex: 50, position: 'relative' }}>
        {/* Left: Done + Quick-switch to Bible / AI Chat / Study */}
        <div className="flex items-center gap-1">
          <button onClick={handleDone}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Done
          </button>
          {onSwitchLayout && (
            <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-slate-200">
              <button
                onClick={() => handleSwitchLayout('bible')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                title="Save and switch to Bible view"
                aria-label="Switch to Bible view"
                data-testid="notability-switch-bible"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span className="hidden sm:inline">Bible</span>
              </button>
              <button
                onClick={() => handleSwitchLayout('chat')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                title="Save and switch to AI Chat view"
                aria-label="Switch to AI Chat view"
                data-testid="notability-switch-chat"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="hidden sm:inline">Chat</span>
              </button>
              <button
                onClick={() => handleSwitchLayout('study')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                title="Save and switch to Study view"
                aria-label="Switch to Study view"
                data-testid="notability-switch-study"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                </svg>
                <span className="hidden sm:inline">Study</span>
              </button>
            </div>
          )}
        </div>

        {/* Center: Tools */}
        <div className="flex items-center gap-0.5">
          {toolButtons.map(({ tool, label, icon }) => (
            <div key={tool} className="relative">
              <button
                onClick={() => {
                  if (tool === 'lasso' && activeTool === 'lasso') {
                    // Already on select tool — toggle submenu
                    setShowSelectionSubmenu(!showSelectionSubmenu);
                  } else {
                    setActiveTool(tool);
                    setShowSelectionSubmenu(false);
                    if (tool !== 'lasso') { setLassoSelection(null); setLassoPoints([]); setRectStart(null); setRectEnd(null); }
                  }
                }}
                className={`px-2 py-1.5 rounded-lg transition-all ${
                  activeTool === tool ? 'bg-indigo-100 shadow-sm ring-1 ring-indigo-300' : 'hover:bg-slate-100'
                } ${tool === 'text' ? 'font-bold text-sm' : 'text-base'}`}
                title={label}>
                {icon}
              </button>
              {/* Selection mode submenu */}
              {tool === 'lasso' && showSelectionSubmenu && (
                <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[140px]">
                  <button onClick={() => { setSelectionMode('lasso'); setShowSelectionSubmenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                      selectionMode === 'lasso' ? 'text-indigo-600 font-medium' : 'text-slate-700'
                    }`}>
                    <span>⭕</span> Freeform
                    {selectionMode === 'lasso' && <span className="ml-auto text-indigo-500">✓</span>}
                  </button>
                  <button onClick={() => { setSelectionMode('rectangle'); setShowSelectionSubmenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                      selectionMode === 'rectangle' ? 'text-indigo-600 font-medium' : 'text-slate-700'
                    }`}>
                    <span>⬜</span> Rectangle
                    {selectionMode === 'rectangle' && <span className="ml-auto text-indigo-500">✓</span>}
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Layer toggle — visible when drawing tools active */}
          {(activeTool === 'pen' || activeTool === 'marker' || activeTool === 'highlighter') && (
            <button
              onClick={() => setDrawingLayer(prev => prev === 'below' ? 'above' : 'below')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ml-1 ${
                drawingLayer === 'above'
                  ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
              title={drawingLayer === 'above' ? 'Drawing above text' : 'Drawing below text'}
            >
              {drawingLayer === 'above' ? '↑Txt' : '↓Txt'}
            </button>
          )}
        </div>

        {/* Right: Undo, Redo, Color, Size, Menu */}
        <div className="flex items-center gap-1">
          <button onClick={handleUndo} className="p-1.5 rounded-lg hover:bg-slate-100" title="Undo">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
            </svg>
          </button>
          <button onClick={handleRedo} className="p-1.5 rounded-lg hover:bg-slate-100" title="Redo">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
            </svg>
          </button>

          {/* Color */}
          <div className="relative">
            <button onClick={() => { setShowColorPicker(!showColorPicker); setShowMenu(false); setShowSizeSlider(false); }}
              className="w-7 h-7 rounded-full border-2 border-slate-300 shadow-sm hover:scale-110 transition-transform"
              style={{ backgroundColor: activeColor }} title="Color" />
            {showColorPicker && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-slate-200 p-3 z-50" style={{ width: '220px' }}>
                <div className="grid grid-cols-6 gap-1.5 mb-2">
                  {PEN_COLORS.map(c => (
                    <button key={c} onClick={() => { setActiveColor(c); setShowColorPicker(false); }}
                      className={`w-7 h-7 rounded-full border-2 hover:scale-110 transition-transform ${
                        c === activeColor ? 'border-indigo-500 scale-125 ring-2 ring-indigo-300' : 'border-slate-200'
                      }`} style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="border-t border-slate-100 pt-2 flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custom</label>
                  <input type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                  <span className="text-[11px] text-slate-500 font-mono">{activeColor}</span>
                </div>
              </div>
            )}
          </div>

          {/* Size */}
          <div className="relative">
            <button onClick={() => { setShowSizeSlider(!showSizeSlider); setShowColorPicker(false); setShowMenu(false); }}
              className="flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-slate-100" title={`Size: ${activeSize}`}>
              <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="4" y1="20" x2="20" y2="4" strokeLinecap="round" strokeWidth={activeSize * 1.5} />
              </svg>
              <span className="text-[10px] text-slate-500 font-medium">{activeSize}</span>
            </button>
            {showSizeSlider && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-slate-200 p-3 z-50 w-[180px]">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pen Size</div>
                <input type="range" min={MIN_SIZE} max={MAX_SIZE} step={0.5} value={activeSize}
                  onChange={e => setActiveSize(parseFloat(e.target.value))} className="w-full accent-indigo-500" />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Fine</span><span>{activeSize}</span><span>Thick</span>
                </div>
              </div>
            )}
          </div>

          {/* AI button */}
          {onAIStream && (
            <div className="relative">
              <button onClick={() => { setShowAIMenu(!showAIMenu); closeAllPopups(); }}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                  aiLoading ? 'bg-purple-100 text-purple-500 animate-pulse' : 'hover:bg-purple-50 text-purple-600'
                }`} title="AI Actions">
                AI
              </button>
              {showAIMenu && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 min-w-[180px]">
                  {AI_ACTIONS.map(action => (
                    <button key={action.id} onClick={() => handleAIAction(action.id)}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-purple-50 transition-colors">
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ··· Menu */}
          <div className="relative">
            <button onClick={() => { setShowMenu(!showMenu); setShowColorPicker(false); setShowSizeSlider(false); setShowAIMenu(false); }}
              className="p-1.5 rounded-lg hover:bg-slate-100" title="Menu" data-testid="notability-menu-button">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 min-w-[200px]">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Paper</div>
                {(['plain', 'ruled', 'grid'] as PaperType[]).map(pt => (
                  <button key={pt} onClick={() => { setPaperType(pt); setShowMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${
                      paperType === pt ? 'text-indigo-600 font-medium' : 'text-slate-700'
                    }`}>
                    <span>{pt === 'plain' ? '📄 Plain' : pt === 'ruled' ? '📝 Ruled' : '📐 Grid'}</span>
                    {paperType === pt && <span className="text-indigo-500">✓</span>}
                  </button>
                ))}
                <div className="h-[1px] bg-slate-100 my-1" />
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page Mode</div>
                {(['seamless', 'single'] as const).map(pm => (
                  <button key={pm} data-testid={`page-mode-${pm}`} onClick={() => { setPageMode(pm); setShowMenu(false); triggerAutoSave(); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${
                      pageMode === pm ? 'text-indigo-600 font-medium' : 'text-slate-700'
                    }`}>
                    <span>{pm === 'seamless' ? '📜 Seamless' : '📄 Single Page'}</span>
                    {pageMode === pm && <span className="text-indigo-500">✓</span>}
                  </button>
                ))}
                <div className="h-[1px] bg-slate-100 my-1" />
                <button onClick={() => { fileInputRef.current?.click(); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">📷 Insert Photo</button>
                <button onClick={() => { handleExportPDF(); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">📄 Export PDF</button>
                <div className="h-[1px] bg-slate-100 my-1" />
                <button onClick={() => {
                  pushUndo();
                  strokeDataRef.current = { ...createEmptyCanvasData(paperType), textBoxes: [], images: [] };
                  setTextBoxes([]);
                  setImages([]);
                  redrawAll();
                  triggerAutoSave();
                  setShowMenu(false);
                }} className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50">🗑️ Clear All</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Canvas Area ─────────────────────────────────────────────────── */}
      <div ref={scrollContainerRef}
           className="flex-1 overflow-x-hidden"
           style={{
             WebkitOverflowScrolling: 'touch',
             overflowY: pageMode === 'single' ? 'hidden' : 'auto',
           }}
           onClick={closeAllPopups}>
        {/*
          Single-page mode uses TWO nested transforms so a page flip doesn't
          also animate the vertical jump between pages:
            - outer: translateY to the current page's stack position (no transition — instant jump)
            - inner: translateX for the live swipe offset (transitions back to 0 on release)
          The previous single-transform form caused horizontal swipes to look
          vertical because translateY changed at the same time as translateX
          and both interpolated through the same 0.3s easing.
        */}
        <div data-testid="page-stack-outer" className="relative w-full" style={{
          height: `${canvasHeight}px`,
          ...(pageMode === 'single' ? {
            transform: `translateY(-${currentPage * PAGE_HEIGHT}px)`,
            transition: 'none',
          } : {}),
        }}>
        <div data-testid="page-stack-swipe" className="relative w-full" style={pageMode === 'single' ? {
          height: `${canvasHeight}px`,
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? 'transform 0.3s ease-out' : 'none',
        } : { height: `${canvasHeight}px` }}>
          {/* Background canvas */}
          <canvas ref={bgCanvasRef} className="absolute inset-0"
            style={{ width: '100%', height: `${canvasHeight}px`, pointerEvents: 'none' }} />
          {/* Drawing canvas (below text boxes) */}
          <canvas ref={canvasRef} className="absolute inset-0"
            style={{
              width: '100%', height: `${canvasHeight}px`,
              touchAction: editorTouchAction,
              WebkitTouchCallout: 'none', WebkitUserSelect: 'none',
              userSelect: 'none', cursor: getCursor(),
              // Disable pointer events when editing text, or when drawing on the above layer
              pointerEvents: (activeTool === 'text' && editingTextId) || (drawingLayer === 'above' && activeTool !== 'pointer' && activeTool !== 'text') ? 'none' : 'auto',
            }} />

          {/* ── AI source link connectors ────────────────────────────── */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}>
            {textBoxes.filter(tb => tb.isAIReflection && tb.sourceId).map(aiTb => {
              const src = textBoxes.find(s => s.id === aiTb.sourceId);
              if (!src) return null;
              const srcCenterX = (src.x + src.width / 2) * (w || 1);
              const srcBottomY = (src.y + (src.height || 0.15)) * (w || 1);
              const aiCenterX = (aiTb.x + aiTb.width / 2) * (w || 1);
              const aiTopY = aiTb.y * (w || 1);
              return (
                <g key={`link-${aiTb.id}`}>
                  <line
                    x1={srcCenterX} y1={srcBottomY}
                    x2={aiCenterX} y2={aiTopY}
                    stroke="#a78bfa" strokeWidth={2} strokeDasharray="6 3" opacity={0.6}
                  />
                  <circle cx={srcCenterX} cy={srcBottomY} r={4} fill="#a78bfa" opacity={0.6} />
                  <circle cx={aiCenterX} cy={aiTopY} r={4} fill="#a78bfa" opacity={0.6} />
                </g>
              );
            })}
          </svg>

          {/* ── Text Boxes (Rich text with contentEditable) ────────────── */}
          {textBoxes.map(tb => {
            const isEditing = editingTextId === tb.id;
            const isSelected = selectedItemId === tb.id && selectedItemType === 'text';
            const tbW = tb.width * 100;
            const tbH = (tb.height || 0.15) * (w || 1);
            const tbTop = tb.y * (w || 1);
            // Scale font size proportionally to canvas width so text wraps
            // consistently across devices (reference width: 700px)
            const refWidth = 700;
            const fontScale = Math.min(1, (w || refWidth) / refWidth);
            const scaledFontSize = Math.round((tb.fontSize || 16) * fontScale);
            return (
              <div key={tb.id}
                data-textbox-id={tb.id}
                style={{
                  position: 'absolute',
                  left: `${tb.x * 100}%`,
                  top: `${tbTop}px`,
                  width: `${tbW}%`,
                  minHeight: `${tbH}px`,
                  zIndex: 5 + (tb.zOrder || 0),
                  // In pointer mode (not editing), the text box is transparent to touches —
                  // they fall through to the canvas, which handles swipe / scroll / tap.
                  // A tap that lands on a text box is detected there and enters edit mode.
                  // Once editing, pointer-events return so the user can actually type /
                  // interact with the resize handles & drag grip.
                  pointerEvents: activeTool === 'pointer' && !isEditing ? 'none' : 'auto',
                  // In non-pointer tools, capture the touch (touchAction:none); in pointer
                  // mode the pan-y is redundant (pointerEvents:none already passes through)
                  // but kept for consistency when editing (pointerEvents:auto case).
                  touchAction: activeTool === 'pointer' ? 'pan-y' : 'none',
                }}
              >
                {/* Rich text contentEditable div */}
                <div
                  ref={el => {
                    if (el) {
                      contentEditableRefs.current.set(tb.id, el);
                      // Set initial content only when the element is first mounted.
                      // Convert any raw markdown that snuck in from earlier sessions.
                      if (el.innerHTML === '' && tb.content) {
                        el.innerHTML = maybeConvertMarkdown(tb.content);
                      }
                    } else {
                      contentEditableRefs.current.delete(tb.id);
                    }
                  }}
                  contentEditable={isEditing}
                  suppressContentEditableWarning
                  className="notability-textbox"
                  data-placeholder="Type here..."
                  onFocus={() => {
                    setEditingTextId(tb.id);
                    setSelectedItemId(tb.id);
                    setSelectedItemType('text');
                  }}
                  onBlur={() => {
                    syncContentFromRef(tb.id);
                    // Don't close editing mode here — click-outside handler does that.
                    // This prevents iOS touch-triggered blur from killing the toolbar.
                  }}
                  onInput={() => handleTextInput(tb.id)}
                  onPaste={e => {
                    // Always intercept paste: convert markdown to formatted HTML,
                    // and strip arbitrary HTML from clipboard sources (Word, web pages)
                    // to plain text so it doesn't drag in foreign styles or scripts.
                    e.preventDefault();
                    const cd = e.clipboardData;
                    if (!cd) return;
                    const text = cd.getData('text/plain');
                    if (!text) return;
                    const html = looksLikeMarkdown(text)
                      ? markdownToHtml(text)
                      : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                    document.execCommand('insertHTML', false, html);
                    // Auto-fit width to (almost) the full page on paste so a long block of
                    // text isn't crammed into a narrow column and stretched into a giant tower.
                    // Height keeps auto-fitting to content; the user can then shrink either
                    // dimension manually via the corner handles (visible while editing).
                    const PAGE_MARGIN = 0.05;
                    const pageWidth = 1 - 2 * PAGE_MARGIN;
                    if (tb.width < pageWidth) {
                      updateTextBox(tb.id, { x: PAGE_MARGIN, width: pageWidth });
                    }
                    handleTextInput(tb.id);
                  }}
                  onSelect={saveSelection}
                  onKeyUp={saveSelection}
                  onMouseUp={saveSelection}
                  onKeyDown={e => { if (e.key === 'Escape') closeEditing(); }}
                  onPointerDownCapture={e => {
                    // iOS Scribble activates from pointerdown with pointerType='pen', NOT from
                    // touchstart — so preventing touchstart alone isn't enough. In text/pointer
                    // modes the text box is never meant to accept handwriting input, so block
                    // pencil pointerdown at the capture phase. Drag in pointer mode continues to
                    // work because touchstart fires separately on iOS.
                    const tool = toolRef.current;
                    if (e.pointerType === 'pen' && (tool === 'text' || tool === 'pointer')) {
                      e.preventDefault();
                    }
                  }}
                  onMouseDown={e => {
                    // In pointer mode the text-box surface is inert so reading / page flips
                    // aren't hijacked by accidental drags. To move the box, enter edit mode
                    // (double-tap) and use the grip handle, or switch to a drawing/text tool.
                    if (toolRef.current === 'pointer') return;
                    if (!isEditing) { e.preventDefault(); handleItemPointerDown(e, tb.id, 'text'); }
                  }}
                  onTouchStart={e => {
                    const nt = e.nativeEvent.touches[0];
                    // Text mode is keyboard-only — block pencil (incl. Scribble) on the text box.
                    if (toolRef.current === 'text' && nt && isStylusTouch(nt)) {
                      e.preventDefault();
                      return;
                    }
                    // In pointer mode: don't start a drag; let the scroll / page-flip gesture
                    // pass through to the scroll container.
                    if (toolRef.current === 'pointer') return;
                    // Always preventDefault when not editing to block iOS Scribble (Apple Pencil
                    // handwriting-to-text) from activating on the contentEditable surface.
                    if (!isEditing) { e.preventDefault(); handleItemPointerDown(e, tb.id, 'text'); }
                  }}
                  onDoubleClick={() => setEditingTextId(tb.id)}
                  style={{
                    width: '100%',
                    border: isEditing ? '2px solid #4f46e5'
                      : isSelected ? '2px dashed #4f46e5'
                      : tb.isAIReflection ? '1px solid #c4b5fd'
                      : '1px solid transparent',
                    borderRadius: 4,
                    padding: '6px 8px',
                    background: tb.isAIReflection ? 'rgba(238, 235, 255, 0.25)' : 'transparent',
                    fontSize: scaledFontSize,
                    lineHeight: '1.6',
                    fontFamily: tb.fontFamily || TEXT_FONTS[0].value,
                    color: tb.textColor || '#000000',
                    textAlign: (tb.textAlign || 'left') as React.CSSProperties['textAlign'],
                    fontStyle: tb.isAIReflection ? 'italic' : 'normal',
                    outline: 'none',
                    overflow: 'hidden',
                    cursor: isEditing ? 'text' : 'move',
                    boxShadow: isSelected || isEditing ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    minHeight: 24,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    WebkitUserSelect: isEditing ? 'text' : 'none',
                    userSelect: isEditing ? 'text' : 'none',
                  }}
                />

                {/* AI badge — shows which AI action produced this box */}
                {tb.isAIReflection && !isEditing && (() => {
                  const action = tb.aiAction ? AI_ACTIONS.find(a => a.id === tb.aiAction) : null;
                  // Strip the leading emoji + space from the action label (e.g. "📖 Scripture" → "Scripture")
                  const actionName = action?.label.replace(/^\p{Extended_Pictographic}\s*/u, '') || '';
                  return (
                    <div style={{
                      position: 'absolute', top: -10, left: 8,
                      background: '#7c3aed', color: 'white',
                      fontSize: 9, fontWeight: 600,
                      padding: '1px 6px', borderRadius: 4,
                      letterSpacing: 0.5, zIndex: 10,
                      whiteSpace: 'nowrap',
                    }}>{actionName ? `AI · ${actionName}` : 'AI'}</div>
                  );
                })()}

                {/* ── Floating Text Formatting Toolbar (Notability-style) ── */}
                {isEditing && (
                  <div
                    onMouseDown={e => { e.stopPropagation(); isToolbarActionRef.current = true; }}
                    onTouchStart={e => { e.stopPropagation(); isToolbarActionRef.current = true; }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      right: 0,
                      marginBottom: 6,
                      background: 'white',
                      borderRadius: 8,
                      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                      padding: '4px 6px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 2,
                      zIndex: 20,
                      fontSize: 13,
                      minWidth: 320,
                    }}
                  >
                    {/* Font family */}
                    <div style={{ position: 'relative' }}>
                      <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setShowFontPicker(!showFontPicker)}
                        style={{
                          padding: '3px 8px', borderRadius: 4,
                          border: '1px solid #ddd', background: showFontPicker ? '#eef' : '#f8f8f8',
                          fontSize: 12, cursor: 'pointer', maxWidth: 90,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {TEXT_FONTS.find(f => f.value === (tb.fontFamily || TEXT_FONTS[0].value))?.label || 'Font'}
                      </button>
                      {showFontPicker && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, marginTop: 4,
                          background: 'white', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          zIndex: 25, minWidth: 160, maxHeight: 200, overflowY: 'auto',
                        }}>
                          {TEXT_FONTS.map(f => (
                            <button key={f.label}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                execFormat('fontName', f.value);
                                updateTextBox(tb.id, { fontFamily: f.value });
                                setShowFontPicker(false);
                              }}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '6px 12px', border: 'none', background: 'none',
                                cursor: 'pointer', fontFamily: f.value, fontSize: 14,
                                backgroundColor: f.value === (tb.fontFamily || TEXT_FONTS[0].value) ? '#eef2ff' : 'transparent',
                              }}
                            >{f.label}</button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div style={{ width: 1, height: 20, background: '#ddd' }} />

                    {/* Font size */}
                    <button onMouseDown={e => e.preventDefault()} onClick={() => updateTextBox(tb.id, { fontSize: Math.max(8, (tb.fontSize || 16) - 2) })}
                      style={{ padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', fontSize: 13 }}>−</button>
                    <div style={{ position: 'relative' }}>
                      <button onMouseDown={e => e.preventDefault()} onClick={() => setShowFontSizePicker(!showFontSizePicker)}
                        style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 4, background: showFontSizePicker ? '#eef' : '#f8f8f8', cursor: 'pointer', fontSize: 13, minWidth: 30, textAlign: 'center' }}>
                        {tb.fontSize || 16}
                      </button>
                      {showFontSizePicker && (
                        <div style={{
                          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                          marginTop: 4, background: 'white', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          zIndex: 25, maxHeight: 180, overflowY: 'auto',
                        }}>
                          {TEXT_SIZES.map(s => (
                            <button key={s}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { execFormat('fontSize', '7'); document.querySelectorAll('font[size="7"]').forEach(el => { (el as HTMLElement).removeAttribute('size'); (el as HTMLElement).style.fontSize = `${s}px`; }); updateTextBox(tb.id, { fontSize: s }); setShowFontSizePicker(false); }}
                              style={{
                                display: 'block', width: '100%', padding: '4px 16px',
                                border: 'none', background: s === (tb.fontSize || 16) ? '#eef2ff' : 'none',
                                cursor: 'pointer', fontSize: 13, textAlign: 'center',
                              }}>{s}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onMouseDown={e => e.preventDefault()} onClick={() => updateTextBox(tb.id, { fontSize: Math.min(96, (tb.fontSize || 16) + 2) })}
                      style={{ padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', fontSize: 13 }}>+</button>

                    {/* Divider */}
                    <div style={{ width: 1, height: 20, background: '#ddd' }} />

                    {/* Text color */}
                    <div style={{ position: 'relative' }}>
                      <button onMouseDown={e => e.preventDefault()} onClick={() => setShowTextColorPicker(!showTextColorPicker)}
                        style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #ddd', background: tb.textColor || '#000', cursor: 'pointer' }} />
                      {showTextColorPicker && (
                        <div style={{
                          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                          marginTop: 4, background: 'white', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          zIndex: 25, padding: 6, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
                        }}>
                          {TEXT_COLORS.map(c => (
                            <button key={c}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { execFormat('foreColor', c); updateTextBox(tb.id, { textColor: c }); setShowTextColorPicker(false); }}
                              style={{
                                width: 24, height: 24, borderRadius: '50%', border: c === (tb.textColor || '#000000') ? '2px solid #4f46e5' : '1px solid #ccc',
                                background: c, cursor: 'pointer',
                              }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div style={{ width: 1, height: 20, background: '#ddd' }} />

                    {/* Bold / Italic / Underline / Strikethrough */}
                    <button onMouseDown={e => e.preventDefault()} onClick={() => execFormat('bold')}
                      style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}>B</button>
                    <button onMouseDown={e => e.preventDefault()} onClick={() => execFormat('italic')}
                      style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', fontStyle: 'italic', fontSize: 14 }}>I</button>
                    <button onMouseDown={e => e.preventDefault()} onClick={() => execFormat('underline')}
                      style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', textDecoration: 'underline', fontSize: 14 }}>U</button>
                    <button onMouseDown={e => e.preventDefault()} onClick={() => execFormat('strikeThrough')}
                      style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', textDecoration: 'line-through', fontSize: 14 }}>S</button>

                    {/* Divider */}
                    <div style={{ width: 1, height: 20, background: '#ddd' }} />

                    {/* Highlighter */}
                    <div style={{ position: 'relative' }}>
                      <button onMouseDown={e => e.preventDefault()} onClick={() => setShowHighlightColorPicker(!showHighlightColorPicker)}
                        title="Highlight"
                        style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 4, background: showHighlightColorPicker ? '#eef' : '#f8f8f8', cursor: 'pointer', fontSize: 13 }}>
                        <span style={{ background: '#FFFF00', padding: '0 2px', borderRadius: 2 }}>H</span>
                      </button>
                      {showHighlightColorPicker && (
                        <div onMouseDown={e => e.preventDefault()} style={{
                          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                          marginTop: 4, background: 'white', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          zIndex: 25, padding: 6, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
                        }}>
                          {/* No highlight (remove) */}
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { execFormat('removeFormat'); setShowHighlightColorPicker(false); }}
                            title="Remove highlight"
                            style={{
                              width: 24, height: 24, borderRadius: '50%', border: '1px solid #ccc',
                              background: 'white', cursor: 'pointer', fontSize: 10, lineHeight: '22px', textAlign: 'center',
                            }}>x</button>
                          {['#FFFF00', '#00FF00', '#00FFFF', '#FF69B4', '#FFA500', '#FF6347', '#DDA0DD', '#87CEEB',
                            '#98FB98', '#FFD700', '#F0E68C', '#E6E6FA', '#FFDAB9', '#FFB6C1', '#B0E0E6'].map(c => (
                            <button key={c}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { execFormat('hiliteColor', c); setShowHighlightColorPicker(false); }}
                              style={{
                                width: 24, height: 24, borderRadius: '50%', border: '1px solid #ccc',
                                background: c, cursor: 'pointer',
                              }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div style={{ width: 1, height: 20, background: '#ddd' }} />

                    {/* Alignment */}
                    <button onMouseDown={e => e.preventDefault()} onClick={() => updateTextBox(tb.id, { textAlign: 'left' })}
                      style={{ padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, background: (tb.textAlign || 'left') === 'left' ? '#e0e7ff' : '#f8f8f8', cursor: 'pointer', fontSize: 12 }}>≡←</button>
                    <button onMouseDown={e => e.preventDefault()} onClick={() => updateTextBox(tb.id, { textAlign: 'center' })}
                      style={{ padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, background: tb.textAlign === 'center' ? '#e0e7ff' : '#f8f8f8', cursor: 'pointer', fontSize: 12 }}>≡↔</button>
                    <button onMouseDown={e => e.preventDefault()} onClick={() => updateTextBox(tb.id, { textAlign: 'right' })}
                      style={{ padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, background: tb.textAlign === 'right' ? '#e0e7ff' : '#f8f8f8', cursor: 'pointer', fontSize: 12 }}>≡→</button>

                    {/* Divider */}
                    <div style={{ width: 1, height: 20, background: '#ddd' }} />

                    {/* Lists */}
                    <button onMouseDown={e => e.preventDefault()} onClick={() => execFormat('insertUnorderedList')}
                      title="Bullet List"
                      style={{ padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', fontSize: 13 }}>•≡</button>
                    <button onMouseDown={e => e.preventDefault()} onClick={() => execFormat('insertOrderedList')}
                      title="Numbered List"
                      style={{ padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', fontSize: 13 }}>1.</button>

                    {/* Divider */}
                    <div style={{ width: 1, height: 20, background: '#ddd' }} />

                    {/* Layer controls */}
                    <button onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        const maxZ = Math.max(0, ...textBoxes.map(t => t.zOrder || 0));
                        updateTextBox(tb.id, { zOrder: maxZ + 1 });
                      }}
                      title="Bring to Front"
                      style={{ padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', fontSize: 11 }}>↑F</button>
                    <button onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        const minZ = Math.min(0, ...textBoxes.map(t => t.zOrder || 0));
                        updateTextBox(tb.id, { zOrder: minZ - 1 });
                      }}
                      title="Send to Back"
                      style={{ padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, background: '#f8f8f8', cursor: 'pointer', fontSize: 11 }}>↓B</button>

                    {/* AI actions in toolbar */}
                    {onAIStream && !tb.isAIReflection && (
                      <>
                        <div style={{ width: 1, height: 20, background: '#ddd' }} />
                        {AI_ACTIONS.map(action => (
                          <button key={action.id}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => handleAIAction(action.id, tb.id)}
                            disabled={aiLoading}
                            title={action.label}
                            style={{
                              padding: '2px 6px', border: '1px solid #ddd', borderRadius: 4,
                              background: aiLoading ? '#f3e8ff' : '#f8f8f8',
                              cursor: aiLoading ? 'wait' : 'pointer', fontSize: 11,
                              color: '#7c3aed', fontWeight: 500,
                              opacity: aiLoading ? 0.6 : 1,
                            }}>
                            {action.label.split(' ')[0]} {action.label.split(' ').slice(1).join(' ')}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Resize handles. Shown both when the box is selected AND while it's being
                    edited — editing auto-fits height, but a paste of huge content can blow the
                    box up so the user needs to manually shrink/resize without first dismissing. */}
                {isSelected && (
                  <>
                    {/* 4 corner handles. Touch target is 44x44 (Apple's HIG minimum) but the
                        visible dot is small (18px) so it doesn't cover content. The wrapper is
                        transparent and catches the touch; the inner dot is purely visual. */}
                    {(['nw', 'ne', 'sw', 'se'] as const).map(corner => (
                      <div key={corner}
                        style={{
                          position: 'absolute',
                          width: 44, height: 44,
                          zIndex: 8,
                          cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          touchAction: 'none',
                          ...(corner.includes('n') ? { top: -22 } : { bottom: -22 }),
                          ...(corner.includes('w') ? { left: -22 } : { right: -22 }),
                        }}
                        onMouseDown={e => handleTextResizeStart(e, tb.id, corner)}
                        onTouchStart={e => handleTextResizeStart(e, tb.id, corner)}
                      >
                        <div style={{
                          width: 18, height: 18,
                          background: '#4f46e5', borderRadius: '50%', border: '2px solid white',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                          pointerEvents: 'none',
                        }} />
                      </div>
                    ))}
                    {/* 4 edge midpoint handles — same 44px touch target pattern. */}
                    {(['n', 's', 'w', 'e'] as const).map(edge => {
                      const horiz = edge === 'w' || edge === 'e';
                      const wrapStyle: React.CSSProperties = {
                        position: 'absolute',
                        width: 44, height: 44,
                        zIndex: 8,
                        cursor: horiz ? 'ew-resize' : 'ns-resize',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        touchAction: 'none',
                      };
                      if (edge === 'n') { wrapStyle.top = -22; wrapStyle.left = '50%'; wrapStyle.transform = 'translateX(-50%)'; }
                      if (edge === 's') { wrapStyle.bottom = -22; wrapStyle.left = '50%'; wrapStyle.transform = 'translateX(-50%)'; }
                      if (edge === 'w') { wrapStyle.left = -22; wrapStyle.top = '50%'; wrapStyle.transform = 'translateY(-50%)'; }
                      if (edge === 'e') { wrapStyle.right = -22; wrapStyle.top = '50%'; wrapStyle.transform = 'translateY(-50%)'; }
                      return (
                        <div key={edge}
                          style={wrapStyle}
                          onMouseDown={e => handleTextResizeStart(e, tb.id, edge)}
                          onTouchStart={e => handleTextResizeStart(e, tb.id, edge)}
                        >
                          <div style={{
                            width: horiz ? 6 : 18, height: horiz ? 18 : 6,
                            background: '#4f46e5', borderRadius: 6, border: '2px solid white',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                            pointerEvents: 'none',
                          }} />
                        </div>
                      );
                    })}
                    {/* Delete button */}
                    <button
                      style={{
                        position: 'absolute', right: -12, top: -12,
                        width: 24, height: 24,
                        background: '#ef4444', color: 'white', borderRadius: '50%', border: 'none',
                        fontSize: 14, cursor: 'pointer', zIndex: 9,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onClick={(e) => { e.stopPropagation(); deleteTextBox(tb.id); }}
                    >×</button>
                    {/* Drag grip — lets the user MOVE the box from inside edit mode
                        (text-surface drag is disabled in pointer mode to protect scrolling).
                        Top-left corner, opposite the delete button. */}
                    {isEditing && (
                      <div
                        aria-label="Drag to move text box"
                        style={{
                          position: 'absolute', left: -22, top: -22,
                          width: 44, height: 44, zIndex: 9,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'move', touchAction: 'none',
                        }}
                        // setPointerCapture on pointerdown so the pen's follow-up events
                        // stay on the grip instead of leaking to the canvas underneath.
                        // The pointerdown arrives independently of the touchstart path
                        // that actually starts the drag, so having both is fine — the
                        // capture just ensures no pen pointermove reaches the canvas
                        // listener once this grip has been grabbed.
                        onPointerDown={e => {
                          e.stopPropagation();
                          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
                        }}
                        onMouseDown={e => {
                          e.stopPropagation(); e.preventDefault();
                          handleItemPointerDown(e, tb.id, 'text');
                        }}
                        onTouchStart={e => {
                          e.stopPropagation(); e.preventDefault();
                          handleItemPointerDown(e, tb.id, 'text');
                        }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: 6,
                          background: '#4f46e5', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                          pointerEvents: 'none',
                          lineHeight: 1,
                        }}>⠿</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* ── Images (HTML overlay with handles) ─────────────────────── */}
          {images.map(img => {
            const isSelected = selectedItemId === img.id && selectedItemType === 'image';
            return (
              <div key={img.id}
                style={{
                  position: 'absolute',
                  left: `${img.x * 100}%`,
                  top: `${img.y * (w || 1)}px`,
                  width: `${img.width * 100}%`,
                  height: `${img.height * (w || 1)}px`,
                  zIndex: 4,
                  border: isSelected ? '2px solid #4f46e5' : '1px solid transparent',
                  cursor: 'move',
                  transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined,
                  touchAction: 'none',
                }}
                onMouseDown={e => handleItemPointerDown(e, img.id, 'image')}
                onTouchStart={e => handleItemPointerDown(e, img.id, 'image')}
                onDoubleClick={() => { setSelectedItemId(img.id); setSelectedItemType('image'); }}
              >
                <img src={img.src} alt="" draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                {isSelected && (
                  <>
                    {/* Resize handle - bottom right */}
                    <div style={{
                      position: 'absolute', right: -6, bottom: -6, width: 12, height: 12,
                      background: '#4f46e5', borderRadius: '50%', cursor: 'se-resize', zIndex: 6,
                    }}
                    onMouseDown={e => handleResizeStart(e, img.id, 'se')}
                    onTouchStart={e => handleResizeStart(e, img.id, 'se')} />
                    {/* Delete button */}
                    <button style={{
                      position: 'absolute', top: -12, right: -12, width: 24, height: 24,
                      background: '#ef4444', color: 'white', borderRadius: '50%', border: 'none',
                      fontSize: 14, cursor: 'pointer', zIndex: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }} onClick={() => deleteImage(img.id)}>×</button>
                  </>
                )}
              </div>
            );
          })}

          {/* ── Overlay canvas (above-text strokes) ────────────────── */}
          <canvas ref={overlayCanvasRef} className="absolute inset-0"
            style={{
              width: '100%', height: `${canvasHeight}px`,
              zIndex: 10,
              touchAction: editorTouchAction,
              WebkitTouchCallout: 'none', WebkitUserSelect: 'none',
              userSelect: 'none',
              cursor: getCursor(),
              // Only receive pointer events when drawing on the above layer
              pointerEvents: drawingLayer === 'above' && !editingTextId && activeTool !== 'text' && activeTool !== 'pointer' ? 'auto' : 'none',
            }} />

          {/* ── Page break lines (seamless mode, like Notability) ─────── */}
          {pageMode === 'seamless' && Array.from({ length: totalPagesDisplay - 1 }, (_, i) => (
            <div key={`page-${i}`} style={{
              position: 'absolute', right: 8, top: (i + 1) * PAGE_HEIGHT - 24,
              background: 'rgba(255,255,255,0.8)', padding: '2px 8px', borderRadius: 4,
              fontSize: 11, color: '#94A3B8', zIndex: 3,
            }}>
              Page {i + 1}
            </div>
          ))}
        </div>
        </div>

        {/* ── Floating page indicator (Notability-style: appears on scroll, fades out) */}
        <div style={{
          position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(0,0,0,0.6)', color: 'white', padding: '6px 14px',
          borderRadius: 20, fontSize: 13, fontWeight: 500, zIndex: 20,
          opacity: showPageIndicator ? 1 : 0,
          transition: 'opacity 0.3s ease-out',
          pointerEvents: 'none',
        }}>
          {currentPage + 1} / {totalPagesDisplay}
        </div>
      </div>

      {/* ── Slash command menu ── */}
      {slashMenuVisible && editingTextId && (
        <div
          style={{
            position: 'fixed',
            top: slashMenuPos.top,
            left: slashMenuPos.left,
            background: 'white',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            zIndex: 10000,
            minWidth: 220,
            maxHeight: 260,
            overflowY: 'auto',
            padding: '4px 0',
          }}
          onMouseDown={e => e.preventDefault()}
          onTouchStart={e => e.preventDefault()}
        >
          <div style={{ padding: '4px 12px', fontSize: 11, color: '#888', borderBottom: '1px solid #eee', marginBottom: 2 }}>
            Shortcuts — type / for commands
          </div>
          {SLASH_COMMANDS
            .filter(c => c.cmd.startsWith(slashFilter))
            .map(c => (
              <button
                key={c.cmd}
                onClick={() => editingTextId && executeSlashCommand(c.cmd, editingTextId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 12px',
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 14, textAlign: 'left',
                }}
                onMouseOver={e => (e.currentTarget.style.background = '#f3f0ff')}
                onMouseOut={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontSize: 18 }}>{c.icon}</span>
                <div>
                  <div style={{ fontWeight: 500, color: '#333' }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{c.desc}</div>
                </div>
              </button>
            ))}
        </div>
      )}

      {/* ── Bottom bar: + New Page (Notability adds pages on demand) ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-100 bg-white/95 shrink-0">
        <span className="text-xs text-slate-400">
          Page {currentPage + 1} of {totalPagesDisplay}
        </span>
        <button
          onClick={addPage}
          className="px-3 py-1 rounded-lg text-xs text-indigo-600 hover:bg-indigo-50 font-medium"
        >
          + Add Page
        </button>
      </div>
    </div>
  );
};

export default NotabilityEditor;

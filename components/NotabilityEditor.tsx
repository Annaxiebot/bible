/**
 * NotabilityEditor.tsx — Fullscreen Notability-style unified canvas editor
 *
 * Phases 1-4: Drawing, Text Boxes, Images, Lasso Selection, Pages, Export
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
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
  bibleContext?: { bookId?: string; chapter?: number; bookName?: string } | null;
  /** AI stream function */
  onAIStream?: (prompt: string, onChunk: (text: string) => void) => Promise<void>;
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

const AI_ACTIONS = [
  { id: 'reflect', label: '💭 Reflect', prompt: 'Write a gentle spiritual reflection on the following journal entry. Be warm, personal, and reference relevant scripture:\n\n' },
  { id: 'extend', label: '✨ Extend', prompt: 'Continue and extend the thinking in this journal entry with deeper insights:\n\n' },
  { id: 'summarize', label: '📋 Summarize', prompt: 'Summarize the key themes and insights from this journal entry in 2-3 sentences:\n\n' },
  { id: 'scripture', label: '📖 Scripture', prompt: 'Suggest 3-5 relevant Bible verses related to this journal entry, with brief explanations of how they connect:\n\n' },
];

const NotabilityEditor: React.FC<NotabilityEditorProps> = ({
  initialData,
  paperType: initialPaperType = 'ruled',
  onSave,
  onClose,
  entryPlainText,
  bibleContext,
  onAIStream,
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
  const [lassoDragStart, setLassoDragStart] = useState<{ x: number; y: number } | null>(null);

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
  const [drawingLayer, setDrawingLayer] = useState<'below' | 'above'>('below');
  const drawingLayerRef = useRef<'below' | 'above'>('below');

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
  const undoHistoryRef = useRef<string[]>([]);
  const redoHistoryRef = useRef<string[]>([]);
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
    const dpr = window.devicePixelRatio || 1;
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
    const handleResize = () => setupCanvases();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
      // Migrate old text boxes that don't have height
      if (parsed.textBoxes) setTextBoxes(parsed.textBoxes.map(tb => ({ ...tb, height: tb.height || 0.15 })));
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

  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
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
    pushUndo();
    strokeDataRef.current.strokes.push(normalized);
    currentStrokePointsRef.current = [];
    triggerAutoSave();
  }, [getToolOpacity, triggerAutoSave, pushUndo]);

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
    if (lassoPoints.length < 3) { setLassoPoints([]); return; }
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) { setLassoPoints([]); return; }

    // Convert lasso points to normalized
    // Use width for both dimensions
    const normalizedLasso = lassoPoints.map(p => ({ x: p.x / w, y: p.y / w }));

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
      // Calculate bounding box
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
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
    setLassoPoints([]);
    redrawAll();
  }, [lassoPoints, redrawAll]);

  // Rectangle selection: finalize selection from rectStart/rectEnd
  const finishRectSelection = useCallback(() => {
    if (!rectStart || !rectEnd) { setRectStart(null); setRectEnd(null); return; }
    const w = displayWidthRef.current;
    if (w <= 0) { setRectStart(null); setRectEnd(null); return; }

    // Normalize rect coords (use width for both dims, matching stroke normalization)
    const nx1 = Math.min(rectStart.x, rectEnd.x) / w;
    const ny1 = Math.min(rectStart.y, rectEnd.y) / w;
    const nx2 = Math.max(rectStart.x, rectEnd.x) / w;
    const ny2 = Math.max(rectStart.y, rectEnd.y) / w;

    // Find strokes with any point inside rectangle
    const selectedIndices: number[] = [];
    const strokes = strokeDataRef.current.strokes;
    for (let i = 0; i < strokes.length; i++) {
      if (strokes[i].points.some(p => p.x >= nx1 && p.x <= nx2 && p.y >= ny1 && p.y <= ny2)) {
        selectedIndices.push(i);
      }
    }

    if (selectedIndices.length > 0) {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
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
    setRectStart(null);
    setRectEnd(null);
    redrawAll();
  }, [rectStart, rectEnd, redrawAll]);

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
        setLassoDragStart({ x, y });
        pushUndo();
        return;
      } else {
        setLassoSelection(null);
        redrawAll();
      }
    }

    if (tool === 'lasso') {
      if (selectionMode === 'rectangle') {
        setRectStart({ x, y });
        setRectEnd({ x, y });
      } else {
        setLassoPoints([{ x, y }]);
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
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
  }, [getCanvasPoint, getNormalizedPoint, closeAllPopups, applyToolSettings, eraseStrokeAt, lassoSelection, pushUndo, redrawAll, triggerAutoSave]);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!isDrawingRef.current && !lassoDragStart) return;
    const { x, y } = getCanvasPoint(clientX, clientY);
    const tool = toolRef.current;

    // Lasso dragging selection
    if (lassoDragStart && lassoSelection) {
      const dx = x - lassoDragStart.x;
      const dy = y - lassoDragStart.y;
      moveLassoSelection(dx, dy);
      setLassoDragStart({ x, y });
      return;
    }

    if (tool === 'lasso') {
      if (selectionMode === 'rectangle' && rectStart) {
        setRectEnd({ x, y });
      } else {
        setLassoPoints(prev => [...prev, { x, y }]);
      }
      redrawAll();
      return;
    }

    if (tool === 'eraser') { eraseStrokeAt(x, y); return; }

    // Draw live stroke on the correct layer canvas
    const drawCtx = drawingLayerRef.current === 'above' ? overlayCtxRef.current : ctxRef.current;
    if (!drawCtx) return;
    currentStrokePointsRef.current.push({ x, y });
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
    checkAutoExpand(y);
  }, [getCanvasPoint, checkAutoExpand, eraseStrokeAt, lassoDragStart, lassoSelection, moveLassoSelection, redrawAll]);

  const handlePointerUp = useCallback(() => {
    const tool = toolRef.current;
    if (lassoDragStart) { setLassoDragStart(null); return; }
    if (tool === 'lasso') {
      if (selectionMode === 'rectangle') { finishRectSelection(); }
      else { finishLasso(); }
      isDrawingRef.current = false;
      return;
    }
    if (tool === 'eraser') { eraserActiveRef.current = false; isDrawingRef.current = false; applyDeferredExpand(); return; }
    if (isDrawingRef.current) commitCurrentStroke();
    isDrawingRef.current = false;
    applyDeferredExpand();
  }, [commitCurrentStroke, finishLasso, lassoDragStart, applyDeferredExpand]);

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

  // Determine if a touch should navigate (scroll/swipe) instead of draw.
  // Navigation happens when: pointer tool (any input), OR finger on iPad (pencil draws).
  // On iPhone: finger draws in drawing modes, navigates only in pointer mode.
  const shouldNavigate = useCallback((touch: Touch): boolean => {
    if (toolRef.current === 'pointer') return true; // pointer mode: both finger & pencil navigate
    return !isStylusTouch(touch); // drawing modes: iPhone finger draws, iPad finger navigates
  }, [isStylusTouch]);

  // Touch events — finger scrolls/swipes, stylus draws (except pointer mode)
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length > 1) return;
    const t = e.touches[0];
    const nav = shouldNavigate(t);
    isFingerTouchRef.current = nav;

    if (nav) {
      // Navigation touch — allow native scroll in seamless, track swipe in single-page
      if (pageMode === 'single') {
        e.preventDefault();
        swipeStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
      }
      // In seamless mode: do NOT preventDefault → native vertical scroll works
      return;
    }

    // Drawing touch (stylus with non-pointer tool) — prevent default and draw
    e.preventDefault();
    handlePointerDown(t.clientX, t.clientY);
  }, [handlePointerDown, pageMode, shouldNavigate]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length > 1) { isDrawingRef.current = false; return; }

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
  }, [handlePointerMove, pageMode]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (isFingerTouchRef.current) {
      isFingerTouchRef.current = false;
      // Single-page swipe completion
      if (pageMode === 'single' && swipeStartRef.current) {
        e.preventDefault();
        const elapsed = Date.now() - swipeStartRef.current.time;
        const startPt = swipeStartRef.current;
        const lastTouch = e.changedTouches[0];
        const dx = lastTouch ? lastTouch.clientX - startPt.x : swipeOffset;
        const dy = lastTouch ? lastTouch.clientY - startPt.y : 0;

        if (elapsed < 500) {
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
            // Horizontal swipe — left/right page nav
            goToPage(dx < 0 ? currentPage + 1 : currentPage - 1);
          } else if (Math.abs(dy) > SWIPE_THRESHOLD) {
            // Vertical swipe — up = next page, down = previous page
            goToPage(dy < 0 ? currentPage + 1 : currentPage - 1);
          }
        }
        swipeStartRef.current = null;
        setSwipeOffset(0);
      }
      return;
    }

    // Drawing end (stylus)
    e.preventDefault();
    handlePointerUp();
  }, [handlePointerUp, pageMode, swipeOffset, currentPage, goToPage]);

  // Mouse events
  const handleMouseDown = useCallback((e: MouseEvent) => handlePointerDown(e.clientX, e.clientY), [handlePointerDown]);
  const handleMouseMove = useCallback((e: MouseEvent) => handlePointerMove(e.clientX, e.clientY), [handlePointerMove]);
  const handleMouseUp = useCallback(() => handlePointerUp(), [handlePointerUp]);

  // Event listener setup — attach to both main and overlay canvases
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas) return;
    const attachEvents = (el: HTMLCanvasElement) => {
      el.addEventListener('touchstart', handleTouchStart, { passive: false });
      el.addEventListener('touchmove', handleTouchMove, { passive: false });
      el.addEventListener('touchend', handleTouchEnd, { passive: false });
      el.addEventListener('mousedown', handleMouseDown);
      el.addEventListener('mousemove', handleMouseMove);
      el.addEventListener('mouseup', handleMouseUp);
      el.addEventListener('mouseout', handleMouseUp);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    const detachEvents = (el: HTMLCanvasElement) => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mouseout', handleMouseUp);
    };
    attachEvents(canvas);
    if (overlay) attachEvents(overlay);
    return () => {
      detachEvents(canvas);
      if (overlay) detachEvents(overlay);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleMouseDown, handleMouseMove, handleMouseUp]);

  // ── Undo / Redo ────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (undoHistoryRef.current.length === 0) return;
    redoHistoryRef.current.push(getSnapshot());
    restoreSnapshot(undoHistoryRef.current.pop()!);
    redrawAll();
    triggerAutoSave();
  }, [getSnapshot, restoreSnapshot, redrawAll, triggerAutoSave]);

  const handleRedo = useCallback(() => {
    if (redoHistoryRef.current.length === 0) return;
    undoHistoryRef.current.push(getSnapshot());
    if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();
    restoreSnapshot(redoHistoryRef.current.pop()!);
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
    if (el) {
      updateTextBox(id, { content: el.innerHTML });
    }
  }, [updateTextBox]);

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

  const handleItemPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent, id: string, type: 'text' | 'image') => {
    e.stopPropagation();
    if (editingTextId === id) return; // don't drag while editing
    setSelectedItemId(id);
    setSelectedItemType(type);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const np = getNormalizedPoint(clientX, clientY);
    const item = type === 'text'
      ? textBoxes.find(t => t.id === id)
      : images.find(i => i.id === id);
    if (item) {
      setDragOffset({ x: np.x - item.x, y: np.y - item.y });
      setIsDragging(true);
    }
  }, [editingTextId, getNormalizedPoint, textBoxes, images]);

  const handleItemPointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !selectedItemId) return;
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
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
    if (isDragging) { triggerAutoSave(); }
    setIsDragging(false);
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

  const handleAIAction = useCallback(async (actionId: string) => {
    if (!onAIStream || aiLoading) return;
    const action = AI_ACTIONS.find(a => a.id === actionId);
    if (!action) return;

    setShowAIMenu(false);
    setAiLoading(true);

    // Gather text context from text boxes (strip HTML tags for AI context)
    const textContent = textBoxesRef.current
      .filter(tb => !tb.isAIReflection)
      .map(tb => tb.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
    const context = [entryPlainText, textContent]
      .filter(Boolean)
      .join('\n') || 'No text content yet.';
    const bibleInfo = bibleContext?.bookName && bibleContext?.chapter
      ? `\nCurrently reading: ${bibleContext.bookName} ${bibleContext.chapter}`
      : '';

    const prompt = action.prompt + context + bibleInfo;

    // Create a new AI text box at the bottom of current content
    const maxY = Math.max(
      0.1,
      ...textBoxesRef.current.map(tb => tb.y + 0.05),
      ...strokeDataRef.current.strokes.flatMap(s => s.points.map(p => p.y)),
    );
    const aiBox: TextBox = {
      id: genId(),
      x: 0.05,
      y: Math.min(maxY + 0.02, 0.9),
      width: 0.9,
      height: 0.2,
      content: '',
      fontSize: 14,
      isAIReflection: true,
    };
    pushUndo();
    setTextBoxes(prev => [...prev, aiBox]);

    try {
      let accumulated = '';
      await onAIStream(prompt, (chunk) => {
        accumulated += chunk;
        setTextBoxes(prev => prev.map(tb =>
          tb.id === aiBox.id ? { ...tb, content: accumulated } : tb
        ));
      });
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

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-white flex flex-col" style={{ touchAction: pageMode === 'seamless' && (isApplePencilDevice || activeTool === 'pointer' || activeTool === 'text') ? 'pan-y' : 'none', zIndex: 9998 }}
         onMouseMove={e => { if (isDragging) handleItemPointerMove(e); if (isResizing) handleResizeMove(e); }}
         onMouseUp={() => { handleItemPointerUp(); handleResizeEnd(); }}
         onTouchMove={e => { if (isDragging) handleItemPointerMove(e); if (isResizing) handleResizeMove(e); }}
         onTouchEnd={() => { handleItemPointerUp(); handleResizeEnd(); }}
    >
      {/* Placeholder style for empty contentEditable */}
      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        [contenteditable="true"] ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 0.25em 0;
        }
        [contenteditable="true"] ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 0.25em 0;
        }
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
        {/* Left: Done */}
        <button onClick={handleDone}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Done
        </button>

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
              className="p-1.5 rounded-lg hover:bg-slate-100" title="Menu">
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
                  <button key={pm} onClick={() => { setPageMode(pm); setShowMenu(false); triggerAutoSave(); }}
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
        <div className="relative w-full" style={{
          height: `${canvasHeight}px`,
          ...(pageMode === 'single' ? {
            transform: `translateY(-${currentPage * PAGE_HEIGHT}px) translateX(${swipeOffset}px)`,
            transition: swipeOffset === 0 ? 'transform 0.3s ease-out' : 'none',
          } : {}),
        }}>
          {/* Background canvas */}
          <canvas ref={bgCanvasRef} className="absolute inset-0"
            style={{ width: '100%', height: `${canvasHeight}px`, pointerEvents: 'none' }} />
          {/* Drawing canvas (below text boxes) */}
          <canvas ref={canvasRef} className="absolute inset-0"
            style={{
              width: '100%', height: `${canvasHeight}px`,
              touchAction: pageMode === 'seamless' && (isApplePencilDevice || activeTool === 'pointer' || activeTool === 'text') ? 'pan-y' : 'none',
              WebkitTouchCallout: 'none', WebkitUserSelect: 'none',
              userSelect: 'none', cursor: getCursor(),
              // Disable pointer events when editing text, or when drawing on the above layer
              pointerEvents: (activeTool === 'text' && editingTextId) || (drawingLayer === 'above' && activeTool !== 'pointer' && activeTool !== 'text') ? 'none' : 'auto',
            }} />

          {/* ── Text Boxes (Rich text with contentEditable) ────────────── */}
          {textBoxes.map(tb => {
            const isEditing = editingTextId === tb.id;
            const isSelected = selectedItemId === tb.id && selectedItemType === 'text';
            const tbW = tb.width * 100;
            const tbH = (tb.height || 0.15) * (w || 1);
            const tbTop = tb.y * (w || 1);
            return (
              <div key={tb.id}
                data-textbox-id={tb.id}
                style={{
                  position: 'absolute',
                  left: `${tb.x * 100}%`,
                  top: `${tbTop}px`,
                  width: `${tbW}%`,
                  height: `${tbH}px`,
                  zIndex: 5 + (tb.zOrder || 0),
                  touchAction: 'none',
                }}
              >
                {/* Rich text contentEditable div */}
                <div
                  ref={el => {
                    if (el) {
                      contentEditableRefs.current.set(tb.id, el);
                      // Set initial content only when the element is first mounted
                      if (el.innerHTML === '' && tb.content) {
                        el.innerHTML = tb.content;
                      }
                    } else {
                      contentEditableRefs.current.delete(tb.id);
                    }
                  }}
                  contentEditable={!tb.isAIReflection}
                  suppressContentEditableWarning
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
                  onInput={() => syncContentFromRef(tb.id)}
                  onSelect={saveSelection}
                  onKeyUp={saveSelection}
                  onMouseUp={saveSelection}
                  onKeyDown={e => { if (e.key === 'Escape') closeEditing(); }}
                  onMouseDown={e => {
                    if (!isEditing) { e.preventDefault(); handleItemPointerDown(e, tb.id, 'text'); }
                  }}
                  onTouchStart={e => {
                    if (!isEditing) handleItemPointerDown(e, tb.id, 'text');
                  }}
                  onDoubleClick={() => setEditingTextId(tb.id)}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: isEditing ? '2px solid #4f46e5'
                      : isSelected ? '2px dashed #4f46e5'
                      : '1px solid transparent',
                    borderRadius: 4,
                    padding: '6px 8px',
                    background: tb.isAIReflection ? 'rgba(238, 235, 255, 0.3)' : 'transparent',
                    fontSize: tb.fontSize || 16,
                    lineHeight: '1.6',
                    fontFamily: tb.fontFamily || TEXT_FONTS[0].value,
                    color: tb.textColor || '#000000',
                    textAlign: (tb.textAlign || 'left') as React.CSSProperties['textAlign'],
                    fontStyle: tb.isAIReflection ? 'italic' : 'normal',
                    outline: 'none',
                    overflow: 'auto',
                    cursor: isEditing ? 'text' : 'move',
                    boxShadow: isSelected || isEditing ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    minHeight: 24,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    WebkitUserSelect: isEditing ? 'text' : 'none',
                    userSelect: isEditing ? 'text' : 'none',
                  }}
                />

                {/* ── Floating Text Formatting Toolbar (Notability-style) ── */}
                {isEditing && !tb.isAIReflection && (
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
                  </div>
                )}

                {/* Resize handles (visible when selected or editing) */}
                {(isSelected || isEditing) && !tb.isAIReflection && (
                  <>
                    {/* 4 corner handles */}
                    {(['nw', 'ne', 'sw', 'se'] as const).map(corner => (
                      <div key={corner}
                        style={{
                          position: 'absolute',
                          width: 10, height: 10,
                          background: '#4f46e5', borderRadius: '50%', border: '2px solid white',
                          zIndex: 8,
                          cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                          ...(corner.includes('n') ? { top: -5 } : { bottom: -5 }),
                          ...(corner.includes('w') ? { left: -5 } : { right: -5 }),
                        }}
                        onMouseDown={e => handleTextResizeStart(e, tb.id, corner)}
                        onTouchStart={e => handleTextResizeStart(e, tb.id, corner)}
                      />
                    ))}
                    {/* 4 edge midpoint handles */}
                    <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, background: '#4f46e5', borderRadius: '50%', border: '2px solid white', zIndex: 8, cursor: 'ns-resize' }}
                      onMouseDown={e => handleTextResizeStart(e, tb.id, 'n')}
                      onTouchStart={e => handleTextResizeStart(e, tb.id, 'n')} />
                    <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, background: '#4f46e5', borderRadius: '50%', border: '2px solid white', zIndex: 8, cursor: 'ns-resize' }}
                      onMouseDown={e => handleTextResizeStart(e, tb.id, 's')}
                      onTouchStart={e => handleTextResizeStart(e, tb.id, 's')} />
                    <div style={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, background: '#4f46e5', borderRadius: '50%', border: '2px solid white', zIndex: 8, cursor: 'ew-resize' }}
                      onMouseDown={e => handleTextResizeStart(e, tb.id, 'w')}
                      onTouchStart={e => handleTextResizeStart(e, tb.id, 'w')} />
                    <div style={{ position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, background: '#4f46e5', borderRadius: '50%', border: '2px solid white', zIndex: 8, cursor: 'ew-resize' }}
                      onMouseDown={e => handleTextResizeStart(e, tb.id, 'e')}
                      onTouchStart={e => handleTextResizeStart(e, tb.id, 'e')} />
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
              touchAction: pageMode === 'seamless' && (isApplePencilDevice || activeTool === 'pointer' || activeTool === 'text') ? 'pan-y' : 'none',
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

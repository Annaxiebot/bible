/**
 * NotabilityEditor.tsx — Fullscreen Notability-style unified canvas editor
 *
 * Phases 1-4: Drawing, Text Boxes, Images, Lasso Selection, Pages, Export
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
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
  drawPaperBackground,
} from '../services/strokeNormalizer';
import { compressImage } from '../services/imageCompressionService';

// ── Types ──────────────────────────────────────────────────────────────────

export type ActiveTool = StrokeTool | 'text' | 'lasso' | 'pointer';

export interface TextBox {
  id: string;
  x: number; y: number;       // normalized 0-1
  width: number;               // normalized
  content: string;
  fontSize?: number;           // px
  isAIReflection?: boolean;
}

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

  const [activeTool, setActiveTool] = useState<ActiveTool>('pen');
  const [activeColor, setActiveColor] = useState('#000000');
  const [activeSize, setActiveSize] = useState(2);
  const [paperType, setPaperType] = useState<PaperType>(initialPaperType);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSizeSlider, setShowSizeSlider] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(() => Math.max(window.innerHeight - 48, 600));
  const [pageMode, setPageMode] = useState<'seamless' | 'single'>('seamless');
  const [currentPage, setCurrentPage] = useState(0);

  // Text boxes & images
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [images, setImages] = useState<CanvasImage[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<'text' | 'image' | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);

  // AI
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Lasso
  const [lassoPoints, setLassoPoints] = useState<{ x: number; y: number }[]>([]);
  const [lassoSelection, setLassoSelection] = useState<{ strokeIndices: number[]; bounds: { x: number; y: number; w: number; h: number } } | null>(null);
  const [lassoDragStart, setLassoDragStart] = useState<{ x: number; y: number } | null>(null);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
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
  const toolRef = useRef<ActiveTool>('pen');
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

  const closeAllPopups = useCallback(() => {
    setShowColorPicker(false);
    setShowMenu(false);
    setShowSizeSlider(false);
  }, []);

  // ── Snapshot for undo ─────────────────────────────────────────────────

  const getSnapshot = useCallback((): string => {
    const data: ExtendedCanvasData = {
      ...strokeDataRef.current,
      textBoxes: textBoxesRef.current,
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
      const data: ExtendedCanvasData = {
        ...strokeDataRef.current,
        textBoxes: textBoxesRef.current,
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
    if (!ctx || !canvas) return;
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderAllStrokes(ctx, strokeDataRef.current, w, h);

    // Draw images on canvas
    imagesRef.current.forEach(img => {
      const imgEl = new Image();
      imgEl.onload = () => {
        ctx.save();
        const ix = img.x * w;
        const iy = img.y * h;
        const iw = img.width * w;
        const ih = img.height * h;
        if (img.rotation) {
          ctx.translate(ix + iw / 2, iy + ih / 2);
          ctx.rotate((img.rotation * Math.PI) / 180);
          ctx.drawImage(imgEl, -iw / 2, -ih / 2, iw, ih);
        } else {
          ctx.drawImage(imgEl, ix, iy, iw, ih);
        }
        ctx.restore();
      };
      imgEl.src = img.src;
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

    // Draw lasso selection bounds
    if (lassoSelection) {
      const b = lassoSelection.bounds;
      ctx.save();
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
      ctx.restore();
    }
  }, [lassoPoints, lassoSelection]);

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
    const ctx = ctxRef.current;
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
      if (parsed.textBoxes) setTextBoxes(parsed.textBoxes);
      if (parsed.images) setImages(parsed.images);
      if (parsed.pageMode) setPageMode(parsed.pageMode);
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
    return { x: w > 0 ? x / w : 0, y: h > 0 ? y / h : 0 };
  }, [getCanvasPoint]);

  // ── Auto-expand ────────────────────────────────────────────────────────

  const checkAutoExpand = useCallback((y: number) => {
    if (y > displayHeightRef.current - AUTO_EXPAND_THRESHOLD) {
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
    const normalized = normalizeStroke(abs, w, h);
    pushUndo();
    strokeDataRef.current.strokes.push(normalized);
    currentStrokePointsRef.current = [];
    triggerAutoSave();
  }, [getToolOpacity, triggerAutoSave, pushUndo]);

  // ── Stroke eraser ──────────────────────────────────────────────────────

  const eraserActiveRef = useRef(false);
  const eraseStrokeAt = useCallback((px: number, py: number) => {
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) return;
    const nx = px / w;
    const ny = py / h;
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
    const normalizedLasso = lassoPoints.map(p => ({ x: p.x / w, y: p.y / h }));

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

  const moveLassoSelection = useCallback((dx: number, dy: number) => {
    if (!lassoSelection) return;
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) return;
    const ndx = dx / w;
    const ndy = dy / h;
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
      const nx = x / w, ny = y / h;
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
      setLassoPoints([{ x, y }]);
      isDrawingRef.current = true;
      return;
    }

    if (tool === 'text') {
      // Create text box at tap position
      const np = getNormalizedPoint(clientX, clientY);
      const newBox: TextBox = { id: genId(), x: np.x, y: np.y, width: 0.4, content: '', fontSize: 16 };
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

    // Drawing tools
    const ctx = ctxRef.current;
    if (!ctx) return;
    isDrawingRef.current = true;
    currentStrokePointsRef.current = [{ x, y }];
    applyToolSettings();
    ctx.beginPath();
    ctx.moveTo(x, y);
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
      setLassoPoints(prev => [...prev, { x, y }]);
      redrawAll();
      return;
    }

    if (tool === 'eraser') { eraseStrokeAt(x, y); return; }

    const ctx = ctxRef.current;
    if (!ctx) return;
    currentStrokePointsRef.current.push({ x, y });
    ctx.lineTo(x, y);
    ctx.stroke();
    checkAutoExpand(y);
  }, [getCanvasPoint, checkAutoExpand, eraseStrokeAt, lassoDragStart, lassoSelection, moveLassoSelection, redrawAll]);

  const handlePointerUp = useCallback(() => {
    const tool = toolRef.current;
    if (lassoDragStart) { setLassoDragStart(null); return; }
    if (tool === 'lasso') { finishLasso(); isDrawingRef.current = false; return; }
    if (tool === 'eraser') { eraserActiveRef.current = false; isDrawingRef.current = false; return; }
    if (isDrawingRef.current) commitCurrentStroke();
    isDrawingRef.current = false;
  }, [commitCurrentStroke, finishLasso, lassoDragStart]);

  // Touch events
  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length > 1) return;
    const t = e.touches[0];
    if (t.radiusX && t.radiusX > 25) return;
    handlePointerDown(t.clientX, t.clientY);
  }, [handlePointerDown]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length > 1) { isDrawingRef.current = false; return; }
    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, [handlePointerMove]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    e.preventDefault();
    handlePointerUp();
  }, [handlePointerUp]);

  // Mouse events
  const handleMouseDown = useCallback((e: MouseEvent) => handlePointerDown(e.clientX, e.clientY), [handlePointerDown]);
  const handleMouseMove = useCallback((e: MouseEvent) => handlePointerMove(e.clientX, e.clientY), [handlePointerMove]);
  const handleMouseUp = useCallback(() => handlePointerUp(), [handlePointerUp]);

  // Event listener setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseout', handleMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseout', handleMouseUp);
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

  const updateTextBox = useCallback((id: string, content: string) => {
    setTextBoxes(prev => prev.map(tb => tb.id === id ? { ...tb, content } : tb));
    triggerAutoSave();
  }, [triggerAutoSave]);

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

  // Global move/resize handlers
  useEffect(() => {
    if (!isDragging && !isResizing) return;
    const handleMove = (e: MouseEvent) => {
      if (isDragging) handleItemPointerMove(e as any);
      if (isResizing) handleResizeMove(e as any);
    };
    const handleUp = () => {
      handleItemPointerUp();
      handleResizeEnd();
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, isResizing, handleItemPointerMove, handleItemPointerUp, handleResizeMove, handleResizeEnd]);

  // ── AI handler ──────────────────────────────────────────────────────────

  const handleAIAction = useCallback(async (actionId: string) => {
    if (!onAIStream || aiLoading) return;
    const action = AI_ACTIONS.find(a => a.id === actionId);
    if (!action) return;

    setShowAIMenu(false);
    setAiLoading(true);

    // Gather text context from text boxes
    const textContent = textBoxesRef.current
      .filter(tb => !tb.isAIReflection)
      .map(tb => tb.content)
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
    const data: ExtendedCanvasData = {
      ...strokeDataRef.current,
      textBoxes: textBoxesRef.current,
      images: imagesRef.current,
      pageMode,
    };
    onSave(serializeExtended(data));
    onClose();
  }, [onSave, onClose, pageMode]);

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
    renderAllStrokes(ectx, strokeDataRef.current, w, h);

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
    { tool: 'lasso', label: 'Select', icon: '⭕' },
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
  const totalPages = Math.max(1, Math.ceil(canvasHeight / PAGE_HEIGHT));

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-white flex flex-col" style={{ touchAction: 'none', zIndex: 9998 }}
         onMouseMove={e => { if (isDragging) handleItemPointerMove(e); if (isResizing) handleResizeMove(e); }}
         onMouseUp={() => { handleItemPointerUp(); handleResizeEnd(); }}
         onTouchMove={e => { if (isDragging) handleItemPointerMove(e); if (isResizing) handleResizeMove(e); }}
         onTouchEnd={() => { handleItemPointerUp(); handleResizeEnd(); }}
    >
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect}
             style={{ position: 'fixed', top: '-10000px', left: '-10000px' }} />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-200 bg-white/95 backdrop-blur-sm shrink-0"
           style={{ height: '48px', paddingTop: 'env(safe-area-inset-top, 0px)', zIndex: 10, position: 'relative' }}>
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
            <button key={tool} onClick={() => { setActiveTool(tool); if (tool !== 'lasso') { setLassoSelection(null); setLassoPoints([]); } }}
              className={`px-2 py-1.5 rounded-lg transition-all ${
                activeTool === tool ? 'bg-indigo-100 shadow-sm ring-1 ring-indigo-300' : 'hover:bg-slate-100'
              } ${tool === 'text' ? 'font-bold text-sm' : 'text-base'}`}
              title={label}>
              {icon}
            </button>
          ))}
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden"
           style={{ WebkitOverflowScrolling: 'touch' }}
           onClick={closeAllPopups}>
        <div className="relative w-full" style={{ height: `${canvasHeight}px` }}>
          {/* Background canvas */}
          <canvas ref={bgCanvasRef} className="absolute inset-0"
            style={{ width: '100%', height: `${canvasHeight}px`, pointerEvents: 'none' }} />
          {/* Drawing canvas */}
          <canvas ref={canvasRef} className="absolute inset-0"
            style={{
              width: '100%', height: `${canvasHeight}px`,
              touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none',
              userSelect: 'none', cursor: getCursor(),
              pointerEvents: (activeTool === 'text' && editingTextId) ? 'none' : 'auto',
            }} />

          {/* ── Text Boxes (HTML overlay) ──────────────────────────────── */}
          {textBoxes.map(tb => {
            const isEditing = editingTextId === tb.id;
            const isSelected = selectedItemId === tb.id && selectedItemType === 'text';
            return (
              <React.Fragment key={tb.id}>
                <div
                  style={{
                    position: 'absolute',
                    left: `${tb.x * 100}%`,
                    top: `${tb.y * 100}%`,
                    width: `${tb.width * 100}%`,
                    minHeight: 24,
                    zIndex: 5,
                    cursor: isEditing ? 'text' : 'move',
                    border: isEditing ? '2px solid #4f46e5' : isSelected ? '2px dashed #4f46e5' : '1px dashed transparent',
                    borderRadius: 4,
                    padding: '4px 6px',
                    background: tb.isAIReflection ? 'rgba(238, 235, 255, 0.9)' : (isEditing ? 'rgba(255,255,255,0.9)' : 'transparent'),
                    fontSize: tb.fontSize || 16,
                    lineHeight: 1.5,
                    fontStyle: tb.isAIReflection ? 'italic' : 'normal',
                    outline: 'none',
                    touchAction: 'none',
                  }}
                  contentEditable={isEditing}
                  suppressContentEditableWarning
                  onMouseDown={e => {
                    if (!isEditing) handleItemPointerDown(e, tb.id, 'text');
                  }}
                  onTouchStart={e => {
                    if (!isEditing) handleItemPointerDown(e, tb.id, 'text');
                  }}
                  onDoubleClick={() => setEditingTextId(tb.id)}
                  onBlur={e => {
                    updateTextBox(tb.id, e.currentTarget.innerText);
                    setEditingTextId(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setEditingTextId(null); (e.target as HTMLElement).blur(); }
                  }}
                  dangerouslySetInnerHTML={{ __html: tb.content || (isEditing ? '' : '<span style="color:#999">Type here...</span>') }}
                />
                {/* Delete button for selected text box */}
                {isSelected && !isEditing && (
                  <button
                    style={{
                      position: 'absolute',
                      left: `calc(${tb.x * 100}% + ${tb.width * 100}% - 8px)`,
                      top: `calc(${tb.y * 100}% - 12px)`,
                      width: 24, height: 24,
                      background: '#ef4444', color: 'white', borderRadius: '50%', border: 'none',
                      fontSize: 14, cursor: 'pointer', zIndex: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onClick={(e) => { e.stopPropagation(); deleteTextBox(tb.id); }}
                  >×</button>
                )}
              </React.Fragment>
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
                  top: `${img.y * 100}%`,
                  width: `${img.width * 100}%`,
                  height: `${img.height * 100}%`,
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

          {/* ── Page numbers (seamless mode) ───────────────────────────── */}
          {pageMode === 'seamless' && Array.from({ length: totalPages - 1 }, (_, i) => (
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
    </div>
  );
};

export default NotabilityEditor;

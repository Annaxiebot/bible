/**
 * NotabilityEditor.tsx — Fullscreen Notability-style unified canvas editor
 *
 * Phase 1: Fullscreen drawing with compact toolbar, auto-expanding canvas,
 * ruled/grid/plain paper backgrounds, and auto-save.
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  type AbsoluteStroke,
  type StrokeTool,
  type PaperType,
  type NormalizedCanvasData,
  type NormalizedStroke,
  parseCanvasData,
  createEmptyCanvasData,
  serializeCanvasData,
  normalizeStroke,
  renderAllStrokes,
  drawPaperBackground,
} from '../services/strokeNormalizer';

// ── Types ──────────────────────────────────────────────────────────────────

export interface NotabilityPage {
  id: string;
  strokes: NormalizedStroke[];
  paperType: PaperType;
}

export interface NotabilityEditorProps {
  initialData?: string; // serialized NormalizedCanvasData JSON or legacy
  paperType?: PaperType;
  onSave: (data: string) => void;
  onClose: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

// Notability-style pen color palette — real pen/ink colors
const PEN_COLORS = [
  // Row 1: Blacks & grays
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#D9D9D9',
  // Row 2: Warm tones
  '#6B3A2A', '#8B4513', '#A0522D', '#CD853F', '#DEB887', '#F5DEB3',
  // Row 3: Reds & pinks
  '#8B0000', '#CC0000', '#FF0000', '#FF4444', '#FF6B6B', '#FFB3B3',
  // Row 4: Oranges & yellows
  '#CC6600', '#FF8800', '#FFA500', '#FFCC00', '#FFD700', '#FFEB3B',
  // Row 5: Greens
  '#004D00', '#006400', '#228B22', '#32CD32', '#66BB6A', '#A5D6A7',
  // Row 6: Blues
  '#000080', '#0000CC', '#1565C0', '#2196F3', '#42A5F5', '#90CAF9',
  // Row 7: Purples & violets
  '#4A0080', '#6A1B9A', '#8E24AA', '#AB47BC', '#CE93D8', '#E1BEE7',
];
const MIN_SIZE = 1;
const MAX_SIZE = 12;
const AUTO_EXPAND_THRESHOLD = 80; // px from bottom
const AUTO_EXPAND_AMOUNT = 300; // px to add
// Canvas height will be initialized dynamically based on viewport
const AUTOSAVE_DELAY = 2000;
const MAX_HISTORY = 100;

// ── Component ──────────────────────────────────────────────────────────────

const NotabilityEditor: React.FC<NotabilityEditorProps> = ({
  initialData,
  paperType: initialPaperType = 'ruled',
  onSave,
  onClose,
}) => {
  // Tool state
  const [activeTool, setActiveTool] = useState<StrokeTool>('pen');
  const [activeColor, setActiveColor] = useState('#000000');
  const [activeSize, setActiveSize] = useState(2);
  const [paperType, setPaperType] = useState<PaperType>(initialPaperType);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(() => {
    // Start with enough height to fill the viewport minus the toolbar (48px)
    return Math.max(window.innerHeight - 48, 600);
  });

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Drawing state refs
  const isDrawingRef = useRef(false);
  const strokeDataRef = useRef<NormalizedCanvasData>(createEmptyCanvasData(initialPaperType));
  const currentStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
  const undoHistoryRef = useRef<NormalizedCanvasData[]>([]);
  const redoHistoryRef = useRef<NormalizedCanvasData[]>([]);
  const displayWidthRef = useRef(0);
  const displayHeightRef = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const toolRef = useRef<StrokeTool>('pen');
  const colorRef = useRef('#000000');
  const sizeRef = useRef(4);

  // Keep refs in sync with state
  useEffect(() => { toolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { colorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { sizeRef.current = activeSize; }, [activeSize]);

  // ── Auto-save ──────────────────────────────────────────────────────────

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const data = serializeCanvasData(strokeDataRef.current);
      if (data !== lastSavedDataRef.current) {
        lastSavedDataRef.current = data;
        onSave(data);
      }
    }, AUTOSAVE_DELAY);
  }, [onSave]);

  // Cleanup auto-save timer
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // ── Canvas rendering ───────────────────────────────────────────────────

  const redrawStrokes = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) return;
    // Reset context state before clearing/redrawing (eraser leaves destination-out mode)
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderAllStrokes(ctx, strokeDataRef.current, w, h);
  }, []);

  const redrawBackground = useCallback(() => {
    const bgCtx = bgCtxRef.current;
    if (!bgCtx) return;
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) return;
    drawPaperBackground(bgCtx, w, h, strokeDataRef.current.paperType || 'plain');
  }, []);

  const applyToolSettings = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const tool = toolRef.current;
    // Eraser is now stroke-based (handled separately), no canvas composite needed
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

    // Reset transform before scaling (prevents compound scaling on resize/expand)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    bgCtx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctxRef.current = ctx;
    bgCtxRef.current = bgCtx;

    redrawBackground();
    redrawStrokes();
  }, [canvasHeight, redrawBackground, redrawStrokes]);

  useEffect(() => { setupCanvases(); }, [setupCanvases]);

  useEffect(() => {
    const handleResize = () => setupCanvases();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvases]);

  // ── Load initial data (once on mount only) ─────────────────────────────

  const initialDataLoadedRef = useRef(false);
  useEffect(() => {
    if (initialDataLoadedRef.current) return; // only load once
    if (!initialData) return;
    const parsed = parseCanvasData(initialData);
    if (parsed) {
      strokeDataRef.current = parsed;
      if (parsed.paperType) setPaperType(parsed.paperType);
      lastSavedDataRef.current = initialData;
      initialDataLoadedRef.current = true;
      redrawBackground();
      redrawStrokes();
    }
  }, [initialData, redrawBackground, redrawStrokes]);

  // ── Paper type changes ─────────────────────────────────────────────────

  useEffect(() => {
    strokeDataRef.current.paperType = paperType;
    redrawBackground();
    triggerAutoSave();
  }, [paperType, redrawBackground, triggerAutoSave]);

  // ── Auto-expand canvas ─────────────────────────────────────────────────

  const checkAutoExpand = useCallback((y: number) => {
    const h = displayHeightRef.current;
    if (y > h - AUTO_EXPAND_THRESHOLD) {
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
    if (points.length < 2) {
      currentStrokePointsRef.current = [];
      return;
    }

    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) {
      currentStrokePointsRef.current = [];
      return;
    }

    const absoluteStroke: AbsoluteStroke = {
      points: [...points],
      color: colorRef.current,
      lineWidth: sizeRef.current,
      tool: toolRef.current,
      opacity: getToolOpacity(),
    };

    const normalized = normalizeStroke(absoluteStroke, w, h);

    undoHistoryRef.current.push(JSON.parse(JSON.stringify(strokeDataRef.current)));
    if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();

    strokeDataRef.current.strokes.push(normalized);
    currentStrokePointsRef.current = [];
    redoHistoryRef.current = [];

    triggerAutoSave();
  }, [getToolOpacity, triggerAutoSave]);

  // ── Stroke eraser ──────────────────────────────────────────────────────

  const eraserActiveRef = useRef(false); // tracks if eraser has already saved undo state this gesture

  /** Check if a point (in CSS pixels) is near any stroke, and remove it */
  const eraseStrokeAt = useCallback((px: number, py: number) => {
    const w = displayWidthRef.current;
    const h = displayHeightRef.current;
    if (w <= 0 || h <= 0) return;

    // Convert touch point to normalized coords
    const nx = px / w;
    const ny = py / h;
    const hitRadius = 15 / w; // 15px hit area in normalized space

    const strokes = strokeDataRef.current.strokes;
    let hitIndex = -1;

    // Find the topmost stroke that the point intersects
    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i];
      for (const pt of stroke.points) {
        const dx = pt.x - nx;
        const dy = pt.y - ny;
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          hitIndex = i;
          break;
        }
      }
      if (hitIndex >= 0) break;
    }

    if (hitIndex >= 0) {
      // Save undo state once per eraser gesture
      if (!eraserActiveRef.current) {
        undoHistoryRef.current.push(JSON.parse(JSON.stringify(strokeDataRef.current)));
        if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();
        redoHistoryRef.current = [];
        eraserActiveRef.current = true;
      }

      strokes.splice(hitIndex, 1);

      // Redraw
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (ctx && canvas) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderAllStrokes(ctx, strokeDataRef.current, w, h);
      }

      triggerAutoSave();
    }
  }, [triggerAutoSave]);

  // ── Touch handlers ─────────────────────────────────────────────────────

  /** Convert a client coordinate to canvas CSS-pixel coordinate, accounting for any CSS scaling */
  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // rect.width/height = CSS display size, displayWidthRef/displayHeightRef = logical drawing size
    // They should match, but if they don't (e.g. scrollbar), scale accordingly
    const scaleX = displayWidthRef.current / rect.width;
    const scaleY = displayHeightRef.current / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length > 1) return;
    const touch = e.touches[0];
    if (touch.radiusX && touch.radiusX > 25) return; // palm rejection

    const { x, y } = getCanvasPoint(touch.clientX, touch.clientY);

    if (toolRef.current === 'eraser') {
      isDrawingRef.current = true;
      eraserActiveRef.current = false;
      eraseStrokeAt(x, y);
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) return;

    isDrawingRef.current = true;
    currentStrokePointsRef.current = [{ x, y }];
    applyToolSettings();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getCanvasPoint, applyToolSettings, eraseStrokeAt]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    if (e.touches.length > 1) {
      isDrawingRef.current = false;
      currentStrokePointsRef.current = [];
      return;
    }

    const touch = e.touches[0];
    const { x, y } = getCanvasPoint(touch.clientX, touch.clientY);

    if (toolRef.current === 'eraser') {
      eraseStrokeAt(x, y);
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) return;

    currentStrokePointsRef.current.push({ x, y });
    ctx.lineTo(x, y);
    ctx.stroke();

    checkAutoExpand(y);
  }, [getCanvasPoint, checkAutoExpand, eraseStrokeAt]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (toolRef.current === 'eraser') {
      eraserActiveRef.current = false;
      isDrawingRef.current = false;
      return;
    }
    if (isDrawingRef.current) commitCurrentStroke();
    isDrawingRef.current = false;
  }, [commitCurrentStroke]);

  // ── Mouse handlers ─────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: MouseEvent) => {
    const { x, y } = getCanvasPoint(e.clientX, e.clientY);

    if (toolRef.current === 'eraser') {
      isDrawingRef.current = true;
      eraserActiveRef.current = false;
      eraseStrokeAt(x, y);
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) return;

    isDrawingRef.current = true;
    currentStrokePointsRef.current = [{ x, y }];
    applyToolSettings();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getCanvasPoint, applyToolSettings, eraseStrokeAt]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDrawingRef.current) return;
    const { x, y } = getCanvasPoint(e.clientX, e.clientY);

    if (toolRef.current === 'eraser') {
      eraseStrokeAt(x, y);
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) return;

    currentStrokePointsRef.current.push({ x, y });
    ctx.lineTo(x, y);
    ctx.stroke();

    checkAutoExpand(y);
  }, [getCanvasPoint, checkAutoExpand, eraseStrokeAt]);

  const handleMouseUp = useCallback(() => {
    if (toolRef.current === 'eraser') {
      eraserActiveRef.current = false;
      isDrawingRef.current = false;
      return;
    }
    if (isDrawingRef.current) commitCurrentStroke();
    isDrawingRef.current = false;
  }, [commitCurrentStroke]);

  // ── Event listener setup ───────────────────────────────────────────────

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
    redoHistoryRef.current.push(JSON.parse(JSON.stringify(strokeDataRef.current)));
    strokeDataRef.current = undoHistoryRef.current.pop()!;

    // Force full re-render: reset context, clear, redraw
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = displayWidthRef.current;
      const h = displayHeightRef.current;
      if (w > 0 && h > 0) renderAllStrokes(ctx, strokeDataRef.current, w, h);
    }
    triggerAutoSave();
  }, [triggerAutoSave]);

  const handleRedo = useCallback(() => {
    if (redoHistoryRef.current.length === 0) return;
    undoHistoryRef.current.push(JSON.parse(JSON.stringify(strokeDataRef.current)));
    if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();
    strokeDataRef.current = redoHistoryRef.current.pop()!;

    // Force full re-render
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = displayWidthRef.current;
      const h = displayHeightRef.current;
      if (w > 0 && h > 0) renderAllStrokes(ctx, strokeDataRef.current, w, h);
    }
    triggerAutoSave();
  }, [triggerAutoSave]);

  // Keyboard undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (isMeta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // ── Done handler ───────────────────────────────────────────────────────

  const handleDone = useCallback(() => {
    // Final save
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const data = serializeCanvasData(strokeDataRef.current);
    onSave(data);
    onClose();
  }, [onSave, onClose]);

  // ── Tool buttons config ────────────────────────────────────────────────

  const tools: { tool: StrokeTool; label: string; icon: string }[] = [
    { tool: 'pen', label: 'Pen', icon: '✏️' },
    { tool: 'marker', label: 'Marker', icon: '🖊️' },
    { tool: 'highlighter', label: 'Highlighter', icon: '🖍️' },
    { tool: 'eraser', label: 'Eraser', icon: '🧹' },
  ];

  const [showSizeSlider, setShowSizeSlider] = useState(false);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-white flex flex-col" style={{ touchAction: 'none', zIndex: 9998 }}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-200 bg-white/95 backdrop-blur-sm shrink-0"
           style={{ height: '48px', paddingTop: 'env(safe-area-inset-top, 0px)', zIndex: 10, position: 'relative' }}>
        {/* Left: Done */}
        <button
          onClick={handleDone}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Done
        </button>

        {/* Center: Tools */}
        <div className="flex items-center gap-0.5">
          {tools.map(({ tool, label, icon }) => (
            <button
              key={tool}
              onClick={() => setActiveTool(tool)}
              className={`px-2 py-1.5 rounded-lg text-base transition-all ${
                activeTool === tool
                  ? 'bg-indigo-100 shadow-sm ring-1 ring-indigo-300'
                  : 'hover:bg-slate-100'
              }`}
              title={label}
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Right: Undo, Redo, Color, Size, Menu */}
        <div className="flex items-center gap-1">
          <button onClick={handleUndo} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="Undo">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
            </svg>
          </button>
          <button onClick={handleRedo} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="Redo">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
            </svg>
          </button>

          {/* Color picker */}
          <div className="relative">
            <button
              onClick={() => { setShowColorPicker(!showColorPicker); setShowMenu(false); setShowSizeSlider(false); }}
              className="w-7 h-7 rounded-full border-2 border-slate-300 shadow-sm transition-transform hover:scale-110"
              style={{ backgroundColor: activeColor }}
              title="Color"
            />
            {showColorPicker && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-slate-200 p-3 z-50" style={{ width: '220px' }}>
                <div className="grid grid-cols-6 gap-1.5 mb-2">
                  {PEN_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => { setActiveColor(c); setShowColorPicker(false); }}
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                        c === activeColor ? 'border-indigo-500 scale-125 ring-2 ring-indigo-300' : 'border-slate-200'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="border-t border-slate-100 pt-2 flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custom</label>
                  <input
                    type="color"
                    value={activeColor}
                    onChange={(e) => { setActiveColor(e.target.value); }}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <span className="text-[11px] text-slate-500 font-mono">{activeColor}</span>
                </div>
              </div>
            )}
          </div>

          {/* Size control */}
          <div className="relative">
            <button
              onClick={() => { setShowSizeSlider(!showSizeSlider); setShowColorPicker(false); setShowMenu(false); }}
              className="flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
              title={`Size: ${activeSize}`}
            >
              <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="4" y1="20" x2="20" y2="4" strokeLinecap="round" strokeWidth={activeSize * 1.5} />
              </svg>
              <span className="text-[10px] text-slate-500 font-medium">{activeSize}</span>
            </button>
            {showSizeSlider && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-slate-200 p-3 z-50 w-[180px]">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pen Size</div>
                <input
                  type="range"
                  min={MIN_SIZE}
                  max={MAX_SIZE}
                  step={0.5}
                  value={activeSize}
                  onChange={(e) => setActiveSize(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Fine</span>
                  <span>{activeSize}</span>
                  <span>Thick</span>
                </div>
              </div>
            )}
          </div>

          {/* ··· Menu */}
          <div className="relative">
            <button
              onClick={() => { setShowMenu(!showMenu); setShowColorPicker(false); }}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              title="Menu"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 min-w-[180px]">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Paper</div>
                {(['plain', 'ruled', 'grid'] as PaperType[]).map(pt => (
                  <button
                    key={pt}
                    onClick={() => { setPaperType(pt); setShowMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${
                      paperType === pt ? 'text-indigo-600 font-medium' : 'text-slate-700'
                    }`}
                  >
                    <span>{pt === 'plain' ? '📄 Plain' : pt === 'ruled' ? '📝 Ruled' : '📐 Grid'}</span>
                    {paperType === pt && <span className="text-indigo-500">✓</span>}
                  </button>
                ))}
                <div className="h-[1px] bg-slate-100 my-1" />
                <button
                  onClick={() => {
                    // Clear all strokes
                    undoHistoryRef.current.push(JSON.parse(JSON.stringify(strokeDataRef.current)));
                    if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();
                    redoHistoryRef.current = [];
                    strokeDataRef.current = createEmptyCanvasData(paperType);
                    redrawStrokes();
                    triggerAutoSave();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  🗑️ Clear All
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Canvas Area ─────────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onClick={() => { setShowColorPicker(false); setShowMenu(false); setShowSizeSlider(false); }}
      >
        <div className="relative w-full" style={{ height: `${canvasHeight}px` }}>
          {/* Background canvas */}
          <canvas
            ref={bgCanvasRef}
            className="absolute inset-0"
            style={{
              width: '100%',
              height: `${canvasHeight}px`,
              pointerEvents: 'none',
            }}
          />
          {/* Drawing canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{
              width: '100%',
              height: `${canvasHeight}px`,
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              cursor: activeTool === 'eraser' ? 'cell' : 'crosshair',
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default NotabilityEditor;

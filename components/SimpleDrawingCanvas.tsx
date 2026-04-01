/**
 * SimpleDrawingCanvas.tsx — Responsive stroke-based drawing canvas
 *
 * Stores strokes as normalized (percentage-based) paths instead of rasterized images,
 * so annotations scale correctly across different devices and screen sizes.
 * Supports grid and ruled paper backgrounds.
 */

import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  type AbsoluteStroke,
  type StrokeTool,
  type PaperType,
  type NormalizedCanvasData,
  parseCanvasData,
  createEmptyCanvasData,
  serializeCanvasData,
  normalizeStroke,
  renderAllStrokes,
  drawPaperBackground,
} from '../services/strokeNormalizer';

interface SimpleDrawingCanvasProps {
  initialData?: string;
  onChange: (data: string) => void;
  overlayMode?: boolean;
  isWritingMode?: boolean;
  canvasHeight?: number;
  /** Paper background type */
  paperType?: PaperType;
}

export interface SimpleDrawingCanvasHandle {
  clear: () => void;
  getData: () => string;
  undo: () => void;
  setTool: (tool: StrokeTool) => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  setPaperType: (type: PaperType) => void;
}

const SimpleDrawingCanvas = forwardRef<SimpleDrawingCanvasHandle, SimpleDrawingCanvasProps>(
  ({ initialData, onChange, overlayMode = false, isWritingMode = true, canvasHeight, paperType: paperTypeProp = 'plain' }, ref) => {

    // Canvas refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);

    // Drawing state
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawingRef = useRef(false);
    const currentPenColorRef = useRef('#000000');
    const currentPenSizeRef = useRef(4);
    const currentToolRef = useRef<StrokeTool>('pen');
    const setupRetryCountRef = useRef(0);

    // Stroke-based state
    const strokeDataRef = useRef<NormalizedCanvasData>(createEmptyCanvasData(paperTypeProp));
    const currentStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
    const undoHistoryRef = useRef<NormalizedCanvasData[]>([]);
    const MAX_HISTORY = 20;
    const paperTypeRef = useRef<PaperType>(paperTypeProp);

    // Track current display dimensions (CSS pixels, not DPR-scaled)
    const displayWidthRef = useRef(0);
    const displayHeightRef = useRef(0);

    /** Get the current tool's opacity value */
    const getToolOpacity = useCallback((): number => {
      switch (currentToolRef.current) {
        case 'highlighter': return 0.25;
        case 'marker': return 0.7;
        default: return 1.0;
      }
    }, []);

    /** Redraw all strokes from normalized data onto the drawing canvas */
    const redrawStrokes = useCallback(() => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      const w = displayWidthRef.current;
      const h = displayHeightRef.current;
      if (w <= 0 || h <= 0) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderAllStrokes(ctx, strokeDataRef.current, w, h);
    }, []);

    /** Redraw the paper background */
    const redrawBackground = useCallback(() => {
      const bgCtx = bgCtxRef.current;
      if (!bgCtx) return;
      const w = displayWidthRef.current;
      const h = displayHeightRef.current;
      if (w <= 0 || h <= 0) return;
      drawPaperBackground(bgCtx, w, h, strokeDataRef.current.paperType || 'plain');
    }, []);

    /** Apply tool settings to the context for live drawing */
    const applyToolSettings = useCallback(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const tool = currentToolRef.current;

      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = currentPenSizeRef.current * 3;
      } else if (tool === 'highlighter') {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = currentPenColorRef.current;
        ctx.lineWidth = currentPenSizeRef.current * 5;
      } else if (tool === 'marker') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = currentPenColorRef.current;
        ctx.lineWidth = currentPenSizeRef.current * 2.5;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = currentPenColorRef.current;
        ctx.lineWidth = currentPenSizeRef.current;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }, []);

    /** Setup canvases with proper DPR scaling */
    const setupCanvases = useCallback(() => {
      const canvas = canvasRef.current;
      const bgCanvas = bgCanvasRef.current;
      if (!canvas || !bgCanvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;

      let height = canvasHeight;
      if (!height || height <= 0) height = rect.height;
      if (!height || height <= 0) height = 100;

      if (width <= 0) {
        if (setupRetryCountRef.current < 3) {
          setupRetryCountRef.current++;
          setTimeout(() => setupCanvases(), 200);
        }
        return;
      }

      setupRetryCountRef.current = 0;

      // Check if resize is needed
      const needsResize = canvas.width !== width * dpr || canvas.height !== height * dpr;
      if (!needsResize && displayWidthRef.current === width && displayHeightRef.current === height) {
        return;
      }

      displayWidthRef.current = width;
      displayHeightRef.current = height;

      // Set actual canvas dimensions
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      bgCanvas.width = width * dpr;
      bgCanvas.height = height * dpr;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const bgCtx = bgCanvas.getContext('2d');
      if (!ctx || !bgCtx) return;

      ctx.scale(dpr, dpr);
      bgCtx.scale(dpr, dpr);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctxRef.current = ctx;
      bgCtxRef.current = bgCtx;

      // Redraw background and all strokes at new dimensions
      redrawBackground();
      redrawStrokes();
    }, [canvasHeight, redrawBackground, redrawStrokes]);

    /** Commit the current in-progress stroke: normalize and store */
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
        color: currentPenColorRef.current,
        lineWidth: currentPenSizeRef.current,
        tool: currentToolRef.current,
        opacity: getToolOpacity(),
      };

      const normalizedStroke = normalizeStroke(absoluteStroke, w, h);

      // Save undo state before adding the stroke
      undoHistoryRef.current.push(JSON.parse(JSON.stringify(strokeDataRef.current)));
      if (undoHistoryRef.current.length > MAX_HISTORY) {
        undoHistoryRef.current.shift();
      }

      strokeDataRef.current.strokes.push(normalizedStroke);
      currentStrokePointsRef.current = [];

      // Notify parent with serialized data
      onChange(serializeCanvasData(strokeDataRef.current));
    }, [onChange, getToolOpacity]);

    // Touch event handlers
    const handleTouchStart = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      e.preventDefault();
      if (e.touches.length > 1) return;

      const touch = e.touches[0];
      if (touch.radiusX && touch.radiusX > 25) return;

      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      isDrawingRef.current = true;
      currentStrokePointsRef.current = [{ x, y }];

      applyToolSettings();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }, [isWritingMode, applyToolSettings]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
      if (!isDrawingRef.current || !isWritingMode) return;
      e.preventDefault();
      if (e.touches.length > 1) {
        isDrawingRef.current = false;
        currentStrokePointsRef.current = [];
        return;
      }

      const touch = e.touches[0];
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      currentStrokePointsRef.current.push({ x, y });
      ctx.lineTo(x, y);
      ctx.stroke();
    }, [isWritingMode]);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      e.preventDefault();
      if (isDrawingRef.current) {
        commitCurrentStroke();
      }
      isDrawingRef.current = false;
    }, [isWritingMode, commitCurrentStroke]);

    // Mouse event handlers
    const startDrawing = useCallback((e: MouseEvent) => {
      if (!isWritingMode) return;
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      isDrawingRef.current = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      currentStrokePointsRef.current = [{ x, y }];
      applyToolSettings();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }, [isWritingMode, applyToolSettings]);

    const draw = useCallback((e: MouseEvent) => {
      if (!isDrawingRef.current || !isWritingMode) return;
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      currentStrokePointsRef.current.push({ x, y });
      ctx.lineTo(x, y);
      ctx.stroke();
    }, [isWritingMode]);

    const stopDrawing = useCallback(() => {
      if (isDrawingRef.current) {
        commitCurrentStroke();
      }
      isDrawingRef.current = false;
    }, [commitCurrentStroke]);

    // Setup event listeners
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
      canvas.addEventListener('mousedown', startDrawing);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDrawing);
      canvas.addEventListener('mouseout', stopDrawing);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      return () => {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('mousedown', startDrawing);
        canvas.removeEventListener('mousemove', draw);
        canvas.removeEventListener('mouseup', stopDrawing);
        canvas.removeEventListener('mouseout', stopDrawing);
        canvas.removeEventListener('contextmenu', (e) => e.preventDefault());
      };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd, startDrawing, draw, stopDrawing]);

    // Initialize canvases
    useEffect(() => {
      setupCanvases();
    }, [setupCanvases]);

    // Handle window resize — re-render strokes at new dimensions
    useEffect(() => {
      const handleResize = () => {
        setupCanvases();
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [setupCanvases]);

    // Load initial data
    useEffect(() => {
      if (!initialData) return;

      // Try parsing as normalized v2 format
      const parsed = parseCanvasData(initialData);
      if (parsed) {
        strokeDataRef.current = parsed;
        paperTypeRef.current = parsed.paperType || 'plain';
        undoHistoryRef.current = [];
        redrawBackground();
        redrawStrokes();
        return;
      }

      // Legacy format: rasterized data URL — load as background image
      // This preserves old annotations but they won't be editable as strokes
      if (initialData.startsWith('data:image')) {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!canvas || !ctx) return;

        const img = new Image();
        img.onload = () => {
          if (canvas.width <= 0 || canvas.height <= 0) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const rect = canvas.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
          }
        };
        img.src = initialData;
        // Reset stroke data so we start fresh over the legacy image
        strokeDataRef.current = createEmptyCanvasData(paperTypeRef.current);
        undoHistoryRef.current = [];
      }
    }, [initialData, canvasHeight, redrawBackground, redrawStrokes]);

    // Sync paper type prop changes
    useEffect(() => {
      paperTypeRef.current = paperTypeProp;
      strokeDataRef.current.paperType = paperTypeProp;
      redrawBackground();
    }, [paperTypeProp, redrawBackground]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      clear: () => {
        undoHistoryRef.current.push(JSON.parse(JSON.stringify(strokeDataRef.current)));
        if (undoHistoryRef.current.length > MAX_HISTORY) undoHistoryRef.current.shift();

        strokeDataRef.current = createEmptyCanvasData(paperTypeRef.current);
        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        if (ctx && canvas && canvas.width > 0 && canvas.height > 0) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        onChange(serializeCanvasData(strokeDataRef.current));
      },

      getData: () => {
        return serializeCanvasData(strokeDataRef.current);
      },

      undo: () => {
        if (undoHistoryRef.current.length > 0) {
          const previous = undoHistoryRef.current.pop()!;
          strokeDataRef.current = previous;
          redrawStrokes();
          onChange(serializeCanvasData(strokeDataRef.current));
        }
      },

      setTool: (tool: StrokeTool) => {
        currentToolRef.current = tool;
        applyToolSettings();
      },

      setColor: (color: string) => {
        currentPenColorRef.current = color;
        const ctx = ctxRef.current;
        if (ctx) {
          ctx.strokeStyle = color;
          ctx.globalCompositeOperation = 'source-over';
          ctx.lineWidth = currentPenSizeRef.current;
        }
      },

      setSize: (size: number) => {
        currentPenSizeRef.current = size;
        applyToolSettings();
      },

      setPaperType: (type: PaperType) => {
        paperTypeRef.current = type;
        strokeDataRef.current.paperType = type;
        redrawBackground();
        // Persist the paper type change
        onChange(serializeCanvasData(strokeDataRef.current));
      },
    }), [onChange, redrawStrokes, redrawBackground, applyToolSettings]);

    return (
      <div
        className="relative w-full"
        style={{
          height: canvasHeight ? `${canvasHeight}px` : '100%',
          minHeight: canvasHeight ? `${canvasHeight}px` : '100px',
        }}
      >
        {/* Background canvas (paper lines) */}
        <canvas
          ref={bgCanvasRef}
          className="absolute inset-0"
          style={{
            width: '100%',
            height: '100%',
            touchAction: 'none',
            pointerEvents: 'none',
          }}
        />
        {/* Drawing canvas (strokes) */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 ${overlayMode ? 'bg-transparent' : 'bg-transparent'}`}
          style={{
            width: '100%',
            height: '100%',
            touchAction: isWritingMode ? 'none' : 'auto',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTapHighlightColor: 'transparent',
            cursor: isWritingMode ? 'crosshair' : 'default',
            pointerEvents: isWritingMode ? 'auto' : 'none',
          }}
        />
      </div>
    );
  }
);

SimpleDrawingCanvas.displayName = 'SimpleDrawingCanvas';
export default SimpleDrawingCanvas;

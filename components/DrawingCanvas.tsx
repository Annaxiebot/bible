/**
 * DrawingCanvas.tsx — High-performance drawing canvas for iPad + Apple Pencil
 *
 * REWRITTEN: Now uses BOTH touch events AND pointer events for iOS compatibility
 * - Touch events are used for actual point capture on iOS (more reliable)
 * - Pointer events used as fallback and for desktop
 * - Aggressive prevention of iOS context menus and text selection
 */

import React, { useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { TIMING, DRAWING } from '../constants/appConfig';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DrawingCanvasProps {
  initialData?: string;
  onChange: (data: string) => void;
  overlayMode?: boolean;
  isWritingMode?: boolean;
  canvasHeight?: number;
}

export interface DrawingCanvasHandle {
  clear: () => void;
  getData: () => string;
  undo: () => void;
  setTool: (tool: 'pen' | 'marker' | 'highlighter' | 'eraser') => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  redraw: () => void;
  loadPaths: (paths: SerializedPath[]) => void;
}

/** Extra Apple Pencil / stylus properties not in the standard Touch API */
interface ExtendedTouchProps {
  force?: number;
  tiltX?: number;
  tiltY?: number;
  touchType?: string;
  azimuthAngle?: number;
  altitudeAngle?: number;
}
type ExtendedTouch = Touch & ExtendedTouchProps;

interface Point {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
}

export interface SerializedPath {
  tool: 'pen' | 'marker' | 'highlighter' | 'eraser';
  color: string;
  size: number;
  points: Point[];
}

// Detect iOS
const isIOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

// ─── Component ──────────────────────────────────────────────────────────────

const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  ({ initialData, onChange, overlayMode = false, isWritingMode = true, canvasHeight }, ref) => {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    // Drawing state in refs for zero re-renders
    const pathsRef = useRef<SerializedPath[]>([]);
    const currentPointsRef = useRef<Point[]>([]);
    const isDrawingRef = useRef(false);
    const toolRef = useRef<'pen' | 'marker' | 'highlighter' | 'eraser'>('pen');
    const colorRef = useRef('#000000');
    const sizeRef = useRef(2);
    const needsRedrawRef = useRef(false);
    const rafIdRef = useRef<number>(0);
    const lastPenDownRef = useRef(0);
    const dprRef = useRef(window.devicePixelRatio || 1);
    
    // Track if we're using touch (to avoid double-handling with pointer events)
    const usingTouchRef = useRef(false);

    useImperativeHandle(ref, () => ({
      clear: () => {
        pathsRef.current = [];
        currentPointsRef.current = [];
        lastRenderedIndexRef.current = 0;
        isDrawingRef.current = false;
        cancelAnimationFrame(rafIdRef.current);
        fullRedraw();
        onChange('');
      },
      getData: () => {
        if (pathsRef.current.length === 0) return '';
        return JSON.stringify(pathsRef.current);
      },
      undo: () => {
        if (pathsRef.current.length > 0) {
          pathsRef.current = pathsRef.current.slice(0, -1);
          fullRedraw();
          onChange(pathsRef.current.length > 0 ? JSON.stringify(pathsRef.current) : '');
        }
      },
      setTool: (tool) => { toolRef.current = tool; },
      setColor: (color) => { colorRef.current = color; },
      setSize: (size) => { sizeRef.current = size; },
      redraw: () => { fullRedraw(); },
      loadPaths: (paths: SerializedPath[]) => {
        pathsRef.current = paths;
        fullRedraw();
      },
    }));

    // ── Canvas sizing ───────────────────────────────────────────────────

    const setupCanvasSize = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = canvasHeight ?? rect.height;

      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);

        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (ctx) {
          ctx.scale(dpr, dpr);
          ctxRef.current = ctx;
        }
        fullRedraw();
      }
    }, [canvasHeight]);

    useEffect(() => {
      setupCanvasSize();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const observer = new ResizeObserver(() => setupCanvasSize());
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [setupCanvasSize]);

    useEffect(() => {
      setupCanvasSize();
    }, [canvasHeight, setupCanvasSize]);

    // ── Load initial data ───────────────────────────────────────────────

    useEffect(() => {
      if (!initialData || initialData.length === 0) return;
      try {
        const parsed = JSON.parse(initialData);
        if (Array.isArray(parsed)) {
          pathsRef.current = parsed as SerializedPath[];
          fullRedraw();
          return;
        }
      } catch {}

      if (initialData.startsWith('data:image')) {
        const img = new Image();
        img.onload = () => {
          const ctx = ctxRef.current;
          const canvas = canvasRef.current;
          if (!ctx || !canvas) return;
          const rect = canvas.getBoundingClientRect();
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = initialData;
      }
    }, [initialData]);

    // ── Drawing helpers ─────────────────────────────────────────────────

    const drawSegment = useCallback((
      ctx: CanvasRenderingContext2D,
      from: Point,
      to: Point,
      tool: string,
      color: string,
      size: number
    ) => {
      ctx.save();

      // Very low pressure floor for light touches
      let lineWidth = size;
      const p = to.pressure > 0 ? to.pressure : DRAWING.DEFAULT_PRESSURE;
      lineWidth = size * (DRAWING.PRESSURE_MIN_FACTOR + p * DRAWING.PRESSURE_MAX_FACTOR);

      if (tool === 'pen' && (Math.abs(to.tiltX) > DRAWING.TILT_THRESHOLD_DEG || Math.abs(to.tiltY) > DRAWING.TILT_THRESHOLD_DEG)) {
        const tiltFactor = 1 + (Math.abs(to.tiltX) + Math.abs(to.tiltY)) / DRAWING.TILT_DIVISOR;
        lineWidth *= tiltFactor;
      }

      switch (tool) {
        case 'eraser':
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = size * DRAWING.ERASER_WIDTH_MULTIPLIER;
          ctx.strokeStyle = 'rgba(0,0,0,1)';
          break;
        case 'highlighter':
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = DRAWING.HIGHLIGHTER_ALPHA;
          ctx.lineWidth = size * DRAWING.HIGHLIGHTER_WIDTH_MULTIPLIER;
          ctx.strokeStyle = color;
          break;
        case 'marker':
          ctx.globalAlpha = DRAWING.MARKER_ALPHA;
          ctx.lineWidth = lineWidth * DRAWING.MARKER_WIDTH_MULTIPLIER;
          ctx.strokeStyle = color;
          break;
        default:
          ctx.lineWidth = lineWidth;
          ctx.strokeStyle = color;
          break;
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      ctx.quadraticCurveTo(from.x, from.y, mx, my);
      ctx.stroke();
      ctx.restore();
    }, []);

    const fullRedraw = useCallback(() => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, canvasHeight ?? rect.height);

      for (const path of pathsRef.current) {
        if (path.points.length < 2) continue;
        for (let i = 1; i < path.points.length; i++) {
          drawSegment(ctx, path.points[i - 1], path.points[i], path.tool, path.color, path.size);
        }
      }
    }, [drawSegment, canvasHeight]);

    // ── Render loop ─────────────────────────────────────────────────────
    
    // Track last rendered point index to draw all segments during fast strokes
    const lastRenderedIndexRef = useRef(0);

    const renderLoop = useCallback(() => {
      if (!needsRedrawRef.current) {
        if (isDrawingRef.current) {
          rafIdRef.current = requestAnimationFrame(renderLoop);
        }
        return;
      }
      needsRedrawRef.current = false;

      const ctx = ctxRef.current;
      if (!ctx) return;

      const pts = currentPointsRef.current;
      if (pts.length < 2) {
        if (isDrawingRef.current) {
          rafIdRef.current = requestAnimationFrame(renderLoop);
        }
        return;
      }

      // Draw ALL segments from last rendered point to current
      // This fixes fast writing not displaying trace
      const startIdx = Math.max(1, lastRenderedIndexRef.current);
      for (let i = startIdx; i < pts.length; i++) {
        drawSegment(ctx, pts[i - 1], pts[i], toolRef.current, colorRef.current, sizeRef.current);
      }
      lastRenderedIndexRef.current = pts.length;

      if (isDrawingRef.current) {
        rafIdRef.current = requestAnimationFrame(renderLoop);
      }
    }, [drawSegment]);

    // ── Get point from touch event ──────────────────────────────────────

    const getPointFromTouch = useCallback((touch: Touch): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const extTouch = touch as ExtendedTouch;
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        // Apple Pencil provides force (0-1), use it as pressure
        pressure: extTouch.force || DRAWING.DEFAULT_PRESSURE,
        // Tilt from touch (Apple Pencil)
        tiltX: extTouch.tiltX || extTouch.azimuthAngle ? Math.cos(extTouch.azimuthAngle ?? 0) * 45 : 0,
        tiltY: extTouch.tiltY || extTouch.altitudeAngle ? (1 - (extTouch.altitudeAngle ?? 0) / (Math.PI / 2)) * 45 : 0,
      };
    }, []);

    const getPointFromPointer = useCallback((e: PointerEvent): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure || DRAWING.DEFAULT_PRESSURE,
        tiltX: e.tiltX || 0,
        tiltY: e.tiltY || 0,
      };
    }, []);

    // ── Start drawing ───────────────────────────────────────────────────

    const startDrawing = useCallback((point: Point, isPen: boolean) => {
      if (!isWritingMode) return;

      // Apple Pencil double-tap detection
      if (isPen) {
        const now = Date.now();
        if (now - lastPenDownRef.current < TIMING.DOUBLE_TAP_MS && now - lastPenDownRef.current > TIMING.DOUBLE_TAP_MIN_INTERVAL) {
          toolRef.current = toolRef.current === 'eraser' ? 'pen' : 'eraser';
          lastPenDownRef.current = 0;
          return;
        }
        lastPenDownRef.current = now;
      }

      isDrawingRef.current = true;
      currentPointsRef.current = [point];
      lastRenderedIndexRef.current = 0; // Reset for new stroke
      needsRedrawRef.current = false;
      rafIdRef.current = requestAnimationFrame(renderLoop);
    }, [isWritingMode, renderLoop]);

    // ── Continue drawing ────────────────────────────────────────────────

    const continueDrawing = useCallback((points: Point[]) => {
      if (!isDrawingRef.current) return;
      
      // Batch add all points at once for better performance
      if (points.length > 0) {
        currentPointsRef.current.push(...points);
        needsRedrawRef.current = true;
      }
    }, []);

    // ── End drawing ─────────────────────────────────────────────────────

    const endDrawing = useCallback(() => {
      if (!isDrawingRef.current) return;

      isDrawingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);

      const pts = currentPointsRef.current;
      if (pts.length >= 2) {
        const completedPath: SerializedPath = {
          tool: toolRef.current,
          color: colorRef.current,
          size: sizeRef.current,
          points: [...pts],
        };
        pathsRef.current = [...pathsRef.current, completedPath];
        onChange(JSON.stringify(pathsRef.current));
      }

      currentPointsRef.current = [];
    }, [onChange]);

    // ── Touch event handlers (primary for iOS) ──────────────────────────

    const handleTouchStart = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      
      // Only handle single touch for drawing (allow two-finger scroll)
      if (e.touches.length > 2) return;
      
      // For two-finger gestures, don't interfere (allow scrolling)
      if (e.touches.length === 2) {
        usingTouchRef.current = false;
        return;
      }
      
      const touch = e.touches[0];
      
      // Check if this is Apple Pencil (has force or touchType)
      const extTouch = touch as ExtendedTouch;
      const isPen = extTouch.touchType === 'stylus' || (extTouch.force ?? 0) > 0;
      
      // Mark that we're using touch (to skip pointer events)
      usingTouchRef.current = true;
      
      // CRITICAL: Prevent default to stop iOS context menu and text selection
      e.preventDefault();
      e.stopPropagation();
      
      startDrawing(getPointFromTouch(touch), isPen);
    }, [isWritingMode, getPointFromTouch, startDrawing]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      
      // Allow two-finger scroll - don't block it
      if (e.touches.length === 2) {
        if (isDrawingRef.current) {
          // End current stroke if switching to scroll
          endDrawing();
        }
        usingTouchRef.current = false;
        return;
      }
      
      // Only draw with single touch
      if (!isDrawingRef.current || e.touches.length !== 1) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      // Collect all touches from this event
      const points: Point[] = [];
      
      // Use coalescedEvents if available (not on iOS Safari, but might be in future)
      const coalescedTouches = (e as any).coalescedTouches;
      if (coalescedTouches && coalescedTouches.length > 0) {
        for (const touch of coalescedTouches) {
          points.push(getPointFromTouch(touch));
        }
      } else {
        points.push(getPointFromTouch(e.touches[0]));
      }
      
      continueDrawing(points);
    }, [isWritingMode, getPointFromTouch, continueDrawing, endDrawing]);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      
      // Only handle if we were drawing
      if (!isDrawingRef.current) {
        usingTouchRef.current = false;
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      endDrawing();
      
      // Reset touch flag after a delay
      setTimeout(() => {
        usingTouchRef.current = false;
      }, TIMING.SCROLL_RETRY_MS);
    }, [isWritingMode, endDrawing]);

    const handleTouchCancel = useCallback((e: TouchEvent) => {
      // Don't check isDrawingRef - always clean up on cancel
      e.preventDefault();
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        cancelAnimationFrame(rafIdRef.current);
        currentPointsRef.current = [];
        fullRedraw();
      }
      usingTouchRef.current = false;
    }, [fullRedraw]);

    // ── Pointer event handlers (fallback for desktop) ───────────────────

    const handlePointerDown = useCallback((e: PointerEvent) => {
      if (!isWritingMode) return;
      if (usingTouchRef.current) return; // Skip if touch is handling it
      if (e.pointerType !== 'pen' && !e.isPrimary) return;

      e.preventDefault();
      e.stopPropagation();
      
      startDrawing(getPointFromPointer(e), e.pointerType === 'pen');
    }, [isWritingMode, getPointFromPointer, startDrawing]);

    const handlePointerMove = useCallback((e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      if (usingTouchRef.current) return;
      
      e.preventDefault();
      e.stopPropagation();

      const coalescedEvents = (e as any).getCoalescedEvents?.();
      const events = coalescedEvents && coalescedEvents.length > 0 ? coalescedEvents : [e];

      const points: Point[] = [];
      for (const evt of events) {
        points.push(getPointFromPointer(evt));
      }
      
      continueDrawing(points);
    }, [getPointFromPointer, continueDrawing]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      if (usingTouchRef.current) return;
      
      e.preventDefault();
      e.stopPropagation();
      endDrawing();
    }, [endDrawing]);

    const handlePointerCancel = useCallback(() => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
      currentPointsRef.current = [];
      fullRedraw();
    }, [fullRedraw]);

    // ── Prevent context menu ────────────────────────────────────────────

    const blockEvent = useCallback((e: Event) => {
      if (isWritingMode) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    }, [isWritingMode]);

    // ── Attach event listeners ──────────────────────────────────────────

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Touch events (primary for iOS)
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
      canvas.addEventListener('touchcancel', handleTouchCancel, { passive: false, capture: true });

      // Pointer events (fallback)
      canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
      canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
      canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
      canvas.addEventListener('pointercancel', handlePointerCancel, { passive: false });
      
      // Block all context menu and selection events
      canvas.addEventListener('contextmenu', blockEvent, { passive: false, capture: true });
      canvas.addEventListener('selectstart', blockEvent, { passive: false, capture: true });
      canvas.addEventListener('selectionchange', blockEvent, { passive: false, capture: true });
      
      // iOS specific
      canvas.addEventListener('gesturestart', blockEvent, { passive: false, capture: true });
      canvas.addEventListener('gesturechange', blockEvent, { passive: false, capture: true });
      canvas.addEventListener('gestureend', blockEvent, { passive: false, capture: true });

      return () => {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchcancel', handleTouchCancel);
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointercancel', handlePointerCancel);
        canvas.removeEventListener('contextmenu', blockEvent);
        canvas.removeEventListener('selectstart', blockEvent);
        canvas.removeEventListener('selectionchange', blockEvent);
        canvas.removeEventListener('gesturestart', blockEvent);
        canvas.removeEventListener('gesturechange', blockEvent);
        canvas.removeEventListener('gestureend', blockEvent);
        cancelAnimationFrame(rafIdRef.current);
      };
    }, [
      handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel,
      handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel,
      blockEvent
    ]);

    // ── Render ──────────────────────────────────────────────────────────

    return (
      <canvas
        ref={canvasRef}
        className={`w-full ${
          overlayMode ? 'absolute inset-0 bg-transparent' : 'bg-slate-50/30 rounded-lg'
        }`}
        style={({
          height: canvasHeight ? `${canvasHeight}px` : '100%',
          // Disable ALL default touch behaviors when writing
          touchAction: isWritingMode ? 'none' : 'auto',
          // Prevent all text selection and iOS callouts
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          // Prevent iOS text input behaviors
          WebkitUserModify: 'read-only',
          // Prevent tap highlight
          WebkitTapHighlightColor: 'transparent',
          // Cursor
          cursor: isWritingMode ? 'crosshair' : 'default',
          // Only capture events in writing mode; read-only overlay should not block clicks
          pointerEvents: isWritingMode ? 'auto' : 'none',
        } as React.CSSProperties & { WebkitUserModify?: string })}
        // React event handlers as backup
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onSelect={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />
    );
  }
);

DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;

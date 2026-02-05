/**
 * DrawingCanvas.tsx — High-performance drawing canvas for iPad + Apple Pencil
 *
 * REWRITTEN: Now uses BOTH touch events AND pointer events for iOS compatibility
 * - Touch events are used for actual point capture on iOS (more reliable)
 * - Pointer events used as fallback and for desktop
 * - Aggressive prevention of iOS context menus and text selection
 */

import React, { useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';

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
      const p = to.pressure > 0 ? to.pressure : 0.5;
      lineWidth = size * (0.1 + p * 1.8);

      if (tool === 'pen' && (Math.abs(to.tiltX) > 15 || Math.abs(to.tiltY) > 15)) {
        const tiltFactor = 1 + (Math.abs(to.tiltX) + Math.abs(to.tiltY)) / 180;
        lineWidth *= tiltFactor;
      }

      switch (tool) {
        case 'eraser':
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = size * 4;
          ctx.strokeStyle = 'rgba(0,0,0,1)';
          break;
        case 'highlighter':
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = 0.25;
          ctx.lineWidth = size * 5;
          ctx.strokeStyle = color;
          break;
        case 'marker':
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = lineWidth * 2.5;
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

      // Draw ALL new segments since last frame (not just last 2)
      // This helps with fast strokes
      const from = pts[pts.length - 2];
      const to = pts[pts.length - 1];
      drawSegment(ctx, from, to, toolRef.current, colorRef.current, sizeRef.current);

      if (isDrawingRef.current) {
        rafIdRef.current = requestAnimationFrame(renderLoop);
      }
    }, [drawSegment]);

    // ── Get point from touch event ──────────────────────────────────────

    const getPointFromTouch = useCallback((touch: Touch): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        // Apple Pencil provides force (0-1), use it as pressure
        pressure: (touch as any).force || 0.5,
        // Tilt from touch (Apple Pencil)
        tiltX: (touch as any).tiltX || (touch as any).azimuthAngle ? Math.cos((touch as any).azimuthAngle) * 45 : 0,
        tiltY: (touch as any).tiltY || (touch as any).altitudeAngle ? (1 - (touch as any).altitudeAngle / (Math.PI / 2)) * 45 : 0,
      };
    }, []);

    const getPointFromPointer = useCallback((e: PointerEvent): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure || 0.5,
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
        if (now - lastPenDownRef.current < 300 && now - lastPenDownRef.current > 50) {
          toolRef.current = toolRef.current === 'eraser' ? 'pen' : 'eraser';
          lastPenDownRef.current = 0;
          return;
        }
        lastPenDownRef.current = now;
      }

      isDrawingRef.current = true;
      currentPointsRef.current = [point];
      needsRedrawRef.current = false;
      rafIdRef.current = requestAnimationFrame(renderLoop);
    }, [isWritingMode, renderLoop]);

    // ── Continue drawing ────────────────────────────────────────────────

    const continueDrawing = useCallback((points: Point[]) => {
      if (!isDrawingRef.current) return;
      for (const point of points) {
        currentPointsRef.current.push(point);
      }
      needsRedrawRef.current = true;
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
      
      // Only handle single touch for drawing
      if (e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      
      // Check if this is Apple Pencil (has force or touchType)
      const isPen = (touch as any).touchType === 'stylus' || (touch as any).force > 0;
      
      // Mark that we're using touch (to skip pointer events)
      usingTouchRef.current = true;
      
      // CRITICAL: Prevent default to stop iOS context menu and text selection
      e.preventDefault();
      e.stopPropagation();
      
      startDrawing(getPointFromTouch(touch), isPen);
    }, [isWritingMode, getPointFromTouch, startDrawing]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
      if (!isWritingMode || !isDrawingRef.current) return;
      if (e.touches.length !== 1) return;
      
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
    }, [isWritingMode, getPointFromTouch, continueDrawing]);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      endDrawing();
      
      // Reset touch flag after a delay
      setTimeout(() => {
        usingTouchRef.current = false;
      }, 100);
    }, [isWritingMode, endDrawing]);

    const handleTouchCancel = useCallback((e: TouchEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      isDrawingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
      currentPointsRef.current = [];
      fullRedraw();
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
        style={{
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
          // @ts-ignore
          WebkitUserModify: 'read-only',
          // Prevent tap highlight
          WebkitTapHighlightColor: 'transparent',
          // Cursor
          cursor: isWritingMode ? 'crosshair' : 'default',
          // Ensure it captures all events
          pointerEvents: 'auto',
        }}
        // React event handlers as backup
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onSelect={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />
    );
  }
);

DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;

/**
 * SimpleDrawingCanvas.tsx — Working Apple Pencil canvas based on math app implementation
 * 
 * This is a direct port of the proven canvas implementation from the math app
 * that works perfectly with Apple Pencil and never misses strokes.
 */

import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

interface SimpleDrawingCanvasProps {
  initialData?: string;
  onChange: (data: string) => void;
  overlayMode?: boolean;
  isWritingMode?: boolean;
  canvasHeight?: number;
}

export interface SimpleDrawingCanvasHandle {
  clear: () => void;
  getData: () => string;
  undo: () => void;
  setTool: (tool: 'pen' | 'eraser') => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
}

const SimpleDrawingCanvas = forwardRef<SimpleDrawingCanvasHandle, SimpleDrawingCanvasProps>(
  ({ initialData, onChange, overlayMode = false, isWritingMode = true, canvasHeight }, ref) => {
    
    // Canvas refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    
    // Drawing state - using the exact same variables as math app
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawingRef = useRef(false);
    const currentPenColorRef = useRef('#000000');
    const currentPenSizeRef = useRef(4);
    const isEraserModeRef = useRef(false);
    const drawingHistoryRef = useRef<ImageData[]>([]);
    const MAX_HISTORY = 20;

    // Setup canvases with exact same initialization as math app
    const setupCanvases = useCallback(() => {
      const canvas = canvasRef.current;
      const bgCanvas = bgCanvasRef.current;
      if (!canvas || !bgCanvas) return;

      // Get device pixel ratio for crisp rendering
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = canvasHeight || rect.height;

      // Set actual canvas dimensions
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      bgCanvas.width = width * dpr;
      bgCanvas.height = height * dpr;

      // Scale contexts to match device pixel ratio
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const bgCtx = bgCanvas.getContext('2d');
      
      if (!ctx || !bgCtx) return;

      ctx.scale(dpr, dpr);
      bgCtx.scale(dpr, dpr);

      // Set drawing properties - EXACT same as math app
      ctx.strokeStyle = currentPenColorRef.current;
      ctx.lineWidth = currentPenSizeRef.current;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctxRef.current = ctx;
      bgCtxRef.current = bgCtx;

      // Draw white background
      bgCtx.fillStyle = 'white';
      bgCtx.fillRect(0, 0, width, height);

      // Save initial empty state
      saveDrawingHistory();
    }, [canvasHeight]);

    // EXACT same drawing history function as math app
    const saveDrawingHistory = useCallback(() => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      drawingHistoryRef.current.push(imageData);
      
      if (drawingHistoryRef.current.length > MAX_HISTORY) {
        drawingHistoryRef.current.shift();
      }
    }, []);

    // EXACT same touch start handler as math app
    const handleTouchStart = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      
      e.preventDefault();
      
      // Reject multi-touch immediately (palm rejection) - EXACT same as math app
      if (e.touches.length > 1) {
        return;
      }

      const touch = e.touches[0];

      // Additional palm rejection - EXACT same as math app
      // Apple Pencil typically has radiusX/radiusY < 5
      // Finger touches are 10-20
      // Palm can be 30+
      if (touch.radiusX && touch.radiusX > 25) {
        return; // Large touch = palm or side of hand
      }

      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = (touch.clientX - rect.left);
      const y = (touch.clientY - rect.top);
      
      isDrawingRef.current = true;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }, [isWritingMode]);

    // EXACT same touch move handler as math app
    const handleTouchMove = useCallback((e: TouchEvent) => {
      if (!isDrawingRef.current || !isWritingMode) return;
      
      e.preventDefault();

      // Reject multi-touch immediately (palm rejection) - EXACT same as math app
      if (e.touches.length > 1) {
        isDrawingRef.current = false; // Stop drawing if palm detected mid-stroke
        return;
      }

      const touch = e.touches[0];
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = (touch.clientX - rect.left);
      const y = (touch.clientY - rect.top);
      
      ctx.lineTo(x, y);
      ctx.stroke();
    }, [isWritingMode]);

    // EXACT same touch end handler as math app
    const handleTouchEnd = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      
      e.preventDefault();
      
      if (isDrawingRef.current) {
        // Save canvas state to history - EXACT same as math app
        saveDrawingHistory();
        
        // Notify parent of changes
        const canvas = canvasRef.current;
        if (canvas) {
          const dataURL = canvas.toDataURL();
          onChange(dataURL);
        }
      }
      
      isDrawingRef.current = false;
    }, [isWritingMode, saveDrawingHistory, onChange]);

    // Mouse events for desktop - same pattern as math app
    const startDrawing = useCallback((e: MouseEvent) => {
      if (!isWritingMode) return;
      
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      isDrawingRef.current = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }, [isWritingMode]);

    const draw = useCallback((e: MouseEvent) => {
      if (!isDrawingRef.current || !isWritingMode) return;
      
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    }, [isWritingMode]);

    const stopDrawing = useCallback(() => {
      if (isDrawingRef.current) {
        saveDrawingHistory();
        
        // Notify parent of changes
        const canvas = canvasRef.current;
        if (canvas) {
          const dataURL = canvas.toDataURL();
          onChange(dataURL);
        }
      }
      
      isDrawingRef.current = false;
    }, [saveDrawingHistory, onChange]);

    // Setup event listeners
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Touch events (primary for iPad/Apple Pencil)
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

      // Mouse events (desktop fallback)
      canvas.addEventListener('mousedown', startDrawing);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDrawing);
      canvas.addEventListener('mouseout', stopDrawing);

      // Prevent context menu and other interference
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

    // Handle window resize
    useEffect(() => {
      const handleResize = () => setupCanvases();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [setupCanvases]);

    // Load initial data
    useEffect(() => {
      if (!initialData || !initialData.startsWith('data:image')) return;
      
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rect = canvas.getBoundingClientRect();
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = initialData;
    }, [initialData]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      clear: () => {
        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawingHistoryRef.current = [];
        saveDrawingHistory();
        onChange('');
      },
      
      getData: () => {
        const canvas = canvasRef.current;
        return canvas ? canvas.toDataURL() : '';
      },
      
      undo: () => {
        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        
        if (drawingHistoryRef.current.length > 0) {
          // Remove current state
          drawingHistoryRef.current.pop();
          
          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Restore previous state if it exists
          if (drawingHistoryRef.current.length > 0) {
            const previousState = drawingHistoryRef.current[drawingHistoryRef.current.length - 1];
            ctx.putImageData(previousState, 0, 0);
          }
          
          onChange(canvas.toDataURL());
        }
      },
      
      setTool: (tool: 'pen' | 'eraser') => {
        const ctx = ctxRef.current;
        if (!ctx) return;
        
        isEraserModeRef.current = tool === 'eraser';
        
        if (tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = currentPenSizeRef.current * 3;
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = currentPenColorRef.current;
          ctx.lineWidth = currentPenSizeRef.current;
        }
      },
      
      setColor: (color: string) => {
        const ctx = ctxRef.current;
        if (!ctx) return;
        
        currentPenColorRef.current = color;
        isEraserModeRef.current = false;
        ctx.strokeStyle = color;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = currentPenSizeRef.current;
      },
      
      setSize: (size: number) => {
        const ctx = ctxRef.current;
        if (!ctx) return;
        
        currentPenSizeRef.current = size;
        if (isEraserModeRef.current) {
          ctx.lineWidth = size * 3;
        } else {
          ctx.lineWidth = size;
        }
      }
    }), [onChange, saveDrawingHistory]);

    return (
      <div className="relative w-full" style={{ height: canvasHeight ? `${canvasHeight}px` : '100%' }}>
        {/* Background canvas (bottom layer) */}
        <canvas
          ref={bgCanvasRef}
          className="absolute inset-0"
          style={{
            width: '100%',
            height: '100%',
            touchAction: 'none',
            pointerEvents: 'none'
          }}
        />
        
        {/* Drawing canvas (top layer) */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 ${overlayMode ? 'bg-transparent' : 'bg-transparent'}`}
          style={{
            width: '100%',
            height: '100%',
            // Disable ALL touch behaviors when writing - CRITICAL for Apple Pencil
            touchAction: isWritingMode ? 'none' : 'auto',
            // Prevent text selection and iOS callouts - CRITICAL
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            // Prevent tap highlight
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
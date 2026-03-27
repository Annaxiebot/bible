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
  setTool: (tool: 'pen' | 'marker' | 'highlighter' | 'eraser') => void;
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
    const currentToolRef = useRef<'pen' | 'marker' | 'highlighter' | 'eraser'>('pen');
    const isEraserModeRef = useRef(false);
    const drawingHistoryRef = useRef<ImageData[]>([]);
    const MAX_HISTORY = 20;
    const setupRetryCountRef = useRef(0);
    const hasContentRef = useRef(false);

    // Apply current tool settings to context
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
        // 'pen' (default)
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = currentPenColorRef.current;
        ctx.lineWidth = currentPenSizeRef.current;
      }
      
      // Always set these for all tools
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }, []);

    // Setup canvases with exact same initialization as math app
    const setupCanvases = useCallback(() => {
      const canvas = canvasRef.current;
      const bgCanvas = bgCanvasRef.current;
      if (!canvas || !bgCanvas) return;

      // Get device pixel ratio for crisp rendering
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      
      // CRITICAL: Use canvasHeight if provided, otherwise fall back to rect.height or minimum
      let height = canvasHeight;
      if (!height || height <= 0) {
        height = rect.height;
      }
      if (!height || height <= 0) {
        height = 100; // Minimum fallback height
      }

      // CRITICAL: Don't setup canvas with invalid width (height is handled above)
      if (width <= 0) {
        if (setupRetryCountRef.current < 3) { // Reduced max retries
          setupRetryCountRef.current++;
          setTimeout(() => setupCanvases(), 200); // Longer delay
        }
        return;
      }

      // Reset retry counter on successful setup
      setupRetryCountRef.current = 0;

      // CRITICAL: Check if we already have the right dimensions to avoid unnecessary clearing
      const needsResize = canvas.width !== width * dpr || canvas.height !== height * dpr;
      
      if (!needsResize && hasContentRef.current) {
        // Canvas already properly sized and has content - skip setup to preserve content
        return;
      }

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

      // Save initial empty state - delay slightly to ensure canvas is ready
      setTimeout(() => {
        saveDrawingHistory();
      }, 0);
    }, [canvasHeight]);

    // EXACT same drawing history function as math app
    const saveDrawingHistory = useCallback(() => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      // CRITICAL: Check canvas has valid dimensions before getImageData
      if (canvas.width <= 0 || canvas.height <= 0) {
        console.warn('Canvas has invalid dimensions, skipping history save:', { width: canvas.width, height: canvas.height });
        return;
      }

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        drawingHistoryRef.current.push(imageData);
        
        if (drawingHistoryRef.current.length > MAX_HISTORY) {
          drawingHistoryRef.current.shift();
        }
      } catch (error) {
        console.warn('Failed to save drawing history:', error);
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
      // CRITICAL: Use display coordinates since canvas is already DPR-scaled
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      isDrawingRef.current = true;
      
      // Apply current tool settings before drawing
      applyToolSettings();
      
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
      // CRITICAL: Use display coordinates since canvas is already DPR-scaled
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      ctx.lineTo(x, y);
      ctx.stroke();
      hasContentRef.current = true; // Mark that we have drawn content
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
    }, [isWritingMode, onChange]);

    // Mouse events for desktop - same pattern as math app
    const startDrawing = useCallback((e: MouseEvent) => {
      if (!isWritingMode) return;
      
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      isDrawingRef.current = true;
      
      // Apply current tool settings before drawing
      applyToolSettings();
      
      const rect = canvas.getBoundingClientRect();
      // CRITICAL: Use display coordinates since canvas is already DPR-scaled
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
      // CRITICAL: Use display coordinates since canvas is already DPR-scaled
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
      hasContentRef.current = true; // Mark that we have drawn content
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
    }, [onChange]);

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
        // Check canvas has valid dimensions
        if (canvas.width <= 0 || canvas.height <= 0) {
          console.warn('Canvas has invalid dimensions, skipping image load');
          return;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          hasContentRef.current = true; // Mark that we have content loaded
        }
      };
      img.src = initialData;
    }, [initialData]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      clear: () => {
        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        
        // Check canvas has valid dimensions
        if (canvas.width <= 0 || canvas.height <= 0) {
          console.warn('Canvas has invalid dimensions, skipping clear operation');
          return;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawingHistoryRef.current = [];
        hasContentRef.current = false; // Mark that canvas is now empty
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
      
      setTool: (tool: 'pen' | 'marker' | 'highlighter' | 'eraser') => {
        currentToolRef.current = tool;
        isEraserModeRef.current = tool === 'eraser';
        applyToolSettings();
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
    }), [onChange]);

    return (
      <div 
        className="relative w-full" 
        style={{ 
          height: canvasHeight ? `${canvasHeight}px` : '100%',
          minHeight: canvasHeight ? `${canvasHeight}px` : '100px' // Ensure minimum height
        }}
      >
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
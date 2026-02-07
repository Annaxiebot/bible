/**
 * InlineBibleAnnotation.tsx
 *
 * Overlay annotation system for writing directly on Bible verses.
 * Think: writing in the margins of a physical Bible, but with infinite digital space.
 *
 * Features:
 * - Transparent drawing canvas overlaid on verse text
 * - Floating mini-toolbar for pen/highlighter/eraser/color/undo
 * - Expandable writing space below verses (drag handle)
 * - Saves per book+chapter to IndexedDB
 * - Faint overlay of saved annotations when not in edit mode
 */

import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import DrawingCanvas, { DrawingCanvasHandle, SerializedPath } from './DrawingCanvas';
import { annotationStorage } from '../services/annotationStorage';

export interface AnnotationToolState {
  tool: 'pen' | 'marker' | 'highlighter' | 'eraser';
  color: string;
  size: number;
}

export interface InlineBibleAnnotationHandle {
  undo: () => void;
  clearAll: () => void;
}

interface InlineBibleAnnotationProps {
  bookId: string;
  chapter: number;
  /** Whether annotation/drawing mode is active */
  isActive: boolean;
  /** The natural height of the verse content area (pixels) */
  contentHeight: number;
  /** Theme accent color for UI elements */
  accentColor?: string;
  /** External tool state (shared between panels) */
  toolState?: AnnotationToolState;
  /** Panel identifier for storage */
  panelId?: 'chinese' | 'english';
}

// ─── Preset colors for the color picker - brighter colors including yellow ──
export const COLOR_PRESETS = [
  '#000000', // Black
  '#374151', // Dark gray
  '#ef4444', // Bright red
  '#f97316', // Bright orange
  '#fbbf24', // Yellow/Gold
  '#22c55e', // Bright green
  '#3b82f6', // Bright blue
  '#a855f7', // Bright purple
  '#ec4899', // Pink
  '#8B7355', // Brown (matches Bible theme)
];

const MAX_EXPAND = 2000; // Maximum additional expandable height in px

const InlineBibleAnnotation = forwardRef<InlineBibleAnnotationHandle, InlineBibleAnnotationProps>(({
  bookId,
  chapter,
  isActive,
  contentHeight,
  accentColor = '#6366f1',
  toolState,
  panelId = 'chinese',
}, ref) => {
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  // ── State ──────────────────────────────────────────────────────────────
  const [extraHeight, setExtraHeight] = useState(0);       // Extra expanded space
  const [savedPaths, setSavedPaths] = useState<string>(''); // Serialized path data for read-only view
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; height: number }>({ y: 0, height: 0 });

  // Track the book+chapter+panel key for loading/saving
  const annotationKey = `${bookId}:${chapter}:${panelId}`;
  const prevKeyRef = useRef(annotationKey);

  // Total canvas height = verse content + expanded space
  const totalHeight = contentHeight + extraHeight;

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    undo: () => {
      canvasRef.current?.undo();
    },
    clearAll: () => {
      if (confirm('清除此章所有标注？\nClear all annotations for this chapter?')) {
        canvasRef.current?.clear();
        setSavedPaths('');
        setExtraHeight(0);
        annotationStorage.deleteAnnotation(bookId, chapter, panelId);
      }
    },
  }));

  // ── Load saved annotation when book/chapter changes ───────────────────

  useEffect(() => {
    const loadAnnotation = async () => {
      const result = await annotationStorage.getAnnotation(bookId, chapter, panelId);
      if (result) {
        setSavedPaths(result.data);
        setExtraHeight(result.height);
        // If canvas is mounted and active, load the paths
        if (canvasRef.current && result.data) {
          try {
            const paths = JSON.parse(result.data) as SerializedPath[];
            canvasRef.current.loadPaths(paths);
          } catch {
            // Invalid data, ignore
          }
        }
      } else {
        setSavedPaths('');
        setExtraHeight(0);
        if (canvasRef.current) {
          canvasRef.current.clear();
        }
      }
    };

    // Save current annotation before switching chapters
    if (prevKeyRef.current !== annotationKey && savedPaths) {
      const [prevBook, prevChapterStr, prevPanel] = prevKeyRef.current.split(':');
      annotationStorage.saveAnnotation(prevBook, parseInt(prevChapterStr), savedPaths, extraHeight, prevPanel as 'chinese' | 'english');
    }
    prevKeyRef.current = annotationKey;

    loadAnnotation();
  }, [bookId, chapter, panelId]);

  // When activating annotation mode, load paths into the canvas
  useEffect(() => {
    if (isActive && canvasRef.current && savedPaths) {
      try {
        const paths = JSON.parse(savedPaths) as SerializedPath[];
        // Small delay to let canvas mount and size properly
        requestAnimationFrame(() => {
          canvasRef.current?.loadPaths(paths);
        });
      } catch {
        // Invalid data
      }
    }
  }, [isActive]);

  // ── Document-level prevention of iOS context menu when annotation mode is active ──
  useEffect(() => {
    if (!isActive) return;

    // Clear any existing text selection immediately
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }

    const blockEvent = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // Only block context menu and selection - NOT touch events (those are needed for drawing)
    document.addEventListener('contextmenu', blockEvent, { capture: true, passive: false });
    document.addEventListener('selectstart', blockEvent, { capture: true, passive: false });
    document.addEventListener('selectionchange', blockEvent, { capture: true, passive: false });
    
    // iOS gesture events (pinch/zoom) - block these but not single-touch
    document.addEventListener('gesturestart', blockEvent, { capture: true, passive: false });
    document.addEventListener('gesturechange', blockEvent, { capture: true, passive: false });
    document.addEventListener('gestureend', blockEvent, { capture: true, passive: false });
    
    // Set body styles to prevent all selection
    const originalStyles = {
      webkitUserSelect: document.body.style.webkitUserSelect,
      userSelect: document.body.style.userSelect,
      webkitTouchCallout: (document.body.style as any).webkitTouchCallout,
    };
    
    document.body.style.webkitUserSelect = 'none';
    document.body.style.userSelect = 'none';
    (document.body.style as any).webkitTouchCallout = 'none';
    
    // Also add a class to html for CSS-level blocking
    document.documentElement.classList.add('annotation-mode-active');

    return () => {
      document.removeEventListener('contextmenu', blockEvent, { capture: true });
      document.removeEventListener('selectstart', blockEvent, { capture: true });
      document.removeEventListener('selectionchange', blockEvent, { capture: true });
      document.removeEventListener('gesturestart', blockEvent, { capture: true });
      document.removeEventListener('gesturechange', blockEvent, { capture: true });
      document.removeEventListener('gestureend', blockEvent, { capture: true });
      
      document.body.style.webkitUserSelect = originalStyles.webkitUserSelect;
      document.body.style.userSelect = originalStyles.userSelect;
      (document.body.style as any).webkitTouchCallout = originalStyles.webkitTouchCallout;
      
      document.documentElement.classList.remove('annotation-mode-active');
    };
  }, [isActive]);

  // ── Auto-save on canvas change ─────────────────────────

  const handleCanvasChange = useCallback((data: string) => {
    setSavedPaths(data);
    // Save to IndexedDB
    annotationStorage.saveAnnotation(bookId, chapter, data, extraHeight, panelId);
  }, [bookId, chapter, extraHeight, panelId]);

  // Save when extra height changes
  useEffect(() => {
    if (savedPaths) {
      annotationStorage.saveAnnotation(bookId, chapter, savedPaths, extraHeight, panelId);
    }
  }, [extraHeight]);

  // ── Sync external tool state to canvas ────────────────────────────────
  useEffect(() => {
    if (isActive && canvasRef.current && toolState) {
      canvasRef.current.setTool(toolState.tool);
      canvasRef.current.setSize(toolState.size);
      canvasRef.current.setColor(toolState.color);
    }
  }, [isActive, toolState?.tool, toolState?.size, toolState?.color]);

  // ── Expand handle drag ────────────────────────────────────────────────

  const handleExpandPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = { y: e.clientY, height: extraHeight };

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - dragStartRef.current.y;
      const newHeight = Math.max(0, Math.min(MAX_EXPAND, dragStartRef.current.height + delta));
      setExtraHeight(newHeight);
    };

    const handleUp = () => {
      setIsDragging(false);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [extraHeight]);

  // ── Render ────────────────────────────────────────────────────────────

  // If not active, render a faint read-only overlay of saved annotations
  if (!isActive) {
    // Show nothing if no annotations and no extra margin
    if ((!savedPaths || savedPaths === '[]' || savedPaths === '') && extraHeight === 0) return null;

    return (
      <>
        {/* Faint annotation overlay */}
        {savedPaths && savedPaths !== '[]' && savedPaths !== '' && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              height: `${totalHeight}px`,
              overflow: 'hidden',
              opacity: 0.35, // Faint overlay so users can see their notes
            }}
          >
            <DrawingCanvas
              ref={canvasRef}
              initialData={savedPaths}
              onChange={() => {}} // Read-only
              overlayMode={true}
              isWritingMode={false}
              canvasHeight={totalHeight}
            />
          </div>
        )}
        
        {/* Show margin line even when not in annotation mode (faintly) */}
        {extraHeight > 0 && (
          <div
            className="absolute left-4 right-4 pointer-events-none"
            style={{
              top: `${contentHeight}px`,
              borderTop: '1px dashed rgba(139, 115, 85, 0.2)',
            }}
          >
            <span
              className="absolute -top-3 right-0 text-[9px] tracking-wider uppercase"
              style={{ color: 'rgba(139, 115, 85, 0.3)' }}
            >
              margin · 留白
            </span>
          </div>
        )}
      </>
    );
  }

  // Active annotation mode - only render canvas (no toolbar - that's now in BibleViewer)
  return (
    <>
      {/* Drawing canvas overlay — blocks all text interaction when active */}
      <div
        className="annotation-overlay absolute inset-0 z-20"
        style={{
          height: `${totalHeight}px`,
          // Don't block text visibility
          mixBlendMode: 'multiply',
          // Let pointer events pass through to canvas child
          pointerEvents: 'none',
        }}
      >
        <DrawingCanvas
          ref={canvasRef}
          initialData={savedPaths}
          onChange={handleCanvasChange}
          overlayMode={true}
          isWritingMode={true}
          canvasHeight={totalHeight}
        />
      </div>

      {/* Margin line: shows where original content ends and expanded space begins */}
      {extraHeight > 0 && (
        <div
          className="absolute left-4 right-4 z-30 pointer-events-none"
          style={{
            top: `${contentHeight}px`,
            borderTop: '1px dashed rgba(139, 115, 85, 0.3)',
          }}
        >
          <span
            className="absolute -top-3 right-0 text-[9px] tracking-wider uppercase"
            style={{ color: 'rgba(139, 115, 85, 0.4)' }}
          >
            margin · 留白
          </span>
        </div>
      )}

      {/* Expand handle - only show for Chinese panel to avoid duplicates */}
      {panelId === 'chinese' && (
        <div
          className="fixed z-50 cursor-ns-resize"
          style={{
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            touchAction: 'none',
          }}
          onPointerDown={handleExpandPointerDown}
        >
          <div
            className="flex flex-col items-center gap-1 px-2 py-3 rounded-xl transition-all shadow-lg"
            style={{
              backgroundColor: isDragging ? 'rgba(99, 102, 241, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              border: `2px solid ${isDragging ? 'rgba(99, 102, 241, 0.8)' : 'rgba(139, 115, 85, 0.3)'}`,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <svg 
              className="w-5 h-5" 
              style={{ color: isDragging ? 'white' : 'rgba(139, 115, 85, 0.7)' }} 
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span 
              className="text-[10px] font-bold writing-vertical"
              style={{ 
                color: isDragging ? 'white' : 'rgba(139, 115, 85, 0.8)',
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
              }}
            >
              {extraHeight > 0 ? `+${Math.round(extraHeight)}` : '留白'}
            </span>
            <span 
              className="text-[8px] writing-vertical"
              style={{ 
                color: isDragging ? 'rgba(255,255,255,0.8)' : 'rgba(139, 115, 85, 0.5)',
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
              }}
            >
              拖动
            </span>
          </div>
        </div>
      )}
    </>
  );
});

InlineBibleAnnotation.displayName = 'InlineBibleAnnotation';
export default InlineBibleAnnotation;

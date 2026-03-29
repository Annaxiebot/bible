import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { InlineBibleAnnotationHandle } from '../components/InlineBibleAnnotation';
import type { PaperType } from '../services/strokeNormalizer';

const PAPER_TYPE_STORAGE_KEY = 'bible-annotation-paper-type';

const DEFAULT_TOOL_SIZES: Record<string, number> = {
  pen: 2, marker: 3, highlighter: 4, eraser: 8,
};

const DEFAULT_TOOL_COLORS: Record<string, string> = {
  pen: '#3b82f6', marker: '#3b82f6', highlighter: '#fbbf24', eraser: '#000000',
};

type AnnotationTool = 'pen' | 'marker' | 'highlighter' | 'eraser';

export function useAnnotationState(
  setFontSize: (size: number) => void,
  setVSplitOffset: (offset: number) => void,
  bookId: string,
  chapter: number,
) {
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('pen');
  const [annotationColor, setAnnotationColor] = useState('#3b82f6');
  const [annotationSize, setAnnotationSize] = useState(2);
  const [toolSizes, setToolSizes] = useState(DEFAULT_TOOL_SIZES);
  const [toolColors, setToolColors] = useState(DEFAULT_TOOL_COLORS);
  const [showAnnotationColorPicker, setShowAnnotationColorPicker] = useState(false);
  const [isAnnotationToolbarCollapsed, setIsAnnotationToolbarCollapsed] = useState(false);
  const [annotationOriginalLayout, setAnnotationOriginalLayout] = useState<{
    fontSize: number;
    vSplitOffset: number;
  } | null>(null);

  const [paperType, setPaperTypeState] = useState<PaperType>(() => {
    try {
      const stored = localStorage.getItem(PAPER_TYPE_STORAGE_KEY);
      if (stored === 'grid' || stored === 'ruled' || stored === 'plain') return stored;
    } catch { /* ignore */ }
    return 'plain';
  });

  const chineseAnnotationRef = useRef<InlineBibleAnnotationHandle | null>(null);
  const englishAnnotationRef = useRef<InlineBibleAnnotationHandle | null>(null);

  const setPaperType = useCallback((type: PaperType) => {
    setPaperTypeState(type);
    try { localStorage.setItem(PAPER_TYPE_STORAGE_KEY, type); } catch { /* ignore */ }
    chineseAnnotationRef.current?.setPaperType(type);
    englishAnnotationRef.current?.setPaperType(type);
  }, []);

  const selectAnnotationTool = useCallback((tool: AnnotationTool) => {
    setToolSizes(prev => ({ ...prev, [annotationTool]: annotationSize }));
    setToolColors(prev => ({ ...prev, [annotationTool]: annotationColor }));
    setAnnotationTool(tool);
    setAnnotationSize(toolSizes[tool]);
    setAnnotationColor(toolColors[tool]);
  }, [annotationTool, annotationSize, annotationColor, toolSizes, toolColors]);

  const handleAlignmentMismatch = useCallback((storedFontSize: number, storedVSplitOffset: number) => {
    setAnnotationOriginalLayout({ fontSize: storedFontSize, vSplitOffset: storedVSplitOffset });
  }, []);

  const handleRestoreAlignment = useCallback(() => {
    if (annotationOriginalLayout) {
      setFontSize(annotationOriginalLayout.fontSize);
      setVSplitOffset(annotationOriginalLayout.vSplitOffset);
      setAnnotationOriginalLayout(null);
    }
  }, [annotationOriginalLayout, setFontSize, setVSplitOffset]);

  useEffect(() => {
    setAnnotationOriginalLayout(null);
  }, [bookId, chapter]);

  const handleAnnotationUndo = useCallback(() => {
    chineseAnnotationRef.current?.undo();
    englishAnnotationRef.current?.undo();
  }, []);

  const handleAnnotationClearAll = useCallback(() => {
    if (confirm('清除此章所有标注？\nClear all annotations for this chapter?')) {
      chineseAnnotationRef.current?.clearAll();
      englishAnnotationRef.current?.clearAll();
    }
  }, []);

  const annotationToolState = useMemo(() => ({
    tool: annotationTool,
    color: annotationColor,
    size: annotationSize,
  }), [annotationTool, annotationColor, annotationSize]);

  return {
    isAnnotationMode,
    setIsAnnotationMode,
    annotationTool,
    annotationColor,
    setAnnotationColor,
    annotationSize,
    setAnnotationSize,
    toolSizes,
    toolColors,
    showAnnotationColorPicker,
    setShowAnnotationColorPicker,
    isAnnotationToolbarCollapsed,
    setIsAnnotationToolbarCollapsed,
    annotationOriginalLayout,
    chineseAnnotationRef,
    englishAnnotationRef,
    selectAnnotationTool,
    handleAlignmentMismatch,
    handleRestoreAlignment,
    handleAnnotationUndo,
    handleAnnotationClearAll,
    annotationToolState,
    paperType,
    setPaperType,
  };
}

import React from 'react';
import { useSeasonTheme } from '../hooks/useSeasonTheme';
import type { PaperType } from '../services/strokeNormalizer';

type AnnotationTool = 'pen' | 'marker' | 'highlighter' | 'eraser';

interface AnnotationToolbarProps {
  isAnnotationMode: boolean;
  annotationTool: AnnotationTool;
  annotationColor: string;
  annotationSize: number;
  showAnnotationColorPicker: boolean;
  isAnnotationToolbarCollapsed: boolean;
  annotationOriginalLayout: { fontSize: number; vSplitOffset: number } | null;
  colorPresets: readonly string[];
  paperType?: PaperType;
  onSelectTool: (tool: AnnotationTool) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: number) => void;
  onToggleColorPicker: () => void;
  onToggleCollapsed: () => void;
  onUndo: () => void;
  onClearAll: () => void;
  onRestoreAlignment: () => void;
  onClose: () => void;
  onPaperTypeChange?: (type: PaperType) => void;
}

const TOOL_BUTTONS: Array<{ tool: AnnotationTool; icon: string; label: string; labelEn: string }> = [
  { tool: 'pen', icon: '✒️', label: '笔', labelEn: 'Pen' },
  { tool: 'highlighter', icon: '🖍️', label: '荧光', labelEn: 'Highlight' },
  { tool: 'marker', icon: '🖊️', label: '马克', labelEn: 'Marker' },
  { tool: 'eraser', icon: '🧹', label: '擦除', labelEn: 'Eraser' },
];

const GRAYSCALE_LIGHTNESS = [100, 95, 88, 80, 70, 60, 50, 40, 30, 20, 10, 0];
const COLOR_HUES = [190, 210, 240, 270, 300, 340, 10, 30, 50, 80, 110, 150];
const COLOR_LIGHTNESS_ROWS = [25, 35, 45, 55, 65, 75, 85];

const PAPER_TYPES: Array<{ type: PaperType; icon: string; label: string; labelEn: string }> = [
  { type: 'plain', icon: '📄', label: '空白', labelEn: 'Plain' },
  { type: 'grid', icon: '📐', label: '方格', labelEn: 'Grid' },
  { type: 'ruled', icon: '📝', label: '横线', labelEn: 'Ruled' },
];

const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  isAnnotationMode,
  annotationTool,
  annotationColor,
  annotationSize,
  showAnnotationColorPicker,
  isAnnotationToolbarCollapsed,
  annotationOriginalLayout,
  paperType = 'plain',
  onSelectTool,
  onColorChange,
  onSizeChange,
  onToggleColorPicker,
  onToggleCollapsed,
  onUndo,
  onClearAll,
  onRestoreAlignment,
  onClose,
  onPaperTypeChange,
}) => {
  const { theme } = useSeasonTheme();

  if (!isAnnotationMode) return null;

  return (
    <>
      {/* Collapsed toolbar toggle button */}
      {isAnnotationToolbarCollapsed && (
        <button
          onClick={onToggleCollapsed}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-2xl border-2 transition-all hover:scale-105 active:scale-95"
          style={{
            backgroundColor: theme.accent,
            borderColor: 'white',
          }}
        >
          <span className="text-2xl">✏️</span>
          <span className="text-sm font-bold text-white">展开工具栏</span>
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}

      {/* Floating mini-toolbar */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl shadow-2xl border transition-all max-w-[95vw] ${
          isAnnotationToolbarCollapsed ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100'
        }`}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderColor: 'rgba(0, 0, 0, 0.08)',
          touchAction: 'auto',
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Tool buttons */}
        {TOOL_BUTTONS.map(({ tool, icon, label, labelEn }) => (
          <button
            key={tool}
            onClick={() => onSelectTool(tool)}
            className={`flex flex-col items-center justify-center p-1.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl transition-all ${
              annotationTool === tool
                ? 'shadow-md'
                : 'hover:bg-slate-100 opacity-70'
            }`}
            style={{
              backgroundColor: annotationTool === tool ? `${theme.accent}20` : undefined,
              border: annotationTool === tool ? `2px solid ${theme.accent}` : '2px solid transparent',
              minWidth: '36px',
            }}
            title={labelEn}
          >
            <span className="text-base leading-none">{icon}</span>
            <span className="hidden sm:block text-[9px] font-medium text-slate-500 mt-0.5">{label}</span>
          </button>
        ))}

        {/* Divider */}
        <div className="w-[1px] h-5 sm:h-6 bg-slate-200 mx-0.5 sm:mx-1" />

        {/* Color picker */}
        <div className="relative">
          <button
            onClick={onToggleColorPicker}
            className="flex flex-col items-center justify-center p-1.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl hover:bg-slate-100 transition-all"
            style={{ minWidth: '36px' }}
            title="Color"
          >
            <div
              className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: annotationColor }}
            />
            <span className="hidden sm:block text-[9px] font-medium text-slate-500 mt-0.5">颜色</span>
          </button>
          {showAnnotationColorPicker && (
            <div
              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 p-2 rounded-xl shadow-xl border"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                borderColor: 'rgba(0, 0, 0, 0.08)',
              }}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {/* Color grid */}
              <div className="flex flex-col gap-px">
                {/* Grayscale row */}
                <div className="flex gap-px">
                  {GRAYSCALE_LIGHTNESS.map((l) => {
                    const color = `hsl(0, 0%, ${l}%)`;
                    return (
                      <button
                        key={`gray-${l}`}
                        onClick={() => { onColorChange(color); }}
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-sm transition-all hover:scale-125 hover:z-10 ${
                          annotationColor === color ? 'ring-2 ring-indigo-400 z-10 scale-125' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    );
                  })}
                </div>
                {/* Hue rows: dark to light */}
                {COLOR_LIGHTNESS_ROWS.map((lightness) => (
                  <div key={`row-${lightness}`} className="flex gap-px">
                    {COLOR_HUES.map((hue) => {
                      const saturation = lightness > 75 ? 70 : lightness < 35 ? 80 : 85;
                      const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                      return (
                        <button
                          key={`${hue}-${lightness}`}
                          onClick={() => { onColorChange(color); }}
                          className={`w-5 h-5 sm:w-6 sm:h-6 rounded-sm transition-all hover:scale-125 hover:z-10 ${
                            annotationColor === color ? 'ring-2 ring-indigo-400 z-10 scale-125' : ''
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* Selected color preview */}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                <div
                  className="w-8 h-8 rounded-lg border border-slate-200 shadow-sm"
                  style={{ backgroundColor: annotationColor }}
                />
                <span className="text-[10px] text-slate-400 font-mono">{annotationColor}</span>
              </div>
            </div>
          )}
        </div>

        {/* Size controls */}
        <div className="flex items-center gap-1 px-1 sm:px-2">
          <button
            onClick={() => onSizeChange(Math.max(1, annotationSize - 1))}
            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-all text-slate-500"
            disabled={annotationSize <= 1}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-xs font-bold text-slate-600 min-w-[16px] text-center">{annotationSize}</span>
          <button
            onClick={() => onSizeChange(Math.min(12, annotationSize + 1))}
            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-all text-slate-500"
            disabled={annotationSize >= 12}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-5 sm:h-6 bg-slate-200 mx-0.5 sm:mx-1" />

        {/* Undo */}
        <button
          onClick={onUndo}
          className="flex flex-col items-center justify-center p-1.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl hover:bg-slate-100 transition-all"
          style={{ minWidth: '32px' }}
          title="Undo 撤销"
        >
          <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
          </svg>
          <span className="hidden sm:block text-[9px] font-medium text-slate-500 mt-0.5">撤销</span>
        </button>

        {/* Clear all */}
        <button
          onClick={onClearAll}
          className="flex flex-col items-center justify-center p-1.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
          style={{ minWidth: '32px' }}
          title="Clear all 清除全部"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="hidden sm:block text-[9px] font-medium text-slate-500 mt-0.5">清除</span>
        </button>

        {/* Paper type toggle */}
        {onPaperTypeChange && (
          <>
            <div className="w-[1px] h-5 sm:h-6 bg-slate-200 mx-0.5 sm:mx-1" />
            {PAPER_TYPES.map(({ type, icon, label, labelEn }) => (
              <button
                key={type}
                onClick={() => onPaperTypeChange(type)}
                className={`flex flex-col items-center justify-center p-1.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl transition-all ${
                  paperType === type
                    ? 'shadow-md'
                    : 'hover:bg-slate-100 opacity-70'
                }`}
                style={{
                  backgroundColor: paperType === type ? `${theme.accent}20` : undefined,
                  border: paperType === type ? `2px solid ${theme.accent}` : '2px solid transparent',
                  minWidth: '32px',
                }}
                title={`${labelEn} paper`}
              >
                <span className="text-sm leading-none">{icon}</span>
                <span className="hidden sm:block text-[9px] font-medium text-slate-500 mt-0.5">{label}</span>
              </button>
            ))}
          </>
        )}

        {/* Restore Alignment - only shows when annotations are misaligned */}
        {annotationOriginalLayout && (
          <>
            <div className="w-[1px] h-5 sm:h-6 bg-slate-200 mx-0.5 sm:mx-1" />
            <button
              onClick={onRestoreAlignment}
              className="flex flex-col items-center justify-center p-1.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-all animate-pulse"
              style={{ minWidth: '32px' }}
              title="Restore original font size and layout to re-align annotations 恢复标注对齐"
            >
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-[9px] font-medium text-amber-700 mt-0.5 whitespace-nowrap">对齐</span>
            </button>
          </>
        )}

        {/* Divider */}
        <div className="w-[1px] h-5 sm:h-6 bg-slate-200 mx-0.5 sm:mx-1" />

        {/* Collapse button */}
        <button
          onClick={onToggleCollapsed}
          className="flex flex-col items-center justify-center p-1.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl hover:bg-slate-100 transition-all"
          style={{ minWidth: '32px' }}
          title="收起工具栏 Collapse toolbar"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-[9px] font-medium text-slate-500 mt-0.5">收起</span>
        </button>
      </div>
    </>
  );
};

export default AnnotationToolbar;

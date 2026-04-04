/**
 * JournalBlockEditor.tsx — Block-based journal editor
 *
 * Renders an ordered list of blocks (text, drawing, image) with:
 * - Insert new blocks (text, drawing, image) between any blocks
 * - Drag-to-reorder blocks
 * - Delete / duplicate blocks
 * - Block-level undo/redo (structural changes: add, delete, reorder)
 * - Each drawing block auto-expands as user draws near the bottom
 * - Image blocks support resize via corner drag handles + pinch-zoom
 * - Image blocks support annotation overlay drawing
 * - Pagination: renders blocks in pages for performance with many blocks
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import SimpleDrawingCanvas, { SimpleDrawingCanvasHandle } from './SimpleDrawingCanvas';
import type { PaperType } from '../services/strokeNormalizer';
import {
  type JournalBlock,
  type TextBlock,
  type DrawingBlock,
  type ImageBlock,
  createTextBlock,
  createDrawingBlock,
  createImageBlock,
} from '../types/journalBlocks';

// ─── Constants ─────────────────────────────────────────────────────────

const BLOCKS_PER_PAGE = 20;
const MAX_BLOCK_HISTORY = 30;

// ─── Props ────────────────────────────────────────────────────────────

export interface JournalBlockEditorProps {
  blocks: JournalBlock[];
  onChange: (blocks: JournalBlock[]) => void;
  paperType?: PaperType;
  onImageRequest?: () => void;
}

export interface JournalBlockEditorHandle {
  undo: () => void;
  redo: () => void;
  insertImage: (src: string) => void;
  canUndo: boolean;
  canRedo: boolean;
}

// ─── Block-level undo/redo hook ────────────────────────────────────────

export function useBlockHistory(blocks: JournalBlock[], onChange: (blocks: JournalBlock[]) => void) {
  const historyRef = useRef<JournalBlock[][]>([]);
  const redoRef = useRef<JournalBlock[][]>([]);
  const skipRef = useRef(false);

  const pushHistory = useCallback((snapshot: JournalBlock[]) => {
    if (skipRef.current) return;
    historyRef.current.push(JSON.parse(JSON.stringify(snapshot)));
    if (historyRef.current.length > MAX_BLOCK_HISTORY) historyRef.current.shift();
    redoRef.current = [];
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    redoRef.current.push(JSON.parse(JSON.stringify(blocks)));
    const prev = historyRef.current.pop()!;
    skipRef.current = true;
    onChange(prev);
    skipRef.current = false;
  }, [blocks, onChange]);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    historyRef.current.push(JSON.parse(JSON.stringify(blocks)));
    if (historyRef.current.length > MAX_BLOCK_HISTORY) historyRef.current.shift();
    const next = redoRef.current.pop()!;
    skipRef.current = true;
    onChange(next);
    skipRef.current = false;
  }, [blocks, onChange]);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: historyRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
    skipRef,
  };
}

// ─── Insert menu ──────────────────────────────────────────────────────

const InsertMenu: React.FC<{
  onInsert: (type: 'text' | 'drawing' | 'image') => void;
  compact?: boolean;
}> = ({ onInsert, compact }) => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: compact ? '2px 0' : '4px 0', position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        data-testid="block-insert-btn"
        style={{
          background: 'none', border: '1px dashed #d1d5db', borderRadius: 6,
          color: '#9ca3af', cursor: 'pointer', fontSize: 12, padding: '2px 12px',
          transition: 'all 0.15s',
        }}
      >
        + Add block
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', zIndex: 50,
            background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            border: '1px solid #e5e7eb', padding: '4px 0', width: 160,
          }}>
            {[
              { type: 'text' as const, label: 'Text', icon: '\u{1F4DD}' },
              { type: 'drawing' as const, label: 'Drawing', icon: '\u{270F}\u{FE0F}' },
              { type: 'image' as const, label: 'Image', icon: '\u{1F5BC}\u{FE0F}' },
            ].map(({ type, label, icon }) => (
              <button
                key={type}
                data-testid={`insert-${type}-btn`}
                onClick={() => { onInsert(type); setOpen(false); }}
                style={{
                  width: '100%', padding: '8px 12px', textAlign: 'left', fontSize: 13,
                  border: 'none', background: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 8,
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Formatting helpers ───────────────────────────────────────────────

const FONT_SIZES: { label: string; value: string }[] = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '16px' },
  { label: 'Large', value: '20px' },
  { label: 'Extra Large', value: '28px' },
];

const PRESET_COLORS = [
  '#1f2937', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6',
  '#8b5cf6', '#ec4899', '#ffffff',
];

/** Execute a formatting command, restoring focus to the editor afterward. */
export function execFormat(command: string, value?: string) {
  document.execCommand(command, false, value);
}

/** Insert a link — prompts if no URL supplied. */
export function insertLink(url?: string) {
  const href = url ?? prompt('Enter URL:');
  if (href) document.execCommand('createLink', false, href);
}

// ─── Toolbar button ──────────────────────────────────────────────────

const tbtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '3px 5px', fontSize: 13, borderRadius: 4, color: '#4b5563',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 24, height: 26, lineHeight: 1, transition: 'background 0.12s',
};

const tbtnHover: React.CSSProperties = { background: '#eef2ff' };

const ToolbarButton: React.FC<{
  onClick: () => void;
  title: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  testId?: string;
}> = ({ onClick, title, style, children, testId }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      data-testid={testId}
      style={{ ...tbtn, ...(hovered ? tbtnHover : {}), ...style }}
    >
      {children}
    </button>
  );
};

// ─── Color picker popover ────────────────────────────────────────────

const ColorPicker: React.FC<{
  label: string;
  icon: React.ReactNode;
  onSelect: (color: string) => void;
  testId: string;
}> = ({ label, icon, onSelect, testId }) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('#000000');

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <ToolbarButton onClick={() => setOpen(!open)} title={label} testId={testId}>
        {icon}
      </ToolbarButton>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
          <div
            data-testid={`${testId}-popover`}
            style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 61,
              background: '#fff', borderRadius: 8, padding: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb',
              display: 'flex', flexWrap: 'wrap', gap: 4, width: 160,
            }}
          >
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                data-testid={`color-swatch-${c}`}
                onMouseDown={(e) => { e.preventDefault(); onSelect(c); setOpen(false); }}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: '2px solid #e5e7eb',
                  background: c, cursor: 'pointer', padding: 0,
                }}
              />
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', marginTop: 4 }}>
              <input
                type="color"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                data-testid={`${testId}-custom`}
                style={{ width: 28, height: 28, padding: 0, border: 'none', cursor: 'pointer' }}
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); onSelect(custom); setOpen(false); }}
                data-testid={`${testId}-apply`}
                style={{
                  flex: 1, padding: '4px 8px', fontSize: 11, borderRadius: 4,
                  border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca',
                  cursor: 'pointer',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Font size dropdown ──────────────────────────────────────────────

const FontSizeDropdown: React.FC<{ onSelect: (size: string) => void }> = ({ onSelect }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <ToolbarButton onClick={() => setOpen(!open)} title="Font size" testId="font-size-btn">
        <span style={{ fontSize: 11, fontWeight: 600 }}>A<span style={{ fontSize: 9 }}>A</span></span>
      </ToolbarButton>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
          <div
            data-testid="font-size-popover"
            style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 61,
              background: '#fff', borderRadius: 8, padding: '4px 0',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb',
              width: 130,
            }}
          >
            {FONT_SIZES.map(({ label, value }) => (
              <button
                key={value}
                data-testid={`font-size-${label.toLowerCase().replace(/\s+/g, '-')}`}
                onMouseDown={(e) => { e.preventDefault(); onSelect(value); setOpen(false); }}
                style={{
                  width: '100%', padding: '6px 12px', border: 'none', background: 'none',
                  textAlign: 'left', cursor: 'pointer', fontSize: parseInt(value) > 20 ? 16 : parseInt(value),
                  color: '#374151',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Toolbar divider ─────────────────────────────────────────────────

const TDiv = () => <span style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 2px', flexShrink: 0 }} />;

// ─── Text Block ───────────────────────────────────────────────────────

const TextBlockComponent: React.FC<{
  block: TextBlock;
  onChange: (block: TextBlock) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}> = ({ block, onChange, onDelete, onDuplicate }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isExternalRef = useRef(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== block.content) {
      isExternalRef.current = true;
      editorRef.current.innerHTML = block.content || '';
      isExternalRef.current = false;
    }
  }, [block.id]);

  const handleInput = () => {
    if (isExternalRef.current || !editorRef.current) return;
    onChange({
      ...block,
      content: editorRef.current.innerHTML,
      plainText: editorRef.current.innerText || '',
    });
  };

  const applyFontSize = (size: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    span.style.fontSize = size;
    range.surroundContents(span);
    handleInput();
  };

  const applyFontColor = (color: string) => {
    document.execCommand('foreColor', false, color);
    handleInput();
  };

  const applyHighlight = (color: string) => {
    document.execCommand('hiliteColor', false, color);
    handleInput();
  };

  // Primary toolbar row (always visible)
  const primaryToolbar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
    }}>
      {/* Bold / Italic / Underline / Strikethrough */}
      <ToolbarButton onClick={() => execFormat('bold')} title="Bold" testId="fmt-bold" style={{ fontWeight: 700 }}>B</ToolbarButton>
      <ToolbarButton onClick={() => execFormat('italic')} title="Italic" testId="fmt-italic" style={{ fontStyle: 'italic' }}>I</ToolbarButton>
      <ToolbarButton onClick={() => execFormat('underline')} title="Underline" testId="fmt-underline" style={{ textDecoration: 'underline' }}>U</ToolbarButton>
      <ToolbarButton onClick={() => execFormat('strikeThrough')} title="Strikethrough" testId="fmt-strikethrough" style={{ textDecoration: 'line-through' }}>S</ToolbarButton>

      <TDiv />

      {/* Alignment */}
      <ToolbarButton onClick={() => execFormat('justifyLeft')} title="Align left" testId="fmt-align-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => execFormat('justifyCenter')} title="Align center" testId="fmt-align-center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="18" y1="14" x2="6" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => execFormat('justifyRight')} title="Align right" testId="fmt-align-right">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="7" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => execFormat('justifyFull')} title="Justify" testId="fmt-align-justify">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
      </ToolbarButton>

      <TDiv />

      {/* Lists */}
      <ToolbarButton onClick={() => execFormat('insertUnorderedList')} title="Bullet list" testId="fmt-bullet-list">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => execFormat('insertOrderedList')} title="Numbered list" testId="fmt-numbered-list">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="2" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="2" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>
      </ToolbarButton>

      {/* Indent / Outdent */}
      <ToolbarButton onClick={() => execFormat('indent')} title="Indent" testId="fmt-indent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="10" x2="11" y2="10"/><line x1="21" y1="14" x2="11" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/><polyline points="3 12 7 9 7 15 3 12" fill="currentColor" stroke="none"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => execFormat('outdent')} title="Outdent" testId="fmt-outdent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="10" x2="11" y2="10"/><line x1="21" y1="14" x2="11" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/><polyline points="7 12 3 9 3 15 7 12" fill="currentColor" stroke="none"/></svg>
      </ToolbarButton>

      <TDiv />

      {/* More tools toggle (mobile-friendly) */}
      <ToolbarButton
        onClick={() => setMoreOpen(!moreOpen)}
        title="More formatting"
        testId="fmt-more-toggle"
        style={{ color: moreOpen ? '#4f46e5' : '#4b5563' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </ToolbarButton>

      {/* Block actions */}
      <span style={{ flex: 1 }} />
      <button onClick={onDuplicate} data-testid="duplicate-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 12, padding: '1px 4px' }} title="Duplicate block">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
      <button onClick={onDelete} data-testid="delete-block-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 12, padding: '1px 4px' }} title="Delete block">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      </button>
    </div>
  );

  // Secondary toolbar row (collapsible — font size, colors, link, clear)
  const secondaryToolbar = moreOpen && (
    <div
      data-testid="fmt-more-toolbar"
      style={{
        display: 'flex', alignItems: 'center', gap: 2, padding: '2px 0',
        borderTop: '1px solid #f3f4f6', flexWrap: 'wrap',
      }}
    >
      <FontSizeDropdown onSelect={applyFontSize} />
      <TDiv />
      <ColorPicker
        label="Font color"
        icon={<span style={{ fontSize: 13, borderBottom: '2px solid #ef4444' }}>A</span>}
        onSelect={applyFontColor}
        testId="font-color"
      />
      <ColorPicker
        label="Highlight"
        icon={<span style={{ fontSize: 12, background: '#fef08a', padding: '0 3px', borderRadius: 2 }}>H</span>}
        onSelect={applyHighlight}
        testId="highlight-color"
      />
      <TDiv />
      <ToolbarButton onClick={() => insertLink()} title="Insert link" testId="fmt-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => execFormat('removeFormat')} title="Clear formatting" testId="fmt-clear">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </ToolbarButton>
    </div>
  );

  return (
    <div style={{ position: 'relative' }} data-testid="text-block">
      <div style={{
        padding: '4px 8px', background: 'linear-gradient(135deg, #f8f7ff 0%, #f0f4ff 100%)',
        borderRadius: '8px 8px 0 0', border: '1px solid #e0e7ff', borderBottom: 'none',
      }}>
        {primaryToolbar}
        {secondaryToolbar}
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        data-placeholder="Write here..."
        data-testid="text-block-editor"
        style={{
          minHeight: 60, padding: '12px 16px', outline: 'none',
          fontSize: 16, lineHeight: 1.7, color: '#1f2937',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          border: '1px solid #e0e7ff', borderRadius: '0 0 8px 8px',
          background: '#fff', position: 'relative', zIndex: 2,
        }}
      />
    </div>
  );
};

// ─── Drawing Block ────────────────────────────────────────────────────

const EXPAND_THRESHOLD = 50;
const EXPAND_AMOUNT = 200;

const DrawingBlockComponent: React.FC<{
  block: DrawingBlock;
  onChange: (block: DrawingBlock) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  paperType: PaperType;
}> = ({ block, onChange, onDelete, onDuplicate, paperType }) => {
  const canvasRef = useRef<SimpleDrawingCanvasHandle>(null);
  const [height, setHeight] = useState(block.height || 300);
  const [activeTool, setActiveTool] = useState<'pen' | 'marker' | 'highlighter' | 'eraser'>('pen');
  const [activeColor, setActiveColor] = useState('#000000');
  const COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6'];

  const handleChange = useCallback((data: string) => {
    onChange({ ...block, canvasData: data, height });
  }, [block, height, onChange]);

  const handleDrawingChange = useCallback((data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed?.strokes?.length > 0) {
        const lastStroke = parsed.strokes[parsed.strokes.length - 1];
        const maxY = Math.max(...lastStroke.points.map((p: { y: number }) => p.y));
        if (maxY > 1 - (EXPAND_THRESHOLD / height)) {
          const newHeight = height + EXPAND_AMOUNT;
          setHeight(newHeight);
          onChange({ ...block, canvasData: data, height: newHeight });
          return;
        }
      }
    } catch { /* ignore parse errors */ }
    handleChange(data);
  }, [block, height, onChange, handleChange]);

  return (
    <div data-testid="drawing-block" style={{ border: '1px solid #f3f4f6', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
        background: '#fafafa', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>Drawing</span>
        <span style={{ flex: 1 }} />
        {(['pen', 'marker', 'highlighter', 'eraser'] as const).map(t => (
          <button key={t} onClick={() => { setActiveTool(t); canvasRef.current?.setTool(t); }}
            style={{
              fontSize: 12, padding: '2px 4px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: activeTool === t ? '#e0e7ff' : 'transparent',
            }}
            title={t}>
            {t === 'pen' ? '\u270F\u{FE0F}' : t === 'marker' ? '\u{1F58A}\u{FE0F}' : t === 'highlighter' ? '\u{1F58D}\u{FE0F}' : '\u{1F9F9}'}
          </button>
        ))}
        <button data-testid="undo-btn" onClick={() => canvasRef.current?.undo()} style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent' }} title="Undo">{'\u21A9\u{FE0F}'}</button>
        <button data-testid="redo-btn" onClick={() => canvasRef.current?.redo?.()} style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent' }} title="Redo">{'\u21AA\u{FE0F}'}</button>
        <span style={{ width: 1, height: 14, background: '#e5e7eb' }} />
        {COLORS.map(c => (
          <button key={c} onClick={() => { setActiveColor(c); canvasRef.current?.setColor(c); }}
            style={{
              width: 14, height: 14, borderRadius: '50%', backgroundColor: c, padding: 0,
              border: activeColor === c ? '2px solid #4f46e5' : '2px solid transparent',
              cursor: 'pointer',
            }} />
        ))}
        <span style={{ width: 1, height: 14, background: '#e5e7eb' }} />
        <button onClick={onDuplicate} data-testid="duplicate-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 12, padding: '1px 4px' }} title="Duplicate block">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        <button onClick={onDelete} data-testid="delete-block-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 12, padding: '1px 4px' }} title="Delete block">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <SimpleDrawingCanvas
          ref={canvasRef}
          onChange={handleDrawingChange}
          initialData={block.canvasData || undefined}
          isWritingMode={true}
          canvasHeight={height}
          paperType={paperType}
        />
      </div>
    </div>
  );
};

// ─── Image Block with pinch-zoom ──────────────────────────────────────

const ImageBlockComponent: React.FC<{
  block: ImageBlock;
  onChange: (block: ImageBlock) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  paperType: PaperType;
}> = ({ block, onChange, onDelete, onDuplicate, paperType }) => {
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<SimpleDrawingCanvasHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);

  const handleAnnotationChange = useCallback((data: string) => {
    onChange({ ...block, annotationData: data });
  }, [block, onChange]);

  // Pinch-zoom handler
  useEffect(() => {
    const el = imgRef.current;
    if (!el || isAnnotating) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStartRef.current = { dist: Math.hypot(dx, dy), zoom };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const scale = dist / pinchStartRef.current.dist;
        setZoom(Math.max(0.5, Math.min(3, pinchStartRef.current.zoom * scale)));
      }
    };

    const onTouchEnd = () => {
      pinchStartRef.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [isAnnotating, zoom]);

  // Resize via corner drag
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const container = containerRef.current;
    if (!container) return;
    const parentWidth = container.parentElement?.clientWidth || 600;
    resizeStartRef.current = { startX: clientX, startWidth: (block.width / 100) * parentWidth };
    setIsResizing(true);

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!resizeStartRef.current) return;
      const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const dx = cx - resizeStartRef.current.startX;
      const newWidth = resizeStartRef.current.startWidth + dx;
      const pct = Math.max(10, Math.min(100, (newWidth / (container.parentElement?.clientWidth || 600)) * 100));
      onChange({ ...block, width: Math.round(pct) });
    };

    const handleEnd = () => {
      resizeStartRef.current = null;
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  }, [block, onChange]);

  return (
    <div data-testid="image-block" style={{ position: 'relative', border: '1px solid #f3f4f6', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
        background: '#fafafa', borderBottom: '1px solid #f3f4f6',
      }}>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>Image ({block.width}%){zoom !== 1 ? ` ${Math.round(zoom * 100)}%` : ''}</span>
        <span style={{ flex: 1 }} />
        {zoom !== 1 && (
          <button onClick={() => setZoom(1)} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', background: '#f3f4f6', color: '#6b7280', border: 'none' }}>Reset zoom</button>
        )}
        <button
          onClick={() => setIsAnnotating(!isAnnotating)}
          data-testid="annotate-btn"
          style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
            background: isAnnotating ? '#e0e7ff' : '#f3f4f6',
            color: isAnnotating ? '#4f46e5' : '#6b7280',
            border: 'none',
          }}
        >
          {isAnnotating ? 'Done' : '\u{270F}\u{FE0F} Annotate'}
        </button>
        <button onClick={onDuplicate} data-testid="duplicate-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 12, padding: '1px 4px' }} title="Duplicate block">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        <button onClick={onDelete} data-testid="delete-block-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 12, padding: '1px 4px' }} title="Delete block">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
      <div ref={containerRef} style={{
        position: 'relative', width: `${block.width}%`, margin: '0 auto', padding: '8px 0',
        overflow: zoom > 1 ? 'auto' : 'visible',
      }}>
        <img
          ref={imgRef}
          src={block.src}
          alt={block.caption || 'Journal image'}
          data-testid="image-element"
          style={{
            width: '100%', borderRadius: 6, display: 'block',
            pointerEvents: isAnnotating ? 'none' : 'auto',
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            transition: 'transform 0.1s ease-out',
          }}
          draggable={false}
        />
        {/* Annotation overlay */}
        {isAnnotating && (
          <div style={{ position: 'absolute', inset: 0, top: 8, bottom: 8, zIndex: 10 }}>
            <SimpleDrawingCanvas
              ref={canvasRef}
              onChange={handleAnnotationChange}
              initialData={block.annotationData || undefined}
              overlayMode={true}
              isWritingMode={true}
              paperType="plain"
            />
          </div>
        )}
        {/* Existing annotation display (when not annotating) */}
        {!isAnnotating && block.annotationData && (
          <div style={{ position: 'absolute', inset: 0, top: 8, bottom: 8, pointerEvents: 'none' }}>
            <SimpleDrawingCanvas
              onChange={() => {}}
              initialData={block.annotationData}
              overlayMode={true}
              isWritingMode={false}
              paperType="plain"
            />
          </div>
        )}
        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          data-testid="resize-handle"
          style={{
            position: 'absolute', bottom: 8, right: 0, width: 20, height: 20,
            cursor: 'se-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(79,70,229,0.1)', borderRadius: '4px 0 4px 0',
            opacity: isResizing ? 1 : 0.5, transition: 'opacity 0.15s',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="#4f46e5" opacity="0.6">
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="4" cy="8" r="1.5" />
            <circle cx="8" cy="4" r="1.5" />
          </svg>
        </div>
      </div>
      {/* Caption */}
      <input
        value={block.caption || ''}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder="Add caption..."
        data-testid="image-caption"
        style={{
          width: '100%', padding: '4px 12px 6px', fontSize: 12, color: '#6b7280',
          border: 'none', borderTop: '1px solid #f3f4f6', outline: 'none',
          fontStyle: 'italic', background: '#fafafa',
        }}
      />
    </div>
  );
};

// ─── Drag handle ──────────────────────────────────────────────────────

const DragHandle: React.FC<{
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  isDragging: boolean;
  isDragOver: boolean;
}> = ({ onDragStart, onDragEnd, onDragOver, isDragging, isDragOver }) => (
  <div
    draggable
    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
    onDragEnd={onDragEnd}
    onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
    data-testid="drag-handle"
    style={{
      width: 20, cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#d1d5db', fontSize: 14, userSelect: 'none', flexShrink: 0,
      opacity: isDragging ? 0.3 : 1,
      background: isDragOver ? '#eef2ff' : 'transparent',
      borderRadius: 4, transition: 'background 0.15s',
    }}
  >
    <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="8" cy="4" r="1.5" />
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="8" cy="10" r="1.5" />
      <circle cx="4" cy="16" r="1.5" />
      <circle cx="8" cy="16" r="1.5" />
    </svg>
  </div>
);

// ─── Main Block Editor ────────────────────────────────────────────────

const JournalBlockEditor: React.FC<JournalBlockEditorProps> = ({
  blocks,
  onChange,
  paperType = 'plain',
  onImageRequest,
}) => {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [visiblePages, setVisiblePages] = useState(1);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const pendingImageIdxRef = useRef<number | null>(null);

  // Block-level undo/redo
  const { pushHistory, undo, redo, skipRef } = useBlockHistory(blocks, onChange);

  // Pagination: infinite scroll
  const visibleBlocks = useMemo(() => {
    const end = visiblePages * BLOCKS_PER_PAGE;
    return blocks.slice(0, end);
  }, [blocks, visiblePages]);

  const hasMore = visibleBlocks.length < blocks.length;

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisiblePages(p => p + 1);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  // Keyboard shortcut for block-level undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      } else if (isMeta && e.key === 'z') {
        // Only intercept for block-level undo when not focused inside a text editor
        const active = document.activeElement;
        if (active && (active as HTMLElement).contentEditable === 'true') return;
        e.preventDefault();
        undo();
      } else if (isMeta && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const withHistory = useCallback((fn: () => JournalBlock[]) => {
    pushHistory(blocks);
    const next = fn();
    onChange(next);
  }, [blocks, onChange, pushHistory]);

  const updateBlock = useCallback((idx: number, updated: JournalBlock) => {
    const next = [...blocks];
    next[idx] = updated;
    // Content edits don't push block-level history (drawing canvas has its own undo)
    if (skipRef.current) return;
    onChange(next);
  }, [blocks, onChange, skipRef]);

  const deleteBlock = useCallback((idx: number) => {
    if (blocks.length <= 1) return;
    withHistory(() => blocks.filter((_, i) => i !== idx));
  }, [blocks, withHistory]);

  const duplicateBlock = useCallback((idx: number) => {
    withHistory(() => {
      const next = [...blocks];
      const clone: JournalBlock = JSON.parse(JSON.stringify(blocks[idx]));
      clone.id = `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      next.splice(idx + 1, 0, clone);
      return next;
    });
  }, [blocks, withHistory]);

  const insertBlock = useCallback((afterIdx: number, type: 'text' | 'drawing' | 'image') => {
    if (type === 'image') {
      pendingImageIdxRef.current = afterIdx + 1;
      onImageRequest?.();
      return;
    }
    withHistory(() => {
      const next = [...blocks];
      const newBlock = type === 'text' ? createTextBlock() : createDrawingBlock(300);
      next.splice(afterIdx + 1, 0, newBlock);
      return next;
    });
  }, [blocks, onImageRequest, withHistory]);

  const insertImageAtPending = useCallback((src: string) => {
    const idx = pendingImageIdxRef.current ?? blocks.length;
    pendingImageIdxRef.current = null;
    withHistory(() => {
      const next = [...blocks];
      next.splice(idx, 0, createImageBlock(src));
      return next;
    });
  }, [blocks, withHistory]);

  // Expose insertImage for parent
  (JournalBlockEditor as any).__insertImage = insertImageAtPending;

  // Drag reorder
  const handleDragEnd = useCallback(() => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      withHistory(() => {
        const next = [...blocks];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(dragOverIdx, 0, moved);
        return next;
      });
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, dragOverIdx, blocks, withHistory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }} data-testid="block-editor">
      {/* Block-level undo/redo toolbar */}
      <div style={{ display: 'flex', gap: 4, padding: '0 8px', justifyContent: 'flex-end' }}>
        <button data-testid="block-undo-btn" onClick={undo} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#fff', color: '#6b7280' }} title="Undo block operation">
          {'\u21A9\u{FE0F}'} Undo
        </button>
        <button data-testid="block-redo-btn" onClick={redo} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#fff', color: '#6b7280' }} title="Redo block operation">
          {'\u21AA\u{FE0F}'} Redo
        </button>
      </div>

      {/* Insert before first block */}
      <InsertMenu onInsert={(type) => insertBlock(-1, type)} compact />

      {visibleBlocks.map((block, idx) => (
        <React.Fragment key={block.id}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
            <DragHandle
              onDragStart={() => setDragIdx(idx)}
              onDragEnd={handleDragEnd}
              onDragOver={() => setDragOverIdx(idx)}
              isDragging={dragIdx === idx}
              isDragOver={dragOverIdx === idx}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              {block.type === 'text' && (
                <TextBlockComponent
                  block={block}
                  onChange={(b) => updateBlock(idx, b)}
                  onDelete={() => deleteBlock(idx)}
                  onDuplicate={() => duplicateBlock(idx)}
                />
              )}
              {block.type === 'drawing' && (
                <DrawingBlockComponent
                  block={block as DrawingBlock}
                  onChange={(b) => updateBlock(idx, b)}
                  onDelete={() => deleteBlock(idx)}
                  onDuplicate={() => duplicateBlock(idx)}
                  paperType={paperType}
                />
              )}
              {block.type === 'image' && (
                <ImageBlockComponent
                  block={block as ImageBlock}
                  onChange={(b) => updateBlock(idx, b)}
                  onDelete={() => deleteBlock(idx)}
                  onDuplicate={() => duplicateBlock(idx)}
                  paperType={paperType}
                />
              )}
            </div>
          </div>
          <InsertMenu onInsert={(type) => insertBlock(idx, type)} compact />
        </React.Fragment>
      ))}

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} style={{ padding: '12px 0', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading more blocks...</span>
        </div>
      )}

      {/* Block count info */}
      {blocks.length > BLOCKS_PER_PAGE && (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>
          Showing {visibleBlocks.length} of {blocks.length} blocks
        </div>
      )}
    </div>
  );
};

export default JournalBlockEditor;

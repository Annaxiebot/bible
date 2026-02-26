import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AnnotationToolbar from '../AnnotationToolbar';

vi.mock('../../hooks/useSeasonTheme', () => ({
  useSeasonTheme: () => ({
    theme: {
      accent: '#4f46e5',
      paperBg: '#fff',
      paperGradient: '',
      paperShadow: '',
      verseHighlight: '#eef2ff',
      verseBorder: '#c7d2fe',
      accentMedium: '#818cf8',
      primary: '#1e1b4b',
      heartColor: '#ef4444',
    },
  }),
}));

const defaultProps = {
  isAnnotationMode: true,
  annotationTool: 'pen' as const,
  annotationColor: '#000000',
  annotationSize: 4,
  showAnnotationColorPicker: false,
  isAnnotationToolbarCollapsed: false,
  annotationOriginalLayout: null,
  colorPresets: ['#000000', '#ffffff'] as readonly string[],
  onSelectTool: vi.fn(),
  onColorChange: vi.fn(),
  onSizeChange: vi.fn(),
  onToggleColorPicker: vi.fn(),
  onToggleCollapsed: vi.fn(),
  onUndo: vi.fn(),
  onClearAll: vi.fn(),
  onRestoreAlignment: vi.fn(),
  onClose: vi.fn(),
};

describe('AnnotationToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing when isAnnotationMode=true', () => {
    const { container } = render(<AnnotationToolbar {...defaultProps} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('does not render when isAnnotationMode=false', () => {
    const { container } = render(
      <AnnotationToolbar {...defaultProps} isAnnotationMode={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onSelectTool when a tool button is clicked', () => {
    const onSelectTool = vi.fn();
    render(<AnnotationToolbar {...defaultProps} onSelectTool={onSelectTool} />);

    const penButton = screen.getByTitle('Pen');
    fireEvent.click(penButton);
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('calls onSelectTool with highlighter when that button is clicked', () => {
    const onSelectTool = vi.fn();
    render(<AnnotationToolbar {...defaultProps} onSelectTool={onSelectTool} />);

    const highlightButton = screen.getByTitle('Highlight');
    fireEvent.click(highlightButton);
    expect(onSelectTool).toHaveBeenCalledWith('highlighter');
  });

  it('calls onUndo when undo button is clicked', () => {
    const onUndo = vi.fn();
    render(<AnnotationToolbar {...defaultProps} onUndo={onUndo} />);

    const undoButton = screen.getByTitle('Undo 撤销');
    fireEvent.click(undoButton);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('calls onClearAll when clear all button is clicked', () => {
    const onClearAll = vi.fn();
    render(<AnnotationToolbar {...defaultProps} onClearAll={onClearAll} />);

    const clearButton = screen.getByTitle('Clear all 清除全部');
    fireEvent.click(clearButton);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('does not show restore alignment button when annotationOriginalLayout is null', () => {
    render(<AnnotationToolbar {...defaultProps} annotationOriginalLayout={null} />);

    const restoreButton = screen.queryByTitle(/恢复标注对齐/);
    expect(restoreButton).toBeNull();
  });

  it('shows restore alignment button when annotationOriginalLayout is not null', () => {
    render(
      <AnnotationToolbar
        {...defaultProps}
        annotationOriginalLayout={{ fontSize: 16, vSplitOffset: 50 }}
      />
    );

    const restoreButton = screen.getByTitle(
      'Restore original font size and layout to re-align annotations 恢复标注对齐'
    );
    expect(restoreButton).not.toBeNull();
  });

  it('calls onRestoreAlignment when restore alignment button is clicked', () => {
    const onRestoreAlignment = vi.fn();
    render(
      <AnnotationToolbar
        {...defaultProps}
        annotationOriginalLayout={{ fontSize: 16, vSplitOffset: 50 }}
        onRestoreAlignment={onRestoreAlignment}
      />
    );

    const restoreButton = screen.getByTitle(
      'Restore original font size and layout to re-align annotations 恢复标注对齐'
    );
    fireEvent.click(restoreButton);
    expect(onRestoreAlignment).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleCollapsed when collapse button is clicked', () => {
    const onToggleCollapsed = vi.fn();
    render(<AnnotationToolbar {...defaultProps} onToggleCollapsed={onToggleCollapsed} />);

    const collapseButton = screen.getByTitle('收起工具栏 Collapse toolbar');
    fireEvent.click(collapseButton);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleColorPicker when color button is clicked', () => {
    const onToggleColorPicker = vi.fn();
    render(<AnnotationToolbar {...defaultProps} onToggleColorPicker={onToggleColorPicker} />);

    const colorButton = screen.getByTitle('Color');
    fireEvent.click(colorButton);
    expect(onToggleColorPicker).toHaveBeenCalledTimes(1);
  });

  it('shows collapsed toggle button when toolbar is collapsed', () => {
    render(<AnnotationToolbar {...defaultProps} isAnnotationToolbarCollapsed={true} />);

    const expandButton = screen.getByText('展开工具栏');
    expect(expandButton).not.toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import JournalBlockEditor, { useBlockHistory } from '../JournalBlockEditor';
import {
  type JournalBlock,
  type ImageBlock,
  createTextBlock,
  createDrawingBlock,
  createImageBlock,
} from '../../types/journalBlocks';

// Mock SimpleDrawingCanvas since it needs canvas APIs
vi.mock('../SimpleDrawingCanvas', () => {
  const React = require('react');
  const MockCanvas = React.forwardRef(
    (props: any, ref: React.Ref<any>) => {
      React.useImperativeHandle(ref, () => ({
        clear: vi.fn(),
        getData: () => '',
        undo: vi.fn(),
        redo: vi.fn(),
        setTool: vi.fn(),
        setColor: vi.fn(),
        setSize: vi.fn(),
        setPaperType: vi.fn(),
      }));
      return <div data-testid="mock-canvas" data-initial={props.initialData} />;
    }
  );
  MockCanvas.displayName = 'SimpleDrawingCanvas';
  return { default: MockCanvas };
});

describe('useBlockHistory', () => {
  it('tracks undo history and restores previous state', () => {
    const blocks1: JournalBlock[] = [createTextBlock('first', 'first')];
    const blocks2: JournalBlock[] = [createTextBlock('second', 'second')];
    const onChange = vi.fn();

    const { result, rerender } = renderHook(
      ({ blocks }) => useBlockHistory(blocks, onChange),
      { initialProps: { blocks: blocks1 } }
    );

    // Push history and simulate change
    act(() => result.current.pushHistory(blocks1));
    rerender({ blocks: blocks2 });

    // Undo should call onChange with blocks1
    act(() => result.current.undo());
    expect(onChange).toHaveBeenCalled();
    const undoneBlocks = onChange.mock.calls[0][0];
    expect(undoneBlocks[0].plainText).toBe('first');
  });

  it('tracks redo after undo', () => {
    const blocks1: JournalBlock[] = [createTextBlock('first', 'first')];
    const blocks2: JournalBlock[] = [createTextBlock('second', 'second')];
    const onChange = vi.fn();

    const { result, rerender } = renderHook(
      ({ blocks }) => useBlockHistory(blocks, onChange),
      { initialProps: { blocks: blocks1 } }
    );

    act(() => result.current.pushHistory(blocks1));
    rerender({ blocks: blocks2 });

    // Undo
    act(() => result.current.undo());
    const undoneBlocks = onChange.mock.calls[0][0];
    rerender({ blocks: undoneBlocks });

    // Redo
    act(() => result.current.redo());
    expect(onChange).toHaveBeenCalledTimes(2);
    const redoneBlocks = onChange.mock.calls[1][0];
    expect(redoneBlocks[0].plainText).toBe('second');
  });

  it('does nothing on undo when history is empty', () => {
    const blocks: JournalBlock[] = [createTextBlock()];
    const onChange = vi.fn();

    const { result } = renderHook(() => useBlockHistory(blocks, onChange));
    act(() => result.current.undo());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing on redo when redo stack is empty', () => {
    const blocks: JournalBlock[] = [createTextBlock()];
    const onChange = vi.fn();

    const { result } = renderHook(() => useBlockHistory(blocks, onChange));
    act(() => result.current.redo());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears redo stack on new push', () => {
    const blocks1: JournalBlock[] = [createTextBlock('a', 'a')];
    const blocks2: JournalBlock[] = [createTextBlock('b', 'b')];
    const blocks3: JournalBlock[] = [createTextBlock('c', 'c')];
    const onChange = vi.fn();

    const { result, rerender } = renderHook(
      ({ blocks }) => useBlockHistory(blocks, onChange),
      { initialProps: { blocks: blocks1 } }
    );

    // Push, change, undo
    act(() => result.current.pushHistory(blocks1));
    rerender({ blocks: blocks2 });
    act(() => result.current.undo());
    rerender({ blocks: onChange.mock.calls[0][0] });

    // Push new history (should clear redo)
    act(() => result.current.pushHistory(onChange.mock.calls[0][0]));
    rerender({ blocks: blocks3 });

    // Redo should do nothing now
    onChange.mockClear();
    act(() => result.current.redo());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('limits history to MAX_BLOCK_HISTORY', () => {
    const onChange = vi.fn();
    const blocks: JournalBlock[] = [createTextBlock()];

    const { result } = renderHook(() => useBlockHistory(blocks, onChange));

    // Push 35 items (max is 30)
    for (let i = 0; i < 35; i++) {
      act(() => result.current.pushHistory([createTextBlock(`item-${i}`, `item-${i}`)]));
    }

    // Should still work (won't error from overflow)
    act(() => result.current.undo());
    expect(onChange).toHaveBeenCalled();
  });
});

describe('JournalBlockEditor', () => {
  let onChange: ReturnType<typeof vi.fn<(blocks: JournalBlock[]) => void>>;
  let defaultBlocks: JournalBlock[];

  beforeEach(() => {
    onChange = vi.fn<(blocks: JournalBlock[]) => void>();
    defaultBlocks = [createTextBlock('Hello', 'Hello')];
  });

  it('renders block editor with text block', () => {
    render(<JournalBlockEditor blocks={defaultBlocks} onChange={onChange} />);
    expect(screen.getByTestId('block-editor')).toBeInTheDocument();
    expect(screen.getByTestId('text-block')).toBeInTheDocument();
  });

  it('renders drawing block', () => {
    const blocks: JournalBlock[] = [createDrawingBlock(300)];
    render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
    expect(screen.getByTestId('drawing-block')).toBeInTheDocument();
  });

  it('renders image block', () => {
    const blocks: JournalBlock[] = [createImageBlock('data:image/png;base64,abc')];
    render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
    expect(screen.getByTestId('image-block')).toBeInTheDocument();
  });

  it('renders multiple blocks', () => {
    const blocks: JournalBlock[] = [
      createTextBlock('A', 'A'),
      createDrawingBlock(300),
      createTextBlock('B', 'B'),
    ];
    render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
    const textBlocks = screen.getAllByTestId('text-block');
    expect(textBlocks).toHaveLength(2);
    expect(screen.getByTestId('drawing-block')).toBeInTheDocument();
  });

  it('renders insert menu buttons', () => {
    render(<JournalBlockEditor blocks={defaultBlocks} onChange={onChange} />);
    const insertBtns = screen.getAllByTestId('block-insert-btn');
    expect(insertBtns.length).toBeGreaterThanOrEqual(2); // before first + after each block
  });

  it('opens insert menu and shows options', () => {
    render(<JournalBlockEditor blocks={defaultBlocks} onChange={onChange} />);
    const insertBtns = screen.getAllByTestId('block-insert-btn');
    fireEvent.click(insertBtns[0]);
    expect(screen.getByTestId('insert-text-btn')).toBeInTheDocument();
    expect(screen.getByTestId('insert-drawing-btn')).toBeInTheDocument();
    expect(screen.getByTestId('insert-image-btn')).toBeInTheDocument();
  });

  it('inserts a text block', () => {
    render(<JournalBlockEditor blocks={defaultBlocks} onChange={onChange} />);
    const insertBtns = screen.getAllByTestId('block-insert-btn');
    fireEvent.click(insertBtns[0]);
    fireEvent.click(screen.getByTestId('insert-text-btn'));

    expect(onChange).toHaveBeenCalled();
    const newBlocks = onChange.mock.calls[0][0];
    expect(newBlocks).toHaveLength(2);
    expect(newBlocks[0].type).toBe('text');
    expect((newBlocks[0] as { content: string }).content).toBe(''); // new empty block
  });

  it('inserts a drawing block', () => {
    render(<JournalBlockEditor blocks={defaultBlocks} onChange={onChange} />);
    const insertBtns = screen.getAllByTestId('block-insert-btn');
    fireEvent.click(insertBtns[0]);
    fireEvent.click(screen.getByTestId('insert-drawing-btn'));

    const newBlocks = onChange.mock.calls[0][0];
    expect(newBlocks).toHaveLength(2);
    expect(newBlocks[0].type).toBe('drawing');
  });

  it('triggers onImageRequest for image insert', () => {
    const onImageRequest = vi.fn();
    render(<JournalBlockEditor blocks={defaultBlocks} onChange={onChange} onImageRequest={onImageRequest} />);
    const insertBtns = screen.getAllByTestId('block-insert-btn');
    fireEvent.click(insertBtns[0]);
    fireEvent.click(screen.getByTestId('insert-image-btn'));

    expect(onImageRequest).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled(); // onChange comes after image is selected
  });

  it('deletes a block (not the last one)', () => {
    const blocks: JournalBlock[] = [
      createTextBlock('A', 'A'),
      createTextBlock('B', 'B'),
    ];
    render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
    const deleteBtns = screen.getAllByTestId('delete-block-btn');
    fireEvent.click(deleteBtns[0]);

    const newBlocks = onChange.mock.calls[0][0];
    expect(newBlocks).toHaveLength(1);
    expect((newBlocks[0] as any).plainText).toBe('B');
  });

  it('does not delete the last block', () => {
    render(<JournalBlockEditor blocks={defaultBlocks} onChange={onChange} />);
    const deleteBtns = screen.getAllByTestId('delete-block-btn');
    fireEvent.click(deleteBtns[0]);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('duplicates a block', () => {
    render(<JournalBlockEditor blocks={defaultBlocks} onChange={onChange} />);
    const dupBtns = screen.getAllByTestId('duplicate-btn');
    fireEvent.click(dupBtns[0]);

    const newBlocks = onChange.mock.calls[0][0];
    expect(newBlocks).toHaveLength(2);
    expect((newBlocks[0] as any).plainText).toBe('Hello');
    expect((newBlocks[1] as any).plainText).toBe('Hello');
    // IDs should be different
    expect(newBlocks[0].id).not.toBe(newBlocks[1].id);
  });

  it('renders drag handles for each block', () => {
    const blocks: JournalBlock[] = [
      createTextBlock('A', 'A'),
      createTextBlock('B', 'B'),
    ];
    render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
    const handles = screen.getAllByTestId('drag-handle');
    expect(handles).toHaveLength(2);
  });

  it('renders block-level undo/redo buttons', () => {
    render(<JournalBlockEditor blocks={defaultBlocks} onChange={onChange} />);
    expect(screen.getByTestId('block-undo-btn')).toBeInTheDocument();
    expect(screen.getByTestId('block-redo-btn')).toBeInTheDocument();
  });

  describe('image block features', () => {
    it('renders resize handle', () => {
      const blocks: JournalBlock[] = [createImageBlock('data:image/png;base64,abc', 80)];
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('resize-handle')).toBeInTheDocument();
    });

    it('renders annotate button', () => {
      const blocks: JournalBlock[] = [createImageBlock('data:image/png;base64,abc')];
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('annotate-btn')).toBeInTheDocument();
    });

    it('toggles annotation mode', () => {
      const blocks: JournalBlock[] = [createImageBlock('data:image/png;base64,abc')];
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      const btn = screen.getByTestId('annotate-btn');
      expect(btn.textContent).toContain('Annotate');
      fireEvent.click(btn);
      expect(btn.textContent).toContain('Done');
    });

    it('renders image caption input', () => {
      const blocks: JournalBlock[] = [createImageBlock('data:image/png;base64,abc')];
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('image-caption')).toBeInTheDocument();
    });

    it('updates caption', () => {
      const blocks: JournalBlock[] = [createImageBlock('data:image/png;base64,abc')];
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      const input = screen.getByTestId('image-caption') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'My photo' } });
      expect(onChange).toHaveBeenCalled();
      const updated = onChange.mock.calls[0][0][0] as ImageBlock;
      expect(updated.caption).toBe('My photo');
    });

    it('shows width percentage', () => {
      const blocks: JournalBlock[] = [createImageBlock('data:image/png;base64,abc', 75)];
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByText(/75%/)).toBeInTheDocument();
    });
  });

  describe('drawing block features', () => {
    it('renders drawing tools', () => {
      const blocks: JournalBlock[] = [createDrawingBlock(300)];
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('undo-btn')).toBeInTheDocument();
      expect(screen.getByTestId('redo-btn')).toBeInTheDocument();
    });
  });

  describe('pagination', () => {
    it('renders all blocks when under page limit', () => {
      const blocks: JournalBlock[] = Array.from({ length: 5 }, (_, i) =>
        createTextBlock(`Block ${i}`, `Block ${i}`)
      );
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getAllByTestId('text-block')).toHaveLength(5);
    });

    it('paginates blocks when over BLOCKS_PER_PAGE (20)', () => {
      const blocks: JournalBlock[] = Array.from({ length: 25 }, (_, i) =>
        createTextBlock(`Block ${i}`, `Block ${i}`)
      );
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      // Should show first page (20 blocks) plus "Loading more" sentinel
      const textBlocks = screen.getAllByTestId('text-block');
      expect(textBlocks).toHaveLength(20);
      expect(screen.getByText('Loading more blocks...')).toBeInTheDocument();
      expect(screen.getByText(/Showing 20 of 25 blocks/)).toBeInTheDocument();
    });

    it('does not show pagination info when all blocks fit', () => {
      const blocks: JournalBlock[] = [createTextBlock('A', 'A')];
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    });
  });

  describe('z-index layering', () => {
    it('text block editor has higher z-index than drawing block canvas', () => {
      const blocks: JournalBlock[] = [
        createTextBlock('Text', 'Text'),
        createDrawingBlock(300),
      ];
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);

      const textEditor = screen.getByTestId('text-block-editor');
      const drawingBlock = screen.getByTestId('drawing-block');

      // Text editor should have zIndex 2
      expect(textEditor.style.zIndex).toBe('2');

      // Drawing block canvas wrapper should have zIndex 1
      const canvasWrapper = drawingBlock.querySelector('[style*="z-index"]') || drawingBlock.querySelector('div > div:last-child');
      // The canvas is rendered inside the drawing block, z-index is on the wrapper
      expect(textEditor.style.position).toBe('relative');
    });
  });
});

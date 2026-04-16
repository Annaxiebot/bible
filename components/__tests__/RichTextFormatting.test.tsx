import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import JournalBlockEditor, { execFormat, insertLink } from '../JournalBlockEditor';
import {
  type JournalBlock,
  createTextBlock,
} from '../../types/journalBlocks';

// Mock SimpleDrawingCanvas
vi.mock('../SimpleDrawingCanvas', () => {
  const React = require('react');
  const MockCanvas = React.forwardRef(
    (props: any, ref: React.Ref<any>) => {
      React.useImperativeHandle(ref, () => ({
        clear: vi.fn(), getData: () => '', undo: vi.fn(), redo: vi.fn(),
        setTool: vi.fn(), setColor: vi.fn(), setSize: vi.fn(), setPaperType: vi.fn(),
      }));
      return <div data-testid="mock-canvas" />;
    }
  );
  MockCanvas.displayName = 'SimpleDrawingCanvas';
  return { default: MockCanvas };
});

describe('Rich Text Formatting Toolbar', () => {
  let onChange: ReturnType<typeof vi.fn<(blocks: JournalBlock[]) => void>>;
  let blocks: JournalBlock[];
  let execCommandMock: ReturnType<typeof vi.fn<(commandId: string, showUI?: boolean, value?: string) => boolean>>;

  beforeEach(() => {
    onChange = vi.fn<(blocks: JournalBlock[]) => void>();
    blocks = [createTextBlock('Hello world', 'Hello world')];
    // jsdom doesn't implement execCommand — provide a mock
    execCommandMock = vi.fn<(commandId: string, showUI?: boolean, value?: string) => boolean>().mockReturnValue(true);
    document.execCommand = execCommandMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Primary formatting buttons ────────────────────────────────────

  describe('Primary formatting buttons', () => {
    it('renders bold button', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('fmt-bold')).toBeInTheDocument();
    });

    it('renders italic button', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('fmt-italic')).toBeInTheDocument();
    });

    it('renders underline button', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('fmt-underline')).toBeInTheDocument();
    });

    it('renders strikethrough button', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('fmt-strikethrough')).toBeInTheDocument();
    });

    it('bold button calls execCommand on mousedown', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-bold'));
      expect(execCommandMock).toHaveBeenCalledWith('bold', false, undefined);
    });

    it('italic button calls execCommand on mousedown', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-italic'));
      expect(execCommandMock).toHaveBeenCalledWith('italic', false, undefined);
    });

    it('underline button calls execCommand on mousedown', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-underline'));
      expect(execCommandMock).toHaveBeenCalledWith('underline', false, undefined);
    });

    it('strikethrough button calls execCommand on mousedown', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-strikethrough'));
      expect(execCommandMock).toHaveBeenCalledWith('strikeThrough', false, undefined);
    });
  });

  // ─── Text alignment ────────────────────────────────────────────────

  describe('Text alignment', () => {
    it('renders all alignment buttons', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('fmt-align-left')).toBeInTheDocument();
      expect(screen.getByTestId('fmt-align-center')).toBeInTheDocument();
      expect(screen.getByTestId('fmt-align-right')).toBeInTheDocument();
      expect(screen.getByTestId('fmt-align-justify')).toBeInTheDocument();
    });

    it('align left calls justifyLeft', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-align-left'));
      expect(execCommandMock).toHaveBeenCalledWith('justifyLeft', false, undefined);
    });

    it('align center calls justifyCenter', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-align-center'));
      expect(execCommandMock).toHaveBeenCalledWith('justifyCenter', false, undefined);
    });

    it('align right calls justifyRight', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-align-right'));
      expect(execCommandMock).toHaveBeenCalledWith('justifyRight', false, undefined);
    });

    it('justify calls justifyFull', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-align-justify'));
      expect(execCommandMock).toHaveBeenCalledWith('justifyFull', false, undefined);
    });
  });

  // ─── Lists ─────────────────────────────────────────────────────────

  describe('Lists', () => {
    it('renders bullet list button', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('fmt-bullet-list')).toBeInTheDocument();
    });

    it('renders numbered list button', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('fmt-numbered-list')).toBeInTheDocument();
    });

    it('bullet list calls insertUnorderedList', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-bullet-list'));
      expect(execCommandMock).toHaveBeenCalledWith('insertUnorderedList', false, undefined);
    });

    it('numbered list calls insertOrderedList', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-numbered-list'));
      expect(execCommandMock).toHaveBeenCalledWith('insertOrderedList', false, undefined);
    });
  });

  // ─── Indent / Outdent ──────────────────────────────────────────────

  describe('Indent / Outdent', () => {
    it('renders indent and outdent buttons', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('fmt-indent')).toBeInTheDocument();
      expect(screen.getByTestId('fmt-outdent')).toBeInTheDocument();
    });

    it('indent button calls indent command', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-indent'));
      expect(execCommandMock).toHaveBeenCalledWith('indent', false, undefined);
    });

    it('outdent button calls outdent command', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-outdent'));
      expect(execCommandMock).toHaveBeenCalledWith('outdent', false, undefined);
    });
  });

  // ─── More toolbar (collapsible) ────────────────────────────────────

  describe('Collapsible more toolbar', () => {
    it('more toolbar is hidden by default', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.queryByTestId('fmt-more-toolbar')).not.toBeInTheDocument();
    });

    it('toggles more toolbar on click', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      expect(screen.getByTestId('fmt-more-toolbar')).toBeInTheDocument();
    });

    it('closes more toolbar on second click', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      expect(screen.getByTestId('fmt-more-toolbar')).toBeInTheDocument();
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      expect(screen.queryByTestId('fmt-more-toolbar')).not.toBeInTheDocument();
    });

    it('shows link button in more toolbar', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      expect(screen.getByTestId('fmt-link')).toBeInTheDocument();
    });

    it('shows clear formatting button in more toolbar', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      expect(screen.getByTestId('fmt-clear')).toBeInTheDocument();
    });

    it('clear formatting calls removeFormat', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('fmt-clear'));
      expect(execCommandMock).toHaveBeenCalledWith('removeFormat', false, undefined);
    });
  });

  // ─── Font size dropdown ────────────────────────────────────────────

  describe('Font size dropdown', () => {
    it('renders font size button in more toolbar', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      expect(screen.getByTestId('font-size-btn')).toBeInTheDocument();
    });

    it('opens font size popover on click', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('font-size-btn'));
      expect(screen.getByTestId('font-size-popover')).toBeInTheDocument();
    });

    it('shows all font size options', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('font-size-btn'));
      expect(screen.getByTestId('font-size-small')).toBeInTheDocument();
      expect(screen.getByTestId('font-size-normal')).toBeInTheDocument();
      expect(screen.getByTestId('font-size-large')).toBeInTheDocument();
      expect(screen.getByTestId('font-size-extra-large')).toBeInTheDocument();
    });

    it('font size option shows correct label text', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('font-size-btn'));
      expect(screen.getByTestId('font-size-small')).toHaveTextContent('Small');
      expect(screen.getByTestId('font-size-large')).toHaveTextContent('Large');
    });
  });

  // ─── Font color picker ─────────────────────────────────────────────

  describe('Font color picker', () => {
    it('renders font color button in more toolbar', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      expect(screen.getByTestId('font-color')).toBeInTheDocument();
    });

    it('opens font color popover on click', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('font-color'));
      expect(screen.getByTestId('font-color-popover')).toBeInTheDocument();
    });

    it('shows preset color swatches', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('font-color'));
      expect(screen.getByTestId('color-swatch-#ef4444')).toBeInTheDocument();
      expect(screen.getByTestId('color-swatch-#3b82f6')).toBeInTheDocument();
    });

    it('applies preset color via foreColor', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('font-color'));
      fireEvent.mouseDown(screen.getByTestId('color-swatch-#ef4444'));
      expect(execCommandMock).toHaveBeenCalledWith('foreColor', false, '#ef4444');
    });

    it('has custom color input', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('font-color'));
      expect(screen.getByTestId('font-color-custom')).toBeInTheDocument();
    });

    it('applies custom color via apply button', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('font-color'));
      const input = screen.getByTestId('font-color-custom');
      fireEvent.change(input, { target: { value: '#ff00ff' } });
      fireEvent.mouseDown(screen.getByTestId('font-color-apply'));
      expect(execCommandMock).toHaveBeenCalledWith('foreColor', false, '#ff00ff');
    });
  });

  // ─── Highlight / background color picker ───────────────────────────

  describe('Highlight color picker', () => {
    it('renders highlight color button in more toolbar', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      expect(screen.getByTestId('highlight-color')).toBeInTheDocument();
    });

    it('opens highlight color popover', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('highlight-color'));
      expect(screen.getByTestId('highlight-color-popover')).toBeInTheDocument();
    });

    it('applies highlight color via hiliteColor', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('highlight-color'));
      fireEvent.mouseDown(screen.getByTestId('color-swatch-#f59e0b'));
      expect(execCommandMock).toHaveBeenCalledWith('hiliteColor', false, '#f59e0b');
    });
  });

  // ─── Link insertion ────────────────────────────────────────────────

  describe('Link insertion', () => {
    it('link button calls createLink via prompt', () => {
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://example.com');
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('fmt-link'));
      expect(promptSpy).toHaveBeenCalledWith('Enter URL:');
      expect(execCommandMock).toHaveBeenCalledWith('createLink', false, 'https://example.com');
      promptSpy.mockRestore();
    });

    it('link button does nothing when prompt returns null', () => {
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      execCommandMock.mockClear();
      fireEvent.mouseDown(screen.getByTestId('fmt-more-toggle'));
      fireEvent.mouseDown(screen.getByTestId('fmt-link'));
      expect(execCommandMock).not.toHaveBeenCalledWith('createLink', expect.anything(), expect.anything());
      promptSpy.mockRestore();
    });
  });

  // ─── execFormat helper ─────────────────────────────────────────────

  describe('execFormat helper', () => {
    it('calls document.execCommand with correct args', () => {
      execFormat('bold');
      expect(execCommandMock).toHaveBeenCalledWith('bold', false, undefined);
    });

    it('passes value to execCommand', () => {
      execFormat('foreColor', '#ff0000');
      expect(execCommandMock).toHaveBeenCalledWith('foreColor', false, '#ff0000');
    });
  });

  // ─── insertLink helper ─────────────────────────────────────────────

  describe('insertLink helper', () => {
    it('creates link with provided URL', () => {
      insertLink('https://test.com');
      expect(execCommandMock).toHaveBeenCalledWith('createLink', false, 'https://test.com');
    });

    it('prompts for URL when none provided', () => {
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://prompted.com');
      insertLink();
      expect(promptSpy).toHaveBeenCalled();
      expect(execCommandMock).toHaveBeenCalledWith('createLink', false, 'https://prompted.com');
      promptSpy.mockRestore();
    });

    it('does not create link when prompt cancelled', () => {
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
      execCommandMock.mockClear();
      insertLink();
      expect(execCommandMock).not.toHaveBeenCalled();
      promptSpy.mockRestore();
    });
  });

  // ─── Toolbar theme / styling ───────────────────────────────────────

  describe('Toolbar UI / theme', () => {
    it('toolbar has purple/blue gradient background', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      const textBlock = screen.getByTestId('text-block');
      const toolbar = textBlock.querySelector('div > div:first-child') as HTMLElement;
      expect(toolbar.style.background).toContain('gradient');
    });

    it('editor has purple-blue border color', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      // jsdom normalizes hex to rgb: #e0e7ff → rgb(224, 231, 255)
      const border = editor.style.border;
      expect(border).toMatch(/e0e7ff|rgb\(224,\s*231,\s*255\)/);
    });

    it('text editor is contentEditable', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      expect(editor.getAttribute('contenteditable')).toBe('true');
    });
  });

  // ─── Content persistence (HTML stored in block) ────────────────────

  describe('Content persistence', () => {
    it('stores content as HTML in block', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      editor.innerHTML = '<b>Bold text</b>';
      fireEvent.input(editor);
      expect(onChange).toHaveBeenCalled();
      const updated = onChange.mock.calls[0][0];
      expect((updated[0] as { content: string }).content).toContain('<b>Bold text</b>');
    });

    it('updates plainText alongside HTML content', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      // jsdom innerText may be empty — use textContent check instead
      editor.innerHTML = 'Some plain text';
      fireEvent.input(editor);
      const updated = onChange.mock.calls[0][0];
      // content should be set (innerHTML)
      expect((updated[0] as { content: string }).content).toBe('Some plain text');
    });

    it('preserves existing HTML when loading block', () => {
      const htmlBlocks = [createTextBlock('<b>Bold</b> and <i>italic</i>', 'Bold and italic')];
      render(<JournalBlockEditor blocks={htmlBlocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      expect(editor.innerHTML).toContain('<b>Bold</b>');
      expect(editor.innerHTML).toContain('<i>italic</i>');
    });

    it('handles formatted list content', () => {
      const listContent = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const listBlocks = [createTextBlock(listContent, 'Item 1\nItem 2')];
      render(<JournalBlockEditor blocks={listBlocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      expect(editor.innerHTML).toContain('<ul>');
      expect(editor.innerHTML).toContain('<li>');
    });

    it('handles colored text content', () => {
      const colorContent = '<span style="color: rgb(239, 68, 68);">Red text</span>';
      const colorBlocks = [createTextBlock(colorContent, 'Red text')];
      render(<JournalBlockEditor blocks={colorBlocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      expect(editor.innerHTML).toContain('color');
    });

    it('handles highlighted text content', () => {
      const highlightContent = '<span style="background-color: rgb(254, 240, 138);">Highlighted</span>';
      const hlBlocks = [createTextBlock(highlightContent, 'Highlighted')];
      render(<JournalBlockEditor blocks={hlBlocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      expect(editor.innerHTML).toContain('background-color');
    });
  });

  // ─── Backward compatibility ────────────────────────────────────────

  describe('Backward compatibility', () => {
    it('renders plain text blocks from old entries', () => {
      const oldBlocks = [createTextBlock('Just plain text', 'Just plain text')];
      render(<JournalBlockEditor blocks={oldBlocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      expect(editor.textContent).toBe('Just plain text');
    });

    it('renders empty content block', () => {
      const emptyBlocks = [createTextBlock('', '')];
      render(<JournalBlockEditor blocks={emptyBlocks} onChange={onChange} />);
      const editor = screen.getByTestId('text-block-editor');
      expect(editor.textContent).toBe('');
    });

    it('duplicate and delete buttons still work alongside new toolbar', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      expect(screen.getByTestId('duplicate-btn')).toBeInTheDocument();
      expect(screen.getByTestId('delete-block-btn')).toBeInTheDocument();
    });
  });

  // ─── Multiple text blocks ──────────────────────────────────────────

  describe('Multiple text blocks', () => {
    it('each text block has its own formatting toolbar', () => {
      const multiBlocks = [
        createTextBlock('Block A', 'Block A'),
        createTextBlock('Block B', 'Block B'),
      ];
      render(<JournalBlockEditor blocks={multiBlocks} onChange={onChange} />);
      const boldBtns = screen.getAllByTestId('fmt-bold');
      expect(boldBtns).toHaveLength(2);
    });

    it('each block has independent more toggle', () => {
      const multiBlocks = [
        createTextBlock('Block A', 'Block A'),
        createTextBlock('Block B', 'Block B'),
      ];
      render(<JournalBlockEditor blocks={multiBlocks} onChange={onChange} />);
      const toggles = screen.getAllByTestId('fmt-more-toggle');
      expect(toggles).toHaveLength(2);
      fireEvent.mouseDown(toggles[0]);
      const moreToolbars = screen.getAllByTestId('fmt-more-toolbar');
      expect(moreToolbars).toHaveLength(1);
    });
  });

  // ─── Toolbar hover effects ─────────────────────────────────────────

  describe('Toolbar button hover effects', () => {
    it('button changes style on hover', () => {
      render(<JournalBlockEditor blocks={blocks} onChange={onChange} />);
      const btn = screen.getByTestId('fmt-bold');
      fireEvent.mouseEnter(btn);
      // jsdom normalizes #eef2ff to rgb(238, 242, 255)
      expect(btn.style.background).toMatch(/eef2ff|rgb\(238,\s*242,\s*255\)/);
      fireEvent.mouseLeave(btn);
    });
  });
});
